/**
 * Server-only wiring shared by the review API routes and the review page.
 *
 * Configuration is read per call rather than at module load: `next build`
 * evaluates modules without the runtime environment, and a missing admin token
 * must surface to an operator as a clear response instead of breaking the build.
 */

import { NextResponse } from "next/server";
import { join } from "node:path";

import {
  JsonlQuestionRunStore,
  QuestionRunStoreError,
} from "../generation-harness";
import {
  ReviewAuthError,
  reviewAuthConfigFromEnv,
  type RequestLike,
} from "./review-auth";
import { ReviewServiceOptions, ReviewServiceError } from "./review-service";

/** Where stored question runs live. Overridable for tests and deployments. */
export function reviewStoreRoot(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.REVIEW_RUN_STORE_DIR ?? join(process.cwd(), "data", "question-runs")
  );
}

export function getReviewStore(
  authorizationSecret: string,
): JsonlQuestionRunStore {
  return new JsonlQuestionRunStore(reviewStoreRoot(), authorizationSecret);
}

export function getReviewServiceOptions(): ReviewServiceOptions {
  const authConfig = reviewAuthConfigFromEnv();
  return {
    store: getReviewStore(authConfig.sessionSecret),
    authConfig,
  };
}

/**
 * Adapt a Headers-like object (next/headers) to the `RequestLike` shape the
 * auth code reads.
 *
 * Wrapping rather than casting is deliberate: `headers()` returns a
 * Headers-like value, not a Request, so passing it straight through leaves
 * `request.headers.get` undefined and turns every page render into a 500. The
 * two shapes are similar enough that only an explicit adapter stays correct.
 */
export function requestLikeFromHeaders(headersLike: {
  get(name: string): string | null;
}): RequestLike {
  return {
    headers: { get: (name: string) => headersLike.get(name) },
  };
}

function toStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {};
  const record: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") record[key] = entry;
  }
  return record;
}

/**
 * Read a review payload from either a JSON body or a urlencoded form, so the
 * review page works without JavaScript.
 */
export async function readReviewBody(
  request: Request,
): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      return toStringRecord(await request.json());
    }
    if (contentType.includes("form")) {
      const record: Record<string, string> = {};
      (await request.formData()).forEach((value, key) => {
        if (typeof value === "string") record[key] = value;
      });
      return record;
    }
  } catch {
    // A malformed body is reported as an empty one; the caller validates.
  }
  return {};
}

/** True for a browser form submission, which should be redirected, not fed JSON. */
export function wantsHtml(request: Request): boolean {
  if ((request.headers.get("content-type") ?? "").includes("form")) return true;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html") && !accept.includes("application/json");
}

/**
 * Map a review failure onto a response. Auth failures deliberately do not
 * distinguish "no session" from "forged session" to a client.
 */
export function reviewErrorResponse(error: unknown): NextResponse {
  if (error instanceof ReviewAuthError) {
    switch (error.code) {
      case "not-configured":
        return NextResponse.json(
          {
            error: "review_not_configured",
            message:
              "The review boundary is not configured. Set REVIEW_ADMIN_TOKEN " +
              "to enable it; it will not run without one.",
          },
          { status: 503 },
        );
      case "csrf-rejected":
        return NextResponse.json(
          { error: "csrf_rejected", message: error.message },
          { status: 403 },
        );
      case "invalid-token":
        return NextResponse.json(
          { error: "invalid_credentials", message: "Invalid admin token" },
          { status: 401 },
        );
      default:
        return NextResponse.json(
          { error: "unauthenticated", message: "Sign in to review" },
          { status: 401 },
        );
    }
  }

  if (error instanceof ReviewServiceError) {
    const status =
      error.code === "run-not-found"
        ? 404
        : error.code === "idempotency-conflict"
          ? 409
          : 400;
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status },
    );
  }

  if (error instanceof QuestionRunStoreError) {
    const status =
      error.code === "run-not-found"
        ? 404
        : error.code === "stale-revision"
          ? 409
          : error.code === "unsupported-schema-version"
            ? 422
            : 400;
    return NextResponse.json(
      { error: error.code, message: error.message, context: error.context },
      { status },
    );
  }

  console.error("Unexpected review error:", error);
  return NextResponse.json(
    {
      error: "review_failed",
      message: "The review request could not be completed",
    },
    { status: 500 },
  );
}
