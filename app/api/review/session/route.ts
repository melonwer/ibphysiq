/**
 * Pilot review sign-in and sign-out.
 *
 * Sign-in exchanges the admin token for a signed, HTTP-only session cookie. The
 * token itself is never stored in the session, never echoed back, and never
 * logged. Sign-out simply clears the cookie.
 */

import { NextResponse } from "next/server";

import {
  authenticateAdminToken,
  clearedSessionCookie,
  createSessionToken,
  requireSession,
  reviewAuthConfigFromEnv,
  sessionCookie,
  verifyPreSessionRequest,
  verifyCsrf,
} from "@/lib/review/review-auth";
import {
  readReviewBody,
  reviewErrorResponse,
  wantsHtml,
} from "@/lib/review/review-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    verifyPreSessionRequest(request);
  } catch (error) {
    return reviewErrorResponse(error);
  }
  let config;
  try {
    config = reviewAuthConfigFromEnv();
  } catch (error) {
    return reviewErrorResponse(error);
  }

  const body = await readReviewBody(request);
  const session = authenticateAdminToken(body.token, config);
  if (!session) {
    // One message for missing and wrong tokens alike.
    return NextResponse.json(
      { error: "invalid_credentials", message: "Invalid admin token" },
      { status: 401 },
    );
  }

  const response = wantsHtml(request)
    ? NextResponse.redirect(new URL("/review", request.url), { status: 303 })
    : NextResponse.json({
        reviewerId: session.reviewerId,
        expiresAt: session.expiresAt,
        csrfToken: session.csrfToken,
      });

  const cookie = sessionCookie(createSessionToken(session, config), config);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  // The CSRF token is only returned to a client that already proved it holds
  // the admin token, and never in a script-readable cookie.
  return response;
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const config = reviewAuthConfigFromEnv();
    const session = requireSession(request, config);
    verifyCsrf(request, session);

    const response = NextResponse.json({ signedOut: true });
    const cookie = clearedSessionCookie();
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return reviewErrorResponse(error);
  }
}
