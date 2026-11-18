const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const {
  createOllamaPlanner,
} = require("../../lib/generation-harness/ollama-planner.ts");
const {
  runQuestionGraph,
} = require("../../lib/generation-harness/question-run-graph.ts");
const {
  JsonlQuestionRunStore,
} = require("../../lib/generation-harness/question-run-store.ts");
const {
  createMechanicsReplayAdapters,
  mechanicsReplayRequest,
} = require("../../lib/generation-harness/replay-fixtures.ts");
const {
  MECHANICS_QUESTION_PACKAGES,
} = require("../../lib/visuals/mechanics-question-packages.ts");

async function main() {
  const repository = path.resolve(__dirname, "../..");
  const pilotDirectory = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(repository, "dataset/_derived/pilot-dataset-v0.1");
  const pilot = JSON.parse(
    fs.readFileSync(path.join(pilotDirectory, "pilot-manifest.json"), "utf8"),
  );
  const splits = JSON.parse(
    fs.readFileSync(path.join(pilotDirectory, "split-manifest.json"), "utf8"),
  );
  if (pilot.inputFingerprint !== splits.inputFingerprint)
    throw new Error("Pilot and frozen split fingerprints disagree");
  const tagsResponse = await fetch("http://127.0.0.1:11434/api/tags", {
    signal: AbortSignal.timeout(5000),
  });
  if (!tagsResponse.ok)
    throw new Error("Local Ollama model inventory is unavailable");
  const tags = await tagsResponse.json();
  const model = tags.models?.find((item) => item.name === "qwen3:8b");
  if (!model?.digest)
    throw new Error("Installed qwen3:8b model revision is unavailable");
  const storeDirectory = path.join(
    repository,
    "data/private/local-planner-probe-runs",
  );
  const store = new JsonlQuestionRunStore(storeDirectory);
  const receipts = [];
  for (const item of [
    MECHANICS_QUESTION_PACKAGES[1],
    MECHANICS_QUESTION_PACKAGES[4],
  ]) {
    const membership = splits.questions.find(
      (row) => row.questionId === item.source.questionId,
    );
    if (membership?.split !== "train")
      throw new Error("A developed source is not in the frozen train split");
    const request = mechanicsReplayRequest(item.id);
    const replay = createMechanicsReplayAdapters(item.id);
    const modelCalls = [];
    const plan = createOllamaPlanner(
      [
        {
          scenarioKind: item.scenario.kind,
          visualFamilies: ["mechanics_scene"],
        },
      ],
      undefined,
      (receipt) => modelCalls.push(receipt),
    );
    const run = await runQuestionGraph(
      request,
      { ...replay, plan },
      { store, retryLimits: { plan: 2 } },
    );
    const recovered = await new JsonlQuestionRunStore(storeDirectory).resume(
      run.runId,
    );
    if (JSON.stringify(recovered) !== JSON.stringify(run))
      throw new Error("Live-planned run does not survive restart");
    receipts.push({
      paper: item.paper,
      sourceQuestionId: item.source.questionId,
      split: membership.split,
      runId: run.runId,
      status: run.status,
      rejection: run.rejection,
      modelCalls,
      stageAttempts: run.attempts,
      questionAuthor: "deterministic checked-package replay",
      originalSyntheticGeneration: false,
    });
  }
  const receipt = {
    checkedAt: new Date().toISOString(),
    pilotId: pilot.pilotId,
    model: model.name,
    modelDigest: model.digest,
    modelSizeBytes: model.size,
    contract: "question-blueprint/0.1.0",
    runs: receipts,
    passed: receipts.every((run) => run.status === "awaiting-human-review"),
    scope:
      "Two local live-planned source replays, one per paper. Physics, SVGs and package authoring remain deterministic. This is a connection test, not an untuned question-quality baseline.",
    runStoreDirectory: storeDirectory,
  };
  fs.writeFileSync(
    path.join(pilotDirectory, "local-planner-probe.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed: receipt.passed,
      model: model.name,
      runs: receipts.map(({ paper, status, modelCalls }) => ({
        paper,
        status,
        modelCalls: modelCalls.length,
      })),
      receipt: path.join(pilotDirectory, "local-planner-probe.json"),
    }),
  );
  if (!receipt.passed) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
