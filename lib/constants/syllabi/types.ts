/**
 * Shared strict TypeScript types for SixthPhysics multi-syllabus mapping:
 * - IB Physics (First Assessment 2025, SL & HL)
 * - UK GCE A-Level Physics (DfE Core + AQA 7408 / OCR H556 / CIE 9702, Y12 & Y13)
 * - NCUK International Foundation Year Physics (IFYPH005)
 */

export const SYLLABUS_IDS = ['ib', 'alevel', 'ncuk'] as const;
export type SyllabusId = (typeof SYLLABUS_IDS)[number];

export type IBSyllabusLevel = 'SL' | 'HL';
export type ALevelSyllabusLevel = 'Y12' | 'Y13';
export type NCUKSyllabusLevel = 'IFY' | 'IFY-S1' | 'IFY-S2';

export type SyllabusLevel =
  | IBSyllabusLevel
  | ALevelSyllabusLevel
  | NCUKSyllabusLevel;

export const VISUAL_FAMILY_HINTS = [
  'graphs',
  'circuits',
  'fields',
  'mechanics',
  'waves',
  'optics-shm',
  'thermal',
  'grav-astro',
  'em-induction',
  'quantum-nuclear',
] as const;

export type VisualFamilyHint = (typeof VISUAL_FAMILY_HINTS)[number];

export const QUESTION_FORMATS = ['mcq', 'structured'] as const;
export type QuestionFormat = (typeof QUESTION_FORMATS)[number];

export interface EquationVariableSpec {
  symbol: string;
  meaning: string;
  siUnit: string;
}

export interface EquationSpec {
  id: string;
  label: string;
  latex: string;
  plainText: string;
  siUnitsSummary: string;
  inDataBooklet: boolean;
  level: SyllabusLevel;
  variables?: EquationVariableSpec[];
  notes?: string;
}

export interface SubtopicSpec {
  id: string;
  code: string;
  title: string;
  syllabus: SyllabusId;
  /** Minimum/entry level where this subtopic is introduced (e.g. 'SL' vs 'HL' for HL-only; 'Y12' vs 'Y13'). */
  level: SyllabusLevel;
  /** All levels within the syllabus that assess this subtopic (e.g. ['SL', 'HL'] for core, ['HL'] for HL-only). */
  levelsCovered: SyllabusLevel[];
  /** Canonical physics concept cluster IDs shared with CrosswalkEntry.conceptId. */
  canonicalConcepts: string[];
  equations: EquationSpec[];
  siUnits: string[];
  quantitativeSkills: string[];
  qualitativeSkills: string[];
  visualFamilies: VisualFamilyHint[];
  questionFormats: QuestionFormat[];
  /** Explicit HL-only or advanced extension points within a shared core subtopic. */
  hlExtensions?: string[];
  /** Whether this subtopic belongs to an optional module (e.g. AQA Sections 9-13). */
  isOption?: boolean;
  /** Awarding-board overlap, sign convention, or boundary notes. */
  boardNotes?: string;
}

export interface SyllabusTopicSpec {
  id: string;
  code: string;
  title: string;
  syllabus: SyllabusId;
  levelsCovered: SyllabusLevel[];
  summary: string;
  teachingHours?: {
    sl?: number;
    hl?: number;
    guided?: number;
    independent?: number;
  };
  isOption?: boolean;
  boardOverlapNotes?: string;
  subtopics: SubtopicSpec[];
}

export interface AssessmentPaperSpec {
  paperId: string;
  title: string;
  levels: SyllabusLevel[];
  formats: QuestionFormat[];
  durationMinutes: number;
  maxMarks: number;
  weightingPercent: number;
  calculatorAllowed: boolean;
  dataBookletProvided: boolean;
  notes: string;
}

export interface SyllabusConventionsSpec {
  gravitationalAccelerationStandard: string;
  unitFormattingStyle: string;
  significantFiguresRule: string;
  uncertaintyAndGraphConventions: string[];
  signConventions: string[];
}

export interface SyllabusSpecificationCatalogue {
  syllabus: SyllabusId;
  title: string;
  awardingBody: string;
  specificationCode: string;
  specificationVersion: string;
  levels: SyllabusLevel[];
  papers: AssessmentPaperSpec[];
  conventions: SyllabusConventionsSpec;
  topics: SyllabusTopicSpec[];
}

export interface CrosswalkSyllabusMapping {
  syllabus: SyllabusId;
  included: boolean;
  levels: SyllabusLevel[];
  topicIds: string[];
  subtopicIds: string[];
  questionFormats: QuestionFormat[];
  equationsUsed: string[];
  assumptionAndSignNotes: string;
  calculusOrExponentialRequired?: boolean;
  relativisticRequired?: boolean;
}

export interface CrosswalkEntry {
  conceptId: string;
  title: string;
  domain: string;
  summary: string;
  primaryVisualFamily: VisualFamilyHint;
  supportingVisualFamilies?: VisualFamilyHint[];
  questionFormats: QuestionFormat[];
  mappings: Record<SyllabusId, CrosswalkSyllabusMapping>;
  sharedCoreSummary: string;
  divergenceNotes: string[];
}

export interface GeneratableSlice {
  conceptId: string;
  conceptTitle: string;
  syllabus: SyllabusId;
  level: SyllabusLevel;
  topicId: string;
  subtopicId: string;
  visualFamily: VisualFamilyHint;
  format: QuestionFormat;
  assumptionNotes: string;
}
