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
  generatePilotVariants,
} = require("../../lib/visuals/pilot-variants.ts");
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

const variantReceipt = [];
for (const variant of generatePilotVariants()) {
  if (!questions.has(variant.sourceQuestionId)) {
    throw new Error(`Synthetic variant lacks source lineage: ${variant.id}`);
  }
  const actual = computePilotMetric(variant);
  const passed =
    Math.abs(actual - variant.solution.value) <= variant.check.tolerance;
  if (!passed) throw new Error(`Synthetic physics check failed: ${variant.id}`);
  const svg = renderCartesianPlot(variant.spec, variant.data);
  if (
    svg.includes(`${variant.id}-answer`) ||
    svg.includes(variant.solution.method)
  ) {
    throw new Error(`Synthetic answer leaked into student SVG: ${variant.id}`);
  }
  const svgName = `${variant.id}.svg`;
  fs.writeFileSync(path.join(outputDirectory, svgName), svg);
  variantReceipt.push({
    id: variant.id,
    sourceFixtureId: variant.sourceFixtureId,
    sourceQuestionId: variant.sourceQuestionId,
    paper: variant.paper,
    scenario: variant.scenario,
    studentPrompt: variant.studentPrompt,
    plot: {
      xDomain: variant.spec.payload.xAxis.domain,
      yDomain: variant.spec.payload.yAxis.domain,
      xMinorTickStep: variant.spec.payload.xAxis.minorTickStep,
      yMinorTickStep: variant.spec.payload.yAxis.minorTickStep,
      squareGridCells: variant.spec.payload.squareGridCells,
    },
    renderedSvg: svgName,
    studentVisibleSeries: variant.spec.payload.series.length,
    solution: variant.solution,
    check: { actual, tolerance: variant.check.tolerance, passed },
  });
}
if (variantReceipt.length !== 24)
  throw new Error("Expected exactly 24 synthetic variants");
const variationCards = variantReceipt
  .map(
    (item) =>
      `<article><h3>${escapeHtml(item.id)}</h3><p>${escapeHtml(item.studentPrompt)}</p><img src="${escapeHtml(item.renderedSvg)}" alt="Student-facing graph for ${escapeHtml(item.id)}"><details><summary>Checked solution</summary><p>${escapeHtml(item.solution.method)}: <strong>${escapeHtml(item.solution.value.toPrecision(4))} ${escapeHtml(item.solution.unit)}</strong></p></details><p class="source">Derived from ${escapeHtml(item.sourceFixtureId)} · ${escapeHtml(item.paper)}</p></article>`,
  )
  .join("\n");
const variationsHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>24 parameterized graph exercises</title><style>
body{font:16px/1.5 system-ui,sans-serif;max-width:1500px;margin:auto;padding:24px;color:#1c242b;background:#f5f7f8}h1{margin:0 0 8px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(390px,1fr));gap:18px}article{background:white;border:1px solid #ccd4d8;border-radius:12px;padding:18px;min-width:0}h3{font-size:18px;overflow-wrap:anywhere}img{width:100%;height:auto;border:1px solid #dce1e4;background:white}details{margin-top:12px}summary{cursor:pointer;font-weight:650}.source{font-size:13px;color:#59656c}
</style></head><body><h1>24 parameterized graph exercises</h1><p>Three variations of each source-backed graph case. Each plot, prompt and checked answer comes from one scenario. Solutions are collapsed for review; the SVG files themselves contain no answers. These are engineering exercises, not full exam packages or cleared training data.</p><div class="cards">${variationCards}</div></body></html>`;
fs.writeFileSync(path.join(outputDirectory, "variants.html"), variationsHtml);
fs.writeFileSync(
  path.join(outputDirectory, "variants-manifest.json"),
  JSON.stringify(
    {
      schemaVersion: "visual-pilot-variants/0.1.0",
      status: "engineering-only-not-training-ready",
      generatedAt: new Date().toISOString(),
      variants: variantReceipt,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(
  `Generated ${variantReceipt.length} checked parameter variations\n`,
);
