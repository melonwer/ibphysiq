'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Clock,
  Flag,
  Loader2,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { MathText } from '@/components/sixthphysics/math-text';
import { QuestionCard } from '@/components/sixthphysics/question-card';
import {
  formatCompactTopicCode,
  formatCompactTopicTitle,
} from '@/components/sixthphysics/topic-rail';
import {
  buildMockPaperSession,
  createConfigFromPreset,
  filterIndexRows,
  getMockPresetsForSyllabus,
  loadQuestionById,
  loadQuestionsByIds,
  scoreMockPaperSession,
  type MockPaperConfig,
  type MockPaperFormatMode,
  type MockPaperPreset,
  type MockPaperSession,
  type PublicBankItem,
  type PublicBankManifest,
  type PublicTopicSummary,
  type QuestionAttemptInput,
  type QuestionDifficulty,
  type SyllabusId,
} from '@/lib/sixthphysics-web';
import { cn } from '@/lib/utils';

export interface MockExamViewProps {
  manifest: PublicBankManifest;
  activeSyllabus: SyllabusId;
  activeLevel?: string;
  topics: PublicTopicSummary[];
  bookmarkedIds: string[];
  onToggleBookmark: (questionId: string) => void;
  onCompleteMock: (attempts: QuestionAttemptInput[]) => void;
  onRecordQuestionAttempt: (attempt: QuestionAttemptInput) => void;
  onPracticeWeakTopics: (topicIds: string[], syllabus: SyllabusId) => void;
  onSessionActiveChange?: (isActive: boolean) => void;
}

const CUSTOM_FORMAT_OPTIONS: ReadonlyArray<{
  value: MockPaperFormatMode;
  label: string;
}> = [
  { value: 'mixed', label: 'Mixed paper' },
  { value: 'mcq', label: 'MCQ only' },
  { value: 'structured', label: 'Structured only' },
];

const CUSTOM_COUNT_OPTIONS = [5, 10, 15, 20, 25] as const;
const CUSTOM_DURATION_OPTIONS = [15, 25, 30, 40, 60] as const;
const CUSTOM_DIFFICULTY_OPTIONS: ReadonlyArray<{
  value: QuestionDifficulty | 'all';
  label: string;
}> = [
  { value: 'all', label: 'All levels' },
  { value: 'foundation', label: 'Foundation' },
  { value: 'standard', label: 'Standard' },
  { value: 'higher', label: 'Higher' },
];

type ReviewFilterTab = 'all' | 'unmarked' | 'missed';

export function formatMockCountdown(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function cleanPresetHeading(rawTitle: string): string {
  const firstPart = rawTitle.split('·')[0]?.trim();
  return firstPart && firstPart.length > 0 ? firstPart : rawTitle;
}

function isResponseAnswered(
  format: 'mcq' | 'structured',
  response?: {
    selectedOptionIndex?: number;
    partNotes?: Record<string, string>;
    isSelfMarked?: boolean;
  }
): boolean {
  if (!response) return false;
  if (format === 'mcq') {
    return typeof response.selectedOptionIndex === 'number';
  }
  if (response.isSelfMarked) {
    return true;
  }
  if (response.partNotes) {
    return Object.values(response.partNotes).some(
      (note) => note.trim().length > 0
    );
  }
  return false;
}

function buildMockAttemptsPayload(
  session: MockPaperSession,
  itemsById: Readonly<Record<string, PublicBankItem>>
): QuestionAttemptInput[] {
  const attempts: QuestionAttemptInput[] = [];

  for (const row of session.questionRows) {
    const item = itemsById[row.id];
    const response = session.responses[row.id];
    const totalMarks = item?.totalMarks ?? row.totalMarks;

    if (row.format === 'mcq') {
      const selectedIdx = response?.selectedOptionIndex;
      const isCorrect =
        typeof selectedIdx === 'number' &&
        item !== undefined &&
        typeof item.correctOptionIndex === 'number' &&
        selectedIdx === item.correctOptionIndex;

      attempts.push({
        questionId: row.id,
        format: 'mcq',
        earnedMarks: isCorrect ? totalMarks : 0,
        totalMarks,
        selectedOptionIndex: selectedIdx,
        isCorrect,
      });
    } else if (
      response?.isSelfMarked ||
      typeof response?.selfMarkedEarnedMarks === 'number'
    ) {
      const earned = Math.min(
        totalMarks,
        Math.max(0, Number(response.selfMarkedEarnedMarks ?? 0))
      );
      attempts.push({
        questionId: row.id,
        format: 'structured',
        earnedMarks: earned,
        totalMarks,
        isCorrect: totalMarks > 0 && earned / totalMarks >= 0.7,
        checkedCriterionKeys: response.checkedCriterionKeys,
        partNotes: response.partNotes,
      });
    }
  }

  return attempts;
}

export function MockExamView({
  manifest,
  activeSyllabus,
  activeLevel,
  topics,
  bookmarkedIds,
  onToggleBookmark,
  onCompleteMock,
  onRecordQuestionAttempt,
  onPracticeWeakTopics,
  onSessionActiveChange,
}: MockExamViewProps) {
  const [session, setSession] = useState<MockPaperSession | null>(null);
  const [itemsById, setItemsById] = useState<Record<string, PublicBankItem>>(
    {}
  );
  const [loadingPaper, setLoadingPaper] = useState(false);
  const [confirmExitOpen, setConfirmExitOpen] = useState(false);
  const [reviewTab, setReviewTab] = useState<ReviewFilterTab>('all');

  // Custom paper builder state
  const [customFormat, setCustomFormat] =
    useState<MockPaperFormatMode>('mixed');
  const [customCount, setCustomCount] = useState<number>(15);
  const [customDuration, setCustomDuration] = useState<number>(30);
  const [customDifficulty, setCustomDifficulty] = useState<
    QuestionDifficulty | 'all'
  >('all');
  const [customTopicIds, setCustomTopicIds] = useState<string[]>([]);

  const recordedSessionIdRef = useRef<string | null>(null);

  const validTopicIdSet = useMemo(
    () => new Set(topics.map((t) => t.id)),
    [topics]
  );

  const effectiveCustomTopicIds = useMemo(
    () => customTopicIds.filter((id) => validTopicIdSet.has(id)),
    [customTopicIds, validTopicIdSet]
  );

  const presets = useMemo(
    () => getMockPresetsForSyllabus(activeSyllabus),
    [activeSyllabus]
  );

  const eligibleCustomPool = useMemo(() => {
    const base = filterIndexRows(manifest.items, {
      syllabus: activeSyllabus,
      level: activeLevel,
      difficulty: customDifficulty,
      format: customFormat === 'mixed' ? 'all' : customFormat,
    });
    if (effectiveCustomTopicIds.length === 0) {
      return base;
    }
    const allowed = new Set(effectiveCustomTopicIds);
    return base.filter((row) =>
      row.syllabi.some(
        (tag) => tag.syllabus === activeSyllabus && allowed.has(tag.topicId)
      )
    );
  }, [
    manifest.items,
    activeSyllabus,
    activeLevel,
    customDifficulty,
    customFormat,
    effectiveCustomTopicIds,
  ]);

  const isSessionLiveOrPaused =
    session !== null &&
    (session.status === 'live' || session.status === 'paused');

  useEffect(() => {
    onSessionActiveChange?.(isSessionLiveOrPaused);
  }, [isSessionLiveOrPaused, onSessionActiveChange]);

  const finalizeSessionToReview = useCallback(
    async (targetSession: MockPaperSession) => {
      setLoadingPaper(true);
      try {
        const loadedMap = await loadQuestionsByIds(
          targetSession.questionIds,
          manifest
        );
        const mergedItems = { ...itemsById, ...loadedMap };
        setItemsById(mergedItems);

        const submittedAt = new Date().toISOString();
        const reviewedSession: MockPaperSession = {
          ...targetSession,
          status: 'review',
          currentIndex: 0,
          submittedAt,
        };
        setSession(reviewedSession);
        setReviewTab('all');
        setConfirmExitOpen(false);
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }

        if (recordedSessionIdRef.current !== targetSession.sessionId) {
          recordedSessionIdRef.current = targetSession.sessionId;
          const attempts = buildMockAttemptsPayload(
            reviewedSession,
            mergedItems
          );
          onCompleteMock(attempts);
        }
      } finally {
        setLoadingPaper(false);
      }
    },
    [itemsById, manifest, onCompleteMock]
  );

  // Live 1-second countdown interval
  const sessionRef = useRef<MockPaperSession | null>(session);
  sessionRef.current = session;

  useEffect(() => {
    if (!session || session.status !== 'live') {
      return;
    }

    const timer = window.setInterval(() => {
      const latest = sessionRef.current;
      if (!latest || latest.status !== 'live') {
        return;
      }
      if (latest.remainingSeconds <= 1) {
        window.clearInterval(timer);
        void finalizeSessionToReview({
          ...latest,
          remainingSeconds: 0,
        });
        return;
      }
      setSession((prev) =>
        prev && prev.status === 'live'
          ? {
              ...prev,
              remainingSeconds: Math.max(0, prev.remainingSeconds - 1),
            }
          : prev
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [session, finalizeSessionToReview]);

  const startPaperWithConfig = useCallback(
    async (config: MockPaperConfig) => {
      const built = buildMockPaperSession(manifest, config);
      if (built.questionIds.length === 0) {
        return;
      }

      setConfirmExitOpen(false);
      setReviewTab('all');
      setSession(built);
      setLoadingPaper(true);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }

      const firstId = built.questionIds[0];
      try {
        const firstItem = await loadQuestionById(firstId, manifest);
        if (firstItem) {
          setItemsById((prev) => ({ ...prev, [firstId]: firstItem }));
        }
      } finally {
        setLoadingPaper(false);
      }

      // Warm all remaining questions in the mock paper in parallel
      void loadQuestionsByIds(built.questionIds, manifest).then((batch) => {
        setItemsById((prev) => ({ ...prev, ...batch }));
      });
    },
    [manifest]
  );

  const handleStartPreset = useCallback(
    (preset: MockPaperPreset) => {
      const config = createConfigFromPreset(preset, {
        level:
          activeLevel && activeLevel !== 'all' ? activeLevel : preset.level,
      });
      void startPaperWithConfig(config);
    },
    [activeLevel, startPaperWithConfig]
  );

  const handleStartCustomPaper = useCallback(() => {
    const syllabusName =
      activeSyllabus === 'ib'
        ? 'IB Physics'
        : activeSyllabus === 'alevel'
          ? 'UK A-Level'
          : 'NCUK IFY';
    const formatTitle =
      customFormat === 'mcq'
        ? 'MCQ Sprint'
        : customFormat === 'structured'
          ? 'Structured Paper'
          : 'Custom Mock';
    const effectiveCount =
      customFormat === 'structured' ? Math.min(customCount, 10) : customCount;

    const config: MockPaperConfig = {
      title: `${syllabusName} ${formatTitle}`,
      syllabus: activeSyllabus,
      level: activeLevel && activeLevel !== 'all' ? activeLevel : 'all',
      topicIds:
        effectiveCustomTopicIds.length > 0
          ? effectiveCustomTopicIds
          : undefined,
      difficulty: customDifficulty,
      formatMode: customFormat,
      questionCount: effectiveCount,
      durationMinutes: customDuration,
    };

    void startPaperWithConfig(config);
  }, [
    activeSyllabus,
    activeLevel,
    effectiveCustomTopicIds,
    customDifficulty,
    customFormat,
    customCount,
    customDuration,
    startPaperWithConfig,
  ]);

  const handleToggleCustomTopic = useCallback((topicId: string) => {
    setCustomTopicIds((prev) =>
      prev.includes(topicId)
        ? prev.filter((id) => id !== topicId)
        : [...prev, topicId]
    );
  }, []);

  const handleJumpToIndex = useCallback(
    (index: number) => {
      setSession((prev) => {
        if (!prev) return null;
        const clamped = Math.max(
          0,
          Math.min(prev.questionIds.length - 1, index)
        );
        const targetId = prev.questionIds[clamped];
        if (targetId && !itemsById[targetId]) {
          void loadQuestionById(targetId, manifest).then((loaded) => {
            if (loaded) {
              setItemsById((map) => ({ ...map, [targetId]: loaded }));
            }
          });
        }
        return {
          ...prev,
          currentIndex: clamped,
        };
      });
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    },
    [itemsById, manifest]
  );

  const handleTogglePause = useCallback(() => {
    setSession((prev) => {
      if (!prev) return null;
      if (prev.status === 'live') {
        return { ...prev, status: 'paused' };
      }
      if (prev.status === 'paused') {
        return { ...prev, status: 'live' };
      }
      return prev;
    });
  }, []);

  const handleToggleFlagCurrent = useCallback(() => {
    setSession((prev) => {
      if (!prev) return null;
      const qId = prev.questionIds[prev.currentIndex];
      if (!qId) return prev;
      const existing = prev.responses[qId] ?? {
        questionId: qId,
        flagged: false,
      };
      return {
        ...prev,
        responses: {
          ...prev.responses,
          [qId]: {
            ...existing,
            flagged: !existing.flagged,
          },
        },
      };
    });
  }, []);

  const handleLiveSelectOption = useCallback((optionIndex: number) => {
    setSession((prev) => {
      if (!prev || prev.status !== 'live') return prev;
      const qId = prev.questionIds[prev.currentIndex];
      if (!qId) return prev;
      const existing = prev.responses[qId] ?? {
        questionId: qId,
        flagged: false,
      };
      return {
        ...prev,
        responses: {
          ...prev.responses,
          [qId]: {
            ...existing,
            selectedOptionIndex: optionIndex,
          },
        },
      };
    });
  }, []);

  const handleLivePartNotes = useCallback(
    (partNotes: Record<string, string>) => {
      setSession((prev) => {
        if (!prev || prev.status !== 'live') return prev;
        const qId = prev.questionIds[prev.currentIndex];
        if (!qId) return prev;
        const existing = prev.responses[qId] ?? {
          questionId: qId,
          flagged: false,
        };
        return {
          ...prev,
          responses: {
            ...prev.responses,
            [qId]: {
              ...existing,
              partNotes,
            },
          },
        };
      });
    },
    []
  );

  const handleReviewSelfMark = useCallback(
    (
      questionId: string,
      update: {
        checkedCriterionKeys: string[];
        earnedMarks: number;
        totalMarks: number;
      }
    ) => {
      setSession((prev) => {
        if (!prev) return null;
        const existing = prev.responses[questionId] ?? {
          questionId,
          flagged: false,
        };
        const updatedSession: MockPaperSession = {
          ...prev,
          responses: {
            ...prev.responses,
            [questionId]: {
              ...existing,
              checkedCriterionKeys: update.checkedCriterionKeys,
              selfMarkedEarnedMarks: update.earnedMarks,
              isSelfMarked: true,
            },
          },
        };

        onRecordQuestionAttempt({
          questionId,
          format: 'structured',
          earnedMarks: update.earnedMarks,
          totalMarks: update.totalMarks,
          isCorrect:
            update.totalMarks > 0 &&
            update.earnedMarks / update.totalMarks >= 0.7,
          checkedCriterionKeys: update.checkedCriterionKeys,
          partNotes: existing.partNotes,
        });

        return updatedSession;
      });
    },
    [onRecordQuestionAttempt]
  );

  const resultSummary = useMemo(() => {
    if (
      !session ||
      (session.status !== 'review' && session.status !== 'completed')
    ) {
      return null;
    }
    return scoreMockPaperSession(session, itemsById, manifest);
  }, [session, itemsById, manifest]);

  const syllabusMeta = manifest.syllabi[activeSyllabus];
  const bookmarkedSet = useMemo(() => new Set(bookmarkedIds), [bookmarkedIds]);

  // =========================================================================
  // STAGE 1: SETUP VIEW (Presets + Custom Builder)
  // =========================================================================
  if (!session) {
    return (
      <div className="mx-auto max-w-[1060px] space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--sp-ink)] sm:text-2xl">
              Timed mock exam
            </h1>
            <p className="max-w-[68ch] text-sm text-[var(--sp-muted)]">
              Choose an official exam-style paper for{' '}
              <span className="font-medium text-[var(--sp-ink)]">
                {syllabusMeta?.shortLabel ?? 'your syllabus'}
              </span>{' '}
              or configure a custom timed set. Every paper draws at most one
              question from each physics problem family.
            </p>
          </div>

          {syllabusMeta?.gravityConvention && (
            <span className="inline-flex items-center rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface)] px-3 py-1.5 font-mono text-xs font-medium tabular-nums text-[var(--sp-muted)]">
              <MathText text={syllabusMeta.gravityConvention} />
            </span>
          )}
        </div>

        {/* Official Syllabus Presets */}
        <section aria-label="Recommended mock presets" className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--sp-ink)]">
            Exam-format presets
          </h2>

          <div className="grid gap-3.5 md:grid-cols-3">
            {presets.map((preset) => {
              const heading = cleanPresetHeading(preset.title);
              return (
                <article
                  key={preset.id}
                  className="flex flex-col justify-between rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] p-5 transition-colors hover:border-[var(--sp-accent)]/45"
                >
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-[15.5px] font-semibold leading-snug text-[var(--sp-ink)]">
                        {heading}
                      </h3>
                      <span className="shrink-0 rounded-md border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-[var(--sp-ink)]">
                        {preset.badgeLabel}
                      </span>
                    </div>

                    <MathText
                      text={preset.subtitle}
                      block
                      className="text-[13.5px] leading-[1.58] text-[var(--sp-muted)]"
                    />
                  </div>

                  <div className="mt-5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleStartPreset(preset)}
                      className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--sp-accent)] px-4 py-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-95"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Start timed paper</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Compact Custom Paper Builder */}
        <section
          aria-label="Custom mock paper builder"
          className="rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--sp-border)] pb-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--sp-ink)]">
                Custom paper builder
              </h2>
              <p className="mt-0.5 text-xs text-[var(--sp-muted)]">
                Tailor question format, length, timer, and topic scope
              </p>
            </div>

            <span className="font-mono text-xs tabular-nums text-[var(--sp-muted)]">
              {eligibleCustomPool.length.toLocaleString()} matching questions in
              pool
            </span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Format */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[var(--sp-muted)]">
                Paper format
              </span>
              <div className="flex flex-wrap gap-1">
                {CUSTOM_FORMAT_OPTIONS.map((opt) => {
                  const active = customFormat === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCustomFormat(opt.value)}
                      className={cn(
                        'cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                        active
                          ? 'border-[var(--sp-accent)]/45 bg-blue-500/10 font-semibold text-[var(--sp-ink)] dark:bg-blue-500/15'
                          : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] font-medium text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Question count */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[var(--sp-muted)]">
                Questions
              </span>
              <div className="flex flex-wrap gap-1">
                {CUSTOM_COUNT_OPTIONS.map((count) => {
                  const active = customCount === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCustomCount(count)}
                      className={cn(
                        'cursor-pointer rounded-lg border px-2.5 py-1.5 font-mono text-xs tabular-nums transition-colors',
                        active
                          ? 'border-[var(--sp-accent)]/45 bg-blue-500/10 font-semibold text-[var(--sp-ink)] dark:bg-blue-500/15'
                          : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] font-medium text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
                      )}
                    >
                      {count}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[var(--sp-muted)]">
                Duration
              </span>
              <div className="flex flex-wrap gap-1">
                {CUSTOM_DURATION_OPTIONS.map((mins) => {
                  const active = customDuration === mins;
                  return (
                    <button
                      key={mins}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCustomDuration(mins)}
                      className={cn(
                        'cursor-pointer rounded-lg border px-2.5 py-1.5 font-mono text-xs tabular-nums transition-colors',
                        active
                          ? 'border-[var(--sp-accent)]/45 bg-blue-500/10 font-semibold text-[var(--sp-ink)] dark:bg-blue-500/15'
                          : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] font-medium text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
                      )}
                    >
                      {mins}m
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Difficulty */}
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[var(--sp-muted)]">
                Difficulty
              </span>
              <div className="flex flex-wrap gap-1">
                {CUSTOM_DIFFICULTY_OPTIONS.map((opt) => {
                  const active = customDifficulty === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCustomDifficulty(opt.value)}
                      className={cn(
                        'cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                        active
                          ? 'border-[var(--sp-accent)]/45 bg-blue-500/10 font-semibold text-[var(--sp-ink)] dark:bg-blue-500/15'
                          : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] font-medium text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Optional topic scope selector */}
          {topics.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-[var(--sp-border)] pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--sp-muted)]">
                  Topics included (
                  {effectiveCustomTopicIds.length === 0
                    ? 'All topics'
                    : `${effectiveCustomTopicIds.length} selected`}
                  )
                </span>
                {effectiveCustomTopicIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCustomTopicIds([])}
                    className="cursor-pointer text-xs font-medium text-[var(--sp-accent)] hover:underline"
                  >
                    Include all topics
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {topics.map((topic) => {
                  const selected = effectiveCustomTopicIds.includes(topic.id);
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => handleToggleCustomTopic(topic.id)}
                      className={cn(
                        'cursor-pointer rounded-lg border px-2.5 py-1 text-xs transition-colors',
                        selected
                          ? 'border-[var(--sp-accent)] bg-blue-500/10 font-semibold text-[var(--sp-ink)] dark:bg-blue-500/15'
                          : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)]/70 font-medium text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
                      )}
                    >
                      <span className="mr-1 font-mono text-[11px] text-[var(--sp-accent)]">
                        {formatCompactTopicCode(topic.code)}
                      </span>
                      {formatCompactTopicTitle(topic.title)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sp-border)] pt-4">
            <p className="text-xs text-[var(--sp-muted)]">
              {eligibleCustomPool.length === 0
                ? 'No questions match this filter combination. Broaden the difficulty, format, or level above.'
                : 'Answers and mark schemes stay hidden until you finish the paper.'}
            </p>

            <button
              type="button"
              disabled={eligibleCustomPool.length === 0}
              onClick={handleStartCustomPaper}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-opacity',
                eligibleCustomPool.length > 0
                  ? 'cursor-pointer bg-[var(--sp-ink)] text-[var(--sp-surface)] hover:opacity-90'
                  : 'cursor-not-allowed border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-muted)]'
              )}
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Start custom paper</span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  // =========================================================================
  // STAGE 2: LIVE / PAUSED EXAM DESK
  // =========================================================================
  if (session.status === 'live' || session.status === 'paused') {
    const currentId = session.questionIds[session.currentIndex];
    const currentItem = currentId ? itemsById[currentId] : undefined;
    const currentResponse = currentId
      ? session.responses[currentId]
      : undefined;
    const sessionTopics =
      manifest.syllabi[session.config.syllabus]?.topics ?? topics;

    let answeredSoFar = 0;
    let flaggedSoFar = 0;
    for (const row of session.questionRows) {
      const resp = session.responses[row.id];
      if (isResponseAnswered(row.format, resp)) {
        answeredSoFar += 1;
      }
      if (resp?.flagged) {
        flaggedSoFar += 1;
      }
    }

    const isLowTime = session.remainingSeconds <= 300;
    const isCriticalTime = session.remainingSeconds <= 60;

    return (
      <div className="mx-auto max-w-[1160px] space-y-4">
        {/* Sticky Exam Control Bar */}
        <div
          style={{ top: 'calc(var(--sp-topnav-h, 57px) + 8px)' }}
          className="sticky z-20 rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)]/95 px-4 py-3 shadow-xs backdrop-blur-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--sp-ink)]">
                {cleanPresetHeading(session.config.title)}
              </p>
              <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--sp-muted)]">
                {answeredSoFar} of {session.questionRows.length} answered ·{' '}
                {session.totalMarks} marks
                {flaggedSoFar > 0 ? ` · ${flaggedSoFar} flagged` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                data-testid="mock-countdown-timer"
                aria-live="off"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-sm font-semibold tabular-nums',
                  session.status === 'paused'
                    ? 'border-amber-500/45 bg-amber-500/10 text-amber-900 dark:text-amber-300'
                    : isCriticalTime
                      ? 'border-rose-600/50 bg-rose-500/10 text-rose-800 dark:text-rose-300'
                      : isLowTime
                        ? 'border-amber-500/45 bg-amber-500/10 text-amber-900 dark:text-amber-300'
                        : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-ink)]'
                )}
              >
                <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{formatMockCountdown(session.remainingSeconds)}</span>
              </div>

              <button
                type="button"
                onClick={handleTogglePause}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--sp-border)] bg-[var(--sp-surface)] px-3 py-1.5 text-xs font-medium text-[var(--sp-ink)] transition-colors hover:bg-[var(--sp-surface-subtle)]"
              >
                {session.status === 'paused' ? (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Pause</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={loadingPaper}
                onClick={() => void finalizeSessionToReview(session)}
                className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-[var(--sp-accent)] px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-95"
              >
                Finish &amp; mark paper
              </button>
            </div>
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_264px]">
          {/* Active Question or Paused Veil */}
          <div className="min-w-0 space-y-3">
            {session.status === 'paused' ? (
              <div className="rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] p-8 text-center">
                <p className="text-base font-semibold text-[var(--sp-ink)]">
                  Timer paused at{' '}
                  <span className="font-mono tabular-nums">
                    {formatMockCountdown(session.remainingSeconds)}
                  </span>
                </p>
                <p className="mx-auto mt-1.5 max-w-[46ch] text-sm text-[var(--sp-muted)]">
                  Questions are hidden while the clock is stopped. Resume the
                  timer whenever you are ready to continue.
                </p>
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[var(--sp-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-95"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span>Resume paper</span>
                </button>
              </div>
            ) : currentItem ? (
              <QuestionCard
                item={currentItem}
                mode="mock-live"
                activeSyllabus={session.config.syllabus}
                topics={sessionTopics}
                questionNumber={session.currentIndex + 1}
                totalQuestions={session.questionIds.length}
                isBookmarked={bookmarkedSet.has(currentItem.id)}
                onToggleBookmark={onToggleBookmark}
                mockResponse={currentResponse}
                selectedOptionIndex={
                  currentResponse?.selectedOptionIndex ?? null
                }
                onSelectOption={handleLiveSelectOption}
                partNotes={currentResponse?.partNotes}
                onChangePartNotes={handleLivePartNotes}
              />
            ) : (
              <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] p-8 text-sm text-[var(--sp-muted)]">
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin text-[var(--sp-accent)]"
                  aria-hidden="true"
                />
                Loading question {session.currentIndex + 1}...
              </div>
            )}

            {/* Live Bottom Navigation Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] px-4 py-3">
              <button
                type="button"
                disabled={session.currentIndex === 0}
                onClick={() => handleJumpToIndex(session.currentIndex - 1)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  session.currentIndex > 0
                    ? 'cursor-pointer border-[var(--sp-border)] bg-[var(--sp-surface)] text-[var(--sp-ink)] hover:bg-[var(--sp-surface-subtle)]'
                    : 'cursor-not-allowed border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-muted)] opacity-60'
                )}
              >
                <ChevronRight
                  className="h-3.5 w-3.5 rotate-180"
                  aria-hidden="true"
                />
                <span>Previous</span>
              </button>

              <button
                type="button"
                aria-pressed={Boolean(currentResponse?.flagged)}
                onClick={handleToggleFlagCurrent}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  currentResponse?.flagged
                    ? 'border-amber-500/50 bg-amber-500/12 text-amber-900 dark:text-amber-300'
                    : 'border-[var(--sp-border)] bg-[var(--sp-surface)] text-[var(--sp-muted)] hover:bg-[var(--sp-surface-subtle)] hover:text-[var(--sp-ink)]'
                )}
              >
                <Flag
                  className={cn(
                    'h-3.5 w-3.5',
                    currentResponse?.flagged && 'fill-current'
                  )}
                  aria-hidden="true"
                />
                <span>
                  {currentResponse?.flagged ? 'Flagged' : 'Flag for review'}
                </span>
              </button>

              {session.currentIndex < session.questionIds.length - 1 ? (
                <button
                  type="button"
                  onClick={() => handleJumpToIndex(session.currentIndex + 1)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--sp-ink)] px-3.5 py-1.5 text-xs font-semibold text-[var(--sp-surface)] transition-opacity hover:opacity-90"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void finalizeSessionToReview(session)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--sp-accent)] px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-95"
                >
                  <span>Finish &amp; mark paper</span>
                </button>
              )}
            </div>
          </div>

          {/* Question Palette (1..N) */}
          <aside
            aria-label="Exam question palette"
            style={{ top: 'calc(var(--sp-topnav-h, 57px) + 84px)' }}
            className="rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] p-4 lg:sticky"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[var(--sp-ink)]">
                Question palette
              </h2>
              <span className="font-mono text-[11px] tabular-nums text-[var(--sp-muted)]">
                {answeredSoFar}/{session.questionRows.length}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-8 lg:grid-cols-5">
              {session.questionRows.map((row, idx) => {
                const resp = session.responses[row.id];
                const isCurrent = idx === session.currentIndex;
                const answered = isResponseAnswered(row.format, resp);
                const flagged = Boolean(resp?.flagged);

                return (
                  <button
                    key={row.id}
                    type="button"
                    aria-label={`Question ${idx + 1}${answered ? ', answered' : ''}${flagged ? ', flagged' : ''}`}
                    aria-current={isCurrent ? 'step' : undefined}
                    onClick={() => handleJumpToIndex(idx)}
                    className={cn(
                      'relative inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border font-mono text-xs font-semibold tabular-nums transition-colors',
                      isCurrent
                        ? 'border-[var(--sp-accent)] bg-[var(--sp-accent)] text-white'
                        : flagged
                          ? 'border-amber-500/60 bg-amber-500/12 text-amber-900 dark:text-amber-300'
                          : answered
                            ? 'border-blue-500/40 bg-blue-500/10 text-[var(--sp-ink)] dark:bg-blue-500/15'
                            : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
                    )}
                  >
                    {idx + 1}
                    {flagged && !isCurrent && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-500"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--sp-border)] pt-3 text-[11px] text-[var(--sp-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-xs bg-[var(--sp-accent)]" />
                Current
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-xs bg-blue-500/45" />
                Answered
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-xs bg-amber-500" />
                Flagged
              </span>
            </div>

            <div className="mt-4 border-t border-[var(--sp-border)] pt-3">
              {!confirmExitOpen ? (
                <button
                  type="button"
                  onClick={() => setConfirmExitOpen(true)}
                  className="w-full cursor-pointer rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--sp-muted)] transition-colors hover:text-[var(--sp-ink)]"
                >
                  Discard &amp; exit paper
                </button>
              ) : (
                <div className="space-y-2 rounded-lg border border-rose-500/35 bg-rose-500/[0.06] p-2.5">
                  <p className="text-xs font-medium text-[var(--sp-ink)]">
                    Discard this mock paper without saving?
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSession(null);
                        setConfirmExitOpen(false);
                      }}
                      className="flex-1 cursor-pointer rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmExitOpen(false)}
                      className="flex-1 cursor-pointer rounded-md border border-[var(--sp-border)] bg-[var(--sp-surface)] px-2.5 py-1 text-xs font-medium text-[var(--sp-ink)]"
                    >
                      Keep working
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STAGE 3: POST-EXAM GRADING & BREAKDOWN
  // =========================================================================
  const summary = resultSummary ?? scoreMockPaperSession(session, itemsById, manifest);
  const sessionTopics =
    manifest.syllabi[session.config.syllabus]?.topics ?? topics;

  const reviewIndices = session.questionRows
    .map((row, idx) => {
      const resp = session.responses[row.id];
      const item = itemsById[row.id];
      const qTotal = item?.totalMarks ?? row.totalMarks;
      let earned = 0;
      let unmarkedStructured = false;

      if (row.format === 'mcq') {
        if (
          typeof resp?.selectedOptionIndex === 'number' &&
          item &&
          resp.selectedOptionIndex === item.correctOptionIndex
        ) {
          earned = qTotal;
        }
      } else if (
        resp?.isSelfMarked ||
        typeof resp?.selfMarkedEarnedMarks === 'number'
      ) {
        earned = Math.min(
          qTotal,
          Math.max(0, Number(resp.selfMarkedEarnedMarks ?? 0))
        );
      } else {
        unmarkedStructured = true;
      }

      return {
        idx,
        row,
        earned,
        qTotal,
        unmarkedStructured,
        isFullMarks: !unmarkedStructured && earned >= qTotal && qTotal > 0,
      };
    });

  const unmarkedEntries = reviewIndices.filter((e) => e.unmarkedStructured);
  const missedEntries = reviewIndices.filter(
    (e) => !e.isFullMarks && !e.unmarkedStructured
  );

  const visibleEntries =
    reviewTab === 'unmarked'
      ? unmarkedEntries
      : reviewTab === 'missed'
        ? missedEntries
        : reviewIndices;

  const activeReviewEntry =
    visibleEntries.find((e) => e.idx === session.currentIndex) ??
    visibleEntries[0] ??
    reviewIndices[0];

  const activeReviewIndex = activeReviewEntry ? activeReviewEntry.idx : 0;
  const activeReviewId = session.questionIds[activeReviewIndex];
  const activeReviewItem = activeReviewId
    ? itemsById[activeReviewId]
    : undefined;
  const activeReviewResponse = activeReviewId
    ? session.responses[activeReviewId]
    : undefined;

  const elapsedSeconds = Math.max(
    0,
    session.durationSeconds - session.remainingSeconds
  );

  return (
    <div className="mx-auto max-w-[1160px] space-y-6">
      {/* Score Summary Card */}
      <section
        aria-label="Mock exam score summary"
        className="rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--sp-ink)] sm:text-2xl">
              {cleanPresetHeading(session.config.title)} results
            </h1>
            <p className="font-mono text-xs tabular-nums text-[var(--sp-muted)]">
              Completed in {formatMockCountdown(elapsedSeconds)} ·{' '}
              {summary.answeredCount} of {summary.totalQuestions} answered
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {summary.weakTopicIds.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onPracticeWeakTopics(
                    summary.weakTopicIds,
                    session.config.syllabus
                  )
                }
                className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-[var(--sp-accent)] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-95"
              >
                Practice weak topics
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setSession(null);
                setConfirmExitOpen(false);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-3.5 py-2 text-xs font-medium text-[var(--sp-ink)] transition-colors hover:opacity-90"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>New mock paper</span>
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)]/70 p-4">
            <span className="block text-xs font-medium text-[var(--sp-muted)]">
              Total score
            </span>
            <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-2xl font-semibold text-[var(--sp-ink)]">
                {summary.earnedMarks} / {summary.totalMarks}
              </span>
              <span className="text-sm font-medium text-[var(--sp-accent)]">
                ({summary.percentage}%)
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)]/70 p-4">
            <span className="block text-xs font-medium text-[var(--sp-muted)]">
              Multiple choice
            </span>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-[var(--sp-ink)]">
              {summary.mcqTotal > 0
                ? `${summary.mcqCorrect} / ${summary.mcqTotal} correct`
                : 'None in paper'}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)]/70 p-4">
            <span className="block text-xs font-medium text-[var(--sp-muted)]">
              Structured rubric marks
            </span>
            <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-[var(--sp-ink)]">
              {summary.structuredTotalMarks > 0
                ? `${summary.structuredEarnedMarks} / ${summary.structuredTotalMarks} marks`
                : 'None in paper'}
            </div>
          </div>
        </div>

        {summary.unmarkedStructuredCount > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <p className="text-xs font-medium text-amber-950 dark:text-amber-200">
              <span className="font-mono font-semibold tabular-nums">
                {summary.unmarkedStructuredCount}
              </span>{' '}
              structured{' '}
              {summary.unmarkedStructuredCount === 1
                ? 'question needs'
                : 'questions need'}{' '}
              self-marking against the examiner rubric below to finalize your
              score.
            </p>
            <button
              type="button"
              onClick={() => {
                setReviewTab('unmarked');
                if (unmarkedEntries[0]) {
                  handleJumpToIndex(unmarkedEntries[0].idx);
                }
              }}
              className="cursor-pointer rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-95"
            >
              Mark structured answers
            </button>
          </div>
        )}
      </section>

      {/* Topic Breakdown */}
      {summary.topicBreakdown.length > 0 && (
        <section
          aria-label="Topic breakdown"
          className="rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] p-5 sm:p-6"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--sp-ink)]">
              Topic breakdown
            </h2>
            <span className="text-xs text-[var(--sp-muted)]">
              Ordered from lowest to highest score
            </span>
          </div>

          <div className="mt-4 divide-y divide-[var(--sp-border)]">
            {summary.topicBreakdown.map((topic) => {
              const isWeak = topic.accuracyPercent < 70;
              return (
                <div
                  key={topic.topicId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs font-semibold text-[var(--sp-accent)]">
                        {formatCompactTopicCode(topic.topicCode)}
                      </span>
                      <span className="truncate text-sm font-medium text-[var(--sp-ink)]">
                        {formatCompactTopicTitle(topic.topicTitle)}
                      </span>
                    </div>

                    <div className="mt-1.5 flex max-w-md items-center gap-2.5">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--sp-surface-subtle)]">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            isWeak
                              ? 'bg-amber-500'
                              : 'bg-emerald-600 dark:bg-emerald-400'
                          )}
                          style={{ width: `${topic.accuracyPercent}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs tabular-nums text-[var(--sp-muted)]">
                        {topic.earnedMarks}/{topic.totalMarks} marks (
                        {topic.accuracyPercent}%)
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onPracticeWeakTopics(
                        [topic.topicId],
                        session.config.syllabus
                      )
                    }
                    className="shrink-0 cursor-pointer rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--sp-ink)] transition-colors hover:border-[var(--sp-accent)]/45"
                  >
                    Practice topic
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Question Review & Paper 2 Self-Marking Queue */}
      <section aria-label="Question review and marking" className="space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={reviewTab === 'all'}
              onClick={() => setReviewTab('all')}
              className={cn(
                'cursor-pointer rounded-lg border px-3 py-1.5 text-xs transition-colors',
                reviewTab === 'all'
                  ? 'border-[var(--sp-accent)]/45 bg-blue-500/10 font-semibold text-[var(--sp-ink)] dark:bg-blue-500/15'
                  : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] font-medium text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
              )}
            >
              All questions ({reviewIndices.length})
            </button>

            {summary.structuredTotalMarks > 0 && (
              <button
                type="button"
                aria-pressed={reviewTab === 'unmarked'}
                onClick={() => {
                  setReviewTab('unmarked');
                  if (unmarkedEntries[0]) {
                    handleJumpToIndex(unmarkedEntries[0].idx);
                  }
                }}
                className={cn(
                  'cursor-pointer rounded-lg border px-3 py-1.5 text-xs transition-colors',
                  reviewTab === 'unmarked'
                    ? 'border-amber-500/50 bg-amber-500/12 font-semibold text-amber-950 dark:text-amber-200'
                    : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] font-medium text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
                )}
              >
                Unmarked structured ({unmarkedEntries.length})
              </button>
            )}

            <button
              type="button"
              aria-pressed={reviewTab === 'missed'}
              onClick={() => {
                setReviewTab('missed');
                if (missedEntries[0]) {
                  handleJumpToIndex(missedEntries[0].idx);
                }
              }}
              className={cn(
                'cursor-pointer rounded-lg border px-3 py-1.5 text-xs transition-colors',
                reviewTab === 'missed'
                  ? 'border-rose-500/45 bg-rose-500/10 font-semibold text-rose-900 dark:text-rose-300'
                  : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] font-medium text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
              )}
            >
              Missed or partial ({missedEntries.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {reviewIndices.map((entry) => {
              const isSelected = entry.idx === activeReviewIndex;
              return (
                <button
                  key={entry.row.id}
                  type="button"
                  onClick={() => handleJumpToIndex(entry.idx)}
                  aria-label={`Review question ${entry.idx + 1}`}
                  className={cn(
                    'inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border font-mono text-xs font-semibold tabular-nums transition-colors',
                    isSelected && 'ring-2 ring-[var(--sp-accent)] ring-offset-1',
                    entry.unmarkedStructured
                      ? 'border-amber-500/55 bg-amber-500/15 text-amber-900 dark:text-amber-300'
                      : entry.isFullMarks
                        ? 'border-emerald-600/50 bg-emerald-500/15 text-emerald-900 dark:text-emerald-300'
                        : 'border-rose-500/50 bg-rose-500/12 text-rose-900 dark:text-rose-300'
                  )}
                >
                  {entry.idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {visibleEntries.length === 0 ? (
          <div className="rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] p-8 text-center">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--sp-ink)]">
              <Check
                className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span>
                {reviewTab === 'unmarked'
                  ? 'All structured questions in this paper have been marked'
                  : 'Full marks across every marked question in this paper'}
              </span>
            </p>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setReviewTab('all')}
                className="cursor-pointer rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--sp-ink)]"
              >
                Show all questions
              </button>
            </div>
          </div>
        ) : activeReviewItem ? (
          <>
            <QuestionCard
              item={activeReviewItem}
              mode="mock-review"
              activeSyllabus={session.config.syllabus}
              topics={sessionTopics}
              questionNumber={activeReviewIndex + 1}
              totalQuestions={session.questionIds.length}
              isBookmarked={bookmarkedSet.has(activeReviewItem.id)}
              onToggleBookmark={onToggleBookmark}
              mockResponse={activeReviewResponse}
              selectedOptionIndex={
                activeReviewResponse?.selectedOptionIndex ?? null
              }
              partNotes={activeReviewResponse?.partNotes}
              checkedCriterionKeys={activeReviewResponse?.checkedCriterionKeys}
              onChangeSelfMark={(update) =>
                handleReviewSelfMark(activeReviewItem.id, update)
              }
            />

            <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] px-3 py-2.5 sm:px-4 sm:py-3">
              <button
                type="button"
                disabled={activeReviewIndex === 0}
                onClick={() => handleJumpToIndex(activeReviewIndex - 1)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium sm:px-3',
                  activeReviewIndex > 0
                    ? 'cursor-pointer border-[var(--sp-border)] bg-[var(--sp-surface)] text-[var(--sp-ink)] hover:bg-[var(--sp-surface-subtle)]'
                    : 'cursor-not-allowed border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-muted)] opacity-60'
                )}
              >
                <ChevronRight
                  className="h-3.5 w-3.5 rotate-180"
                  aria-hidden="true"
                />
                <span>
                  Previous
                  <span className="hidden sm:inline"> question</span>
                </span>
              </button>

              <span className="font-mono text-xs tabular-nums text-[var(--sp-muted)]">
                <span className="hidden sm:inline">Question </span>
                {activeReviewIndex + 1} of {session.questionIds.length}
              </span>

              <button
                type="button"
                disabled={activeReviewIndex >= session.questionIds.length - 1}
                onClick={() => handleJumpToIndex(activeReviewIndex + 1)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium sm:px-3',
                  activeReviewIndex < session.questionIds.length - 1
                    ? 'cursor-pointer border-[var(--sp-border)] bg-[var(--sp-surface)] text-[var(--sp-ink)] hover:bg-[var(--sp-surface-subtle)]'
                    : 'cursor-not-allowed border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-muted)] opacity-60'
                )}
              >
                <span>
                  Next<span className="hidden sm:inline"> question</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
