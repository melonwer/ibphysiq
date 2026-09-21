/**
 * Durable persistence for `QuestionRun`.
 *
 * Storage layout per run:
 *
 *   <root>/runs/<runId>/events.jsonl   append-only, immutable event log
 *   <root>/runs/<runId>/snapshot.json  materialised index entry for the run
 *   <root>/runs/<runId>/corrupt/       quarantined bytes, kept for diagnosis
 *
 * The event log is the source of truth and the snapshot is a cache of folding
 * it. Every event is made durable before the snapshot that summarises it, so a
 * snapshot can only ever lag the log; `resume` replays the missing tail and
 * repairs it, while `fetch` is the fast index read.
 *
 * This module deliberately knows nothing about LangGraph. The run record is
 * canonical; execution checkpoints are an orchestration detail handled in
 * `./question-run-graph`.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";

import {
  ArtifactKind,
  checkArtifactSchemaVersion,
  validateArtifact,
} from "./contracts";
import {
  HumanReviewEvent,
  assertStatusIsEvidenced,
  evaluateTrainingReadiness,
  statusFromHumanReview,
} from "./human-review";
import {
  createQuestionRun,
  createQuestionRunId,
  QuestionRun,
  QuestionRunCheck,
  QuestionRunHistoryEntry,
  QuestionRunRejection,
  QuestionRunRequest,
  QuestionRunReview,
  QuestionRunStage,
  QuestionRunStatus,
  VersionedQuestionRunRequest,
} from "./question-run";

export const QUESTION_RUN_SNAPSHOT_SCHEMA_VERSION =
  "question-run-snapshot/0.1.0" as const;

const RUNS_DIR = "runs";
const EVENTS_FILE = "events.jsonl";
const SNAPSHOT_FILE = "snapshot.json";
const CORRUPT_DIR = "corrupt";
const LOCKS_DIR = ".locks";
const LOCK_RETRY_DELAY_MS = 10;
const LOCK_STALE_MS = 60_000;
const QUESTION_RUN_STATUSES: readonly QuestionRunStatus[] = [
  "requested",
  "running",
  "awaiting-human-review",
  "sent-back-for-repair",
  "accepted",
  "rejected",
];
const QUESTION_RUN_STAGES: readonly QuestionRunStage[] = [
  "plan",
  "validate-blueprint",
  "solve-and-render",
  "author",
  "validate-package",
  "novelty-check",
  "prepare-review",
  "human-review",
];

export type QuestionRunStoreErrorCode =
  | "run-not-found"
  | "run-already-exists"
  | "stale-revision"
  | "invalid-artifact"
  | "unsupported-schema-version"
  | "invalid-event"
  | "corrupt-log";

export class QuestionRunStoreError extends Error {
  constructor(
    readonly code: QuestionRunStoreErrorCode,
    message: string,
    readonly context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "QuestionRunStoreError";
  }
}

export interface QuestionRunEventBase {
  eventId: string;
  runId: string;
  /** Revision this event produced; a run's revision is its highest event. */
  revision: number;
  /** When the event was recorded. */
  createdAt: string;
}

export interface RunCreatedEvent extends QuestionRunEventBase {
  type: "run-created";
  payload: {
    request: VersionedQuestionRunRequest;
    /** The run's own creation time, which the envelope timestamp need not equal. */
    runCreatedAt: string;
    historyEntry: QuestionRunHistoryEntry;
  };
}

export interface RunStatusChangedEvent extends QuestionRunEventBase {
  type: "run-status-changed";
  payload: { status: QuestionRunStatus; currentStage?: QuestionRunStage };
}

export interface StageAttemptedEvent extends QuestionRunEventBase {
  type: "stage-attempted";
  payload: { stage: QuestionRunStage; attempt: number };
}

export interface CheckRecordedEvent extends QuestionRunEventBase {
  type: "check-recorded";
  payload: { check: QuestionRunCheck };
}

export interface ArtifactRecordedEvent extends QuestionRunEventBase {
  type: "artifact-recorded";
  payload: { artifactKind: ArtifactKind; artifact: unknown };
}

export interface HistoryRecordedEvent extends QuestionRunEventBase {
  type: "history-recorded";
  payload: { entry: QuestionRunHistoryEntry };
}

export interface ReviewRecordedEvent extends QuestionRunEventBase {
  type: "review-recorded";
  payload: { review: QuestionRunReview };
}

export interface RejectionRecordedEvent extends QuestionRunEventBase {
  type: "rejection-recorded";
  payload: { rejection: QuestionRunRejection };
}

export interface HumanReviewRecordedEvent extends QuestionRunEventBase {
  type: "human-review-recorded";
  payload: { review: HumanReviewEvent };
}

export type QuestionRunEvent =
  | RunCreatedEvent
  | RunStatusChangedEvent
  | StageAttemptedEvent
  | CheckRecordedEvent
  | ArtifactRecordedEvent
  | HistoryRecordedEvent
  | ReviewRecordedEvent
  | RejectionRecordedEvent
  | HumanReviewRecordedEvent;

export type QuestionRunEventType = QuestionRunEvent["type"];

/** An event body supplied by a caller, before the store stamps its envelope. */
export type NewQuestionRunEvent = {
  [T in QuestionRunEventType]: {
    type: T;
    payload: Extract<QuestionRunEvent, { type: T }>["payload"];
  };
}[QuestionRunEventType];

export interface AppendEventOptions {
  /**
   * Compare-and-swap guard. When supplied, the append is rejected unless the
   * stored run is still at this revision, so two writers cannot both build on
   * a revision each believes is current.
   */
  expectedRevision?: number;
  /** Caller-supplied id making the append idempotent under retry. */
  eventId?: string;
  createdAt?: string;
}

/** Claims signed after server-side session, CSRF, and observed-view checks. */
export interface HumanReviewAppendAuthorization {
  readonly runId: string;
  readonly reviewerId: string;
  readonly sessionId: string;
  readonly packageId: string;
  readonly reviewedRevision: number;
  readonly reviewedContentFingerprint: string;
  readonly signature: string;
}

export interface AuthorizedHumanReviewStore extends QuestionRunStore {
  appendAuthorizedHumanReview(
    review: HumanReviewEvent,
    authorization: HumanReviewAppendAuthorization,
  ): Promise<QuestionRun>;
}

function authorizationMessage(
  authorization: Omit<HumanReviewAppendAuthorization, "signature">,
): string {
  return [
    "human-review-append/v1",
    authorization.runId,
    authorization.reviewerId,
    authorization.sessionId,
    authorization.packageId,
    String(authorization.reviewedRevision),
    authorization.reviewedContentFingerprint,
  ].join("\u0000");
}

/** Server-only signer; without the pilot session secret callers cannot forge it. */
export function signHumanReviewAppendAuthorization(
  authorization: Omit<HumanReviewAppendAuthorization, "signature">,
  secret: string,
): HumanReviewAppendAuthorization {
  return {
    ...authorization,
    signature: createHmac("sha256", secret)
      .update(authorizationMessage(authorization), "utf8")
      .digest("base64url"),
  };
}

function hasValidHumanReviewAuthorization(
  authorization: HumanReviewAppendAuthorization,
  secret: string,
): boolean {
  const expected = signHumanReviewAppendAuthorization(
    {
      runId: authorization.runId,
      reviewerId: authorization.reviewerId,
      sessionId: authorization.sessionId,
      packageId: authorization.packageId,
      reviewedRevision: authorization.reviewedRevision,
      reviewedContentFingerprint: authorization.reviewedContentFingerprint,
    },
    secret,
  ).signature;
  // HMAC both strings to fixed width before comparison so malformed signature
  // lengths neither throw nor create a length oracle.
  const blind = (value: string) =>
    createHmac("sha256", "human-review-authorization-length-blinding")
      .update(value, "utf8")
      .digest();
  return timingSafeEqual(blind(expected), blind(authorization.signature));
}

export interface CreateQuestionRunOptions {
  runId?: string;
  createdAt?: string;
}

export interface QuestionRunFilter {
  status?: QuestionRunStatus;
  mode?: QuestionRunRequest["mode"];
  paper?: QuestionRunRequest["paper"];
  level?: QuestionRunRequest["level"];
  topic?: string;
}

export interface QuestionRunReadIssue {
  code: "torn-trailing-line" | "duplicate-event-id" | "unreadable-snapshot";
  message: string;
  quarantinedPath?: string;
}

export interface QuestionRunInspection {
  run: QuestionRun;
  issues: QuestionRunReadIssue[];
}

export interface QuestionRunStore {
  create(
    request: QuestionRunRequest,
    options?: CreateQuestionRunOptions,
  ): Promise<QuestionRun>;
  fetch(runId: string): Promise<QuestionRun | undefined>;
  list(filter?: QuestionRunFilter): Promise<QuestionRun[]>;
  appendEvent(
    runId: string,
    event: NewQuestionRunEvent,
    options?: AppendEventOptions,
  ): Promise<QuestionRun>;
  syncRun(run: QuestionRun, options?: AppendEventOptions): Promise<QuestionRun>;
  resume(runId: string): Promise<QuestionRun>;
  inspect(runId: string): Promise<QuestionRunInspection>;
  recordRejection(
    runId: string,
    rejection: QuestionRunRejection,
    options?: AppendEventOptions,
  ): Promise<QuestionRun>;
  listReviewQueue(filter?: QuestionRunFilter): Promise<QuestionRun[]>;
}

interface StoredSnapshot {
  schemaVersion: typeof QUESTION_RUN_SNAPSHOT_SCHEMA_VERSION;
  revision: number;
  run: QuestionRun;
}

const ARTIFACT_FIELDS: ReadonlyArray<{
  field:
    | "blueprint"
    | "verifiedArtifacts"
    | "questionPackage"
    | "novelty"
    | "reviewEnvelope";
  artifactKind: ArtifactKind;
}> = [
  { field: "blueprint", artifactKind: "question-blueprint" },
  { field: "verifiedArtifacts", artifactKind: "verified-question-artifacts" },
  { field: "questionPackage", artifactKind: "question-package-artifact" },
  { field: "novelty", artifactKind: "novelty-assessment" },
  { field: "reviewEnvelope", artifactKind: "question-review-envelope" },
];

/**
 * Fold one event into a run. Pure and total, so a log can be replayed at any
 * time in any process to reach the same state.
 */
export function applyQuestionRunEvent(
  run: QuestionRun,
  event: QuestionRunEvent,
): QuestionRun {
  switch (event.type) {
    case "run-created":
      return {
        ...run,
        request: event.payload.request,
        createdAt: event.payload.runCreatedAt,
        history: [...run.history, event.payload.historyEntry],
      };
    case "run-status-changed":
      return {
        ...run,
        status: event.payload.status,
        ...(event.payload.currentStage
          ? { currentStage: event.payload.currentStage }
          : {}),
      };
    case "stage-attempted":
      return {
        ...run,
        attempts: {
          ...run.attempts,
          [event.payload.stage]: event.payload.attempt,
        },
      };
    case "check-recorded":
      return { ...run, checks: [...run.checks, event.payload.check] };
    case "artifact-recorded": {
      const { artifactKind, artifact } = event.payload;
      const assignment = ARTIFACT_FIELDS.find(
        (candidate) => candidate.artifactKind === artifactKind,
      );
      if (!assignment) {
        throw new QuestionRunStoreError(
          "invalid-event",
          `No run field stores artifacts of kind ${artifactKind}`,
        );
      }
      return { ...run, [assignment.field]: artifact } as QuestionRun;
    }
    case "history-recorded":
      return { ...run, history: [...run.history, event.payload.entry] };
    case "review-recorded":
      return { ...run, reviews: [...run.reviews, event.payload.review] };
    case "human-review-recorded":
      // The decision and the editorial state are one durable fact. This avoids
      // a crash between a review event and a separate status event leaving an
      // accepted decision stranded in an awaiting-review snapshot.
      return {
        ...run,
        humanReviews: [...run.humanReviews, event.payload.review],
        ...(event.payload.review.concern === "educational-acceptance"
          ? {
              status: statusFromHumanReview(event.payload.review),
              currentStage: "human-review" as const,
            }
          : {}),
      };
    case "rejection-recorded":
      return { ...run, status: "rejected", rejection: event.payload.rejection };
  }
}

function withEnvelope(run: QuestionRun, event: QuestionRunEvent): QuestionRun {
  return { ...run, revision: event.revision, updatedAt: event.createdAt };
}

export function foldQuestionRunEvents(
  run: QuestionRun,
  events: readonly QuestionRunEvent[],
): QuestionRun {
  return events.reduce(
    (current, event) =>
      withEnvelope(applyQuestionRunEvent(current, event), event),
    run,
  );
}

/**
 * Order-insensitive serialisation, so comparing a folded run against its input
 * cannot fail merely because two objects were built with different key orders.
 */
function canonicalize(value: unknown): string {
  return JSON.stringify(value, (_key, candidate) => {
    if (
      candidate !== null &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        ),
      );
    }
    return candidate;
  });
}

/** Strip fields the store owns so a replayed run can be compared to its input. */
export function withoutRevisionFields(
  run: QuestionRun,
): Record<string, unknown> {
  const { revision: _revision, updatedAt: _updatedAt, ...rest } = run;
  return rest;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertArtifactIsValid(
  artifactKind: ArtifactKind,
  artifact: unknown,
): void {
  const version = (artifact as { schemaVersion?: unknown } | undefined)
    ?.schemaVersion;
  const versionCheck = checkArtifactSchemaVersion(artifactKind, version);
  if (!versionCheck.supported) {
    throw new QuestionRunStoreError(
      "unsupported-schema-version",
      versionCheck.issue?.message ??
        `${artifactKind} has an unsupported version`,
      { artifactKind, version },
    );
  }
  const validation = validateArtifact(artifactKind, artifact);
  if (!validation.valid) {
    throw new QuestionRunStoreError(
      "invalid-artifact",
      validation.issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; "),
      { artifactKind },
    );
  }
}

/**
 * Placeholder used to give the reducer a well-formed starting point before
 * `run-created` is replayed. Never persisted and never returned.
 */
function emptyQuestionRun(runId: string): QuestionRun {
  const placeholder = createQuestionRun(
    runId,
    {
      mode: "generate",
      paper: "1A",
      level: "SL",
      topics: ["unset"],
      assessedSkills: ["unset"],
      difficulty: "standard",
      visualPolicy: "model-decides",
    },
    new Date(0).toISOString(),
  );
  return { ...placeholder, history: [], revision: 0 };
}

export class JsonlQuestionRunStore implements AuthorizedHumanReviewStore {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly rootDir: string,
    private readonly humanReviewAuthorizationSecret?: string,
  ) {}

  async create(
    request: QuestionRunRequest,
    options: CreateQuestionRunOptions = {},
  ): Promise<QuestionRun> {
    const runId = options.runId ?? createQuestionRunId();
    return this.withRunLock(runId, () =>
      this.createLocked(runId, request, options),
    );
  }

  /**
   * Fast index read. A snapshot can only lag the log after an interrupted
   * write, which `resume` is responsible for repairing.
   */
  async fetch(runId: string): Promise<QuestionRun | undefined> {
    this.assertSafeRunId(runId);
    if (!(await this.exists(this.runDir(runId)))) return undefined;
    // A snapshot is only an index. Replaying here prevents a syntactically
    // valid but stale or tampered cache from becoming an authority.
    return (await this.inspect(runId)).run;
  }

  async resume(runId: string): Promise<QuestionRun> {
    return (await this.inspect(runId)).run;
  }

  /** Replay the log and repair a lagging snapshot. */
  async inspect(runId: string): Promise<QuestionRunInspection> {
    this.assertSafeRunId(runId);
    return this.withRunLock(runId, () => this.inspectLocked(runId));
  }

  async list(filter: QuestionRunFilter = {}): Promise<QuestionRun[]> {
    const runs = await this.readAllSnapshots();
    return runs.filter((run) => matchesFilter(run, filter));
  }

  async listReviewQueue(
    filter: QuestionRunFilter = {},
  ): Promise<QuestionRun[]> {
    const runs = await this.list(filter);
    return runs.filter((run) => {
      // A passed educational review is only one of four independent gates.
      // Keep it discoverable until source clearance, metadata, and grouped
      // split assignment also make the package genuinely training-ready.
      if (run.status === "accepted") {
        return !evaluateTrainingReadiness(run).ready;
      }

      // Send-back is active review work: the reviewer must be able to reopen
      // it after repair. A rejection is terminal and intentionally stays out
      // of the worklist; it can still be fetched directly for audit.
      return (
        run.status === "awaiting-human-review" ||
        run.status === "sent-back-for-repair"
      );
    });
  }

  async appendEvent(
    runId: string,
    event: NewQuestionRunEvent,
    options: AppendEventOptions = {},
  ): Promise<QuestionRun> {
    if (event.type === "human-review-recorded") {
      throw new QuestionRunStoreError(
        "invalid-event",
        "Human review events require the authorized review append path",
        { runId },
      );
    }
    return this.withRunLock(runId, () =>
      this.appendEventLocked(runId, event, options),
    );
  }

  /**
   * The only write path for a new immutable human decision. The caller must
   * present a server-signed authorization bound to one observed page revision
   * and package fingerprint; this check occurs inside the same filesystem lock
   * as the append, so a CAS race cannot silently retarget a decision.
   */
  async appendAuthorizedHumanReview(
    review: HumanReviewEvent,
    authorization: HumanReviewAppendAuthorization,
  ): Promise<QuestionRun> {
    return this.withRunLock(review.runId, async () => {
      if (
        !this.humanReviewAuthorizationSecret ||
        !hasValidHumanReviewAuthorization(
          authorization,
          this.humanReviewAuthorizationSecret,
        )
      ) {
        throw new QuestionRunStoreError(
          "invalid-event",
          "Human review authorization is invalid",
          { runId: review.runId },
        );
      }
      const current = (await this.inspectLocked(review.runId)).run;
      const existing = current.humanReviews.find(
        (candidate) => candidate.decisionId === review.decisionId,
      );
      if (existing) {
        if (canonicalize(existing) === canonicalize(review)) return current;
        throw new QuestionRunStoreError(
          "invalid-event",
          `Human review decision ${review.decisionId} is already recorded with different content`,
          { runId: review.runId, decisionId: review.decisionId },
        );
      }
      if (
        authorization.runId !== review.runId ||
        authorization.reviewerId !== review.reviewerId ||
        authorization.reviewedRevision !== review.reviewedRevision ||
        authorization.reviewedContentFingerprint !==
          review.reviewedContentFingerprint ||
        current.revision !== authorization.reviewedRevision ||
        current.questionPackage?.packageId !== authorization.packageId ||
        current.questionPackage?.contentFingerprint !==
          authorization.reviewedContentFingerprint
      ) {
        throw new QuestionRunStoreError(
          "stale-revision",
          `Human review authorization no longer matches canonical run ${review.runId}`,
          { runId: review.runId },
        );
      }
      const appended: QuestionRunEvent = {
        eventId: `${review.runId}:${current.revision + 1}:human-review-recorded`,
        runId: review.runId,
        revision: current.revision + 1,
        createdAt: review.createdAt,
        type: "human-review-recorded",
        payload: { review },
      };
      this.assertEventPayloadIsValid(
        { type: "human-review-recorded", payload: { review } },
        review.runId,
      );
      const stored = withEnvelope(
        applyQuestionRunEvent(current, appended),
        appended,
      );
      try {
        assertStatusIsEvidenced(stored);
      } catch (error) {
        throw new QuestionRunStoreError(
          "invalid-event",
          error instanceof Error ? error.message : String(error),
          { runId: review.runId },
        );
      }
      await this.appendEventLines(review.runId, [appended]);
      await this.writeSnapshot(review.runId, stored);
      return stored;
    });
  }

  /**
   * Bring the stored run up to date with an in-memory run by appending only the
   * events that are missing. Calling it twice with the same run writes nothing
   * the second time, which makes stage persistence safe to retry.
   */
  async syncRun(
    run: QuestionRun,
    options: AppendEventOptions = {},
  ): Promise<QuestionRun> {
    return this.withRunLock(run.runId, async () => {
      const stored = (await this.exists(this.runDir(run.runId)))
        ? (await this.inspectLocked(run.runId)).run
        : await this.createLocked(run.runId, run.request, {
            createdAt: run.createdAt,
          });
      if (
        run.humanReviews.length !== stored.humanReviews.length ||
        ((run.status === "accepted" || run.status === "sent-back-for-repair") &&
          run.status !== stored.status)
      ) {
        throw new QuestionRunStoreError(
          "invalid-event",
          "syncRun cannot create human review evidence or human-only statuses",
          { runId: run.runId },
        );
      }
      return this.applyRunDiff(stored, run, options);
    });
  }

  async recordRejection(
    runId: string,
    rejection: QuestionRunRejection,
    options: AppendEventOptions = {},
  ): Promise<QuestionRun> {
    return this.appendEvent(
      runId,
      { type: "rejection-recorded", payload: { rejection } },
      options,
    );
  }

  // --- lock-free internals (callers hold the per-run lock) ------------------

  private async createLocked(
    runId: string,
    request: QuestionRunRequest,
    options: CreateQuestionRunOptions,
  ): Promise<QuestionRun> {
    const createdAt = options.createdAt ?? new Date().toISOString();
    const run = createQuestionRun(runId, request, createdAt);
    const directory = this.runDir(runId);
    if (await this.exists(directory)) {
      throw new QuestionRunStoreError(
        "run-already-exists",
        `Question run ${runId} already exists`,
        { runId },
      );
    }

    await fs.mkdir(directory, { recursive: true });
    const event: QuestionRunEvent = {
      eventId: `${runId}:1:run-created`,
      runId,
      revision: 1,
      createdAt,
      type: "run-created",
      payload: {
        request: run.request,
        runCreatedAt: run.createdAt,
        historyEntry: run.history[0],
      },
    };
    await this.appendEventLines(runId, [event]);
    const stored = withEnvelope(
      applyQuestionRunEvent(emptyQuestionRun(runId), event),
      event,
    );
    await this.writeSnapshot(runId, stored);
    return stored;
  }

  private async inspectLocked(runId: string): Promise<QuestionRunInspection> {
    if (!(await this.exists(this.runDir(runId)))) {
      throw new QuestionRunStoreError(
        "run-not-found",
        `Question run ${runId} was not found`,
        { runId },
      );
    }

    const { events, issues } = await this.readEventLog(runId);
    const snapshot = await this.readSnapshot(runId);
    // The log is the source of truth. A parsed snapshot must never be trusted
    // merely because its revision happens to match the last event: it may have
    // been partially replaced with another valid JSON value. Replaying the
    // compact pilot logs is cheap and makes snapshot corruption recoverable.
    const replayed = foldQuestionRunEvents(emptyQuestionRun(runId), events);
    try {
      assertStatusIsEvidenced(replayed);
    } catch (error) {
      throw new QuestionRunStoreError(
        "invalid-event",
        error instanceof Error ? error.message : String(error),
        { runId },
      );
    }

    if (!snapshot || canonicalize(snapshot.run) !== canonicalize(replayed)) {
      await this.writeSnapshot(runId, replayed);
    }
    return { run: replayed, issues };
  }

  private async appendEventLocked(
    runId: string,
    event: NewQuestionRunEvent,
    options: AppendEventOptions,
    knownRun?: QuestionRun,
  ): Promise<QuestionRun> {
    const run = knownRun ?? (await this.inspectLocked(runId)).run;
    this.assertEventPayloadIsValid(event, runId);

    const eventId = options.eventId ?? this.nextEventId(run, event.type);
    const { events } = await this.readEventLog(runId);
    const existing = events.find((candidate) => candidate.eventId === eventId);
    if (existing) {
      if (
        existing.type !== event.type ||
        canonicalize(existing.payload) !== canonicalize(event.payload)
      ) {
        throw new QuestionRunStoreError(
          "invalid-event",
          `Event id ${eventId} was already used for different content`,
          { runId, eventId },
        );
      }
      // An exact at-least-once retry: the caller's intent is already durable.
      return run;
    }
    this.assertRevision(run, options.expectedRevision, runId);
    if (
      event.type === "human-review-recorded" &&
      run.humanReviews.some(
        (review) => review.decisionId === event.payload.review.decisionId,
      )
    ) {
      throw new QuestionRunStoreError(
        "invalid-event",
        `Human review decision ${event.payload.review.decisionId} is already recorded for ${runId}`,
        { runId, decisionId: event.payload.review.decisionId },
      );
    }

    const appended = {
      eventId,
      runId,
      revision: run.revision + 1,
      createdAt: options.createdAt ?? new Date().toISOString(),
      ...event,
    } as QuestionRunEvent;

    const stored = withEnvelope(applyQuestionRunEvent(run, appended), appended);
    try {
      assertStatusIsEvidenced(stored);
    } catch (error) {
      throw new QuestionRunStoreError(
        "invalid-event",
        error instanceof Error ? error.message : String(error),
        { runId },
      );
    }
    await this.appendEventLines(runId, [appended]);
    await this.writeSnapshot(runId, stored);
    return stored;
  }

  private async applyRunDiff(
    stored: QuestionRun,
    incoming: QuestionRun,
    options: AppendEventOptions,
  ): Promise<QuestionRun> {
    if (
      stored.runId !== incoming.runId ||
      stored.schemaVersion !== incoming.schemaVersion
    ) {
      throw new QuestionRunStoreError(
        "invalid-event",
        `Cannot persist run ${incoming.runId} over stored run ${stored.runId}`,
        { runId: incoming.runId },
      );
    }

    // History, reviews, and human decisions are append-only, so only the
    // entries past the stored prefix can be new. A rewrite would mean the
    // caller built a run from different facts rather than from progress.
    this.assertAppendOnlyPrefix(
      stored.history,
      incoming.history,
      "history",
      incoming.runId,
    );
    const decisionIds = new Set<string>();
    for (const review of incoming.humanReviews) {
      if (decisionIds.has(review.decisionId)) {
        throw new QuestionRunStoreError(
          "invalid-event",
          `Run ${incoming.runId} repeats human review decision ${review.decisionId}`,
          { runId: incoming.runId, decisionId: review.decisionId },
        );
      }
      decisionIds.add(review.decisionId);
    }
    this.assertAppendOnlyPrefix(
      stored.reviews,
      incoming.reviews,
      "reviews",
      incoming.runId,
    );
    this.assertAppendOnlyPrefix(
      stored.humanReviews,
      incoming.humanReviews,
      "human reviews",
      incoming.runId,
    );

    // An accepted or sent-back run must be evidenced by a recorded human
    // decision; this is what makes automatic acceptance unreachable rather
    // than merely discouraged.
    try {
      assertStatusIsEvidenced(incoming);
    } catch (error) {
      throw new QuestionRunStoreError(
        "invalid-event",
        error instanceof Error ? error.message : String(error),
        { runId: incoming.runId, status: incoming.status },
      );
    }

    const events: NewQuestionRunEvent[] = [];

    for (const entry of incoming.history.slice(stored.history.length)) {
      events.push({ type: "history-recorded", payload: { entry } });
    }

    for (const review of incoming.reviews.slice(stored.reviews.length)) {
      events.push({ type: "review-recorded", payload: { review } });
    }

    for (const [stage, attempt] of Object.entries(incoming.attempts)) {
      if (attempt === undefined) continue;
      if ((stored.attempts[stage as QuestionRunStage] ?? 0) < attempt) {
        events.push({
          type: "stage-attempted",
          payload: { stage: stage as QuestionRunStage, attempt },
        });
      }
    }

    const storedCheckIds = new Set(stored.checks.map((check) => check.id));
    for (const check of incoming.checks) {
      if (!storedCheckIds.has(check.id)) {
        events.push({ type: "check-recorded", payload: { check } });
      }
    }

    for (const { field, artifactKind } of ARTIFACT_FIELDS) {
      const artifact = incoming[field];
      if (artifact === undefined) continue;
      if (canonicalize(stored[field]) === canonicalize(artifact)) continue;
      events.push({
        type: "artifact-recorded",
        payload: { artifactKind, artifact },
      });
    }

    const newHumanReviews = incoming.humanReviews.slice(
      stored.humanReviews.length,
    );
    for (const review of newHumanReviews) {
      if (review.runId !== incoming.runId) {
        throw new QuestionRunStoreError(
          "invalid-event",
          `Human review event ${review.decisionId} belongs to ${review.runId}, not ${incoming.runId}`,
          { runId: incoming.runId, reviewRunId: review.runId },
        );
      }
      events.push({ type: "human-review-recorded", payload: { review } });
    }

    const statusChanged =
      incoming.status !== stored.status ||
      (incoming.currentStage ?? undefined) !==
        (stored.currentStage ?? undefined);
    const statusIsCarriedByReview = newHumanReviews.some(
      (review) =>
        review.concern === "educational-acceptance" &&
        statusFromHumanReview(review) === incoming.status &&
        incoming.currentStage === "human-review",
    );
    if (
      statusChanged &&
      incoming.rejection === undefined &&
      !statusIsCarriedByReview
    ) {
      events.push({
        type: "run-status-changed",
        payload: {
          status: incoming.status,
          ...(incoming.currentStage
            ? { currentStage: incoming.currentStage }
            : {}),
        },
      });
    }

    // A rejection both records itself and moves the run to `rejected`, so it
    // replaces the plain status change rather than racing with it.
    if (
      incoming.rejection !== undefined &&
      canonicalize(stored.rejection) !== canonicalize(incoming.rejection)
    ) {
      events.push({
        type: "rejection-recorded",
        payload: { rejection: incoming.rejection },
      });
    }

    if (events.length === 0) return stored;

    for (const event of events) {
      this.assertEventPayloadIsValid(event, incoming.runId);
    }
    this.assertRevision(stored, options.expectedRevision, incoming.runId);

    let current = stored;
    let revision = stored.revision;
    const appended: QuestionRunEvent[] = [];
    for (const event of events) {
      revision += 1;
      appended.push({
        eventId: `${incoming.runId}:${revision}:${event.type}`,
        runId: incoming.runId,
        revision,
        // Stamp the whole batch with the run's own update time so replay
        // reproduces `updatedAt` exactly.
        createdAt: incoming.updatedAt,
        ...event,
      } as QuestionRunEvent);
    }

    // Validate the complete projected state before changing either durable
    // representation. A mixed valid/invalid diff must never leave a prefix of
    // its events in the canonical log.
    current = foldQuestionRunEvents(current, appended);

    if (
      canonicalize(withoutRevisionFields(current)) !==
      canonicalize(withoutRevisionFields(incoming))
    ) {
      throw new QuestionRunStoreError(
        "invalid-event",
        `Persisting run ${incoming.runId} did not reproduce the supplied ` +
          `record, so the stored run would silently disagree with it`,
        { runId: incoming.runId },
      );
    }

    await this.appendEventLines(incoming.runId, appended);
    await this.writeSnapshot(incoming.runId, current);

    return current;
  }

  private assertAppendOnlyPrefix(
    stored: readonly unknown[],
    incoming: readonly unknown[],
    label: string,
    runId: string,
  ): void {
    const rewritten =
      stored.length > incoming.length ||
      canonicalize(stored) !== canonicalize(incoming.slice(0, stored.length));
    if (rewritten) {
      throw new QuestionRunStoreError(
        "invalid-event",
        `Run ${runId} rewrites its own ${label}, which are append-only`,
        { runId, label },
      );
    }
  }

  /**
   * Validate the payload of any event that carries a versioned record, so a
   * malformed or unknown-version record never becomes durable.
   */
  private assertEventPayloadIsValid(
    event: NewQuestionRunEvent,
    runId?: string,
  ): void {
    if (!isPlainObject(event.payload)) {
      throw new QuestionRunStoreError(
        "invalid-event",
        `Event ${event.type} has no object payload`,
        { runId },
      );
    }
    if (event.type === "run-created") {
      assertArtifactIsValid("question-run-request", event.payload.request);
    }
    if (event.type === "run-status-changed") {
      if (
        event.payload.status === "accepted" ||
        event.payload.status === "sent-back-for-repair"
      ) {
        throw new QuestionRunStoreError(
          "invalid-event",
          `Status ${event.payload.status} may only be produced by an evidenced human-review-recorded event`,
          { runId, status: event.payload.status },
        );
      }
      if (!QUESTION_RUN_STATUSES.includes(event.payload.status)) {
        throw new QuestionRunStoreError(
          "invalid-event",
          `Unknown question-run status ${String(event.payload.status)}`,
          { runId },
        );
      }
      if (
        event.payload.currentStage !== undefined &&
        !QUESTION_RUN_STAGES.includes(event.payload.currentStage)
      ) {
        throw new QuestionRunStoreError(
          "invalid-event",
          `Unknown question-run stage ${String(event.payload.currentStage)}`,
          { runId },
        );
      }
    }
    if (event.type === "stage-attempted") {
      if (
        !QUESTION_RUN_STAGES.includes(event.payload.stage) ||
        !Number.isInteger(event.payload.attempt) ||
        event.payload.attempt < 1
      ) {
        throw new QuestionRunStoreError(
          "invalid-event",
          "Stage attempts need a known stage and a positive integer attempt",
          { runId },
        );
      }
    }
    if (event.type === "artifact-recorded") {
      assertArtifactIsValid(event.payload.artifactKind, event.payload.artifact);
    }
    if (event.type === "rejection-recorded") {
      assertArtifactIsValid("question-run-rejection", event.payload.rejection);
    }
    if (event.type === "human-review-recorded") {
      assertArtifactIsValid("human-review-event", event.payload.review);
      if (runId !== undefined && event.payload.review.runId !== runId) {
        throw new QuestionRunStoreError(
          "invalid-event",
          `Human review event belongs to ${event.payload.review.runId}, not ${runId}`,
          { runId, reviewRunId: event.payload.review.runId },
        );
      }
    }
  }

  private assertRevision(
    run: QuestionRun,
    expectedRevision: number | undefined,
    runId: string,
  ): void {
    if (expectedRevision !== undefined && expectedRevision !== run.revision) {
      throw new QuestionRunStoreError(
        "stale-revision",
        `Question run ${runId} is at revision ${run.revision}, not the ` +
          `expected ${expectedRevision}; the record changed since it was read`,
        { runId, expectedRevision, actualRevision: run.revision },
      );
    }
  }

  private nextEventId(run: QuestionRun, type: QuestionRunEventType): string {
    return `${run.runId}:${run.revision + 1}:${type}`;
  }

  private runDir(runId: string): string {
    return join(this.rootDir, RUNS_DIR, runId);
  }

  private assertSafeRunId(runId: string): void {
    if (
      !runId ||
      runId === "." ||
      runId === ".." ||
      runId.includes("/") ||
      runId.includes("\\") ||
      runId.includes("\0")
    ) {
      throw new QuestionRunStoreError(
        "invalid-event",
        "Question run id must be a single non-empty path segment",
        { runId },
      );
    }
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  private async appendEventLines(
    runId: string,
    events: readonly QuestionRunEvent[],
  ): Promise<void> {
    // One write per newline-terminated record: a crash can only ever leave an
    // incomplete trailing line, which `readEventLog` recovers.
    await fs.appendFile(
      join(this.runDir(runId), EVENTS_FILE),
      events.map((event) => `${JSON.stringify(event)}\n`).join(""),
      "utf8",
    );
  }

  private async writeSnapshot(runId: string, run: QuestionRun): Promise<void> {
    const directory = this.runDir(runId);
    const snapshot: StoredSnapshot = {
      schemaVersion: QUESTION_RUN_SNAPSHOT_SCHEMA_VERSION,
      revision: run.revision,
      run,
    };
    // Write beside the target then rename, so a reader never observes a
    // half-written snapshot.
    const temporary = join(directory, `${SNAPSHOT_FILE}.${process.pid}.tmp`);
    await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2), "utf8");
    await fs.rename(temporary, join(directory, SNAPSHOT_FILE));
  }

  /**
   * Read the snapshot index entry. A snapshot that cannot be read is moved
   * aside rather than treated as fatal: it is a cache, so the caller can rebuild
   * it from the log.
   */
  private async readSnapshot(
    runId: string,
  ): Promise<StoredSnapshot | undefined> {
    const path = join(this.runDir(runId), SNAPSHOT_FILE);
    let raw: string;
    try {
      raw = await fs.readFile(path, "utf8");
    } catch {
      return undefined;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await this.quarantineFile(runId, path, SNAPSHOT_FILE);
      return undefined;
    }

    const version = (parsed as { schemaVersion?: unknown } | undefined)
      ?.schemaVersion;
    if (version !== QUESTION_RUN_SNAPSHOT_SCHEMA_VERSION) {
      // Left in place: this is an unrecognised format, not corruption, and a
      // migration may still want the original bytes.
      throw new QuestionRunStoreError(
        "unsupported-schema-version",
        `Snapshot for ${runId} declares unsupported version ` +
          `${JSON.stringify(version)}; it needs an explicit migration before it can be read`,
        { runId, version },
      );
    }

    const run = (parsed as StoredSnapshot).run;
    if (!isPlainObject(run) || typeof run.runId !== "string") {
      await this.quarantineFile(runId, path, SNAPSHOT_FILE);
      return undefined;
    }
    return parsed as StoredSnapshot;
  }

  private async readAllSnapshots(): Promise<QuestionRun[]> {
    const runsRoot = join(this.rootDir, RUNS_DIR);
    let entries: string[];
    try {
      entries = await fs.readdir(runsRoot);
    } catch {
      return [];
    }
    const runs: QuestionRun[] = [];
    for (const entry of [...entries].sort()) {
      const path = join(runsRoot, entry);
      let stat;
      try {
        stat = await fs.stat(path);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      // As with fetch, list results must originate from replayed events rather
      // than an unverified snapshot cache.
      runs.push(await this.resume(entry));
    }
    return runs;
  }

  /**
   * Read the append-only log, recovering a torn trailing line and
   * deduplicating by event id. Anything unreadable is copied aside first.
   */
  private async readEventLog(runId: string): Promise<{
    events: QuestionRunEvent[];
    issues: QuestionRunReadIssue[];
  }> {
    const path = join(this.runDir(runId), EVENTS_FILE);
    let raw: string;
    try {
      raw = await fs.readFile(path, "utf8");
    } catch (error: unknown) {
      throw new QuestionRunStoreError(
        "corrupt-log",
        `Canonical event log for ${runId} is missing or unreadable; refusing to fabricate a run from its snapshot`,
        {
          runId,
          path,
          cause: (error as NodeJS.ErrnoException).code ?? "unknown",
        },
      );
    }

    const terminated = raw.endsWith("\n");
    const lines = raw.split("\n");
    if (terminated) lines.pop();

    const issues: QuestionRunReadIssue[] = [];
    const parsedEvents: QuestionRunEvent[] = [];
    const completeLines: string[] = [];
    let tornTail: string | undefined;

    for (const [index, line] of lines.entries()) {
      if (line.trim() === "") continue;
      const isLastLine = index === lines.length - 1;
      let parsed: QuestionRunEvent;
      try {
        parsed = JSON.parse(line) as QuestionRunEvent;
      } catch {
        if (isLastLine && !terminated) {
          // A crash during append: the record never completed, so it cannot
          // represent something a caller was ever told succeeded.
          tornTail = line;
          continue;
        }
        const quarantinedPath = await this.quarantineFile(
          runId,
          undefined,
          `${EVENTS_FILE}.line-${index + 1}`,
          line,
        );
        throw new QuestionRunStoreError(
          "corrupt-log",
          `Event log for ${runId} is unreadable at line ${index + 1}; the bytes ` +
            `were kept for diagnosis and the log was left untouched`,
          { runId, quarantinedPath },
        );
      }
      this.assertEventShape(parsed, runId);
      completeLines.push(line);
      parsedEvents.push(parsed);
    }

    if (tornTail !== undefined) {
      const quarantinedPath = await this.quarantineFile(
        runId,
        undefined,
        `${EVENTS_FILE}.torn-tail`,
        tornTail,
      );
      issues.push({
        code: "torn-trailing-line",
        message:
          `Dropped an incomplete trailing record from ${runId}; an interrupted ` +
          `append leaves the log one write behind, which is safe to replay`,
        quarantinedPath,
      });
      // Rewrite atomically rather than truncating in place, so a second crash
      // cannot leave the log worse off.
      await this.rewriteEventLog(runId, completeLines);
    }

    const seen = new Map<string, QuestionRunEvent>();
    const events: QuestionRunEvent[] = [];
    for (const event of parsedEvents) {
      const prior = seen.get(event.eventId);
      if (prior) {
        if (canonicalize(prior) !== canonicalize(event)) {
          throw new QuestionRunStoreError(
            "corrupt-log",
            `Event log for ${runId} reuses event id ${event.eventId} for different content`,
            { runId, eventId: event.eventId },
          );
        }
        // At-least-once delivery: replaying a retry must change nothing.
        issues.push({
          code: "duplicate-event-id",
          message: `Ignored duplicate event ${event.eventId} on ${runId}`,
        });
        continue;
      }
      seen.set(event.eventId, event);
      events.push(event);
    }

    if (events.length === 0) {
      throw new QuestionRunStoreError(
        "corrupt-log",
        `Canonical event log for ${runId} is empty; refusing to fabricate a run from its snapshot`,
        { runId, path },
      );
    }

    // Event order is part of the immutable log's evidence. Sorting would turn
    // a physically reordered file into a seemingly valid history and hide the
    // corruption from recovery.
    for (const [index, event] of events.entries()) {
      const expectedRevision = index + 1;
      if (event.revision !== expectedRevision) {
        throw new QuestionRunStoreError(
          "corrupt-log",
          `Event log for ${runId} has revision ${event.revision} where ${expectedRevision} was required`,
          { runId, expectedRevision, actualRevision: event.revision },
        );
      }
    }
    if (events[0].type !== "run-created") {
      throw new QuestionRunStoreError(
        "corrupt-log",
        `Event log for ${runId} must begin with run-created`,
        { runId },
      );
    }

    for (const event of events) {
      // Reading verifies versions too, so a record written by a newer harness
      // is rejected instead of being silently read as the current shape.
      if (event.type === "artifact-recorded") {
        assertArtifactIsValid(
          event.payload.artifactKind,
          event.payload.artifact,
        );
      }
      if (event.type === "human-review-recorded") {
        assertArtifactIsValid("human-review-event", event.payload.review);
        if (event.payload.review.runId !== runId) {
          throw new QuestionRunStoreError(
            "invalid-event",
            `Human review event belongs to ${event.payload.review.runId}, not ${runId}`,
            { runId, reviewRunId: event.payload.review.runId },
          );
        }
      }
    }

    return { events, issues };
  }

  private async rewriteEventLog(
    runId: string,
    lines: readonly string[],
  ): Promise<void> {
    const directory = this.runDir(runId);
    const temporary = join(directory, `${EVENTS_FILE}.${process.pid}.tmp`);
    await fs.writeFile(
      temporary,
      lines.length > 0 ? `${lines.join("\n")}\n` : "",
      "utf8",
    );
    await fs.rename(temporary, join(directory, EVENTS_FILE));
  }

  private assertEventShape(event: QuestionRunEvent, runId: string): void {
    const usable =
      isPlainObject(event) &&
      typeof event.eventId === "string" &&
      event.eventId.length > 0 &&
      event.runId === runId &&
      Number.isInteger(event.revision) &&
      event.revision > 0 &&
      typeof event.createdAt === "string" &&
      typeof event.type === "string" &&
      [
        "run-created",
        "run-status-changed",
        "stage-attempted",
        "check-recorded",
        "artifact-recorded",
        "history-recorded",
        "review-recorded",
        "rejection-recorded",
        "human-review-recorded",
      ].includes(event.type);
    if (!usable) {
      throw new QuestionRunStoreError(
        "invalid-event",
        `Event log for ${runId} contains a malformed event envelope`,
        { runId },
      );
    }
    this.assertEventPayloadIsValid(event as NewQuestionRunEvent, runId);
  }

  /**
   * Copy unreadable bytes under `corrupt/`. When `source` is supplied the
   * original is moved, so a caller that treats the file as a cache finds it
   * absent and rebuilds it.
   */
  private async quarantineFile(
    runId: string,
    source: string | undefined,
    label: string,
    content?: string,
  ): Promise<string> {
    const directory = join(this.runDir(runId), CORRUPT_DIR);
    await fs.mkdir(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[^0-9A-Za-z]/g, "-");
    const destination = join(directory, `${label}.${stamp}.txt`);
    if (source) {
      await fs.rename(source, destination);
    } else {
      await fs.writeFile(destination, content ?? "", "utf8");
    }
    return destination;
  }

  private async withRunLock<T>(
    runId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(runId) ?? Promise.resolve();
    const next = previous.then(
      () => this.withFilesystemLock(runId, action),
      () => this.withFilesystemLock(runId, action),
    );
    const chain = next.then(
      () => undefined,
      () => undefined,
    );
    this.locks.set(runId, chain);
    try {
      return await next;
    } finally {
      if (this.locks.get(runId) === chain) this.locks.delete(runId);
    }
  }

  private async withFilesystemLock<T>(
    runId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    this.assertSafeRunId(runId);
    const locksRoot = join(this.rootDir, LOCKS_DIR);
    const lockPath = join(locksRoot, `${runId}.lock`);
    await fs.mkdir(locksRoot, { recursive: true });

    for (;;) {
      try {
        await fs.mkdir(lockPath);
        break;
      } catch (error: unknown) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST") throw error;
        try {
          const stat = await fs.stat(lockPath);
          if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            await fs.rm(lockPath, { recursive: true, force: true });
            continue;
          }
        } catch (statError: unknown) {
          if ((statError as NodeJS.ErrnoException).code !== "ENOENT") {
            throw statError;
          }
        }
        await new Promise<void>((resolve) =>
          setTimeout(resolve, LOCK_RETRY_DELAY_MS),
        );
      }
    }

    try {
      return await action();
    } finally {
      await fs.rm(lockPath, { recursive: true, force: true });
    }
  }
}

function matchesFilter(run: QuestionRun, filter: QuestionRunFilter): boolean {
  if (filter.status !== undefined && run.status !== filter.status) return false;
  if (filter.mode !== undefined && run.request.mode !== filter.mode)
    return false;
  if (filter.paper !== undefined && run.request.paper !== filter.paper) {
    return false;
  }
  if (filter.level !== undefined && run.request.level !== filter.level) {
    return false;
  }
  if (
    filter.topic !== undefined &&
    !run.request.topics.includes(filter.topic)
  ) {
    return false;
  }
  return true;
}
