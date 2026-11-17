import {
  assignSplit,
  buildFamilyGroupKey,
  createFrozenEvaluationManifest,
  hashFamilyGroupToUnitInterval,
  parseFrozenManifest,
  serializeFrozenManifest,
  SplitAuditRecord,
  verifyZeroSplitContamination,
} from "@/lib/bank-pipeline/split-assigner";
import { DatasetSplit } from "@/lib/bank-pipeline/types";

describe("split-assigner", () => {
  it("builds normalized familyGroupKeys and prioritizes sourceParentId when present", () => {
    expect(
      buildFamilyGroupKey({
        conceptId: "Kinematics Motion",
        templateArchetype: "VT Trapezoid",
      }),
    ).toBe("kinematics-motion::vt-trapezoid");

    expect(
      buildFamilyGroupKey({
        conceptId: "kinematics",
        templateArchetype: "variant-a",
        sourceParentId: "IB-2023-P1-Q04",
      }),
    ).toBe("source::ib-2023-p1-q04");

    expect(() =>
      buildFamilyGroupKey({ conceptId: "", templateArchetype: "arch" }),
    ).toThrow(/must not be empty/);
    expect(() =>
      buildFamilyGroupKey({ conceptId: "bad::slug", templateArchetype: "arch" }),
    ).toThrow(/delimiter/);
  });

  it("keeps 100 parametric variants of an archetype in one deterministic split", () => {
    const familyGroupKey = buildFamilyGroupKey({
      conceptId: "dc-circuits",
      templateArchetype: "series-parallel-heater",
    });

    const assignedSplits = new Set<DatasetSplit>();
    for (let seed = 1; seed <= 100; seed += 1) {
      assignedSplits.add(assignSplit(familyGroupKey));
    }
    expect(assignedSplits.size).toBe(1);

    const u1 = hashFamilyGroupToUnitInterval(familyGroupKey);
    const u2 = hashFamilyGroupToUnitInterval(familyGroupKey);
    expect(u1).toBe(u2);
    expect(u1).toBeGreaterThanOrEqual(0);
    expect(u1).toBeLessThan(1);
  });

  it("converges closely to 70/15/15 across 1,200 independent family archetypes", () => {
    const counts: Record<DatasetSplit, number> = { train: 0, val: 0, test: 0 };
    const total = 1200;
    for (let i = 0; i < total; i += 1) {
      const key = `concept-${i % 30}::archetype-${i}`;
      counts[assignSplit(key)] += 1;
    }

    expect(counts.train / total).toBeGreaterThan(0.65);
    expect(counts.train / total).toBeLessThan(0.75);
    expect(counts.val / total).toBeGreaterThan(0.11);
    expect(counts.val / total).toBeLessThan(0.19);
    expect(counts.test / total).toBeGreaterThan(0.11);
    expect(counts.test / total).toBeLessThan(0.19);
  });

  it("detects familyGroupKey, sourceParentId, and stemFingerprint cross-split contamination", () => {
    const cleanRecords: SplitAuditRecord[] = [
      {
        id: "q1",
        familyGroupKey: "waves::double-slit",
        split: "train",
        stemFingerprint: "fp-1",
      },
      {
        id: "q2",
        familyGroupKey: "waves::double-slit",
        split: "train",
        stemFingerprint: "fp-2",
      },
      {
        id: "q3",
        familyGroupKey: "thermal::carnot-cycle",
        split: "test",
        stemFingerprint: "fp-3",
      },
    ];
    expect(verifyZeroSplitContamination(cleanRecords).valid).toBe(true);

    const leakedFamily: SplitAuditRecord[] = [
      ...cleanRecords,
      {
        id: "q4",
        familyGroupKey: "waves::double-slit",
        split: "test",
        stemFingerprint: "fp-4",
      },
    ];
    const familyReport = verifyZeroSplitContamination(leakedFamily);
    expect(familyReport.valid).toBe(false);
    expect(
      familyReport.violations.some(
        (v) => v.kind === "family-group-cross-split",
      ),
    ).toBe(true);

    const leakedSource: SplitAuditRecord[] = [
      {
        id: "s1",
        familyGroupKey: "c1::a1",
        split: "train",
        sourceParentId: "parent-99",
      },
      {
        id: "s2",
        familyGroupKey: "c2::a2",
        split: "val",
        sourceParentId: "parent-99",
      },
    ];
    const sourceReport = verifyZeroSplitContamination(leakedSource);
    expect(sourceReport.valid).toBe(false);
    expect(
      sourceReport.violations.some(
        (v) => v.kind === "source-parent-cross-split",
      ),
    ).toBe(true);

    const leakedStem: SplitAuditRecord[] = [
      {
        id: "d1",
        familyGroupKey: "c1::a1",
        split: "train",
        stemFingerprint: "same-hash",
      },
      {
        id: "d2",
        familyGroupKey: "c2::a2",
        split: "val",
        stemFingerprint: "same-hash",
      },
    ];
    const stemReport = verifyZeroSplitContamination(leakedStem);
    expect(stemReport.valid).toBe(false);
    expect(
      stemReport.violations.some(
        (v) => v.kind === "stem-fingerprint-cross-split",
      ),
    ).toBe(true);
  });

  it("creates, serializes, verifies checksums, and enforces frozen evaluation manifests", () => {
    const records: SplitAuditRecord[] = [];
    for (let i = 0; i < 40; i += 1) {
      const key = `mechanics::arch-${i}`;
      records.push({
        id: `item-${i}`,
        familyGroupKey: key,
        split: assignSplit(key),
      });
    }

    const manifest = createFrozenEvaluationManifest(records, {
      createdAt: "2026-11-17T19:00:00.000Z",
    });
    const text = serializeFrozenManifest(manifest);
    const parsed = parseFrozenManifest(text);
    expect(parsed.manifestSha256).toBe(manifest.manifestSha256);

    // Tampering with frozenGroups invalidates SHA-256 checksum
    const tampered = {
      ...parsed,
      heldOutItemIds: {
        ...parsed.heldOutItemIds,
        test: [...parsed.heldOutItemIds.test, "injected-item"],
      },
    };
    expect(() => serializeFrozenManifest(tampered)).toThrow(/checksum mismatch/);

    // Moving a frozen test item into train is flagged by verifyZeroSplitContamination
    const heldOutTestId = parsed.heldOutItemIds.test[0];
    if (heldOutTestId) {
      const mutated = records.map((r) =>
        r.id === heldOutTestId ? { ...r, split: "train" as const } : r,
      );
      const report = verifyZeroSplitContamination(mutated, parsed);
      expect(report.valid).toBe(false);
      expect(
        report.violations.some(
          (v) =>
            v.kind === "frozen-item-mismatch" ||
            v.kind === "frozen-group-mismatch",
        ),
      ).toBe(true);
    }
  });
});
