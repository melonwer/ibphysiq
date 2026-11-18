'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Check, ChevronDown, RotateCcw } from 'lucide-react';
import { MathText } from '@/components/sixthphysics/math-text';
import type {
  MarkSchemePoint,
  PublicBankItem,
  QuestionCardMode,
  StructuredQuestionPart,
} from '@/lib/sixthphysics-web/types';
import { cn } from '@/lib/utils';

export interface StructuredSelfMarkResult {
  earnedMarks: number;
  totalMarks: number;
  isCorrect: boolean;
  checkedCriterionKeys: string[];
  partNotes: Record<string, string>;
}

export interface StructuredInteractionProps {
  item: PublicBankItem;
  mode?: QuestionCardMode;
  partNotes?: Record<string, string>;
  defaultPartNotes?: Record<string, string>;
  onChangePartNotes?: (partNotes: Record<string, string>) => void;
  isRevealed?: boolean;
  defaultRevealed?: boolean;
  checkedCriterionKeys?: string[];
  defaultCheckedCriterionKeys?: string[];
  onChangeSelfMark?: (update: {
    checkedCriterionKeys: string[];
    earnedMarks: number;
    totalMarks: number;
  }) => void;
  onRecordSelfMark?: (result: StructuredSelfMarkResult) => void;
  onNextQuestion?: () => void;
  showScratchpad?: boolean;
  className?: string;
}

export function getMarkSchemeCriterionKey(
  point: MarkSchemePoint,
  index: number
): string {
  return `${index}:${point.partId ?? 'q'}:${point.code}`;
}

export function calculateRubricTally(
  markScheme: MarkSchemePoint[],
  checkedCriterionKeys: Iterable<string>,
  itemTotalMarks?: number
): {
  earnedMarks: number;
  totalMarks: number;
  isCorrect: boolean;
} {
  const checkedSet = new Set(checkedCriterionKeys);
  const schemeTotal = markScheme.reduce(
    (sum, pt) => sum + (pt.marks > 0 ? pt.marks : 1),
    0
  );
  const totalMarks =
    typeof itemTotalMarks === 'number' && itemTotalMarks > 0
      ? itemTotalMarks
      : schemeTotal;

  let rawEarned = 0;
  markScheme.forEach((pt, idx) => {
    const key = getMarkSchemeCriterionKey(pt, idx);
    if (checkedSet.has(key)) {
      rawEarned += pt.marks > 0 ? pt.marks : 1;
    }
  });

  const earnedMarks = Math.min(totalMarks, Math.max(0, rawEarned));
  const isCorrect = totalMarks > 0 && earnedMarks / totalMarks >= 0.7;

  return {
    earnedMarks,
    totalMarks,
    isCorrect,
  };
}

function getCriterionBadgeStyle(code: string): string {
  const upper = code.toUpperCase();
  if (upper.startsWith('M')) {
    return 'border-blue-500/35 bg-blue-500/10 text-blue-800 dark:border-blue-400/35 dark:bg-blue-500/15 dark:text-blue-300';
  }
  if (upper.startsWith('A')) {
    return 'border-emerald-600/35 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-300';
  }
  return 'border-violet-500/35 bg-violet-500/10 text-violet-800 dark:border-violet-400/35 dark:bg-violet-500/15 dark:text-violet-300';
}

interface InternalStructuredState {
  itemId: string;
  revealed: boolean;
  partNotes: Record<string, string>;
  checkedKeys: string[];
  workedSolutionOpen: boolean;
  recordedZeroExplicitly: boolean;
}

function createInitialStructuredState(
  itemId: string,
  defaultRevealed: boolean | undefined,
  defaultPartNotes: Record<string, string> | undefined,
  defaultCheckedKeys: string[] | undefined
): InternalStructuredState {
  return {
    itemId,
    revealed: Boolean(defaultRevealed),
    partNotes: defaultPartNotes ? { ...defaultPartNotes } : {},
    checkedKeys: defaultCheckedKeys ? [...defaultCheckedKeys] : [],
    workedSolutionOpen: false,
    recordedZeroExplicitly: false,
  };
}

export function StructuredInteraction({
  item,
  mode = 'practice',
  partNotes: controlledPartNotes,
  defaultPartNotes,
  onChangePartNotes,
  isRevealed: controlledRevealed,
  defaultRevealed = false,
  checkedCriterionKeys: controlledCheckedKeys,
  defaultCheckedCriterionKeys,
  onChangeSelfMark,
  onRecordSelfMark,
  onNextQuestion,
  showScratchpad = true,
  className,
}: StructuredInteractionProps) {
  const parts: StructuredQuestionPart[] = useMemo(
    () => item.parts ?? [],
    [item.parts]
  );
  const markScheme: MarkSchemePoint[] = useMemo(
    () => item.markScheme ?? [],
    [item.markScheme]
  );

  const [internalState, setInternalState] = useState<InternalStructuredState>(
    () =>
      createInitialStructuredState(
        item.id,
        defaultRevealed,
        controlledPartNotes ?? defaultPartNotes,
        controlledCheckedKeys ?? defaultCheckedCriterionKeys
      )
  );

  const currentState =
    internalState.itemId === item.id
      ? internalState
      : createInitialStructuredState(
          item.id,
          defaultRevealed,
          controlledPartNotes ?? defaultPartNotes,
          controlledCheckedKeys ?? defaultCheckedCriterionKeys
        );

  if (internalState.itemId !== item.id) {
    setInternalState(currentState);
  }

  const activePartNotes = controlledPartNotes ?? currentState.partNotes;
  const activeCheckedKeys = controlledCheckedKeys ?? currentState.checkedKeys;

  const effectiveRevealed =
    mode === 'mock-review'
      ? true
      : mode === 'mock-live'
        ? false
        : controlledRevealed !== undefined
          ? controlledRevealed
          : currentState.revealed;

  const tally = calculateRubricTally(
    markScheme,
    activeCheckedKeys,
    item.totalMarks
  );

  const handleNoteChange = useCallback(
    (partId: string, value: string) => {
      const nextNotes = {
        ...activePartNotes,
        [partId]: value,
      };
      setInternalState((prev) => {
        const base =
          prev.itemId === item.id
            ? prev
            : createInitialStructuredState(
                item.id,
                defaultRevealed,
                defaultPartNotes,
                defaultCheckedCriterionKeys
              );
        return {
          ...base,
          partNotes: nextNotes,
        };
      });
      onChangePartNotes?.(nextNotes);
    },
    [
      activePartNotes,
      item.id,
      defaultRevealed,
      defaultPartNotes,
      defaultCheckedCriterionKeys,
      onChangePartNotes,
    ]
  );

  const commitCheckedKeys = useCallback(
    (nextKeys: string[], explicitZero = false) => {
      const nextTally = calculateRubricTally(
        markScheme,
        nextKeys,
        item.totalMarks
      );

      setInternalState((prev) => {
        const base =
          prev.itemId === item.id
            ? prev
            : createInitialStructuredState(
                item.id,
                true,
                activePartNotes,
                nextKeys
              );
        return {
          ...base,
          revealed: true,
          checkedKeys: nextKeys,
          recordedZeroExplicitly: explicitZero,
        };
      });

      onChangeSelfMark?.({
        checkedCriterionKeys: nextKeys,
        earnedMarks: nextTally.earnedMarks,
        totalMarks: nextTally.totalMarks,
      });

      onRecordSelfMark?.({
        earnedMarks: nextTally.earnedMarks,
        totalMarks: nextTally.totalMarks,
        isCorrect: nextTally.isCorrect,
        checkedCriterionKeys: nextKeys,
        partNotes: activePartNotes,
      });
    },
    [
      markScheme,
      item.totalMarks,
      item.id,
      activePartNotes,
      onChangeSelfMark,
      onRecordSelfMark,
    ]
  );

  const handleToggleCriterion = useCallback(
    (key: string) => {
      const set = new Set(activeCheckedKeys);
      if (set.has(key)) {
        set.delete(key);
      } else {
        set.add(key);
      }
      commitCheckedKeys(Array.from(set), false);
    },
    [activeCheckedKeys, commitCheckedKeys]
  );

  const handleAwardAll = useCallback(() => {
    const allKeys = markScheme.map((pt, idx) =>
      getMarkSchemeCriterionKey(pt, idx)
    );
    commitCheckedKeys(allKeys, false);
  }, [markScheme, commitCheckedKeys]);

  const handleClearOrRecordZero = useCallback(() => {
    commitCheckedKeys([], true);
  }, [commitCheckedKeys]);

  const handleReveal = useCallback(() => {
    if (mode !== 'practice') return;
    setInternalState((prev) => {
      const base =
        prev.itemId === item.id
          ? prev
          : createInitialStructuredState(
              item.id,
              false,
              activePartNotes,
              activeCheckedKeys
            );
      return {
        ...base,
        revealed: true,
      };
    });
  }, [mode, item.id, activePartNotes, activeCheckedKeys]);

  const handleResetPractice = useCallback(() => {
    if (mode !== 'practice') return;
    setInternalState({
      itemId: item.id,
      revealed: false,
      partNotes: {},
      checkedKeys: [],
      workedSolutionOpen: false,
      recordedZeroExplicitly: false,
    });
  }, [mode, item.id]);

  const toggleWorkedSolution = useCallback(() => {
    setInternalState((prev) => {
      const base =
        prev.itemId === item.id
          ? prev
          : createInitialStructuredState(
              item.id,
              effectiveRevealed,
              activePartNotes,
              activeCheckedKeys
            );
      return {
        ...base,
        workedSolutionOpen: !base.workedSolutionOpen,
      };
    });
  }, [item.id, effectiveRevealed, activePartNotes, activeCheckedKeys]);

  const checkedSet = new Set(activeCheckedKeys);

  return (
    <div className={cn('mt-5 space-y-6', className)}>
      {parts.length > 0 && (
        <div className="divide-y divide-[var(--sp-border)] border-t border-[var(--sp-border)]">
          {parts.map((part) => {
            const noteValue = activePartNotes[part.partId] ?? '';
            const isReadOnlyScratchpad = mode === 'mock-review';

            return (
              <div
                key={`${item.id}-part-${part.partId}`}
                className="space-y-3 py-4 first:pt-4 last:pb-1"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 shrink-0 font-mono text-[14px] font-semibold text-[var(--sp-ink)]">
                      ({part.partId})
                    </span>
                    <MathText
                      text={part.prompt}
                      className="max-w-[70ch] text-[16px] leading-[1.66] text-[var(--sp-ink)]"
                    />
                  </div>

                  <span className="mt-0.5 shrink-0 font-mono text-[13px] tabular-nums text-[var(--sp-muted)]">
                    [{part.marks} {part.marks === 1 ? 'mark' : 'marks'}]
                  </span>
                </div>

                {showScratchpad &&
                  (mode !== 'mock-review' || noteValue.trim().length > 0) && (
                    <div className="pl-0 sm:pl-8">
                      <label
                        htmlFor={`sp-scratchpad-${item.id}-${part.partId}`}
                        className="sr-only"
                      >
                        Working for part ({part.partId})
                      </label>
                      <textarea
                        id={`sp-scratchpad-${item.id}-${part.partId}`}
                        rows={2}
                        readOnly={isReadOnlyScratchpad}
                        value={noteValue}
                        onChange={(event) =>
                          handleNoteChange(part.partId, event.target.value)
                        }
                        placeholder="Jot your working or value before marking..."
                        className={cn(
                          'w-full rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)]/75 px-3.5 py-2.5 text-[14.5px] leading-[1.55] text-[var(--sp-ink)] placeholder:text-[var(--sp-muted)] transition-colors',
                          isReadOnlyScratchpad
                            ? 'cursor-default opacity-90'
                            : 'hover:border-[var(--sp-muted)]/45 focus:bg-[var(--sp-surface)]'
                        )}
                      />
                    </div>
                  )}

                {effectiveRevealed && (
                  <div className="pl-0 sm:pl-8">
                    <div className="rounded-lg border border-emerald-600/30 bg-emerald-500/[0.06] px-3.5 py-2.5 dark:border-emerald-400/25 dark:bg-emerald-500/[0.09]">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                          Verified answer:
                        </span>
                        <MathText
                          text={part.expectedAnswer}
                          className="font-medium text-[14.5px] text-[var(--sp-ink)]"
                        />
                      </div>

                      {part.workingSteps && part.workingSteps.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-emerald-600/15 pt-2 text-[13.5px] leading-[1.55] text-[var(--sp-ink)]/90 dark:border-emerald-400/15">
                          {part.workingSteps.map((step, stepIdx) => (
                            <li key={`${part.partId}-step-${stepIdx}`}>
                              <MathText text={step} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {mode === 'practice' && !effectiveRevealed && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={handleReveal}
            className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[var(--sp-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-95"
          >
            Mark my answer
          </button>
          <span className="hidden text-xs text-[var(--sp-muted)] sm:inline">
            Reveals verified answers and interactive examiner rubric
          </span>
        </div>
      )}

      {effectiveRevealed && markScheme.length > 0 && (
        <div className="rounded-xl border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)]/60">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sp-border)] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--sp-ink)]">
                Examiner mark scheme
              </h3>
              <p className="text-xs text-[var(--sp-muted)]">
                Tick each mark-scheme point earned in your working
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="rubric-score-pill"
                className={cn(
                  'inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-xs font-semibold tabular-nums',
                  tally.earnedMarks === tally.totalMarks && tally.totalMarks > 0
                    ? 'border-emerald-600/40 bg-emerald-500/15 text-emerald-800 dark:border-emerald-400/40 dark:text-emerald-300'
                    : tally.earnedMarks > 0 ||
                        currentState.recordedZeroExplicitly
                      ? 'border-[var(--sp-accent)]/40 bg-blue-500/10 text-[var(--sp-ink)]'
                      : 'border-[var(--sp-border)] bg-[var(--sp-surface)] text-[var(--sp-ink)]'
                )}
              >
                {tally.earnedMarks} / {tally.totalMarks}{' '}
                {tally.totalMarks === 1 ? 'mark' : 'marks'}
              </span>

              <button
                type="button"
                onClick={handleAwardAll}
                className="cursor-pointer rounded-md border border-[var(--sp-border)] bg-[var(--sp-surface)] px-2.5 py-1 text-xs font-medium text-[var(--sp-ink)] transition-colors hover:bg-[var(--sp-surface-subtle)]"
              >
                Award all
              </button>

              <button
                type="button"
                onClick={handleClearOrRecordZero}
                className="cursor-pointer rounded-md border border-[var(--sp-border)] bg-[var(--sp-surface)] px-2.5 py-1 text-xs font-medium text-[var(--sp-muted)] transition-colors hover:text-[var(--sp-ink)]"
              >
                Zero marks
              </button>
            </div>
          </div>

          <div
            role="group"
            aria-label="Examiner rubric criteria"
            className="divide-y divide-[var(--sp-border)]"
          >
            {markScheme.map((point, idx) => {
              const key = getMarkSchemeCriterionKey(point, idx);
              const isAwarded = checkedSet.has(key);
              const pointMarks = point.marks > 0 ? point.marks : 1;

              return (
                <button
                  key={key}
                  type="button"
                  role="checkbox"
                  aria-checked={isAwarded}
                  onClick={() => handleToggleCriterion(key)}
                  className={cn(
                    'flex w-full cursor-pointer items-start justify-between gap-3.5 px-4 py-3 text-left transition-colors',
                    isAwarded
                      ? 'bg-emerald-500/[0.07] dark:bg-emerald-500/[0.11]'
                      : 'bg-transparent hover:bg-[var(--sp-surface)]/70'
                  )}
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                        isAwarded
                          ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-slate-950'
                          : 'border-[var(--sp-border)] bg-[var(--sp-surface)]'
                      )}
                    >
                      {isAwarded && <Check className="h-3.5 w-3.5" />}
                    </span>

                    <span className="flex min-w-0 flex-wrap items-baseline gap-2">
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 font-mono text-[12px] font-semibold',
                          getCriterionBadgeStyle(point.code)
                        )}
                      >
                        {point.code}
                      </span>

                      {point.partId && (
                        <span className="shrink-0 font-mono text-xs text-[var(--sp-muted)]">
                          ({point.partId})
                        </span>
                      )}

                      <MathText
                        text={point.criterion}
                        className="max-w-[66ch] text-[14.5px] leading-[1.58] text-[var(--sp-ink)]"
                      />
                    </span>
                  </span>

                  <span
                    className={cn(
                      'mt-0.5 shrink-0 font-mono text-xs tabular-nums',
                      isAwarded
                        ? 'font-semibold text-emerald-700 dark:text-emerald-300'
                        : 'text-[var(--sp-muted)]'
                    )}
                  >
                    +{pointMarks} {pointMarks === 1 ? 'mark' : 'marks'}
                  </span>
                </button>
              );
            })}
          </div>

          {item.workedSolution && (
            <div className="border-t border-[var(--sp-border)]">
              <button
                type="button"
                aria-expanded={currentState.workedSolutionOpen}
                onClick={toggleWorkedSolution}
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left text-xs font-semibold text-[var(--sp-muted)] transition-colors hover:text-[var(--sp-ink)]"
              >
                <span>Full worked solution summary</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-transform duration-150',
                    currentState.workedSolutionOpen && 'rotate-180'
                  )}
                />
              </button>

              {currentState.workedSolutionOpen && (
                <div className="border-t border-[var(--sp-border)] bg-[var(--sp-surface)]/55 px-4 py-3">
                  <MathText
                    text={item.workedSolution}
                    block
                    className="max-w-[72ch] text-[14.5px] leading-[1.66] text-[var(--sp-ink)]"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'practice' && effectiveRevealed && (
        <div className="flex flex-wrap items-center gap-2.5">
          {onNextQuestion && (
            <button
              type="button"
              onClick={onNextQuestion}
              className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[var(--sp-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-95"
            >
              Next question
            </button>
          )}
          <button
            type="button"
            onClick={handleResetPractice}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface)] px-3 py-2 text-sm font-medium text-[var(--sp-ink)] transition-colors hover:bg-[var(--sp-surface-subtle)]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset working</span>
          </button>
        </div>
      )}
    </div>
  );
}
