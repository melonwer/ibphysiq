'use client';

import React, { useCallback } from 'react';
import { Bookmark, ChevronRight } from 'lucide-react';
import { MathText } from '@/components/sixthphysics/math-text';
import {
  McqInteraction,
  type McqCheckResult,
} from '@/components/sixthphysics/mcq-interaction';
import {
  StructuredInteraction,
  type StructuredSelfMarkResult,
} from '@/components/sixthphysics/structured-interaction';
import { SvgFigurePlate } from '@/components/sixthphysics/svg-figure-plate';
import {
  ALEVEL_PHYSICS_SYLLABUS,
  IB_PHYSICS_SYLLABUS,
  NCUK_PHYSICS_SYLLABUS,
} from '@/lib/constants/syllabi';
import type {
  MockQuestionResponse,
  PublicBankItem,
  PublicTopicSummary,
  QuestionAttemptInput,
  QuestionAttemptRecord,
  QuestionCardMode,
  QuestionDifficulty,
  SyllabusId,
  SyllabusTag,
} from '@/lib/sixthphysics-web/types';
import { cn } from '@/lib/utils';

export interface QuestionCardProps {
  item: PublicBankItem;
  mode?: QuestionCardMode;
  activeSyllabus?: SyllabusId;
  topics?: PublicTopicSummary[];
  questionNumber?: number;
  totalQuestions?: number;
  isBookmarked?: boolean;
  onToggleBookmark?: (questionId: string) => void;
  existingAttempt?: QuestionAttemptRecord | null;
  onRecordAttempt?: (attempt: QuestionAttemptInput) => void;
  onNextQuestion?: () => void;
  onPreviousQuestion?: () => void;
  mockResponse?: MockQuestionResponse;
  selectedOptionIndex?: number | null;
  defaultSelectedOptionIndex?: number | null;
  defaultChecked?: boolean;
  defaultRevealed?: boolean;
  onSelectOption?: (optionIndex: number) => void;
  partNotes?: Record<string, string>;
  onChangePartNotes?: (partNotes: Record<string, string>) => void;
  checkedCriterionKeys?: string[];
  onChangeSelfMark?: (update: {
    checkedCriterionKeys: string[];
    earnedMarks: number;
    totalMarks: number;
  }) => void;
  enableKeyboardShortcuts?: boolean;
  className?: string;
}

interface CatalogBreadcrumbEntry {
  topicLabel: string;
  subtopicMap: Map<string, string>;
}

const CATALOG_LOOKUP: Map<string, CatalogBreadcrumbEntry> = (() => {
  const map = new Map<string, CatalogBreadcrumbEntry>();
  const catalogues = [
    IB_PHYSICS_SYLLABUS,
    ALEVEL_PHYSICS_SYLLABUS,
    NCUK_PHYSICS_SYLLABUS,
  ];

  for (const catalogue of catalogues) {
    for (const topic of catalogue.topics) {
      const cleanCode = topic.code
        .replace(/\s*\([^)]*\)\s*/g, '')
        .replace(/\s*\/\s*LO\d+/i, '')
        .trim();
      const cleanTitle = topic.title
        .replace(/\s*\(A-Level\s*\/\s*Year 13 only\)/i, '')
        .replace(/^Tools for Physics:\s*/i, '')
        .replace(/^Year 13 Optional Modules\s*\(([^)]+)\)/i, 'Optional modules')
        .trim();
      const topicLabel = cleanCode ? `${cleanCode}: ${cleanTitle}` : cleanTitle;
      const subMap = new Map<string, string>();
      for (const sub of topic.subtopics) {
        subMap.set(
          sub.id,
          sub.code ? `${sub.code} ${sub.title}` : sub.title
        );
      }
      map.set(topic.id, {
        topicLabel,
        subtopicMap: subMap,
      });
    }
  }

  return map;
})();

export function formatSyllabusBadgeLabel(tag: SyllabusTag): string {
  if (tag.syllabus === 'ib') {
    return `IB ${tag.level}`;
  }
  if (tag.syllabus === 'alevel') {
    return `A-Level ${tag.level}`;
  }
  if (tag.level === 'IFY') {
    return 'NCUK IFY';
  }
  return `NCUK ${tag.level}`;
}

export function formatDifficultyLabel(difficulty: QuestionDifficulty): string {
  if (difficulty === 'foundation') return 'Foundation';
  if (difficulty === 'higher') return 'Higher';
  return 'Standard';
}

export function resolveQuestionBreadcrumb(
  item: Pick<PublicBankItem, 'syllabi'>,
  activeSyllabus?: SyllabusId,
  topics?: PublicTopicSummary[]
): { topicLabel: string; subtopicLabel?: string } {
  const primaryTag =
    (activeSyllabus
      ? item.syllabi.find((tag) => tag.syllabus === activeSyllabus)
      : undefined) ?? item.syllabi[0];

  if (!primaryTag) {
    return { topicLabel: 'Physics practice' };
  }

  if (topics && topics.length > 0) {
    const matchedTopic = topics.find((t) => t.id === primaryTag.topicId);
    if (matchedTopic) {
      const cleanCode = matchedTopic.code
        .replace(/\s*\([^)]*\)\s*/g, '')
        .replace(/\s*\/\s*LO\d+/i, '')
        .trim();
      const cleanTitle = matchedTopic.title
        .replace(/\s*\(A-Level\s*\/\s*Year 13 only\)/i, '')
        .replace(/^Tools for Physics:\s*/i, '')
        .replace(/^Year 13 Optional Modules\s*\(([^)]+)\)/i, 'Optional modules')
        .trim();
      const topicLabel = cleanCode ? `${cleanCode}: ${cleanTitle}` : cleanTitle;
      const matchedSub = primaryTag.subtopicId
        ? matchedTopic.subtopics.find((s) => s.id === primaryTag.subtopicId)
        : undefined;
      return {
        topicLabel,
        subtopicLabel: matchedSub
          ? matchedSub.code
            ? `${matchedSub.code} ${matchedSub.title}`
            : matchedSub.title
          : undefined,
      };
    }
  }

  const catalogHit = CATALOG_LOOKUP.get(primaryTag.topicId);
  if (catalogHit) {
    return {
      topicLabel: catalogHit.topicLabel,
      subtopicLabel: primaryTag.subtopicId
        ? catalogHit.subtopicMap.get(primaryTag.subtopicId)
        : undefined,
    };
  }

  return {
    topicLabel: primaryTag.topicId,
    subtopicLabel: primaryTag.subtopicId,
  };
}

function getUniqueSyllabusBadges(
  syllabi: SyllabusTag[],
  activeSyllabus?: SyllabusId
): Array<{ key: string; label: string; isActiveSyllabus: boolean }> {
  const seen = new Set<string>();
  const ordered = [...syllabi].sort((a, b) => {
    const aActive = a.syllabus === activeSyllabus ? 0 : 1;
    const bActive = b.syllabus === activeSyllabus ? 0 : 1;
    return aActive - bActive;
  });

  const badges: Array<{
    key: string;
    label: string;
    isActiveSyllabus: boolean;
  }> = [];

  for (const tag of ordered) {
    const label = formatSyllabusBadgeLabel(tag);
    if (seen.has(label)) continue;
    seen.add(label);
    badges.push({
      key: `${tag.syllabus}-${tag.level}`,
      label,
      isActiveSyllabus: Boolean(
        activeSyllabus && tag.syllabus === activeSyllabus
      ),
    });
  }

  return badges;
}

export function QuestionCard({
  item,
  mode = 'practice',
  activeSyllabus,
  topics,
  questionNumber,
  totalQuestions,
  isBookmarked = false,
  onToggleBookmark,
  existingAttempt,
  onRecordAttempt,
  onNextQuestion,
  mockResponse,
  selectedOptionIndex,
  defaultSelectedOptionIndex,
  defaultChecked = false,
  defaultRevealed = false,
  onSelectOption,
  partNotes,
  onChangePartNotes,
  checkedCriterionKeys,
  onChangeSelfMark,
  enableKeyboardShortcuts = true,
  className,
}: QuestionCardProps) {
  const breadcrumb = resolveQuestionBreadcrumb(item, activeSyllabus, topics);
  const syllabusBadges = getUniqueSyllabusBadges(item.syllabi, activeSyllabus);
  const formatLabel = item.format === 'mcq' ? 'MCQ' : 'Structured';
  const difficultyLabel = formatDifficultyLabel(item.difficulty);

  const effectiveSelectedOption =
    selectedOptionIndex !== undefined
      ? selectedOptionIndex
      : mockResponse?.selectedOptionIndex !== undefined
        ? mockResponse.selectedOptionIndex
        : mode !== 'practice'
          ? null
          : undefined;

  const effectivePartNotes = partNotes ?? mockResponse?.partNotes;
  const effectiveCheckedCriteria =
    checkedCriterionKeys ?? mockResponse?.checkedCriterionKeys;

  const handleMcqCheck = useCallback(
    (result: McqCheckResult) => {
      onRecordAttempt?.({
        questionId: item.id,
        format: 'mcq',
        earnedMarks: result.earnedMarks,
        totalMarks: result.totalMarks,
        selectedOptionIndex: result.selectedOptionIndex,
        isCorrect: result.isCorrect,
      });
    },
    [item.id, onRecordAttempt]
  );

  const handleStructuredSelfMark = useCallback(
    (result: StructuredSelfMarkResult) => {
      onRecordAttempt?.({
        questionId: item.id,
        format: 'structured',
        earnedMarks: result.earnedMarks,
        totalMarks: result.totalMarks,
        isCorrect: result.isCorrect,
        checkedCriterionKeys: result.checkedCriterionKeys,
        partNotes: result.partNotes,
      });
    },
    [item.id, onRecordAttempt]
  );

  return (
    <article
      data-question-id={item.id}
      data-question-mode={mode}
      className={cn(
        'rounded-2xl border border-[var(--sp-border)] bg-[var(--sp-surface)] text-[var(--sp-ink)]',
        className
      )}
    >
      <header className="border-b border-[var(--sp-border)] px-5 py-4 sm:px-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[13px] leading-snug text-[var(--sp-muted)]">
              {typeof questionNumber === 'number' && (
                <>
                  <span className="font-mono font-medium tabular-nums text-[var(--sp-ink)]">
                    {typeof totalQuestions === 'number'
                      ? `Q${questionNumber.toLocaleString()} of ${totalQuestions.toLocaleString()}`
                      : `Q${questionNumber.toLocaleString()}`}
                  </span>
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 opacity-65"
                    aria-hidden="true"
                  />
                </>
              )}
              <span className="font-medium text-[var(--sp-ink)]/90">
                {breadcrumb.topicLabel}
              </span>
              {breadcrumb.subtopicLabel && (
                <>
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 opacity-65"
                    aria-hidden="true"
                  />
                  <span className="truncate">{breadcrumb.subtopicLabel}</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {syllabusBadges.map((badge) => (
                <span
                  key={badge.key}
                  className={cn(
                    'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                    badge.isActiveSyllabus
                      ? 'border-[var(--sp-accent)]/40 bg-blue-500/[0.08] text-[var(--sp-ink)] dark:bg-blue-500/[0.15]'
                      : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-muted)]'
                  )}
                >
                  {badge.label}
                </span>
              ))}

              <span className="inline-flex items-center rounded-md border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--sp-ink)]">
                {formatLabel}
              </span>

              <span
                className={cn(
                  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
                  item.difficulty === 'higher'
                    ? 'border-amber-500/35 bg-amber-500/[0.08] text-amber-900 dark:text-amber-300'
                    : item.difficulty === 'foundation'
                      ? 'border-emerald-600/30 bg-emerald-500/[0.07] text-emerald-800 dark:text-emerald-300'
                      : 'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-muted)]'
                )}
              >
                {difficultyLabel}
              </span>

              {mode === 'practice' && existingAttempt && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs tabular-nums',
                    existingAttempt.isCorrect
                      ? 'border-emerald-600/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                      : 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-300'
                  )}
                >
                  Last: {existingAttempt.earnedMarks}/
                  {existingAttempt.totalMarks}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onToggleBookmark && (
              <button
                type="button"
                aria-pressed={isBookmarked}
                aria-label={isBookmarked ? 'Remove bookmark' : 'Save question'}
                onClick={() => onToggleBookmark(item.id)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                  isBookmarked
                    ? 'border-[var(--sp-accent)]/45 bg-blue-500/10 text-[var(--sp-accent)]'
                    : 'border-[var(--sp-border)] bg-[var(--sp-surface)] text-[var(--sp-muted)] hover:bg-[var(--sp-surface-subtle)] hover:text-[var(--sp-ink)]'
                )}
              >
                <Bookmark
                  className={cn('h-3.5 w-3.5', isBookmarked && 'fill-current')}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">
                  {isBookmarked ? 'Saved' : 'Save'}
                </span>
              </button>
            )}

            <span
              data-testid="question-marks-badge"
              className="inline-flex items-center rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-2.5 py-1.5 font-mono text-[13px] font-medium tabular-nums text-[var(--sp-ink)]"
            >
              [{item.totalMarks} {item.totalMarks === 1 ? 'mark' : 'marks'}]
            </span>
          </div>
        </div>
      </header>

      <div className="px-5 py-6 sm:px-7">
        <MathText
          text={item.stem}
          block
          className="max-w-[74ch] text-[16.5px] leading-[1.68] text-[var(--sp-ink)]"
        />

        {item.svgMarkup && item.svgMarkup.trim().length > 0 && (
          <SvgFigurePlate
            svgMarkup={item.svgMarkup}
            questionId={item.id}
            className="my-5"
          />
        )}

        {item.format === 'mcq' ? (
          <McqInteraction
            key={`${item.id}-${mode}`}
            item={item}
            mode={mode}
            selectedOptionIndex={effectiveSelectedOption}
            defaultSelectedOptionIndex={defaultSelectedOptionIndex}
            defaultChecked={defaultChecked}
            enableKeyboardShortcuts={enableKeyboardShortcuts}
            onSelectOption={onSelectOption}
            onCheckAnswer={handleMcqCheck}
            onNextQuestion={onNextQuestion}
          />
        ) : (
          <StructuredInteraction
            key={`${item.id}-${mode}`}
            item={item}
            mode={mode}
            partNotes={effectivePartNotes}
            onChangePartNotes={onChangePartNotes}
            defaultRevealed={defaultRevealed}
            checkedCriterionKeys={effectiveCheckedCriteria}
            onChangeSelfMark={onChangeSelfMark}
            onRecordSelfMark={handleStructuredSelfMark}
            onNextQuestion={onNextQuestion}
          />
        )}
      </div>
    </article>
  );
}
