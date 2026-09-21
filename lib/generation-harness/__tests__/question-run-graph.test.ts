import {
  CIRCUIT_REPLAY_PACKAGE_ID,
  circuitReplayRequest,
  createCircuitReplayAdapters,
  createFieldReplayAdapters,
  FIELD_REPLAY_PACKAGE_ID,
  fieldReplayRequest,
  QuestionRunStageError,
  runQuestionGraph,
} from "..";
import type { QuestionPackageArtifact } from "..";

function sequentialClock(): () => string {
  let tick = 0;
  return () => `2026-09-20T12:00:${String(tick++).padStart(2, "0")}.000Z`;
}

describe("QuestionRun v0.1 graph", () => {
  it("replays a circuit package through deterministic gates and stops for a human", async () => {
    const run = await runQuestionGraph(
      circuitReplayRequest(),
      createCircuitReplayAdapters(),
      { runId: "circuit-replay-run", now: sequentialClock() },
    );

    expect(run.status).toBe("awaiting-human-review");
    expect(run.currentStage).toBe("human-review");
    expect(run.questionPackage?.packageId).toBe(CIRCUIT_REPLAY_PACKAGE_ID);
    expect(run.verifiedArtifacts?.renderedVisuals).toHaveLength(1);
    expect(run.verifiedArtifacts?.renderedVisuals[0]).toMatchObject({
      family: "circuit_network",
      mediaType: "image/svg+xml",
    });
    expect(run.novelty?.status).toBe("not-run");
    expect(run.reviewEnvelope).toMatchObject({
      decisionAuthority: "human",
      trainingEligibility: "blocked",
      agentReview: { status: "not-run" },
    });
    expect(run.reviews).toEqual([]);
    expect(run.rejection).toBeUndefined();
    expect(run.checks.map((check) => check.stage)).toEqual([
      "plan",
      "validate-blueprint",
      "solve-and-render",
      "author",
      "validate-package",
      "novelty-check",
      "prepare-review",
    ]);
    expect(
      run.checks.find((check) => check.stage === "novelty-check"),
    ).toMatchObject({ outcome: "not-run", code: "novelty-not-run" });
  });

  it("replays a field package and records a rendered field-map artifact", async () => {
    const run = await runQuestionGraph(
      fieldReplayRequest(),
      createFieldReplayAdapters(),
      { runId: "field-replay-run", now: sequentialClock() },
    );

    expect(run.status).toBe("awaiting-human-review");
    expect(run.questionPackage?.packageId).toBe(FIELD_REPLAY_PACKAGE_ID);
    expect(run.verifiedArtifacts?.solverId).toContain("field-solver/");
    expect(run.verifiedArtifacts?.renderedVisuals).toHaveLength(1);
    expect(run.verifiedArtifacts?.renderedVisuals[0]).toMatchObject({
      family: "field_map",
      mediaType: "image/svg+xml",
    });
    expect(run.questionPackage?.trainingEligibility).toBe("blocked");
    expect(run.status).not.toBe("accepted");
  });

  it("uses a bounded retry budget and rejects after retryable failures", async () => {
    const adapters = createCircuitReplayAdapters();
    let planCalls = 0;
    adapters.plan = async () => {
      planCalls += 1;
      throw new QuestionRunStageError(
        "invalid-structured-output",
        "planner returned malformed JSON",
        true,
      );
    };

    const run = await runQuestionGraph(circuitReplayRequest(), adapters, {
      runId: "bounded-retry-run",
      now: sequentialClock(),
      retryLimits: { plan: 2 },
    });

    expect(planCalls).toBe(2);
    expect(run.status).toBe("rejected");
    expect(run.attempts.plan).toBe(2);
    expect(run.rejection).toMatchObject({
      stage: "plan",
      code: "retry-budget-exhausted",
      causeCode: "invalid-structured-output",
      attempts: 2,
    });
    expect(run.attempts["validate-blueprint"]).toBeUndefined();
  });

  it("rejects an authored package that drops a planned visual family", async () => {
    const adapters = createCircuitReplayAdapters();
    const replayAuthor = adapters.author;
    adapters.author = async (blueprint, artifacts) => ({
      ...(await replayAuthor(blueprint, artifacts)),
      visualFamilies: [],
    });

    const run = await runQuestionGraph(circuitReplayRequest(), adapters, {
      runId: "visual-family-mismatch-run",
      now: sequentialClock(),
    });

    expect(run.status).toBe("rejected");
    expect(run.rejection).toMatchObject({
      stage: "validate-package",
      code: "package-validation-failed",
      attempts: 1,
    });
    expect(run.rejection?.message).toContain(
      "visual families differ from the blueprint",
    );
    expect(run.attempts["novelty-check"]).toBeUndefined();
  });

  it.each<
    [string, (artifact: QuestionPackageArtifact) => QuestionPackageArtifact]
  >([
    ["kind", (artifact) => ({ ...artifact, kind: "field-question-package" })],
    [
      "schema",
      (artifact) => ({ ...artifact, packageSchemaVersion: "wrong/9.9" }),
    ],
    ["source", (artifact) => ({ ...artifact, sourceQuestionId: "wrong" })],
    ["marks", (artifact) => ({ ...artifact, marks: artifact.marks + 1 })],
    [
      "training blockers",
      (artifact) => ({ ...artifact, trainingBlockers: ["wrong blocker"] }),
    ],
    [
      "content fingerprint",
      (artifact) => ({ ...artifact, contentFingerprint: "fnv1a32:00000000" }),
    ],
  ])("rejects a replay artifact with mutated %s", async (_, mutate) => {
    const adapters = createCircuitReplayAdapters();
    const replayAuthor = adapters.author;
    adapters.author = async (blueprint, artifacts) =>
      mutate(await replayAuthor(blueprint, artifacts));

    const run = await runQuestionGraph(circuitReplayRequest(), adapters, {
      runId: "mutated-artifact-run",
      now: sequentialClock(),
    });

    expect(run.status).toBe("rejected");
    expect(run.rejection).toMatchObject({
      stage: "validate-package",
      code: "package-validation-failed",
    });
  });

  it("rejects a generate request sent to a source-replay adapter", async () => {
    const request = { ...fieldReplayRequest(), mode: "generate" as const };
    const run = await runQuestionGraph(request, createFieldReplayAdapters(), {
      runId: "wrong-replay-mode-run",
      now: sequentialClock(),
    });

    expect(run.status).toBe("rejected");
    expect(run.rejection).toMatchObject({
      stage: "validate-blueprint",
      code: "invalid-blueprint",
    });
  });

  it("does not claim to await review when review preparation fails", async () => {
    const adapters = createFieldReplayAdapters();
    adapters.prepareReview = async () => {
      throw new QuestionRunStageError(
        "internal-stage-error",
        "review artifact storage is unavailable",
      );
    };

    const run = await runQuestionGraph(fieldReplayRequest(), adapters, {
      runId: "review-preparation-failure-run",
      now: sequentialClock(),
    });

    expect(run.status).toBe("rejected");
    expect(run.rejection?.stage).toBe("prepare-review");
    expect(run.reviewEnvelope).toBeUndefined();
    expect(
      run.history.some((entry) => entry.type === "awaiting-human-review"),
    ).toBe(false);
  });

  it("round-trips the canonical run as plain JSON", async () => {
    const run = await runQuestionGraph(
      circuitReplayRequest(),
      createCircuitReplayAdapters(),
      { runId: "json-safe-run", now: sequentialClock() },
    );

    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });
});
