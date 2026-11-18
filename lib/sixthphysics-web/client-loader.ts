import {
  SEED_FALLBACK_CHUNK_BY_ID,
  SEED_FALLBACK_ITEMS,
  SEED_FALLBACK_MANIFEST,
} from "./seed-fallback";
import type {
  PhysicsDomainId,
  PublicBankChunkFile,
  PublicBankItem,
  PublicBankManifest,
  PublicQuestionIndexRow,
  QuestionFilterCriteria,
  StudentProgressState,
} from "./types";

export const DEFAULT_PUBLIC_BANK_BASE_URL = "./sixthphysics-data";

export interface BankLoaderOptions {
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

let cachedManifest: PublicBankManifest | null = null;
let inflightManifestPromise: Promise<PublicBankManifest> | null = null;

const cachedChunks = new Map<string, PublicBankItem[]>();
const inflightChunkPromises = new Map<string, Promise<PublicBankItem[]>>();
const cachedItemsById = new Map<string, PublicBankItem>();

const fallbackItemsById = new Map<string, PublicBankItem>(
  SEED_FALLBACK_ITEMS.map((item) => [item.id, item]),
);

function normalizeBaseUrl(baseUrl?: string): string {
  return (baseUrl ?? DEFAULT_PUBLIC_BANK_BASE_URL).replace(/\/+$/, "");
}

function resolveFetch(customFetch?: typeof fetch): typeof fetch | null {
  if (customFetch) {
    return customFetch;
  }
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis);
  }
  return null;
}

export function resetBankClientCache(): void {
  cachedManifest = null;
  inflightManifestPromise = null;
  cachedChunks.clear();
  inflightChunkPromises.clear();
  cachedItemsById.clear();
}

export function getFallbackManifest(): PublicBankManifest {
  return SEED_FALLBACK_MANIFEST;
}

export function getFallbackQuestions(): PublicBankItem[] {
  return [...SEED_FALLBACK_ITEMS];
}

export function getFallbackQuestionById(
  questionId: string,
): PublicBankItem | undefined {
  return fallbackItemsById.get(questionId);
}

function getFallbackItemsForChunk(chunkKey: string): PublicBankItem[] {
  return SEED_FALLBACK_ITEMS.filter(
    (item) => SEED_FALLBACK_CHUNK_BY_ID[item.id] === chunkKey,
  );
}

function isValidManifestPayload(value: unknown): value is PublicBankManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PublicBankManifest>;
  return (
    typeof candidate.totalItems === "number" &&
    Array.isArray(candidate.items) &&
    Boolean(candidate.syllabi) &&
    typeof candidate.syllabi === "object"
  );
}

function extractItemsFromChunkPayload(payload: unknown): PublicBankItem[] {
  if (Array.isArray(payload)) {
    return payload as PublicBankItem[];
  }
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as Partial<PublicBankChunkFile>).items)
  ) {
    return (payload as PublicBankChunkFile).items;
  }
  return [];
}

/**
 * Loads `./sixthphysics-data/manifest.json` using relative URLs for GitHub Pages
 * compatibility (`sixthphysics.github.io` root or project subpath), caching in
 * memory and falling back cleanly to `SEED_FALLBACK_MANIFEST` when unavailable.
 */
export async function loadBankManifest(
  options: BankLoaderOptions = {},
): Promise<PublicBankManifest> {
  if (!options.forceRefresh && cachedManifest) {
    return cachedManifest;
  }
  if (!options.forceRefresh && inflightManifestPromise) {
    return inflightManifestPromise;
  }

  const fetchFn = resolveFetch(options.fetchImpl);
  if (!fetchFn) {
    cachedManifest = SEED_FALLBACK_MANIFEST;
    return SEED_FALLBACK_MANIFEST;
  }

  const manifestUrl = `${normalizeBaseUrl(options.baseUrl)}/manifest.json`;

  const promise = (async (): Promise<PublicBankManifest> => {
    try {
      const response = await fetchFn(manifestUrl);
      if (!response.ok) {
        throw new Error(`Manifest HTTP ${response.status}`);
      }
      const parsed: unknown = await response.json();
      if (!isValidManifestPayload(parsed)) {
        throw new Error("Invalid manifest schema");
      }
      cachedManifest = parsed;
      return parsed;
    } catch {
      if (!cachedManifest) {
        cachedManifest = SEED_FALLBACK_MANIFEST;
      }
      return cachedManifest;
    } finally {
      inflightManifestPromise = null;
    }
  })();

  inflightManifestPromise = promise;
  return promise;
}

/**
 * Loads and caches a single domain chunk (`./sixthphysics-data/chunks/<chunkKey>.json`).
 */
export async function loadDomainChunk(
  chunkKey: PhysicsDomainId | string,
  options: BankLoaderOptions = {},
): Promise<PublicBankItem[]> {
  if (!options.forceRefresh && cachedChunks.has(chunkKey)) {
    return cachedChunks.get(chunkKey) ?? [];
  }
  const existingInflight = inflightChunkPromises.get(chunkKey);
  if (!options.forceRefresh && existingInflight) {
    return existingInflight;
  }

  const fetchFn = resolveFetch(options.fetchImpl);
  if (!fetchFn) {
    const fallbackChunk = getFallbackItemsForChunk(chunkKey);
    for (const item of fallbackChunk) {
      cachedItemsById.set(item.id, item);
    }
    cachedChunks.set(chunkKey, fallbackChunk);
    return fallbackChunk;
  }

  const chunkUrl = `${normalizeBaseUrl(options.baseUrl)}/chunks/${encodeURIComponent(chunkKey)}.json`;

  const promise = (async (): Promise<PublicBankItem[]> => {
    try {
      const response = await fetchFn(chunkUrl);
      if (!response.ok) {
        throw new Error(`Chunk ${chunkKey} HTTP ${response.status}`);
      }
      const parsed: unknown = await response.json();
      const items = extractItemsFromChunkPayload(parsed);
      cachedChunks.set(chunkKey, items);
      for (const item of items) {
        cachedItemsById.set(item.id, item);
      }
      return items;
    } catch {
      const fallbackChunk = getFallbackItemsForChunk(chunkKey);
      for (const item of fallbackChunk) {
        cachedItemsById.set(item.id, item);
      }
      if (!cachedChunks.has(chunkKey) && fallbackChunk.length > 0) {
        cachedChunks.set(chunkKey, fallbackChunk);
      }
      return cachedChunks.get(chunkKey) ?? fallbackChunk;
    } finally {
      inflightChunkPromises.delete(chunkKey);
    }
  })();

  inflightChunkPromises.set(chunkKey, promise);
  return promise;
}

/**
 * Warms the in-memory chunk cache in the background without throwing on error.
 */
export async function prefetchChunk(
  chunkKey: PhysicsDomainId | string,
  options: BankLoaderOptions = {},
): Promise<void> {
  await loadDomainChunk(chunkKey, options);
}

/**
 * Resolves a single verified `PublicBankItem` by ID, fetching only its owning
 * domain chunk if not already cached, with instant fallback to `seed-fallback.ts`.
 */
export async function loadQuestionById(
  questionId: string,
  manifest?: PublicBankManifest,
  options: BankLoaderOptions = {},
): Promise<PublicBankItem | null> {
  const memHit = cachedItemsById.get(questionId);
  if (memHit && !options.forceRefresh) {
    return memHit;
  }

  const activeManifest = manifest ?? (await loadBankManifest(options));
  const indexRow = activeManifest.items.find((row) => row.id === questionId);

  if (indexRow) {
    const chunkItems = await loadDomainChunk(indexRow.chunkKey, options);
    const found = chunkItems.find((item) => item.id === questionId);
    if (found) {
      return found;
    }
  }

  const fallbackChunkKey = SEED_FALLBACK_CHUNK_BY_ID[questionId];
  if (fallbackChunkKey) {
    const chunkItems = await loadDomainChunk(fallbackChunkKey, options);
    const found = chunkItems.find((item) => item.id === questionId);
    if (found) {
      return found;
    }
  }

  return fallbackItemsById.get(questionId) ?? null;
}

/**
 * Batch-loads a set of question IDs (e.g. for scoring or reviewing a mock paper),
 * fetching each distinct domain chunk at most once in parallel.
 */
export async function loadQuestionsByIds(
  questionIds: readonly string[],
  manifest?: PublicBankManifest,
  options: BankLoaderOptions = {},
): Promise<Record<string, PublicBankItem>> {
  const activeManifest = manifest ?? (await loadBankManifest(options));
  const rowById = new Map<string, PublicQuestionIndexRow>(
    activeManifest.items.map((row) => [row.id, row]),
  );

  const neededChunks = new Set<string>();
  for (const id of questionIds) {
    if (!cachedItemsById.has(id) || options.forceRefresh) {
      const row = rowById.get(id);
      const chunkKey = row?.chunkKey ?? SEED_FALLBACK_CHUNK_BY_ID[id];
      if (chunkKey) {
        neededChunks.add(chunkKey);
      }
    }
  }

  await Promise.all(
    [...neededChunks].map((chunkKey) => loadDomainChunk(chunkKey, options)),
  );

  const result: Record<string, PublicBankItem> = {};
  for (const id of questionIds) {
    const item = cachedItemsById.get(id) ?? fallbackItemsById.get(id);
    if (item) {
      result[id] = item;
    }
  }
  return result;
}

function normalizeLevelToken(level: string): string {
  const trimmed = level.trim().toUpperCase();
  if (trimmed === "S1") return "IFY-S1";
  if (trimmed === "S2") return "IFY-S2";
  return trimmed;
}

function isWildcardFilterValue(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized === "" || normalized === "all";
}

/**
 * Filters compact `manifest.items` rows synchronously by syllabus, level, topic,
 * subtopic, format, difficulty, visual family, SVG presence, search query, and
 * student progress status (`unseen`, `needs-review`, `saved`).
 */
export function filterIndexRows(
  rows: readonly PublicQuestionIndexRow[],
  criteria: QuestionFilterCriteria,
  progress?: Pick<StudentProgressState, "attempts" | "bookmarkedIds">,
): PublicQuestionIndexRow[] {
  const hasLevelFilter = !isWildcardFilterValue(criteria.level);
  const targetLevel = hasLevelFilter
    ? normalizeLevelToken(criteria.level ?? "")
    : null;
  const hasTopicFilter = !isWildcardFilterValue(criteria.topicId);
  const hasSubtopicFilter = !isWildcardFilterValue(criteria.subtopicId);
  const hasFormatFilter = !isWildcardFilterValue(criteria.format);
  const hasDifficultyFilter = !isWildcardFilterValue(criteria.difficulty);
  const hasVisualFilter = !isWildcardFilterValue(criteria.visualFamily);
  const hasStatusFilter = !isWildcardFilterValue(criteria.status);
  const normalizedQuery = criteria.searchQuery?.trim().toLowerCase() ?? "";

  const bookmarkedSet = progress
    ? new Set(progress.bookmarkedIds)
    : new Set<string>();

  return rows.filter((row) => {
    const matchingTags = row.syllabi.filter(
      (tag) => tag.syllabus === criteria.syllabus,
    );
    if (matchingTags.length === 0) {
      return false;
    }

    const tagMatchesHierarchy = matchingTags.some((tag) => {
      if (targetLevel && normalizeLevelToken(tag.level) !== targetLevel) {
        return false;
      }
      if (hasTopicFilter && tag.topicId !== criteria.topicId) {
        return false;
      }
      if (hasSubtopicFilter && tag.subtopicId !== criteria.subtopicId) {
        return false;
      }
      return true;
    });

    if (!tagMatchesHierarchy) {
      return false;
    }

    if (hasFormatFilter && row.format !== criteria.format) {
      return false;
    }

    if (hasDifficultyFilter && row.difficulty !== criteria.difficulty) {
      return false;
    }

    if (
      hasVisualFilter &&
      row.visualFamily !== criteria.visualFamily &&
      row.chunkKey !== criteria.visualFamily
    ) {
      return false;
    }

    if (criteria.onlyWithSvg && !row.hasSvg) {
      return false;
    }

    if (hasStatusFilter) {
      const attempt = progress?.attempts[row.id];
      if (criteria.status === "unseen" && attempt) {
        return false;
      }
      if (criteria.status === "needs-review" && !attempt?.needsReview) {
        return false;
      }
      if (criteria.status === "saved" && !bookmarkedSet.has(row.id)) {
        return false;
      }
    }

    if (normalizedQuery.length > 0) {
      const matchesId = row.id.toLowerCase().includes(normalizedQuery);
      const matchesConcept = row.conceptId
        .toLowerCase()
        .includes(normalizedQuery);
      const matchesFamily = row.familyGroupKey
        .toLowerCase()
        .includes(normalizedQuery);
      const matchesVisual = row.visualFamily
        .toLowerCase()
        .includes(normalizedQuery);
      const matchesTopic = matchingTags.some(
        (tag) =>
          tag.topicId.toLowerCase().includes(normalizedQuery) ||
          (tag.subtopicId?.toLowerCase().includes(normalizedQuery) ?? false),
      );
      if (
        !matchesId &&
        !matchesConcept &&
        !matchesFamily &&
        !matchesVisual &&
        !matchesTopic
      ) {
        return false;
      }
    }

    return true;
  });
}
