import fs from "node:fs";
import path from "node:path";

import {
  compileBankFromShards,
  FrozenEvaluationManifest,
  generateDomainShardBatches,
  ingestCandidatesIntoShard,
  parseFrozenManifest,
  PHYSICS_DOMAIN_IDS,
  PhysicsDomainId,
  shardAttemptsPath,
  shardJsonlPath,
} from "../../lib/bank-pipeline";

export const DEFAULT_BANK_ROOT_RELATIVE_DIR = "dataset/sixthphysics-bank";

export interface ParsedGenerateFullBankArgs {
  outDir: string;
  shardsDir: string;
  domains: PhysicsDomainId[];
  countPerDomain?: number;
  seedOffset?: number;
  mcqRatio?: number;
  generatorModel?: string;
  frozenManifestPath?: string;
  emitFrozenManifestPath?: string;
  lockHeldOut: boolean;
  cleanShards: boolean;
  shardsOnly: boolean;
  dryRun: boolean;
  help: boolean;
}

function printUsage(): void {
  const usage = [
    "Usage:",
    "  npx tsx scripts/bank-generation/generate-full-bank.ts [options]",
    "",
    "Options:",
    "  --out-dir <dir>                Output root directory for compiled bank (default: dataset/sixthphysics-bank)",
    "  --shards-dir <dir>             Shards directory (default: <out-dir>/shards)",
    "  --domains <d1,d2,...>          Comma-separated subset of domains (default: all 11 domains)",
    "  --count-per-domain <n>         Optional item count override per domain (default: full 3,644-item bank)",
    "  --seed-offset <int>            Optional integer offset added to each domain seed",
    "  --mcq-ratio <0..1>             Optional MCQ ratio override across domains",
    "  --generator-model <id>         Optional provenance generatorModel override",
    "  --frozen-manifest <path>       Existing frozen evaluation manifest to enforce",
    "  --emit-frozen-manifest <path>  Optional extra copy path for emitted frozen evaluation manifest",
    "  --lock-held-out                Lock val/test held-out splits in emitted manifest (default: true)",
    "  --no-lock-held-out             Allow unlocked held-out splits in emitted manifest",
    "  --clean-shards                 Remove existing target shard files before regenerating",
    "  --shards-only                  Verify and write shards without compiling bank bundles",
    "  --dry-run                      Generate and gate-verify all candidates in memory without writing files",
    "  --help                         Show this usage message",
  ].join("\n");
  console.log(usage);
}

function parseDomainsCsv(raw: string): PhysicsDomainId[] {
  const allowed = new Set<string>(PHYSICS_DOMAIN_IDS);
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error("--domains must specify at least one valid domain");
  }
  const result: PhysicsDomainId[] = [];
  for (const part of parts) {
    if (!allowed.has(part)) {
      throw new Error(
        `Invalid domain "${part}". Expected one of: ${PHYSICS_DOMAIN_IDS.join(", ")}`,
      );
    }
    const dom = part as PhysicsDomainId;
    if (!result.includes(dom)) {
      result.push(dom);
    }
  }
  return result;
}

export function parseGenerateFullBankCliArgs(
  argv: readonly string[],
): ParsedGenerateFullBankArgs {
  const defaultOutDir = path.resolve(
    process.cwd(),
    DEFAULT_BANK_ROOT_RELATIVE_DIR,
  );
  let explicitShardsDir: string | undefined;

  const parsed: ParsedGenerateFullBankArgs = {
    outDir: defaultOutDir,
    shardsDir: path.join(defaultOutDir, "shards"),
    domains: [...PHYSICS_DOMAIN_IDS],
    lockHeldOut: true,
    cleanShards: false,
    shardsOnly: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--lock-held-out") {
      parsed.lockHeldOut = true;
    } else if (arg === "--no-lock-held-out") {
      parsed.lockHeldOut = false;
    } else if (arg === "--clean-shards") {
      parsed.cleanShards = true;
    } else if (arg === "--shards-only") {
      parsed.shardsOnly = true;
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--out-dir") {
      const val = argv[i + 1];
      if (!val) throw new Error("--out-dir requires a directory path");
      parsed.outDir = path.resolve(process.cwd(), val);
      i += 1;
    } else if (arg === "--shards-dir") {
      const val = argv[i + 1];
      if (!val) throw new Error("--shards-dir requires a directory path");
      explicitShardsDir = path.resolve(process.cwd(), val);
      i += 1;
    } else if (arg === "--domains") {
      const val = argv[i + 1];
      if (!val) throw new Error("--domains requires a comma-separated list");
      parsed.domains = parseDomainsCsv(val);
      i += 1;
    } else if (arg === "--count-per-domain") {
      const val = argv[i + 1];
      if (!val) throw new Error("--count-per-domain requires a positive integer");
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`--count-per-domain must be an integer >= 1; received "${val}"`);
      }
      parsed.countPerDomain = n;
      i += 1;
    } else if (arg === "--seed-offset") {
      const val = argv[i + 1];
      if (!val) throw new Error("--seed-offset requires an integer");
      const n = Number(val);
      if (!Number.isInteger(n)) {
        throw new Error(`--seed-offset must be an integer; received "${val}"`);
      }
      parsed.seedOffset = n;
      i += 1;
    } else if (arg === "--mcq-ratio") {
      const val = argv[i + 1];
      if (!val) throw new Error("--mcq-ratio requires a number in [0, 1]");
      const ratio = Number(val);
      if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
        throw new Error(`--mcq-ratio must lie in [0, 1]; received "${val}"`);
      }
      parsed.mcqRatio = ratio;
      i += 1;
    } else if (arg === "--generator-model") {
      const val = argv[i + 1];
      if (!val) throw new Error("--generator-model requires a model identifier");
      parsed.generatorModel = val;
      i += 1;
    } else if (arg === "--frozen-manifest") {
      const val = argv[i + 1];
      if (!val) throw new Error("--frozen-manifest requires a file path");
      parsed.frozenManifestPath = path.resolve(process.cwd(), val);
      i += 1;
    } else if (arg === "--emit-frozen-manifest") {
      const val = argv[i + 1];
      if (!val) throw new Error("--emit-frozen-manifest requires a file path");
      parsed.emitFrozenManifestPath = path.resolve(process.cwd(), val);
      i += 1;
    } else {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
  }

  parsed.shardsDir = explicitShardsDir ?? path.join(parsed.outDir, "shards");
  return parsed;
}

export function runGenerateFullBankCli(argv: readonly string[]): number {
  const args = parseGenerateFullBankCliArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  let frozenManifest: FrozenEvaluationManifest | undefined;
  if (args.frozenManifestPath) {
    frozenManifest = parseFrozenManifest(
      fs.readFileSync(args.frozenManifestPath, "utf8"),
    );
  }

  const batches = generateDomainShardBatches({
    domains: args.domains,
    countPerDomain: args.countPerDomain,
    seedOffset: args.seedOffset,
    mcqRatio: args.mcqRatio,
    generatorModel: args.generatorModel,
  });

  const shardReports: Array<{
    domain: PhysicsDomainId;
    shardId: string;
    totalCandidates: number;
    ingestedCount: number;
    alreadyPresentCount: number;
    rejectedCount: number;
  }> = [];

  let totalRejected = 0;

  for (const batch of batches) {
    if (args.cleanShards && !args.dryRun) {
      const shardFile = shardJsonlPath(args.shardsDir, batch.shardId);
      const attemptsFile = shardAttemptsPath(args.shardsDir, batch.shardId);
      if (fs.existsSync(shardFile)) {
        fs.rmSync(shardFile, { force: true });
      }
      if (fs.existsSync(attemptsFile)) {
        fs.rmSync(attemptsFile, { force: true });
      }
    }

    const ingestSummary = ingestCandidatesIntoShard({
      shardId: batch.shardId,
      shardsDir: args.shardsDir,
      candidates: batch.candidates,
      frozenManifest,
      dryRun: args.dryRun,
    });

    totalRejected += ingestSummary.rejectedCount;
    shardReports.push({
      domain: batch.domain,
      shardId: batch.shardId,
      totalCandidates: ingestSummary.totalCandidates,
      ingestedCount: ingestSummary.ingestedCount,
      alreadyPresentCount: ingestSummary.alreadyPresentCount,
      rejectedCount: ingestSummary.rejectedCount,
    });
  }

  if (totalRejected > 0) {
    console.error(
      JSON.stringify(
        {
          error: `Rejected ${totalRejected} candidate(s) during shard verification`,
          shardReports,
        },
        null,
        2,
      ),
    );
    return 1;
  }

  if (args.dryRun || args.shardsOnly) {
    console.log(
      JSON.stringify(
        {
          mode: args.dryRun ? "dry-run" : "shards-only",
          shardsDir: args.shardsDir,
          domainsGenerated: batches.length,
          totalCandidates: batches.reduce(
            (sum, b) => sum + b.candidates.length,
            0,
          ),
          shardReports,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const compiledSummary = compileBankFromShards({
    shardsDir: args.shardsDir,
    outDir: args.outDir,
    frozenManifest,
    emitFrozenManifestPath: args.emitFrozenManifestPath,
    lockHeldOut: args.lockHeldOut,
  });

  console.log(
    JSON.stringify(
      {
        outDir: args.outDir,
        shardsDir: args.shardsDir,
        summaryPath: path.join(args.outDir, "SUMMARY.json"),
        frozenManifestPath: path.join(args.outDir, "frozen-eval-manifest.json"),
        shardsProcessed: compiledSummary.shardsProcessed.length,
        totalCompiledItems: compiledSummary.totalCompiledItems,
        overallPassRate: compiledSummary.attemptMetrics.overallPassRate,
        splitItemCounts: compiledSummary.splitSummary.itemCounts,
        splitGroupCounts: compiledSummary.splitSummary.groupCounts,
        zeroContaminationVerified:
          compiledSummary.splitSummary.zeroContaminationVerified,
        deduplication: compiledSummary.deduplication,
        shardReports,
      },
      null,
      2,
    ),
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runGenerateFullBankCli(process.argv.slice(2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}
