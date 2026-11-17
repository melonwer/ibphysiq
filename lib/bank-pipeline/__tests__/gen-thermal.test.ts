import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildFamilyGroupKey,
  checkSvgHiddenQuantityLeaks,
  computeShingleSet,
  ingestCandidatesIntoShard,
  inspectSvgSanity,
  readShardRecords,
  resetDomainRegistryToDefaults,
  SplitAuditRecord,
  validateQwenDistillationTrace,
  verifyZeroSplitContamination,
} from "@/lib/bank-pipeline";
import {
  formatThermalValue,
  generateThermalCandidates,
  THERMAL_ARCHETYPE_CATALOGUE,
} from "@/lib/bank-pipeline/generators/thermal";
import {
  getCrosswalkEntry,
  getSubtopicById,
  getTopicById,
} from "@/lib/constants/syllabi";
import { ThermalScenarioKind } from "@/lib/visuals/thermal";

function jaccardFromSets(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

describe("Wave 2 thermal domain question bank & Qwen/Qwen3.5-9B distillation generator", () => {
  let tempDir: string;

  beforeEach(() => {
    resetDomainRegistryToDefaults();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sixthphysics-gen-thermal-"));
  });

  afterEach(() => {
    resetDomainRegistryToDefaults();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates 336 deterministic candidates (~65% MCQ / ~35% structured) across 16 family groups and all 6 ThermalScenarioKinds", () => {
    const batchA = generateThermalCandidates();
    const batchB = generateThermalCandidates();

    expect(batchA).toHaveLength(336);
    expect(batchA.length).toBeGreaterThanOrEqual(300);
    expect(batchA.length).toBeLessThanOrEqual(350);
    expect(batchA).toEqual(batchB);

    const familyKeys = new Set(
      batchA.map((c) =>
        buildFamilyGroupKey({
          conceptId: c.conceptId,
          templateArchetype: c.templateArchetype,
        }),
      ),
    );
    expect(familyKeys.size).toBe(16);
    expect(THERMAL_ARCHETYPE_CATALOGUE).toHaveLength(16);

    const concepts = new Set(batchA.map((c) => c.conceptId));
    expect([...concepts].sort()).toEqual([
      "greenhouse-albedo-energy-balance",
      "ideal-gas-kinetic-theory",
      "ideal-gas-pv-cycles",
      "specific-heat-latent-heat",
      "thermal-conduction-radiation",
      "thermodynamics-entropy-engines",
    ]);

    const scenarioKinds = new Set(
      batchA.map((c) => c.scenarioSpec.kind as ThermalScenarioKind),
    );
    expect([...scenarioKinds].sort()).toEqual([
      "calorimetry-mixing",
      "carnot-cycle",
      "kinetic-theory",
      "phase-change-curve",
      "thermal-radiation",
      "thermodynamic-process",
    ]);

    const mcqCount = batchA.filter((c) => c.format === "mcq").length;
    const structuredCount = batchA.filter((c) => c.format === "structured").length;
    expect(mcqCount + structuredCount).toBe(batchA.length);
    const mcqRatio = mcqCount / batchA.length;
    expect(mcqRatio).toBeGreaterThanOrEqual(0.62);
    expect(mcqRatio).toBeLessThanOrEqual(0.68);

    const difficulties = {
      foundation: batchA.filter((c) => c.difficulty === "foundation").length,
      standard: batchA.filter((c) => c.difficulty === "standard").length,
      higher: batchA.filter((c) => c.difficulty === "higher").length,
    };
    expect(difficulties.foundation).toBeGreaterThan(40);
    expect(difficulties.standard).toBeGreaterThan(100);
    expect(difficulties.higher).toBeGreaterThan(60);
  });

  it("enforces 3-syllabus crosswalk compatibility, level boundaries, exclusions, and explicit work sign clarity", () => {
    const candidates = generateThermalCandidates();

    const seenSyllabi = new Set<string>();
    const ibLevels = new Set<string>();
    const ncukLevels = new Set<string>();

    for (const cand of candidates) {
      expect(cand.domain).toBe("thermal");
      expect(cand.syllabi.length).toBeGreaterThanOrEqual(1);

      const entry = getCrosswalkEntry(cand.conceptId);
      expect(entry).toBeDefined();

      for (const tag of cand.syllabi) {
        seenSyllabi.add(tag.syllabus);
        if (tag.syllabus === "ib") ibLevels.add(tag.level);
        if (tag.syllabus === "ncuk") ncukLevels.add(tag.level);

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

        // UK A-Level Thermal Physics is strictly Y13 (never Y12)
        if (tag.syllabus === "alevel") {
          expect(tag.level).toBe("Y13");
        }
      }

      // Fine-grained syllabus exclusion checks
      if (cand.conceptId === "thermal-conduction-radiation") {
        expect(cand.syllabi.some((s) => s.syllabus === "alevel")).toBe(false);
      }
      if (cand.conceptId === "greenhouse-albedo-energy-balance") {
        expect(cand.syllabi.every((s) => s.syllabus === "ib")).toBe(true);
      }
      if (cand.conceptId === "thermodynamics-entropy-engines") {
        expect(cand.syllabi.some((s) => s.syllabus === "ncuk")).toBe(false);
        for (const tag of cand.syllabi) {
          if (tag.syllabus === "ib") {
            expect(tag.level).toBe("HL");
            expect(tag.subtopicId).toBe("ib-b4-thermodynamics");
          }
          if (tag.syllabus === "alevel") {
            expect(cand.format).toBe("structured");
            expect(tag.subtopicId).toBe("alevel-3-11-engineering-physics");
          }
        }
      }
      if (
        cand.templateArchetype === "isobaric-isochoric-open-first-law" ||
        cand.templateArchetype === "rectangular-pv-cycle-work-efficiency"
      ) {
        for (const tag of cand.syllabi) {
          if (tag.syllabus === "ib") {
            expect(tag.level).toBe("HL");
            expect(tag.subtopicId).toBe("ib-b4-thermodynamics");
          }
        }
      }
      if (cand.templateArchetype === "rectangular-pv-cycle-work-efficiency") {
        expect(cand.syllabi.some((s) => s.syllabus === "ncuk")).toBe(false);
      }

      // Explicit work/heat sign convention clarity whenever work or First Law is assessed
      const combinedStudentText = [
        cand.stem,
        ...(cand.parts?.map((p) => p.prompt) ?? []),
      ].join(" ");
      if (/\bwork\b/i.test(combinedStudentText)) {
        expect(combinedStudentText).toMatch(
          /\bwork(?:\s+\w+){0,4}\s+(?:by|on)\s+the\s+gas\b|\bnet\s+(?:mechanical\s+)?work\s+output\b/i,
        );
      }
    }

    expect([...seenSyllabi].sort()).toEqual(["alevel", "ib", "ncuk"]);
    expect([...ibLevels].sort()).toEqual(["HL", "SL"]);
    expect(ncukLevels.has("IFY")).toBe(true);
  });

  it("ingests 100% of generated candidates with zero gate rejections, zero SVG/Step-1 leaks, low 3-gram similarity, and clean 70/15/15 splits", () => {
    const candidates = generateThermalCandidates();
    const shardsDir = path.join(tempDir, "shards");

    const ingestSummary = ingestCandidatesIntoShard({
      shardId: "gen-thermal-test",
      shardsDir,
      candidates,
    });

    expect({
      totalCandidates: ingestSummary.totalCandidates,
      ingestedCount: ingestSummary.ingestedCount,
      rejectedCount: ingestSummary.rejectedCount,
      rejectedSample: ingestSummary.results
        .filter((r) => r.status === "rejected")
        .slice(0, 5),
    }).toEqual({
      totalCandidates: 336,
      ingestedCount: 336,
      rejectedCount: 0,
      rejectedSample: [],
    });

    const records = readShardRecords(shardsDir, "gen-thermal-test");
    expect(records).toHaveLength(336);

    for (const rec of records) {
      expect(rec.bankItem.svgMarkup).toBeDefined();
      const sanity = inspectSvgSanity(rec.bankItem.svgMarkup!);
      expect(sanity.valid).toBe(true);

      const matchCand = candidates.find((c) => c.id === rec.bankItem.id)!;
      const leaks = checkSvgHiddenQuantityLeaks({
        svgMarkup: rec.bankItem.svgMarkup!,
        hiddenQuantities: matchCand.hiddenQuantities,
        verifiedQuantities: rec.bankItem.verifiedQuantities,
      });
      expect(leaks).toEqual([]);

      const traceCheck = validateQwenDistillationTrace(rec.distillationTrace);
      expect(traceCheck).toEqual({ valid: true, issues: [] });
    }

    // Verify 70/15/15 family-grouped split isolation
    const auditRecords: SplitAuditRecord[] = records.map((rec) => ({
      id: rec.bankItem.id,
      familyGroupKey: rec.bankItem.familyGroupKey,
      split: rec.distillationTrace.split,
      conceptId: rec.bankItem.provenance.conceptId,
      templateArchetype: rec.bankItem.provenance.templateArchetype,
      stemFingerprint: rec.bankItem.provenance.stemFingerprint,
    }));
    const splitReport = verifyZeroSplitContamination(auditRecords);
    expect(splitReport.valid).toBe(true);
    expect(splitReport.violations).toEqual([]);
    expect(splitReport.itemCounts.train).toBeGreaterThan(0);
    expect(splitReport.itemCounts.val).toBeGreaterThan(0);
    expect(splitReport.itemCounts.test).toBeGreaterThan(0);

    // Verify high stem diversity across all 336 items via 3-gram shingle Jaccard
    const shingleSets = candidates.map((c) => computeShingleSet(c.stem));
    let maxSimilarity = 0;
    for (let i = 0; i < shingleSets.length; i += 1) {
      for (let j = i + 1; j < shingleSets.length; j += 1) {
        const sim = jaccardFromSets(shingleSets[i], shingleSets[j]);
        if (sim > maxSimilarity) {
          maxSimilarity = sim;
        }
      }
    }
    expect(maxSimilarity).toBeLessThan(0.75);
  });

  it("supports custom options and validates invalid option arguments", () => {
    expect(generateThermalCandidates({ count: 0 })).toEqual([]);

    const small = generateThermalCandidates({
      count: 32,
      baseSeed: 810_000,
      mcqFraction: 0.5,
      syllabiFilter: ["ib"],
    });
    expect(small).toHaveLength(32);
    expect(small.filter((c) => c.format === "mcq")).toHaveLength(16);
    expect(
      small.every((c) => c.syllabi.every((s) => s.syllabus === "ib")),
    ).toBe(true);

    expect(formatThermalValue(0)).toBe("0");
    expect(formatThermalValue(432.377, 3)).toBe("432");
    expect(formatThermalValue(186975, 3)).toBe("1.87 × 10⁵");
    expect(formatThermalValue(-0.00245, 3)).toBe("-2.45 × 10⁻³");

    expect(() => generateThermalCandidates({ count: -1 })).toThrow();
    expect(() => generateThermalCandidates({ baseSeed: 1.5 })).toThrow();
    expect(() => generateThermalCandidates({ mcqFraction: 1.2 })).toThrow();
  });
});
