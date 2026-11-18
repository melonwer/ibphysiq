import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildFamilyGroupKey,
  CandidateQuestionInput,
  computeStemSimilarity,
  evaluateCandidatePackage,
  ingestCandidatesIntoShard,
  readShardRecords,
  resetDomainRegistryToDefaults,
  validateQwenDistillationTrace,
} from "@/lib/bank-pipeline";
import {
  EM_INDUCTION_ARCHETYPE_CATALOGUE,
  generateEmInductionCandidates,
} from "@/lib/bank-pipeline/generators/em-induction";
import { EM_INDUCTION_SCENARIO_KINDS } from "@/lib/visuals/em-induction";

describe("Wave 2 em-induction domain bank & Qwen3.5-9B distillation generator", () => {
  let tempDir: string;
  let fullBank: CandidateQuestionInput[];

  beforeAll(() => {
    resetDomainRegistryToDefaults();
    fullBank = generateEmInductionCandidates();
  });

  beforeEach(() => {
    resetDomainRegistryToDefaults();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sixthphysics-gen-em-"));
  });

  afterEach(() => {
    resetDomainRegistryToDefaults();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("is strictly deterministic for a given seed and validates option bounds", () => {
    const batchA = generateEmInductionCandidates({ count: 32, baseSeed: 777_000 });
    const batchB = generateEmInductionCandidates({ count: 32, baseSeed: 777_000 });
    expect(batchA).toEqual(batchB);

    expect(() => generateEmInductionCandidates({ count: 0 })).toThrow(/count/);
    expect(() => generateEmInductionCandidates({ mcqFraction: 1.5 })).toThrow(
      /mcqFraction/,
    );
  });

  it("generates 320 solver- and gate-verified items across 16 family groups and all 11 visual scenarios with zero rejections", () => {
    const candidates = fullBank;
    expect(candidates).toHaveLength(320);

    const mcqCount = candidates.filter((c) => c.format === "mcq").length;
    const structCount = candidates.filter((c) => c.format === "structured").length;
    expect(mcqCount).toBe(208);
    expect(structCount).toBe(112);
    expect(mcqCount / candidates.length).toBeCloseTo(0.65, 2);

    const familyKeys = new Set(
      candidates.map((c) =>
        buildFamilyGroupKey({
          conceptId: c.conceptId,
          templateArchetype: c.templateArchetype,
          sourceParentId: c.sourceParentId,
        }),
      ),
    );
    expect(familyKeys.size).toBe(16);
    expect(EM_INDUCTION_ARCHETYPE_CATALOGUE).toHaveLength(16);

    const coveredKinds = new Set(
      candidates.map((c) => String(c.scenarioSpec.kind)),
    );
    expect([...coveredKinds].sort()).toEqual(
      [...EM_INDUCTION_SCENARIO_KINDS].sort(),
    );

    // Every pre-solve questionPlan must be completely digit-free to guarantee zero Step-1 numeric leaks
    for (const cand of candidates) {
      expect(cand.questionPlan).toBeDefined();
      expect(/\d/.test(JSON.stringify(cand.questionPlan))).toBe(false);
    }

    const ingestSummary = ingestCandidatesIntoShard({
      shardId: "gen-em-induction-test",
      shardsDir: tempDir,
      candidates,
    });

    const rejected = ingestSummary.results.filter((r) => r.status === "rejected");
    expect(rejected).toEqual([]);
    expect(ingestSummary.rejectedCount).toBe(0);
    expect(ingestSummary.ingestedCount).toBe(320);

    const records = readShardRecords(tempDir, "gen-em-induction-test");
    expect(records).toHaveLength(320);

    for (const rec of records) {
      expect(rec.bankItem.svgMarkup).toBeDefined();
      expect(rec.gateChecksPassed).toContain("solver-verified");
      expect(rec.gateChecksPassed).toContain("svg-sanity-and-non-leakage");
      expect(rec.gateChecksPassed).toContain("givens-complete-and-unleaked");
      expect(rec.gateChecksPassed).toContain(
        "format-ground-truth-and-markscheme-verified",
      );
      expect(rec.gateChecksPassed).toContain("deduplication-passed");

      const traceCheck = validateQwenDistillationTrace(rec.distillationTrace);
      expect(traceCheck).toEqual({ valid: true, issues: [] });
    }
  });

  it("strictly enforces 3-syllabus IB (2025 SL/HL), UK A-Level (Y13), and NCUK IFY exclusion boundaries", () => {
    const candidates = fullBank;

    const capacitorKinds = new Set([
      "parallel-plate-capacitor",
      "capacitor-network",
      "rc-transient",
    ]);
    const inductionOnlyHlKinds = new Set([
      "flux-faraday",
      "motional-emf-rails",
      "ac-generator",
    ]);
    const particleKinds = new Set([
      "electric-deflection",
      "magnetic-cyclotron",
      "velocity-selector",
      "bainbridge-mass-spectrometer",
    ]);

    let sawIbSlParticle = false;
    let sawIbHlParticle = false;
    let sawIbHlInduction = false;
    let sawAlevelY13 = false;
    let sawNcukS2 = false;

    for (const cand of candidates) {
      const kind = String(cand.scenarioSpec.kind);
      const syllabusIds = cand.syllabi.map((s) => s.syllabus);

      // 1. Capacitors NEVER tagged onto IB 2025
      if (capacitorKinds.has(kind)) {
        expect(syllabusIds).not.toContain("ib");
        expect(
          syllabusIds.every((s) => s === "alevel" || s === "ncuk"),
        ).toBe(true);
      }

      // 2. Parallel-plate relative permittivity C = εr ε0 A / d restricted to A-Level Y13
      if (kind === "parallel-plate-capacitor") {
        expect(syllabusIds).toEqual(["alevel"]);
        expect(cand.syllabi[0].level).toBe("Y13");
      }

      // 3. Transformers and AC RMS power NEVER tagged onto IB 2025
      if (
        kind === "transformer" ||
        cand.templateArchetype === "ac-generator-rms-sinusoidal-power"
      ) {
        expect(syllabusIds).not.toContain("ib");
      }

      // 4. Faraday/Lenz, motional EMF, and rotating-coil AC waveforms: IB tags must be strictly HL D.4
      if (inductionOnlyHlKinds.has(kind)) {
        for (const tag of cand.syllabi) {
          if (tag.syllabus === "ib") {
            expect(tag.level).toBe("HL");
            expect(tag.subtopicId).toBe("ib-d4-induction");
            sawIbHlInduction = true;
          }
        }
      }

      // 5. Charged-particle scenarios span IB SL & HL, A-Level Y13, and NCUK IFY-S2
      if (particleKinds.has(kind)) {
        for (const tag of cand.syllabi) {
          if (tag.syllabus === "ib" && tag.level === "SL") sawIbSlParticle = true;
          if (tag.syllabus === "ib" && tag.level === "HL") sawIbHlParticle = true;
        }
      }

      for (const tag of cand.syllabi) {
        if (tag.syllabus === "alevel" && tag.level === "Y13") sawAlevelY13 = true;
        if (tag.syllabus === "ncuk" && tag.level === "IFY-S2") sawNcukS2 = true;
      }
    }

    expect(sawIbSlParticle).toBe(true);
    expect(sawIbHlParticle).toBe(true);
    expect(sawIbHlInduction).toBe(true);
    expect(sawAlevelY13).toBe(true);
    expect(sawNcukS2).toBe(true);
  });

  it("maintains high stem diversity and encodes authentic EM physics misconceptions", () => {
    const candidates = fullBank;

    let maxSimilarity = 0;
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const sim = computeStemSimilarity(candidates[i].stem, candidates[j].stem);
        if (sim > maxSimilarity) {
          maxSimilarity = sim;
        }
      }
    }
    expect(maxSimilarity).toBeLessThan(0.85);

    const allRationales = candidates
      .filter((c) => c.format === "mcq")
      .flatMap((c) =>
        (c.options ?? [])
          .filter((o) => !o.isCorrect)
          .map((o) => o.distractorRationale ?? ""),
      )
      .join(" \n ");

    // Verify all 6 classic EM misconceptions highlighted in the specification
    expect(allRationales).toMatch(/series resistors/i);
    expect(allRationales).toMatch(/one-half/i);
    expect(allRationales).toMatch(/coil normal/i);
    expect(allRationales).toMatch(/√2/i);
    expect(allRationales).toMatch(/Inverts the transformer turns ratio/i);
    expect(allRationales).toMatch(/diameter/i);

    // Spot-check standalone gate evaluation on a structured item
    const firstStruct = candidates.find((c) => c.format === "structured")!;
    const exec = evaluateCandidatePackage(firstStruct);
    expect(exec.evaluation.valid).toBe(true);
    expect(exec.evaluation.issues).toEqual([]);
  });
});
