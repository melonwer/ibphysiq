import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildFamilyGroupKey,
  checkSvgHiddenQuantityLeaks,
  computeStemSimilarity,
  evaluateCandidatePackage,
  ingestCandidatesIntoShard,
  inspectSvgSanity,
  readShardRecords,
  resetDomainRegistryToDefaults,
  validateQwenDistillationTrace,
} from "@/lib/bank-pipeline";
import {
  generateOpticsShmCandidates,
  OPTICS_SHM_FAMILY_SPECS,
} from "@/lib/bank-pipeline/generators/optics-shm";
import { getCrosswalkEntry } from "@/lib/constants/syllabi";

describe("Wave 2 optics-shm question bank & Qwen/Qwen3.5-9B distillation generator", () => {
  beforeEach(() => {
    resetDomainRegistryToDefaults();
  });

  it("defines 16 distinct (conceptId, templateArchetype) family groups across optics and SHM", () => {
    expect(OPTICS_SHM_FAMILY_SPECS).toHaveLength(16);
    const familyKeys = new Set(
      OPTICS_SHM_FAMILY_SPECS.map((f) =>
        buildFamilyGroupKey({
          conceptId: f.conceptId,
          templateArchetype: f.templateArchetype,
        }),
      ),
    );
    expect(familyKeys.size).toBe(16);
  });

  it("generates 336 deterministic, solver-verified items (~65% MCQ / ~35% structured) with zero SVG or Step-1 leaks and strict 3-syllabus exclusions", () => {
    const candidates = generateOpticsShmCandidates();
    expect(candidates.length).toBeGreaterThanOrEqual(300);
    expect(candidates.length).toBeLessThanOrEqual(350);
    expect(candidates).toHaveLength(336);

    // Determinism check on smaller batch
    const replayA = generateOpticsShmCandidates({ count: 32, baseSeed: 700_000 });
    const replayB = generateOpticsShmCandidates({ count: 32, baseSeed: 700_000 });
    expect(replayA).toEqual(replayB);

    const mcqCount = candidates.filter((c) => c.format === "mcq").length;
    const structuredCount = candidates.filter(
      (c) => c.format === "structured",
    ).length;
    expect(mcqCount + structuredCount).toBe(candidates.length);
    const mcqRatio = mcqCount / candidates.length;
    expect(mcqRatio).toBeGreaterThanOrEqual(0.62);
    expect(mcqRatio).toBeLessThanOrEqual(0.68);

    const familyGroups = new Set<string>();
    const seenSyllabi = new Set<string>();
    const seenLevelsBySyllabus: Record<string, Set<string>> = {
      ib: new Set<string>(),
      alevel: new Set<string>(),
      ncuk: new Set<string>(),
    };

    for (const candidate of candidates) {
      expect(candidate.domain).toBe("optics-shm");
      const fgKey = buildFamilyGroupKey({
        conceptId: candidate.conceptId,
        templateArchetype: candidate.templateArchetype,
      });
      familyGroups.add(fgKey);

      const entry = getCrosswalkEntry(candidate.conceptId);
      expect(entry).toBeDefined();

      for (const tag of candidate.syllabi) {
        seenSyllabi.add(tag.syllabus);
        seenLevelsBySyllabus[tag.syllabus].add(tag.level);
        const mapping = entry!.mappings[tag.syllabus];
        expect(mapping.included).toBe(true);
        expect(mapping.levels).toContain(tag.level);
      }

      // 1. Thin lenses MUST NEVER be tagged to IB 2025 or NCUK IFY
      if (
        candidate.conceptId === "thin-lenses-geometric-optics" ||
        candidate.scenarioSpec.kind === "thin-lens"
      ) {
        expect(candidate.syllabi.every((t) => t.syllabus === "alevel")).toBe(
          true,
        );
        expect(candidate.syllabi.some((t) => t.syllabus === "ib")).toBe(false);
        expect(candidate.syllabi.some((t) => t.syllabus === "ncuk")).toBe(
          false,
        );
      }

      // 2. Gravity constant compliance: g = 9.8 on IB vs g = 9.81 on A-Level/NCUK
      if (typeof candidate.scenarioSpec.gravityMs2 === "number") {
        const gVal = candidate.scenarioSpec.gravityMs2;
        if (Math.abs(gVal - 9.8) < 1e-6) {
          expect(candidate.syllabi.every((t) => t.syllabus === "ib")).toBe(
            true,
          );
        } else if (Math.abs(gVal - 9.81) < 1e-6) {
          expect(candidate.syllabi.some((t) => t.syllabus === "ib")).toBe(
            false,
          );
        }
      }

      // 3. SHM equation depth: phase-ellipse v = ±ω√(x₀² - x²) and parabolic E_k/E_p curves are HL-only on IB
      if (
        candidate.templateArchetype === "shm-velocity-displacement-phase-ellipse" ||
        candidate.templateArchetype === "shm-parabolic-energy-exchange-curves"
      ) {
        for (const tag of candidate.syllabi) {
          if (tag.syllabus === "ib") {
            expect(tag.level).toBe("HL");
          }
        }
      }

      // 4. Full gate evaluation + SVG sanity + zero answer leak
      const exec = evaluateCandidatePackage(candidate);
      expect(exec.evaluation.valid).toBe(true);
      expect(exec.evaluation.issues).toEqual([]);
      expect(exec.effectiveSvgMarkup).toBeDefined();

      const sanity = inspectSvgSanity(exec.effectiveSvgMarkup!);
      expect(sanity.valid).toBe(true);

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
        publicNumbers: publicScalarNums,
      });
      expect(leaks).toEqual([]);
    }

    expect(familyGroups.size).toBe(16);
    expect([...seenSyllabi].sort()).toEqual(["alevel", "ib", "ncuk"]);
    expect([...seenLevelsBySyllabus.ib].sort()).toEqual(["HL", "SL"]);
    expect([...seenLevelsBySyllabus.alevel].sort()).toEqual(["Y12", "Y13"]);
    expect(seenLevelsBySyllabus.ncuk.has("IFY")).toBe(true);
  });

  it("ingests all 336 candidates with zero near-duplicate collisions and produces valid Qwen/Qwen3.5-9B distillation traces", () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "sixthphysics-gen-optics-shm-"),
    );
    try {
      const candidates = generateOpticsShmCandidates();

      // Full within-family pairwise shingle similarity check (< 0.72, well below 0.90 threshold)
      for (let f = 0; f < 16; f += 1) {
        for (let i = f; i < candidates.length; i += 16) {
          for (let j = i + 16; j < candidates.length; j += 16) {
            expect(
              computeStemSimilarity(candidates[i].stem, candidates[j].stem),
            ).toBeLessThan(0.72);
          }
        }
      }

      const summary = ingestCandidatesIntoShard({
        shardId: "test-gen-optics-shm",
        shardsDir: tempDir,
        candidates,
      });

      expect(summary.rejectedCount).toBe(0);
      expect(summary.ingestedCount).toBe(336);

      const records = readShardRecords(tempDir, "test-gen-optics-shm");
      expect(records).toHaveLength(336);

      const splitsSeen = new Set<string>();
      for (const record of records) {
        splitsSeen.add(record.distillationTrace.split);
        const traceCheck = validateQwenDistillationTrace(
          record.distillationTrace,
        );
        expect(traceCheck.valid).toBe(true);
        expect(traceCheck.issues).toEqual([]);
      }
      expect([...splitsSeen].sort()).toEqual(["test", "train", "val"]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
