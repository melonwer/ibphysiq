/* Generate a private, source-linked reconstruction receipt from the eight fixtures. */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const repository = path.resolve(__dirname, "../..");
const runDirectory = path.join(
  repository,
  "dataset/_derived/paper-mining-v0.1",
);
const outputDirectory = path.join(
  repository,
  "dataset/_derived/visual-pilot-v0.1",
);
const {
  CARTESIAN_PILOT_FIXTURES,
} = require("../../lib/visuals/pilot-fixtures.ts");
const { computePilotMetric } = require("../../lib/visuals/pilot-physics.ts");
const {
  renderCartesianPlot,
} = require("../../lib/visuals/render-cartesian.ts");

const records = (filename, key) =>
  new Map(
    fs
      .readFileSync(path.join(runDirectory, filename), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .map((record) => [record[key], record]),
  );
const questions = records("questions.jsonl", "question_id");
const plans = records("visual-plans.jsonl", "question_id");
const assets = records("visual-assets.jsonl", "asset_id");
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
const relativeUrl = (absolutePath) =>
  path
    .relative(outputDirectory, absolutePath)
    .split(path.sep)
    .map(encodeURIComponent)
    .join("/");

fs.mkdirSync(outputDirectory, { recursive: true });
const receipt = [];
for (const fixture of CARTESIAN_PILOT_FIXTURES) {
  const question = questions.get(fixture.sourceQuestionId);
  const plan = plans.get(fixture.sourceQuestionId);
  if (
    !question ||
    !plan ||
    question.markscheme_source_id !== fixture.markschemeSourceId ||
    question.classification.paper !== fixture.paper
  ) {
    throw new Error(`Question or mark-scheme link mismatch: ${fixture.id}`);
  }
  const sourceCrop = path.join(repository, fixture.sourceCrop);
  const sourceAsset = [...assets.values()].find(
    (asset) =>
      path.join(runDirectory, asset.path) === sourceCrop &&
      plan.source_assets.includes(asset.asset_id),
  );
  if (
    !sourceAsset ||
    !fs.existsSync(sourceCrop) ||
    !fs.existsSync(path.join(repository, fixture.markschemePdf))
  ) {
    throw new Error(`Missing linked source crop or mark scheme: ${fixture.id}`);
  }
  const actual = computePilotMetric(fixture);
  const passed =
    Math.abs(actual - fixture.check.expected) <= fixture.check.tolerance;
  if (!passed) throw new Error(`Physics check failed: ${fixture.id}`);
  const svg = renderCartesianPlot(fixture.spec, fixture.data);
  const svgName = `${fixture.id}.svg`;
  fs.writeFileSync(path.join(outputDirectory, svgName), svg);
  receipt.push({
    id: fixture.id,
    paper: fixture.paper,
    sourceQuestionId: fixture.sourceQuestionId,
    sourcePdf: question.provenance.relative_path,
    sourcePage: sourceAsset.page,
    sourceAssetId: sourceAsset.asset_id,
    sourceCrop: fixture.sourceCrop,
    markschemeSourceId: fixture.markschemeSourceId,
    markschemePdf: fixture.markschemePdf,
    markschemePage: fixture.markschemePage,
    sourceNote: fixture.sourceNote,
    check: {
      kind: fixture.check.kind,
      actual,
      expected: fixture.check.expected,
      tolerance: fixture.check.tolerance,
      unit: fixture.check.unit,
      passed,
    },
    renderedSvg: svgName,
    studentVisibleSeries: fixture.spec.payload.series.length,
  });
}

const cards = receipt
  .map(
    (item) => `<section>
  <h2>${escapeHtml(item.id)}</h2>
  <p>${escapeHtml(item.sourceNote)} Physics check: <strong>${item.check.actual.toPrecision(4)} ${escapeHtml(item.check.unit)}</strong> (scheme target ${item.check.expected} ${escapeHtml(item.check.unit)}).</p>
  <div class="pair"><figure><figcaption>Original exam figure</figcaption><img src="${relativeUrl(path.join(repository, item.sourceCrop))}" alt="Source crop for ${escapeHtml(item.id)}"></figure><figure><figcaption>Reconstructed student-facing SVG</figcaption><img src="${escapeHtml(item.renderedSvg)}" alt="Reconstructed graph for ${escapeHtml(item.id)}"></figure></div>
  <p class="source">Question ${escapeHtml(item.sourceQuestionId)} · source PDF page ${item.sourcePage} · mark scheme PDF page ${item.markschemePage}</p>
</section>`,
  )
  .join("\n");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Eight-question Cartesian pilot</title><style>
body{font:16px/1.5 system-ui,sans-serif;max-width:1450px;margin:auto;padding:24px;color:#1c242b;background:#f5f7f8}h1{margin:0 0 8px}section{background:white;border:1px solid #ccd4d8;border-radius:12px;padding:22px;margin:24px 0;box-shadow:0 2px 8px #0000000a}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:center}figure{margin:0;min-width:0}figcaption{font-weight:650;margin-bottom:10px}img{width:100%;height:auto;max-height:560px;object-fit:contain;object-position:left center;border:1px solid #dce1e4;background:white}.source{font-size:13px;color:#59656c}@media(max-width:800px){.pair{grid-template-columns:1fr}}
</style></head><body><h1>Eight-question Cartesian reconstruction pilot</h1><p>Four Paper 1A and four Paper 2 questions. Left: private source crop. Right: student-facing SVG. Answer checks use independently computed physics and linked mark schemes; this is an engineering pilot, not training-ready data.</p>${cards}</body></html>`;
fs.writeFileSync(path.join(outputDirectory, "index.html"), html);
fs.writeFileSync(
  path.join(outputDirectory, "manifest.json"),
  JSON.stringify(
    {
      schemaVersion: "visual-pilot/0.1.0",
      generatedAt: new Date().toISOString(),
      fixtures: receipt,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(
  `Generated ${receipt.length} checked reconstructions in ${path.relative(repository, outputDirectory)}\n`,
);
