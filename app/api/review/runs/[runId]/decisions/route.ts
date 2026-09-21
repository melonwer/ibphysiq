/**
 * Record a human review decision.
 *
 * This is the only state-changing endpoint in the review boundary. It requires
 * an authenticated session and a CSRF token, records the reviewer from the
 * verified session rather than from the request body, and is idempotent per
 * decision. It cannot promote a package for training: it records one of the
 * four clearances, and training readiness is recomputed from all of them.
 */

import { NextResponse } from "next/server";

import {
  getReviewServiceOptions,
  readReviewBody,
  reviewErrorResponse,
  wantsHtml,
} from "@/lib/review/review-http";
import {
  ReviewDecisionInput,
  submitReviewDecision,
} from "@/lib/review/review-service";
import type {
  HumanReviewConcern,
  HumanReviewOutcome,
} from "@/lib/generation-harness";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
  const { runId } = await context.params;
  const body = await readReviewBody(request);

  const input: ReviewDecisionInput = {
    concern: body.concern as HumanReviewConcern,
    outcome: body.outcome as HumanReviewOutcome,
    notes: body.notes ?? "",
    decisionId: body.decisionId,
    csrfToken: body.csrfToken,
    reviewContext: body.reviewContext,
  };

  try {
    const result = await submitReviewDecision(
      request,
      runId,
      input,
      getReviewServiceOptions(),
    );

    if (wantsHtml(request)) {
      const url = new URL("/review", request.url);
      url.searchParams.set("runId", runId);
      url.searchParams.set("recorded", body.concern ?? "1");
      return NextResponse.redirect(url, { status: 303 });
    }

    return NextResponse.json({
      runId: result.run.runId,
      status: result.run.status,
      revision: result.run.revision,
      deduplicated: result.deduplicated,
      decision: result.decision,
      readiness: result.readiness,
    });
  } catch (error) {
    return reviewErrorResponse(error);
  }
}
