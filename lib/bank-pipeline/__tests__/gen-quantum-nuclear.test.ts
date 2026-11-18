import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildFamilyGroupKey,
  compileBankFromShards,
  computeStemSimilarity,
  ingestCandidatesIntoShard,
  readShardRecords,
  resetDomainRegistryToDefaults,
  validateQwenDistillationTrace,
  verifyCandidateWithGate,
} from "@/lib/bank-pipeline";
import {
  generateQuantumNuclearCandidates,
  QUANTUM_NUCLEAR_ARCHETYPE_MANIFEST,
} from "@/lib/bank-pipeline/generators/quantum-nuclear";
import {
  getCrosswalkEntry,
  getSubtopicById,
  getTopicById,
} from "@/lib/constants/syllabi";
import { QuantumNuclearScenarioKind } from "@/lib/visuals/quantum-nuclear";

const ALL_EIGHT_QUANTUM_NUCLEAR_KINDS: readonly QuantumNuclearScenarioKind[] = [
  "energy-levels",
  "photoelectric-effect",
  "matter-waves",
  "radioactive-decay",
  "nuclear-decay-chain",
  "nuclear-binding",
  "rutherford-scattering",
  "special-relativity",
];

describe("Wave 2 quantum-nuclear domain question bank & Qwen/Qwen3.5-9B distillation generator", () => {
  let tempDir: string;

  beforeEach(() => {
    resetDomainRegistryToDefaults();
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "sixthphysics-gen-quantum-nuclear-"),
    );
  });

  afterEach(() => {
    resetDomainRegistryToDefaults();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("deterministically generates 336 candidates (~65% MCQ / ~35% structured) across all 8 visual families and 16 archetypes", () => {
    const firstRun = generateQuantumNuclearCandidates();
    const secondRun = generateQuantumNuclearCandidates({ count: 336, baseSeed: 820_000 });

    expect(firstRun).toHaveLength(336);
    expect(firstRun).toEqual(secondRun);

    const mcqItems = firstRun.filter((c) => c.format === "mcq");
    const structuredItems = firstRun.filter((c) => c.format === "structured");
    const mcqFraction = mcqItems.length / firstRun.length;

    expect(mcqFraction).toBeGreaterThanOrEqual(0.62);
    expect(mcqFraction).toBeLessThanOrEqual(0.68);
    expect(structuredItems.length).toBeGreaterThanOrEqual(110);

    // Every item belongs to quantum-nuclear domain with unique ID
    const ids = new Set(firstRun.map((c) => c.id));
    expect(ids.size).toBe(firstRun.length);
    expect(firstRun.every((c) => c.domain === "quantum-nuclear")).toBe(true);

    // Covers all 8 lib/visuals/quantum-nuclear scenario kinds
    const observedKinds = new Set(
      firstRun.map((c) => String(c.scenarioSpec.kind)),
    );
    expect([...observedKinds].sort()).toEqual(
      [...ALL_EIGHT_QUANTUM_NUCLEAR_KINDS].sort(),
    );

    // Spans 16 distinct (conceptId, templateArchetype) family groups (within 14-16 spec)
    const familyGroupKeys = new Set(
      firstRun.map((c) =>
        buildFamilyGroupKey({
          conceptId: c.conceptId,
          templateArchetype: c.templateArchetype,
          sourceParentId: c.sourceParentId,
        }),
      ),
    );
    expect(familyGroupKeys.size).toBe(16);
    expect(QUANTUM_NUCLEAR_ARCHETYPE_MANIFEST).toHaveLength(16);
  });

  it("strictly enforces IB SL/HL, UK A-Level Y12/Y13, and NCUK IFY-S2 syllabus boundaries and exclusions", () => {
    const candidates = generateQuantumNuclearCandidates();

    const ibLevels = new Set<string>();
    const alevelLevels = new Set<string>();
    const ncukLevels = new Set<string>();

    for (const candidate of candidates) {
      const entry = getCrosswalkEntry(candidate.conceptId);
      expect(entry).toBeDefined();
      expect(candidate.syllabi.length).toBeGreaterThanOrEqual(1);

      for (const tag of candidate.syllabi) {
        if (tag.syllabus === "ib") ibLevels.add(tag.level);
        if (tag.syllabus === "alevel") alevelLevels.add(tag.level);
        if (tag.syllabus === "ncuk") ncukLevels.add(tag.level);

        const mapping = entry!.mappings[tag.syllabus];
        expect(mapping.included).toBe(true);
        expect(mapping.levels).toContain(tag.level);
        expect(mapping.questionFormats).toContain(candidate.format);
        expect(mapping.topicIds).toContain(tag.topicId);

        const topic = getTopicById(tag.topicId);
        expect(topic).toBeDefined();
        expect(topic!.syllabus).toBe(tag.syllabus);

        expect(tag.subtopicId).toBeDefined();
        const subtopic = getSubtopicById(tag.subtopicId!);
        expect(subtopic).toBeDefined();
        expect(subtopic!.levelsCovered).toContain(tag.level);
        expect(subtopic!.questionFormats).toContain(candidate.format);
      }

      const kind = String(candidate.scenarioSpec.kind);

      // 1. Photoelectric effect & matter waves: IB HL only (never IB SL), A-Level Y12, NCUK IFY-S2
      if (kind === "photoelectric-effect" || kind === "matter-waves") {
        const ibTag = candidate.syllabi.find((s) => s.syllabus === "ib");
        expect(ibTag?.level).toBe("HL");
        expect(
          candidate.syllabi.some(
            (s) => s.syllabus === "ib" && s.level === "SL",
          ),
        ).toBe(false);
        expect(
          candidate.syllabi.find((s) => s.syllabus === "alevel")?.level,
        ).toBe("Y12");
        expect(
          candidate.syllabi.find((s) => s.syllabus === "ncuk")?.level,
        ).toBe("IFY-S2");
      }

      // 2. Special relativity: NEVER tagged onto IB SL or NCUK!
      if (
        kind === "special-relativity" ||
        candidate.conceptId === "special-relativity-spacetime"
      ) {
        expect(
          candidate.syllabi.some(
            (s) => s.syllabus === "ib" && s.level === "SL",
          ),
        ).toBe(false);
        expect(candidate.syllabi.some((s) => s.syllabus === "ncuk")).toBe(
          false,
        );
        expect(
          candidate.syllabi.find((s) => s.syllabus === "ib")?.level,
        ).toBe("HL");

        if (
          candidate.templateArchetype ===
          "minkowski-worldline-velocity-addition"
        ) {
          // Minkowski diagrams & relativistic velocity addition are IB HL A.5 exclusive
          expect(candidate.syllabi.some((s) => s.syllabus === "alevel")).toBe(
            false,
          );
        }
        if (candidate.format === "mcq") {
          // AQA Option 3.12 Turning Points Paper 3B is structured only
          expect(candidate.syllabi.some((s) => s.syllabus === "alevel")).toBe(
            false,
          );
        }
      }

      // 3. Quark-level particle physics: NEVER tagged onto IB 2025!
      if (candidate.conceptId === "fundamental-particles-quarks-leptons") {
        expect(candidate.syllabi.some((s) => s.syllabus === "ib")).toBe(false);
      }

      // 4. Continuous exponential decay e^(-lambda t) & A = lambda N: IB HL only (never IB SL)
      if (
        candidate.templateArchetype ===
        "exponential-isotope-activity-time-conversion"
      ) {
        expect(
          candidate.syllabi.some(
            (s) => s.syllabus === "ib" && s.level === "SL",
          ),
        ).toBe(false);
        expect(
          candidate.syllabi.find((s) => s.syllabus === "ib")?.level,
        ).toBe("HL");
      }

      // 5. Quantitative Rutherford closest approach & nuclear radius: IB HL only (never IB SL)
      if (kind === "rutherford-scattering") {
        expect(
          candidate.syllabi.some(
            (s) => s.syllabus === "ib" && s.level === "SL",
          ),
        ).toBe(false);
        expect(
          candidate.syllabi.find((s) => s.syllabus === "ib")?.level,
        ).toBe("HL");
      }
    }

    expect([...ibLevels].sort()).toEqual(["HL", "SL"]);
    expect([...alevelLevels].sort()).toEqual(["Y12", "Y13"]);
    expect([...ncukLevels].sort()).toEqual(["IFY-S2"]);
  });

  it("ingests all 336 candidates with 0 rejections, 0 SVG/Step-1 leaks, 0 near-duplicates, and clean 70/15/15 compilation", () => {
    const candidates = generateQuantumNuclearCandidates();
    const shardsDir = path.join(tempDir, "shards");
    const compiledDir = path.join(tempDir, "compiled");

    const ingestSummary = ingestCandidatesIntoShard({
      shardId: "gen-quantum-nuclear",
      shardsDir,
      candidates,
    });

    expect(ingestSummary.totalCandidates).toBe(336);
    expect(ingestSummary.rejectedCount).toBe(0);
    expect(ingestSummary.ingestedCount).toBe(336);

    const records = readShardRecords(shardsDir, "gen-quantum-nuclear");
    expect(records).toHaveLength(336);

    const optionSlotCounts = [0, 0, 0, 0];
    for (const rec of records) {
      expect(rec.bankItem.svgMarkup).toBeDefined();
      expect(rec.gateChecksPassed).toContain("svg-sanity-and-non-leakage");
      expect(rec.gateChecksPassed).toContain("givens-complete-and-unleaked");
      expect(rec.gateChecksPassed).toContain(
        "format-ground-truth-and-markscheme-verified",
      );
      expect(rec.gateChecksPassed).toContain("deduplication-passed");

      const traceCheck = validateQwenDistillationTrace(rec.distillationTrace);
      expect(traceCheck).toEqual({ valid: true, issues: [] });

      if (rec.bankItem.format === "mcq") {
        expect(rec.bankItem.correctOptionIndex).toBeDefined();
        optionSlotCounts[rec.bankItem.correctOptionIndex!] += 1;
      }
    }

    // Verify balanced A/B/C/D correct-option distribution
    for (const slotCount of optionSlotCounts) {
      expect(slotCount).toBeGreaterThanOrEqual(30);
    }

    // Verify pairwise 3-gram shingle similarity stays strictly below 0.90 across all 336 items
    for (let i = 0; i < records.length; i += 1) {
      for (let j = i + 1; j < records.length; j += 1) {
        const sim = computeStemSimilarity(
          records[i].bankItem.stem,
          records[j].bankItem.stem,
        );
        expect(sim).toBeLessThan(0.9);
      }
    }

    const compiledSummary = compileBankFromShards({
      shardsDir,
      outDir: compiledDir,
    });
    expect(compiledSummary.totalCompiledItems).toBe(336);
    expect(compiledSummary.deduplication.duplicateIdsSkipped).toEqual([]);
    expect(compiledSummary.deduplication.nearDuplicateIdsSkipped).toEqual([]);
    expect(compiledSummary.splitSummary.zeroContaminationVerified).toBe(true);
  });

  it("supports custom count and mcqRatio overrides cleanly", () => {
    const subset = generateQuantumNuclearCandidates({
      count: 32,
      baseSeed: 910_000,
      mcqRatio: 0.5,
    });
    expect(subset).toHaveLength(32);
    expect(subset.filter((c) => c.format === "mcq")).toHaveLength(16);
    expect(subset.filter((c) => c.format === "structured")).toHaveLength(16);

    for (const item of subset) {
      const gate = verifyCandidateWithGate(item);
      expect(gate.evaluation.valid).toBe(true);
    }
  });
});
