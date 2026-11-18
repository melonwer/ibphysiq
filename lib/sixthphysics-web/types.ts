import type {
  McqOptionItem,
  McqOptionLabel,
  MarkSchemePoint,
  PhysicsDomainId,
  QuestionDifficulty,
  QuestionFormat,
  QuestionTargetMode,
  StructuredQuestionPart,
  SyllabusId,
  SyllabusTag,
} from "@/lib/bank-pipeline/types";
import {
  MCQ_OPTION_LABELS,
  PHYSICS_DOMAIN_IDS,
  QUESTION_DIFFICULTIES,
  QUESTION_FORMATS,
  SYLLABUS_IDS,
} from "@/lib/bank-pipeline/types";
import type { SyllabusLevel } from "@/lib/constants/syllabi/types";

export {
  MCQ_OPTION_LABELS,
  PHYSICS_DOMAIN_IDS,
  QUESTION_DIFFICULTIES,
  QUESTION_FORMATS,
  SYLLABUS_IDS,
};

export type {
  McqOptionItem,
  McqOptionLabel,
  MarkSchemePoint,
  PhysicsDomainId,
  QuestionDifficulty,
  QuestionFormat,
  QuestionTargetMode,
  StructuredQuestionPart,
  SyllabusId,
  SyllabusLevel,
  SyllabusTag,
};

export const PUBLIC_BANK_MANIFEST_SCHEMA_VERSION =
  "sixthphysics-public-manifest/1.0.0" as const;

export const PUBLIC_BANK_CHUNK_SCHEMA_VERSION =
  "sixthphysics-public-chunk/1.0.0" as const;

export const STUDENT_PROGRESS_STORAGE_KEY = "sixthphysics.progress.v1" as const;

export type QuestionCardMode = "practice" | "mock-live" | "mock-review";

export type QuestionStatusFilter = "all" | "unseen" | "needs-review" | "saved";

/**
 * Student-facing verified question item served to sixthphysics.github.io.
 * Strips heavy internal solver `verifiedQuantities` and provenance hashes.
 */
export interface PublicBankItem {
  id: string;
  syllabi: SyllabusTag[];
  format: QuestionFormat;
  difficulty: QuestionDifficulty;
  visualFamily: string;
  stem: string;
  svgMarkup?: string;
  options?: McqOptionItem[];
  correctOptionIndex?: 0 | 1 | 2 | 3;
  parts?: StructuredQuestionPart[];
  workedSolution: string;
  markScheme: MarkSchemePoint[];
  totalMarks: number;
  conceptId: string;
  familyGroupKey: string;
}

/**
 * Compact per-question metadata row in `manifest.json` for instant client-side
 * filtering, topic mastery aggregation, and mock paper assembly before chunk fetch.
 */
export interface PublicQuestionIndexRow {
  id: string;
  syllabi: SyllabusTag[];
  format: QuestionFormat;
  difficulty: QuestionDifficulty;
  visualFamily: string;
  totalMarks: number;
  hasSvg: boolean;
  chunkKey: PhysicsDomainId;
  conceptId: string;
  familyGroupKey: string;
}

export interface PublicSubtopicSummary {
  id: string;
  code: string;
  title: string;
  level: SyllabusLevel;
  levelsCovered: SyllabusLevel[];
  isOption?: boolean;
  questionCount: number;
  mcqCount: number;
  structuredCount: number;
  countsByLevel: Record<string, number>;
}

export interface PublicTopicSummary {
  id: string;
  code: string;
  title: string;
  syllabus: SyllabusId;
  levelsCovered: SyllabusLevel[];
  isOption?: boolean;
  questionCount: number;
  mcqCount: number;
  structuredCount: number;
  countsByLevel: Record<string, number>;
  subtopics: PublicSubtopicSummary[];
}

export interface PublicSyllabusSummary {
  syllabus: SyllabusId;
  title: string;
  shortLabel: string;
  specificationCode: string;
  levels: SyllabusLevel[];
  /** e.g. "g = 9.8 m s⁻²" for IB vs "g = 9.81 m s⁻²" for UK A-Level and NCUK IFY */
  gravityConvention: string;
  questionCount: number;
  mcqCount: number;
  structuredCount: number;
  countsByLevel: Record<string, number>;
  topics: PublicTopicSummary[];
}

export interface PublicDomainChunkSummary {
  chunkKey: PhysicsDomainId;
  itemCount: number;
}

export interface PublicBankManifest {
  schemaVersion: typeof PUBLIC_BANK_MANIFEST_SCHEMA_VERSION;
  generatedAt: string;
  totalItems: number;
  syllabi: Record<SyllabusId, PublicSyllabusSummary>;
  items: PublicQuestionIndexRow[];
  chunks?: Record<PhysicsDomainId, PublicDomainChunkSummary>;
}

export interface PublicBankChunkFile {
  schemaVersion: typeof PUBLIC_BANK_CHUNK_SCHEMA_VERSION;
  chunkKey: PhysicsDomainId;
  generatedAt: string;
  itemCount: number;
  items: PublicBankItem[];
}

export interface QuestionFilterCriteria {
  syllabus: SyllabusId;
  /** Specific level (e.g. "SL", "HL", "Y12", "Y13", "IFY", "IFY-S1", "IFY-S2") or "all" / undefined */
  level?: string;
  /** Topic ID (e.g. "ib-theme-c") or "all" / undefined */
  topicId?: string;
  /** Subtopic ID (e.g. "ib-c3-wave-phenomena") or "all" / undefined */
  subtopicId?: string;
  format?: QuestionFormat | "all";
  difficulty?: QuestionDifficulty | "all";
  status?: QuestionStatusFilter;
  visualFamily?: string | "all";
  onlyWithSvg?: boolean;
  searchQuery?: string;
}

export interface QuestionAttemptRecord {
  questionId: string;
  format: QuestionFormat;
  earnedMarks: number;
  totalMarks: number;
  /** 0..3 index selected by student for MCQs */
  selectedOptionIndex?: number;
  /** True for exact MCQ match or structured score >= 70% of totalMarks */
  isCorrect: boolean;
  /** Checked rubric criterion keys for Paper 2 structured self-marking */
  checkedCriterionKeys?: string[];
  /** Student scratchpad notes keyed by partId */
  partNotes?: Record<string, string>;
  attemptCount: number;
  updatedAt: string;
  needsReview: boolean;
}

export interface QuestionAttemptInput {
  questionId: string;
  format: QuestionFormat;
  earnedMarks: number;
  totalMarks: number;
  selectedOptionIndex?: number;
  isCorrect?: boolean;
  checkedCriterionKeys?: string[];
  partNotes?: Record<string, string>;
}

export interface DailyStreakState {
  currentDays: number;
  longestDays: number;
  lastActiveDate: string | null;
  activeDates: string[];
}

export interface StudentProgressState {
  schemaVersion: typeof STUDENT_PROGRESS_STORAGE_KEY;
  attempts: Record<string, QuestionAttemptRecord>;
  bookmarkedIds: string[];
  streak: DailyStreakState;
  activeFilters: QuestionFilterCriteria;
  lastQuestionIdBySyllabus: Partial<Record<SyllabusId, string>>;
  completedMockCount: number;
  updatedAt: string;
}

export interface TopicMasteryStat {
  syllabus: SyllabusId;
  topicId: string;
  totalQuestions: number;
  attemptedCount: number;
  masteredCount: number;
  needsReviewCount: number;
  savedCount: number;
  earnedMarksTotal: number;
  possibleMarksTotal: number;
  /** 0..100 mark accuracy across attempted questions in this topic */
  accuracyPercent: number;
  /** 0..100 share of total questions in this topic mastered so far */
  coveragePercent: number;
}

export type MockPaperFormatMode = "mcq" | "structured" | "mixed";

export interface MockPaperPreset {
  id: string;
  syllabus: SyllabusId;
  title: string;
  subtitle: string;
  badgeLabel: string;
  formatMode: MockPaperFormatMode;
  level?: string;
  questionCount: number;
  targetTotalMarks?: number;
  durationMinutes: number;
  mcqCount?: number;
  structuredCount?: number;
}

export interface MockPaperConfig {
  presetId?: string;
  title: string;
  syllabus: SyllabusId;
  level?: string;
  topicIds?: string[];
  difficulty?: QuestionDifficulty | "all";
  formatMode: MockPaperFormatMode;
  questionCount: number;
  targetTotalMarks?: number;
  durationMinutes: number;
  mcqCount?: number;
  structuredCount?: number;
  seed?: number;
  excludeQuestionIds?: string[];
}

export interface MockQuestionResponse {
  questionId: string;
  selectedOptionIndex?: number;
  partNotes?: Record<string, string>;
  checkedCriterionKeys?: string[];
  selfMarkedEarnedMarks?: number;
  isSelfMarked?: boolean;
  flagged: boolean;
}

export type MockSessionStatus = "live" | "paused" | "review" | "completed";

export interface MockPaperSession {
  sessionId: string;
  config: MockPaperConfig;
  questionRows: PublicQuestionIndexRow[];
  questionIds: string[];
  totalMarks: number;
  durationSeconds: number;
  remainingSeconds: number;
  status: MockSessionStatus;
  currentIndex: number;
  responses: Record<string, MockQuestionResponse>;
  startedAt: string;
  submittedAt?: string;
}

export interface MockTopicBreakdown {
  topicId: string;
  topicCode: string;
  topicTitle: string;
  questionCount: number;
  answeredCount: number;
  earnedMarks: number;
  totalMarks: number;
  accuracyPercent: number;
}

export interface MockPaperResultSummary {
  totalQuestions: number;
  answeredCount: number;
  unmarkedStructuredCount: number;
  earnedMarks: number;
  totalMarks: number;
  percentage: number;
  mcqCorrect: number;
  mcqTotal: number;
  structuredEarnedMarks: number;
  structuredTotalMarks: number;
  topicBreakdown: MockTopicBreakdown[];
  weakTopicIds: string[];
}
