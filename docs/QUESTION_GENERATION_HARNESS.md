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
Every event is made durable _before_ the snapshot that summarises it, so a
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
successful graph run stops at `awaiting-human-review` and stays there until an
authenticated reviewer records a decision. The harness itself still exports no
acceptance function: acceptance is produced by the review service below, and
only from a verified session.

Human acceptance still does not make a package training-ready. Source-use
rights, training metadata, and grouped split assignment remain independent
blockers.

## Human review boundary

The review service in `lib/review/` is the only path by which a run can leave
`awaiting-human-review`.

Each decision is one of four concerns, recorded independently:

| Concern                  | Question it answers                                                       |
| ------------------------ | ------------------------------------------------------------------------- |
| `educational-acceptance` | Is the physics, wording, and mark scheme fit to show a student?           |
| `source-use-clearance`   | May this run's provenance be used under its source terms?                 |
| `training-metadata`      | Are the topic, level, paper, skills, and difficulty correct?              |
| `grouped-split`          | Is the package assigned to a split that keeps its source family together? |

They are separate on purpose. Collapsing them into one "approve" action would
let a reviewer who is only judging question quality silently grant source-use
rights or place a package into a data split. Only `educational-acceptance` moves
the run's status; the other three are recorded facts about the package.

Decisions are immutable `HumanReviewEvent`s. A change of mind is a new event,
not an edit. Each carries a `decisionId`, so re-submitting the same decision is
a no-op rather than a second event, which is what makes a retrying client or a
double-clicked form safe.

Each `human-review-event/0.2.0` also records the canonical run revision and
question-package content fingerprint that the reviewer saw. If repair changes
that fingerprint, prior clearances are shown as stale blockers and cannot make
the repaired package training-ready. Version 0.1 review events are deliberately
unsupported rather than silently reinterpreted.

`evaluateTrainingReadiness` recomputes readiness from all four concerns every
time. A record is ready only when the run has a package and every concern has an
unqualified acceptance. `assertStatusIsEvidenced` enforces the other direction:
the store refuses to persist a run whose status claims acceptance it cannot
evidence, so `accepted` is unreachable by any path that does not include a
recorded human decision.

### Authentication and CSRF

The application has no auth provider, so the pilot is a documented admin-token
boundary rather than a pretence of one:

- `REVIEW_ADMIN_TOKEN` is compared with `timingSafeEqual` over fixed-width
  HMAC digests, so neither the value nor its length leaks through timing, and
  the failure path costs the same as the success path.
- The session is an HMAC-signed, HTTP-only, `Secure`, `SameSite=Strict` cookie
  carrying the reviewer identity and a CSRF token. Nothing script-readable holds
  either secret.
- State-changing requests must present the CSRF token from the session and,
  when a browser supplies one, an `Origin` matching the request `Host`.
- With no admin token configured the boundary returns 503 and refuses to run,
  rather than falling back to an open door.

### API and page

```
POST   /api/review/session              exchange the admin token for a session
DELETE /api/review/session              sign out
GET    /api/review/queue                runs awaiting a human decision
GET    /api/review/runs/:runId          full review payload
POST   /api/review/runs/:runId/decisions record one decision
```

`/review` is a server-rendered page over the same service. Every payload is read
on the server after the session is established, so model output and marking
points are never sent to an unauthenticated client. It shows the request, the
blueprint, the question and all subparts or options, the rendered visuals, the
verified results, the worked solution and marking points, every automated
check, the rejection history, novelty evidence, the agent-review verdict,
provenance and declared source restrictions, and the full human-review history
with the outstanding training blockers. It works without JavaScript; decisions
are submitted through server actions that re-derive the session and verify the
CSRF token rendered into the form.

The review worklist intentionally retains an educationally accepted run until
source-use clearance, training metadata, and grouped-split assignment are also
accepted. A human acceptance is therefore visible as incomplete review work,
not mislabeled as training readiness. Rejected runs remain auditable by ID but
are terminal and leave the worklist; sent-back runs remain visible for repair
follow-up.

### Stated pilot limitations

- **One shared identity.** Every reviewer is recorded as `pilot-admin`. Real
  per-reviewer attribution needs an identity provider.
- **No login throttling.** The boundary depends on the admin token being a long
  random secret.
- **No individual session revocation.** There is no server-side session store; a
  reissued admin token invalidates all outstanding sessions at once.

Replacing this with a real provider is a Phase 12 concern. The service depends
only on the `ReviewSession` shape, so the swap is contained.

## Current deterministic replay

The v0.1 adapters make no model calls. They replay one checked circuit package
and one checked field package by rerunning their deterministic solver,
rerendering their SVG, and invoking the existing package validator. Novelty is
recorded as `not-run` because source replay tests execution integrity rather
than originality. Independent agent review is likewise recorded as `not-run`.

This slice proves the orchestration, persistence, audit, and human-review
contract before live planner, author, novelty-ledger, Gemini-review, or
batch-generation adapters are added. Replayed runs are recorded as blocked, and
nothing here makes them training-ready.
