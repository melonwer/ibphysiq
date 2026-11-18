import { QWEN_HARNESS_SYSTEM_PROMPT } from "@/lib/bank-pipeline/distillation-trace";
import {
  getDomainAdapter,
  hasDomainAdapter,
} from "@/lib/bank-pipeline/domain-registry";
import {
  PHYSICS_DOMAIN_IDS,
  PhysicsDomainId,
  QuestionDifficulty,
  QuestionFormat,
  SyllabusId,
  SyllabusTag,
} from "@/lib/bank-pipeline/types";
import { checkSyllabusAlignment } from "@/lib/benchmark/syllabus-alignment-checker";
import {
  GeneratableSlice,
  getGeneratableSlices,
  getSubtopicById,
  getSyllabusCatalogue,
  getTopicById,
  SYLLABUS_IDS,
  SyllabusLevel,
} from "@/lib/constants/syllabi";
import {
  buildDeterministicDomainToolSchemas,
  DomainToolSchemasDocument,
} from "@/scripts/bank-generation/export-domain-schemas";

import {
  ChatMessage,
  LiveGenerationRequest,
  ResolvedPromptSlice,
  Step1RetryFeedback,
  Step1UserRequestPayload,
  Step2RetryFeedback,
  TopicListingEntry,
} from "./types";

const PURE_CALCULATION_ELIGIBLE_CONCEPTS = new Set<string>([
  "si-units-dimensional-analysis",
  "uncertainties-error-propagation",
  "kinematics-suvat",
  "work-energy-power",
]);

const LIVE_CONTEXT_THEMES: readonly string[] = [
  "laboratory-metrology",
  "aerospace-telemetry",
  "rail-propulsion",
  "marine-instrumentation",
  "renewable-grid",
  "accelerator-beamline",
  "astrophysical-survey",
  "cryogenic-calorimetry",
  "optical-interferometry",
  "robotics-actuation",
  "geophysical-sensing",
  "medical-diagnostics",
];

let cachedDomainSchemas: DomainToolSchemasDocument | null = null;

/**
 * Derives and caches compact code-introspected tool schemas for all 11 physics
 * domains directly from TypeScript solvers (zero reads from `dataset/`).
 */
export function getDomainToolSchemas(): DomainToolSchemasDocument {
  if (!cachedDomainSchemas) {
    cachedDomainSchemas = buildDeterministicDomainToolSchemas();
  }
  return cachedDomainSchemas;
}

export function resetDomainToolSchemasCache(): void {
  cachedDomainSchemas = null;
}

export function getCompactDomainPromptSummary(
  domain: PhysicsDomainId,
  domainSchemas: DomainToolSchemasDocument = getDomainToolSchemas(),
): string {
  const entry = domainSchemas.domains[domain];
  return entry ? entry.compactPromptSummary : "";
}

/**
 * Exact system prompt contract used to train and evaluate `round1_sft_core`
 * (`d4ydy/sixthphysics-qwen3.5-9b-lora`) in `training/qwen35/modal_autonomous_pipeline.py`.
 */
export function buildAugmentedSystemPrompt(
  domain: PhysicsDomainId,
  baseSystemPrompt: string = QWEN_HARNESS_SYSTEM_PROMPT,
  domainSchemas: DomainToolSchemasDocument = getDomainToolSchemas(),
): string {
  const compactSummary = getCompactDomainPromptSummary(domain, domainSchemas);
  const contractBlock =
    "\n\n--- DOMAIN TOOL & SYLLABUS CONTRACT ---\n" +
    `${compactSummary}\n` +
    `Step 1 JSON format: {"action":"solve_and_render_scenario","domain":"${domain}","scenarioSpec":{"kind":"..."},"hiddenQuantities":["..."],"questionPlan":{"targetSummary":"..."}}\n` +
    `Step 2 MCQ JSON format: {"format":"mcq","difficulty":"...","stem":"...","options":[{"label":"A","text":"...","isCorrect":true},{"label":"B","text":"...","isCorrect":false,"distractorRationale":"..."},{"label":"C","text":"...","isCorrect":false,"distractorRationale":"..."},{"label":"D","text":"...","isCorrect":false,"distractorRationale":"..."}],"correctOptionIndex":0,"workedSolution":"...","markScheme":[{"code":"A1","criterion":"...","marks":1}],"totalMarks":1}\n` +
    `Step 2 Structured JSON format: {"format":"structured","difficulty":"...","stem":"...","parts":[{"partId":"a","prompt":"...","marks":2,"expectedAnswer":"..."}],"workedSolution":"...","markScheme":[{"code":"M1","criterion":"...","marks":1},{"code":"A1","criterion":"...","marks":1}],"totalMarks":2}\n` +
    "Strict rules: Output raw JSON object only (no markdown fences). " +
    "IB Physics uses g = 9.8 m s^-2 and excludes retired IB 2016 topics (farad capacitance, 1/f thin-lens equation, quarks/Feynman diagrams, and HL-only quantities on SL prompts). " +
    "UK A-Level and NCUK IFY use g = 9.81 m s^-2. " +
    "Every numerical answer and workedSolution must match formattedQuantities3sf to 3 significant figures, sum markScheme marks to totalMarks, and never leak hiddenQuantities in the stem.";

  return baseSystemPrompt.trimEnd() + contractBlock;
}

/**
 * Exact Turn 1 user request JSON schema matching `distillation-trace.ts` and `train.jsonl`.
 */
export function buildStep1UserPayload(
  slice: ResolvedPromptSlice,
): Step1UserRequestPayload {
  return {
    task: "generate_verified_physics_question",
    syllabi: slice.syllabi,
    domain: slice.domain,
    conceptId: slice.conceptId,
    templateArchetype: slice.templateArchetype,
    visualFamily: slice.visualFamily,
    format: slice.format,
    difficulty: slice.difficulty,
    totalMarks: slice.totalMarks,
    seed: slice.seed,
  };
}

export function buildStep1Messages(
  slice: ResolvedPromptSlice,
  domainSchemas: DomainToolSchemasDocument = getDomainToolSchemas(),
): [ChatMessage, ChatMessage] {
  const systemPrompt = buildAugmentedSystemPrompt(
    slice.domain,
    QWEN_HARNESS_SYSTEM_PROMPT,
    domainSchemas,
  );
  const userPayload = buildStep1UserPayload(slice);
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: JSON.stringify(userPayload) },
  ];
}

export function buildStep1RetryUserContent(
  userPromptJson: string,
  feedback: Step1RetryFeedback,
): string {
  return `${userPromptJson}\n\nPREVIOUS_ATTEMPT_DIAGNOSTIC: ${JSON.stringify(feedback)}`;
}

export function buildStep2Messages(params: {
  systemPrompt: string;
  userPromptJson: string;
  assistantStep1Raw: string;
  toolReceiptJson: string;
}): ChatMessage[] {
  return [
    { role: "system", content: params.systemPrompt },
    { role: "user", content: params.userPromptJson },
    { role: "assistant", content: params.assistantStep1Raw },
    { role: "tool", content: params.toolReceiptJson },
  ];
}

export function buildStep2RetryReceiptJson(
  toolReceiptJson: string,
  feedback: Step2RetryFeedback,
): string {
  const parsed = JSON.parse(toolReceiptJson) as Record<string, unknown>;
  return JSON.stringify({
    ...parsed,
    retryFeedback: feedback,
  });
}

/**
 * Strips stray Qwen3.5 `<think>...</think>` blocks (including orphaned closing
 * `</think>` prefixes when a server prefilled `<think>\n`), `<tool_call>` tags,
 * and markdown code fences so the downstream JSON parser receives clean JSON.
 */
export function stripThinkingAndFences(raw: string): string {
  if (typeof raw !== "string") {
    return "";
  }
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Handle servers that prefill `<think>\n` in the prompt so completion begins
  // with reasoning prose followed by a lone `</think>`.
  const orphanCloseIdx = cleaned.search(/<\/think>/i);
  if (orphanCloseIdx !== -1) {
    cleaned = cleaned.slice(orphanCloseIdx + "</think>".length).trim();
  }

  // Handle unclosed `<think>` at the beginning followed by a JSON object on a later line
  if (/^<think>/i.test(cleaned)) {
    const braceIdx = cleaned.indexOf("{");
    if (braceIdx !== -1) {
      cleaned = cleaned.slice(braceIdx).trim();
    } else {
      cleaned = cleaned.replace(/^<think>/i, "").trim();
    }
  }

  const toolCallMatch = /<tool_call>([\s\S]*?)<\/tool_call>/i.exec(cleaned);
  if (toolCallMatch) {
    cleaned = toolCallMatch[1].trim();
  }

  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(cleaned);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  return cleaned;
}

interface CandidateSliceOption {
  syllabus: SyllabusId;
  level: string;
  topicId: string;
  subtopicId: string;
  topicCode: string;
  topicTitle: string;
  subtopicCode: string;
  subtopicTitle: string;
  conceptId: string;
  conceptTitle: string;
  domain: PhysicsDomainId;
  visualFamily: string;
  format: QuestionFormat;
}

function normalizeQuery(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function sliceMatchesTopicQuery(
  slice: CandidateSliceOption,
  query: string,
): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;

  const exactFields = [
    slice.topicId,
    slice.subtopicId,
    slice.topicCode,
    slice.subtopicCode,
    slice.conceptId,
  ].map(normalizeQuery);

  if (exactFields.includes(q)) {
    return true;
  }

  const searchable = [
    slice.topicId,
    slice.subtopicId,
    slice.topicCode,
    slice.topicTitle,
    slice.subtopicCode,
    slice.subtopicTitle,
    slice.conceptId,
    slice.conceptTitle,
    slice.domain,
  ]
    .join(" ")
    .toLowerCase();

  return searchable.includes(q);
}

function buildCandidateSlicePool(
  syllabus: SyllabusId,
  format: QuestionFormat,
  level?: string,
): CandidateSliceOption[] {
  const rawSlices: GeneratableSlice[] = getGeneratableSlices({
    syllabus,
    ...(level ? { level: level as SyllabusLevel } : {}),
    format,
    includeOptionTopics: true,
    includeSecondarySubtopics: true,
  });

  const pool: CandidateSliceOption[] = [];
  for (const s of rawSlices) {
    const topicSpec = getTopicById(s.topicId);
    const subtopicSpec = getSubtopicById(s.subtopicId);
    const domain = s.visualFamily as PhysicsDomainId;
    if (!hasDomainAdapter(domain)) {
      continue;
    }
    const visualFamily = getDomainAdapter(domain).defaultVisualFamily;
    const baseOption: CandidateSliceOption = {
      syllabus: s.syllabus,
      level: s.level,
      topicId: s.topicId,
      subtopicId: s.subtopicId,
      topicCode: topicSpec?.code ?? s.topicId,
      topicTitle: topicSpec?.title ?? s.topicId,
      subtopicCode: subtopicSpec?.code ?? s.subtopicId,
      subtopicTitle: subtopicSpec?.title ?? s.subtopicId,
      conceptId: s.conceptId,
      conceptTitle: s.conceptTitle,
      domain,
      visualFamily,
      format: s.format,
    };
    pool.push(baseOption);

    if (PURE_CALCULATION_ELIGIBLE_CONCEPTS.has(s.conceptId)) {
      pool.push({
        ...baseOption,
        domain: "pure-calculation",
        visualFamily: "none",
      });
    }
  }

  pool.sort((a, b) => {
    if (a.topicId !== b.topicId) return a.topicId.localeCompare(b.topicId);
    if (a.subtopicId !== b.subtopicId) {
      return a.subtopicId.localeCompare(b.subtopicId);
    }
    if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
    if (a.conceptId !== b.conceptId) {
      return a.conceptId.localeCompare(b.conceptId);
    }
    return a.level.localeCompare(b.level);
  });

  return pool;
}

/**
 * Resolves a valid, alignment-verified prompt slice from `lib/constants/syllabi/crosswalk.ts`.
 */
export function resolvePromptSlice(
  request: LiveGenerationRequest,
): ResolvedPromptSlice {
  if (!(SYLLABUS_IDS as readonly string[]).includes(request.syllabus)) {
    throw new Error(
      `Invalid syllabus "${String(request.syllabus)}". Supported: ${SYLLABUS_IDS.join(", ")}`,
    );
  }

  const catalogue = getSyllabusCatalogue(request.syllabus);
  let resolvedLevel = request.level?.trim();
  if (resolvedLevel) {
    const matchedLevel = catalogue.levels.find(
      (lvl) => lvl.toLowerCase() === resolvedLevel!.toLowerCase(),
    );
    if (!matchedLevel) {
      throw new Error(
        `Invalid level "${resolvedLevel}" for syllabus "${request.syllabus}". Allowed levels: ${catalogue.levels.join(", ")}`,
      );
    }
    resolvedLevel = matchedLevel;
  }

  if (
    request.domain !== undefined &&
    !(PHYSICS_DOMAIN_IDS as readonly string[]).includes(request.domain)
  ) {
    throw new Error(
      `Invalid domain "${String(request.domain)}". Supported domains: ${PHYSICS_DOMAIN_IDS.join(", ")}`,
    );
  }

  const difficulty: QuestionDifficulty = request.difficulty ?? "standard";
  const format: QuestionFormat = request.format;
  const totalMarks =
    request.totalMarks ?? (format === "mcq" ? 1 : 6);
  const seed =
    request.seed !== undefined && Number.isInteger(request.seed)
      ? request.seed
      : Math.floor(Date.now() % 1_000_000_000);

  let pool = buildCandidateSlicePool(request.syllabus, format, resolvedLevel);

  if (request.domain) {
    pool = pool.filter((s) => s.domain === request.domain);
  }
  if (request.conceptId?.trim()) {
    const targetConcept = normalizeQuery(request.conceptId);
    pool = pool.filter((s) => normalizeQuery(s.conceptId) === targetConcept);
  }
  if (request.topicId?.trim()) {
    pool = pool.filter((s) => sliceMatchesTopicQuery(s, request.topicId!));
  }

  if (pool.length === 0) {
    const hints: string[] = [
      `No valid crosswalk slice found for syllabus="${request.syllabus}"`,
      resolvedLevel ? `level="${resolvedLevel}"` : undefined,
      request.topicId ? `topic="${request.topicId}"` : undefined,
      request.domain ? `domain="${request.domain}"` : undefined,
      request.conceptId ? `concept="${request.conceptId}"` : undefined,
      `format="${format}"`,
    ].filter((x): x is string => Boolean(x));

    const availableTopics = catalogue.topics
      .map((t) => `${t.id} (${t.code}: ${t.title})`)
      .slice(0, 6)
      .join(", ");
    throw new Error(
      `${hints.join(", ")}. Run with --list-topics --syllabus ${request.syllabus} to inspect valid topics & domains (e.g. ${availableTopics}).`,
    );
  }

  const idx = Math.abs(seed) % pool.length;
  const chosen = pool[idx];
  const contextSlug =
    LIVE_CONTEXT_THEMES[Math.abs(seed) % LIVE_CONTEXT_THEMES.length];
  const templateArchetype = `live-${chosen.conceptId}-${contextSlug}-v1`;

  const syllabusTag: SyllabusTag = {
    syllabus: chosen.syllabus,
    level: chosen.level,
    topicId: chosen.topicId,
    subtopicId: chosen.subtopicId,
  };

  const itemId =
    request.itemId?.trim() ||
    `live-${chosen.syllabus}-${chosen.domain}-${format}-${Math.abs(seed)}`;

  const alignment = checkSyllabusAlignment({
    id: itemId,
    syllabi: [syllabusTag],
    conceptId: chosen.conceptId,
    domain: chosen.domain,
    format,
    totalMarks,
  });

  if (!alignment.aligned) {
    const details = alignment.issues.map((i) => `${i.code}: ${i.message}`).join("; ");
    throw new Error(
      `Resolved slice "${itemId}" failed syllabus alignment: ${details}`,
    );
  }

  return {
    itemId,
    syllabus: chosen.syllabus,
    level: chosen.level,
    topicId: chosen.topicId,
    subtopicId: chosen.subtopicId,
    topicCode: chosen.topicCode,
    topicTitle: chosen.topicTitle,
    subtopicCode: chosen.subtopicCode,
    subtopicTitle: chosen.subtopicTitle,
    conceptId: chosen.conceptId,
    conceptTitle: chosen.conceptTitle,
    domain: chosen.domain,
    visualFamily: chosen.visualFamily,
    templateArchetype,
    format,
    difficulty,
    totalMarks,
    seed,
    gravityConventionMs2: chosen.syllabus === "ib" ? 9.8 : 9.81,
    syllabi: [syllabusTag],
  };
}

/**
 * Lists all generatable topics, subtopics, levels, and physics domains for one
 * or all three syllabi (used by `--list-topics`).
 */
export function listAvailableTopics(
  syllabus?: SyllabusId,
): TopicListingEntry[] {
  const targetSyllabi: readonly SyllabusId[] = syllabus
    ? [syllabus]
    : SYLLABUS_IDS;

  const entries: TopicListingEntry[] = [];

  for (const syl of targetSyllabi) {
    const catalogue = getSyllabusCatalogue(syl);
    const slices = getGeneratableSlices({
      syllabus: syl,
      includeOptionTopics: true,
      includeSecondarySubtopics: true,
    });

    const domainsByTopic = new Map<string, Set<PhysicsDomainId>>();
    const conceptsBySubtopic = new Map<string, Set<string>>();

    for (const s of slices) {
      const dom = s.visualFamily as PhysicsDomainId;
      if (!domainsByTopic.has(s.topicId)) {
        domainsByTopic.set(s.topicId, new Set());
      }
      domainsByTopic.get(s.topicId)!.add(dom);
      if (PURE_CALCULATION_ELIGIBLE_CONCEPTS.has(s.conceptId)) {
        domainsByTopic.get(s.topicId)!.add("pure-calculation");
      }

      if (!conceptsBySubtopic.has(s.subtopicId)) {
        conceptsBySubtopic.set(s.subtopicId, new Set());
      }
      conceptsBySubtopic.get(s.subtopicId)!.add(s.conceptId);
    }

    for (const topic of catalogue.topics) {
      const topicDomains = [...(domainsByTopic.get(topic.id) ?? [])].sort();
      entries.push({
        syllabus: syl,
        topicId: topic.id,
        topicCode: topic.code,
        topicTitle: topic.title,
        levels: [...topic.levelsCovered],
        domains: topicDomains,
        subtopics: topic.subtopics.map((sub) => ({
          subtopicId: sub.id,
          subtopicCode: sub.code,
          subtopicTitle: sub.title,
          levels: [...sub.levelsCovered],
          concepts: [...(conceptsBySubtopic.get(sub.id) ?? [])].sort(),
        })),
      });
    }
  }

  return entries;
}
