/**
 * One run's full review payload: request, blueprint, question, visuals,
 * verified results, solution, checks, novelty, agent review, and provenance.
 *
 * Requires an authenticated reviewer. The payload contains model output and
 * marking points, so it must never be served to an anonymous caller.
 */

import { NextResponse } from "next/server";

import {
  getReviewServiceOptions,
  reviewErrorResponse,
} from "@/lib/review/review-http";
import { readReviewRun } from "@/lib/review/review-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ runId: string }> },
): Promise<NextResponse> {
  try {
    const { runId } = await context.params;
    const view = await readReviewRun(request, runId, getReviewServiceOptions());
    return NextResponse.json({ run: view });
  } catch (error) {
    return reviewErrorResponse(error);
  }
}
