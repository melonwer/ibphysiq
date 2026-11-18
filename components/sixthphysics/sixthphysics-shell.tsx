'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { FormulaDrawer } from '@/components/sixthphysics/formula-drawer';
import { MockExamView } from '@/components/sixthphysics/mock-exam-view';
import { PdfPaperStudio } from '@/components/sixthphysics/pdf-paper-studio';
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
  type MockPaperSession,
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
      : rawMode === 'pdf'
        ? 'pdf'
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
  const [pdfImportedSession, setPdfImportedSession] =
    useState<MockPaperSession | null>(null);
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
    } else if (workspaceMode === 'pdf') {
      params.set('mode', 'pdf');
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

  const handleOpenPdfStudio = useCallback((session?: MockPaperSession) => {
    if (session) {
      setPdfImportedSession(session);
    } else {
      setPdfImportedSession(null);
    }
    setWorkspaceMode('pdf');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, []);

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

  const attemptedInSet = useMemo(
    () => filteredRows.reduce((sum, row) => sum + (progress.attempts[row.id] ? 1 : 0), 0),
    [filteredRows, progress.attempts]
  );
  const setProgressPct =
    filteredRows.length > 0
      ? Math.min(100, Math.round((attemptedInSet / filteredRows.length) * 100))
      : 0;
  const canNavigate = filteredRows.length > 1;

  return (
    <div className="sp-app-shell min-h-screen bg-[var(--sp-bg)] text-[var(--sp-ink)]">
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
        className="mx-auto max-w-[1400px] px-3 py-3.5 sm:px-5 sm:py-5"
      >
        {workspaceMode === 'pdf' ? (
          <PdfPaperStudio
            manifest={manifest}
            activeSyllabus={activeSyllabus}
            activeLevel={activeFilters.level}
            topics={topics}
            importedMockSession={pdfImportedSession}
            onClearImportedSession={() => setPdfImportedSession(null)}
          />
        ) : workspaceMode === 'mock' ? (
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
            onOpenPdfStudio={handleOpenPdfStudio}
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
              {/* Session desk: where am I, how far through, where next */}
              <div className="sp-card flex flex-col gap-3 px-3.5 py-2.5 sm:px-4 md:flex-row md:items-center md:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span
                    data-testid="practice-question-counter"
                    className="shrink-0 text-[15px] font-extrabold tabular-nums text-[var(--sp-ink)]"
                  >
                    {filteredRows.length > 0 ? (
                      <>
                        Question {(effectiveQuestionIndex + 1).toLocaleString()}
                        <span className="font-semibold text-[var(--sp-muted)]">
                          {' '}
                          of {filteredRows.length.toLocaleString()}
                        </span>
                      </>
                    ) : (
                      'No matches'
                    )}
                  </span>

                  <div
                    role="progressbar"
                    aria-label="Questions attempted in this set"
                    aria-valuemin={0}
                    aria-valuemax={filteredRows.length}
                    aria-valuenow={attemptedInSet}
                    title={`${attemptedInSet.toLocaleString()} of ${filteredRows.length.toLocaleString()} attempted`}
                    className="sp-progress min-w-[60px] flex-1"
                  >
                    <div
                      className="sp-progress-fill"
                      style={{
                        width: `${Math.max(setProgressPct, attemptedInSet > 0 ? 4 : 0)}%`,
                      }}
                    />
                  </div>

                  <span className="hidden shrink-0 text-[12.5px] font-bold tabular-nums text-[var(--sp-muted)] sm:inline">
                    {attemptedInSet.toLocaleString()} done
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canNavigate}
                    onClick={handlePreviousQuestion}
                    aria-label="Previous question"
                    className={cn(
                      'sp-key sp-key--sm inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      canNavigate ? 'sp-key--neutral' : 'sp-key--idle'
                    )}
                  >
                    <ChevronRight
                      className="h-5 w-5 rotate-180"
                      strokeWidth={2.75}
                      aria-hidden="true"
                    />
                  </button>

                  <button
                    type="button"
                    disabled={!canNavigate}
                    onClick={handleRandomUnseen}
                    className={cn(
                      'sp-key sp-key--sm inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13.5px] font-bold',
                      canNavigate ? 'sp-key--neutral' : 'sp-key--idle'
                    )}
                  >
                    <RefreshCw
                      className="h-4 w-4 text-[var(--sp-accent)]"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                    <span className="hidden sm:inline">Random</span>
                  </button>

                  <button
                    type="button"
                    disabled={!canNavigate}
                    onClick={handleNextQuestion}
                    aria-label="Next question"
                    className={cn(
                      'sp-key sp-key--sm inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      canNavigate ? 'sp-key--neutral' : 'sp-key--idle'
                    )}
                  >
                    <ChevronRight
                      className="h-5 w-5"
                      strokeWidth={2.75}
                      aria-hidden="true"
                    />
                  </button>

                  <div className="relative min-w-0 flex-1 md:w-44 md:flex-initial xl:w-56">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--sp-muted)]"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={activeFilters.searchQuery ?? ''}
                      onChange={(event) =>
                        handleSearchChange(event.target.value)
                      }
                      placeholder="Search concepts"
                      aria-label="Filter questions by concept or ID"
                      className="h-10 w-full rounded-xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] pr-8 pl-9 text-[13.5px] font-medium text-[var(--sp-ink)] transition-colors placeholder:text-[var(--sp-muted)] focus:border-[var(--sp-accent)] focus:bg-[var(--sp-surface)] focus:outline-none"
                    />
                    {activeFilters.searchQuery && (
                      <button
                        type="button"
                        onClick={() => handleSearchChange('')}
                        aria-label="Clear concept filter"
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer rounded-md p-0.5 text-[var(--sp-muted)] hover:text-[var(--sp-ink)]"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Main practice question card or empty-filter direction */}
              {filteredRows.length === 0 ? (
                <div className="sp-card px-6 py-10 text-center">
                  <span
                    aria-hidden="true"
                    className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--sp-accent-tint)] text-[var(--sp-accent)] shadow-[0_3px_0_var(--sp-border)]"
                  >
                    <Search className="h-6 w-6" strokeWidth={2.5} />
                  </span>
                  <h2 className="text-[18px] font-extrabold text-[var(--sp-ink)]">
                    {activeFilters.status === 'saved'
                      ? 'No saved questions in this view yet'
                      : activeFilters.status === 'needs-review'
                        ? 'Nothing needs review in this filter'
                        : activeFilters.status === 'unseen'
                          ? "You've tried every question in this filter"
                          : 'No questions match these filters'}
                  </h2>
                  <p className="mx-auto mt-1.5 max-w-[46ch] text-[14.5px] text-[var(--sp-muted)]">
                    {activeFilters.status === 'saved'
                      ? 'Tap Save on any question to keep it here for revision.'
                      : activeFilters.status === 'needs-review'
                        ? 'Missed multiple-choice questions and written answers below 70% show up here automatically.'
                        : 'Broaden the topic, difficulty or status filters to keep practising.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleClearAllFilters}
                    className="sp-key sp-key--primary mt-5 inline-flex h-11 items-center justify-center rounded-2xl px-6 text-[15px] font-extrabold"
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
                    isBookmarked={isBookmarked}
                    onToggleBookmark={handleToggleBookmark}
                    existingAttempt={existingAttempt}
                    onRecordAttempt={handleRecordAttempt}
                    onNextQuestion={canNavigate ? handleNextQuestion : undefined}
                    onPreviousQuestion={
                      canNavigate ? handlePreviousQuestion : undefined
                    }
                    enableKeyboardShortcuts={
                      !formulaDrawerOpen && !mobileRailOpen
                    }
                  />
                </div>
              ) : (
                <div className="sp-card flex min-h-[300px] items-center justify-center p-8 text-[14.5px] font-semibold text-[var(--sp-muted)]">
                  <Loader2
                    className="mr-2 h-5 w-5 animate-spin text-[var(--sp-accent)]"
                    aria-hidden="true"
                  />
                  Loading question...
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
