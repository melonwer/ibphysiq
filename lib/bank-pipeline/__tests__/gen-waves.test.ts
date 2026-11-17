import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CandidateQuestionInput,
  checkSvgHiddenQuantityLeaks,
  compileBankFromShards,
  computeShingleSet,
  ingestCandidatesIntoShard,
  inspectSvgSanity,
  readShardRecords,
  resetDomainRegistryToDefaults,
  validateQwenDistillationTrace,
  verifyCandidateWithGate,
} from "@/lib/bank-pipeline";
import {
  generateWavesCandidates,
  resolveWavesSyllabiTags,
  WAVES_ARCHETYPE_CATALOGUE,
  WAVES_TEMPLATE_ARCHETYPES,
} from "@/lib/bank-pipeline/generators/waves";
import { WAVES_SCENARIO_KINDS } from "@/lib/visuals/waves";

describe("Wave 2 waves domain generator & Qwen3.5-9B distillation traces", () => {
  let tempDir: string;
  let defaultCandidates: CandidateQuestionInput[];

  beforeAll(() => {
    resetDomainRegistryToDefaults();
    defaultCandidates = generateWavesCandidates();
  });

  beforeEach(() => {
    resetDomainRegistryToDefaults();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sixthphysics-gen-waves-"));
  });

  afterEach(() => {
    resetDomainRegistryToDefaults();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("generates 327 deterministic candidates (~65% MCQ, ~35% structured) across 16 archetypes and all 7 scenario families", () => {
    const batchA = defaultCandidates;
    const batchB = generateWavesCandidates();

    expect(batchA).toEqual(batchB);
    expect(batchA.length).toBeGreaterThanOrEqual(300);
    expect(batchA.length).toBeLessThanOrEqual(350);
    expect(batchA).toHaveLength(327);

    const mcqItems = batchA.filter((c) => c.format === "mcq");
    const structuredItems = batchA.filter((c) => c.format === "structured");
    const mcqRatio = mcqItems.length / batchA.length;

    expect(mcqRatio).toBeGreaterThan(0.62);
    expect(mcqRatio).toBeLessThan(0.68);
    expect(structuredItems.length).toBeGreaterThanOrEqual(105);

    const familyGroups = new Set(
      batchA.map((c) => `${c.conceptId}::${c.templateArchetype}`),
    );
    expect(familyGroups.size).toBe(16);

    const coveredArchetypes = new Set(batchA.map((c) => c.templateArchetype));
    expect([...coveredArchetypes].sort()).toEqual(
      [...WAVES_TEMPLATE_ARCHETYPES].sort(),
    );

    const coveredKinds = new Set(
      batchA.map((c) => String(c.scenarioSpec.kind)),
    );
    expect([...coveredKinds].sort()).toEqual([...WAVES_SCENARIO_KINDS].sort());

    // Verify both forward and inverse target quantities are covered across families
    const mcqTargets = [...new Set(mcqItems.map((c) => c.targetQuantityKey))];
    expect(mcqTargets).toEqual(
      expect.arrayContaining([
        "waveSpeedMs",
        "frequencyHz",
        "wavelengthM",
        "phaseDifferenceRad",
        "harmonicFrequencyHz",
        "adjacentNodeSpacingM",
        "tensionN",
        "lengthM",
        "fringeSpacingM",
        "nthBrightPositionM",
        "slitSeparationM",
        "centralEnvelopeFullWidthM",
        "firstMissingOrder",
        "slitWidthM",
        "queryAngleDegrees",
        "maxOrder",
        "totalPrincipalMaxima",
        "centralFullWidthM",
        "observedFrequencyHz",
        "sourceSpeedMs",
        "observerSpeedMs",
        "transmittedIntensityWm2",
        "analyzerAngleDegrees",
        "incidentIntensityWm2",
      ]),
    );
  });

  it("enforces strict 3-syllabus level, booklet, and topic exclusion boundaries across IB, UK A-Level, and NCUK IFY", () => {
    const candidates = defaultCandidates;

    const seenSyllabusLevels = new Set<string>();
    for (const cand of candidates) {
      for (const s of cand.syllabi) {
        seenSyllabusLevels.add(`${s.syllabus}:${s.level}`);
      }

      const kind = String(cand.scenarioSpec.kind);
      const ibTags = cand.syllabi.filter((s) => s.syllabus === "ib");
      const alevelTags = cand.syllabi.filter((s) => s.syllabus === "alevel");
      const ncukTags = cand.syllabi.filter((s) => s.syllabus === "ncuk");

      // 1. Quantitative single-slit diffraction (θ = λ/b, w = 2λD/b) -> IB HL only
      if (kind === "single-slit") {
        expect(ibTags.every((t) => t.level === "HL")).toBe(true);
        expect(ibTags.length).toBeGreaterThan(0);
        expect(alevelTags).toHaveLength(0);
        expect(ncukTags).toHaveLength(0);
      }

      // 2. Double-slit finite-slit diffraction envelope -> IB HL only
      if (
        cand.templateArchetype === "double-slit-envelope-missing-orders"
      ) {
        expect(ibTags.every((t) => t.level === "HL")).toBe(true);
        expect(alevelTags).toHaveLength(0);
        expect(ncukTags).toHaveLength(0);
      }

      // 3. Double-slit stems spell out "slit separation" or "fringe spacing"
      if (kind === "double-slit") {
        expect(
          /slit separation|fringe spacing/i.test(cand.stem),
        ).toBe(true);
      }

      // 4. Diffraction gratings -> never IB SL
      if (kind === "diffraction-grating") {
        expect(ibTags.some((t) => t.level === "SL")).toBe(false);
      }

      // 5. Exact moving-source & moving-observer acoustic Doppler -> IB HL only
      if (kind === "doppler-effect") {
        expect(ibTags).toHaveLength(1);
        expect(ibTags[0].level).toBe("HL");
        expect(alevelTags).toHaveLength(0);
        expect(ncukTags).toHaveLength(0);
      }

      // 6. Quantitative Malus polarization -> never IB 2025; unpolarized chains hide I_1 in MCQs
      if (kind === "malus-polarization") {
        expect(ibTags).toHaveLength(0);
        if (
          cand.scenarioSpec.incidentPolarization === "unpolarized" &&
          cand.format === "mcq"
        ) {
          expect(cand.hiddenQuantities).toContain(
            "intensityBeforeAnalyzerWm2",
          );
        }
      }

      // 7. Stretched-string tension/density -> never IB SL; IB/NCUK only when v = √(T/μ) supplied
      if (
        cand.templateArchetype === "standing-string-tension-linear-density"
      ) {
        expect(ibTags.some((t) => t.level === "SL")).toBe(false);
        if (ibTags.length > 0 || ncukTags.length > 0) {
          expect(cand.stem).toContain("√(T / μ)");
        }
      }
    }

    expect([...seenSyllabusLevels].sort()).toEqual(
      [
        "alevel:Y12",
        "alevel:Y13",
        "ib:HL",
        "ib:SL",
        "ncuk:IFY",
      ].sort(),
    );
  });

  it("ingests 100% of generated candidates with zero gate rejections, zero SVG/Step-1 leaks, and zero split contamination", () => {
    const candidates = defaultCandidates;
    const shardsDir = path.join(tempDir, "shards");
    const compiledDir = path.join(tempDir, "compiled");

    const ingestSummary = ingestCandidatesIntoShard({
      shardId: "gen-waves-test",
      shardsDir,
      candidates,
    });

    expect(ingestSummary.rejectedCount).toBe(0);
    expect(ingestSummary.ingestedCount).toBe(candidates.length);

    const records = readShardRecords(shardsDir, "gen-waves-test");
    expect(records).toHaveLength(candidates.length);

    for (let i = 0; i < records.length; i += 1) {
      const rec = records[i];
      const cand = candidates[i];

      expect(rec.bankItem.svgMarkup).toBeDefined();
      const sanity = inspectSvgSanity(rec.bankItem.svgMarkup!);
      expect(sanity.valid).toBe(true);

      const publicNums = Object.entries(cand.scenarioSpec)
        .filter(
          ([k, v]) =>
            !cand.hiddenQuantities.includes(k) &&
            typeof v === "number" &&
            Number.isFinite(v),
        )
        .map(([, v]) => v as number);

      const leaks = checkSvgHiddenQuantityLeaks({
        svgMarkup: rec.bankItem.svgMarkup!,
        hiddenQuantities: cand.hiddenQuantities,
        verifiedQuantities: rec.bankItem.verifiedQuantities,
        publicNumbers: publicNums,
      });
      expect(leaks).toEqual([]);

      const traceCheck = validateQwenDistillationTrace(rec.distillationTrace);
      expect(traceCheck).toEqual({ valid: true, issues: [] });
    }

    // Exhaustively check stem diversity across all 53,301 pairs
    const shingleSets = records.map((r) => computeShingleSet(r.bankItem.stem));
    let maxObservedSim = 0;
    for (let i = 0; i < shingleSets.length; i += 1) {
      const setA = shingleSets[i];
      for (let j = i + 1; j < shingleSets.length; j += 1) {
        const setB = shingleSets[j];
        let intersection = 0;
        for (const tok of setA) {
          if (setB.has(tok)) intersection += 1;
        }
        const union = setA.size + setB.size - intersection;
        const sim = union === 0 ? 0 : intersection / union;
        if (sim > maxObservedSim) {
          maxObservedSim = sim;
        }
      }
    }
    expect(maxObservedSim).toBeLessThan(0.88);

    // Compile bank and verify zero family-group contamination across train/val/test
    const compiled = compileBankFromShards({
      shardsDir,
      outDir: compiledDir,
    });
    expect(compiled.totalCompiledItems).toBe(candidates.length);
    expect(compiled.splitSummary.zeroContaminationVerified).toBe(true);
    expect(compiled.attemptMetrics.totalRejectedInAttempts).toBe(0);
  });

  it("supports custom count, mcqFraction, archetype subsets, and option validation", () => {
    const subset = generateWavesCandidates({
      count: 20,
      seed: 999,
      mcqFraction: 0.6,
      archetypes: [
        "standing-closed-pipe-odd-harmonics",
        "malus-unpolarized-two-filter-chain",
      ],
    });
    expect(subset).toHaveLength(20);
    expect(subset.filter((c) => c.format === "mcq")).toHaveLength(12);
    expect(subset.filter((c) => c.format === "structured")).toHaveLength(8);
    for (const item of subset) {
      expect(verifyCandidateWithGate(item).evaluation.valid).toBe(true);
    }

    expect(WAVES_ARCHETYPE_CATALOGUE).toHaveLength(16);
    expect(
      resolveWavesSyllabiTags(
        "single-slit-diffraction-gratings",
        "mcq",
        "hl-alevel-ncuk",
        0,
      ).map((t) => `${t.syllabus}:${t.level}`),
    ).toEqual(["ib:HL", "alevel:Y12", "ncuk:IFY"]);

    expect(() => generateWavesCandidates({ count: -1 })).toThrow();
    expect(() => generateWavesCandidates({ mcqFraction: 1.5 })).toThrow();
    expect(() => generateWavesCandidates({ seed: 1.25 })).toThrow();
  });
});
