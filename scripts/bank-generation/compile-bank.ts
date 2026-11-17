import fs from "node:fs";
import path from "node:path";

import {
  compileBankFromShards,
  DEFAULT_COMPILED_RELATIVE_DIR,
  DEFAULT_SHARDS_RELATIVE_DIR,
  FrozenEvaluationManifest,
  parseFrozenManifest,
} from "../../lib/bank-pipeline";

interface ParsedCompileArgs {
  shardsDir: string;
  outDir: string;
  frozenManifestPath?: string;
  emitFrozenManifestPath?: string;
  help: boolean;
}

function printUsage(): void {
  const usage = [
    "Usage:",
    "  npx tsx scripts/bank-generation/compile-bank.ts [options]",
    "",
    "Options:",
    "  --shards-dir <dir>             Input shards directory (default: dataset/sixthphysics-bank/shards)",
    "  --out-dir <dir>                Output compiled directory (default: dataset/sixthphysics-bank/compiled)",
    "  --frozen-manifest <path>       Existing frozen evaluation manifest to enforce",
    "  --emit-frozen-manifest <path>  Optional extra copy path for emitted frozen evaluation manifest",
    "  --help                         Show this usage message",
  ].join("\n");
  console.log(usage);
}

export function parseCompileCliArgs(
  argv: readonly string[],
): ParsedCompileArgs {
  const parsed: ParsedCompileArgs = {
    shardsDir: path.resolve(process.cwd(), DEFAULT_SHARDS_RELATIVE_DIR),
    outDir: path.resolve(process.cwd(), DEFAULT_COMPILED_RELATIVE_DIR),
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--shards-dir") {
      const val = argv[i + 1];
      if (!val) throw new Error("--shards-dir requires a directory path");
      parsed.shardsDir = path.resolve(process.cwd(), val);
      i += 1;
    } else if (arg === "--out-dir") {
      const val = argv[i + 1];
      if (!val) throw new Error("--out-dir requires a directory path");
      parsed.outDir = path.resolve(process.cwd(), val);
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

  return parsed;
}

export function runCompileBankCli(argv: readonly string[]): number {
  const args = parseCompileCliArgs(argv);
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

  const summary = compileBankFromShards({
    shardsDir: args.shardsDir,
    outDir: args.outDir,
    frozenManifest,
    emitFrozenManifestPath: args.emitFrozenManifestPath,
  });

  console.log(
    JSON.stringify(
      {
        outDir: args.outDir,
        summaryPath: path.join(args.outDir, "SUMMARY.json"),
        shardsProcessed: summary.shardsProcessed.length,
        totalCompiledItems: summary.totalCompiledItems,
        overallPassRate: summary.attemptMetrics.overallPassRate,
        splitItemCounts: summary.splitSummary.itemCounts,
        newPostFreezeFamiliesRoutedToTrain:
          summary.newPostFreezeFamiliesRoutedToTrain,
        zeroContaminationVerified:
          summary.splitSummary.zeroContaminationVerified,
        coverageByDomain: summary.coverageByDomain,
      },
      null,
      2,
    ),
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runCompileBankCli(process.argv.slice(2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}
