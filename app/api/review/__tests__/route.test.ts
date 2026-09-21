/**
 * Route-level tests for the review boundary.
 *
 * These go through the HTTP handlers rather than the service, so they cover the
 * parts a caller can actually reach: cookie handling, status codes, CSRF
 * enforcement, and the fact that no anonymous request can record a decision.
 *
 * No network access: the store is a temporary directory and the model providers
 * are never touched — a seeded run comes from the deterministic replay fixtures.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GET as queueGET } from "../queue/route";
import { DELETE as signOut, POST as signIn } from "../session/route";
import { POST as decidePOST } from "../runs/[runId]/decisions/route";
import { GET as runGET } from "../runs/[runId]/route";
import {
  REVIEW_SESSION_COOKIE,
  authenticateAdminToken,
  createSessionToken,
  type ReviewAuthConfig,
} from "@/lib/review/review-auth";
import { requestLikeFromHeaders } from "@/lib/review/review-http";
import {
  JsonlQuestionRunStore,
  circuitReplayRequest,
  createCircuitReplayAdapters,
  runQuestionGraph,
  type QuestionRun,
} from "@/lib/generation-harness";

const ADMIN_TOKEN = "review-route-admin-token-abcdefghijklmnop";
const SESSION_SECRET = "review-route-session-secret";
const NOW = "2026-09-21T12:00:00.000Z";

let rootDir: string;
let store: JsonlQuestionRunStore;
let seeded: QuestionRun;
let sessionToken: string;
let csrfToken: string;

function envConfig(): ReviewAuthConfig {
  return {
    adminToken: ADMIN_TOKEN,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 3_600_000,
    now: () => Date.now(),
  };
}

function mintSession(): { token: string; csrfToken: string } {
  const session = authenticateAdminToken(ADMIN_TOKEN, envConfig());
  if (!session) throw new Error("expected a session for the test admin token");
  return {
    token: createSessionToken(session, envConfig()),
    csrfToken: session.csrfToken,
  };
}

interface ApiRequestInit {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

function apiRequest(path: string, init: ApiRequestInit = {}): Request {
  const { headers = {}, ...rest } = init;
  return new Request(`http://localhost${path}`, { ...rest, headers });
}

function authenticated(path: string, init: ApiRequestInit = {}): Request {
  const { headers = {}, ...rest } = init;
  return apiRequest(path, {
    ...rest,
    headers: {
      cookie: `${REVIEW_SESSION_COOKIE}=${sessionToken}`,
      host: "localhost",
      ...headers,
    },
  });
}

function decisionBody(fields: Record<string, string>): {
  headers: Record<string, string>;
  body: string;
} {
  return {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(fields),
  };
}

function runContext(runId: string) {
  return { params: Promise.resolve({ runId }) };
}

/** The stored run, asserted present so assertions read as plainly as possible. */
async function storedRun(): Promise<QuestionRun> {
  const run = await store.fetch(seeded.runId);
  if (!run) throw new Error(`Expected ${seeded.runId} to be stored`);
  return run;
}

async function observedReviewContext(runId = seeded.runId): Promise<string> {
  const response = await runGET(
    authenticated(`/api/review/runs/${runId}`),
    runContext(runId),
  );
  const { run } = (await response.json()) as {
    run: { observedReviewContext?: string };
  };
  if (!run.observedReviewContext) throw new Error("expected review context");
  return run.observedReviewContext;
}

beforeEach(async () => {
  rootDir = await fs.mkdtemp(join(tmpdir(), "review-route-"));
  process.env.REVIEW_RUN_STORE_DIR = rootDir;
  process.env.REVIEW_ADMIN_TOKEN = ADMIN_TOKEN;
  process.env.REVIEW_SESSION_SECRET = SESSION_SECRET;

  store = new JsonlQuestionRunStore(rootDir);
  seeded = await runQuestionGraph(
    circuitReplayRequest(),
    createCircuitReplayAdapters(),
    {
      store,
      now: () => NOW,
    },
  );

  ({ token: sessionToken, csrfToken } = mintSession());
});

afterEach(async () => {
  delete process.env.REVIEW_RUN_STORE_DIR;
  delete process.env.REVIEW_ADMIN_TOKEN;
  delete process.env.REVIEW_SESSION_SECRET;
  await fs.rm(rootDir, { recursive: true, force: true });
});

describe("POST /api/review/session", () => {
  it("exchanges the admin token for a hardened session cookie", async () => {
    const response = await signIn(
      apiRequest("/api/review/session", {
        method: "POST",
        ...decisionBody({ token: ADMIN_TOKEN }),
      }),
    );

    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${REVIEW_SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=strict");

    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.reviewerId).toBe("pilot-admin");
    expect(typeof payload.csrfToken).toBe("string");
    // The admin token itself is never returned or embedded in the session.
    expect(JSON.stringify(payload)).not.toContain(ADMIN_TOKEN);
  });

  it("refuses a wrong token without setting a cookie", async () => {
    const response = await signIn(
      apiRequest("/api/review/session", {
        method: "POST",
        ...decisionBody({ token: "not-the-admin-token" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects cross-origin browser login attempts before token authentication", async () => {
    const crossOrigin = await signIn(
      apiRequest("/api/review/session", {
        method: "POST",
        headers: {
          ...decisionBody({ token: ADMIN_TOKEN }).headers,
          origin: "https://evil.example",
          host: "localhost",
        },
        body: JSON.stringify({ token: ADMIN_TOKEN }),
      }),
    );
    expect(crossOrigin.status).toBe(403);

    const fetchCrossSite = await signIn(
      apiRequest("/api/review/session", {
        method: "POST",
        headers: {
          ...decisionBody({ token: ADMIN_TOKEN }).headers,
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify({ token: ADMIN_TOKEN }),
      }),
    );
    expect(fetchCrossSite.status).toBe(403);
  });

  it("permits same-origin and non-browser token login", async () => {
    const sameOrigin = await signIn(
      apiRequest("/api/review/session", {
        method: "POST",
        headers: {
          ...decisionBody({ token: ADMIN_TOKEN }).headers,
          origin: "http://localhost",
          host: "localhost",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify({ token: ADMIN_TOKEN }),
      }),
    );
    expect(sameOrigin.status).toBe(200);
  });

  it("gives the same answer for a missing token as for a wrong one", async () => {
    const missing = await signIn(
      apiRequest("/api/review/session", {
        method: "POST",
        ...decisionBody({}),
      }),
    );
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({
      error: "invalid_credentials",
      message: "Invalid admin token",
    });
  });

  it("refuses to run at all when no admin token is configured", async () => {
    delete process.env.REVIEW_ADMIN_TOKEN;

    const response = await signIn(
      apiRequest("/api/review/session", {
        method: "POST",
        ...decisionBody({ token: ADMIN_TOKEN }),
      }),
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("review_not_configured");
  });

  it("clears the session cookie on a CSRF-protected sign-out", async () => {
    const response = await signOut(
      authenticated("/api/review/session", {
        method: "DELETE",
        headers: { "x-review-csrf": csrfToken },
      }),
    );
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${REVIEW_SESSION_COOKIE}=;`);
    expect(cookie).toMatch(/Max-Age=0/i);
  });

  it("refuses anonymous or cross-site sign-out requests", async () => {
    expect(
      (await signOut(apiRequest("/api/review/session", { method: "DELETE" })))
        .status,
    ).toBe(401);

    expect(
      (
        await signOut(
          authenticated("/api/review/session", {
            method: "DELETE",
            headers: {
              "x-review-csrf": csrfToken,
              origin: "http://evil.example",
              host: "localhost",
            },
          }),
        )
      ).status,
    ).toBe(403);
  });
});

describe("GET /api/review/queue", () => {
  it("rejects an anonymous caller", async () => {
    const response = await queueGET(apiRequest("/api/review/queue"));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthenticated");
  });

  it("rejects a forged session cookie", async () => {
    const [payload] = sessionToken.split(".");
    const forged = apiRequest("/api/review/queue", {
      headers: { cookie: `${REVIEW_SESSION_COOKIE}=${payload}.deadbeef` },
    });

    expect((await queueGET(forged)).status).toBe(401);
  });

  it("lists runs awaiting a human decision", async () => {
    const response = await queueGET(authenticated("/api/review/queue"));
    expect(response.status).toBe(200);

    const { runs } = (await response.json()) as {
      runs: Array<{ runId: string; status: string }>;
    };
    expect(runs.map((run) => run.runId)).toContain(seeded.runId);
    expect(runs.every((run) => run.status === "awaiting-human-review")).toBe(
      true,
    );
  });

  it("keeps an accepted-but-incomplete run discoverable in the API queue", async () => {
    await decidePOST(
      authenticated(`/api/review/runs/${seeded.runId}/decisions`, {
        method: "POST",
        ...decisionBody({
          concern: "educational-acceptance",
          outcome: "accept",
          notes: "Looks right",
          csrfToken,
          reviewContext: await observedReviewContext(),
        }),
      }),
      runContext(seeded.runId),
    );

    const response = await queueGET(authenticated("/api/review/queue"));
    const { runs } = (await response.json()) as {
      runs: Array<{ runId: string; status: string }>;
    };
    expect(runs).toContainEqual(
      expect.objectContaining({ runId: seeded.runId, status: "accepted" }),
    );
  });
});

describe("GET /api/review/runs/[runId]", () => {
  it("rejects an anonymous caller", async () => {
    const response = await runGET(
      apiRequest(`/api/review/runs/${seeded.runId}`),
      runContext(seeded.runId),
    );
    expect(response.status).toBe(401);
  });

  it("returns the full review payload for a signed-in reviewer", async () => {
    const response = await runGET(
      authenticated(`/api/review/runs/${seeded.runId}`),
      runContext(seeded.runId),
    );
    expect(response.status).toBe(200);

    const { run } = (await response.json()) as {
      run: {
        runId: string;
        question?: { stem: string };
        renderedVisuals: unknown[];
      };
    };
    expect(run.runId).toBe(seeded.runId);
    expect(run.question?.stem.length).toBeGreaterThan(0);
  });

  it("is a 404 for a run that does not exist", async () => {
    const response = await runGET(
      authenticated(
        "/api/review/runs/question-run-00000000-0000-4000-8000-000000000000",
      ),
      runContext("question-run-00000000-0000-4000-8000-000000000000"),
    );
    expect(response.status).toBe(404);
  });
});

describe("POST /api/review/runs/[runId]/decisions", () => {
  async function decide(
    fields: Record<string, string>,
    headers: Record<string, string> = {},
  ) {
    const { headers: bodyHeaders, body } = decisionBody({
      ...fields,
      reviewContext: fields.reviewContext ?? (await observedReviewContext()),
    });
    return decidePOST(
      authenticated(`/api/review/runs/${seeded.runId}/decisions`, {
        method: "POST",
        body,
        headers: { ...bodyHeaders, ...headers },
      }),
      runContext(seeded.runId),
    );
  }

  it("rejects an anonymous decision", async () => {
    const response = await decidePOST(
      apiRequest(`/api/review/runs/${seeded.runId}/decisions`, {
        method: "POST",
        ...decisionBody({
          concern: "educational-acceptance",
          outcome: "accept",
          notes: "no session",
          csrfToken,
        }),
      }),
      runContext(seeded.runId),
    );

    expect(response.status).toBe(401);
    const stored = await storedRun();
    expect(stored.humanReviews).toEqual([]);
    expect(stored.status).toBe("awaiting-human-review");
  });

  it("rejects a decision with no CSRF token", async () => {
    const response = await decide({
      concern: "educational-acceptance",
      outcome: "accept",
      notes: "",
    });

    expect(response.status).toBe(403);
    expect((await storedRun()).humanReviews).toEqual([]);
  });

  it("rejects a decision with a wrong CSRF token", async () => {
    const response = await decide({
      concern: "educational-acceptance",
      outcome: "accept",
      notes: "",
      csrfToken: "not-the-session-token",
    });

    expect(response.status).toBe(403);
    expect((await storedRun()).humanReviews).toEqual([]);
  });

  it("rejects a cross-origin request even with a valid CSRF token", async () => {
    const response = await decide(
      {
        concern: "educational-acceptance",
        outcome: "accept",
        notes: "",
        csrfToken,
      },
      { origin: "http://evil.example", host: "localhost" },
    );

    expect(response.status).toBe(403);
    expect((await storedRun()).humanReviews).toEqual([]);
  });

  it("records an acceptance and still reports the record as not training-ready", async () => {
    const response = await decide({
      concern: "educational-acceptance",
      outcome: "accept",
      notes: "Physics and mark scheme check out",
      csrfToken,
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      status: string;
      deduplicated: boolean;
      readiness: { ready: boolean; blockers: string[] };
      decision: {
        reviewerId: string;
        reviewerAuthMethod: string;
        reviewedRevision: number;
        reviewedContentFingerprint: string;
      };
    };

    expect(payload.status).toBe("accepted");
    expect(payload.decision.reviewerId).toBe("pilot-admin");
    expect(payload.decision.reviewerAuthMethod).toBe(
      "pilot-admin-token-session",
    );
    expect(payload.decision.reviewedRevision).toBeGreaterThan(0);
    expect(payload.decision.reviewedContentFingerprint).toBeTruthy();
    // Acceptance is one of four clearances; the rest are still outstanding.
    expect(payload.readiness.ready).toBe(false);
    expect(payload.readiness.blockers).toEqual(
      expect.arrayContaining([
        "no source-use-clearance decision recorded",
        "no training-metadata decision recorded",
        "no grouped-split decision recorded",
      ]),
    );
  });

  it("does not let the caller claim a reviewer identity", async () => {
    const response = await decide({
      concern: "source-use-clearance",
      outcome: "accept",
      notes: "",
      csrfToken,
      reviewerId: "someone-else",
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      decision: { reviewerId: string };
    };
    expect(payload.decision.reviewerId).toBe("pilot-admin");
    // The concern was recorded without moving the run's status.
    expect((await storedRun()).status).toBe("awaiting-human-review");
  });

  it("is idempotent for a repeated decision", async () => {
    const fields = {
      concern: "educational-acceptance",
      outcome: "accept",
      notes: "Same decision submitted twice",
      csrfToken,
    };

    const first = await decide(fields);
    const second = await decide(fields);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    expect(
      ((await first.json()) as { deduplicated: boolean }).deduplicated,
    ).toBe(false);
    expect(
      ((await second.json()) as { deduplicated: boolean }).deduplicated,
    ).toBe(true);

    const stored = await storedRun();
    expect(stored.humanReviews).toHaveLength(1);
  });

  it("requires notes when rejecting or sending back", async () => {
    const response = await decide({
      concern: "educational-acceptance",
      outcome: "reject",
      notes: "   ",
      csrfToken,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("notes-required");
    expect((await storedRun()).humanReviews).toEqual([]);
  });

  it("rejects an unknown concern or outcome", async () => {
    const unknownConcern = await decide({
      concern: "looks-good-to-me",
      outcome: "accept",
      notes: "",
      csrfToken,
    });
    expect(unknownConcern.status).toBe(400);

    const unknownOutcome = await decide({
      concern: "educational-acceptance",
      outcome: "publish",
      notes: "",
      csrfToken,
    });
    expect(unknownOutcome.status).toBe(400);
    expect((await storedRun()).humanReviews).toEqual([]);
  });

  it("redirects a plain form submission instead of returning JSON", async () => {
    const form = new URLSearchParams({
      concern: "educational-acceptance",
      outcome: "send-back-for-repair",
      notes: "Part (b) needs a clearer mark allocation",
      csrfToken,
      reviewContext: await observedReviewContext(),
    });

    const response = await decidePOST(
      authenticated(`/api/review/runs/${seeded.runId}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }),
      runContext(seeded.runId),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(`runId=${seeded.runId}`);
    expect((await storedRun()).status).toBe("sent-back-for-repair");
  });
});

describe("requestLikeFromHeaders", () => {
  it("adapts a Headers-like object into the shape the auth code reads", () => {
    // Regression: the review page passed the object returned by next/headers()
    // straight through as a RequestLike. It is Headers-like, not a Request, so
    // `headers.get` was undefined and every page render returned 500.
    const raw = { get: (name: string) => (name === "cookie" ? "a=b" : null) };
    const adapted = requestLikeFromHeaders(raw);

    expect(adapted.headers.get("cookie")).toBe("a=b");
    expect(adapted.headers.get("origin")).toBeNull();
  });

  it("does not delegate to a nested headers property", () => {
    // A ReadonlyHeaders value that also exposes a non-functional `headers`
    // property must still adapt correctly.
    const raw = {
      get: (name: string) => (name === "origin" ? "http://localhost" : null),
      headers: { notAGet: true },
    };
    const adapted = requestLikeFromHeaders(raw as never);

    expect(adapted.headers.get("origin")).toBe("http://localhost");
  });
});

describe("acceptance is unreachable without a human decision", () => {
  it("refuses to persist a run that claims acceptance with no review event", async () => {
    const run = await storedRun();
    await expect(store.syncRun({ ...run, status: "accepted" })).rejects.toThrow(
      /cannot create human review evidence or human-only statuses/,
    );

    expect((await storedRun()).status).toBe("awaiting-human-review");
  });
});
