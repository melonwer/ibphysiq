import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { validateQwenDistillationTrace } from "@/lib/bank-pipeline/distillation-trace";
import {
  DEFAULT_GRAV_ASTRO_CANDIDATE_COUNT,
  fmt3sf,
  generateGravAstroCandidates,
  GRAV_ASTRO_ARCHETYPES,
} from "@/lib/bank-pipeline/generators/grav-astro";
import { computeStemSimilarity } from "@/lib/bank-pipeline/numeric-checker";
import {
  compileBankFromShards,
  ingestCandidatesIntoShard,
  readShardRecords,
} from "@/lib/bank-pipeline/shard-store";
import { CandidateQuestionInput } from "@/lib/bank-pipeline/types";
import { GRAV_ASTRO_SCENARIO_KINDS } from "@/lib/visuals/grav-astro";

describe("grav-astro question bank & Qwen3.5-9B distillation generator", () => {
  let fullBatch: CandidateQuestionInput[] = [];

  beforeAll(() => {
    fullBatch = generateGravAstroCandidates();
  });

  it("generates deterministic repeatable batches and validates option bounds", () => {
    const first = generateGravAstroCandidates({ count: 32, seed: 424242 });
    const second = generateGravAstroCandidates({ count: 32, seed: 424242 });
    const differentSeed = generateGravAstroCandidates({ count: 32, seed: 999999 });

    expect(first).toEqual(second);
    expect(first.map((c) => c.stem)).not.toEqual(
      differentSeed.map((c) => c.stem),
    );
    expect(fmt3sf(0, "N")).toBe("0 N");
    expect(() => generateGravAstroCandidates({ count: -1 })).toThrow(
      /Invalid candidate count/,
    );
    expect(() => generateGravAstroCandidates({ mcqFraction: 1.2 })).toThrow(
      /Invalid mcqFraction/,
    );
  });

  it("produces 336 diverse candidates spanning 16 family groups and all 11 visual scenario kinds", () => {
    const candidates = fullBatch;
    expect(candidates).toHaveLength(DEFAULT_GRAV_ASTRO_CANDIDATE_COUNT);

    const mcqCount = candidates.filter((c) => c.format === "mcq").length;
    const structuredCount = candidates.filter(
      (c) => c.format === "structured",
    ).length;
    expect(mcqCount).toBe(218);
    expect(structuredCount).toBe(118);

    const familyKeys = new Set(
      candidates.map((c) => `${c.conceptId}::${c.templateArchetype}`),
    );
    expect(familyKeys.size).toBe(GRAV_ASTRO_ARCHETYPES.length);
    expect(familyKeys.size).toBe(16);

    const coveredKinds = new Set(
      candidates.map((c) => String(c.scenarioSpec.kind)),
    );
    for (const kind of GRAV_ASTRO_SCENARIO_KINDS) {
      expect(coveredKinds.has(kind)).toBe(true);
    }

    let maxPairwiseSim = 0;
    for (let i = 0; i < candidates.length; i += 1) {
      expect(/\d/.test(JSON.stringify(candidates[i].questionPlan))).toBe(false);
      for (let j = i + 1; j < candidates.length; j += 1) {
        const sim = computeStemSimilarity(
          candidates[i].stem,
          candidates[j].stem,
        );
        if (sim > maxPairwiseSim) {
          maxPairwiseSim = sim;
        }
      }
    }
    expect(maxPairwiseSim).toBeLessThan(0.85);
  });

  it("enforces 3-syllabus gravity conventions, HL/Y13 potential gates, and option format boundaries", () => {
    const candidates = fullBatch;

    const syllabiSeen = new Set<string>();
    for (const cand of candidates) {
      expect(cand.syllabi.length).toBeGreaterThan(0);
      for (const tag of cand.syllabi) {
        syllabiSeen.add(`${tag.syllabus}:${tag.level}`);
        if (tag.syllabus === "alevel") {
          expect(tag.level).toBe("Y13");
        }
      }

      // Terrestrial circular-motion g convention: IB uses 9.8, A-Level/NCUK use 9.81
      if (cand.conceptId === "uniform-circular-motion") {
        const gVal = Number(cand.scenarioSpec.gravityMs2);
        const hasIb = cand.syllabi.some((t) => t.syllabus === "ib");
        const hasNonIb = cand.syllabi.some((t) => t.syllabus !== "ib");
        if (hasIb) {
          expect(hasNonIb).toBe(false);
          expect(gVal).toBe(9.8);
        } else {
          expect(hasNonIb).toBe(true);
          expect(gVal).toBe(9.81);
        }
      }

      // Gravitational potential/orbits & cosmology are strictly HL in IB (never SL)
      if (
        cand.conceptId === "gravitational-potential-orbits" ||
        cand.conceptId === "cosmology-hubble-law"
      ) {
        for (const tag of cand.syllabi) {
          if (tag.syllabus === "ib") {
            expect(tag.level).toBe("HL");
          }
        }
      }

      // Cosmic scale factor R/R_0 = 1/(1+z) is strictly IB HL only
      const targetsScaleFactor =
        cand.targetQuantityKey === "scaleFactorRatioEmissionToNow" ||
        (cand.parts?.some(
          (p) => p.targetQuantityKey === "scaleFactorRatioEmissionToNow",
        ) ??
          false);
      if (targetsScaleFactor) {
        expect(cand.syllabi).toHaveLength(1);
        expect(cand.syllabi[0].syllabus).toBe("ib");
        expect(cand.syllabi[0].level).toBe("HL");
      }

      // Interior planetary field g(r) excludes NCUK
      if (cand.scenarioSpec.kind === "planetary-field-potential") {
        const rProbe = Number(cand.scenarioSpec.probeRadiusM);
        const rPlanet = Number(cand.scenarioSpec.planetRadiusM);
        if (rProbe < rPlanet) {
          expect(cand.syllabi.some((t) => t.syllabus === "ncuk")).toBe(false);
        }
      }

      // AQA Option 3.9 Astrophysics is structured-only (never tagged on MCQ)
      if (
        (cand.conceptId === "stellar-radiation-hr-diagram" ||
          cand.conceptId === "cosmology-hubble-law") &&
        cand.format === "mcq"
      ) {
        expect(cand.syllabi.some((t) => t.syllabus === "alevel")).toBe(false);
      }
    }

    expect(syllabiSeen.has("ib:SL")).toBe(true);
    expect(syllabiSeen.has("ib:HL")).toBe(true);
    expect(syllabiSeen.has("alevel:Y13")).toBe(true);
    expect(syllabiSeen.has("ncuk:IFY")).toBe(true);
  });

  it("passes full solver gate, SVG non-leakage, Qwen3.5-9B trace validation, and split compilation across all 16 archetypes", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "grav-astro-shard-test-"),
    );
    try {
      const shardsDir = path.join(tempRoot, "shards");
      const compiledDir = path.join(tempRoot, "compiled");

      // 32 items @ mcqFraction=0.5 exercises all 16 archetypes across MCQ and structured formats
      const slice = generateGravAstroCandidates({
        count: 32,
        seed: 20261117,
        mcqFraction: 0.5,
      });

      const ingest = ingestCandidatesIntoShard({
        shardId: "gen-grav-astro-test",
        shardsDir,
        candidates: slice,
      });
      expect(ingest.rejectedCount).toBe(0);
      expect(ingest.ingestedCount).toBe(32);

      const records = readShardRecords(shardsDir, "gen-grav-astro-test");
      expect(records).toHaveLength(32);
      for (const rec of records) {
        expect(rec.bankItem.svgMarkup).toBeDefined();
        const traceResult = validateQwenDistillationTrace(
          rec.distillationTrace,
        );
        expect(traceResult.valid).toBe(true);
        expect(traceResult.issues).toEqual([]);
      }

      const compiled = compileBankFromShards({
        shardsDir,
        outDir: compiledDir,
      });
      expect(compiled.totalCompiledItems).toBe(32);
      expect(compiled.splitSummary.zeroContaminationVerified).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
