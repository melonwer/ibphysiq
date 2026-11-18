import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  buildQwenDistillationTrace,
  validateQwenDistillationTrace,
} from "./distillation-trace";
import { getDomainAdapter, hasDomainAdapter } from "./domain-registry";
import {
  computeShingleSet,
  formatSignificantFigures,
} from "./numeric-checker";
import { ExistingStemEntry, verifyCandidateWithGate } from "./package-gate";
import {
  assignSplit,
  assignSplitsForBatch,
  buildFamilyGroupKey,
  createFrozenEvaluationManifest,
  serializeFrozenManifest,
  SplitAuditRecord,
  SplitBatchItem,
  SplitContaminationReport,
  verifyZeroSplitContamination,
} from "./split-assigner";
import {
  CandidateQuestionInput,
  COMPILED_BANK_SUMMARY_SCHEMA_VERSION,
  DatasetSplit,
  FrozenEvaluationManifest,
  GateDiagnosticIssue,
  GateRejectionCode,
  McqOptionItem,
  PhysicsDomainId,
  QuestionDifficulty,
  QuestionFormat,
  QwenDistillationTrace,
  SHARD_RECORD_SCHEMA_VERSION,
  ShardAttemptTelemetry,
  SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
  SixthPhysicsBankItem,
  SYLLABUS_IDS,
  SyllabusId,
  VerifiedQuantityMap,
  VerifiedShardRecord,
} from "./types";

export const DEFAULT_SHARDS_RELATIVE_DIR = "dataset/sixthphysics-bank/shards";
export const DEFAULT_COMPILED_RELATIVE_DIR =
  "dataset/sixthphysics-bank/compiled";

export interface CandidateIngestItemReport {
  id: string;
  status: "ingested" | "already-present" | "rejected";
  familyGroupKey?: string;
  split?: DatasetSplit;
  visualFamily?: string;
  passedChecks: string[];
  issues: GateDiagnosticIssue[];
  verifiedQuantities?: VerifiedQuantityMap;
}

export interface ShardIngestSummary {
  shardId: string;
  shardFilePath: string;
  dryRun: boolean;
  totalCandidates: number;
  ingestedCount: number;
  alreadyPresentCount: number;
  rejectedCount: number;
  results: CandidateIngestItemReport[];
}

export interface IngestShardOptions {
  shardId: string;
  shardsDir: string;
  candidates: readonly CandidateQuestionInput[];
  frozenManifest?: FrozenEvaluationManifest;
  dryRun?: boolean;
  now?: () => string;
  nearDuplicateSimilarityThreshold?: number;
}

export interface SolvePreviewInput {
  id?: string;
  domain: PhysicsDomainId;
  scenarioSpec: Record<string, unknown>;
  hiddenQuantities?: string[];
}

export interface SolvePreviewOutput {
  id: string;
  domain: PhysicsDomainId;
  valid: boolean;
  issues: string[];
  solverId?: string;
  verifiedQuantities?: VerifiedQuantityMap;
  formattedQuantities3sf?: Record<string, string>;
  visualFamily?: string;
  publicVisualLabels?: string[];
}

export interface CompiledFileReceipt {
  relativePath: string;
  byteLength: number;
  sha256: string;
  recordCount: number;
}

export interface CompiledBankSummary {
  schemaVersion: typeof COMPILED_BANK_SUMMARY_SCHEMA_VERSION;
  compiledAt: string;
  targetDistillationModel: "Qwen/Qwen3.5-9B";
  shardsProcessed: string[];
  attemptMetrics: {
    totalCandidatesAttempted: number;
    totalVerifiedInShards: number;
    totalRejectedInAttempts: number;
    overallPassRate: number;
    rejectionCountsByCode: Partial<Record<GateRejectionCode, number>>;
  };
  deduplication: {
    duplicateIdsSkipped: string[];
    nearDuplicateIdsSkipped: string[];
  };
  totalCompiledItems: number;
  newPostFreezeFamiliesRoutedToTrain: string[];
  splitSummary: SplitContaminationReport & {
    zeroContaminationVerified: boolean;
  };
  coverageBySyllabus: Record<
    SyllabusId,
    {
      total: number;
      byLevel: Record<string, number>;
      byFormat: Record<QuestionFormat, number>;
      byDifficulty: Record<QuestionDifficulty, number>;
      byTopic: Record<string, number>;
    }
  >;
  coverageByDomain: Record<
    string,
    {
      total: number;
      mcq: number;
      structured: number;
      visualFamily: string;
    }
  >;
  files: CompiledFileReceipt[];
}

export interface CompileBankOptions {
  shardsDir: string;
  outDir: string;
  frozenManifest?: FrozenEvaluationManifest;
  emitFrozenManifestPath?: string;
  lockHeldOut?: boolean;
  compiledAt?: string;
  nearDuplicateSimilarityThreshold?: number;
}

export function assertValidShardId(shardId: string): string {
  const trimmed = shardId.trim();
  if (!trimmed || !/^[a-zA-Z0-9._-]+$/.test(trimmed) || trimmed.endsWith(".attempts")) {
    throw new Error(
      `Invalid shardId "${shardId}": must match /^[a-zA-Z0-9._-]+$/ and not end with ".attempts"`,
    );
  }
  return trimmed;
}

export function shardJsonlPath(shardsDir: string, shardId: string): string {
  const validId = assertValidShardId(shardId);
  return path.join(shardsDir, `${validId}.jsonl`);
}

export function shardAttemptsPath(shardsDir: string, shardId: string): string {
  const validId = assertValidShardId(shardId);
  return path.join(shardsDir, `${validId}.attempts.jsonl`);
}

interface ShardFileReadResult {
  records: VerifiedShardRecord[];
  needsRepair: boolean;
}

function inspectShardRecordsFile(filePath: string): ShardFileReadResult {
  if (!fs.existsSync(filePath)) {
    return { records: [], needsRepair: false };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  if (raw.length === 0) {
    return { records: [], needsRepair: false };
  }

  const endsWithNewline = raw.endsWith("\n");
  const lines = raw.split("\n");
  const records: VerifiedShardRecord[] = [];
  let needsRepair = !endsWithNewline;

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) {
      // Blank lines before the final trailing empty split after '\n' get normalized on repair
      if (i < lines.length - 1 && rawLine.length > 0) {
        needsRepair = true;
      }
      continue;
    }

    const isLastNonEmptyLine = lines.slice(i + 1).every((rest) => !rest.trim());
    // Any non-newline-terminated trailing line was not cleanly flushed before crash/exit:
    // only accept complete valid newline-terminated JSONL records, or if a complete valid
    // record lacked '\n', normalize it on repair; truncate any incomplete trailing fragment!
    try {
      const parsed = JSON.parse(line) as VerifiedShardRecord;
      if (parsed.schemaVersion !== SHARD_RECORD_SCHEMA_VERSION) {
        throw new Error(
          `Unsupported shard record schemaVersion in ${filePath}:${i + 1}: ${String(parsed.schemaVersion)}`,
        );
      }
      if (
        !parsed.bankItem ||
        typeof parsed.bankItem.id !== "string" ||
        !parsed.distillationTrace
      ) {
        throw new Error(
          `Incomplete shard record structure in ${filePath}:${i + 1}`,
        );
      }
      if (isLastNonEmptyLine && !endsWithNewline) {
        // Unterminated trailing line: even if accidental valid JSON, only newline-terminated
        // records are crash-committed; wait—check if full trace validates!
        const traceValid = validateQwenDistillationTrace(parsed.distillationTrace);
        if (!traceValid.valid) {
          needsRepair = true;
          break;
        }
      }
      records.push(parsed);
    } catch (error) {
      if (isLastNonEmptyLine && !endsWithNewline) {
        needsRepair = true;
        break;
      }
      throw error;
    }
  }

  return { records, needsRepair };
}

function rewriteJsonlAtomically(filePath: string, serializedLines: readonly string[]): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const content =
    serializedLines.length > 0 ? `${serializedLines.join("\n")}\n` : "";
  const tempPath = `${filePath}.repair-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

export function readShardRecords(
  shardsDir: string,
  shardId: string,
): VerifiedShardRecord[] {
  const filePath = shardJsonlPath(shardsDir, shardId);
  return inspectShardRecordsFile(filePath).records;
}

function inspectShardAttemptsFile(filePath: string): {
  entries: ShardAttemptTelemetry[];
  needsRepair: boolean;
} {
  if (!fs.existsSync(filePath)) {
    return { entries: [], needsRepair: false };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  if (raw.length === 0) {
    return { entries: [], needsRepair: false };
  }
  const endsWithNewline = raw.endsWith("\n");
  const lines = raw.split("\n");
  const entries: ShardAttemptTelemetry[] = [];
  let needsRepair = !endsWithNewline;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as ShardAttemptTelemetry;
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        typeof parsed.shardId === "string" &&
        typeof parsed.totalCandidates === "number"
      ) {
        entries.push(parsed);
      } else {
        needsRepair = true;
      }
    } catch {
      needsRepair = true;
    }
  }
  return { entries, needsRepair };
}

export function readShardAttempts(
  shardsDir: string,
  shardId: string,
): ShardAttemptTelemetry[] {
  const filePath = shardAttemptsPath(shardsDir, shardId);
  return inspectShardAttemptsFile(filePath).entries;
}

/**
 * Solves and previews deterministic quantities + SVG labels without requiring authored prose,
 * enabling swarm workers to inspect exact solver ground truth prior to authoring Step 2.
 */
export function solveCandidateScenariosOnly(
  inputs: readonly SolvePreviewInput[],
): SolvePreviewOutput[] {
  return inputs.map((item, idx) => {
    const id = item.id?.trim() || `preview-${idx + 1}`;
    if (!hasDomainAdapter(item.domain)) {
      return {
        id,
        domain: item.domain,
        valid: false,
        issues: [`Unknown domain "${String(item.domain)}"`],
      };
    }
    const adapter = getDomainAdapter(item.domain);
    const validation = adapter.validateScenario(item.scenarioSpec);
    if (!validation.valid) {
      return {
        id,
        domain: item.domain,
        valid: false,
        issues: validation.issues,
      };
    }
    try {
      const solved = adapter.solveScenario(item.scenarioSpec);
      const formattedQuantities3sf: Record<string, string> = {};
      for (const [k, v] of Object.entries(solved.quantities)) {
        formattedQuantities3sf[k] =
          typeof v === "number" && Number.isFinite(v)
            ? formatSignificantFigures(v, 3)
            : String(v);
      }
      const rendered = adapter.renderSvg?.(item.scenarioSpec, {
        hiddenQuantities: item.hiddenQuantities ?? [],
        id,
      });
      return {
        id,
        domain: item.domain,
        valid: true,
        issues: [],
        solverId: solved.solverId,
        verifiedQuantities: solved.quantities,
        formattedQuantities3sf,
        visualFamily: rendered?.visualFamily ?? adapter.defaultVisualFamily,
        publicVisualLabels: rendered?.publicLabels ?? [],
      };
    } catch (error) {
      return {
        id,
        domain: item.domain,
        valid: false,
        issues: [error instanceof Error ? error.message : String(error)],
      };
    }
  });
}

/**
 * Verifies a batch of candidates and appends passing items + Qwen3.5-9B distillation
 * traces to an isolated per-worker shard JSONL file with zero cross-worker lock contention.
 */
export function ingestCandidatesIntoShard(
  options: IngestShardOptions,
): ShardIngestSummary {
  const shardId = assertValidShardId(options.shardId);
  const now = options.now ?? (() => new Date().toISOString());
  const dryRun = options.dryRun ?? false;
  const shardFilePath = shardJsonlPath(options.shardsDir, shardId);

  const shardInspection = inspectShardRecordsFile(shardFilePath);
  const existingRecords = shardInspection.records;
  const existingById = new Map<string, VerifiedShardRecord>();
  const existingStemPool: ExistingStemEntry[] = [];
  const acceptedSplitItems: SplitBatchItem[] = [];
  const persistedSplitsById = new Map<string, DatasetSplit>();

  for (const rec of existingRecords) {
    existingById.set(rec.bankItem.id, rec);
    persistedSplitsById.set(rec.bankItem.id, rec.distillationTrace.split);
    acceptedSplitItems.push({
      id: rec.bankItem.id,
      conceptId: rec.bankItem.provenance.conceptId,
      templateArchetype: rec.bankItem.provenance.templateArchetype,
      sourceParentId: rec.bankItem.provenance.sourceParentId,
    });
    existingStemPool.push({
      id: rec.bankItem.id,
      stem: rec.bankItem.stem,
      stemFingerprint: rec.bankItem.provenance.stemFingerprint,
    });
  }

  const newShardRecords: VerifiedShardRecord[] = [];
  const results: CandidateIngestItemReport[] = [];
  const rejectionCountsByCode: Partial<Record<GateRejectionCode, number>> = {};

  let ingestedCount = 0;
  let alreadyPresentCount = 0;
  let rejectedCount = 0;

  for (const candidate of options.candidates) {
    const candidateId = candidate.id?.trim() ?? "";

    // Idempotent skip if already verified and present in this shard
    if (candidateId && existingById.has(candidateId)) {
      const prev = existingById.get(candidateId)!;
      alreadyPresentCount += 1;
      results.push({
        id: candidateId,
        status: "already-present",
        familyGroupKey: prev.bankItem.familyGroupKey,
        split: prev.distillationTrace.split,
        visualFamily: prev.bankItem.visualFamily,
        passedChecks: prev.gateChecksPassed,
        issues: [],
        verifiedQuantities: prev.bankItem.verifiedQuantities,
      });
      continue;
    }

    // Compute familyGroupKey & connected-component split safely (enforcing sourceParentId + lockHeldOut)
    let familyGroupKey = "";
    let split: DatasetSplit = "train";
    try {
      familyGroupKey = buildFamilyGroupKey({
        conceptId: candidate.conceptId ?? "",
        templateArchetype: candidate.templateArchetype ?? "",
        sourceParentId: candidate.sourceParentId,
      });
    } catch (error) {
      rejectedCount += 1;
      const code: GateRejectionCode = "invalid-candidate-schema";
      rejectionCountsByCode[code] = (rejectionCountsByCode[code] ?? 0) + 1;
      results.push({
        id: candidateId || "<missing-id>",
        status: "rejected",
        passedChecks: [],
        issues: [
          {
            code,
            stage: "split",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      });
      continue;
    }

    const trialSplitItem: SplitBatchItem = {
      id: candidateId || `<trial-${results.length}>`,
      conceptId: candidate.conceptId,
      templateArchetype: candidate.templateArchetype,
      sourceParentId: candidate.sourceParentId,
    };

    try {
      const batchAssignments = assignSplitsForBatch(
        [...acceptedSplitItems, trialSplitItem],
        {
          frozenManifest: options.frozenManifest,
        },
      );
      const candAssignment = batchAssignments.get(trialSplitItem.id)!;
      split = candAssignment.split;

      // Ensure connecting via sourceParentId does not conflict with an already-persisted split in this shard
      for (const [prevId, prevSplit] of persistedSplitsById.entries()) {
        const recomputed = batchAssignments.get(prevId);
        if (recomputed && recomputed.split !== prevSplit) {
          // Align candidate to persisted component split if allowed by frozenManifest; otherwise reject
          if (
            options.frozenManifest?.lockHeldOut &&
            (prevSplit === "val" || prevSplit === "test")
          ) {
            throw new Error(
              `Item "${candidateId}" shares lineage with locked "${prevSplit}" item "${prevId}" and cannot alter held-out membership`,
            );
          }
          if (
            options.frozenManifest &&
            options.frozenManifest.frozenGroups[familyGroupKey] !== undefined &&
            options.frozenManifest.frozenGroups[familyGroupKey] !== prevSplit
          ) {
            throw new Error(
              `Item "${candidateId}" bridges incompatible splits "${options.frozenManifest.frozenGroups[familyGroupKey]}" and "${prevSplit}"`,
            );
          }
          split = prevSplit;
        }
      }
    } catch (error) {
      rejectedCount += 1;
      const code: GateRejectionCode = "split-contamination";
      rejectionCountsByCode[code] = (rejectionCountsByCode[code] ?? 0) + 1;
      results.push({
        id: candidateId || "<missing-id>",
        status: "rejected",
        familyGroupKey,
        passedChecks: [],
        issues: [
          {
            code,
            stage: "split",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      });
      continue;
    }

    const execution = verifyCandidateWithGate(candidate, {
      existingShardItems: existingStemPool,
      nearDuplicateSimilarityThreshold:
        options.nearDuplicateSimilarityThreshold,
    });

    if (!execution.evaluation.valid || !execution.solveOutput) {
      rejectedCount += 1;
      for (const issue of execution.evaluation.issues) {
        rejectionCountsByCode[issue.code] =
          (rejectionCountsByCode[issue.code] ?? 0) + 1;
      }
      results.push({
        id: candidateId || "<missing-id>",
        status: "rejected",
        familyGroupKey,
        split,
        passedChecks: execution.evaluation.passedChecks,
        issues: execution.evaluation.issues,
        verifiedQuantities: execution.solveOutput?.quantities,
      });
      continue;
    }

    const timestamp = now();
    const adapter = getDomainAdapter(candidate.domain);
    const visualFamily =
      execution.renderOutput?.visualFamily ??
      (execution.effectiveSvgMarkup
        ? adapter.defaultVisualFamily
        : "none");

    const bankItem: SixthPhysicsBankItem = {
      schemaVersion: SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
      id: candidateId,
      familyGroupKey,
      syllabi: candidate.syllabi.map((s) => ({
        syllabus: s.syllabus,
        level: s.level.trim(),
        topicId: s.topicId.trim(),
        ...(s.subtopicId?.trim() ? { subtopicId: s.subtopicId.trim() } : {}),
      })),
      format: candidate.format,
      difficulty: candidate.difficulty,
      visualFamily,
      stem: candidate.stem.trim(),
      ...(execution.effectiveSvgMarkup !== undefined
        ? { svgMarkup: execution.effectiveSvgMarkup }
        : {}),
      ...(candidate.format === "mcq" && candidate.options
        ? {
            options: candidate.options as [
              McqOptionItem,
              McqOptionItem,
              McqOptionItem,
              McqOptionItem,
            ],
            correctOptionIndex: execution.correctOptionIndex,
          }
        : {}),
      ...(candidate.format === "structured" && candidate.parts
        ? { parts: candidate.parts }
        : {}),
      workedSolution: candidate.workedSolution.trim(),
      markScheme: candidate.markScheme,
      totalMarks: candidate.totalMarks,
      verifiedQuantities: execution.solveOutput.quantities,
      provenance: {
        domain: candidate.domain,
        conceptId: candidate.conceptId.trim().toLowerCase(),
        templateArchetype: candidate.templateArchetype.trim().toLowerCase(),
        familyGroupKey,
        seed: candidate.seed,
        shardId,
        generatorModel:
          candidate.generatorModel?.trim() || "gemini-4-carbon-high",
        solverId: execution.solveOutput.solverId,
        ...(execution.renderOutput?.rendererVersion
          ? { rendererVersion: execution.renderOutput.rendererVersion }
          : {}),
        stemFingerprint: execution.evaluation.stemFingerprint,
        ...(execution.evaluation.svgFingerprint
          ? { svgFingerprint: execution.evaluation.svgFingerprint }
          : {}),
        split,
        ...(candidate.sourceParentId?.trim()
          ? { sourceParentId: candidate.sourceParentId.trim() }
          : {}),
        createdAt: timestamp,
      },
    };

    const distillationTrace = buildQwenDistillationTrace({
      candidate,
      bankItem,
      split,
      publicVisualLabels: execution.renderOutput?.publicLabels,
    });

    const traceValidation = validateQwenDistillationTrace(distillationTrace);
    if (!traceValidation.valid) {
      rejectedCount += 1;
      const code: GateRejectionCode = "invalid-candidate-schema";
      rejectionCountsByCode[code] = (rejectionCountsByCode[code] ?? 0) + 1;
      results.push({
        id: candidateId,
        status: "rejected",
        familyGroupKey,
        split,
        passedChecks: execution.evaluation.passedChecks,
        issues: traceValidation.issues.map((msg) => ({
          code,
          stage: "schema" as const,
          message: msg,
        })),
      });
      continue;
    }

    const shardRecord: VerifiedShardRecord = {
      schemaVersion: SHARD_RECORD_SCHEMA_VERSION,
      shardId,
      ingestedAt: timestamp,
      bankItem,
      distillationTrace,
      gateChecksPassed: execution.evaluation.passedChecks,
    };

    newShardRecords.push(shardRecord);
    existingById.set(candidateId, shardRecord);
    persistedSplitsById.set(candidateId, split);
    acceptedSplitItems.push({
      id: candidateId,
      conceptId: bankItem.provenance.conceptId,
      templateArchetype: bankItem.provenance.templateArchetype,
      sourceParentId: bankItem.provenance.sourceParentId,
    });
    existingStemPool.push({
      id: candidateId,
      stem: bankItem.stem,
      stemFingerprint: bankItem.provenance.stemFingerprint,
    });

    ingestedCount += 1;
    results.push({
      id: candidateId,
      status: "ingested",
      familyGroupKey,
      split,
      visualFamily,
      passedChecks: execution.evaluation.passedChecks,
      issues: [],
      verifiedQuantities: bankItem.verifiedQuantities,
    });
  }

  if (!dryRun) {
    fs.mkdirSync(options.shardsDir, { recursive: true });
    // Truncate/rewrite cleanly up to the last valid newline-terminated JSON record if crash left trailing fragment
    if (shardInspection.needsRepair) {
      rewriteJsonlAtomically(
        shardFilePath,
        existingRecords.map((rec) => JSON.stringify(rec)),
      );
    }
    if (newShardRecords.length > 0) {
      const payload =
        newShardRecords.map((rec) => JSON.stringify(rec)).join("\n") + "\n";
      fs.appendFileSync(shardFilePath, payload, "utf8");
    }

    const attemptsFilePath = shardAttemptsPath(options.shardsDir, shardId);
    const attemptsInspection = inspectShardAttemptsFile(attemptsFilePath);
    if (attemptsInspection.needsRepair) {
      rewriteJsonlAtomically(
        attemptsFilePath,
        attemptsInspection.entries.map((entry) => JSON.stringify(entry)),
      );
    }
    const attemptEntry: ShardAttemptTelemetry = {
      shardId,
      attemptedAt: now(),
      totalCandidates: options.candidates.length,
      ingestedCount,
      alreadyPresentCount,
      rejectedCount,
      rejectionCountsByCode,
    };
    fs.appendFileSync(
      attemptsFilePath,
      JSON.stringify(attemptEntry) + "\n",
      "utf8",
    );
  }

  return {
    shardId,
    shardFilePath,
    dryRun,
    totalCandidates: options.candidates.length,
    ingestedCount,
    alreadyPresentCount,
    rejectedCount,
    results,
  };
}

function sanitizePathSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "general";
}

function writeTrackedFile(
  outDir: string,
  relativePath: string,
  content: string,
  recordCount: number,
  receipts: CompiledFileReceipt[],
): void {
  const fullPath = path.join(outDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const buf = Buffer.from(content, "utf8");
  fs.writeFileSync(fullPath, buf);
  receipts.push({
    relativePath,
    byteLength: buf.byteLength,
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    recordCount,
  });
}

/**
 * Deterministically merges all shard JSONL files, deduplicates across shards,
 * verifies zero train/val/test split contamination, and emits static-site JSON
 * bundles + Qwen3.5-9B train/val/test JSONL datasets + SUMMARY.json receipt.
 */
export function compileBankFromShards(
  options: CompileBankOptions,
): CompiledBankSummary {
  const compiledAt = options.compiledAt ?? new Date().toISOString();
  const similarityThreshold = options.nearDuplicateSimilarityThreshold ?? 0.9;

  if (!fs.existsSync(options.shardsDir)) {
    throw new Error(`Shards directory does not exist: ${options.shardsDir}`);
  }

  const shardFiles = fs
    .readdirSync(options.shardsDir)
    .filter((f) => f.endsWith(".jsonl") && !f.endsWith(".attempts.jsonl"))
    .sort();

  const shardsProcessed = shardFiles.map((f) => f.replace(/\.jsonl$/, ""));

  // Aggregate attempt telemetry
  let totalCandidatesAttempted = 0;
  let totalVerifiedInShards = 0;
  let totalRejectedInAttempts = 0;
  const rejectionCountsByCode: Partial<Record<GateRejectionCode, number>> = {};

  for (const shardId of shardsProcessed) {
    const attempts = readShardAttempts(options.shardsDir, shardId);
    for (const att of attempts) {
      totalCandidatesAttempted += att.totalCandidates;
      totalVerifiedInShards += att.ingestedCount;
      totalRejectedInAttempts += att.rejectedCount;
      for (const [code, count] of Object.entries(att.rejectionCountsByCode)) {
        const key = code as GateRejectionCode;
        rejectionCountsByCode[key] =
          (rejectionCountsByCode[key] ?? 0) + (count ?? 0);
      }
    }
  }

  // Deterministically merge and deduplicate across all shards
  const seenIds = new Set<string>();
  const seenStemFingerprints = new Set<string>();
  const acceptedShinglesPool: Array<ReadonlySet<string>> = [];
  const mergedRecords: VerifiedShardRecord[] = [];
  const duplicateIdsSkipped: string[] = [];
  const nearDuplicateIdsSkipped: string[] = [];

  for (const shardId of shardsProcessed) {
    const records = readShardRecords(options.shardsDir, shardId);
    for (const rec of records) {
      const id = rec.bankItem.id;
      if (seenIds.has(id)) {
        duplicateIdsSkipped.push(id);
        continue;
      }

      const stemFp = rec.bankItem.provenance.stemFingerprint;
      const candShingles = computeShingleSet(rec.bankItem.stem);
      const isNearDup =
        seenStemFingerprints.has(stemFp) ||
        acceptedShinglesPool.some((existingShingles) => {
          if (candShingles.size === 0 && existingShingles.size === 0) {
            return 1 >= similarityThreshold;
          }
          if (candShingles.size === 0 || existingShingles.size === 0) {
            return false;
          }
          const minSize = Math.min(candShingles.size, existingShingles.size);
          const maxSize = Math.max(candShingles.size, existingShingles.size);
          if (minSize < similarityThreshold * maxSize) {
            return false;
          }
          const smaller =
            candShingles.size <= existingShingles.size
              ? candShingles
              : existingShingles;
          const larger =
            candShingles.size <= existingShingles.size
              ? existingShingles
              : candShingles;
          let intersection = 0;
          for (const token of smaller) {
            if (larger.has(token)) {
              intersection += 1;
            }
          }
          const union = candShingles.size + existingShingles.size - intersection;
          return union > 0 && intersection / union >= similarityThreshold;
        });
      if (isNearDup) {
        nearDuplicateIdsSkipped.push(id);
        continue;
      }

      const traceCheck = validateQwenDistillationTrace(rec.distillationTrace);
      if (!traceCheck.valid) {
        throw new Error(
          `Invalid distillation trace on item "${id}": ${traceCheck.issues.join("; ")}`,
        );
      }

      seenIds.add(id);
      seenStemFingerprints.add(stemFp);
      acceptedShinglesPool.push(candShingles);
      mergedRecords.push(rec);
    }
  }

  // Sort merged records deterministically by item ID
  mergedRecords.sort((a, b) => a.bankItem.id.localeCompare(b.bankItem.id));

  // Resolve union-find connected components over {conceptId::templateArchetype, source::sourceParentId}
  // and enforce lockHeldOut immutability on frozen manifests across all merged shards
  const batchSplitAssignments = assignSplitsForBatch(
    mergedRecords.map((rec) => ({
      id: rec.bankItem.id,
      conceptId: rec.bankItem.provenance.conceptId,
      templateArchetype: rec.bankItem.provenance.templateArchetype,
      sourceParentId: rec.bankItem.provenance.sourceParentId,
    })),
    {
      frozenManifest: options.frozenManifest,
    },
  );

  for (let idx = 0; idx < mergedRecords.length; idx += 1) {
    const rec = mergedRecords[idx];
    const id = rec.bankItem.id;
    const assigned = batchSplitAssignments.get(id)!;
    const canonicalFamilyKey = assigned.familyGroupKey;

    const recordSplit = rec.distillationTrace.split;
    const provenanceSplit = rec.bankItem.provenance.split;
    if (recordSplit !== provenanceSplit) {
      throw new Error(
        `Internal split mismatch on item "${id}": distillationTrace="${recordSplit}" vs provenance="${provenanceSplit}"`,
      );
    }

    // Allow compile-time split routing ONLY when:
    // 1) lockHeldOut routes a newly added post-freeze shard's unseen family to "train", or
    // 2) cross-shard union-find unifies connected components across shared sourceParentId, or
    // 3) legacy "source::..." familyGroupKey is canonicalized to "conceptId::templateArchetype"
    const canRouteAtCompileTime =
      assigned.routedUnseenPostFreezeToTrain ||
      assigned.componentPrimaryKey !== canonicalFamilyKey ||
      rec.bankItem.familyGroupKey !== canonicalFamilyKey;

    if (recordSplit !== assigned.split) {
      if (!canRouteAtCompileTime) {
        const expectedStandalone = assignSplit(canonicalFamilyKey, {
          frozenManifest: options.frozenManifest,
        });
        throw new Error(
          `Split mismatch on item "${id}" (familyGroupKey="${canonicalFamilyKey}"): record has "${recordSplit}", expected "${expectedStandalone}"`,
        );
      }
    }

    if (
      recordSplit !== assigned.split ||
      rec.bankItem.familyGroupKey !== canonicalFamilyKey
    ) {
      mergedRecords[idx] = {
        ...rec,
        bankItem: {
          ...rec.bankItem,
          familyGroupKey: canonicalFamilyKey,
          provenance: {
            ...rec.bankItem.provenance,
            familyGroupKey: canonicalFamilyKey,
            split: assigned.split,
          },
        },
        distillationTrace: {
          ...rec.distillationTrace,
          familyGroupKey: canonicalFamilyKey,
          split: assigned.split,
        },
      };
    }
  }

  if (totalCandidatesAttempted === 0) {
    totalCandidatesAttempted = mergedRecords.length;
    totalVerifiedInShards = mergedRecords.length;
  }

  // Enforce zero train/val/test split contamination across the entire compiled bank
  const auditRecords: SplitAuditRecord[] = mergedRecords.map((rec) => ({
    id: rec.bankItem.id,
    familyGroupKey: rec.bankItem.familyGroupKey,
    split: rec.distillationTrace.split,
    conceptId: rec.bankItem.provenance.conceptId,
    templateArchetype: rec.bankItem.provenance.templateArchetype,
    sourceParentId: rec.bankItem.provenance.sourceParentId,
    stemFingerprint: rec.bankItem.provenance.stemFingerprint,
  }));

  const contaminationReport = verifyZeroSplitContamination(
    auditRecords,
    options.frozenManifest,
  );
  if (!contaminationReport.valid) {
    throw new Error(
      `Split contamination detected during bank compilation: ${contaminationReport.violations.map((v) => v.message).join("; ")}`,
    );
  }

  const resolvedOutDir = path.resolve(options.outDir);
  const resolvedShardsDir = path.resolve(options.shardsDir);
  if (resolvedOutDir === resolvedShardsDir) {
    throw new Error(
      `outDir and shardsDir must not be the same directory: ${resolvedOutDir}`,
    );
  }
  const shardsInsideOutDir = resolvedShardsDir.startsWith(
    `${resolvedOutDir}${path.sep}`,
  );

  // Prepare clean staging directory and move into place atomically
  fs.mkdirSync(path.dirname(resolvedOutDir), { recursive: true });
  const stagingDir = fs.mkdtempSync(`${resolvedOutDir}.staging-`);
  const fileReceipts: CompiledFileReceipt[] = [];

  try {
    const allBankItems = mergedRecords.map((r) => r.bankItem);

    // 1. Static site bundles (`bank/`)
    writeTrackedFile(
      stagingDir,
      "bank/all-items.json",
      JSON.stringify(allBankItems, null, 2) + "\n",
      allBankItems.length,
      fileReceipts,
    );

    const syllabusCatalog: Record<
      SyllabusId,
      {
        bundlePath: string;
        count: number;
        topics: Record<string, { bundlePath: string; count: number }>;
      }
    > = {
      ib: { bundlePath: "bank/by-syllabus/ib.json", count: 0, topics: {} },
      alevel: {
        bundlePath: "bank/by-syllabus/alevel.json",
        count: 0,
        topics: {},
      },
      ncuk: { bundlePath: "bank/by-syllabus/ncuk.json", count: 0, topics: {} },
    };

    const coverageBySyllabus: CompiledBankSummary["coverageBySyllabus"] = {
      ib: {
        total: 0,
        byLevel: {},
        byFormat: { mcq: 0, structured: 0 },
        byDifficulty: { foundation: 0, standard: 0, higher: 0 },
        byTopic: {},
      },
      alevel: {
        total: 0,
        byLevel: {},
        byFormat: { mcq: 0, structured: 0 },
        byDifficulty: { foundation: 0, standard: 0, higher: 0 },
        byTopic: {},
      },
      ncuk: {
        total: 0,
        byLevel: {},
        byFormat: { mcq: 0, structured: 0 },
        byDifficulty: { foundation: 0, standard: 0, higher: 0 },
        byTopic: {},
      },
    };

    for (const syllabus of SYLLABUS_IDS) {
      const itemsForSyllabus = allBankItems.filter((item) =>
        item.syllabi.some((tag) => tag.syllabus === syllabus),
      );
      syllabusCatalog[syllabus].count = itemsForSyllabus.length;
      writeTrackedFile(
        stagingDir,
        `bank/by-syllabus/${syllabus}.json`,
        JSON.stringify(itemsForSyllabus, null, 2) + "\n",
        itemsForSyllabus.length,
        fileReceipts,
      );

      const byTopicMap = new Map<string, SixthPhysicsBankItem[]>();
      const cov = coverageBySyllabus[syllabus];
      cov.total = itemsForSyllabus.length;

      for (const item of itemsForSyllabus) {
        cov.byFormat[item.format] += 1;
        cov.byDifficulty[item.difficulty] += 1;
        const matchingTags = item.syllabi.filter(
          (tag) => tag.syllabus === syllabus,
        );
        const countedLevels = new Set<string>();
        const countedTopics = new Set<string>();
        for (const tag of matchingTags) {
          if (!countedLevels.has(tag.level)) {
            countedLevels.add(tag.level);
            cov.byLevel[tag.level] = (cov.byLevel[tag.level] ?? 0) + 1;
          }
          if (!countedTopics.has(tag.topicId)) {
            countedTopics.add(tag.topicId);
            cov.byTopic[tag.topicId] = (cov.byTopic[tag.topicId] ?? 0) + 1;
            const list = byTopicMap.get(tag.topicId) ?? [];
            list.push(item);
            byTopicMap.set(tag.topicId, list);
          }
        }
      }

      for (const topicId of [...byTopicMap.keys()].sort()) {
        const topicItems = byTopicMap.get(topicId)!;
        const slug = sanitizePathSlug(topicId);
        const relPath = `bank/by-syllabus/${syllabus}/${slug}.json`;
        syllabusCatalog[syllabus].topics[topicId] = {
          bundlePath: relPath,
          count: topicItems.length,
        };
        writeTrackedFile(
          stagingDir,
          relPath,
          JSON.stringify(topicItems, null, 2) + "\n",
          topicItems.length,
          fileReceipts,
        );
      }
    }

    // Domain bundles
    const byDomainMap = new Map<string, SixthPhysicsBankItem[]>();
    const coverageByDomain: CompiledBankSummary["coverageByDomain"] = {};
    for (const item of allBankItems) {
      const dom = item.provenance.domain;
      const list = byDomainMap.get(dom) ?? [];
      list.push(item);
      byDomainMap.set(dom, list);
      const entry = coverageByDomain[dom] ?? {
        total: 0,
        mcq: 0,
        structured: 0,
        visualFamily: item.visualFamily,
      };
      entry.total += 1;
      entry[item.format] += 1;
      coverageByDomain[dom] = entry;
    }

    const domainCatalog: Record<string, { bundlePath: string; count: number }> =
      {};
    for (const dom of [...byDomainMap.keys()].sort()) {
      const domItems = byDomainMap.get(dom)!;
      const relPath = `bank/by-domain/${sanitizePathSlug(dom)}.json`;
      domainCatalog[dom] = { bundlePath: relPath, count: domItems.length };
      writeTrackedFile(
        stagingDir,
        relPath,
        JSON.stringify(domItems, null, 2) + "\n",
        domItems.length,
        fileReceipts,
      );
    }

    const staticSiteIndex = {
      schemaVersion: "sixthphysics-static-bank-index/1.0.0",
      compiledAt,
      totalItems: allBankItems.length,
      syllabi: syllabusCatalog,
      domains: domainCatalog,
    };
    writeTrackedFile(
      stagingDir,
      "bank/index.json",
      JSON.stringify(staticSiteIndex, null, 2) + "\n",
      allBankItems.length,
      fileReceipts,
    );

    // 2. Qwen/Qwen3.5-9B Distillation JSONLs (`distillation/train.jsonl`, `val.jsonl`, `test.jsonl`)
    const tracesBySplit: Record<DatasetSplit, QwenDistillationTrace[]> = {
      train: [],
      val: [],
      test: [],
    };
    for (const rec of mergedRecords) {
      tracesBySplit[rec.distillationTrace.split].push(rec.distillationTrace);
    }

    for (const split of ["train", "val", "test"] as const) {
      const splitTraces = tracesBySplit[split];
      const jsonl =
        splitTraces.length > 0
          ? splitTraces.map((t) => JSON.stringify(t)).join("\n") + "\n"
          : "";
      writeTrackedFile(
        stagingDir,
        `distillation/${split}.jsonl`,
        jsonl,
        splitTraces.length,
        fileReceipts,
      );
    }

    const emittedFrozenManifest =
      options.frozenManifest ??
      createFrozenEvaluationManifest(auditRecords, {
        createdAt: compiledAt,
        lockHeldOut: options.lockHeldOut ?? true,
      });
    const serializedFrozen = serializeFrozenManifest(emittedFrozenManifest);
    const frozenGroupCount = Object.keys(
      emittedFrozenManifest.frozenGroups,
    ).length;
    writeTrackedFile(
      stagingDir,
      "distillation/frozen-eval-manifest.json",
      serializedFrozen,
      frozenGroupCount,
      fileReceipts,
    );
    writeTrackedFile(
      stagingDir,
      "frozen-eval-manifest.json",
      serializedFrozen,
      frozenGroupCount,
      fileReceipts,
    );

    const overallPassRate =
      totalCandidatesAttempted > 0
        ? Number((totalVerifiedInShards / totalCandidatesAttempted).toFixed(4))
        : 1;

    const summary: CompiledBankSummary = {
      schemaVersion: COMPILED_BANK_SUMMARY_SCHEMA_VERSION,
      compiledAt,
      targetDistillationModel: "Qwen/Qwen3.5-9B",
      shardsProcessed,
      attemptMetrics: {
        totalCandidatesAttempted,
        totalVerifiedInShards,
        totalRejectedInAttempts,
        overallPassRate,
        rejectionCountsByCode,
      },
      deduplication: {
        duplicateIdsSkipped,
        nearDuplicateIdsSkipped,
      },
      totalCompiledItems: allBankItems.length,
      newPostFreezeFamiliesRoutedToTrain:
        contaminationReport.newPostFreezeFamiliesRoutedToTrain,
      splitSummary: {
        ...contaminationReport,
        zeroContaminationVerified: contaminationReport.valid,
      },
      coverageBySyllabus,
      coverageByDomain,
      files: fileReceipts,
    };

    fs.writeFileSync(
      path.join(stagingDir, "SUMMARY.json"),
      JSON.stringify(summary, null, 2) + "\n",
      "utf8",
    );

    if (shardsInsideOutDir) {
      fs.mkdirSync(resolvedOutDir, { recursive: true });
      for (const entryName of fs.readdirSync(stagingDir)) {
        const destPath = path.join(resolvedOutDir, entryName);
        if (fs.existsSync(destPath)) {
          fs.rmSync(destPath, { recursive: true, force: true });
        }
        fs.renameSync(path.join(stagingDir, entryName), destPath);
      }
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } else {
      if (fs.existsSync(resolvedOutDir)) {
        fs.rmSync(resolvedOutDir, { recursive: true, force: true });
      }
      fs.renameSync(stagingDir, resolvedOutDir);
    }

    if (options.emitFrozenManifestPath) {
      const resolvedEmitFrozen = path.resolve(options.emitFrozenManifestPath);
      const topLevelFrozen = path.join(
        resolvedOutDir,
        "frozen-eval-manifest.json",
      );
      const distFrozen = path.join(
        resolvedOutDir,
        "distillation",
        "frozen-eval-manifest.json",
      );
      if (
        resolvedEmitFrozen !== topLevelFrozen &&
        resolvedEmitFrozen !== distFrozen
      ) {
        fs.mkdirSync(path.dirname(resolvedEmitFrozen), {
          recursive: true,
        });
        fs.writeFileSync(resolvedEmitFrozen, serializedFrozen, "utf8");
      }
    }

    return summary;
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}
