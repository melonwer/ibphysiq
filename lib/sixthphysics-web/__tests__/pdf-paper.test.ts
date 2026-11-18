import {
  buildDefaultPaperTitle,
  buildExamPaperDraft,
  buildExamPaperDraftFromSession,
  buildExamPdfFilename,
  buildMockPaperSession,
  calculateRecommendedMinutes,
  createDefaultExamPaperOptions,
  estimateExamPaperPages,
  estimateStructuredLineCount,
  getDefaultPresetForSyllabus,
  getExamPaperPresetsForSyllabus,
  getFallbackManifest,
  getSyllabusExamMetadata,
  moveQuestionInDraft,
  removeQuestionFromDraft,
  selectBookletEquationsForPaper,
  swapQuestionInDraft,
  type SyllabusId,
} from '@/lib/sixthphysics-web';

describe('pdf-paper generator logic', () => {
  const manifest = getFallbackManifest();

  it('provides four course-matched presets for every syllabus', () => {
    const syllabi: SyllabusId[] = ['ib', 'alevel', 'ncuk'];
    for (const syllabus of syllabi) {
      const presets = getExamPaperPresetsForSyllabus(syllabus);
      expect(presets).toHaveLength(4);
      const recommended = getDefaultPresetForSyllabus(syllabus);
      expect(recommended.syllabus).toBe(syllabus);
      expect(recommended.recommended).toBe(true);
    }
  });

  it('builds a family-deduplicated mixed paper with deterministic seed', () => {
    const draftA = buildExamPaperDraft(manifest, {
      syllabus: 'ib',
      level: 'all',
      formatMode: 'mixed',
      mcqCount: 4,
      structuredCount: 2,
      difficultyMix: 'exam-mix',
      seed: 123456,
    });
    const draftB = buildExamPaperDraft(manifest, {
      syllabus: 'ib',
      level: 'all',
      formatMode: 'mixed',
      mcqCount: 4,
      structuredCount: 2,
      difficultyMix: 'exam-mix',
      seed: 123456,
    });

    expect(draftA.questionRows.map((r) => r.id)).toEqual(
      draftB.questionRows.map((r) => r.id)
    );
    expect(draftA.paperCode).toBe(draftB.paperCode);
    expect(draftA.paperCode).toMatch(/^SP-IB25-[A-Z0-9]{4}$/);

    const uniqueFamilies = new Set(
      draftA.questionRows.map((r) => r.familyGroupKey)
    );
    expect(uniqueFamilies.size).toBe(draftA.questionRows.length);
    expect(draftA.mcqRows.length).toBeGreaterThan(0);
    expect(draftA.structuredRows.length).toBeGreaterThan(0);
    expect(draftA.totalMarks).toBe(draftA.mcqMarks + draftA.structuredMarks);
  });

  it('respects formatMode mcq-only and structured-only', () => {
    const mcqOnly = buildExamPaperDraft(manifest, {
      syllabus: 'alevel',
      formatMode: 'mcq',
      mcqCount: 5,
      structuredCount: 4,
      difficultyMix: 'exam-mix',
      seed: 99,
    });
    expect(mcqOnly.structuredRows).toHaveLength(0);
    expect(mcqOnly.mcqRows.length).toBeGreaterThan(0);

    const structuredOnly = buildExamPaperDraft(manifest, {
      syllabus: 'ncuk',
      formatMode: 'structured',
      mcqCount: 10,
      structuredCount: 3,
      difficultyMix: 'exam-mix',
      seed: 99,
    });
    expect(structuredOnly.mcqRows).toHaveLength(0);
    expect(structuredOnly.structuredRows.length).toBeGreaterThan(0);
  });

  it('swaps, moves, and removes questions while preserving uniqueness and invariants', () => {
    const draft = buildExamPaperDraft(manifest, {
      syllabus: 'ib',
      formatMode: 'mixed',
      mcqCount: 3,
      structuredCount: 2,
      difficultyMix: 'exam-mix',
      seed: 4242,
    });

    expect(draft.questionRows.length).toBeGreaterThanOrEqual(3);

    const swapped = swapQuestionInDraft(manifest, draft, 0, 7777);
    if (swapped) {
      expect(swapped.questionRows).toHaveLength(draft.questionRows.length);
      expect(swapped.questionRows[0].id).not.toBe(draft.questionRows[0].id);
      const famSet = new Set(swapped.questionRows.map((r) => r.familyGroupKey));
      expect(famSet.size).toBe(swapped.questionRows.length);
    }

    const moved = moveQuestionInDraft(draft, 0, 1);
    expect(moved.questionRows[0].id).toBe(draft.questionRows[1].id);
    expect(moved.questionRows[1].id).toBe(draft.questionRows[0].id);

    const removed = removeQuestionFromDraft(draft, 0);
    expect(removed.questionRows).toHaveLength(draft.questionRows.length - 1);

    // Refuses to remove the last remaining question
    let single = removed;
    while (single.questionRows.length > 1) {
      single = removeQuestionFromDraft(single, 0);
    }
    expect(single.questionRows).toHaveLength(1);
    expect(removeQuestionFromDraft(single, 0).questionRows).toHaveLength(1);
  });

  it('converts an interactive MockPaperSession cleanly into an ExamPaperDraft', () => {
    const session = buildMockPaperSession(manifest, {
      title: 'IB HL Custom Mock',
      syllabus: 'ib',
      level: 'all',
      formatMode: 'mixed',
      questionCount: 5,
      durationMinutes: 35,
      seed: 888,
    });

    const draft = buildExamPaperDraftFromSession(session);
    expect(draft.questionRows.map((r) => r.id)).toEqual(session.questionIds);
    expect(draft.totalMarks).toBe(session.totalMarks);
    expect(draft.durationMinutes).toBe(35);
    expect(draft.syllabus).toBe('ib');
  });

  it('calculates smart timing, line counts, page estimates, and safe PDF filenames', () => {
    const draft = buildExamPaperDraft(manifest, {
      syllabus: 'alevel',
      formatMode: 'mixed',
      mcqCount: 4,
      structuredCount: 2,
      difficultyMix: 'exam-mix',
      seed: 101,
    });

    const mins = calculateRecommendedMinutes(draft.questionRows);
    expect(mins).toBeGreaterThanOrEqual(10);
    expect(mins % 5).toBe(0);

    expect(estimateStructuredLineCount(1, 'exam-lines')).toBe(3);
    expect(estimateStructuredLineCount(3, 'exam-lines')).toBe(7);
    expect(estimateStructuredLineCount(3, 'compact')).toBeLessThan(
      estimateStructuredLineCount(3, 'exam-lines')
    );

    const opts = createDefaultExamPaperOptions('alevel', 'Y13', 'mixed');
    const pages = estimateExamPaperPages(draft, opts);
    expect(pages).toBeGreaterThanOrEqual(3);

    const paperFile = buildExamPdfFilename(
      draft,
      'A-Level Physics · Y13 · Core Mock Paper',
      'paper'
    );
    const msFile = buildExamPdfFilename(
      draft,
      'A-Level Physics · Y13 · Core Mock Paper',
      'markscheme'
    );
    expect(paperFile).toContain(draft.paperCode);
    expect(paperFile).toMatch(/Question-Paper$/);
    expect(msFile).toMatch(/Mark-Scheme$/);
    expect(paperFile).not.toMatch(/[·/:*?"<>|]/);
  });

  it('returns course-accurate gravity conventions and mark brackets for all three syllabi', () => {
    const ib = getSyllabusExamMetadata(
      'ib',
      'HL',
      { mcqCount: 10, structuredCount: 3, totalMarks: 28 },
      true
    );
    expect(ib.gravityText).toContain('9.8 m');
    expect(ib.formatMarkTag(3)).toBe('[3]');

    const alevel = getSyllabusExamMetadata(
      'alevel',
      'Y13',
      { mcqCount: 10, structuredCount: 3, totalMarks: 28 },
      true
    );
    expect(alevel.gravityText).toContain('9.81 m');
    expect(alevel.formatMarkTag(1)).toBe('[1 mark]');
    expect(alevel.formatMarkTag(3)).toBe('[3 marks]');

    const ncuk = getSyllabusExamMetadata(
      'ncuk',
      'IFY-S1',
      { mcqCount: 10, structuredCount: 3, totalMarks: 28 },
      false
    );
    expect(ncuk.gravityText).toContain('9.81 m');
    expect(ncuk.formatMarkTag(2)).toBe('(2 marks)');
    expect(buildDefaultPaperTitle('ncuk', 'IFY-S1', 'mcq')).toContain('S1');
  });

  it('selects only in-booklet equations matching the paper topics and level', () => {
    const ibSlGroups = selectBookletEquationsForPaper(
      'ib',
      'SL',
      ['ib-theme-a', 'ib-theme-c'],
      4
    );
    expect(ibSlGroups.length).toBeGreaterThan(0);
    for (const group of ibSlGroups) {
      expect(['ib-theme-a', 'ib-theme-c']).toContain(group.topicId);
      for (const eq of group.equations) {
        expect(eq.inDataBooklet).toBe(true);
        expect(eq.level).toBe('SL');
      }
    }
  });
});
