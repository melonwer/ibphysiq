# SixthPhysics Question Bank & `Qwen/Qwen3.5-9B` Distillation Pipeline

This document specifies the deterministic verification, lock-free sharding, static bank compilation, and contamination-free `Qwen/Qwen3.5-9B` distillation pipeline implemented in [lib/bank-pipeline/](../lib/bank-pipeline/) and [scripts/bank-generation/](../scripts/bank-generation/).

---

## 1. Dual-Output Architecture

Every solver-verified candidate question ingested by the pipeline produces two synchronized artifacts inside an isolated per-worker shard (`dataset/sixthphysics-bank/shards/<shard-id>.jsonl`):

1. **`SixthPhysicsBankItem` (`sixthphysics-bank-item/1.0.0`)** — Compact, self-contained student question package for static deployment on `sixthphysics.github.io` across **IB Physics (SL/HL)**, **UK A-Level Physics (AS/A2)**, and **NCUK IFY Physics**:
   - Multi-syllabus metadata (`syllabi: Array<{ syllabus, level, topicId, subtopicId? }>`)
   - Student `stem` and deterministic, zero-leakage inline `svgMarkup`
   - Format-specific body:
     - **`mcq`**: 4 distinct options `A`–`D` with misconception `distractorRationale` on every distractor and verified `correctOptionIndex` (`0 | 1 | 2 | 3`)
     - **`structured`**: Ordered Paper 2 `parts` with explicit `dependsOnPartIds`, `marks`, `expectedAnswer`, and `workingSteps`
   - `workedSolution`, `markScheme: Array<{ code, criterion, marks, partId? }>`, `totalMarks`, `verifiedQuantities`, and full `provenance`
2. **`QwenDistillationTrace` (`qwen-distillation-trace/1.0.0`)** — Exact 5-message neuro-symbolic SFT trajectory for QLoRA fine-tuning **`Qwen/Qwen3.5-9B`** (24 GB VRAM RTX 5090):
   - `messages[0]` (`system`): Two-step deterministic harness contract
   - `messages[1]` (`user`): Target syllabus, concept, domain, visual family, format, difficulty, and RNG seed
   - `messages[2]` (`assistant`, `step: "propose_scenario"`): Structured `solve_and_render_scenario` proposal containing `scenarioSpec`, `hiddenQuantities`, and strictly pre-solve `questionPlan` (generic pre-solve misconception/subpart strategy tags—never leaking post-solve `distractorRationale` strings or solved numbers)
   - `messages[3]` (`tool`, `name: "physics_harness"`): Deterministic solver receipt (`verifiedQuantities`, `formattedQuantities3sf`, `visualReceipt`)
   - `messages[4]` (`assistant`, `step: "author_package"`): Verified student question package, distractors/subparts, worked solution, and mark scheme matching exact solver outputs

---

## 2. Contamination-Free `70 / 15 / 15` Split Assignment

Implemented in [split-assigner.ts](../lib/bank-pipeline/split-assigner.ts):

- Every item is assigned to `train` (`70%`), `val` (`15%`), or `test` (`15%`) using 48 bits of `SHA-256("${salt}::${familyGroupKey}")`.
- Primary `familyGroupKey` is `${conceptId}::${templateArchetype}`; when `sourceParentId` is also present (`source::${sourceParentId}`), union-find connected components (`assignSplitsForBatch`) and `verifyZeroSplitContamination` enforce disjointness across **both** `conceptId::templateArchetype` and `sourceParentId` so shared archetypes and shared source lineages never cross splits.
- **Zero parametric leakage**: All seed/parameter variants of an archetype or connected source lineage stay in **one split**.
- **Held-out freeze (`lockHeldOut: true`)**: `compile-bank.ts` emits `distillation/frozen-eval-manifest.json` (`sixthphysics-frozen-eval-manifest/1.0.0`) with a canonical SHA-256 checksum locking `val` and `test` family groups and item IDs prior to QLoRA training. Passing `--frozen-manifest` keeps `val` and `test` 100% immutable: unseen post-freeze family groups route strictly to `train` (recorded under `newPostFreezeFamiliesRoutedToTrain` in `SUMMARY.json`), while any attempt to add, move, or remove frozen `val`/`test` membership is rejected.

---

## 3. Deterministic Verification Gate (`package-gate.ts`)

Implemented in [package-gate.ts](../lib/bank-pipeline/package-gate.ts), [numeric-checker.ts](../lib/bank-pipeline/numeric-checker.ts), and [svg-guard.ts](../lib/bank-pipeline/svg-guard.ts). A candidate is rejected with structured `GateDiagnosticIssue` repair hints if any check fails:

| Stage | Rejection Codes | Enforced Invariant |
| --- | --- | --- |
| `schema` | `invalid-candidate-schema` | Valid IDs, integer seed, syllabus tags (`ib`/`alevel`/`ncuk`), format, difficulty, positive `totalMarks` |
| `solver` | `unknown-domain`, `scenario-validation-failed`, `solver-error`, `non-finite-solver-output` | Domain constraints hold; deterministic solver succeeds with finite outputs |
| `svg` | `svg-render-error`, `svg-xml-invalid`, `svg-answer-leak` | Balanced XML tags, valid `xmlns` & `viewBox`, graphic primitives present, zero `NaN`/`Infinity`/`<script>`, and zero `hiddenQuantities` leaked in `<text>`, `<tspan>`, `<title>`, `<desc>`, or `aria-label` |
| `givens` | `missing-required-given`, `stem-answer-leak` | Every required physical given is visible in student prose or SVG (supporting SI prefixes such as `kΩ`, `mA`, `nC` and scientific notation); hidden target answers never appear in student stem |
| `mcq` | `mcq-invalid-options`, `mcq-duplicate-options`, `mcq-non-unique-correct`, `mcq-distractor-matches-answer`, `mcq-missing-distractor-rationale` | Exactly 4 distinct options `A`–`D` (catching equivalent formatting like `24 W` vs `24.0 W` while preserving directional vector contrasts), 1 correct option, and misconception rationales on all 3 distractors |
| `structured` / `mark-scheme` | `structured-invalid-parts`, `structured-dependency-invalid`, `mark-sum-mismatch`, `mark-scheme-coverage-mismatch` | Acyclic forward `dependsOnPartIds`, part marks sum to `totalMarks`, and `markScheme` points cover every mark of every subpart |
| `ground-truth` | `ground-truth-mismatch` | Mandatory resolvable `targetQuantityKey` on all quantitative MCQs and all numeric structured subparts (plus at least 1 solver-verified quantitative subpart per quantitative structured item); only explicit `targetMode: "qualitative"` items with non-numeric solver classifications may omit numeric targets. Correct options, subpart `expectedAnswer`s, `workedSolution`, and `markScheme` must agree with solver `verifiedQuantities` within 3 s.f. tolerance (`1%` default) |
| `deduplication` | `near-duplicate-stem` | Canonical number-normalized stem SHA-256 fingerprint and 3-gram shingle Jaccard similarity (`< 0.90`) prevent duplicate or trivially paraphrased items |

---

## 4. Domain Registry (All 10 Visual Domains + `pure-calculation` Out of the Box)

[domain-registry.ts](../lib/bank-pipeline/domain-registry.ts) registers all 10 deterministic physics/SVG domains plus figureless `pure-calculation` out of the box with zero runtime setup:

- `graphs` (`cartesian_plot`): `rover-distance`, `cart-work`, `shuttle-motion`, `lift-acceleration`, `glider-momentum`, plus general `piecewise-linear-graph`
- `circuits` (`circuit_network`): `branch-heater`, `sensor-current`, `battery-energy`, `resistor-network`, `light-alarm`, `CircuitQuestionPackage` kinds, plus general `dc-series-parallel`
- `fields` (`field_map`): `charge-field`, `field-work`, `null-potential`, `negative-probe`, `guided-bead`, `FieldQuestionPackage` kinds, plus `parallel-plates-particle`
- `mechanics` (`mechanics_scene`): `collision-loss`, `circle-limit`, `ramp-heating`, `short-ramp`, `pendulum-loss`, `MechanicsScenario` kinds, plus `projectile-kinematics`
- `waves` (`waves`): [lib/visuals/waves/](../lib/visuals/waves/) (`progressive-wave`, `standing-wave`, `double-slit`, `diffraction-grating`, `single-slit`, `doppler-effect`, `malus-polarization`)
- `optics-shm` (`optics-shm`): [lib/visuals/optics-shm/](../lib/visuals/optics-shm/) (`planar-refraction`, `multi-layer-slab`, `optical-fiber`, `thin-lens`, `mass-spring-shm`, `simple-pendulum-shm`, `kinematic-shm`)
- `thermal` (`thermal`): [lib/visuals/thermal/](../lib/visuals/thermal/) (`thermodynamic-process`, `carnot-cycle`, `phase-change-curve`, `calorimetry-mixing`, `kinetic-theory`, `thermal-radiation`)
- `grav-astro` (`grav-astro`): [lib/visuals/grav-astro/](../lib/visuals/grav-astro/) (`conical-pendulum`, `flat-curve`, `banked-curve`, `vertical-circle`, `planetary-field-potential`, `circular-orbit-energy`, `two-body-null-point`, `stellar-radiation`, `hr-diagram`, `stellar-parallax`, `cosmological-redshift`)
- `em-induction` (`em-induction`): [lib/visuals/em-induction/](../lib/visuals/em-induction/) (`parallel-plate-capacitor`, `capacitor-network`, `rc-transient`, `flux-faraday`, `motional-emf-rails`, `ac-generator`, `transformer`, `electric-deflection`, `magnetic-cyclotron`, `velocity-selector`, `bainbridge-mass-spectrometer`)
- `quantum-nuclear` (`quantum-nuclear`): [lib/visuals/quantum-nuclear/](../lib/visuals/quantum-nuclear/) (`energy-levels`, `photoelectric-effect`, `matter-waves`, `radioactive-decay`, `nuclear-decay-chain`, `nuclear-binding`, `rutherford-scattering`, `special-relativity`)
- `pure-calculation` (`none`): `suvat-motion`, `power-efficiency`, `uncertainty-power-product`, `momentum-impulse`

`registerVisualModule` normalizes flat/`{ quantities }`/`QuantityValue`/nested solver returns, `{ valid, issues, errors }` validation results, and merges `spec.hiddenQuantities` + `spec.visibility.hiddenQuantities` + candidate `hiddenQuantities` into both `mergedSpec` and the 2nd `{ hiddenQuantities }` render options argument.

---

## 5. CLI Workflows for Parallel Swarm Workers

### A. Plan Non-Overlapping Work Orders

[work-order-planner.ts](../lib/bank-pipeline/work-order-planner.ts) connects directly to [lib/constants/syllabi/](../lib/constants/syllabi/) (`SYLLABUS_CROSSWALK` + `getGeneratableSlices`) to plan 539 spec-accurate slices (`532` core slices with `--exclude-options`) across `ib` (`SL`/`HL`), `alevel` (`Y12`/`Y13`), and `ncuk` (`IFY`/`IFY-S1`/`IFY-S2`) across all 10 visual domains without ever assigning excluded topics (e.g. thin lenses or capacitors to IB 2025):

```bash
npx tsx scripts/bank-generation/plan-work-orders.ts \
  --items-per-slice 20 \
  --max-per-shard 20 \
  --base-seed 100000 \
  --output dataset/sixthphysics-bank/work-orders.json
```

Use `--syllabi ib,alevel,ncuk`, `--levels SL,HL,Y12,Y13,IFY,IFY-S1,IFY-S2`, `--domains waves,optics-shm,thermal`, `--exclude-options`, or `--include-pure-calculation` to target specific slices.

### B. Verify & Ingest a Worker Shard (Lock-Free)

Recommended two-step worker loop matching the neuro-symbolic harness:

1. **Preview exact solver outputs (`--solve-only`)** prior to authoring prose:
   ```bash
   npx tsx scripts/bank-generation/verify-and-ingest-shard.ts \
     --solve-only \
     --input /tmp/worker-scenarios.json
   ```
2. **Verify and ingest authored candidates** into your dedicated shard (`dataset/sixthphysics-bank/shards/<shard-id>.jsonl`):
   ```bash
   npx tsx scripts/bank-generation/verify-and-ingest-shard.ts \
     --shard wo-0001-ib-sl-graphs-si-units-dimensional-analysis-mcq \
     --input /tmp/worker-candidates.json
   ```
   - Passing items are appended immediately to `<shard-id>.jsonl` (if an interrupted process left a trailing incomplete/unterminated JSON fragment, shard ingestion atomically truncates/repairs up to the last valid newline-terminated record before appending).
   - If any item is rejected, inspect `results[].issues` (`code`, `expected`, `actual`, `repairHint`), repair the rejected entries in `/tmp/worker-candidates.json`, and re-run the exact same command: already-ingested item IDs are skipped idempotently (`status: "already-present"`).

To emit a reference batch of 15 verified candidates across all 10 visual domains (`graphs`, `circuits`, `fields`, `mechanics`, `waves`, `optics-shm`, `thermal`, `grav-astro`, `em-induction`, `quantum-nuclear`) and `pure-calculation`:

```bash
npx tsx scripts/bank-generation/verify-and-ingest-shard.ts --emit-sample /tmp/sample-candidates.json
```

### C. Compile Static Bank Bundles & `Qwen3.5-9B` QLoRA Splits

After workers finish ingesting shards, deterministically merge all shards, deduplicate, verify zero cross-split contamination, and emit static-site JSON bundles + QLoRA JSONLs:

```bash
npx tsx scripts/bank-generation/compile-bank.ts \
  --shards-dir dataset/sixthphysics-bank/shards \
  --out-dir dataset/sixthphysics-bank/compiled
```

Compiled outputs under `dataset/sixthphysics-bank/compiled/`:

- `bank/index.json` — Static catalog manifest for `sixthphysics.github.io`
- `bank/all-items.json` — Full sorted `SixthPhysicsBankItem[]`
- `bank/by-syllabus/{ib,alevel,ncuk}.json` & `bank/by-syllabus/<syllabus>/<topic>.json` — Per-syllabus and per-topic lazy-loadable bundles
- `bank/by-domain/<domain>.json` — Per-domain bundles
- `distillation/{train,val,test}.jsonl` — Contamination-free `70/15/15` `QwenDistillationTrace` SFT splits for `Qwen/Qwen3.5-9B`
- `distillation/frozen-eval-manifest.json` — Checksummed held-out evaluation lockfile
- `SUMMARY.json` — Pass-rate, rejection breakdown, syllabus/domain coverage, split audit, and file SHA-256 receipts

---

## 6. Verification & Testing Commands

Run the full unit and CLI end-to-end test suite and static type checks:

```bash
npx jest --runInBand lib/bank-pipeline
npm test -- --testPathPatterns=bank-pipeline
npm run type-check
npx eslint lib/bank-pipeline scripts/bank-generation
```

*(Note: In Jest 30, `package.json`'s `npm test` ends with `--testPathIgnorePatterns=...`, so pass `--testPathPatterns=bank-pipeline` when using `npm test --`, or invoke `npx jest lib/bank-pipeline` directly.)*

---

## 7. Authoring Providers & Environment Variable Names

Primary Wave 2 generation uses native `Gemini 4 Carbon (High)` swarm workers invoking `verify-and-ingest-shard.ts` directly. Optional API/local provider configuration in `.env.example` / `.env.local` (variable names only; never log or commit secret values):

- `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY`, `LIT_API_URL`, `LIT_API_TOKEN`, `LLAMA_MODEL_ID`, `REFINEMENT_PROVIDER` (existing `.env.example` keys)
- Local Ollama harness (`http://127.0.0.1:11434`) for local untuned vs fine-tuned `Qwen/Qwen3.5-9B` evaluation
