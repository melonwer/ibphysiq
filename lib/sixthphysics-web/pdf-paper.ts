import { filterIndexRows } from './client-loader';
import type {
  MockPaperFormatMode,
  MockPaperSession,
  PublicBankManifest,
  PublicQuestionIndexRow,
  QuestionDifficulty,
  SyllabusId,
} from './types';

export type ExamPaperDensity = 'exam-lines' | 'compact';
export type ExamPaperPageSize = 'a4' | 'letter';
export type ExamPaperPrintMode = 'paper' | 'markscheme' | 'both';
export type ExamPaperDifficultyMix =
  | 'exam-mix'
  | 'foundation'
  | 'standard'
  | 'higher';

export interface ExamPaperPreset {
  id: string;
  syllabus: SyllabusId;
  shortTitle: string;
  paperLabel: string;
  description: string;
  badgeLabel: string;
  formatMode: MockPaperFormatMode;
  mcqCount: number;
  structuredCount: number;
  durationMinutes: number;
  recommended?: boolean;
}

export interface ExamPaperBuildRequest {
  syllabus: SyllabusId;
  level?: string;
  presetId?: string;
  formatMode: MockPaperFormatMode;
  mcqCount: number;
  structuredCount: number;
  difficultyMix: ExamPaperDifficultyMix;
  topicIds?: string[];
  durationMinutes?: number;
  autoDuration?: boolean;
  seed?: number;
  excludeQuestionIds?: string[];
}

export interface ExamPaperOptions {
  title: string;
  customTitleEdited: boolean;
  subtitle: string;
  institutionLabel: string;
  includeCoverSheet: boolean;
  includeFormulaSheet: boolean;
  includeMcqBubbleSheet: boolean;
  includeDistractorNotes: boolean;
  density: ExamPaperDensity;
  pageSize: ExamPaperPageSize;
}

export interface ExamPaperDraft {
  draftId: string;
  paperCode: string;
  syllabus: SyllabusId;
  level: string;
  presetId?: string;
  formatMode: MockPaperFormatMode;
  difficultyMix: ExamPaperDifficultyMix;
  topicIds: string[];
  seed: number;
  questionRows: PublicQuestionIndexRow[];
  mcqRows: PublicQuestionIndexRow[];
  structuredRows: PublicQuestionIndexRow[];
  totalMarks: number;
  mcqMarks: number;
  structuredMarks: number;
  durationMinutes: number;
  autoDuration: boolean;
  estimatedPaperPages: number;
  createdAt: string;
}

export interface SyllabusExamMetadata {
  syllabus: SyllabusId;
  boardMasthead: string;
  subjectTitle: string;
  levelBadge: string;
  specSubtitle: string;
  gravityText: string;
  dataBookletName: string;
  sectionATitle: string;
  sectionBTitle: string;
  materials: string[];
  instructions: string[];
  formatMarkTag: (marks: number) => string;
}

export const EXAM_PAPER_PRESETS: readonly ExamPaperPreset[] = [
  // IB Physics (First Assessment 2025)
  {
    id: 'ib-pdf-full-mock',
    syllabus: 'ib',
    shortTitle: 'Full Practice Paper',
    paperLabel: 'Mixed Paper 1A + 2',
    description:
      'Balanced mix of Paper 1A multiple-choice and Paper 2 structured multipart questions across Themes A–E.',
    badgeLabel: '12 MCQ + 4 Struct',
    formatMode: 'mixed',
    mcqCount: 12,
    structuredCount: 4,
    durationMinutes: 50,
    recommended: true,
  },
  {
    id: 'ib-pdf-paper1a',
    syllabus: 'ib',
    shortTitle: 'Paper 1A · MCQs',
    paperLabel: 'Paper 1A',
    description:
      '20 multiple-choice questions with a printable A/B/C/D answer grid and g = 9.8 m s⁻² conventions.',
    badgeLabel: '20 MCQs · 30 min',
    formatMode: 'mcq',
    mcqCount: 20,
    structuredCount: 0,
    durationMinutes: 30,
  },
  {
    id: 'ib-pdf-paper2',
    syllabus: 'ib',
    shortTitle: 'Paper 2 · Structured',
    paperLabel: 'Paper 2',
    description:
      '5 extended multipart questions with ruled answer lines and full M1/A1 examiner mark schemes.',
    badgeLabel: '5 Qs · 40 min',
    formatMode: 'structured',
    mcqCount: 0,
    structuredCount: 5,
    durationMinutes: 40,
  },
  {
    id: 'ib-pdf-topic-quiz',
    syllabus: 'ib',
    shortTitle: 'Quick Revision Test',
    paperLabel: 'Short Assessment',
    description:
      'Compact 25-minute classroom quiz or homework check combining 6 MCQs and 2 structured questions.',
    badgeLabel: '8 Qs · 25 min',
    formatMode: 'mixed',
    mcqCount: 6,
    structuredCount: 2,
    durationMinutes: 25,
  },

  // UK A-Level Physics (DfE Core + AQA 7408)
  {
    id: 'alevel-pdf-paper1',
    syllabus: 'alevel',
    shortTitle: 'Core Mock Paper',
    paperLabel: 'Sections A & B',
    description:
      'Authentic UK A-Level booklet combining structured written problems and synoptic multiple-choice items.',
    badgeLabel: '12 MCQ + 4 Struct',
    formatMode: 'mixed',
    mcqCount: 12,
    structuredCount: 4,
    durationMinutes: 50,
    recommended: true,
  },
  {
    id: 'alevel-pdf-structured',
    syllabus: 'alevel',
    shortTitle: 'Structured Paper',
    paperLabel: 'Section A Written',
    description:
      '5 multi-step written calculations and derivations with Examiner Use cover table and lined space.',
    badgeLabel: '5 Qs · 40 min',
    formatMode: 'structured',
    mcqCount: 0,
    structuredCount: 5,
    durationMinutes: 40,
  },
  {
    id: 'alevel-pdf-mcq',
    syllabus: 'alevel',
    shortTitle: 'Multiple-Choice Sprint',
    paperLabel: 'Section B MCQs',
    description:
      '20 synoptic A-Level multiple-choice questions with detachable bubble sheet and g = 9.81 m s⁻².',
    badgeLabel: '20 MCQs · 30 min',
    formatMode: 'mcq',
    mcqCount: 20,
    structuredCount: 0,
    durationMinutes: 30,
  },
  {
    id: 'alevel-pdf-topic-quiz',
    syllabus: 'alevel',
    shortTitle: 'Quick Topic Test',
    paperLabel: 'Short Assessment',
    description:
      '25-minute end-of-topic test with 6 MCQs and 2 structured problems, ideal for class or homework.',
    badgeLabel: '8 Qs · 25 min',
    formatMode: 'mixed',
    mcqCount: 6,
    structuredCount: 2,
    durationMinutes: 25,
  },

  // NCUK International Foundation Year (IFYPH005)
  {
    id: 'ncuk-pdf-full-exam',
    syllabus: 'ncuk',
    shortTitle: 'IFY Exam Paper',
    paperLabel: 'Section A + Section B',
    description:
      'Full IFYPH005 mock paper combining Section A MCQs and Section B structured questions across AC1–AC8.',
    badgeLabel: '15 MCQ + 4 Struct',
    formatMode: 'mixed',
    mcqCount: 15,
    structuredCount: 4,
    durationMinutes: 55,
    recommended: true,
  },
  {
    id: 'ncuk-pdf-sec-a',
    syllabus: 'ncuk',
    shortTitle: 'Section A · MCQs',
    paperLabel: 'Section A',
    description:
      '20 Section A multiple-choice questions aligned to the NCUK Data, Formulae & Relationships booklet.',
    badgeLabel: '20 MCQs · 30 min',
    formatMode: 'mcq',
    mcqCount: 20,
    structuredCount: 0,
    durationMinutes: 30,
  },
  {
    id: 'ncuk-pdf-sec-b',
    syllabus: 'ncuk',
    shortTitle: 'Section B · Structured',
    paperLabel: 'Section B',
    description:
      '5 multipart Section B problems with lined working space and step-by-step M1/A1 mark schemes.',
    badgeLabel: '5 Qs · 40 min',
    formatMode: 'structured',
    mcqCount: 0,
    structuredCount: 5,
    durationMinutes: 40,
  },
  {
    id: 'ncuk-pdf-module-quiz',
    syllabus: 'ncuk',
    shortTitle: 'Quick Module Test',
    paperLabel: 'Short Assessment',
    description:
      'Focused 25-minute module check with 6 Section A MCQs and 2 Section B structured questions.',
    badgeLabel: '8 Qs · 25 min',
    formatMode: 'mixed',
    mcqCount: 6,
    structuredCount: 2,
    durationMinutes: 25,
  },
];

export function getExamPaperPresetsForSyllabus(
  syllabus: SyllabusId
): ExamPaperPreset[] {
  return EXAM_PAPER_PRESETS.filter((preset) => preset.syllabus === syllabus);
}

export function getDefaultPresetForSyllabus(
  syllabus: SyllabusId
): ExamPaperPreset {
  const presets = getExamPaperPresetsForSyllabus(syllabus);
  return presets.find((p) => p.recommended) ?? presets[0];
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicShuffle<T>(
  items: readonly T[],
  rng: () => number
): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

const DIFFICULTY_RANK: Record<QuestionDifficulty, number> = {
  foundation: 0,
  standard: 1,
  higher: 2,
};

export function generatePaperCode(syllabus: SyllabusId, seed: number): string {
  const prefix =
    syllabus === 'ib'
      ? 'SP-IB25'
      : syllabus === 'alevel'
        ? 'SP-AL74'
        : 'SP-NC05';
  const token = ((seed >>> 0) % 1679616)
    .toString(36)
    .toUpperCase()
    .padStart(4, '0');
  return `${prefix}-${token}`;
}

export function formatLevelDisplay(
  syllabus: SyllabusId,
  level?: string
): string {
  const norm = (level ?? 'all').trim().toUpperCase();
  if (syllabus === 'ib') {
    if (norm === 'SL') return 'Standard Level (SL)';
    if (norm === 'HL') return 'Higher Level (HL)';
    return 'SL & HL Combined';
  }
  if (syllabus === 'alevel') {
    if (norm === 'Y12' || norm === 'AS') return 'AS / Year 12';
    if (norm === 'Y13') return 'A-Level / Year 13';
    return 'AS & A-Level';
  }
  if (norm === 'IFY-S1' || norm === 'S1') return 'Semester 1 (IFY-S1)';
  if (norm === 'IFY-S2' || norm === 'S2') return 'Semester 2 (IFY-S2)';
  if (norm === 'IFY') return 'Full IFY Core';
  return 'IFY Full Course';
}

export function buildDefaultPaperTitle(
  syllabus: SyllabusId,
  level: string | undefined,
  formatMode: MockPaperFormatMode,
  presetPaperLabel?: string
): string {
  const normLevel = (level ?? 'all').trim().toUpperCase();
  const levelToken =
    normLevel && normLevel !== 'ALL'
      ? syllabus === 'ncuk'
        ? normLevel.replace('IFY-', '')
        : normLevel
      : '';

  if (syllabus === 'ib') {
    const paperSuffix =
      presetPaperLabel ??
      (formatMode === 'mcq'
        ? 'Paper 1A'
        : formatMode === 'structured'
          ? 'Paper 2'
          : 'Practice Mock Paper');
    return ['IB Physics', levelToken, paperSuffix].filter(Boolean).join(' · ');
  }

  if (syllabus === 'alevel') {
    const paperSuffix =
      presetPaperLabel ??
      (formatMode === 'mcq'
        ? 'Multiple-Choice Paper'
        : formatMode === 'structured'
          ? 'Structured Paper'
          : 'Core Mock Paper');
    return ['A-Level Physics', levelToken, paperSuffix]
      .filter(Boolean)
      .join(' · ');
  }

  const paperSuffix =
    presetPaperLabel ??
    (formatMode === 'mcq'
      ? 'Section A (MCQ)'
      : formatMode === 'structured'
        ? 'Section B (Structured)'
        : 'Mock Examination');
  return ['NCUK IFY Physics', levelToken, paperSuffix]
    .filter(Boolean)
    .join(' · ');
}

export function createDefaultExamPaperOptions(
  syllabus: SyllabusId,
  level: string | undefined,
  formatMode: MockPaperFormatMode,
  presetPaperLabel?: string
): ExamPaperOptions {
  return {
    title: buildDefaultPaperTitle(syllabus, level, formatMode, presetPaperLabel),
    customTitleEdited: false,
    subtitle: '',
    institutionLabel: '',
    includeCoverSheet: true,
    includeFormulaSheet: true,
    includeMcqBubbleSheet: formatMode !== 'structured',
    includeDistractorNotes: true,
    density: 'exam-lines',
    pageSize: 'a4',
  };
}

/**
 * Estimates authentic exam timing from the selected questions:
 * ~1.5 min per MCQ mark + ~1.35 min per structured mark, rounded to nearest 5 minutes.
 */
export function calculateRecommendedMinutes(
  rows: readonly PublicQuestionIndexRow[]
): number {
  if (rows.length === 0) return 15;
  let rawMinutes = 0;
  for (const row of rows) {
    if (row.format === 'mcq') {
      rawMinutes += Math.max(1, row.totalMarks) * 1.5;
    } else {
      rawMinutes += Math.max(2, row.totalMarks) * 1.35;
    }
  }
  const rounded = Math.round(rawMinutes / 5) * 5;
  return Math.max(10, Math.min(180, rounded));
}

/**
 * Rough page-count estimate for the live summary badge (cover + data sheet + questions).
 */
export function estimateExamPaperPages(
  draft: Pick<ExamPaperDraft, 'mcqRows' | 'structuredRows'>,
  options: Pick<
    ExamPaperOptions,
    | 'includeCoverSheet'
    | 'includeFormulaSheet'
    | 'includeMcqBubbleSheet'
    | 'density'
  >
): number {
  let pages = 0;
  if (options.includeCoverSheet) pages += 1;
  if (options.includeFormulaSheet) pages += 1;

  const mcqsPerPage = options.density === 'compact' ? 3.2 : 2.3;
  if (draft.mcqRows.length > 0) {
    pages += Math.max(1, Math.ceil(draft.mcqRows.length / mcqsPerPage));
    if (options.includeMcqBubbleSheet) {
      pages += 1;
    }
  }

  const structPerPage = options.density === 'compact' ? 1.8 : 1.05;
  if (draft.structuredRows.length > 0) {
    pages += Math.max(1, Math.ceil(draft.structuredRows.length / structPerPage));
  }

  return Math.max(1, pages);
}

/**
 * Computes dotted answer-line count for a structured subpart based on its marks
 * and the chosen print density.
 */
export function estimateStructuredLineCount(
  marks: number,
  density: ExamPaperDensity
): number {
  const safeMarks = Math.max(1, Math.round(marks));
  if (density === 'compact') {
    return Math.min(4, Math.max(2, safeMarks + 1));
  }
  if (safeMarks === 1) return 3;
  if (safeMarks === 2) return 5;
  if (safeMarks === 3) return 7;
  return Math.min(10, safeMarks * 2 + 1);
}

function selectStratifiedUniqueFamiliesForPdf(
  pool: readonly PublicQuestionIndexRow[],
  syllabus: SyllabusId,
  desiredCount: number,
  usedFamilies: Set<string>,
  usedIds: Set<string>,
  rng: () => number
): PublicQuestionIndexRow[] {
  if (desiredCount <= 0 || pool.length === 0) return [];

  const shuffled = deterministicShuffle(pool, rng);
  const buckets = new Map<string, PublicQuestionIndexRow[]>();

  for (const row of shuffled) {
    const tag = row.syllabi.find((t) => t.syllabus === syllabus);
    const topicKey = tag?.topicId ?? 'general';
    const list = buckets.get(topicKey);
    if (list) {
      list.push(row);
    } else {
      buckets.set(topicKey, [row]);
    }
  }

  const topicKeys = deterministicShuffle([...buckets.keys()], rng);
  const selected: PublicQuestionIndexRow[] = [];

  let madeProgress = true;
  while (selected.length < desiredCount && madeProgress) {
    madeProgress = false;
    for (const topicKey of topicKeys) {
      if (selected.length >= desiredCount) break;
      const bucket = buckets.get(topicKey);
      if (!bucket || bucket.length === 0) continue;

      while (bucket.length > 0) {
        const candidate = bucket.shift()!;
        if (
          usedIds.has(candidate.id) ||
          usedFamilies.has(candidate.familyGroupKey)
        ) {
          continue;
        }
        selected.push(candidate);
        usedIds.add(candidate.id);
        usedFamilies.add(candidate.familyGroupKey);
        madeProgress = true;
        break;
      }
    }
  }

  return selected;
}

function selectWithDifficultyMix(
  pool: readonly PublicQuestionIndexRow[],
  syllabus: SyllabusId,
  desiredCount: number,
  difficultyMix: ExamPaperDifficultyMix,
  usedFamilies: Set<string>,
  usedIds: Set<string>,
  rng: () => number
): PublicQuestionIndexRow[] {
  if (desiredCount <= 0 || pool.length === 0) return [];

  if (difficultyMix !== 'exam-mix') {
    return selectStratifiedUniqueFamiliesForPdf(
      pool,
      syllabus,
      desiredCount,
      usedFamilies,
      usedIds,
      rng
    );
  }

  // Real exam difficulty ramp: ~30% foundation, ~45% standard, ~25% higher
  const foundationTarget = Math.max(
    desiredCount >= 3 ? 1 : 0,
    Math.round(desiredCount * 0.3)
  );
  const higherTarget = Math.max(
    desiredCount >= 4 ? 1 : 0,
    Math.round(desiredCount * 0.25)
  );
  const standardTarget = Math.max(
    0,
    desiredCount - foundationTarget - higherTarget
  );

  const foundationPool = pool.filter((r) => r.difficulty === 'foundation');
  const standardPool = pool.filter((r) => r.difficulty === 'standard');
  const higherPool = pool.filter((r) => r.difficulty === 'higher');

  const chosen: PublicQuestionIndexRow[] = [
    ...selectStratifiedUniqueFamiliesForPdf(
      foundationPool,
      syllabus,
      foundationTarget,
      usedFamilies,
      usedIds,
      rng
    ),
    ...selectStratifiedUniqueFamiliesForPdf(
      standardPool,
      syllabus,
      standardTarget,
      usedFamilies,
      usedIds,
      rng
    ),
    ...selectStratifiedUniqueFamiliesForPdf(
      higherPool,
      syllabus,
      higherTarget,
      usedFamilies,
      usedIds,
      rng
    ),
  ];

  // Top up from full pool if any difficulty tier was underrepresented in a narrow topic filter
  const shortfall = desiredCount - chosen.length;
  if (shortfall > 0) {
    chosen.push(
      ...selectStratifiedUniqueFamiliesForPdf(
        pool,
        syllabus,
        shortfall,
        usedFamilies,
        usedIds,
        rng
      )
    );
  }

  chosen.sort(
    (a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]
  );

  return chosen;
}

function buildDraftTotals(
  questionRows: PublicQuestionIndexRow[]
): Pick<
  ExamPaperDraft,
  'mcqRows' | 'structuredRows' | 'totalMarks' | 'mcqMarks' | 'structuredMarks'
> {
  const mcqRows = questionRows.filter((row) => row.format === 'mcq');
  const structuredRows = questionRows.filter(
    (row) => row.format === 'structured'
  );
  const mcqMarks = mcqRows.reduce((sum, r) => sum + r.totalMarks, 0);
  const structuredMarks = structuredRows.reduce(
    (sum, r) => sum + r.totalMarks,
    0
  );
  return {
    mcqRows,
    structuredRows,
    mcqMarks,
    structuredMarks,
    totalMarks: mcqMarks + structuredMarks,
  };
}

/**
 * Builds an exam-style PDF draft with strict family-group deduplication,
 * topic stratification, and authentic difficulty ramping.
 */
export function buildExamPaperDraft(
  manifest: PublicBankManifest,
  request: ExamPaperBuildRequest,
  now: Date = new Date()
): ExamPaperDraft {
  const seed =
    typeof request.seed === 'number'
      ? request.seed >>> 0
      : (now.getTime() ^ 0x9e3779b9) >>> 0;
  const rng = createMulberry32(seed);

  const normalizedLevel =
    request.level && request.level.trim() !== '' ? request.level : 'all';

  const baseFiltered = filterIndexRows(manifest.items, {
    syllabus: request.syllabus,
    level: normalizedLevel,
    difficulty:
      request.difficultyMix === 'exam-mix' ? 'all' : request.difficultyMix,
  });

  const excludedSet = new Set(request.excludeQuestionIds ?? []);
  const allowedTopics =
    request.topicIds && request.topicIds.length > 0
      ? new Set(request.topicIds)
      : null;

  const eligibleRows = baseFiltered.filter((row) => {
    if (excludedSet.has(row.id)) return false;
    if (allowedTopics) {
      const hasMatchingTopic = row.syllabi.some(
        (tag) =>
          tag.syllabus === request.syllabus && allowedTopics.has(tag.topicId)
      );
      if (!hasMatchingTopic) return false;
    }
    return true;
  });

  const mcqPool = eligibleRows.filter((r) => r.format === 'mcq');
  const structuredPool = eligibleRows.filter((r) => r.format === 'structured');

  const usedFamilies = new Set<string>();
  const usedIds = new Set<string>();

  const desiredMcq =
    request.formatMode === 'structured'
      ? 0
      : Math.max(0, Math.min(40, Math.round(request.mcqCount)));
  const desiredStructured =
    request.formatMode === 'mcq'
      ? 0
      : Math.max(0, Math.min(12, Math.round(request.structuredCount)));

  const chosenMcqs = selectWithDifficultyMix(
    mcqPool,
    request.syllabus,
    desiredMcq,
    request.difficultyMix,
    usedFamilies,
    usedIds,
    rng
  );
  const chosenStructured = selectWithDifficultyMix(
    structuredPool,
    request.syllabus,
    desiredStructured,
    request.difficultyMix,
    usedFamilies,
    usedIds,
    rng
  );

  const orderedRows = [...chosenMcqs, ...chosenStructured];
  const totals = buildDraftTotals(orderedRows);
  const autoDuration = request.autoDuration ?? true;
  const durationMinutes =
    !autoDuration && typeof request.durationMinutes === 'number'
      ? Math.max(5, Math.min(240, Math.round(request.durationMinutes)))
      : calculateRecommendedMinutes(orderedRows);

  const paperCode = generatePaperCode(request.syllabus, seed);

  return {
    draftId: `pdf-${request.syllabus}-${seed.toString(36)}`,
    paperCode,
    syllabus: request.syllabus,
    level: normalizedLevel,
    presetId: request.presetId,
    formatMode: request.formatMode,
    difficultyMix: request.difficultyMix,
    topicIds: request.topicIds ? [...request.topicIds] : [],
    seed,
    questionRows: orderedRows,
    ...totals,
    durationMinutes,
    autoDuration,
    estimatedPaperPages: estimateExamPaperPages(totals, {
      includeCoverSheet: true,
      includeFormulaSheet: true,
      includeMcqBubbleSheet: totals.mcqRows.length > 0,
      density: 'exam-lines',
    }),
    createdAt: now.toISOString(),
  };
}

/**
 * Converts an existing interactive `MockPaperSession` into an `ExamPaperDraft`
 * preserving the exact questions, order, syllabus, and timer.
 */
export function buildExamPaperDraftFromSession(
  session: MockPaperSession
): ExamPaperDraft {
  const orderedRows = [...session.questionRows];
  const totals = buildDraftTotals(orderedRows);
  const seed =
    typeof session.config.seed === 'number'
      ? session.config.seed >>> 0
      : Math.abs(
          Array.from(session.sessionId).reduce(
            (acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0,
            7
          )
        );
  const paperCode = generatePaperCode(session.config.syllabus, seed);
  const difficultyMix: ExamPaperDifficultyMix =
    session.config.difficulty && session.config.difficulty !== 'all'
      ? session.config.difficulty
      : 'exam-mix';

  return {
    draftId: `pdf-from-${session.sessionId}`,
    paperCode,
    syllabus: session.config.syllabus,
    level: session.config.level ?? 'all',
    presetId: session.config.presetId,
    formatMode: session.config.formatMode,
    difficultyMix,
    topicIds: session.config.topicIds ? [...session.config.topicIds] : [],
    seed,
    questionRows: orderedRows,
    ...totals,
    durationMinutes: Math.max(5, Math.round(session.durationSeconds / 60)),
    autoDuration: false,
    estimatedPaperPages: estimateExamPaperPages(totals, {
      includeCoverSheet: true,
      includeFormulaSheet: true,
      includeMcqBubbleSheet: totals.mcqRows.length > 0,
      density: 'exam-lines',
    }),
    createdAt: session.startedAt,
  };
}

/**
 * Replaces a single question in `draft` with a fresh, unique-family candidate
 * matching the same format (and preferring the same topic), updating marks and
 * auto-duration cleanly. Returns `null` if no valid replacement exists.
 */
export function swapQuestionInDraft(
  manifest: PublicBankManifest,
  draft: ExamPaperDraft,
  indexToSwap: number,
  seed: number = Date.now()
): ExamPaperDraft | null {
  const target = draft.questionRows[indexToSwap];
  if (!target) return null;

  const usedIds = new Set(draft.questionRows.map((r) => r.id));
  const usedFamilies = new Set(draft.questionRows.map((r) => r.familyGroupKey));

  const baseCandidates = filterIndexRows(manifest.items, {
    syllabus: draft.syllabus,
    level: draft.level,
    format: target.format,
    difficulty:
      draft.difficultyMix === 'exam-mix' ? 'all' : draft.difficultyMix,
  });

  const allowedTopics =
    draft.topicIds.length > 0 ? new Set(draft.topicIds) : null;

  const validCandidates = baseCandidates.filter((row) => {
    if (usedIds.has(row.id) || usedFamilies.has(row.familyGroupKey)) {
      return false;
    }
    if (allowedTopics) {
      return row.syllabi.some(
        (tag) => tag.syllabus === draft.syllabus && allowedTopics.has(tag.topicId)
      );
    }
    return true;
  });

  if (validCandidates.length === 0) {
    return null;
  }

  const targetTopicId = target.syllabi.find(
    (tag) => tag.syllabus === draft.syllabus
  )?.topicId;
  const sameTopicCandidates = targetTopicId
    ? validCandidates.filter((row) =>
        row.syllabi.some(
          (tag) =>
            tag.syllabus === draft.syllabus && tag.topicId === targetTopicId
        )
      )
    : [];

  const pool =
    sameTopicCandidates.length > 0 ? sameTopicCandidates : validCandidates;
  const rng = createMulberry32(seed ^ (indexToSwap * 2654435761));
  const replacement = pool[Math.floor(rng() * pool.length)];
  if (!replacement) return null;

  const nextRows = [...draft.questionRows];
  nextRows[indexToSwap] = replacement;
  const totals = buildDraftTotals(nextRows);

  return {
    ...draft,
    questionRows: nextRows,
    ...totals,
    durationMinutes: draft.autoDuration
      ? calculateRecommendedMinutes(nextRows)
      : draft.durationMinutes,
  };
}

/**
 * Reorders a question within its section (or across the list) cleanly.
 */
export function moveQuestionInDraft(
  draft: ExamPaperDraft,
  fromIndex: number,
  toIndex: number
): ExamPaperDraft {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= draft.questionRows.length ||
    toIndex >= draft.questionRows.length ||
    fromIndex === toIndex
  ) {
    return draft;
  }

  const nextRows = [...draft.questionRows];
  const [moved] = nextRows.splice(fromIndex, 1);
  if (!moved) return draft;
  nextRows.splice(toIndex, 0, moved);
  const totals = buildDraftTotals(nextRows);

  return {
    ...draft,
    questionRows: nextRows,
    ...totals,
  };
}

/**
 * Removes a single question from `draft` (refusing to empty the paper below 1 question).
 */
export function removeQuestionFromDraft(
  draft: ExamPaperDraft,
  indexToRemove: number
): ExamPaperDraft {
  if (
    draft.questionRows.length <= 1 ||
    indexToRemove < 0 ||
    indexToRemove >= draft.questionRows.length
  ) {
    return draft;
  }

  const nextRows = draft.questionRows.filter((_, idx) => idx !== indexToRemove);
  const totals = buildDraftTotals(nextRows);

  return {
    ...draft,
    questionRows: nextRows,
    ...totals,
    durationMinutes: draft.autoDuration
      ? calculateRecommendedMinutes(nextRows)
      : draft.durationMinutes,
  };
}

/**
 * Builds a clean, OS-safe suggested PDF filename (assigned to `document.title`
 * during `window.print()` so Save as PDF proposes a clear filename).
 */
export function buildExamPdfFilename(
  draft: Pick<ExamPaperDraft, 'syllabus' | 'paperCode'>,
  title: string,
  printMode: ExamPaperPrintMode
): string {
  const slug = title
    .replace(/[·/\\:?*"<>|]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9-_]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);

  const suffix =
    printMode === 'markscheme'
      ? 'Mark-Scheme'
      : printMode === 'both'
        ? 'Complete-Pack'
        : 'Question-Paper';

  const base = slug || `SixthPhysics-${draft.syllabus.toUpperCase()}-Mock`;
  return `${base}-${draft.paperCode}-${suffix}`;
}

/**
 * Returns authentic exam-board cover metadata, instructions, permitted materials,
 * and mark formatting conventions for IB 2025, UK A-Level, or NCUK IFY.
 */
export function getSyllabusExamMetadata(
  syllabus: SyllabusId,
  level: string | undefined,
  counts: { mcqCount: number; structuredCount: number; totalMarks: number },
  includeFormulaSheet: boolean
): SyllabusExamMetadata {
  const hasMcq = counts.mcqCount > 0;
  const hasStructured = counts.structuredCount > 0;
  const levelBadge = formatLevelDisplay(syllabus, level);

  if (syllabus === 'ib') {
    const instructions = [
      'Do not open this examination paper until instructed to do so.',
      hasMcq && hasStructured
        ? 'Answer all questions in Section A (multiple-choice) and Section B (structured).'
        : hasMcq
          ? 'Answer all multiple-choice questions. For each question, choose the answer you consider to be the best.'
          : 'Answer all structured questions in the spaces provided, showing clear working.',
      includeFormulaSheet
        ? 'A selected Physics Data Booklet reference sheet is attached to this paper.'
        : 'A clean copy of the IB Physics Data Booklet (First Assessment 2025) is required for this paper.',
      'Unless otherwise stated, take the acceleration of free fall g = 9.8 m s⁻².',
      `The maximum mark for this examination paper is [${counts.totalMarks} marks].`,
    ];

    return {
      syllabus,
      boardMasthead: 'INTERNATIONAL BACCALAUREATE · PRACTICE EXAMINATION',
      subjectTitle: 'PHYSICS',
      levelBadge,
      specSubtitle: 'First Assessment 2025 Specification',
      gravityText: 'g = 9.8 m s⁻²',
      dataBookletName: 'IB Physics Data Booklet (Selected Constants & Equations)',
      sectionATitle: hasStructured
        ? 'Section A — Paper 1A Multiple-Choice Questions'
        : 'Paper 1A — Multiple-Choice Questions',
      sectionBTitle: hasMcq
        ? 'Section B — Paper 2 Structured Questions'
        : 'Paper 2 — Structured Questions',
      materials: [
        'Scientific or graphic display calculator (clean memory)',
        'Ruler, pencil, and black or blue ink pen',
        'IB Physics Data Booklet (First Assessment 2025)',
      ],
      instructions,
      formatMarkTag: (marks: number) => `[${marks}]`,
    };
  }

  if (syllabus === 'alevel') {
    const instructions = [
      'Use black ink or black ball-point pen. Use pencil for diagrams and graphs.',
      hasMcq && hasStructured
        ? 'Answer all questions in Section A (multiple choice) and Section B (written response).'
        : hasMcq
          ? 'Answer all multiple-choice questions by shading or circling one letter (A, B, C, or D).'
          : 'Answer all questions in the spaces provided. Show full numerical working to earn method marks.',
      'Unless otherwise stated, take gravitational field strength g = 9.81 N kg⁻¹ (m s⁻²).',
      'Give final numerical answers to an appropriate number of significant figures with correct SI units.',
      `The marks for questions are shown in brackets. The maximum mark for this paper is ${counts.totalMarks}.`,
    ];

    return {
      syllabus,
      boardMasthead: 'GCE PHYSICS · PRACTICE EXAMINATION',
      subjectTitle: 'A-LEVEL PHYSICS',
      levelBadge,
      specSubtitle: 'DfE Core Subject Content · AQA 7408 / OCR / CIE Aligned',
      gravityText: 'g = 9.81 m s⁻²',
      dataBookletName: 'Data and Formulae Sheet (Selected Reference)',
      sectionATitle: hasStructured
        ? 'Section A — Multiple-Choice Questions'
        : 'Multiple-Choice Questions',
      sectionBTitle: hasMcq
        ? 'Section B — Structured Questions'
        : 'Structured Questions',
      materials: [
        'A pencil and a ruler',
        'A scientific calculator',
        includeFormulaSheet
          ? 'Data and Formulae Sheet (included in this booklet)'
          : 'A Data and Formulae Booklet',
      ],
      instructions,
      formatMarkTag: (marks: number) =>
        marks === 1 ? '[1 mark]' : `[${marks} marks]`,
    };
  }

  // NCUK IFY Physics (IFYPH005)
  const instructions = [
    'Write clearly in dark blue or black ink. Diagrams may be drawn in pencil.',
    hasMcq && hasStructured
      ? 'This paper consists of Section A (Multiple Choice) and Section B (Structured Questions). Answer all questions.'
      : hasMcq
        ? 'Answer all Section A multiple-choice questions. Each question carries 1 mark.'
        : 'Answer all Section B structured questions. Show all intermediate steps clearly to earn method marks.',
    'Take the acceleration due to gravity g = 9.81 m s⁻² unless told otherwise, and give answers to 3 significant figures.',
    includeFormulaSheet
      ? 'A selected NCUK Data, Formulae & Relationships sheet is provided inside this paper.'
      : 'An NCUK Data, Formulae & Relationships Booklet is permitted for this examination.',
    `Total marks available for this paper: ${counts.totalMarks} marks.`,
  ];

  return {
    syllabus,
    boardMasthead: 'THE NCUK INTERNATIONAL FOUNDATION YEAR · PRACTICE PAPER',
    subjectTitle: 'IFYPH005 PHYSICS',
    levelBadge,
    specSubtitle: 'NCUK IFY Physics Specification (Modules AC1–AC8)',
    gravityText: 'g = 9.81 m s⁻²',
    dataBookletName: 'NCUK Data, Formulae & Relationships (Selected Extract)',
    sectionATitle: 'Section A — Multiple-Choice Questions',
    sectionBTitle: 'Section B — Structured Questions',
    materials: [
      'Approved non-programmable scientific calculator',
      'Ruler, protractor, pencil, and black/blue pen',
      'NCUK Data, Formulae and Relationships Booklet',
    ],
    instructions,
    formatMarkTag: (marks: number) =>
      marks === 1 ? '(1 mark)' : `(${marks} marks)`,
  };
}
