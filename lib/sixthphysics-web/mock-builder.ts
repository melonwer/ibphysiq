import { filterIndexRows } from "./client-loader";
import type {
  MockPaperConfig,
  MockPaperPreset,
  MockPaperResultSummary,
  MockPaperSession,
  MockQuestionResponse,
  MockTopicBreakdown,
  PublicBankItem,
  PublicBankManifest,
  PublicQuestionIndexRow,
  QuestionDifficulty,
  SyllabusId,
} from "./types";

export const MOCK_PAPER_PRESETS: readonly MockPaperPreset[] = [
  // IB Physics (First Assessment 2025)
  {
    id: "ib-paper-1a-sprint",
    syllabus: "ib",
    title: "IB Paper 1A Sprint · 20 MCQs · 30 min",
    subtitle:
      "20 four-option Paper 1A multiple-choice questions across Themes A–E with Data Booklet conventions (g = 9.8 m s⁻²).",
    badgeLabel: "20 MCQs · 30 min",
    formatMode: "mcq",
    questionCount: 20,
    durationMinutes: 30,
    mcqCount: 20,
    structuredCount: 0,
  },
  {
    id: "ib-paper-2-structured",
    syllabus: "ib",
    title: "IB Paper 2 Structured · ~25 marks · 40 min",
    subtitle:
      "Multipart extended-response Paper 2 questions with step-by-step examiner mark schemes (M1/A1).",
    badgeLabel: "~25 marks · 40 min",
    formatMode: "structured",
    questionCount: 5,
    targetTotalMarks: 25,
    durationMinutes: 40,
    mcqCount: 0,
    structuredCount: 5,
  },
  {
    id: "ib-full-mixed",
    syllabus: "ib",
    title: "IB Full Mixed Exam · 45 min",
    subtitle:
      "Combined Paper 1A multiple-choice sprint plus Paper 2 multipart structured problems across Themes A–E.",
    badgeLabel: "20 Qs · 45 min",
    formatMode: "mixed",
    questionCount: 20,
    durationMinutes: 45,
    mcqCount: 16,
    structuredCount: 4,
  },

  // UK A-Level Physics (DfE Core + AQA 7407/7408)
  {
    id: "alevel-core-mock",
    syllabus: "alevel",
    title: "UK A-Level Core Mock · 25 Qs · 40 min",
    subtitle:
      "Balanced Section A/B structured questions and multiple-choice items across Sections 1–8 (g = 9.81 m s⁻²).",
    badgeLabel: "25 Qs · 40 min",
    formatMode: "mixed",
    questionCount: 25,
    durationMinutes: 40,
    mcqCount: 21,
    structuredCount: 4,
  },
  {
    id: "alevel-mcq-sprint",
    syllabus: "alevel",
    title: "Paper 1A MCQ Sprint · 20 Qs · 30 min",
    subtitle:
      "20 synoptic UK A-Level multiple-choice questions testing quantitative fluency and experimental skills.",
    badgeLabel: "20 MCQs · 30 min",
    formatMode: "mcq",
    questionCount: 20,
    durationMinutes: 30,
    mcqCount: 20,
    structuredCount: 0,
  },
  {
    id: "alevel-paper-2-structured",
    syllabus: "alevel",
    title: "Paper 2 Structured · ~25 marks · 40 min",
    subtitle:
      "Multi-step UK A-Level structured calculations and derivations with point-by-point rubric marking.",
    badgeLabel: "~25 marks · 40 min",
    formatMode: "structured",
    questionCount: 5,
    targetTotalMarks: 25,
    durationMinutes: 40,
    mcqCount: 0,
    structuredCount: 5,
  },

  // NCUK International Foundation Year (IFYPH005)
  {
    id: "ncuk-exam-simulation",
    syllabus: "ncuk",
    title: "NCUK IFY Exam Simulation · 25 Qs · 40 min",
    subtitle:
      "Cumulative IFYPH005 exam simulation combining 20 Section A MCQs and 5 structured problems across AC1–AC8.",
    badgeLabel: "25 Qs · 40 min",
    formatMode: "mixed",
    questionCount: 25,
    durationMinutes: 40,
    mcqCount: 20,
    structuredCount: 5,
  },
  {
    id: "ncuk-mcq-sprint",
    syllabus: "ncuk",
    title: "NCUK Section A Sprint · 20 MCQs · 30 min",
    subtitle:
      "20 Section A multiple-choice questions aligned to the NCUK Data, Formulae & Relationships booklet (g = 9.81 m s⁻²).",
    badgeLabel: "20 MCQs · 30 min",
    formatMode: "mcq",
    questionCount: 20,
    durationMinutes: 30,
    mcqCount: 20,
    structuredCount: 0,
  },
  {
    id: "ncuk-structured-paper",
    syllabus: "ncuk",
    title: "NCUK Section B Structured · ~25 marks · 40 min",
    subtitle:
      "Multipart Section B calculation and application problems with explicit M1/A1 mark-scheme criteria.",
    badgeLabel: "~25 marks · 40 min",
    formatMode: "structured",
    questionCount: 5,
    targetTotalMarks: 25,
    durationMinutes: 40,
    mcqCount: 0,
    structuredCount: 5,
  },
];

export function getMockPresetsForSyllabus(
  syllabus: SyllabusId,
): MockPaperPreset[] {
  return MOCK_PAPER_PRESETS.filter((preset) => preset.syllabus === syllabus);
}

export function createConfigFromPreset(
  preset: MockPaperPreset,
  overrides: Partial<MockPaperConfig> = {},
): MockPaperConfig {
  return {
    presetId: preset.id,
    title: preset.title,
    syllabus: preset.syllabus,
    level: preset.level ?? "all",
    formatMode: preset.formatMode,
    questionCount: preset.questionCount,
    targetTotalMarks: preset.targetTotalMarks,
    durationMinutes: preset.durationMinutes,
    mcqCount: preset.mcqCount,
    structuredCount: preset.structuredCount,
    ...overrides,
  };
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
  rng: () => number,
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

function selectStratifiedUniqueFamilies(
  pool: readonly PublicQuestionIndexRow[],
  syllabus: SyllabusId,
  desiredCount: number,
  usedFamilies: Set<string>,
  usedIds: Set<string>,
  rng: () => number,
  targetTotalMarks?: number,
): PublicQuestionIndexRow[] {
  if (desiredCount <= 0 || pool.length === 0) {
    return [];
  }

  const shuffled = deterministicShuffle(pool, rng);
  const buckets = new Map<string, PublicQuestionIndexRow[]>();

  for (const row of shuffled) {
    const tag = row.syllabi.find((t) => t.syllabus === syllabus);
    const topicKey = tag?.topicId ?? "general";
    const list = buckets.get(topicKey);
    if (list) {
      list.push(row);
    } else {
      buckets.set(topicKey, [row]);
    }
  }

  const topicKeys = deterministicShuffle([...buckets.keys()], rng);
  const selected: PublicQuestionIndexRow[] = [];
  let accumulatedMarks = 0;

  let madeProgress = true;
  while (selected.length < desiredCount && madeProgress) {
    madeProgress = false;

    for (const topicKey of topicKeys) {
      if (selected.length >= desiredCount) break;
      if (
        typeof targetTotalMarks === "number" &&
        selected.length >= 2 &&
        accumulatedMarks >= targetTotalMarks
      ) {
        madeProgress = false;
        break;
      }

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

        if (
          typeof targetTotalMarks === "number" &&
          selected.length >= 2 &&
          accumulatedMarks + candidate.totalMarks > targetTotalMarks + 4
        ) {
          // Prefer a tighter mark fit if other candidates remain
          continue;
        }

        selected.push(candidate);
        usedIds.add(candidate.id);
        usedFamilies.add(candidate.familyGroupKey);
        accumulatedMarks += candidate.totalMarks;
        madeProgress = true;
        break;
      }
    }
  }

  // Second pass without mark-cap overshoot guard if targetTotalMarks left us short of minimum items
  if (
    typeof targetTotalMarks === "number" &&
    accumulatedMarks < targetTotalMarks - 3 &&
    selected.length < desiredCount
  ) {
    for (const row of shuffled) {
      if (selected.length >= desiredCount) break;
      if (usedIds.has(row.id) || usedFamilies.has(row.familyGroupKey)) {
        continue;
      }
      selected.push(row);
      usedIds.add(row.id);
      usedFamilies.add(row.familyGroupKey);
      accumulatedMarks += row.totalMarks;
      if (accumulatedMarks >= targetTotalMarks) {
        break;
      }
    }
  }

  return selected;
}

/**
 * Builds a timed `MockPaperSession` from `manifest`, enforcing strict
 * `familyGroupKey` deduplication so two parametric variants of the same
 * physics template never appear together in the same mock paper.
 */
export function buildMockPaperSession(
  manifest: PublicBankManifest,
  config: MockPaperConfig,
  now: Date = new Date(),
): MockPaperSession {
  const seed =
    typeof config.seed === "number"
      ? config.seed
      : (now.getTime() ^ 0x5f3759df) >>> 0;
  const rng = createMulberry32(seed);

  const baseFiltered = filterIndexRows(manifest.items, {
    syllabus: config.syllabus,
    level: config.level,
    difficulty: config.difficulty,
  });

  const excludedSet = new Set(config.excludeQuestionIds ?? []);
  const allowedTopics =
    config.topicIds && config.topicIds.length > 0
      ? new Set(config.topicIds)
      : null;

  const eligibleRows = baseFiltered.filter((row) => {
    if (excludedSet.has(row.id)) {
      return false;
    }
    if (allowedTopics) {
      const tag = row.syllabi.find((t) => t.syllabus === config.syllabus);
      if (!tag || !allowedTopics.has(tag.topicId)) {
        return false;
      }
    }
    return true;
  });

  const mcqPool = eligibleRows.filter((row) => row.format === "mcq");
  const structuredPool = eligibleRows.filter(
    (row) => row.format === "structured",
  );

  const usedFamilies = new Set<string>();
  const usedIds = new Set<string>();

  const requestedTotal = Math.max(1, config.questionCount);
  let chosenMcqs: PublicQuestionIndexRow[] = [];
  let chosenStructured: PublicQuestionIndexRow[] = [];

  if (config.formatMode === "mcq") {
    chosenMcqs = selectStratifiedUniqueFamilies(
      mcqPool,
      config.syllabus,
      requestedTotal,
      usedFamilies,
      usedIds,
      rng,
    );
  } else if (config.formatMode === "structured") {
    const maxStructuredCount = config.targetTotalMarks
      ? Math.max(requestedTotal, Math.ceil(config.targetTotalMarks / 3))
      : requestedTotal;
    chosenStructured = selectStratifiedUniqueFamilies(
      structuredPool,
      config.syllabus,
      maxStructuredCount,
      usedFamilies,
      usedIds,
      rng,
      config.targetTotalMarks,
    );
  } else {
    const desiredStructured =
      typeof config.structuredCount === "number"
        ? config.structuredCount
        : Math.max(1, Math.round(requestedTotal * 0.2));
    const desiredMcq =
      typeof config.mcqCount === "number"
        ? config.mcqCount
        : Math.max(1, requestedTotal - desiredStructured);

    chosenMcqs = selectStratifiedUniqueFamilies(
      mcqPool,
      config.syllabus,
      desiredMcq,
      usedFamilies,
      usedIds,
      rng,
    );
    chosenStructured = selectStratifiedUniqueFamilies(
      structuredPool,
      config.syllabus,
      desiredStructured,
      usedFamilies,
      usedIds,
      rng,
    );

    // Top up with remaining unique-family items if one format pool was smaller than requested
    const shortfall =
      requestedTotal - (chosenMcqs.length + chosenStructured.length);
    if (shortfall > 0) {
      const topUp = selectStratifiedUniqueFamilies(
        eligibleRows,
        config.syllabus,
        shortfall,
        usedFamilies,
        usedIds,
        rng,
      );
      for (const item of topUp) {
        if (item.format === "mcq") {
          chosenMcqs.push(item);
        } else {
          chosenStructured.push(item);
        }
      }
    }
  }

  // Order paper cleanly: MCQs (Foundation -> Standard -> Higher), then Structured (Foundation -> Standard -> Higher)
  chosenMcqs.sort(
    (a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty],
  );
  chosenStructured.sort(
    (a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty],
  );

  const orderedRows = [...chosenMcqs, ...chosenStructured];
  const questionIds = orderedRows.map((row) => row.id);
  const totalMarks = orderedRows.reduce((sum, row) => sum + row.totalMarks, 0);

  const responses: Record<string, MockQuestionResponse> = {};
  for (const id of questionIds) {
    responses[id] = {
      questionId: id,
      flagged: false,
    };
  }

  const durationSeconds = Math.max(60, Math.round(config.durationMinutes * 60));

  return {
    sessionId: `mock-${config.syllabus}-${seed.toString(36)}`,
    config,
    questionRows: orderedRows,
    questionIds,
    totalMarks,
    durationSeconds,
    remainingSeconds: durationSeconds,
    status: "live",
    currentIndex: 0,
    responses,
    startedAt: now.toISOString(),
  };
}

/**
 * Scores a completed or in-review `MockPaperSession`, grading MCQs automatically,
 * aggregating guided Paper 2 self-marked scores, and identifying weak topics.
 */
export function scoreMockPaperSession(
  session: MockPaperSession,
  itemsById: Readonly<Record<string, PublicBankItem>>,
  manifest?: PublicBankManifest,
): MockPaperResultSummary {
  const syllabus = session.config.syllabus;
  const topicTitles = new Map<string, { code: string; title: string }>();

  if (manifest?.syllabi[syllabus]) {
    for (const t of manifest.syllabi[syllabus].topics) {
      topicTitles.set(t.id, { code: t.code, title: t.title });
    }
  }

  const breakdownMap = new Map<string, MockTopicBreakdown>();

  let answeredCount = 0;
  let unmarkedStructuredCount = 0;
  let earnedMarks = 0;
  let totalMarks = 0;
  let mcqCorrect = 0;
  let mcqTotal = 0;
  let structuredEarnedMarks = 0;
  let structuredTotalMarks = 0;

  for (const row of session.questionRows) {
    const item = itemsById[row.id];
    const response = session.responses[row.id];
    const qTotal = item?.totalMarks ?? row.totalMarks;
    totalMarks += qTotal;

    let qEarned = 0;
    let qAnswered = false;

    if (row.format === "mcq") {
      mcqTotal += 1;
      if (typeof response?.selectedOptionIndex === "number") {
        qAnswered = true;
        if (
          item &&
          typeof item.correctOptionIndex === "number" &&
          response.selectedOptionIndex === item.correctOptionIndex
        ) {
          qEarned = qTotal;
          mcqCorrect += 1;
        }
      }
    } else {
      structuredTotalMarks += qTotal;
      const hasNotes =
        response?.partNotes &&
        Object.values(response.partNotes).some(
          (val) => val.trim().length > 0,
        );
      if (
        response?.isSelfMarked ||
        typeof response?.selfMarkedEarnedMarks === "number"
      ) {
        qAnswered = true;
        qEarned = Math.min(
          qTotal,
          Math.max(0, Number(response.selfMarkedEarnedMarks ?? 0)),
        );
        structuredEarnedMarks += qEarned;
      } else {
        unmarkedStructuredCount += 1;
        if (hasNotes) {
          qAnswered = true;
        }
      }
    }

    if (qAnswered) {
      answeredCount += 1;
    }
    earnedMarks += qEarned;

    const tag = row.syllabi.find((t) => t.syllabus === syllabus);
    const topicId = tag?.topicId ?? "general";
    const meta = topicTitles.get(topicId) ?? {
      code: topicId,
      title: topicId,
    };

    const existing = breakdownMap.get(topicId) ?? {
      topicId,
      topicCode: meta.code,
      topicTitle: meta.title,
      questionCount: 0,
      answeredCount: 0,
      earnedMarks: 0,
      totalMarks: 0,
      accuracyPercent: 0,
    };

    existing.questionCount += 1;
    if (qAnswered) {
      existing.answeredCount += 1;
    }
    existing.earnedMarks += qEarned;
    existing.totalMarks += qTotal;
    breakdownMap.set(topicId, existing);
  }

  const topicBreakdown: MockTopicBreakdown[] = [];
  for (const entry of breakdownMap.values()) {
    entry.accuracyPercent =
      entry.totalMarks > 0
        ? Math.round((entry.earnedMarks / entry.totalMarks) * 100)
        : 0;
    topicBreakdown.push(entry);
  }

  topicBreakdown.sort((a, b) => a.accuracyPercent - b.accuracyPercent);

  const weakTopicIds = topicBreakdown
    .filter((t) => t.accuracyPercent < 70)
    .map((t) => t.topicId);

  const percentage =
    totalMarks > 0 ? Math.round((earnedMarks / totalMarks) * 100) : 0;

  return {
    totalQuestions: session.questionRows.length,
    answeredCount,
    unmarkedStructuredCount,
    earnedMarks,
    totalMarks,
    percentage,
    mcqCorrect,
    mcqTotal,
    structuredEarnedMarks,
    structuredTotalMarks,
    topicBreakdown,
    weakTopicIds,
  };
}
