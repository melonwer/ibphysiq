import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildDistillationTrace,
  buildFamilyGroupKey,
  checkSvgHiddenQuantityLeaks,
  CompiledBankSummary,
  computeShingleSet,
  evaluateCandidatePackage,
  inspectSvgSanity,
  readShardRecords,
  resetDomainRegistryToDefaults,
  SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
  SixthPhysicsBankItem,
  validateQwenDistillationTrace,
} from "@/lib/bank-pipeline";
import {
  DEFAULT_FIELDS_TARGET_COUNT,
  FIELDS_GENERATOR_ARCHETYPES,
  generateFieldsCandidates,
} from "@/lib/bank-pipeline/generators/fields";
import {
  getCrosswalkEntry,
  getSubtopicById,
  getTopicById,
} from "@/lib/constants/syllabi";

import { runCompileBankCli } from "../../../scripts/bank-generation/compile-bank";
import { runVerifyAndIngestCli } from "../../../scripts/bank-generation/verify-and-ingest-shard";

function jaccardSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

describe("Wave 2 fields domain generator (generateFieldsCandidates)", () => {
  let tempRoot: string;

  beforeEach(() => {
    resetDomainRegistryToDefaults();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sixthphysics-gen-fields-"));
  });

  afterEach(() => {
    resetDomainRegistryToDefaults();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("generates 336 deterministic candidates across 16 familyGroupKeys with ~65/35 mcq/structured mix", () => {
    const candidates = generateFieldsCandidates();
    expect(candidates).toHaveLength(DEFAULT_FIELDS_TARGET_COUNT);
    expect(candidates).toHaveLength(336);

    const mcqItems = candidates.filter((c) => c.format === "mcq");
    const structuredItems = candidates.filter((c) => c.format === "structured");
    expect(mcqItems).toHaveLength(218);
    expect(structuredItems).toHaveLength(118);

    const mcqFraction = mcqItems.length / candidates.length;
    expect(mcqFraction).toBeGreaterThanOrEqual(0.63);
    expect(mcqFraction).toBeLessThanOrEqual(0.67);

    const familyGroups = new Set(
      candidates.map((c) =>
        buildFamilyGroupKey({
          conceptId: c.conceptId,
          templateArchetype: c.templateArchetype,
          sourceParentId: c.sourceParentId,
        }),
      ),
    );
    expect(familyGroups.size).toBe(FIELDS_GENERATOR_ARCHETYPES.length);
    expect(familyGroups.size).toBe(16);

    const uniqueIds = new Set(candidates.map((c) => c.id));
    expect(uniqueIds.size).toBe(candidates.length);

    const uniqueSeeds = new Set(candidates.map((c) => c.seed));
    expect(uniqueSeeds.size).toBe(candidates.length);

    // Balanced MCQ correct-option distribution across A, B, C, D
    const letterCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const mcq of mcqItems) {
      const correct = mcq.options?.find((o) => o.isCorrect);
      expect(correct).toBeDefined();
      letterCounts[correct!.label] += 1;
    }
    for (const letter of ["A", "B", "C", "D"]) {
      expect(letterCounts[letter]).toBeGreaterThanOrEqual(45);
    }
  });

  it("is strictly deterministic for identical options and scales cleanly for custom counts", () => {
    const runA = generateFieldsCandidates({ count: 48, baseSeed: 410_000 });
    const runB = generateFieldsCandidates({ count: 48, baseSeed: 410_000 });
    expect(runA).toEqual(runB);
    expect(runA).toHaveLength(48);

    const runDifferentSeed = generateFieldsCandidates({
      count: 48,
      baseSeed: 410_001,
    });
    expect(runDifferentSeed.map((c) => c.seed)).not.toEqual(
      runA.map((c) => c.seed),
    );
  });

  it("enforces 3-syllabus crosswalk compatibility and IB SL vs HL potential boundaries on every item", () => {
    const candidates = generateFieldsCandidates();

    let ibSlCount = 0;
    let ibHlCount = 0;
    let alevelY13Count = 0;
    let ncukIfyS2Count = 0;

    for (const cand of candidates) {
      expect(cand.domain).toBe("fields");
      const entry = getCrosswalkEntry(cand.conceptId);
      expect(entry).toBeDefined();
      expect(entry!.primaryVisualFamily).toBe("fields");

      const seenSyllabi = new Set<string>();
      for (const tag of cand.syllabi) {
        seenSyllabi.add(tag.syllabus);
        const mapping = entry!.mappings[tag.syllabus];
        expect(mapping.included).toBe(true);
        expect(mapping.levels).toContain(tag.level);
        expect(mapping.questionFormats).toContain(cand.format);

        const topic = getTopicById(tag.topicId);
        expect(topic).toBeDefined();
        expect(topic!.syllabus).toBe(tag.syllabus);

        expect(tag.subtopicId).toBeDefined();
        const subtopic = getSubtopicById(tag.subtopicId!);
        expect(subtopic).toBeDefined();
        expect(subtopic!.levelsCovered).toContain(tag.level);
        expect(subtopic!.questionFormats).toContain(cand.format);

        // Radial electric potential & equipotentials must NEVER be tagged IB SL
        if (
          cand.conceptId === "electric-potential-equipotentials" &&
          tag.syllabus === "ib"
        ) {
          expect(tag.level).toBe("HL");
        }

        if (tag.syllabus === "ib" && tag.level === "SL") ibSlCount += 1;
        if (tag.syllabus === "ib" && tag.level === "HL") ibHlCount += 1;
        if (tag.syllabus === "alevel" && tag.level === "Y13") {
          alevelY13Count += 1;
        }
        if (tag.syllabus === "ncuk" && tag.level === "IFY-S2") {
          ncukIfyS2Count += 1;
        }
      }
      expect([...seenSyllabi].sort()).toEqual(["alevel", "ib", "ncuk"]);
    }

    expect(ibSlCount).toBeGreaterThan(80);
    expect(ibHlCount).toBeGreaterThan(150);
    expect(alevelY13Count).toBe(candidates.length);
    expect(ncukIfyS2Count).toBe(candidates.length);
  });

  it("passes package-gate, SVG non-leakage, 3-gram deduplication, and Qwen/Qwen3.5-9B trace validation for all 336 items", () => {
    const candidates = generateFieldsCandidates();
    const shingleSets = candidates.map((c) => computeShingleSet(c.stem));
    const stemFingerprints = new Set<string>();

    let maxPairwiseSimilarity = 0;
    for (let i = 0; i < shingleSets.length; i += 1) {
      for (let j = i + 1; j < shingleSets.length; j += 1) {
        const sim = jaccardSimilarity(shingleSets[i], shingleSets[j]);
        if (sim > maxPairwiseSimilarity) {
          maxPairwiseSimilarity = sim;
        }
      }
    }
    expect(maxPairwiseSimilarity).toBeLessThan(0.9);

    for (const candidate of candidates) {
      const exec = evaluateCandidatePackage(candidate);
      if (!exec.evaluation.valid) {
        throw new Error(
          `Gate rejected ${candidate.id} (${candidate.templateArchetype}): ${JSON.stringify(exec.evaluation.issues)}`,
        );
      }
      expect(exec.evaluation.valid).toBe(true);
      expect(exec.solveOutput).toBeDefined();
      expect(exec.effectiveSvgMarkup).toBeDefined();

      expect(stemFingerprints.has(exec.evaluation.stemFingerprint)).toBe(false);
      stemFingerprints.add(exec.evaluation.stemFingerprint);

      const sanity = inspectSvgSanity(exec.effectiveSvgMarkup!);
      expect(sanity.valid).toBe(true);

      const publicNums = Object.entries(candidate.scenarioSpec)
        .filter(
          ([k, v]) =>
            !candidate.hiddenQuantities.includes(k) &&
            typeof v === "number" &&
            Number.isFinite(v),
        )
        .map(([, v]) => v as number);

      const leaks = checkSvgHiddenQuantityLeaks({
        svgMarkup: exec.effectiveSvgMarkup!,
        hiddenQuantities: candidate.hiddenQuantities,
        verifiedQuantities: exec.solveOutput!.quantities,
        publicNumbers: [
          ...(exec.renderOutput?.publicNumbers ?? []),
          ...(exec.solveOutput?.publicNumbers ?? []),
          ...publicNums,
        ],
        publicLabels: [
          ...(exec.renderOutput?.publicLabels ?? []),
          ...(exec.solveOutput?.publicLabels ?? []),
        ],
      });
      expect(leaks).toEqual([]);

      const familyGroupKey = buildFamilyGroupKey({
        conceptId: candidate.conceptId,
        templateArchetype: candidate.templateArchetype,
      });
      const bankItem: SixthPhysicsBankItem = {
        schemaVersion: SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
        id: candidate.id,
        familyGroupKey,
        syllabi: candidate.syllabi,
        format: candidate.format,
        difficulty: candidate.difficulty,
        visualFamily: exec.renderOutput?.visualFamily ?? "field_map",
        stem: candidate.stem,
        svgMarkup: exec.effectiveSvgMarkup,
        ...(candidate.format === "mcq" && candidate.options
          ? {
              options: candidate.options as [
                SixthPhysicsBankItem["options"] extends
                  | [infer A, unknown, unknown, unknown]
                  | undefined
                  ? A
                  : never,
                SixthPhysicsBankItem["options"] extends
                  | [unknown, infer B, unknown, unknown]
                  | undefined
                  ? B
                  : never,
                SixthPhysicsBankItem["options"] extends
                  | [unknown, unknown, infer C, unknown]
                  | undefined
                  ? C
                  : never,
                SixthPhysicsBankItem["options"] extends
                  | [unknown, unknown, unknown, infer D]
                  | undefined
                  ? D
                  : never,
              ],
              correctOptionIndex: exec.correctOptionIndex,
            }
          : {}),
        ...(candidate.format === "structured" && candidate.parts
          ? { parts: candidate.parts }
          : {}),
        workedSolution: candidate.workedSolution,
        markScheme: candidate.markScheme,
        totalMarks: candidate.totalMarks,
        verifiedQuantities: exec.solveOutput!.quantities,
        provenance: {
          domain: candidate.domain,
          conceptId: candidate.conceptId,
          templateArchetype: candidate.templateArchetype,
          familyGroupKey,
          seed: candidate.seed,
          shardId: "gen-fields-test",
          generatorModel: candidate.generatorModel ?? "gemini-4-carbon-high",
          solverId: exec.solveOutput!.solverId,
          rendererVersion: exec.renderOutput?.rendererVersion,
          stemFingerprint: exec.evaluation.stemFingerprint,
          svgFingerprint: exec.evaluation.svgFingerprint,
          split: "train",
          createdAt: "2026-11-17T22:15:00.000Z",
        },
      };

      const trace = buildDistillationTrace({
        candidate,
        bankItem,
        split: "train",
        publicVisualLabels: exec.renderOutput?.publicLabels,
      });
      const traceCheck = validateQwenDistillationTrace(trace);
      expect({
        id: candidate.id,
        valid: traceCheck.valid,
        issues: traceCheck.issues,
      }).toEqual({
        id: candidate.id,
        valid: true,
        issues: [],
      });
    }
  });

  it("ingests and compiles cleanly via standalone verify-and-ingest-shard and compile-bank CLIs", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const subset = generateFieldsCandidates({ count: 32 });
      const inputPath = path.join(tempRoot, "fields-candidates.json");
      const shardsDir = path.join(tempRoot, "shards");
      const compiledDir = path.join(tempRoot, "compiled");

      fs.writeFileSync(inputPath, JSON.stringify(subset, null, 2), "utf8");

      expect(
        runVerifyAndIngestCli([
          "--shard",
          "gen-fields",
          "--shards-dir",
          shardsDir,
          "--input",
          inputPath,
        ]),
      ).toBe(0);

      const records = readShardRecords(shardsDir, "gen-fields");
      expect(records).toHaveLength(32);

      expect(
        runCompileBankCli([
          "--shards-dir",
          shardsDir,
          "--out-dir",
          compiledDir,
        ]),
      ).toBe(0);

      const summary = JSON.parse(
        fs.readFileSync(path.join(compiledDir, "SUMMARY.json"), "utf8"),
      ) as CompiledBankSummary;
      expect(summary.totalCompiledItems).toBe(32);
      expect(summary.splitSummary.zeroContaminationVerified).toBe(true);
      expect(summary.coverageByDomain.fields.total).toBe(32);
      expect(summary.splitSummary.groupCounts.train).toBeGreaterThan(0);
      expect(summary.splitSummary.groupCounts.val).toBeGreaterThan(0);
      expect(summary.splitSummary.groupCounts.test).toBeGreaterThan(0);
    } finally {
      logSpy.mockRestore();
    }
  });
});
