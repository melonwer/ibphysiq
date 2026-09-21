/**
 * Pilot authentication for the human review boundary.
 *
 * SERVER ONLY. Nothing here may be imported from a client component: it holds
 * the admin token comparison, the session signing key, and CSRF verification.
 *
 * ## Why this is hand-written
 *
 * The application has no existing auth layer, no `middleware.ts`, and no
 * provider configured, so Phase 3 documents a pilot boundary instead of
 * pretending otherwise. The pilot:
 *
 * - authenticates a single reviewer identity with `REVIEW_ADMIN_TOKEN`;
 * - compares secrets in constant time;
 * - issues an HTTP-only, Secure, SameSite=Strict session cookie whose payload
 *   is HMAC-signed, so the reviewer identity cannot be forged client-side;
 * - carries a per-session CSRF token inside that signed payload, rendered into
 *   the review page, and requires it on state-changing requests.
 *
 * ## Known pilot limitations, stated plainly
 *
 * - One shared identity: every reviewer is recorded as the same `reviewerId`.
 *   Real per-reviewer attribution needs an identity provider.
 * - No login throttling. The boundary relies on the admin token being a long
 *   random secret; a short or guessable token would make this the weakest link.
 * - Sessions cannot be revoked individually (no server-side session store); a
 *   reissued admin token invalidates all outstanding sessions at once.
 *
 * Replacing this with a real provider is a Phase 12 concern. The rest of the
 * review service depends only on the `ReviewSession` shape, so the swap is
 * contained.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  HumanReviewAppendAuthorization,
  signHumanReviewAppendAuthorization,
} from "../generation-harness/question-run-store";

export const REVIEW_SESSION_COOKIE = "ibphysiq_review_session";
export const REVIEW_CSRF_HEADER = "x-review-csrf";
export const REVIEW_REVIEWER_ID = "pilot-admin";

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Fixed key used only to blind comparison lengths. It is not a secret and never
 * protects data; it exists so `timingSafeEqual` always receives equal-length
 * inputs.
 */
const LENGTH_BLINDING_KEY = Buffer.alloc(32, 0x5a);

export interface ReviewSession {
  sessionId: string;
  reviewerId: string;
  issuedAt: string;
  expiresAt: string;
  csrfToken: string;
}

/** Exact server-rendered/API review state a reviewer observed before deciding. */
export interface ObservedReviewContext {
  runId: string;
  viewedRevision: number;
  packageId: string;
  reviewedContentFingerprint: string;
  sessionId: string;
  reviewerId: string;
}

export interface ReviewAuthConfig {
  adminToken: string;
  sessionSecret: string;
  sessionTtlMs: number;
  now: () => number;
}

export class ReviewAuthError extends Error {
  constructor(
    readonly code:
      | "not-configured"
      | "invalid-token"
      | "no-session"
      | "invalid-session"
      | "csrf-rejected",
    message: string,
  ) {
    super(message);
    this.name = "ReviewAuthError";
  }
}

/**
 * Compare two secrets without leaking their contents or their lengths through
 * timing. Both sides are hashed to a fixed width first, because
 * `crypto.timingSafeEqual` throws when lengths differ and a length pre-check
 * would itself be an observable difference.
 */
export function constantTimeEquals(left: string, right: string): boolean {
  const digest = (value: string) =>
    createHmac("sha256", LENGTH_BLINDING_KEY).update(value, "utf8").digest();
  return timingSafeEqual(digest(left), digest(right));
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("base64url");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Read pilot configuration from the environment.
 *
 * Called per request rather than at module load: `next build` evaluates modules
 * without the runtime environment, and throwing there would break the build
 * instead of returning an actionable error to an operator.
 */
export function reviewAuthConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): ReviewAuthConfig {
  const adminToken = env.REVIEW_ADMIN_TOKEN;
  if (!isNonEmptyString(adminToken)) {
    throw new ReviewAuthError(
      "not-configured",
      "REVIEW_ADMIN_TOKEN is not set. The review boundary refuses to run " +
        "without an admin token rather than falling back to an open door.",
    );
  }

  // Deriving the signing key from the admin token keeps the pilot down to one
  // secret. An explicit secret is preferred and used when present.
  const sessionSecret = isNonEmptyString(env.REVIEW_SESSION_SECRET)
    ? env.REVIEW_SESSION_SECRET
    : sign("review-session-key", adminToken);

  const parsedTtl = Number.parseInt(env.REVIEW_SESSION_TTL_MS ?? "", 10);
  return {
    adminToken,
    sessionSecret,
    sessionTtlMs:
      Number.isFinite(parsedTtl) && parsedTtl > 0
        ? parsedTtl
        : DEFAULT_SESSION_TTL_MS,
    now: () => Date.now(),
  };
}

/**
 * Verify a presented admin token and mint a session.
 *
 * Returns `undefined` for a wrong token. The caller must not distinguish
 * "missing" from "wrong" in its response.
 */
export function authenticateAdminToken(
  presentedToken: string | undefined,
  config: ReviewAuthConfig,
): ReviewSession | undefined {
  // Always run the comparison, even with no token supplied, so the failure path
  // costs the same.
  const matches = constantTimeEquals(presentedToken ?? "", config.adminToken);
  if (!matches || !isNonEmptyString(presentedToken)) return undefined;

  const issuedAt = config.now();
  return {
    sessionId: randomBytes(16).toString("base64url"),
    reviewerId: REVIEW_REVIEWER_ID,
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(issuedAt + config.sessionTtlMs).toISOString(),
    csrfToken: randomBytes(32).toString("base64url"),
  };
}

/** Serialise a session into a signed, tamper-evident token. */
export function createSessionToken(
  session: ReviewSession,
  config: ReviewAuthConfig,
): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString(
    "base64url",
  );
  return `${payload}.${sign(payload, config.sessionSecret)}`;
}

function observedContextPayload(context: ObservedReviewContext): string {
  return JSON.stringify({
    runId: context.runId,
    viewedRevision: context.viewedRevision,
    packageId: context.packageId,
    reviewedContentFingerprint: context.reviewedContentFingerprint,
    sessionId: context.sessionId,
    reviewerId: context.reviewerId,
  });
}

/** Sign the exact view context; it is opaque to callers and session-bound. */
export function createObservedReviewContextToken(
  context: Omit<ObservedReviewContext, "sessionId" | "reviewerId">,
  session: ReviewSession,
  config: ReviewAuthConfig,
): string {
  const bound: ObservedReviewContext = {
    ...context,
    sessionId: session.sessionId,
    reviewerId: session.reviewerId,
  };
  const payload = Buffer.from(observedContextPayload(bound), "utf8").toString(
    "base64url",
  );
  return `${payload}.${sign(payload, config.sessionSecret)}`;
}

/** Verify an observed context and bind it back to the authenticated session. */
export function verifyObservedReviewContextToken(
  token: string | undefined,
  session: ReviewSession,
  config: ReviewAuthConfig,
): ObservedReviewContext {
  if (!isNonEmptyString(token)) {
    throw new ReviewAuthError("csrf-rejected", "Review context is missing");
  }
  const separator = token.lastIndexOf(".");
  if (separator <= 0) {
    throw new ReviewAuthError("csrf-rejected", "Review context is invalid");
  }
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!constantTimeEquals(signature, sign(payload, config.sessionSecret))) {
    throw new ReviewAuthError("csrf-rejected", "Review context is invalid");
  }
  let context: ObservedReviewContext;
  try {
    context = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as ObservedReviewContext;
  } catch {
    throw new ReviewAuthError("csrf-rejected", "Review context is invalid");
  }
  if (
    !isNonEmptyString(context.runId) ||
    !Number.isSafeInteger(context.viewedRevision) ||
    context.viewedRevision < 1 ||
    !isNonEmptyString(context.packageId) ||
    !isNonEmptyString(context.reviewedContentFingerprint) ||
    context.sessionId !== session.sessionId ||
    context.reviewerId !== session.reviewerId
  ) {
    throw new ReviewAuthError("csrf-rejected", "Review context is invalid");
  }
  return context;
}

/** Capability created only after session, CSRF, and observed-context checks. */
export function authorizeHumanReviewAppend(
  context: ObservedReviewContext,
  config: ReviewAuthConfig,
): HumanReviewAppendAuthorization {
  return signHumanReviewAppendAuthorization(
    {
      runId: context.runId,
      reviewerId: context.reviewerId,
      sessionId: context.sessionId,
      packageId: context.packageId,
      reviewedRevision: context.viewedRevision,
      reviewedContentFingerprint: context.reviewedContentFingerprint,
    },
    config.sessionSecret,
  );
}

/**
 * Verify a session token's signature and expiry. Returns `undefined` for
 * anything that is not a live, correctly signed session.
 */
export function readSessionToken(
  token: string | undefined,
  config: ReviewAuthConfig,
): ReviewSession | undefined {
  if (!isNonEmptyString(token)) return undefined;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return undefined;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!constantTimeEquals(signature, sign(payload, config.sessionSecret))) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }

  const session = parsed as Partial<ReviewSession> | null;
  if (
    !session ||
    !isNonEmptyString(session.sessionId) ||
    !isNonEmptyString(session.reviewerId) ||
    !isNonEmptyString(session.csrfToken) ||
    !isNonEmptyString(session.expiresAt)
  ) {
    return undefined;
  }

  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= config.now())
    return undefined;

  return {
    sessionId: session.sessionId,
    reviewerId: session.reviewerId,
    issuedAt: session.issuedAt ?? new Date(0).toISOString(),
    expiresAt: session.expiresAt,
    csrfToken: session.csrfToken,
  };
}

/** Minimal request shape, so this does not depend on the Next.js runtime. */
export interface RequestLike {
  headers: { get(name: string): string | null };
}

function readCookie(
  cookieHeader: string | null,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

export function readSessionFromRequest(
  request: RequestLike,
  config: ReviewAuthConfig,
): ReviewSession | undefined {
  const token = readCookie(
    request.headers.get("cookie"),
    REVIEW_SESSION_COOKIE,
  );
  return readSessionToken(token, config);
}

export interface SessionCookie {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    secure: true;
    sameSite: "strict";
    path: string;
    maxAge: number;
  };
}

export function sessionCookie(
  token: string,
  config: ReviewAuthConfig,
): SessionCookie {
  return {
    name: REVIEW_SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: Math.floor(config.sessionTtlMs / 1000),
    },
  };
}

export function clearedSessionCookie(): SessionCookie {
  return {
    name: REVIEW_SESSION_COOKIE,
    value: "",
    options: {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    },
  };
}

/**
 * Verify a state-changing request.
 *
 * Two independent checks: the CSRF token must match the one inside the signed
 * session, and a browser-supplied Origin must match the Host it was sent to.
 * The CSRF token is delivered by rendering it into the page rather than through
 * a script-readable cookie, so injected cross-site script cannot lift it from
 * `document.cookie`.
 *
 * The token is accepted from the `X-Review-Csrf` header or, for a plain HTML
 * form that cannot set headers, from a `csrfToken` field in the body. Both are
 * compared against the session's token in constant time.
 */
export function verifyCsrf(
  request: RequestLike,
  session: ReviewSession,
  formToken?: string,
): void {
  const presented = request.headers.get(REVIEW_CSRF_HEADER) ?? formToken;
  if (
    !isNonEmptyString(presented) ||
    !constantTimeEquals(presented, session.csrfToken)
  ) {
    throw new ReviewAuthError(
      "csrf-rejected",
      "CSRF token missing or incorrect for a state-changing review request",
    );
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin) {
    if (!host) {
      throw new ReviewAuthError(
        "csrf-rejected",
        "Origin was supplied without a Host header",
      );
    }
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new ReviewAuthError(
        "csrf-rejected",
        `Unparseable Origin: ${origin}`,
      );
    }
    if (originHost !== host) {
      throw new ReviewAuthError(
        "csrf-rejected",
        `Origin ${originHost} does not match Host ${host}`,
      );
    }
  }
}

/** Guard browser login posts before a session (and therefore CSRF token) exists. */
export function verifyPreSessionRequest(request: RequestLike): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin) {
    try {
      if (!host || new URL(origin).host !== host) throw new Error();
    } catch {
      throw new ReviewAuthError(
        "csrf-rejected",
        "Cross-origin login request rejected",
      );
    }
  } else if (fetchSite && fetchSite !== "same-origin") {
    throw new ReviewAuthError(
      "csrf-rejected",
      "Cross-site login request rejected",
    );
  }
}

/**
 * Require an authenticated reviewer. Every state-changing review path must go
 * through this; there is no code path that accepts a caller-supplied reviewer
 * identity.
 */
export function requireSession(
  request: RequestLike,
  config: ReviewAuthConfig,
): ReviewSession {
  const session = readSessionFromRequest(request, config);
  if (!session) {
    throw new ReviewAuthError(
      "no-session",
      "An authenticated review session is required",
    );
  }
  return session;
}
