import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExamPaperSheet } from '@/components/sixthphysics/exam-paper-sheet';
import { PdfPaperStudio } from '@/components/sixthphysics/pdf-paper-studio';
import { TopNav } from '@/components/sixthphysics/top-nav';
import {
  buildExamPaperDraft,
  createDefaultExamPaperOptions,
  getFallbackManifest,
  getFallbackQuestions,
  type PublicBankItem,
} from '@/lib/sixthphysics-web';

describe('ExamPaperSheet and PdfPaperStudio components', () => {
  const manifest = getFallbackManifest();
  const fallbackItems = getFallbackQuestions();
  const itemsById: Record<string, PublicBankItem> = Object.fromEntries(
    fallbackItems.map((item) => [item.id, item])
  );

  it('renders an authentic IB Physics Question Paper + Mark Scheme with zero KaTeX errors', () => {
    const draft = buildExamPaperDraft(manifest, {
      syllabus: 'ib',
      level: 'all',
      formatMode: 'mixed',
      mcqCount: 3,
      structuredCount: 2,
      difficultyMix: 'exam-mix',
      seed: 1001,
    });
    const options = createDefaultExamPaperOptions('ib', 'HL', 'mixed');

    const html = renderToStaticMarkup(
      <ExamPaperSheet
        draft={draft}
        itemsById={itemsById}
        options={options}
        mode="both"
      />
    );

    expect(html).toContain('Candidate session number');
    expect(html).toContain('Instructions to candidates');
    expect(html).toContain('Multiple-Choice Answer Grid');
    expect(html).toContain('End of Examination Paper');
    expect(html).toContain('Examiner Mark Scheme');
    expect(html).toContain('Quick Answer Key');
    expect(html).toContain(draft.paperCode);
    expect(html).not.toContain('katex-error');
  });

  it('renders UK A-Level cover with For Examiner Use table and g = 9.81', () => {
    const draft = buildExamPaperDraft(manifest, {
      syllabus: 'alevel',
      level: 'all',
      formatMode: 'mixed',
      mcqCount: 2,
      structuredCount: 2,
      difficultyMix: 'exam-mix',
      seed: 2002,
    });
    const options = createDefaultExamPaperOptions('alevel', 'Y13', 'mixed');

    const html = renderToStaticMarkup(
      <ExamPaperSheet
        draft={draft}
        itemsById={itemsById}
        options={options}
        mode="paper"
      />
    );

    expect(html).toContain('Please write clearly in block capitals.');
    expect(html).toContain('For Examiner&#x27;s Use');
    expect(html).toContain('9.81');
    expect(html).not.toContain('Examiner Mark Scheme');
    expect(html).not.toContain('katex-error');
  });

  it('renders NCUK IFYPH005 cover table and standalone Mark Scheme mode cleanly', () => {
    const draft = buildExamPaperDraft(manifest, {
      syllabus: 'ncuk',
      level: 'all',
      formatMode: 'mixed',
      mcqCount: 2,
      structuredCount: 2,
      difficultyMix: 'exam-mix',
      seed: 3003,
    });
    const options = createDefaultExamPaperOptions('ncuk', 'IFY', 'mixed');

    const paperHtml = renderToStaticMarkup(
      <ExamPaperSheet
        draft={draft}
        itemsById={itemsById}
        options={options}
        mode="paper"
      />
    );
    expect(paperHtml).toContain('IFYPH005 PHYSICS');
    expect(paperHtml).toContain('Study Centre');

    const msHtml = renderToStaticMarkup(
      <ExamPaperSheet
        draft={draft}
        itemsById={itemsById}
        options={options}
        mode="markscheme"
      />
    );
    expect(msHtml).toContain('Examiner Mark Scheme');
    expect(msHtml).not.toContain('Study Centre');
    expect(msHtml).not.toContain('katex-error');
  });

  it('renders PdfPaperStudio and TopNav PDF paper tab cleanly', () => {
    const studioHtml = renderToStaticMarkup(
      <PdfPaperStudio
        manifest={manifest}
        activeSyllabus="ib"
        activeLevel="HL"
        topics={manifest.syllabi.ib.topics}
      />
    );
    expect(studioHtml).toContain('Exam-style PDF mock paper maker');
    expect(studioHtml).toContain('Save Question Paper PDF');
    expect(studioHtml).toContain('Mark Scheme PDF');
    expect(studioHtml).toContain('Full Pack');
    expect(studioHtml).toContain('Quick templates');

    const navHtml = renderToStaticMarkup(
      <TopNav
        activeSyllabus="ib"
        activeLevel="HL"
        workspaceMode="pdf"
        totalBankItems={7643}
        theme="light"
        onSelectSyllabus={() => {}}
        onSelectLevel={() => {}}
        onSelectWorkspaceMode={() => {}}
        onOpenFormulaDrawer={() => {}}
        onToggleTheme={() => {}}
      />
    );
    expect(navHtml).toContain('PDF');
    expect(navHtml).toContain('paper');
  });
});
