import fs from "node:fs";
import path from "node:path";

import {
  MarkSchemePoint,
  MCQ_OPTION_LABELS,
  McqOptionItem,
  McqOptionLabel,
  StructuredQuestionPart,
} from "@/lib/bank-pipeline/types";
import {
  evaluateSingleRollout,
  extractJsonObjectFromAssistantText,
  solveStep1Proposal,
} from "@/lib/benchmark/rollout-evaluator";
import { checkSyllabusAlignment } from "@/lib/benchmark/syllabus-alignment-checker";
import {
  BenchmarkPromptMetadata,
  ItemRolloutEvaluation,
  Step1BatchReceipt,
  Step1BatchSuccessReceipt,
  SyllabusAlignmentIssue,
} from "@/lib/benchmark/types";

import {
  buildStep1Messages,
  buildStep1RetryUserContent,
  buildStep2Messages,
  buildStep2RetryReceiptJson,
  resolvePromptSlice,
  stripThinkingAndFences,
} from "./prompt-builder";
import {
  ChatMessage,
  LIVE_GENERATOR_SCHEMA_VERSION,
  LiveAttemptTrace,
  LiveGenerationRequest,
  LiveGenerationResult,
  LiveInferenceClient,
  ResolvedPromptSlice,
  SavedOutputFiles,
  Step1RetryFeedback,
  Step2RetryFeedback,
  VerifiedLiveQuestionPackage,
} from "./types";

const SPEC_LEVEL_SYLLABUS_CODES = new Set<string>([
  "gravity-convention-mismatch",
  "retired-ib-2016-exclusion",
  "level-leakage",
  "concept-excluded-from-syllabus",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildPromptMetadata(
  slice: ResolvedPromptSlice,
): BenchmarkPromptMetadata {
  return {
    id: slice.itemId,
    syllabi: slice.syllabi,
    domain: slice.domain,
    conceptId: slice.conceptId,
    templateArchetype: slice.templateArchetype,
    visualFamily: slice.visualFamily,
    format: slice.format,
    difficulty: slice.difficulty,
    totalMarks: slice.totalMarks,
    seed: slice.seed,
    split: "live",
    familyGroupKey: `${slice.conceptId}::${slice.templateArchetype}`,
  };
}

function rankEvaluation(ev: ItemRolloutEvaluation): number {
  return (
    (ev.endToEndVerified ? 8 : 0) +
    (ev.step2AuthorGatePass ? 4 : 0) +
    (ev.syllabusAligned ? 2 : 0) +
    (ev.step2JsonValid ? 1 : 0)
  );
}

function parseStep2PackageFields(rawStep2: string): {
  stem: string;
  options?: McqOptionItem[];
  correctOptionIndex?: number;
  parts?: StructuredQuestionPart[];
  workedSolution: string;
  markScheme: MarkSchemePoint[];
  totalMarks?: number;
} | null {
  const extracted = extractJsonObjectFromAssistantText(rawStep2);
  if (!extracted.ok) {
    return null;
  }
  const obj = extracted.value;
  const stem = typeof obj.stem === "string" ? obj.stem.trim() : "";
  const workedSolution =
    typeof obj.workedSolution === "string" ? obj.workedSolution.trim() : "";
  const totalMarks =
    typeof obj.totalMarks === "number" && Number.isInteger(obj.totalMarks)
      ? obj.totalMarks
      : undefined;

  let options: McqOptionItem[] | undefined;
  let correctOptionIndex: number | undefined;
  if (Array.isArray(obj.options)) {
    const explicitIdx =
      typeof obj.correctOptionIndex === "number" &&
      Number.isInteger(obj.correctOptionIndex)
        ? obj.correctOptionIndex
        : undefined;
    options = obj.options.map((rawOpt, idx) => {
      if (!isPlainObject(rawOpt)) {
        return {
          label: (MCQ_OPTION_LABELS[idx] ?? "A") as McqOptionLabel,
          text: "",
          isCorrect: false,
        };
      }
      const label =
        typeof rawOpt.label === "string" && rawOpt.label.trim()
          ? (rawOpt.label.trim() as McqOptionLabel)
          : ((MCQ_OPTION_LABELS[idx] ?? "A") as McqOptionLabel);
      const text = typeof rawOpt.text === "string" ? rawOpt.text.trim() : "";
      const isCorrect =
        typeof rawOpt.isCorrect === "boolean"
          ? rawOpt.isCorrect
          : explicitIdx === idx;
      const distractorRationale =
        typeof rawOpt.distractorRationale === "string" &&
        rawOpt.distractorRationale.trim()
          ? rawOpt.distractorRationale.trim()
          : undefined;
      return {
        label,
        text,
        isCorrect,
        ...(distractorRationale ? { distractorRationale } : {}),
      };
    });
    const foundIdx = options.findIndex((o) => o.isCorrect);
    correctOptionIndex = foundIdx >= 0 ? foundIdx : explicitIdx;
  }

  let parts: StructuredQuestionPart[] | undefined;
  if (Array.isArray(obj.parts)) {
    parts = obj.parts.map((rawPart, idx) => {
      if (!isPlainObject(rawPart)) {
        return {
          partId: `p${idx + 1}`,
          prompt: "",
          marks: 0,
          expectedAnswer: "",
          workingSteps: [],
        };
      }
      const workingSteps = Array.isArray(rawPart.workingSteps)
        ? rawPart.workingSteps.filter((s): s is string => typeof s === "string")
        : [];
      const dependsOnPartIds = Array.isArray(rawPart.dependsOnPartIds)
        ? rawPart.dependsOnPartIds.filter(
            (d): d is string => typeof d === "string",
          )
        : undefined;
      const targetMode =
        rawPart.targetMode === "quantitative" ||
        rawPart.targetMode === "qualitative"
          ? rawPart.targetMode
          : undefined;
      const targetQuantityKey =
        typeof rawPart.targetQuantityKey === "string"
          ? rawPart.targetQuantityKey
          : undefined;
      return {
        partId:
          typeof rawPart.partId === "string" && rawPart.partId.trim()
            ? rawPart.partId.trim()
            : `p${idx + 1}`,
        prompt: typeof rawPart.prompt === "string" ? rawPart.prompt.trim() : "",
        marks: typeof rawPart.marks === "number" ? rawPart.marks : 0,
        ...(dependsOnPartIds ? { dependsOnPartIds } : {}),
        ...(targetMode ? { targetMode } : {}),
        ...(targetQuantityKey ? { targetQuantityKey } : {}),
        expectedAnswer:
          typeof rawPart.expectedAnswer === "string"
            ? rawPart.expectedAnswer.trim()
            : "",
        workingSteps,
      };
    });
  }

  const markScheme: MarkSchemePoint[] = Array.isArray(obj.markScheme)
    ? obj.markScheme
        .filter(isPlainObject)
        .map((pt) => ({
          code: typeof pt.code === "string" ? pt.code.trim() : "",
          criterion: typeof pt.criterion === "string" ? pt.criterion.trim() : "",
          marks: typeof pt.marks === "number" ? pt.marks : 0,
          ...(typeof pt.partId === "string" && pt.partId.trim()
            ? { partId: pt.partId.trim() }
            : {}),
        }))
    : [];

  return {
    stem,
    ...(options ? { options } : {}),
    ...(correctOptionIndex !== undefined ? { correctOptionIndex } : {}),
    ...(parts ? { parts } : {}),
    workedSolution,
    markScheme,
    ...(totalMarks !== undefined ? { totalMarks } : {}),
  };
}

function extractSvgFingerprint(toolReceiptJson: string): string | null {
  try {
    const parsed: unknown = JSON.parse(toolReceiptJson);
    if (
      isPlainObject(parsed) &&
      isPlainObject(parsed.visualReceipt) &&
      typeof parsed.visualReceipt.svgFingerprint === "string"
    ) {
      return parsed.visualReceipt.svgFingerprint;
    }
  } catch {
    // ignore
  }
  return null;
}

function buildVerifiedPackage(params: {
  slice: ResolvedPromptSlice;
  step1Receipt: Step1BatchSuccessReceipt;
  step2Raw: string;
  verified: boolean;
}): VerifiedLiveQuestionPackage | undefined {
  const parsed = parseStep2PackageFields(params.step2Raw);
  if (!parsed) {
    return undefined;
  }

  return {
    schemaVersion: LIVE_GENERATOR_SCHEMA_VERSION,
    id: params.slice.itemId,
    generatedAt: new Date().toISOString(),
    verified: params.verified,
    syllabi: params.slice.syllabi,
    domain: params.slice.domain,
    conceptId: params.slice.conceptId,
    conceptTitle: params.slice.conceptTitle,
    templateArchetype: params.slice.templateArchetype,
    visualFamily: params.step1Receipt.visualFamily,
    format: params.slice.format,
    difficulty: params.slice.difficulty,
    totalMarks: parsed.totalMarks ?? params.slice.totalMarks,
    seed: params.slice.seed,
    gravityConventionMs2: params.slice.gravityConventionMs2,
    stem: parsed.stem,
    ...(parsed.options ? { options: parsed.options } : {}),
    ...(parsed.correctOptionIndex !== undefined
      ? { correctOptionIndex: parsed.correctOptionIndex }
      : {}),
    ...(parsed.parts ? { parts: parsed.parts } : {}),
    workedSolution: parsed.workedSolution,
    markScheme: parsed.markScheme,
    scenarioSpec: params.step1Receipt.parsedProposal.scenarioSpec,
    hiddenQuantities: params.step1Receipt.hiddenQuantities,
    questionPlan: params.step1Receipt.parsedProposal.questionPlan,
    verifiedQuantities: params.step1Receipt.verifiedQuantities,
    formattedQuantities3sf: params.step1Receipt.formattedQuantities3sf,
    solverId: params.step1Receipt.solverId,
    ...(params.step1Receipt.svgMarkup !== undefined
      ? {
          svgMarkup: params.step1Receipt.svgMarkup,
          svgFingerprint: extractSvgFingerprint(
            params.step1Receipt.toolReceiptJson,
          ),
        }
      : {}),
  };
}

/**
 * Runs the live 2-turn closed-loop neuro-symbolic generation harness:
 *   Turn 1 (`propose_scenario`) -> deterministic TypeScript domain solver + SVG
 *   renderer + hidden-quantity leak check + spec-level syllabus guard (with
 *   optional diagnostic self-correction retry) ->
 *   Turn 2 (`author_package`) -> `package-gate` + `syllabus-alignment-checker`
 *   (3-sf agreement, distractor uniqueness, mark-scheme balance, gravity/exclusion
 *   compliance, with optional diagnostic self-correction retry).
 */
export async function generateVerifiedQuestion(
  request: LiveGenerationRequest,
  client: LiveInferenceClient,
): Promise<LiveGenerationResult> {
  const startedAt = Date.now();
  const slice = resolvePromptSlice(request);
  const promptMeta = buildPromptMetadata(slice);
  const maxRetries = Math.max(0, Math.floor(request.maxRetries ?? 1));
  const baseTemp = request.temperature ?? 0.0;
  const retryTemp = request.retryTemperature ?? 0.25;
  const step1MaxTokens = request.step1MaxTokens ?? 768;
  const step2MaxTokens = request.step2MaxTokens ?? 1400;

  const [systemMsg, baseUserMsg] = buildStep1Messages(slice);
  const systemPrompt = systemMsg.content;
  const userPromptJson = baseUserMsg.content;

  const traces: LiveAttemptTrace[] = [];
  let step1LatencyMs = 0;
  let step2LatencyMs = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let step1Retries = 0;
  let step2Retries = 0;

  // ==========================================================================
  // TURN 1: propose_scenario -> real solver + SVG + non-leakage + spec alignment
  // ==========================================================================
  let finalStep1Receipt: Step1BatchReceipt | undefined;
  let finalStep1Raw = "";
  let step1Feedback: Step1RetryFeedback | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      step1Retries += 1;
    }

    const userContent =
      attempt === 0 || !step1Feedback
        ? userPromptJson
        : buildStep1RetryUserContent(userPromptJson, step1Feedback);

    const turn1Messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ];

    const completion = await client.chat(turn1Messages, {
      temperature: attempt === 0 ? baseTemp : retryTemp,
      maxTokens: step1MaxTokens,
      seed: slice.seed + attempt,
      topP: 0.95,
    });

    step1LatencyMs += completion.latencyMs;
    promptTokens += completion.promptTokens ?? 0;
    completionTokens += completion.completionTokens ?? 0;

    const cleaned = stripThinkingAndFences(completion.text);
    const receipt = solveStep1Proposal({
      id: slice.itemId,
      domain: slice.domain,
      assistantStep1Raw: cleaned,
    });

    let specSyllabusIssues: SyllabusAlignmentIssue[] = [];
    if (receipt.valid) {
      const preSyl = checkSyllabusAlignment({
        id: slice.itemId,
        syllabi: slice.syllabi,
        conceptId: slice.conceptId,
        domain: slice.domain,
        format: slice.format,
        totalMarks: slice.totalMarks,
        scenarioSpec: receipt.parsedProposal.scenarioSpec,
      });
      specSyllabusIssues = preSyl.issues.filter((i) =>
        SPEC_LEVEL_SYLLABUS_CODES.has(i.code),
      );
    }

    const step1Passed = receipt.valid && specSyllabusIssues.length === 0;
    const errorSummary = !receipt.valid
      ? `${receipt.errorStage}: ${receipt.errorMessage}`
      : specSyllabusIssues.length > 0
        ? specSyllabusIssues.map((i) => `${i.code}: ${i.message}`).join("; ")
        : undefined;

    traces.push({
      attempt: attempt + 1,
      phase: "step1",
      latencyMs: completion.latencyMs,
      rawOutput: completion.text,
      cleanedOutput: cleaned,
      passed: step1Passed,
      ...(errorSummary ? { errorSummary } : {}),
    });

    finalStep1Receipt = receipt;
    finalStep1Raw = cleaned;

    if (step1Passed) {
      break;
    }

    step1Feedback = {
      status: "error",
      errorStage: receipt.valid ? "syllabus-or-solver" : receipt.errorStage,
      errorMessage: receipt.valid ? "" : receipt.errorMessage,
      syllabusIssues: specSyllabusIssues.slice(0, 3).map((i) => i.message),
      instruction:
        "Emit ONLY a corrected Step 1 JSON object with valid scenarioSpec, " +
        "non-empty hiddenQuantities, questionPlan, and exact syllabus gravity convention.",
    };
  }

  // If Step 1 never passed solver/SVG/leakage checks, bail out cleanly with full diagnostics
  if (!finalStep1Receipt || !finalStep1Receipt.valid) {
    const failedEval = evaluateSingleRollout(promptMeta, {
      id: slice.itemId,
      itemId: slice.itemId,
      domain: slice.domain,
      assistantStep1Raw: finalStep1Raw,
      toolReceiptRaw: "",
      assistantStep2Raw: "",
      attemptsUsed: 1 + step1Retries,
      mode: step1Retries > 0 ? "one-retry" : "zero-retry",
    });

    return {
      verified: false,
      slice,
      ...(finalStep1Receipt ? { step1Receipt: finalStep1Receipt } : {}),
      evaluation: failedEval,
      stats: {
        attemptsUsed: 1 + step1Retries,
        step1Retries,
        step2Retries: 0,
        totalLatencyMs: Date.now() - startedAt,
        step1LatencyMs,
        step2LatencyMs: 0,
        backend: client.backend,
        model: client.model,
        promptTokens,
        completionTokens,
      },
      traces,
      rawTurns: {
        systemPrompt,
        userPromptJson,
        assistantStep1Raw: finalStep1Raw,
        toolReceiptJson: "",
        assistantStep2Raw: "",
      },
    };
  }

  // ==========================================================================
  // TURN 2: author_package -> package-gate + syllabus-alignment-checker
  // ==========================================================================
  let bestStep2Raw = "";
  let bestEval: ItemRolloutEvaluation | undefined;
  let step2Feedback: Step2RetryFeedback | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      step2Retries += 1;
    }

    const receiptForTurn =
      attempt === 0 || !step2Feedback
        ? finalStep1Receipt.toolReceiptJson
        : buildStep2RetryReceiptJson(
            finalStep1Receipt.toolReceiptJson,
            step2Feedback,
          );

    const turn2Messages = buildStep2Messages({
      systemPrompt,
      userPromptJson,
      assistantStep1Raw: finalStep1Raw,
      toolReceiptJson: receiptForTurn,
    });

    const completion = await client.chat(turn2Messages, {
      temperature: attempt === 0 ? baseTemp : retryTemp,
      maxTokens: step2MaxTokens,
      seed: slice.seed + 100 + attempt,
      topP: 0.95,
    });

    step2LatencyMs += completion.latencyMs;
    promptTokens += completion.promptTokens ?? 0;
    completionTokens += completion.completionTokens ?? 0;

    const cleanedStep2 = stripThinkingAndFences(completion.text);
    const ev = evaluateSingleRollout(promptMeta, {
      id: slice.itemId,
      itemId: slice.itemId,
      domain: slice.domain,
      assistantStep1Raw: finalStep1Raw,
      toolReceiptRaw: finalStep1Receipt.toolReceiptJson,
      assistantStep2Raw: cleanedStep2,
      attemptsUsed: 1 + step1Retries + step2Retries,
      mode: step1Retries + step2Retries > 0 ? "one-retry" : "zero-retry",
    });

    const issueSummaryParts = [
      ...ev.gateIssues.map((g) => `[${g.code}] ${g.message}`),
      ...ev.syllabusIssues.map((s) => `[${s.code}] ${s.message}`),
    ];

    traces.push({
      attempt: attempt + 1,
      phase: "step2",
      latencyMs: completion.latencyMs,
      rawOutput: completion.text,
      cleanedOutput: cleanedStep2,
      passed: ev.endToEndVerified,
      ...(issueSummaryParts.length > 0
        ? { errorSummary: issueSummaryParts.join("; ") }
        : {}),
    });

    if (!bestEval || rankEvaluation(ev) >= rankEvaluation(bestEval)) {
      bestEval = ev;
      bestStep2Raw = cleanedStep2;
    }

    if (ev.endToEndVerified) {
      break;
    }

    step2Feedback = {
      gateIssues: ev.gateIssues
        .slice(0, 4)
        .map((gi) => `[${gi.code}] ${gi.message}`),
      syllabusIssues: ev.syllabusIssues
        .slice(0, 3)
        .map((si) => `[${si.code}] ${si.message}`),
      instruction:
        "Re-author ONLY the Step 2 JSON question package so all numerical answers and " +
        "workedSolution match formattedQuantities3sf to 3 significant figures, all 4 MCQ " +
        "options are distinct with distractorRationales, marks sum to totalMarks, and " +
        "gravity/syllabus rules are respected.",
    };
  }

  const evaluation = bestEval!;
  const questionPackage = buildVerifiedPackage({
    slice,
    step1Receipt: finalStep1Receipt,
    step2Raw: bestStep2Raw,
    verified: evaluation.endToEndVerified,
  });

  return {
    verified: evaluation.endToEndVerified,
    slice,
    ...(questionPackage ? { questionPackage } : {}),
    ...(finalStep1Receipt.svgMarkup !== undefined
      ? { svgMarkup: finalStep1Receipt.svgMarkup }
      : {}),
    step1Receipt: finalStep1Receipt,
    evaluation,
    stats: {
      attemptsUsed: 1 + step1Retries + step2Retries,
      step1Retries,
      step2Retries,
      totalLatencyMs: Date.now() - startedAt,
      step1LatencyMs,
      step2LatencyMs,
      backend: client.backend,
      model: client.model,
      promptTokens,
      completionTokens,
    },
    traces,
    rawTurns: {
      systemPrompt,
      userPromptJson,
      assistantStep1Raw: finalStep1Raw,
      toolReceiptJson: finalStep1Receipt.toolReceiptJson,
      assistantStep2Raw: bestStep2Raw,
    },
  };
}

/**
 * Formats a generated question + verification receipt as clean student-readable Markdown.
 */
export function formatQuestionMarkdown(
  result: LiveGenerationResult,
  svgFileName?: string,
): string {
  const { slice, questionPackage: pkg, evaluation, stats } = result;
  const lines: string[] = [];

  const statusBadge = result.verified ? "VERIFIED" : "UNVERIFIED (DIAGNOSTICS BELOW)";
  lines.push(`# ${slice.conceptTitle} (${slice.syllabus.toUpperCase()} ${slice.level})`);
  lines.push("");
  lines.push(
    `**Status:** ${statusBadge} | **Format:** ${slice.format.toUpperCase()} | **Difficulty:** ${slice.difficulty} | **Marks:** ${pkg?.totalMarks ?? slice.totalMarks} | **Domain:** \`${slice.domain}\``,
  );
  lines.push(
    `**Topic:** ${slice.topicCode} — ${slice.topicTitle} / ${slice.subtopicCode} — ${slice.subtopicTitle} | **Gravity:** $g = ${slice.gravityConventionMs2}\\text{ m s}^{-2}$ | **Seed:** \`${slice.seed}\``,
  );
  lines.push("");

  if (svgFileName) {
    lines.push(`![Physics Diagram](${svgFileName})`);
    lines.push("");
  }

  lines.push("## Question");
  lines.push("");
  lines.push(pkg?.stem || "_(No stem produced)_");
  lines.push("");

  if (pkg?.format === "mcq" && pkg.options) {
    for (const opt of pkg.options) {
      lines.push(`- **${opt.label}.** ${opt.text}`);
    }
    lines.push("");
  } else if (pkg?.format === "structured" && pkg.parts) {
    for (const part of pkg.parts) {
      lines.push(`- **(${part.partId})** ${part.prompt} _[${part.marks} marks]_`);
    }
    lines.push("");
  }

  lines.push("## Answer & Worked Solution");
  lines.push("");
  if (pkg?.format === "mcq" && pkg.options) {
    const correct = pkg.options.find((o) => o.isCorrect);
    if (correct) {
      lines.push(`**Correct Answer:** **${correct.label}.** ${correct.text}`);
      lines.push("");
    }
  } else if (pkg?.format === "structured" && pkg.parts) {
    for (const part of pkg.parts) {
      lines.push(`- **(${part.partId}) Expected Answer:** ${part.expectedAnswer}`);
    }
    lines.push("");
  }

  lines.push(pkg?.workedSolution || "_(No worked solution produced)_");
  lines.push("");

  if (pkg?.markScheme && pkg.markScheme.length > 0) {
    lines.push("## Mark Scheme");
    lines.push("");
    lines.push("| Code | Part | Marks | Criterion |");
    lines.push("| :--- | :--- | :---: | :--- |");
    for (const ms of pkg.markScheme) {
      lines.push(
        `| \`${ms.code}\` | ${ms.partId ?? "—"} | ${ms.marks} | ${ms.criterion.replace(/\|/g, "\\|")} |`,
      );
    }
    lines.push("");
  }

  if (pkg?.format === "mcq" && pkg.options) {
    const distractors = pkg.options.filter((o) => !o.isCorrect);
    if (distractors.length > 0) {
      lines.push("## Distractor Misconceptions");
      lines.push("");
      for (const d of distractors) {
        lines.push(
          `- **${d.label} (${d.text}):** ${d.distractorRationale ?? "—"}`,
        );
      }
      lines.push("");
    }
  }

  lines.push("## Neuro-Symbolic Verification Receipt");
  lines.push("");
  lines.push(`- **End-to-End Verified:** \`${String(result.verified)}\``);
  lines.push(
    `- **Step 1 Solver & SVG Guard:** \`${evaluation.step1SolverPass ? "PASS" : "FAIL"}\`${pkg ? ` (\`${pkg.solverId}\`)` : ""}`,
  );
  lines.push(
    `- **Step 2 Package Gate (3 s.f., marks, distractors):** \`${evaluation.step2AuthorGatePass ? "PASS" : "FAIL"}\``,
  );
  lines.push(
    `- **Syllabus Alignment (${slice.syllabus.toUpperCase()} ${slice.level}):** \`${evaluation.syllabusAligned ? "PASS" : "FAIL"}\``,
  );
  lines.push(
    `- **Backend / Model:** \`${stats.backend}\` / \`${stats.model}\` | **Latency:** ${(stats.totalLatencyMs / 1000).toFixed(2)}s | **Retries:** step1=${stats.step1Retries}, step2=${stats.step2Retries}`,
  );

  if (evaluation.step1ErrorMessage) {
    lines.push(
      `- **Step 1 Error (${evaluation.step1ErrorStage ?? "unknown"}):** ${evaluation.step1ErrorMessage}`,
    );
  }
  for (const issue of evaluation.gateIssues) {
    lines.push(`- **Gate Issue (\`${issue.code}\`):** ${issue.message}`);
  }
  for (const issue of evaluation.syllabusIssues) {
    lines.push(`- **Syllabus Issue (\`${issue.code}\`):** ${issue.message}`);
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Formats a scannable, human-friendly terminal report for the CLI.
 */
export function formatQuestionTerminal(
  result: LiveGenerationResult,
  savedFiles?: SavedOutputFiles,
): string {
  const { slice, questionPackage: pkg, evaluation, stats } = result;
  const lines: string[] = [];
  const bar = "=".repeat(78);

  lines.push(bar);
  lines.push(
    `SixthPhysics Live Question  |  ${result.verified ? "[PASS] VERIFIED" : "[FAIL] UNVERIFIED"}`,
  );
  lines.push(bar);
  lines.push(
    `Syllabus : ${slice.syllabus.toUpperCase()} (${slice.level})  |  Topic: ${slice.topicCode} ${slice.topicTitle}`,
  );
  lines.push(
    `Concept  : ${slice.conceptTitle} (${slice.conceptId})`,
  );
  lines.push(
    `Domain   : ${slice.domain}  |  Format: ${slice.format.toUpperCase()}  |  Difficulty: ${slice.difficulty}  |  Marks: ${pkg?.totalMarks ?? slice.totalMarks}  |  Seed: ${slice.seed}`,
  );
  lines.push(
    `Checks   : [${evaluation.step1SolverPass ? "OK" : "X"}] Physics Solver & SVG   ` +
      `[${evaluation.step2AuthorGatePass ? "OK" : "X"}] 3-sf Package Gate   ` +
      `[${evaluation.syllabusAligned ? "OK" : "X"}] Syllabus Rules (g=${slice.gravityConventionMs2})`,
  );
  lines.push(
    `Runtime  : ${stats.backend} (${stats.model})  |  ${(stats.totalLatencyMs / 1000).toFixed(2)}s  |  retries: s1=${stats.step1Retries}, s2=${stats.step2Retries}`,
  );
  lines.push("-".repeat(78));

  if (pkg) {
    lines.push("");
    lines.push("QUESTION:");
    lines.push(pkg.stem);
    lines.push("");

    if (pkg.format === "mcq" && pkg.options) {
      for (const opt of pkg.options) {
        lines.push(`  ${opt.label}. ${opt.text}`);
      }
      lines.push("");
      const correct = pkg.options.find((o) => o.isCorrect);
      if (correct) {
        lines.push(`ANSWER: ${correct.label}. ${correct.text}`);
      }
    } else if (pkg.format === "structured" && pkg.parts) {
      for (const part of pkg.parts) {
        lines.push(`  (${part.partId}) ${part.prompt}  [${part.marks} marks]`);
      }
      lines.push("");
      lines.push("EXPECTED ANSWERS:");
      for (const part of pkg.parts) {
        lines.push(`  (${part.partId}) ${part.expectedAnswer}`);
      }
    }

    lines.push("");
    lines.push("WORKED SOLUTION:");
    lines.push(pkg.workedSolution);

    if (pkg.markScheme.length > 0) {
      lines.push("");
      lines.push("MARK SCHEME:");
      for (const ms of pkg.markScheme) {
        const partPrefix = ms.partId ? `(${ms.partId}) ` : "";
        lines.push(`  [${ms.code} | ${ms.marks}m] ${partPrefix}${ms.criterion}`);
      }
    }
  } else {
    lines.push("");
    lines.push("No question package could be authored.");
  }

  if (!result.verified) {
    lines.push("");
    lines.push("VERIFICATION DIAGNOSTICS:");
    if (evaluation.step1ErrorMessage) {
      lines.push(
        `  - Step 1 (${evaluation.step1ErrorStage ?? "error"}): ${evaluation.step1ErrorMessage}`,
      );
    }
    for (const gi of evaluation.gateIssues) {
      lines.push(`  - Gate [${gi.code}]: ${gi.message}`);
    }
    for (const si of evaluation.syllabusIssues) {
      lines.push(`  - Syllabus [${si.code}]: ${si.message}`);
    }
  }

  if (savedFiles) {
    lines.push("");
    lines.push("SAVED FILES:");
    lines.push(`  JSON     : ${savedFiles.jsonPath}`);
    lines.push(`  Markdown : ${savedFiles.markdownPath}`);
    if (savedFiles.svgPath) {
      lines.push(`  SVG      : ${savedFiles.svgPath}`);
    }
  } else if (result.svgMarkup) {
    lines.push("");
    lines.push(
      `SVG Diagram: rendered (${result.svgMarkup.length} bytes — pass --out <dir> to save .svg, .json & .md)`,
    );
  }

  lines.push(bar);
  return `${lines.join("\n")}\n`;
}

/**
 * Writes `<id>.json`, `<id>.svg` (when a figure was rendered), and `<id>.md`
 * to `outDir`.
 */
export function writeGenerationArtifacts(
  result: LiveGenerationResult,
  outDir: string,
): SavedOutputFiles {
  const absDir = path.resolve(outDir);
  fs.mkdirSync(absDir, { recursive: true });

  const safeBaseName = result.slice.itemId.replace(/[^a-zA-Z0-9._-]/g, "-");
  const jsonPath = path.join(absDir, `${safeBaseName}.json`);
  const markdownPath = path.join(absDir, `${safeBaseName}.md`);
  let svgPath: string | undefined;
  let svgFileName: string | undefined;

  if (result.svgMarkup) {
    svgFileName = `${safeBaseName}.svg`;
    svgPath = path.join(absDir, svgFileName);
    fs.writeFileSync(svgPath, result.svgMarkup, "utf8");
  }

  const jsonPayload = {
    schemaVersion: LIVE_GENERATOR_SCHEMA_VERSION,
    verified: result.verified,
    slice: result.slice,
    questionPackage: result.questionPackage ?? null,
    evaluation: result.evaluation,
    stats: result.stats,
  };
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify(jsonPayload, null, 2)}\n`,
    "utf8",
  );

  const mdContent = formatQuestionMarkdown(result, svgFileName);
  fs.writeFileSync(markdownPath, mdContent, "utf8");

  return {
    jsonPath,
    markdownPath,
    ...(svgPath ? { svgPath } : {}),
  };
}
