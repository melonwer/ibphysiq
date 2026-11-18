import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  isInteractiveTypingTarget,
  McqInteraction,
  resolveCorrectOptionIndex,
  resolveMcqShortcutAction,
  shouldUseCompactOptionGrid,
} from '@/components/sixthphysics/mcq-interaction';
import {
  formatDifficultyLabel,
  formatFriendlyTopicLabel,
  formatMarksLabel,
  formatSyllabusBadgeLabel,
  QuestionCard,
  resolveQuestionBreadcrumb,
} from '@/components/sixthphysics/question-card';
import {
  calculateRubricTally,
  getMarkSchemeCriterionKey,
  StructuredInteraction,
} from '@/components/sixthphysics/structured-interaction';
import {
  countActiveNonDefaultFilters,
  formatCompactTopicCode,
  formatCompactTopicTitle,
  resolveCountForLevel,
  TopicRail,
} from '@/components/sixthphysics/topic-rail';
import type {
  PublicBankItem,
  PublicTopicSummary,
  QuestionFilterCriteria,
  TopicMasteryStat,
} from '@/lib/sixthphysics-web/types';

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 140"><defs><marker id="arrow" markerWidth="8" markerHeight="8"><path d="M0,0 L8,4 L0,8 Z"/></marker></defs><line x1="20" y1="70" x2="280" y2="70" stroke="#111827" marker-end="url(#arrow)"/></svg>`;

const SAMPLE_MCQ_ITEM: PublicBankItem = {
  id: 'waves-diffraction-grating-mcq-185',
  familyGroupKey:
    'single-slit-diffraction-gratings::grating-lines-per-mm-diffraction-angle',
  conceptId: 'single-slit-diffraction-gratings',
  syllabi: [
    {
      syllabus: 'ib',
      level: 'HL',
      topicId: 'ib-theme-c',
      subtopicId: 'ib-c3-wave-phenomena',
    },
    {
      syllabus: 'alevel',
      level: 'Y13',
      topicId: 'alevel-sec3-waves',
      subtopicId: 'alevel-3-3-2-refraction-diffraction-interference',
    },
    {
      syllabus: 'ncuk',
      level: 'IFY',
      topicId: 'ncuk-ac6',
      subtopicId: 'ncuk-ac6-4',
    },
  ],
  format: 'mcq',
  difficulty: 'standard',
  visualFamily: 'waves',
  stem: 'Monochromatic light of wavelength 460 nm strikes a transmission grating ruled with 400 lines mm⁻¹. At what angle θ from the normal is the n = 3 maximum observed?',
  svgMarkup: SAMPLE_SVG,
  options: [
    {
      label: 'A',
      text: '3.16°',
      isCorrect: false,
      distractorRationale:
        'Misconverts lines mm⁻¹ to lines m⁻¹ by a factor of 100 instead of 1000.',
    },
    {
      label: 'B',
      text: '10.6°',
      isCorrect: false,
      distractorRationale:
        'Computes the first-order (n = 1) diffraction angle instead of n = 3.',
    },
    {
      label: 'C',
      text: '28.9°',
      isCorrect: false,
      distractorRationale:
        'Applies small-angle tan θ = nλ / d instead of exact sin θ = nλ / d.',
    },
    {
      label: 'D',
      text: '33.5°',
      isCorrect: true,
    },
  ],
  correctOptionIndex: 3,
  workedSolution:
    'Grating spacing d = 10⁻³ / 400 = 2.50 × 10⁻⁶ m. Using d sin θ = nλ gives sin θ = 0.552, so θ = 33.5°.',
  markScheme: [
    {
      code: 'A1',
      criterion: 'Converts d = 10⁻³ / N and solves d sin θ = nλ to get 33.5°.',
      marks: 1,
    },
  ],
  totalMarks: 1,
};

const SAMPLE_STRUCTURED_ITEM: PublicBankItem = {
  id: 'waves-diffraction-grating-structured-199',
  familyGroupKey:
    'single-slit-diffraction-gratings::grating-lines-per-mm-diffraction-angle',
  conceptId: 'single-slit-diffraction-gratings',
  syllabi: [
    {
      syllabus: 'ib',
      level: 'HL',
      topicId: 'ib-theme-c',
      subtopicId: 'ib-c3-wave-phenomena',
    },
    {
      syllabus: 'alevel',
      level: 'Y12',
      topicId: 'alevel-sec3-waves',
      subtopicId: 'alevel-3-3-2-refraction-diffraction-interference',
    },
    {
      syllabus: 'ncuk',
      level: 'IFY',
      topicId: 'ncuk-ac6',
      subtopicId: 'ncuk-ac6-4',
    },
  ],
  format: 'structured',
  difficulty: 'higher',
  visualFamily: 'waves',
  stem: 'A normal-incidence beam of wavelength 430 nm strikes a grating with 300 lines mm⁻¹ placed 1.6 m from a planar screen.',
  svgMarkup: SAMPLE_SVG,
  parts: [
    {
      partId: 'a',
      prompt: 'Calculate the slit spacing d in metres.',
      marks: 1,
      expectedAnswer: '3.33 × 10⁻⁶ m',
      workingSteps: ['d = 10⁻³ / 300 = 3.33 × 10⁻⁶ m.'],
    },
    {
      partId: 'b',
      prompt: 'Calculate the diffraction angle θ_3 of the n = 3 maximum.',
      marks: 2,
      dependsOnPartIds: ['a'],
      expectedAnswer: '22.8°',
      workingSteps: ['sin θ = 3λ / d = 0.387 => θ = 22.8°.'],
    },
    {
      partId: 'c',
      prompt: 'Determine the screen distance y from n = 0 to n = 3.',
      marks: 3,
      dependsOnPartIds: ['b'],
      expectedAnswer: '0.672 m',
      workingSteps: ['Use exact geometry y = D tan θ = 1.6 × tan(22.8°) = 0.672 m.'],
    },
  ],
  workedSolution:
    '(a) d = 3.33 × 10⁻⁶ m. (b) θ = 22.8°. (c) y = D tan θ = 0.672 m.',
  markScheme: [
    {
      code: 'A1',
      partId: 'a',
      criterion: 'Obtains d = 3.33 × 10⁻⁶ m.',
      marks: 1,
    },
    {
      code: 'M1',
      partId: 'b',
      criterion: 'Uses sin θ = nλ / d.',
      marks: 1,
    },
    {
      code: 'A1',
      partId: 'b',
      criterion: 'Obtains θ = 22.8°.',
      marks: 1,
    },
    {
      code: 'M1',
      partId: 'c',
      criterion: 'Recognises large-angle geometry y = D tan θ.',
      marks: 2,
    },
    {
      code: 'A1',
      partId: 'c',
      criterion: 'Obtains y = 0.672 m.',
      marks: 1,
    },
  ],
  totalMarks: 6,
};

const SAMPLE_TOPICS: PublicTopicSummary[] = [
  {
    id: 'ib-tools',
    code: 'Tools',
    title: 'Tools for Physics: Measurement, Uncertainties and Graphical Analysis',
    syllabus: 'ib',
    levelsCovered: ['SL', 'HL'],
    questionCount: 114,
    mcqCount: 74,
    structuredCount: 40,
    countsByLevel: { SL: 80, HL: 34 },
    subtopics: [],
  },
  {
    id: 'ib-theme-c',
    code: 'Theme C',
    title: 'Wave behaviour',
    syllabus: 'ib',
    levelsCovered: ['SL', 'HL'],
    questionCount: 520,
    mcqCount: 340,
    structuredCount: 180,
    countsByLevel: { SL: 210, HL: 310 },
    subtopics: [
      {
        id: 'ib-c1-shm',
        code: 'C.1',
        title: 'Simple harmonic motion',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        questionCount: 95,
        mcqCount: 62,
        structuredCount: 33,
        countsByLevel: { SL: 55, HL: 40 },
      },
      {
        id: 'ib-c3-wave-phenomena',
        code: 'C.3',
        title: 'Wave phenomena',
        level: 'SL',
        levelsCovered: ['SL', 'HL'],
        questionCount: 132,
        mcqCount: 86,
        structuredCount: 46,
        countsByLevel: { SL: 42, HL: 90 },
      },
    ],
  },
];

describe('TopicRail & filter helpers', () => {
  it('formats syllabus topic codes and titles concisely', () => {
    expect(formatCompactTopicCode('Section 4 (3.4)')).toBe('Section 4');
    expect(formatCompactTopicCode('Sections 9-13 (Options)')).toBe('Options');
    expect(formatCompactTopicCode('AC6 / LO6')).toBe('AC6');
    expect(formatCompactTopicCode('Theme C')).toBe('Theme C');

    expect(
      formatCompactTopicTitle(
        'Further mechanics and thermal physics (A-Level / Year 13 only)'
      )
    ).toBe('Further mechanics and thermal physics');
  });

  it('resolves level-specific question counts and active filter counts', () => {
    expect(resolveCountForLevel(SAMPLE_TOPICS[1], 'all')).toBe(520);
    expect(resolveCountForLevel(SAMPLE_TOPICS[1], 'HL')).toBe(310);

    const baseFilters: QuestionFilterCriteria = {
      syllabus: 'ib',
      format: 'all',
      difficulty: 'all',
      status: 'all',
      topicId: 'all',
    };
    expect(countActiveNonDefaultFilters(baseFilters)).toBe(0);
    expect(
      countActiveNonDefaultFilters({
        ...baseFilters,
        format: 'mcq',
        status: 'needs-review',
        topicId: 'ib-theme-c',
      })
    ).toBe(3);
  });

  it('renders TopicRail with filter controls, mastery bars, and expanded subtopics', () => {
    const mastery: Record<string, TopicMasteryStat> = {
      'ib-theme-c': {
        syllabus: 'ib',
        topicId: 'ib-theme-c',
        totalQuestions: 520,
        attemptedCount: 200,
        masteredCount: 156,
        needsReviewCount: 44,
        savedCount: 12,
        earnedMarksTotal: 210,
        possibleMarksTotal: 260,
        accuracyPercent: 81,
        coveragePercent: 30,
      },
    };

    const html = renderToStaticMarkup(
      <TopicRail
        activeSyllabus="ib"
        topics={SAMPLE_TOPICS}
        topicMastery={mastery}
        filteredQuestionCount={132}
        filters={{
          syllabus: 'ib',
          topicId: 'ib-theme-c',
          subtopicId: 'ib-c3-wave-phenomena',
          format: 'mcq',
          difficulty: 'standard',
          status: 'unseen',
        }}
        onChangeFilters={() => undefined}
      />
    );

    expect(html).toContain('Filter questions');
    expect(html).toContain('MCQ');
    expect(html).toContain('Written');
    expect(html).toContain('Easy');
    expect(html).toContain('Medium');
    expect(html).toContain('Hard');
    expect(html).toContain('Unseen');
    expect(html).toContain('Needs review');
    expect(html).toContain('Saved');
    expect(html).toContain('Theme C');
    expect(html).toContain('Wave behaviour');
    expect(html).toContain('C.3 Wave phenomena');
    expect(html).toContain('Theme C mastery 30%');
    expect(html).toContain('520');
  });
});

describe('McqInteraction & shortcut mechanics', () => {
  it('resolves correct option index and keyboard shortcuts accurately while ignoring typing targets', () => {
    expect(resolveCorrectOptionIndex(SAMPLE_MCQ_ITEM)).toBe(3);

    expect(
      resolveMcqShortcutAction({
        key: 'b',
        mode: 'practice',
        optionCount: 4,
        selectedOptionIndex: null,
        isChecked: false,
        hasNextQuestion: true,
      })
    ).toEqual({ type: 'select', optionIndex: 1 });

    expect(
      resolveMcqShortcutAction({
        key: '4',
        mode: 'mock-live',
        optionCount: 4,
        selectedOptionIndex: 0,
        isChecked: false,
        hasNextQuestion: false,
      })
    ).toEqual({ type: 'select', optionIndex: 3 });

    expect(
      resolveMcqShortcutAction({
        key: 'Enter',
        mode: 'practice',
        optionCount: 4,
        selectedOptionIndex: 2,
        isChecked: false,
        hasNextQuestion: true,
      })
    ).toEqual({ type: 'check' });

    expect(
      resolveMcqShortcutAction({
        key: 'ArrowRight',
        mode: 'practice',
        optionCount: 4,
        selectedOptionIndex: 3,
        isChecked: true,
        hasNextQuestion: true,
      })
    ).toEqual({ type: 'next' });

    expect(
      resolveMcqShortcutAction({
        key: 'n',
        mode: 'practice',
        optionCount: 4,
        selectedOptionIndex: 3,
        isChecked: true,
        hasNextQuestion: true,
      })
    ).toEqual({ type: 'next' });

    // Ignored when typing in an input/textarea or with modifier keys
    expect(
      resolveMcqShortcutAction({
        key: 'a',
        isTypingTarget: true,
        mode: 'practice',
        optionCount: 4,
        selectedOptionIndex: null,
        isChecked: false,
        hasNextQuestion: true,
      })
    ).toBeNull();

    expect(
      resolveMcqShortcutAction({
        key: 'c',
        ctrlKey: true,
        mode: 'practice',
        optionCount: 4,
        selectedOptionIndex: null,
        isChecked: false,
        hasNextQuestion: true,
      })
    ).toBeNull();

    expect(isInteractiveTypingTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isInteractiveTypingTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isInteractiveTypingTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
  });

  it('shows inline Common trap and worked solution when a distractor is checked in practice mode', () => {
    const html = renderToStaticMarkup(
      <McqInteraction
        item={SAMPLE_MCQ_ITEM}
        mode="practice"
        defaultSelectedOptionIndex={2}
        defaultChecked={true}
        onNextQuestion={() => undefined}
      />
    );

    expect(html).toContain('Common trap:');
    expect(html).toContain('small-angle');
    expect(html).toContain('Correct answer');
    expect(html).toContain('Your choice');
    expect(html).toContain('Worked solution &amp; mark scheme');
    expect(html).toContain('Next question');
    expect(html).toContain('Not quite. The answer is D.');
    expect(html).toContain('data-layout="grid"');
    expect(html).not.toContain('Select');
  });

  it('celebrates a correct pick and uses a 2x2 grid only for compact options', () => {
    const html = renderToStaticMarkup(
      <McqInteraction
        item={SAMPLE_MCQ_ITEM}
        mode="practice"
        defaultSelectedOptionIndex={3}
        defaultChecked={true}
      />
    );
    expect(html).toContain('Spot on!');
    expect(html).toContain('Your answer');
    expect(html).not.toContain('Common trap');

    expect(shouldUseCompactOptionGrid(SAMPLE_MCQ_ITEM.options ?? [])).toBe(true);
    expect(
      shouldUseCompactOptionGrid([
        { text: '$4.03 \\times 10^{3}\\,\\text{N}$' },
        { text: '7.82 × 10³ N' },
        { text: '8.63 × 10³ N' },
        { text: '9.53 × 10³ N' },
      ])
    ).toBe(true);
    expect(
      shouldUseCompactOptionGrid([
        { text: 'The tension exceeds the weight because the bob accelerates upward' },
        { text: 'B' },
        { text: 'C' },
        { text: 'D' },
      ])
    ).toBe(false);
  });

  it('offers a primary Check answer only once an option is picked, with no shortcut legend', () => {
    const idleHtml = renderToStaticMarkup(
      <McqInteraction item={SAMPLE_MCQ_ITEM} mode="practice" onNextQuestion={() => undefined} />
    );
    expect(idleHtml).toContain('Check answer');
    expect(idleHtml).toContain('Skip');
    expect(idleHtml).toContain('sp-key--idle');
    expect(idleHtml).not.toContain('Enter');

    const readyHtml = renderToStaticMarkup(
      <McqInteraction item={SAMPLE_MCQ_ITEM} mode="practice" defaultSelectedOptionIndex={1} />
    );
    expect(readyHtml).toContain('sp-key--primary');
  });

  it('leaks zero answer, trap, or mark scheme details in mock-live mode', () => {
    const html = renderToStaticMarkup(
      <McqInteraction
        item={SAMPLE_MCQ_ITEM}
        mode="mock-live"
        selectedOptionIndex={2}
      />
    );

    expect(html).toContain('aria-checked="true"');
    expect(html).not.toContain('Common trap');
    expect(html).not.toContain('small-angle');
    expect(html).not.toContain('Correct answer');
    expect(html).not.toContain('Check answer');
    expect(html).not.toContain('Worked solution');
    expect(html).not.toContain('2.50');
  });
});

describe('StructuredInteraction & Examiner Rubric Checklist', () => {
  it('tallies earnedMarks / totalMarks accurately across multi-mark criteria', () => {
    const keys = [
      getMarkSchemeCriterionKey(SAMPLE_STRUCTURED_ITEM.markScheme[0], 0), // A1 (a): 1 mark
      getMarkSchemeCriterionKey(SAMPLE_STRUCTURED_ITEM.markScheme[3], 3), // M1 (c): 2 marks
      getMarkSchemeCriterionKey(SAMPLE_STRUCTURED_ITEM.markScheme[4], 4), // A1 (c): 1 mark
    ];

    const partial = calculateRubricTally(
      SAMPLE_STRUCTURED_ITEM.markScheme,
      keys,
      SAMPLE_STRUCTURED_ITEM.totalMarks
    );
    expect(partial).toEqual({
      earnedMarks: 4,
      totalMarks: 6,
      isCorrect: false, // 4/6 = 66.7% < 70%
    });

    const passingKeys = [
      ...keys,
      getMarkSchemeCriterionKey(SAMPLE_STRUCTURED_ITEM.markScheme[1], 1), // +1 => 5/6 = 83.3%
    ];
    const passing = calculateRubricTally(
      SAMPLE_STRUCTURED_ITEM.markScheme,
      passingKeys,
      SAMPLE_STRUCTURED_ITEM.totalMarks
    );
    expect(passing).toEqual({
      earnedMarks: 5,
      totalMarks: 6,
      isCorrect: true,
    });
  });

  it('renders subparts and scratchpads without leaking answers before marking or in mock-live', () => {
    const practiceBeforeHtml = renderToStaticMarkup(
      <StructuredInteraction item={SAMPLE_STRUCTURED_ITEM} mode="practice" />
    );

    expect(practiceBeforeHtml).toContain('(a)');
    expect(practiceBeforeHtml).toContain('(b)');
    expect(practiceBeforeHtml).toContain('(c)');
    expect(practiceBeforeHtml).toContain('3 marks');
    expect(practiceBeforeHtml).not.toContain('[3 marks]');
    expect(practiceBeforeHtml).toContain(
      'Jot your working or value before marking...'
    );
    expect(practiceBeforeHtml).toContain('Mark my answer');
    expect(practiceBeforeHtml).not.toContain('0.672 m');
    expect(practiceBeforeHtml).not.toContain('Examiner mark scheme');

    const mockLiveHtml = renderToStaticMarkup(
      <StructuredInteraction
        item={SAMPLE_STRUCTURED_ITEM}
        mode="mock-live"
        partNotes={{ a: 'd = 3.33e-6 m' }}
      />
    );
    expect(mockLiveHtml).toContain('d = 3.33e-6 m');
    expect(mockLiveHtml).not.toContain('Mark my answer');
    expect(mockLiveHtml).not.toContain('0.672 m');
    expect(mockLiveHtml).not.toContain('Examiner mark scheme');
  });

  it('reveals verified answers and interactive M1/A1 rubric in mock-review and revealed practice modes', () => {
    const checked = [
      getMarkSchemeCriterionKey(SAMPLE_STRUCTURED_ITEM.markScheme[0], 0),
      getMarkSchemeCriterionKey(SAMPLE_STRUCTURED_ITEM.markScheme[3], 3),
    ];

    const html = renderToStaticMarkup(
      <StructuredInteraction
        item={SAMPLE_STRUCTURED_ITEM}
        mode="mock-review"
        checkedCriterionKeys={checked}
        partNotes={{ a: '3.33 x 10^-6 m' }}
      />
    );

    expect(html).toContain('Verified answer:');
    expect(html).toContain('0.672 m');
    expect(html).toContain('Examiner mark scheme');
    expect(html).toContain('3 / 6 marks');
    expect(html).toContain('M1');
    expect(html).toContain('A1');
  });
});

describe('QuestionCard exam sheet integration', () => {
  it('formats syllabus badges, difficulty labels, and official breadcrumbs cleanly', () => {
    expect(
      formatSyllabusBadgeLabel({
        syllabus: 'ib',
        level: 'HL',
        topicId: 'ib-theme-c',
      })
    ).toBe('IB HL');
    expect(
      formatSyllabusBadgeLabel({
        syllabus: 'alevel',
        level: 'Y13',
        topicId: 'alevel-sec3-waves',
      })
    ).toBe('A-Level Y13');
    expect(
      formatSyllabusBadgeLabel({
        syllabus: 'ncuk',
        level: 'IFY',
        topicId: 'ncuk-ac6',
      })
    ).toBe('NCUK IFY');
    expect(formatDifficultyLabel('higher')).toBe('Hard');
    expect(formatDifficultyLabel('standard')).toBe('Medium');
    expect(formatDifficultyLabel('foundation')).toBe('Easy');
    expect(formatMarksLabel(1)).toBe('1 mark');
    expect(formatMarksLabel(4)).toBe('4 marks');
    expect(
      formatFriendlyTopicLabel(
        '3.6.1 Circular Motion, Simple Harmonic Motion, Resonance and Damping'
      )
    ).toBe('Circular Motion & SHM');
    expect(formatFriendlyTopicLabel('C.3 Wave phenomena')).toBe('Wave phenomena');
    expect(
      formatFriendlyTopicLabel(
        'Special Relativity: Lorentz Transformations, Time Dilation, Length Contraction and Spacetime'
      )
    ).toBe('Special Relativity');

    const bc = resolveQuestionBreadcrumb(SAMPLE_MCQ_ITEM, 'ib');
    expect(bc.topicLabel).toContain('Theme C');
    expect(bc.subtopicLabel).toContain('C.3');

    const alevelBcWithTopics = resolveQuestionBreadcrumb(
      SAMPLE_MCQ_ITEM,
      'alevel',
      [
        {
          id: 'alevel-sec3-waves',
          code: 'Section 3 (3.3)',
          title: 'Waves (A-Level / Year 13 only)',
          syllabus: 'alevel',
          levelsCovered: ['Y12', 'Y13'],
          questionCount: 500,
          mcqCount: 300,
          structuredCount: 200,
          countsByLevel: { Y12: 200, Y13: 300 },
          subtopics: [],
        },
      ]
    );
    expect(alevelBcWithTopics.topicLabel).toBe('Section 3: Waves');

    const ncukBcWithTopics = resolveQuestionBreadcrumb(
      SAMPLE_MCQ_ITEM,
      'ncuk',
      [
        {
          id: 'ncuk-ac6',
          code: 'AC6 / LO6',
          title: 'Oscillations and Waves',
          syllabus: 'ncuk',
          levelsCovered: ['IFY'],
          questionCount: 400,
          mcqCount: 250,
          structuredCount: 150,
          countsByLevel: { IFY: 400 },
          subtopics: [],
        },
      ]
    );
    expect(ncukBcWithTopics.topicLabel).toBe('AC6: Oscillations and Waves');
  });

  it('renders full QuestionCard header, scoped SVG figure plate, and clean typography without AI-slop labels', () => {
    const html = renderToStaticMarkup(
      <QuestionCard
        item={SAMPLE_MCQ_ITEM}
        mode="practice"
        activeSyllabus="ib"
        questionNumber={1}
        totalQuestions={6448}
        isBookmarked={true}
        onToggleBookmark={() => undefined}
      />
    );

    expect(html).toContain('Question 1 of 6,448');
    expect(html).toContain('Wave phenomena');
    expect(html).toContain('Medium');
    expect(html).toContain('1 mark');
    expect(html).not.toContain('[1 mark]');
    expect(html).not.toContain('NCUK IFY');
    expect(html).not.toContain('C.3 Wave');
    expect(html).toContain('Saved');
    expect(html).toContain('Expand diagram');
    expect(html).toContain('sp-fig-waves-diffraction-grating-mcq-185');
    expect(html).not.toMatch(/[A-Z]{3,}\s+—\s+/);
    expect(html).not.toContain('Next question →');
  });
});
