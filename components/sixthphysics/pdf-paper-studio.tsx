'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileCheck,
  FileText,
  Image as ImageIcon,
  List,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ExamPaperSheet } from '@/components/sixthphysics/exam-paper-sheet';
import { MathText } from '@/components/sixthphysics/math-text';
import {
  formatCompactTopicCode,
  formatCompactTopicTitle,
} from '@/components/sixthphysics/topic-rail';
import {
  buildDefaultPaperTitle,
  buildExamPaperDraft,
  buildExamPaperDraftFromSession,
  buildExamPdfFilename,
  calculateRecommendedMinutes,
  createDefaultExamPaperOptions,
  estimateExamPaperPages,
  filterIndexRows,
  getDefaultPresetForSyllabus,
  getExamPaperPresetsForSyllabus,
  loadQuestionsByIds,
  moveQuestionInDraft,
  removeQuestionFromDraft,
  swapQuestionInDraft,
  type ExamPaperDensity,
  type ExamPaperDifficultyMix,
  type ExamPaperDraft,
  type ExamPaperOptions,
  type ExamPaperPageSize,
  type ExamPaperPreset,
  type ExamPaperPrintMode,
  type MockPaperFormatMode,
  type MockPaperSession,
  type PublicBankItem,
  type PublicBankManifest,
  type PublicTopicSummary,
  type SyllabusId,
} from '@/lib/sixthphysics-web';
import { cn } from '@/lib/utils';

export interface PdfPaperStudioProps {
  manifest: PublicBankManifest;
  activeSyllabus: SyllabusId;
  activeLevel?: string;
  topics: PublicTopicSummary[];
  /** Optional mock session handed off from MockExamView ("Export as PDF"). */
  importedMockSession?: MockPaperSession | null;
  onClearImportedSession?: () => void;
}

type PreviewTab = 'paper' | 'markscheme' | 'questions';

const FORMAT_OPTIONS: ReadonlyArray<{
  value: MockPaperFormatMode;
  label: string;
}> = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'mcq', label: 'MCQ only' },
  { value: 'structured', label: 'Structured' },
];

const DIFFICULTY_OPTIONS: ReadonlyArray<{
  value: ExamPaperDifficultyMix;
  label: string;
  dotClass?: string;
}> = [
  { value: 'exam-mix', label: 'Exam mix' },
  { value: 'foundation', label: 'Easy', dotClass: 'bg-emerald-500' },
  { value: 'standard', label: 'Medium', dotClass: 'bg-amber-500' },
  { value: 'higher', label: 'Hard', dotClass: 'bg-rose-500' },
];

const DENSITY_OPTIONS: ReadonlyArray<{
  value: ExamPaperDensity;
  label: string;
  hint: string;
}> = [
  {
    value: 'exam-lines',
    label: 'Exam booklet',
    hint: 'Full dotted answer lines',
  },
  {
    value: 'compact',
    label: 'Compact / eco',
    hint: 'Saves paper when printing',
  },
];

const PAGE_SIZE_OPTIONS: ReadonlyArray<{
  value: ExamPaperPageSize;
  label: string;
}> = [
  { value: 'a4', label: 'A4 (Standard)' },
  { value: 'letter', label: 'US Letter' },
];

function createNextSeed(prevSeed?: number): number {
  const now = Date.now() >>> 0;
  const jitter = Math.floor(Math.random() * 0x7fffffff) >>> 0;
  const candidate = (now ^ jitter ^ ((prevSeed ?? 0) * 1664525 + 1013904223)) >>> 0;
  return candidate === prevSeed ? (candidate + 7919) >>> 0 : candidate;
}

function getDifficultyBadgeInfo(difficulty: string): {
  label: string;
  dotClass: string;
} {
  if (difficulty === 'foundation') {
    return { label: 'Easy', dotClass: 'bg-emerald-500' };
  }
  if (difficulty === 'higher') {
    return { label: 'Hard', dotClass: 'bg-rose-500' };
  }
  return { label: 'Medium', dotClass: 'bg-amber-500' };
}

export function PdfPaperStudio({
  manifest,
  activeSyllabus,
  activeLevel,
  topics,
  importedMockSession,
  onClearImportedSession,
}: PdfPaperStudioProps) {
  const presets = useMemo(
    () => getExamPaperPresetsForSyllabus(activeSyllabus),
    [activeSyllabus]
  );
  const defaultPreset = useMemo(
    () => getDefaultPresetForSyllabus(activeSyllabus),
    [activeSyllabus]
  );

  // Builder controls
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>(
    defaultPreset.id
  );
  const [formatMode, setFormatMode] = useState<MockPaperFormatMode>(
    defaultPreset.formatMode
  );
  const [mcqCount, setMcqCount] = useState<number>(defaultPreset.mcqCount);
  const [structuredCount, setStructuredCount] = useState<number>(
    defaultPreset.structuredCount
  );
  const [difficultyMix, setDifficultyMix] =
    useState<ExamPaperDifficultyMix>('exam-mix');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [autoDuration, setAutoDuration] = useState<boolean>(true);
  const [manualDuration, setManualDuration] = useState<number>(
    defaultPreset.durationMinutes
  );
  const [seed, setSeed] = useState<number>(20261118);

  // Cover & print layout options
  const [options, setOptions] = useState<ExamPaperOptions>(() =>
    createDefaultExamPaperOptions(
      activeSyllabus,
      activeLevel,
      defaultPreset.formatMode,
      defaultPreset.paperLabel
    )
  );
  const [layoutDrawerOpen, setLayoutDrawerOpen] = useState<boolean>(false);

  // Active paper draft + loaded full questions
  const [draft, setDraft] = useState<ExamPaperDraft>(() =>
    buildExamPaperDraft(manifest, {
      syllabus: activeSyllabus,
      level: activeLevel,
      presetId: defaultPreset.id,
      formatMode: defaultPreset.formatMode,
      mcqCount: defaultPreset.mcqCount,
      structuredCount: defaultPreset.structuredCount,
      difficultyMix: 'exam-mix',
      seed: 20261118,
    })
  );
  const [itemsById, setItemsById] = useState<Record<string, PublicBankItem>>(
    {}
  );
  const [loadingQuestions, setLoadingQuestions] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('paper');
  const [printMode, setPrintMode] = useState<ExamPaperPrintMode>('paper');
  const [preparingPrintMode, setPreparingPrintMode] =
    useState<ExamPaperPrintMode | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [portalMounted, setPortalMounted] = useState<boolean>(false);
  const [usingImportedSession, setUsingImportedSession] =
    useState<boolean>(false);

  const prevSyllabusRef = useRef<SyllabusId>(activeSyllabus);
  const prevLevelRef = useRef<string | undefined>(activeLevel);
  const lastImportedIdRef = useRef<string | null>(null);
  const lastManifestTotalRef = useRef<number>(manifest.totalItems);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  // Keep dynamic @page size rule synced with A4 vs US Letter selection
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const styleId = 'sp-pdf-page-size-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    const pageKeyword = options.pageSize === 'letter' ? 'letter' : 'A4';
    styleEl.textContent = `@page { size: ${pageKeyword} portrait; margin: 14mm 14mm 15mm 14mm; }`;
  }, [options.pageSize]);

  const validTopicIds = useMemo(
    () => new Set(topics.map((t) => t.id)),
    [topics]
  );

  const effectiveTopicIds = useMemo(
    () => selectedTopicIds.filter((id) => validTopicIds.has(id)),
    [selectedTopicIds, validTopicIds]
  );

  // Live count of matching questions in the bank
  const poolAvailability = useMemo(() => {
    const base = filterIndexRows(manifest.items, {
      syllabus: activeSyllabus,
      level: activeLevel,
      difficulty: difficultyMix === 'exam-mix' ? 'all' : difficultyMix,
    });
    const allowedTopics =
      effectiveTopicIds.length > 0 ? new Set(effectiveTopicIds) : null;
    const filtered = allowedTopics
      ? base.filter((row) =>
          row.syllabi.some(
            (tag) =>
              tag.syllabus === activeSyllabus && allowedTopics.has(tag.topicId)
          )
        )
      : base;
    let mcq = 0;
    let structured = 0;
    for (const row of filtered) {
      if (row.format === 'mcq') mcq += 1;
      else structured += 1;
    }
    return { total: filtered.length, mcq, structured };
  }, [
    manifest.items,
    activeSyllabus,
    activeLevel,
    difficultyMix,
    effectiveTopicIds,
  ]);

  const rebuildDraft = useCallback(
    (overrides?: {
      syllabus?: SyllabusId;
      level?: string;
      presetId?: string;
      presetPaperLabel?: string;
      formatMode?: MockPaperFormatMode;
      mcqCount?: number;
      structuredCount?: number;
      difficultyMix?: ExamPaperDifficultyMix;
      topicIds?: string[];
      autoDuration?: boolean;
      manualDuration?: number;
      seed?: number;
    }) => {
      const nextSyllabus = overrides?.syllabus ?? activeSyllabus;
      const nextLevel =
        overrides && 'level' in overrides ? overrides.level : activeLevel;
      const nextFormat = overrides?.formatMode ?? formatMode;
      const nextMcq = overrides?.mcqCount ?? mcqCount;
      const nextStruct = overrides?.structuredCount ?? structuredCount;
      const nextDiff = overrides?.difficultyMix ?? difficultyMix;
      const nextTopics = overrides?.topicIds ?? effectiveTopicIds;
      const nextAutoDur = overrides?.autoDuration ?? autoDuration;
      const nextManualDur = overrides?.manualDuration ?? manualDuration;
      const nextSeed = overrides?.seed ?? seed;
      const nextPresetId =
        overrides && 'presetId' in overrides
          ? overrides.presetId
          : selectedPresetId;

      const built = buildExamPaperDraft(manifest, {
        syllabus: nextSyllabus,
        level: nextLevel,
        presetId: nextPresetId,
        formatMode: nextFormat,
        mcqCount: nextMcq,
        structuredCount: nextStruct,
        difficultyMix: nextDiff,
        topicIds: nextTopics,
        autoDuration: nextAutoDur,
        durationMinutes: nextManualDur,
        seed: nextSeed,
      });

      setDraft(built);
      setUsingImportedSession(false);

      setOptions((prev) => {
        const autoTitle = buildDefaultPaperTitle(
          nextSyllabus,
          nextLevel,
          nextFormat,
          overrides?.presetPaperLabel
        );
        return {
          ...prev,
          title: prev.customTitleEdited ? prev.title : autoTitle,
          includeMcqBubbleSheet:
            nextFormat === 'structured' ? false : prev.includeMcqBubbleSheet,
        };
      });
    },
    [
      manifest,
      activeSyllabus,
      activeLevel,
      formatMode,
      mcqCount,
      structuredCount,
      difficultyMix,
      effectiveTopicIds,
      autoDuration,
      manualDuration,
      seed,
      selectedPresetId,
    ]
  );

  // Handle handoff from MockExamView ("Save this paper as PDF")
  useEffect(() => {
    if (
      !importedMockSession ||
      lastImportedIdRef.current === importedMockSession.sessionId
    ) {
      return;
    }
    lastImportedIdRef.current = importedMockSession.sessionId;
    const imported = buildExamPaperDraftFromSession(importedMockSession);
    setDraft(imported);
    setSelectedPresetId(undefined);
    setFormatMode(imported.formatMode);
    setMcqCount(imported.mcqRows.length);
    setStructuredCount(imported.structuredRows.length);
    setDifficultyMix(imported.difficultyMix);
    setSelectedTopicIds(imported.topicIds);
    setAutoDuration(false);
    setManualDuration(imported.durationMinutes);
    setSeed(imported.seed);
    setUsingImportedSession(true);
    setOptions((prev) => ({
      ...prev,
      title: importedMockSession.config.title || prev.title,
      customTitleEdited: false,
      includeMcqBubbleSheet: imported.mcqRows.length > 0,
    }));
    setStatusNotice(
      'Loaded your timed mock paper — customize or save straight to PDF.'
    );
  }, [importedMockSession]);

  // Rebuild automatically when the full manifest finishes hydrating (seed fallback -> 7,643 items)
  useEffect(() => {
    if (
      manifest.totalItems !== lastManifestTotalRef.current &&
      !usingImportedSession
    ) {
      lastManifestTotalRef.current = manifest.totalItems;
      const preset = presets.find((p) => p.id === selectedPresetId);
      rebuildDraft({
        presetId: selectedPresetId,
        presetPaperLabel: preset?.paperLabel,
      });
    }
  }, [
    manifest.totalItems,
    usingImportedSession,
    presets,
    selectedPresetId,
    rebuildDraft,
  ]);

  // Adapt cleanly when user switches course (IB / A-Level / NCUK) or level in TopNav
  useEffect(() => {
    const syllabusChanged = prevSyllabusRef.current !== activeSyllabus;
    const levelChanged = prevLevelRef.current !== activeLevel;

    if (!syllabusChanged && !levelChanged) {
      return;
    }

    prevSyllabusRef.current = activeSyllabus;
    prevLevelRef.current = activeLevel;

    if (syllabusChanged) {
      const nextDefault = getDefaultPresetForSyllabus(activeSyllabus);
      const nextSeed = createNextSeed(seed);
      setSelectedPresetId(nextDefault.id);
      setFormatMode(nextDefault.formatMode);
      setMcqCount(nextDefault.mcqCount);
      setStructuredCount(nextDefault.structuredCount);
      setDifficultyMix('exam-mix');
      setSelectedTopicIds([]);
      setAutoDuration(true);
      setManualDuration(nextDefault.durationMinutes);
      setSeed(nextSeed);
      setUsingImportedSession(false);
      onClearImportedSession?.();
      setOptions((prev) => ({
        ...prev,
        title: buildDefaultPaperTitle(
          activeSyllabus,
          activeLevel,
          nextDefault.formatMode,
          nextDefault.paperLabel
        ),
        customTitleEdited: false,
        includeMcqBubbleSheet: nextDefault.formatMode !== 'structured',
      }));
      setDraft(
        buildExamPaperDraft(manifest, {
          syllabus: activeSyllabus,
          level: activeLevel,
          presetId: nextDefault.id,
          formatMode: nextDefault.formatMode,
          mcqCount: nextDefault.mcqCount,
          structuredCount: nextDefault.structuredCount,
          difficultyMix: 'exam-mix',
          seed: nextSeed,
        })
      );
      setStatusNotice(null);
    } else if (levelChanged && !usingImportedSession) {
      const activePreset = presets.find((p) => p.id === selectedPresetId);
      rebuildDraft({
        level: activeLevel,
        presetId: selectedPresetId,
        presetPaperLabel: activePreset?.paperLabel,
      });
    }
  }, [
    activeSyllabus,
    activeLevel,
    manifest,
    seed,
    presets,
    selectedPresetId,
    usingImportedSession,
    rebuildDraft,
    onClearImportedSession,
  ]);

  // Eagerly fetch full question bodies (stems, SVGs, options, parts, mark schemes) for the active draft
  const draftIdsKey = useMemo(
    () => draft.questionRows.map((r) => r.id).join(','),
    [draft.questionRows]
  );

  useEffect(() => {
    let cancelled = false;
    const ids = draft.questionRows.map((r) => r.id);
    if (ids.length === 0) return;

    const missing = ids.filter((id) => !itemsById[id]);
    if (missing.length === 0) {
      setLoadingQuestions(false);
      return;
    }

    setLoadingQuestions(true);
    void loadQuestionsByIds(ids, manifest)
      .then((loaded) => {
        if (cancelled) return;
        setItemsById((prev) => ({ ...prev, ...loaded }));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingQuestions(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftIdsKey, manifest]);

  // Preset selection
  const handleSelectPreset = useCallback(
    (preset: ExamPaperPreset) => {
      const nextSeed = createNextSeed(seed);
      setSelectedPresetId(preset.id);
      setFormatMode(preset.formatMode);
      setMcqCount(preset.mcqCount);
      setStructuredCount(preset.structuredCount);
      setAutoDuration(true);
      setManualDuration(preset.durationMinutes);
      setSeed(nextSeed);
      onClearImportedSession?.();
      setOptions((prev) => ({
        ...prev,
        title: prev.customTitleEdited
          ? prev.title
          : buildDefaultPaperTitle(
              activeSyllabus,
              activeLevel,
              preset.formatMode,
              preset.paperLabel
            ),
        includeMcqBubbleSheet: preset.formatMode !== 'structured',
      }));
      rebuildDraft({
        presetId: preset.id,
        presetPaperLabel: preset.paperLabel,
        formatMode: preset.formatMode,
        mcqCount: preset.mcqCount,
        structuredCount: preset.structuredCount,
        autoDuration: true,
        manualDuration: preset.durationMinutes,
        seed: nextSeed,
      });
      setStatusNotice(null);
    },
    [activeSyllabus, activeLevel, seed, rebuildDraft, onClearImportedSession]
  );

  const handleChangeFormat = useCallback(
    (nextFormat: MockPaperFormatMode) => {
      const nextMcq =
        nextFormat === 'structured'
          ? 0
          : mcqCount > 0
            ? mcqCount
            : nextFormat === 'mcq'
              ? 20
              : 12;
      const nextStruct =
        nextFormat === 'mcq'
          ? 0
          : structuredCount > 0
            ? structuredCount
            : nextFormat === 'structured'
              ? 5
              : 4;

      setSelectedPresetId(undefined);
      setFormatMode(nextFormat);
      setMcqCount(nextMcq);
      setStructuredCount(nextStruct);
      if (nextFormat !== 'structured') {
        setOptions((prev) => ({ ...prev, includeMcqBubbleSheet: true }));
      }
      rebuildDraft({
        presetId: undefined,
        formatMode: nextFormat,
        mcqCount: nextMcq,
        structuredCount: nextStruct,
      });
    },
    [mcqCount, structuredCount, rebuildDraft]
  );

  const handleStepMcq = useCallback(
    (delta: number) => {
      const minVal = formatMode === 'mcq' ? 1 : 1;
      const next = Math.max(minVal, Math.min(35, mcqCount + delta));
      if (next === mcqCount) return;
      setSelectedPresetId(undefined);
      setMcqCount(next);
      rebuildDraft({ presetId: undefined, mcqCount: next });
    },
    [formatMode, mcqCount, rebuildDraft]
  );

  const handleStepStructured = useCallback(
    (delta: number) => {
      const next = Math.max(1, Math.min(10, structuredCount + delta));
      if (next === structuredCount) return;
      setSelectedPresetId(undefined);
      setStructuredCount(next);
      rebuildDraft({ presetId: undefined, structuredCount: next });
    },
    [structuredCount, rebuildDraft]
  );

  const handleChangeDifficulty = useCallback(
    (nextDiff: ExamPaperDifficultyMix) => {
      setDifficultyMix(nextDiff);
      rebuildDraft({ difficultyMix: nextDiff });
    },
    [rebuildDraft]
  );

  const handleToggleTopic = useCallback(
    (topicId: string) => {
      const nextTopics = effectiveTopicIds.includes(topicId)
        ? effectiveTopicIds.filter((id) => id !== topicId)
        : [...effectiveTopicIds, topicId];
      setSelectedTopicIds(nextTopics);
      rebuildDraft({ topicIds: nextTopics });
    },
    [effectiveTopicIds, rebuildDraft]
  );

  const handleClearTopics = useCallback(() => {
    setSelectedTopicIds([]);
    rebuildDraft({ topicIds: [] });
  }, [rebuildDraft]);

  const handleStepDuration = useCallback(
    (delta: number) => {
      const base = draft.durationMinutes;
      const next = Math.max(10, Math.min(180, base + delta));
      setAutoDuration(false);
      setManualDuration(next);
      setDraft((prev) => ({
        ...prev,
        durationMinutes: next,
        autoDuration: false,
      }));
    },
    [draft.durationMinutes]
  );

  const handleResetAutoDuration = useCallback(() => {
    setAutoDuration(true);
    setDraft((prev) => ({
      ...prev,
      durationMinutes: calculateRecommendedMinutes(prev.questionRows),
      autoDuration: true,
    }));
  }, []);

  const handleShufflePaper = useCallback(() => {
    const nextSeed = createNextSeed(seed);
    setSeed(nextSeed);
    const activePreset = presets.find((p) => p.id === selectedPresetId);
    rebuildDraft({
      seed: nextSeed,
      presetId: selectedPresetId,
      presetPaperLabel: activePreset?.paperLabel,
    });
    setStatusNotice('Shuffled a fresh set of non-duplicate questions.');
  }, [seed, presets, selectedPresetId, rebuildDraft]);

  const handleSwapQuestion = useCallback(
    (index: number) => {
      const swapped = swapQuestionInDraft(manifest, draft, index, Date.now());
      if (!swapped) {
        setStatusNotice(
          'No other unique-family question is available for this filter.'
        );
        return;
      }
      setDraft(swapped);
      setStatusNotice(`Swapped Question ${index + 1} with a fresh problem.`);
    },
    [manifest, draft]
  );

  const handleMoveQuestion = useCallback(
    (fromIndex: number, toIndex: number) => {
      const source = draft.questionRows[fromIndex];
      const target = draft.questionRows[toIndex];
      if (!source || !target || source.format !== target.format) {
        return;
      }
      setDraft((prev) => moveQuestionInDraft(prev, fromIndex, toIndex));
    },
    [draft.questionRows]
  );

  const handleRemoveQuestion = useCallback((index: number) => {
    setDraft((prev) => removeQuestionFromDraft(prev, index));
  }, []);

  // Trigger clean native vector print-to-PDF
  const handleExportPdf = useCallback(
    async (targetMode: ExamPaperPrintMode) => {
      if (draft.questionRows.length === 0) return;

      setPreparingPrintMode(targetMode);
      setPrintMode(targetMode);

      try {
        const ids = draft.questionRows.map((r) => r.id);
        const loaded = await loadQuestionsByIds(ids, manifest);
        setItemsById((prev) => ({ ...prev, ...loaded }));

        if (typeof window === 'undefined' || typeof document === 'undefined') {
          return;
        }

        const previousTitle = document.title;
        document.title = buildExamPdfFilename(draft, options.title, targetMode);

        let restored = false;
        const restoreTitle = () => {
          if (restored) return;
          restored = true;
          document.title = previousTitle;
          window.removeEventListener('afterprint', restoreTitle);
        };
        window.addEventListener('afterprint', restoreTitle);

        // Wait two frames so the portal ExamPaperSheet commits & SVG layout runs
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
          });
        });

        window.print();

        // Safety fallback for browsers where afterprint fires late or not at all
        window.setTimeout(restoreTitle, 4000);
      } finally {
        setPreparingPrintMode(null);
      }
    },
    [draft, manifest, options.title]
  );

  const estimatedPages = useMemo(
    () => estimateExamPaperPages(draft, options),
    [draft, options]
  );

  const topicMap = useMemo(
    () => new Map(topics.map((t) => [t.id, t])),
    [topics]
  );

  const syllabusMeta = manifest.syllabi[activeSyllabus];
  const hasQuestions = draft.questionRows.length > 0;
  const isPrinting = preparingPrintMode !== null;

  return (
    <div className="mx-auto max-w-[1360px] space-y-5">
      {/* Studio intro header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--sp-ink)] sm:text-[27px]">
            Exam-style PDF mock paper maker
          </h1>
          <p className="max-w-[66ch] text-[14.5px] leading-relaxed text-[var(--sp-muted)]">
            Generate print-ready examination booklets and matching examiner mark
            schemes for{' '}
            <span className="font-bold text-[var(--sp-ink)]">
              {syllabusMeta?.shortLabel ?? 'your course'}
            </span>
            . Pick a ready-made paper below or tailor topics, length, and cover
            details.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {syllabusMeta?.shortLabel && (
            <span className="sp-chip sp-chip--accent">
              <span
                className="sp-dot bg-[var(--sp-accent)]"
                aria-hidden="true"
              />
              {syllabusMeta.shortLabel}
              {activeLevel && activeLevel !== 'all' ? ` · ${activeLevel}` : ''}
            </span>
          )}
          {syllabusMeta?.gravityConvention && (
            <span className="sp-chip tabular-nums text-[var(--sp-muted)]">
              <MathText text={syllabusMeta.gravityConvention} />
            </span>
          )}
        </div>
      </div>

      {/* Main two-column studio layout */}
      <div className="grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
        {/* ===============================================================
            LEFT COLUMN: SMART PAPER BUILDER
            =============================================================== */}
        <aside
          aria-label="Paper generator controls"
          className="min-w-0 space-y-4 lg:sticky lg:top-[calc(var(--sp-topnav-h,64px)+1rem)]"
        >
          {/* 1. Quick-pick course templates */}
          <section className="sp-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15.5px] font-extrabold text-[var(--sp-ink)]">
                Quick templates
              </h2>
              <span className="text-[12px] font-semibold text-[var(--sp-muted)]">
                1-click exam setups
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {presets.map((preset) => {
                const active = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSelectPreset(preset)}
                    className={cn(
                      'sp-key sp-key--sm flex flex-col items-start rounded-2xl p-3 text-left',
                      active ? 'sp-key--selected' : 'sp-key--neutral'
                    )}
                  >
                    <span className="text-[13.5px] leading-snug font-extrabold text-[var(--sp-ink)]">
                      {preset.shortTitle}
                    </span>
                    <span className="mt-1 text-[11.5px] font-semibold tabular-nums text-[var(--sp-muted)]">
                      {preset.badgeLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Customize questions & timing */}
          <section className="sp-card space-y-4 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15.5px] font-extrabold text-[var(--sp-ink)]">
                Customize paper
              </h2>
              <span
                className={cn(
                  'sp-chip tabular-nums',
                  poolAvailability.total > 0
                    ? 'sp-chip--success'
                    : 'sp-chip--warn'
                )}
              >
                {poolAvailability.total.toLocaleString()} in bank
              </span>
            </div>

            {/* Format */}
            <div className="space-y-1.5">
              <span className="block text-[13px] font-bold text-[var(--sp-ink)]">
                Paper format
              </span>
              <div className="sp-seg flex w-full">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={formatMode === opt.value}
                    onClick={() => handleChangeFormat(opt.value)}
                    className="sp-seg-item flex-1 px-2 py-1.5 text-[13px]"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Question count steppers */}
            <div
              className={cn(
                'grid gap-2.5',
                formatMode === 'mixed' ? 'grid-cols-2' : 'grid-cols-1'
              )}
            >
              {formatMode !== 'structured' && (
                <div className="sp-well flex items-center justify-between px-3 py-2.5">
                  <div>
                    <div className="text-[12px] font-bold text-[var(--sp-muted)]">
                      MCQs
                    </div>
                    <div className="text-[16px] font-extrabold tabular-nums text-[var(--sp-ink)]">
                      {draft.mcqRows.length}
                      {draft.mcqRows.length !== mcqCount && (
                        <span className="ml-1 text-[11px] font-semibold text-[var(--sp-muted)]">
                          / {mcqCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleStepMcq(-2)}
                      disabled={mcqCount <= 1}
                      aria-label="Fewer multiple-choice questions"
                      className="sp-key sp-key--sm sp-key--neutral inline-flex h-8 w-8 items-center justify-center rounded-lg"
                    >
                      <Minus className="h-3.5 w-3.5" strokeWidth={2.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStepMcq(2)}
                      disabled={mcqCount >= 35}
                      aria-label="More multiple-choice questions"
                      className="sp-key sp-key--sm sp-key--neutral inline-flex h-8 w-8 items-center justify-center rounded-lg"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
                    </button>
                  </div>
                </div>
              )}

              {formatMode !== 'mcq' && (
                <div className="sp-well flex items-center justify-between px-3 py-2.5">
                  <div>
                    <div className="text-[12px] font-bold text-[var(--sp-muted)]">
                      Structured
                    </div>
                    <div className="text-[16px] font-extrabold tabular-nums text-[var(--sp-ink)]">
                      {draft.structuredRows.length}
                      {draft.structuredRows.length !== structuredCount && (
                        <span className="ml-1 text-[11px] font-semibold text-[var(--sp-muted)]">
                          / {structuredCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleStepStructured(-1)}
                      disabled={structuredCount <= 1}
                      aria-label="Fewer structured questions"
                      className="sp-key sp-key--sm sp-key--neutral inline-flex h-8 w-8 items-center justify-center rounded-lg"
                    >
                      <Minus className="h-3.5 w-3.5" strokeWidth={2.75} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStepStructured(1)}
                      disabled={structuredCount >= 10}
                      aria-label="More structured questions"
                      className="sp-key sp-key--sm sp-key--neutral inline-flex h-8 w-8 items-center justify-center rounded-lg"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Difficulty ramp */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-[var(--sp-ink)]">
                  Difficulty
                </span>
                {difficultyMix === 'exam-mix' && (
                  <span className="text-[11.5px] font-semibold text-[var(--sp-muted)]">
                    Easy → Hard ramp
                  </span>
                )}
              </div>
              <div className="sp-seg flex w-full">
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={difficultyMix === opt.value}
                    onClick={() => handleChangeDifficulty(opt.value)}
                    className="sp-seg-item inline-flex flex-1 items-center justify-center gap-1 px-1.5 py-1.5 text-[12.5px]"
                  >
                    {opt.dotClass && (
                      <span
                        className={cn('sp-dot', opt.dotClass)}
                        aria-hidden="true"
                      />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Smart Time Allowed */}
            <div className="sp-well flex items-center justify-between gap-2 px-3 py-2.5">
              <div>
                <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--sp-ink)]">
                  <span>Time allowed</span>
                  <span className="rounded-md bg-[var(--sp-accent-tint)] px-1.5 py-0.5 text-[10.5px] font-bold text-[var(--sp-accent-ink)]">
                    {autoDuration ? 'Smart auto' : 'Custom'}
                  </span>
                </div>
                <div className="mt-0.5 text-[14.5px] font-extrabold tabular-nums text-[var(--sp-ink)]">
                  {draft.durationMinutes} minutes
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {!autoDuration && (
                  <button
                    type="button"
                    onClick={handleResetAutoDuration}
                    title="Reset to smart exam timing"
                    className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] font-bold text-[var(--sp-accent)] hover:underline"
                  >
                    Auto
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleStepDuration(-5)}
                  disabled={draft.durationMinutes <= 10}
                  aria-label="Decrease exam time by 5 minutes"
                  className="sp-key sp-key--sm sp-key--neutral inline-flex h-8 w-8 items-center justify-center rounded-lg"
                >
                  <Minus className="h-3.5 w-3.5" strokeWidth={2.75} />
                </button>
                <button
                  type="button"
                  onClick={() => handleStepDuration(5)}
                  disabled={draft.durationMinutes >= 180}
                  aria-label="Increase exam time by 5 minutes"
                  className="sp-key sp-key--sm sp-key--neutral inline-flex h-8 w-8 items-center justify-center rounded-lg"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
                </button>
              </div>
            </div>

            {/* Topic chips */}
            {topics.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-[var(--sp-ink)]">
                    Topics{' '}
                    <span className="font-semibold text-[var(--sp-muted)]">
                      ·{' '}
                      {effectiveTopicIds.length === 0
                        ? 'All balanced'
                        : `${effectiveTopicIds.length} chosen`}
                    </span>
                  </span>
                  {effectiveTopicIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearTopics}
                      className="cursor-pointer text-[12px] font-bold text-[var(--sp-accent)] hover:underline"
                    >
                      All topics
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {topics.map((topic) => {
                    const selected = effectiveTopicIds.includes(topic.id);
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => handleToggleTopic(topic.id)}
                        className={cn(
                          'sp-key sp-key--sm inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[12px] font-semibold',
                          selected ? 'sp-key--selected' : 'sp-key--neutral'
                        )}
                      >
                        <span className="font-extrabold tabular-nums text-[var(--sp-accent)]">
                          {formatCompactTopicCode(topic.code)}
                        </span>
                        <span className="max-w-[140px] truncate">
                          {formatCompactTopicTitle(topic.title)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 3. Collapsible Cover & Print Layout Drawer (zero clutter by default) */}
          <section className="sp-card overflow-hidden">
            <button
              type="button"
              aria-expanded={layoutDrawerOpen}
              onClick={() => setLayoutDrawerOpen((prev) => !prev)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-left sm:px-5"
            >
              <span className="inline-flex items-center gap-2 text-[14.5px] font-extrabold text-[var(--sp-ink)]">
                <Settings
                  className="h-4 w-4 text-[var(--sp-accent)]"
                  aria-hidden="true"
                />
                Cover, layout &amp; print options
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-[var(--sp-muted)] transition-transform duration-150',
                  layoutDrawerOpen && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </button>

            {layoutDrawerOpen && (
              <div className="space-y-4 border-t-2 border-[var(--sp-border)] px-4 py-4 sm:px-5">
                {/* Paper title */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="sp-pdf-title-input"
                      className="text-[12.5px] font-bold text-[var(--sp-ink)]"
                    >
                      Paper title
                    </label>
                    {options.customTitleEdited && (
                      <button
                        type="button"
                        onClick={() => {
                          const activePreset = presets.find(
                            (p) => p.id === selectedPresetId
                          );
                          setOptions((prev) => ({
                            ...prev,
                            title: buildDefaultPaperTitle(
                              activeSyllabus,
                              activeLevel,
                              formatMode,
                              activePreset?.paperLabel
                            ),
                            customTitleEdited: false,
                          }));
                        }}
                        className="cursor-pointer text-[11.5px] font-bold text-[var(--sp-accent)] hover:underline"
                      >
                        Reset title
                      </button>
                    )}
                  </div>
                  <input
                    id="sp-pdf-title-input"
                    type="text"
                    value={options.title}
                    onChange={(e) =>
                      setOptions((prev) => ({
                        ...prev,
                        title: e.target.value,
                        customTitleEdited: true,
                      }))
                    }
                    className="h-9 w-full rounded-xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-3 text-[13px] font-medium text-[var(--sp-ink)] focus:border-[var(--sp-accent)] focus:bg-[var(--sp-surface)] focus:outline-none"
                  />
                </div>

                {/* Optional school / class & subtitle */}
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="sp-pdf-school-input"
                      className="block text-[12px] font-bold text-[var(--sp-muted)]"
                    >
                      School / class (optional)
                    </label>
                    <input
                      id="sp-pdf-school-input"
                      type="text"
                      value={options.institutionLabel}
                      placeholder="e.g. Year 13 Physics"
                      onChange={(e) =>
                        setOptions((prev) => ({
                          ...prev,
                          institutionLabel: e.target.value,
                        }))
                      }
                      className="h-9 w-full rounded-xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-3 text-[12.5px] font-medium text-[var(--sp-ink)] placeholder:text-[var(--sp-muted)]/70 focus:border-[var(--sp-accent)] focus:bg-[var(--sp-surface)] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="sp-pdf-subtitle-input"
                      className="block text-[12px] font-bold text-[var(--sp-muted)]"
                    >
                      Exam session (optional)
                    </label>
                    <input
                      id="sp-pdf-subtitle-input"
                      type="text"
                      value={options.subtitle}
                      placeholder="e.g. Autumn Mock Week"
                      onChange={(e) =>
                        setOptions((prev) => ({
                          ...prev,
                          subtitle: e.target.value,
                        }))
                      }
                      className="h-9 w-full rounded-xl border-2 border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-3 text-[12.5px] font-medium text-[var(--sp-ink)] placeholder:text-[var(--sp-muted)]/70 focus:border-[var(--sp-accent)] focus:bg-[var(--sp-surface)] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Booklet toggles */}
                <div className="space-y-2">
                  <span className="block text-[12.5px] font-bold text-[var(--sp-ink)]">
                    Include in booklet
                  </span>
                  <div className="space-y-1.5">
                    {(
                      [
                        {
                          key: 'includeCoverSheet',
                          label: 'Authentic exam cover sheet',
                          desc: 'Name box, instructions, examiner table',
                        },
                        {
                          key: 'includeFormulaSheet',
                          label: 'Tailored constants & formula sheet',
                          desc: 'Matched to this paper’s syllabus & topics',
                        },
                        ...(draft.mcqRows.length > 0
                          ? [
                              {
                                key: 'includeMcqBubbleSheet' as const,
                                label: 'MCQ bubble answer grid',
                                desc: 'Printable A/B/C/D shading sheet',
                              },
                              {
                                key: 'includeDistractorNotes' as const,
                                label: 'Common trap notes in mark scheme',
                                desc: 'Explains why wrong MCQ options mislead',
                              },
                            ]
                          : []),
                      ] as const
                    ).map((toggle) => {
                      const checked = options[toggle.key];
                      return (
                        <label
                          key={toggle.key}
                          className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--sp-border)] bg-[var(--sp-surface-subtle)] px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setOptions((prev) => ({
                                ...prev,
                                [toggle.key]: e.target.checked,
                              }))
                            }
                            className="mt-0.5 h-4 w-4 accent-[var(--sp-accent)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-bold text-[var(--sp-ink)]">
                              {toggle.label}
                            </span>
                            <span className="block text-[11.5px] text-[var(--sp-muted)]">
                              {toggle.desc}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Writing space & page size */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <span className="block text-[12.5px] font-bold text-[var(--sp-ink)]">
                      Answer space
                    </span>
                    <div className="sp-seg flex w-full">
                      {DENSITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          title={opt.hint}
                          aria-pressed={options.density === opt.value}
                          onClick={() =>
                            setOptions((prev) => ({
                              ...prev,
                              density: opt.value,
                            }))
                          }
                          className="sp-seg-item flex-1 px-2 py-1.5 text-[12px]"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="block text-[12.5px] font-bold text-[var(--sp-ink)]">
                      Page size
                    </span>
                    <div className="sp-seg flex w-full">
                      {PAGE_SIZE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          aria-pressed={options.pageSize === opt.value}
                          onClick={() =>
                            setOptions((prev) => ({
                              ...prev,
                              pageSize: opt.value,
                            }))
                          }
                          className="sp-seg-item flex-1 px-2 py-1.5 text-[12px]"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </aside>

        {/* ===============================================================
            RIGHT COLUMN: EXPORT BAR + LIVE EXAM BOOKLET PREVIEW
            =============================================================== */}
        <div className="min-w-0 space-y-4">
          {/* Action & Preview Toolbar */}
          <div className="sp-card space-y-3 p-4">
            {/* Top row: Export PDF buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold tabular-nums text-[var(--sp-ink)]">
                <span className="sp-chip sp-chip--accent">
                  {draft.questionRows.length} Qs
                </span>
                <span className="sp-chip">{draft.totalMarks} marks</span>
                <span className="sp-chip">{draft.durationMinutes} min</span>
                <span className="hidden text-[12.5px] font-semibold text-[var(--sp-muted)] sm:inline">
                  ~{estimatedPages} pages ·{' '}
                  <span className="font-mono">{draft.paperCode}</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!hasQuestions || isPrinting}
                  onClick={() => void handleExportPdf('paper')}
                  data-testid="save-question-paper-pdf"
                  className={cn(
                    'sp-key sp-key--sm inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13.5px] font-extrabold',
                    hasQuestions && !isPrinting
                      ? 'sp-key--primary'
                      : 'sp-key--idle'
                  )}
                >
                  {preparingPrintMode === 'paper' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>Save Question Paper PDF</span>
                </button>

                <button
                  type="button"
                  disabled={!hasQuestions || isPrinting}
                  onClick={() => void handleExportPdf('markscheme')}
                  data-testid="save-mark-scheme-pdf"
                  className={cn(
                    'sp-key sp-key--sm inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-extrabold',
                    hasQuestions && !isPrinting
                      ? 'sp-key--success'
                      : 'sp-key--idle'
                  )}
                >
                  {preparingPrintMode === 'markscheme' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileCheck className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>Mark Scheme PDF</span>
                </button>

                <button
                  type="button"
                  disabled={!hasQuestions || isPrinting}
                  onClick={() => void handleExportPdf('both')}
                  data-testid="save-full-pack-pdf"
                  title="Print or save Question Paper and Mark Scheme together in one PDF"
                  className={cn(
                    'sp-key sp-key--sm inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-bold',
                    hasQuestions && !isPrinting
                      ? 'sp-key--neutral'
                      : 'sp-key--idle'
                  )}
                >
                  {preparingPrintMode === 'both' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Package className="h-4 w-4 text-[var(--sp-accent)]" />
                  )}
                  <span>Full Pack</span>
                </button>
              </div>
            </div>

            {/* Bottom row: Preview mode tabs + Shuffle + friendly PDF hint */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[var(--sp-border)] pt-3">
              <div
                role="tablist"
                aria-label="Exam preview view"
                className="sp-seg"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewTab === 'paper'}
                  onClick={() => setPreviewTab('paper')}
                  className="sp-seg-item inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px]"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  Question Paper
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewTab === 'markscheme'}
                  onClick={() => setPreviewTab('markscheme')}
                  className="sp-seg-item inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px]"
                >
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Mark Scheme
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewTab === 'questions'}
                  onClick={() => setPreviewTab('questions')}
                  className="sp-seg-item inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px]"
                >
                  <List className="h-3.5 w-3.5" aria-hidden="true" />
                  Swap / Edit ({draft.questionRows.length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShufflePaper}
                  className="sp-key sp-key--sm sp-key--neutral inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12.5px] font-bold"
                >
                  <RefreshCw
                    className="h-3.5 w-3.5 text-[var(--sp-accent)]"
                    aria-hidden="true"
                  />
                  <span>Shuffle fresh paper</span>
                </button>
              </div>
            </div>

            {/* Subtle, reassuring non-technical hint */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--sp-surface-subtle)] px-3 py-2 text-[12px] text-[var(--sp-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles
                  className="h-3.5 w-3.5 shrink-0 text-[var(--sp-accent)]"
                  aria-hidden="true"
                />
                <span>
                  Choose <strong className="text-[var(--sp-ink)]">Save as PDF</strong>{' '}
                  in the print window to download a crisp vector PDF (or send
                  straight to your printer).
                </span>
              </span>
              {statusNotice && (
                <span className="font-semibold text-[var(--sp-accent-ink)]">
                  {statusNotice}
                </span>
              )}
            </div>
          </div>

          {/* Live Paper Preview or Question Swap Manager */}
          {!hasQuestions ? (
            <div className="sp-card px-6 py-12 text-center">
              <p className="text-[17px] font-extrabold text-[var(--sp-ink)]">
                No questions match these filters
              </p>
              <p className="mt-1.5 text-[14px] text-[var(--sp-muted)]">
                Try selecting more topics, switching to Exam mix difficulty, or
                picking one of the quick templates.
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => handleSelectPreset(defaultPreset)}
                  className="sp-key sp-key--primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13.5px] font-extrabold"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Reset to recommended paper
                </button>
              </div>
            </div>
          ) : previewTab === 'questions' ? (
            /* Per-question swap / reorder / remove editor */
            <section
              aria-label="Edit paper questions"
              className="sp-card space-y-3 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-[16px] font-extrabold text-[var(--sp-ink)]">
                    Questions in this paper ({draft.questionRows.length})
                  </h2>
                  <p className="text-[13px] text-[var(--sp-muted)]">
                    Swap any question for a fresh unique-family alternative,
                    reorder within its section, or remove it.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewTab('paper')}
                  className="sp-key sp-key--sm sp-key--neutral rounded-xl px-3 py-1.5 text-[12.5px] font-bold"
                >
                  Back to paper preview
                </button>
              </div>

              <div className="space-y-2">
                {draft.questionRows.map((row, idx) => {
                  const item = itemsById[row.id];
                  const tag = row.syllabi.find(
                    (t) => t.syllabus === draft.syllabus
                  );
                  const topic = tag ? topicMap.get(tag.topicId) : undefined;
                  const diffInfo = getDifficultyBadgeInfo(row.difficulty);
                  const prevSameSection =
                    idx > 0 &&
                    draft.questionRows[idx - 1]?.format === row.format;
                  const nextSameSection =
                    idx < draft.questionRows.length - 1 &&
                    draft.questionRows[idx + 1]?.format === row.format;

                  return (
                    <div
                      key={row.id}
                      className="sp-well flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-lg bg-[var(--sp-accent)] px-1.5 font-extrabold tabular-nums text-white">
                            Q{idx + 1}
                          </span>
                          <span className="sp-chip text-[11.5px]">
                            {row.format === 'mcq' ? 'MCQ' : 'Structured'}
                          </span>
                          {topic && (
                            <span className="sp-chip sp-chip--accent text-[11.5px]">
                              {formatCompactTopicCode(topic.code)}
                            </span>
                          )}
                          <span className="sp-chip text-[11.5px]">
                            <span
                              className={cn('sp-dot', diffInfo.dotClass)}
                              aria-hidden="true"
                            />
                            {diffInfo.label}
                          </span>
                          <span className="sp-chip tabular-nums text-[11.5px]">
                            {row.totalMarks}{' '}
                            {row.totalMarks === 1 ? 'mark' : 'marks'}
                          </span>
                          {row.hasSvg && (
                            <span
                              title="Includes physics diagram"
                              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--sp-muted)]"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                              Diagram
                            </span>
                          )}
                        </div>
                        <div className="line-clamp-2 text-[13px] leading-snug text-[var(--sp-ink)]">
                          {item ? (
                            <MathText text={item.stem} />
                          ) : (
                            <span className="text-[var(--sp-muted)]">
                              Loading question preview…
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSwapQuestion(idx)}
                          title="Replace with another question from the same topic"
                          className="sp-key sp-key--sm sp-key--neutral inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[12px] font-bold"
                        >
                          <RefreshCw className="h-3.5 w-3.5 text-[var(--sp-accent)]" />
                          Swap
                        </button>
                        <button
                          type="button"
                          disabled={!prevSameSection}
                          onClick={() => handleMoveQuestion(idx, idx - 1)}
                          aria-label={`Move question ${idx + 1} up`}
                          className={cn(
                            'sp-key sp-key--sm inline-flex h-8 w-8 items-center justify-center rounded-xl',
                            prevSameSection ? 'sp-key--neutral' : 'sp-key--idle'
                          )}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={!nextSameSection}
                          onClick={() => handleMoveQuestion(idx, idx + 1)}
                          aria-label={`Move question ${idx + 1} down`}
                          className={cn(
                            'sp-key sp-key--sm inline-flex h-8 w-8 items-center justify-center rounded-xl',
                            nextSameSection ? 'sp-key--neutral' : 'sp-key--idle'
                          )}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={draft.questionRows.length <= 1}
                          onClick={() => handleRemoveQuestion(idx)}
                          aria-label={`Remove question ${idx + 1}`}
                          className={cn(
                            'sp-key sp-key--sm inline-flex h-8 w-8 items-center justify-center rounded-xl text-[var(--sp-danger-ink)]',
                            draft.questionRows.length > 1
                              ? 'sp-key--neutral'
                              : 'sp-key--idle'
                          )}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            /* Live A4 Drafting-Desk Preview */
            <div className="rounded-3xl border-2 border-[var(--sp-border)] bg-[var(--sp-track)] p-3 sm:p-6">
              {loadingQuestions && (
                <div className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-[var(--sp-surface)] px-3 py-2 text-[13px] font-semibold text-[var(--sp-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--sp-accent)]" />
                  Preparing questions and diagrams…
                </div>
              )}

              <div
                data-testid="exam-paper-preview-canvas"
                className="sp-exam-preview-frame mx-auto max-w-[810px] overflow-x-auto rounded-xl bg-white p-4 text-[#111111] shadow-[0_12px_36px_rgba(15,23,42,0.16)] ring-1 ring-black/10 sm:p-10"
              >
                <ExamPaperSheet
                  draft={draft}
                  itemsById={itemsById}
                  options={options}
                  mode={previewTab === 'markscheme' ? 'markscheme' : 'paper'}
                  scopePrefix="preview"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dedicated Print-Only Portal mounted directly on document.body so
          browsers paginate cleanly across multiple A4/Letter pages with
          zero flex/overflow clipping or dark-mode bleed. */}
      {portalMounted &&
        typeof document !== 'undefined' &&
        hasQuestions &&
        createPortal(
          <div className="sp-print-portal" aria-hidden="true">
            <ExamPaperSheet
              draft={draft}
              itemsById={itemsById}
              options={options}
              mode={printMode}
              scopePrefix="print"
            />
          </div>,
          document.body
        )}
    </div>
  );
}
