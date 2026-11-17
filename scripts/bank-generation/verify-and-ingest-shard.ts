import fs from "node:fs";
import path from "node:path";

import {
  buildSampleCandidates,
  CandidateQuestionInput,
  DEFAULT_SHARDS_RELATIVE_DIR,
  FrozenEvaluationManifest,
  ingestCandidatesIntoShard,
  parseFrozenManifest,
  solveCandidateScenariosOnly,
  SolvePreviewInput,
} from "../../lib/bank-pipeline";

interface ParsedCliArgs {
  shard?: string;
  input?: string;
  shardsDir: string;
  frozenManifestPath?: string;
  dryRun: boolean;
  allowPartial: boolean;
  solveOnly: boolean;
  emitSamplePath?: string;
  help: boolean;
}

function printUsage(): void {
  const usage = [
    "Usage:",
    "  npx tsx scripts/bank-generation/verify-and-ingest-shard.ts --shard <name> --input <candidates.json> [options]",
    "  npx tsx scripts/bank-generation/verify-and-ingest-shard.ts --solve-only --input <scenarios.json>",
    "  npx tsx scripts/bank-generation/verify-and-ingest-shard.ts --emit-sample <sample-candidates.json>",
    "",
    "Options:",
    "  --shard <name>             Target shard identifier (writes dataset/sixthphysics-bank/shards/<name>.jsonl)",
    "  --input <path>             JSON (.json array or {candidates:[...]}) or JSONL (.jsonl) candidate input file",
    "  --shards-dir <dir>         Override shards directory (default: dataset/sixthphysics-bank/shards)",
    "  --frozen-manifest <path>   Enforce frozen held-out evaluation split manifest",
    "  --dry-run                  Validate and solve without writing shard files",
    "  --allow-partial            Exit 0 even when one or more candidates are rejected",
    "  --solve-only               Solve scenarioSpecs and print verified quantities before prose authoring",
    "  --emit-sample <path>       Write solver-verified sample candidates across all 10 visual domains + pure-calculation",
    "  --help                     Show this usage message",
  ].join("\n");
  console.log(usage);
}

export function parseVerifyCliArgs(argv: readonly string[]): ParsedCliArgs {
  const parsed: ParsedCliArgs = {
    shardsDir: path.resolve(process.cwd(), DEFAULT_SHARDS_RELATIVE_DIR),
    dryRun: false,
    allowPartial: false,
    solveOnly: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--allow-partial") {
      parsed.allowPartial = true;
    } else if (arg === "--solve-only") {
      parsed.solveOnly = true;
    } else if (arg === "--shard") {
      parsed.shard = argv[i + 1];
      i += 1;
    } else if (arg === "--input") {
      parsed.input = argv[i + 1];
      i += 1;
    } else if (arg === "--shards-dir") {
      const val = argv[i + 1];
      if (!val) throw new Error("--shards-dir requires a directory path");
      parsed.shardsDir = path.resolve(process.cwd(), val);
      i += 1;
    } else if (arg === "--frozen-manifest") {
      const val = argv[i + 1];
      if (!val) throw new Error("--frozen-manifest requires a file path");
      parsed.frozenManifestPath = path.resolve(process.cwd(), val);
      i += 1;
    } else if (arg === "--emit-sample") {
      const val = argv[i + 1];
      if (!val) throw new Error("--emit-sample requires an output file path");
      parsed.emitSamplePath = path.resolve(process.cwd(), val);
      i += 1;
    } else {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
  }

  return parsed;
}

function loadJsonOrJsonlRecords<T>(filePath: string): T[] {
  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Input file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, "utf8").trim();
  if (!raw) {
    return [];
  }
  if (resolved.endsWith(".jsonl")) {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  }
  const parsed: unknown = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    return parsed as T[];
  }
  if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.candidates)) {
      return obj.candidates as T[];
    }
    if (Array.isArray(obj.scenarios)) {
      return obj.scenarios as T[];
    }
    return [parsed as T];
  }
  throw new Error("Input JSON must be an array, { candidates: [...] }, or JSONL");
}

export function runVerifyAndIngestCli(argv: readonly string[]): number {
  const args = parseVerifyCliArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  if (args.emitSamplePath) {
    const sample = buildSampleCandidates();
    fs.mkdirSync(path.dirname(args.emitSamplePath), { recursive: true });
    fs.writeFileSync(
      args.emitSamplePath,
      JSON.stringify(sample, null, 2) + "\n",
      "utf8",
    );
    console.log(
      JSON.stringify(
        {
          emittedSamplePath: args.emitSamplePath,
          candidateCount: sample.length,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (!args.input) {
    throw new Error("Missing required --input <path> argument");
  }

  if (args.solveOnly) {
    const scenarios = loadJsonOrJsonlRecords<SolvePreviewInput>(args.input);
    const previews = solveCandidateScenariosOnly(scenarios);
    const invalidCount = previews.filter((p) => !p.valid).length;
    console.log(
      JSON.stringify(
        {
          mode: "solve-only",
          totalScenarios: previews.length,
          validCount: previews.length - invalidCount,
          invalidCount,
          previews,
        },
        null,
        2,
      ),
    );
    return invalidCount > 0 && !args.allowPartial ? 1 : 0;
  }

  if (!args.shard) {
    throw new Error("Missing required --shard <name> argument");
  }

  let frozenManifest: FrozenEvaluationManifest | undefined;
  if (args.frozenManifestPath) {
    frozenManifest = parseFrozenManifest(
      fs.readFileSync(args.frozenManifestPath, "utf8"),
    );
  }

  const candidates = loadJsonOrJsonlRecords<CandidateQuestionInput>(args.input);
  const summary = ingestCandidatesIntoShard({
    shardId: args.shard,
    shardsDir: args.shardsDir,
    candidates,
    frozenManifest,
    dryRun: args.dryRun,
  });

  console.log(JSON.stringify(summary, null, 2));

  if (summary.rejectedCount > 0 && !args.allowPartial) {
    return 1;
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runVerifyAndIngestCli(process.argv.slice(2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}
