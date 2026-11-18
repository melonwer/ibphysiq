'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, ChevronDown, RotateCcw } from 'lucide-react';
import { MathText } from '@/components/sixthphysics/math-text';
import type {
  McqOptionItem,
  PublicBankItem,
  QuestionCardMode,
} from '@/lib/sixthphysics-web/types';
import { cn } from '@/lib/utils';

export interface McqCheckResult {
  selectedOptionIndex: number;
  correctOptionIndex: number;
  isCorrect: boolean;
  earnedMarks: number;
  totalMarks: number;
}

export interface McqInteractionProps {
  item: PublicBankItem;
  mode?: QuestionCardMode;
  selectedOptionIndex?: number | null;
  defaultSelectedOptionIndex?: number | null;
  isChecked?: boolean;
  defaultChecked?: boolean;
  defaultSolutionOpen?: boolean;
  enableKeyboardShortcuts?: boolean;
  onSelectOption?: (optionIndex: number) => void;
  onCheckAnswer?: (result: McqCheckResult) => void;
  onNextQuestion?: () => void;
  className?: string;
}

export type McqShortcutAction =
  | { type: 'select'; optionIndex: number }
  | { type: 'check' }
  | { type: 'next' };

export interface McqShortcutInput {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  isTypingTarget?: boolean;
  mode: QuestionCardMode;
  optionCount: number;
  selectedOptionIndex: number | null;
  isChecked: boolean;
  hasNextQuestion: boolean;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

export function resolveCorrectOptionIndex(
  item: Pick<PublicBankItem, 'options' | 'correctOptionIndex'>
): number {
  if (
    typeof item.correctOptionIndex === 'number' &&
    item.correctOptionIndex >= 0
  ) {
    return item.correctOptionIndex;
  }
  const options = item.options ?? [];
  return options.findIndex((opt) => opt.isCorrect);
}

export function isInteractiveTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') {
    return false;
  }
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (name: string) => string | null;
    closest?: (selector: string) => unknown;
  };
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (el.isContentEditable) {
    return true;
  }
  if (
    typeof el.getAttribute === 'function' &&
    el.getAttribute('contenteditable') === 'true'
  ) {
    return true;
  }
  if (typeof el.closest === 'function' && el.closest('[role="dialog"]')) {
    return true;
  }
  return false;
}

export function resolveMcqShortcutAction(
  input: McqShortcutInput
): McqShortcutAction | null {
  if (input.metaKey || input.ctrlKey || input.altKey || input.isTypingTarget) {
    return null;
  }

  const {
    key,
    mode,
    optionCount,
    selectedOptionIndex,
    isChecked,
    hasNextQuestion,
  } = input;

  if (mode === 'mock-review') {
    return null;
  }

  const canSelect = mode === 'mock-live' || (mode === 'practice' && !isChecked);
  if (canSelect && optionCount > 0) {
    if (key >= '1' && key <= '9') {
      const idx = Number(key) - 1;
      if (idx >= 0 && idx < optionCount) {
        return { type: 'select', optionIndex: idx };
      }
    }
    const lower = key.toLowerCase();
    if (lower.length === 1 && lower >= 'a' && lower <= 'd') {
      const idx = lower.charCodeAt(0) - 'a'.charCodeAt(0);
      if (idx >= 0 && idx < optionCount) {
        return { type: 'select', optionIndex: idx };
      }
    }
  }

  if (mode === 'practice') {
    if (key === 'Enter' && !isChecked && selectedOptionIndex !== null) {
      return { type: 'check' };
    }
    if (
      (key === 'ArrowRight' || key === 'n' || key === 'N') &&
      isChecked &&
      hasNextQuestion
    ) {
      return { type: 'next' };
    }
  }

  return null;
}

interface InternalMcqState {
  itemId: string;
  selectedIndex: number | null;
  checked: boolean;
  solutionOpen: boolean;
}

function buildInitialState(
  itemId: string,
  defaultSelectedOptionIndex: number | null | undefined,
  defaultChecked: boolean | undefined,
  defaultSolutionOpen: boolean | undefined
): InternalMcqState {
  const checked = Boolean(defaultChecked);
  return {
    itemId,
    selectedIndex:
      typeof defaultSelectedOptionIndex === 'number'
        ? defaultSelectedOptionIndex
        : null,
    checked,
    solutionOpen:
      typeof defaultSolutionOpen === 'boolean' ? defaultSolutionOpen : checked,
  };
}

export function McqInteraction({
  item,
  mode = 'practice',
  selectedOptionIndex,
  defaultSelectedOptionIndex = null,
  isChecked: controlledChecked,
  defaultChecked = false,
  defaultSolutionOpen,
  enableKeyboardShortcuts = true,
  onSelectOption,
  onCheckAnswer,
  onNextQuestion,
  className,
}: McqInteractionProps) {
  const options: McqOptionItem[] = item.options ?? [];
  const correctIndex = resolveCorrectOptionIndex(item);
  const totalMarks = item.totalMarks > 0 ? item.totalMarks : 1;

  const [internalState, setInternalState] = useState<InternalMcqState>(() =>
    buildInitialState(
      item.id,
      selectedOptionIndex ?? defaultSelectedOptionIndex,
      defaultChecked,
      defaultSolutionOpen
    )
  );

  const currentState =
    internalState.itemId === item.id
      ? internalState
      : buildInitialState(
          item.id,
          selectedOptionIndex ?? defaultSelectedOptionIndex,
          defaultChecked,
          defaultSolutionOpen
        );

  if (internalState.itemId !== item.id) {
    setInternalState(currentState);
  }

  const activeSelectedIndex =
    selectedOptionIndex !== undefined
      ? selectedOptionIndex
      : currentState.selectedIndex;

  const effectiveChecked =
    mode === 'mock-review'
      ? true
      : mode === 'mock-live'
        ? false
        : controlledChecked !== undefined
          ? controlledChecked
          : currentState.checked;

  const isSolutionOpen =
    mode === 'mock-review'
      ? (defaultSolutionOpen ?? currentState.solutionOpen ?? true)
      : currentState.solutionOpen;

  const handleSelect = useCallback(
    (optionIndex: number) => {
      if (mode === 'mock-review' || (mode === 'practice' && effectiveChecked)) {
        return;
      }
      setInternalState((prev) => {
        const base =
          prev.itemId === item.id
            ? prev
            : buildInitialState(
                item.id,
                defaultSelectedOptionIndex,
                defaultChecked,
                defaultSolutionOpen
              );
        return {
          ...base,
          selectedIndex: optionIndex,
        };
      });
      onSelectOption?.(optionIndex);
    },
    [
      mode,
      effectiveChecked,
      item.id,
      defaultSelectedOptionIndex,
      defaultChecked,
      defaultSolutionOpen,
      onSelectOption,
    ]
  );

  const handleCheck = useCallback(() => {
    if (
      mode !== 'practice' ||
      effectiveChecked ||
      activeSelectedIndex === null ||
      activeSelectedIndex < 0
    ) {
      return;
    }
    const isCorrect = activeSelectedIndex === correctIndex;
    const earnedMarks = isCorrect ? totalMarks : 0;

    setInternalState((prev) => {
      const base =
        prev.itemId === item.id
          ? prev
          : buildInitialState(
              item.id,
              activeSelectedIndex,
              false,
              defaultSolutionOpen
            );
      return {
        ...base,
        selectedIndex: activeSelectedIndex,
        checked: true,
        solutionOpen: defaultSolutionOpen ?? true,
      };
    });

    onCheckAnswer?.({
      selectedOptionIndex: activeSelectedIndex,
      correctOptionIndex: correctIndex,
      isCorrect,
      earnedMarks,
      totalMarks,
    });
  }, [
    mode,
    effectiveChecked,
    activeSelectedIndex,
    correctIndex,
    totalMarks,
    item.id,
    defaultSolutionOpen,
    onCheckAnswer,
  ]);

  const handleRetry = useCallback(() => {
    if (mode !== 'practice') return;
    setInternalState({
      itemId: item.id,
      selectedIndex: null,
      checked: false,
      solutionOpen: false,
    });
  }, [mode, item.id]);

  const toggleSolution = useCallback(() => {
    setInternalState((prev) => {
      const base =
        prev.itemId === item.id
          ? prev
          : buildInitialState(
              item.id,
              activeSelectedIndex,
              effectiveChecked,
              defaultSolutionOpen
            );
      return {
        ...base,
        solutionOpen: !base.solutionOpen,
      };
    });
  }, [item.id, activeSelectedIndex, effectiveChecked, defaultSolutionOpen]);

  useEffect(() => {
    if (!enableKeyboardShortcuts || typeof window === 'undefined') {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const target = event.target;
      if (isInteractiveTypingTarget(target)) {
        return;
      }

      if (event.key === 'Enter' && target && typeof target === 'object') {
        const el = target as {
          tagName?: string;
          hasAttribute?: (attr: string) => boolean;
        };
        const tag =
          typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
        const isMcqOptionBtn =
          typeof el.hasAttribute === 'function' &&
          el.hasAttribute('data-sp-mcq-option');
        if ((tag === 'BUTTON' || tag === 'A') && !isMcqOptionBtn) {
          return;
        }
      }

      const action = resolveMcqShortcutAction({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        isTypingTarget: false,
        mode,
        optionCount: options.length,
        selectedOptionIndex: activeSelectedIndex,
        isChecked: effectiveChecked,
        hasNextQuestion: Boolean(onNextQuestion),
      });

      if (!action) return;

      event.preventDefault();
      if (action.type === 'select') {
        handleSelect(action.optionIndex);
      } else if (action.type === 'check') {
        handleCheck();
      } else if (action.type === 'next') {
        onNextQuestion?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    enableKeyboardShortcuts,
    mode,
    options.length,
    activeSelectedIndex,
    effectiveChecked,
    onNextQuestion,
    handleSelect,
    handleCheck,
  ]);

  if (options.length === 0) {
    return null;
  }

  return (
    <div className={cn('mt-5 space-y-4', className)}>
      <div
        role="radiogroup"
        aria-label="Answer options"
        className="space-y-2.5"
      >
        {options.map((option, index) => {
          const letter =
            option.label || OPTION_LETTERS[index] || String(index + 1);
          const isSelected = activeSelectedIndex === index;
          const isOptionCorrect = index === correctIndex;
          const showRevealedFeedback =
            mode !== 'mock-live' && effectiveChecked;
          const isChosenDistractor =
            showRevealedFeedback && isSelected && !isOptionCorrect;
          const isRevealedCorrect = showRevealedFeedback && isOptionCorrect;
          const isMutedDistractor =
            showRevealedFeedback && !isSelected && !isOptionCorrect;
          const isInteractive =
            mode === 'mock-live' || (mode === 'practice' && !effectiveChecked);

          return (
            <div
              key={`${item.id}-opt-${letter}-${index}`}
              className={cn(
                'rounded-xl border transition-colors',
                !showRevealedFeedback &&
                  !isSelected &&
                  'border-[var(--sp-border)] bg-[var(--sp-surface)] hover:border-[var(--sp-muted)]/50 hover:bg-[var(--sp-surface-subtle)]/55',
                !showRevealedFeedback &&
                  isSelected &&
                  'border-[var(--sp-accent)] bg-blue-600/[0.06] dark:bg-blue-500/[0.12]',
                isRevealedCorrect &&
                  'border-emerald-600/60 bg-emerald-500/[0.07] dark:border-emerald-400/50 dark:bg-emerald-500/[0.11]',
                isChosenDistractor &&
                  'border-rose-600/55 bg-rose-500/[0.05] dark:border-rose-400/50 dark:bg-rose-500/[0.09]',
                isMutedDistractor &&
                  'border-[var(--sp-border)] bg-[var(--sp-surface)] opacity-75'
              )}
            >
              <button
                type="button"
                role="radio"
                data-sp-mcq-option={letter}
                aria-checked={isSelected}
                disabled={!isInteractive}
                onClick={() => handleSelect(index)}
                className={cn(
                  'flex w-full items-start justify-between gap-3.5 px-4 py-3.5 text-left',
                  isInteractive
                    ? 'cursor-pointer active:translate-y-[0.5px]'
                    : 'cursor-default'
                )}
              >
                <span className="flex min-w-0 items-start gap-3.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-[13px] font-medium transition-colors',
                      !showRevealedFeedback &&
                        !isSelected &&
                        'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-ink)]',
                      !showRevealedFeedback &&
                        isSelected &&
                        'border-[var(--sp-accent)] bg-[var(--sp-accent)] text-white',
                      isRevealedCorrect &&
                        'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500 dark:text-slate-950',
                      isChosenDistractor &&
                        'border-rose-600 bg-rose-600 text-white dark:border-rose-500 dark:bg-rose-500 dark:text-white',
                      isMutedDistractor &&
                        'border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-muted)]'
                    )}
                  >
                    {letter}
                  </span>

                  <MathText
                    text={option.text}
                    className="max-w-[68ch] pt-0.5 text-[15.5px] leading-[1.6] text-[var(--sp-ink)]"
                  />
                </span>

                {isRevealedCorrect && (
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {isSelected ? 'Correct' : 'Correct answer'}
                    </span>
                  </span>
                )}

                {isChosenDistractor && (
                  <span className="mt-0.5 inline-flex shrink-0 items-center rounded-md bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-800 dark:text-rose-300">
                    Your choice
                  </span>
                )}
              </button>

              {isChosenDistractor && option.distractorRationale && (
                <div className="px-4 pb-3.5 pt-0.5">
                  <div className="rounded-lg border border-amber-500/35 bg-amber-500/[0.08] px-3.5 py-2.5 text-[14px] leading-[1.58] text-[var(--sp-ink)] dark:border-amber-400/30 dark:bg-amber-500/[0.12]">
                    <span className="font-semibold text-amber-900 dark:text-amber-300">
                      Common trap:{' '}
                    </span>
                    <MathText
                      text={option.distractorRationale}
                      className="text-[14px] leading-[1.58]"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {mode === 'practice' && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2.5">
            {!effectiveChecked ? (
              <button
                type="button"
                disabled={activeSelectedIndex === null}
                onClick={handleCheck}
                className={cn(
                  'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
                  activeSelectedIndex !== null
                    ? 'cursor-pointer bg-[var(--sp-accent)] text-white hover:opacity-95'
                    : 'cursor-not-allowed border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] text-[var(--sp-muted)]'
                )}
              >
                Check answer
              </button>
            ) : (
              <>
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
                  onClick={handleRetry}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface)] px-3 py-2 text-sm font-medium text-[var(--sp-ink)] transition-colors hover:bg-[var(--sp-surface-subtle)]"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Try again</span>
                </button>
              </>
            )}
          </div>

          <div className="hidden items-center gap-2 text-xs text-[var(--sp-muted)] sm:flex">
            {!effectiveChecked ? (
              <>
                <span>Select</span>
                <kbd className="rounded border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--sp-ink)]">
                  A–D
                </kbd>
                <span>or</span>
                <kbd className="rounded border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--sp-ink)]">
                  1–4
                </kbd>
                <span>then</span>
                <kbd className="rounded border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--sp-ink)]">
                  Enter
                </kbd>
              </>
            ) : onNextQuestion ? (
              <>
                <span>Next</span>
                <kbd className="rounded border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--sp-ink)]">
                  N
                </kbd>
                <span>or</span>
                <kbd className="rounded border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--sp-ink)]">
                  →
                </kbd>
              </>
            ) : null}
          </div>
        </div>
      )}

      {mode === 'mock-review' && activeSelectedIndex === null && (
        <p className="text-sm text-[var(--sp-muted)]">
          No option was selected during the timed paper.
        </p>
      )}

      {mode !== 'mock-live' &&
        effectiveChecked &&
        (item.workedSolution || item.markScheme.length > 0) && (
          <div className="rounded-xl border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)]/65">
            <button
              type="button"
              aria-expanded={isSolutionOpen}
              onClick={toggleSolution}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-[var(--sp-ink)] transition-colors hover:bg-[var(--sp-surface-subtle)]"
            >
              <span>Worked solution &amp; mark scheme</span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'h-4 w-4 shrink-0 text-[var(--sp-muted)] transition-transform duration-150',
                  isSolutionOpen && 'rotate-180'
                )}
              />
            </button>

            {isSolutionOpen && (
              <div className="space-y-3.5 border-t border-[var(--sp-border)] px-4 py-3.5">
                {item.workedSolution && (
                  <MathText
                    text={item.workedSolution}
                    block
                    className="max-w-[72ch] text-[15px] leading-[1.68] text-[var(--sp-ink)]"
                  />
                )}

                {item.markScheme.length > 0 && (
                  <ul className="space-y-2 border-t border-[var(--sp-border)] pt-3">
                    {item.markScheme.map((point, idx) => (
                      <li
                        key={`${item.id}-ms-${idx}-${point.code}`}
                        className="flex items-start justify-between gap-3 text-[14px] leading-[1.55]"
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span className="mt-0.5 inline-flex shrink-0 items-center rounded border border-[var(--sp-border)] bg-[var(--sp-surface)] px-1.5 py-0.5 font-mono text-[12px] font-medium text-[var(--sp-ink)]">
                            {point.code}
                          </span>
                          <MathText
                            text={point.criterion}
                            className="max-w-[68ch] text-[var(--sp-ink)]"
                          />
                        </div>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--sp-muted)]">
                          [{point.marks} {point.marks === 1 ? 'mark' : 'marks'}]
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
    </div>
  );
}
