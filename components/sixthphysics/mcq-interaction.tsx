'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  RotateCcw,
  X,
} from 'lucide-react';
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

const COMPACT_OPTION_MAX_CHARS = 42;

/** Visible length of an option once LaTeX markup is stripped away. */
export function measureOptionVisibleLength(text: string): number {
  return text
    .replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[${}^_\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/** Short numeric answers read best as a punchy 2x2 grid of tiles. */
export function shouldUseCompactOptionGrid(
  options: ReadonlyArray<Pick<McqOptionItem, 'text'>>
): boolean {
  return (
    options.length === 4 &&
    options.every(
      (option) =>
        measureOptionVisibleLength(option.text) < COMPACT_OPTION_MAX_CHARS
    )
  );
}

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

  const useCompactGrid = shouldUseCompactOptionGrid(options);
  const showRevealedFeedback = mode !== 'mock-live' && effectiveChecked;
  const hasPickedOption =
    activeSelectedIndex !== null && activeSelectedIndex >= 0;
  const pickedOption = hasPickedOption ? options[activeSelectedIndex] : null;
  const pickedIsCorrect = hasPickedOption && activeSelectedIndex === correctIndex;
  const correctLetter =
    options[correctIndex]?.label || OPTION_LETTERS[correctIndex] || '';

  return (
    <div className={cn('mt-4 space-y-4', className)}>
      <div
        role="radiogroup"
        aria-label="Answer options"
        data-layout={useCompactGrid ? 'grid' : 'stack'}
        className={cn(
          'grid gap-3',
          useCompactGrid ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
        )}
      >
        {options.map((option, index) => {
          const letter =
            option.label || OPTION_LETTERS[index] || String(index + 1);
          const isSelected = activeSelectedIndex === index;
          const isOptionCorrect = index === correctIndex;
          const isChosenDistractor =
            showRevealedFeedback && isSelected && !isOptionCorrect;
          const isRevealedCorrect = showRevealedFeedback && isOptionCorrect;
          const isMutedDistractor =
            showRevealedFeedback && !isSelected && !isOptionCorrect;
          const isInteractive =
            mode === 'mock-live' || (mode === 'practice' && !effectiveChecked);

          return (
            <button
              key={`${item.id}-opt-${letter}-${index}`}
              type="button"
              role="radio"
              data-sp-mcq-option={letter}
              aria-checked={isSelected}
              disabled={!isInteractive}
              onClick={() => handleSelect(index)}
              className={cn(
                'sp-key flex w-full items-center gap-3.5 rounded-2xl text-left',
                useCompactGrid
                  ? 'min-h-[62px] px-4 py-2.5'
                  : 'min-h-[60px] px-4 py-3.5',
                !showRevealedFeedback &&
                  (isSelected ? 'sp-key--selected' : 'sp-key--neutral'),
                isRevealedCorrect && 'sp-key--correct',
                mode === 'practice' &&
                  isRevealedCorrect &&
                  isSelected &&
                  'sp-anim-bump',
                isChosenDistractor && 'sp-key--wrong',
                isChosenDistractor && mode === 'practice' && 'sp-anim-shake',
                isMutedDistractor && 'sp-key--settled'
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'sp-keycap',
                  !showRevealedFeedback && isSelected && 'sp-keycap--selected',
                  isRevealedCorrect && 'sp-keycap--correct',
                  isChosenDistractor && 'sp-keycap--wrong'
                )}
              >
                {isRevealedCorrect ? (
                  <Check className="h-4 w-4" strokeWidth={3.25} />
                ) : isChosenDistractor ? (
                  <X className="h-4 w-4" strokeWidth={3.25} />
                ) : (
                  letter
                )}
              </span>

              <MathText
                text={option.text}
                className={cn(
                  'min-w-0 flex-1 text-[var(--sp-ink)]',
                  useCompactGrid
                    ? 'text-[16.5px] leading-snug font-semibold'
                    : 'max-w-[68ch] text-[15.5px] leading-[1.55] font-medium'
                )}
              />

              {isRevealedCorrect && (
                <span className="sp-chip sp-chip--success shrink-0">
                  {isSelected ? 'Your answer' : 'Correct answer'}
                </span>
              )}

              {isChosenDistractor && (
                <span className="sp-chip sp-chip--danger shrink-0">
                  Your choice
                </span>
              )}
            </button>
          );
        })}
      </div>

      {showRevealedFeedback && hasPickedOption && (
        <div
          role="status"
          className={cn(
            'sp-banner sp-anim-pop flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
            pickedIsCorrect ? 'sp-banner--success' : 'sp-banner--warn'
          )}
        >
          <div className="flex min-w-0 items-start gap-3.5">
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white',
                pickedIsCorrect
                  ? 'bg-[#059669] shadow-[0_3px_0_#047857]'
                  : 'bg-[var(--sp-warn)] shadow-[0_3px_0_var(--sp-warn-lip)]'
              )}
            >
              {pickedIsCorrect ? (
                <Check className="h-5 w-5" strokeWidth={3.25} />
              ) : (
                <Lightbulb className="h-5 w-5 text-[#451a03]" strokeWidth={2.5} />
              )}
            </span>

            <div className="min-w-0 space-y-1">
              <p
                className={cn(
                  'text-[17px] leading-tight font-extrabold',
                  pickedIsCorrect
                    ? 'text-[var(--sp-success-ink)]'
                    : 'text-[var(--sp-warn-ink)]'
                )}
              >
                {pickedIsCorrect
                  ? 'Spot on!'
                  : `Not quite. The answer is ${correctLetter}.`}
              </p>
              {pickedIsCorrect ? (
                <p className="text-[14px] leading-snug text-[var(--sp-ink)]/80">
                  +{totalMarks} {totalMarks === 1 ? 'mark' : 'marks'}. Check
                  the worked solution to lock in the method.
                </p>
              ) : pickedOption?.distractorRationale ? (
                <p className="text-[14.5px] leading-[1.55] text-[var(--sp-ink)]">
                  <span className="font-bold">Common trap: </span>
                  <MathText
                    text={pickedOption.distractorRationale}
                    className="text-[14.5px] leading-[1.55]"
                  />
                </p>
              ) : (
                <p className="text-[14px] leading-snug text-[var(--sp-ink)]/80">
                  Compare your working with the worked solution below.
                </p>
              )}
            </div>
          </div>

          {mode === 'practice' && (
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={handleRetry}
                className="sp-key sp-key--neutral sp-key--sm inline-flex h-11 items-center gap-1.5 rounded-xl px-3.5 text-[14px] font-bold"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                <span>Try again</span>
              </button>
              {onNextQuestion && (
                <button
                  type="button"
                  onClick={onNextQuestion}
                  className={cn(
                    'sp-key inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-5 text-[15px] font-extrabold sm:flex-initial',
                    pickedIsCorrect ? 'sp-key--success' : 'sp-key--primary'
                  )}
                >
                  Next question
                  <ChevronRight strokeWidth={3} className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {mode === 'practice' && !effectiveChecked && (
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
            disabled={!hasPickedOption}
            onClick={handleCheck}
            className={cn(
              'sp-key inline-flex h-12 min-w-[11rem] flex-1 items-center justify-center rounded-2xl px-7 text-[16px] font-extrabold sm:flex-initial',
              hasPickedOption ? 'sp-key--primary' : 'sp-key--idle'
            )}
          >
            Check answer
          </button>
        </div>
      )}

      {mode === 'mock-review' && activeSelectedIndex === null && (
        <p className="sp-chip sp-chip--warn">
          No option was selected during the timed paper.
        </p>
      )}

      {mode !== 'mock-live' &&
        effectiveChecked &&
        (item.workedSolution || item.markScheme.length > 0) && (
          <div className="sp-well overflow-hidden">
            <button
              type="button"
              aria-expanded={isSolutionOpen}
              onClick={toggleSolution}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-left text-[15px] font-bold text-[var(--sp-ink)] transition-colors hover:bg-[var(--sp-track)]/60 sm:px-5"
            >
              <span className="inline-flex items-center gap-2.5">
                <BookOpen
                  className="h-[18px] w-[18px] text-[var(--sp-accent)]"
                  aria-hidden="true"
                />
                Worked solution &amp; mark scheme
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'h-5 w-5 shrink-0 text-[var(--sp-muted)] transition-transform duration-150',
                  isSolutionOpen && 'rotate-180'
                )}
              />
            </button>

            {isSolutionOpen && (
              <div className="space-y-4 border-t-2 border-[var(--sp-border)] bg-[var(--sp-surface)] px-4 py-4 sm:px-5">
                {item.workedSolution && (
                  <MathText
                    text={item.workedSolution}
                    block
                    className="max-w-[72ch] text-[15.5px] leading-[1.7] text-[var(--sp-ink)]"
                  />
                )}

                {item.markScheme.length > 0 && (
                  <ul className="space-y-2">
                    {item.markScheme.map((point, idx) => (
                      <li
                        key={`${item.id}-ms-${idx}-${point.code}`}
                        className="flex items-start justify-between gap-3 rounded-xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-3 py-2.5 text-[14.5px] leading-[1.55]"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--sp-accent)] px-1.5 text-[12.5px] font-extrabold text-white shadow-[0_2px_0_var(--sp-accent-lip)]">
                            {point.code}
                          </span>
                          <MathText
                            text={point.criterion}
                            className="max-w-[68ch] pt-0.5 text-[var(--sp-ink)]"
                          />
                        </div>
                        <span className="shrink-0 pt-1 text-[13px] font-semibold tabular-nums text-[var(--sp-muted)]">
                          {point.marks} {point.marks === 1 ? 'mark' : 'marks'}
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
