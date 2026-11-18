import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildDistillationTrace,
  buildFamilyGroupKey,
  checkSvgHiddenQuantityLeaks,
  compileBankFromShards,
  computeStemSimilarity,
  evaluateCandidatePackage,
  extractNumbersFromPhysicsText,
  getDomainAdapter,
  inspectSvgSanity,
  numbersAgreeWithinTolerance,
  readShardRecords,
  resetDomainRegistryToDefaults,
  SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
  SixthPhysicsBankItem,
  validateQwenDistillationTrace,
} from "@/lib/bank-pipeline";
import {
  BUILTIN_MECHANICS_SCENARIO_KINDS_USED,
  generateMechanicsCandidates,
  MECHANICS_ARCHETYPE_CATALOGUE,
  MECHANICS_GENERATOR_ARCHETYPES,
} from "@/lib/bank-pipeline/generators/mechanics";

import { runVerifyAndIngestCli } from "../../../scripts/bank-generation/verify-and-ingest-shard";

describe("Wave 2 mechanics domain generator & Qwen/Qwen3.5-9B distillation traces", () => {
  beforeEach(() => {
    resetDomainRegistryToDefaults();
  });

  afterAll(() => {
    resetDomainRegistryToDefaults();
  });

  it("uses exclusively 9caae20 built-in mechanics scenario kinds with zero custom registry preloads", () => {
    const adapter = getDomainAdapter("mechanics");
    const supported = new Set(adapter.supportedScenarioKinds);
    for (const kind of BUILTIN_MECHANICS_SCENARIO_KINDS_USED) {
      expect(supported.has(kind)).toBe(true);
    }

    const sampleBatch = generateMechanicsCandidates({
      count: 32,
      baseSeed: 410_000,
    });
    // Reset registry AFTER generation to prove standalone 9caae20 replay works out-of-the-box
    resetDomainRegistryToDefaults();

    for (const candidate of sampleBatch) {
      expect(supported.has(String(candidate.scenarioSpec.kind))).toBe(true);
      const exec = evaluateCandidatePackage(candidate);
      expect({
        id: candidate.id,
        valid: exec.evaluation.valid,
        issues: exec.evaluation.issues,
      }).toEqual({
        id: candidate.id,
        valid: true,
        issues: [],
      });
    }
  });

  it("generates 336 solver-verified items across 16 archetypes, ~65/35 format split, strict 3-syllabus rules, zero SVG/Step-1 leaks, and low 3-gram similarity", () => {
    const candidates = generateMechanicsCandidates({
      count: 336,
      baseSeed: 410_000,
    });
    resetDomainRegistryToDefaults();

    expect(candidates).toHaveLength(336);
    expect(MECHANICS_GENERATOR_ARCHETYPES).toHaveLength(16);
    expect(MECHANICS_ARCHETYPE_CATALOGUE).toHaveLength(16);

    const familyGroups = new Set(
      candidates.map((c) =>
        buildFamilyGroupKey({
          conceptId: c.conceptId,
          templateArchetype: c.templateArchetype,
        }),
      ),
    );
    expect(familyGroups.size).toBe(16);

    const mcqCount = candidates.filter((c) => c.format === "mcq").length;
    const structuredCount = candidates.filter(
      (c) => c.format === "structured",
    ).length;
    expect(mcqCount).toBe(218);
    expect(structuredCount).toBe(118);
    expect(mcqCount / 336).toBeGreaterThan(0.63);
    expect(mcqCount / 336).toBeLessThan(0.67);

    const seenSyllabi = new Set<string>();
    const seenLevels = new Set<string>();

    for (const candidate of candidates) {
      // 1. Strict g-value separation (IB = 9.8, A-Level & NCUK = 9.81)
      const gSpec = candidate.scenarioSpec.gravityMs2;
      if (gSpec === 9.8) {
        expect(candidate.syllabi.every((s) => s.syllabus === "ib")).toBe(true);
      } else if (gSpec === 9.81) {
        expect(candidate.syllabi.some((s) => s.syllabus === "ib")).toBe(false);
      }

      // 2. Circular-motion archetypes never tagged A-Level Y12
      if (
        candidate.conceptId === "uniform-circular-motion" ||
        candidate.templateArchetype === "accelerometer-plumb-line-and-curve-skid"
      ) {
        for (const tag of candidate.syllabi) {
          if (tag.syllabus === "alevel") {
            expect(tag.level).toBe("Y13");
          }
        }
      }

      // 3. Zero Young modulus / tensile stress-strain prose on IB items
      if (candidate.syllabi.some((s) => s.syllabus === "ib")) {
        expect(/young['’]?s?\s+modulus|tensile\s+stress|tensile\s+strain/i.test(candidate.stem)).toBe(false);
      }

      // 4. Zero digits in pre-solve questionPlan
      expect(/\d/.test(JSON.stringify(candidate.questionPlan ?? {}))).toBe(
        false,
      );

      for (const tag of candidate.syllabi) {
        seenSyllabi.add(tag.syllabus);
        seenLevels.add(`${tag.syllabus}:${tag.level}`);
      }

      // 5. Full deterministic gate + adversarial raw SVG leak scan
      const exec = evaluateCandidatePackage(candidate);
      expect({
        id: candidate.id,
        valid: exec.evaluation.valid,
        issues: exec.evaluation.issues,
      }).toEqual({
        id: candidate.id,
        valid: true,
        issues: [],
      });

      expect(exec.effectiveSvgMarkup).toBeDefined();
      const sanity = inspectSvgSanity(exec.effectiveSvgMarkup!);
      expect(sanity.valid).toBe(true);

      const leaks = checkSvgHiddenQuantityLeaks({
        svgMarkup: exec.effectiveSvgMarkup!,
        hiddenQuantities: candidate.hiddenQuantities,
        verifiedQuantities: exec.solveOutput!.quantities,
        publicNumbers: exec.renderOutput?.publicNumbers ?? [],
        publicLabels: exec.renderOutput?.publicLabels ?? [],
      });
      expect(leaks).toEqual([]);

      // Raw SVG text/desc scan confirming zero coincident hidden answers appear anywhere in SVG
      const rawSvgMentions = extractNumbersFromPhysicsText(
        [...sanity.visibleTexts, ...sanity.accessibleTexts].join(" ; "),
      );
      for (const hKey of candidate.hiddenQuantities) {
        const hVal = exec.solveOutput!.quantities[hKey];
        if (typeof hVal === "number" && Math.abs(hVal) > 1e-12) {
          for (const mention of rawSvgMentions) {
            expect(
              numbersAgreeWithinTolerance(
                Math.abs(mention.rawValue),
                Math.abs(hVal),
                {
                  significantFigures: 3,
                  relativeTolerance: 0.008,
                },
              ),
            ).toBe(false);
          }
        }
      }

      // 6. Full 5-message Qwen/Qwen3.5-9B distillation trace check
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
        visualFamily: exec.renderOutput?.visualFamily ?? "mechanics_scene",
        stem: candidate.stem,
        svgMarkup: exec.effectiveSvgMarkup,
        ...(candidate.format === "mcq" && candidate.options
          ? {
              options: candidate.options as NonNullable<
                SixthPhysicsBankItem["options"]
              >,
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
          domain: "mechanics",
          conceptId: candidate.conceptId,
          templateArchetype: candidate.templateArchetype,
          familyGroupKey,
          seed: candidate.seed,
          shardId: "gen-mechanics",
          generatorModel: "gemini-4-carbon-high",
          solverId: exec.solveOutput!.solverId,
          rendererVersion: exec.renderOutput?.rendererVersion,
          stemFingerprint: exec.evaluation.stemFingerprint,
          svgFingerprint: exec.evaluation.svgFingerprint,
          split: "train",
          createdAt: "2026-11-17T22:30:00.000Z",
        },
      };

      const trace = buildDistillationTrace({
        candidate,
        bankItem,
        split: "train",
        publicVisualLabels: exec.renderOutput?.publicLabels,
      });
      const traceValid = validateQwenDistillationTrace(trace);
      expect({
        id: candidate.id,
        valid: traceValid.valid,
        issues: traceValid.issues,
      }).toEqual({
        id: candidate.id,
        valid: true,
        issues: [],
      });
    }

    // 7. Pairwise 3-gram shingle similarity strictly below 0.90 across all 336 items
    let maxSim = 0;
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const sim = computeStemSimilarity(
          candidates[i].stem,
          candidates[j].stem,
        );
        if (sim > maxSim) maxSim = sim;
      }
    }
    expect(maxSim).toBeLessThan(0.85);

    expect([...seenSyllabi].sort()).toEqual(["alevel", "ib", "ncuk"]);
    expect(seenLevels).toContain("ib:SL");
    expect(seenLevels).toContain("ib:HL");
    expect(seenLevels).toContain("alevel:Y12");
    expect(seenLevels).toContain("alevel:Y13");
    expect(seenLevels).toContain("ncuk:IFY-S1");
  });

  it("ingests via standalone verify-and-ingest-shard CLI and compiles zero-contamination 70/15/15 splits", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "sixthphysics-gen-mechanics-cli-"),
    );
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const jsonPath = path.join(tempDir, "candidates.json");
      const shardsDir = path.join(tempDir, "shards");
      const outDir = path.join(tempDir, "compiled");

      const batch = generateMechanicsCandidates({
        count: 64,
        baseSeed: 520_000,
      });
      fs.writeFileSync(jsonPath, JSON.stringify(batch), "utf8");

      resetDomainRegistryToDefaults();
      const exitCode = runVerifyAndIngestCli([
        "--shard",
        "gen-mechanics-cli",
        "--shards-dir",
        shardsDir,
        "--input",
        jsonPath,
      ]);
      expect(exitCode).toBe(0);

      const records = readShardRecords(shardsDir, "gen-mechanics-cli");
      expect(records).toHaveLength(64);

      const compiled = compileBankFromShards({ shardsDir, outDir });
      expect(compiled.totalCompiledItems).toBe(64);
      expect(compiled.splitSummary.zeroContaminationVerified).toBe(true);
      expect(compiled.deduplication.nearDuplicateIdsSkipped).toEqual([]);
      expect(compiled.splitSummary.itemCounts.train).toBeGreaterThan(0);
      expect(compiled.splitSummary.itemCounts.val).toBeGreaterThan(0);
      expect(compiled.splitSummary.itemCounts.test).toBeGreaterThan(0);
    } finally {
      logSpy.mockRestore();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
