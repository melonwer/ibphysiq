import {
  GateDiagnosticIssue,
  MarkSchemePoint,
  McqOptionItem,
  PhysicsDomainId,
  QuestionDifficulty,
  QuestionFormat,
  QuestionTargetMode,
  StructuredQuestionPart,
  SyllabusId,
  SyllabusTag,
  VerifiedQuantityMap,
} from "@/lib/bank-pipeline/types";

export const SIXTHPHYSICS_BENCHMARK_SCHEMA_VERSION =
  "sixthphysics-benchmark-report/1.0.0" as const;

export const NOVEL_BENCHMARK_PROMPT_SCHEMA_VERSION =
  "sixthphysics-novel-prompt/1.0.0" as const;

export type Step1ErrorStage =
  | "json-parse"
  | "step1-schema"
  | "domain-mismatch"
  | "unknown-domain"
  | "scenario-validation"
  | "solver"
  | "svg-render"
  | "svg-sanity"
  | "svg-leak";

export interface Step1ProposalInput {
  id: string;
  domain?: string;
  assistantStep1Raw: string;
}

export interface ParsedStep1Proposal {
  action?: string;
  domain?: string;
  scenarioSpec: Record<string, unknown>;
  hiddenQuantities: string[];
  questionPlan: {
    targetSummary: string;
    distractorStrategy?: string[];
    subpartStrategy?: string[];
    assumptions?: string[];
  };
}

export interface PhysicsHarnessToolReceipt {
  status: "verified";
  solverId: string;
  domain: PhysicsDomainId;
  verifiedQuantities: VerifiedQuantityMap;
  formattedQuantities3sf: Record<string, string>;
  hiddenQuantities: string[];
  visualReceipt: {
    rendered: boolean;
    visualFamily: string;
    publicLabels: string[];
    svgFingerprint: string | null;
  };
}

export interface Step1BatchSuccessReceipt {
  id: string;
  domain: PhysicsDomainId;
  valid: true;
  jsonValid: true;
  solverId: string;
  visualFamily: string;
  toolReceiptJson: string;
  verifiedQuantities: VerifiedQuantityMap;
  formattedQuantities3sf: Record<string, string>;
  hiddenQuantities: string[];
  svgMarkup?: string;
  parsedProposal: ParsedStep1Proposal;
}

export interface Step1BatchFailureReceipt {
  id: string;
  domain?: string;
  valid: false;
  jsonValid: boolean;
  errorStage: Step1ErrorStage;
  errorMessage: string;
}

export type Step1BatchReceipt =
  | Step1BatchSuccessReceipt
  | Step1BatchFailureReceipt;

export type SyllabusAlignmentIssueCode =
  | "empty-syllabi"
  | "invalid-syllabus-id"
  | "invalid-level-for-syllabus"
  | "unknown-topic-id"
  | "topic-syllabus-mismatch"
  | "unknown-subtopic-id"
  | "subtopic-topic-mismatch"
  | "level-leakage"
  | "unknown-concept-id"
  | "concept-excluded-from-syllabus"
  | "concept-level-mismatch"
  | "concept-subtopic-mismatch"
  | "retired-ib-2016-exclusion"
  | "gravity-convention-mismatch"
  | "paper-format-disallowed"
  | "paper-marks-out-of-bounds";

export interface SyllabusAlignmentIssue {
  code: SyllabusAlignmentIssueCode;
  syllabus?: SyllabusId;
  level?: string;
  message: string;
}

export interface SyllabusAlignmentCheckInput {
  id?: string;
  syllabi: readonly SyllabusTag[];
  conceptId?: string;
  domain?: string;
  format: QuestionFormat;
  totalMarks?: number;
  scenarioSpec?: Record<string, unknown>;
  stem?: string;
  parts?: readonly { prompt?: string; expectedAnswer?: string; marks?: number }[];
  options?: readonly { label?: string; text?: string; isCorrect?: boolean }[];
  workedSolution?: string;
  markScheme?: readonly { code?: string; criterion?: string; marks?: number }[];
}

export interface SyllabusAlignmentCheckResult {
  aligned: boolean;
  issues: SyllabusAlignmentIssue[];
  checkedSyllabi: SyllabusId[];
}

export interface BenchmarkPromptMetadata {
  id: string;
  syllabi: SyllabusTag[];
  domain: PhysicsDomainId;
  conceptId: string;
  templateArchetype: string;
  visualFamily: string;
  format: QuestionFormat;
  difficulty: QuestionDifficulty;
  totalMarks: number;
  seed: number;
  split?: string;
  familyGroupKey?: string;
}

export interface ModelRolloutRecord {
  id?: string;
  itemId?: string;
  traceId?: string;
  domain?: string;
  assistantStep1Raw?: string;
  toolReceiptRaw?: string;
  assistantStep2Raw?: string;
  /** Optional retry telemetry if recorded by closed-loop inference runner */
  attemptsUsed?: number;
  mode?: "zero-retry" | "one-retry" | "teacher-forced-step2" | string;
  /** Optional inline prompt metadata when not supplied via --split-file */
  promptMetadata?: Partial<BenchmarkPromptMetadata>;
}

export interface ParsedStep2Package {
  format?: QuestionFormat;
  difficulty?: QuestionDifficulty;
  stem: string;
  options?: McqOptionItem[];
  correctOptionIndex?: number;
  parts?: StructuredQuestionPart[];
  targetMode?: QuestionTargetMode;
  targetQuantityKey?: string;
  workedSolution: string;
  markScheme: MarkSchemePoint[];
  totalMarks: number;
}

export interface ItemRolloutEvaluation {
  id: string;
  itemId: string;
  domain: PhysicsDomainId;
  conceptId: string;
  templateArchetype: string;
  format: QuestionFormat;
  difficulty: QuestionDifficulty;
  syllabi: SyllabusTag[];
  seed: number;
  step1JsonValid: boolean;
  step1SolverPass: boolean;
  step1ErrorStage?: Step1ErrorStage;
  step1ErrorMessage?: string;
  step2JsonValid: boolean;
  step2AuthorGatePass: boolean;
  inferredTargetKeys: string[];
  gateIssues: GateDiagnosticIssue[];
  syllabusAligned: boolean;
  syllabusIssues: SyllabusAlignmentIssue[];
  endToEndVerified: boolean;
  stemText?: string;
  stemFingerprint?: string;
  parameterSignature?: string;
}

export interface WilsonConfidenceInterval {
  successes: number;
  total: number;
  rate: number;
  lower95: number;
  upper95: number;
  confidenceLevel: 0.95;
}

export interface StratifiedMetricsBucket {
  stratum: string;
  count: number;
  step1JsonValid: WilsonConfidenceInterval;
  step1SolverPass: WilsonConfidenceInterval;
  step2JsonValid: WilsonConfidenceInterval;
  step2AuthorGatePass: WilsonConfidenceInterval;
  syllabusAlignment: WilsonConfidenceInterval;
  endToEndVerified: WilsonConfidenceInterval;
  conditionalStep2PassGivenStep1: WilsonConfidenceInterval;
}

export interface DiversityMetrics {
  evaluatedCount: number;
  nonEmptyStemCount: number;
  uniqueExactStemCount: number;
  uniqueStemFingerprintCount: number;
  uniqueFingerprintRatio: number;
  nearDuplicatePairRate: number;
  meanPairwise3GramJaccardDistance: number;
  uniqueParameterSignatureCount: number;
  uniqueParameterSignatureRatio: number;
}

export interface FailureBreakdownSummary {
  step1ByStage: Record<string, number>;
  gateIssuesByCode: Record<string, number>;
  syllabusIssuesByCode: Record<string, number>;
}

export interface BenchmarkEvaluationReport {
  schemaVersion: typeof SIXTHPHYSICS_BENCHMARK_SCHEMA_VERSION;
  evaluatedAt: string;
  rolloutsSource?: string;
  splitSource?: string;
  totalPrompts: number;
  evaluatedRollouts: number;
  missingRolloutIds: string[];
  headline: {
    step1JsonValidRate: number;
    step1SolverPassRate: number;
    step2JsonValidRate: number;
    step2AuthorGatePassRate: number;
    syllabusAlignmentRate: number;
    endToEndVerifiedRate: number;
    conditionalStep2AuthorPassRate: number;
  };
  overall: StratifiedMetricsBucket;
  bySyllabus: Record<string, StratifiedMetricsBucket>;
  bySyllabusLevel: Record<string, StratifiedMetricsBucket>;
  byDomain: Record<string, StratifiedMetricsBucket>;
  byFormat: Record<string, StratifiedMetricsBucket>;
  byDifficulty: Record<string, StratifiedMetricsBucket>;
  diversity: DiversityMetrics;
  failureBreakdown: FailureBreakdownSummary;
  sampleDiagnostics: {
    verifiedSampleIds: string[];
    failedSamples: Array<{
      id: string;
      domain: string;
      format: string;
      step1ErrorStage?: string;
      step1ErrorMessage?: string;
      gateIssueCodes: string[];
      syllabusIssueCodes: string[];
    }>;
  };
}

export interface NovelBenchmarkPromptRecord {
  schemaVersion: typeof NOVEL_BENCHMARK_PROMPT_SCHEMA_VERSION;
  id: string;
  itemId: string;
  traceId: string;
  targetModel: "Qwen/Qwen3.5-9B";
  split: "novel";
  familyGroupKey: string;
  seed: number;
  messages: [
    { role: "system"; content: string },
    { role: "user"; content: string },
  ];
  metadata: {
    syllabi: [SyllabusTag];
    domain: PhysicsDomainId;
    conceptId: string;
    conceptTitle: string;
    templateArchetype: string;
    visualFamily: string;
    format: QuestionFormat;
    difficulty: QuestionDifficulty;
    totalMarks: number;
    gravityConventionMs2: 9.8 | 9.81;
  };
}
