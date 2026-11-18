'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
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
    return 'bg-[var(--sp-accent)] text-white shadow-[0_2px_0_var(--sp-accent-lip)]';
  }
  if (upper.startsWith('A')) {
    return 'bg-[#059669] text-white shadow-[0_2px_0_#047857]';
  }
  return 'bg-violet-600 text-white shadow-[0_2px_0_#4c1d95]';
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

  const scorePct =
    tally.totalMarks > 0
      ? Math.round((tally.earnedMarks / tally.totalMarks) * 100)
      : 0;
  const isFullMarks =
    tally.totalMarks > 0 && tally.earnedMarks === tally.totalMarks;
  const hasScored = tally.earnedMarks > 0 || currentState.recordedZeroExplicitly;

  return (
    <div className={cn('mt-5 space-y-5', className)}>
      {parts.length > 0 && (
        <div className="space-y-3">
          {parts.map((part) => {
            const noteValue = activePartNotes[part.partId] ?? '';
            const isReadOnlyScratchpad = mode === 'mock-review';

            return (
              <section
                key={`${item.id}-part-${part.partId}`}
                aria-label={`Part (${part.partId})`}
                className="space-y-3 rounded-2xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface)] p-3.5 sm:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="sp-keycap sp-keycap--selected w-auto min-w-[2.5rem] px-1.5 text-[13.5px]"
                    >
                      ({part.partId})
                    </span>
                    <MathText
                      text={part.prompt}
                      className="max-w-[70ch] pt-1 text-[16px] leading-[1.6] text-[var(--sp-ink)]"
                    />
                  </div>

                  <span className="sp-chip mt-1 shrink-0 font-bold tabular-nums">
                    {part.marks} {part.marks === 1 ? 'mark' : 'marks'}
                  </span>
                </div>

                {showScratchpad &&
                  (mode !== 'mock-review' || noteValue.trim().length > 0) && (
                    <div className="sm:pl-[3.25rem]">
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
                          'w-full resize-y rounded-xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-3.5 py-2.5 text-[15px] leading-[1.55] text-[var(--sp-ink)] transition-colors placeholder:text-[var(--sp-muted)]',
                          isReadOnlyScratchpad
                            ? 'cursor-default'
                            : 'hover:border-[var(--sp-lip)] focus:border-[var(--sp-accent)] focus:bg-[var(--sp-surface)] focus:outline-none'
                        )}
                      />
                    </div>
                  )}

                {effectiveRevealed && (
                  <div className="sm:pl-[3.25rem]">
                    <div className="rounded-xl border-2 border-[var(--sp-success)]/45 bg-[var(--sp-success-tint)] px-3.5 py-2.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--sp-success-ink)]">
                          <Check
                            className="h-3.5 w-3.5"
                            strokeWidth={3}
                            aria-hidden="true"
                          />
                          Verified answer:
                        </span>
                        <MathText
                          text={part.expectedAnswer}
                          className="text-[15px] font-semibold text-[var(--sp-ink)]"
                        />
                      </div>

                      {part.workingSteps && part.workingSteps.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t-2 border-[var(--sp-success)]/20 pt-2 text-[14px] leading-[1.55] text-[var(--sp-ink)]/90">
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
              </section>
            );
          })}
        </div>
      )}

      {mode === 'practice' && !effectiveRevealed && (
        <div className="flex items-center justify-between gap-3 border-t-2 border-[var(--sp-border)] pt-4">
          {onNextQuestion ? (
            <button
              type="button"
              onClick={onNextQuestion}
              className="sp-key sp-key--neutral sp-key--sm inline-flex h-12 items-center rounded-2xl px-5 text-[15px] font-bold text-[var(--sp-muted)]"
            >
              Skip
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={handleReveal}
            className="sp-key sp-key--primary inline-flex h-12 min-w-[11rem] flex-1 items-center justify-center rounded-2xl px-7 text-[16px] font-extrabold sm:flex-initial"
          >
            Mark my answer
          </button>
        </div>
      )}

      {effectiveRevealed && markScheme.length > 0 && (
        <div className="sp-well sp-anim-pop overflow-hidden">
          <div className="space-y-3 px-4 pt-4 pb-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[16px] font-extrabold text-[var(--sp-ink)]">
                  Examiner mark scheme
                </h3>
                <p className="text-[13.5px] text-[var(--sp-muted)]">
                  Tap each point your working earns.
                </p>
              </div>

              <span
                key={`score-${tally.earnedMarks}`}
                data-testid="rubric-score-pill"
                className={cn(
                  'sp-anim-bump inline-flex h-10 items-center rounded-xl border-2 px-3.5 text-[15px] font-extrabold tabular-nums',
                  isFullMarks
                    ? 'border-[#059669] bg-[#059669] text-white shadow-[0_3px_0_#047857]'
                    : hasScored
                      ? 'border-[var(--sp-accent)] bg-[var(--sp-accent-tint)] text-[var(--sp-accent-ink)] shadow-[0_3px_0_var(--sp-accent-lip)]'
                      : 'border-[var(--sp-border)] bg-[var(--sp-raised)] text-[var(--sp-ink)] shadow-[0_3px_0_var(--sp-lip)]'
                )}
              >
                {tally.earnedMarks} / {tally.totalMarks}{' '}
                {tally.totalMarks === 1 ? 'mark' : 'marks'}
              </span>
            </div>

            <div className="sp-progress sp-progress--sm" aria-hidden="true">
              <div
                className="sp-progress-fill"
                style={{
                  width: `${scorePct}%`,
                  background: isFullMarks ? '#059669' : undefined,
                }}
              />
            </div>
          </div>

          <div
            role="group"
            aria-label="Examiner rubric criteria"
            className="space-y-2.5 px-4 pb-4 sm:px-5"
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
                    'sp-key sp-key--sm flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left',
                    isAwarded ? 'sp-key--correct' : 'sp-key--neutral'
                  )}
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors',
                        isAwarded
                          ? 'border-[#059669] bg-[#059669] text-white'
                          : 'border-[var(--sp-lip)] bg-[var(--sp-surface)]'
                      )}
                    >
                      {isAwarded && (
                        <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                      )}
                    </span>

                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          'inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-[12.5px] font-extrabold',
                          getCriterionBadgeStyle(point.code)
                        )}
                      >
                        {point.code}
                      </span>

                      {point.partId && (
                        <span className="shrink-0 text-[13px] font-semibold text-[var(--sp-muted)]">
                          ({point.partId})
                        </span>
                      )}

                      <MathText
                        text={point.criterion}
                        className="max-w-[66ch] text-[14.5px] leading-[1.55] text-[var(--sp-ink)]"
                      />
                    </span>
                  </span>

                  <span
                    className={cn(
                      'mt-0.5 shrink-0 text-[13px] tabular-nums',
                      isAwarded
                        ? 'font-extrabold text-[var(--sp-success-ink)]'
                        : 'font-semibold text-[var(--sp-muted)]'
                    )}
                  >
                    +{pointMarks} {pointMarks === 1 ? 'mark' : 'marks'}
                  </span>
                </button>
              );
            })}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleAwardAll}
                className="sp-key sp-key--neutral sp-key--sm inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                Award all
              </button>
              <button
                type="button"
                onClick={handleClearOrRecordZero}
                className="sp-key sp-key--neutral sp-key--sm inline-flex h-9 items-center rounded-xl px-3 text-[13px] font-bold text-[var(--sp-muted)]"
              >
                Zero marks
              </button>
            </div>
          </div>

          {item.workedSolution && (
            <div className="border-t-2 border-[var(--sp-border)]">
              <button
                type="button"
                aria-expanded={currentState.workedSolutionOpen}
                onClick={toggleWorkedSolution}
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-[14.5px] font-bold text-[var(--sp-ink)] transition-colors hover:bg-[var(--sp-track)]/60 sm:px-5"
              >
                <span className="inline-flex items-center gap-2.5">
                  <BookOpen
                    className="h-[18px] w-[18px] text-[var(--sp-accent)]"
                    aria-hidden="true"
                  />
                  Full worked solution
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    'h-5 w-5 shrink-0 text-[var(--sp-muted)] transition-transform duration-150',
                    currentState.workedSolutionOpen && 'rotate-180'
                  )}
                />
              </button>

              {currentState.workedSolutionOpen && (
                <div className="border-t-2 border-[var(--sp-border)] bg-[var(--sp-surface)] px-4 py-4 sm:px-5">
                  <MathText
                    text={item.workedSolution}
                    block
                    className="max-w-[72ch] text-[15px] leading-[1.7] text-[var(--sp-ink)]"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'practice' && effectiveRevealed && (
        <div className="flex items-center justify-between gap-2.5 border-t-2 border-[var(--sp-border)] pt-4">
          <button
            type="button"
            onClick={handleResetPractice}
            className="sp-key sp-key--neutral sp-key--sm inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-[14px] font-bold"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Reset working</span>
          </button>
          {onNextQuestion && (
            <button
              type="button"
              onClick={onNextQuestion}
              className={cn(
                'sp-key inline-flex h-12 min-w-[11rem] items-center justify-center gap-1.5 rounded-2xl px-6 text-[16px] font-extrabold',
                tally.isCorrect ? 'sp-key--success' : 'sp-key--primary'
              )}
            >
              Next question
              <ChevronRight
                className="h-4 w-4"
                strokeWidth={3}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
