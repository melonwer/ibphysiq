'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, X } from 'lucide-react';
import type {
  PublicSubtopicSummary,
  PublicTopicSummary,
  QuestionDifficulty,
  QuestionFilterCriteria,
  QuestionFormat,
  QuestionStatusFilter,
  SyllabusId,
  TopicMasteryStat,
} from '@/lib/sixthphysics-web/types';
import { cn } from '@/lib/utils';

export interface TopicRailProps {
  activeSyllabus: SyllabusId;
  topics: PublicTopicSummary[];
  filters: QuestionFilterCriteria;
  onChangeFilters: (next: QuestionFilterCriteria) => void;
  topicMastery?: Record<string, TopicMasteryStat>;
  totalQuestionCount?: number;
  filteredQuestionCount?: number;
  selectedTopicId?: string;
  selectedSubtopicId?: string;
  onSelectTopic?: (topicId?: string, subtopicId?: string) => void;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  hideMobileTrigger?: boolean;
  className?: string;
}

const FORMAT_OPTIONS: Array<{ value: QuestionFormat | 'all'; label: string }> =
  [
    { value: 'all', label: 'All' },
    { value: 'mcq', label: 'MCQ' },
    { value: 'structured', label: 'Structured' },
  ];

const DIFFICULTY_OPTIONS: Array<{
  value: QuestionDifficulty | 'all';
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'foundation', label: 'Foundation' },
  { value: 'standard', label: 'Standard' },
  { value: 'higher', label: 'Higher' },
];

const STATUS_OPTIONS: Array<{ value: QuestionStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unseen', label: 'Unseen' },
  { value: 'needs-review', label: 'Needs review' },
  { value: 'saved', label: 'Saved' },
];

export function formatCompactTopicCode(code: string): string {
  const trimmed = code.trim();
  if (/^Sections\s+9/i.test(trimmed)) {
    return 'Options';
  }
  const sectionMatch = trimmed.match(/^Section\s+(\d+)/i);
  if (sectionMatch) {
    return `Section ${sectionMatch[1]}`;
  }
  const acMatch = trimmed.match(/^(AC\d+)/i);
  if (acMatch) {
    return acMatch[1].toUpperCase();
  }
  return trimmed;
}

export function formatCompactTopicTitle(title: string): string {
  return title
    .replace(/\s*\(A-Level\s*\/\s*Year 13 only\)/i, '')
    .replace(/^Tools for Physics:\s*/i, '')
    .replace(/^Year 13 Optional Modules\s*\(([^)]+)\)/i, 'Optional modules')
    .trim();
}

export function resolveCountForLevel(
  item: Pick<PublicTopicSummary | PublicSubtopicSummary, 'questionCount' | 'countsByLevel'>,
  level?: string
): number {
  if (!level || level === 'all') {
    return item.questionCount;
  }
  const byLevel = item.countsByLevel?.[level];
  return typeof byLevel === 'number' ? byLevel : item.questionCount;
}

export function countActiveNonDefaultFilters(
  filters: QuestionFilterCriteria
): number {
  let count = 0;
  if (filters.format && filters.format !== 'all') count += 1;
  if (filters.difficulty && filters.difficulty !== 'all') count += 1;
  if (filters.status && filters.status !== 'all') count += 1;
  if (filters.topicId && filters.topicId !== 'all') count += 1;
  return count;
}

function getSyllabusRailHeading(syllabus: SyllabusId): string {
  if (syllabus === 'ib') return 'IB Physics topics';
  if (syllabus === 'alevel') return 'A-Level sections';
  return 'NCUK IFY modules';
}

export function TopicRail({
  activeSyllabus,
  topics,
  filters,
  onChangeFilters,
  topicMastery,
  totalQuestionCount,
  filteredQuestionCount,
  selectedTopicId,
  selectedSubtopicId,
  onSelectTopic,
  mobileOpen: controlledMobileOpen,
  onMobileOpenChange,
  hideMobileTrigger = false,
  className,
}: TopicRailProps) {
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);

  const isMobileOpen =
    controlledMobileOpen !== undefined
      ? controlledMobileOpen
      : internalMobileOpen;

  const setMobileOpen = useCallback(
    (next: boolean) => {
      setInternalMobileOpen(next);
      onMobileOpenChange?.(next);
    },
    [onMobileOpenChange]
  );

  useEffect(() => {
    if (!isMobileOpen || typeof window === 'undefined') {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileOpen, setMobileOpen]);

  const activeTopicId =
    selectedTopicId !== undefined ? selectedTopicId : (filters.topicId ?? 'all');
  const activeSubtopicId =
    selectedSubtopicId !== undefined
      ? selectedSubtopicId
      : (filters.subtopicId ?? 'all');

  const activeFormat = filters.format ?? 'all';
  const activeDifficulty = filters.difficulty ?? 'all';
  const activeStatus = filters.status ?? 'all';
  const activeLevel = filters.level;

  const computedTotalCount =
    typeof totalQuestionCount === 'number'
      ? totalQuestionCount
      : topics.reduce(
          (sum, topic) => sum + resolveCountForLevel(topic, activeLevel),
          0
        );

  const hasActiveFilters = countActiveNonDefaultFilters(filters) > 0;

  const handleSelectTopicAndSubtopic = useCallback(
    (topicId?: string, subtopicId?: string, closeOnMobile = false) => {
      const normalizedTopic = !topicId || topicId === 'all' ? 'all' : topicId;
      const normalizedSubtopic =
        !subtopicId || subtopicId === 'all' ? 'all' : subtopicId;

      onSelectTopic?.(
        normalizedTopic === 'all' ? undefined : normalizedTopic,
        normalizedSubtopic === 'all' ? undefined : normalizedSubtopic
      );

      onChangeFilters({
        ...filters,
        syllabus: activeSyllabus,
        topicId: normalizedTopic,
        subtopicId: normalizedSubtopic,
      });

      if (closeOnMobile) {
        setMobileOpen(false);
      }
    },
    [activeSyllabus, filters, onChangeFilters, onSelectTopic, setMobileOpen]
  );

  const handlePatchFilters = useCallback(
    (patch: Partial<QuestionFilterCriteria>) => {
      onChangeFilters({
        ...filters,
        syllabus: activeSyllabus,
        ...patch,
      });
    },
    [activeSyllabus, filters, onChangeFilters]
  );

  const handleResetFilters = useCallback(() => {
    onSelectTopic?.(undefined, undefined);
    onChangeFilters({
      syllabus: activeSyllabus,
      level: filters.level ?? 'all',
      topicId: 'all',
      subtopicId: 'all',
      format: 'all',
      difficulty: 'all',
      status: 'all',
    });
  }, [activeSyllabus, filters.level, onChangeFilters, onSelectTopic]);

  const selectedTopicObj = topics.find((t) => t.id === activeTopicId);
  const mobileTopicSummary = selectedTopicObj
    ? formatCompactTopicCode(selectedTopicObj.code)
    : 'All topics';
  const activeFilterBadgeCount = countActiveNonDefaultFilters(filters);

  const renderRailBody = (inMobileSheet: boolean) => (
    <div className="space-y-5">
      <section aria-label="Question filters" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-[var(--sp-ink)]">
            Filter questions
          </h2>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="cursor-pointer text-xs font-medium text-[var(--sp-accent)] hover:underline"
            >
              Reset
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          <div className="space-y-1">
            <span className="block text-xs font-medium text-[var(--sp-muted)]">
              Format
            </span>
            <div
              role="group"
              aria-label="Filter by question format"
              className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] p-0.5"
            >
              {FORMAT_OPTIONS.map((opt) => {
                const active = activeFormat === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handlePatchFilters({ format: opt.value })}
                    className={cn(
                      'cursor-pointer rounded-md px-2 py-1 text-xs transition-colors',
                      active
                        ? 'bg-[var(--sp-surface)] font-semibold text-[var(--sp-ink)] shadow-2xs'
                        : 'font-medium text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <span className="block text-xs font-medium text-[var(--sp-muted)]">
              Difficulty
            </span>
            <div
              role="group"
              aria-label="Filter by difficulty"
              className="flex flex-wrap gap-1"
            >
              {DIFFICULTY_OPTIONS.map((opt) => {
                const active = activeDifficulty === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      handlePatchFilters({ difficulty: opt.value })
                    }
                    className={cn(
                      'cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-[var(--sp-accent)]/45 bg-blue-500/10 font-semibold text-[var(--sp-ink)] dark:bg-blue-500/15'
                        : 'border-[var(--sp-border)] bg-[var(--sp-surface)] font-medium text-[var(--sp-muted)] hover:bg-[var(--sp-surface-subtle)] hover:text-[var(--sp-ink)]'
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <span className="block text-xs font-medium text-[var(--sp-muted)]">
              Status
            </span>
            <div
              role="group"
              aria-label="Filter by attempt status"
              className="flex flex-wrap gap-1"
            >
              {STATUS_OPTIONS.map((opt) => {
                const active = activeStatus === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handlePatchFilters({ status: opt.value })}
                    className={cn(
                      'cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors',
                      active
                        ? 'border-[var(--sp-accent)]/45 bg-blue-500/10 font-semibold text-[var(--sp-ink)] dark:bg-blue-500/15'
                        : 'border-[var(--sp-border)] bg-[var(--sp-surface)] font-medium text-[var(--sp-muted)] hover:bg-[var(--sp-surface-subtle)] hover:text-[var(--sp-ink)]'
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section
        aria-label={getSyllabusRailHeading(activeSyllabus)}
        className="space-y-2 border-t border-[var(--sp-border)] pt-4"
      >
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold text-[var(--sp-ink)]">
            {getSyllabusRailHeading(activeSyllabus)}
          </h2>
          {typeof filteredQuestionCount === 'number' && (
            <span className="font-mono text-[11px] tabular-nums text-[var(--sp-muted)]">
              {filteredQuestionCount.toLocaleString()} matching
            </span>
          )}
        </div>

        <nav className="space-y-1">
          <button
            type="button"
            aria-current={
              !activeTopicId || activeTopicId === 'all' ? 'true' : undefined
            }
            onClick={() =>
              handleSelectTopicAndSubtopic('all', 'all', inMobileSheet)
            }
            className={cn(
              'flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
              !activeTopicId || activeTopicId === 'all'
                ? 'border-[var(--sp-accent)]/40 bg-blue-500/[0.08] font-semibold text-[var(--sp-ink)] dark:bg-blue-500/[0.14]'
                : 'border-transparent text-[var(--sp-ink)] hover:bg-[var(--sp-surface-subtle)]'
            )}
          >
            <span>All topics</span>
            <span className="font-mono text-xs tabular-nums text-[var(--sp-muted)]">
              {computedTotalCount.toLocaleString()}
            </span>
          </button>

          {topics.map((topic) => {
            const isSelectedTopic = activeTopicId === topic.id;
            const topicCount = resolveCountForLevel(topic, activeLevel);
            const stat = topicMastery?.[topic.id];
            const masteryPct = stat
              ? Math.min(100, Math.max(0, Math.round(stat.coveragePercent)))
              : 0;
            const compactCode = formatCompactTopicCode(topic.code);
            const compactTitle = formatCompactTopicTitle(topic.title);

            return (
              <div key={topic.id} className="space-y-1">
                <button
                  type="button"
                  aria-current={
                    isSelectedTopic &&
                    (!activeSubtopicId || activeSubtopicId === 'all')
                      ? 'true'
                      : undefined
                  }
                  onClick={() =>
                    handleSelectTopicAndSubtopic(
                      isSelectedTopic &&
                        (!activeSubtopicId || activeSubtopicId === 'all')
                        ? 'all'
                        : topic.id,
                      'all',
                      inMobileSheet && topic.subtopics.length === 0
                    )
                  }
                  className={cn(
                    'group w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors',
                    isSelectedTopic
                      ? 'border-[var(--sp-accent)]/40 bg-blue-500/[0.08] dark:bg-blue-500/[0.14]'
                      : 'border-transparent hover:bg-[var(--sp-surface-subtle)]'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11.5px] font-semibold text-[var(--sp-accent)]">
                          {compactCode}
                        </span>
                        {topic.levelsCovered.length === 1 &&
                          (topic.levelsCovered[0] === 'HL' ||
                            topic.levelsCovered[0] === 'Y13') && (
                            <span className="rounded bg-[var(--sp-surface-subtle)] px-1 py-0.5 font-mono text-[10px] font-medium text-[var(--sp-muted)]">
                              {topic.levelsCovered[0]}
                            </span>
                          )}
                      </div>
                      <p
                        className={cn(
                          'mt-0.5 text-[13.5px] leading-snug text-[var(--sp-ink)]',
                          isSelectedTopic ? 'font-semibold' : 'font-medium'
                        )}
                      >
                        {compactTitle}
                      </p>
                    </div>

                    <span className="mt-0.5 shrink-0 font-mono text-xs tabular-nums text-[var(--sp-muted)]">
                      {topicCount.toLocaleString()}
                    </span>
                  </div>

                  <div
                    className="mt-2 flex items-center gap-2"
                    aria-label={`${compactCode} mastery ${masteryPct}%`}
                  >
                    <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-[var(--sp-border)]">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          masteryPct >= 75
                            ? 'bg-emerald-600 dark:bg-emerald-400'
                            : 'bg-[var(--sp-accent)]'
                        )}
                        style={{ width: `${masteryPct}%` }}
                      />
                    </div>
                    {stat && stat.attemptedCount > 0 && (
                      <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-[var(--sp-muted)]">
                        {masteryPct}%
                      </span>
                    )}
                  </div>
                </button>

                {isSelectedTopic && topic.subtopics.length > 0 && (
                  <div className="ml-3 space-y-0.5 border-l border-[var(--sp-border)] pl-2.5">
                    {topic.subtopics.map((sub) => {
                      const isSubActive = activeSubtopicId === sub.id;
                      const subCount = resolveCountForLevel(sub, activeLevel);

                      return (
                        <button
                          key={sub.id}
                          type="button"
                          aria-current={isSubActive ? 'true' : undefined}
                          onClick={() =>
                            handleSelectTopicAndSubtopic(
                              topic.id,
                              isSubActive ? 'all' : sub.id,
                              inMobileSheet
                            )
                          }
                          className={cn(
                            'flex w-full cursor-pointer items-start justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] leading-snug transition-colors',
                            isSubActive
                              ? 'bg-[var(--sp-surface-subtle)] font-semibold text-[var(--sp-ink)]'
                              : 'text-[var(--sp-muted)] hover:bg-[var(--sp-surface-subtle)]/70 hover:text-[var(--sp-ink)]'
                          )}
                        >
                          <span className="min-w-0">
                            {sub.code ? `${sub.code} ` : ''}
                            {sub.title}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] tabular-nums">
                            {subCount.toLocaleString()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </section>
    </div>
  );

  const mobileDrawerNode =
    isMobileOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Topics and filters"
            className="fixed inset-0 z-50 flex lg:hidden"
          >
            <div
              className="fixed inset-0 bg-black/55 backdrop-blur-[1px]"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative z-10 flex h-full w-full max-w-[330px] flex-col border-r border-[var(--sp-border)] bg-[var(--sp-surface)] text-[var(--sp-ink)]">
              <div className="flex items-center justify-between border-b border-[var(--sp-border)] px-4 py-3.5">
                <span className="text-sm font-semibold text-[var(--sp-ink)]">
                  Topics &amp; filters
                </span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close topics and filters"
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--sp-ink)]"
                >
                  <span>Done</span>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                {renderRailBody(true)}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {!hideMobileTrigger && (
        <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--sp-border)] bg-[var(--sp-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--sp-ink)]"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Topics &amp; filters</span>
            <span className="rounded bg-[var(--sp-surface-subtle)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[var(--sp-muted)]">
              {mobileTopicSummary}
            </span>
            {activeFilterBadgeCount > 0 && (
              <span className="rounded-full bg-[var(--sp-accent)] px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-white">
                {activeFilterBadgeCount}
              </span>
            )}
          </button>

          {typeof filteredQuestionCount === 'number' && (
            <span className="font-mono text-xs tabular-nums text-[var(--sp-muted)]">
              {filteredQuestionCount.toLocaleString()} questions
            </span>
          )}
        </div>
      )}

      <aside
        aria-label="Syllabus topics and filters"
        className={cn(
          'hidden w-[284px] shrink-0 lg:block',
          className
        )}
      >
        <div className="sticky top-[72px] max-h-[calc(100vh-88px)] overflow-y-auto rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] p-4">
          {renderRailBody(false)}
        </div>
      </aside>

      {mobileDrawerNode}
    </>
  );
}
