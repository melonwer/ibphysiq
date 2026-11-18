'use client';

import React, { useEffect, useRef } from 'react';
import { BookOpen, Moon, Sun } from 'lucide-react';
import type { SyllabusId, TopicMasteryStat } from '@/lib/sixthphysics-web/types';
import { cn } from '@/lib/utils';

export type WorkspaceMode = 'practice' | 'mock';
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
}> = [
  { id: 'ib', label: 'IB Physics' },
  { id: 'alevel', label: 'UK A-Level' },
  { id: 'ncuk', label: 'NCUK IFY' },
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
      className="sticky top-0 z-30 border-b border-[var(--sp-border)] bg-[var(--sp-surface)]/95 backdrop-blur-xs"
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-1.5 gap-y-2 px-2.5 py-2 sm:gap-x-3 sm:px-5 xl:h-14 xl:flex-nowrap xl:py-0">
        {/* Wordmark + live bank total */}
        <div className="order-1 flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => onSelectWorkspaceMode('practice')}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg py-1 text-left transition-opacity hover:opacity-90 sm:gap-2"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--sp-accent)] text-white"
            >
              <svg
                viewBox="0 0 20 20"
                fill="none"
                className="h-3.5 w-3.5"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="10" cy="10" r="6.5" strokeOpacity="0.45" />
                <path d="M4.2 10c1.8-3.4 3.9-3.4 5.8 0s4 3.4 5.8 0" />
              </svg>
            </span>
            <span className="text-[14.5px] font-semibold tracking-tight text-[var(--sp-ink)] sm:text-[15px]">
              SixthPhysics
            </span>
          </button>

          <span
            data-testid="bank-total-badge"
            title={`${totalBankItems.toLocaleString()} solver-verified physics questions`}
            className="hidden items-center rounded-md border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-1 py-0.5 font-mono text-[10.5px] font-medium tabular-nums text-[var(--sp-muted)] min-[380px]:inline-flex sm:px-1.5 sm:text-[11px]"
          >
            {totalBankItems.toLocaleString()}
          </span>
        </div>

        {/* 3-Syllabus Segmented Switcher + Inline Level Pills */}
        <div className="order-3 flex w-full flex-wrap items-center justify-between gap-1.5 border-t border-[var(--sp-border)]/80 pt-2 sm:gap-2 xl:order-2 xl:w-auto xl:justify-start xl:border-t-0 xl:pt-0">
          <div
            role="tablist"
            aria-label="Select physics syllabus"
            className="inline-flex items-center rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] p-0.5"
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
                  className={cn(
                    'cursor-pointer rounded-md px-2 py-1 text-[11.5px] transition-colors sm:px-3 sm:text-xs',
                    isSelected
                      ? 'bg-[var(--sp-surface)] font-semibold text-[var(--sp-ink)] shadow-2xs'
                      : 'font-medium text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Filter syllabus level"
            className="inline-flex items-center gap-1"
          >
            {levelOptions.map((lvl) => {
              const active = resolvedLevel === lvl.value;
              return (
                <button
                  key={`${activeSyllabus}-${lvl.value}`}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelectLevel(lvl.value)}
                  className={cn(
                    'cursor-pointer rounded-md border px-1.5 py-1 font-mono text-[11px] transition-colors sm:px-2 sm:text-[11.5px]',
                    active
                      ? 'border-[var(--sp-accent)]/45 bg-blue-500/10 font-semibold text-[var(--sp-accent)] dark:bg-blue-500/15'
                      : 'border-[var(--sp-border)] bg-[var(--sp-surface)] font-medium text-[var(--sp-muted)] hover:bg-[var(--sp-surface-subtle)] hover:text-[var(--sp-ink)]'
                  )}
                >
                  {lvl.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mode Switch, Mastery/Streak Pill, Data Booklet & Theme Toggle */}
        <div className="order-2 flex shrink-0 items-center gap-1 sm:gap-2 xl:order-3">
          <div
            role="group"
            aria-label="Study mode"
            className="inline-flex items-center rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] p-0.5"
          >
            <button
              type="button"
              aria-pressed={workspaceMode === 'practice'}
              onClick={() => onSelectWorkspaceMode('practice')}
              className={cn(
                'cursor-pointer rounded-md px-2 py-1 text-[11.5px] transition-colors sm:px-2.5 sm:text-xs',
                workspaceMode === 'practice'
                  ? 'bg-[var(--sp-surface)] font-semibold text-[var(--sp-ink)] shadow-2xs'
                  : 'font-medium text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
              )}
            >
              Practice
            </button>
            <button
              type="button"
              aria-pressed={workspaceMode === 'mock'}
              onClick={() => onSelectWorkspaceMode('mock')}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11.5px] transition-colors sm:gap-1.5 sm:px-2.5 sm:text-xs',
                workspaceMode === 'mock'
                  ? 'bg-[var(--sp-surface)] font-semibold text-[var(--sp-ink)] shadow-2xs'
                  : 'font-medium text-[var(--sp-muted)] hover:text-[var(--sp-ink)]'
              )}
            >
              <span>Timed Mock</span>
              {hasActiveMockSession && (
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-[var(--sp-accent)]"
                />
              )}
            </button>
          </div>

          <div
            data-testid="mastery-streak-pill"
            title={
              attemptedCount > 0
                ? `${overallMastery?.masteredCount ?? 0} mastered across ${attemptedCount} attempted questions`
                : 'Answer questions to build syllabus mastery and daily streak'
            }
            className="hidden items-center gap-1.5 rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-2.5 py-1 font-mono text-xs tabular-nums text-[var(--sp-muted)] md:inline-flex"
          >
            <span className="font-medium text-[var(--sp-ink)]">
              {masteryPct}%
            </span>
            <span>mastered</span>
            {streakDays > 0 && (
              <>
                <span aria-hidden="true" className="opacity-45">
                  /
                </span>
                <span className="font-medium text-emerald-700 dark:text-emerald-400">
                  {streakDays}d
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenFormulaDrawer}
            aria-label="Data Booklet"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface)] px-0 text-xs font-medium text-[var(--sp-ink)] transition-colors hover:bg-[var(--sp-surface-subtle)] sm:w-auto sm:gap-1.5 sm:px-2.5"
          >
            <BookOpen
              className="h-3.5 w-3.5 shrink-0 text-[var(--sp-accent)]"
              aria-hidden="true"
            />
            <span className="sr-only sm:not-sr-only">Data Booklet</span>
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
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--sp-border)] bg-[var(--sp-surface)] text-[var(--sp-muted)] transition-colors hover:bg-[var(--sp-surface-subtle)] hover:text-[var(--sp-ink)]"
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
