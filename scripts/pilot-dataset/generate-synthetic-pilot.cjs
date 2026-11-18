const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText, filename);
};
const { buildSyntheticPilot, validateSyntheticPackage } = require("../../lib/visuals/synthetic-pilot.ts");
const { renderCartesianPlot } = require("../../lib/visuals/render-cartesian.ts");
const { renderCircuitNetwork } = require("../../lib/visuals/render-circuit.ts");
const { renderFieldMap } = require("../../lib/visuals/render-field-map.ts");
const { renderMechanicsScene } = require("../../lib/visuals/render-mechanics.ts");
const { CIRCUIT_QUESTION_PACKAGES } = require("../../lib/visuals/circuit-question-packages.ts");
const { FIELD_QUESTION_PACKAGES } = require("../../lib/visuals/field-question-packages.ts");
const { MECHANICS_QUESTION_PACKAGES } = require("../../lib/visuals/mechanics-question-packages.ts");
const root = path.resolve(__dirname, "../..");
const output = path.resolve(process.argv[2] ?? path.join(root, "dataset/_derived/new-question-pilot-v0.1"));
const splitPath = path.join(root, "dataset/_derived/pilot-dataset-v0.1/split-manifest.json");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const json = value => JSON.stringify(value, null, 2) + "\n";
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const splitRaw = fs.readFileSync(splitPath);
const split = JSON.parse(splitRaw);
if (split.schemaVersion !== "source-group-splits/0.1.0" || !Array.isArray(split.groups)) throw new Error("Unsupported source split manifest");
const parentGroups = new Map();
for (const group of split.groups) {
  if (typeof group.groupId !== "string" || !["train", "validation", "test"].includes(group.split) || !Array.isArray(group.questionIds)) throw new Error("Invalid source group");
  for (const id of group.questionIds) {
    if (parentGroups.has(id)) throw new Error("Source appears in multiple groups");
    parentGroups.set(id, group);
  }
}
const sourcePackages = [...CIRCUIT_QUESTION_PACKAGES, ...FIELD_QUESTION_PACKAGES, ...MECHANICS_QUESTION_PACKAGES];
const sourceQuestionStrings = new Set(sourcePackages.map(p => JSON.stringify(p.question)));
const beforeSourceHash = sha(json(sourcePackages));
const generated = buildSyntheticPilot();
const packages = generated.map(item => {
  const issues = validateSyntheticPackage(item);
  if (issues.length) throw new Error(`${item.id}: ${issues.join("; ")}`);
  if (sourceQuestionStrings.has(JSON.stringify(item.question))) throw new Error(`${item.id}: source question replica`);
  const group = parentGroups.get(item.lineage.parentQuestionId);
  if (!group || group.split !== "train") throw new Error(`${item.id}: synthetic descendant must inherit its train parent`);
  return { ...item, lineage: { ...item.lineage, parentGroupId: group.groupId, split: group.split, splitManifestId: split.pilotId } };
});
if (packages.length !== 20 || new Set(packages.map(p => p.id)).size !== 20 || new Set(packages.map(p => JSON.stringify(p.question))).size !== 20) throw new Error("Expected 20 distinct fresh question packages");
if (beforeSourceHash !== sha(json(sourcePackages))) throw new Error("Canonical source packages changed during generation");
const batchId = "synthetic-20-" + sha(json(packages)).slice(0, 16);
const familyLabels = { cartesian_plot: "Graphs", circuit_network: "Circuits", field_map: "Fields", mechanics_scene: "Mechanics" };
const counts = Object.fromEntries(Object.keys(familyLabels).map(family => [family, packages.filter(p => p.visual.family === family).length]));
if (Object.values(counts).some(n => n !== 5)) throw new Error("Expected five packages per family");
const stage = output + `.stage-${process.pid}`;
fs.mkdirSync(path.join(stage, "figures"), { recursive: true });
fs.mkdirSync(path.join(stage, "packages"), { recursive: true });
for (const item of packages) {
  const v = item.visual;
  const svg = v.family === "cartesian_plot" ? renderCartesianPlot(v.spec, v.data)
    : v.family === "circuit_network" ? renderCircuitNetwork(v.spec)
    : v.family === "field_map" ? renderFieldMap(v.spec) : renderMechanicsScene(v.spec);
  if (!svg.startsWith("<svg") || /(?:NaN|Infinity|undefined|<script)/.test(svg)) throw new Error(`${item.id}: invalid student SVG`);
  fs.writeFileSync(path.join(stage, "figures", item.id + ".svg"), svg);
  fs.writeFileSync(path.join(stage, "packages", item.id + ".json"), json(item));
}
const manifest = {
  schemaVersion: "synthetic-pilot-manifest/0.1.0", batchId, packageCount: packages.length,
  author: "deterministic-code", description: "Twenty newly authored complete practice questions with fresh scenarios, givens and assessment tasks. No source question text is copied. This batch makes no claim about Qwen generation quality.",
  familyCounts: counts, paperCounts: { "1A": packages.filter(p => p.paper === "1A").length, "2": packages.filter(p => p.paper === "2").length },
  lineage: { splitManifestId: split.pilotId, splitManifestSha256: sha(splitRaw), split: "train", parentGroupCount: new Set(packages.map(p => p.lineage.parentGroupId)).size, relationship: "development-template-family", policy: "Template-family descendants inherit their train parent. Twenty generated questions do not mean twenty independent source families." },
  reviewStatus: "awaiting-human-review", trainingEligibility: "blocked-pending-review-and-source-use-clearance",
  inputHashes: { sourcePackageSnapshotSha256: beforeSourceHash, generatorSha256: sha(fs.readFileSync(path.join(root, "lib/visuals/synthetic-pilot.ts"))), measurementAxisSha256: sha(fs.readFileSync(path.join(root, "lib/visuals/measurement-axis.ts"))), publisherSha256: sha(fs.readFileSync(__filename)) },
  packages: packages.map(p => ({ id: p.id, title: p.title, family: p.visual.family, paper: p.paper, level: p.level, marks: p.marks, lineage: p.lineage, package: `packages/${p.id}.json`, figure: `figures/${p.id}.svg`, fingerprint: sha(json(p)) })),
};
const list = items => `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
const cards = packages.map((item, i) => {
  const question = item.question;
  const student = question.kind === "multiple-choice"
    ? `<div class="options">${question.options.map(o => `<label><input type="radio" name="${item.id}" value="${o.id}"><b>${o.id}</b><span>${escapeHtml(o.text)}</span></label>`).join("")}</div>`
    : `<ol class="parts" type="a">${question.parts.map(p => `<li><span>${escapeHtml(p.prompt)}</span><b>[${p.marks}]</b></li>`).join("")}</ol>`;
  const solution = item.solution.parts.map(p => `<section>${question.kind === "multipart" ? `<h4>Part (${p.partId}) <span>[${p.marks}]</span></h4>` : `<h4>Answer ${item.solution.correctOptionId}</h4>`}${list(p.working)}<p class="answer">${escapeHtml(p.finalAnswer)}</p><div class="marking"><b>Marking points</b>${list(p.markingPoints)}</div></section>`).join("");
  return `<article id="${item.id}" data-family="${item.visual.family}" data-paper="${item.paper}" data-level="${item.level}"><div class="card-top"><span class="number">${String(i + 1).padStart(2, "0")}</span><div><p class="eyebrow">${familyLabels[item.visual.family]} · Paper ${item.paper} · ${item.level} · ${item.marks} ${item.marks === 1 ? "mark" : "marks"}</p><h2>${escapeHtml(item.title)}</h2></div></div><p class="stem">${escapeHtml(question.stem)}</p><a class="figure" href="figures/${item.id}.svg" target="_blank" rel="noopener"><img src="figures/${item.id}.svg" alt="Diagram for ${escapeHtml(item.title)}"></a>${student}<details class="solution"><summary>Show answer and mark scheme</summary>${solution}</details><details class="review"><summary>Your review</summary><label>Decision<select data-review="${item.id}"><option value="pending">Pending</option><option value="accept">Looks good</option><option value="repair">Needs a change</option><option value="reject">Reject</option></select></label><label>Notes<textarea data-note="${item.id}" rows="3" placeholder="Wording, diagram or solution feedback"></textarea></label><p class="muted">Saved in this browser. Download your notes to share them.</p></details><details class="provenance"><summary>Generation and lineage</summary><p>New question authored by deterministic code. Split: train. Template-family parent: ${escapeHtml(item.lineage.parentQuestionId)}.</p><p>Assessment: ${escapeHtml(item.assessmentTargets.join("; "))}.</p><a href="packages/${item.id}.json" target="_blank" rel="noopener">Complete package JSON</a></details></article>`;
}).join("\n");
const options = (values, labels = values) => values.map((v, i) => `<option value="${v}">${labels[i]}</option>`).join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>20 new Physics questions</title><style>
*{box-sizing:border-box}body{margin:0;background:#f2f5f7;color:#172b3a;font:16px/1.6 system-ui,sans-serif}main{max-width:970px;margin:auto;padding:32px 22px 70px}header{padding:12px 0 24px}h1{font-size:clamp(28px,5vw,42px);line-height:1.2;margin:8px 0 14px}h2{font-size:23px;line-height:1.3;margin:0}h4{margin:18px 0 8px}.eyebrow{font-size:12px;color:#486678;text-transform:uppercase;letter-spacing:.07em;margin:0 0 5px}.lead{max-width:740px;color:#456070}.badge{display:inline-block;font-size:13px;background:#dceee9;color:#185545;padding:3px 10px;border-radius:5px}.toolbar{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin:14px 0 18px}.toolbar label{flex:1;min-width:145px}.toolbar label span{display:block;font-size:13px;margin-bottom:4px}select,textarea,button{font:inherit;border:1px solid #b6c8d2;border-radius:6px;background:white;padding:9px 12px;color:inherit}select,textarea{width:100%}button{cursor:pointer;background:#164f69;color:white;border-color:#164f69;font-size:14px}a{color:#145e83}article{background:white;border:1px solid #d7e1e7;border-radius:12px;padding:26px;margin:0 0 25px;box-shadow:0 3px 12px #14293a06;overflow-wrap:anywhere}article[hidden]{display:none}.card-top{display:flex;gap:14px;align-items:start}.number{flex-shrink:0;white-space:nowrap;background:#edf3f7;color:#24526c;padding:5px 10px;border-radius:6px;font-weight:700}.stem{margin:20px 0 12px}.figure{display:block;text-align:center;background:#fff;margin:16px 0 22px;border:1px solid #edf1f4;border-radius:8px;padding:5px}.figure img{display:block;width:100%;max-width:850px;max-height:440px;object-fit:contain;margin:auto}.options{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}.options label{display:flex;gap:12px;align-items:center;border:1px solid #d9e3e8;border-radius:6px;padding:12px;cursor:pointer}.options label:has(input:checked){background:#e8f4f8;border-color:#3684a6}.options input{margin:0;flex-shrink:0}.parts{padding-left:25px}.parts li{padding-left:5px;margin:12px 0}.parts li b{float:right;padding-left:12px;font-size:14px}details{border-top:1px solid #e1e8ed;margin-top:18px;padding-top:12px}summary{cursor:pointer;font-weight:600;color:#21536c}details section{padding:4px 0}.solution{background:#f5f9fb;padding:12px 16px;border-radius:7px}.solution ul{padding-left:22px}.solution li{margin:8px 0}.answer{font-weight:700;color:#145443}.marking{font-size:14px;color:#4b6370}.review label{display:block;margin-top:12px}.review select,.review textarea{display:block;margin-top:5px}.muted,.provenance{font-size:13px;color:#5b717f}#count{font-size:14px;color:#526d7c}#storage-warning{color:#8a331c;font-size:14px}footer{font-size:13px;color:#5b717f}@media(max-width:550px){main{padding:20px 12px 40px}article{padding:18px 14px}.options{grid-template-columns:1fr}h2{font-size:20px}.card-top{gap:10px}.figure{padding:0}.toolbar{gap:9px}.toolbar label{min-width:100px}.solution{padding:10px}.number{padding:4px 7px}}
</style></head><body><main><header><p class="eyebrow">IBPhysiq · New question pilot</p><h1>20 new Physics questions</h1><span class="badge">5 graphs · 5 circuits · 5 fields · 5 mechanics</span><p class="lead">New scenarios and assessment tasks, with diagrams and checked solutions. These questions were authored by deterministic generation code. The previously accepted reconstructions are not included in this review.</p><p class="muted">10 multiple-choice questions and 10 multipart questions. Answers stay hidden until you open them. Click a diagram to view it at full size.</p></header><div class="toolbar"><label><span>Family</span><select id="family"><option value="">All families</option>${options(Object.keys(familyLabels), Object.values(familyLabels))}</select></label><label><span>Paper</span><select id="paper"><option value="">Both papers</option>${options(["1A", "2"], ["Paper 1A", "Paper 2"])}</select></label><label><span>Level</span><select id="level"><option value="">Both levels</option>${options(["SL", "HL"])}</select></label><button id="download">Download review notes</button></div><p id="count" aria-live="polite">20 questions</p><p id="storage-warning" hidden></p>${cards}<footer>Batch ${batchId}. All 20 inherit train-only template-family lineage. Awaiting review and source-use clearance before training export. <a href="manifest.json">Manifest</a> · <a href="questions.jsonl">All packages</a></footer></main><script>
const batchId=${JSON.stringify(batchId)},key=batchId+'-review';let notes={};
try{notes=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){const warning=document.querySelector('#storage-warning');warning.hidden=false;warning.textContent='Browser storage is unavailable. Download your notes before closing this page.'}
function save(){try{localStorage.setItem(key,JSON.stringify(notes))}catch(e){const warning=document.querySelector('#storage-warning');warning.hidden=false;warning.textContent='Browser storage is unavailable. Download your notes before closing this page.'}}
document.querySelectorAll('[data-review]').forEach(el=>{const id=el.dataset.review;el.value=notes[id]?.decision||'pending';el.addEventListener('change',()=>{notes[id]={...notes[id],decision:el.value};save()})});
document.querySelectorAll('[data-note]').forEach(el=>{const id=el.dataset.note;el.value=notes[id]?.note||'';el.addEventListener('input',()=>{notes[id]={...notes[id],note:el.value};save()})});
function filter(){const fields=['family','paper','level'];let count=0;document.querySelectorAll('article').forEach(el=>{el.hidden=fields.some(field=>document.getElementById(field).value&&el.dataset[field]!==document.getElementById(field).value);if(!el.hidden)count++});document.querySelector('#count').textContent=count+' question'+(count===1?'':'s')}
['family','paper','level'].forEach(id=>document.getElementById(id).addEventListener('change',filter));
document.querySelector('#download').addEventListener('click',()=>{const rows=[...document.querySelectorAll('article')].map(el=>({packageId:el.id,decision:notes[el.id]?.decision||'pending',note:notes[el.id]?.note||''}));const blob=new Blob([JSON.stringify({schemaVersion:'synthetic-review-notes/0.1.0',batchId,reviewType:'informal-human-notes',packages:rows},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=batchId+'-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
</script></body></html>`;
fs.writeFileSync(path.join(stage, "index.html"), html);
fs.writeFileSync(path.join(stage, "manifest.json"), json(manifest));
fs.writeFileSync(path.join(stage, "questions.jsonl"), packages.map(p => JSON.stringify(p)).join("\n") + "\n");
fs.writeFileSync(path.join(stage, "split-manifest.json"), json({ schemaVersion: "synthetic-descendant-splits/0.1.0", batchId, parentSplitManifestId: split.pilotId, parentSplitManifestSha256: sha(splitRaw), packages: packages.map(p => ({ id: p.id, ...p.lineage })) }));
fs.writeFileSync(path.join(stage, "verification-generation.json"), json({ batchId, completePackages: 20, checkedPhysics: 20, renderedStudentFigures: 20, sourceQuestionReplicas: 0, sourcePackagesUnchanged: true, allDescendantsTrain: true, humanDecisionsRecorded: 0 }));
if (fs.existsSync(output)) fs.renameSync(output, output + ".backup-" + new Date().toISOString().replace(/[:.]/g, "-"));
fs.renameSync(stage, output);
process.stdout.write(json({ output, batchId, packages: packages.length, familyCounts: counts, paperCounts: manifest.paperCounts, parentGroups: manifest.lineage.parentGroupCount }));
