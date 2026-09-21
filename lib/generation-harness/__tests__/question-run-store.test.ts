import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MemorySaver } from "@langchain/langgraph";

import {
  circuitReplayRequest,
  createCircuitReplayAdapters,
  createQuestionRunId,
  createQuestionRun,
  JsonlQuestionRunStore,
  QUESTION_RUN_SNAPSHOT_SCHEMA_VERSION,
  QuestionRun,
  QuestionRunStoreError,
  REJECTION_RECORD_SCHEMA_VERSION,
  resumeQuestionGraph,
  runQuestionGraph,
  withoutRevisionFields,
} from "..";
import { createHumanReviewEvent } from "../human-review";
import { CIRCUIT_REPLAY_PACKAGE_ID } from "../replay-fixtures";
import type { QuestionRunRejection } from "..";

let rootDir: string;

async function tempRoot(): Promise<string> {
  return fs.mkdtemp(join(tmpdir(), "question-run-store-"));
}

function rejection(): QuestionRunRejection {
  return {
    schemaVersion: REJECTION_RECORD_SCHEMA_VERSION,
    stage: "novelty-check",
    code: "near-duplicate",
    message: "Too close to an existing package",
    attempts: 1,
    createdAt: "2026-09-21T00:00:00.000Z",
  };
}

function sequentialClock(start = 0): () => string {
  let tick = start;
  return () => `2026-09-21T00:00:${String(tick++).padStart(2, "0")}.000Z`;
}

async function eventLogPath(runId: string): Promise<string> {
  return join(rootDir, "runs", runId, "events.jsonl");
}

async function snapshotPath(runId: string): Promise<string> {
  return join(rootDir, "runs", runId, "snapshot.json");
}

beforeEach(async () => {
  rootDir = await tempRoot();
});

afterEach(async () => {
  await fs.rm(rootDir, { recursive: true, force: true });
});

describe("JsonlQuestionRunStore", () => {
  it("creates a run with a robust identifier and reads it back", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest(), {
      createdAt: "2026-09-21T00:00:00.000Z",
    });

    expect(run.runId).toMatch(
      /^question-run-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(run.revision).toBe(1);
    expect(run.status).toBe("requested");
    expect(run.request.schemaVersion).toBe("question-run-request/0.1.0");

    const fetched = await store.fetch(run.runId);
    expect(fetched).toEqual(run);

    // The identifier no longer encodes creation order or wall-clock time.
    const second = await store.create(circuitReplayRequest());
    expect(second.runId).not.toBe(run.runId);
    expect(await store.list()).toHaveLength(2);
  });

  it("rejects a duplicate run id instead of overwriting the record", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());
    await expect(
      store.create(circuitReplayRequest(), { runId: run.runId }),
    ).rejects.toMatchObject({ code: "run-already-exists" });
  });

  it("returns undefined for an unknown run and throws on inspect", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    expect(await store.fetch("does-not-exist")).toBeUndefined();
    await expect(store.inspect("does-not-exist")).rejects.toMatchObject({
      code: "run-not-found",
    });
  });

  it("filters runs and finds the review queue", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const adapters = createCircuitReplayAdapters();

    const awaitingReview = await runQuestionGraph(
      circuitReplayRequest(),
      adapters,
      { store, now: sequentialClock() },
    );
    const requested = await store.create({
      mode: "generate",
      paper: "2",
      level: "HL",
      topics: ["electric circuits"],
      assessedSkills: ["derive a result"],
      difficulty: "standard",
      visualPolicy: "model-decides",
    });

    const queue = await store.listReviewQueue();
    expect(queue.map((run) => run.runId)).toEqual([awaitingReview.runId]);

    expect(
      (await store.list({ mode: "generate" })).map((run) => run.runId),
    ).toEqual([requested.runId]);
    expect(await store.list({ paper: "1A" })).toHaveLength(1);
    expect(await store.list({ topic: "electric circuits" })).toHaveLength(2);
    expect(await store.list({ status: "awaiting-human-review" })).toHaveLength(
      1,
    );
  });

  it("records a rejection through the store", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());

    const rejected = await store.recordRejection(run.runId, rejection());
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejection).toEqual(rejection());
    expect(rejected.revision).toBe(run.revision + 1);

    const stored = await store.resume(run.runId);
    expect(stored.rejection).toEqual(rejection());
  });

  it("rejects an artifact with an unsupported schema version before it is durable", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());

    await expect(
      store.appendEvent(run.runId, {
        type: "artifact-recorded",
        payload: {
          artifactKind: "novelty-assessment",
          artifact: {
            schemaVersion: "novelty-assessment/9.9.9",
            status: "passed",
            reason: "from the future",
            nearestCandidateIds: [],
          },
        },
      }),
    ).rejects.toMatchObject({ code: "unsupported-schema-version" });

    // Nothing was appended.
    expect((await store.resume(run.runId)).revision).toBe(run.revision);
  });

  it("rejects an artifact that violates its contract", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());

    await expect(
      store.appendEvent(run.runId, {
        type: "artifact-recorded",
        payload: {
          artifactKind: "novelty-assessment",
          artifact: {
            schemaVersion: "novelty-assessment/0.1.0",
            status: "definitely-fine",
            reason: "trust me",
            nearestCandidateIds: [],
          },
        },
      }),
    ).rejects.toMatchObject({ code: "invalid-artifact" });
  });

  it("detects a stale revision instead of losing the other writer's update", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());

    const first = await store.appendEvent(
      run.runId,
      {
        type: "run-status-changed",
        payload: { status: "running", currentStage: "plan" },
      },
      { expectedRevision: run.revision },
    );
    expect(first.revision).toBe(run.revision + 1);

    // A second writer still holding the original revision must not be able to
    // build on it.
    await expect(
      store.appendEvent(
        run.runId,
        {
          type: "run-status-changed",
          payload: { status: "requested" },
        },
        { expectedRevision: run.revision },
      ),
    ).rejects.toMatchObject({
      code: "stale-revision",
      context: {
        expectedRevision: run.revision,
        actualRevision: first.revision,
      },
    });

    const stored = await store.resume(run.runId);
    expect(stored.status).toBe("running");
    expect(stored.revision).toBe(first.revision);
  });

  it("ignores a duplicate event id so a retry is idempotent", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());
    const eventId = `${run.runId}:retry`;

    const options = { expectedRevision: run.revision, eventId };
    const first = await store.appendEvent(
      run.runId,
      { type: "run-status-changed", payload: { status: "running" } },
      options,
    );
    const second = await store.appendEvent(
      run.runId,
      { type: "run-status-changed", payload: { status: "running" } },
      { eventId, expectedRevision: run.revision },
    );

    expect(second.revision).toBe(first.revision);
    expect((await store.resume(run.runId)).revision).toBe(first.revision);
  });

  it("rejects reuse of an event id for different content", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());
    const eventId = `${run.runId}:retry`;
    await store.appendEvent(
      run.runId,
      { type: "run-status-changed", payload: { status: "running" } },
      { eventId },
    );

    await expect(
      store.appendEvent(
        run.runId,
        { type: "run-status-changed", payload: { status: "rejected" } },
        { eventId },
      ),
    ).rejects.toMatchObject({ code: "invalid-event" });
  });

  it("rejects direct acceptance status events without changing durable state", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());
    const before = await fs.readFile(await eventLogPath(run.runId), "utf8");

    await expect(
      store.appendEvent(run.runId, {
        type: "run-status-changed",
        payload: { status: "accepted" },
      }),
    ).rejects.toMatchObject({ code: "invalid-event" });
    expect(await fs.readFile(await eventLogPath(run.runId), "utf8")).toBe(
      before,
    );
    expect((await store.resume(run.runId)).status).toBe("requested");
  });

  it("persists legacy review records through sync and survives restart", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());
    const withReview = await store.syncRun({
      ...run,
      reviews: [
        {
          reviewerKind: "agent",
          reviewerId: "agent-1",
          decision: "flag",
          notes: "needs human review",
          createdAt: "2026-09-21T00:00:00.000Z",
        },
      ],
    });
    expect(withReview.reviews).toHaveLength(1);
    expect(await store.syncRun(withReview)).toEqual(withReview);
    expect(
      (await new JsonlQuestionRunStore(rootDir).resume(run.runId)).reviews,
    ).toEqual(withReview.reviews);
  });

  it("recovers from an interrupted append and keeps the torn bytes", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());
    const before = await store.resume(run.runId);

    // Simulate a crash part-way through writing a record.
    const path = await eventLogPath(run.runId);
    const complete = await fs.readFile(path, "utf8");
    await fs.writeFile(
      path,
      `${complete}{"eventId":"torn","runId":"${run.runId}","revision":2,`,
      "utf8",
    );

    const inspection = await store.inspect(run.runId);
    expect(inspection.issues).toEqual([
      expect.objectContaining({ code: "torn-trailing-line" }),
    ]);
    // The incomplete record never counted, so the run is exactly as it was.
    expect(inspection.run.status).toBe(before.status);
    expect(inspection.run.revision).toBe(before.revision);
    expect(inspection.run.history).toEqual(before.history);

    // The bytes are kept for diagnosis rather than discarded.
    expect(
      await fs.readFile(inspection.issues[0].quarantinedPath as string, "utf8"),
    ).toContain('"eventId":"torn"');

    // The log is still appendable, and the rewrite removed the torn tail.
    const appended = await store.appendEvent(run.runId, {
      type: "run-status-changed",
      payload: { status: "running" },
    });
    expect(appended.revision).toBe(before.revision + 1);
    expect((await store.inspect(run.runId)).issues).toEqual([]);
  });

  it("surfaces a torn tail on the recovery path even when a snapshot exists", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());

    const path = await eventLogPath(run.runId);
    await fs.appendFile(path, '{"eventId":"half', "utf8");

    const inspection = await store.inspect(run.runId);
    expect(inspection.issues[0].code).toBe("torn-trailing-line");
    expect(inspection.run.revision).toBe(run.revision);
  });

  it("quarantines an unreadable snapshot and rebuilds it from the log", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());

    await fs.writeFile(await snapshotPath(run.runId), "{not json", "utf8");

    // fetch falls back to a log replay rather than reporting the run missing.
    const fetched = await store.fetch(run.runId);
    expect(fetched?.runId).toBe(run.runId);

    const quarantine = join(rootDir, "runs", run.runId, "corrupt");
    expect((await fs.readdir(quarantine)).length).toBeGreaterThan(0);

    // A repaired snapshot was written back.
    const repaired = JSON.parse(
      await fs.readFile(await snapshotPath(run.runId), "utf8"),
    );
    expect(repaired.schemaVersion).toBe(QUESTION_RUN_SNAPSHOT_SCHEMA_VERSION);
    expect(repaired.run.runId).toBe(run.runId);
  });

  it("fails closed when a valid run loses its canonical event log", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());
    const snapshot = await fs.readFile(await snapshotPath(run.runId), "utf8");
    await fs.rm(await eventLogPath(run.runId));

    await expect(store.resume(run.runId)).rejects.toMatchObject({
      code: "corrupt-log",
    });
    // The snapshot is evidence, not a replacement source of truth. Recovery
    // must not overwrite it with an invented empty run.
    expect(await fs.readFile(await snapshotPath(run.runId), "utf8")).toBe(
      snapshot,
    );
  });

  it("fails closed when a canonical event log is empty", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());
    const snapshot = await fs.readFile(await snapshotPath(run.runId), "utf8");
    await fs.writeFile(await eventLogPath(run.runId), "", "utf8");

    await expect(store.resume(run.runId)).rejects.toMatchObject({
      code: "corrupt-log",
    });
    expect(await fs.readFile(await snapshotPath(run.runId), "utf8")).toBe(
      snapshot,
    );
  });

  it("rejects a physically reordered immutable event log", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await runQuestionGraph(
      circuitReplayRequest(),
      createCircuitReplayAdapters(),
      { store, now: sequentialClock() },
    );
    const path = await eventLogPath(run.runId);
    const lines = (await fs.readFile(path, "utf8")).trim().split("\n");
    expect(lines.length).toBeGreaterThan(1);
    [lines[0], lines[1]] = [lines[1], lines[0]];
    await fs.writeFile(path, `${lines.join("\n")}\n`, "utf8");

    await expect(store.resume(run.runId)).rejects.toMatchObject({
      code: "corrupt-log",
    });
  });

  it("rebuilds a syntactically valid but tampered snapshot from the event log", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());
    const path = await snapshotPath(run.runId);
    const snapshot = JSON.parse(await fs.readFile(path, "utf8")) as {
      run: QuestionRun;
    };
    snapshot.run = { ...snapshot.run, status: "accepted" };
    await fs.writeFile(path, JSON.stringify(snapshot), "utf8");

    const recovered = await store.fetch(run.runId);
    expect(recovered?.status).toBe("requested");
    expect(
      (JSON.parse(await fs.readFile(path, "utf8")) as { run: QuestionRun }).run
        .status,
    ).toBe("requested");
  });

  it("rejects a human review event for another run", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());
    const review = createHumanReviewEvent({
      decisionId: "review-for-other-run",
      runId: "other-run",
      concern: "educational-acceptance",
      outcome: "accept",
      reviewerId: "pilot-admin",
      notes: "",
      reviewedRevision: 1,
      reviewedContentFingerprint: "fingerprint",
      createdAt: "2026-09-21T00:00:00.000Z",
    });

    await expect(
      store.appendEvent(run.runId, {
        type: "human-review-recorded",
        payload: { review },
      }),
    ).rejects.toMatchObject({ code: "invalid-event" });
  });

  it("rejects fabricated human review events on the public append API", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await runQuestionGraph(
      circuitReplayRequest(),
      createCircuitReplayAdapters(),
      { store, now: sequentialClock() },
    );
    const review = createHumanReviewEvent({
      decisionId: "unique-review",
      runId: run.runId,
      concern: "educational-acceptance",
      outcome: "accept",
      reviewerId: "pilot-admin",
      notes: "",
      reviewedRevision: run.revision,
      reviewedContentFingerprint: run.questionPackage!.contentFingerprint,
      createdAt: "2026-09-21T00:00:00.000Z",
    });
    await expect(
      store.appendEvent(run.runId, {
        type: "human-review-recorded",
        payload: { review },
      }),
    ).rejects.toMatchObject({
      code: "invalid-event",
      message: expect.stringContaining("authorized review append"),
    });
  });

  it("rejects fabricated human review evidence through syncRun", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await runQuestionGraph(
      circuitReplayRequest(),
      createCircuitReplayAdapters(),
      { store, now: sequentialClock() },
    );
    const review = createHumanReviewEvent({
      decisionId: "fabricated-sync-review",
      runId: run.runId,
      concern: "educational-acceptance",
      outcome: "accept",
      reviewerId: "pilot-admin",
      notes: "",
      reviewedRevision: run.revision,
      reviewedContentFingerprint: run.questionPackage!.contentFingerprint,
      createdAt: "2026-09-21T00:00:00.000Z",
    });

    await expect(
      store.syncRun({
        ...run,
        status: "accepted",
        humanReviews: [review],
      }),
    ).rejects.toMatchObject({
      code: "invalid-event",
      message: expect.stringContaining("cannot create human review evidence"),
    });
    expect((await store.resume(run.runId)).humanReviews).toEqual([]);
  });

  it("rejects the superseded human-review event schema instead of reinterpreting it", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await runQuestionGraph(
      circuitReplayRequest(),
      createCircuitReplayAdapters(),
      { store, now: sequentialClock() },
    );
    const current = createHumanReviewEvent({
      decisionId: "old-schema-review",
      runId: run.runId,
      concern: "educational-acceptance",
      outcome: "accept",
      reviewerId: "pilot-admin",
      notes: "",
      reviewedRevision: run.revision,
      reviewedContentFingerprint: run.questionPackage!.contentFingerprint,
      createdAt: "2026-09-21T00:00:00.000Z",
    });
    const legacy = { ...current, schemaVersion: "human-review-event/0.1.0" };

    await expect(
      store.appendEvent(run.runId, {
        type: "human-review-recorded",
        payload: { review: legacy as never },
      }),
    ).rejects.toMatchObject({ code: "invalid-event" });
  });

  it("rejects path-traversal run ids before they reach the filesystem", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    await expect(store.fetch("../outside")).rejects.toMatchObject({
      code: "invalid-event",
    });
  });

  it("refuses to read a snapshot format it does not recognise", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());

    await fs.writeFile(
      await snapshotPath(run.runId),
      JSON.stringify({ schemaVersion: "question-run-snapshot/9.9.9", run }),
      "utf8",
    );

    await expect(store.fetch(run.runId)).rejects.toMatchObject({
      code: "unsupported-schema-version",
    });
  });

  it("leaves an append-only log alone when a middle record is unreadable", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await store.create(circuitReplayRequest());
    const path = await eventLogPath(run.runId);

    await fs.appendFile(
      path,
      `${JSON.stringify({
        eventId: `${run.runId}:2:run-status-changed`,
        runId: run.runId,
        revision: 2,
        createdAt: "2026-09-21T00:00:05.000Z",
        type: "run-status-changed",
        payload: { status: "running" },
      })}\n{ this line is not json }\n`,
      "utf8",
    );

    await expect(store.resume(run.runId)).rejects.toMatchObject({
      code: "corrupt-log",
    });

    // The bytes were kept and the original log was not rewritten, because a
    // mid-log gap may mean real data loss that a human needs to see.
    const quarantine = join(rootDir, "runs", run.runId, "corrupt");
    expect((await fs.readdir(quarantine)).length).toBeGreaterThan(0);
  });

  it("recovers the same record after a process restart", async () => {
    const first = new JsonlQuestionRunStore(rootDir);
    const adapters = createCircuitReplayAdapters();
    const run = await runQuestionGraph(circuitReplayRequest(), adapters, {
      store: first,
      now: sequentialClock(),
    });
    const inspected = await first.inspect(run.runId);

    // A brand-new store instance over the same directory stands in for a
    // restarted process.
    const restarted = new JsonlQuestionRunStore(rootDir);
    const resumed = await restarted.resume(run.runId);

    expect(resumed).toEqual(run);
    expect(resumed.status).toBe("awaiting-human-review");
    expect(resumed.revision).toBe(inspected.run.revision);
    expect(resumed.history).toEqual(inspected.run.history);
    expect(await restarted.listReviewQueue()).toHaveLength(1);
  });

  it("persists every stage of a run and makes re-syncing a no-op", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await runQuestionGraph(
      circuitReplayRequest(),
      createCircuitReplayAdapters(),
      { store, now: sequentialClock() },
    );

    expect(run.status).toBe("awaiting-human-review");
    expect(run.revision).toBeGreaterThan(1);
    expect(await store.fetch(run.runId)).toEqual(run);

    // The log holds one event per persisted change, not one per stage.
    const lines = (await fs.readFile(await eventLogPath(run.runId), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines[0].type).toBe("run-created");
    expect(lines.map((event) => event.revision)).toEqual(
      lines.map((_, index) => index + 1),
    );

    const resynced = await store.syncRun(run);
    expect(resynced.revision).toBe(run.revision);
    const after = await fs.readFile(await eventLogPath(run.runId), "utf8");
    expect(after.trim().split("\n")).toHaveLength(lines.length);
  });

  it("resumes an existing canonical run at its first incomplete stage", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const adapters = createCircuitReplayAdapters();
    const blueprint = await adapters.plan(circuitReplayRequest());
    const initial = await store.create(circuitReplayRequest(), {
      runId: "resume-with-blueprint",
      createdAt: "2026-09-21T00:00:00.000Z",
    });
    await store.syncRun({ ...initial, blueprint });
    let planCalls = 0;
    const originalPlan = adapters.plan;
    adapters.plan = async (request) => {
      planCalls += 1;
      return originalPlan(request);
    };

    const resumed = await runQuestionGraph(circuitReplayRequest(), adapters, {
      store,
      runId: initial.runId,
      now: sequentialClock(10),
    });

    expect(planCalls).toBe(0);
    expect(resumed.status).toBe("awaiting-human-review");
    expect(resumed.questionPackage?.packageId).toBe(CIRCUIT_REPLAY_PACKAGE_ID);
  });

  it("refuses to persist a run that rewrites its own history", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await runQuestionGraph(
      circuitReplayRequest(),
      createCircuitReplayAdapters(),
      { store, now: sequentialClock() },
    );

    const tampered: QuestionRun = {
      ...run,
      history: run.history.slice(0, 1),
    };
    await expect(store.syncRun(tampered)).rejects.toMatchObject({
      code: "invalid-event",
    });
  });

  it("does not mutate either durable representation for a mixed valid and invalid sync diff", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await runQuestionGraph(
      circuitReplayRequest(),
      createCircuitReplayAdapters(),
      { store, now: sequentialClock() },
    );
    const logPath = await eventLogPath(run.runId);
    const indexPath = await snapshotPath(run.runId);
    const logBefore = await fs.readFile(logPath, "utf8");
    const snapshotBefore = await fs.readFile(indexPath, "utf8");

    await expect(
      store.syncRun({
        ...run,
        reviews: [
          ...run.reviews,
          {
            reviewerKind: "agent",
            reviewerId: "preflight-agent",
            decision: "flag",
            notes: "This otherwise-valid append must not partially persist.",
            createdAt: "2026-09-21T00:01:00.000Z",
          },
        ],
        novelty: {
          ...run.novelty!,
          schemaVersion: "novelty-assessment/99.0.0",
        } as unknown as QuestionRun["novelty"],
      }),
    ).rejects.toMatchObject({ code: "unsupported-schema-version" });

    expect(await fs.readFile(logPath, "utf8")).toBe(logBefore);
    expect(await fs.readFile(indexPath, "utf8")).toBe(snapshotBefore);
  });

  it("creates the record when syncing a run the store has never seen", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const standalone = createQuestionRun(
      createQuestionRunId(),
      circuitReplayRequest(),
      "2026-09-21T00:00:00.000Z",
    );

    const stored = await store.syncRun(standalone);
    expect(stored.runId).toBe(standalone.runId);
    // Replaying the freshly written log must reproduce the supplied record.
    expect(withoutRevisionFields(stored)).toEqual(
      withoutRevisionFields(standalone),
    );
    expect(await store.fetch(standalone.runId)).toEqual(stored);
  });

  it("finalizes a torn review-envelope prefix after a process restart without rerunning earlier stages", async () => {
    const first = new JsonlQuestionRunStore(rootDir);
    const run = await runQuestionGraph(
      circuitReplayRequest(),
      createCircuitReplayAdapters(),
      { store: first, now: sequentialClock() },
    );
    const logPath = await eventLogPath(run.runId);
    const events = (await fs.readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; payload: unknown });
    const finalStatusIndex = events.findIndex(
      (event) =>
        event.type === "run-status-changed" &&
        (event.payload as { status?: string }).status ===
          "awaiting-human-review",
    );
    expect(finalStatusIndex).toBeGreaterThan(0);
    // Preserve the complete canonical prefix through the review envelope and
    // drop the final status transition as a crash would.
    await fs.writeFile(
      logPath,
      `${events
        .slice(0, finalStatusIndex)
        .map((event) => JSON.stringify(event))
        .join("\n")}\n`,
      "utf8",
    );

    const restarted = new JsonlQuestionRunStore(rootDir);
    const recovered = await restarted.resume(run.runId);
    expect(recovered.status).toBe("running");
    expect(recovered.reviewEnvelope).toBeDefined();

    const adapters = createCircuitReplayAdapters();
    let planCalls = 0;
    const originalPlan = adapters.plan;
    adapters.plan = async (request) => {
      planCalls += 1;
      return originalPlan(request);
    };
    const finalized = await runQuestionGraph(circuitReplayRequest(), adapters, {
      store: restarted,
      runId: run.runId,
      now: sequentialClock(30),
    });

    expect(planCalls).toBe(0);
    expect(finalized.status).toBe("awaiting-human-review");
    expect(finalized.currentStage).toBe("human-review");
  });
});

describe("QuestionRun graph with a store and a checkpointer", () => {
  it("writes a durable record even without a checkpointer", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const run = await runQuestionGraph(
      circuitReplayRequest(),
      createCircuitReplayAdapters(),
      { store, now: sequentialClock() },
    );

    const recovered = await new JsonlQuestionRunStore(rootDir).resume(
      run.runId,
    );
    expect(recovered).toEqual(run);
  });

  it("keeps QuestionRun canonical while a checkpoint tracks execution", async () => {
    const store = new JsonlQuestionRunStore(rootDir);
    const checkpointer = new MemorySaver();
    const threadId = "checkpointed-run";

    const run = await runQuestionGraph(
      circuitReplayRequest(),
      createCircuitReplayAdapters(),
      { store, checkpointer, threadId, now: sequentialClock() },
    );

    expect(run.status).toBe("awaiting-human-review");

    // The checkpoint is execution state only; the stored record is the answer.
    const stored = await store.resume(run.runId);
    expect(stored).toEqual(run);

    // A fresh graph bound to the same thread resumes to the same record without
    // re-running the stages.
    let replanCalls = 0;
    const adapters = createCircuitReplayAdapters();
    const replayPlan = adapters.plan;
    adapters.plan = async (request) => {
      replanCalls += 1;
      return replayPlan(request);
    };

    const resumed = await resumeQuestionGraph(adapters, {
      store,
      checkpointer,
      threadId,
      now: sequentialClock(30),
    });

    expect(replanCalls).toBe(0);
    expect(resumed.status).toBe("awaiting-human-review");
    expect(resumed.questionPackage?.packageId).toBe(
      run.questionPackage?.packageId,
    );
  });

  it("reports a missing checkpoint rather than silently producing a run", async () => {
    await expect(
      resumeQuestionGraph(createCircuitReplayAdapters(), {
        checkpointer: new MemorySaver(),
        threadId: "never-started",
      }),
    ).rejects.toThrow();
  });
});

describe("QuestionRunStoreError", () => {
  it("carries a stable machine-readable code", () => {
    const error = new QuestionRunStoreError("stale-revision", "conflict", {
      runId: "run-1",
    });
    expect(error.code).toBe("stale-revision");
    expect(error.context).toEqual({ runId: "run-1" });
    expect(error).toBeInstanceOf(Error);
  });
});
