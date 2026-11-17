import crypto from "node:crypto";

import {
  DATASET_SPLITS,
  DatasetSplit,
  FROZEN_EVAL_MANIFEST_SCHEMA_VERSION,
  FrozenEvaluationManifest,
  SplitRatios,
} from "./types";

export const DEFAULT_SPLIT_SALT = "sixthphysics-qwen3.5-9b-split-v1" as const;

export const DEFAULT_SPLIT_RATIOS: Readonly<SplitRatios> = {
  train: 0.7,
  val: 0.15,
  test: 0.15,
};

export interface FamilyGroupKeyInput {
  conceptId: string;
  templateArchetype: string;
  sourceParentId?: string;
}

export interface SplitAssignOptions {
  salt?: string;
  ratios?: SplitRatios;
  frozenManifest?: FrozenEvaluationManifest;
}

export interface SplitAuditRecord {
  id: string;
  familyGroupKey: string;
  split: DatasetSplit;
  sourceParentId?: string;
  stemFingerprint?: string;
}

export interface ContaminationViolation {
  kind:
    | "family-group-cross-split"
    | "source-parent-cross-split"
    | "stem-fingerprint-cross-split"
    | "frozen-group-mismatch"
    | "frozen-item-mismatch";
  key: string;
  splits: DatasetSplit[];
  itemIds: string[];
  message: string;
}

export interface SplitContaminationReport {
  valid: boolean;
  groupCounts: Record<DatasetSplit, number>;
  itemCounts: Record<DatasetSplit, number>;
  itemRatios: Record<DatasetSplit, number>;
  violations: ContaminationViolation[];
}

function normalizeSegment(label: string, raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    throw new Error(`${label} must not be empty`);
  }
  if (trimmed.includes("::")) {
    throw new Error(`${label} must not contain "::" delimiter: "${raw}"`);
  }
  return trimmed.replace(/\s+/g, "-");
}

/**
 * Builds the canonical contamination-control key `${conceptId}::${templateArchetype}`
 * (or `source::${sourceParentId}` when derived from an existing parent item) so all
 * parametric variants of an archetype or source parent stay in one split.
 */
export function buildFamilyGroupKey(input: FamilyGroupKeyInput): string {
  const concept = normalizeSegment("conceptId", input.conceptId);
  const archetype = normalizeSegment(
    "templateArchetype",
    input.templateArchetype,
  );
  if (input.sourceParentId !== undefined && input.sourceParentId.trim() !== "") {
    const parent = normalizeSegment("sourceParentId", input.sourceParentId);
    return `source::${parent}`;
  }
  return `${concept}::${archetype}`;
}

export function validateSplitRatios(ratios: SplitRatios): void {
  for (const split of DATASET_SPLITS) {
    const value = ratios[split];
    if (!Number.isFinite(value) || value <= 0 || value >= 1) {
      throw new Error(
        `Split ratio for ${split} must be strictly between 0 and 1; received ${String(value)}`,
      );
    }
  }
  const sum = ratios.train + ratios.val + ratios.test;
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(
      `Split ratios must sum to 1.0; received ${sum.toFixed(12)}`,
    );
  }
}

/**
 * Cryptographically hashes `(salt, familyGroupKey)` into a uniform float in [0, 1)
 * using 48 bits of SHA-256 output (zero modulo bias, platform-independent).
 */
export function hashFamilyGroupToUnitInterval(
  familyGroupKey: string,
  salt: string = DEFAULT_SPLIT_SALT,
): number {
  const normalizedKey = familyGroupKey.trim();
  if (!normalizedKey || !normalizedKey.includes("::")) {
    throw new Error(
      `familyGroupKey must have "<namespace>::<archetype>" structure; received "${familyGroupKey}"`,
    );
  }
  if (!salt.trim()) {
    throw new Error("Split salt must not be empty");
  }
  const digest = crypto
    .createHash("sha256")
    .update(`${salt}::${normalizedKey}`, "utf8")
    .digest();
  const uint48 = digest.readUIntBE(0, 6);
  return uint48 / 281_474_976_710_656; // 2^48
}

/**
 * Deterministically assigns `train` (70%), `val` (15%), or `test` (15%) strictly
 * from `familyGroupKey`, respecting any frozen held-out evaluation manifest.
 */
export function assignSplit(
  familyGroupKey: string,
  options: SplitAssignOptions = {},
): DatasetSplit {
  const normalizedKey = familyGroupKey.trim();
  if (!normalizedKey || !normalizedKey.includes("::")) {
    throw new Error(
      `familyGroupKey must have "<conceptId>::<templateArchetype>" structure; received "${familyGroupKey}"`,
    );
  }

  if (options.frozenManifest) {
    verifyFrozenManifestChecksum(options.frozenManifest);
    const frozen = options.frozenManifest.frozenGroups[normalizedKey];
    if (frozen !== undefined) {
      return frozen;
    }
  }

  const salt = options.salt ?? options.frozenManifest?.salt ?? DEFAULT_SPLIT_SALT;
  const ratios =
    options.ratios ?? options.frozenManifest?.ratios ?? DEFAULT_SPLIT_RATIOS;
  validateSplitRatios(ratios);

  const u = hashFamilyGroupToUnitInterval(normalizedKey, salt);
  if (u < ratios.train) {
    return "train";
  }
  if (u < ratios.train + ratios.val) {
    return "val";
  }
  return "test";
}

function canonicalFrozenPayloadString(
  payload: Omit<FrozenEvaluationManifest, "manifestSha256">,
): string {
  const sortedGroups: Record<string, DatasetSplit> = {};
  for (const key of Object.keys(payload.frozenGroups).sort()) {
    sortedGroups[key] = payload.frozenGroups[key];
  }
  const canonical = {
    schemaVersion: payload.schemaVersion,
    createdAt: payload.createdAt,
    salt: payload.salt,
    ratios: {
      train: payload.ratios.train,
      val: payload.ratios.val,
      test: payload.ratios.test,
    },
    lockHeldOut: payload.lockHeldOut,
    frozenGroups: sortedGroups,
    heldOutItemIds: {
      val: [...new Set(payload.heldOutItemIds.val)].sort(),
      test: [...new Set(payload.heldOutItemIds.test)].sort(),
    },
  };
  return JSON.stringify(canonical);
}

export function computeFrozenManifestSha256(
  payload: Omit<FrozenEvaluationManifest, "manifestSha256">,
): string {
  return crypto
    .createHash("sha256")
    .update(canonicalFrozenPayloadString(payload), "utf8")
    .digest("hex");
}

export function verifyFrozenManifestChecksum(
  manifest: FrozenEvaluationManifest,
): void {
  if (manifest.schemaVersion !== FROZEN_EVAL_MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported frozen manifest schemaVersion: ${String(manifest.schemaVersion)}`,
    );
  }
  validateSplitRatios(manifest.ratios);
  const expected = computeFrozenManifestSha256(manifest);
  if (expected !== manifest.manifestSha256) {
    throw new Error(
      `Frozen evaluation manifest checksum mismatch: expected ${expected}, received ${manifest.manifestSha256}`,
    );
  }
}

export function createFrozenEvaluationManifest(
  records: readonly SplitAuditRecord[],
  options: {
    salt?: string;
    ratios?: SplitRatios;
    createdAt?: string;
    freezeAllSplits?: boolean;
  } = {},
): FrozenEvaluationManifest {
  const audit = verifyZeroSplitContamination(records);
  if (!audit.valid) {
    throw new Error(
      `Cannot freeze contaminated split set: ${audit.violations.map((v) => v.message).join("; ")}`,
    );
  }
  const salt = options.salt ?? DEFAULT_SPLIT_SALT;
  const ratios = options.ratios ?? { ...DEFAULT_SPLIT_RATIOS };
  validateSplitRatios(ratios);

  const frozenGroups: Record<string, DatasetSplit> = {};
  const valIds: string[] = [];
  const testIds: string[] = [];

  for (const record of records) {
    if (options.freezeAllSplits || record.split !== "train") {
      frozenGroups[record.familyGroupKey] = record.split;
    }
    if (record.split === "val") {
      valIds.push(record.id);
    } else if (record.split === "test") {
      testIds.push(record.id);
    }
  }

  const sortedGroupKeys = Object.keys(frozenGroups).sort();
  const orderedGroups: Record<string, DatasetSplit> = {};
  for (const key of sortedGroupKeys) {
    orderedGroups[key] = frozenGroups[key];
  }

  const base: Omit<FrozenEvaluationManifest, "manifestSha256"> = {
    schemaVersion: FROZEN_EVAL_MANIFEST_SCHEMA_VERSION,
    createdAt: options.createdAt ?? new Date().toISOString(),
    salt,
    ratios: { ...ratios },
    lockHeldOut: true,
    frozenGroups: orderedGroups,
    heldOutItemIds: {
      val: [...new Set(valIds)].sort(),
      test: [...new Set(testIds)].sort(),
    },
  };

  return {
    ...base,
    manifestSha256: computeFrozenManifestSha256(base),
  };
}

export function serializeFrozenManifest(
  manifest: FrozenEvaluationManifest,
): string {
  verifyFrozenManifestChecksum(manifest);
  return JSON.stringify(manifest, null, 2) + "\n";
}

export function parseFrozenManifest(jsonText: string): FrozenEvaluationManifest {
  const parsed: unknown = JSON.parse(jsonText);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("Frozen evaluation manifest must be a JSON object");
  }
  const manifest = parsed as FrozenEvaluationManifest;
  verifyFrozenManifestChecksum(manifest);
  return manifest;
}

/**
 * Audits a set of items/traces to guarantee zero cross-split contamination across
 * familyGroupKey, sourceParentId, stemFingerprint, and optional frozen manifest.
 */
export function verifyZeroSplitContamination(
  records: readonly SplitAuditRecord[],
  frozenManifest?: FrozenEvaluationManifest,
): SplitContaminationReport {
  if (frozenManifest) {
    verifyFrozenManifestChecksum(frozenManifest);
  }

  const violations: ContaminationViolation[] = [];
  const byFamily = new Map<
    string,
    { splits: Set<DatasetSplit>; itemIds: string[] }
  >();
  const bySourceParent = new Map<
    string,
    { splits: Set<DatasetSplit>; itemIds: string[] }
  >();
  const byStemHash = new Map<
    string,
    { splits: Set<DatasetSplit>; itemIds: string[] }
  >();

  const itemCounts: Record<DatasetSplit, number> = {
    train: 0,
    val: 0,
    test: 0,
  };
  const groupsPerSplit: Record<DatasetSplit, Set<string>> = {
    train: new Set<string>(),
    val: new Set<string>(),
    test: new Set<string>(),
  };

  const frozenValIds = new Set(frozenManifest?.heldOutItemIds.val ?? []);
  const frozenTestIds = new Set(frozenManifest?.heldOutItemIds.test ?? []);

  for (const record of records) {
    itemCounts[record.split] += 1;
    groupsPerSplit[record.split].add(record.familyGroupKey);

    const famEntry = byFamily.get(record.familyGroupKey) ?? {
      splits: new Set<DatasetSplit>(),
      itemIds: [],
    };
    famEntry.splits.add(record.split);
    famEntry.itemIds.push(record.id);
    byFamily.set(record.familyGroupKey, famEntry);

    if (record.sourceParentId && record.sourceParentId.trim() !== "") {
      const normalizedParent = record.sourceParentId.trim().toLowerCase();
      const parentEntry = bySourceParent.get(normalizedParent) ?? {
        splits: new Set<DatasetSplit>(),
        itemIds: [],
      };
      parentEntry.splits.add(record.split);
      parentEntry.itemIds.push(record.id);
      bySourceParent.set(normalizedParent, parentEntry);
    }

    if (record.stemFingerprint && record.stemFingerprint.trim() !== "") {
      const stemEntry = byStemHash.get(record.stemFingerprint) ?? {
        splits: new Set<DatasetSplit>(),
        itemIds: [],
      };
      stemEntry.splits.add(record.split);
      stemEntry.itemIds.push(record.id);
      byStemHash.set(record.stemFingerprint, stemEntry);
    }

    if (frozenManifest) {
      const expectedFrozenSplit =
        frozenManifest.frozenGroups[record.familyGroupKey];
      if (
        expectedFrozenSplit !== undefined &&
        expectedFrozenSplit !== record.split
      ) {
        violations.push({
          kind: "frozen-group-mismatch",
          key: record.familyGroupKey,
          splits: [expectedFrozenSplit, record.split],
          itemIds: [record.id],
          message: `Item ${record.id} placed familyGroupKey "${record.familyGroupKey}" in "${record.split}", violating frozen split "${expectedFrozenSplit}"`,
        });
      }
      if (frozenValIds.has(record.id) && record.split !== "val") {
        violations.push({
          kind: "frozen-item-mismatch",
          key: record.id,
          splits: ["val", record.split],
          itemIds: [record.id],
          message: `Held-out val item ${record.id} moved to "${record.split}"`,
        });
      }
      if (frozenTestIds.has(record.id) && record.split !== "test") {
        violations.push({
          kind: "frozen-item-mismatch",
          key: record.id,
          splits: ["test", record.split],
          itemIds: [record.id],
          message: `Held-out test item ${record.id} moved to "${record.split}"`,
        });
      }
    }
  }

  for (const [key, entry] of byFamily.entries()) {
    if (entry.splits.size > 1) {
      const splits = [...entry.splits].sort() as DatasetSplit[];
      violations.push({
        kind: "family-group-cross-split",
        key,
        splits,
        itemIds: entry.itemIds,
        message: `familyGroupKey "${key}" spans multiple splits (${splits.join(", ")}) across items: ${entry.itemIds.join(", ")}`,
      });
    }
  }

  for (const [key, entry] of bySourceParent.entries()) {
    if (entry.splits.size > 1) {
      const splits = [...entry.splits].sort() as DatasetSplit[];
      violations.push({
        kind: "source-parent-cross-split",
        key,
        splits,
        itemIds: entry.itemIds,
        message: `sourceParentId "${key}" spans multiple splits (${splits.join(", ")}) across items: ${entry.itemIds.join(", ")}`,
      });
    }
  }

  for (const [key, entry] of byStemHash.entries()) {
    if (entry.splits.size > 1) {
      const splits = [...entry.splits].sort() as DatasetSplit[];
      violations.push({
        kind: "stem-fingerprint-cross-split",
        key,
        splits,
        itemIds: entry.itemIds,
        message: `stemFingerprint "${key}" spans multiple splits (${splits.join(", ")}) across items: ${entry.itemIds.join(", ")}`,
      });
    }
  }

  const total = records.length;
  const itemRatios: Record<DatasetSplit, number> = {
    train: total > 0 ? itemCounts.train / total : 0,
    val: total > 0 ? itemCounts.val / total : 0,
    test: total > 0 ? itemCounts.test / total : 0,
  };

  return {
    valid: violations.length === 0,
    groupCounts: {
      train: groupsPerSplit.train.size,
      val: groupsPerSplit.val.size,
      test: groupsPerSplit.test.size,
    },
    itemCounts,
    itemRatios,
    violations,
  };
}
