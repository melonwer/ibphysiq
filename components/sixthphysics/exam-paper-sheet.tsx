'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { MathText, renderLatexToHtml } from '@/components/sixthphysics/math-text';
import { shouldUseCompactOptionGrid } from '@/components/sixthphysics/mcq-interaction';
import {
  enforceLabelFloor,
  prepareSvgFigureParts,
  separateCollidingLabels,
} from '@/components/sixthphysics/svg-figure-plate';
import {
  formatCompactTopicCode,
  formatCompactTopicTitle,
} from '@/components/sixthphysics/topic-rail';
import {
  estimateStructuredLineCount,
  getSyllabusExamMetadata,
  selectBookletEquationsForPaper,
  SYLLABUS_CONSTANTS,
  type ExamPaperDraft,
  type ExamPaperOptions,
  type ExamPaperPrintMode,
  type PublicBankItem,
} from '@/lib/sixthphysics-web';

export interface ExamPaperSheetProps {
  draft: ExamPaperDraft;
  itemsById: Readonly<Record<string, PublicBankItem>>;
  options: ExamPaperOptions;
  mode: ExamPaperPrintMode;
  scopePrefix?: string;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

interface PrintSvgFigureProps {
  svgMarkup: string;
  scopeKey: string;
  figureNumber: number;
  compact: boolean;
}

function PrintSvgFigure({
  svgMarkup,
  scopeKey,
  figureNumber,
  compact,
}: PrintSvgFigureProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  const prepared = useMemo(
    () =>
      prepareSvgFigureParts(svgMarkup, scopeKey, {
        typeset: true,
        autoFrame: true,
      }),
    [svgMarkup, scopeKey]
  );

  useLayoutEffect(() => {
    const svg = hostRef.current?.querySelector('svg');
    if (!svg) return;
    enforceLabelFloor(svg);
    separateCollidingLabels(svg);
  }, [prepared.markup]);

  return (
    <figure className="sp-exam-figure">
      <div
        ref={hostRef}
        className={
          compact
            ? 'sp-exam-svg-host sp-exam-svg-host--compact'
            : 'sp-exam-svg-host'
        }
        dangerouslySetInnerHTML={{ __html: prepared.markup }}
      />
      {(prepared.captions.length > 0 || prepared.footnote) && (
        <figcaption className="sp-exam-figcaption">
          <span className="font-semibold">Figure {figureNumber}.</span>{' '}
          {prepared.captions.length > 0 && (
            <MathText text={prepared.captions.join('  ·  ')} />
          )}
          {prepared.captions.length > 0 && prepared.footnote ? ' — ' : ''}
          {prepared.footnote && (
            <span className="italic">{prepared.footnote}</span>
          )}
        </figcaption>
      )}
    </figure>
  );
}

function resolveOptionCorrectIndex(item: PublicBankItem): number {
  if (
    typeof item.correctOptionIndex === 'number' &&
    item.correctOptionIndex >= 0 &&
    item.correctOptionIndex <= 3
  ) {
    return item.correctOptionIndex;
  }
  const idx = item.options?.findIndex((opt) => opt.isCorrect) ?? -1;
  return idx >= 0 ? idx : 0;
}

function getPaperTopicIds(draft: ExamPaperDraft): string[] {
  const seen = new Set<string>();
  for (const row of draft.questionRows) {
    for (const tag of row.syllabi) {
      if (tag.syllabus === draft.syllabus) {
        seen.add(tag.topicId);
      }
    }
  }
  return [...seen];
}

function formatDurationHuman(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  const hourLabel = hours === 1 ? '1 hour' : `${hours} hours`;
  if (rem === 0) return hourLabel;
  return `${hourLabel} ${rem} minutes`;
}

function ExamCoverPage({
  draft,
  options,
  meta,
}: {
  draft: ExamPaperDraft;
  options: ExamPaperOptions;
  meta: ReturnType<typeof getSyllabusExamMetadata>;
}) {
  const durationLabel = formatDurationHuman(draft.durationMinutes);
  const hasMcq = draft.mcqRows.length > 0;
  const hasStructured = draft.structuredRows.length > 0;

  // IB Physics cover layout
  if (draft.syllabus === 'ib') {
    return (
      <section className="sp-exam-page sp-exam-cover sp-exam-cover--ib">
        <div className="flex items-start justify-between gap-4 border-b-2 border-[#111111] pb-4">
          <div className="space-y-1">
            <p className="text-[9.5pt] font-semibold tracking-[0.12em] text-[#374151] uppercase">
              {options.institutionLabel.trim() || meta.boardMasthead}
            </p>
            <h1 className="font-serif text-[23pt] leading-tight font-bold tracking-tight text-[#111111]">
              {meta.subjectTitle}
            </h1>
            <p className="text-[12pt] font-bold tracking-[0.04em] text-[#111111] uppercase">
              {meta.levelBadge}
            </p>
          </div>

          <div className="shrink-0 border border-[#111111] px-3 py-2 text-right">
            <div className="font-mono text-[9.5pt] font-bold text-[#111111]">
              {draft.paperCode}
            </div>
            <div className="mt-0.5 text-[8.5pt] text-[#374151]">
              {meta.specSubtitle}
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-1.5">
          <h2 className="text-[14pt] font-bold text-[#111111]">
            {options.title}
          </h2>
          {options.subtitle.trim() && (
            <p className="text-[10.5pt] text-[#374151]">
              {options.subtitle.trim()}
            </p>
          )}
        </div>

        {/* Candidate session number grid (authentic IB style) */}
        <div className="mt-6 grid grid-cols-1 gap-4 border border-[#111111] p-4 sm:grid-cols-2">
          <div>
            <div className="text-[8.5pt] font-bold tracking-[0.06em] text-[#374151] uppercase">
              Candidate session number
            </div>
            <div className="mt-2 grid grid-cols-10 border-t border-l border-[#111111]">
              {Array.from({ length: 10 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-7 border-r border-b border-[#111111]"
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col justify-between gap-2.5">
            <div>
              <div className="text-[8.5pt] font-bold tracking-[0.06em] text-[#374151] uppercase">
                Candidate name
              </div>
              <div className="mt-3.5 border-b border-[#111111]" />
            </div>
            <div className="flex items-end justify-between gap-4">
              <span className="text-[8.5pt] font-bold tracking-[0.06em] text-[#374151] uppercase">
                Date
              </span>
              <div className="flex-1 border-b border-[#111111]" />
            </div>
          </div>
        </div>

        {/* Time & Marks bar */}
        <div className="mt-5 grid grid-cols-3 divide-x divide-[#111111] border border-[#111111] bg-[#F3F4F6]">
          <div className="px-3.5 py-2.5">
            <div className="text-[8pt] font-bold tracking-[0.06em] text-[#4B5563] uppercase">
              Time allowed
            </div>
            <div className="mt-0.5 text-[11pt] font-bold text-[#111111]">
              {durationLabel}
            </div>
          </div>
          <div className="px-3.5 py-2.5">
            <div className="text-[8pt] font-bold tracking-[0.06em] text-[#4B5563] uppercase">
              Maximum mark
            </div>
            <div className="mt-0.5 text-[11pt] font-bold text-[#111111]">
              [{draft.totalMarks} marks]
            </div>
          </div>
          <div className="px-3.5 py-2.5">
            <div className="text-[8pt] font-bold tracking-[0.06em] text-[#4B5563] uppercase">
              Questions
            </div>
            <div className="mt-0.5 text-[11pt] font-bold text-[#111111]">
              {draft.questionRows.length} total
            </div>
          </div>
        </div>

        {/* Instructions to candidates */}
        <div className="mt-6 border border-[#111111] p-4">
          <h3 className="text-[10.5pt] font-bold text-[#111111]">
            Instructions to candidates
          </h3>
          <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-[10pt] leading-[1.45] text-[#111111]">
            {meta.instructions.map((line, idx) => (
              <li key={idx}>
                <MathText text={line} />
              </li>
            ))}
          </ul>
        </div>

        {/* Section overview if mixed */}
        {hasMcq && hasStructured && (
          <div className="mt-5 border border-[#D1D5DB] bg-[#FAFAFA] px-4 py-3 text-[9.5pt] text-[#1F2937]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>Section A (Paper 1A):</strong> {draft.mcqRows.length}{' '}
                multiple-choice questions ({draft.mcqMarks} marks)
              </span>
              <span>
                <strong>Section B (Paper 2):</strong>{' '}
                {draft.structuredRows.length} structured questions (
                {draft.structuredMarks} marks)
              </span>
            </div>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-[#9CA3AF] pt-3 text-[8.5pt] text-[#4B5563]">
          <span>
            SixthPhysics Practice Examination ·{' '}
            <MathText text={meta.gravityText} />
          </span>
          <span className="font-bold text-[#111111]">Turn over</span>
        </div>
      </section>
    );
  }

  // UK A-Level cover layout (AQA-inspired with For Examiner's Use score table)
  if (draft.syllabus === 'alevel') {
    const firstStructuredNumber = draft.mcqRows.length + 1;
    return (
      <section className="sp-exam-page sp-exam-cover sp-exam-cover--alevel">
        {/* Candidate block capitals header */}
        <div className="border-2 border-[#111111] p-3.5">
          <p className="text-[8.5pt] font-bold text-[#374151]">
            Please write clearly in block capitals.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <span className="text-[8.5pt] font-semibold text-[#374151]">
                Surname
              </span>
              <div className="mt-5 border-b border-[#111111]" />
            </div>
            <div>
              <span className="text-[8.5pt] font-semibold text-[#374151]">
                Forename(s)
              </span>
              <div className="mt-5 border-b border-[#111111]" />
            </div>
          </div>
          <div className="mt-3.5 grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <span className="text-[8.5pt] font-semibold text-[#374151]">
                Candidate signature
              </span>
              <div className="mt-4 border-b border-[#111111]" />
            </div>
            <div>
              <span className="text-[8.5pt] font-semibold text-[#374151]">
                Date
              </span>
              <div className="mt-4 border-b border-[#111111]" />
            </div>
          </div>
        </div>

        {/* Title band */}
        <div className="mt-5 flex items-start justify-between gap-4 border-b-[3px] border-[#111111] pb-3.5">
          <div>
            <p className="text-[9.5pt] font-bold tracking-[0.08em] text-[#374151] uppercase">
              {options.institutionLabel.trim() || meta.boardMasthead}
            </p>
            <h1 className="mt-0.5 text-[22pt] leading-tight font-extrabold tracking-tight text-[#111111]">
              {meta.subjectTitle}
            </h1>
            <p className="mt-1 text-[12pt] font-bold text-[#111111]">
              {options.title}
            </p>
            {options.subtitle.trim() && (
              <p className="mt-0.5 text-[10pt] text-[#374151]">
                {options.subtitle.trim()}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="inline-block bg-[#111111] px-2.5 py-1 font-mono text-[9.5pt] font-bold text-white">
              {draft.paperCode}
            </div>
            <div className="mt-1 text-[9pt] font-semibold text-[#374151]">
              {meta.levelBadge}
            </div>
          </div>
        </div>

        {/* Two-column body: Instructions + For Examiner's Use */}
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-12 print:grid-cols-12">
          <div className="space-y-4 sm:col-span-8 print:col-span-8">
            <div className="border border-[#111111] bg-[#F3F4F6] px-3.5 py-2.5">
              <span className="text-[10.5pt] font-bold text-[#111111]">
                Time allowed: {durationLabel}
              </span>
            </div>

            <div>
              <h3 className="text-[10pt] font-bold text-[#111111]">
                Materials
              </h3>
              <p className="mt-1 text-[9.5pt] text-[#1F2937]">
                For this paper you must have:
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[9.5pt] text-[#111111]">
                {meta.materials.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-[10pt] font-bold text-[#111111]">
                Instructions
              </h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[9.5pt] leading-[1.45] text-[#111111]">
                {meta.instructions.map((line, idx) => (
                  <li key={idx}>
                    <MathText text={line} />
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-[10pt] font-bold text-[#111111]">
                Advice
              </h3>
              <p className="mt-1 text-[9.5pt] leading-[1.45] text-[#111111]">
                You are advised to spend about{' '}
                {hasMcq && hasStructured
                  ? `${Math.max(10, Math.round((draft.mcqMarks / Math.max(1, draft.totalMarks)) * draft.durationMinutes))} minutes on Section A and ${Math.max(10, draft.durationMinutes - Math.round((draft.mcqMarks / Math.max(1, draft.totalMarks)) * draft.durationMinutes))} minutes on Section B.`
                  : '1.3 minutes per mark across all questions.'}
              </p>
            </div>
          </div>

          <div className="sm:col-span-4 print:col-span-4">
            <table className="w-full border-collapse border border-[#111111] text-[9pt]">
              <thead>
                <tr className="bg-[#F3F4F6]">
                  <th
                    colSpan={2}
                    className="border border-[#111111] px-2 py-1.5 text-center font-bold text-[#111111]"
                  >
                    For Examiner&apos;s Use
                  </th>
                </tr>
                <tr className="bg-[#FAFAFA]">
                  <th className="border border-[#111111] px-2 py-1 text-left font-semibold">
                    Question
                  </th>
                  <th className="border border-[#111111] px-2 py-1 text-right font-semibold">
                    Mark
                  </th>
                </tr>
              </thead>
              <tbody>
                {hasMcq && (
                  <tr>
                    <td className="border border-[#111111] px-2 py-1">
                      Sec A (1–{draft.mcqRows.length})
                    </td>
                    <td className="border border-[#111111] px-2 py-1 text-right text-[#6B7280]">
                      / {draft.mcqMarks}
                    </td>
                  </tr>
                )}
                {draft.structuredRows.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="border border-[#111111] px-2 py-1 font-medium">
                      Q{firstStructuredNumber + idx}
                    </td>
                    <td className="border border-[#111111] px-2 py-1 text-right text-[#6B7280]">
                      / {row.totalMarks}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#F3F4F6] font-bold">
                  <td className="border border-[#111111] px-2 py-1.5">TOTAL</td>
                  <td className="border border-[#111111] px-2 py-1.5 text-right">
                    / {draft.totalMarks}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-[#9CA3AF] pt-3 text-[8.5pt] text-[#4B5563]">
          <span>
            {meta.specSubtitle} · <MathText text={meta.gravityText} />
          </span>
          <span className="font-bold text-[#111111]">Turn over</span>
        </div>
      </section>
    );
  }

  // NCUK International Foundation Year (IFYPH005) cover layout
  return (
    <section className="sp-exam-page sp-exam-cover sp-exam-cover--ncuk">
      <div className="border-t-4 border-b-2 border-[#111111] py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9.5pt] font-bold tracking-[0.09em] text-[#374151] uppercase">
              {options.institutionLabel.trim() || meta.boardMasthead}
            </p>
            <h1 className="mt-1 text-[21pt] leading-tight font-extrabold text-[#111111]">
              {meta.subjectTitle}
            </h1>
            <p className="mt-1 text-[12pt] font-bold text-[#111111]">
              {options.title}
            </p>
            {options.subtitle.trim() && (
              <p className="mt-0.5 text-[10pt] text-[#374151]">
                {options.subtitle.trim()}
              </p>
            )}
          </div>
          <div className="shrink-0 border border-[#111111] bg-[#F3F4F6] px-3 py-2 text-right">
            <div className="font-mono text-[9.5pt] font-bold text-[#111111]">
              {draft.paperCode}
            </div>
            <div className="mt-0.5 text-[8.5pt] font-semibold text-[#374151]">
              {meta.levelBadge}
            </div>
          </div>
        </div>
      </div>

      {/* Candidate info table */}
      <table className="mt-5 w-full border-collapse border border-[#111111] text-[9.5pt]">
        <tbody>
          <tr>
            <td className="w-1/4 border border-[#111111] bg-[#F3F4F6] px-3 py-2 font-bold">
              Student Name
            </td>
            <td className="border border-[#111111] px-3 py-2" />
            <td className="w-1/5 border border-[#111111] bg-[#F3F4F6] px-3 py-2 font-bold">
              NCUK ID
            </td>
            <td className="w-1/4 border border-[#111111] px-3 py-2" />
          </tr>
          <tr>
            <td className="border border-[#111111] bg-[#F3F4F6] px-3 py-2 font-bold">
              Study Centre
            </td>
            <td className="border border-[#111111] px-3 py-2" />
            <td className="border border-[#111111] bg-[#F3F4F6] px-3 py-2 font-bold">
              Date
            </td>
            <td className="border border-[#111111] px-3 py-2" />
          </tr>
        </tbody>
      </table>

      {/* Examination structure table */}
      <table className="mt-5 w-full border-collapse border border-[#111111] text-[9.5pt]">
        <thead>
          <tr className="bg-[#F3F4F6]">
            <th className="border border-[#111111] px-3 py-1.5 text-left font-bold">
              Section
            </th>
            <th className="border border-[#111111] px-3 py-1.5 text-center font-bold">
              Questions
            </th>
            <th className="border border-[#111111] px-3 py-1.5 text-center font-bold">
              Marks
            </th>
            <th className="border border-[#111111] px-3 py-1.5 text-right font-bold">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {hasMcq && (
            <tr>
              <td className="border border-[#111111] px-3 py-1.5">
                Section A — Multiple Choice
              </td>
              <td className="border border-[#111111] px-3 py-1.5 text-center tabular-nums">
                {draft.mcqRows.length}
              </td>
              <td className="border border-[#111111] px-3 py-1.5 text-center tabular-nums">
                {draft.mcqMarks}
              </td>
              <td className="border border-[#111111] px-3 py-1.5 text-right text-[#6B7280]">
                / {draft.mcqMarks}
              </td>
            </tr>
          )}
          {hasStructured && (
            <tr>
              <td className="border border-[#111111] px-3 py-1.5">
                Section B — Structured Questions
              </td>
              <td className="border border-[#111111] px-3 py-1.5 text-center tabular-nums">
                {draft.structuredRows.length}
              </td>
              <td className="border border-[#111111] px-3 py-1.5 text-center tabular-nums">
                {draft.structuredMarks}
              </td>
              <td className="border border-[#111111] px-3 py-1.5 text-right text-[#6B7280]">
                / {draft.structuredMarks}
              </td>
            </tr>
          )}
          <tr className="bg-[#F3F4F6] font-bold">
            <td className="border border-[#111111] px-3 py-1.5">
              Total · Time Allowed: {durationLabel}
            </td>
            <td className="border border-[#111111] px-3 py-1.5 text-center tabular-nums">
              {draft.questionRows.length}
            </td>
            <td className="border border-[#111111] px-3 py-1.5 text-center tabular-nums">
              {draft.totalMarks}
            </td>
            <td className="border border-[#111111] px-3 py-1.5 text-right">
              / {draft.totalMarks}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Instructions */}
      <div className="mt-5 border border-[#111111] p-4">
        <h3 className="text-[10.5pt] font-bold text-[#111111]">
          Instructions to Students
        </h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[9.5pt] leading-[1.45] text-[#111111]">
          {meta.instructions.map((line, idx) => (
            <li key={idx}>
              <MathText text={line} />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-[#9CA3AF] pt-3 text-[8.5pt] text-[#4B5563]">
        <span>
          {meta.specSubtitle} · <MathText text={meta.gravityText} />
        </span>
        <span className="font-bold text-[#111111]">
          Do not turn over until instructed
        </span>
      </div>
    </section>
  );
}

function splitCompoundLatexParts(latex: string): string[] {
  if (latex.length <= 42) return [latex];
  const parts: string[] = [];
  let braceDepth = 0;
  let parenDepth = 0;
  let start = 0;
  for (let i = 0; i < latex.length; i += 1) {
    const ch = latex[i];
    const escaped = i > 0 && latex[i - 1] === '\\';
    if (escaped) continue;
    if (ch === '{') braceDepth += 1;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === ',' && braceDepth === 0 && parenDepth === 0) {
      const piece = latex.slice(start, i).trim();
      if (piece.length > 0) parts.push(piece);
      start = i + 1;
    }
  }
  const tail = latex.slice(start).trim();
  if (tail.length > 0) parts.push(tail);
  if (parts.length <= 1) return [latex];
  const hasInvalidPiece = parts.some((p) =>
    renderLatexToHtml(p).includes('katex-error')
  );
  return hasInvalidPiece ? [latex] : parts;
}

function ExamFormulaReferencePage({
  draft,
  meta,
}: {
  draft: ExamPaperDraft;
  meta: ReturnType<typeof getSyllabusExamMetadata>;
}) {
  const constants = SYLLABUS_CONSTANTS[draft.syllabus];
  const topicIds = useMemo(() => getPaperTopicIds(draft), [draft]);
  const equationGroups = useMemo(
    () =>
      selectBookletEquationsForPaper(
        draft.syllabus,
        draft.level,
        topicIds,
        topicIds.length > 5 ? 3 : 5
      ),
    [draft.syllabus, draft.level, topicIds]
  );

  return (
    <section className="sp-exam-page sp-exam-formula-page">
      <header className="flex items-baseline justify-between gap-2 border-b-2 border-[#111111] pb-2">
        <div className="min-w-0">
          <h2 className="text-[11.5pt] font-extrabold tracking-tight text-[#111111] uppercase">
            {meta.dataBookletName}
          </h2>
          <p className="text-[8.5pt] text-[#4B5563]">
            Selected constants and equations matched to topics in this paper
          </p>
        </div>
        <span className="shrink-0 font-mono text-[8.5pt] font-bold text-[#374151]">
          {draft.paperCode}
        </span>
      </header>

      <div className="mt-3.5">
        <h3 className="text-[9.5pt] font-bold tracking-[0.04em] text-[#111111] uppercase">
          Fundamental Constants
        </h3>
        <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 border border-[#D1D5DB] p-2.5 text-[8.5pt] sm:grid-cols-2 print:grid-cols-2">
          {constants.slice(0, 14).map((row) => (
            <div
              key={`${row.symbolLatex}-${row.name}`}
              className="flex min-w-0 items-baseline justify-between gap-2 border-b border-[#E5E7EB] py-1 last:border-b-0"
            >
              <span className="min-w-0 truncate text-[#1F2937]">
                <span
                  className="mr-1.5 font-semibold text-[#111111]"
                  dangerouslySetInnerHTML={{
                    __html: renderLatexToHtml(row.symbolLatex),
                  }}
                />
                {row.name}
              </span>
              <span className="shrink-0 font-mono text-[8pt] font-semibold whitespace-nowrap text-[#111111]">
                <MathText text={`${row.valueText} ${row.siUnit}`} />
              </span>
            </div>
          ))}
        </div>
      </div>

      {equationGroups.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[9.5pt] font-bold tracking-[0.04em] text-[#111111] uppercase">
            Selected Equations
          </h3>
          <div className="mt-1.5 grid grid-cols-1 gap-3 sm:grid-cols-2 print:grid-cols-2">
            {equationGroups.map((group) => (
              <div
                key={group.topicId}
                className="min-w-0 break-inside-avoid overflow-hidden border border-[#D1D5DB] p-2.5"
              >
                <div className="border-b border-[#E5E7EB] pb-1 text-[8.5pt] font-bold text-[#111111]">
                  {formatCompactTopicCode(group.topicCode)} ·{' '}
                  {formatCompactTopicTitle(group.topicTitle)}
                </div>
                <div className="mt-1.5 space-y-2">
                  {group.equations.map((eq) => {
                    const latexParts = splitCompoundLatexParts(eq.latex);
                    return (
                      <div
                        key={eq.id}
                        className="border-b border-[#F3F4F6] pb-1.5 last:border-b-0 last:pb-0"
                      >
                        <div className="text-[7.5pt] leading-tight text-[#4B5563]">
                          {eq.label}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[8.2pt] text-[#111111]">
                          {latexParts.map((part, partIdx) => (
                            <span
                              key={partIdx}
                              className="max-w-full"
                              dangerouslySetInnerHTML={{
                                __html: renderLatexToHtml(part),
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ExamMcqBubbleSheet({
  mcqCount,
  paperCode,
  title,
}: {
  mcqCount: number;
  paperCode: string;
  title: string;
}) {
  return (
    <section className="sp-exam-bubble-sheet">
      <div className="flex items-baseline justify-between border-b border-[#111111] pb-1.5">
        <div>
          <h3 className="text-[10.5pt] font-bold text-[#111111]">
            Multiple-Choice Answer Grid
          </h3>
          <p className="text-[8.5pt] text-[#4B5563]">
            Shade or circle one letter (A, B, C, or D) for each question ·{' '}
            {title}
          </p>
        </div>
        <span className="font-mono text-[8.5pt] font-bold text-[#374151]">
          {paperCode}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
        {Array.from({ length: mcqCount }).map((_, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between border-b border-[#E5E7EB] py-1 text-[9.5pt]"
          >
            <span className="w-6 font-bold tabular-nums text-[#111111]">
              {idx + 1}.
            </span>
            <div className="flex items-center gap-1.5">
              {OPTION_LETTERS.map((letter) => (
                <span
                  key={letter}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#374151] text-[8pt] font-bold text-[#111111]"
                >
                  {letter}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ExamPaperSheet({
  draft,
  itemsById,
  options,
  mode,
  scopePrefix = 'pdf',
}: ExamPaperSheetProps) {
  const meta = useMemo(
    () =>
      getSyllabusExamMetadata(
        draft.syllabus,
        draft.level,
        {
          mcqCount: draft.mcqRows.length,
          structuredCount: draft.structuredRows.length,
          totalMarks: draft.totalMarks,
        },
        options.includeFormulaSheet
      ),
    [
      draft.syllabus,
      draft.level,
      draft.mcqRows.length,
      draft.structuredRows.length,
      draft.totalMarks,
      options.includeFormulaSheet,
    ]
  );

  const showQuestionPaper = mode === 'paper' || mode === 'both';
  const showMarkScheme = mode === 'markscheme' || mode === 'both';
  const isCompact = options.density === 'compact';

  // Precompute sequential figure numbers for questions with SVGs
  const figureNumberByQuestionId = useMemo(() => {
    const map = new Map<string, number>();
    let counter = 0;
    for (const row of draft.questionRows) {
      const item = itemsById[row.id];
      if (item?.svgMarkup) {
        counter += 1;
        map.set(row.id, counter);
      }
    }
    return map;
  }, [draft.questionRows, itemsById]);

  const firstStructuredNumber = draft.mcqRows.length + 1;

  return (
    <div
      className={`sp-exam-sheet sp-exam-sheet--${options.pageSize} ${
        isCompact ? 'sp-exam-sheet--compact' : ''
      }`}
      data-paper-code={draft.paperCode}
      data-print-mode={mode}
    >
      {/* =================================================================
          QUESTION PAPER
          ================================================================= */}
      {showQuestionPaper && (
        <div className="sp-exam-paper-body">
          {options.includeCoverSheet ? (
            <ExamCoverPage draft={draft} options={options} meta={meta} />
          ) : (
            <header className="mb-5 border-b-2 border-[#111111] pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[8.5pt] font-bold tracking-[0.08em] text-[#4B5563] uppercase">
                    {options.institutionLabel.trim() || meta.boardMasthead}
                  </p>
                  <h1 className="mt-0.5 text-[15pt] font-extrabold text-[#111111]">
                    {options.title}
                  </h1>
                  {options.subtitle.trim() && (
                    <p className="text-[9.5pt] text-[#374151]">
                      {options.subtitle.trim()}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right text-[9pt]">
                  <div className="font-mono font-bold text-[#111111]">
                    {draft.paperCode}
                  </div>
                  <div className="text-[#374151]">
                    {formatDurationHuman(draft.durationMinutes)} ·{' '}
                    {draft.totalMarks} marks
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-[9.5pt]">
                <span>
                  Name:{' '}
                  <span className="inline-block w-52 border-b border-[#111111]" />
                </span>
                <span>
                  Date:{' '}
                  <span className="inline-block w-28 border-b border-[#111111]" />
                </span>
                <span className="text-[8.5pt] text-[#4B5563]">
                  Take <MathText text={meta.gravityText} />
                </span>
              </div>
            </header>
          )}

          {options.includeFormulaSheet && (
            <ExamFormulaReferencePage draft={draft} meta={meta} />
          )}

          {/* Running paper title strip at start of questions */}
          <div className="sp-exam-questions-start">
            {(options.includeCoverSheet || options.includeFormulaSheet) && (
              <div className="mb-4 flex items-baseline justify-between border-b border-[#9CA3AF] pb-1.5 text-[8.5pt] text-[#4B5563]">
                <span className="font-semibold text-[#111111]">
                  {options.title}
                </span>
                <span className="font-mono">
                  {draft.paperCode} · Take <MathText text={meta.gravityText} />
                </span>
              </div>
            )}

            {/* SECTION A: MULTIPLE CHOICE */}
            {draft.mcqRows.length > 0 && (
              <section className="sp-exam-section">
                <div className="mb-4 border-b-2 border-[#111111] pb-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-[11.5pt] font-extrabold text-[#111111]">
                      {meta.sectionATitle}
                    </h2>
                    <span className="shrink-0 text-[9.5pt] font-bold tabular-nums text-[#111111]">
                      {meta.formatMarkTag(draft.mcqMarks)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[9pt] text-[#374151]">
                    Answer all questions in this section. Each question carries
                    1 mark.
                  </p>
                </div>

                <div className="space-y-5">
                  {draft.mcqRows.map((row, idx) => {
                    const item = itemsById[row.id];
                    const questionNumber = idx + 1;
                    const figureNumber = figureNumberByQuestionId.get(row.id);

                    if (!item) {
                      return (
                        <article key={row.id} className="sp-exam-question">
                          <div className="text-[10pt] text-[#6B7280]">
                            Loading question {questionNumber}…
                          </div>
                        </article>
                      );
                    }

                    const optionsList = item.options ?? [];
                    const useCompactGrid =
                      shouldUseCompactOptionGrid(optionsList);

                    return (
                      <article key={row.id} className="sp-exam-question">
                        <div className="flex items-start gap-3">
                          <span className="w-7 shrink-0 pt-0.5 text-[10.5pt] font-bold tabular-nums text-[#111111]">
                            {questionNumber}.
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <MathText
                                text={item.stem}
                                block
                                className="flex-1 text-[10.5pt] leading-[1.48] text-[#111111]"
                              />
                              <span className="shrink-0 pt-0.5 text-[9.5pt] font-bold tabular-nums text-[#111111]">
                                {meta.formatMarkTag(item.totalMarks)}
                              </span>
                            </div>

                            {item.svgMarkup && (
                              <PrintSvgFigure
                                svgMarkup={item.svgMarkup}
                                scopeKey={`${scopePrefix}-q-${row.id}`}
                                figureNumber={figureNumber ?? questionNumber}
                                compact={isCompact}
                              />
                            )}

                            <div
                              className={
                                useCompactGrid
                                  ? 'mt-2.5 grid grid-cols-2 gap-x-6 gap-y-1.5'
                                  : 'mt-2.5 space-y-1.5'
                              }
                            >
                              {optionsList.map((opt, optIdx) => (
                                <div
                                  key={opt.label ?? optIdx}
                                  className="flex items-baseline gap-2 text-[10pt] leading-[1.42] text-[#111111]"
                                >
                                  <span className="w-5 shrink-0 font-bold text-[#111111]">
                                    {opt.label || OPTION_LETTERS[optIdx]}.
                                  </span>
                                  <MathText
                                    text={opt.text}
                                    className="min-w-0 flex-1"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {options.includeMcqBubbleSheet && (
                  <ExamMcqBubbleSheet
                    mcqCount={draft.mcqRows.length}
                    paperCode={draft.paperCode}
                    title={options.title}
                  />
                )}
              </section>
            )}

            {/* SECTION B: STRUCTURED QUESTIONS */}
            {draft.structuredRows.length > 0 && (
              <section
                className={
                  draft.mcqRows.length > 0
                    ? 'sp-exam-section sp-exam-section--break'
                    : 'sp-exam-section'
                }
              >
                <div className="mb-4 border-b-2 border-[#111111] pb-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-[11.5pt] font-extrabold text-[#111111]">
                      {meta.sectionBTitle}
                    </h2>
                    <span className="shrink-0 text-[9.5pt] font-bold tabular-nums text-[#111111]">
                      {meta.formatMarkTag(draft.structuredMarks)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[9pt] text-[#374151]">
                    Answer all questions in the spaces provided. Show clear
                    working and include units with every numerical answer.
                  </p>
                </div>

                <div className="space-y-7">
                  {draft.structuredRows.map((row, idx) => {
                    const item = itemsById[row.id];
                    const questionNumber = firstStructuredNumber + idx;
                    const figureNumber = figureNumberByQuestionId.get(row.id);

                    if (!item) {
                      return (
                        <article key={row.id} className="sp-exam-structured-q">
                          <div className="text-[10pt] text-[#6B7280]">
                            Loading question {questionNumber}…
                          </div>
                        </article>
                      );
                    }

                    const parts = item.parts ?? [];

                    return (
                      <article key={row.id} className="sp-exam-structured-q">
                        <div className="sp-exam-stem-block">
                          <div className="flex items-start gap-3">
                            <span className="w-7 shrink-0 pt-0.5 text-[10.5pt] font-bold tabular-nums text-[#111111]">
                              {questionNumber}.
                            </span>
                            <div className="min-w-0 flex-1">
                              <MathText
                                text={item.stem}
                                block
                                className="text-[10.5pt] leading-[1.48] text-[#111111]"
                              />

                              {item.svgMarkup && (
                                <PrintSvgFigure
                                  svgMarkup={item.svgMarkup}
                                  scopeKey={`${scopePrefix}-sq-${row.id}`}
                                  figureNumber={figureNumber ?? questionNumber}
                                  compact={isCompact}
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3.5 space-y-4 pl-7">
                          {parts.map((part) => {
                            const lineCount = estimateStructuredLineCount(
                              part.marks,
                              options.density
                            );
                            return (
                              <div key={part.partId} className="sp-exam-subpart">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 flex-1 items-start gap-2">
                                    <span className="shrink-0 font-bold text-[#111111]">
                                      ({part.partId})
                                    </span>
                                    <MathText
                                      text={part.prompt}
                                      block
                                      className="flex-1 text-[10.2pt] leading-[1.46] text-[#111111]"
                                    />
                                  </div>
                                  <span className="shrink-0 pt-0.5 text-[9.5pt] font-bold tabular-nums text-[#111111]">
                                    {meta.formatMarkTag(part.marks)}
                                  </span>
                                </div>

                                {/* Ruled answer lines */}
                                <div
                                  className="sp-exam-answer-lines"
                                  aria-hidden="true"
                                >
                                  {Array.from({ length: lineCount }).map(
                                    (_, lineIdx) => (
                                      <div
                                        key={lineIdx}
                                        className="sp-exam-answer-line"
                                      />
                                    )
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          <div className="border-t border-[#D1D5DB] pt-1 text-right text-[9pt] font-bold text-[#111111]">
                            (Total for Question {questionNumber} ={' '}
                            {item.totalMarks}{' '}
                            {item.totalMarks === 1 ? 'mark' : 'marks'})
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="mt-8 border-t-2 border-[#111111] pt-3 text-center">
              <p className="text-[9.5pt] font-extrabold tracking-[0.14em] text-[#111111] uppercase">
                End of Examination Paper
              </p>
              <p className="mt-0.5 text-[8.5pt] text-[#4B5563]">
                {draft.paperCode} · Generated with SixthPhysics (
                sixthphysics.github.io)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================
          EXAMINER MARK SCHEME & WORKED SOLUTIONS
          ================================================================= */}
      {showMarkScheme && (
        <section
          className={
            showQuestionPaper
              ? 'sp-exam-markscheme sp-exam-markscheme--break'
              : 'sp-exam-markscheme'
          }
        >
          <header className="mb-5 border-b-2 border-[#111111] pb-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[8.5pt] font-bold tracking-[0.1em] text-[#374151] uppercase">
                  Examiner Mark Scheme &amp; Worked Solutions
                </p>
                <h2 className="mt-0.5 text-[15pt] font-extrabold text-[#111111]">
                  {options.title}
                </h2>
                <p className="mt-0.5 text-[9pt] text-[#4B5563]">
                  {meta.levelBadge} · {draft.totalMarks} marks total ·{' '}
                  <MathText text={meta.gravityText} />
                </p>
              </div>
              <div className="shrink-0 border border-[#111111] bg-[#F3F4F6] px-3 py-1.5 text-right">
                <div className="font-mono text-[9.5pt] font-bold text-[#111111]">
                  {draft.paperCode}
                </div>
                <div className="text-[8pt] font-bold tracking-[0.06em] text-[#374151] uppercase">
                  Mark Scheme
                </div>
              </div>
            </div>
          </header>

          {/* Quick MCQ Answer Key Grid */}
          {draft.mcqRows.length > 0 && (
            <div className="mb-5 break-inside-avoid border border-[#111111] p-3">
              <h3 className="text-[9.5pt] font-bold tracking-[0.04em] text-[#111111] uppercase">
                Quick Answer Key — Multiple Choice ({draft.mcqMarks} marks)
              </h3>
              <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                {draft.mcqRows.map((row, idx) => {
                  const item = itemsById[row.id];
                  const correctIdx = item ? resolveOptionCorrectIndex(item) : 0;
                  const letter =
                    item?.options?.[correctIdx]?.label ??
                    OPTION_LETTERS[correctIdx];
                  return (
                    <div
                      key={row.id}
                      className="flex items-center justify-between border border-[#D1D5DB] bg-[#FAFAFA] px-2 py-1 text-[9pt]"
                    >
                      <span className="font-semibold tabular-nums text-[#4B5563]">
                        {idx + 1}
                      </span>
                      <span className="font-extrabold text-[#111111]">
                        {item ? letter : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detailed MCQ Explanations */}
          {draft.mcqRows.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2.5 border-b border-[#111111] pb-1 text-[10.5pt] font-extrabold text-[#111111]">
                {meta.sectionATitle} — Worked Explanations
              </h3>
              <div className="space-y-3">
                {draft.mcqRows.map((row, idx) => {
                  const item = itemsById[row.id];
                  if (!item) return null;
                  const correctIdx = resolveOptionCorrectIndex(item);
                  const correctOpt = item.options?.[correctIdx];
                  const letter =
                    correctOpt?.label ?? OPTION_LETTERS[correctIdx];
                  const distractorTraps = options.includeDistractorNotes
                    ? (item.options ?? []).filter(
                        (opt, optIdx) =>
                          optIdx !== correctIdx &&
                          Boolean(opt.distractorRationale?.trim())
                      )
                    : [];

                  return (
                    <div
                      key={row.id}
                      className="break-inside-avoid border-b border-[#E5E7EB] pb-2.5 text-[9.5pt]"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="font-bold text-[#111111]">
                          Q{idx + 1}. Correct answer: {letter}
                          {correctOpt ? (
                            <span className="font-normal">
                              {' '}
                              (
                              <MathText text={correctOpt.text} />)
                            </span>
                          ) : null}
                        </div>
                        <span className="shrink-0 font-mono text-[8.5pt] font-bold text-[#374151]">
                          {meta.formatMarkTag(item.totalMarks)}
                        </span>
                      </div>

                      <div className="mt-1 text-[#1F2937]">
                        <MathText text={item.workedSolution} block />
                      </div>

                      {distractorTraps.length > 0 && (
                        <div className="mt-1.5 pl-3 text-[8.5pt] text-[#4B5563]">
                          {distractorTraps.map((trap) => (
                            <div key={trap.label}>
                              <strong className="text-[#374151]">
                                Trap ({trap.label}):
                              </strong>{' '}
                              <MathText text={trap.distractorRationale ?? ''} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detailed Structured Mark Schemes */}
          {draft.structuredRows.length > 0 && (
            <div
              className={
                draft.mcqRows.length > 0 ? 'sp-exam-section--break' : ''
              }
            >
              <h3 className="mb-3 border-b border-[#111111] pb-1 text-[10.5pt] font-extrabold text-[#111111]">
                {meta.sectionBTitle} — Examiner Rubric &amp; Worked Solutions
              </h3>
              <div className="space-y-5">
                {draft.structuredRows.map((row, idx) => {
                  const item = itemsById[row.id];
                  const questionNumber = firstStructuredNumber + idx;
                  if (!item) return null;

                  const parts = item.parts ?? [];

                  return (
                    <div
                      key={row.id}
                      className="break-inside-avoid border border-[#D1D5DB] p-3"
                    >
                      <div className="flex items-baseline justify-between border-b border-[#111111] pb-1.5">
                        <h4 className="text-[10.5pt] font-extrabold text-[#111111]">
                          Question {questionNumber}
                        </h4>
                        <span className="text-[9pt] font-bold text-[#111111]">
                          Total: {item.totalMarks}{' '}
                          {item.totalMarks === 1 ? 'mark' : 'marks'}
                        </span>
                      </div>

                      {/* Examiner mark scheme table */}
                      {item.markScheme.length > 0 && (
                        <table className="mt-2.5 w-full border-collapse border border-[#9CA3AF] text-[9pt]">
                          <thead>
                            <tr className="bg-[#F3F4F6]">
                              <th className="w-12 border border-[#9CA3AF] px-2 py-1 text-left font-bold">
                                Part
                              </th>
                              <th className="w-14 border border-[#9CA3AF] px-2 py-1 text-center font-bold">
                                Code
                              </th>
                              <th className="border border-[#9CA3AF] px-2 py-1 text-left font-bold">
                                Marking Criterion
                              </th>
                              <th className="w-14 border border-[#9CA3AF] px-2 py-1 text-right font-bold">
                                Marks
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.markScheme.map((point, ptIdx) => (
                              <tr key={`${point.partId ?? 'all'}-${ptIdx}`}>
                                <td className="border border-[#9CA3AF] px-2 py-1 font-semibold">
                                  {point.partId ? `(${point.partId})` : '—'}
                                </td>
                                <td className="border border-[#9CA3AF] px-2 py-1 text-center font-mono font-bold">
                                  {point.code}
                                </td>
                                <td className="border border-[#9CA3AF] px-2 py-1">
                                  <MathText text={point.criterion} />
                                </td>
                                <td className="border border-[#9CA3AF] px-2 py-1 text-right font-bold tabular-nums">
                                  {point.marks}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {/* Worked solutions per part */}
                      {parts.length > 0 ? (
                        <div className="mt-2.5 space-y-1.5 text-[9pt] text-[#1F2937]">
                          {parts.map((part) => (
                            <div key={part.partId}>
                              <strong className="text-[#111111]">
                                ({part.partId}) Answer:
                              </strong>{' '}
                              <span className="font-semibold text-[#111111]">
                                <MathText text={part.expectedAnswer} />
                              </span>
                              {part.workingSteps &&
                                part.workingSteps.length > 0 && (
                                  <span className="text-[#374151]">
                                    {' '}
                                    —{' '}
                                    <MathText
                                      text={part.workingSteps.join(' ')}
                                    />
                                  </span>
                                )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2.5 text-[9pt] text-[#1F2937]">
                          <MathText text={item.workedSolution} block />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-7 border-t border-[#9CA3AF] pt-2.5 text-center text-[8.5pt] text-[#4B5563]">
            End of Mark Scheme · {draft.paperCode} · SixthPhysics
          </div>
        </section>
      )}
    </div>
  );
}
