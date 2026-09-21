/**
 * The pilot human-review page.
 *
 * Everything here is server-rendered so the review boundary works without
 * JavaScript, and so no review payload is shipped to an unauthenticated client:
 * the run is only read after a session is established, on the server.
 *
 * The two state-changing paths are server actions. They re-derive the session
 * from the request cookies and verify the CSRF token that was rendered into the
 * form, so a cross-site form post cannot submit a decision even though it would
 * carry the session cookie.
 */

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type {
  HumanReviewConcern,
  HumanReviewEvent,
  HumanReviewOutcome,
} from "@/lib/generation-harness";
import {
  authenticateAdminToken,
  clearedSessionCookie,
  createSessionToken,
  readSessionFromRequest,
  reviewAuthConfigFromEnv,
  sessionCookie,
  verifyCsrf,
  verifyPreSessionRequest,
} from "@/lib/review/review-auth";
import {
  getReviewServiceOptions,
  requestLikeFromHeaders,
} from "@/lib/review/review-http";
import {
  listReviewQueue,
  readReviewRun,
  submitReviewDecision,
  type ReviewView,
} from "@/lib/review/review-service";

export const dynamic = "force-dynamic";

const CONCERNS: ReadonlyArray<{
  value: HumanReviewConcern;
  label: string;
  hint: string;
}> = [
  {
    value: "educational-acceptance",
    label: "Educational acceptance",
    hint: "Is the physics, wording, and mark scheme fit to be shown to a student?",
  },
  {
    value: "source-use-clearance",
    label: "Source-use clearance",
    hint: "May this run's provenance be used under the applicable source terms?",
  },
  {
    value: "training-metadata",
    label: "Training metadata",
    hint: "Are the topic, level, paper, skills, and difficulty metadata complete and correct?",
  },
  {
    value: "grouped-split",
    label: "Grouped split",
    hint: "Has this package been assigned to a split that keeps its source family together?",
  },
];

async function requestContext() {
  return requestLikeFromHeaders(await headers());
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ runId?: string; error?: string; recorded?: string }>;
}) {
  const params = await searchParams;

  let config;
  try {
    config = reviewAuthConfigFromEnv();
  } catch {
    return (
      <Shell title="Question review">
        <Notice tone="warn" title="The review boundary is not configured">
          Set <code className="font-mono">REVIEW_ADMIN_TOKEN</code> to enable
          human review. The boundary deliberately refuses to run with no admin
          token rather than falling back to an open door.
        </Notice>
      </Shell>
    );
  }

  const request = await requestContext();
  const session = readSessionFromRequest(request, config);

  if (!session) {
    return (
      <Shell title="Question review">
        {params.error ? (
          <Notice tone="warn" title="Sign-in failed">
            {params.error === "invalid"
              ? "That admin token was not accepted."
              : params.error}
          </Notice>
        ) : null}
        <section className="rounded border border-gray-200 bg-white p-6 max-w-md">
          <h2 className="text-lg font-semibold mb-1">Sign in to review</h2>
          <p className="text-sm text-gray-600 mb-4">
            Pilot admin-token login. Sessions are HTTP-only, Secure, SameSite
            Strict, and signed; they expire after{" "}
            {Math.round(config.sessionTtlMs / 3_600_000)} hours.
          </p>
          <form action={signIn} className="flex flex-col gap-3">
            <label className="text-sm font-medium" htmlFor="token">
              Admin token
            </label>
            <input
              id="token"
              name="token"
              type="password"
              autoComplete="current-password"
              required
              className="rounded border border-gray-300 px-3 py-2 font-mono text-sm"
            />
            <button
              type="submit"
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Sign in
            </button>
          </form>
        </section>
      </Shell>
    );
  }

  const options = getReviewServiceOptions();
  const queue = await listReviewQueue(request, options);
  const selected = params.runId
    ? await readReviewRun(request, params.runId, options)
    : undefined;

  return (
    <Shell
      title="Question review"
      reviewer={session.reviewerId}
      csrfToken={session.csrfToken}
    >
      {params.error ? (
        <Notice tone="warn" title="Decision not recorded">
          {params.error}
        </Notice>
      ) : null}
      {params.recorded ? (
        <Notice tone="ok" title="Decision recorded">
          Recorded a {params.recorded.replace(/-/g, " ")} decision. A recorded
          decision is not training readiness: every required clearance is
          checked separately below.
        </Notice>
      ) : null}

      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-2">
          Review work remaining ({queue.length})
        </h2>
        {queue.length === 0 ? (
          <p className="text-sm text-gray-600">
            No runs have outstanding human-review work.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
            {queue.map((run) => (
              <li key={run.runId}>
                <a
                  href={`/review?runId=${encodeURIComponent(run.runId)}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-gray-50"
                >
                  <span className="font-mono">{run.runId.slice(0, 8)}</span>
                  <span>Paper {run.request.paper}</span>
                  <span>{run.request.topics.join(", ")}</span>
                  <span className="text-gray-500">
                    rev {run.revision} · {run.updatedAt}
                  </span>
                  {run.questionPackage?.trainingBlockers.length ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                      {run.questionPackage.trainingBlockers.length} blockers
                    </span>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected ? (
        <RunDetail view={selected} csrfToken={session.csrfToken} />
      ) : (
        <p className="text-sm text-gray-600">
          Select a run above to review it.
        </p>
      )}
    </Shell>
  );
}

async function signIn(formData: FormData): Promise<void> {
  "use server";

  let failure: string | undefined;
  try {
    const config = reviewAuthConfigFromEnv();
    verifyPreSessionRequest(await requestContext());
    const session = authenticateAdminToken(
      String(formData.get("token") ?? ""),
      config,
    );
    if (!session) {
      failure = "invalid";
    } else {
      const cookie = sessionCookie(createSessionToken(session, config), config);
      (await cookies()).set(cookie.name, cookie.value, cookie.options);
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : "sign-in failed";
  }

  // Outside the try: redirect() signals by throwing, and catching it here would
  // swallow the navigation.
  redirect(
    failure ? `/review?error=${encodeURIComponent(failure)}` : "/review",
  );
}

async function signOut(formData: FormData): Promise<void> {
  "use server";

  let failure: string | undefined;
  try {
    const config = reviewAuthConfigFromEnv();
    const request = await requestContext();
    const session = readSessionFromRequest(request, config);
    if (!session) {
      failure = "An authenticated review session is required";
    } else {
      verifyCsrf(request, session, String(formData.get("csrfToken") ?? ""));
      const cookie = clearedSessionCookie();
      (await cookies()).set(cookie.name, cookie.value, cookie.options);
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : "sign-out failed";
  }

  redirect(
    failure ? `/review?error=${encodeURIComponent(failure)}` : "/review",
  );
}

async function decide(formData: FormData): Promise<void> {
  "use server";

  const runId = String(formData.get("runId") ?? "");
  const outcome = String(formData.get("outcome") ?? "") as HumanReviewOutcome;
  let failure: string | undefined;

  try {
    await submitReviewDecision(
      await requestContext(),
      runId,
      {
        concern: String(formData.get("concern") ?? "") as HumanReviewConcern,
        outcome,
        notes: String(formData.get("notes") ?? ""),
        decisionId: String(formData.get("decisionId") ?? "") || undefined,
        csrfToken: String(formData.get("csrfToken") ?? ""),
        reviewContext: String(formData.get("reviewContext") ?? ""),
      },
      getReviewServiceOptions(),
    );
  } catch (error) {
    failure = error instanceof Error ? error.message : "decision failed";
  }

  revalidatePath("/review");
  const target = `/review?runId=${encodeURIComponent(runId)}`;
  redirect(
    failure
      ? `${target}&error=${encodeURIComponent(failure)}`
      : `${target}&recorded=${encodeURIComponent(String(formData.get("concern")))}`,
  );
}

function Shell({
  title,
  reviewer,
  csrfToken,
  children,
}: {
  title: string;
  reviewer?: string;
  csrfToken?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b p-6">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-gray-600">
            Human decisions only. Nothing here promotes a package to training:
            it records one clearance at a time.
          </p>
        </div>
        {reviewer ? (
          <form action={signOut} className="text-right text-sm">
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <div className="mb-1 text-gray-600">
              Reviewer: <span className="font-mono">{reviewer}</span>
            </div>
            <button type="submit" className="underline">
              Sign out
            </button>
          </form>
        ) : null}
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "warn" | "ok";
  title: string;
  children: React.ReactNode;
}) {
  const classes =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-emerald-300 bg-emerald-50 text-emerald-900";
  return (
    <div className={`mb-6 rounded border p-4 text-sm ${classes}`}>
      <div className="font-semibold mb-1">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded bg-gray-50 p-3 text-xs">
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

function ReviewEvent({ event }: { event: HumanReviewEvent }) {
  const tone =
    event.outcome === "accept"
      ? "text-emerald-700"
      : event.outcome === "reject"
        ? "text-red-700"
        : "text-amber-700";
  return (
    <li className="py-1 text-sm">
      <span className="font-mono text-xs">{event.createdAt}</span>{" "}
      <span className="font-medium">{event.concern}</span>{" "}
      <span className={tone}>{event.outcome}</span>{" "}
      <span className="text-gray-600">by {event.reviewerId}</span>
      {event.notes ? (
        <div className="text-gray-700">“{event.notes}”</div>
      ) : null}
      <div className="font-mono text-xs text-gray-400">
        decision {event.decisionId}
      </div>
      <div className="font-mono text-xs text-gray-400">
        reviewed rev {event.reviewedRevision} · package{" "}
        {event.reviewedContentFingerprint}
      </div>
    </li>
  );
}

function RunDetail({
  view,
  csrfToken,
}: {
  view: ReviewView;
  csrfToken: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Run">
        <dl className="grid grid-cols-2 gap-x-6 md:grid-cols-4">
          <Field label="Run ID">
            <span className="font-mono">{view.runId}</span>
          </Field>
          <Field label="Status">{view.status}</Field>
          <Field label="Stage">{view.currentStage ?? "—"}</Field>
          <Field label="Revision">{view.revision}</Field>
        </dl>
      </Panel>

      <Panel title="Generation request">
        <Json value={view.request} />
      </Panel>

      <Panel title="Blueprint">
        <Json value={view.blueprint} />
      </Panel>

      {view.question ? (
        <Panel title="Question">
          <div className="mb-2 flex flex-wrap gap-x-4 text-xs text-gray-600">
            <span>{view.question.kind}</span>
            <span>{view.question.marks} marks</span>
            <span>Paper {view.request.paper}</span>
          </div>
          <p className="mb-3 whitespace-pre-wrap text-sm">
            {view.question.stem}
          </p>
          {view.question.options.length > 0 ? (
            <ol className="mb-2 list-decimal pl-6 text-sm">
              {view.question.options.map((option) => (
                <li key={option.id}>
                  <span className="font-mono text-xs">{option.id}</span>{" "}
                  {option.text}
                </li>
              ))}
            </ol>
          ) : null}
          {view.question.parts.length > 0 ? (
            <ol className="list-decimal pl-6 text-sm">
              {view.question.parts.map((part) => (
                <li key={part.partId} className="mb-1">
                  {part.prompt}{" "}
                  <span className="text-xs text-gray-500">[{part.marks}]</span>
                </li>
              ))}
            </ol>
          ) : null}
        </Panel>
      ) : (
        <Notice tone="warn" title="Package not resolved">
          This run references package{" "}
          <span className="font-mono">
            {view.packageSummary?.packageId ?? "(none)"}
          </span>
          , which is not present in the checked package registry, so the
          question, solution, and visual could not be shown. Treat the run as
          unverifiable until that is resolved.
        </Notice>
      )}

      <Panel title="Rendered visuals">
        {view.renderedVisuals.length === 0 ? (
          <p className="text-sm text-gray-600">
            No visual is declared for this package. Recorded visual artifacts:{" "}
            {view.visualArtifacts.length}.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {view.renderedVisuals.map((visual) =>
              visual.svg ? (
                <div key={visual.id}>
                  <div className="mb-1 font-mono text-xs text-gray-500">
                    {visual.id} · {visual.family}
                  </div>
                  {/*
                    The markup is produced by this repository's own renderers,
                    which escape every text field, over a stored visual spec.
                  */}
                  <div
                    className="overflow-auto rounded border border-gray-200"
                    dangerouslySetInnerHTML={{ __html: visual.svg }}
                  />
                </div>
              ) : (
                <Notice
                  key={visual.id}
                  tone="warn"
                  title={`Visual ${visual.id} did not render`}
                >
                  {visual.error}
                </Notice>
              ),
            )}
            <div className="text-xs text-gray-500">
              Recorded artifacts:{" "}
              {view.visualArtifacts
                .map(
                  (artifact) =>
                    `${artifact.artifactId} (${artifact.byteLength}B)`,
                )
                .join(", ") || "none"}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Verified results">
        <Json value={view.verifiedResults} />
        <p className="mt-2 text-xs text-gray-500">
          {view.verifiedResults?.sourceBacked
            ? "Deterministic results came from a source-backed replay."
            : "Deterministic results were computed from the scenario, not replayed from a source."}
        </p>
      </Panel>

      <Panel title="Worked solution and marking points">
        {view.solution ? (
          <div className="flex flex-col gap-2">
            {view.solution.correctOptionId ? (
              <p className="text-sm">
                Correct option:{" "}
                <span className="font-mono">
                  {view.solution.correctOptionId}
                </span>
              </p>
            ) : null}
            {view.solution.parts.map((part) => (
              <div key={part.partId} className="text-sm">
                <div className="font-medium">
                  {part.partId}{" "}
                  <span className="text-xs text-gray-500">[{part.marks}]</span>
                </div>
                {part.working.length > 0 ? (
                  <ol className="list-decimal pl-6 text-gray-700">
                    {part.working.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ol>
                ) : null}
                <ul className="list-disc pl-6 text-gray-700">
                  {part.markingPoints.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
                {part.finalAnswer ? (
                  <div className="text-gray-900">→ {part.finalAnswer}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600">Not available.</p>
        )}
        {view.assumptions.length > 0 ? (
          <div className="mt-3 text-xs text-gray-600">
            <div className="font-medium uppercase tracking-wide">
              Assumptions
            </div>
            <ul className="list-disc pl-6">
              {view.assumptions.map((assumption, index) => (
                <li key={index}>{assumption}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      <Panel title="Automated checks">
        {view.checks.length === 0 ? (
          <p className="text-sm text-gray-600">No checks recorded.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-gray-500">
              <tr>
                <th className="py-1">Stage</th>
                <th className="py-1">Id</th>
                <th className="py-1">Outcome</th>
                <th className="py-1">Detail</th>
              </tr>
            </thead>
            <tbody>
              {view.checks.map((check) => (
                <tr key={check.id} className="border-t border-gray-100">
                  <td className="py-1 font-mono text-xs">{check.stage}</td>
                  <td className="py-1 font-mono text-xs">{check.id}</td>
                  <td
                    className={`py-1 ${
                      check.outcome === "passed"
                        ? "text-emerald-700"
                        : check.outcome === "failed"
                          ? "text-red-700"
                          : "text-amber-700"
                    }`}
                  >
                    {check.outcome}
                  </td>
                  <td className="py-1 text-gray-600">{check.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Rejection history">
        <Json value={view.rejectionHistory} />
        {view.rejection ? <Json value={view.rejection} /> : null}
      </Panel>

      <Panel title="Novelty evidence">
        <Json value={view.novelty} />
      </Panel>

      <Panel title="Agent review">
        <Json value={view.agentReview} />
        <p className="mt-2 text-xs text-gray-500">
          An agent review can only pass, flag, or reject. It never clears a
          package and never publishes one.
        </p>
      </Panel>

      <Panel title="Provenance and source restrictions">
        <Json value={view.provenance} />
      </Panel>

      <Panel title="Human review history">
        {view.humanReviews.length === 0 ? (
          <p className="text-sm text-gray-600">
            No human decision has been recorded for this run.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {view.humanReviews.map((event) => (
              <ReviewEvent key={event.decisionId} event={event} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Training readiness">
        <p className="mb-2 text-sm">
          {view.readiness.ready
            ? "Training-ready."
            : "Not training-ready. Outstanding:"}
        </p>
        {view.readiness.blockers.length > 0 ? (
          <ul className="list-disc pl-6 text-sm text-gray-700">
            {view.readiness.blockers.map((blocker, index) => (
              <li key={index}>{blocker}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-2 text-xs text-gray-500">
          Decisions tied to an older package fingerprint are stale and must be
          repeated after repair.
        </p>
      </Panel>

      <Panel title="Record a decision">
        <p className="mb-3 text-sm text-gray-600">
          Each clearance is recorded separately and is idempotent: submitting
          the same decision twice resolves to the single recorded event.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {CONCERNS.map((concern) => {
            const recorded = view.decisions[concern.value];
            return (
              <form
                key={concern.value}
                action={decide}
                className="rounded border border-gray-200 p-3"
              >
                <input type="hidden" name="runId" value={view.runId} />
                <input type="hidden" name="concern" value={concern.value} />
                <input type="hidden" name="csrfToken" value={csrfToken} />
                <input
                  type="hidden"
                  name="reviewContext"
                  value={view.observedReviewContext ?? ""}
                />
                <div className="text-sm font-medium">{concern.label}</div>
                <p className="mb-2 text-xs text-gray-600">{concern.hint}</p>
                {recorded ? (
                  <p className="mb-2 text-xs text-gray-500">
                    Last recorded: {recorded.outcome} at {recorded.createdAt}
                  </p>
                ) : null}
                <select
                  name="outcome"
                  className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  defaultValue={recorded?.outcome ?? "accept"}
                >
                  <option value="accept">accept</option>
                  <option value="reject">reject</option>
                  <option value="send-back-for-repair">
                    send back for repair
                  </option>
                </select>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Notes (required when rejecting or sending back)"
                  className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  defaultValue={recorded?.notes ?? ""}
                />
                <button
                  type="submit"
                  className="rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white"
                >
                  Record {concern.label.toLowerCase()}
                </button>
              </form>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
