const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: filename,
    }).outputText,
    filename,
  );
const {
  CHECKED_SOURCE_PACKAGES,
  parseAuthoredContent,
  parseModelAuthoredPackage,
} = require("../../lib/generation-harness/ollama-author.ts");
const {
  packageContentFingerprint,
} = require("../../lib/generation-harness/replay-fixtures.ts");
const {
  JsonlQuestionRunStore,
} = require("../../lib/generation-harness/question-run-store.ts");
const { buildReviewView } = require("../../lib/review/review-service.ts");
const {
  authoredPackageResolver,
} = require("../../lib/review/authored-package-resolver.ts");
const {
  evaluateTrainingReadiness,
} = require("../../lib/generation-harness/human-review.ts");
const output = path.resolve(
  process.argv[2] ?? "dataset/_derived/qwen-author-baseline-v0.1",
);
const pilot = path.resolve(
  process.argv[3] ?? "dataset/_derived/pilot-dataset-v0.1",
);
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha = (body) => crypto.createHash("sha256").update(body).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
function hashes(directory) {
  const rows = {};
  for (const name of fs.readdirSync(directory, { recursive: true })) {
    const file = path.join(directory, name);
    if (fs.statSync(file).isFile()) rows[name] = sha(fs.readFileSync(file));
  }
  return rows;
}
async function main() {
  const results = readJson(path.join(output, "results.json"));
  const contract = readJson(path.join(output, "experiment-contract.json"));
  const splits = readJson(path.join(pilot, "split-manifest.json"));
  assert(
    sha(fs.readFileSync(path.join(pilot, "split-manifest.json"))) ===
      contract.splitSha256,
    "Frozen split changed",
  );
  assert(
    results.entries.length === 20 && results.completedRequests === 20,
    "Expected 20 finished outcomes",
  );
  assert(
    new Set(results.entries.map((item) => item.sourcePackageId)).size === 20,
    "Source packages repeat",
  );
  const store = new JsonlQuestionRunStore(path.join(output, "runs"));
  const resolver = authoredPackageResolver(path.join(output, "packages"));
  let candidateCount = 0,
    rejectionCount = 0,
    totalTokens = 0;
  const sourceKinds = new Set();
  for (const entry of results.entries) {
    const base = CHECKED_SOURCE_PACKAGES.find(
      (item) => item.id === entry.sourcePackageId,
    );
    assert(base, "Unknown checked source");
    sourceKinds.add(base.scenario.kind);
    const identity = contract.sourcePackageFingerprints.find(
      (item) => item.id === base.id,
    );
    assert(
      identity.fingerprint === packageContentFingerprint(base),
      "Parent package changed",
    );
    const membership = splits.questions.find(
      (item) => item.questionId === base.source.questionId,
    );
    assert(
      membership?.split === "train" && membership.groupId === entry.groupId,
      "Descendant split disagrees with source group",
    );
    const run = await store.resume(entry.runId);
    assert(run.status === entry.status, "Run and report status disagree");
    assert(
      !evaluateTrainingReadiness(run).ready && run.humanReviews.length === 0,
      "Experiment silently accepted a package",
    );
    assert(
      run.attempts.plan === 1 && run.attempts.author === 1,
      "Expected exactly one attempt per model stage",
    );
    const receipts = readJson(
      path.join(output, "responses", `${entry.candidateId}-receipts.json`),
    );
    assert(
      receipts.length === 2 &&
        receipts.every(
          (item) =>
            item.model === contract.model && item.thinkingEnabled === false,
        ),
      "Model receipt mismatch",
    );
    totalTokens += receipts.reduce(
      (total, item) => total + item.outputTokens,
      0,
    );
    for (const stage of ["plan", "author"]) {
      const request = readJson(
        path.join(output, "requests", `${entry.candidateId}-${stage}.json`),
      );
      assert(
        request.model === contract.model &&
          request.think === false &&
          request.options.seed === 42 &&
          request.options.temperature === 0,
        "Actual model controls differ from contract",
      );
      assert(
        fs.existsSync(
          path.join(output, "responses", `${entry.candidateId}-${stage}.txt`),
        ),
        "Raw output missing",
      );
    }
    for (const figure of entry.figures)
      assert(
        sha(fs.readFileSync(path.join(output, figure.path))) === figure.sha256,
        "Student SVG changed",
      );
    if (entry.status === "awaiting-human-review") {
      const candidate = parseModelAuthoredPackage(
        readJson(path.join(output, "packages", `${entry.candidateId}.json`)),
      );
      assert(
        run.questionPackage.contentFingerprint ===
          packageContentFingerprint(candidate),
        "Run content fingerprint mismatch",
      );
      assert(
        run.questionPackage.kind === "model-authored-question-package",
        "Source package substituted for model output",
      );
      const view = buildReviewView(run, resolver);
      assert(
        view.packageResolved && view.question.stem === candidate.question.stem,
        "Review does not show model-written content",
      );
      assert(
        view.renderedVisuals.length === entry.figures.length &&
          view.renderedVisuals.every((item) => item.svg),
        "Review does not show all student figures",
      );
      candidateCount++;
    } else {
      assert(
        entry.status === "rejected" &&
          run.currentStage === "author" &&
          run.rejection.stage === "author",
        "Rejected output missing failing-stage evidence",
      );
      const raw = readJson(
        path.join(output, "responses", `${entry.candidateId}-author.txt`),
      );
      let failed = false;
      try {
        parseAuthoredContent(base, raw);
      } catch {
        failed = true;
      }
      assert(
        failed,
        "Rejected raw output no longer reproduces boundary failure",
      );
      rejectionCount++;
    }
  }
  for (const family of [
    "cartesian_plot",
    "circuit_network",
    "field_map",
    "mechanics_scene",
  ])
    assert(
      results.entries.filter((item) => item.family === family).length === 5,
      "Family allocation differs from contract",
    );
  assert(
    fs.readdirSync(path.join(output, "requests")).length === 40,
    "Model-call count differs from 40",
  );
  const before = {
    requests: hashes(path.join(output, "requests")),
    responses: hashes(path.join(output, "responses")),
    runs: hashes(path.join(output, "runs")),
  };
  const pagePath = path.join(output, "index.html");
  const savedPage = fs.readFileSync(pagePath);
  let child;
  try {
    child = require("node:child_process").execFileSync(
      process.execPath,
      [path.join(__dirname, "run-author-baseline.cjs"), pilot, output],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
  } finally {
    fs.writeFileSync(pagePath, savedPage);
  }
  const after = {
    requests: hashes(path.join(output, "requests")),
    responses: hashes(path.join(output, "responses")),
    runs: hashes(path.join(output, "runs")),
  };
  assert(
    JSON.stringify(before) === JSON.stringify(after),
    "Completed restart altered model evidence or canonical runs",
  );
  assert(child.includes('"completed":20'), "Completed restart did not finish");
  const receipt = {
    checkedAt: new Date().toISOString(),
    passed: true,
    experimentId: contract.experimentId,
    requests: 20,
    distinctScenarios: sourceKinds.size,
    modelCalls: 40,
    outputTokens: totalTokens,
    awaitingHumanReview: candidateCount,
    rejected: rejectionCount,
    allParentsTrain: true,
    allRawInputsAndRepliesPreserved: true,
    nativeReviewResolvesAllCandidatesAndFigures: true,
    allCandidatesTrainingBlocked: true,
    completedRestartWithoutModelCalls: true,
    rejectedOutputsReproduceTheirFailure: true,
  };
  fs.writeFileSync(
    path.join(output, "verification.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(JSON.stringify(receipt));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
