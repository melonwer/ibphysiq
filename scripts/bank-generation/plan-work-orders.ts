import fs from "node:fs";
import path from "node:path";

import {
  PHYSICS_DOMAIN_IDS,
  PhysicsDomainId,
  planWorkOrders,
  QUESTION_FORMATS,
  QuestionFormat,
  SYLLABUS_IDS,
  SyllabusId,
} from "../../lib/bank-pipeline";
import { SyllabusLevel } from "../../lib/constants/syllabi";

const ALLOWED_SYLLABUS_LEVELS: readonly SyllabusLevel[] = [
  "SL",
  "HL",
  "Y12",
  "Y13",
  "IFY",
  "IFY-S1",
  "IFY-S2",
];

interface ParsedPlanArgs {
  outputPath?: string;
  stdoutOnly: boolean;
  syllabi?: SyllabusId[];
  levels?: SyllabusLevel[];
  domains?: PhysicsDomainId[];
  formats?: QuestionFormat[];
  concepts?: string[];
  includeOptionTopics: boolean;
  includePureCalculation: boolean;
  registeredOnly: boolean;
  itemsPerSlice: number;
  maxPerShard: number;
  baseSeed: number;
  help: boolean;
}

function printUsage(): void {
  const usage = [
    "Usage:",
    "  npx tsx scripts/bank-generation/plan-work-orders.ts [options]",
    "",
    "Options:",
    "  --output <path>            Output JSON path (default: dataset/sixthphysics-bank/work-orders.json)",
    "  --stdout                   Print full WorkOrderManifest JSON to stdout without writing default file",
    "  --syllabi <csv>            Comma-separated syllabi: ib,alevel,ncuk (default: all)",
    "  --levels <csv>             Comma-separated levels: SL,HL,Y12,Y13,IFY,IFY-S1,IFY-S2 (default: all)",
    "  --domains <csv>            Comma-separated physics domains (default: all 10 visual domains)",
    "  --formats <csv>            Comma-separated formats: mcq,structured (default: both)",
    "  --concepts <csv>           Comma-separated canonical conceptIds from SYLLABUS_CROSSWALK",
    "  --exclude-options          Exclude optional A-Level Sections 9-13 modules (core-only slices)",
    "  --include-pure-calculation Also plan figureless pure-calculation slices alongside visual domains",
    "  --registered-only          Only plan slices for domains currently registered in domain-registry",
    "  --items-per-slice <n>      Target verified questions per (syllabus, level, concept, format) slice (default: 10)",
    "  --max-per-shard <n>        Maximum target questions per worker shard (default: 25)",
    "  --base-seed <n>            Starting deterministic RNG seed (default: 100000)",
    "  --help                     Show this usage message",
  ].join("\n");
  console.log(usage);
}

export function parsePlanWorkOrdersCliArgs(
  argv: readonly string[],
): ParsedPlanArgs {
  const parsed: ParsedPlanArgs = {
    stdoutOnly: false,
    includeOptionTopics: true,
    includePureCalculation: false,
    registeredOnly: false,
    itemsPerSlice: 10,
    maxPerShard: 25,
    baseSeed: 100_000,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--stdout") {
      parsed.stdoutOnly = true;
    } else if (arg === "--exclude-options") {
      parsed.includeOptionTopics = false;
    } else if (arg === "--include-pure-calculation") {
      parsed.includePureCalculation = true;
    } else if (arg === "--registered-only") {
      parsed.registeredOnly = true;
    } else if (arg === "--output") {
      const val = argv[i + 1];
      if (!val) throw new Error("--output requires a file path");
      parsed.outputPath = path.resolve(process.cwd(), val);
      i += 1;
    } else if (arg === "--syllabi") {
      const val = argv[i + 1];
      if (!val) throw new Error("--syllabi requires comma-separated values");
      const list = val.split(",").map((s) => s.trim()) as SyllabusId[];
      for (const s of list) {
        if (!SYLLABUS_IDS.includes(s)) {
          throw new Error(
            `Invalid syllabus "${s}"; allowed: ${SYLLABUS_IDS.join(", ")}`,
          );
        }
      }
      parsed.syllabi = list;
      i += 1;
    } else if (arg === "--levels") {
      const val = argv[i + 1];
      if (!val) throw new Error("--levels requires comma-separated values");
      const list = val.split(",").map((s) => s.trim()) as SyllabusLevel[];
      for (const lvl of list) {
        if (!ALLOWED_SYLLABUS_LEVELS.includes(lvl)) {
          throw new Error(
            `Invalid level "${lvl}"; allowed: ${ALLOWED_SYLLABUS_LEVELS.join(", ")}`,
          );
        }
      }
      parsed.levels = list;
      i += 1;
    } else if (arg === "--domains") {
      const val = argv[i + 1];
      if (!val) throw new Error("--domains requires comma-separated values");
      const list = val.split(",").map((s) => s.trim()) as PhysicsDomainId[];
      for (const d of list) {
        if (!PHYSICS_DOMAIN_IDS.includes(d)) {
          throw new Error(
            `Invalid domain "${d}"; allowed: ${PHYSICS_DOMAIN_IDS.join(", ")}`,
          );
        }
      }
      parsed.domains = list;
      i += 1;
    } else if (arg === "--formats") {
      const val = argv[i + 1];
      if (!val) throw new Error("--formats requires comma-separated values");
      const list = val.split(",").map((s) => s.trim()) as QuestionFormat[];
      for (const f of list) {
        if (!QUESTION_FORMATS.includes(f)) {
          throw new Error(
            `Invalid format "${f}"; allowed: ${QUESTION_FORMATS.join(", ")}`,
          );
        }
      }
      parsed.formats = list;
      i += 1;
    } else if (arg === "--concepts") {
      const val = argv[i + 1];
      if (!val) throw new Error("--concepts requires comma-separated values");
      parsed.concepts = val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      i += 1;
    } else if (arg === "--items-per-slice") {
      parsed.itemsPerSlice = Number.parseInt(argv[i + 1] ?? "", 10);
      i += 1;
    } else if (arg === "--max-per-shard") {
      parsed.maxPerShard = Number.parseInt(argv[i + 1] ?? "", 10);
      i += 1;
    } else if (arg === "--base-seed") {
      parsed.baseSeed = Number.parseInt(argv[i + 1] ?? "", 10);
      i += 1;
    } else {
      throw new Error(`Unrecognized argument: ${arg}`);
    }
  }

  return parsed;
}

export function runPlanWorkOrdersCli(argv: readonly string[]): number {
  const args = parsePlanWorkOrdersCliArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }

  const manifest = planWorkOrders({
    syllabi: args.syllabi,
    levels: args.levels,
    domains: args.domains,
    formats: args.formats,
    concepts: args.concepts,
    includeOptionTopics: args.includeOptionTopics,
    includePureCalculation: args.includePureCalculation,
    registeredDomainsOnly: args.registeredOnly,
    itemsPerSlice: args.itemsPerSlice,
    maxItemsPerShard: args.maxPerShard,
    baseSeed: args.baseSeed,
  });

  if (args.stdoutOnly && !args.outputPath) {
    console.log(JSON.stringify(manifest, null, 2));
    return 0;
  }

  const targetPath =
    args.outputPath ??
    path.resolve(process.cwd(), "dataset/sixthphysics-bank/work-orders.json");
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath: targetPath,
        totalSlices: manifest.totalSlices,
        totalTargetQuestions: manifest.totalTargetQuestions,
        firstSeedRange: manifest.slices[0]?.seedRange ?? null,
        lastSeedRange:
          manifest.slices[manifest.slices.length - 1]?.seedRange ?? null,
      },
      null,
      2,
    ),
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = runPlanWorkOrdersCli(process.argv.slice(2));
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  }
}
