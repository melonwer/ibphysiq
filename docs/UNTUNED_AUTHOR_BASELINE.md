# Untuned authoring pilot

This is historical source-conditioned engineering evidence. It copied supplied
question objects and is not the new-question review batch. The separate
[synthetic pilot](SYNTHETIC_QUESTION_PILOT.md) contains 20 freshly authored checked
questions.

The first model experiment uses 20 checked source scenarios, five each from
Cartesian plots, circuits, fields and mechanics scenes. Eleven requests are Paper
1A and nine are Paper 2. Level coverage follows the checked sources and is not balanced.

Qwen plans each supported scenario and writes the stem, part prompts, working and
marking points. Deterministic solvers and renderers supply verified results and
fixed figures. Options, final-answer targets, part IDs and marks are constrained
to the checked source. Answer-target agreement therefore does not independently
measure the model's physics-solving ability. Humans must check the working.

The full candidate is stored separately under
`model-authored-question-package/0.1.0`. Its native run references its own ID and
content fingerprint. Existing source-fixed validators remain unchanged. Candidate
checks establish structure and target bindings; givens, prose, reasoning, figure
agreement and marking quality still need review.

All parents are protected development sources in train. Candidates inherit train.
This experiment measures source-conditioned authoring, with no held-out quality,
original scenario diversity or training-readiness claim.

The 2026-10-01 run completed all 20 requests with 40 local model calls. Fifteen
candidates passed automated structure/target checks and await review; five were
rejected for marking errors. The model copied all 20 supplied question objects
verbatim, so this run mainly measures its working and marking points. Diagnostic
review found material issues in 11 outputs and minor or contract issues in four.
Five had no material issue identified. These observations record no human
acceptance and are not a held-out quality score.

The report preserves each finding with its raw JSON pointer, quoted evidence,
proposed repair and origin. One sign-question mismatch comes from the checked
source contract rather than new model wording. It is recorded for a revised
source version; the frozen experiment inputs remain unchanged.

A first rejected author output exposed a store bug: rejection replay failed to
carry its failing stage. A regression test reproduced the failure, and the reducer
now restores that stage. The fifth request was recovered from its saved reply with
zero extra model calls. `runtime-repair.json` and original code snapshots preserve
that correction separately from model-prompt versions.

## Run and inspect

Ollama must already serve `qwen3:8b` on `http://127.0.0.1:11434`. The command checks
its installed digest and uses no downloads or paid provider.

```bash
node scripts/pilot-dataset/run-author-baseline.cjs \
  dataset/_derived/pilot-dataset-v0.1 \
  dataset/_derived/qwen-author-baseline-v0.1 --prepare-only
node scripts/pilot-dataset/run-author-baseline.cjs
```

Preparation writes the contract and page with zero model calls. The run permits
one planner call and one author call per request, at most 40 calls. The contract
records temperature zero, seed 42, thinking disabled, output/time limits, model
revision, code hashes and source/split fingerprints. First-attempt failures remain
in the results. Repair generations are separate experiments.

Open `dataset/_derived/qwen-author-baseline-v0.1/index.html`. Every request remains
visible, including rejected raw outputs and failure reasons. Figures open at full
size. Model solutions and reference targets start closed. Informal notes persist
in the browser and can be downloaded; they do not mutate authenticated review
decisions. After verification, the folder is also copied under
`/home/d4ydy/ibphysiq/dataset/_derived/` in the usual checkout.

`experiment-contract.json` freezes scope and identity. `requests/` and `responses/`
preserve actual inputs, replies and receipts. `packages/` contains candidates that
pass the content boundary. `runs/` is the native durable store. `results.json`
records every outcome. Completed reruns reuse runs without new model calls.
Interrupted calls are preserved and reported rather than silently retried.

Verify actual candidates, figures, native review resolution and a completed restart:

```bash
node scripts/pilot-dataset/verify-author-baseline.cjs
```

The diagnostic page uses local KaTeX assets for offline math rendering. It displays
JSON form-feed/tab escapes in LaTeX commands as the intended fraction/text commands
without changing raw replies or saved candidates. `report-presentation.json`
records these display-only normalizations.

## Authenticated review

Use the admin-token/session setup in [the harness guide](QUESTION_GENERATION_HARNESS.md)
and point the review service at the experiment directories:

```bash
REVIEW_RUN_STORE_DIR="$PWD/dataset/_derived/qwen-author-baseline-v0.1/runs" \
REVIEW_PACKAGE_DIR="$PWD/dataset/_derived/qwen-author-baseline-v0.1/packages" \
npm run dev
```

The candidate resolver checks source identity, provenance, solver results and
figure specifications. Review decisions retain authentication and exact-content
binding. Rejected attempts remain in the offline report and cannot receive
approval through the accepted-package path.

Preserve these failures and diagnostics when changing the author adapter.
Fresh-scenario Qwen generation and a held-out baseline remain necessary before
scaling data or training.
