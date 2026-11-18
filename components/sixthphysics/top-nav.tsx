'use client';

import React, { useEffect, useRef } from 'react';
import { BookOpen, FileText, Moon, Sun, Target, Zap } from 'lucide-react';
import type { SyllabusId, TopicMasteryStat } from '@/lib/sixthphysics-web/types';
import { cn } from '@/lib/utils';

export type WorkspaceMode = 'practice' | 'mock' | 'pdf';
export type ThemeMode = 'light' | 'dark';

export interface TopNavProps {
  activeSyllabus: SyllabusId;
  activeLevel: string;
  workspaceMode: WorkspaceMode;
  totalBankItems: number;
  overallMastery?: TopicMasteryStat;
  streakDays?: number;
  hasActiveMockSession?: boolean;
  theme: ThemeMode;
  onSelectSyllabus: (syllabus: SyllabusId) => void;
  onSelectLevel: (level: string) => void;
  onSelectWorkspaceMode: (mode: WorkspaceMode) => void;
  onOpenFormulaDrawer: () => void;
  onToggleTheme: () => void;
}

const SYLLABUS_OPTIONS: ReadonlyArray<{
  id: SyllabusId;
  label: string;
  shortLabel: string;
}> = [
  { id: 'ib', label: 'IB Physics', shortLabel: 'IB' },
  { id: 'alevel', label: 'A-Level', shortLabel: 'A-Level' },
  { id: 'ncuk', label: 'NCUK', shortLabel: 'NCUK' },
];

const LEVEL_OPTIONS_BY_SYLLABUS: Record<
  SyllabusId,
  ReadonlyArray<{ value: string; label: string }>
> = {
  ib: [
    { value: 'all', label: 'All' },
    { value: 'SL', label: 'SL' },
    { value: 'HL', label: 'HL' },
  ],
  alevel: [
    { value: 'all', label: 'All' },
    { value: 'Y12', label: 'Y12' },
    { value: 'Y13', label: 'Y13' },
  ],
  ncuk: [
    { value: 'all', label: 'All' },
    { value: 'IFY', label: 'IFY' },
    { value: 'IFY-S1', label: 'S1' },
    { value: 'IFY-S2', label: 'S2' },
  ],
};

function normalizeActiveLevel(syllabus: SyllabusId, rawLevel?: string): string {
  if (!rawLevel || rawLevel.toLowerCase() === 'all') {
    return 'all';
  }
  const trimmed = rawLevel.trim().toUpperCase();
  if (syllabus === 'ncuk') {
    if (trimmed === 'S1' || trimmed === 'IFY-S1') return 'IFY-S1';
    if (trimmed === 'S2' || trimmed === 'IFY-S2') return 'IFY-S2';
    if (trimmed === 'IFY') return 'IFY';
    return 'all';
  }
  const allowed = LEVEL_OPTIONS_BY_SYLLABUS[syllabus];
  const hit = allowed.find((opt) => opt.value.toUpperCase() === trimmed);
  return hit ? hit.value : 'all';
}

export function TopNav({
  activeSyllabus,
  activeLevel,
  workspaceMode,
  totalBankItems,
  overallMastery,
  streakDays = 0,
  hasActiveMockSession = false,
  theme,
  onSelectSyllabus,
  onSelectLevel,
  onSelectWorkspaceMode,
  onOpenFormulaDrawer,
  onToggleTheme,
}: TopNavProps) {
  const levelOptions = LEVEL_OPTIONS_BY_SYLLABUS[activeSyllabus];
  const resolvedLevel = normalizeActiveLevel(activeSyllabus, activeLevel);

  const masteryPct = overallMastery ? overallMastery.coveragePercent : 0;
  const attemptedCount = overallMastery ? overallMastery.attemptedCount : 0;

  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof document === 'undefined') {
      return;
    }

    const syncHeight = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height > 0) {
        document.documentElement.style.setProperty(
          '--sp-topnav-h',
          `${height}px`
        );
      }
    };

    syncHeight();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncHeight);
      return () => window.removeEventListener('resize', syncHeight);
    }

    const observer = new ResizeObserver(syncHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-30 border-b-2 border-[var(--sp-border)] bg-[var(--sp-surface)]/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-2 gap-y-2.5 px-3 py-2.5 sm:gap-x-3 sm:px-5 xl:h-16 xl:flex-nowrap xl:py-0">
        {/* Wordmark */}
        <div className="order-1 flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectWorkspaceMode('practice')}
            className="group inline-flex cursor-pointer items-center gap-2 rounded-xl py-1 text-left"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--sp-accent)] text-white shadow-[0_3px_0_var(--sp-accent-lip)] transition-transform duration-100 group-hover:-translate-y-px group-active:translate-y-0.5"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="h-5 w-5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="10" cy="10" r="6.5" strokeOpacity="0.45" />
                <path d="M4.2 10c1.8-3.4 3.9-3.4 5.8 0s4 3.4 5.8 0" />
              </svg>
            </span>
            <span className="hidden text-[17px] font-extrabold tracking-tight text-[var(--sp-ink)] min-[480px]:inline">
              SixthPhysics
            </span>
          </button>

          <span
            data-testid="bank-total-badge"
            title={`${totalBankItems.toLocaleString()} solver-verified physics questions`}
            className="hidden text-[12.5px] font-semibold tabular-nums text-[var(--sp-muted)] 2xl:inline"
          >
            {totalBankItems.toLocaleString()} questions
          </span>
        </div>

        {/* Syllabus switcher + level pills */}
        <div className="order-3 -mx-3 flex w-[calc(100%+1.5rem)] items-center gap-2 overflow-x-auto border-t-2 border-[var(--sp-border)] px-3 pt-2.5 sm:mx-0 sm:w-full sm:px-0 xl:order-2 xl:w-auto xl:overflow-visible xl:border-t-0 xl:pt-0">
          <div
            role="tablist"
            aria-label="Select physics syllabus"
            className="sp-seg shrink-0"
          >
            {SYLLABUS_OPTIONS.map((option) => {
              const isSelected = activeSyllabus === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => onSelectSyllabus(option.id)}
                  className="sp-seg-item px-3 py-1.5 text-[13.5px] whitespace-nowrap sm:px-3.5"
                >
                  <span className="sm:hidden">{option.shortLabel}</span>
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Filter syllabus level"
            className="sp-seg shrink-0"
          >
            {levelOptions.map((lvl) => {
              const active = resolvedLevel === lvl.value;
              return (
                <button
                  key={`${activeSyllabus}-${lvl.value}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectLevel(lvl.value)}
                  className="sp-seg-item px-2.5 py-1.5 text-[13px] whitespace-nowrap"
                >
                  {lvl.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mode switch, streak & mastery, formula sheet, theme */}
        <div className="order-2 flex shrink-0 items-center gap-1.5 sm:gap-2 xl:order-3">
          <div role="group" aria-label="Study mode" className="sp-seg">
            <button
              type="button"
              aria-pressed={workspaceMode === 'practice'}
              onClick={() => onSelectWorkspaceMode('practice')}
              className="sp-seg-item px-2.5 py-1.5 text-[13px] sm:px-3"
            >
              Practice
            </button>
            <button
              type="button"
              aria-pressed={workspaceMode === 'mock'}
              onClick={() => onSelectWorkspaceMode('mock')}
              className="sp-seg-item inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] whitespace-nowrap sm:px-3"
            >
              <span>
                Mock<span className="hidden sm:inline"> exam</span>
              </span>
              {hasActiveMockSession && (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full bg-[var(--sp-warn)]"
                />
              )}
            </button>
            <button
              type="button"
              aria-pressed={workspaceMode === 'pdf'}
              onClick={() => onSelectWorkspaceMode('pdf')}
              className="sp-seg-item inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[13px] whitespace-nowrap sm:px-3"
            >
              <FileText
                className="hidden h-3.5 w-3.5 text-[var(--sp-accent)] sm:inline"
                aria-hidden="true"
              />
              <span>
                PDF<span className="hidden sm:inline"> paper</span>
              </span>
            </button>
          </div>

          <div
            data-testid="mastery-streak-pill"
            title={
              attemptedCount > 0
                ? `${overallMastery?.masteredCount ?? 0} mastered across ${attemptedCount} attempted questions`
                : 'Answer questions to build syllabus mastery and a daily streak'
            }
            className="hidden h-9 items-center gap-3 rounded-xl border-2 border-[var(--sp-border)] bg-[var(--sp-raised)] px-3 text-[13.5px] font-extrabold tabular-nums shadow-[0_2px_0_var(--sp-lip)] md:inline-flex"
          >
            <span
              className={cn(
                'inline-flex items-center gap-1',
                streakDays > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-[var(--sp-muted)]'
              )}
            >
              <Zap
                className="h-4 w-4"
                fill={streakDays > 0 ? 'currentColor' : 'none'}
                aria-hidden="true"
              />
              {streakDays}
              <span className="sr-only">day streak</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[var(--sp-accent-ink)] dark:text-[var(--sp-accent-ink)]">
              <Target className="h-4 w-4" aria-hidden="true" />
              {masteryPct}%
              <span className="sr-only">mastered</span>
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenFormulaDrawer}
            aria-label="Formula sheet"
            className="sp-key sp-key--neutral sp-key--sm inline-flex h-9 w-9 items-center justify-center rounded-xl text-[13px] font-bold sm:w-auto sm:gap-1.5 sm:px-3"
          >
            <BookOpen
              className="h-4 w-4 shrink-0 text-[var(--sp-accent)]"
              aria-hidden="true"
            />
            <span className="sr-only sm:not-sr-only">Formula sheet</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            title={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            className="sp-key sp-key--neutral sp-key--sm inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--sp-muted)]"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
