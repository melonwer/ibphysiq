import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildFamilyGroupKey,
  CandidateQuestionInput,
  computeShingleSet,
  evaluateCandidatePackage,
  ingestCandidatesIntoShard,
  resetDomainRegistryToDefaults,
  validateQwenDistillationTrace,
  verifyZeroSplitContamination,
} from "@/lib/bank-pipeline";
import {
  formatPhysicsValue,
  generatePureCalculationCandidates,
  PURE_CALCULATION_ARCHETYPE_IDS,
} from "@/lib/bank-pipeline/generators/pure-calculation";

describe("Wave 2 pure-calculation domain generator & Qwen3.5-9B distillation traces", () => {
  let tempDir: string;
  let fullBatch: CandidateQuestionInput[];

  beforeAll(() => {
    resetDomainRegistryToDefaults();
    fullBatch = generatePureCalculationCandidates();
  });

  beforeEach(() => {
    resetDomainRegistryToDefaults();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-pure-calc-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates 336 deterministic solver-verified items across 16 family groups (~65% MCQ / ~35% structured) with zero rejections", () => {
    expect(fullBatch).toHaveLength(336);

    const familyGroups = new Set(
      fullBatch.map((c) =>
        buildFamilyGroupKey({
          conceptId: c.conceptId,
          templateArchetype: c.templateArchetype,
        }),
      ),
    );
    expect(familyGroups.size).toBe(16);

    const mcqCount = fullBatch.filter((c) => c.format === "mcq").length;
    const structuredCount = fullBatch.filter(
      (c) => c.format === "structured",
    ).length;
    expect(mcqCount + structuredCount).toBe(336);
    expect(mcqCount / fullBatch.length).toBeGreaterThanOrEqual(0.63);
    expect(mcqCount / fullBatch.length).toBeLessThanOrEqual(0.67);
    expect(structuredCount / fullBatch.length).toBeGreaterThanOrEqual(0.33);
    expect(structuredCount / fullBatch.length).toBeLessThanOrEqual(0.37);

    const summary = ingestCandidatesIntoShard({
      shardId: "gen-pure-calc-test",
      shardsDir: tempDir,
      candidates: fullBatch,
    });

    expect(summary.rejectedCount).toBe(0);
    expect(summary.ingestedCount).toBe(336);

    const shardLines = fs
      .readFileSync(summary.shardFilePath, "utf8")
      .trim()
      .split("\n")
      .map(
        (l) =>
          JSON.parse(l) as {
            bankItem: {
              id: string;
              familyGroupKey: string;
              visualFamily: string;
              svgMarkup?: string;
              provenance: {
                conceptId: string;
                templateArchetype: string;
                split: "train" | "val" | "test";
                stemFingerprint: string;
                sourceParentId?: string;
              };
            };
            distillationTrace: Parameters<
              typeof validateQwenDistillationTrace
            >[0];
          },
      );

    expect(shardLines).toHaveLength(336);

    for (const rec of shardLines) {
      expect(rec.bankItem.visualFamily).toBe("none");
      expect(rec.bankItem.svgMarkup).toBeUndefined();
      const traceCheck = validateQwenDistillationTrace(rec.distillationTrace);
      expect(traceCheck).toEqual({ valid: true, issues: [] });
    }

    const splitReport = verifyZeroSplitContamination(
      shardLines.map((r) => ({
        id: r.bankItem.id,
        familyGroupKey: r.bankItem.familyGroupKey,
        split: r.bankItem.provenance.split,
        conceptId: r.bankItem.provenance.conceptId,
        templateArchetype: r.bankItem.provenance.templateArchetype,
        stemFingerprint: r.bankItem.provenance.stemFingerprint,
        sourceParentId: r.bankItem.provenance.sourceParentId,
      })),
    );
    expect(splitReport.valid).toBe(true);
    expect(splitReport.violations).toEqual([]);
  });

  it("enforces strict 3-syllabus exclusions (zero IB on Young modulus, g = 9.8 on IB vs 9.81 on A-Level/NCUK, Y13 thermal)", () => {
    const syllabusLevelsSeen: Record<string, Set<string>> = {
      ib: new Set(),
      alevel: new Set(),
      ncuk: new Set(),
    };

    for (const cand of fullBatch) {
      expect(cand.syllabi.length).toBeGreaterThanOrEqual(1);
      for (const s of cand.syllabi) {
        syllabusLevelsSeen[s.syllabus].add(s.level);
      }

      // 1. Young modulus / tensile stress-strain MUST NEVER be tagged IB 2025
      if (cand.conceptId === "elasticity-young-modulus") {
        expect(cand.syllabi.some((s) => s.syllabus === "ib")).toBe(false);
        expect(cand.syllabi.some((s) => s.syllabus === "alevel")).toBe(true);
        expect(cand.syllabi.some((s) => s.syllabus === "ncuk")).toBe(true);
      }

      // 2. Thermal calorimetry on UK A-Level MUST be Y13 only (never Y12)
      if (cand.conceptId === "specific-heat-latent-heat") {
        const alTags = cand.syllabi.filter((s) => s.syllabus === "alevel");
        for (const tag of alTags) {
          expect(tag.level).toBe("Y13");
        }
      }

      // 3. Gravity-dependent archetypes must strictly separate IB (g = 9.8) from A-Level/NCUK (g = 9.81)
      if (
        cand.templateArchetype === "vertical-freefall-projection-gravity" ||
        cand.templateArchetype === "gravitational-hoist-pump-efficiency" ||
        cand.templateArchetype === "hydrostatic-depth-pressure-uncertainty"
      ) {
        const hasIb = cand.syllabi.some((s) => s.syllabus === "ib");
        const hasNonIb = cand.syllabi.some((s) => s.syllabus !== "ib");
        expect(hasIb && hasNonIb).toBe(false);

        if (hasIb) {
          expect(cand.stem).toMatch(/\bg = 9\.8\b/);
          expect(cand.stem).not.toMatch(/\bg = 9\.81\b/);
        } else {
          expect(cand.stem).toMatch(/\bg = 9\.81\b/);
        }
      }

      // 4. Step 1 questionPlan contains zero digits so pre-solve leakage is impossible
      expect(JSON.stringify(cand.questionPlan)).not.toMatch(/\d/);
    }

    expect([...syllabusLevelsSeen.ib].sort()).toEqual(["HL", "SL"]);
    expect([...syllabusLevelsSeen.alevel].sort()).toEqual(["Y12", "Y13"]);
    expect([...syllabusLevelsSeen.ncuk]).toEqual(["IFY"]);
  });

  it("maintains high stem diversity (< 0.82 3-gram Jaccard similarity across all pairs) and encodes classic student misconceptions", () => {
    const shingleSets = fullBatch.map((c) => computeShingleSet(c.stem));
    let maxPairwiseSimilarity = 0;

    for (let i = 0; i < shingleSets.length; i += 1) {
      const setA = shingleSets[i];
      for (let j = i + 1; j < shingleSets.length; j += 1) {
        const setB = shingleSets[j];
        let inter = 0;
        for (const tok of setA) {
          if (setB.has(tok)) inter += 1;
        }
        const union = setA.size + setB.size - inter;
        const sim = union === 0 ? 0 : inter / union;
        if (sim > maxPairwiseSimilarity) {
          maxPairwiseSimilarity = sim;
        }
      }
    }
    expect(maxPairwiseSimilarity).toBeLessThan(0.82);

    const allRationales = fullBatch
      .filter((c) => c.format === "mcq")
      .flatMap((c) =>
        (c.options ?? [])
          .filter((o) => !o.isCorrect)
          .map((o) => o.distractorRationale ?? ""),
      )
      .join(" \n ");

    expect(allRationales).toMatch(/πd²\/4|factor of 4/i);
    expect(allRationales).toMatch(/km h⁻¹/i);
    expect(allRationales).toMatch(/Subtracts.*uncertaint/i);
    expect(allRationales).toMatch(/Multiplies.*percentage uncertainties/i);
    expect(allRationales).toMatch(/exponent 2 on d²/i);
    expect(allRationales).toMatch(/Δx₁ \+ Δx₂ = 2Δx/i);
  });

  it("is deterministic for a fixed seed and supports subset/option overrides and validation errors", () => {
    const runA = generatePureCalculationCandidates({
      baseSeed: 910_000,
      totalCount: 32,
      archetypes: PURE_CALCULATION_ARCHETYPE_IDS.slice(0, 4),
    });
    const runB = generatePureCalculationCandidates({
      baseSeed: 910_000,
      totalCount: 32,
      archetypes: PURE_CALCULATION_ARCHETYPE_IDS.slice(0, 4),
    });
    expect(runA).toEqual(runB);
    expect(runA).toHaveLength(32);

    for (const item of runA) {
      const res = evaluateCandidatePackage(item);
      expect(res.evaluation.valid).toBe(true);
    }

    expect(formatPhysicsValue(0, "J")).toBe("0 J");
    expect(formatPhysicsValue(24, "W")).toBe("24.0 W");
    expect(formatPhysicsValue(4000, "J")).toBe("4.00 × 10³ J");
    expect(formatPhysicsValue(-0.0006, "m")).toBe("-6.00 × 10⁻⁴ m");

    expect(() =>
      generatePureCalculationCandidates({ totalCount: 0 }),
    ).toThrow(/totalCount/);
    expect(() =>
      generatePureCalculationCandidates({ mcqRatio: 1.2 }),
    ).toThrow(/mcqRatio/);
    expect(() =>
      generatePureCalculationCandidates({ archetypes: [] }),
    ).toThrow(/At least one/);
  });
});
