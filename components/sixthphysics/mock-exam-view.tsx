'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Clock,
  FileText,
  Flag,
  Loader2,
  Pause,
  Play,
  Printer,
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
  onOpenPdfStudio?: (session?: MockPaperSession) => void;
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
  dotClass?: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'foundation', label: 'Easy', dotClass: 'bg-emerald-500' },
  { value: 'standard', label: 'Medium', dotClass: 'bg-amber-500' },
  { value: 'higher', label: 'Hard', dotClass: 'bg-rose-500' },
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
  onOpenPdfStudio,
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
    const canStartCustom = eligibleCustomPool.length > 0;
    return (
      <div className="mx-auto max-w-[1060px] space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-[var(--sp-ink)] sm:text-[28px]">
              Timed mock exam
            </h1>
            <p className="max-w-[62ch] text-[15px] leading-relaxed text-[var(--sp-muted)]">
              Pick an exam-style paper for{' '}
              <span className="font-bold text-[var(--sp-ink)]">
                {syllabusMeta?.shortLabel ?? 'your syllabus'}
              </span>{' '}
              or build your own. Each paper uses at most one question from
              every problem family.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {syllabusMeta?.shortLabel && (
              <span className="sp-chip sp-chip--accent">
                <span
                  className="sp-dot bg-[var(--sp-accent)]"
                  aria-hidden="true"
                />
                {syllabusMeta.shortLabel}
              </span>
            )}
            {syllabusMeta?.gravityConvention && (
              <span className="sp-chip tabular-nums text-[var(--sp-muted)]">
                <MathText text={syllabusMeta.gravityConvention} />
              </span>
            )}
            {onOpenPdfStudio && (
              <button
                type="button"
                onClick={() => onOpenPdfStudio()}
                className="sp-key sp-key--sm sp-key--neutral inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-extrabold"
              >
                <FileText
                  className="h-4 w-4 text-[var(--sp-accent)]"
                  aria-hidden="true"
                />
                <span>Create PDF exam paper</span>
              </button>
            )}
          </div>
        </div>

        {/* Exam-format presets */}
        <section aria-label="Recommended mock presets" className="space-y-3.5">
          <h2 className="text-[17px] font-extrabold text-[var(--sp-ink)]">
            Exam-style papers
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            {presets.map((preset) => {
              const heading = cleanPresetHeading(preset.title);
              return (
                <article
                  key={preset.id}
                  className="sp-card flex flex-col justify-between p-5"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-[16px] font-extrabold leading-snug text-[var(--sp-ink)]">
                        {heading}
                      </h3>
                      <span className="sp-chip sp-chip--accent shrink-0 tabular-nums">
                        {preset.badgeLabel}
                      </span>
                    </div>

                    <MathText
                      text={preset.subtitle}
                      block
                      className="text-[14px] leading-[1.6] text-[var(--sp-muted)]"
                    />
                  </div>

                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => handleStartPreset(preset)}
                      className="sp-key sp-key--primary inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[15px] font-extrabold"
                    >
                      <Play
                        className="h-4 w-4 fill-current"
                        aria-hidden="true"
                      />
                      <span>Start mock</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Custom paper builder */}
        <section
          aria-label="Custom mock paper builder"
          className="sp-card p-5 sm:p-7"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[19px] font-extrabold text-[var(--sp-ink)]">
                Build your own paper
              </h2>
              <p className="mt-0.5 text-[14px] text-[var(--sp-muted)]">
                Choose the format, length, timer and topics.
              </p>
            </div>

            <span
              className={cn(
                'sp-chip tabular-nums',
                canStartCustom ? 'sp-chip--success' : 'sp-chip--warn'
              )}
            >
              {eligibleCustomPool.length.toLocaleString()} questions available
            </span>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {/* Format */}
            <div className="space-y-2">
              <span className="block text-[14px] font-bold text-[var(--sp-ink)]">
                Format
              </span>
              <div className="sp-seg flex w-full">
                {CUSTOM_FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={customFormat === opt.value}
                    onClick={() => setCustomFormat(opt.value)}
                    className="sp-seg-item flex-1 px-2.5 py-2 text-[13.5px]"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div className="space-y-2">
              <span className="block text-[14px] font-bold text-[var(--sp-ink)]">
                Difficulty
              </span>
              <div className="sp-seg flex w-full">
                {CUSTOM_DIFFICULTY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={customDifficulty === opt.value}
                    onClick={() => setCustomDifficulty(opt.value)}
                    className="sp-seg-item inline-flex flex-1 items-center justify-center gap-1.5 px-2.5 py-2 text-[13.5px]"
                  >
                    {opt.dotClass && (
                      <span
                        className={cn('sp-dot', opt.dotClass)}
                        aria-hidden="true"
                      />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Question count */}
            <div className="space-y-2">
              <span className="block text-[14px] font-bold text-[var(--sp-ink)]">
                Length
              </span>
              <div className="grid grid-cols-5 gap-2">
                {CUSTOM_COUNT_OPTIONS.map((count) => {
                  const active = customCount === count;
                  return (
                    <button
                      key={count}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCustomCount(count)}
                      className={cn(
                        'sp-key sp-key--sm flex flex-col items-center rounded-2xl px-2 py-2.5',
                        active ? 'sp-key--selected' : 'sp-key--neutral'
                      )}
                    >
                      <span className="text-[18px] leading-none font-extrabold tabular-nums">
                        {count}
                      </span>
                      <span className="mt-1 text-[11.5px] font-semibold text-[var(--sp-muted)]">
                        questions
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <span className="block text-[14px] font-bold text-[var(--sp-ink)]">
                Timer
              </span>
              <div className="grid grid-cols-5 gap-2">
                {CUSTOM_DURATION_OPTIONS.map((mins) => {
                  const active = customDuration === mins;
                  return (
                    <button
                      key={mins}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCustomDuration(mins)}
                      className={cn(
                        'sp-key sp-key--sm flex flex-col items-center rounded-2xl px-2 py-2.5',
                        active ? 'sp-key--selected' : 'sp-key--neutral'
                      )}
                    >
                      <span className="text-[18px] leading-none font-extrabold tabular-nums">
                        {mins}
                      </span>
                      <span className="mt-1 text-[11.5px] font-semibold text-[var(--sp-muted)]">
                        min
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Optional topic scope selector */}
          {topics.length > 0 && (
            <div className="mt-6 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px] font-bold text-[var(--sp-ink)]">
                  Topics{' '}
                  <span className="font-semibold text-[var(--sp-muted)]">
                    ·{' '}
                    {effectiveCustomTopicIds.length === 0
                      ? 'All topics'
                      : `${effectiveCustomTopicIds.length} selected`}
                  </span>
                </span>
                {effectiveCustomTopicIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCustomTopicIds([])}
                    className="cursor-pointer text-[13px] font-bold text-[var(--sp-accent)] hover:underline"
                  >
                    Include all topics
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {topics.map((topic) => {
                  const selected = effectiveCustomTopicIds.includes(topic.id);
                  return (
                    <button
                      key={topic.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => handleToggleCustomTopic(topic.id)}
                      className={cn(
                        'sp-key sp-key--sm inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-semibold',
                        selected ? 'sp-key--selected' : 'sp-key--neutral'
                      )}
                    >
                      <span
                        className={cn(
                          'font-extrabold tabular-nums',
                          selected
                            ? 'text-[var(--sp-accent-ink)]'
                            : 'text-[var(--sp-accent)]'
                        )}
                      >
                        {formatCompactTopicCode(topic.code)}
                      </span>
                      {formatCompactTopicTitle(topic.title)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-7 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13.5px] text-[var(--sp-muted)]">
              {canStartCustom
                ? 'Answers and mark schemes stay hidden until you finish.'
                : 'No questions match these choices. Try a wider difficulty, format or topic range.'}
            </p>

            <button
              type="button"
              disabled={!canStartCustom}
              onClick={handleStartCustomPaper}
              className={cn(
                'sp-key inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl px-7 py-3.5 text-[16px] font-extrabold',
                canStartCustom ? 'sp-key--primary' : 'sp-key--idle'
              )}
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              <span>Start mock</span>
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

    const answeredPercent =
      session.questionRows.length > 0
        ? Math.round((answeredSoFar / session.questionRows.length) * 100)
        : 0;

    return (
      <div className="mx-auto max-w-[1160px] space-y-5">
        {/* Sticky exam control bar */}
        <div
          style={{ top: 'calc(var(--sp-topnav-h, 57px) + 8px)' }}
          className="sp-card sticky z-20 px-4 py-3.5 sm:px-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
            <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
              <p className="truncate text-[16px] font-extrabold text-[var(--sp-ink)]">
                {cleanPresetHeading(session.config.title)}
              </p>
              <p className="mt-0.5 text-[13px] font-medium tabular-nums text-[var(--sp-muted)]">
                {answeredSoFar} of {session.questionRows.length} answered ·{' '}
                {session.totalMarks} marks
                {flaggedSoFar > 0 ? ` · ${flaggedSoFar} flagged` : ''}
              </p>
            </div>

            <div className="flex w-full flex-nowrap items-center gap-2 sm:w-auto sm:gap-2.5">
              <div
                data-testid="mock-countdown-timer"
                aria-live="off"
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-[16px] font-extrabold tabular-nums sm:px-3.5 sm:text-[17px]',
                  session.status === 'paused' || (isLowTime && !isCriticalTime)
                    ? 'border-[var(--sp-warn)] bg-[var(--sp-warn-tint)] text-[var(--sp-warn-ink)] shadow-[0_3px_0_var(--sp-warn-lip)]'
                    : isCriticalTime
                      ? 'sp-anim-bump border-[var(--sp-danger)] bg-[var(--sp-danger-tint)] text-[var(--sp-danger-ink)] shadow-[0_3px_0_var(--sp-danger-lip)]'
                      : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-ink)] shadow-[0_3px_0_var(--sp-lip)]'
                )}
              >
                <Clock
                  className="h-[18px] w-[18px] shrink-0"
                  aria-hidden="true"
                  strokeWidth={2.5}
                />
                <span>{formatMockCountdown(session.remainingSeconds)}</span>
              </div>

              <button
                type="button"
                onClick={handleTogglePause}
                aria-label={session.status === 'paused' ? 'Resume' : 'Pause'}
                className="sp-key sp-key--neutral inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl px-3 text-[14px] font-extrabold sm:px-3.5"
              >
                {session.status === 'paused' ? (
                  <>
                    <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                    <span className="hidden sm:inline">Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
                    <span className="hidden sm:inline">Pause</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={loadingPaper}
                onClick={() => void finalizeSessionToReview(session)}
                className={cn(
                  'sp-key ml-auto inline-flex h-11 shrink-0 items-center justify-center rounded-2xl px-3.5 text-[14px] font-extrabold whitespace-nowrap sm:ml-0 sm:px-4',
                  loadingPaper ? 'sp-key--idle' : 'sp-key--primary'
                )}
              >
                Finish and mark
              </button>
            </div>
          </div>

          <div
            className="sp-progress mt-3"
            role="progressbar"
            aria-label="Questions answered"
            aria-valuemin={0}
            aria-valuemax={session.questionRows.length}
            aria-valuenow={answeredSoFar}
          >
            <div
              className="sp-progress-fill"
              style={{ width: `${answeredPercent}%` }}
            />
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_272px]">
          {/* Active question or paused veil */}
          <div className="min-w-0 space-y-4">
            {session.status === 'paused' ? (
              <div className="sp-card p-10 text-center">
                <span
                  className="sp-keycap mx-auto h-14 w-14 rounded-2xl"
                  aria-hidden="true"
                >
                  <Pause className="h-6 w-6 fill-current" />
                </span>
                <p className="mt-4 text-[19px] font-extrabold text-[var(--sp-ink)]">
                  Paused at{' '}
                  <span className="tabular-nums">
                    {formatMockCountdown(session.remainingSeconds)}
                  </span>
                </p>
                <p className="mx-auto mt-1.5 max-w-[44ch] text-[15px] text-[var(--sp-muted)]">
                  Questions stay hidden while the clock is stopped. Carry on
                  when you&apos;re ready.
                </p>
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className="sp-key sp-key--primary mt-6 inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-[15px] font-extrabold"
                >
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                  <span>Resume mock</span>
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
              <div className="sp-card flex min-h-[260px] items-center justify-center p-8 text-[15px] font-semibold text-[var(--sp-muted)]">
                <Loader2
                  className="mr-2 h-5 w-5 animate-spin text-[var(--sp-accent)]"
                  aria-hidden="true"
                />
                Loading question {session.currentIndex + 1}…
              </div>
            )}

            {/* Live bottom navigation */}
            <div className="sp-card flex flex-nowrap items-center justify-between gap-2 px-3 py-3 sm:gap-2.5 sm:px-4 sm:py-3.5">
              <button
                type="button"
                disabled={session.currentIndex === 0}
                onClick={() => handleJumpToIndex(session.currentIndex - 1)}
                aria-label="Previous question"
                className={cn(
                  'sp-key inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl px-3 text-[14px] font-extrabold sm:px-4',
                  session.currentIndex > 0 ? 'sp-key--neutral' : 'sp-key--idle'
                )}
              >
                <ChevronRight
                  className="h-4 w-4 rotate-180"
                  aria-hidden="true"
                  strokeWidth={2.75}
                />
                <span className="hidden sm:inline">Previous</span>
              </button>

              <button
                type="button"
                aria-pressed={Boolean(currentResponse?.flagged)}
                aria-label={currentResponse?.flagged ? 'Flagged' : 'Flag for review'}
                onClick={handleToggleFlagCurrent}
                className={cn(
                  'sp-key inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl px-3 text-[14px] font-extrabold sm:px-4',
                  currentResponse?.flagged
                    ? 'sp-key--warn sp-anim-bump'
                    : 'sp-key--neutral text-[var(--sp-muted)]'
                )}
              >
                <Flag
                  className={cn(
                    'h-4 w-4',
                    currentResponse?.flagged && 'fill-current'
                  )}
                  aria-hidden="true"
                  strokeWidth={2.5}
                />
                <span className="hidden sm:inline">
                  {currentResponse?.flagged ? 'Flagged' : 'Flag for review'}
                </span>
              </button>

              {session.currentIndex < session.questionIds.length - 1 ? (
                <button
                  type="button"
                  onClick={() => handleJumpToIndex(session.currentIndex + 1)}
                  className="sp-key sp-key--primary inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl px-5 text-[14px] font-extrabold"
                >
                  <span>Next</span>
                  <ChevronRight
                    className="h-4 w-4"
                    aria-hidden="true"
                    strokeWidth={2.75}
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void finalizeSessionToReview(session)}
                  className="sp-key sp-key--success inline-flex h-11 shrink-0 items-center gap-1.5 rounded-2xl px-4 text-[14px] font-extrabold whitespace-nowrap sm:px-5"
                >
                  <Check
                    className="h-4 w-4"
                    aria-hidden="true"
                    strokeWidth={3}
                  />
                  <span>Finish and mark</span>
                </button>
              )}
            </div>
          </div>

          {/* Question navigator (1..N) */}
          <aside
            aria-label="Exam question palette"
            style={{ top: 'calc(var(--sp-topnav-h, 57px) + 116px)' }}
            className="sp-card p-4 lg:sticky"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-extrabold text-[var(--sp-ink)]">
                Questions
              </h2>
              <span className="sp-chip sp-chip--accent tabular-nums">
                {answeredSoFar}/{session.questionRows.length}
              </span>
            </div>

            <div className="mt-3.5 grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-5">
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
                      'sp-key sp-key--sm relative inline-flex h-10 items-center justify-center rounded-xl text-[14px] font-extrabold tabular-nums',
                      flagged
                        ? 'sp-key--warn'
                        : answered
                          ? 'sp-key--selected text-[var(--sp-accent-ink)]'
                          : 'sp-key--neutral text-[var(--sp-muted)]',
                      isCurrent &&
                        'ring-[3px] ring-[var(--sp-accent)] ring-offset-2 ring-offset-[var(--sp-surface)]'
                    )}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px] font-semibold text-[var(--sp-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="sp-dot bg-[var(--sp-accent)]"
                  aria-hidden="true"
                />
                Answered
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="sp-dot bg-[var(--sp-warn)]"
                  aria-hidden="true"
                />
                Flagged
              </span>
            </div>

            <div className="mt-4 border-t-2 border-[var(--sp-surface-subtle)] pt-4">
              {!confirmExitOpen ? (
                <button
                  type="button"
                  onClick={() => setConfirmExitOpen(true)}
                  className="w-full cursor-pointer rounded-xl px-3 py-2 text-[13px] font-bold text-[var(--sp-muted)] transition-colors hover:bg-[var(--sp-surface-subtle)] hover:text-[var(--sp-danger-ink)]"
                >
                  Quit without saving
                </button>
              ) : (
                <div className="sp-well space-y-2.5 border-[var(--sp-danger)] bg-[var(--sp-danger-tint)] p-3">
                  <p className="text-[13.5px] font-bold text-[var(--sp-ink)]">
                    Quit this mock? Your answers won&apos;t be saved.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSession(null);
                        setConfirmExitOpen(false);
                      }}
                      className="sp-key sp-key--sm sp-key--wrong flex-1 rounded-xl px-2.5 py-1.5 text-[13px] font-extrabold text-[var(--sp-danger-ink)]"
                    >
                      Quit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmExitOpen(false)}
                      className="sp-key sp-key--sm sp-key--neutral flex-1 rounded-xl px-2.5 py-1.5 text-[13px] font-extrabold"
                    >
                      Keep going
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

  const isStrongResult = summary.percentage >= 70;

  return (
    <div className="mx-auto max-w-[1160px] space-y-6">
      {/* Score summary card */}
      <section
        aria-label="Mock exam score summary"
        className={cn(
          'sp-banner sp-anim-pop p-5 sm:p-7',
          isStrongResult ? 'sp-banner--success' : 'sp-banner--warn'
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-5">
            <div
              className={cn(
                'flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-[1.5rem] border-2 bg-[var(--sp-surface)] sm:h-28 sm:w-28',
                isStrongResult
                  ? 'border-[var(--sp-success)] shadow-[0_4px_0_var(--sp-success-lip)]'
                  : 'border-[var(--sp-warn)] shadow-[0_4px_0_var(--sp-warn-lip)]'
              )}
            >
              <span
                className={cn(
                  'text-[32px] leading-none font-black tabular-nums sm:text-[38px]',
                  isStrongResult
                    ? 'text-[var(--sp-success-ink)]'
                    : 'text-[var(--sp-warn-ink)]'
                )}
              >
                {summary.percentage}%
              </span>
              <span className="mt-1.5 text-[12.5px] font-bold tabular-nums text-[var(--sp-muted)]">
                {summary.earnedMarks} / {summary.totalMarks} marks
              </span>
            </div>

            <div className="min-w-0 space-y-1.5">
              <p
                className={cn(
                  'text-[14px] font-extrabold',
                  isStrongResult
                    ? 'text-[var(--sp-success-ink)]'
                    : 'text-[var(--sp-warn-ink)]'
                )}
              >
                {isStrongResult ? 'Great work!' : 'Good effort, keep going'}
              </p>
              <h1 className="text-[22px] font-extrabold tracking-tight text-[var(--sp-ink)] sm:text-[26px]">
                {cleanPresetHeading(session.config.title)} results
              </h1>
              <p className="text-[14px] font-medium tabular-nums text-[var(--sp-muted)]">
                Finished in {formatMockCountdown(elapsedSeconds)} ·{' '}
                {summary.answeredCount} of {summary.totalQuestions} answered
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {summary.weakTopicIds.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onPracticeWeakTopics(
                    summary.weakTopicIds,
                    session.config.syllabus
                  )
                }
                className="sp-key sp-key--primary inline-flex items-center justify-center rounded-2xl px-5 py-3 text-[15px] font-extrabold"
              >
                Practise weak topics
              </button>
            )}

            {onOpenPdfStudio && (
              <button
                type="button"
                onClick={() => onOpenPdfStudio(session)}
                className="sp-key sp-key--neutral inline-flex items-center gap-1.5 rounded-2xl px-4 py-3 text-[15px] font-extrabold"
              >
                <Printer
                  className="h-4 w-4 text-[var(--sp-accent)]"
                  aria-hidden="true"
                  strokeWidth={2.5}
                />
                <span>Save PDF</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setSession(null);
                setConfirmExitOpen(false);
              }}
              className="sp-key sp-key--neutral inline-flex items-center gap-1.5 rounded-2xl px-4 py-3 text-[15px] font-extrabold"
            >
              <RotateCcw
                className="h-4 w-4"
                aria-hidden="true"
                strokeWidth={2.5}
              />
              <span>New mock</span>
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="sp-card rounded-2xl p-4">
            <span className="block text-[13px] font-bold text-[var(--sp-muted)]">
              Total score
            </span>
            <div className="mt-1 flex items-baseline gap-2 tabular-nums">
              <span className="text-[22px] font-extrabold text-[var(--sp-ink)]">
                {summary.earnedMarks} / {summary.totalMarks}
              </span>
              <span className="text-[14px] font-bold text-[var(--sp-accent)]">
                {summary.percentage}%
              </span>
            </div>
          </div>

          <div className="sp-card rounded-2xl p-4">
            <span className="block text-[13px] font-bold text-[var(--sp-muted)]">
              Multiple choice
            </span>
            <div className="mt-1 text-[20px] font-extrabold tabular-nums text-[var(--sp-ink)]">
              {summary.mcqTotal > 0
                ? `${summary.mcqCorrect} / ${summary.mcqTotal} correct`
                : 'None in paper'}
            </div>
          </div>

          <div className="sp-card rounded-2xl p-4">
            <span className="block text-[13px] font-bold text-[var(--sp-muted)]">
              Written answers
            </span>
            <div className="mt-1 text-[20px] font-extrabold tabular-nums text-[var(--sp-ink)]">
              {summary.structuredTotalMarks > 0
                ? `${summary.structuredEarnedMarks} / ${summary.structuredTotalMarks} marks`
                : 'None in paper'}
            </div>
          </div>
        </div>

        {summary.unmarkedStructuredCount > 0 && (
          <div className="sp-card mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3.5">
            <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--sp-ink)]">
              <span className="sp-chip sp-chip--warn tabular-nums">
                {summary.unmarkedStructuredCount}
              </span>
              <span>
                written{' '}
                {summary.unmarkedStructuredCount === 1
                  ? 'answer needs'
                  : 'answers need'}{' '}
                marking against the mark scheme to finish your score.
              </span>
            </p>
            <button
              type="button"
              onClick={() => {
                setReviewTab('unmarked');
                if (unmarkedEntries[0]) {
                  handleJumpToIndex(unmarkedEntries[0].idx);
                }
              }}
              className="sp-key sp-key--warn rounded-2xl px-4 py-2.5 text-[14px] font-extrabold"
            >
              Mark my answers
            </button>
          </div>
        )}
      </section>

      {/* Topic breakdown */}
      {summary.topicBreakdown.length > 0 && (
        <section aria-label="Topic breakdown" className="sp-card p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[18px] font-extrabold text-[var(--sp-ink)]">
              How you did by topic
            </h2>
            <span className="text-[13px] font-medium text-[var(--sp-muted)]">
              Weakest first
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {summary.topicBreakdown.map((topic) => {
              const isWeak = topic.accuracyPercent < 70;
              return (
                <div
                  key={topic.topicId}
                  className="sp-well flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="sp-chip sp-chip--accent shrink-0 tabular-nums">
                        {formatCompactTopicCode(topic.topicCode)}
                      </span>
                      <span className="truncate text-[14.5px] font-bold text-[var(--sp-ink)]">
                        {formatCompactTopicTitle(topic.topicTitle)}
                      </span>
                    </div>

                    <div className="mt-2.5 flex max-w-md items-center gap-3">
                      <div className="sp-progress sp-progress--sm flex-1">
                        <div
                          className={cn(
                            'sp-progress-fill',
                            isWeak
                              ? 'bg-[var(--sp-warn)]'
                              : 'bg-[var(--sp-success)]'
                          )}
                          style={{ width: `${topic.accuracyPercent}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--sp-muted)]">
                        {topic.earnedMarks}/{topic.totalMarks} marks ·{' '}
                        <span
                          className={cn(
                            'font-extrabold',
                            isWeak
                              ? 'text-[var(--sp-warn-ink)]'
                              : 'text-[var(--sp-success-ink)]'
                          )}
                        >
                          {topic.accuracyPercent}%
                        </span>
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
                    className="sp-key sp-key--sm sp-key--neutral shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-extrabold"
                  >
                    Practise topic
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Question review & self-marking queue */}
      <section aria-label="Question review and marking" className="space-y-4">
        <div className="sp-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="sp-seg flex-wrap">
            <button
              type="button"
              aria-pressed={reviewTab === 'all'}
              onClick={() => setReviewTab('all')}
              className="sp-seg-item px-3 py-1.5 text-[13.5px]"
            >
              All <span className="tabular-nums">({reviewIndices.length})</span>
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
                className="sp-seg-item px-3 py-1.5 text-[13.5px]"
              >
                To mark{' '}
                <span className="tabular-nums">({unmarkedEntries.length})</span>
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
              className="sp-seg-item px-3 py-1.5 text-[13.5px]"
            >
              Missed or partial{' '}
              <span className="tabular-nums">({missedEntries.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {reviewIndices.map((entry) => {
              const isSelected = entry.idx === activeReviewIndex;
              return (
                <button
                  key={entry.row.id}
                  type="button"
                  onClick={() => handleJumpToIndex(entry.idx)}
                  aria-label={`Review question ${entry.idx + 1}`}
                  className={cn(
                    'sp-key sp-key--sm inline-flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-extrabold tabular-nums',
                    entry.unmarkedStructured
                      ? 'sp-key--warn'
                      : entry.isFullMarks
                        ? 'sp-key--correct text-[var(--sp-success-ink)]'
                        : 'sp-key--wrong text-[var(--sp-danger-ink)]',
                    isSelected &&
                      'ring-[3px] ring-[var(--sp-accent)] ring-offset-2 ring-offset-[var(--sp-surface)]'
                  )}
                >
                  {entry.idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {visibleEntries.length === 0 ? (
          <div className="sp-card p-9 text-center">
            <span
              className="sp-keycap sp-keycap--correct sp-anim-pop mx-auto h-12 w-12 rounded-2xl"
              aria-hidden="true"
            >
              <Check className="h-6 w-6" strokeWidth={3} />
            </span>
            <p className="mt-3.5 text-[16px] font-extrabold text-[var(--sp-ink)]">
              {reviewTab === 'unmarked'
                ? 'All written answers are marked'
                : 'Full marks on every marked question'}
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setReviewTab('all')}
                className="sp-key sp-key--neutral rounded-2xl px-4 py-2.5 text-[14px] font-extrabold"
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

            <div className="sp-card flex items-center justify-between gap-2 px-3 py-3 sm:px-4">
              <button
                type="button"
                disabled={activeReviewIndex === 0}
                onClick={() => handleJumpToIndex(activeReviewIndex - 1)}
                className={cn(
                  'sp-key inline-flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-[14px] font-extrabold sm:px-4',
                  activeReviewIndex > 0 ? 'sp-key--neutral' : 'sp-key--idle'
                )}
              >
                <ChevronRight
                  className="h-4 w-4 rotate-180"
                  aria-hidden="true"
                  strokeWidth={2.75}
                />
                <span>
                  Previous
                  <span className="hidden sm:inline"> question</span>
                </span>
              </button>

              <span className="text-[13.5px] font-semibold tabular-nums text-[var(--sp-muted)]">
                <span className="hidden sm:inline">Question </span>
                {activeReviewIndex + 1} of {session.questionIds.length}
              </span>

              <button
                type="button"
                disabled={activeReviewIndex >= session.questionIds.length - 1}
                onClick={() => handleJumpToIndex(activeReviewIndex + 1)}
                className={cn(
                  'sp-key inline-flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-[14px] font-extrabold sm:px-4',
                  activeReviewIndex < session.questionIds.length - 1
                    ? 'sp-key--primary'
                    : 'sp-key--idle'
                )}
              >
                <span>
                  Next<span className="hidden sm:inline"> question</span>
                </span>
                <ChevronRight
                  className="h-4 w-4"
                  aria-hidden="true"
                  strokeWidth={2.75}
                />
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
