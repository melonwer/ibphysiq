const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
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
  MECHANICS_SOURCE_FIXTURES,
} = require("../../lib/visuals/mechanics-source-fixtures.ts");
const {
  MECHANICS_QUESTION_PACKAGES,
  validateMechanicsQuestionPackage,
  renderMechanicsSolutionVisuals,
} = require("../../lib/visuals/mechanics-question-packages.ts");
const {
  renderMechanicsScene,
} = require("../../lib/visuals/render-mechanics.ts");
const {
  mechanicsReplayRequest,
  createMechanicsReplayAdapters,
  packageContentFingerprint,
} = require("../../lib/generation-harness/replay-fixtures.ts");
const {
  runQuestionGraph,
} = require("../../lib/generation-harness/question-run-graph.ts");
const {
  JsonlQuestionRunStore,
} = require("../../lib/generation-harness/question-run-store.ts");

const repository = path.resolve(__dirname, "../..");
const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index],
    value = process.argv[index + 1];
  if (!["--source-root", "--output", "--run-store"].includes(key) || !value)
    throw new Error(
      "Usage: node scripts/visual-pilot/generate-mechanics.cjs [--source-root REPOSITORY] [--output DIRECTORY] [--run-store DIRECTORY]",
    );
  argumentsMap.set(key, path.resolve(value));
}
const sourceRoot = argumentsMap.get("--source-root") ?? repository;
const outputDirectory =
  argumentsMap.get("--output") ??
  path.join(repository, "dataset/_derived/mechanics-pilot-v0.1");
const runStoreDirectory =
  argumentsMap.get("--run-store") ??
  path.resolve(
    process.env.REVIEW_RUN_STORE_DIR ??
      path.join(repository, "data/question-runs"),
  );
const miningDirectory = path.join(
  sourceRoot,
  "dataset/_derived/paper-mining-v0.1",
);
const records = (file, key) =>
  new Map(
    fs
      .readFileSync(path.join(miningDirectory, file), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .map((item) => [item[key], item]),
  );
const questions = records("questions.jsonl", "question_id");
const sources = records("sources.jsonl", "source_id");
const plans = records("visual-plans.jsonl", "question_id");
const assets = records("visual-assets.jsonl", "asset_id");
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const hash = (filename) =>
  crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const pages = new Map();
function pageCount(filename) {
  if (!pages.has(filename))
    pages.set(
      filename,
      Number(
        execFileSync(
          "python",
          [
            "-c",
            "import pymupdf,sys; print(len(pymupdf.open(sys.argv[1])))",
            filename,
          ],
          { encoding: "utf8" },
        ).trim(),
      ),
    );
  return pages.get(filename);
}
function validateSource(fixture) {
  const question = questions.get(fixture.questionId);
  if (
    !question ||
    question.source_id !== fixture.sourceId ||
    question.markscheme_source_id !== fixture.markscheme.sourceId ||
    question.classification.paper !== fixture.paper ||
    question.classification.level !== fixture.level
  )
    throw new Error(`Source linkage mismatch: ${fixture.id}`);
  const plan = plans.get(fixture.questionId);
  for (const crop of fixture.crops) {
    const cropPath = path.join(sourceRoot, crop);
    const asset = [...assets.values()].find(
      (item) => path.resolve(miningDirectory, item.path) === cropPath,
    );
    if (
      !asset ||
      !plan?.source_assets.includes(asset.asset_id) ||
      !fs.existsSync(cropPath)
    )
      throw new Error(`Missing question-linked crop: ${crop}`);
  }
  for (const source of [
    {
      id: fixture.sourceId,
      pdf: fixture.sourcePdf,
      sha256: fixture.sourceSha256,
      pages: fixture.sourcePages,
    },
    {
      id: fixture.markscheme.sourceId,
      pdf: fixture.markscheme.pdf,
      sha256: fixture.markscheme.sha256,
      pages: fixture.markscheme.pages,
    },
  ]) {
    const file = path.join(sourceRoot, source.pdf);
    if (
      !sources.has(source.id) ||
      !fs.existsSync(file) ||
      hash(file) !== source.sha256 ||
      source.pages.some(
        (page) => !Number.isInteger(page) || page < 1 || page > pageCount(file),
      )
    )
      throw new Error(`Source checksum or page mismatch: ${source.pdf}`);
  }
}
function stableRunId(item) {
  const digest = crypto
    .createHash("sha256")
    .update(`mechanics-replay:${packageContentFingerprint(item)}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  digest[12] = "5";
  digest[16] = "8";
  const hex = digest.join("");
  return `question-run-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function main() {
  for (const fixture of MECHANICS_SOURCE_FIXTURES) validateSource(fixture);
  for (const item of MECHANICS_QUESTION_PACKAGES) {
    const result = validateMechanicsQuestionPackage(item);
    if (!result.valid)
      throw new Error(
        `Invalid mechanics package ${item.id}: ${result.issues.join("; ")}`,
      );
  }
  if (
    MECHANICS_QUESTION_PACKAGES.length !== 8 ||
    MECHANICS_QUESTION_PACKAGES.filter((item) => item.paper === "1A").length !==
      4
  )
    throw new Error("Expected eight balanced mechanics packages");
  fs.mkdirSync(path.dirname(outputDirectory), { recursive: true });
  const staging = fs.mkdtempSync(`${outputDirectory}.staging-`);
  try {
    const store = new JsonlQuestionRunStore(runStoreDirectory);
    const receipt = [],
      sections = [];
    for (const [index, item] of MECHANICS_QUESTION_PACKAGES.entries()) {
      const fixture = MECHANICS_SOURCE_FIXTURES[index];
      const runId = stableRunId(item);
      const indexed = await store.fetch(runId);
      const existing = indexed ? await store.resume(runId) : undefined;
      const run =
        existing && !["requested", "running"].includes(existing.status)
          ? existing
          : await runQuestionGraph(
              mechanicsReplayRequest(item.id),
              createMechanicsReplayAdapters(item.id),
              { runId, store },
            );
      const reopened = await new JsonlQuestionRunStore(
        runStoreDirectory,
      ).resume(runId);
      if (
        JSON.stringify(reopened) !== JSON.stringify(run) ||
        run.questionPackage?.contentFingerprint !==
          packageContentFingerprint(item) ||
        ![
          "awaiting-human-review",
          "accepted",
          "sent-back-for-repair",
          "rejected",
        ].includes(run.status)
      )
        throw new Error(`Mechanics replay could not be recovered: ${item.id}`);
      const svg = renderMechanicsScene(item.visualSpec);
      fs.writeFileSync(path.join(staging, `${item.id}.svg`), svg);
      fs.writeFileSync(
        path.join(staging, `${item.id}.json`),
        JSON.stringify(item, null, 2) + "\n",
      );
      receipt.push({
        packageId: item.id,
        paper: item.paper,
        level: fixture.level,
        sourceQuestionId: fixture.questionId,
        source: {
          pdf: fixture.sourcePdf,
          sha256: fixture.sourceSha256,
          pages: fixture.sourcePages,
        },
        markscheme: fixture.markscheme,
        sourceScope: fixture.scope,
        marks: item.marks,
        sourceChecks: item.sourceChecks,
        results: item.results,
        validation: { valid: true, issues: [] },
        runId,
        runStatus: run.status,
        renderedSvg: `${item.id}.svg`,
        svgSha256: crypto.createHash("sha256").update(svg).digest("hex"),
        trainingEligibility: item.trainingEligibility,
        trainingBlockers: item.trainingBlockers,
      });
      const crops = fixture.crops
        .map(
          (crop) =>
            `<img alt="Original source diagram" src="data:image/png;base64,${fs.readFileSync(path.join(sourceRoot, crop)).toString("base64")}"/>`,
        )
        .join("");
      const student =
        item.question.kind === "multiple-choice"
          ? `<ol type="A">${item.question.options.map((option) => `<li>${escape(option.text)}</li>`).join("")}</ol>`
          : `<ol>${item.question.parts.map((part) => `<li><strong>${escape(part.id)}</strong> ${escape(part.prompt)} [${part.marks}]</li>`).join("")}</ol>`;
      const teacherVisuals = renderMechanicsSolutionVisuals(item)
        .map(
          (visual) =>
            `<h4>Solution diagram for ${escape(visual.partId)}</h4>${visual.svg}`,
        )
        .join("");
      const solution = item.solution.parts
        .map(
          (part) =>
            `<h4>${escape(part.partId)} [${part.marks}]</h4><ol>${part.working.map((line) => `<li>${escape(line)}</li>`).join("")}</ol><p><strong>${escape(part.finalAnswer)}</strong></p><ul>${part.markingPoints.map((line) => `<li>${escape(line)}</li>`).join("")}</ul>`,
        )
        .join("");
      const sourceLink = `file://${path.join(sourceRoot, fixture.sourcePdf).split(path.sep).map(encodeURIComponent).join("/")}#page=${fixture.sourcePages[0]}`;
      const schemeLink = `file://${path.join(sourceRoot, fixture.markscheme.pdf).split(path.sep).map(encodeURIComponent).join("/")}#page=${fixture.markscheme.pages[0]}`;
      sections.push(
        `<article id="${escape(item.id)}"><h2>${escape(fixture.questionLabel)}</h2><p>${escape(fixture.scope)}</p><p><a href="${sourceLink}">Question PDF</a> · <a href="${schemeLink}">Mark scheme PDF</a> · <a href="http://127.0.0.1:3000/review?runId=${runId}">Review saved run</a></p><div class="comparison"><section><h3>Source diagrams</h3>${crops}</section><section><h3>Reconstructed student diagram</h3>${svg}</section></div><h3>Student question [${item.marks}]</h3><p>${escape(item.question.stem)}</p>${student}<details><summary>Worked solution and marking points</summary>${solution}${teacherVisuals}<h4>Assumptions</h4><ul>${item.assumptions.map((line) => `<li>${escape(line)}</li>`).join("")}</ul></details><p class="status">Physics checked. Awaiting human review, source-use clearance, metadata and grouped split.</p></article>`,
      );
    }
    const manifest = {
      schemaVersion: "mechanics-pilot/0.1.0",
      generatedAt: new Date().toISOString(),
      packageCount: receipt.length,
      paperCounts: { "1A": 4, 2: 4 },
      runStoreDirectory,
      sourceEvidence:
        "Source/scheme pages manually compared; generator rechecks immutable PDF hashes, question/crop linkage and page bounds.",
      trainingEligibility: "blocked",
      packages: receipt,
    };
    fs.writeFileSync(
      path.join(staging, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    fs.writeFileSync(
      path.join(staging, "index.html"),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mechanics package review</title><style>body{font:17px/1.6 system-ui,sans-serif;max-width:1440px;margin:auto;padding:24px;background:#fafafa;color:#171717}article{background:white;border:1px solid #ddd;padding:24px;margin:24px 0;border-radius:10px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:24px}svg,img{max-width:100%;height:auto}img{display:block;margin-bottom:12px}li{margin:8px 0}details{background:#f4f4f4;padding:18px}.status{color:#704400}@media(max-width:800px){.comparison{grid-template-columns:1fr}}</style></head><body><h1>Eight mechanics question packages</h1><p>Four Paper 1A and four Paper 2 packages. Original figures and scheme-linked checks remain private. These packages await the separate training-readiness decisions.</p>${sections.join("")}</body></html>`,
    );
    if (fs.existsSync(outputDirectory))
      fs.renameSync(
        outputDirectory,
        `${outputDirectory}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`,
      );
    fs.renameSync(staging, outputDirectory);
    console.log(
      JSON.stringify({
        packages: 8,
        sourceChecksPassed: true,
        recoveredRuns: 8,
        trainingEligibility: "blocked",
        reviewPage: path.join(outputDirectory, "index.html"),
        runStoreDirectory,
      }),
    );
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
