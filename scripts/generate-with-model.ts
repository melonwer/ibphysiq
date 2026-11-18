import path from "node:path";

import {
  PHYSICS_DOMAIN_IDS,
  PhysicsDomainId,
  QUESTION_DIFFICULTIES,
  QuestionDifficulty,
  QUESTION_FORMATS,
  QuestionFormat,
  SYLLABUS_IDS,
  SyllabusId,
} from "@/lib/bank-pipeline/types";
import {
  BackendConfig,
  createInferenceClient,
  DEFAULT_HF_ADAPTER,
  DEFAULT_HF_BASE_MODEL,
  DEFAULT_HF_QUANT,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  formatQuestionTerminal,
  generateVerifiedQuestion,
  HF_QUANT_MODES,
  HfQuantMode,
  listAvailableTopics,
  LIVE_BACKEND_KINDS,
  LiveBackendKind,
  LiveGenerationResult,
  LiveInferenceClient,
  SavedOutputFiles,
  writeGenerationArtifacts,
} from "@/lib/live-generator";

export interface ParsedGenerateLiveArgs {
  syllabus: SyllabusId;
  syllabusExplicit: boolean;
  level?: string;
  topic?: string;
  domain?: PhysicsDomainId;
  concept?: string;
  format: QuestionFormat;
  difficulty: QuestionDifficulty;
  marks?: number;
  seed?: number;
  count: number;
  backend: LiveBackendKind;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  adapter?: string;
  quant: HfQuantMode;
  pythonBin?: string;
  temperature: number;
  retries: number;
  outDir?: string;
  json: boolean;
  help: boolean;
  listTopics: boolean;
}

export function formatHelpText(): string {
  return [
    "SixthPhysics Live Neuro-Symbolic Question Generator (1-Command CLI)",
    "",
    "Usage:",
    "  npm run generate:live -- [options]",
    "  npx tsx scripts/generate-with-model.ts [options]",
    "",
    "Question Selection:",
    `  --syllabus <id>        Syllabus: ${SYLLABUS_IDS.join(" | ")} (default: ib)`,
    "  --level <lvl>          Exam level (IB: SL|HL, A-Level: Y12|Y13, NCUK: IFY-S1|IFY-S2|IFY)",
    "  --topic <query>        Topic/subtopic ID, code (e.g. A.2, 3.4, AC2), or title keyword",
    `  --domain <id>          Physics solver domain: ${PHYSICS_DOMAIN_IDS.join(", ")}`,
    "  --concept <id>         Canonical crosswalk concept ID (e.g. uniform-circular-motion)",
    `  --format <fmt>         Question format: ${QUESTION_FORMATS.join(" | ")} (default: mcq)`,
    `  --difficulty <diff>    Difficulty: ${QUESTION_DIFFICULTIES.join(" | ")} (default: standard)`,
    "  --marks <n>            Total marks override (default: 1 for mcq, 6 for structured)",
    "  --seed <int>           Deterministic base seed (increments per item when --count > 1)",
    "  --count <n>            Number of questions to generate (default: 1)",
    "  --list-topics          List available topics, subtopics, levels, and solver domains",
    "",
    "Inference Backend:",
    `  --backend <kind>       Backend: ${LIVE_BACKEND_KINDS.join(" | ")} (default: ollama)`,
    "  --model <name>         Model identifier:",
    `                           ollama : ${DEFAULT_OLLAMA_MODEL}`,
    `                           openai : ${DEFAULT_OPENAI_MODEL}`,
    `                           hf     : ${DEFAULT_HF_BASE_MODEL}`,
    "  --base-url <url>       API base URL:",
    `                           ollama : ${DEFAULT_OLLAMA_BASE_URL}`,
    `                           openai : ${DEFAULT_OPENAI_BASE_URL}`,
    "  --api-key <key>        Bearer API key for --backend openai (or set OPENAI_API_KEY)",
    `  --adapter <id|path>    PEFT LoRA adapter for --backend hf (default: ${DEFAULT_HF_ADAPTER})`,
    `  --quant <mode>         HF quantization: ${HF_QUANT_MODES.join(" | ")} (default: ${DEFAULT_HF_QUANT})`,
    "  --python <bin>         Python executable for --backend hf (default: python3)",
    "  --temperature <float>  Base sampling temperature for attempt 1 (default: 0.0)",
    "  --retries <n>          Max deterministic self-correction retries per turn (default: 1)",
    "",
    "Output:",
    "  --out <dir>            Write <id>.json, <id>.svg (if rendered), and <id>.md preview",
    "  --json                 Emit structured JSON output to stdout",
    "  --help, -h             Show this help message",
    "",
    "Examples:",
    "  # 1. Ollama (1-command GGUF Q4_K_M on laptop / desktop GPU)",
    "  npm run generate:live -- --syllabus ib --level SL --domain grav-astro --format mcq --out ./generated",
    "",
    "  # 2. llama-server / LM Studio / vLLM (OpenAI-compatible)",
    "  npm run generate:live -- --backend openai --base-url http://127.0.0.1:8080/v1 --syllabus alevel --domain circuits --format structured",
    "",
    "  # 3. Local Hugging Face + bitsandbytes 4-bit NF4 LoRA",
    "  npm run generate:live -- --backend hf --quant 4bit --syllabus ncuk --topic AC2 --format mcq",
    "",
    "  # 4. Inspect valid topics & domains",
    "  npm run generate:live -- --list-topics --syllabus ib",
    "",
  ].join("\n");
}

export function formatTopicsListing(syllabus?: SyllabusId): string {
  const entries = listAvailableTopics(syllabus);
  const lines: string[] = [];
  let currentSyl: SyllabusId | null = null;

  for (const entry of entries) {
    if (entry.syllabus !== currentSyl) {
      if (currentSyl !== null) {
        lines.push("");
      }
      currentSyl = entry.syllabus;
      const gVal = currentSyl === "ib" ? "9.8" : "9.81";
      lines.push(
        `=== ${currentSyl.toUpperCase()} PHYSICS (g = ${gVal} m s^-2) ===`,
      );
    }

    lines.push(
      `  ${entry.topicId} [${entry.topicCode}] ${entry.topicTitle} (levels: ${entry.levels.join(", ")} | domains: ${entry.domains.join(", ") || "none"})`,
    );
    for (const sub of entry.subtopics) {
      lines.push(
        `    - ${sub.subtopicId} [${sub.subtopicCode}] ${sub.subtopicTitle} (${sub.levels.join(", ")})`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function readFlagValue(
  argv: readonly string[],
  idx: number,
  flag: string,
): { value: string; nextIdx: number } {
  const raw = argv[idx];
  const eqIdx = raw.indexOf("=");
  if (eqIdx !== -1) {
    const val = raw.slice(eqIdx + 1);
    if (!val) {
      throw new Error(`Flag ${flag} requires a non-empty value`);
    }
    return { value: val, nextIdx: idx };
  }
  const next = argv[idx + 1];
  if (next === undefined || next.startsWith("-")) {
    throw new Error(`Flag ${flag} requires a value`);
  }
  return { value: next, nextIdx: idx + 1 };
}

function parsePositiveInt(raw: string, flagName: string): number {
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`Flag ${flagName} must be a positive integer; got "${raw}"`);
  }
  const val = Number.parseInt(raw.trim(), 10);
  if (!Number.isSafeInteger(val) || val < 1) {
    throw new Error(`Flag ${flagName} must be >= 1; got "${raw}"`);
  }
  return val;
}

function parseNonNegativeInt(raw: string, flagName: string): number {
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(
      `Flag ${flagName} must be a non-negative integer; got "${raw}"`,
    );
  }
  const val = Number.parseInt(raw.trim(), 10);
  if (!Number.isSafeInteger(val) || val < 0) {
    throw new Error(`Flag ${flagName} must be >= 0; got "${raw}"`);
  }
  return val;
}

export function parseGenerateLiveArgs(
  argv: readonly string[],
): ParsedGenerateLiveArgs {
  let syllabus: SyllabusId = "ib";
  let syllabusExplicit = false;
  let level: string | undefined;
  let topic: string | undefined;
  let domain: PhysicsDomainId | undefined;
  let concept: string | undefined;
  let format: QuestionFormat = "mcq";
  let difficulty: QuestionDifficulty = "standard";
  let marks: number | undefined;
  let seed: number | undefined;
  let count = 1;
  let backend: LiveBackendKind = "ollama";
  let model: string | undefined;
  let baseUrl: string | undefined;
  let apiKey: string | undefined;
  let adapter: string | undefined;
  let quant: HfQuantMode = DEFAULT_HF_QUANT;
  let pythonBin: string | undefined;
  let temperature = 0.0;
  let retries = 1;
  let outDir: string | undefined;
  let json = false;
  let help = false;
  let listTopics = false;

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (raw === "--") {
      continue;
    }
    const flag = raw.includes("=") ? raw.slice(0, raw.indexOf("=")) : raw;

    switch (flag) {
      case "--help":
      case "-h":
        help = true;
        break;
      case "--list-topics":
        listTopics = true;
        break;
      case "--json":
        json = true;
        break;
      case "--syllabus": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        const norm = value.trim().toLowerCase();
        if (!(SYLLABUS_IDS as readonly string[]).includes(norm)) {
          throw new Error(
            `Invalid --syllabus "${value}". Supported: ${SYLLABUS_IDS.join(", ")}`,
          );
        }
        syllabus = norm as SyllabusId;
        syllabusExplicit = true;
        break;
      }
      case "--level": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        level = value.trim();
        break;
      }
      case "--topic": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        topic = value.trim();
        break;
      }
      case "--domain": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        const norm = value.trim().toLowerCase();
        if (!(PHYSICS_DOMAIN_IDS as readonly string[]).includes(norm)) {
          throw new Error(
            `Invalid --domain "${value}". Supported: ${PHYSICS_DOMAIN_IDS.join(", ")}`,
          );
        }
        domain = norm as PhysicsDomainId;
        break;
      }
      case "--concept": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        concept = value.trim();
        break;
      }
      case "--format": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        const norm = value.trim().toLowerCase();
        if (!(QUESTION_FORMATS as readonly string[]).includes(norm)) {
          throw new Error(
            `Invalid --format "${value}". Supported: ${QUESTION_FORMATS.join(", ")}`,
          );
        }
        format = norm as QuestionFormat;
        break;
      }
      case "--difficulty": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        const norm = value.trim().toLowerCase();
        if (!(QUESTION_DIFFICULTIES as readonly string[]).includes(norm)) {
          throw new Error(
            `Invalid --difficulty "${value}". Supported: ${QUESTION_DIFFICULTIES.join(", ")}`,
          );
        }
        difficulty = norm as QuestionDifficulty;
        break;
      }
      case "--marks": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        marks = parsePositiveInt(value, "--marks");
        break;
      }
      case "--seed": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        seed = parseNonNegativeInt(value, "--seed");
        break;
      }
      case "--count": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        count = parsePositiveInt(value, "--count");
        break;
      }
      case "--backend": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        const norm = value.trim().toLowerCase();
        if (!(LIVE_BACKEND_KINDS as readonly string[]).includes(norm)) {
          throw new Error(
            `Invalid --backend "${value}". Supported: ${LIVE_BACKEND_KINDS.join(", ")}`,
          );
        }
        backend = norm as LiveBackendKind;
        break;
      }
      case "--model": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        model = value.trim();
        break;
      }
      case "--base-url": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        baseUrl = value.trim();
        break;
      }
      case "--api-key": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        apiKey = value.trim();
        break;
      }
      case "--adapter": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        adapter = value.trim();
        break;
      }
      case "--quant": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        const norm = value.trim().toLowerCase();
        if (!(HF_QUANT_MODES as readonly string[]).includes(norm)) {
          throw new Error(
            `Invalid --quant "${value}". Supported: ${HF_QUANT_MODES.join(", ")}`,
          );
        }
        quant = norm as HfQuantMode;
        break;
      }
      case "--python": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        pythonBin = value.trim();
        break;
      }
      case "--temperature": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        const parsed = Number.parseFloat(value);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
          throw new Error(
            `Invalid --temperature "${value}". Must be a finite number in [0, 2].`,
          );
        }
        temperature = parsed;
        break;
      }
      case "--retries": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        retries = parseNonNegativeInt(value, "--retries");
        break;
      }
      case "--out": {
        const { value, nextIdx } = readFlagValue(argv, i, flag);
        i = nextIdx;
        outDir = value.trim();
        break;
      }
      default:
        throw new Error(
          `Unrecognized argument "${raw}". Run with --help for usage.`,
        );
    }
  }

  return {
    syllabus,
    syllabusExplicit,
    ...(level ? { level } : {}),
    ...(topic ? { topic } : {}),
    ...(domain ? { domain } : {}),
    ...(concept ? { concept } : {}),
    format,
    difficulty,
    ...(marks !== undefined ? { marks } : {}),
    ...(seed !== undefined ? { seed } : {}),
    count,
    backend,
    ...(model ? { model } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(adapter !== undefined ? { adapter } : {}),
    quant,
    ...(pythonBin ? { pythonBin } : {}),
    temperature,
    retries,
    ...(outDir ? { outDir } : {}),
    json,
    help,
    listTopics,
  };
}

export function buildBackendConfigFromArgs(
  args: ParsedGenerateLiveArgs,
): BackendConfig {
  if (args.backend === "ollama") {
    return {
      backend: "ollama",
      ...(args.model ? { model: args.model } : {}),
      ...(args.baseUrl ? { baseUrl: args.baseUrl } : {}),
    };
  }
  if (args.backend === "openai") {
    return {
      backend: "openai",
      ...(args.model ? { model: args.model } : {}),
      ...(args.baseUrl ? { baseUrl: args.baseUrl } : {}),
      ...(args.apiKey ? { apiKey: args.apiKey } : {}),
    };
  }
  return {
    backend: "hf",
    ...(args.model ? { baseModel: args.model } : {}),
    ...(args.adapter !== undefined ? { adapter: args.adapter } : {}),
    quant: args.quant,
    ...(args.pythonBin ? { pythonBin: args.pythonBin } : {}),
  };
}

export interface RunCliIo {
  stdout?: (chunk: string) => void;
  stderr?: (chunk: string) => void;
  clientOverride?: LiveInferenceClient;
}

export async function runGenerateLiveCli(
  argv: readonly string[],
  io: RunCliIo = {},
): Promise<number> {
  const writeOut = io.stdout ?? ((s: string) => process.stdout.write(s));
  const writeErr = io.stderr ?? ((s: string) => process.stderr.write(s));

  let args: ParsedGenerateLiveArgs;
  try {
    args = parseGenerateLiveArgs(argv);
  } catch (error) {
    writeErr(
      `Error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }

  if (args.help) {
    writeOut(formatHelpText());
    return 0;
  }

  if (args.listTopics) {
    const filterSyl = args.syllabusExplicit ? args.syllabus : undefined;
    if (args.json) {
      writeOut(`${JSON.stringify(listAvailableTopics(filterSyl), null, 2)}\n`);
    } else {
      writeOut(formatTopicsListing(filterSyl));
    }
    return 0;
  }

  const client =
    io.clientOverride ?? createInferenceClient(buildBackendConfigFromArgs(args));
  const baseSeed =
    args.seed !== undefined
      ? args.seed
      : Math.floor(Date.now() % 1_000_000_000);

  const items: Array<{
    result: LiveGenerationResult;
    savedFiles?: SavedOutputFiles;
  }> = [];

  try {
    for (let idx = 0; idx < args.count; idx += 1) {
      const itemSeed = baseSeed + idx;
      const result = await generateVerifiedQuestion(
        {
          syllabus: args.syllabus,
          ...(args.level ? { level: args.level } : {}),
          ...(args.topic ? { topicId: args.topic } : {}),
          ...(args.domain ? { domain: args.domain } : {}),
          ...(args.concept ? { conceptId: args.concept } : {}),
          format: args.format,
          difficulty: args.difficulty,
          ...(args.marks !== undefined ? { totalMarks: args.marks } : {}),
          seed: itemSeed,
          maxRetries: args.retries,
          temperature: args.temperature,
        },
        client,
      );

      const savedFiles = args.outDir
        ? writeGenerationArtifacts(result, args.outDir)
        : undefined;

      items.push({ result, savedFiles });

      if (!args.json) {
        writeOut(formatQuestionTerminal(result, savedFiles));
      }
    }
  } finally {
    if (!io.clientOverride && client.close) {
      await client.close();
    }
  }

  const verifiedCount = items.filter((entry) => entry.result.verified).length;

  if (args.json) {
    const payload =
      items.length === 1
        ? {
            ...items[0].result,
            ...(items[0].savedFiles
              ? { savedFiles: items[0].savedFiles }
              : {}),
          }
        : {
            total: items.length,
            verifiedCount,
            items: items.map((entry) => ({
              ...entry.result,
              ...(entry.savedFiles ? { savedFiles: entry.savedFiles } : {}),
            })),
          };
    writeOut(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (items.length > 1) {
    writeOut(
      `Summary: ${verifiedCount}/${items.length} questions passed full neuro-symbolic verification.\n`,
    );
  }

  return verifiedCount === items.length ? 0 : 2;
}

const isDirectExecution =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) ===
    path.resolve(__dirname, "generate-with-model.ts");

if (isDirectExecution) {
  runGenerateLiveCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(
        `Fatal error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
