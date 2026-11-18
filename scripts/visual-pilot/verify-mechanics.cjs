const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    filename,
  );
};
const repository = path.resolve(__dirname, "../..");
const sourceRoot = process.argv[2] ? path.resolve(process.argv[2]) : repository;
const {
  MECHANICS_QUESTION_PACKAGES,
} = require("../../lib/visuals/mechanics-question-packages.ts");
const {
  mechanicsReplayRequest,
} = require("../../lib/generation-harness/replay-fixtures.ts");
const {
  JsonlQuestionRunStore,
} = require("../../lib/generation-harness/question-run-store.ts");
const {
  authenticateAdminToken,
  createSessionToken,
  REVIEW_SESSION_COOKIE,
} = require("../../lib/review/review-auth.ts");
const {
  readReviewRun,
  submitReviewDecision,
} = require("../../lib/review/review-service.ts");
async function main() {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "mechanics-generation-check-"),
  );
  const output = path.join(temporary, "pilot");
  const root = path.join(temporary, "store");
  const generate = () =>
    execFileSync(
      process.execPath,
      [
        path.join(__dirname, "generate-mechanics.cjs"),
        "--source-root",
        sourceRoot,
        "--output",
        output,
        "--run-store",
        root,
      ],
      { cwd: repository, encoding: "utf8" },
    );
  try {
    generate();
    const manifest = JSON.parse(
      fs.readFileSync(path.join(output, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.packageCount, 8);
    const store = new JsonlQuestionRunStore(root);
    const initial = await store.list();
    assert.equal(initial.length, 8);
    const interruptedId = manifest.packages[0].runId;
    const capture = path.join(temporary, "interrupted-record-backup");
    fs.renameSync(path.join(root, "runs", interruptedId), capture);
    await store.create(
      mechanicsReplayRequest(MECHANICS_QUESTION_PACKAGES[0].id),
      { runId: interruptedId },
    );
    generate();
    const recovered = await store.resume(interruptedId);
    assert.equal(recovered.status, "awaiting-human-review");
    assert.equal(
      recovered.questionPackage.packageId,
      MECHANICS_QUESTION_PACKAGES[0].id,
    );
    const authConfig = {
      adminToken: "isolated-verification-admin-token",
      sessionSecret: "isolated-verification-session-secret",
      sessionTtlMs: 60000,
      now: () => Date.now(),
    };
    const session = authenticateAdminToken(authConfig.adminToken, authConfig);
    assert.ok(session);
    const token = createSessionToken(session, authConfig);
    const request = {
      headers: {
        get: (name) =>
          name.toLowerCase() === "cookie"
            ? `${REVIEW_SESSION_COOKIE}=${token}`
            : name.toLowerCase() === "x-review-csrf"
              ? session.csrfToken
              : null,
      },
    };
    const options = {
      store: new JsonlQuestionRunStore(root, authConfig.sessionSecret),
      authConfig,
    };
    const view = await readReviewRun(request, interruptedId, options);
    const decision = await submitReviewDecision(
      request,
      interruptedId,
      {
        concern: "educational-acceptance",
        outcome: "accept",
        notes: "Isolated verification record; does not approve the real pilot.",
        reviewContext: view.observedReviewContext,
      },
      options,
    );
    assert.equal(decision.run.status, "accepted");
    assert.equal(decision.readiness.ready, false);
    const before = await Promise.all(
      (await store.list()).map((run) => store.resume(run.runId)),
    );
    generate();
    const after = await Promise.all(
      (await store.list()).map((run) => store.resume(run.runId)),
    );
    assert.equal(after.length, 8);
    assert.deepEqual(after, before);
    assert.ok(
      fs
        .readdirSync(temporary)
        .some((name) => name.startsWith("pilot.backup-")),
    );
    const parsed = execFileSync(
      "python",
      [
        "-c",
        "import pathlib,sys,xml.etree.ElementTree as E; files=list(pathlib.Path(sys.argv[1]).glob('*.svg')); [E.parse(f) for f in files]; print(len(files))",
        output,
      ],
      { encoding: "utf8" },
    ).trim();
    assert.equal(Number(parsed), 8);
    console.log(
      JSON.stringify({
        packages: 8,
        interruptedRunRecovered: true,
        rerunDuplicates: 0,
        reviewHistoryPreserved: true,
        backupsPreserved: true,
        studentSvgsParsed: 8,
      }),
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
