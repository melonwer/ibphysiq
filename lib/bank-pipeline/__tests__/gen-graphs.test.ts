import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildDistillationTrace,
  buildFamilyGroupKey,
  checkSvgHiddenQuantityLeaks,
  evaluateCandidatePackage,
  ExistingStemEntry,
  ingestCandidatesIntoShard,
  inspectSvgSanity,
  McqOptionItem,
  resetDomainRegistryToDefaults,
  SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
  SixthPhysicsBankItem,
  validateQwenDistillationTrace,
  verifyZeroSplitContamination,
} from "@/lib/bank-pipeline";
import {
  generateGraphsCandidates,
  GRAPHS_ARCHETYPE_CATALOGUE,
} from "@/lib/bank-pipeline/generators/graphs";

describe("Wave 2 graphs domain generator (generateGraphsCandidates)", () => {
  beforeEach(() => {
    resetDomainRegistryToDefaults();
  });

  it("produces deterministic seeded batches and respects count, mcqRatio, and idPrefix", () => {
    expect(generateGraphsCandidates({ count: 0 })).toEqual([]);

    const runA = generateGraphsCandidates({
      seed: 123456,
      count: 32,
      mcqRatio: 0.65,
      idPrefix: "test-graphs",
    });
    const runB = generateGraphsCandidates({
      seed: 123456,
      count: 32,
      mcqRatio: 0.65,
      idPrefix: "test-graphs",
    });
    const runDifferentSeed = generateGraphsCandidates({
      seed: 654321,
      count: 32,
      mcqRatio: 0.65,
      idPrefix: "test-graphs",
    });

    expect(runA).toHaveLength(32);
    expect(runA).toEqual(runB);
    expect(runA[0].id).toBe("test-graphs-0001-mcq");
    expect(runA.map((c) => c.seed)).not.toEqual(
      runDifferentSeed.map((c) => c.seed),
    );
  });

  it("spans 16 distinct (conceptId, templateArchetype) families and enforces 3-syllabus level & exclusion rules", () => {
    const batch = generateGraphsCandidates({ count: 320, seed: 20261117 });
    expect(batch).toHaveLength(320);

    const familyKeys = new Set(
      batch.map((c) =>
        buildFamilyGroupKey({
          conceptId: c.conceptId,
          templateArchetype: c.templateArchetype,
        }),
      ),
    );
    expect(familyKeys.size).toBe(16);
    expect(GRAPHS_ARCHETYPE_CATALOGUE).toHaveLength(16);

    const mcqCount = batch.filter((c) => c.format === "mcq").length;
    const structCount = batch.filter((c) => c.format === "structured").length;
    expect(mcqCount).toBe(208);
    expect(structCount).toBe(112);

    const difficulties = new Set(batch.map((c) => c.difficulty));
    expect([...difficulties].sort()).toEqual([
      "foundation",
      "higher",
      "standard",
    ]);

    const ibLevels = new Set<string>();
    const alevelLevels = new Set<string>();
    const ncukLevels = new Set<string>();

    for (const item of batch) {
      expect(item.domain).toBe("graphs");
      expect(item.syllabi.length).toBeGreaterThan(0);

      for (const tag of item.syllabi) {
        if (tag.syllabus === "ib") ibLevels.add(tag.level);
        if (tag.syllabus === "alevel") alevelLevels.add(tag.level);
        if (tag.syllabus === "ncuk") ncukLevels.add(tag.level);
      }

      // Young's modulus / stress-strain is strictly excluded from IB Physics 2025
      if (item.templateArchetype === "stress-strain-young-modulus-curve") {
        expect(item.syllabi.some((s) => s.syllabus === "ib")).toBe(false);
        expect(item.syllabi.some((s) => s.syllabus === "alevel")).toBe(true);
        expect(item.syllabi.some((s) => s.syllabus === "ncuk")).toBe(true);
      }

      // Semi-log decay linearization is IB HL-only, A-Level Y13-only, and NCUK IFY-S2
      if (item.templateArchetype === "semilog-activity-decay-gradient") {
        for (const s of item.syllabi) {
          if (s.syllabus === "ib") expect(s.level).toBe("HL");
          if (s.syllabus === "alevel") expect(s.level).toBe("Y13");
          if (s.syllabus === "ncuk") expect(s.level).toBe("IFY-S2");
        }
      }

      // Gravity linearization separates IB (g = 9.8) from A-Level/NCUK (g = 9.81)
      if (
        item.templateArchetype === "kinematics-gravity-v2-vs-drop-linearization"
      ) {
        const hasIb = item.syllabi.some((s) => s.syllabus === "ib");
        if (hasIb) {
          expect(item.syllabi.every((s) => s.syllabus === "ib")).toBe(true);
          expect(item.stem).toContain("9.8 m s⁻²");
        } else {
          expect(item.syllabi.some((s) => s.syllabus === "ib")).toBe(false);
          expect(item.stem).toContain("9.81 m s⁻²");
        }
      }
    }

    expect(ibLevels).toEqual(new Set(["SL", "HL"]));
    expect(alevelLevels).toEqual(new Set(["Y12", "Y13"]));
    expect(ncukLevels.has("IFY-S1")).toBe(true);
    expect(ncukLevels.has("IFY-S2")).toBe(true);
  });

  it("passes evaluateCandidatePackage and buildDistillationTrace across all 16 archetypes with zero leaks", () => {
    const batch = generateGraphsCandidates({ count: 48, seed: 20261117 });
    const existingShardItems: ExistingStemEntry[] = [];

    for (const candidate of batch) {
      const exec = evaluateCandidatePackage(candidate, { existingShardItems });
      expect({
        id: candidate.id,
        archetype: candidate.templateArchetype,
        valid: exec.evaluation.valid,
        issues: exec.evaluation.issues,
      }).toEqual({
        id: candidate.id,
        archetype: candidate.templateArchetype,
        valid: true,
        issues: [],
      });

      expect(exec.solveOutput).toBeDefined();
      expect(exec.effectiveSvgMarkup).toBeDefined();
      const svgSanity = inspectSvgSanity(exec.effectiveSvgMarkup!);
      expect(svgSanity.valid).toBe(true);

      const publicScalarNums = Object.entries(candidate.scenarioSpec)
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
          ...publicScalarNums,
        ],
        publicLabels: [
          ...(exec.renderOutput?.publicLabels ?? []),
          ...(exec.solveOutput?.publicLabels ?? []),
        ],
      });
      expect(leaks).toEqual([]);

      if (candidate.format === "structured") {
        expect(candidate.parts).toBeDefined();
        expect(candidate.parts!.length).toBeGreaterThanOrEqual(2);
        expect(candidate.parts!.length).toBeLessThanOrEqual(4);
        expect(
          candidate.parts!.some(
            (p) => p.dependsOnPartIds && p.dependsOnPartIds.length > 0,
          ),
        ).toBe(true);
      } else {
        expect(candidate.options).toHaveLength(4);
        const distractors = candidate.options!.filter((o) => !o.isCorrect);
        expect(distractors).toHaveLength(3);
        for (const d of distractors) {
          expect(d.distractorRationale?.trim().length).toBeGreaterThan(15);
        }
      }

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
        visualFamily: exec.renderOutput?.visualFamily ?? "cartesian_plot",
        stem: candidate.stem,
        svgMarkup: exec.effectiveSvgMarkup,
        ...(candidate.format === "mcq" && candidate.options
          ? {
              options: candidate.options as [
                McqOptionItem,
                McqOptionItem,
                McqOptionItem,
                McqOptionItem,
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
          shardId: "test-gen-graphs",
          generatorModel: "gemini-4-carbon-high",
          solverId: exec.solveOutput!.solverId,
          rendererVersion: exec.renderOutput?.rendererVersion,
          stemFingerprint: exec.evaluation.stemFingerprint,
          svgFingerprint: exec.evaluation.svgFingerprint,
          split: "train",
          createdAt: "2026-11-17T22:00:00.000Z",
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

      // Ensure Step-1 pre-solve questionPlan contains zero numerical digits
      const step1 = JSON.parse(trace.messages[2].content) as {
        questionPlan: unknown;
      };
      expect(/\d/.test(JSON.stringify(step1.questionPlan))).toBe(false);

      existingShardItems.push({
        id: candidate.id,
        stem: candidate.stem,
        stemFingerprint: exec.evaluation.stemFingerprint,
      });
    }
  });

  it("verifies and ingests all 320 default candidates with zero rejections and zero split contamination", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "sixthphysics-gen-graphs-test-"),
    );
    try {
      const fullBatch = generateGraphsCandidates({
        count: 320,
        seed: 20261117,
      });
      const summary = ingestCandidatesIntoShard({
        shardId: "gen-graphs",
        shardsDir: tempDir,
        candidates: fullBatch,
        dryRun: true,
      });

      expect(summary.totalCandidates).toBe(320);
      expect(summary.ingestedCount).toBe(320);
      expect(summary.rejectedCount).toBe(0);

      const splitAudit = verifyZeroSplitContamination(
        summary.results.map((r, idx) => ({
          id: r.id,
          familyGroupKey: r.familyGroupKey!,
          split: r.split!,
          conceptId: fullBatch[idx].conceptId,
          templateArchetype: fullBatch[idx].templateArchetype,
        })),
      );
      expect(splitAudit.valid).toBe(true);
      expect(splitAudit.violations).toEqual([]);
      expect(splitAudit.groupCounts.train).toBeGreaterThan(0);
      expect(splitAudit.groupCounts.val).toBeGreaterThan(0);
      expect(splitAudit.groupCounts.test).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
