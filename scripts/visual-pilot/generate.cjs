/* Generate a private, source-linked reconstruction receipt from the eight fixtures. */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
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
const {
  CARTESIAN_EXPANSION_FIXTURES,
} = require("../../lib/visuals/cartesian-expansion-fixtures.ts");
const {
  CIRCUIT_SOURCE_FIXTURES,
} = require("../../lib/visuals/circuit-source-fixtures.ts");
const {
  CIRCUIT_INTENT_SOURCE_FIXTURES,
} = require("../../lib/visuals/circuit-intent-fixtures.ts");
const {
  CIRCUIT_QUESTION_PACKAGES,
  validateCircuitQuestionPackage,
} = require("../../lib/visuals/circuit-question-packages.ts");
const {
  compileCircuitIntent,
  validateCircuitIntent,
} = require("../../lib/visuals/circuit-intent.ts");
const { computePilotMetric } = require("../../lib/visuals/pilot-physics.ts");
const {
  formatToSignificantFigures,
  generatePilotVariants,
} = require("../../lib/visuals/pilot-variants.ts");
const {
  renderCartesianPlot,
} = require("../../lib/visuals/render-cartesian.ts");
const { renderCircuitNetwork } = require("../../lib/visuals/render-circuit.ts");

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
const sources = records("sources.jsonl", "source_id");
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
const sourceRepairDirectory = path.join(outputDirectory, "source-repairs");
fs.mkdirSync(sourceRepairDirectory, { recursive: true });
const ensureSourceCrop = ({
  filename,
  sourcePdf,
  page,
  x,
  y,
  width,
  height,
}) => {
  const target = path.join(sourceRepairDirectory, filename);
  if (fs.existsSync(`${target}.png`)) return;
  execFileSync("pdftoppm", [
    "-f",
    String(page),
    "-l",
    String(page),
    "-singlefile",
    "-png",
    "-r",
    "120",
    "-x",
    String(x),
    "-y",
    String(y),
    "-W",
    String(width),
    "-H",
    String(height),
    path.join(repository, sourcePdf),
    target,
  ]);
};
ensureSourceCrop({
  filename: "may25-tz3-sl-p2-q2-waves",
  sourcePdf:
    "dataset/2025 Examination Session/May 2025 Examination Session/files and resources/Experimental sciences/Physics_paper_2_TZ3_SL.pdf",
  page: 4,
  x: 100,
  y: 100,
  width: 760,
  height: 740,
});
ensureSourceCrop({
  filename: "may25-tz3-hl-p2-q4-waves",
  sourcePdf:
    "dataset/2025 Examination Session/May 2025 Examination Session/files and resources/Experimental sciences/Physics_paper_2_TZ3_HL.pdf",
  page: 8,
  x: 100,
  y: 310,
  width: 760,
  height: 750,
});
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
  <p>${escapeHtml(item.sourceNote)} Physics check: <strong>${formatToSignificantFigures(item.check.actual)} ${escapeHtml(item.check.unit)}</strong> (scheme target ${item.check.expected} ${escapeHtml(item.check.unit)}).</p>
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

const expansionReceipt = [];
for (const fixture of CARTESIAN_EXPANSION_FIXTURES) {
  const question = questions.get(fixture.sourceQuestionId);
  if (!question || question.classification.paper !== fixture.paper) {
    throw new Error(`Expansion question lineage mismatch: ${fixture.id}`);
  }
  const missingSourceCrop = fixture.sourceCrops.find(
    (sourceCrop) => !fs.existsSync(path.join(repository, sourceCrop)),
  );
  if (missingSourceCrop) {
    throw new Error(
      `Missing expansion source evidence: ${fixture.id} (${missingSourceCrop})`,
    );
  }
  const svg = renderCartesianPlot(fixture.spec, fixture.data);
  if (svg.includes(`${fixture.id}-answer`)) {
    throw new Error(`Expansion answer leaked into student SVG: ${fixture.id}`);
  }
  const svgName = `${fixture.id}.svg`;
  fs.writeFileSync(path.join(outputDirectory, svgName), svg);
  expansionReceipt.push({
    id: fixture.id,
    sourceQuestionId: fixture.sourceQuestionId,
    sourceQuestion: fixture.sourceQuestion,
    paper: fixture.paper,
    sourcePdf: question.provenance.relative_path,
    sourcePages: [question.provenance.page_start, question.provenance.page_end],
    markschemeSourceId: question.markscheme_source_id,
    sourceCrops: fixture.sourceCrops,
    sourceEvidence: fixture.sourceEvidence,
    sourceNote: fixture.sourceNote,
    auditCorrection: fixture.auditCorrection,
    capabilities: fixture.capabilities,
    renderedSvg: svgName,
    trainingEligibility: fixture.trainingEligibility,
  });
}
if (expansionReceipt.length !== 24) {
  throw new Error("Expected exactly 24 source-linked expansion fixtures");
}
const expansionCards = expansionReceipt
  .map((item) => {
    const sourceImages = item.sourceCrops
      .map(
        (sourceCrop) =>
          `<img src="${relativeUrl(path.join(repository, sourceCrop))}" alt="Source evidence for ${escapeHtml(item.id)}">`,
      )
      .join("");
    const correction = item.auditCorrection
      ? `<p class="correction"><strong>Audit correction:</strong> ${escapeHtml(item.auditCorrection)}</p>`
      : "";
    return `<section>
  <h2>${escapeHtml(item.sourceQuestion)}</h2>
  <p>${escapeHtml(item.sourceNote)}</p>
  ${correction}
  <p class="caps">${item.capabilities.map((capability) => `<span>${escapeHtml(capability)}</span>`).join("")}</p>
  <div class="pair"><figure><figcaption>Source evidence (${escapeHtml(item.sourceEvidence)})</figcaption><div class="source-images">${sourceImages}</div></figure><figure><figcaption>Semantic reconstruction</figcaption><img src="${escapeHtml(item.renderedSvg)}" alt="Reconstructed plot for ${escapeHtml(item.id)}"></figure></div>
  <p class="source">${escapeHtml(item.sourceQuestionId)} · source PDF pages ${item.sourcePages.join("–")} · training use blocked</p>
</section>`;
  })
  .join("\n");
const expansionHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>24-source Cartesian expansion</title><style>
body{font:16px/1.5 system-ui,sans-serif;max-width:1500px;margin:auto;padding:24px;color:#1c242b;background:#f5f7f8}h1{margin:0 0 8px}.warning{border-left:5px solid #b54818;background:#fff5eb;padding:12px 16px}section{background:white;border:1px solid #ccd4d8;border-radius:12px;padding:22px;margin:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}figure{margin:0;min-width:0}figcaption{font-weight:650;margin-bottom:10px}.source-images{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}img{width:100%;height:auto;max-height:620px;object-fit:contain;object-position:left top;border:1px solid #dce1e4;background:white}.caps span{display:inline-block;background:#e6edf1;border-radius:999px;padding:3px 9px;margin:2px;font-size:12px}.correction{border-left:4px solid #ad5a18;background:#fff4df;padding:10px 12px}.source{font-size:13px;color:#59656c}@media(max-width:850px){.pair{grid-template-columns:1fr}}
</style></head><body><h1>24-source Cartesian expansion</h1><p class="warning"><strong>Training use blocked.</strong> These are deterministic engineering reconstructions tied to source evidence. They are not complete question packages and have not been promoted to training-ready data.</p><p>The set is balanced across 12 Paper 1A and 12 Paper 2 records. Audit corrections identify cases where nearby wording or a bad automatic crop originally implied the wrong visual capability.</p>${expansionCards}</body></html>`;
fs.writeFileSync(path.join(outputDirectory, "expansion.html"), expansionHtml);
fs.writeFileSync(
  path.join(outputDirectory, "expansion-manifest.json"),
  JSON.stringify(
    {
      schemaVersion: "cartesian-expansion/0.1.0",
      status: "engineering-only-not-training-ready",
      trainingEligibility: "blocked",
      trainingBlockers: [
        "not a complete question package",
        "not human reviewed",
        "source-use rights not cleared",
      ],
      generatedAt: new Date().toISOString(),
      fixtures: expansionReceipt,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(
  `Generated ${expansionReceipt.length} source-linked Cartesian expansion fixtures\n`,
);

const circuitReceipt = [];
for (const fixture of CIRCUIT_SOURCE_FIXTURES) {
  const question = questions.get(fixture.sourceQuestionId);
  const plan = plans.get(fixture.sourceQuestionId);
  if (
    !question ||
    !plan ||
    question.classification.paper !== fixture.paper ||
    plan.primary_family !== "circuit_network"
  ) {
    throw new Error(`Circuit question lineage mismatch: ${fixture.id}`);
  }
  const sourceAssets = fixture.sourceCrops.map((sourceCrop) =>
    [...assets.values()].find(
      (asset) =>
        path.join(runDirectory, asset.path) ===
          path.join(repository, sourceCrop) &&
        plan.source_assets.includes(asset.asset_id),
    ),
  );
  if (
    sourceAssets.some((sourceAsset) => !sourceAsset) ||
    fixture.sourceCrops.some(
      (sourceCrop) => !fs.existsSync(path.join(repository, sourceCrop)),
    )
  ) {
    throw new Error(`Missing linked circuit source evidence: ${fixture.id}`);
  }
  const svg = renderCircuitNetwork(fixture.spec);
  if (svg.includes(`${fixture.id}-answer`)) {
    throw new Error(`Circuit answer leaked into student SVG: ${fixture.id}`);
  }
  const svgName = `${fixture.id}.svg`;
  fs.writeFileSync(path.join(outputDirectory, svgName), svg);
  circuitReceipt.push({
    id: fixture.id,
    sourceQuestionId: fixture.sourceQuestionId,
    sourceQuestion: fixture.sourceQuestion,
    paper: fixture.paper,
    sourcePdf: question.provenance.relative_path,
    markschemeSourceId: question.markscheme_source_id,
    sourcePages: [
      ...new Set(sourceAssets.map((sourceAsset) => sourceAsset.page)),
    ],
    sourceAssetIds: sourceAssets.map((sourceAsset) => sourceAsset.asset_id),
    sourceCrops: fixture.sourceCrops,
    sourceEvidence: fixture.sourceEvidence,
    sourceNote: fixture.sourceNote,
    capabilities: fixture.capabilities,
    renderedSvg: svgName,
    trainingEligibility: fixture.trainingEligibility,
  });
}
if (
  circuitReceipt.length !== 8 ||
  circuitReceipt.filter((item) => item.paper === "1A").length !== 4 ||
  circuitReceipt.filter((item) => item.paper === "2").length !== 4
) {
  throw new Error("Expected a balanced eight-question circuit pilot");
}
const circuitCards = circuitReceipt
  .map((item) => {
    const sourceImages = item.sourceCrops
      .map(
        (sourceCrop) =>
          `<img src="${relativeUrl(path.join(repository, sourceCrop))}" alt="Source circuit evidence for ${escapeHtml(item.id)}">`,
      )
      .join("");
    return `<section>
  <h2>${escapeHtml(item.sourceQuestion)}</h2>
  <p>${escapeHtml(item.sourceNote)}</p>
  <p class="caps">${item.capabilities.map((capability) => `<span>${escapeHtml(capability)}</span>`).join("")}</p>
  <div class="pair"><figure><figcaption>Original exam figure</figcaption><div class="source-images">${sourceImages}</div></figure><figure><figcaption>Semantic circuit reconstruction</figcaption><img src="${escapeHtml(item.renderedSvg)}" alt="Reconstructed circuit for ${escapeHtml(item.id)}"></figure></div>
  <p class="source">${escapeHtml(item.sourceQuestionId)} · source PDF pages ${item.sourcePages.join("–")} · training use blocked</p>
</section>`;
  })
  .join("\n");
const circuitsHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Eight-source circuit renderer pilot</title><style>
body{font:16px/1.5 system-ui,sans-serif;max-width:1500px;margin:auto;padding:24px;color:#1c242b;background:#f5f7f8}h1{margin:0 0 8px}.warning{border-left:5px solid #b54818;background:#fff5eb;padding:12px 16px}section{background:white;border:1px solid #ccd4d8;border-radius:12px;padding:22px;margin:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}figure{margin:0;min-width:0}figcaption{font-weight:650;margin-bottom:10px}.source-images{display:grid;gap:8px}img{width:100%;height:auto;max-height:720px;object-fit:contain;object-position:left top;border:1px solid #dce1e4;background:white}.caps span{display:inline-block;background:#e6edf1;border-radius:999px;padding:3px 9px;margin:2px;font-size:12px}.source{font-size:13px;color:#59656c}@media(max-width:850px){.pair{grid-template-columns:1fr}}
</style></head><body><h1>Eight-source circuit renderer pilot</h1><p class="warning"><strong>Training use blocked.</strong> These fixtures validate deterministic topology and drawing against source evidence. They are not complete, human-reviewed question packages.</p><p>Four Paper 1A and four Paper 2 questions cover the circuit symbols and layouts confirmed in the mined corpus. The SVG is generated from nodes, wires and components; source coordinates are kept as layout hints rather than mixed into the electrical topology.</p>${circuitCards}</body></html>`;
fs.writeFileSync(path.join(outputDirectory, "circuits.html"), circuitsHtml);
fs.writeFileSync(
  path.join(outputDirectory, "circuits-manifest.json"),
  JSON.stringify(
    {
      schemaVersion: "circuit-pilot/0.1.0",
      status: "engineering-only-not-training-ready",
      trainingEligibility: "blocked",
      trainingBlockers: [
        "not a complete question package",
        "not human reviewed",
        "source-use rights not cleared",
      ],
      generatedAt: new Date().toISOString(),
      fixtures: circuitReceipt,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(
  `Generated ${circuitReceipt.length} source-linked circuit fixtures\n`,
);

const circuitIntentReceipt = [];
for (const fixture of CIRCUIT_INTENT_SOURCE_FIXTURES) {
  const sourceFixture = CIRCUIT_SOURCE_FIXTURES.find(
    (candidate) => candidate.id === fixture.sourceFixtureId,
  );
  if (
    !sourceFixture ||
    sourceFixture.sourceQuestionId !== fixture.sourceQuestionId
  ) {
    throw new Error(`Circuit intent source link mismatch: ${fixture.id}`);
  }
  const validation = validateCircuitIntent(fixture.intent);
  if (!validation.valid) {
    throw new Error(
      `Invalid circuit intent fixture: ${fixture.id} (${validation.issues.join(
        ", ",
      )})`,
    );
  }
  const serializedIntent = JSON.stringify(fixture.intent);
  if (serializedIntent.includes("nodePositions")) {
    throw new Error(
      `Circuit intent contains renderer coordinates: ${fixture.id}`,
    );
  }
  const spec = compileCircuitIntent(fixture.intent);
  const svg = renderCircuitNetwork(spec);
  const svgName = `${fixture.intent.id}.svg`;
  fs.writeFileSync(path.join(outputDirectory, svgName), svg);
  circuitIntentReceipt.push({
    id: fixture.id,
    sourceFixtureId: fixture.sourceFixtureId,
    sourceQuestionId: fixture.sourceQuestionId,
    sourceNote: fixture.sourceNote,
    sourceCrops: sourceFixture.sourceCrops,
    intent: fixture.intent,
    compiled: {
      panelCount: 1 + (spec.layers?.length ?? 0),
      componentCount:
        spec.payload.components.length +
        (spec.layers ?? []).reduce(
          (total, layer) =>
            total +
            (layer.family === "circuit_network"
              ? layer.payload.components.length
              : 0),
          0,
        ),
      rendererVersion: spec.provenance.rendererVersion,
    },
    renderedSvg: svgName,
    trainingEligibility: fixture.trainingEligibility,
  });
}
const circuitIntentCards = circuitIntentReceipt
  .map((item) => {
    const sourceImages = item.sourceCrops
      .map(
        (sourceCrop) =>
          `<img src="${relativeUrl(path.join(repository, sourceCrop))}" alt="Source circuit evidence for ${escapeHtml(item.id)}">`,
      )
      .join("");
    return `<section>
  <h2>${escapeHtml(item.id)}</h2>
  <p>${escapeHtml(item.sourceNote)}</p>
  <div class="pair"><figure><figcaption>Original exam figure</figcaption><div class="source-images">${sourceImages}</div></figure><figure><figcaption>Autolayout from coordinate-free intent</figcaption><img src="${escapeHtml(item.renderedSvg)}" alt="Compiled circuit for ${escapeHtml(item.id)}"></figure></div>
  <details><summary>Model-facing CircuitIntent</summary><pre>${escapeHtml(JSON.stringify(item.intent, null, 2))}</pre></details>
  <p class="source">${escapeHtml(item.sourceQuestionId)} · ${item.compiled.panelCount} compiled panel(s) · training use blocked</p>
</section>`;
  })
  .join("\n");
const circuitIntentsHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Coordinate-free circuit intent pilot</title><style>
body{font:16px/1.5 system-ui,sans-serif;max-width:1500px;margin:auto;padding:24px;color:#1c242b;background:#f5f7f8}h1{margin:0 0 8px}.warning{border-left:5px solid #b54818;background:#fff5eb;padding:12px 16px}section{background:white;border:1px solid #ccd4d8;border-radius:12px;padding:22px;margin:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}figure{margin:0;min-width:0}figcaption{font-weight:650;margin-bottom:10px}.source-images{display:grid;gap:8px}img{width:100%;height:auto;max-height:720px;object-fit:contain;object-position:left top;border:1px solid #dce1e4;background:white}details{margin-top:16px}summary{cursor:pointer;font-weight:650}pre{overflow:auto;padding:14px;background:#f3f5f6;border-radius:8px;font-size:12px}.source{font-size:13px;color:#59656c}@media(max-width:850px){.pair{grid-template-columns:1fr}}
</style></head><body><h1>Coordinate-free circuit intent pilot</h1><p class="warning"><strong>Training use blocked.</strong> These records prove the model-facing contract and compiler, but they are not complete checked question packages.</p><p>The JSON describes components, series/parallel topology, visible labels and semantic states. The deterministic compiler supplies all nodes, junctions, orthogonal wires and coordinates.</p>${circuitIntentCards}</body></html>`;
fs.writeFileSync(
  path.join(outputDirectory, "circuit-intents.html"),
  circuitIntentsHtml,
);
fs.writeFileSync(
  path.join(outputDirectory, "circuit-intents-manifest.json"),
  JSON.stringify(
    {
      schemaVersion: "circuit-intent-pilot/0.1.0",
      intentSchemaVersion: "circuit-intent/0.1.0",
      status: "engineering-only-not-training-ready",
      trainingEligibility: "blocked",
      trainingBlockers: [
        "not a complete question package",
        "physics and mark schemes not independently checked",
        "not human reviewed",
        "source-use rights not cleared",
      ],
      generatedAt: new Date().toISOString(),
      fixtures: circuitIntentReceipt,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(
  `Generated ${circuitIntentReceipt.length} coordinate-free circuit intent fixtures\n`,
);

const circuitPackageReceipt = [];
for (const item of CIRCUIT_QUESTION_PACKAGES) {
  const validation = validateCircuitQuestionPackage(item);
  if (!validation.valid) {
    throw new Error(
      `Invalid circuit question package: ${item.id} (${validation.issues.join(
        ", ",
      )})`,
    );
  }
  const fixture = CIRCUIT_SOURCE_FIXTURES.find(
    (candidate) => candidate.id === item.source.fixtureId,
  );
  const question = questions.get(item.source.questionId);
  const questionSource = question ? sources.get(question.source_id) : undefined;
  const markscheme = sources.get(item.source.markscheme.sourceId);
  if (
    !fixture ||
    !question ||
    !questionSource ||
    !markscheme ||
    fixture.sourceQuestionId !== question.question_id ||
    question.markscheme_source_id !== markscheme.source_id ||
    markscheme.role !== "markscheme" ||
    question.provenance.relative_path !== questionSource.relative_path
  ) {
    throw new Error(`Circuit package source link mismatch: ${item.id}`);
  }
  const markschemePdf = path.join(
    repository,
    "dataset",
    markscheme.relative_path,
  );
  if (
    !fs.existsSync(markschemePdf) ||
    item.source.markscheme.pages.some(
      (page) =>
        !Number.isInteger(page) ||
        page < 1 ||
        page > markscheme.profile.page_count,
    ) ||
    fixture.sourceCrops.some(
      (sourceCrop) => !fs.existsSync(path.join(repository, sourceCrop)),
    )
  ) {
    throw new Error(`Missing circuit package source evidence: ${item.id}`);
  }
  const sourceChecks = item.sourceChecks.map((check) => {
    const actual = item.results[check.resultKey];
    const passed =
      check.kind === "exact"
        ? actual === check.expected
        : typeof actual === "number" &&
          Math.abs(actual - check.expected) <= check.tolerance;
    if (!passed) {
      throw new Error(
        `Circuit package source check failed: ${item.id}/${check.resultKey}`,
      );
    }
    return { ...check, actual, passed };
  });
  const svg = renderCircuitNetwork(item.visualSpec);
  if (
    item.visualSpec.visibility.privateParameterIds.some((privateId) =>
      svg.includes(privateId),
    )
  ) {
    throw new Error(`Circuit package answer leaked into SVG: ${item.id}`);
  }
  const svgName = `${item.id}.svg`;
  fs.writeFileSync(path.join(outputDirectory, svgName), svg);
  circuitPackageReceipt.push({
    id: item.id,
    schemaVersion: item.schemaVersion,
    paper: item.paper,
    marks: item.marks,
    source: {
      ...item.source,
      questionPdf: questionSource.relative_path,
      questionPages: [
        question.provenance.page_start,
        question.provenance.page_end,
      ],
      sourceCrops: fixture.sourceCrops,
      markscheme: {
        ...item.source.markscheme,
        relativePath: markscheme.relative_path,
      },
    },
    assumptions: item.assumptions,
    scenario: item.scenario,
    question: item.question,
    visual: {
      specId: item.visualSpec.id,
      scenarioRef: item.visualSpec.scenarioRef,
      renderedSvg: svgName,
    },
    results: item.results,
    solution: item.solution,
    sourceChecks,
    physicsStatus: item.physicsStatus,
    trainingEligibility: item.trainingEligibility,
    trainingBlockers: item.trainingBlockers,
  });
}
if (
  circuitPackageReceipt.length !== 8 ||
  circuitPackageReceipt.filter((item) => item.paper === "1A").length !== 4 ||
  circuitPackageReceipt.filter((item) => item.paper === "2").length !== 4
) {
  throw new Error("Expected eight complete circuit packages balanced 4/4");
}

const circuitPackageCards = circuitPackageReceipt
  .map((item) => {
    const sourceImages = item.source.sourceCrops
      .map(
        (sourceCrop) =>
          `<img src="${relativeUrl(path.join(repository, sourceCrop))}" alt="Source evidence for ${escapeHtml(item.id)}">`,
      )
      .join("");
    const studentBody =
      item.question.kind === "multiple-choice"
        ? `<ol class="options" type="A">${item.question.options
            .map((option) => `<li>${escapeHtml(option.text)}</li>`)
            .join("")}</ol>`
        : `<ol class="parts">${item.question.parts
            .map(
              (part) =>
                `<li><strong>${escapeHtml(part.id)}</strong> ${escapeHtml(part.prompt)} <span>[${part.marks}]</span></li>`,
            )
            .join("")}</ol>`;
    const assumptions = item.assumptions
      .map((assumption) => `<li>${escapeHtml(assumption)}</li>`)
      .join("");
    const solutions = item.solution.parts
      .map((part) => {
        const working = part.working
          .map((step) => `<li>${escapeHtml(step)}</li>`)
          .join("");
        const markingPoints = part.markingPoints
          .map((point) => `<li>${escapeHtml(point)}</li>`)
          .join("");
        return `<div class="solution-part"><h4>${escapeHtml(part.partId)} <span>[${part.marks}]</span></h4>${working ? `<ol>${working}</ol>` : ""}<p><strong>Marking points</strong></p><ul>${markingPoints}</ul>${part.finalAnswer ? `<p><strong>Final answer:</strong> ${escapeHtml(part.finalAnswer)}</p>` : ""}</div>`;
      })
      .join("");
    const schemeEvidence = item.source.markscheme.evidence
      .map((evidence) => `<li>${escapeHtml(evidence)}</li>`)
      .join("");
    const checks = item.sourceChecks
      .map(
        (check) =>
          `<li><code>${escapeHtml(check.resultKey)}</code>: ${escapeHtml(check.actual)} ✓</li>`,
      )
      .join("");
    return `<section>
  <h2>${escapeHtml(item.source.questionLabel)} — checked derivative</h2>
  <p class="scope"><strong>Source scope:</strong> ${escapeHtml(item.source.sourceScope)}</p>
  <div class="source-row"><figure><figcaption>Private source evidence</figcaption><div class="source-images">${sourceImages}</div></figure><div><h3>Linked mark scheme</h3><p><code>${escapeHtml(item.source.markscheme.sourceId)}</code>, PDF page(s) ${item.source.markscheme.pages.join(", ")}</p><ul>${schemeEvidence}</ul><h3>Explicit assumptions</h3><ul>${assumptions}</ul></div></div>
  <div class="student-package"><h3>Student package · ${item.marks} marks</h3><p class="stem">${escapeHtml(item.question.stem)}</p><img src="${escapeHtml(item.visual.renderedSvg)}" alt="Student-facing circuit for ${escapeHtml(item.id)}">${studentBody}</div>
  <details><summary>Complete deterministic solution and marking points</summary>${solutions}<h4>Machine checks</h4><ul>${checks}</ul></details>
  <p class="source">${escapeHtml(item.id)} · physics verified · training blocked pending human review, source-rights clearance, and training metadata/grouped split</p>
</section>`;
  })
  .join("\n");
const circuitPackagesHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Eight complete circuit question packages</title><style>
body{font:16px/1.5 system-ui,sans-serif;max-width:1500px;margin:auto;padding:24px;color:#1c242b;background:#f5f7f8}h1{margin:0 0 8px}.warning{border-left:5px solid #b54818;background:#fff5eb;padding:12px 16px}section{background:white;border:1px solid #ccd4d8;border-radius:12px;padding:22px;margin:24px 0}.source-row{display:grid;grid-template-columns:1.2fr 1fr;gap:22px;align-items:start}.source-images{display:grid;gap:8px}figure{margin:0;min-width:0}figcaption,h3{font-weight:700;margin-bottom:10px}.source-images img,.student-package>img{width:100%;height:auto;max-height:650px;object-fit:contain;object-position:left top;border:1px solid #dce1e4;background:white}.student-package{margin-top:20px;padding:20px;border:2px solid #61727d;border-radius:10px}.student-package>img{max-width:850px;display:block;margin:16px auto}.stem{white-space:pre-line}.parts,.options{padding-left:28px}.parts li,.options li{margin:8px 0}.parts span,.solution-part span{float:right;color:#59656c}details{margin-top:18px;padding:14px;background:#f6f8f9;border-radius:8px}summary{cursor:pointer;font-weight:700}.solution-part{border-top:1px solid #ccd4d8;padding-top:10px}.scope{border-left:4px solid #47728a;padding-left:12px}.source{font-size:13px;color:#59656c}code{overflow-wrap:anywhere}@media(max-width:850px){.source-row{grid-template-columns:1fr}}
</style></head><body><h1>Eight complete circuit question packages</h1><p class="warning"><strong>Physics verified; training use still blocked.</strong> Each package links one explicit scenario to the visual, deterministic calculations, student givens, checked final answers and complete marking points. These records still require human review, source-use clearance, and training metadata with a grouped split before dataset export.</p><p>Four Paper 1A and four Paper 2 packages form the first complete extraction → scenario → render → solve → validate vertical slice. Source-dependent graph values are supplied explicitly where needed; no question silently depends on an omitted figure.</p>${circuitPackageCards}</body></html>`;
fs.writeFileSync(
  path.join(outputDirectory, "circuit-packages.html"),
  circuitPackagesHtml,
);
fs.writeFileSync(
  path.join(outputDirectory, "circuit-packages-manifest.json"),
  JSON.stringify(
    {
      schemaVersion: "circuit-package-pilot/0.1.0",
      packageSchemaVersion: "circuit-question-package/0.1.0",
      status: "physics-verified-awaiting-human-review",
      trainingEligibility: "blocked",
      trainingBlockers: [
        "not human reviewed",
        "source-use rights not cleared",
        "training metadata and grouped split not assigned",
      ],
      generatedAt: new Date().toISOString(),
      packages: circuitPackageReceipt,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(
  `Generated ${circuitPackageReceipt.length} complete checked circuit packages\n`,
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
  let expectedGraph;
  if (variant.solution.expectedGraph) {
    const solutionSvgName = `${variant.id}-solution.svg`;
    fs.writeFileSync(
      path.join(outputDirectory, solutionSvgName),
      renderCartesianPlot(
        variant.solution.expectedGraph.spec,
        variant.solution.expectedGraph.data,
      ),
    );
    expectedGraph = {
      description: variant.solution.expectedGraph.description,
      renderedSvg: solutionSvgName,
    };
  }
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
    solution: {
      displayValue: variant.solution.displayValue,
      significantFigures: variant.solution.significantFigures,
      unit: variant.solution.unit,
      method: variant.solution.method,
      parts: variant.solution.parts,
      expectedGraph,
    },
    trainingEligibility: variant.trainingEligibility,
    check: { actual, tolerance: variant.check.tolerance, passed },
  });
}
if (variantReceipt.length !== 24)
  throw new Error("Expected exactly 24 synthetic variants");
const variationCards = variantReceipt
  .map((item) => {
    const solutionParts = item.solution.parts
      .map(
        (part) =>
          `<li><strong>${escapeHtml(part.label)}:</strong> ${escapeHtml(part.working)}${part.finalAnswer ? ` <strong>${escapeHtml(part.finalAnswer)}</strong>` : ""}</li>`,
      )
      .join("");
    const expectedGraph = item.solution.expectedGraph
      ? `<figure class="solution-graph"><figcaption>Expected kinetic-energy sketch</figcaption><img src="${escapeHtml(item.solution.expectedGraph.renderedSvg)}" alt="Teacher solution graph for ${escapeHtml(item.id)}"><p>${escapeHtml(item.solution.expectedGraph.description)}</p></figure>`
      : "";
    return `<article><h3>${escapeHtml(item.id)}</h3><p>${escapeHtml(item.studentPrompt)}</p><img src="${escapeHtml(item.renderedSvg)}" alt="Student-facing graph for ${escapeHtml(item.id)}"><details><summary>Complete checked solution</summary><ol>${solutionParts}</ol>${expectedGraph}</details><p class="source">Derived from ${escapeHtml(item.sourceFixtureId)} · ${escapeHtml(item.paper)} · training use blocked</p></article>`;
  })
  .join("\n");
const variationsHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>24 parameterized graph exercises</title><style>
body{font:16px/1.5 system-ui,sans-serif;max-width:1500px;margin:auto;padding:24px;color:#1c242b;background:#f5f7f8}h1{margin:0 0 8px}.warning{border-left:5px solid #b54818;background:#fff5eb;padding:12px 16px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(390px,1fr));gap:18px}article{background:white;border:1px solid #ccd4d8;border-radius:12px;padding:18px;min-width:0}h3{font-size:18px;overflow-wrap:anywhere}img{width:100%;height:auto;border:1px solid #dce1e4;background:white}details{margin-top:12px}summary{cursor:pointer;font-weight:650}.solution-graph{margin:16px 0 0}.solution-graph figcaption{font-weight:650;margin-bottom:8px}.source{font-size:13px;color:#59656c}
</style></head><body><h1>24 parameterized graph exercises</h1><p class="warning"><strong>Training use blocked.</strong> These are engineering test cases, not dataset records. They require conversion into complete question packages, human review, and source-use clearance before any training export.</p><p>Three variations of each source-backed graph case. Each plot, prompt and checked answer comes from one scenario. Student SVG files contain no answers; teacher solution graphs are separate review-only files. Calculated answers are displayed to three significant figures.</p><div class="cards">${variationCards}</div></body></html>`;
fs.writeFileSync(path.join(outputDirectory, "variants.html"), variationsHtml);
fs.writeFileSync(
  path.join(outputDirectory, "variants-manifest.json"),
  JSON.stringify(
    {
      schemaVersion: "visual-pilot-variants/0.1.0",
      status: "engineering-only-not-training-ready",
      trainingEligibility: "blocked",
      trainingBlockers: [
        "not a complete question package",
        "not human reviewed",
        "source-use rights not cleared",
      ],
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
