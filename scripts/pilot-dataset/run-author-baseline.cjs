const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
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
};
const {
  CHECKED_SOURCE_PACKAGES,
  createOllamaAuthor,
  parseModelAuthoredPackage,
} = require("../../lib/generation-harness/ollama-author.ts");
const {
  createOllamaPlanner,
  DEFAULT_LOCAL_MODEL_CONFIG,
} = require("../../lib/generation-harness/ollama-planner.ts");
const replay = require("../../lib/generation-harness/replay-fixtures.ts");
const {
  runQuestionGraph,
  QuestionRunStageError,
} = require("../../lib/generation-harness/question-run-graph.ts");
const {
  JsonlQuestionRunStore,
} = require("../../lib/generation-harness/question-run-store.ts");
const {
  validateArtifact,
} = require("../../lib/generation-harness/contracts.ts");
const renderers = {
  cartesian_plot: require("../../lib/visuals/render-cartesian.ts")
    .renderCartesianPlot,
  circuit_network: require("../../lib/visuals/render-circuit.ts")
    .renderCircuitNetwork,
  field_map: require("../../lib/visuals/render-field-map.ts").renderFieldMap,
  mechanics_scene: require("../../lib/visuals/render-mechanics.ts")
    .renderMechanicsScene,
};
const repository = path.resolve(__dirname, "../..");
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const writeJson = (filename, value, flag = "w") =>
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + "\n", { flag });
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

function selectSources() {
  const selected = [];
  for (const family of [
    "cartesian_plot",
    "circuit_network",
    "field_map",
    "mechanics_scene",
  ]) {
    const matches = CHECKED_SOURCE_PACKAGES.filter((item) => {
      if ("plot" in item && item.plot) return family === "cartesian_plot";
      return item.visualSpec?.family === family;
    });
    const chosen =
      family === "mechanics_scene"
        ? matches.filter((item) =>
            [
              "projectile-flight",
              "cart-collision",
              "circle-bottom",
              "incline-friction",
              "pendulum-collision",
            ].includes(item.scenario.kind),
          )
        : matches.slice(0, 5);
    if (chosen.length !== 5)
      throw new Error(`Expected five checked sources for ${family}`);
    for (const source of chosen) selected.push({ source, family });
  }
  if (new Set(selected.map((item) => item.source.id)).size !== 20)
    throw new Error("Expected 20 distinct sources");
  return selected;
}

function sourceAdapters(source) {
  if (source.schemaVersion.startsWith("circuit-"))
    return {
      request: replay.circuitReplayRequest(source.id),
      adapters: replay.createCircuitReplayAdapters(source.id),
    };
  if (source.schemaVersion.startsWith("field-"))
    return {
      request: replay.fieldReplayRequest(source.id),
      adapters: replay.createFieldReplayAdapters(source.id),
    };
  return {
    request: replay.mechanicsReplayRequest(source.id),
    adapters: replay.createMechanicsReplayAdapters(source.id),
  };
}

function persistVisuals(output, entries) {
  for (const entry of entries) {
    entry.figures = [];
    const source = CHECKED_SOURCE_PACKAGES.find(
      (item) => item.id === entry.sourcePackageId,
    );
    const figures = [];
    if (source.visualSpec)
      figures.push({
        family: source.visualSpec.family,
        svg: renderers[source.visualSpec.family](source.visualSpec),
      });
    if (source.plot)
      figures.push({
        family: "cartesian_plot",
        svg: renderers.cartesian_plot(
          source.plot.student.spec,
          source.plot.student.data,
        ),
      });
    for (const [index, figure] of figures.entries()) {
      const filename = `assets/${entry.candidateId}-${index}.svg`;
      fs.writeFileSync(path.join(output, filename), figure.svg);
      entry.figures.push({
        family: figure.family,
        path: filename,
        sha256: sha(figure.svg),
      });
    }
  }
}

function questionMarkup(question) {
  if (!question || typeof question !== "object")
    return "<p>No structured candidate question was returned.</p>";
  return (
    `<p class="stem">${escape(question.stem)}</p>` +
    (Array.isArray(question.options)
      ? `<ol class="options">${question.options.map((option) => `<li><b>${escape(option.id)}</b> ${escape(option.text)}</li>`).join("")}</ol>`
      : "") +
    (Array.isArray(question.parts)
      ? `<ol class="parts">${question.parts.map((part) => `<li><b>${escape(part.id)}</b> ${escape(part.prompt)} <span class="marks">[${escape(part.marks)}]</span></li>`).join("")}</ol>`
      : "")
  );
}
function solutionMarkup(solution) {
  if (!solution || !Array.isArray(solution.parts))
    return "<p>No structured solution was returned.</p>";
  return (
    (solution.correctOptionId
      ? `<p>Correct option: <b>${escape(solution.correctOptionId)}</b></p>`
      : "") +
    solution.parts
      .map(
        (part) =>
          `<section><h4>${escape(part.partId)} · ${escape(part.marks)} marks</h4><ol>${(Array.isArray(part.working) ? part.working : []).map((line) => `<li>${escape(line)}</li>`).join("")}</ol><p><b>${escape(part.finalAnswer)}</b></p><ul>${(Array.isArray(part.markingPoints) ? part.markingPoints : []).map((line) => `<li>${escape(line)}</li>`).join("")}</ul></section>`,
      )
      .join("")
  );
}

function writeReport(output, contract, entries) {
  const counts = {};
  for (const entry of entries)
    counts[entry.status] = (counts[entry.status] ?? 0) + 1;
  const snapshot = {
    experimentId: contract.experimentId,
    generatedAt: new Date().toISOString(),
    contract,
    completedRequests: entries.filter(
      (item) => !["pending", "running"].includes(item.status),
    ).length,
    counts,
    entries,
  };
  writeJson(path.join(output, "results.json"), snapshot);
  const cards = entries
    .map((entry, index) => {
      const source = CHECKED_SOURCE_PACKAGES.find(
        (item) => item.id === entry.sourcePackageId,
      );
      let candidate;
      const candidateFile = path.join(
        output,
        "packages",
        `${entry.candidateId}.json`,
      );
      if (fs.existsSync(candidateFile)) candidate = readJson(candidateFile);
      const responseFile = path.join(
        output,
        "responses",
        `${entry.candidateId}-author.txt`,
      );
      const raw = fs.existsSync(responseFile)
        ? fs.readFileSync(responseFile, "utf8")
        : "";
      if (!candidate && raw) {
        try {
          candidate = JSON.parse(raw);
        } catch {}
      }
      return `<article id="${escape(entry.candidateId)}" data-family="${escape(entry.family)}" data-paper="${escape(entry.paper)}" data-status="${escape(entry.status)}"><header><h2>${index + 1}. ${escape(source.scenario.kind.replaceAll("-", " "))}</h2><p>${escape(source.source.questionLabel)} · ${escape(entry.family)} · ${source.marks} marks</p><span class="badge">${escape(entry.status)}</span></header>${entry.rejection ? `<p class="failure">${escape(entry.rejection.code)}: ${escape(entry.rejection.message)}</p>` : ""}${entry.figures.map((figure) => `<a href="${escape(figure.path)}" target="_blank" rel="noopener" aria-label="Open full-size ${escape(figure.family)}"><img src="${escape(figure.path)}" alt="Checked student ${escape(figure.family)} figure"></a>`).join("")}${questionMarkup(candidate?.question)}<details class="solution"><summary>Model solution and marking points</summary>${solutionMarkup(candidate?.solution)}</details><details><summary>Reference question and checked targets</summary>${questionMarkup(source.question)}${solutionMarkup(source.solution)}</details><details><summary>Run evidence and raw reply</summary><p>Frozen split: ${escape(entry.split)}. Parent group: ${escape(entry.groupId)}.</p><pre>${escape(JSON.stringify({ runId: entry.runId, checks: entry.checks, rejection: entry.rejection, receipts: entry.receipts }, null, 2))}</pre><pre>${escape(raw || "No author reply recorded.")}</pre></details><div class="review"><label for="review-${index}">Your review</label><select id="review-${index}" data-review="${escape(entry.candidateId)}"><option value="pending">Pending</option><option value="usable">Looks usable</option><option value="repair">Needs repair</option><option value="reject">Reject</option></select><textarea data-note="${escape(entry.candidateId)}" aria-label="Review notes for ${escape(source.scenario.kind)}" placeholder="Wording, givens, working or figure issues"></textarea></div></article>`;
    })
    .join("");
  fs.writeFileSync(
    path.join(output, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Qwen authoring pilot · 20 requests</title><style>body{margin:0;background:#f3f5f8;color:#152337;font:16px/1.6 system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:32px 20px}h1{font-size:34px;line-height:1.2}h2{font-size:22px;margin:0}h4{margin-bottom:8px}.lead{max-width:80ch}.stats,.filters{display:flex;flex-wrap:wrap;gap:14px;margin:24px 0}.stat{background:#fff;border:1px solid #d8e0e9;border-radius:10px;padding:12px 20px}.stat b{display:block;font-size:26px}article{background:white;border:1px solid #d8e0e9;border-radius:12px;padding:24px;margin:24px 0}article header p{margin:8px 0}.badge{display:inline-block;background:#e8eef9;color:#24385a;border-radius:6px;padding:3px 9px;font-size:14px}img{display:block;width:100%;height:auto;margin:20px auto;border:1px solid #e0e5eb}details{border-top:1px solid #e0e5eb;margin-top:18px;padding-top:14px}summary{cursor:pointer;font-weight:600}pre{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f8;padding:14px;max-height:360px;overflow:auto}.options,.parts{list-style:none;padding:0}.options li,.parts li{padding:7px 0}.marks{float:right}.failure{color:#84262b;background:#fff0f1;padding:12px}.review{border-top:1px solid #d8e0e9;margin-top:20px;padding-top:16px}.review label{display:block;font-weight:600}select,button,textarea{font:inherit;border:1px solid #aab9cc;border-radius:5px;padding:7px 10px;background:white;color:inherit}textarea{display:block;width:100%;box-sizing:border-box;margin-top:10px;min-height:75px}button{cursor:pointer}.stem{white-space:pre-wrap}article[hidden]{display:none}@media(max-width:600px){main{padding:22px 12px}article{padding:16px}h1{font-size:28px}.stat{flex:1;min-width:80px}.filters label{width:100%}}</style></head><body><main><h1>Qwen authoring pilot</h1><p class="lead">Twenty source-conditioned requests across graphs, circuits, fields and mechanics. Qwen writes the question wording, working and marking points. Figures, scenarios, options and final-answer targets come from checked source packages. Review whether each question supplies the right information and whether its working earns the marks.</p><p>Click a figure for full size. Solutions start closed. Your notes stay in this browser and can be downloaded; they do not accept a training package.</p><div class="stats"><div class="stat"><b>20</b>Requests</div><div class="stat"><b>${snapshot.completedRequests}</b>Completed</div><div class="stat"><b>${counts["awaiting-human-review"] ?? 0}</b>Awaiting review</div><div class="stat"><b>${counts.rejected ?? 0}</b>Rejected</div></div><div class="filters"><label>Family <select id="family"><option value="">All families</option>${["cartesian_plot", "circuit_network", "field_map", "mechanics_scene"].map((value) => `<option>${value}</option>`).join("")}</select></label><label>Paper <select id="paper"><option value="">Both papers</option><option value="1A">Paper 1A</option><option value="2">Paper 2</option></select></label><label>Status <select id="status"><option value="">All outcomes</option>${Object.keys(
      counts,
    )
      .map((value) => `<option>${value}</option>`)
      .join(
        "",
      )}</select></label><button id="download">Download review notes</button></div><p id="visible">Showing 20 requests.</p>${cards}<p>Experiment ${escape(contract.experimentId)}. Development sources only. Educational acceptance, source-use clearance and training metadata remain pending. This run does not measure held-out quality or original scenario generation.</p></main><script>const key=${JSON.stringify(contract.experimentId)};let notes={};try{notes=JSON.parse(localStorage.getItem(key)||"{}")}catch{}function save(){try{localStorage.setItem(key,JSON.stringify(notes))}catch{}}document.querySelectorAll("[data-review],[data-note]").forEach(el=>{const id=el.dataset.review||el.dataset.note;if(notes[id])el.value=el.dataset.review?notes[id].outcome:notes[id].notes;el.addEventListener("input",()=>{const select=document.querySelector('[data-review="'+id+'"]');const text=document.querySelector('[data-note="'+id+'"]');notes[id]={outcome:select.value,notes:text.value};save()})});function filter(){let count=0;document.querySelectorAll("article").forEach(el=>{el.hidden=["family","paper","status"].some(id=>document.getElementById(id).value&&el.dataset[id]!==document.getElementById(id).value);if(!el.hidden)count++});document.getElementById("visible").textContent="Showing "+count+" requests."}["family","paper","status"].forEach(id=>document.getElementById(id).addEventListener("change",filter));document.getElementById("download").addEventListener("click",()=>{const blob=new Blob([JSON.stringify({experimentId:key,reviewType:"informal-notes",notes},null,2)],{type:"application/json"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="qwen-pilot-review-notes.json";link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)});</script></body></html>`,
  );
}

async function main() {
  const pilotDirectory = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(repository, "dataset/_derived/pilot-dataset-v0.1");
  const output = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(repository, "dataset/_derived/qwen-author-baseline-v0.1");
  const pilot = readJson(path.join(pilotDirectory, "pilot-manifest.json"));
  const splits = readJson(path.join(pilotDirectory, "split-manifest.json"));
  if (pilot.inputFingerprint !== splits.inputFingerprint)
    throw new Error("Pilot and split fingerprints disagree");
  const inventory = JSON.parse(
    require("node:child_process").execFileSync(
      process.execPath,
      [path.join(__dirname, "export-packages.cjs")],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    ),
  );
  const tags = await (
    await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(5000),
    })
  ).json();
  const model = tags.models.find((item) => item.name === "qwen3:8b");
  if (!model?.digest)
    throw new Error("Installed local qwen3:8b revision is required");
  const selected = selectSources();
  const codeHashes = Object.fromEntries(
    [
      "lib/generation-harness/ollama-author.ts",
      "lib/generation-harness/ollama-planner.ts",
      "lib/generation-harness/question-run-graph.ts",
      "lib/generation-harness/contracts.ts",
      "scripts/pilot-dataset/run-author-baseline.cjs",
    ].map((file) => [file, sha(fs.readFileSync(path.join(repository, file)))]),
  );
  const identity = {
    pilotId: pilot.pilotId,
    inputFingerprint: pilot.inputFingerprint,
    splitSha256: sha(
      fs.readFileSync(path.join(pilotDirectory, "split-manifest.json")),
    ),
    model: model.name,
    modelDigest: model.digest,
    codeHashes,
    sourcePackageFingerprints: selected.map(({ source, family }) => ({
      id: source.id,
      family,
      fingerprint: replay.packageContentFingerprint(source),
    })),
    seed: 42,
  };
  const experimentId = `qwen-author-20-${sha(JSON.stringify(identity)).slice(0, 16)}`;
  const contractFile = path.join(output, "experiment-contract.json");
  const contract = {
    schemaVersion: "author-baseline-contract/0.1.0",
    experimentId,
    ...identity,
    objective:
      "Measure first-attempt planner/author contract compliance and human-review quality across 20 checked source scenarios.",
    userSelectedScope:
      "20 requests across working families; review every resulting package",
    hypothesis:
      "A local untuned Qwen model can author reviewable questions and marking schemes conditioned on deterministic physics and student figures.",
    requestCount: 20,
    primaryFamilyCounts: {
      cartesian_plot: 5,
      circuit_network: 5,
      field_map: 5,
      mechanics_scene: 5,
    },
    limits: {
      maxModelCalls: 40,
      planAttempts: 1,
      authorAttempts: 1,
      plannerTimeoutMs: 60_000,
      authorTimeoutMs: 120_000,
      batchWallTimeMs: 30 * 60_000,
      paidApiSpend: 0,
      downloadModels: false,
      train: false,
    },
    evidence: [
      "all 20 requests and failures retained",
      "raw requests/replies and model revision retained",
      "candidate shape, option/part identities, final targets and marks checked",
      "human reviews required for prose, givens, working and educational fit",
    ],
    stopRules: [
      "source/split/model/code identities change",
      "call budget exhausted",
      "wall-time limit exceeded",
      "source assigned outside train",
    ],
    interpretation:
      "Development-only source-conditioned authoring with solver-constrained answer targets. No release threshold, held-out accuracy, original-scenario novelty or training-readiness claim.",
  };
  if (fs.existsSync(contractFile)) {
    if (JSON.stringify(readJson(contractFile)) !== JSON.stringify(contract))
      throw new Error(
        "Existing experiment contract differs; use a new output directory",
      );
  } else {
    if (fs.existsSync(output) && fs.readdirSync(output).length)
      throw new Error("Refusing to reuse an unrecognized output directory");
    fs.mkdirSync(output, { recursive: true });
    writeJson(contractFile, contract, "wx");
  }
  for (const directory of [
    "packages",
    "responses",
    "requests",
    "assets",
    "runs",
  ])
    fs.mkdirSync(path.join(output, directory), { recursive: true });
  const prior = fs.existsSync(path.join(output, "results.json"))
    ? readJson(path.join(output, "results.json"))
    : undefined;
  const entries = selected.map(({ source, family }, index) => {
    const membership = splits.questions.find(
      (item) => item.questionId === source.source.questionId,
    );
    if (membership?.split !== "train")
      throw new Error("Checked development source is not in train");
    if (
      !inventory.packages.some(
        (item) => item.packageId === source.id && item.validation.valid,
      )
    )
      throw new Error("Source package failed validation");
    const old = prior?.entries[index];
    return {
      ...old,
      candidateId: `qwen-author-${experimentId.slice(14)}-${index + 1}`,
      sourcePackageId: source.id,
      family,
      paper: source.paper,
      split: membership.split,
      groupId: membership.groupId,
      status: old?.status ?? "pending",
      receipts: old?.receipts ?? [],
    };
  });
  persistVisuals(output, entries);
  writeReport(output, contract, entries);
  const store = new JsonlQuestionRunStore(path.join(output, "runs"));
  if (process.argv.includes("--prepare-only")) {
    console.log(
      JSON.stringify({
        experimentId,
        prepared: entries.length,
        modelCalls: 0,
        output,
      }),
    );
    return;
  }
  const started = Date.now();
  for (const [index, entry] of entries.entries()) {
    const runId = `question-run-${experimentId}-${index + 1}`;
    const old = await store.fetch(runId);
    if (
      old &&
      [
        "awaiting-human-review",
        "rejected",
        "accepted",
        "sent-back-for-repair",
      ].includes(old.status)
    ) {
      Object.assign(entry, {
        runId,
        status: old.status,
        rejection: old.rejection,
        checks: old.checks,
      });
      continue;
    }
    if (old)
      throw new Error(
        "An interrupted model call is preserved. Use a new experiment directory rather than silently spending another attempt.",
      );
    if (Date.now() - started > contract.limits.batchWallTimeMs)
      throw new Error(
        "Batch wall-time limit exceeded; remaining requests are pending",
      );
    const currentTags = await (
      await fetch("http://127.0.0.1:11434/api/tags", {
        signal: AbortSignal.timeout(5000),
      })
    ).json();
    if (
      currentTags.models.find((item) => item.name === model.name)?.digest !==
      model.digest
    )
      throw new Error("Local model revision changed");
    const source = selected[index].source;
    const { request, adapters } = sourceAdapters(source);
    const artifacts = await adapters.solveAndRender(
      await adapters.plan(request),
    );
    const observer = (stage) => ({
      receipt: (receipt) => {
        entry.receipts.push({ stage, ...receipt });
        writeJson(
          path.join(output, "responses", `${entry.candidateId}-receipts.json`),
          entry.receipts,
        );
      },
      content: (content) =>
        fs.writeFileSync(
          path.join(output, "responses", `${entry.candidateId}-${stage}.txt`),
          content,
          { flag: "wx" },
        ),
      request: (body) => {
        if (fs.readdirSync(path.join(output, "requests")).length >= 40)
          throw new Error("Model-call budget exhausted");
        writeJson(
          path.join(output, "requests", `${entry.candidateId}-${stage}.json`),
          body,
          "wx",
        );
      },
    });
    const plannerObserver = observer("plan");
    const authorObserver = observer("author");
    let candidate;
    const plan = createOllamaPlanner(
      [
        {
          scenarioKind: source.scenario.kind,
          visualFamilies: artifacts.renderedVisuals.map((item) => item.family),
        },
      ],
      DEFAULT_LOCAL_MODEL_CONFIG,
      plannerObserver.receipt,
      plannerObserver.content,
      plannerObserver.request,
    );
    const author = createOllamaAuthor(
      source,
      entry.candidateId,
      async (item) => {
        candidate = item;
        writeJson(path.join(output, "packages", `${item.id}.json`), item, "wx");
      },
      undefined,
      authorObserver.receipt,
      authorObserver.content,
      authorObserver.request,
    );
    entry.status = "running";
    writeReport(output, contract, entries);
    const run = await runQuestionGraph(
      request,
      {
        ...adapters,
        plan,
        author,
        async validatePackage(summary, blueprint, verified) {
          if (
            !candidate ||
            !validateArtifact("question-package-artifact", summary).valid ||
            summary.contentFingerprint !==
              replay.packageContentFingerprint(
                parseModelAuthoredPackage(candidate),
              ) ||
            summary.paper !== blueprint.paper ||
            JSON.stringify(summary.visualFamilies) !==
              JSON.stringify(
                verified.renderedVisuals.map((item) => item.family),
              )
          )
            throw new QuestionRunStageError(
              "package-validation-failed",
              "Candidate summary does not bind to its persisted content and figures",
            );
        },
        async checkNovelty() {
          return {
            schemaVersion: "novelty-assessment/0.1.0",
            status: "not-run",
            reason:
              "Source-conditioned authoring on a fixed checked parent scenario; originality is not assessed",
            nearestCandidateIds: [source.id],
          };
        },
        async prepareReview(summary, checks) {
          return {
            schemaVersion: "question-review-envelope/0.1.0",
            package: summary,
            deterministicCheckIds: checks
              .filter((check) => check.outcome === "passed")
              .map((check) => check.id),
            requiredHumanChecks: [
              "givens and fixed figures agree with authored prose",
              "working is physically correct and earns the allocated marks",
              "no solution is leaked into student wording",
              "educational fit, source-use rights and training metadata",
            ],
            agentReview: {
              status: "not-run",
              reason: "Separate quality review follows the untuned run",
            },
            decisionAuthority: "human",
            trainingEligibility: "blocked",
            trainingBlockers: summary.trainingBlockers,
          };
        },
      },
      { store, runId, retryLimits: { plan: 1, author: 1 } },
    );
    const recovered = await new JsonlQuestionRunStore(
      path.join(output, "runs"),
    ).resume(run.runId);
    if (JSON.stringify(recovered) !== JSON.stringify(run))
      throw new Error("Run did not survive store restart");
    Object.assign(entry, {
      runId: run.runId,
      status: run.status,
      rejection: run.rejection,
      checks: run.checks,
    });
    writeReport(output, contract, entries);
    console.log(
      JSON.stringify({
        request: index + 1,
        total: 20,
        family: entry.family,
        paper: entry.paper,
        status: entry.status,
        modelCalls: entry.receipts.length,
        rejection: entry.rejection?.message,
      }),
    );
  }
  writeReport(output, contract, entries);
  console.log(
    JSON.stringify({
      experimentId,
      completed: entries.filter((item) => item.status !== "pending").length,
      awaitingReview: entries.filter(
        (item) => item.status === "awaiting-human-review",
      ).length,
      rejected: entries.filter((item) => item.status === "rejected").length,
      report: path.join(output, "index.html"),
    }),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
