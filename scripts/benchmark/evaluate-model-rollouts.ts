import fs from "node:fs";
import path from "node:path";

import {
  BenchmarkPromptMetadata,
  coerceRolloutRecord,
  evaluateBenchmarkRollouts,
  formatWilsonPercent,
  ModelRolloutRecord,
  parsePromptMetadataFromRecord,
} from "@/lib/benchmark";

interface CliArgs {
  rolloutsPath: string;
  splitFilePath: string;
  outputPath: string;
  itemsOutputPath?: string;
  rolloutsOnly: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseCliArgs(argv: readonly string[]): CliArgs {
  let rolloutsPath = "";
  let splitFilePath = "";
  let outputPath = "";
  let itemsOutputPath: string | undefined;
  let rolloutsOnly = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--rollouts" || arg === "-r") && argv[i + 1]) {
      rolloutsPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--rollouts=")) {
      rolloutsPath = arg.slice("--rollouts=".length);
    } else if (
      (arg === "--split-file" || arg === "--prompts" || arg === "-s") &&
      argv[i + 1]
    ) {
      splitFilePath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--split-file=")) {
      splitFilePath = arg.slice("--split-file=".length);
    } else if (arg.startsWith("--prompts=")) {
      splitFilePath = arg.slice("--prompts=".length);
    } else if ((arg === "--output" || arg === "-o") && argv[i + 1]) {
      outputPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--output=")) {
      outputPath = arg.slice("--output=".length);
    } else if (arg === "--items-output" && argv[i + 1]) {
      itemsOutputPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--items-output=")) {
      itemsOutputPath = arg.slice("--items-output=".length);
    } else if (arg === "--rollouts-only" || arg === "--allow-subset") {
      rolloutsOnly = true;
    }
  }

  if (!rolloutsPath || !splitFilePath || !outputPath) {
    throw new Error(
      "Usage: npx tsx scripts/benchmark/evaluate-model-rollouts.ts --rollouts <rollouts.jsonl> --split-file <val|test|novel.jsonl> --output <report.json> [--items-output <items.jsonl>] [--rollouts-only]",
    );
  }

  return {
    rolloutsPath,
    splitFilePath,
    outputPath,
    itemsOutputPath,
    rolloutsOnly,
  };
}

function readJsonObjectsFromJsonl(filePath: string): Record<string, unknown>[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n");
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const parsed: unknown = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) {
      throw new Error(`Expected JSON object at ${filePath}:${i + 1}`);
    }
    out.push(parsed);
  }
  return out;
}

function runCli(): void {
  const args = parseCliArgs(process.argv.slice(2));

  const splitRows = readJsonObjectsFromJsonl(args.splitFilePath);
  const prompts: BenchmarkPromptMetadata[] = splitRows.map((row, idx) =>
    parsePromptMetadataFromRecord(row, idx),
  );

  const rolloutRows = readJsonObjectsFromJsonl(args.rolloutsPath);
  const rollouts: ModelRolloutRecord[] = rolloutRows.map((row, idx) =>
    coerceRolloutRecord(row, idx),
  );

  // Auto-enable rolloutsOnly when evaluating a subset (e.g. closed-loop 1-retry subset)
  // and --items-output is requested, or when explicit --rollouts-only is passed.
  const effectiveRolloutsOnly =
    args.rolloutsOnly ||
    Boolean(args.itemsOutputPath && rollouts.length < prompts.length);

  const { report, rolloutEvaluations } = evaluateBenchmarkRollouts(
    prompts,
    rollouts,
    {
      rolloutsSource: args.rolloutsPath,
      splitSource: args.splitFilePath,
      rolloutsOnly: effectiveRolloutsOnly,
    },
  );

  fs.mkdirSync(path.dirname(path.resolve(args.outputPath)), {
    recursive: true,
  });
  fs.writeFileSync(
    args.outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  if (args.itemsOutputPath) {
    fs.mkdirSync(path.dirname(path.resolve(args.itemsOutputPath)), {
      recursive: true,
    });
    const serializedItems =
      rolloutEvaluations.length > 0
        ? `${rolloutEvaluations.map((ev) => JSON.stringify(ev)).join("\n")}\n`
        : "";
    fs.writeFileSync(args.itemsOutputPath, serializedItems, "utf8");
  }

  const conciseStdout = {
    totalPrompts: report.totalPrompts,
    evaluatedRollouts: report.evaluatedRollouts,
    headline: report.headline,
    overall95CI: {
      step1SolverPass: formatWilsonPercent(report.overall.step1SolverPass),
      step2AuthorGatePass: formatWilsonPercent(
        report.overall.step2AuthorGatePass,
      ),
      syllabusAlignment: formatWilsonPercent(report.overall.syllabusAlignment),
      endToEndVerified: formatWilsonPercent(report.overall.endToEndVerified),
    },
    outputPath: args.outputPath,
    ...(args.itemsOutputPath ? { itemsOutputPath: args.itemsOutputPath } : {}),
  };
  process.stdout.write(`${JSON.stringify(conciseStdout)}\n`);
}

const isDirectExecution =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) ===
    path.resolve(__dirname, "evaluate-model-rollouts.ts");

if (isDirectExecution) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
