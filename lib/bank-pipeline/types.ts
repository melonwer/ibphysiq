export const SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION =
  "sixthphysics-bank-item/1.0.0" as const;
export const QWEN_DISTILLATION_TRACE_SCHEMA_VERSION =
  "qwen-distillation-trace/1.0.0" as const;
export const SHARD_RECORD_SCHEMA_VERSION =
  "sixthphysics-shard-record/1.0.0" as const;
export const FROZEN_EVAL_MANIFEST_SCHEMA_VERSION =
  "sixthphysics-frozen-eval-manifest/1.0.0" as const;
export const WORK_ORDER_MANIFEST_SCHEMA_VERSION =
  "sixthphysics-work-order-manifest/1.0.0" as const;
export const COMPILED_BANK_SUMMARY_SCHEMA_VERSION =
  "sixthphysics-compiled-summary/1.0.0" as const;

export const SYLLABUS_IDS = ["ib", "alevel", "ncuk"] as const;
export type SyllabusId = (typeof SYLLABUS_IDS)[number];

export const QUESTION_FORMATS = ["mcq", "structured"] as const;
export type QuestionFormat = (typeof QUESTION_FORMATS)[number];

export const QUESTION_DIFFICULTIES = [
  "foundation",
  "standard",
  "higher",
] as const;
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

export const DATASET_SPLITS = ["train", "val", "test"] as const;
export type DatasetSplit = (typeof DATASET_SPLITS)[number];

export const PHYSICS_DOMAIN_IDS = [
  "graphs",
  "circuits",
  "fields",
  "mechanics",
  "waves",
  "optics-shm",
  "thermal",
  "grav-astro",
  "em-induction",
  "quantum-nuclear",
  "pure-calculation",
] as const;
export type PhysicsDomainId = (typeof PHYSICS_DOMAIN_IDS)[number];

export const MCQ_OPTION_LABELS = ["A", "B", "C", "D"] as const;
export type McqOptionLabel = (typeof MCQ_OPTION_LABELS)[number];

export type QuestionTargetMode = "quantitative" | "qualitative";

export type VerifiedScalar = number | string | boolean;
export type VerifiedQuantityMap = Record<string, VerifiedScalar>;

export interface SyllabusTag {
  syllabus: SyllabusId;
  level: string;
  topicId: string;
  subtopicId?: string;
}

export interface McqOptionItem {
  label: McqOptionLabel;
  text: string;
  isCorrect: boolean;
  distractorRationale?: string;
}

export interface StructuredQuestionPart {
  partId: string;
  prompt: string;
  marks: number;
  dependsOnPartIds?: string[];
  targetMode?: QuestionTargetMode;
  targetQuantityKey?: string;
  expectedAnswer: string;
  workingSteps: string[];
}

export interface MarkSchemePoint {
  code: string;
  criterion: string;
  marks: number;
  partId?: string;
}

export interface BankItemProvenance {
  domain: PhysicsDomainId;
  conceptId: string;
  templateArchetype: string;
  familyGroupKey: string;
  seed: number;
  shardId: string;
  generatorModel: string;
  solverId: string;
  rendererVersion?: string;
  stemFingerprint: string;
  svgFingerprint?: string;
  split: DatasetSplit;
  sourceParentId?: string;
  createdAt: string;
}

/**
 * Compact, student-ready verified question package for sixthphysics.github.io.
 */
export interface SixthPhysicsBankItem {
  schemaVersion: typeof SIXTHPHYSICS_BANK_ITEM_SCHEMA_VERSION;
  id: string;
  familyGroupKey: string;
  syllabi: SyllabusTag[];
  format: QuestionFormat;
  difficulty: QuestionDifficulty;
  visualFamily: string;
  stem: string;
  svgMarkup?: string;
  options?: [McqOptionItem, McqOptionItem, McqOptionItem, McqOptionItem];
  correctOptionIndex?: 0 | 1 | 2 | 3;
  parts?: StructuredQuestionPart[];
  workedSolution: string;
  markScheme: MarkSchemePoint[];
  totalMarks: number;
  verifiedQuantities: VerifiedQuantityMap;
  provenance: BankItemProvenance;
}

export interface DistillationSystemMessage {
  role: "system";
  content: string;
}

export interface DistillationUserRequestMessage {
  role: "user";
  content: string;
}

export interface DistillationAssistantScenarioMessage {
  role: "assistant";
  step: "propose_scenario";
  content: string;
  toolCall: {
    id: string;
    name: "solve_and_render_scenario";
    argumentsJson: string;
  };
}

export interface DistillationToolReceiptMessage {
  role: "tool";
  name: "physics_harness";
  toolCallId: string;
  content: string;
}

export interface DistillationAssistantPackageMessage {
  role: "assistant";
  step: "author_package";
  content: string;
}

export type QwenDistillationMessageTuple = [
  DistillationSystemMessage,
  DistillationUserRequestMessage,
  DistillationAssistantScenarioMessage,
  DistillationToolReceiptMessage,
  DistillationAssistantPackageMessage,
];

export interface QwenDistillationMetadata {
  syllabi: SyllabusTag[];
  domain: PhysicsDomainId;
  conceptId: string;
  templateArchetype: string;
  visualFamily: string;
  format: QuestionFormat;
  difficulty: QuestionDifficulty;
  totalMarks: number;
  shardId: string;
  teacherModel: string;
  solverId: string;
  sourceParentId?: string;
  createdAt: string;
}

/**
 * Two-step neuro-symbolic harness SFT record for Qwen/Qwen3.5-9B QLoRA distillation:
 *   1. system
 *   2. user_request_spec
 *   3. assistant_scenario_tool_or_json (ScenarioSpec + QuestionPlan)
 *   4. tool_verified_physics_receipt (deterministic solver + SVG receipt)
 *   5. assistant_authored_package (final verified question + mark scheme)
 */
export interface QwenDistillationTrace {
  schemaVersion: typeof QWEN_DISTILLATION_TRACE_SCHEMA_VERSION;
  traceId: string;
  itemId: string;
  targetModel: "Qwen/Qwen3.5-9B";
  messages: QwenDistillationMessageTuple;
  split: DatasetSplit;
  familyGroupKey: string;
  seed: number;
  metadata: QwenDistillationMetadata;
}

export interface RequiredGivenSpec {
  name: string;
  value: number;
  unit?: string;
  source?: "stem" | "svg" | "either";
}

export interface CandidateQuestionPlan {
  targetSummary: string;
  distractorStrategy?: string[];
  subpartStrategy?: string[];
  assumptions?: string[];
}

export interface CandidateQuestionInput {
  id: string;
  conceptId: string;
  templateArchetype: string;
  sourceParentId?: string;
  seed: number;
  syllabi: SyllabusTag[];
  format: QuestionFormat;
  difficulty: QuestionDifficulty;
  domain: PhysicsDomainId;
  scenarioSpec: Record<string, unknown>;
  hiddenQuantities: string[];
  requiredGivens?: RequiredGivenSpec[];
  questionPlan?: CandidateQuestionPlan;
  stem: string;
  options?: McqOptionItem[];
  targetMode?: QuestionTargetMode;
  targetQuantityKey?: string;
  parts?: StructuredQuestionPart[];
  workedSolution: string;
  markScheme: MarkSchemePoint[];
  totalMarks: number;
  generatorModel?: string;
  svgMarkupOverride?: string;
}

export type GateRejectionCode =
  | "invalid-candidate-schema"
  | "unknown-domain"
  | "scenario-validation-failed"
  | "solver-error"
  | "non-finite-solver-output"
  | "svg-render-error"
  | "svg-xml-invalid"
  | "svg-answer-leak"
  | "missing-required-given"
  | "stem-answer-leak"
  | "ground-truth-mismatch"
  | "mcq-invalid-options"
  | "mcq-duplicate-options"
  | "mcq-non-unique-correct"
  | "mcq-distractor-matches-answer"
  | "mcq-missing-distractor-rationale"
  | "structured-invalid-parts"
  | "structured-dependency-invalid"
  | "mark-sum-mismatch"
  | "mark-scheme-coverage-mismatch"
  | "near-duplicate-stem"
  | "split-contamination";

export interface GateDiagnosticIssue {
  code: GateRejectionCode;
  stage:
    | "schema"
    | "solver"
    | "svg"
    | "givens"
    | "ground-truth"
    | "mcq"
    | "structured"
    | "mark-scheme"
    | "deduplication"
    | "split";
  message: string;
  expected?: string | number;
  actual?: string | number;
  repairHint?: string;
}

export interface PackageGateEvaluation {
  valid: boolean;
  passedChecks: string[];
  issues: GateDiagnosticIssue[];
  stemFingerprint: string;
  svgFingerprint?: string;
}

export interface VerifiedShardRecord {
  schemaVersion: typeof SHARD_RECORD_SCHEMA_VERSION;
  shardId: string;
  ingestedAt: string;
  bankItem: SixthPhysicsBankItem;
  distillationTrace: QwenDistillationTrace;
  gateChecksPassed: string[];
}

export interface ShardAttemptTelemetry {
  shardId: string;
  attemptedAt: string;
  totalCandidates: number;
  ingestedCount: number;
  alreadyPresentCount: number;
  rejectedCount: number;
  rejectionCountsByCode: Partial<Record<GateRejectionCode, number>>;
}

export interface SplitRatios {
  train: number;
  val: number;
  test: number;
}

export interface FrozenEvaluationManifest {
  schemaVersion: typeof FROZEN_EVAL_MANIFEST_SCHEMA_VERSION;
  createdAt: string;
  salt: string;
  ratios: SplitRatios;
  lockHeldOut: boolean;
  frozenGroups: Record<string, DatasetSplit>;
  heldOutItemIds: {
    val: string[];
    test: string[];
  };
  manifestSha256: string;
}

export interface WorkOrderSlice {
  shardId: string;
  syllabus: SyllabusId;
  level: string;
  topicId: string;
  subtopicId?: string;
  conceptId: string;
  conceptTitle?: string;
  domain: PhysicsDomainId;
  visualFamily: string;
  format: QuestionFormat;
  difficultyCounts: Record<QuestionDifficulty, number>;
  targetCount: number;
  seedRange: [number, number];
  assumptionNotes?: string;
}

export interface WorkOrderManifest {
  schemaVersion: typeof WORK_ORDER_MANIFEST_SCHEMA_VERSION;
  generatedAt: string;
  baseSeed: number;
  seedStridePerSlice: number;
  totalSlices: number;
  totalTargetQuestions: number;
  slices: WorkOrderSlice[];
}
