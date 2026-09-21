# Question Generation Harness

`QuestionRun v0.1` is the first safe execution slice for the V2 question
pipeline. It lives beside the legacy generation orchestrator; it does not route
production requests through the new path yet.

The harness uses the maintained LangGraph line and therefore raises the project
runtime floor from Node.js 18 (end-of-life) to Node.js 20.

## Boundary

The canonical `QuestionRun` record is plain, JSON-safe TypeScript and does not
depend on LangGraph. LangGraph only executes the stages:

1. plan a `QuestionBlueprint`;
2. validate the blueprint;
3. solve the physics and render student-facing visuals;
4. author a question-package artifact;
5. validate question, answer, source, and visual agreement;
6. assess novelty;
7. prepare a human-review envelope.

Each stage records attempts, checks, timestamps, and rejection reasons. Retry
limits are explicit and capped at five. A retryable failure that exhausts its
budget becomes `retry-budget-exhausted`; a non-retryable failure stops the graph
immediately.

## Contracts and versioning

Every artifact the harness reads or writes has one schema definition in
`contracts.ts`, from which both runtime validation and the JSON Schema used for
constrained decoding are derived (`schema.ts`). Deriving both from one
definition is the point: if they could drift, a model could satisfy the schema
it was decoded against while still producing a record the harness rejects.

The repository has no direct schema dependency, so this toolkit is hand-rolled
rather than reaching into a transitive one.

Artifacts carry an explicit `schemaVersion`, and each kind declares the versions
it accepts. An unrecognised version is rejected with
`unsupported-schema-version` instead of being read as if it had the current
shape. Versioned migrations are deliberately absent until a second version
exists; there is nothing truthful to migrate yet.

`toJsonSchema` and the runtime validator agree by construction, and a test
asserts the agreement structurally so the two cannot quietly diverge.

## Persistence

`JsonlQuestionRunStore` keeps one directory per run:

```
<root>/runs/<runId>/events.jsonl   append-only, immutable event log
<root>/runs/<runId>/snapshot.json  materialised index entry
<root>/runs/<runId>/corrupt/       quarantined bytes, kept for diagnosis
```

The event log is the source of truth and the snapshot is a cache of folding it.
Every event is made durable *before* the snapshot that summarises it, so a
snapshot can only ever lag the log, never lead it. `fetch` is the fast index
read; `resume`/`inspect` replay the missing tail and repair the snapshot.

Recovery guarantees, each covered by a test:

- **Interrupted append** — a crash can only leave an incomplete trailing line.
  That record never completed, so it is dropped, the bytes are copied under
  `corrupt/`, and the log is rewritten atomically. The run is exactly as it was.
- **Unreadable snapshot** — treated as a cache miss rather than a failure: the
  snapshot is moved aside and rebuilt from the log.
- **Unreadable middle of the log** — the bytes are quarantined and the read
  fails loudly, because a mid-log gap may mean real data loss. The log is left
  untouched for inspection.
- **Duplicate events** — at-least-once delivery is expected, so a repeated
  `eventId` is ignored instead of applied twice.
- **Concurrent writers** — `appendEvent` accepts an `expectedRevision`
  compare-and-swap guard, so a writer holding a stale revision is rejected with
  `stale-revision` instead of overwriting the other writer's update.
- **Process restart** — a fresh store instance over the same directory
  reconstructs the identical record.

`syncRun` diffs an in-memory run against the stored one and appends only what is
missing, which is what lets the graph persist after each stage without writing
anything twice. It verifies that replaying what it wrote reproduces the record
it was given, so a diff bug cannot leave the stored run silently disagreeing
with the returned one.

Run IDs are RFC 4122 UUIDs. The previous timestamp-plus-random scheme was
collision-prone once runs could be created concurrently and leaked creation
order into the identifier.

`QuestionRun` remains the canonical record. An optional LangGraph checkpointer
tracks execution position so an interrupted run can resume; it is never the
source of truth for what happened.

## Acceptance policy

Automated stages may pass, flag, skip, retry, or reject. They cannot accept.
Agent review decisions are restricted to `pass`, `flag`, or `reject`. A
successful graph run stops at `awaiting-human-review`. Version 0.1 deliberately
exports no acceptance function: promotion will require a later authenticated,
persistent human-review service boundary.

Human acceptance still does not make a package training-ready. Source-use
rights, training metadata, and grouped split assignment remain independent
blockers.

## Current deterministic replay

The v0.1 adapters make no model calls. They replay one checked circuit package
and one checked field package by rerunning their deterministic solver,
rerendering their SVG, and invoking the existing package validator. Novelty is
recorded as `not-run` because source replay tests execution integrity rather
than originality. Independent agent review is likewise recorded as `not-run`.

This slice proves the orchestration, persistence, and audit contract before live
planner, author, novelty-ledger, Gemini-review, human-review, or batch-generation
adapters are added. There is still no acceptance function, and stored runs are
not training-ready.
