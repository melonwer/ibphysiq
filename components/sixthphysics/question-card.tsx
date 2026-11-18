'use client';

import React, { useCallback } from 'react';
import { Bookmark, Check, RotateCcw } from 'lucide-react';
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
  if (difficulty === 'foundation') return 'Easy';
  if (difficulty === 'higher') return 'Hard';
  return 'Medium';
}

export function formatMarksLabel(marks: number): string {
  return `${marks} ${marks === 1 ? 'mark' : 'marks'}`;
}

const DIFFICULTY_DOT_CLASS: Record<QuestionDifficulty, string> = {
  foundation: 'bg-emerald-500',
  standard: 'bg-amber-500',
  higher: 'bg-rose-500',
};

const LEADING_CODE_PATTERN =
  /^(?:Section\s+\d+(?:\s*\([^)]*\))?|Theme\s+[A-E]|Tools|AC\d+(?:\.\d+)*|[A-E]\.\d+(?:\.\d+)*|T\.\d+(?:-T\.\d+)?|\d+(?:\.\d+)+(?:-\d+(?:\.\d+)+)?)\s*[:\s]\s*/i;

/**
 * Turns a syllabus heading like "3.6.1 Circular Motion, Simple Harmonic
 * Motion, Resonance and Damping" into a short human pill label such as
 * "Circular Motion & SHM". Spec codes never reach the student.
 */
export function formatFriendlyTopicLabel(rawLabel: string): string {
  let label = rawLabel.trim().replace(LEADING_CODE_PATTERN, '').trim();

  const colonIdx = label.indexOf(':');
  if (colonIdx >= 8) {
    label = label.slice(0, colonIdx);
  }

  label = label
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (label.length <= 30) {
    return label;
  }

  const abbreviated = label.replace(/Simple Harmonic Motion/gi, 'SHM');
  const segments = abbreviated
    .split(/,\s*|\s+and\s+|\s*&\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length >= 2) {
    const pair = `${segments[0]} & ${segments[1]}`;
    if (pair.length <= 34) {
      return pair;
    }
  }

  return segments[0] ?? abbreviated;
}

export function resolveFriendlyTopicLabel(
  item: Pick<PublicBankItem, 'syllabi'>,
  activeSyllabus?: SyllabusId,
  topics?: PublicTopicSummary[]
): { label: string; fullLabel: string } {
  const breadcrumb = resolveQuestionBreadcrumb(item, activeSyllabus, topics);
  const fullLabel = breadcrumb.subtopicLabel ?? breadcrumb.topicLabel;
  return {
    label: formatFriendlyTopicLabel(fullLabel),
    fullLabel: fullLabel.replace(LEADING_CODE_PATTERN, '').trim(),
  };
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
  const topicLabel = resolveFriendlyTopicLabel(item, activeSyllabus, topics);
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
      className={cn('sp-card text-[var(--sp-ink)]', className)}
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:items-center sm:px-7 sm:pt-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {typeof questionNumber === 'number' && (
            <span
              aria-label={
                typeof totalQuestions === 'number'
                  ? `Question ${questionNumber.toLocaleString()} of ${totalQuestions.toLocaleString()}`
                  : `Question ${questionNumber.toLocaleString()}`
              }
              className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-[var(--sp-ink)] px-2 text-[13px] font-extrabold tabular-nums text-[var(--sp-surface)]"
            >
              Q{questionNumber}
            </span>
          )}

          <span
            data-testid="question-topic-pill"
            title={topicLabel.fullLabel}
            className="sp-chip sp-chip--accent max-w-full min-w-0"
          >
            <span className="truncate">{topicLabel.label}</span>
          </span>

          <span data-testid="question-difficulty-pill" className="sp-chip">
            <span
              aria-hidden="true"
              className={cn('sp-dot', DIFFICULTY_DOT_CLASS[item.difficulty])}
            />
            {difficultyLabel}
          </span>

          {mode === 'practice' && existingAttempt && (
            <span
              title={`Last try ${existingAttempt.earnedMarks}/${existingAttempt.totalMarks}`}
              className={cn(
                'sp-chip tabular-nums',
                existingAttempt.isCorrect ? 'sp-chip--success' : 'sp-chip--warn'
              )}
            >
              {existingAttempt.isCorrect ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span className="sr-only sm:not-sr-only">
                Last try {existingAttempt.earnedMarks}/
                {existingAttempt.totalMarks}
              </span>
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            data-testid="question-marks-badge"
            className="sp-chip border-2 bg-[var(--sp-raised)] font-bold tabular-nums shadow-[0_2px_0_var(--sp-lip)]"
          >
            {formatMarksLabel(item.totalMarks)}
          </span>

          {onToggleBookmark && (
            <button
              type="button"
              aria-pressed={isBookmarked}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Save question'}
              onClick={() => onToggleBookmark(item.id)}
              className={cn(
                'sp-key sp-key--sm inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-bold sm:px-3',
                isBookmarked
                  ? 'sp-key--selected text-[var(--sp-accent-ink)]'
                  : 'sp-key--neutral text-[var(--sp-muted)]'
              )}
            >
              <Bookmark
                className={cn('h-4 w-4', isBookmarked && 'fill-current')}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">
                {isBookmarked ? 'Saved' : 'Save'}
              </span>
            </button>
          )}
        </div>
      </header>

      <div className="px-4 pt-3.5 pb-5 sm:px-7 sm:pb-6">
        <MathText
          text={item.stem}
          block
          className="max-w-[70ch] text-[16.5px] leading-[1.65] text-[var(--sp-ink)] sm:text-[17px]"
        />

        {item.svgMarkup && item.svgMarkup.trim().length > 0 && (
          <SvgFigurePlate
            svgMarkup={item.svgMarkup}
            questionId={item.id}
            className="my-4"
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
