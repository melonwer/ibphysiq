'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { FormulaDrawer } from '@/components/sixthphysics/formula-drawer';
import { MathText } from '@/components/sixthphysics/math-text';
import { MockExamView } from '@/components/sixthphysics/mock-exam-view';
import { QuestionCard } from '@/components/sixthphysics/question-card';
import {
  TopNav,
  type ThemeMode,
  type WorkspaceMode,
} from '@/components/sixthphysics/top-nav';
import { TopicRail } from '@/components/sixthphysics/topic-rail';
import {
  computeOverallSyllabusMastery,
  computeTopicMasteryStats,
  createDefaultProgressState,
  filterIndexRows,
  getFallbackManifest,
  getFallbackQuestionById,
  getFallbackQuestions,
  loadBankManifest,
  loadProgressState,
  loadQuestionById,
  prefetchChunk,
  recordCompletedMock,
  recordQuestionAttempt,
  saveProgressState,
  setLastQuestionForSyllabus,
  toggleBookmark,
  updateActiveFilters,
  type PublicBankItem,
  type PublicBankManifest,
  type QuestionAttemptInput,
  type QuestionDifficulty,
  type QuestionFilterCriteria,
  type QuestionFormat,
  type QuestionStatusFilter,
  type StudentProgressState,
  type SyllabusId,
} from '@/lib/sixthphysics-web';
import { cn } from '@/lib/utils';

const VALID_SYLLABI = new Set<SyllabusId>(['ib', 'alevel', 'ncuk']);
const VALID_FORMATS = new Set<QuestionFormat | 'all'>([
  'all',
  'mcq',
  'structured',
]);
const VALID_DIFFICULTIES = new Set<QuestionDifficulty | 'all'>([
  'all',
  'foundation',
  'standard',
  'higher',
]);
const VALID_STATUSES = new Set<QuestionStatusFilter>([
  'all',
  'unseen',
  'needs-review',
  'saved',
]);

interface ParsedUrlState {
  hasUrlOverrides: boolean;
  mode?: WorkspaceMode;
  questionId?: string;
  filterPatch: Partial<QuestionFilterCriteria>;
}

function parseUrlQueryState(search: string): ParsedUrlState {
  const params = new URLSearchParams(search);
  const filterPatch: Partial<QuestionFilterCriteria> = {};
  let hasUrlOverrides = false;

  const rawMode = params.get('mode');
  const mode: WorkspaceMode | undefined =
    rawMode === 'mock'
      ? 'mock'
      : rawMode === 'practice'
        ? 'practice'
        : undefined;
  if (mode) {
    hasUrlOverrides = true;
  }

  const rawSyllabus = params.get('syllabus') as SyllabusId | null;
  if (rawSyllabus && VALID_SYLLABI.has(rawSyllabus)) {
    filterPatch.syllabus = rawSyllabus;
    filterPatch.level = 'all';
    filterPatch.topicId = 'all';
    filterPatch.subtopicId = 'all';
    hasUrlOverrides = true;
  }

  const rawLevel = params.get('level');
  if (rawLevel) {
    filterPatch.level = rawLevel;
    hasUrlOverrides = true;
  }

  const rawTopic = params.get('topic');
  if (rawTopic) {
    filterPatch.topicId = rawTopic;
    hasUrlOverrides = true;
  }

  const rawSubtopic = params.get('subtopic');
  if (rawSubtopic) {
    filterPatch.subtopicId = rawSubtopic;
    hasUrlOverrides = true;
  }

  const rawFormat = params.get('format') as QuestionFormat | 'all' | null;
  if (rawFormat && VALID_FORMATS.has(rawFormat)) {
    filterPatch.format = rawFormat;
    hasUrlOverrides = true;
  }

  const rawDifficulty = params.get('difficulty') as
    | QuestionDifficulty
    | 'all'
    | null;
  if (rawDifficulty && VALID_DIFFICULTIES.has(rawDifficulty)) {
    filterPatch.difficulty = rawDifficulty;
    hasUrlOverrides = true;
  }

  const rawStatus = params.get('status') as QuestionStatusFilter | null;
  if (rawStatus && VALID_STATUSES.has(rawStatus)) {
    filterPatch.status = rawStatus;
    hasUrlOverrides = true;
  }

  const rawQuestionId = params.get('q')?.trim() || undefined;
  if (rawQuestionId) {
    hasUrlOverrides = true;
  }

  return {
    hasUrlOverrides,
    mode,
    questionId: rawQuestionId,
    filterPatch,
  };
}

export function SixthPhysicsShell() {
  const initialFallbackQuestions = useMemo(() => getFallbackQuestions(), []);

  const [manifest, setManifest] = useState<PublicBankManifest>(() =>
    getFallbackManifest()
  );
  const [progress, setProgress] = useState<StudentProgressState>(() =>
    createDefaultProgressState('2026-11-18T00:00:00.000Z')
  );
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('practice');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null
  );
  const [loadedItem, setLoadedItem] = useState<PublicBankItem | null>(
    () => initialFallbackQuestions[0] ?? null
  );
  const [loadingQuestion, setLoadingQuestion] = useState(false);

  const [formulaDrawerOpen, setFormulaDrawerOpen] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [hasActiveMockSession, setHasActiveMockSession] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [hydrated, setHydrated] = useState(false);

  const activeFilters = progress.activeFilters;
  const activeSyllabus: SyllabusId = VALID_SYLLABI.has(activeFilters.syllabus)
    ? activeFilters.syllabus
    : 'ib';
  const syllabusSummary = manifest.syllabi[activeSyllabus];
  const topics = useMemo(
    () => syllabusSummary?.topics ?? [],
    [syllabusSummary]
  );

  // Hydrate localStorage progress, theme, URL query state, and full bank manifest
  useEffect(() => {
    let cancelled = false;

    if (typeof document !== 'undefined') {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    }

    const storedProgress = loadProgressState();
    const urlState =
      typeof window !== 'undefined'
        ? parseUrlQueryState(window.location.search)
        : { hasUrlOverrides: false, filterPatch: {} };

    const mergedFilters: QuestionFilterCriteria = {
      ...storedProgress.activeFilters,
      ...urlState.filterPatch,
    };
    const mergedProgress: StudentProgressState = {
      ...storedProgress,
      activeFilters: mergedFilters,
    };

    setProgress(mergedProgress);
    if (urlState.mode) {
      setWorkspaceMode(urlState.mode);
    }
    if (urlState.questionId) {
      setSelectedQuestionId(urlState.questionId);
    } else {
      const remembered =
        mergedProgress.lastQuestionIdBySyllabus[mergedFilters.syllabus];
      if (remembered) {
        setSelectedQuestionId(remembered);
      } else {
        setSelectedQuestionId(null);
      }
    }

    void loadBankManifest().then((fullManifest) => {
      if (cancelled) return;
      setManifest(fullManifest);
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(
    () => filterIndexRows(manifest.items, activeFilters, progress),
    [manifest.items, activeFilters, progress]
  );

  const effectiveQuestionIndex = useMemo(() => {
    if (filteredRows.length === 0) {
      return -1;
    }
    if (selectedQuestionId) {
      const foundIdx = filteredRows.findIndex(
        (row) => row.id === selectedQuestionId
      );
      if (foundIdx >= 0) {
        return foundIdx;
      }
    }
    const rememberedId = progress.lastQuestionIdBySyllabus[activeSyllabus];
    if (rememberedId) {
      const rememberedIdx = filteredRows.findIndex(
        (row) => row.id === rememberedId
      );
      if (rememberedIdx >= 0) {
        return rememberedIdx;
      }
    }
    return 0;
  }, [
    filteredRows,
    selectedQuestionId,
    progress.lastQuestionIdBySyllabus,
    activeSyllabus,
  ]);

  const effectiveRow =
    effectiveQuestionIndex >= 0 ? filteredRows[effectiveQuestionIndex] : null;
  const effectiveQuestionId = effectiveRow?.id ?? null;

  // Load active question item + prefetch next question's domain chunk
  useEffect(() => {
    let cancelled = false;

    if (!effectiveQuestionId) {
      return;
    }

    const immediateFallback = getFallbackQuestionById(effectiveQuestionId);
    if (immediateFallback && loadedItem?.id !== effectiveQuestionId) {
      setLoadedItem(immediateFallback);
    }

    if (loadedItem?.id !== effectiveQuestionId) {
      setLoadingQuestion(true);
    }

    void loadQuestionById(effectiveQuestionId, manifest).then((resolved) => {
      if (cancelled) return;
      if (resolved) {
        setLoadedItem(resolved);
      }
      setLoadingQuestion(false);
    });

    if (filteredRows.length > 1 && effectiveQuestionIndex >= 0) {
      const nextRow =
        filteredRows[(effectiveQuestionIndex + 1) % filteredRows.length];
      if (nextRow) {
        void prefetchChunk(nextRow.chunkKey);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [
    effectiveQuestionId,
    effectiveQuestionIndex,
    filteredRows,
    loadedItem?.id,
    manifest,
  ]);

  // Sync URL query params cleanly via window.history.replaceState
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams();
    params.set('syllabus', activeSyllabus);

    if (workspaceMode === 'mock') {
      params.set('mode', 'mock');
    }
    if (activeFilters.level && activeFilters.level !== 'all') {
      params.set('level', activeFilters.level);
    }
    if (activeFilters.topicId && activeFilters.topicId !== 'all') {
      params.set('topic', activeFilters.topicId);
    }
    if (activeFilters.subtopicId && activeFilters.subtopicId !== 'all') {
      params.set('subtopic', activeFilters.subtopicId);
    }
    if (activeFilters.format && activeFilters.format !== 'all') {
      params.set('format', activeFilters.format);
    }
    if (activeFilters.difficulty && activeFilters.difficulty !== 'all') {
      params.set('difficulty', activeFilters.difficulty);
    }
    if (activeFilters.status && activeFilters.status !== 'all') {
      params.set('status', activeFilters.status);
    }
    if (workspaceMode === 'practice' && effectiveQuestionId) {
      params.set('q', effectiveQuestionId);
    }

    const query = params.toString();
    const nextUrl = query
      ? `${window.location.pathname}?${query}${window.location.hash}`
      : `${window.location.pathname}${window.location.hash}`;

    try {
      window.history.replaceState(null, '', nextUrl);
    } catch {
      // Ignore replaceState restrictions in sandboxed environments
    }
  }, [hydrated, activeSyllabus, activeFilters, workspaceMode, effectiveQuestionId]);

  const commitProgress = useCallback(
    (updater: (prev: StudentProgressState) => StudentProgressState) => {
      setProgress((prev) => {
        const next = updater(prev);
        saveProgressState(next);
        return next;
      });
    },
    []
  );

  // Remember current question per syllabus once hydrated
  const lastSavedQuestionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated || !effectiveQuestionId || workspaceMode !== 'practice') {
      return;
    }
    const key = `${activeSyllabus}:${effectiveQuestionId}`;
    if (lastSavedQuestionRef.current === key) {
      return;
    }
    lastSavedQuestionRef.current = key;
    commitProgress((prev) =>
      setLastQuestionForSyllabus(prev, activeSyllabus, effectiveQuestionId)
    );
  }, [hydrated, activeSyllabus, effectiveQuestionId, workspaceMode, commitProgress]);

  const topicMastery = useMemo(
    () =>
      computeTopicMasteryStats(
        activeSyllabus,
        manifest.items,
        progress,
        topics
      ),
    [activeSyllabus, manifest.items, progress, topics]
  );

  const overallMastery = useMemo(
    () =>
      computeOverallSyllabusMastery(activeSyllabus, manifest.items, progress),
    [activeSyllabus, manifest.items, progress]
  );

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      if (typeof document !== 'undefined') {
        document.documentElement.classList.toggle('dark', next === 'dark');
      }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('sixthphysics.theme', next);
        } catch {
          // Ignore storage quota errors
        }
      }
      return next;
    });
  }, []);

  const handleSelectSyllabus = useCallback(
    (nextSyllabus: SyllabusId) => {
      if (nextSyllabus === activeSyllabus) {
        return;
      }
      commitProgress((prev) => {
        const remembered = prev.lastQuestionIdBySyllabus[nextSyllabus] ?? null;
        setSelectedQuestionId(remembered);
        return updateActiveFilters(prev, {
          syllabus: nextSyllabus,
          level: 'all',
          topicId: 'all',
          subtopicId: 'all',
          searchQuery: '',
        });
      });
    },
    [activeSyllabus, commitProgress]
  );

  const handleSelectLevel = useCallback(
    (nextLevel: string) => {
      commitProgress((prev) =>
        updateActiveFilters(prev, {
          syllabus: activeSyllabus,
          level: nextLevel,
        })
      );
    },
    [activeSyllabus, commitProgress]
  );

  const handleChangeFilters = useCallback(
    (nextFilters: QuestionFilterCriteria) => {
      commitProgress((prev) => updateActiveFilters(prev, nextFilters));
    },
    [commitProgress]
  );

  const handleSearchChange = useCallback(
    (query: string) => {
      commitProgress((prev) =>
        updateActiveFilters(prev, {
          searchQuery: query,
        })
      );
    },
    [commitProgress]
  );

  const handleNavigateOffset = useCallback(
    (delta: number) => {
      if (filteredRows.length === 0) return;
      const baseIndex = effectiveQuestionIndex >= 0 ? effectiveQuestionIndex : 0;
      const nextIndex =
        (baseIndex + delta + filteredRows.length) % filteredRows.length;
      const targetRow = filteredRows[nextIndex];
      if (targetRow) {
        setSelectedQuestionId(targetRow.id);
        if (typeof window !== 'undefined' && window.scrollY > 120) {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      }
    },
    [filteredRows, effectiveQuestionIndex]
  );

  const handlePreviousQuestion = useCallback(() => {
    handleNavigateOffset(-1);
  }, [handleNavigateOffset]);

  const handleNextQuestion = useCallback(() => {
    handleNavigateOffset(1);
  }, [handleNavigateOffset]);

  const handleRandomUnseen = useCallback(() => {
    if (filteredRows.length === 0) return;

    const unseenCandidates = filteredRows.filter(
      (row) => row.id !== effectiveQuestionId && !progress.attempts[row.id]
    );
    const pool =
      unseenCandidates.length > 0
        ? unseenCandidates
        : filteredRows.filter((row) => row.id !== effectiveQuestionId);

    if (pool.length === 0) {
      return;
    }

    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (picked) {
      setSelectedQuestionId(picked.id);
      if (typeof window !== 'undefined' && window.scrollY > 120) {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    }
  }, [filteredRows, effectiveQuestionId, progress.attempts]);

  const handleToggleBookmark = useCallback(
    (questionId: string) => {
      commitProgress((prev) => toggleBookmark(prev, questionId));
    },
    [commitProgress]
  );

  const handleRecordAttempt = useCallback(
    (attempt: QuestionAttemptInput) => {
      commitProgress((prev) => recordQuestionAttempt(prev, attempt));
    },
    [commitProgress]
  );

  const handleCompleteMock = useCallback(
    (attempts: QuestionAttemptInput[]) => {
      commitProgress((prev) => recordCompletedMock(prev, attempts));
    },
    [commitProgress]
  );

  const handlePracticeWeakTopics = useCallback(
    (weakTopicIds: string[], targetSyllabus: SyllabusId) => {
      const primaryWeakTopic = weakTopicIds[0] ?? 'all';
      setSelectedQuestionId(null);
      commitProgress((prev) =>
        updateActiveFilters(prev, {
          syllabus: targetSyllabus,
          level: 'all',
          topicId: primaryWeakTopic,
          subtopicId: 'all',
          format: 'all',
          difficulty: 'all',
          status: 'all',
          searchQuery: '',
        })
      );
      setWorkspaceMode('practice');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [commitProgress]
  );

  const handleClearAllFilters = useCallback(() => {
    commitProgress((prev) =>
      updateActiveFilters(prev, {
        syllabus: activeSyllabus,
        level: 'all',
        topicId: 'all',
        subtopicId: 'all',
        format: 'all',
        difficulty: 'all',
        status: 'all',
        searchQuery: '',
      })
    );
  }, [activeSyllabus, commitProgress]);

  const activeItemForCard =
    loadedItem &&
    (!effectiveQuestionId || loadedItem.id === effectiveQuestionId)
      ? loadedItem
      : loadedItem;

  const isBookmarked = Boolean(
    activeItemForCard && progress.bookmarkedIds.includes(activeItemForCard.id)
  );
  const existingAttempt = activeItemForCard
    ? (progress.attempts[activeItemForCard.id] ?? null)
    : null;

  return (
    <div className="min-h-screen bg-[var(--sp-bg)] text-[var(--sp-ink)]">
      <TopNav
        activeSyllabus={activeSyllabus}
        activeLevel={activeFilters.level ?? 'all'}
        workspaceMode={workspaceMode}
        totalBankItems={manifest.totalItems}
        overallMastery={overallMastery}
        streakDays={progress.streak.currentDays}
        hasActiveMockSession={hasActiveMockSession}
        theme={theme}
        onSelectSyllabus={handleSelectSyllabus}
        onSelectLevel={handleSelectLevel}
        onSelectWorkspaceMode={setWorkspaceMode}
        onOpenFormulaDrawer={() => setFormulaDrawerOpen(true)}
        onToggleTheme={handleToggleTheme}
      />

      <main
        id="main-content"
        className="mx-auto max-w-[1400px] px-3 py-4 sm:px-5 sm:py-6"
      >
        {workspaceMode === 'mock' ? (
          <MockExamView
            manifest={manifest}
            activeSyllabus={activeSyllabus}
            activeLevel={activeFilters.level}
            topics={topics}
            bookmarkedIds={progress.bookmarkedIds}
            onToggleBookmark={handleToggleBookmark}
            onCompleteMock={handleCompleteMock}
            onRecordQuestionAttempt={handleRecordAttempt}
            onPracticeWeakTopics={handlePracticeWeakTopics}
            onSessionActiveChange={setHasActiveMockSession}
          />
        ) : (
          <div className="flex flex-col lg:flex-row lg:items-start lg:gap-6">
            <TopicRail
              activeSyllabus={activeSyllabus}
              topics={topics}
              filters={activeFilters}
              onChangeFilters={handleChangeFilters}
              topicMastery={topicMastery}
              totalQuestionCount={syllabusSummary?.questionCount}
              filteredQuestionCount={filteredRows.length}
              selectedTopicId={activeFilters.topicId}
              selectedSubtopicId={activeFilters.subtopicId}
              mobileOpen={mobileRailOpen}
              onMobileOpenChange={setMobileRailOpen}
            />

            <div className="min-w-0 flex-1 space-y-3.5">
              {/* Practice Desk Control Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] px-3.5 py-2.5 sm:px-4">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    disabled={filteredRows.length <= 1}
                    onClick={handlePreviousQuestion}
                    aria-label="Previous question"
                    className={cn(
                      'inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                      filteredRows.length > 1
                        ? 'cursor-pointer border-[var(--sp-border)] bg-[var(--sp-surface)] text-[var(--sp-ink)] hover:bg-[var(--sp-surface-subtle)]'
                        : 'cursor-not-allowed border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-muted)] opacity-60'
                    )}
                  >
                    <ChevronRight
                      className="h-3.5 w-3.5 rotate-180"
                      aria-hidden="true"
                    />
                    <span className="hidden sm:inline">Previous</span>
                  </button>

                  <span
                    data-testid="practice-question-counter"
                    className="px-1 font-mono text-xs font-medium tabular-nums text-[var(--sp-muted)]"
                  >
                    {filteredRows.length > 0
                      ? `${effectiveQuestionIndex + 1} / ${filteredRows.length.toLocaleString()}`
                      : '0 matching'}
                  </span>

                  <button
                    type="button"
                    disabled={filteredRows.length <= 1}
                    onClick={handleNextQuestion}
                    aria-label="Next question"
                    className={cn(
                      'inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                      filteredRows.length > 1
                        ? 'cursor-pointer border-[var(--sp-border)] bg-[var(--sp-surface)] text-[var(--sp-ink)] hover:bg-[var(--sp-surface-subtle)]'
                        : 'cursor-not-allowed border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-muted)] opacity-60'
                    )}
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    disabled={filteredRows.length <= 1}
                    onClick={handleRandomUnseen}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                      filteredRows.length > 1
                        ? 'cursor-pointer border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-ink)] hover:border-[var(--sp-accent)]/45'
                        : 'cursor-not-allowed border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-muted)] opacity-60'
                    )}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Random unseen</span>
                  </button>
                </div>

                <div className="flex flex-1 items-center justify-end gap-2 sm:flex-initial">
                  <div className="relative min-w-0 flex-1 sm:w-52 sm:flex-initial">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--sp-muted)]"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={activeFilters.searchQuery ?? ''}
                      onChange={(event) =>
                        handleSearchChange(event.target.value)
                      }
                      placeholder="Filter by concept or ID..."
                      aria-label="Filter questions by concept or ID"
                      className="h-8 w-full rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)]/80 pr-7 pl-8 text-xs text-[var(--sp-ink)] placeholder:text-[var(--sp-muted)]"
                    />
                    {activeFilters.searchQuery && (
                      <button
                        type="button"
                        onClick={() => handleSearchChange('')}
                        aria-label="Clear concept filter"
                        className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-[var(--sp-muted)] hover:text-[var(--sp-ink)]"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  {syllabusSummary?.gravityConvention && (
                    <button
                      type="button"
                      onClick={() => setFormulaDrawerOpen(true)}
                      title="Open syllabus constants and formula sheet"
                      className="hidden h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-2.5 font-mono text-xs tabular-nums text-[var(--sp-muted)] transition-colors hover:border-[var(--sp-accent)]/45 hover:text-[var(--sp-ink)] xl:inline-flex"
                    >
                      <BookOpen
                        className="h-3 w-3 text-[var(--sp-accent)]"
                        aria-hidden="true"
                      />
                      <MathText text={syllabusSummary.gravityConvention} />
                    </button>
                  )}
                </div>
              </div>

              {/* Main Practice Question Card or Empty Filter Direction */}
              {filteredRows.length === 0 ? (
                <div className="rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] p-8 text-center">
                  <h2 className="text-base font-semibold text-[var(--sp-ink)]">
                    {activeFilters.status === 'saved'
                      ? 'No saved questions in this view yet'
                      : activeFilters.status === 'needs-review'
                        ? 'No questions need review in this filter'
                        : activeFilters.status === 'unseen'
                          ? 'Every question in this filter has been attempted'
                          : 'No questions match these filters'}
                  </h2>
                  <p className="mx-auto mt-1.5 max-w-[48ch] text-sm text-[var(--sp-muted)]">
                    {activeFilters.status === 'saved'
                      ? 'Use Save on any question card to keep problems for revision.'
                      : activeFilters.status === 'needs-review'
                        ? 'Missed multiple-choice questions and structured responses below 70% appear here automatically.'
                        : 'Clear or broaden your active topic, difficulty, or status filters to continue practicing.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-xl bg-[var(--sp-accent)] px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-95"
                  >
                    Show all {syllabusSummary?.shortLabel ?? 'syllabus'}{' '}
                    questions
                  </button>
                </div>
              ) : activeItemForCard ? (
                <div
                  className={cn(
                    'transition-opacity duration-150',
                    loadingQuestion &&
                      activeItemForCard.id !== effectiveQuestionId &&
                      'opacity-65'
                  )}
                >
                  <QuestionCard
                    item={activeItemForCard}
                    mode="practice"
                    activeSyllabus={activeSyllabus}
                    topics={topics}
                    questionNumber={effectiveQuestionIndex + 1}
                    totalQuestions={filteredRows.length}
                    isBookmarked={isBookmarked}
                    onToggleBookmark={handleToggleBookmark}
                    existingAttempt={existingAttempt}
                    onRecordAttempt={handleRecordAttempt}
                    onNextQuestion={
                      filteredRows.length > 1 ? handleNextQuestion : undefined
                    }
                    onPreviousQuestion={
                      filteredRows.length > 1
                        ? handlePreviousQuestion
                        : undefined
                    }
                    enableKeyboardShortcuts={
                      !formulaDrawerOpen && !mobileRailOpen
                    }
                  />
                </div>
              ) : (
                <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] p-8 text-sm text-[var(--sp-muted)]">
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin text-[var(--sp-accent)]"
                    aria-hidden="true"
                  />
                  Loading physics question...
                </div>
              )}

              {/* Bottom Pager */}
              {filteredRows.length > 1 && (
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] px-3 py-2.5 sm:px-4 sm:py-3">
                  <button
                    type="button"
                    onClick={handlePreviousQuestion}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--sp-ink)] transition-colors hover:bg-[var(--sp-surface-subtle)] sm:px-3"
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

                  <button
                    type="button"
                    onClick={handleRandomUnseen}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-2.5 py-1.5 text-xs font-medium text-[var(--sp-ink)] transition-colors hover:border-[var(--sp-accent)]/45 sm:px-3"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Random unseen</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[var(--sp-ink)] px-2.5 py-1.5 text-xs font-semibold text-[var(--sp-surface)] transition-opacity hover:opacity-90 sm:px-3.5"
                  >
                    <span>
                      Next<span className="hidden sm:inline"> question</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <FormulaDrawer
        open={formulaDrawerOpen}
        onClose={() => setFormulaDrawerOpen(false)}
        activeSyllabus={activeSyllabus}
        activeLevel={activeFilters.level}
      />
    </div>
  );
}
