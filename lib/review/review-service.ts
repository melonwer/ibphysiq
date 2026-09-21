/**
 * The server-only human review service.
 *
 * SERVER ONLY. Every entry point either takes a request and establishes the
 * reviewer from a verified session, or is a pure read. There is deliberately no
 * function that accepts a caller-supplied reviewer identity: that would let a
 * caller declare itself human, which is the one thing this boundary exists to
 * prevent.
 */

import { createHash } from "node:crypto";

import {
  createHumanReviewEvent,
  evaluateTrainingReadiness,
  HumanReviewConcern,
  HumanReviewEvent,
  HumanReviewOutcome,
  latestHumanReviews,
  TrainingReadiness,
} from "../generation-harness/human-review";
import type { QuestionRun } from "../generation-harness/question-run";
import { AuthorizedHumanReviewStore } from "../generation-harness/question-run-store";
import {
  CIRCUIT_QUESTION_PACKAGES,
  CircuitQuestionPackage,
} from "../visuals/circuit-question-packages";
import {
  FIELD_QUESTION_PACKAGES,
  FieldQuestionPackage,
} from "../visuals/field-question-packages";
import { renderCircuitNetwork } from "../visuals/render-circuit";
import { renderFieldMap } from "../visuals/render-field-map";
import { packageContentFingerprint } from "../generation-harness/replay-fixtures";
import type { VisualSpec } from "../visuals/types";
import {
  RequestLike,
  authorizeHumanReviewAppend,
  createObservedReviewContextToken,
  requireSession,
  ReviewAuthConfig,
  ReviewAuthError,
  ReviewSession,
  verifyCsrf,
  verifyObservedReviewContextToken,
} from "./review-auth";

export type ReviewablePackage = CircuitQuestionPackage | FieldQuestionPackage;

export interface ReviewServiceOptions {
  store: AuthorizedHumanReviewStore;
  authConfig: ReviewAuthConfig;
  now?: () => string;
  resolvePackage?: (
    packageId: string | undefined,
  ) => ReviewablePackage | undefined;
}

export interface ReviewDecisionInput {
  concern: HumanReviewConcern;
  outcome: HumanReviewOutcome;
  notes: string;
  /**
   * Idempotency key. When omitted, one is derived from the decision's own
   * content so that a double-submitted form resolves to a single event.
   */
  decisionId?: string;
  /**
   * CSRF token from a plain HTML form, which cannot set the header. Ignored
   * when the header is present.
   */
  csrfToken?: string;
  /** Opaque, session-bound context returned with the exact rendered/API view. */
  reviewContext?: string;
}

export interface ReviewDecisionResult {
  run: QuestionRun;
  decision: HumanReviewEvent;
  /** True when the decision was already recorded and nothing was written. */
  deduplicated: boolean;
  readiness: TrainingReadiness;
}

const VALID_CONCERNS: readonly HumanReviewConcern[] = [
  "educational-acceptance",
  "source-use-clearance",
  "training-metadata",
  "grouped-split",
];

const VALID_OUTCOMES: readonly HumanReviewOutcome[] = [
  "accept",
  "reject",
  "send-back-for-repair",
];

export class ReviewServiceError extends Error {
  constructor(
    readonly code:
      | "invalid-decision"
      | "idempotency-conflict"
      | "review-not-ready"
      | "run-not-found"
      | "notes-required"
      | "stale-review-context",
    message: string,
  ) {
    super(message);
    this.name = "ReviewServiceError";
  }
}

function stableDecisionId(
  runId: string,
  concern: HumanReviewConcern,
  outcome: HumanReviewOutcome,
  notes: string,
  reviewedContentFingerprint: string,
): string {
  return `decision-${createHash("sha256")
    .update(
      [runId, concern, outcome, notes, reviewedContentFingerprint].join(
        "\u0000",
      ),
      "utf8",
    )
    .digest("hex")
    .slice(0, 32)}`;
}

function validateDecisionInput(input: ReviewDecisionInput): void {
  if (!VALID_CONCERNS.includes(input.concern)) {
    throw new ReviewServiceError(
      "invalid-decision",
      `Unknown review concern: ${String(input.concern)}`,
    );
  }
  if (!VALID_OUTCOMES.includes(input.outcome)) {
    throw new ReviewServiceError(
      "invalid-decision",
      `Unknown review outcome: ${String(input.outcome)}`,
    );
  }
}

function isSameDecisionIntent(
  recorded: HumanReviewEvent,
  input: {
    runId: string;
    concern: HumanReviewConcern;
    outcome: HumanReviewOutcome;
    notes: string;
    reviewerId: string;
    reviewedContentFingerprint: string;
  },
): boolean {
  return (
    recorded.runId === input.runId &&
    recorded.concern === input.concern &&
    recorded.outcome === input.outcome &&
    recorded.notes === input.notes &&
    recorded.reviewerId === input.reviewerId &&
    recorded.reviewedContentFingerprint === input.reviewedContentFingerprint
  );
}

/**
 * Compare persisted JSON-shaped evidence by value, not by incidental object
 * insertion order. The review envelope and package artifact are independently
 * serialized facts, so a key-order difference is not a content difference.
 */
function structurallyEqual(left: unknown, right: unknown): boolean {
  const canonicalize = (value: unknown): string =>
    JSON.stringify(value, (_key, candidate) => {
      if (
        candidate !== null &&
        typeof candidate === "object" &&
        !Array.isArray(candidate)
      ) {
        return Object.fromEntries(
          Object.entries(candidate as Record<string, unknown>).sort(
            ([a], [b]) => a.localeCompare(b),
          ),
        );
      }
      return candidate;
    });
  return canonicalize(left) === canonicalize(right);
}

function hasConsistentDisplayedPackage(
  run: QuestionRun,
  item: ReviewablePackage,
): boolean {
  return (
    run.questionPackage?.contentFingerprint ===
      packageContentFingerprint(item) &&
    run.reviewEnvelope !== undefined &&
    structurallyEqual(run.reviewEnvelope.package, run.questionPackage)
  );
}

function assertReviewEligibility(
  run: QuestionRun,
  options: ReviewServiceOptions,
): void {
  if (
    run.status !== "awaiting-human-review" &&
    run.status !== "accepted" &&
    run.status !== "sent-back-for-repair"
  ) {
    throw new ReviewServiceError(
      "review-not-ready",
      `Run ${run.runId} is ${run.status} and cannot receive a human review decision`,
    );
  }
  if (
    !run.blueprint ||
    !run.verifiedArtifacts ||
    !run.questionPackage ||
    !run.novelty ||
    !run.reviewEnvelope ||
    !(options.resolvePackage ?? findReviewablePackage)(
      run.questionPackage.packageId,
    )
  ) {
    throw new ReviewServiceError(
      "review-not-ready",
      `Run ${run.runId} has not completed the displayable automated review boundary`,
    );
  }
  const item = (options.resolvePackage ?? findReviewablePackage)(
    run.questionPackage.packageId,
  )!;
  if (!hasConsistentDisplayedPackage(run, item)) {
    throw new ReviewServiceError(
      "review-not-ready",
      `Run ${run.runId} review evidence does not match its displayed package`,
    );
  }
  if (run.status === "accepted" && evaluateTrainingReadiness(run).ready) {
    throw new ReviewServiceError(
      "review-not-ready",
      `Run ${run.runId} is already training-ready and has no remaining review clearance`,
    );
  }
  if (run.status === "sent-back-for-repair") {
    const priorEducationalDecision =
      latestHumanReviews(run)["educational-acceptance"];
    if (
      priorEducationalDecision?.reviewedContentFingerprint ===
      run.questionPackage.contentFingerprint
    ) {
      throw new ReviewServiceError(
        "review-not-ready",
        `Run ${run.runId} was sent back for this exact package content and must be repaired before reconsideration`,
      );
    }
  }
}

/**
 * Record a reviewer decision.
 *
 * Authorisation is established from the request before anything is read or
 * written, and the reviewer identity comes from the verified session rather
 * than from the input.
 */
export async function submitReviewDecision(
  request: RequestLike,
  runId: string,
  input: ReviewDecisionInput,
  options: ReviewServiceOptions,
): Promise<ReviewDecisionResult> {
  const session: ReviewSession = requireSession(request, options.authConfig);
  verifyCsrf(request, session, input.csrfToken);
  validateDecisionInput(input);
  const observed = verifyObservedReviewContextToken(
    input.reviewContext,
    session,
    options.authConfig,
  );
  if (observed.runId !== runId) {
    throw new ReviewServiceError(
      "stale-review-context",
      "Review context belongs to a different run",
    );
  }

  const notes = input.notes.trim();
  // A rejection or a send-back without a reason is not reviewable later, and
  // sends no signal back to whoever has to repair the question.
  if (input.outcome !== "accept" && notes.length === 0) {
    throw new ReviewServiceError(
      "notes-required",
      `A ${input.outcome} decision must include notes explaining why`,
    );
  }

  const now = options.now ?? (() => new Date().toISOString());
  const current = await options.store.resume(runId).catch((error: unknown) => {
    throw error;
  });
  const decisionId =
    input.decisionId ??
    stableDecisionId(
      runId,
      input.concern,
      input.outcome,
      notes,
      observed.reviewedContentFingerprint,
    );
  const duplicate = current.humanReviews.find(
    (event) => event.decisionId === decisionId,
  );
  if (duplicate) {
    if (
      !isSameDecisionIntent(duplicate, {
        runId,
        concern: input.concern,
        outcome: input.outcome,
        notes,
        reviewerId: session.reviewerId,
        reviewedContentFingerprint: observed.reviewedContentFingerprint,
      })
    ) {
      throw new ReviewServiceError(
        "idempotency-conflict",
        `Decision id ${decisionId} was already used for a different review decision`,
      );
    }
    return {
      run: current,
      decision: duplicate,
      deduplicated: true,
      readiness: evaluateTrainingReadiness(current),
    };
  }
  assertReviewEligibility(current, options);
  if (
    current.revision !== observed.viewedRevision ||
    current.questionPackage?.packageId !== observed.packageId ||
    current.questionPackage?.contentFingerprint !==
      observed.reviewedContentFingerprint
  ) {
    throw new ReviewServiceError(
      "stale-review-context",
      "The reviewed package changed; refresh the review page before deciding",
    );
  }
  const decision = createHumanReviewEvent({
    decisionId,
    runId,
    concern: input.concern,
    outcome: input.outcome,
    reviewerId: session.reviewerId,
    notes,
    reviewedRevision: observed.viewedRevision,
    reviewedContentFingerprint: observed.reviewedContentFingerprint,
    createdAt: now(),
  });
  const persisted = await options.store.appendAuthorizedHumanReview(
    decision,
    authorizeHumanReviewAppend(observed, options.authConfig),
  );
  return {
    run: persisted,
    decision,
    deduplicated: false,
    readiness: evaluateTrainingReadiness(persisted),
  };
}

/** Runs awaiting a human decision. Requires an authenticated reviewer. */
export async function listReviewQueue(
  request: RequestLike,
  options: ReviewServiceOptions,
): Promise<QuestionRun[]> {
  requireSession(request, options.authConfig);
  return options.store.listReviewQueue();
}

/** One run's full review payload. Requires an authenticated reviewer. */
export async function readReviewRun(
  request: RequestLike,
  runId: string,
  options: ReviewServiceOptions,
): Promise<ReviewView> {
  const session = requireSession(request, options.authConfig);
  const run = await options.store.resume(runId);
  const view = buildReviewView(
    run,
    options.resolvePackage ?? findReviewablePackage,
  );
  if (!run.questionPackage) return view;
  return {
    ...view,
    observedReviewContext: createObservedReviewContextToken(
      {
        runId: run.runId,
        viewedRevision: run.revision,
        packageId: run.questionPackage.packageId,
        reviewedContentFingerprint: run.questionPackage.contentFingerprint,
      },
      session,
      options.authConfig,
    ),
  };
}

/**
 * Everything a reviewer needs to judge a run, assembled from the canonical
 * record plus the underlying checked package.
 */
export interface ReviewView {
  runId: string;
  status: QuestionRun["status"];
  currentStage: QuestionRun["currentStage"];
  revision: number;
  request: QuestionRun["request"];
  blueprint?: QuestionRun["blueprint"];
  packageSummary?: QuestionRun["questionPackage"];
  question?: {
    kind: ReviewablePackage["question"]["kind"];
    stem: string;
    marks: number;
    options: Array<{ id: string; text: string }>;
    parts: Array<{ partId: string; prompt: string; marks: number }>;
  };
  solution?: {
    correctOptionId?: string;
    parts: Array<{
      partId: string;
      marks: number;
      working: string[];
      markingPoints: string[];
      finalAnswer?: string;
    }>;
  };
  /**
   * What the run recorded about its visuals. Metadata only: byte length and a
   * fingerprint, which is what a reviewer needs to compare against the drawing.
   */
  visualArtifacts: NonNullable<
    QuestionRun["verifiedArtifacts"]
  >["renderedVisuals"];
  /**
   * The actual drawings, rendered from the checked package's visual intent. A
   * package that will not render is reported as an error rather than thrown,
   * because that failure is itself something the reviewer must see.
   */
  renderedVisuals: Array<{
    id: string;
    family: string;
    svg?: string;
    error?: string;
  }>;
  verifiedResults?: {
    solverId: string;
    resultKeys: string[];
    sourceBacked: boolean;
  };
  assumptions: string[];
  sourceChecks: unknown[];
  checks: QuestionRun["checks"];
  rejectionHistory: QuestionRun["history"];
  rejection?: QuestionRun["rejection"];
  novelty?: QuestionRun["novelty"];
  agentReview?: NonNullable<QuestionRun["reviewEnvelope"]>["agentReview"];
  provenance: {
    packageId?: string;
    sourceQuestionId?: string;
    questionLabel?: string;
    sourceScope?: string;
    markschemeSourceId?: string;
    markschemePages: number[];
    trainingEligibility?: string;
    declaredBlockers: string[];
  };
  humanReviews: HumanReviewEvent[];
  decisions: Partial<Record<HumanReviewConcern, HumanReviewEvent>>;
  readiness: TrainingReadiness;
  /** Resolved only when the underlying checked package could be found. */
  packageResolved: boolean;
  /** Opaque session-bound evidence of the exact page/API state viewed. */
  observedReviewContext?: string;
}

/**
 * Render a checked package's visual intent for display.
 *
 * The renderers are the same ones the package was verified against, so the
 * reviewer sees the artifact the checks applied to rather than a re-creation.
 */
function renderVisuals(
  item: ReviewablePackage | undefined,
): Array<{ id: string; family: string; svg?: string; error?: string }> {
  // An absent spec means the package is explicitly no-visual, which the
  // question's own checks are responsible for justifying.
  if (!item?.visualSpec) return [];
  // A union of the two concrete specs, so `family` discriminates them. A
  // widened `VisualSpec<A | B>` would not narrow.
  const spec: VisualSpec<"circuit_network"> | VisualSpec<"field_map"> =
    item.visualSpec;
  try {
    const svg =
      spec.family === "circuit_network"
        ? renderCircuitNetwork(spec)
        : renderFieldMap(spec);
    return [{ id: spec.id, family: spec.family, svg }];
  } catch (error) {
    return [
      {
        id: spec.id,
        family: spec.family,
        error: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}

export function findReviewablePackage(
  packageId: string | undefined,
): ReviewablePackage | undefined {
  if (!packageId) return undefined;
  return (
    CIRCUIT_QUESTION_PACKAGES.find((item) => item.id === packageId) ??
    FIELD_QUESTION_PACKAGES.find((item) => item.id === packageId)
  );
}

/**
 * Build the review payload from the canonical run. A missing package is
 * reported rather than thrown: a reviewer still needs to see that the run
 * exists and what it claims.
 */
export function buildReviewView(
  run: QuestionRun,
  resolvePackage: (
    packageId: string | undefined,
  ) => ReviewablePackage | undefined = findReviewablePackage,
): ReviewView {
  const summary = run.questionPackage;
  const resolvedItem = resolvePackage(summary?.packageId);
  // The view must never render a registry package as if it were the checked
  // package when the canonical artifact or envelope no longer binds to it.
  const item =
    resolvedItem && hasConsistentDisplayedPackage(run, resolvedItem)
      ? resolvedItem
      : undefined;
  const readiness = evaluateTrainingReadiness(run);

  const question: ReviewView["question"] = item
    ? {
        kind: item.question.kind,
        stem: item.question.stem,
        marks: item.marks,
        options:
          item.question.kind === "multiple-choice"
            ? item.question.options.map((option) => ({
                id: option.id,
                text: option.text,
              }))
            : [],
        parts:
          item.question.kind === "multipart"
            ? item.question.parts.map((part) => ({
                partId: part.id,
                prompt: part.prompt,
                marks: part.marks,
              }))
            : [],
      }
    : undefined;

  const solution: ReviewView["solution"] = item
    ? {
        correctOptionId: item.solution.correctOptionId,
        parts: item.solution.parts.map((part) => ({
          partId: part.partId,
          marks: part.marks,
          working: [...part.working],
          markingPoints: [...part.markingPoints],
          finalAnswer: part.finalAnswer,
        })),
      }
    : undefined;

  return {
    runId: run.runId,
    status: run.status,
    currentStage: run.currentStage,
    revision: run.revision,
    request: run.request,
    blueprint: run.blueprint,
    packageSummary: summary,
    question,
    solution,
    visualArtifacts: run.verifiedArtifacts?.renderedVisuals ?? [],
    renderedVisuals: renderVisuals(item),
    verifiedResults: run.verifiedArtifacts
      ? {
          solverId: run.verifiedArtifacts.solverId,
          resultKeys: [...run.verifiedArtifacts.resultKeys],
          sourceBacked: run.verifiedArtifacts.sourceBacked,
        }
      : undefined,
    assumptions: item ? [...item.assumptions] : [],
    sourceChecks: item ? [...item.sourceChecks] : [],
    checks: run.checks,
    rejectionHistory: run.history.filter(
      (entry) =>
        entry.type === "run-rejected" ||
        entry.type === "stage-retrying" ||
        entry.type === "awaiting-human-review",
    ),
    rejection: run.rejection,
    novelty: run.novelty,
    agentReview: run.reviewEnvelope?.agentReview,
    provenance: {
      packageId: summary?.packageId,
      sourceQuestionId: summary?.sourceQuestionId ?? item?.source.questionId,
      questionLabel: item?.source.questionLabel,
      sourceScope: item?.source.sourceScope,
      markschemeSourceId: item?.source.markscheme.sourceId,
      markschemePages: [...(item?.source.markscheme.pages ?? [])],
      trainingEligibility: summary?.trainingEligibility,
      declaredBlockers: [...(summary?.trainingBlockers ?? [])],
    },
    humanReviews: [...run.humanReviews],
    decisions: latestHumanReviews(run),
    readiness,
    packageResolved: item !== undefined,
  };
}

export { ReviewAuthError };
