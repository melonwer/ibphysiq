/**
 * The queue of runs awaiting a human decision.
 *
 * Requires an authenticated reviewer; without a session this is 401. Runs that
 * a human has already cleared drop out of the queue, so it stays a work list
 * rather than a log.
 */

import { NextResponse } from "next/server";

import {
  getReviewServiceOptions,
  reviewErrorResponse,
} from "@/lib/review/review-http";
import { listReviewQueue } from "@/lib/review/review-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const runs = await listReviewQueue(request, getReviewServiceOptions());
    return NextResponse.json({
      runs: runs.map((run) => ({
        runId: run.runId,
        status: run.status,
        currentStage: run.currentStage,
        revision: run.revision,
        updatedAt: run.updatedAt,
        topics: [...run.request.topics],
        paper: run.request.paper,
        level: run.request.level,
        packageId: run.questionPackage?.packageId,
        sourceQuestionId: run.questionPackage?.sourceQuestionId,
        agentReview: run.reviewEnvelope?.agentReview?.status,
      })),
    });
  } catch (error) {
    return reviewErrorResponse(error);
  }
}
