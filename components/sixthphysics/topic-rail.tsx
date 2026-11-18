'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Filter, Grid } from 'lucide-react';
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
    { value: 'structured', label: 'Written' },
  ];

const DIFFICULTY_OPTIONS: Array<{
  value: QuestionDifficulty | 'all';
  label: string;
  dotClass?: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'foundation', label: 'Easy', dotClass: 'bg-emerald-500' },
  { value: 'standard', label: 'Medium', dotClass: 'bg-amber-500' },
  { value: 'higher', label: 'Hard', dotClass: 'bg-rose-500' },
];

/** Cheerful, distinct avatar colours so each topic is findable at a glance. */
const TOPIC_SWATCHES = [
  'bg-indigo-500 shadow-[0_2px_0_#3730a3]',
  'bg-emerald-500 shadow-[0_2px_0_#047857]',
  'bg-amber-500 shadow-[0_2px_0_#b45309]',
  'bg-rose-500 shadow-[0_2px_0_#be123c]',
  'bg-sky-500 shadow-[0_2px_0_#0369a1]',
  'bg-violet-500 shadow-[0_2px_0_#6d28d9]',
  'bg-teal-500 shadow-[0_2px_0_#0f766e]',
  'bg-orange-500 shadow-[0_2px_0_#c2410c]',
] as const;

export function getTopicGlyph(compactCode: string): string {
  const tokens = compactCode.trim().split(/\s+/);
  const last = tokens[tokens.length - 1] ?? '';
  if (/^AC\d+$/i.test(last)) return last.slice(2);
  if (last.length <= 2) return last.toUpperCase();
  return last.charAt(0).toUpperCase();
}

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

  const renderSegGroup = <T extends string>(
    label: string,
    ariaLabel: string,
    options: Array<{ value: T; label: string; dotClass?: string }>,
    activeValue: T,
    onPick: (value: T) => void,
    gridClass: string
  ) => (
    <div className="space-y-1.5">
      <span className="block text-[12.5px] font-bold text-[var(--sp-muted)]">
        {label}
      </span>
      <div
        role="group"
        aria-label={ariaLabel}
        className={cn('sp-seg grid w-full', gridClass)}
      >
        {options.map((opt) => {
          const active = activeValue === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onPick(opt.value)}
              className="sp-seg-item inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[12.5px] whitespace-nowrap"
            >
              {opt.dotClass && (
                <span
                  aria-hidden="true"
                  className={cn('sp-dot h-[7px] w-[7px]', opt.dotClass)}
                />
              )}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderRailBody = (inMobileSheet: boolean) => (
    <div className="space-y-5">
      <section aria-label="Question filters" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-extrabold text-[var(--sp-ink)]">
            Filter questions
          </h2>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="cursor-pointer rounded-lg px-2 py-1 text-[12.5px] font-bold text-[var(--sp-accent)] transition-colors hover:bg-[var(--sp-accent-tint)]"
            >
              Reset
            </button>
          )}
        </div>

        <div className="space-y-3">
          {renderSegGroup(
            'Format',
            'Filter by question format',
            FORMAT_OPTIONS,
            activeFormat,
            (value) => handlePatchFilters({ format: value }),
            'grid-cols-3'
          )}
          {renderSegGroup(
            'Difficulty',
            'Filter by difficulty',
            DIFFICULTY_OPTIONS,
            activeDifficulty,
            (value) => handlePatchFilters({ difficulty: value }),
            'grid-cols-4'
          )}
          {renderSegGroup(
            'Status',
            'Filter by attempt status',
            STATUS_OPTIONS,
            activeStatus,
            (value) => handlePatchFilters({ status: value }),
            'grid-cols-2'
          )}
        </div>
      </section>

      <section
        aria-label={getSyllabusRailHeading(activeSyllabus)}
        className="space-y-2.5 border-t-2 border-[var(--sp-border)] pt-4"
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-extrabold text-[var(--sp-ink)]">
            {getSyllabusRailHeading(activeSyllabus)}
          </h2>
          {typeof filteredQuestionCount === 'number' && (
            <span className="text-[12px] font-semibold tabular-nums text-[var(--sp-muted)]">
              {filteredQuestionCount.toLocaleString()} matching
            </span>
          )}
        </div>

        <nav className="space-y-1.5">
          {(() => {
            const isAllActive = !activeTopicId || activeTopicId === 'all';
            return (
              <button
                type="button"
                aria-current={isAllActive ? 'true' : undefined}
                onClick={() =>
                  handleSelectTopicAndSubtopic('all', 'all', inMobileSheet)
                }
                className={cn(
                  'flex w-full items-center justify-between gap-2.5 rounded-2xl px-2.5 py-2 text-left',
                  isAllActive
                    ? 'sp-key sp-key--sm sp-key--selected'
                    : 'cursor-pointer border-2 border-transparent transition-colors hover:border-[var(--sp-border)] hover:bg-[var(--sp-surface-subtle)]'
                )}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--sp-ink)] text-[var(--sp-surface)] shadow-[0_2px_0_var(--sp-lip)]"
                  >
                    <Grid className="h-4 w-4" />
                  </span>
                  <span className="text-[14px] font-bold text-[var(--sp-ink)]">
                    All topics
                  </span>
                </span>
                <span className="text-[12.5px] font-semibold tabular-nums text-[var(--sp-muted)]">
                  {computedTotalCount.toLocaleString()}
                </span>
              </button>
            );
          })()}

          {topics.map((topic, topicIndex) => {
            const isSelectedTopic = activeTopicId === topic.id;
            const topicCount = resolveCountForLevel(topic, activeLevel);
            const stat = topicMastery?.[topic.id];
            const masteryPct = stat
              ? Math.min(100, Math.max(0, Math.round(stat.coveragePercent)))
              : 0;
            const compactCode = formatCompactTopicCode(topic.code);
            const compactTitle = formatCompactTopicTitle(topic.title);
            const swatch =
              TOPIC_SWATCHES[topicIndex % TOPIC_SWATCHES.length] ??
              TOPIC_SWATCHES[0];
            const isTopicRowActive =
              isSelectedTopic &&
              (!activeSubtopicId || activeSubtopicId === 'all');

            return (
              <div key={topic.id} className="space-y-1.5">
                <button
                  type="button"
                  aria-current={isTopicRowActive ? 'true' : undefined}
                  onClick={() =>
                    handleSelectTopicAndSubtopic(
                      isTopicRowActive ? 'all' : topic.id,
                      'all',
                      inMobileSheet && topic.subtopics.length === 0
                    )
                  }
                  className={cn(
                    'group w-full rounded-2xl px-2.5 py-2.5 text-left',
                    isSelectedTopic
                      ? 'sp-key sp-key--sm sp-key--selected'
                      : 'cursor-pointer border-2 border-transparent transition-colors hover:border-[var(--sp-border)] hover:bg-[var(--sp-surface-subtle)]'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-extrabold text-white',
                        swatch
                      )}
                    >
                      {getTopicGlyph(compactCode)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="flex items-center gap-1.5 text-[11.5px] font-bold text-[var(--sp-muted)]">
                            {compactCode}
                            {topic.levelsCovered.length === 1 &&
                              (topic.levelsCovered[0] === 'HL' ||
                                topic.levelsCovered[0] === 'Y13') && (
                                <span className="rounded-md bg-[var(--sp-track)] px-1.5 py-px text-[10.5px] font-bold text-[var(--sp-ink)]">
                                  {topic.levelsCovered[0]}
                                </span>
                              )}
                          </span>
                          <p className="text-[13.5px] leading-snug font-bold text-[var(--sp-ink)]">
                            {compactTitle}
                          </p>
                        </div>
                        <span className="shrink-0 pt-0.5 text-[12px] font-semibold tabular-nums text-[var(--sp-muted)]">
                          {topicCount.toLocaleString()}
                        </span>
                      </div>

                      <div
                        className="mt-2 flex items-center gap-2"
                        aria-label={`${compactCode} mastery ${masteryPct}%`}
                      >
                        <div className="sp-progress sp-progress--sm flex-1">
                          <div
                            className="sp-progress-fill"
                            style={{
                              width: `${masteryPct}%`,
                              background:
                                masteryPct >= 75 ? '#10B981' : undefined,
                            }}
                          />
                        </div>
                        {stat && stat.attemptedCount > 0 && (
                          <span className="shrink-0 text-[11px] font-bold tabular-nums text-[var(--sp-muted)]">
                            {masteryPct}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                {isSelectedTopic && topic.subtopics.length > 0 && (
                  <div className="ml-[1.4rem] space-y-1 border-l-2 border-[var(--sp-border)] pl-3">
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
                            'flex w-full cursor-pointer items-start justify-between gap-2 rounded-xl border-2 px-2.5 py-1.5 text-left text-[13px] leading-snug transition-colors',
                            isSubActive
                              ? 'border-[var(--sp-accent)] bg-[var(--sp-accent-tint)] font-bold text-[var(--sp-accent-ink)]'
                              : 'border-transparent font-medium text-[var(--sp-muted)] hover:bg-[var(--sp-surface-subtle)] hover:text-[var(--sp-ink)]'
                          )}
                        >
                          <span className="min-w-0">
                            {sub.code ? `${sub.code} ` : ''}
                            {sub.title}
                          </span>
                          <span className="shrink-0 text-[11.5px] font-semibold tabular-nums">
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
              className="fixed inset-0 bg-slate-950/55 backdrop-blur-[2px]"
              onClick={() => setMobileOpen(false)}
            />
            <div className="relative z-10 flex h-full w-full max-w-[340px] flex-col border-r-2 border-[var(--sp-border)] bg-[var(--sp-surface)] text-[var(--sp-ink)]">
              <div className="flex items-center justify-between border-b-2 border-[var(--sp-border)] px-4 py-3">
                <span className="text-[16px] font-extrabold text-[var(--sp-ink)]">
                  Topics &amp; filters
                </span>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close topics and filters"
                  className="sp-key sp-key--primary sp-key--sm inline-flex h-9 items-center gap-1 rounded-xl px-3 text-[13px] font-extrabold"
                >
                  <span>Done</span>
                  <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
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
            className="sp-key sp-key--neutral sp-key--sm inline-flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-[13.5px] font-bold"
          >
            <Filter className="h-4 w-4 shrink-0 text-[var(--sp-accent)]" aria-hidden="true" />
            <span className="shrink-0">Topics &amp; filters</span>
            <span className="sp-chip sp-chip--accent min-w-0 truncate px-2 py-0 text-[12px]">
              {mobileTopicSummary}
            </span>
            {activeFilterBadgeCount > 0 && (
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--sp-accent)] px-1 text-[11px] font-extrabold tabular-nums text-white">
                {activeFilterBadgeCount}
              </span>
            )}
          </button>

          {typeof filteredQuestionCount === 'number' && (
            <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-[var(--sp-muted)]">
              {filteredQuestionCount.toLocaleString()} questions
            </span>
          )}
        </div>
      )}

      <aside
        aria-label="Syllabus topics and filters"
        className={cn(
          'sticky top-[calc(var(--sp-topnav-h,64px)_+_16px)] hidden w-[296px] shrink-0 self-start lg:block',
          className
        )}
      >
        <div className="sp-card max-h-[calc(100vh_-_var(--sp-topnav-h,64px)_-_36px)] overflow-y-auto p-4">
          {renderRailBody(false)}
        </div>
      </aside>

      {mobileDrawerNode}
    </>
  );
}
