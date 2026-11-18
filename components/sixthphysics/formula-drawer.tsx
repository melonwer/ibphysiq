'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import type {
  EquationSpec,
  SyllabusId,
} from '@/lib/constants/syllabi';
import {
  SYLLABUS_CATALOGUES,
  SYLLABUS_CONSTANTS,
} from '@/lib/sixthphysics-web/formula-reference';
import { MathText, renderLatexToHtml } from '@/components/sixthphysics/math-text';
import {
  formatCompactTopicCode,
  formatCompactTopicTitle,
} from '@/components/sixthphysics/topic-rail';
import { cn } from '@/lib/utils';

export interface FormulaDrawerProps {
  open: boolean;
  onClose: () => void;
  activeSyllabus: 'ib' | 'alevel' | 'ncuk';
  activeLevel?: string;
}

const SYLLABUS_SHORT_LABELS: Record<SyllabusId, string> = {
  ib: 'IB Physics (2025)',
  alevel: 'UK A-Level (7408)',
  ncuk: 'NCUK IFY (IFYPH005)',
};

const GRAVITY_CALLOUT: Record<
  SyllabusId,
  { badge: string; detail: string }
> = {
  ib: {
    badge: 'g = 9.8 m s⁻²',
    detail:
      '2025 IB Data Booklet standard · First law Q = ΔU + W (W = +PΔV work by gas)',
  },
  alevel: {
    badge: 'g = 9.81 m s⁻²',
    detail:
      'AQA 7408 / OCR H556 / CIE 9702 standard · Quote final answers to minimum s.f. of data',
  },
  ncuk: {
    badge: 'g = 9.81 m s⁻²',
    detail:
      'NCUK IFYPH005 booklet standard · First law ΔU = ΔQ + ΔW (+ΔW work on gas) · 3 s.f. answers',
  },
};

type LevelFilterMode =
  | 'ALL'
  | 'SL'
  | 'HL_ONLY'
  | 'Y12'
  | 'Y13_ONLY'
  | 'IFY-S1'
  | 'IFY-S2';

function deriveInitialLevelFilter(
  syllabus: SyllabusId,
  activeLevel?: string
): LevelFilterMode {
  if (!activeLevel) return 'ALL';
  const normalized = activeLevel.trim().toUpperCase();
  if (normalized === 'ALL' || normalized === '') return 'ALL';

  if (syllabus === 'ib') {
    if (normalized === 'SL') return 'SL';
    return 'ALL';
  }
  if (syllabus === 'alevel') {
    if (normalized === 'Y12' || normalized === 'AS') return 'Y12';
    return 'ALL';
  }
  if (syllabus === 'ncuk') {
    if (normalized === 'S1' || normalized === 'IFY-S1') return 'IFY-S1';
    if (normalized === 'S2' || normalized === 'IFY-S2') return 'IFY-S2';
    return 'ALL';
  }
  return 'ALL';
}

function getLevelPills(
  syllabus: SyllabusId
): Array<{ id: LevelFilterMode; label: string }> {
  if (syllabus === 'ib') {
    return [
      { id: 'ALL', label: 'All (SL + HL)' },
      { id: 'SL', label: 'SL core' },
      { id: 'HL_ONLY', label: 'HL only' },
    ];
  }
  if (syllabus === 'alevel') {
    return [
      { id: 'ALL', label: 'All (Y12 + Y13)' },
      { id: 'Y12', label: 'Y12 (AS)' },
      { id: 'Y13_ONLY', label: 'Y13 only' },
    ];
  }
  return [
    { id: 'ALL', label: 'All IFY' },
    { id: 'IFY-S1', label: 'Semester 1' },
    { id: 'IFY-S2', label: 'Semester 2' },
  ];
}

function matchesEquationLevel(
  eq: EquationSpec,
  subLevelsCovered: readonly string[],
  filter: LevelFilterMode
): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'SL') return eq.level === 'SL' && subLevelsCovered.includes('SL');
  if (filter === 'HL_ONLY') return eq.level === 'HL';
  if (filter === 'Y12') return eq.level === 'Y12' && subLevelsCovered.includes('Y12');
  if (filter === 'Y13_ONLY') return eq.level === 'Y13';
  if (filter === 'IFY-S1') {
    return eq.level === 'IFY-S1' || subLevelsCovered.includes('IFY-S1');
  }
  if (filter === 'IFY-S2') {
    return eq.level === 'IFY-S2' || subLevelsCovered.includes('IFY-S2');
  }
  return true;
}

export function FormulaDrawer({
  open,
  onClose,
  activeSyllabus,
  activeLevel,
}: FormulaDrawerProps) {
  const [selectedSyllabus, setSelectedSyllabus] =
    useState<SyllabusId>(activeSyllabus);
  const [levelFilter, setLevelFilter] = useState<LevelFilterMode>(() =>
    deriveInitialLevelFilter(activeSyllabus, activeLevel)
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [constantsExpanded, setConstantsExpanded] = useState(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedSyllabus(activeSyllabus);
    setLevelFilter(deriveInitialLevelFilter(activeSyllabus, activeLevel));
  }, [activeSyllabus, activeLevel]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  const catalogue = SYLLABUS_CATALOGUES[selectedSyllabus];
  const constantsList = SYLLABUS_CONSTANTS[selectedSyllabus];
  const gravityInfo = GRAVITY_CALLOUT[selectedSyllabus];
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredConstants = useMemo(() => {
    if (!normalizedQuery) return constantsList;
    return constantsList.filter(
      (c) =>
        c.name.toLowerCase().includes(normalizedQuery) ||
        c.symbolLatex.toLowerCase().includes(normalizedQuery) ||
        c.valueText.toLowerCase().includes(normalizedQuery) ||
        c.siUnit.toLowerCase().includes(normalizedQuery)
    );
  }, [constantsList, normalizedQuery]);

  const filteredTopics = useMemo(() => {
    const out: Array<{
      topicId: string;
      topicCode: string;
      topicTitle: string;
      isOption?: boolean;
      subtopics: Array<{
        subtopicId: string;
        subtopicCode: string;
        subtopicTitle: string;
        equations: EquationSpec[];
      }>;
    }> = [];

    for (const topic of catalogue.topics) {
      const topicMatchesQuery =
        normalizedQuery.length > 0 &&
        (topic.title.toLowerCase().includes(normalizedQuery) ||
          topic.code.toLowerCase().includes(normalizedQuery));

      const matchedSubtopics: Array<{
        subtopicId: string;
        subtopicCode: string;
        subtopicTitle: string;
        equations: EquationSpec[];
      }> = [];

      for (const sub of topic.subtopics) {
        const subMatchesQuery =
          normalizedQuery.length > 0 &&
          (sub.title.toLowerCase().includes(normalizedQuery) ||
            sub.code.toLowerCase().includes(normalizedQuery));

        const matchedEquations = sub.equations.filter((eq) => {
          if (!matchesEquationLevel(eq, sub.levelsCovered, levelFilter)) {
            return false;
          }
          if (!normalizedQuery || topicMatchesQuery || subMatchesQuery) {
            return true;
          }
          const haystack = [
            eq.label,
            eq.plainText,
            eq.latex,
            eq.siUnitsSummary,
            eq.notes ?? '',
            ...(eq.variables ?? []).flatMap((v) => [
              v.symbol,
              v.meaning,
              v.siUnit,
            ]),
          ]
            .join(' ')
            .toLowerCase();

          return haystack.includes(normalizedQuery);
        });

        if (matchedEquations.length > 0) {
          matchedSubtopics.push({
            subtopicId: sub.id,
            subtopicCode: sub.code,
            subtopicTitle: sub.title,
            equations: matchedEquations,
          });
        }
      }

      if (matchedSubtopics.length > 0) {
        out.push({
          topicId: topic.id,
          topicCode: topic.code,
          topicTitle: topic.title,
          isOption: topic.isOption,
          subtopics: matchedSubtopics,
        });
      }
    }

    return out;
  }, [catalogue, levelFilter, normalizedQuery]);

  const totalMatchingEquations = useMemo(
    () =>
      filteredTopics.reduce(
        (acc, t) =>
          acc +
          t.subtopics.reduce((subAcc, s) => subAcc + s.equations.length, 0),
        0
      ),
    [filteredTopics]
  );

  if (!open) {
    return null;
  }

  const levelPills = getLevelPills(selectedSyllabus);
  const showConstantsBody =
    constantsExpanded || (normalizedQuery.length > 0 && filteredConstants.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`${SYLLABUS_SHORT_LABELS[selectedSyllabus]} data booklet and formula sheet`}
      onClick={onClose}
    >
      <aside
        className="sp-card flex h-full w-full max-w-[560px] flex-col overflow-hidden rounded-none text-[var(--sp-ink)] sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-[1.25rem]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header & controls */}
        <div className="border-b-2 border-[var(--sp-border)] bg-[var(--sp-surface)] px-4 pt-4 pb-3.5 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="sp-keycap sp-keycap--selected" aria-hidden="true">
                <BookOpen className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[17px] font-extrabold tracking-tight text-[var(--sp-ink)]">
                  Data booklet &amp; formulas
                </h2>
                <p className="mt-0.5 truncate text-[13px] text-[var(--sp-muted)]">
                  {catalogue.title} ·{' '}
                  <span className="font-semibold tabular-nums">
                    {totalMatchingEquations}{' '}
                    {totalMatchingEquations === 1 ? 'equation' : 'equations'}
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close data booklet"
              className="sp-key sp-key--neutral sp-key--sm inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            >
              <X className="h-4 w-4" aria-hidden="true" strokeWidth={2.75} />
            </button>
          </div>

          {/* Syllabus tabs */}
          <div
            className="sp-seg mt-4 flex w-full"
            role="tablist"
            aria-label="Select syllabus booklet"
          >
            {(['ib', 'alevel', 'ncuk'] as const).map((syl) => {
              const isActive = selectedSyllabus === syl;
              return (
                <button
                  key={syl}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setSelectedSyllabus(syl);
                    setLevelFilter('ALL');
                  }}
                  className="sp-seg-item flex-1 px-3 py-2 text-[13px]"
                >
                  {syl === 'ib'
                    ? 'IB Physics'
                    : syl === 'alevel'
                      ? 'A-Level'
                      : 'NCUK'}
                </button>
              );
            })}
          </div>

          {/* Level filter */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {levelPills.map((pill) => {
              const active = levelFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setLevelFilter(pill.id)}
                  className={cn(
                    'sp-key sp-key--sm rounded-full px-3 py-1 text-[12.5px] font-bold',
                    active ? 'sp-key--selected' : 'sp-key--neutral text-[var(--sp-muted)]'
                  )}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative mt-3.5">
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[var(--sp-muted)]"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search formulas, symbols or units"
              aria-label="Search formulas, symbols, or units"
              className="sp-well w-full rounded-2xl py-2.5 pr-10 pl-10 text-sm font-medium text-[var(--sp-ink)] placeholder:text-[var(--sp-muted)] focus:border-[var(--sp-accent)] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear formula search"
                className="absolute top-1/2 right-2.5 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--sp-track)] text-[var(--sp-muted)] transition-colors hover:text-[var(--sp-ink)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.75} />
              </button>
            )}
          </div>

          {/* Gravity & sign convention */}
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px]">
            <span className="sp-chip sp-chip--accent tabular-nums">
              <MathText text={gravityInfo.badge} />
            </span>
            <span className="leading-snug text-[var(--sp-muted)]">
              <MathText text={gravityInfo.detail} />
            </span>
          </div>
        </div>

        {/* Scrollable booklet content */}
        <div className="flex-1 space-y-6 overflow-y-auto bg-[var(--sp-bg)] px-4 py-5 sm:px-5">
          {/* Fundamental constants */}
          {filteredConstants.length > 0 && (
            <section className="sp-card overflow-hidden rounded-2xl">
              <button
                type="button"
                onClick={() => setConstantsExpanded((prev) => !prev)}
                aria-expanded={showConstantsBody}
                className="flex w-full cursor-pointer items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-[var(--sp-surface-subtle)]"
              >
                <span className="flex items-center gap-2 text-[15px] font-extrabold text-[var(--sp-ink)]">
                  Fundamental constants
                  <span className="sp-chip tabular-nums text-[var(--sp-muted)]">
                    {filteredConstants.length}
                  </span>
                </span>
                {showConstantsBody ? (
                  <ChevronDown
                    className="h-5 w-5 text-[var(--sp-muted)]"
                    aria-hidden="true"
                    strokeWidth={2.5}
                  />
                ) : (
                  <ChevronRight
                    className="h-5 w-5 text-[var(--sp-muted)]"
                    aria-hidden="true"
                    strokeWidth={2.5}
                  />
                )}
              </button>

              {showConstantsBody && (
                <div className="divide-y-2 divide-[var(--sp-surface-subtle)] border-t-2 border-[var(--sp-border)]">
                  {filteredConstants.map((constant) => (
                    <div
                      key={`${selectedSyllabus}-${constant.symbolLatex}-${constant.name}`}
                      className={cn(
                        'grid grid-cols-[52px_1fr_auto] items-center gap-2.5 px-4 py-2.5 text-[13px]',
                        constant.highlight && 'bg-[var(--sp-accent-tint)]'
                      )}
                    >
                      <span
                        className="font-semibold text-[var(--sp-ink)]"
                        dangerouslySetInnerHTML={{
                          __html: renderLatexToHtml(constant.symbolLatex, {
                            displayMode: false,
                          }),
                        }}
                      />
                      <span className="text-[var(--sp-muted)]">
                        {constant.name}
                      </span>
                      <span className="text-right font-bold tabular-nums text-[var(--sp-ink)]">
                        <MathText
                          text={`${constant.valueText} ${constant.siUnit}`.trim()}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Topic & subtopic equations */}
          {filteredTopics.length === 0 ? (
            <div className="sp-well p-7 text-center">
              <p className="text-[15px] font-extrabold text-[var(--sp-ink)]">
                No formulas match &ldquo;{searchQuery.trim()}&rdquo;
              </p>
              <p className="mx-auto mt-1.5 max-w-[40ch] text-[13px] text-[var(--sp-muted)]">
                Try a symbol like λ or E_k, a topic code, or a unit.
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="sp-key sp-key--neutral mt-4 inline-flex items-center rounded-xl px-4 py-2 text-[13px] font-extrabold"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            filteredTopics.map((topic) => (
              <section key={topic.topicId} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex min-w-0 items-center gap-2 text-[15px] font-extrabold text-[var(--sp-ink)]">
                    <span className="sp-chip sp-chip--accent shrink-0 tabular-nums">
                      {formatCompactTopicCode(topic.topicCode)}
                    </span>
                    <span className="truncate">
                      {formatCompactTopicTitle(topic.topicTitle)}
                    </span>
                  </h3>
                  {topic.isOption && (
                    <span className="sp-chip shrink-0 text-[var(--sp-muted)]">
                      Option
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  {topic.subtopics.map((sub) => (
                    <div key={sub.subtopicId} className="space-y-2.5">
                      <h4 className="pl-1 text-[13px] font-semibold text-[var(--sp-muted)]">
                        <span className="mr-1.5 font-bold tabular-nums text-[var(--sp-ink)]">
                          {sub.subtopicCode}
                        </span>
                        {sub.subtopicTitle}
                      </h4>

                      <div className="space-y-3">
                        {sub.equations.map((eq) => (
                          <article
                            key={eq.id}
                            className="sp-card rounded-2xl p-3.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-[14px] font-bold text-[var(--sp-ink)]">
                                {eq.label}
                              </p>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <span className="sp-chip text-[11.5px]">
                                  {eq.level}
                                </span>
                                <span
                                  className={cn(
                                    'sp-chip text-[11.5px]',
                                    eq.inDataBooklet
                                      ? 'sp-chip--success'
                                      : 'sp-chip--warn'
                                  )}
                                >
                                  {eq.inDataBooklet
                                    ? 'In booklet'
                                    : 'Memorise'}
                                </span>
                              </div>
                            </div>

                            <div
                              className="sp-well my-2.5 overflow-x-auto rounded-xl px-3 py-2 text-sm text-[var(--sp-ink)]"
                              dangerouslySetInnerHTML={{
                                __html: renderLatexToHtml(eq.latex, {
                                  displayMode: true,
                                }),
                              }}
                            />

                            {eq.variables && eq.variables.length > 0 ? (
                              <ul className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-[var(--sp-muted)]">
                                {eq.variables.map((v) => (
                                  <li key={`${eq.id}-${v.symbol}`}>
                                    <MathText
                                      text={`${v.symbol}: ${v.meaning} (${v.siUnit})`}
                                    />
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-[12px] text-[var(--sp-muted)]">
                                <MathText text={eq.siUnitsSummary} />
                              </p>
                            )}

                            {eq.notes && (
                              <p className="mt-1.5 text-[12px] text-[var(--sp-muted)]">
                                <MathText text={eq.notes} />
                              </p>
                            )}
                          </article>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
