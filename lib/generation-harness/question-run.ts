import { v4 as uuidv4 } from "uuid";

export const QUESTION_RUN_SCHEMA_VERSION = "question-run/0.1.0" as const;
export const QUESTION_RUN_REQUEST_SCHEMA_VERSION =
  "question-run-request/0.1.0" as const;
export const QUESTION_BLUEPRINT_SCHEMA_VERSION =
  "question-blueprint/0.1.0" as const;
export const VERIFIED_ARTIFACTS_SCHEMA_VERSION =
  "verified-question-artifacts/0.1.0" as const;
export const QUESTION_PACKAGE_ARTIFACT_SCHEMA_VERSION =
  "question-package-artifact/0.1.0" as const;
export const NOVELTY_ASSESSMENT_SCHEMA_VERSION =
  "novelty-assessment/0.1.0" as const;
export const REVIEW_ENVELOPE_SCHEMA_VERSION =
  "question-review-envelope/0.1.0" as const;
export const REJECTION_RECORD_SCHEMA_VERSION =
  "question-run-rejection/0.1.0" as const;

/**
 * Robust run identifier. Timestamp-plus-random was collision-prone once runs
 * could be created concurrently, and it leaked creation order into the ID.
 */
export function createQuestionRunId(): string {
  return `question-run-${uuidv4()}`;
}

export type QuestionPaper = "1A" | "2";
export type QuestionLevel = "SL" | "HL";
export type QuestionStructure = "multiple-choice" | "multipart";

export type QuestionRunStatus =
  "requested" | "running" | "awaiting-human-review" | "accepted" | "rejected";

export type QuestionRunStage =
  | "plan"
  | "validate-blueprint"
  | "solve-and-render"
  | "author"
  | "validate-package"
  | "novelty-check"
  | "prepare-review"
  | "human-review";

export type QuestionRunRejectionCode =
  | "invalid-structured-output"
  | "invalid-blueprint"
  | "unsupported-physics"
  | "unsupported-visual-family"
  | "missing-information"
  | "unsolvable"
  | "incorrect-answer"
  | "non-unique-answer"
  | "figure-question-mismatch"
  | "answer-leak"
  | "incomplete-mark-scheme"
  | "near-duplicate"
  | "package-validation-failed"
  | "agent-review-reject"
  | "human-reject"
  | "retry-budget-exhausted"
  | "internal-stage-error";

export interface QuestionRunRequest {
  mode: "source-replay" | "generate";
  paper: QuestionPaper;
  level: QuestionLevel;
  topics: string[];
  assessedSkills: string[];
  difficulty: "accessible" | "standard" | "challenging";
  visualPolicy: "model-decides" | "required" | "forbidden";
  sourcePackageRef?: string;
}

/**
 * The request as persisted on a run. Callers pass the plain request and the
 * harness stamps the contract version, so the version cannot be omitted by
 * forgetting it at a call site.
 */
export interface VersionedQuestionRunRequest extends QuestionRunRequest {
  schemaVersion: typeof QUESTION_RUN_REQUEST_SCHEMA_VERSION;
}

export interface QuestionBlueprint {
  schemaVersion: typeof QUESTION_BLUEPRINT_SCHEMA_VERSION;
  id: string;
  paper: QuestionPaper;
  level: QuestionLevel;
  topic: string;
  assessedSkills: string[];
  structure: QuestionStructure;
  scenarioKind: string;
  visual: {
    required: boolean;
    purposes: string[];
    families: string[];
  };
  novelty: {
    strategy: "source-replay" | "original-generation";
    sourceFamilyId?: string;
  };
  sourcePackageRef?: string;
}

export interface RenderedVisualArtifact {
  artifactId: string;
  family: string;
  mediaType: "image/svg+xml";
  byteLength: number;
  fingerprint: string;
}

export interface VerifiedQuestionArtifacts {
  schemaVersion: typeof VERIFIED_ARTIFACTS_SCHEMA_VERSION;
  solverId: string;
  resultKeys: string[];
  renderedVisuals: RenderedVisualArtifact[];
  sourceBacked: boolean;
}

export interface QuestionPackageArtifact {
  kind: "circuit-question-package" | "field-question-package";
  schemaVersion: typeof QUESTION_PACKAGE_ARTIFACT_SCHEMA_VERSION;
  packageId: string;
  /** Schema version of the checked package this artifact summarises. */
  packageSchemaVersion: string;
  sourceQuestionId: string;
  paper: QuestionPaper;
  structure: QuestionStructure;
  marks: number;
  visualFamilies: string[];
  contentFingerprint: string;
  trainingEligibility: "blocked";
  trainingBlockers: string[];
}

export interface NoveltyAssessment {
  schemaVersion: typeof NOVELTY_ASSESSMENT_SCHEMA_VERSION;
  status: "passed" | "flagged" | "not-run";
  reason: string;
  nearestCandidateIds: string[];
}

export interface QuestionReviewEnvelope {
  schemaVersion: typeof REVIEW_ENVELOPE_SCHEMA_VERSION;
  package: QuestionPackageArtifact;
  deterministicCheckIds: string[];
  requiredHumanChecks: string[];
  agentReview: {
    status: "not-run" | "pass" | "flag" | "reject";
    reason: string;
  };
  decisionAuthority: "human";
  trainingEligibility: "blocked";
  trainingBlockers: string[];
}

export interface QuestionRunCheck {
  id: string;
  stage: QuestionRunStage;
  attempt: number;
  kind: "deterministic" | "policy";
  outcome: "passed" | "failed" | "flagged" | "not-run";
  code: string;
  message: string;
  createdAt: string;
}

export type QuestionRunReview =
  | {
      reviewerKind: "agent";
      reviewerId: string;
      decision: "pass" | "flag" | "reject";
      notes: string;
      createdAt: string;
    }
  | {
      reviewerKind: "human";
      reviewerId: string;
      decision: "accept" | "reject";
      notes: string;
      createdAt: string;
    };

export interface QuestionRunRejection {
  schemaVersion: typeof REJECTION_RECORD_SCHEMA_VERSION;
  stage: QuestionRunStage;
  code: QuestionRunRejectionCode;
  causeCode?: QuestionRunRejectionCode;
  message: string;
  attempts: number;
  createdAt: string;
}

export interface QuestionRunHistoryEntry {
  type:
    | "run-created"
    | "stage-attempted"
    | "stage-retrying"
    | "stage-completed"
    | "awaiting-human-review"
    | "run-accepted"
    | "run-rejected";
  stage?: QuestionRunStage;
  message: string;
  createdAt: string;
}

/**
 * Canonical, JSON-safe generation record. This type deliberately has no
 * dependency on LangGraph or any other orchestration framework.
 */
export interface QuestionRun {
  schemaVersion: typeof QUESTION_RUN_SCHEMA_VERSION;
  /**
   * Monotonic revision assigned by the store. The graph leaves this at 0; a
   * persisted run increments it once per appended event, which is what lets
   * writers detect a concurrent update via compare-and-swap.
   */
  revision: number;
  runId: string;
  status: QuestionRunStatus;
  currentStage?: QuestionRunStage;
  request: VersionedQuestionRunRequest;
  blueprint?: QuestionBlueprint;
  verifiedArtifacts?: VerifiedQuestionArtifacts;
  questionPackage?: QuestionPackageArtifact;
  novelty?: NoveltyAssessment;
  reviewEnvelope?: QuestionReviewEnvelope;
  attempts: Partial<Record<QuestionRunStage, number>>;
  checks: QuestionRunCheck[];
  reviews: QuestionRunReview[];
  history: QuestionRunHistoryEntry[];
  rejection?: QuestionRunRejection;
  createdAt: string;
  updatedAt: string;
}

export function createQuestionRun(
  runId: string,
  request: QuestionRunRequest,
  createdAt: string,
): QuestionRun {
  if (!runId.trim()) throw new Error("Question run ID must not be empty");
  if (request.topics.length === 0 || request.assessedSkills.length === 0) {
    throw new Error("Question requests need topics and assessed skills");
  }
  if (request.mode === "source-replay" && !request.sourcePackageRef?.trim()) {
    throw new Error("Source replay requests need a package reference");
  }
  return {
    schemaVersion: QUESTION_RUN_SCHEMA_VERSION,
    revision: 0,
    runId,
    status: "requested",
    request: { ...request, schemaVersion: QUESTION_RUN_REQUEST_SCHEMA_VERSION },
    attempts: {},
    checks: [],
    reviews: [],
    history: [
      {
        type: "run-created",
        message: "Question run created",
        createdAt,
      },
    ],
    createdAt,
    updatedAt: createdAt,
  };
}
