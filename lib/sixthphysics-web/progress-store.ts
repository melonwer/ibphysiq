import {
  STUDENT_PROGRESS_STORAGE_KEY,
  type DailyStreakState,
  type PublicQuestionIndexRow,
  type PublicTopicSummary,
  type QuestionAttemptInput,
  type QuestionAttemptRecord,
  type QuestionFilterCriteria,
  type StudentProgressState,
  type SyllabusId,
  type TopicMasteryStat,
} from "./types";

const STRUCTURED_MASTERY_THRESHOLD = 0.7;

export function toCalendarDateKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function diffCalendarDays(earlierKey: string, laterKey: string): number {
  const earlierMs = Date.parse(`${earlierKey}T00:00:00Z`);
  const laterMs = Date.parse(`${laterKey}T00:00:00Z`);
  if (!Number.isFinite(earlierMs) || !Number.isFinite(laterMs)) {
    return 0;
  }
  return Math.round((laterMs - earlierMs) / 86_400_000);
}

export function advanceDailyStreak(
  streak: DailyStreakState,
  now: Date = new Date(),
): DailyStreakState {
  const todayKey = toCalendarDateKey(now);

  if (streak.lastActiveDate === todayKey) {
    return streak;
  }

  let nextCurrent = 1;
  if (streak.lastActiveDate) {
    const gap = diffCalendarDays(streak.lastActiveDate, todayKey);
    if (gap === 1) {
      nextCurrent = streak.currentDays + 1;
    } else if (gap < 0) {
      // Clock skew: preserve streak without resetting
      nextCurrent = Math.max(1, streak.currentDays);
    }
  }

  const nextLongest = Math.max(streak.longestDays, nextCurrent);
  const nextDates = streak.activeDates.includes(todayKey)
    ? streak.activeDates
    : [...streak.activeDates.slice(-59), todayKey];

  return {
    currentDays: nextCurrent,
    longestDays: nextLongest,
    lastActiveDate: todayKey,
    activeDates: nextDates,
  };
}

export function createDefaultProgressState(
  nowIso: string = new Date().toISOString(),
): StudentProgressState {
  return {
    schemaVersion: STUDENT_PROGRESS_STORAGE_KEY,
    attempts: {},
    bookmarkedIds: [],
    streak: {
      currentDays: 0,
      longestDays: 0,
      lastActiveDate: null,
      activeDates: [],
    },
    activeFilters: {
      syllabus: "ib",
      level: "all",
      topicId: "all",
      format: "all",
      difficulty: "all",
      status: "all",
    },
    lastQuestionIdBySyllabus: {},
    completedMockCount: 0,
    updatedAt: nowIso,
  };
}

function resolveBrowserStorage(customStorage?: Storage | null): Storage | null {
  if (customStorage !== undefined) {
    return customStorage;
  }
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sanitizeLoadedProgress(raw: unknown): StudentProgressState {
  const fallback = createDefaultProgressState();
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const candidate = raw as Partial<StudentProgressState>;
  const attempts: Record<string, QuestionAttemptRecord> =
    candidate.attempts && typeof candidate.attempts === "object"
      ? { ...candidate.attempts }
      : {};

  const bookmarkedIds = Array.isArray(candidate.bookmarkedIds)
    ? candidate.bookmarkedIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];

  const streak: DailyStreakState =
    candidate.streak && typeof candidate.streak === "object"
      ? {
          currentDays:
            typeof candidate.streak.currentDays === "number"
              ? Math.max(0, candidate.streak.currentDays)
              : 0,
          longestDays:
            typeof candidate.streak.longestDays === "number"
              ? Math.max(0, candidate.streak.longestDays)
              : 0,
          lastActiveDate:
            typeof candidate.streak.lastActiveDate === "string"
              ? candidate.streak.lastActiveDate
              : null,
          activeDates: Array.isArray(candidate.streak.activeDates)
            ? candidate.streak.activeDates.filter(
                (d): d is string => typeof d === "string",
              )
            : [],
        }
      : fallback.streak;

  const activeFilters: QuestionFilterCriteria =
    candidate.activeFilters && typeof candidate.activeFilters === "object"
      ? {
          ...fallback.activeFilters,
          ...candidate.activeFilters,
        }
      : fallback.activeFilters;

  const lastQuestionIdBySyllabus =
    candidate.lastQuestionIdBySyllabus &&
    typeof candidate.lastQuestionIdBySyllabus === "object"
      ? { ...candidate.lastQuestionIdBySyllabus }
      : {};

  return {
    schemaVersion: STUDENT_PROGRESS_STORAGE_KEY,
    attempts,
    bookmarkedIds: [...new Set(bookmarkedIds)],
    streak,
    activeFilters,
    lastQuestionIdBySyllabus,
    completedMockCount:
      typeof candidate.completedMockCount === "number"
        ? Math.max(0, candidate.completedMockCount)
        : 0,
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : fallback.updatedAt,
  };
}

/**
 * SSR-safe reader for `localStorage['sixthphysics.progress.v1']`.
 */
export function loadProgressState(
  storage?: Storage | null,
): StudentProgressState {
  const store = resolveBrowserStorage(storage);
  if (!store) {
    return createDefaultProgressState();
  }

  try {
    const rawJson = store.getItem(STUDENT_PROGRESS_STORAGE_KEY);
    if (!rawJson) {
      return createDefaultProgressState();
    }
    const parsed: unknown = JSON.parse(rawJson);
    return sanitizeLoadedProgress(parsed);
  } catch {
    return createDefaultProgressState();
  }
}

/**
 * SSR-safe writer for `localStorage['sixthphysics.progress.v1']`.
 */
export function saveProgressState(
  state: StudentProgressState,
  storage?: Storage | null,
): StudentProgressState {
  const store = resolveBrowserStorage(storage);
  if (store) {
    try {
      store.setItem(STUDENT_PROGRESS_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota / private-browsing storage errors safely.
    }
  }
  return state;
}

export function clearProgressState(
  storage?: Storage | null,
): StudentProgressState {
  const store = resolveBrowserStorage(storage);
  if (store) {
    try {
      store.removeItem(STUDENT_PROGRESS_STORAGE_KEY);
    } catch {
      // Ignore storage removal errors safely.
    }
  }
  return createDefaultProgressState();
}

function buildAttemptRecord(
  previous: QuestionAttemptRecord | undefined,
  input: QuestionAttemptInput,
  nowIso: string,
): QuestionAttemptRecord {
  const safeTotal = Math.max(1, Math.round(input.totalMarks));
  const clampedEarned = Math.min(
    safeTotal,
    Math.max(0, Number(input.earnedMarks) || 0),
  );

  let isCorrect: boolean;
  if (typeof input.isCorrect === "boolean") {
    isCorrect = input.isCorrect;
  } else if (input.format === "mcq") {
    isCorrect = clampedEarned >= safeTotal;
  } else {
    isCorrect = clampedEarned / safeTotal >= STRUCTURED_MASTERY_THRESHOLD;
  }

  const record: QuestionAttemptRecord = {
    questionId: input.questionId,
    format: input.format,
    earnedMarks: clampedEarned,
    totalMarks: safeTotal,
    isCorrect,
    attemptCount: (previous?.attemptCount ?? 0) + 1,
    updatedAt: nowIso,
    needsReview: !isCorrect,
  };

  if (typeof input.selectedOptionIndex === "number") {
    record.selectedOptionIndex = input.selectedOptionIndex;
  } else if (typeof previous?.selectedOptionIndex === "number") {
    record.selectedOptionIndex = previous.selectedOptionIndex;
  }

  if (input.checkedCriterionKeys) {
    record.checkedCriterionKeys = [...input.checkedCriterionKeys];
  } else if (previous?.checkedCriterionKeys) {
    record.checkedCriterionKeys = [...previous.checkedCriterionKeys];
  }

  if (input.partNotes) {
    record.partNotes = { ...input.partNotes };
  } else if (previous?.partNotes) {
    record.partNotes = { ...previous.partNotes };
  }

  return record;
}

export function recordQuestionAttempt(
  state: StudentProgressState,
  input: QuestionAttemptInput,
  now: Date = new Date(),
): StudentProgressState {
  const nowIso = now.toISOString();
  const nextRecord = buildAttemptRecord(
    state.attempts[input.questionId],
    input,
    nowIso,
  );

  return {
    ...state,
    attempts: {
      ...state.attempts,
      [input.questionId]: nextRecord,
    },
    streak: advanceDailyStreak(state.streak, now),
    updatedAt: nowIso,
  };
}

export function isQuestionBookmarked(
  state: Pick<StudentProgressState, "bookmarkedIds">,
  questionId: string,
): boolean {
  return state.bookmarkedIds.includes(questionId);
}

export function toggleBookmark(
  state: StudentProgressState,
  questionId: string,
  now: Date = new Date(),
): StudentProgressState {
  const exists = state.bookmarkedIds.includes(questionId);
  const nextBookmarks = exists
    ? state.bookmarkedIds.filter((id) => id !== questionId)
    : [...state.bookmarkedIds, questionId];

  return {
    ...state,
    bookmarkedIds: nextBookmarks,
    updatedAt: now.toISOString(),
  };
}

export function updateActiveFilters(
  state: StudentProgressState,
  patch: Partial<QuestionFilterCriteria>,
  now: Date = new Date(),
): StudentProgressState {
  return {
    ...state,
    activeFilters: {
      ...state.activeFilters,
      ...patch,
    },
    updatedAt: now.toISOString(),
  };
}

export function setLastQuestionForSyllabus(
  state: StudentProgressState,
  syllabus: SyllabusId,
  questionId: string,
  now: Date = new Date(),
): StudentProgressState {
  return {
    ...state,
    lastQuestionIdBySyllabus: {
      ...state.lastQuestionIdBySyllabus,
      [syllabus]: questionId,
    },
    updatedAt: now.toISOString(),
  };
}

export function recordCompletedMock(
  state: StudentProgressState,
  attempts: readonly QuestionAttemptInput[],
  now: Date = new Date(),
): StudentProgressState {
  const nowIso = now.toISOString();
  const nextAttempts = { ...state.attempts };

  for (const attemptInput of attempts) {
    nextAttempts[attemptInput.questionId] = buildAttemptRecord(
      nextAttempts[attemptInput.questionId],
      attemptInput,
      nowIso,
    );
  }

  return {
    ...state,
    attempts: nextAttempts,
    streak:
      attempts.length > 0 ? advanceDailyStreak(state.streak, now) : state.streak,
    completedMockCount: state.completedMockCount + 1,
    updatedAt: nowIso,
  };
}

function createEmptyMasteryStat(
  syllabus: SyllabusId,
  topicId: string,
): TopicMasteryStat {
  return {
    syllabus,
    topicId,
    totalQuestions: 0,
    attemptedCount: 0,
    masteredCount: 0,
    needsReviewCount: 0,
    savedCount: 0,
    earnedMarksTotal: 0,
    possibleMarksTotal: 0,
    accuracyPercent: 0,
    coveragePercent: 0,
  };
}

function finalizeMasteryStat(stat: TopicMasteryStat): TopicMasteryStat {
  const accuracyPercent =
    stat.possibleMarksTotal > 0
      ? Math.round((stat.earnedMarksTotal / stat.possibleMarksTotal) * 100)
      : 0;
  const coveragePercent =
    stat.totalQuestions > 0
      ? Math.round((stat.masteredCount / stat.totalQuestions) * 100)
      : 0;

  return {
    ...stat,
    accuracyPercent,
    coveragePercent,
  };
}

/**
 * Computes per-topic mastery statistics across a syllabus for `<TopicRail />`
 * and post-mock review dashboards.
 */
export function computeTopicMasteryStats(
  syllabus: SyllabusId,
  rows: readonly PublicQuestionIndexRow[],
  state: Pick<StudentProgressState, "attempts" | "bookmarkedIds">,
  topicSummaryList?: readonly PublicTopicSummary[],
): Record<string, TopicMasteryStat> {
  const statsByTopic: Record<string, TopicMasteryStat> = {};
  const bookmarkedSet = new Set(state.bookmarkedIds);

  if (topicSummaryList) {
    for (const topic of topicSummaryList) {
      statsByTopic[topic.id] = createEmptyMasteryStat(syllabus, topic.id);
    }
  }

  for (const row of rows) {
    const tag = row.syllabi.find((t) => t.syllabus === syllabus);
    if (!tag) continue;

    if (!statsByTopic[tag.topicId]) {
      statsByTopic[tag.topicId] = createEmptyMasteryStat(syllabus, tag.topicId);
    }
    const stat = statsByTopic[tag.topicId];
    stat.totalQuestions += 1;

    if (bookmarkedSet.has(row.id)) {
      stat.savedCount += 1;
    }

    const attempt = state.attempts[row.id];
    if (attempt) {
      stat.attemptedCount += 1;
      stat.earnedMarksTotal += attempt.earnedMarks;
      stat.possibleMarksTotal += attempt.totalMarks;
      if (attempt.needsReview) {
        stat.needsReviewCount += 1;
      } else {
        stat.masteredCount += 1;
      }
    }
  }

  for (const topicId of Object.keys(statsByTopic)) {
    statsByTopic[topicId] = finalizeMasteryStat(statsByTopic[topicId]);
  }

  return statsByTopic;
}

/**
 * Computes aggregate syllabus mastery across all questions in `syllabus`.
 */
export function computeOverallSyllabusMastery(
  syllabus: SyllabusId,
  rows: readonly PublicQuestionIndexRow[],
  state: Pick<StudentProgressState, "attempts" | "bookmarkedIds">,
): TopicMasteryStat {
  const overall = createEmptyMasteryStat(syllabus, "all");
  const bookmarkedSet = new Set(state.bookmarkedIds);

  for (const row of rows) {
    const inSyllabus = row.syllabi.some((t) => t.syllabus === syllabus);
    if (!inSyllabus) continue;

    overall.totalQuestions += 1;
    if (bookmarkedSet.has(row.id)) {
      overall.savedCount += 1;
    }

    const attempt = state.attempts[row.id];
    if (attempt) {
      overall.attemptedCount += 1;
      overall.earnedMarksTotal += attempt.earnedMarks;
      overall.possibleMarksTotal += attempt.totalMarks;
      if (attempt.needsReview) {
        overall.needsReviewCount += 1;
      } else {
        overall.masteredCount += 1;
      }
    }
  }

  return finalizeMasteryStat(overall);
}
