/**
 * The human review boundary.
 *
 * Automated stages may pass, flag, or reject, but they may never accept. The
 * only route to an accepted run is an immutable `HumanReviewEvent` recorded by
 * an authenticated reviewer, and acceptance alone still does not make a record
 * training-ready: source-use clearance, training metadata, and grouped-split
 * assignment are independent decisions that must each be resolved.
 */

import type { QuestionRun } from "./question-run";

export const HUMAN_REVIEW_EVENT_SCHEMA_VERSION =
  "human-review-event/0.2.0" as const;

/**
 * Concerns are reviewed independently on purpose. Collapsing them into one
 * "approve" action would let a reviewer who is only judging question quality
 * silently grant source-use rights or place a package in a data split.
 */
export const HUMAN_REVIEW_CONCERNS = [
  "educational-acceptance",
  "source-use-clearance",
  "training-metadata",
  "grouped-split",
] as const;

export type HumanReviewConcern = (typeof HUMAN_REVIEW_CONCERNS)[number];

export const HUMAN_REVIEW_OUTCOMES = [
  "accept",
  "reject",
  "send-back-for-repair",
] as const;

export type HumanReviewOutcome = (typeof HUMAN_REVIEW_OUTCOMES)[number];

/**
 * An immutable record of one reviewer decision. Nothing in the system mutates
 * these after they are written; a change of mind is a new event.
 */
export interface HumanReviewEvent {
  readonly schemaVersion: typeof HUMAN_REVIEW_EVENT_SCHEMA_VERSION;
  /** Stable id that makes a repeated decision a no-op rather than a duplicate. */
  readonly decisionId: string;
  readonly runId: string;
  readonly concern: HumanReviewConcern;
  readonly outcome: HumanReviewOutcome;
  /**
   * The authenticated reviewer. Populated from the verified session, never from
   * request input, so a caller cannot claim to be human.
   */
  readonly reviewerId: string;
  /** How that identity was established, kept for the audit trail. */
  readonly reviewerAuthMethod: "pilot-admin-token-session";
  readonly notes: string;
  /** Canonical run revision observed before this decision was recorded. */
  readonly reviewedRevision: number;
  /** Checked package content the reviewer actually evaluated. */
  readonly reviewedContentFingerprint: string;
  readonly createdAt: string;
}

export const DECISION_AUTHORITY = "human" as const;

export const HUMAN_REVIEW_CONCERN_LABELS: Record<HumanReviewConcern, string> = {
  "educational-acceptance":
    "question quality and appropriateness for the stated IB level",
  "source-use-clearance":
    "rights to reuse the source material and to publish the result",
  "training-metadata": "training metadata is complete and accurate",
  "grouped-split": "the package is assigned to a grouped data split",
};

/** The statuses only a recorded human decision can reach. */
export const HUMAN_REVIEW_IMPLIED_STATUSES = [
  "accepted",
  "sent-back-for-repair",
] as const;

/**
 * The latest decision per concern. Concerns are independent, so the latest
 * event for each one stands on its own.
 */
export function latestHumanReviews(
  run: QuestionRun,
): Partial<Record<HumanReviewConcern, HumanReviewEvent>> {
  const latest: Partial<Record<HumanReviewConcern, HumanReviewEvent>> = {};
  for (const review of run.humanReviews) {
    latest[review.concern] = review;
  }
  return latest;
}

function latestCurrentHumanReviews(
  run: QuestionRun,
): Partial<Record<HumanReviewConcern, HumanReviewEvent>> {
  const currentFingerprint = run.questionPackage?.contentFingerprint;
  if (!currentFingerprint) return {};
  const latest: Partial<Record<HumanReviewConcern, HumanReviewEvent>> = {};
  for (const review of run.humanReviews) {
    if (review.reviewedContentFingerprint === currentFingerprint) {
      latest[review.concern] = review;
    }
  }
  return latest;
}

function latestFor(
  run: QuestionRun,
  concern: HumanReviewConcern,
): HumanReviewEvent | undefined {
  return latestHumanReviews(run)[concern];
}

/**
 * The run status an educational-acceptance decision implies. Only the
 * educational-acceptance concern moves a run; the other three are recorded
 * facts about the package rather than gates on the run itself.
 */
export function statusFromHumanReview(
  event: HumanReviewEvent,
): QuestionRun["status"] {
  if (event.concern !== "educational-acceptance")
    return "awaiting-human-review";
  switch (event.outcome) {
    case "accept":
      return "accepted";
    case "reject":
      return "rejected";
    case "send-back-for-repair":
      return "sent-back-for-repair";
  }
}

/**
 * Append a decision and move the run status consistently.
 *
 * Callers must use this rather than pushing onto `humanReviews` directly, so a
 * stored run can never show an acceptance while still claiming to await review.
 */
export function applyHumanReviewDecision(
  run: QuestionRun,
  event: HumanReviewEvent,
): QuestionRun {
  if (event.runId !== run.runId) {
    throw new Error(
      `Human review event for ${event.runId} cannot be applied to run ${run.runId}`,
    );
  }
  // A clearance about rights, metadata, or a grouped split is deliberately
  // orthogonal to the editorial state. In particular, recording the remaining
  // three clearances after educational acceptance must not put an accepted run
  // back into the review queue.
  const changesEditorialStatus = event.concern === "educational-acceptance";
  return {
    ...run,
    humanReviews: [...run.humanReviews, event],
    ...(changesEditorialStatus
      ? {
          status: statusFromHumanReview(event),
          currentStage: "human-review" as const,
        }
      : {}),
    updatedAt: event.createdAt,
  };
}

/**
 * Whether an acceptance decision exists for the run. This is the only thing
 * that may be read as "a human approved the question itself".
 */
export function hasEducationalAcceptance(run: QuestionRun): boolean {
  return (
    latestCurrentHumanReviews(run)["educational-acceptance"]?.outcome ===
    "accept"
  );
}

export interface TrainingReadiness {
  ready: boolean;
  /**
   * Every unresolved requirement, phrased so a reviewer can act on it. Empty
   * only when the record is genuinely training-ready.
   */
  blockers: string[];
  /**
   * What the automated package declared unresolved *before* review. Kept as
   * context: resolving these is exactly what the four decisions above do, so
   * they are not blockers in their own right.
   */
  declaredPackageBlockers: string[];
  decisions: Partial<Record<HumanReviewConcern, HumanReviewEvent>>;
}

/**
 * Training readiness across all four concerns.
 *
 * This deliberately cannot be satisfied by educational acceptance alone. A
 * package also has to be rights-cleared, have complete metadata, and belong to
 * a grouped split before any record derived from it may be called
 * training-ready.
 */
export function evaluateTrainingReadiness(run: QuestionRun): TrainingReadiness {
  const decisions = latestCurrentHumanReviews(run);
  const blockers: string[] = [];

  if (!run.questionPackage) {
    blockers.push("the run has no question package to review");
  }

  for (const concern of HUMAN_REVIEW_CONCERNS) {
    const decision = decisions[concern];
    if (!decision) {
      const stale = latestHumanReviews(run)[concern];
      blockers.push(
        stale
          ? `${concern} decision reviewed a different package fingerprint and is stale`
          : `no ${concern} decision recorded`,
      );
      continue;
    }
    if (decision.outcome === "reject") {
      blockers.push(`${concern} was rejected by ${decision.reviewerId}`);
    } else if (decision.outcome === "send-back-for-repair") {
      blockers.push(
        `${concern} was sent back for repair by ${decision.reviewerId}`,
      );
    }
  }

  return {
    ready: blockers.length === 0,
    blockers,
    declaredPackageBlockers: [...(run.questionPackage?.trainingBlockers ?? [])],
    decisions,
  };
}

/**
 * The statuses a run may only enter with a supporting recorded decision. Used
 * by the store to reject a run that claims acceptance it cannot evidence.
 */
export function assertStatusIsEvidenced(run: QuestionRun): void {
  const acceptance = latestCurrentHumanReviews(run)["educational-acceptance"];
  const historicalAcceptance = latestFor(run, "educational-acceptance");

  if (run.status === "accepted") {
    if (acceptance?.outcome !== "accept") {
      throw new Error(
        `Run ${run.runId} cannot be accepted without a recorded educational ` +
          `acceptance by an authenticated reviewer`,
      );
    }
    return;
  }

  if (run.status === "sent-back-for-repair") {
    // A send-back deliberately remains true while a package is repaired. Its
    // old decision must not make the repaired content training-ready, but it
    // does evidence why this run is still in the repair state.
    if (historicalAcceptance?.outcome !== "send-back-for-repair") {
      throw new Error(
        `Run ${run.runId} cannot be sent back for repair without a recorded ` +
          `educational send-back-for-repair decision`,
      );
    }
    return;
  }

  if (run.status === "rejected") {
    const humanReject = acceptance?.outcome === "reject";
    if (!humanReject && run.rejection === undefined) {
      throw new Error(
        `Run ${run.runId} cannot be rejected without either a recorded human ` +
          `rejection or an automated rejection record`,
      );
    }
  }
}

/**
 * Build a decision event from authenticated reviewer facts. Kept separate from
 * any transport so the reviewer identity can only come from a verified session.
 */
export function createHumanReviewEvent(details: {
  decisionId: string;
  runId: string;
  concern: HumanReviewConcern;
  outcome: HumanReviewOutcome;
  reviewerId: string;
  notes: string;
  reviewedRevision: number;
  reviewedContentFingerprint: string;
  createdAt: string;
}): HumanReviewEvent {
  if (!details.decisionId.trim() || !details.runId.trim()) {
    throw new Error("Human review events need a decision id and a run id");
  }
  if (!details.reviewerId.trim()) {
    throw new Error("Human review events need an authenticated reviewer");
  }
  if (
    !Number.isInteger(details.reviewedRevision) ||
    details.reviewedRevision < 1
  ) {
    throw new Error("Human review events need a persisted reviewed revision");
  }
  if (!details.reviewedContentFingerprint.trim()) {
    throw new Error("Human review events need a reviewed package fingerprint");
  }
  return {
    schemaVersion: HUMAN_REVIEW_EVENT_SCHEMA_VERSION,
    decisionId: details.decisionId,
    runId: details.runId,
    concern: details.concern,
    outcome: details.outcome,
    reviewerId: details.reviewerId,
    reviewerAuthMethod: "pilot-admin-token-session",
    notes: details.notes,
    reviewedRevision: details.reviewedRevision,
    reviewedContentFingerprint: details.reviewedContentFingerprint,
    createdAt: details.createdAt,
  };
}
