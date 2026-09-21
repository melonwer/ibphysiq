import {
  authenticateAdminToken,
  clearedSessionCookie,
  constantTimeEquals,
  createSessionToken,
  readSessionFromRequest,
  readSessionToken,
  requireSession,
  ReviewAuthConfig,
  ReviewAuthError,
  reviewAuthConfigFromEnv,
  sessionCookie,
  verifyCsrf,
} from "../review-auth";
import type { RequestLike } from "../review-auth";

const ADMIN_TOKEN = "admin-token-that-is-long-and-random-1234567890";

function config(overrides: Partial<ReviewAuthConfig> = {}): ReviewAuthConfig {
  return {
    adminToken: ADMIN_TOKEN,
    sessionSecret: "session-secret",
    sessionTtlMs: 60_000,
    now: () => Date.parse("2026-09-21T00:00:00.000Z"),
    ...overrides,
  };
}

function request(headers: Record<string, string>): RequestLike {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    headers: {
      get: (name: string) => normalized.get(name.toLowerCase()) ?? null,
    },
  };
}

function sessionFor(cfg: ReviewAuthConfig) {
  const session = authenticateAdminToken(ADMIN_TOKEN, cfg);
  if (!session) throw new Error("expected a session");
  return session;
}

describe("reviewAuthConfigFromEnv", () => {
  it("refuses to run without an admin token", () => {
    expect(() => reviewAuthConfigFromEnv({})).toThrow(ReviewAuthError);
    expect(() => reviewAuthConfigFromEnv({})).toThrow(/REVIEW_ADMIN_TOKEN/);
  });

  it("derives a signing key from the admin token when none is configured", () => {
    const cfg = reviewAuthConfigFromEnv({ REVIEW_ADMIN_TOKEN: ADMIN_TOKEN });
    expect(cfg.sessionSecret).toBeTruthy();
    expect(cfg.sessionSecret).not.toBe(ADMIN_TOKEN);
    expect(cfg.sessionTtlMs).toBeGreaterThan(0);
  });

  it("prefers an explicit session secret and honours a custom ttl", () => {
    const cfg = reviewAuthConfigFromEnv({
      REVIEW_ADMIN_TOKEN: ADMIN_TOKEN,
      REVIEW_SESSION_SECRET: "explicit",
      REVIEW_SESSION_TTL_MS: "1000",
    });
    expect(cfg.sessionSecret).toBe("explicit");
    expect(cfg.sessionTtlMs).toBe(1000);
  });

  it("ignores a nonsense ttl rather than minting instant-expiry sessions", () => {
    expect(
      reviewAuthConfigFromEnv({
        REVIEW_ADMIN_TOKEN: ADMIN_TOKEN,
        REVIEW_SESSION_TTL_MS: "not-a-number",
      }).sessionTtlMs,
    ).toBeGreaterThan(0);
  });
});

describe("constantTimeEquals", () => {
  it("compares equal and unequal values correctly", () => {
    expect(constantTimeEquals("abc", "abc")).toBe(true);
    expect(constantTimeEquals("abc", "abd")).toBe(false);
    expect(constantTimeEquals("", "")).toBe(true);
    expect(constantTimeEquals("abc", "ab")).toBe(false);
  });

  it("handles differing lengths without throwing", () => {
    // crypto.timingSafeEqual throws on length mismatch; this must not.
    expect(() => constantTimeEquals("a", "a".repeat(500))).not.toThrow();
    expect(constantTimeEquals("a", "a".repeat(500))).toBe(false);
  });

  it("is not confused by unicode of differing byte lengths", () => {
    expect(constantTimeEquals("café", "cafe")).toBe(false);
    expect(constantTimeEquals("café", "café")).toBe(true);
  });
});

describe("authenticateAdminToken", () => {
  it("mints a session for the correct token", () => {
    const cfg = config();
    const session = authenticateAdminToken(ADMIN_TOKEN, cfg);

    expect(session).toMatchObject({ reviewerId: "pilot-admin" });
    expect(session?.csrfToken).toBeTruthy();
    expect(session?.sessionId).toBeTruthy();
    expect(session?.expiresAt).toBe("2026-09-21T00:01:00.000Z");
  });

  it("rejects a wrong, empty, or absent token", () => {
    const cfg = config();
    expect(authenticateAdminToken("wrong", cfg)).toBeUndefined();
    expect(authenticateAdminToken("", cfg)).toBeUndefined();
    expect(authenticateAdminToken(undefined, cfg)).toBeUndefined();
  });

  it("rejects a token that merely shares a prefix", () => {
    const cfg = config();
    expect(
      authenticateAdminToken(ADMIN_TOKEN.slice(0, -1), cfg),
    ).toBeUndefined();
    expect(authenticateAdminToken(`${ADMIN_TOKEN}x`, cfg)).toBeUndefined();
  });

  it("issues a distinct CSRF token per session", () => {
    const cfg = config();
    expect(sessionFor(cfg).csrfToken).not.toBe(sessionFor(cfg).csrfToken);
  });
});

describe("session tokens", () => {
  it("round-trips a session", () => {
    const cfg = config();
    const session = sessionFor(cfg);
    expect(readSessionToken(createSessionToken(session, cfg), cfg)).toEqual(
      session,
    );
  });

  it("rejects a tampered payload", () => {
    const cfg = config();
    const token = createSessionToken(sessionFor(cfg), cfg);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        sessionId: "forged",
        reviewerId: "attacker",
        issuedAt: new Date(0).toISOString(),
        expiresAt: "2999-01-01T00:00:00.000Z",
        csrfToken: "x",
      }),
      "utf8",
    ).toString("base64url");

    expect(readSessionToken(`${forged}.${signature}`, cfg)).toBeUndefined();
    expect(readSessionToken(`${payload}.deadbeef`, cfg)).toBeUndefined();
  });

  it("rejects a token signed with a different secret", () => {
    const cfg = config();
    const other = config({ sessionSecret: "different-secret" });
    const token = createSessionToken(sessionFor(cfg), other);
    expect(readSessionToken(token, cfg)).toBeUndefined();
  });

  it("rejects an expired session", () => {
    const cfg = config();
    const session = sessionFor(cfg);
    const token = createSessionToken(session, cfg);
    const later = config({ now: () => Date.parse("2026-09-21T00:02:00.000Z") });
    expect(readSessionToken(token, later)).toBeUndefined();
  });

  it("rejects malformed tokens", () => {
    const cfg = config();
    for (const token of ["", ".", "no-dot", "a.b.c", "!!!.???"]) {
      expect(readSessionToken(token, cfg)).toBeUndefined();
    }
  });
});

describe("cookie handling", () => {
  it("issues an httpOnly, secure, same-site cookie", () => {
    const cfg = config();
    const cookie = sessionCookie(createSessionToken(sessionFor(cfg), cfg), cfg);

    expect(cookie.name).toBe("ibphysiq_review_session");
    expect(cookie.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
    });
    expect(cookie.options.maxAge).toBe(60);
  });

  it("clears the cookie on logout", () => {
    expect(clearedSessionCookie().options.maxAge).toBe(0);
  });

  it("reads a session out of a Cookie header", () => {
    const cfg = config();
    const session = sessionFor(cfg);
    const token = createSessionToken(session, cfg);

    const parsed = readSessionFromRequest(
      request({
        cookie: `other=1; ibphysiq_review_session=${token}; trailing=2`,
      }),
      cfg,
    );
    expect(parsed).toEqual(session);
  });

  it("ignores unrelated cookies", () => {
    const cfg = config();
    expect(
      readSessionFromRequest(request({ cookie: "other=1" }), cfg),
    ).toBeUndefined();
    expect(readSessionFromRequest(request({}), cfg)).toBeUndefined();
  });
});

describe("requireSession", () => {
  it("throws without a session rather than defaulting to an identity", () => {
    expect(() => requireSession(request({}), config())).toThrow(
      /authenticated review session is required/,
    );
  });

  it("returns the authenticated session when present", () => {
    const cfg = config();
    const session = sessionFor(cfg);
    expect(
      requireSession(
        request({
          cookie: `ibphysiq_review_session=${createSessionToken(session, cfg)}`,
        }),
        cfg,
      ),
    ).toEqual(session);
  });
});

describe("verifyCsrf", () => {
  it("accepts a matching token", () => {
    const cfg = config();
    const session = sessionFor(cfg);
    expect(() =>
      verifyCsrf(request({ "x-review-csrf": session.csrfToken }), session),
    ).not.toThrow();
  });

  it("rejects a missing or wrong token", () => {
    const session = sessionFor(config());
    expect(() => verifyCsrf(request({}), session)).toThrow(/CSRF token/);
    expect(() =>
      verifyCsrf(request({ "x-review-csrf": "wrong" }), session),
    ).toThrow(/CSRF token/);
  });

  it("rejects a cross-origin request even with the right token", () => {
    const session = sessionFor(config());
    expect(() =>
      verifyCsrf(
        request({
          "x-review-csrf": session.csrfToken,
          origin: "https://evil.example",
          host: "localhost:3000",
        }),
        session,
      ),
    ).toThrow(/does not match Host/);
  });

  it("accepts a same-origin request", () => {
    const session = sessionFor(config());
    expect(() =>
      verifyCsrf(
        request({
          "x-review-csrf": session.csrfToken,
          origin: "http://localhost:3000",
          host: "localhost:3000",
        }),
        session,
      ),
    ).not.toThrow();
  });

  it("rejects an unparseable origin", () => {
    const session = sessionFor(config());
    expect(() =>
      verifyCsrf(
        request({
          "x-review-csrf": session.csrfToken,
          origin: "not a url",
          host: "localhost:3000",
        }),
        session,
      ),
    ).toThrow(/Unparseable Origin/);
  });

  it("rejects an Origin header when Host is absent", () => {
    const session = sessionFor(config());
    expect(() =>
      verifyCsrf(
        request({
          "x-review-csrf": session.csrfToken,
          origin: "http://localhost:3000",
        }),
        session,
      ),
    ).toThrow(/without a Host header/);
  });
});
