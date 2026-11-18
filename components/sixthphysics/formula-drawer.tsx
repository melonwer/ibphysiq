'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import {
  ALEVEL_PHYSICS_SYLLABUS,
  IB_PHYSICS_SYLLABUS,
  NCUK_DATA_BOOKLET_CONSTANTS,
  NCUK_PHYSICS_SYLLABUS,
  type EquationSpec,
  type SyllabusId,
  type SyllabusSpecificationCatalogue,
} from '@/lib/constants/syllabi';
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

interface BookletConstantRow {
  symbolLatex: string;
  name: string;
  valueText: string;
  siUnit: string;
  highlight?: boolean;
}

const IB_DATA_BOOKLET_CONSTANTS: readonly BookletConstantRow[] = [
  {
    symbolLatex: 'g',
    name: 'Acceleration of free fall (Earth surface)',
    valueText: '9.8',
    siUnit: 'm s⁻²',
    highlight: true,
  },
  {
    symbolLatex: 'G',
    name: 'Gravitational constant',
    valueText: '6.67 × 10⁻¹¹',
    siUnit: 'N m² kg⁻²',
  },
  {
    symbolLatex: 'c',
    name: 'Speed of light in vacuum',
    valueText: '3.00 × 10⁸',
    siUnit: 'm s⁻¹',
  },
  {
    symbolLatex: 'h',
    name: 'Planck constant',
    valueText: '6.63 × 10⁻³⁴',
    siUnit: 'J s',
  },
  {
    symbolLatex: 'e',
    name: 'Elementary charge',
    valueText: '1.60 × 10⁻¹⁹',
    siUnit: 'C',
  },
  {
    symbolLatex: 'N_{\\text{A}}',
    name: 'Avogadro constant',
    valueText: '6.02 × 10²³',
    siUnit: 'mol⁻¹',
  },
  {
    symbolLatex: 'R',
    name: 'Gas constant',
    valueText: '8.31',
    siUnit: 'J K⁻¹ mol⁻¹',
  },
  {
    symbolLatex: 'k_{\\text{B}}',
    name: 'Boltzmann constant',
    valueText: '1.38 × 10⁻²³',
    siUnit: 'J K⁻¹',
  },
  {
    symbolLatex: '\\sigma',
    name: 'Stefan-Boltzmann constant',
    valueText: '5.67 × 10⁻⁸',
    siUnit: 'W m⁻² K⁻⁴',
  },
  {
    symbolLatex: 'k',
    name: 'Coulomb constant',
    valueText: '8.99 × 10⁹',
    siUnit: 'N m² C⁻²',
  },
  {
    symbolLatex: '\\varepsilon_0',
    name: 'Permittivity of free space',
    valueText: '8.85 × 10⁻¹²',
    siUnit: 'C² N⁻¹ m⁻²',
  },
  {
    symbolLatex: '\\mu_0',
    name: 'Permeability of free space',
    valueText: '4π × 10⁻⁷',
    siUnit: 'T m A⁻¹',
  },
  {
    symbolLatex: 'm_{\\text{e}}',
    name: 'Electron rest mass',
    valueText: '9.110 × 10⁻³¹',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'm_{\\text{p}}',
    name: 'Proton rest mass',
    valueText: '1.673 × 10⁻²⁷',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'm_{\\text{n}}',
    name: 'Neutron rest mass',
    valueText: '1.675 × 10⁻²⁷',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'u',
    name: 'Unified atomic mass unit',
    valueText: '1.661 × 10⁻²⁷',
    siUnit: 'kg',
  },
];

const ALEVEL_DATA_BOOKLET_CONSTANTS: readonly BookletConstantRow[] = [
  {
    symbolLatex: 'g',
    name: 'Gravitational field strength / free-fall acceleration',
    valueText: '9.81',
    siUnit: 'N kg⁻¹ (m s⁻²)',
    highlight: true,
  },
  {
    symbolLatex: 'G',
    name: 'Gravitational constant',
    valueText: '6.67 × 10⁻¹¹',
    siUnit: 'N m² kg⁻²',
  },
  {
    symbolLatex: 'c',
    name: 'Speed of electromagnetic waves in free space',
    valueText: '3.00 × 10⁸',
    siUnit: 'm s⁻¹',
  },
  {
    symbolLatex: 'h',
    name: 'Planck constant',
    valueText: '6.63 × 10⁻³⁴',
    siUnit: 'J s',
  },
  {
    symbolLatex: 'e',
    name: 'Magnitude of charge of electron',
    valueText: '1.60 × 10⁻¹⁹',
    siUnit: 'C',
  },
  {
    symbolLatex: 'm_{\\text{e}}',
    name: 'Electron rest mass',
    valueText: '9.11 × 10⁻³¹',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'm_{\\text{p}}',
    name: 'Proton rest mass',
    valueText: '1.67(3) × 10⁻²⁷',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'm_{\\text{n}}',
    name: 'Neutron rest mass',
    valueText: '1.67(5) × 10⁻²⁷',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'u',
    name: 'Atomic mass unit',
    valueText: '1.661 × 10⁻²⁷',
    siUnit: 'kg',
  },
  {
    symbolLatex: 'N_{\\text{A}}',
    name: 'Avogadro constant',
    valueText: '6.02 × 10²³',
    siUnit: 'mol⁻¹',
  },
  {
    symbolLatex: 'R',
    name: 'Molar gas constant',
    valueText: '8.31',
    siUnit: 'J K⁻¹ mol⁻¹',
  },
  {
    symbolLatex: 'k',
    name: 'Boltzmann constant',
    valueText: '1.38 × 10⁻²³',
    siUnit: 'J K⁻¹',
  },
  {
    symbolLatex: '\\varepsilon_0',
    name: 'Permittivity of free space',
    valueText: '8.85 × 10⁻¹²',
    siUnit: 'F m⁻¹',
  },
  {
    symbolLatex: '\\mu_0',
    name: 'Permeability of free space',
    valueText: '4π × 10⁻⁷',
    siUnit: 'T m A⁻¹',
  },
  {
    symbolLatex: '\\sigma',
    name: 'Stefan constant',
    valueText: '5.67 × 10⁻⁸',
    siUnit: 'W m⁻² K⁻⁴',
  },
  {
    symbolLatex: 'b',
    name: 'Wien constant',
    valueText: '2.90 × 10⁻³',
    siUnit: 'm K',
  },
];

const NCUK_SYMBOL_LATEX_MAP: Record<string, string> = {
  m_e: 'm_{\\text{e}}',
  m_p: 'm_{\\text{p}}',
  m_n: 'm_{\\text{n}}',
  '1 eV': '1\\,\\text{eV}',
  ε_0: '\\varepsilon_0',
  k_e: 'k_{\\text{e}}',
  N_A: 'N_{\\text{A}}',
  σ: '\\sigma',
};

const NCUK_MAPPED_CONSTANTS: readonly BookletConstantRow[] =
  NCUK_DATA_BOOKLET_CONSTANTS.map((row) => ({
    symbolLatex: NCUK_SYMBOL_LATEX_MAP[row.symbol] ?? row.symbol,
    name: row.name,
    valueText: row.valueText,
    siUnit: row.siUnit,
    highlight: row.symbol === 'g',
  }));

const SYLLABUS_CATALOGUES: Record<SyllabusId, SyllabusSpecificationCatalogue> = {
  ib: IB_PHYSICS_SYLLABUS,
  alevel: ALEVEL_PHYSICS_SYLLABUS,
  ncuk: NCUK_PHYSICS_SYLLABUS,
};

const SYLLABUS_CONSTANTS: Record<SyllabusId, readonly BookletConstantRow[]> = {
  ib: IB_DATA_BOOKLET_CONSTANTS,
  alevel: ALEVEL_DATA_BOOKLET_CONSTANTS,
  ncuk: NCUK_MAPPED_CONSTANTS,
};

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
      className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`${SYLLABUS_SHORT_LABELS[selectedSyllabus]} data booklet and formula sheet`}
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-[560px] flex-col border-l border-[var(--sp-border,#E5E7EB)] bg-[var(--sp-surface,#FFFFFF)] text-[var(--sp-ink,#111827)] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Sticky Header & Controls */}
        <div className="border-b border-[var(--sp-border,#E5E7EB)] bg-[var(--sp-surface,#FFFFFF)] px-4 py-3.5 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BookOpen
                  className="h-4 w-4 shrink-0 text-[var(--sp-accent,#2563EB)]"
                  aria-hidden="true"
                />
                <h2 className="text-base font-semibold tracking-tight text-[var(--sp-ink,#111827)]">
                  Data booklet &amp; formula sheet
                </h2>
              </div>
              <p className="mt-0.5 text-xs text-[var(--sp-muted,#5B6472)]">
                {catalogue.title} ·{' '}
                <span className="tabular-nums font-medium">
                  {totalMatchingEquations}{' '}
                  {totalMatchingEquations === 1 ? 'equation' : 'equations'}
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close data booklet"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--sp-border,#E5E7EB)] bg-[var(--sp-surface-subtle,#F1F3F7)] px-2.5 py-1.5 text-xs font-medium text-[var(--sp-ink,#111827)] transition-colors hover:opacity-90"
            >
              <span>Close</span>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Syllabus & Level Switchers */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div
              className="inline-flex rounded-lg border border-[var(--sp-border,#E5E7EB)] bg-[var(--sp-surface-subtle,#F1F3F7)] p-0.5"
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
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-[var(--sp-surface,#FFFFFF)] text-[var(--sp-ink,#111827)] shadow-xs'
                        : 'text-[var(--sp-muted,#5B6472)] hover:text-[var(--sp-ink,#111827)]'
                    )}
                  >
                    {syl === 'ib'
                      ? 'IB Physics'
                      : syl === 'alevel'
                        ? 'UK A-Level'
                        : 'NCUK IFY'}
                  </button>
                );
              })}
            </div>

            <div className="inline-flex flex-wrap items-center gap-1">
              {levelPills.map((pill) => {
                const active = levelFilter === pill.id;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setLevelFilter(pill.id)}
                    className={cn(
                      'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                      active
                        ? 'border-[var(--sp-accent,#2563EB)] bg-[var(--sp-accent,#2563EB)]/10 text-[var(--sp-accent,#2563EB)]'
                        : 'border-[var(--sp-border,#E5E7EB)] bg-transparent text-[var(--sp-muted,#5B6472)] hover:text-[var(--sp-ink,#111827)]'
                    )}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Input */}
          <div className="relative mt-3">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--sp-muted,#5B6472)]"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search formulas, symbols, or units..."
              aria-label="Search formulas, symbols, or units"
              className="w-full rounded-lg border border-[var(--sp-border,#E5E7EB)] bg-[var(--sp-surface-subtle,#F1F3F7)] py-2 pr-8 pl-9 text-sm text-[var(--sp-ink,#111827)] placeholder:text-[var(--sp-muted,#5B6472)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear formula search"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-[var(--sp-muted,#5B6472)] hover:text-[var(--sp-ink,#111827)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Syllabus Gravity & Sign Convention Callout */}
          <div className="mt-3 rounded-lg border border-[var(--sp-border,#E5E7EB)] bg-[var(--sp-surface-subtle,#F1F3F7)] px-3 py-2 text-xs">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-semibold tabular-nums text-[var(--sp-accent,#2563EB)]">
                <MathText text={gravityInfo.badge} />
              </span>
              <span className="text-[var(--sp-muted,#5B6472)]">
                <MathText text={gravityInfo.detail} />
              </span>
            </div>
          </div>
        </div>

        {/* Scrollable Booklet Content */}
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
          {/* Fundamental Constants Section */}
          {filteredConstants.length > 0 && (
            <section className="rounded-xl border border-[var(--sp-border,#E5E7EB)] bg-[var(--sp-surface,#FFFFFF)]">
              <button
                type="button"
                onClick={() => setConstantsExpanded((prev) => !prev)}
                aria-expanded={showConstantsBody}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
              >
                <span className="text-sm font-semibold text-[var(--sp-ink,#111827)]">
                  Fundamental constants{' '}
                  <span className="ml-1 text-xs font-normal tabular-nums text-[var(--sp-muted,#5B6472)]">
                    ({filteredConstants.length})
                  </span>
                </span>
                {showConstantsBody ? (
                  <ChevronDown
                    className="h-4 w-4 text-[var(--sp-muted,#5B6472)]"
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronRight
                    className="h-4 w-4 text-[var(--sp-muted,#5B6472)]"
                    aria-hidden="true"
                  />
                )}
              </button>

              {showConstantsBody && (
                <div className="divide-y divide-[var(--sp-border,#E5E7EB)] border-t border-[var(--sp-border,#E5E7EB)]">
                  {filteredConstants.map((constant) => (
                    <div
                      key={`${selectedSyllabus}-${constant.symbolLatex}-${constant.name}`}
                      className={cn(
                        'grid grid-cols-[60px_1fr_auto] items-center gap-2 px-3.5 py-2 text-xs',
                        constant.highlight &&
                          'bg-[var(--sp-accent,#2563EB)]/[0.06]'
                      )}
                    >
                      <span
                        className="font-medium text-[var(--sp-ink,#111827)]"
                        dangerouslySetInnerHTML={{
                          __html: renderLatexToHtml(constant.symbolLatex, {
                            displayMode: false,
                          }),
                        }}
                      />
                      <span className="text-[var(--sp-muted,#5B6472)]">
                        {constant.name}
                      </span>
                      <span className="text-right font-medium tabular-nums text-[var(--sp-ink,#111827)]">
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

          {/* Topic & Subtopic Equations */}
          {filteredTopics.length === 0 ? (
            <div className="rounded-xl border border-[var(--sp-border,#E5E7EB)] bg-[var(--sp-surface-subtle,#F1F3F7)] p-6 text-center">
              <p className="text-sm font-medium text-[var(--sp-ink,#111827)]">
                No formulas match &ldquo;{searchQuery.trim()}&rdquo;
              </p>
              <p className="mt-1 text-xs text-[var(--sp-muted,#5B6472)]">
                Try searching by variable symbol (such as λ or E_k), topic code,
                or unit.
              </p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-3 inline-flex items-center rounded-lg border border-[var(--sp-border,#E5E7EB)] bg-[var(--sp-surface,#FFFFFF)] px-3 py-1.5 text-xs font-medium text-[var(--sp-ink,#111827)] hover:opacity-90"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            filteredTopics.map((topic) => (
              <section key={topic.topicId} className="space-y-3">
                <div className="flex items-baseline justify-between gap-2 border-b border-[var(--sp-border,#E5E7EB)] pb-1.5">
                  <h3 className="text-sm font-semibold text-[var(--sp-ink,#111827)]">
                    <span className="mr-1.5 font-mono text-xs text-[var(--sp-accent,#2563EB)]">
                      {formatCompactTopicCode(topic.topicCode)}
                    </span>
                    {formatCompactTopicTitle(topic.topicTitle)}
                  </h3>
                  {topic.isOption && (
                    <span className="shrink-0 rounded border border-[var(--sp-border,#E5E7EB)] px-1.5 py-0.5 text-[11px] text-[var(--sp-muted,#5B6472)]">
                      Option
                    </span>
                  )}
                </div>

                <div className="space-y-3.5">
                  {topic.subtopics.map((sub) => (
                    <div key={sub.subtopicId} className="space-y-2">
                      <h4 className="text-xs font-medium text-[var(--sp-muted,#5B6472)]">
                        <span className="mr-1.5 font-mono text-[11px] text-[var(--sp-ink,#111827)]">
                          {sub.subtopicCode}
                        </span>
                        {sub.subtopicTitle}
                      </h4>

                      <div className="space-y-2">
                        {sub.equations.map((eq) => (
                          <article
                            key={eq.id}
                            className="rounded-xl border border-[var(--sp-border,#E5E7EB)] bg-[var(--sp-surface,#FFFFFF)] p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-medium text-[var(--sp-ink,#111827)]">
                                {eq.label}
                              </p>
                              <div className="flex shrink-0 items-center gap-1">
                                <span className="rounded bg-[var(--sp-surface-subtle,#F1F3F7)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--sp-ink,#111827)]">
                                  {eq.level}
                                </span>
                                <span
                                  className={cn(
                                    'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                    eq.inDataBooklet
                                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                  )}
                                >
                                  {eq.inDataBooklet
                                    ? 'In booklet'
                                    : 'Memorise'}
                                </span>
                              </div>
                            </div>

                            <div
                              className="my-2 overflow-x-auto rounded-lg border border-[var(--sp-border,#E5E7EB)] bg-[var(--sp-surface-subtle,#F1F3F7)] px-3 py-2 text-sm text-[var(--sp-ink,#111827)]"
                              dangerouslySetInnerHTML={{
                                __html: renderLatexToHtml(eq.latex, {
                                  displayMode: true,
                                }),
                              }}
                            />

                            {eq.variables && eq.variables.length > 0 ? (
                              <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--sp-muted,#5B6472)]">
                                {eq.variables.map((v) => (
                                  <li key={`${eq.id}-${v.symbol}`}>
                                    <MathText
                                      text={`${v.symbol}: ${v.meaning} (${v.siUnit})`}
                                    />
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-[11px] text-[var(--sp-muted,#5B6472)]">
                                <MathText text={eq.siUnitsSummary} />
                              </p>
                            )}

                            {eq.notes && (
                              <p className="mt-1 text-[11px] text-[var(--sp-muted,#5B6472)]">
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
