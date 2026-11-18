import fs from "node:fs";
import path from "node:path";

import {
  extractJsonObjectFromAssistantText,
  solveStep1Batch,
  solveStep1Proposal,
} from "@/lib/benchmark/rollout-evaluator";
import { Step1BatchReceipt, Step1ProposalInput } from "@/lib/benchmark/types";

export { extractJsonObjectFromAssistantText, solveStep1Batch, solveStep1Proposal };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function coerceInputRow(
  rawObj: Record<string, unknown>,
  lineIndex: number,
): Step1ProposalInput {
  const id =
    (typeof rawObj.id === "string" && rawObj.id.trim()) ||
    (typeof rawObj.itemId === "string" && rawObj.itemId.trim()) ||
    (typeof rawObj.traceId === "string" && rawObj.traceId.trim()) ||
    `row-${lineIndex + 1}`;

  let domain =
    typeof rawObj.domain === "string" && rawObj.domain.trim()
      ? rawObj.domain.trim()
      : undefined;

  if (
    !domain &&
    isPlainObject(rawObj.metadata) &&
    typeof rawObj.metadata.domain === "string"
  ) {
    domain = rawObj.metadata.domain.trim();
  }

  let assistantStep1Raw = "";
  if (typeof rawObj.assistantStep1Raw === "string") {
    assistantStep1Raw = rawObj.assistantStep1Raw;
  } else if (isPlainObject(rawObj.assistantStep1Raw)) {
    assistantStep1Raw = JSON.stringify(rawObj.assistantStep1Raw);
  } else if (typeof rawObj.step1Raw === "string") {
    assistantStep1Raw = rawObj.step1Raw;
  } else if (typeof rawObj.content === "string") {
    assistantStep1Raw = rawObj.content;
  } else if (Array.isArray(rawObj.messages) && rawObj.messages.length >= 3) {
    const msg2 = rawObj.messages[2];
    if (isPlainObject(msg2) && typeof msg2.content === "string") {
      assistantStep1Raw = msg2.content;
    }
    if (!domain) {
      const msg1 = rawObj.messages[1];
      if (isPlainObject(msg1) && typeof msg1.content === "string") {
        try {
          const u = JSON.parse(msg1.content) as { domain?: unknown };
          if (typeof u.domain === "string") {
            domain = u.domain;
          }
        } catch {
          // ignore
        }
      }
    }
  }

  return {
    id,
    ...(domain ? { domain } : {}),
    assistantStep1Raw,
  };
}

function parseCliArgs(argv: readonly string[]): {
  inputPath: string;
  outputPath: string;
} {
  let inputPath = "";
  let outputPath = "";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === "--input" || arg === "-i") && argv[i + 1]) {
      inputPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--input=")) {
      inputPath = arg.slice("--input=".length);
    } else if ((arg === "--output" || arg === "-o") && argv[i + 1]) {
      outputPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--output=")) {
      outputPath = arg.slice("--output=".length);
    }
  }

  if (!inputPath || !outputPath) {
    throw new Error(
      "Usage: npx tsx scripts/benchmark/solve-step1-batch.ts --input <proposals.jsonl> --output <receipts.jsonl>",
    );
  }

  return { inputPath, outputPath };
}

function runCli(): void {
  const { inputPath, outputPath } = parseCliArgs(process.argv.slice(2));
  const rawContent = fs.readFileSync(inputPath, "utf8");
  const lines = rawContent.split("\n");

  const receipts: Step1BatchReceipt[] = [];
  let validCount = 0;
  let jsonValidCount = 0;
  const errorCountsByStage: Record<string, number> = {};

  for (let idx = 0; idx < lines.length; idx += 1) {
    const trimmed = lines[idx].trim();
    if (!trimmed) continue;

    let rowObj: unknown;
    try {
      rowObj = JSON.parse(trimmed);
    } catch (error) {
      const failReceipt: Step1BatchReceipt = {
        id: `row-${idx + 1}`,
        valid: false,
        jsonValid: false,
        errorStage: "json-parse",
        errorMessage: `Invalid input JSONL row at line ${idx + 1}: ${error instanceof Error ? error.message : String(error)}`,
      };
      receipts.push(failReceipt);
      errorCountsByStage[failReceipt.errorStage] =
        (errorCountsByStage[failReceipt.errorStage] ?? 0) + 1;
      continue;
    }

    if (!isPlainObject(rowObj)) {
      const failReceipt: Step1BatchReceipt = {
        id: `row-${idx + 1}`,
        valid: false,
        jsonValid: false,
        errorStage: "json-parse",
        errorMessage: `Input JSONL row at line ${idx + 1} is not a JSON object`,
      };
      receipts.push(failReceipt);
      errorCountsByStage[failReceipt.errorStage] =
        (errorCountsByStage[failReceipt.errorStage] ?? 0) + 1;
      continue;
    }

    const proposal = coerceInputRow(rowObj, idx);
    const receipt = solveStep1Proposal(proposal);
    receipts.push(receipt);

    if (receipt.jsonValid) {
      jsonValidCount += 1;
    }
    if (receipt.valid) {
      validCount += 1;
    } else {
      errorCountsByStage[receipt.errorStage] =
        (errorCountsByStage[receipt.errorStage] ?? 0) + 1;
    }
  }

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  const serialized =
    receipts.length > 0
      ? `${receipts.map((r) => JSON.stringify(r)).join("\n")}\n`
      : "";
  fs.writeFileSync(outputPath, serialized, "utf8");

  const summary = {
    total: receipts.length,
    jsonValidCount,
    validCount,
    jsonValidRate:
      receipts.length > 0
        ? Number((jsonValidCount / receipts.length).toFixed(6))
        : 0,
    solverPassRate:
      receipts.length > 0
        ? Number((validCount / receipts.length).toFixed(6))
        : 0,
    errorCountsByStage,
    outputPath,
  };
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

const isDirectExecution =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) ===
    path.resolve(__dirname, "solve-step1-batch.ts");

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
