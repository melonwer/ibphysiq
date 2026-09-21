import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildReviewView,
  findReviewablePackage,
  listReviewQueue,
  readReviewRun,
  submitReviewDecision as submitReviewDecisionRaw,
} from "../review-service";
import type { ReviewServiceOptions } from "../review-service";
import {
  authenticateAdminToken,
  createSessionToken,
  ReviewAuthConfig,
  ReviewAuthError,
  REVIEW_SESSION_COOKIE,
} from "../review-auth";
import type { RequestLike } from "../review-auth";
import {
  circuitReplayRequest,
  createCircuitReplayAdapters,
  JsonlQuestionRunStore,
  runQuestionGraph,
  QuestionRun,
  evaluateTrainingReadiness,
} from "../../generation-harness";
import { CIRCUIT_REPLAY_PACKAGE_ID } from "../../generation-harness/replay-fixtures";
import { packageContentFingerprint } from "../../generation-harness/replay-fixtures";

const ADMIN_TOKEN = "admin-token-for-the-review-service-1234567890";
const NOW = "2026-09-21T12:00:00.000Z";

let rootDir: string;
let store: JsonlQuestionRunStore;
let authConfig: ReviewAuthConfig;
let sessionToken: string;
let csrfToken: string;

function authConfigFor(): ReviewAuthConfig {
  return {
    adminToken: ADMIN_TOKEN,
    sessionSecret: "review-session-secret",
    sessionTtlMs: 3_600_000,
    now: () => Date.parse(NOW),
  };
}

function request(headers: Record<string, string> = {}): RequestLike {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    headers: {
      get: (name: string) => normalized.get(name.toLowerCase()) ?? null,
    },
  };
}

function authenticatedRequest(): RequestLike {
  return request({
    cookie: `${REVIEW_SESSION_COOKIE}=${sessionToken}`,
    "x-review-csrf": csrfToken,
  });
}

function options(): ReviewServiceOptions {
  return { store, authConfig, now: () => NOW };
}

/** Existing decision tests request a fresh server-rendered context by default. */
async function submitReviewDecision(
  request: RequestLike,
  runId: string,
  input: Parameters<typeof submitReviewDecisionRaw>[2],
  serviceOptions: ReviewServiceOptions,
) {
  const view = await readReviewRun(request, runId, serviceOptions);
  return submitReviewDecisionRaw(
    request,
    runId,
    {
      ...input,
      reviewContext: input.reviewContext ?? view.observedReviewContext,
    },
    serviceOptions,
  );
}

async function seedRun(): Promise<QuestionRun> {
  return runQuestionGraph(
    circuitReplayRequest(),
    createCircuitReplayAdapters(),
    {
      store,
      now: () => NOW,
    },
  );
}

beforeEach(async () => {
  rootDir = await fs.mkdtemp(join(tmpdir(), "review-service-"));
  authConfig = authConfigFor();
  store = new JsonlQuestionRunStore(rootDir, authConfig.sessionSecret);
  const session = authenticateAdminToken(ADMIN_TOKEN, authConfig);
  if (!session) throw new Error("expected a session");
  sessionToken = createSessionToken(session, authConfig);
  csrfToken = session.csrfToken;
});

afterEach(async () => {
  await fs.rm(rootDir, { recursive: true, force: true });
});

describe("authorisation", () => {
  it("refuses a decision without a session", async () => {
    const run = await seedRun();
    await expect(
      submitReviewDecision(
        request(),
        run.runId,
        { concern: "educational-acceptance", outcome: "accept", notes: "" },
        options(),
      ),
    ).rejects.toThrow(/authenticated review session is required/);
  });

  it("refuses a decision from a forged session cookie", async () => {
    const run = await seedRun();
    const forged = request({
      cookie: `${REVIEW_SESSION_COOKIE}=not-a-real-session`,
      "x-review-csrf": csrfToken,
    });

    await expect(
      submitReviewDecision(
        forged,
        run.runId,
        { concern: "educational-acceptance", outcome: "accept", notes: "" },
        options(),
      ),
    ).rejects.toThrow(ReviewAuthError);
  });

  it("refuses a decision without a CSRF token", async () => {
    const run = await seedRun();
    await expect(
      submitReviewDecision(
        request({ cookie: `${REVIEW_SESSION_COOKIE}=${sessionToken}` }),
        run.runId,
        { concern: "educational-acceptance", outcome: "accept", notes: "" },
        options(),
      ),
    ).rejects.toThrow(/CSRF token/);
  });

  it("refuses to read the queue without a session", async () => {
    await expect(listReviewQueue(request(), options())).rejects.toThrow(
      /authenticated review session is required/,
    );
  });

  it("refuses to read a run without a session", async () => {
    const run = await seedRun();
    await expect(
      readReviewRun(request(), run.runId, options()),
    ).rejects.toThrow(/authenticated review session is required/);
  });

  it("takes the reviewer identity from the session, not the caller", async () => {
    const run = await seedRun();
    const result = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      { concern: "educational-acceptance", outcome: "accept", notes: "" },
      options(),
    );
    expect(result.decision.reviewerId).toBe("pilot-admin");
    expect(result.decision.reviewerAuthMethod).toBe(
      "pilot-admin-token-session",
    );
  });
});

describe("decisions", () => {
  it("rejects decisions before the completed automated review boundary", async () => {
    const requested = await store.create(circuitReplayRequest());
    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        requested.runId,
        { concern: "educational-acceptance", outcome: "accept", notes: "" },
        options(),
      ),
    ).rejects.toMatchObject({ code: "csrf-rejected" });

    const running = await store.appendEvent(requested.runId, {
      type: "run-status-changed",
      payload: { status: "running", currentStage: "plan" },
    });
    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        running.runId,
        { concern: "educational-acceptance", outcome: "accept", notes: "" },
        options(),
      ),
    ).rejects.toMatchObject({ code: "csrf-rejected" });
  });

  it("rejects terminal rejected runs but permits accepted runs' remaining clearances", async () => {
    const run = await seedRun();
    const rejected = await store.recordRejection(run.runId, {
      schemaVersion: "question-run-rejection/0.1.0",
      stage: "prepare-review",
      code: "internal-stage-error",
      message: "terminal",
      attempts: 1,
      createdAt: NOW,
    });
    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        rejected.runId,
        { concern: "educational-acceptance", outcome: "accept", notes: "" },
        options(),
      ),
    ).rejects.toMatchObject({ code: "review-not-ready" });

    const allowed = await seedRun();
    await submitReviewDecision(
      authenticatedRequest(),
      allowed.runId,
      { concern: "educational-acceptance", outcome: "accept", notes: "" },
      options(),
    );
    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        allowed.runId,
        { concern: "source-use-clearance", outcome: "accept", notes: "" },
        options(),
      ),
    ).resolves.toMatchObject({ run: { status: "accepted" } });
  });

  it("does not reconsider a sent-back package until its content changes", async () => {
    const run = await seedRun();
    const sentBack = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      {
        concern: "educational-acceptance",
        outcome: "send-back-for-repair",
        notes: "repair it",
      },
      options(),
    );
    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        run.runId,
        { concern: "educational-acceptance", outcome: "accept", notes: "" },
        options(),
      ),
    ).rejects.toMatchObject({ code: "review-not-ready" });

    const repaired = await store.syncRun({
      ...sentBack.run,
      questionPackage: {
        ...sentBack.run.questionPackage!,
        contentFingerprint: "repaired-content-fingerprint",
      },
    });
    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        repaired.runId,
        { concern: "educational-acceptance", outcome: "accept", notes: "" },
        options(),
      ),
    ).rejects.toMatchObject({ code: "review-not-ready" });
  });

  it("binds a repaired decision to the actual resolver-backed displayed package", async () => {
    const run = await seedRun();
    const sentBack = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      {
        concern: "educational-acceptance",
        outcome: "send-back-for-repair",
        notes: "clarify the student-facing wording",
      },
      options(),
    );
    const original = findReviewablePackage(
      sentBack.run.questionPackage!.packageId,
    );
    if (!original) throw new Error("expected replay package");
    const repairedPackage = {
      ...original,
      question: {
        ...original.question,
        stem: `${original.question.stem} The repaired wording is explicit.`,
      },
    } as typeof original;
    const repairedArtifact = {
      ...sentBack.run.questionPackage!,
      contentFingerprint: packageContentFingerprint(repairedPackage),
    };
    const repaired = await store.syncRun({
      ...sentBack.run,
      status: "awaiting-human-review",
      questionPackage: repairedArtifact,
      reviewEnvelope: {
        ...sentBack.run.reviewEnvelope!,
        package: repairedArtifact,
      },
    });

    const result = await submitReviewDecision(
      authenticatedRequest(),
      repaired.runId,
      {
        concern: "educational-acceptance",
        outcome: "accept",
        notes: "the repaired wording is clear",
      },
      {
        ...options(),
        resolvePackage: (packageId) =>
          packageId === repairedPackage.id ? repairedPackage : undefined,
      },
    );

    expect(result.deduplicated).toBe(false);
    expect(result.decision.reviewedContentFingerprint).toBe(
      packageContentFingerprint(repairedPackage),
    );
    expect(result.run.status).toBe("accepted");
  });

  it("rejects fingerprint-only and envelope/package evidence mutations", async () => {
    const run = await seedRun();
    const fingerprintOnly = await store.syncRun({
      ...run,
      questionPackage: {
        ...run.questionPackage!,
        contentFingerprint: "fnv1a32:00000000",
      },
      reviewEnvelope: {
        ...run.reviewEnvelope!,
        package: {
          ...run.questionPackage!,
          contentFingerprint: "fnv1a32:00000000",
        },
      },
    });
    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        fingerprintOnly.runId,
        { concern: "educational-acceptance", outcome: "accept", notes: "" },
        options(),
      ),
    ).rejects.toMatchObject({ code: "review-not-ready" });
    expect(buildReviewView(fingerprintOnly).packageResolved).toBe(false);

    const secondRun = await seedRun();
    const envelopeMismatch = await store.syncRun({
      ...secondRun,
      reviewEnvelope: {
        ...secondRun.reviewEnvelope!,
        package: {
          ...secondRun.questionPackage!,
          marks: secondRun.questionPackage!.marks + 1,
        },
      },
    });
    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        envelopeMismatch.runId,
        { concern: "educational-acceptance", outcome: "accept", notes: "" },
        options(),
      ),
    ).rejects.toMatchObject({ code: "review-not-ready" });
    expect(buildReviewView(envelopeMismatch).packageResolved).toBe(false);
  });

  it("marks prior clearances stale when repaired package content changes", async () => {
    const run = await seedRun();
    let current = run;
    for (const concern of [
      "educational-acceptance",
      "source-use-clearance",
      "training-metadata",
      "grouped-split",
    ] as const) {
      current = (
        await submitReviewDecision(
          authenticatedRequest(),
          current.runId,
          { concern, outcome: "accept", notes: "" },
          options(),
        )
      ).run;
    }
    const repaired = await store.syncRun({
      ...current,
      status: "awaiting-human-review",
      questionPackage: {
        ...current.questionPackage!,
        contentFingerprint: "new-package-fingerprint",
      },
    });
    const readiness = evaluateTrainingReadiness(repaired);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([expect.stringContaining("stale")]),
    );
  });

  it("accepts a run through the educational-acceptance concern", async () => {
    const run = await seedRun();
    expect(run.status).toBe("awaiting-human-review");

    const result = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      { concern: "educational-acceptance", outcome: "accept", notes: "good" },
      options(),
    );

    expect(result.run.status).toBe("accepted");
    expect(result.decision).toMatchObject({
      concern: "educational-acceptance",
      outcome: "accept",
      notes: "good",
    });
    expect((await store.resume(run.runId)).status).toBe("accepted");
  });

  it("sends a run back for repair", async () => {
    const run = await seedRun();
    const result = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      {
        concern: "educational-acceptance",
        outcome: "send-back-for-repair",
        notes: "the diagram is ambiguous",
      },
      options(),
    );
    expect(result.run.status).toBe("sent-back-for-repair");
  });

  it("records a rejection with a human reject", async () => {
    const run = await seedRun();
    const result = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      {
        concern: "educational-acceptance",
        outcome: "reject",
        notes: "answer is wrong",
      },
      options(),
    );
    expect(result.run.status).toBe("rejected");
    expect(result.run.rejection).toBeUndefined();
  });

  it("requires notes for anything other than an acceptance", async () => {
    const run = await seedRun();
    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        run.runId,
        { concern: "educational-acceptance", outcome: "reject", notes: "   " },
        options(),
      ),
    ).rejects.toMatchObject({ code: "notes-required" });
  });

  it("keeps the four concerns independent", async () => {
    const run = await seedRun();

    const clearance = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      {
        concern: "source-use-clearance",
        outcome: "accept",
        notes: "rights confirmed by the publisher",
      },
      options(),
    );

    // Clearing source rights is not an educational acceptance, so the run must
    // still be waiting on a reviewer.
    expect(clearance.run.status).toBe("awaiting-human-review");
    expect(clearance.run.humanReviews).toHaveLength(1);
    expect(clearance.decision.concern).toBe("source-use-clearance");
  });

  it("rejects an unknown concern or outcome", async () => {
    const run = await seedRun();
    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        run.runId,
        { concern: "vibes" as never, outcome: "accept", notes: "" },
        options(),
      ),
    ).rejects.toMatchObject({ code: "invalid-decision" });

    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        run.runId,
        { concern: "grouped-split", outcome: "maybe" as never, notes: "" },
        options(),
      ),
    ).rejects.toMatchObject({ code: "invalid-decision" });
  });

  it("surfaces a missing run rather than inventing one", async () => {
    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        "no-such-run",
        { concern: "educational-acceptance", outcome: "accept", notes: "" },
        options(),
      ),
    ).rejects.toMatchObject({ code: "run-not-found" });
  });
});

describe("idempotency", () => {
  it("treats a repeated identical decision as a no-op", async () => {
    const run = await seedRun();
    const input = {
      concern: "educational-acceptance" as const,
      outcome: "accept" as const,
      notes: "looks good",
    };

    const first = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      input,
      options(),
    );
    const second = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      input,
      options(),
    );

    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.decision.decisionId).toBe(first.decision.decisionId);
    expect(second.run.revision).toBe(first.run.revision);
    expect((await store.resume(run.runId)).humanReviews).toHaveLength(1);
  });

  it("honours a caller-supplied idempotency key across retries", async () => {
    const run = await seedRun();
    const input = {
      concern: "training-metadata" as const,
      outcome: "accept" as const,
      notes: "metadata complete",
      decisionId: "client-key-1",
    };

    await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      input,
      options(),
    );
    const retry = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      input,
      options(),
    );

    expect(retry.deduplicated).toBe(true);
    expect((await store.resume(run.runId)).humanReviews).toHaveLength(1);
  });

  it("deduplicates the same explicit intent after an unrelated decision advances revision", async () => {
    const run = await seedRun();
    const input = {
      concern: "training-metadata" as const,
      outcome: "accept" as const,
      notes: "metadata complete",
      decisionId: "same-content-after-revision",
    };
    await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      input,
      options(),
    );
    await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      {
        concern: "grouped-split",
        outcome: "accept",
        notes: "group assigned",
      },
      options(),
    );

    const retry = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      input,
      options(),
    );
    expect(retry.deduplicated).toBe(true);
  });

  it("does not retarget a decision when the run changes during the authorized append", async () => {
    const run = await seedRun();
    const input = {
      concern: "educational-acceptance" as const,
      outcome: "accept" as const,
      notes: "accept repaired content",
    };
    const originalAppend = store.appendAuthorizedHumanReview.bind(store);
    const concurrentStore = new JsonlQuestionRunStore(rootDir);
    let mutateBeforeAppend = true;
    store.appendAuthorizedHumanReview = async (review, authorization) => {
      if (mutateBeforeAppend) {
        mutateBeforeAppend = false;
        const canonical = await concurrentStore.resume(review.runId);
        await concurrentStore.syncRun({
          ...canonical,
          reviews: [
            ...canonical.reviews,
            {
              reviewerKind: "agent",
              reviewerId: "concurrent-agent",
              decision: "flag",
              notes: "changed after the human rendered the page",
              createdAt: NOW,
            },
          ],
        });
      }
      return originalAppend(review, authorization);
    };

    await expect(
      submitReviewDecision(authenticatedRequest(), run.runId, input, options()),
    ).rejects.toMatchObject({ code: "stale-revision" });
    expect((await store.resume(run.runId)).humanReviews).toEqual([]);
  });

  it("records a fresh auto-derived decision when repaired content changes", async () => {
    const run = await seedRun();
    const input = {
      concern: "educational-acceptance" as const,
      outcome: "accept" as const,
      notes: "same review outcome",
    };
    const first = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      input,
      options(),
    );
    const repaired = await store.syncRun({
      ...first.run,
      status: "awaiting-human-review",
      questionPackage: {
        ...first.run.questionPackage!,
        contentFingerprint: "repaired-for-new-auto-id",
      },
    });

    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        repaired.runId,
        input,
        options(),
      ),
    ).rejects.toMatchObject({ code: "review-not-ready" });
  });

  it("rejects an explicit idempotency key reused against repaired content", async () => {
    const run = await seedRun();
    const input = {
      concern: "educational-acceptance" as const,
      outcome: "accept" as const,
      notes: "same review outcome",
      decisionId: "explicit-content-bound-key",
    };
    const first = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      input,
      options(),
    );
    const repaired = await store.syncRun({
      ...first.run,
      status: "awaiting-human-review",
      questionPackage: {
        ...first.run.questionPackage!,
        contentFingerprint: "repaired-for-explicit-key",
      },
    });

    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        repaired.runId,
        input,
        options(),
      ),
    ).rejects.toMatchObject({ code: "idempotency-conflict" });
  });

  it("records a genuine change of mind as a new decision", async () => {
    const run = await seedRun();
    await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      {
        concern: "grouped-split",
        outcome: "accept",
        notes: "assigned to group a",
      },
      options(),
    );
    const changed = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      { concern: "grouped-split", outcome: "reject", notes: "wrong split" },
      options(),
    );

    expect(changed.deduplicated).toBe(false);
    expect(changed.run.humanReviews).toHaveLength(2);
    expect(changed.readiness.decisions["grouped-split"]?.outcome).toBe(
      "reject",
    );
  });

  it("rejects reuse of an idempotency key for a different decision", async () => {
    const run = await seedRun();
    await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      {
        concern: "grouped-split",
        outcome: "accept",
        notes: "group a",
        decisionId: "one-key",
      },
      options(),
    );

    await expect(
      submitReviewDecision(
        authenticatedRequest(),
        run.runId,
        {
          concern: "grouped-split",
          outcome: "reject",
          notes: "group b",
          decisionId: "one-key",
        },
        options(),
      ),
    ).rejects.toMatchObject({ code: "idempotency-conflict" });
  });

  it("keeps educational acceptance when later clearances are recorded", async () => {
    const run = await seedRun();
    await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      { concern: "educational-acceptance", outcome: "accept", notes: "good" },
      options(),
    );

    const clearance = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      {
        concern: "source-use-clearance",
        outcome: "accept",
        notes: "rights confirmed",
      },
      options(),
    );

    expect(clearance.run.status).toBe("accepted");
    expect(
      (await listReviewQueue(authenticatedRequest(), options())).map(
        (entry) => entry.runId,
      ),
    ).toContain(run.runId);
  });

  it("deduplicates a concurrent identical submission across store instances", async () => {
    const run = await seedRun();
    const secondStore = new JsonlQuestionRunStore(rootDir);
    const secondOptions: ReviewServiceOptions = {
      ...options(),
      store: secondStore,
    };
    const input = {
      concern: "educational-acceptance" as const,
      outcome: "accept" as const,
      notes: "concurrent retry",
      decisionId: "concurrent-key",
    };

    const results = await Promise.all([
      submitReviewDecision(authenticatedRequest(), run.runId, input, options()),
      submitReviewDecision(
        authenticatedRequest(),
        run.runId,
        input,
        secondOptions,
      ),
    ]);

    expect(results.filter((result) => result.deduplicated)).toHaveLength(1);
    expect((await store.resume(run.runId)).humanReviews).toHaveLength(1);
  });
});

describe("training readiness", () => {
  it("is not implied by educational acceptance alone", async () => {
    const run = await seedRun();
    const result = await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      { concern: "educational-acceptance", outcome: "accept", notes: "" },
      options(),
    );

    expect(result.run.status).toBe("accepted");
    expect(result.readiness.ready).toBe(false);
    expect(result.readiness.blockers).toEqual(
      expect.arrayContaining([
        "no source-use-clearance decision recorded",
        "no training-metadata decision recorded",
        "no grouped-split decision recorded",
      ]),
    );
  });

  it("becomes ready only once all four concerns are accepted", async () => {
    const run = await seedRun();
    const concerns = [
      "educational-acceptance",
      "source-use-clearance",
      "training-metadata",
      "grouped-split",
    ] as const;

    for (const concern of concerns) {
      const result = await submitReviewDecision(
        authenticatedRequest(),
        run.runId,
        { concern, outcome: "accept", notes: `${concern} checked` },
        options(),
      );
      if (concern !== "grouped-split") {
        expect(result.readiness.ready).toBe(false);
      } else {
        expect(result.readiness.ready).toBe(true);
        expect(result.readiness.blockers).toEqual([]);
      }
    }
  });

  it("keeps the package's pre-review blockers as context, not as permanent blockers", async () => {
    const run = await seedRun();
    const readiness = (
      await readReviewRun(authenticatedRequest(), run.runId, options())
    ).readiness;

    expect(readiness.ready).toBe(false);
    // These describe what review is meant to resolve.
    expect(readiness.declaredPackageBlockers).toEqual([
      "not human reviewed",
      "source-use rights not cleared",
      "training metadata and grouped split not assigned",
    ]);
    expect(readiness.blockers).not.toEqual(
      expect.arrayContaining(["not human reviewed"]),
    );
  });
});

describe("review view", () => {
  it("assembles the full payload a reviewer needs", async () => {
    const run = await seedRun();
    const view = await readReviewRun(
      authenticatedRequest(),
      run.runId,
      options(),
    );

    expect(view.runId).toBe(run.runId);
    expect(view.status).toBe("awaiting-human-review");
    expect(view.packageResolved).toBe(true);
    expect(view.request.mode).toBe("source-replay");
    expect(view.blueprint?.topic).toBe("electric circuits");
    expect(view.question?.stem).toBeTruthy();
    expect(view.solution?.parts.length).toBeGreaterThan(0);
    expect(view.solution?.parts[0].markingPoints.length).toBeGreaterThan(0);
    expect(view.visualArtifacts).toHaveLength(1);
    expect(view.visualArtifacts[0].mediaType).toBe("image/svg+xml");
    expect(view.verifiedResults?.sourceBacked).toBe(true);
    expect(view.checks.length).toBeGreaterThan(0);
    expect(view.novelty?.status).toBe("not-run");
    expect(view.agentReview?.status).toBe("not-run");
    expect(view.provenance).toMatchObject({
      packageId: CIRCUIT_REPLAY_PACKAGE_ID,
      trainingEligibility: "blocked",
    });
    expect(view.provenance.sourceQuestionId).toBeTruthy();
    expect(view.provenance.markschemeSourceId).toBeTruthy();
    expect(view.readiness.ready).toBe(false);
  });

  it("shows multiple-choice options with the correct answer identifiable only in the solution", async () => {
    const item = findReviewablePackage(CIRCUIT_REPLAY_PACKAGE_ID);
    const run = await seedRun();
    const view = buildReviewView(run);

    if (item?.question.kind === "multiple-choice") {
      expect(view.question?.options).toHaveLength(4);
      expect(view.solution?.correctOptionId).toBe(
        item.solution.correctOptionId,
      );
    }
  });

  it("reports a missing package instead of throwing", () => {
    const orphan = {
      ...({} as QuestionRun),
      runId: "orphan",
      humanReviews: [],
    };
    const view = buildReviewView({
      ...orphan,
      schemaVersion: "question-run/0.1.0",
      revision: 0,
      status: "awaiting-human-review",
      request: {
        ...orphan.request,
        schemaVersion: "question-run-request/0.1.0",
      },
      attempts: {},
      checks: [],
      reviews: [],
      humanReviews: [],
      history: [],
      questionPackage: {
        kind: "circuit-question-package",
        schemaVersion: "question-package-artifact/0.1.0",
        packageId: "unknown-package",
        packageSchemaVersion: "circuit-question-package/0.1.0",
        sourceQuestionId: "q1",
        paper: "1A",
        structure: "multiple-choice",
        marks: 1,
        visualFamilies: [],
        contentFingerprint: "x",
        trainingEligibility: "blocked",
        trainingBlockers: [],
      },
      createdAt: NOW,
      updatedAt: NOW,
    } as QuestionRun);

    expect(view.packageResolved).toBe(false);
    expect(view.question).toBeUndefined();
    expect(view.provenance.packageId).toBe("unknown-package");
  });

  it("lists the review queue for an authenticated reviewer", async () => {
    const run = await seedRun();
    const queue = await listReviewQueue(authenticatedRequest(), options());
    expect(queue.map((entry) => entry.runId)).toEqual([run.runId]);
  });

  it("keeps an accepted run in the queue until all readiness dimensions pass", async () => {
    const run = await seedRun();
    await submitReviewDecision(
      authenticatedRequest(),
      run.runId,
      { concern: "educational-acceptance", outcome: "accept", notes: "" },
      options(),
    );
    expect(
      (await listReviewQueue(authenticatedRequest(), options())).map(
        (entry) => entry.runId,
      ),
    ).toContain(run.runId);
  });

  it("removes a run from the queue only after all four dimensions pass", async () => {
    const run = await seedRun();
    for (const concern of [
      "educational-acceptance",
      "source-use-clearance",
      "training-metadata",
      "grouped-split",
    ] as const) {
      await submitReviewDecision(
        authenticatedRequest(),
        run.runId,
        { concern, outcome: "accept", notes: `${concern} complete` },
        options(),
      );
    }

    expect(await listReviewQueue(authenticatedRequest(), options())).toEqual(
      [],
    );
  });

  it("keeps sent-back runs actionable but leaves rejected runs out of the queue", async () => {
    const sentBack = await seedRun();
    await submitReviewDecision(
      authenticatedRequest(),
      sentBack.runId,
      {
        concern: "educational-acceptance",
        outcome: "send-back-for-repair",
        notes: "repair wording",
      },
      options(),
    );

    const rejected = await seedRun();
    await submitReviewDecision(
      authenticatedRequest(),
      rejected.runId,
      {
        concern: "educational-acceptance",
        outcome: "reject",
        notes: "incorrect result",
      },
      options(),
    );

    const queued = (
      await listReviewQueue(authenticatedRequest(), options())
    ).map((entry) => entry.runId);
    expect(queued).toContain(sentBack.runId);
    expect(queued).not.toContain(rejected.runId);
  });
});

describe("observed review context", () => {
  async function observed(runId: string): Promise<string> {
    const view = await readReviewRun(authenticatedRequest(), runId, options());
    if (!view.observedReviewContext) throw new Error("expected review context");
    return view.observedReviewContext;
  }

  it("rejects a tampered observed context", async () => {
    const run = await seedRun();
    const context = await observed(run.runId);
    await expect(
      submitReviewDecisionRaw(
        authenticatedRequest(),
        run.runId,
        {
          concern: "educational-acceptance",
          outcome: "accept",
          notes: "",
          reviewContext: `${context.slice(0, -1)}x`,
        },
        options(),
      ),
    ).rejects.toMatchObject({ code: "csrf-rejected" });
  });

  it("rejects a non-duplicate decision from a stale observed revision", async () => {
    const run = await seedRun();
    const context = await observed(run.runId);
    await store.syncRun({
      ...run,
      reviews: [
        {
          reviewerKind: "agent",
          reviewerId: "concurrent-agent",
          decision: "flag",
          notes: "concurrent append",
          createdAt: NOW,
        },
      ],
    });
    await expect(
      submitReviewDecisionRaw(
        authenticatedRequest(),
        run.runId,
        {
          concern: "educational-acceptance",
          outcome: "accept",
          notes: "",
          reviewContext: context,
        },
        options(),
      ),
    ).rejects.toMatchObject({ code: "stale-review-context" });
  });

  it("deduplicates an exact retry with its original observed context", async () => {
    const run = await seedRun();
    const context = await observed(run.runId);
    const input = {
      concern: "educational-acceptance" as const,
      outcome: "accept" as const,
      notes: "same submission",
      reviewContext: context,
    };
    await expect(
      submitReviewDecisionRaw(
        authenticatedRequest(),
        run.runId,
        input,
        options(),
      ),
    ).resolves.toMatchObject({ deduplicated: false });
    await expect(
      submitReviewDecisionRaw(
        authenticatedRequest(),
        run.runId,
        input,
        options(),
      ),
    ).resolves.toMatchObject({ deduplicated: true });
  });
});
