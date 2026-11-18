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

export interface SplitBatchItem {
  id: string;
  conceptId: string;
  templateArchetype: string;
  sourceParentId?: string;
}

export interface BatchItemSplitAssignment {
  id: string;
  familyGroupKey: string;
  sourceGroupKey?: string;
  componentPrimaryKey: string;
  split: DatasetSplit;
  routedUnseenPostFreezeToTrain: boolean;
}

export interface SplitAuditRecord {
  id: string;
  familyGroupKey: string;
  split: DatasetSplit;
  conceptId?: string;
  templateArchetype?: string;
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
  newPostFreezeFamiliesRoutedToTrain: string[];
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
 * Builds the canonical primary archetype key `${conceptId}::${templateArchetype}`
 * while validating optional `sourceParentId` so `sourceParentId` never hides or
 * replaces `conceptId::templateArchetype`.
 */
export function buildFamilyGroupKey(input: FamilyGroupKeyInput): string {
  const concept = normalizeSegment("conceptId", input.conceptId);
  const archetype = normalizeSegment(
    "templateArchetype",
    input.templateArchetype,
  );
  if (input.sourceParentId !== undefined && input.sourceParentId.trim() !== "") {
    normalizeSegment("sourceParentId", input.sourceParentId);
  }
  return `${concept}::${archetype}`;
}

/**
 * Builds the canonical source lineage key `source::${sourceParentId}` when an item
 * derives from a shared source parent question.
 */
export function buildSourceGroupKey(
  sourceParentId?: string,
): string | undefined {
  if (sourceParentId === undefined || sourceParentId.trim() === "") {
    return undefined;
  }
  const parent = normalizeSegment("sourceParentId", sourceParentId);
  return `source::${parent}`;
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
 * from `familyGroupKey`, respecting any frozen held-out evaluation manifest and
 * routing unseen post-freeze groups to `train` when `lockHeldOut: true`.
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
    if (options.frozenManifest.lockHeldOut) {
      return "train";
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

class DisjointKeySet {
  private readonly parent = new Map<string, string>();

  add(key: string): void {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
    }
  }

  find(key: string): string {
    this.add(key);
    let root = key;
    while (this.parent.get(root)! !== root) {
      root = this.parent.get(root)!;
    }
    let cur = key;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    if (rootA < rootB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootA, rootB);
    }
  }

  components(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      const list = groups.get(root) ?? [];
      list.push(key);
      groups.set(root, list);
    }
    for (const list of groups.values()) {
      list.sort();
    }
    return groups;
  }
}

/**
 * Resolves connected components across `{conceptId::templateArchetype, source::sourceParentId}`
 * via union-find so items sharing EITHER an archetype OR a `sourceParentId` never split
 * across `train`/`val`/`test`, while enforcing `lockHeldOut` immutability on frozen manifests.
 */
export function assignSplitsForBatch(
  items: readonly SplitBatchItem[],
  options: SplitAssignOptions = {},
): Map<string, BatchItemSplitAssignment> {
  if (options.frozenManifest) {
    verifyFrozenManifestChecksum(options.frozenManifest);
  }

  const dsu = new DisjointKeySet();
  const normalizedItems = items.map((item) => {
    const familyGroupKey = buildFamilyGroupKey({
      conceptId: item.conceptId,
      templateArchetype: item.templateArchetype,
      sourceParentId: item.sourceParentId,
    });
    const sourceGroupKey = buildSourceGroupKey(item.sourceParentId);
    dsu.add(familyGroupKey);
    if (sourceGroupKey !== undefined) {
      dsu.add(sourceGroupKey);
      dsu.union(familyGroupKey, sourceGroupKey);
    }
    return {
      id: item.id,
      familyGroupKey,
      sourceGroupKey,
    };
  });

  const frozenValIds = new Set(options.frozenManifest?.heldOutItemIds.val ?? []);
  const frozenTestIds = new Set(
    options.frozenManifest?.heldOutItemIds.test ?? [],
  );

  const itemsByRoot = new Map<string, typeof normalizedItems>();
  for (const entry of normalizedItems) {
    const root = dsu.find(entry.familyGroupKey);
    const list = itemsByRoot.get(root) ?? [];
    list.push(entry);
    itemsByRoot.set(root, list);
  }

  const componentResolution = new Map<
    string,
    {
      primaryKey: string;
      split: DatasetSplit;
      routedUnseenPostFreezeToTrain: boolean;
    }
  >();

  for (const [root, keys] of dsu.components().entries()) {
    const archetypeKeys = keys.filter((k) => !k.startsWith("source::"));
    const primaryKey = archetypeKeys[0] ?? keys[0];

    const frozenSplits = new Set<DatasetSplit>();
    if (options.frozenManifest) {
      for (const k of keys) {
        const s = options.frozenManifest.frozenGroups[k];
        if (s !== undefined) {
          frozenSplits.add(s);
        }
      }
      for (const item of itemsByRoot.get(root) ?? []) {
        if (frozenValIds.has(item.id)) {
          frozenSplits.add("val");
        }
        if (frozenTestIds.has(item.id)) {
          frozenSplits.add("test");
        }
      }
    }

    if (frozenSplits.size > 1) {
      throw new Error(
        `Split contamination conflict: connected component [${keys.join(", ")}] spans incompatible frozen splits (${[...frozenSplits].sort().join(", ")})`,
      );
    }

    if (frozenSplits.size === 1) {
      componentResolution.set(root, {
        primaryKey,
        split: [...frozenSplits][0],
        routedUnseenPostFreezeToTrain: false,
      });
    } else if (options.frozenManifest?.lockHeldOut) {
      componentResolution.set(root, {
        primaryKey,
        split: "train",
        routedUnseenPostFreezeToTrain: true,
      });
    } else {
      componentResolution.set(root, {
        primaryKey,
        split: assignSplit(primaryKey, options),
        routedUnseenPostFreezeToTrain: false,
      });
    }
  }

  const assignments = new Map<string, BatchItemSplitAssignment>();
  for (const entry of normalizedItems) {
    const root = dsu.find(entry.familyGroupKey);
    const resolved = componentResolution.get(root)!;

    if (options.frozenManifest?.lockHeldOut) {
      if (resolved.split === "val" && !frozenValIds.has(entry.id)) {
        throw new Error(
          `Item "${entry.id}" (family "${entry.familyGroupKey}") attempts to alter locked held-out "val" membership`,
        );
      }
      if (resolved.split === "test" && !frozenTestIds.has(entry.id)) {
        throw new Error(
          `Item "${entry.id}" (family "${entry.familyGroupKey}") attempts to alter locked held-out "test" membership`,
        );
      }
      if (frozenValIds.has(entry.id) && resolved.split !== "val") {
        throw new Error(
          `Locked held-out "val" item "${entry.id}" cannot move to "${resolved.split}"`,
        );
      }
      if (frozenTestIds.has(entry.id) && resolved.split !== "test") {
        throw new Error(
          `Locked held-out "test" item "${entry.id}" cannot move to "${resolved.split}"`,
        );
      }
    }

    assignments.set(entry.id, {
      id: entry.id,
      familyGroupKey: entry.familyGroupKey,
      ...(entry.sourceGroupKey ? { sourceGroupKey: entry.sourceGroupKey } : {}),
      componentPrimaryKey: resolved.primaryKey,
      split: resolved.split,
      routedUnseenPostFreezeToTrain: resolved.routedUnseenPostFreezeToTrain,
    });
  }

  return assignments;
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
    lockHeldOut?: boolean;
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

  const freezeAll = options.freezeAllSplits ?? true;
  const lockHeldOut = options.lockHeldOut ?? true;
  const frozenGroups: Record<string, DatasetSplit> = {};
  const valIds: string[] = [];
  const testIds: string[] = [];

  for (const record of records) {
    if (freezeAll || record.split !== "train") {
      frozenGroups[record.familyGroupKey] = record.split;
      if (record.conceptId && record.templateArchetype) {
        const archKey = buildFamilyGroupKey({
          conceptId: record.conceptId,
          templateArchetype: record.templateArchetype,
        });
        frozenGroups[archKey] = record.split;
      }
      const srcKey = buildSourceGroupKey(record.sourceParentId);
      if (srcKey) {
        frozenGroups[srcKey] = record.split;
      }
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
    lockHeldOut,
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

function recordSplitMembership(
  map: Map<string, { splits: Set<DatasetSplit>; itemIds: string[] }>,
  key: string,
  split: DatasetSplit,
  itemId: string,
): void {
  const entry = map.get(key) ?? {
    splits: new Set<DatasetSplit>(),
    itemIds: [],
  };
  entry.splits.add(split);
  if (!entry.itemIds.includes(itemId)) {
    entry.itemIds.push(itemId);
  }
  map.set(key, entry);
}

/**
 * Audits a set of items/traces to guarantee zero cross-split contamination across
 * BOTH `conceptId::templateArchetype` AND `sourceParentId`, plus `stemFingerprint`
 * and optional frozen evaluation manifest (`lockHeldOut` immutability).
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
  const seenValIds = new Set<string>();
  const seenTestIds = new Set<string>();
  const newPostFreezeFamilies = new Set<string>();

  for (const record of records) {
    itemCounts[record.split] += 1;
    const rawFamilyKey = record.familyGroupKey.trim();
    const explicitArchKey =
      record.conceptId?.trim() && record.templateArchetype?.trim()
        ? buildFamilyGroupKey({
            conceptId: record.conceptId,
            templateArchetype: record.templateArchetype,
          })
        : undefined;
    const primaryArchKey =
      explicitArchKey ??
      (!rawFamilyKey.startsWith("source::") ? rawFamilyKey : undefined);

    groupsPerSplit[record.split].add(primaryArchKey ?? rawFamilyKey);

    recordSplitMembership(byFamily, rawFamilyKey, record.split, record.id);
    if (explicitArchKey && explicitArchKey !== rawFamilyKey) {
      recordSplitMembership(byFamily, explicitArchKey, record.split, record.id);
    }

    const explicitParent =
      record.sourceParentId && record.sourceParentId.trim() !== ""
        ? normalizeSegment("sourceParentId", record.sourceParentId)
        : undefined;
    const legacyParent = rawFamilyKey.startsWith("source::")
      ? rawFamilyKey.slice("source::".length).trim().toLowerCase()
      : undefined;

    for (const parentId of new Set(
      [explicitParent, legacyParent].filter(
        (p): p is string => Boolean(p && p.length > 0),
      ),
    )) {
      recordSplitMembership(bySourceParent, parentId, record.split, record.id);
    }

    if (record.stemFingerprint && record.stemFingerprint.trim() !== "") {
      recordSplitMembership(
        byStemHash,
        record.stemFingerprint.trim(),
        record.split,
        record.id,
      );
    }

    if (record.split === "val") {
      seenValIds.add(record.id);
    } else if (record.split === "test") {
      seenTestIds.add(record.id);
    }

    if (frozenManifest) {
      const candidateFrozenKeys = new Set<string>([rawFamilyKey]);
      if (explicitArchKey) candidateFrozenKeys.add(explicitArchKey);
      if (explicitParent) candidateFrozenKeys.add(`source::${explicitParent}`);
      if (legacyParent) candidateFrozenKeys.add(`source::${legacyParent}`);

      let matchedFrozenGroup = false;
      for (const fKey of candidateFrozenKeys) {
        const expectedFrozenSplit = frozenManifest.frozenGroups[fKey];
        if (expectedFrozenSplit !== undefined) {
          matchedFrozenGroup = true;
          if (expectedFrozenSplit !== record.split) {
            violations.push({
              kind: "frozen-group-mismatch",
              key: fKey,
              splits: [expectedFrozenSplit, record.split],
              itemIds: [record.id],
              message: `Item ${record.id} placed group "${fKey}" in "${record.split}", violating frozen split "${expectedFrozenSplit}"`,
            });
          }
        }
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

      if (frozenManifest.lockHeldOut) {
        if (record.split === "val" && !frozenValIds.has(record.id)) {
          violations.push({
            kind: "frozen-item-mismatch",
            key: record.id,
            splits: ["val"],
            itemIds: [record.id],
            message: `Item ${record.id} ("${rawFamilyKey}") entered locked held-out "val" split while lockHeldOut is true`,
          });
        }
        if (record.split === "test" && !frozenTestIds.has(record.id)) {
          violations.push({
            kind: "frozen-item-mismatch",
            key: record.id,
            splits: ["test"],
            itemIds: [record.id],
            message: `Item ${record.id} ("${rawFamilyKey}") entered locked held-out "test" split while lockHeldOut is true`,
          });
        }
        if (!matchedFrozenGroup && record.split === "train") {
          newPostFreezeFamilies.add(primaryArchKey ?? rawFamilyKey);
        }
      }
    }
  }

  if (frozenManifest?.lockHeldOut) {
    for (const valId of frozenValIds) {
      if (!seenValIds.has(valId) && !records.some((r) => r.id === valId)) {
        violations.push({
          kind: "frozen-item-mismatch",
          key: valId,
          splits: ["val"],
          itemIds: [valId],
          message: `Held-out val item ${valId} is missing from locked evaluation split`,
        });
      }
    }
    for (const testId of frozenTestIds) {
      if (!seenTestIds.has(testId) && !records.some((r) => r.id === testId)) {
        violations.push({
          kind: "frozen-item-mismatch",
          key: testId,
          splits: ["test"],
          itemIds: [testId],
          message: `Held-out test item ${testId} is missing from locked evaluation split`,
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
    newPostFreezeFamiliesRoutedToTrain: [...newPostFreezeFamilies].sort(),
    violations,
  };
}
