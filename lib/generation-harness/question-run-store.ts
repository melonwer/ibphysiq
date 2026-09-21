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

import { promises as fs } from "node:fs";
import { join } from "node:path";

import {
  ArtifactKind,
  checkArtifactSchemaVersion,
  validateArtifact,
} from "./contracts";
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

export type QuestionRunEvent =
  | RunCreatedEvent
  | RunStatusChangedEvent
  | StageAttemptedEvent
  | CheckRecordedEvent
  | ArtifactRecordedEvent
  | HistoryRecordedEvent
  | ReviewRecordedEvent
  | RejectionRecordedEvent;

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
  syncRun(
    run: QuestionRun,
    options?: AppendEventOptions,
  ): Promise<QuestionRun>;
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
export function withoutRevisionFields(run: QuestionRun): Record<string, unknown> {
  const { revision: _revision, updatedAt: _updatedAt, ...rest } = run;
  return rest;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertArtifactIsValid(artifactKind: ArtifactKind, artifact: unknown): void {
  const version = (artifact as { schemaVersion?: unknown } | undefined)
    ?.schemaVersion;
  const versionCheck = checkArtifactSchemaVersion(artifactKind, version);
  if (!versionCheck.supported) {
    throw new QuestionRunStoreError(
      "unsupported-schema-version",
      versionCheck.issue?.message ?? `${artifactKind} has an unsupported version`,
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

export class JsonlQuestionRunStore implements QuestionRunStore {
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly rootDir: string) {}

  async create(
    request: QuestionRunRequest,
    options: CreateQuestionRunOptions = {},
  ): Promise<QuestionRun> {
    const runId = options.runId ?? createQuestionRunId();
    return this.withRunLock(runId, () => this.createLocked(runId, request, options));
  }

  /**
   * Fast index read. A snapshot can only lag the log after an interrupted
   * write, which `resume` is responsible for repairing.
   */
  async fetch(runId: string): Promise<QuestionRun | undefined> {
    const snapshot = await this.readSnapshot(runId);
    if (snapshot) return snapshot.run;
    if (!(await this.exists(this.runDir(runId)))) return undefined;
    // No usable snapshot, but the run exists: recover it from the log.
    return (await this.inspect(runId)).run;
  }

  async resume(runId: string): Promise<QuestionRun> {
    return (await this.inspect(runId)).run;
  }

  /** Replay the log and repair a lagging snapshot. */
  async inspect(runId: string): Promise<QuestionRunInspection> {
    return this.withRunLock(runId, () => this.inspectLocked(runId));
  }

  async list(filter: QuestionRunFilter = {}): Promise<QuestionRun[]> {
    const runs = await this.readAllSnapshots();
    return runs.filter((run) => matchesFilter(run, filter));
  }

  async listReviewQueue(filter: QuestionRunFilter = {}): Promise<QuestionRun[]> {
    return this.list({ ...filter, status: "awaiting-human-review" });
  }

  async appendEvent(
    runId: string,
    event: NewQuestionRunEvent,
    options: AppendEventOptions = {},
  ): Promise<QuestionRun> {
    return this.withRunLock(runId, () =>
      this.appendEventLocked(runId, event, options),
    );
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
    const stored = withEnvelope(applyQuestionRunEvent(emptyQuestionRun(runId), event), event);
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
    const lastRevision = events.length > 0 ? events[events.length - 1].revision : 0;

    let baseline = emptyQuestionRun(runId);
    let pending = events;
    if (snapshot && snapshot.revision <= lastRevision) {
      // Only events past the snapshot are pending; replaying already-folded
      // events would duplicate history, checks, and reviews.
      baseline = snapshot.run;
      pending = events.filter((event) => event.revision > snapshot.revision);
    }
    const replayed = foldQuestionRunEvents(baseline, pending);

    if (!snapshot || snapshot.revision !== replayed.revision) {
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
    if (event.type === "artifact-recorded") {
      assertArtifactIsValid(event.payload.artifactKind, event.payload.artifact);
    }
    this.assertRevision(run, options.expectedRevision, runId);

    const eventId = options.eventId ?? this.nextEventId(run, event.type);
    const { events } = await this.readEventLog(runId);
    if (events.some((candidate) => candidate.eventId === eventId)) {
      // An idempotent retry: the caller's intent is already durable.
      return run;
    }

    const appended = {
      eventId,
      runId,
      revision: run.revision + 1,
      createdAt: options.createdAt ?? new Date().toISOString(),
      ...event,
    } as QuestionRunEvent;

    await this.appendEventLines(runId, [appended]);
    const stored = withEnvelope(applyQuestionRunEvent(run, appended), appended);
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

    // History and reviews are append-only, so only the entries past the stored
    // prefix can be new. A rewrite would mean the caller built a run from
    // different facts rather than from progress.
    this.assertAppendOnlyPrefix(
      stored.history,
      incoming.history,
      "history",
      incoming.runId,
    );
    this.assertAppendOnlyPrefix(
      stored.reviews,
      incoming.reviews,
      "reviews",
      incoming.runId,
    );

    const events: NewQuestionRunEvent[] = [];

    for (const entry of incoming.history.slice(stored.history.length)) {
      events.push({ type: "history-recorded", payload: { entry } });
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

    const statusChanged =
      incoming.status !== stored.status ||
      (incoming.currentStage ?? undefined) !==
        (stored.currentStage ?? undefined);
    if (statusChanged && incoming.rejection === undefined) {
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

    await this.appendEventLines(incoming.runId, appended);
    current = foldQuestionRunEvents(current, appended);
    await this.writeSnapshot(incoming.runId, current);

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
  private async readSnapshot(runId: string): Promise<StoredSnapshot | undefined> {
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
      const snapshot = await this.readSnapshot(entry);
      if (snapshot) runs.push(snapshot.run);
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
    } catch {
      return { events: [], issues: [] };
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

    const seen = new Set<string>();
    const events: QuestionRunEvent[] = [];
    for (const event of parsedEvents) {
      if (seen.has(event.eventId)) {
        // At-least-once delivery: replaying a retry must change nothing.
        issues.push({
          code: "duplicate-event-id",
          message: `Ignored duplicate event ${event.eventId} on ${runId}`,
        });
        continue;
      }
      seen.add(event.eventId);
      events.push(event);
    }

    events.sort((left, right) => left.revision - right.revision);

    for (const event of events) {
      if (event.type !== "artifact-recorded") continue;
      // Reading verifies versions too, so a record written by a newer harness
      // is rejected instead of being silently read as the current shape.
      assertArtifactIsValid(event.payload.artifactKind, event.payload.artifact);
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
      typeof event.type === "string";
    if (!usable) {
      throw new QuestionRunStoreError(
        "invalid-event",
        `Event log for ${runId} contains a malformed event envelope`,
        { runId },
      );
    }
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
    const next = previous.then(action, action);
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
}

function matchesFilter(run: QuestionRun, filter: QuestionRunFilter): boolean {
  if (filter.status !== undefined && run.status !== filter.status) return false;
  if (filter.mode !== undefined && run.request.mode !== filter.mode) return false;
  if (filter.paper !== undefined && run.request.paper !== filter.paper) {
    return false;
  }
  if (filter.level !== undefined && run.request.level !== filter.level) {
    return false;
  }
  if (filter.topic !== undefined && !run.request.topics.includes(filter.topic)) {
    return false;
  }
  return true;
}
