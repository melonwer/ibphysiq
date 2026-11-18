import fs from "node:fs";
import path from "node:path";

import {
  PHYSICS_DOMAIN_IDS,
  SYLLABUS_IDS,
  type PhysicsDomainId,
  type SixthPhysicsBankItem,
  type SyllabusId,
} from "../../lib/bank-pipeline/types";
import {
  ALEVEL_PHYSICS_SYLLABUS,
  IB_PHYSICS_SYLLABUS,
  NCUK_PHYSICS_SYLLABUS,
  type SyllabusLevel,
  type SyllabusSpecificationCatalogue,
} from "../../lib/constants/syllabi";
import {
  PUBLIC_BANK_CHUNK_SCHEMA_VERSION,
  PUBLIC_BANK_MANIFEST_SCHEMA_VERSION,
  type PublicBankChunkFile,
  type PublicBankItem,
  type PublicBankManifest,
  type PublicDomainChunkSummary,
  type PublicQuestionIndexRow,
  type PublicSubtopicSummary,
  type PublicSyllabusSummary,
  type PublicTopicSummary,
} from "../../lib/sixthphysics-web/types";

export const DEFAULT_SOURCE_ALL_ITEMS_PATH =
  "dataset/sixthphysics-bank/bank/all-items.json";
export const DEFAULT_SOURCE_INDEX_PATH =
  "dataset/sixthphysics-bank/bank/index.json";
export const DEFAULT_PUBLIC_OUT_DIR = "public/sixthphysics-data";
export const DEFAULT_SEED_FALLBACK_PATH =
  "lib/sixthphysics-web/seed-fallback.ts";

const DETERMINISTIC_FALLBACK_GENERATED_AT = "2026-11-17T23:21:18.834Z";

const SYLLABUS_CATALOGUES: Record<SyllabusId, SyllabusSpecificationCatalogue> =
  {
    ib: IB_PHYSICS_SYLLABUS,
    alevel: ALEVEL_PHYSICS_SYLLABUS,
    ncuk: NCUK_PHYSICS_SYLLABUS,
  };

const SYLLABUS_META: Record<
  SyllabusId,
  {
    shortLabel: string;
    gravityConvention: string;
    levels: SyllabusLevel[];
  }
> = {
  ib: {
    shortLabel: "IB Physics",
    gravityConvention: "g = 9.8 m s⁻²",
    levels: ["SL", "HL"],
  },
  alevel: {
    shortLabel: "UK A-Level",
    gravityConvention: "g = 9.81 m s⁻²",
    levels: ["Y12", "Y13"],
  },
  ncuk: {
    shortLabel: "NCUK IFY",
    gravityConvention: "g = 9.81 m s⁻²",
    levels: ["IFY", "IFY-S1", "IFY-S2"],
  },
};

export function toPublicBankItem(raw: SixthPhysicsBankItem): PublicBankItem {
  const item: PublicBankItem = {
    id: raw.id,
    syllabi: raw.syllabi,
    format: raw.format,
    difficulty: raw.difficulty,
    visualFamily: raw.visualFamily,
    stem: raw.stem,
    workedSolution: raw.workedSolution,
    markScheme: raw.markScheme,
    totalMarks: raw.totalMarks,
    conceptId: raw.provenance.conceptId,
    familyGroupKey: raw.familyGroupKey,
  };

  if (raw.svgMarkup) {
    item.svgMarkup = raw.svgMarkup;
  }
  if (raw.options) {
    item.options = [...raw.options];
  }
  if (typeof raw.correctOptionIndex === "number") {
    item.correctOptionIndex = raw.correctOptionIndex;
  }
  if (raw.parts) {
    item.parts = raw.parts;
  }

  return item;
}

export function toPublicIndexRow(
  item: PublicBankItem,
  chunkKey: PhysicsDomainId,
): PublicQuestionIndexRow {
  return {
    id: item.id,
    syllabi: item.syllabi,
    format: item.format,
    difficulty: item.difficulty,
    visualFamily: item.visualFamily,
    totalMarks: item.totalMarks,
    hasSvg: Boolean(item.svgMarkup && item.svgMarkup.trim().length > 0),
    chunkKey,
    conceptId: item.conceptId,
    familyGroupKey: item.familyGroupKey,
  };
}

function incrementLevelCount(
  counts: Record<string, number>,
  level: string,
): void {
  counts[level] = (counts[level] ?? 0) + 1;
}

export function buildPublicBankManifest(
  rows: readonly PublicQuestionIndexRow[],
  generatedAt: string,
): PublicBankManifest {
  const syllabiSummary = {} as Record<SyllabusId, PublicSyllabusSummary>;

  for (const syllabusId of SYLLABUS_IDS) {
    const catalogue = SYLLABUS_CATALOGUES[syllabusId];
    const meta = SYLLABUS_META[syllabusId];

    const syllabusRows = rows.filter((row) =>
      row.syllabi.some((tag) => tag.syllabus === syllabusId),
    );

    const syllabusLevelCounts: Record<string, number> = {};
    for (const lvl of meta.levels) {
      syllabusLevelCounts[lvl] = 0;
    }

    let syllabusMcqCount = 0;
    let syllabusStructuredCount = 0;

    for (const row of syllabusRows) {
      if (row.format === "mcq") {
        syllabusMcqCount += 1;
      } else {
        syllabusStructuredCount += 1;
      }
      const tag = row.syllabi.find((t) => t.syllabus === syllabusId);
      if (tag) {
        incrementLevelCount(syllabusLevelCounts, tag.level);
      }
    }

    const topics: PublicTopicSummary[] = catalogue.topics.map((topicSpec) => {
      const topicRows = syllabusRows.filter((row) =>
        row.syllabi.some(
          (tag) => tag.syllabus === syllabusId && tag.topicId === topicSpec.id,
        ),
      );

      const topicLevelCounts: Record<string, number> = {};
      for (const lvl of meta.levels) {
        topicLevelCounts[lvl] = 0;
      }

      let topicMcqCount = 0;
      let topicStructuredCount = 0;
      for (const row of topicRows) {
        if (row.format === "mcq") {
          topicMcqCount += 1;
        } else {
          topicStructuredCount += 1;
        }
        const tag = row.syllabi.find(
          (t) => t.syllabus === syllabusId && t.topicId === topicSpec.id,
        );
        if (tag) {
          incrementLevelCount(topicLevelCounts, tag.level);
        }
      }

      const subtopics: PublicSubtopicSummary[] = topicSpec.subtopics.map(
        (subSpec) => {
          const subRows = topicRows.filter((row) =>
            row.syllabi.some(
              (tag) =>
                tag.syllabus === syllabusId &&
                tag.topicId === topicSpec.id &&
                tag.subtopicId === subSpec.id,
            ),
          );

          const subLevelCounts: Record<string, number> = {};
          for (const lvl of meta.levels) {
            subLevelCounts[lvl] = 0;
          }

          let subMcqCount = 0;
          let subStructuredCount = 0;
          for (const row of subRows) {
            if (row.format === "mcq") {
              subMcqCount += 1;
            } else {
              subStructuredCount += 1;
            }
            const tag = row.syllabi.find(
              (t) =>
                t.syllabus === syllabusId &&
                t.topicId === topicSpec.id &&
                t.subtopicId === subSpec.id,
            );
            if (tag) {
              incrementLevelCount(subLevelCounts, tag.level);
            }
          }

          const subSummary: PublicSubtopicSummary = {
            id: subSpec.id,
            code: subSpec.code,
            title: subSpec.title,
            level: subSpec.level,
            levelsCovered: [...subSpec.levelsCovered],
            questionCount: subRows.length,
            mcqCount: subMcqCount,
            structuredCount: subStructuredCount,
            countsByLevel: subLevelCounts,
          };
          if (subSpec.isOption) {
            subSummary.isOption = true;
          }
          return subSummary;
        },
      );

      const topicSummary: PublicTopicSummary = {
        id: topicSpec.id,
        code: topicSpec.code,
        title: topicSpec.title,
        syllabus: syllabusId,
        levelsCovered: [...topicSpec.levelsCovered],
        questionCount: topicRows.length,
        mcqCount: topicMcqCount,
        structuredCount: topicStructuredCount,
        countsByLevel: topicLevelCounts,
        subtopics,
      };
      if (topicSpec.isOption) {
        topicSummary.isOption = true;
      }
      return topicSummary;
    });

    syllabiSummary[syllabusId] = {
      syllabus: syllabusId,
      title: catalogue.title,
      shortLabel: meta.shortLabel,
      specificationCode: catalogue.specificationCode,
      levels: [...meta.levels],
      gravityConvention: meta.gravityConvention,
      questionCount: syllabusRows.length,
      mcqCount: syllabusMcqCount,
      structuredCount: syllabusStructuredCount,
      countsByLevel: syllabusLevelCounts,
      topics,
    };
  }

  const chunks = {} as Record<PhysicsDomainId, PublicDomainChunkSummary>;
  for (const domainId of PHYSICS_DOMAIN_IDS) {
    const domainCount = rows.filter((row) => row.chunkKey === domainId).length;
    chunks[domainId] = {
      chunkKey: domainId,
      itemCount: domainCount,
    };
  }

  return {
    schemaVersion: PUBLIC_BANK_MANIFEST_SCHEMA_VERSION,
    generatedAt,
    totalItems: rows.length,
    syllabi: syllabiSummary,
    items: [...rows],
    chunks,
  };
}

/**
 * Deterministically selects 18 compact, verified sample items spanning all 3 syllabi,
 * both MCQ and Structured formats, all difficulties, and rich deterministic SVGs,
 * with 18 distinct `familyGroupKey`s.
 */
export function selectSeedFallbackRecords(
  records: ReadonlyArray<{ item: PublicBankItem; chunkKey: PhysicsDomainId }>,
): Array<{ item: PublicBankItem; chunkKey: PhysicsDomainId }> {
  const targetCount = 18;
  const selected: Array<{ item: PublicBankItem; chunkKey: PhysicsDomainId }> =
    [];
  const usedIds = new Set<string>();
  const usedFamilies = new Set<string>();

  const sortedByCompactness = [...records].sort((a, b) => {
    const lenA = a.item.svgMarkup ? a.item.svgMarkup.length : 999999;
    const lenB = b.item.svgMarkup ? b.item.svgMarkup.length : 999999;
    if (lenA !== lenB) return lenA - lenB;
    return a.item.id.localeCompare(b.item.id);
  });

  const visualDomains = PHYSICS_DOMAIN_IDS.filter(
    (d) => d !== "pure-calculation",
  );

  // Pass 1: 9 compact SVG MCQs + 8 compact SVG Structured across visual domains + 1 pure-calculation
  // ensuring all 3 syllabi, MCQ + Structured, and distinct familyGroupKeys.
  for (let idx = 0; idx < visualDomains.length; idx += 1) {
    const domain = visualDomains[idx];
    const primaryFormat = idx % 2 === 0 ? "mcq" : "structured";
    const candidate = sortedByCompactness.find(
      (r) =>
        r.chunkKey === domain &&
        r.item.format === primaryFormat &&
        Boolean(r.item.svgMarkup) &&
        r.item.syllabi.length === 3 &&
        !usedFamilies.has(r.item.familyGroupKey) &&
        !usedIds.has(r.item.id),
    );
    if (candidate) {
      selected.push(candidate);
      usedIds.add(candidate.item.id);
      usedFamilies.add(candidate.item.familyGroupKey);
    }
  }

  // Pass 2: Second pass across visual domains with opposite format (so we have balanced MCQ + Structured with SVGs)
  for (let idx = 0; idx < visualDomains.length; idx += 1) {
    if (selected.length >= targetCount - 1) break;
    const domain = visualDomains[idx];
    const oppositeFormat = idx % 2 === 0 ? "structured" : "mcq";
    const candidate = sortedByCompactness.find(
      (r) =>
        r.chunkKey === domain &&
        r.item.format === oppositeFormat &&
        Boolean(r.item.svgMarkup) &&
        r.item.syllabi.length >= 2 &&
        !usedFamilies.has(r.item.familyGroupKey) &&
        !usedIds.has(r.item.id),
    );
    if (candidate) {
      selected.push(candidate);
      usedIds.add(candidate.item.id);
      usedFamilies.add(candidate.item.familyGroupKey);
    }
  }

  // Pass 3: Include 1 pure-calculation item so all 11 chunk domains are represented in fallback
  if (selected.length < targetCount) {
    const pureCandidate = sortedByCompactness.find(
      (r) =>
        r.chunkKey === "pure-calculation" &&
        r.item.syllabi.length === 3 &&
        !usedFamilies.has(r.item.familyGroupKey) &&
        !usedIds.has(r.item.id),
    );
    if (pureCandidate) {
      selected.push(pureCandidate);
      usedIds.add(pureCandidate.item.id);
      usedFamilies.add(pureCandidate.item.familyGroupKey);
    }
  }

  // Fill any remaining slots up to 18 deterministically
  for (const r of sortedByCompactness) {
    if (selected.length >= targetCount) break;
    if (usedIds.has(r.item.id) || usedFamilies.has(r.item.familyGroupKey)) {
      continue;
    }
    selected.push(r);
    usedIds.add(r.item.id);
    usedFamilies.add(r.item.familyGroupKey);
  }

  return selected;
}

function renderSeedFallbackModuleSource(
  seedRecords: ReadonlyArray<{
    item: PublicBankItem;
    chunkKey: PhysicsDomainId;
  }>,
  seedManifest: PublicBankManifest,
): string {
  const seedItems = seedRecords.map((r) => r.item);
  const chunkMap: Record<string, PhysicsDomainId> = {};
  for (const r of seedRecords) {
    chunkMap[r.item.id] = r.chunkKey;
  }

  return [
    'import type { PhysicsDomainId, PublicBankItem, PublicBankManifest } from "./types";',
    "",
    "/**",
    " * Deterministic 18-item verified fallback seed across IB Physics (SL/HL),",
    " * UK A-Level Physics (Y12/Y13), and NCUK IFY Physics (IFY/S1/S2) so unit tests",
    " * and fresh builds work cleanly even when `dataset/` is absent.",
    " */",
    `export const SEED_FALLBACK_ITEMS: readonly PublicBankItem[] = ${JSON.stringify(seedItems, null, 2)};`,
    "",
    `export const SEED_FALLBACK_CHUNK_BY_ID: Readonly<Record<string, PhysicsDomainId>> = ${JSON.stringify(chunkMap, null, 2)};`,
    "",
    `export const SEED_FALLBACK_MANIFEST: PublicBankManifest = ${JSON.stringify(seedManifest, null, 2)};`,
    "",
  ].join("\n");
}

export interface CompilePublicBankOptions {
  sourceItemsPath?: string;
  sourceIndexPath?: string;
  outDir?: string;
  seedFallbackPath?: string;
  writeSeedFallback?: boolean;
}

export interface CompilePublicBankResult {
  usedSeedFallbackInput: boolean;
  outDir: string;
  manifestPath: string;
  totalItems: number;
  chunkCounts: Record<PhysicsDomainId, number>;
  syllabusCounts: Record<SyllabusId, number>;
  seedFallbackCount: number;
}

export async function compilePublicBank(
  options: CompilePublicBankOptions = {},
): Promise<CompilePublicBankResult> {
  const cwd = process.cwd();
  const sourceItemsPath = path.resolve(
    cwd,
    options.sourceItemsPath ?? DEFAULT_SOURCE_ALL_ITEMS_PATH,
  );
  const sourceIndexPath = path.resolve(
    cwd,
    options.sourceIndexPath ?? DEFAULT_SOURCE_INDEX_PATH,
  );
  const outDir = path.resolve(cwd, options.outDir ?? DEFAULT_PUBLIC_OUT_DIR);
  const seedFallbackPath = path.resolve(
    cwd,
    options.seedFallbackPath ?? DEFAULT_SEED_FALLBACK_PATH,
  );
  const writeSeedFallback = options.writeSeedFallback ?? true;

  let records: Array<{ item: PublicBankItem; chunkKey: PhysicsDomainId }> = [];
  let generatedAt = DETERMINISTIC_FALLBACK_GENERATED_AT;
  let usedSeedFallbackInput = false;

  if (fs.existsSync(sourceItemsPath)) {
    if (fs.existsSync(sourceIndexPath)) {
      try {
        const parsedIndex = JSON.parse(
          fs.readFileSync(sourceIndexPath, "utf8"),
        ) as { compiledAt?: string };
        if (typeof parsedIndex.compiledAt === "string") {
          generatedAt = parsedIndex.compiledAt;
        }
      } catch {
        // Keep deterministic default timestamp if index metadata cannot be read.
      }
    }

    const rawItems = JSON.parse(
      fs.readFileSync(sourceItemsPath, "utf8"),
    ) as SixthPhysicsBankItem[];

    const seenIds = new Set<string>();
    for (const raw of rawItems) {
      if (seenIds.has(raw.id)) {
        continue;
      }
      seenIds.add(raw.id);
      const chunkKey = raw.provenance.domain;
      records.push({
        item: toPublicBankItem(raw),
        chunkKey,
      });
    }
  } else {
    usedSeedFallbackInput = true;
    const fallbackModule = (await import(seedFallbackPath)) as {
      SEED_FALLBACK_ITEMS: readonly PublicBankItem[];
      SEED_FALLBACK_CHUNK_BY_ID: Readonly<Record<string, PhysicsDomainId>>;
    };
    records = fallbackModule.SEED_FALLBACK_ITEMS.map((item) => ({
      item,
      chunkKey: fallbackModule.SEED_FALLBACK_CHUNK_BY_ID[item.id] ?? "waves",
    }));
  }

  records.sort((a, b) => a.item.id.localeCompare(b.item.id));

  const indexRows = records.map((r) => toPublicIndexRow(r.item, r.chunkKey));
  const manifest = buildPublicBankManifest(indexRows, generatedAt);

  const chunksDir = path.join(outDir, "chunks");
  fs.mkdirSync(chunksDir, { recursive: true });

  const chunkCounts = {} as Record<PhysicsDomainId, number>;
  for (const domainId of PHYSICS_DOMAIN_IDS) {
    const domainItems = records
      .filter((r) => r.chunkKey === domainId)
      .map((r) => r.item);
    chunkCounts[domainId] = domainItems.length;

    const chunkPayload: PublicBankChunkFile = {
      schemaVersion: PUBLIC_BANK_CHUNK_SCHEMA_VERSION,
      chunkKey: domainId,
      generatedAt,
      itemCount: domainItems.length,
      items: domainItems,
    };

    // Compact single-line JSON for fast network transfer on GitHub Pages
    fs.writeFileSync(
      path.join(chunksDir, `${domainId}.json`),
      JSON.stringify(chunkPayload),
      "utf8",
    );
  }

  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");

  let seedFallbackCount = 0;
  if (!usedSeedFallbackInput && writeSeedFallback) {
    const seedRecords = selectSeedFallbackRecords(records);
    seedFallbackCount = seedRecords.length;
    const seedRows = seedRecords.map((r) =>
      toPublicIndexRow(r.item, r.chunkKey),
    );
    const seedManifest = buildPublicBankManifest(
      seedRows,
      DETERMINISTIC_FALLBACK_GENERATED_AT,
    );
    const nextSeedSource = renderSeedFallbackModuleSource(
      seedRecords,
      seedManifest,
    );

    fs.mkdirSync(path.dirname(seedFallbackPath), { recursive: true });
    const prevSeedSource = fs.existsSync(seedFallbackPath)
      ? fs.readFileSync(seedFallbackPath, "utf8")
      : null;
    if (prevSeedSource !== nextSeedSource) {
      fs.writeFileSync(seedFallbackPath, nextSeedSource, "utf8");
    }
  } else {
    seedFallbackCount = records.length;
  }

  return {
    usedSeedFallbackInput,
    outDir,
    manifestPath,
    totalItems: manifest.totalItems,
    chunkCounts,
    syllabusCounts: {
      ib: manifest.syllabi.ib.questionCount,
      alevel: manifest.syllabi.alevel.questionCount,
      ncuk: manifest.syllabi.ncuk.questionCount,
    },
    seedFallbackCount,
  };
}

async function runCli(): Promise<void> {
  const result = await compilePublicBank();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  runCli().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  });
}
