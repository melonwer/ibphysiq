import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  buildFamilyGroupKey,
  buildQwenDistillationTrace,
  buildSourceGroupKey,
  CandidateQuestionInput,
  compileBankFromShards,
  computeShingleSet,
  computeStemFingerprint,
  DOMAIN_SHARD_ID_MAP,
  FrozenEvaluationManifest,
  generateDomainCandidates,
  generateEmInductionCandidates,
  generateFieldsCandidates,
  generateGraphsCandidates,
  generatePureCalculationCandidates,
  generateQuantumNuclearCandidates,
  getDomainAdapter,
  ingestCandidatesIntoShard,
  McqOptionItem,
  parseFrozenManifest,
  PHYSICS_DOMAIN_IDS,
  PhysicsDomainId,
  PURE_CALCULATION_ARCHETYPE_REGISTRY,
  readShardRecords,
  shardAttemptsPath,
  shardJsonlPath,
  SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
  SixthPhysicsBankItem,
  validateQwenDistillationTrace,
  verifyCandidateWithGate,
} from "../../lib/bank-pipeline";
import {
  buildDeterministicDomainToolSchemas,
} from "./export-domain-schemas";

export const EXPECTED_FROZEN_MANIFEST_SHA256 =
  "0a0d1bc071c8250107864a4dc7db44575c4d8e5f1c56978ade15b64f124c4c67" as const;
export const EXPECTED_TEST_JSONL_SHA256 =
  "fd6888e53f0c98ccd0b5f792e1f6bf223f6067ef400b270dd2cb9463310b1252" as const;
export const EXPECTED_VAL_JSONL_SHA256 =
  "a094cab46b48ea1c08300ed172fc13d8660a0a1cc5fe1021e273552d1ac6c846" as const;

export const DEFAULT_SOURCE_BANK_DIR = "dataset/sixthphysics-bank";
export const DEFAULT_V2_BANK_OUT_DIR = "dataset/sixthphysics-bank-v2";
export const V2_SEED_BASE = 50_000_000;
export const V2_SEED_DOMAIN_STRIDE = 1_000_000;

const EXPANSION_SHARD_ID_MAP: Readonly<Record<PhysicsDomainId, string>> = {
  graphs: "v2-exp-graphs",
  circuits: "v2-exp-circuits",
  fields: "v2-exp-fields",
  mechanics: "v2-exp-mechanics",
  waves: "v2-exp-waves",
  "optics-shm": "v2-exp-optics-shm",
  thermal: "v2-exp-thermal",
  "grav-astro": "v2-exp-grav-astro",
  "em-induction": "v2-exp-em-induction",
  "quantum-nuclear": "v2-exp-quantum-nuclear",
  "pure-calculation": "v2-exp-pure-calc",
};

export interface ParsedExpandBankV2Args {
  sourceBankDir: string;
  outDir: string;
  maxNewPerDomain: number;
  minTotalItems: number;
  minTrainTraces: number;
  generatorModel: string;
  nearDuplicateThreshold: number;
  help: boolean;
}

function printUsage(): void {
  const usage = [
    "Usage:",
    "  npx tsx scripts/bank-generation/expand-bank-v2.ts [options]",
    "",
    "Options:",
    `  --source-dir <dir>         Source locked v1 bank directory (default: ${DEFAULT_SOURCE_BANK_DIR})`,
    `  --out-dir <dir>            Target v2 expanded bank directory (default: ${DEFAULT_V2_BANK_OUT_DIR})`,
    "  --max-new-per-domain <n>   Cap of new train-split items per domain (default: 420)",
    "  --min-total-items <n>      Minimum total compiled bank items to assert (default: 7200)",
    "  --min-train-traces <n>     Minimum train.jsonl traces to assert (default: 5900)",
    "  --generator-model <id>     Provenance generator model tag (default: gemini-4-carbon-high)",
    "  --help                     Show this usage message",
  ].join("\n");
  console.log(usage);
}

export function parseExpandBankV2Args(
  argv: readonly string[],
): ParsedExpandBankV2Args {
  const parsed: ParsedExpandBankV2Args = {
    sourceBankDir: path.resolve(process.cwd(), DEFAULT_SOURCE_BANK_DIR),
    outDir: path.resolve(process.cwd(), DEFAULT_V2_BANK_OUT_DIR),
    maxNewPerDomain: 420,
    minTotalItems: 7200,
    minTrainTraces: 5900,
    generatorModel: "gemini-4-carbon-high",
    nearDuplicateThreshold: 0.9,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--source-dir") {
      const next = argv[i + 1];
      if (!next) throw new Error("--source-dir requires a directory path");
      parsed.sourceBankDir = path.resolve(process.cwd(), next);
      i += 1;
    } else if (arg === "--out-dir") {
      const next = argv[i + 1];
      if (!next) throw new Error("--out-dir requires a directory path");
      parsed.outDir = path.resolve(process.cwd(), next);
      i += 1;
    } else if (arg === "--max-new-per-domain") {
      const next = argv[i + 1];
      const n = Number(next);
      if (!next || !Number.isInteger(n) || n < 1) {
        throw new Error("--max-new-per-domain requires a positive integer");
      }
      parsed.maxNewPerDomain = n;
      i += 1;
    } else if (arg === "--min-total-items") {
      const next = argv[i + 1];
      const n = Number(next);
      if (!next || !Number.isInteger(n) || n < 1) {
        throw new Error("--min-total-items requires a positive integer");
      }
      parsed.minTotalItems = n;
      i += 1;
    } else if (arg === "--min-train-traces") {
      const next = argv[i + 1];
      const n = Number(next);
      if (!next || !Number.isInteger(n) || n < 1) {
        throw new Error("--min-train-traces requires a positive integer");
      }
      parsed.minTrainTraces = n;
      i += 1;
    } else if (arg === "--generator-model") {
      const next = argv[i + 1];
      if (!next) throw new Error("--generator-model requires a string");
      parsed.generatorModel = next;
      i += 1;
    } else {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
  }

  return parsed;
}

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function hasHighShingleSimilarity(
  candidateShingles: ReadonlySet<string>,
  pool: readonly ReadonlySet<string>[],
  threshold: number,
): boolean {
  for (const existing of pool) {
    if (candidateShingles.size === 0 && existing.size === 0) {
      if (1 >= threshold) return true;
      continue;
    }
    if (candidateShingles.size === 0 || existing.size === 0) {
      continue;
    }
    const minSize = Math.min(candidateShingles.size, existing.size);
    const maxSize = Math.max(candidateShingles.size, existing.size);
    if (minSize < threshold * maxSize) {
      continue;
    }
    const smaller =
      candidateShingles.size <= existing.size ? candidateShingles : existing;
    const larger =
      candidateShingles.size <= existing.size ? existing : candidateShingles;
    let intersection = 0;
    for (const token of smaller) {
      if (larger.has(token)) {
        intersection += 1;
      }
    }
    const union = candidateShingles.size + existing.size - intersection;
    if (union > 0 && intersection / union >= threshold) {
      return true;
    }
  }
  return false;
}

function synthesizeRawDomainProposals(
  domain: PhysicsDomainId,
  frozenManifest: FrozenEvaluationManifest,
  generatorModel: string,
): CandidateQuestionInput[] {
  switch (domain) {
    case "graphs":
      return generateGraphsCandidates({
        count: 1120,
        seed: 50_261_117,
        idPrefix: "v2-raw-graphs",
      });
    case "fields":
      return generateFieldsCandidates({
        count: 1120,
        baseSeed: 52_000_000,
        generatorModel,
      });
    case "em-induction":
      return generateEmInductionCandidates({
        count: 480,
        baseSeed: 58_000_000,
      });
    case "quantum-nuclear":
      return generateQuantumNuclearCandidates({
        count: 640,
        baseSeed: 59_000_000,
        nearDuplicateThreshold: 0.895,
        generatorModel,
      });
    case "pure-calculation": {
      const trainArchetypes = PURE_CALCULATION_ARCHETYPE_REGISTRY.filter(
        (arch) => {
          const fg = buildFamilyGroupKey({
            conceptId: arch.conceptId,
            templateArchetype: arch.templateArchetype,
          });
          return frozenManifest.frozenGroups[fg] === "train";
        },
      ).map((arch) => arch.templateArchetype);
      return generatePureCalculationCandidates({
        totalCount: 380,
        baseSeed: 60_000_000,
        idPrefix: "v2-raw-pc",
        archetypes: trainArchetypes,
        generatorModel,
      });
    }
    case "circuits":
    case "thermal":
    case "grav-astro": {
      const offsets = [30_000_003, 31_000_033, 32_000_099];
      return offsets.flatMap((seedOffset) =>
        generateDomainCandidates(domain, {
          seedOffset,
          generatorModel,
        }),
      );
    }
    case "mechanics":
    case "waves":
    case "optics-shm": {
      const offsets = [30_000_003, 31_000_033];
      return offsets.flatMap((seedOffset) =>
        generateDomainCandidates(domain, {
          seedOffset,
          generatorModel,
        }),
      );
    }
    default: {
      const exhaustive: never = domain;
      throw new Error(`Unhandled domain: ${String(exhaustive)}`);
    }
  }
}

export function runExpandBankV2Cli(argv: readonly string[]): number {
  const args = parseExpandBankV2Args(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  if (path.resolve(args.sourceBankDir) === path.resolve(args.outDir)) {
    throw new Error(
      "--source-dir and --out-dir must be distinct so concurrent readers of dataset/sixthphysics-bank/ are undisturbed",
    );
  }

  const srcManifestPath = path.join(
    args.sourceBankDir,
    "frozen-eval-manifest.json",
  );
  const srcShardsDir = path.join(args.sourceBankDir, "shards");
  if (!fs.existsSync(srcManifestPath)) {
    throw new Error(`Missing source frozen manifest: ${srcManifestPath}`);
  }
  if (!fs.existsSync(srcShardsDir)) {
    throw new Error(`Missing source shards directory: ${srcShardsDir}`);
  }

  const srcManifestSha = sha256File(srcManifestPath);
  if (srcManifestSha !== EXPECTED_FROZEN_MANIFEST_SHA256) {
    throw new Error(
      `Source frozen-eval-manifest.json SHA-256 mismatch: expected ${EXPECTED_FROZEN_MANIFEST_SHA256}, got ${srcManifestSha}`,
    );
  }

  const frozenManifest = parseFrozenManifest(
    fs.readFileSync(srcManifestPath, "utf8"),
  );
  if (!frozenManifest.lockHeldOut) {
    throw new Error("Source frozen-eval-manifest.json must have lockHeldOut: true");
  }

  // 1. Copy frozen-eval-manifest.json and all base Wave 2 shards into outDir
  const v2ShardsDir = path.join(args.outDir, "shards");
  fs.mkdirSync(v2ShardsDir, { recursive: true });
  const dstManifestPath = path.join(args.outDir, "frozen-eval-manifest.json");
  fs.copyFileSync(srcManifestPath, dstManifestPath);

  for (const fileName of fs.readdirSync(srcShardsDir).sort()) {
    if (fileName.endsWith(".jsonl")) {
      fs.copyFileSync(
        path.join(srcShardsDir, fileName),
        path.join(v2ShardsDir, fileName),
      );
    }
  }

  // Ensure domain-tool-schemas.json is present in outDir
  const domainSchemasPath = path.join(args.outDir, "domain-tool-schemas.json");
  if (!fs.existsSync(domainSchemasPath)) {
    const doc = buildDeterministicDomainToolSchemas();
    fs.writeFileSync(
      domainSchemasPath,
      JSON.stringify(doc, null, 2) + "\n",
      "utf8",
    );
  }

  // 2. Index all 3,644 base items across all shards for global zero-dup & zero-leakage checks
  const seenIds = new Set<string>();
  const seenSeeds = new Set<number>();
  const seenStemFingerprints = new Set<string>();
  const globalShinglesPool: Array<ReadonlySet<string>> = [];
  const heldOutGroups = new Set<string>();

  for (const [groupKey, split] of Object.entries(frozenManifest.frozenGroups)) {
    if (split === "val" || split === "test") {
      heldOutGroups.add(groupKey);
    }
  }

  let baseItemsCount = 0;
  for (const domain of PHYSICS_DOMAIN_IDS) {
    const baseShardId = DOMAIN_SHARD_ID_MAP[domain];
    const records = readShardRecords(v2ShardsDir, baseShardId);
    for (const rec of records) {
      baseItemsCount += 1;
      seenIds.add(rec.bankItem.id);
      seenSeeds.add(rec.bankItem.provenance.seed);
      seenStemFingerprints.add(rec.bankItem.provenance.stemFingerprint);
      globalShinglesPool.push(computeShingleSet(rec.bankItem.stem));
      if (
        rec.distillationTrace.split === "val" ||
        rec.distillationTrace.split === "test"
      ) {
        heldOutGroups.add(rec.bankItem.familyGroupKey);
        const srcKey = buildSourceGroupKey(rec.bankItem.provenance.sourceParentId);
        if (srcKey) {
          heldOutGroups.add(srcKey);
        }
      }
    }
  }

  // 3. Generate, strictly filter to train-split familyGroupKeys, gate-verify, and ingest per domain
  const expansionReports: Array<{
    domain: PhysicsDomainId;
    shardId: string;
    rawProposals: number;
    ingestedCount: number;
    rejectedCount: number;
    seedRange: [number, number] | null;
  }> = [];

  for (let dIdx = 0; dIdx < PHYSICS_DOMAIN_IDS.length; dIdx += 1) {
    const domain = PHYSICS_DOMAIN_IDS[dIdx];
    const expShardId = EXPANSION_SHARD_ID_MAP[domain];

    // Clean any previous v2 expansion shard so re-runs are 100% deterministic
    const expShardFile = shardJsonlPath(v2ShardsDir, expShardId);
    const expAttemptsFile = shardAttemptsPath(v2ShardsDir, expShardId);
    if (fs.existsSync(expShardFile)) fs.rmSync(expShardFile, { force: true });
    if (fs.existsSync(expAttemptsFile)) fs.rmSync(expAttemptsFile, { force: true });

    const rawProposals = synthesizeRawDomainProposals(
      domain,
      frozenManifest,
      args.generatorModel,
    );

    const verifiedDomainBatch: CandidateQuestionInput[] = [];
    let seqInDomain = 0;
    let minSeed = Number.POSITIVE_INFINITY;
    let maxSeed = Number.NEGATIVE_INFINITY;

    for (const raw of rawProposals) {
      if (verifiedDomainBatch.length >= args.maxNewPerDomain) {
        break;
      }

      const familyGroupKey = buildFamilyGroupKey({
        conceptId: raw.conceptId,
        templateArchetype: raw.templateArchetype,
        sourceParentId: raw.sourceParentId,
      });
      const sourceGroupKey = buildSourceGroupKey(raw.sourceParentId);

      // STRICT ISOLATION: ONLY locked train-split familyGroupKeys (never val/test or connected source!)
      if (
        frozenManifest.frozenGroups[familyGroupKey] !== "train" ||
        heldOutGroups.has(familyGroupKey) ||
        (sourceGroupKey !== undefined && heldOutGroups.has(sourceGroupKey))
      ) {
        continue;
      }

      const stemFp = computeStemFingerprint(raw.stem);
      if (seenStemFingerprints.has(stemFp)) {
        continue;
      }

      const shingles = computeShingleSet(raw.stem);
      if (
        hasHighShingleSimilarity(
          shingles,
          globalShinglesPool,
          args.nearDuplicateThreshold,
        )
      ) {
        continue;
      }

      seqInDomain += 1;
      let assignedSeed =
        V2_SEED_BASE + dIdx * V2_SEED_DOMAIN_STRIDE + seqInDomain;
      while (seenSeeds.has(assignedSeed)) {
        seqInDomain += 1;
        assignedSeed =
          V2_SEED_BASE + dIdx * V2_SEED_DOMAIN_STRIDE + seqInDomain;
      }

      const fmtSlug = raw.format === "mcq" ? "mcq" : "struct";
      const candidateId = `sp-v2-${domain}-${fmtSlug}-${String(seqInDomain).padStart(4, "0")}`;
      if (seenIds.has(candidateId)) {
        continue;
      }

      const candidate: CandidateQuestionInput = {
        ...raw,
        id: candidateId,
        seed: assignedSeed,
        generatorModel: args.generatorModel,
      };

      const gateExec = verifyCandidateWithGate(candidate, {
        existingShardItems: [],
        nearDuplicateSimilarityThreshold: args.nearDuplicateThreshold,
      });
      if (!gateExec.evaluation.valid || !gateExec.solveOutput) {
        continue;
      }

      const adapter = getDomainAdapter(candidate.domain);
      const visualFamily =
        gateExec.renderOutput?.visualFamily ??
        (gateExec.effectiveSvgMarkup ? adapter.defaultVisualFamily : "none");

      const previewBankItem: SixthPhysicsBankItem = {
        schemaVersion: SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION,
        id: candidate.id,
        familyGroupKey,
        syllabi: candidate.syllabi,
        format: candidate.format,
        difficulty: candidate.difficulty,
        visualFamily,
        stem: candidate.stem.trim(),
        ...(gateExec.effectiveSvgMarkup !== undefined
          ? { svgMarkup: gateExec.effectiveSvgMarkup }
          : {}),
        ...(candidate.format === "mcq" && candidate.options
          ? {
              options: candidate.options as [
                McqOptionItem,
                McqOptionItem,
                McqOptionItem,
                McqOptionItem,
              ],
              correctOptionIndex: gateExec.correctOptionIndex,
            }
          : {}),
        ...(candidate.format === "structured" && candidate.parts
          ? { parts: candidate.parts }
          : {}),
        workedSolution: candidate.workedSolution.trim(),
        markScheme: candidate.markScheme,
        totalMarks: candidate.totalMarks,
        verifiedQuantities: gateExec.solveOutput.quantities,
        provenance: {
          domain: candidate.domain,
          conceptId: candidate.conceptId.trim().toLowerCase(),
          templateArchetype: candidate.templateArchetype.trim().toLowerCase(),
          familyGroupKey,
          seed: candidate.seed,
          shardId: expShardId,
          generatorModel: args.generatorModel,
          solverId: gateExec.solveOutput.solverId,
          ...(gateExec.renderOutput?.rendererVersion
            ? { rendererVersion: gateExec.renderOutput.rendererVersion }
            : {}),
          stemFingerprint: gateExec.evaluation.stemFingerprint,
          ...(gateExec.evaluation.svgFingerprint
            ? { svgFingerprint: gateExec.evaluation.svgFingerprint }
            : {}),
          split: "train",
          ...(candidate.sourceParentId?.trim()
            ? { sourceParentId: candidate.sourceParentId.trim() }
            : {}),
          createdAt: "2026-11-18T10:30:00.000Z",
        },
      };

      const previewTrace = buildQwenDistillationTrace({
        candidate,
        bankItem: previewBankItem,
        split: "train",
        publicVisualLabels: gateExec.renderOutput?.publicLabels,
      });
      if (!validateQwenDistillationTrace(previewTrace).valid) {
        continue;
      }

      seenIds.add(candidate.id);
      seenSeeds.add(candidate.seed);
      seenStemFingerprints.add(gateExec.evaluation.stemFingerprint);
      globalShinglesPool.push(shingles);
      verifiedDomainBatch.push(candidate);
      minSeed = Math.min(minSeed, candidate.seed);
      maxSeed = Math.max(maxSeed, candidate.seed);
    }

    const ingestSummary = ingestCandidatesIntoShard({
      shardId: expShardId,
      shardsDir: v2ShardsDir,
      candidates: verifiedDomainBatch,
      frozenManifest,
      now: () => "2026-11-18T10:30:00.000Z",
      nearDuplicateSimilarityThreshold: args.nearDuplicateThreshold,
    });

    if (ingestSummary.rejectedCount > 0 || ingestSummary.alreadyPresentCount > 0) {
      throw new Error(
        `Unexpected shard ingest issue in ${expShardId}: rejected=${ingestSummary.rejectedCount}, alreadyPresent=${ingestSummary.alreadyPresentCount}`,
      );
    }

    expansionReports.push({
      domain,
      shardId: expShardId,
      rawProposals: rawProposals.length,
      ingestedCount: ingestSummary.ingestedCount,
      rejectedCount: ingestSummary.rejectedCount,
      seedRange:
        verifiedDomainBatch.length > 0 ? [minSeed, maxSeed] : null,
    });
  }

  // 4. Compile full dataset/sixthphysics-bank-v2/ with locked frozen manifest
  const compiledSummary = compileBankFromShards({
    shardsDir: v2ShardsDir,
    outDir: args.outDir,
    frozenManifest,
    lockHeldOut: true,
    compiledAt: "2026-11-18T10:30:00.000Z",
    nearDuplicateSimilarityThreshold: args.nearDuplicateThreshold,
  });

  // 5. Strict post-compile verification of all invariants & byte-for-byte SHA-256 locks
  const v2ManifestSha = sha256File(
    path.join(args.outDir, "frozen-eval-manifest.json"),
  );
  const v2DistManifestSha = sha256File(
    path.join(args.outDir, "distillation", "frozen-eval-manifest.json"),
  );
  const v2TestSha = sha256File(
    path.join(args.outDir, "distillation", "test.jsonl"),
  );
  const v2ValSha = sha256File(
    path.join(args.outDir, "distillation", "val.jsonl"),
  );
  const v2TrainSha = sha256File(
    path.join(args.outDir, "distillation", "train.jsonl"),
  );

  if (
    v2ManifestSha !== EXPECTED_FROZEN_MANIFEST_SHA256 ||
    v2DistManifestSha !== EXPECTED_FROZEN_MANIFEST_SHA256
  ) {
    throw new Error(
      `v2 frozen-eval-manifest.json SHA-256 mismatch: got ${v2ManifestSha} / ${v2DistManifestSha}`,
    );
  }
  if (v2TestSha !== EXPECTED_TEST_JSONL_SHA256) {
    throw new Error(
      `v2 distillation/test.jsonl SHA-256 mismatch: expected ${EXPECTED_TEST_JSONL_SHA256}, got ${v2TestSha}`,
    );
  }
  if (v2ValSha !== EXPECTED_VAL_JSONL_SHA256) {
    throw new Error(
      `v2 distillation/val.jsonl SHA-256 mismatch: expected ${EXPECTED_VAL_JSONL_SHA256}, got ${v2ValSha}`,
    );
  }
  if (!compiledSummary.splitSummary.zeroContaminationVerified) {
    throw new Error("v2 zeroContaminationVerified is false!");
  }
  if (
    compiledSummary.deduplication.duplicateIdsSkipped.length > 0 ||
    compiledSummary.deduplication.nearDuplicateIdsSkipped.length > 0
  ) {
    throw new Error(
      `v2 deduplication skipped items unexpectedly: dupIds=${compiledSummary.deduplication.duplicateIdsSkipped.length}, nearDup=${compiledSummary.deduplication.nearDuplicateIdsSkipped.length}`,
    );
  }
  if (compiledSummary.totalCompiledItems < args.minTotalItems) {
    throw new Error(
      `totalCompiledItems (${compiledSummary.totalCompiledItems}) is below target ${args.minTotalItems}`,
    );
  }
  if (compiledSummary.splitSummary.itemCounts.train < args.minTrainTraces) {
    throw new Error(
      `train.jsonl trace count (${compiledSummary.splitSummary.itemCounts.train}) is below target ${args.minTrainTraces}`,
    );
  }
  if (
    compiledSummary.splitSummary.itemCounts.val !== 645 ||
    compiledSummary.splitSummary.itemCounts.test !== 586
  ) {
    throw new Error(
      `Held-out item counts changed unexpectedly: val=${compiledSummary.splitSummary.itemCounts.val}, test=${compiledSummary.splitSummary.itemCounts.test}`,
    );
  }
  if (!fs.existsSync(domainSchemasPath)) {
    throw new Error(`Missing ${domainSchemasPath} after compilation!`);
  }

  console.log(
    JSON.stringify(
      {
        outDir: args.outDir,
        baseItemsCount,
        newItemsIngested: compiledSummary.totalCompiledItems - baseItemsCount,
        totalCompiledItems: compiledSummary.totalCompiledItems,
        overallPassRate: compiledSummary.attemptMetrics.overallPassRate,
        zeroContaminationVerified:
          compiledSummary.splitSummary.zeroContaminationVerified,
        duplicatesSkipped:
          compiledSummary.deduplication.duplicateIdsSkipped.length +
          compiledSummary.deduplication.nearDuplicateIdsSkipped.length,
        splitItemCounts: compiledSummary.splitSummary.itemCounts,
        splitGroupCounts: compiledSummary.splitSummary.groupCounts,
        sha256Receipts: {
          frozenEvalManifest: v2ManifestSha,
          testJsonl: v2TestSha,
          valJsonl: v2ValSha,
          trainJsonl: v2TrainSha,
        },
        coverageBySyllabus: {
          ib: compiledSummary.coverageBySyllabus.ib.total,
          alevel: compiledSummary.coverageBySyllabus.alevel.total,
          ncuk: compiledSummary.coverageBySyllabus.ncuk.total,
        },
        expansionReports,
      },
      null,
      2,
    ),
  );

  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runExpandBankV2Cli(process.argv.slice(2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}
