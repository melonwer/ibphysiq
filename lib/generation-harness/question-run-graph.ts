import {
  Annotation,
  BaseCheckpointSaver,
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";

import {
  createQuestionRun,
  createQuestionRunId,
  NoveltyAssessment,
  QuestionBlueprint,
  QuestionPackageArtifact,
  QuestionReviewEnvelope,
  QuestionRun,
  QuestionRunCheck,
  QuestionRunHistoryEntry,
  QuestionRunRejectionCode,
  QuestionRunRequest,
  QuestionRunStage,
  REJECTION_RECORD_SCHEMA_VERSION,
  VerifiedQuestionArtifacts,
} from "./question-run";
import type { QuestionRunStore } from "./question-run-store";

export interface QuestionRunAdapters {
  plan(request: QuestionRunRequest): Promise<QuestionBlueprint>;
  validateBlueprint(
    request: QuestionRunRequest,
    blueprint: QuestionBlueprint,
  ): Promise<void>;
  solveAndRender(
    blueprint: QuestionBlueprint,
  ): Promise<VerifiedQuestionArtifacts>;
  author(
    blueprint: QuestionBlueprint,
    artifacts: VerifiedQuestionArtifacts,
  ): Promise<QuestionPackageArtifact>;
  validatePackage(
    questionPackage: QuestionPackageArtifact,
    blueprint: QuestionBlueprint,
    artifacts: VerifiedQuestionArtifacts,
  ): Promise<void>;
  checkNovelty(
    questionPackage: QuestionPackageArtifact,
    blueprint: QuestionBlueprint,
  ): Promise<NoveltyAssessment>;
  prepareReview(
    questionPackage: QuestionPackageArtifact,
    checks: readonly QuestionRunCheck[],
    novelty: NoveltyAssessment,
  ): Promise<QuestionReviewEnvelope>;
}

export class QuestionRunStageError extends Error {
  constructor(
    readonly code: QuestionRunRejectionCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "QuestionRunStageError";
  }
}

export type QuestionRunRetryLimits = Partial<
  Record<Exclude<QuestionRunStage, "human-review">, number>
>;

export interface QuestionRunGraphOptions {
  retryLimits?: QuestionRunRetryLimits;
  now?: () => string;
  /**
   * Optional durable record store. When supplied, every stage that completes is
   * appended to it, so a run survives a process restart. `QuestionRun` stays the
   * canonical record; the checkpointer below only stores execution state.
   */
  store?: QuestionRunStore;
  /**
   * Optional LangGraph checkpointer. This is an orchestration detail used to
   * resume execution; it is never the source of truth for a run.
   */
  checkpointer?: BaseCheckpointSaver;
  /** Checkpoint thread to bind to. Defaults to the run id. */
  threadId?: string;
}

export interface RunQuestionOptions extends QuestionRunGraphOptions {
  runId?: string;
}

interface StageSuccess {
  code: string;
  message: string;
  outcome?: QuestionRunCheck["outcome"];
  kind?: QuestionRunCheck["kind"];
}

const DEFAULT_RETRY_LIMITS: Required<QuestionRunRetryLimits> = {
  plan: 2,
  "validate-blueprint": 1,
  "solve-and-render": 1,
  author: 2,
  "validate-package": 1,
  "novelty-check": 1,
  "prepare-review": 1,
};

const QuestionRunState = Annotation.Root({
  run: Annotation<QuestionRun>(),
});

function requireValue<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new QuestionRunStageError(
      "internal-stage-error",
      `Question run is missing ${name}`,
    );
  }
  return value;
}

function normalizeError(error: unknown): QuestionRunStageError {
  if (error instanceof QuestionRunStageError) return error;
  return new QuestionRunStageError(
    "internal-stage-error",
    error instanceof Error ? error.message : String(error),
  );
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function validateArtifactAgreement(
  questionPackage: QuestionPackageArtifact,
  blueprint: QuestionBlueprint,
  artifacts: VerifiedQuestionArtifacts,
): void {
  const renderedFamilies = sortedUnique(
    artifacts.renderedVisuals.map((artifact) => artifact.family),
  );
  const plannedFamilies = sortedUnique(blueprint.visual.families);
  const packageFamilies = sortedUnique(questionPackage.visualFamilies);
  const issues: string[] = [];
  if (
    questionPackage.paper !== blueprint.paper ||
    questionPackage.structure !== blueprint.structure
  ) {
    issues.push("package paper or structure differs from the blueprint");
  }
  if (JSON.stringify(packageFamilies) !== JSON.stringify(plannedFamilies)) {
    issues.push("package visual families differ from the blueprint");
  }
  if (JSON.stringify(renderedFamilies) !== JSON.stringify(plannedFamilies)) {
    issues.push("rendered visual families differ from the blueprint");
  }
  if (questionPackage.trainingEligibility !== "blocked") {
    issues.push("automated output must remain training-blocked");
  }
  if (!questionPackage.contentFingerprint.trim()) {
    issues.push("package content fingerprint must not be empty");
  }
  if (issues.length > 0) {
    throw new QuestionRunStageError(
      "package-validation-failed",
      issues.join("; "),
    );
  }
}

function appendHistory(
  run: QuestionRun,
  entry: QuestionRunHistoryEntry,
): QuestionRun {
  return {
    ...run,
    history: [...run.history, entry],
    updatedAt: entry.createdAt,
  };
}

async function executeStage<T>(
  initialRun: QuestionRun,
  stage: Exclude<QuestionRunStage, "human-review">,
  maxAttempts: number,
  now: () => string,
  action: (run: QuestionRun, attempt: number) => Promise<T>,
  applyResult: (run: QuestionRun, result: T) => QuestionRun,
  describeSuccess: (result: T) => StageSuccess,
): Promise<QuestionRun> {
  let run = initialRun;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptedAt = now();
    run = appendHistory(
      {
        ...run,
        status: "running",
        currentStage: stage,
        attempts: { ...run.attempts, [stage]: attempt },
      },
      {
        type: "stage-attempted",
        stage,
        message: `Attempt ${attempt} of ${maxAttempts}`,
        createdAt: attemptedAt,
      },
    );
    try {
      const result = await action(run, attempt);
      const description = describeSuccess(result);
      const completedAt = now();
      const completed = applyResult(run, result);
      const check: QuestionRunCheck = {
        id: `${run.runId}:${stage}:${attempt}:${description.outcome ?? "passed"}`,
        stage,
        attempt,
        kind: description.kind ?? "deterministic",
        outcome: description.outcome ?? "passed",
        code: description.code,
        message: description.message,
        createdAt: completedAt,
      };
      return appendHistory(
        { ...completed, checks: [...completed.checks, check] },
        {
          type: "stage-completed",
          stage,
          message: description.message,
          createdAt: completedAt,
        },
      );
    } catch (error) {
      const failure = normalizeError(error);
      const failedAt = now();
      const check: QuestionRunCheck = {
        id: `${run.runId}:${stage}:${attempt}:failed`,
        stage,
        attempt,
        kind: "deterministic",
        outcome: "failed",
        code: failure.code,
        message: failure.message,
        createdAt: failedAt,
      };
      run = { ...run, checks: [...run.checks, check], updatedAt: failedAt };
      if (failure.retryable && attempt < maxAttempts) {
        run = appendHistory(run, {
          type: "stage-retrying",
          stage,
          message: `${failure.code}: ${failure.message}`,
          createdAt: failedAt,
        });
        continue;
      }
      const rejectionCode = failure.retryable
        ? "retry-budget-exhausted"
        : failure.code;
      return appendHistory(
        {
          ...run,
          status: "rejected",
          currentStage: stage,
          rejection: {
            schemaVersion: REJECTION_RECORD_SCHEMA_VERSION,
            stage,
            code: rejectionCode,
            causeCode: failure.retryable ? failure.code : undefined,
            message: failure.message,
            attempts: attempt,
            createdAt: failedAt,
          },
        },
        {
          type: "run-rejected",
          stage,
          message: `${rejectionCode}: ${failure.message}`,
          createdAt: failedAt,
        },
      );
    }
  }
  throw new Error(`Unreachable retry state for ${stage}`);
}

function retryLimits(
  overrides: QuestionRunRetryLimits | undefined,
): Required<QuestionRunRetryLimits> {
  const limits = { ...DEFAULT_RETRY_LIMITS, ...overrides };
  for (const [stage, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error(
        `Retry limit for ${stage} must be an integer from 1 to 5`,
      );
    }
  }
  return limits;
}

function routeAfterStage(state: typeof QuestionRunState.State): string {
  return state.run.status === "rejected" ? "rejected" : "continue";
}

function hasPassedStage(run: QuestionRun, stage: QuestionRunStage): boolean {
  return run.checks.some(
    (check) => check.stage === stage && check.outcome === "passed",
  );
}

/** Pick the first incomplete canonical stage when a persisted run is invoked. */
function routeFromCanonicalRun(state: typeof QuestionRunState.State): string {
  const { run } = state;
  if (
    run.status === "rejected" ||
    run.status === "accepted" ||
    run.status === "sent-back-for-repair"
  ) {
    return "done";
  }
  if (!run.blueprint) return "plan";
  if (!hasPassedStage(run, "validate-blueprint")) return "validateBlueprint";
  if (!run.verifiedArtifacts) return "solveAndRender";
  if (!run.questionPackage) return "author";
  if (!hasPassedStage(run, "validate-package")) return "validatePackage";
  if (!run.novelty) return "checkNovelty";
  if (
    !run.reviewEnvelope ||
    run.status !== "awaiting-human-review" ||
    run.currentStage !== "human-review"
  ) {
    return "prepareReview";
  }
  return "done";
}

export function createQuestionRunGraph(
  adapters: QuestionRunAdapters,
  options: QuestionRunGraphOptions = {},
) {
  const now = options.now ?? (() => new Date().toISOString());
  const limits = retryLimits(options.retryLimits);
  const store = options.store;

  /**
   * Persist the run after a stage settles. Stage persistence goes through the
   * store's diff, which appends only what is new, so an already-current run is
   * a no-op rather than a duplicate event.
   */
  const settle = async (
    work: QuestionRun | Promise<QuestionRun>,
  ): Promise<{ run: QuestionRun }> => {
    const completed = await work;
    if (!store) return { run: completed };
    return { run: await store.syncRun(completed) };
  };

  const graph = new StateGraph(QuestionRunState)
    .addNode("plan", async ({ run }) =>
      settle(
        executeStage(
          run,
          "plan",
          limits.plan,
          now,
          () => adapters.plan(run.request),
          (current, blueprint) => ({ ...current, blueprint }),
          (blueprint) => ({
            code: "blueprint-created",
            message: `Created blueprint ${blueprint.id}`,
          }),
        ),
      ),
    )
    .addNode("validateBlueprint", async ({ run }) =>
      settle(
        executeStage(
          run,
          "validate-blueprint",
          limits["validate-blueprint"],
          now,
          () =>
            adapters.validateBlueprint(
              run.request,
              requireValue(run.blueprint, "blueprint"),
            ),
          (current) => current,
          () => ({
            code: "blueprint-valid",
            message: "Blueprint passed deterministic validation",
          }),
        ),
      ),
    )
    .addNode("solveAndRender", async ({ run }) =>
      settle(
        executeStage(
          run,
          "solve-and-render",
          limits["solve-and-render"],
          now,
          () =>
            adapters.solveAndRender(requireValue(run.blueprint, "blueprint")),
          (current, verifiedArtifacts) => ({ ...current, verifiedArtifacts }),
          (artifacts) => ({
            code: "physics-and-visuals-verified",
            message: `Verified physics and rendered ${artifacts.renderedVisuals.length} visual artifact(s)`,
          }),
        ),
      ),
    )
    .addNode("author", async ({ run }) =>
      settle(
        executeStage(
          run,
          "author",
          limits.author,
          now,
          () =>
            adapters.author(
              requireValue(run.blueprint, "blueprint"),
              requireValue(run.verifiedArtifacts, "verified artifacts"),
            ),
          (current, questionPackage) => ({ ...current, questionPackage }),
          (questionPackage) => ({
            code: "package-authored",
            message: `Authored package ${questionPackage.packageId}`,
          }),
        ),
      ),
    )
    .addNode("validatePackage", async ({ run }) =>
      settle(
        executeStage(
          run,
          "validate-package",
          limits["validate-package"],
          now,
          async () => {
            const questionPackage = requireValue(
              run.questionPackage,
              "question package",
            );
            const blueprint = requireValue(run.blueprint, "blueprint");
            const artifacts = requireValue(
              run.verifiedArtifacts,
              "verified artifacts",
            );
            validateArtifactAgreement(questionPackage, blueprint, artifacts);
            await adapters.validatePackage(
              questionPackage,
              blueprint,
              artifacts,
            );
          },
          (current) => current,
          () => ({
            code: "package-valid",
            message:
              "Question, solution, source, and deterministic results agree",
          }),
        ),
      ),
    )
    .addNode("checkNovelty", async ({ run }) =>
      settle(
        executeStage(
          run,
          "novelty-check",
          limits["novelty-check"],
          now,
          () =>
            adapters.checkNovelty(
              requireValue(run.questionPackage, "question package"),
              requireValue(run.blueprint, "blueprint"),
            ),
          (current, novelty) => ({ ...current, novelty }),
          (novelty) => ({
            code: `novelty-${novelty.status}`,
            message: novelty.reason,
            outcome: novelty.status === "flagged" ? "flagged" : novelty.status,
            kind: "policy",
          }),
        ),
      ),
    )
    .addNode("prepareReview", async ({ run }) => {
      // The envelope is the expensive, fully checked result of this stage. A
      // crash can occur after it is durably recorded but before the separate
      // awaiting-human-review status/index update. Do not execute the stage a
      // second time in that case: duplicate check/history facts would no
      // longer reproduce the canonical record. Finalize that durable prefix
      // instead. Conversely, an awaiting status without an envelope reaches
      // the normal preparation path below and is repaired from the required
      // inputs rather than treated as complete.
      if (run.reviewEnvelope) {
        const finalized: QuestionRun = {
          ...run,
          status: "awaiting-human-review",
          currentStage: "human-review",
        };
        const alreadyRecorded = finalized.history.some(
          (entry) =>
            entry.type === "awaiting-human-review" &&
            entry.stage === "human-review",
        );
        return settle(
          alreadyRecorded
            ? finalized
            : appendHistory(finalized, {
                type: "awaiting-human-review",
                stage: "human-review",
                message: "Run stopped at the human acceptance boundary",
                createdAt: now(),
              }),
        );
      }

      const completed = await executeStage(
        run,
        "prepare-review",
        limits["prepare-review"],
        now,
        () =>
          adapters.prepareReview(
            requireValue(run.questionPackage, "question package"),
            run.checks,
            requireValue(run.novelty, "novelty assessment"),
          ),
        (current, reviewEnvelope) => ({
          ...current,
          status: "awaiting-human-review",
          currentStage: "human-review",
          reviewEnvelope,
        }),
        () => ({
          code: "human-review-required",
          message:
            "Prepared review envelope; no automatic acceptance performed",
          kind: "policy",
        }),
      );

      if (completed.status !== "awaiting-human-review")
        return settle(completed);

      const at = now();
      return settle(
        appendHistory(completed, {
          type: "awaiting-human-review",
          stage: "human-review",
          message: "Run stopped at the human acceptance boundary",
          createdAt: at,
        }),
      );
    })
    .addConditionalEdges(START, routeFromCanonicalRun, {
      plan: "plan",
      validateBlueprint: "validateBlueprint",
      solveAndRender: "solveAndRender",
      author: "author",
      validatePackage: "validatePackage",
      checkNovelty: "checkNovelty",
      prepareReview: "prepareReview",
      done: END,
    })
    .addConditionalEdges("plan", routeAfterStage, {
      continue: "validateBlueprint",
      rejected: END,
    })
    .addConditionalEdges("validateBlueprint", routeAfterStage, {
      continue: "solveAndRender",
      rejected: END,
    })
    .addConditionalEdges("solveAndRender", routeAfterStage, {
      continue: "author",
      rejected: END,
    })
    .addConditionalEdges("author", routeAfterStage, {
      continue: "validatePackage",
      rejected: END,
    })
    .addConditionalEdges("validatePackage", routeAfterStage, {
      continue: "checkNovelty",
      rejected: END,
    })
    .addConditionalEdges("checkNovelty", routeAfterStage, {
      continue: "prepareReview",
      rejected: END,
    })
    .addEdge("prepareReview", END);

  return options.checkpointer
    ? graph.compile({ checkpointer: options.checkpointer })
    : graph.compile();
}

function checkpointConfig(options: RunQuestionOptions, runId: string) {
  if (!options.checkpointer && !options.threadId) return undefined;
  return { configurable: { thread_id: options.threadId ?? runId } };
}

export async function runQuestionGraph(
  request: QuestionRunRequest,
  adapters: QuestionRunAdapters,
  options: RunQuestionOptions = {},
): Promise<QuestionRun> {
  const now = options.now ?? (() => new Date().toISOString());
  const runId = options.runId ?? createQuestionRunId();

  let initialRun = createQuestionRun(runId, request, now());
  if (options.store) {
    // Reusing an existing record makes re-running the same id a resume rather
    // than a destructive restart.
    const stored = await options.store.fetch(runId);
    initialRun =
      stored ??
      (await options.store.create(request, {
        runId,
        createdAt: initialRun.createdAt,
      }));
  }

  const graph = createQuestionRunGraph(adapters, { ...options, now });
  const result = await graph.invoke(
    { run: initialRun },
    checkpointConfig(options, runId),
  );
  return result.run;
}

/**
 * Continue a graph that was interrupted, using its LangGraph checkpoint.
 *
 * The canonical record of what happened is still the stored `QuestionRun`; this
 * only restores the execution position so the remaining stages can finish.
 */
export async function resumeQuestionGraph(
  adapters: QuestionRunAdapters,
  options: RunQuestionOptions & { threadId: string },
): Promise<QuestionRun> {
  const graph = createQuestionRunGraph(adapters, options);
  const result = await graph.invoke(null, {
    configurable: { thread_id: options.threadId },
  });
  return result.run;
}
