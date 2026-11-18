import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { QWEN_HARNESS_SYSTEM_PROMPT } from "@/lib/bank-pipeline/distillation-trace";
import { getDomainAdapter } from "@/lib/bank-pipeline/domain-registry";
import {
  PhysicsDomainId,
  QuestionDifficulty,
  QuestionFormat,
  SyllabusId,
  SyllabusTag,
} from "@/lib/bank-pipeline/types";
import {
  checkSyllabusAlignment,
  NOVEL_BENCHMARK_PROMPT_SCHEMA_VERSION,
  NovelBenchmarkPromptRecord,
} from "@/lib/benchmark";
import {
  GeneratableSlice,
  getGeneratableSlices,
  getSyllabusCatalogue,
  SYLLABUS_IDS,
} from "@/lib/constants/syllabi";

export const DEFAULT_NOVEL_PROMPTS_PATH =
  "dataset/sixthphysics-benchmark/novel-1500-prompts.jsonl";
export const DEFAULT_NOVEL_SUMMARY_PATH =
  "dataset/sixthphysics-benchmark/SUMMARY.json";
export const NOVEL_BASE_SEED = 90_000_001;
export const TARGET_PER_SYLLABUS = 500;

const PURE_CALCULATION_ELIGIBLE_CONCEPTS = new Set<string>([
  "si-units-dimensional-analysis",
  "uncertainties-error-propagation",
  "kinematics-suvat",
  "work-energy-power",
]);

const CONTEXT_THEMES: readonly string[] = [
  "aerospace-telemetry",
  "laboratory-metrology",
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

const DIFFICULTY_ROTATION: readonly QuestionDifficulty[] = [
  "foundation",
  "standard",
  "standard",
  "higher",
];

const STRUCTURED_MARKS_ROTATION: readonly number[] = [4, 5, 6, 6];

interface CandidateSliceOption {
  syllabus: SyllabusId;
  level: string;
  topicId: string;
  subtopicId: string;
  conceptId: string;
  conceptTitle: string;
  domain: PhysicsDomainId;
  visualFamily: string;
  format: QuestionFormat;
}

function buildEligibleSlicesForSyllabus(
  syllabus: SyllabusId,
): CandidateSliceOption[] {
  const rawSlices: GeneratableSlice[] = getGeneratableSlices({
    syllabus,
    includeOptionTopics: true,
    includeSecondarySubtopics: true,
  });

  const options: CandidateSliceOption[] = [];
  for (const s of rawSlices) {
    const domain = s.visualFamily as PhysicsDomainId;
    const visualFamily = getDomainAdapter(domain).defaultVisualFamily;
    options.push({
      syllabus: s.syllabus,
      level: s.level,
      topicId: s.topicId,
      subtopicId: s.subtopicId,
      conceptId: s.conceptId,
      conceptTitle: s.conceptTitle,
      domain,
      visualFamily,
      format: s.format,
    });

    if (PURE_CALCULATION_ELIGIBLE_CONCEPTS.has(s.conceptId)) {
      options.push({
        syllabus: s.syllabus,
        level: s.level,
        topicId: s.topicId,
        subtopicId: s.subtopicId,
        conceptId: s.conceptId,
        conceptTitle: s.conceptTitle,
        domain: "pure-calculation",
        visualFamily: "none",
        format: s.format,
      });
    }
  }

  return options;
}

/**
 * Deterministically selects `targetCount` (500) prompts for a syllabus,
 * guaranteeing every syllabus subtopic, level, format, and eligible domain is covered.
 */
function selectStratifiedSlicesForSyllabus(
  syllabus: SyllabusId,
  targetCount: number,
): CandidateSliceOption[] {
  const allOptions = buildEligibleSlicesForSyllabus(syllabus);
  if (allOptions.length === 0) {
    throw new Error(`No eligible generatable slices found for syllabus "${syllabus}"`);
  }

  // Group options by subtopicId so every single subtopic in the syllabus catalogue gets balanced coverage
  const bySubtopic = new Map<string, CandidateSliceOption[]>();
  for (const opt of allOptions) {
    const existing = bySubtopic.get(opt.subtopicId);
    if (existing) {
      existing.push(opt);
    } else {
      bySubtopic.set(opt.subtopicId, [opt]);
    }
  }

  // Verify every catalogue subtopic has at least one generatable slice
  const catalogue = getSyllabusCatalogue(syllabus);
  const orderedSubtopicIds: string[] = [];
  for (const topic of catalogue.topics) {
    for (const sub of topic.subtopics) {
      if (bySubtopic.has(sub.id)) {
        orderedSubtopicIds.push(sub.id);
      }
    }
  }

  // Sort options inside each subtopic so MCQ (~65%) and Structured (~35%) alternate cleanly across domains & levels
  for (const subId of orderedSubtopicIds) {
    const list = bySubtopic.get(subId)!;
    list.sort((a, b) => {
      if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
      if (a.conceptId !== b.conceptId) return a.conceptId.localeCompare(b.conceptId);
      if (a.level !== b.level) return a.level.localeCompare(b.level);
      return a.format.localeCompare(b.format);
    });
  }

  const selected: CandidateSliceOption[] = [];
  const cursorBySubtopic = new Map<string, number>();

  // Round-robin across all subtopics until reaching exact `targetCount` (500),
  // enforcing ~65% MCQ / ~35% Structured ratio while respecting subtopic format constraints.
  let round = 0;
  while (selected.length < targetCount) {
    for (const subId of orderedSubtopicIds) {
      if (selected.length >= targetCount) break;
      const pool = bySubtopic.get(subId)!;
      const prevCursor = cursorBySubtopic.get(subId) ?? 0;

      // Target ~65% MCQ (13 of every 20 items) and ~35% Structured (7 of every 20 items)
      const desiredFormat: QuestionFormat =
        selected.length % 20 < 13 ? "mcq" : "structured";

      let chosenIdx = -1;
      for (let offset = 0; offset < pool.length; offset += 1) {
        const idx = (prevCursor + offset) % pool.length;
        if (pool[idx].format === desiredFormat) {
          chosenIdx = idx;
          break;
        }
      }
      if (chosenIdx === -1) {
        chosenIdx = prevCursor % pool.length;
      }

      selected.push(pool[chosenIdx]);
      cursorBySubtopic.set(subId, chosenIdx + 1 + (round % 2));
    }
    round += 1;
  }

  return selected;
}

export function generateNovelBenchmarkPrompts(
  perSyllabusCount = TARGET_PER_SYLLABUS,
  baseSeed = NOVEL_BASE_SEED,
): NovelBenchmarkPromptRecord[] {
  const records: NovelBenchmarkPromptRecord[] = [];
  let globalIndex = 0;

  for (const syllabus of SYLLABUS_IDS) {
    const slices = selectStratifiedSlicesForSyllabus(
      syllabus,
      perSyllabusCount,
    );

    for (let localIdx = 0; localIdx < slices.length; localIdx += 1) {
      const slice = slices[localIdx];
      const seed = baseSeed + globalIndex;
      globalIndex += 1;

      const seqStr = String(localIdx + 1).padStart(4, "0");
      const id = `novel-${syllabus}-${seqStr}`;
      const difficulty =
        DIFFICULTY_ROTATION[(globalIndex - 1) % DIFFICULTY_ROTATION.length];
      const totalMarks =
        slice.format === "mcq"
          ? 1
          : STRUCTURED_MARKS_ROTATION[
              (globalIndex - 1) % STRUCTURED_MARKS_ROTATION.length
            ];
      const contextSlug =
        CONTEXT_THEMES[(globalIndex - 1) % CONTEXT_THEMES.length];
      const variantBatch = Math.floor(localIdx / slices.length) + 1 + (localIdx % 5);
      const templateArchetype = `novel-bench-${slice.conceptId}-${contextSlug}-v${variantBatch}`;
      const familyGroupKey = `${slice.conceptId}::${templateArchetype}`;

      const syllabusTag: SyllabusTag = {
        syllabus: slice.syllabus,
        level: slice.level,
        topicId: slice.topicId,
        subtopicId: slice.subtopicId,
      };

      const alignment = checkSyllabusAlignment({
        id,
        syllabi: [syllabusTag],
        conceptId: slice.conceptId,
        domain: slice.domain,
        format: slice.format,
        totalMarks,
      });
      if (!alignment.aligned) {
        throw new Error(
          `Generated novel prompt "${id}" failed syllabus alignment: ${JSON.stringify(alignment.issues)}`,
        );
      }

      const userRequestPayload = {
        task: "generate_verified_physics_question",
        syllabi: [syllabusTag],
        domain: slice.domain,
        conceptId: slice.conceptId,
        templateArchetype,
        visualFamily: slice.visualFamily,
        format: slice.format,
        difficulty,
        totalMarks,
        seed,
      };

      records.push({
        schemaVersion: NOVEL_BENCHMARK_PROMPT_SCHEMA_VERSION,
        id,
        itemId: id,
        traceId: `trace-${id}`,
        targetModel: "Qwen/Qwen3.5-9B",
        split: "novel",
        familyGroupKey,
        seed,
        messages: [
          {
            role: "system",
            content: QWEN_HARNESS_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: JSON.stringify(userRequestPayload),
          },
        ],
        metadata: {
          syllabi: [syllabusTag],
          domain: slice.domain,
          conceptId: slice.conceptId,
          conceptTitle: slice.conceptTitle,
          templateArchetype,
          visualFamily: slice.visualFamily,
          format: slice.format,
          difficulty,
          totalMarks,
          gravityConventionMs2: syllabus === "ib" ? 9.8 : 9.81,
        },
      });
    }
  }

  return records;
}

function parseCliArgs(argv: readonly string[]): {
  outputPath: string;
  summaryPath: string;
  perSyllabus: number;
} {
  let outputPath = DEFAULT_NOVEL_PROMPTS_PATH;
  let summaryPath = DEFAULT_NOVEL_SUMMARY_PATH;
  let perSyllabus = TARGET_PER_SYLLABUS;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--output" || arg === "-o") && argv[i + 1]) {
      outputPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--output=")) {
      outputPath = arg.slice("--output=".length);
    } else if (arg === "--summary" && argv[i + 1]) {
      summaryPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--summary=")) {
      summaryPath = arg.slice("--summary=".length);
    } else if (arg === "--per-syllabus" && argv[i + 1]) {
      perSyllabus = Number.parseInt(argv[i + 1], 10);
      i += 1;
    }
  }

  return { outputPath, summaryPath, perSyllabus };
}

function runCli(): void {
  const { outputPath, summaryPath, perSyllabus } = parseCliArgs(
    process.argv.slice(2),
  );
  const records = generateNovelBenchmarkPrompts(perSyllabus, NOVEL_BASE_SEED);

  const jsonlContent = `${records.map((r) => JSON.stringify(r)).join("\n")}\n`;
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, jsonlContent, "utf8");

  const sha256 = crypto
    .createHash("sha256")
    .update(jsonlContent, "utf8")
    .digest("hex");

  const bySyllabus: Record<string, number> = {};
  const bySyllabusLevel: Record<string, number> = {};
  const byDomain: Record<string, number> = {};
  const byFormat: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  const uniqueTopics = new Set<string>();
  const uniqueSubtopics = new Set<string>();
  const uniqueConcepts = new Set<string>();

  for (const rec of records) {
    const tag = rec.metadata.syllabi[0];
    bySyllabus[tag.syllabus] = (bySyllabus[tag.syllabus] ?? 0) + 1;
    const slKey = `${tag.syllabus}:${tag.level}`;
    bySyllabusLevel[slKey] = (bySyllabusLevel[slKey] ?? 0) + 1;
    byDomain[rec.metadata.domain] = (byDomain[rec.metadata.domain] ?? 0) + 1;
    byFormat[rec.metadata.format] = (byFormat[rec.metadata.format] ?? 0) + 1;
    byDifficulty[rec.metadata.difficulty] =
      (byDifficulty[rec.metadata.difficulty] ?? 0) + 1;
    uniqueTopics.add(tag.topicId);
    if (tag.subtopicId) uniqueSubtopics.add(tag.subtopicId);
    uniqueConcepts.add(rec.metadata.conceptId);
  }

  const summary = {
    schemaVersion: "sixthphysics-novel-benchmark-manifest/1.0.0",
    generatedAt: new Date().toISOString(),
    outputPath,
    sha256,
    totalPrompts: records.length,
    seedRange: [
      records[0]?.seed ?? NOVEL_BASE_SEED,
      records[records.length - 1]?.seed ?? NOVEL_BASE_SEED,
    ],
    bySyllabus,
    bySyllabusLevel,
    byDomain,
    byFormat,
    byDifficulty,
    coverageCounts: {
      uniqueTopics: uniqueTopics.size,
      uniqueSubtopics: uniqueSubtopics.size,
      uniqueConcepts: uniqueConcepts.size,
    },
  };

  fs.mkdirSync(path.dirname(path.resolve(summaryPath)), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const isDirectExecution =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) ===
    path.resolve(__dirname, "generate-novel-prompts.ts");

if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
