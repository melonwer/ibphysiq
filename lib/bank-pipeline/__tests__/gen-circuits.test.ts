import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildFamilyGroupKey,
  checkSvgHiddenQuantityLeaks,
  compileBankFromShards,
  computeShingleSet,
  ingestCandidatesIntoShard,
  inspectSvgSanity,
  readShardRecords,
  resetDomainRegistryToDefaults,
  validateQwenDistillationTrace,
} from "@/lib/bank-pipeline";
import {
  CIRCUITS_GENERATOR_ARCHETYPES,
  formatPhysicsQuantity,
  generateCircuitsCandidates,
} from "@/lib/bank-pipeline/generators/circuits";
import { getCompatibleSyllabiForConcept } from "@/lib/constants/syllabi";

describe("Wave 2 circuits domain question bank & Qwen3.5-9B distillation generator", () => {
  let tempDir: string;

  beforeEach(() => {
    resetDomainRegistryToDefaults();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sixthphysics-gen-circuits-"));
  });

  afterEach(() => {
    resetDomainRegistryToDefaults();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("formats physical quantities cleanly to 3 significant figures", () => {
    expect(formatPhysicsQuantity(0, "V")).toBe("0 V");
    expect(formatPhysicsQuantity(24, "W")).toBe("24.0 W");
    expect(formatPhysicsQuantity(0.00036, "A")).toBe("3.60 × 10⁻⁴ A");
    expect(formatPhysicsQuantity(12500, "J")).toBe("1.25 × 10⁴ J");
    expect(() => formatPhysicsQuantity(Number.NaN, "V")).toThrow(
      /non-finite/i,
    );
  });

  it("is deterministic for a fixed seed and honours custom count and mcqRatio options", () => {
    const batchA = generateCircuitsCandidates({
      count: 30,
      seed: 310_000,
      mcqRatio: 0.6,
    });
    const batchB = generateCircuitsCandidates({
      count: 30,
      seed: 310_000,
      mcqRatio: 0.6,
    });
    const batchDifferentSeed = generateCircuitsCandidates({
      count: 30,
      seed: 410_000,
      mcqRatio: 0.6,
    });

    expect(batchA).toEqual(batchB);
    expect(batchA).toHaveLength(30);
    expect(batchA.filter((c) => c.format === "mcq")).toHaveLength(18);
    expect(batchA.filter((c) => c.format === "structured")).toHaveLength(12);
    expect(batchA.map((c) => c.stem)).not.toEqual(
      batchDifferentSeed.map((c) => c.stem),
    );
  });

  it("generates 325 verified circuits items across 15 archetypes, passes shard ingestion & compilation with 0 rejections, and leaks 0 answers", () => {
    const candidates = generateCircuitsCandidates();

    expect(candidates.length).toBeGreaterThanOrEqual(300);
    expect(candidates.length).toBeLessThanOrEqual(350);
    expect(candidates).toHaveLength(325);

    const mcqItems = candidates.filter((c) => c.format === "mcq");
    const structuredItems = candidates.filter((c) => c.format === "structured");
    expect(mcqItems).toHaveLength(211);
    expect(structuredItems).toHaveLength(114);

    const mcqRatio = mcqItems.length / candidates.length;
    expect(mcqRatio).toBeGreaterThan(0.62);
    expect(mcqRatio).toBeLessThan(0.68);

    const familyGroupKeys = new Set(
      candidates.map((c) =>
        buildFamilyGroupKey({
          conceptId: c.conceptId,
          templateArchetype: c.templateArchetype,
          sourceParentId: c.sourceParentId,
        }),
      ),
    );
    expect(familyGroupKeys.size).toBe(CIRCUITS_GENERATOR_ARCHETYPES.length);
    expect(familyGroupKeys.size).toBe(15);

    // Check 3-syllabus & level coverage and strict crosswalk compliance
    const seenSyllabiLevels = new Set<string>();
    for (const item of candidates) {
      expect(item.domain).toBe("circuits");
      const compatible = getCompatibleSyllabiForConcept(item.conceptId, {
        format: item.format,
        excludeOptionTopics: true,
      });
      const compatibleBySyllabus = new Map(
        compatible.map((m) => [m.syllabus, m]),
      );

      expect(item.syllabi).toHaveLength(3);
      for (const tag of item.syllabi) {
        const spec = compatibleBySyllabus.get(tag.syllabus);
        expect(spec).toBeDefined();
        expect(spec!.levels).toContain(tag.level);
        expect(spec!.topicIds).toContain(tag.topicId);
        expect(spec!.subtopicIds).toContain(tag.subtopicId!);
        seenSyllabiLevels.add(`${tag.syllabus}:${tag.level}`);
      }

      if (item.conceptId === "potential-divider-sensors" && item.stem.includes("thermistor")) {
        expect(item.stem).toMatch(/\bNTC\b/);
      }
    }

    expect([...seenSyllabiLevels].sort()).toEqual([
      "alevel:Y12",
      "alevel:Y13",
      "ib:HL",
      "ib:SL",
      "ncuk:IFY",
      "ncuk:IFY-S1",
    ]);

    // Check MCQ correct option index spread
    const correctLabelCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (const mcq of mcqItems) {
      expect(mcq.options).toHaveLength(4);
      const correct = mcq.options!.filter((o) => o.isCorrect);
      expect(correct).toHaveLength(1);
      correctLabelCounts[correct[0].label] += 1;
    }
    expect(correctLabelCounts.A).toBeGreaterThan(20);
    expect(correctLabelCounts.B).toBeGreaterThan(20);
    expect(correctLabelCounts.C).toBeGreaterThan(20);
    expect(correctLabelCounts.D).toBeGreaterThan(10);

    // Check pairwise 3-gram shingle Jaccard similarity across all 325 items
    const shingleSets = candidates.map((c) => computeShingleSet(c.stem));
    let maxPairwiseSimilarity = 0;
    for (let i = 0; i < shingleSets.length; i += 1) {
      for (let j = i + 1; j < shingleSets.length; j += 1) {
        let intersection = 0;
        for (const tok of shingleSets[i]) {
          if (shingleSets[j].has(tok)) intersection += 1;
        }
        const union = shingleSets[i].size + shingleSets[j].size - intersection;
        const sim = union === 0 ? 0 : intersection / union;
        if (sim > maxPairwiseSimilarity) {
          maxPairwiseSimilarity = sim;
        }
      }
    }
    expect(maxPairwiseSimilarity).toBeLessThan(0.55);

    // Ingest into temporary shard and verify 100% pass rate + distillation traces + SVGs
    const shardsDir = path.join(tempDir, "shards");
    const compiledDir = path.join(tempDir, "compiled");

    const summary = ingestCandidatesIntoShard({
      shardId: "gen-circuits-test",
      shardsDir,
      candidates,
    });

    expect(summary.rejectedCount).toBe(0);
    expect(summary.ingestedCount).toBe(325);

    const records = readShardRecords(shardsDir, "gen-circuits-test");
    expect(records).toHaveLength(325);

    for (const rec of records) {
      expect(rec.bankItem.svgMarkup).toBeDefined();
      const sanity = inspectSvgSanity(rec.bankItem.svgMarkup!);
      expect(sanity.valid).toBe(true);

      const tracePayload = JSON.parse(
        rec.distillationTrace.messages[3].content,
      ) as {
        visualReceipt: { publicLabels: string[] };
      };
      const step1Payload = JSON.parse(
        rec.distillationTrace.messages[2].content,
      ) as {
        scenarioSpec: Record<string, unknown>;
        hiddenQuantities: string[];
      };

      const declaredPublicNums = Object.entries(step1Payload.scenarioSpec)
        .filter(
          ([k, v]) =>
            !step1Payload.hiddenQuantities.includes(k) &&
            typeof v === "number" &&
            Number.isFinite(v),
        )
        .map(([, v]) => v as number);

      const leaks = checkSvgHiddenQuantityLeaks({
        svgMarkup: rec.bankItem.svgMarkup!,
        hiddenQuantities: step1Payload.hiddenQuantities,
        verifiedQuantities: rec.bankItem.verifiedQuantities,
        publicNumbers: declaredPublicNums,
        publicLabels: tracePayload.visualReceipt.publicLabels,
      });
      expect(leaks).toEqual([]);

      const traceCheck = validateQwenDistillationTrace(rec.distillationTrace);
      expect(traceCheck).toEqual({ valid: true, issues: [] });
    }

    const compiled = compileBankFromShards({
      shardsDir,
      outDir: compiledDir,
    });
    expect(compiled.totalCompiledItems).toBe(325);
    expect(compiled.splitSummary.zeroContaminationVerified).toBe(true);
    expect(compiled.deduplication.duplicateIdsSkipped).toEqual([]);
    expect(compiled.deduplication.nearDuplicateIdsSkipped).toEqual([]);
  });
});
