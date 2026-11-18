# IBPhysiq next-version upgrade plan

Created: 2026-09-18

Progress reviewed: 2026-10-02

Status: The mechanics pipeline, 100-question source sampler, frozen split and coverage report are complete. The native harness supports persistent runs, authenticated review and local Qwen planning and source-conditioned authoring. A separate deterministic generator produces 20 fresh complete questions across four visual families; independent physics and visual checks pass. Connecting fresh scenarios to Qwen and native review, broader package coverage, dataset assembly and training remain open. See the [session handoff](SESSION_HANDOFF.md) for the next engineering step.

Working label: V2; the release version and delivery date are not yet assigned.

Delivery direction, updated 2026-09-27: build and run the harness locally, publish its source on GitHub, assemble the reviewed dataset, then train and publish the model on Hugging Face. Website hosting, automatic deployment, container publication, and community-service operations are outside this plan.

## 1. Outcome and scope

Build a local question-generation harness supporting Paper 1 MCQs and coherent, multipart Paper 2 questions, including accurate graphs and diagrams. Develop the harness before bulk dataset assembly and training so the training tasks match the actual generation workflow.

The intended recipients are IB Physics SL and HL students. Success means useful, solvable practice questions whose wording, figures, answers and mark schemes agree. The primary quality metric is the human-reviewed proportion of generated question packages passing all applicable correctness and usability checks. Report deterministic gate pass-through, agent pass/flag/reject outcomes, diversity, latency and cost alongside it; automated checks do not grant final acceptance during the pilot.

- Cover the five themes and overlapping topics. The user's planning inventory is 24 HL topics and 19 SL topics; reconcile the exact taxonomy and syllabus version during cataloguing.
- Include numerical, conceptual, graphical and cross-topic questions, with and without figures.
- Exclude Paper 1B from this upgrade's initial scope.
- Preserve original papers, figures and mark schemes; create derived records separately.
- Start with a complete pilot across a few families, then expand coverage.

This document records the agreed direction and proposed implementation approach. Dataset sizes, model configuration, quality thresholds, budget and schedule remain experiment choices, not guaranteed requirements or results. Creating this plan does not start training or deploy a release.

## 2. Architecture and model direction

Use one structured physics scenario as the shared source for calculations, figures, question text and solutions. Qwen proposes scenarios and authors questions; deterministic code calculates supported physics, renders visuals and validates consistency.

```text
Generation request: paper, level, topics, skill, difficulty, constraints
                              |
                              v
Coverage planner selects supported families and diversity targets
                              |
                              v
Qwen produces a scenario specification and question plan
                              |
                              v
Schema validation -> physics calculations -> solvability checks
                              |
                              v
Qwen authors question text and marking points using verified results
                              |
                              v
Deterministic figure rendering + complete-package validation
                              |
                              v
Await human review / bounded repair and revalidation / reject
```

The model must not silently change verified quantities or assumptions during question writing. A changed scenario returns through calculation and validation. Schema-constrained output helps with structure but does not prove physical correctness.

### Model experiment

- Initial recommendation: fine-tune the post-trained `Qwen/Qwen3-8B` with one mixed QLoRA adapter conditioned on paper type, level, topics, skill and difficulty.
- `Qwen/Qwen3-8B-Base` is a separate checkpoint. Compare it only as a deliberate experiment, not as an interchangeable name for the linked model.
- Benchmark the untuned checkpoint using the same prompts, renderers and validators before training.
- Balance Paper 1 and Paper 2 by both examples and training tokens; long multipart examples must not accidentally dominate.
- If measured interference justifies specialization, compare two paper-specific adapters on the same backbone. Two independently maintained full models are not the starting requirement.
- Qwen3-8B is text-only. Use a separate vision/OCR process for paper extraction; the generation model consumes structured text specifications.
- Keep training and inference chat templates, thinking-mode handling and structured-output conventions consistent. Record the exact checkpoint revision and tool versions.

### Separate responsibilities

| Component             | Responsibility                                                            |
| --------------------- | ------------------------------------------------------------------------- |
| Coverage planner      | Select topics, skills, question families and supported combinations       |
| Scenario generator    | Propose physical objects, relationships, assumptions and question intent  |
| Physics engine        | Compute quantities, check constraints and expose verified results         |
| Question author       | Produce student-facing text, distractors, explanations and marking points |
| Renderer library      | Turn supported figure specifications into deterministic vector assets     |
| Package validator     | Check physics, figure/text agreement, answer uniqueness and dependencies  |
| Review and evaluation | Assess ambiguity, educational value, novelty and unsupported cases        |

Model-based review can supplement these checks but is not independent proof of correctness. Qualitative questions need explicit review criteria where numerical solvers do not apply.

## 3. Shared data contract

Draft the schema during the catalogue phase, before renderer implementation. Version it, and test it on representative questions before large-scale conversion.

| Record area             | Required information                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Identity and provenance | Stable ID, source paper/session/page/question, original asset references, source checksum, extraction version         |
| Classification          | Syllabus version, themes/topics, SL/HL applicability, paper, skills, difficulty label and rationale                   |
| Original question       | Stem, options or ordered subparts, marks, figure references and linked mark scheme                                    |
| Scenario                | Objects, connections, signed quantities with units, coordinate conventions, assumptions and applicable physical model |
| Figure specifications   | Renderer/family version, scenario references, layout hints, axes/scales, labels and visibility rules                  |
| Question plan           | Givens, unknowns, requested deductions, part dependencies and intended misconceptions                                 |
| Verified solution       | Calculated results, derivation, tolerances, significant figures, marking points and marks                             |
| Quality and lineage     | Extraction confidence, review status, validation results, parent/variant IDs, family grouping and dataset split       |

Keep complete internal scenario data separate from student-visible data. Do not reveal an unknown through labels, alt text, metadata exposed to the client, or a later part unless the question intentionally supplies it. A figure specification may reference a hidden physical value needed to draw a curve without displaying that value.

Represent measured data as measured data, including uncertainty where relevant. Do not replace noisy source measurements with an invented exact analytical law. Graphs may be quantitative, qualitative or schematic; record which interpretation applies.

## 4. Delivery phases

### Phase 1 — Paper mining

**Work:** Extract complete question packages, preserving text, LaTeX, options, figures, subparts, marks and mark schemes. Maintain figure-to-question relationships across pages. Track source provenance and permitted uses. Keep raw inputs immutable and extraction outputs reproducible.

Start with approximately 100 reviewed packages spanning circuits, electric-field graphs and one additional family, such as motion graphs. Include both papers, conceptual questions and questions without visuals. Final pilot composition depends on available sources.

**Deliverables:** Source manifest, raw asset archive, extracted records and a review queue for uncertain readings.

**Exit evidence:** Every pilot package has traceable sources and correctly linked parts/figures. Ambiguous labels, topology, axis scales or mark-scheme links are resolved or explicitly excluded from training.

### Phase 2 — Visual catalogue and initial schema

**Work:** Classify reusable visual families separately from physics and question families. Deduplicate exact assets and identify structurally similar questions without deleting source evidence. Draft the shared contract and map representative packages into it.

Examples of visual families: Cartesian plots, circuit networks, force/vector diagrams, ray diagrams and spatial arrangements. One graph renderer can serve several physical models; one physical scenario can support several question styles.

**Deliverables:** Catalogue, versioned schema, family IDs, initial coverage matrix and prioritized renderer/solver backlog.

**Exit evidence:** Each pilot package is representable or has a recorded schema gap. Catalogue entries distinguish appearance, physical model and assessed skill. Stable source/derivative grouping exists before augmentation and dataset splitting.

### Phase 3 — Renderer library and physics validators

**Work:** Build reusable, composable primitives rather than per-question drawing scripts. Start with deterministic SVG/vector diagrams and mathematical plots. Select concrete libraries during implementation.

- Graphs: axes, units, analytical curves, measured points, error bars, tangents, shaded regions and readable ticks.
- Circuits: component identities, electrical connectivity, junctions, meter placement, labels and changed states.
- Other diagrams: objects, arrows, dimensions, rays and coordinates, introduced as supported families expand.
- Physics: named, tested models with permitted parameter ranges, units, assumptions and numerical tolerances.
- Validation: schema constraints, dimensional consistency, finite results, valid domains, sufficient givens and plausible values.

Keep layout separate from physical relationships. Allow only supported specifications; do not execute arbitrary model-generated drawing or solver code. Reject unsupported families or route them for review.

**Deliverables:** Renderer registry, physics-model registry, representative fixtures and focused automated checks.

**Exit evidence:** The same scenario drives drawing and calculation. Invalid specifications fail explicitly. Supported inputs produce readable figures and independently checked results.

### Phase 4 — Reconstruction and variation tests

**Work:** Reconstruct the information conveyed by source figures. Check labels, connections, signs, units, scales and relationships; exact fonts and pixel positions are secondary. Then vary parameters, configurations and requested deductions to test generation capability.

**Circuit fixture from the discussion:** X and Y are a series branch in parallel with Z; Z becomes an open circuit. Under the intended equal, constant-resistance bulb model and ideal meters/source, the new total current is one third of the original and the terminal voltage is unchanged. Record those assumptions explicitly; real filament bulbs need not have constant resistance.

**Field fixture from the discussion:** Place charges at 0 and d and derive both the spatial diagram and E(x) plot from those charges. Use the signed one-dimensional field, excluding charge positions from its domain. The supplied plot implies two negative charges; a zero near 2 cm for a 5 cm separation implies |qS|/|qR| approximately (3/2)^2 = 2.25. Check that the rendered graph supports the intended reading precision.

**Deliverables:** Reconstruction report, variation fixtures, failure taxonomy and updated schema/registry versions.

**Exit evidence:** Pilot reconstructions preserve the information needed to answer the questions. Valid variations keep figures and solutions consistent; deliberately invalid variants are rejected. Document coverage gaps instead of claiming universal visual support.

### Phase 5 — Training dataset assembly

**Work:** Convert reviewed records into examples matching the local generation workflow:

```text
Task A: generation request -> structured scenario + question plan
Task B: verified scenario + calculated results -> question + mark scheme
```

Include explicit task identifiers and the supported schema/family information needed at inference. Verify solutions before treating them as targets. Expand terse mark schemes into clear worked solutions when necessary, preserving source marking points.

- Paper 1: four distinct options, exactly one correct answer, plausible misconception-based distractors and an explanation.
- Paper 2: complete multipart packages, coherent dependencies, sufficient givens, appropriate command terms and consistent mark totals.
- Include multi-topic labels and both graphical and non-graphical tasks.
- Add variations in assessed skill, representation, assumptions and context as well as numerical values.
- Review synthetic targets and track lineage; do not label model-written answers as verified without checks.
- Reserve evaluation data before augmentation. Keep each original and all descendants in one split; group near-duplicate source questions together too.

**Deliverables:** Versioned training/validation/test manifests, dataset card, coverage report and leakage audit.

**Exit evidence:** Targets pass applicable validation; uncertain extractions are excluded; evaluation groups are isolated; shortages and imbalances are documented.

### Phase 6 — QLoRA training and evaluation

**Work:** Run a small, reproducible experiment before scaling. Select configuration using validation results, not the final test set. Check that full Paper 2 packages fit the training context without silent truncation. Choose checkpoints using task quality as well as training loss.

Write an experiment contract before launching a run: hypothesis, dataset/checkpoint versions, scope, hardware, maximum spend/GPU-hours, wall-time limit, evidence thresholds and stop rules. Concrete limits and acceptance thresholds remain to be set by the user before compute is committed.

Suggested stop rules: data leakage, invalid targets, exceeded compute budget, or deterioration in correctness/variety relative to the baseline. Do not expand a run simply because loss keeps decreasing.

**Deliverables:** Adapter, reproducible configuration, run manifest, evaluation report and model card. Store model artifacts outside Git.

**Exit evidence:** Compare untuned and tuned models within the identical generation pipeline on held-out requests. Report raw-generation failures and final accepted-package quality separately. A fluent answer or a passing JSON schema is insufficient evidence of improvement.

### Phase 7 — Local harness and model release

**Work:** Connect the validated generation pipeline to a documented local entry point. Use the existing Next.js app for local generation and review where useful. Support paper and level selection, inline figures, mathematical text, MCQ interaction, and multipart questions with solutions revealed separately.

The current repository areas are listed below. The older generation API is still separate from the deterministic V2 replay; it does not establish V2 model quality.

| Existing area                        | Planned use                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `lib/generation-harness/`            | Run the V2 stages and retain versioned runs, checks, and artifacts          |
| `lib/visuals/`                       | Calculate supported physics and render deterministic figures                |
| `lib/review/`, `app/review/`         | Review packages and record acceptance, rights, metadata, and grouped splits |
| `app/api/generate-question/`         | Integrate validated V2 packages into the local app                          |
| `lib/services/`                      | Inspect existing provider integration before adding live Qwen adapters      |
| `lib/constants/ib-physics-topics.ts` | Reconcile syllabus taxonomy and level applicability                         |
| `components/`, `components/ui/`      | Present figures and both paper formats accessibly                           |

Keep assessment level separate from difficulty. Record checkpoint, adapter, schema, renderer, solver, and seed versions for each generated package. Apply bounded retries, cost limits, and explicit failure reporting. Failed packages remain rejected or queued for review.

**Deliverables:** Harness source and local setup instructions on GitHub; evaluated model or adapter artifacts, model card, and reproducible training configuration on Hugging Face. Include the exact model revision and supported families in the harness configuration. Keep private source papers and unapproved derived data out of both releases.

**Exit evidence:** A clean checkout can install dependencies and run the documented local workflow with the released model. End-to-end checks cover both paper types, figures, answer visibility, provider failure, and invalid generation. Complete relevant lint, type checks, tests, and the local app build. Report measured quality and known coverage limits with the model release.

## 5. Dataset scale and diversity

These are planning budgets for unique question packages, not proven minimums for an 8B model. A Paper 2 package contains all its subparts; one package may yield multiple training records.

| Milestone                   | Approximate scale            | Purpose                                                              |
| --------------------------- | ---------------------------- | -------------------------------------------------------------------- |
| Complete pipeline pilot     | 100 reviewed packages        | Validate the representation, figures, solutions and workflow         |
| Initial training experiment | 500–1,000 reviewed packages  | Test whether fine-tuning improves the supported task                 |
| Broader coverage            | 3,000–8,000 diverse packages | Expand topics, skills, diagram families and cross-topic combinations |
| Further expansion           | Determined by measured gaps  | Improve weak areas rather than accumulate duplicates                 |

Track source diversity, independent question families and tokens alongside package counts. Thousands of numerical variants from a small set of originals do not establish conceptual breadth.

Use a coverage matrix over topic, level, paper, assessed skill, representation and difficulty. Avoid forcing a complete Cartesian product of combinations that do not make educational sense. Compare candidates against training examples and previously served questions using text similarity and structural features such as circuit topology and question intent. Raising temperature alone is not a diversity strategy.

## 6. Evaluation and release evidence

Maintain two distinct generalization evaluations: familiar families with unseen source questions/parameters, and held-out question families or topic combinations using supported physical/rendering primitives. Entirely unsupported renderers belong in coverage-gap and rejection tests.

| Dimension              | Evidence                                                                          |
| ---------------------- | --------------------------------------------------------------------------------- |
| Structural validity    | Parse/schema success, supported renderer/model references                         |
| Physics correctness    | Solver agreement, dimensional checks, assumptions, tolerances and human review    |
| Solvability            | Required information is available, no accidental answer leaks or ambiguous target |
| Visual consistency     | Labels, topology, axes, units and readable precision agree with the scenario      |
| Paper 1 quality        | Exactly one valid option, distinct distractors, explanation matches answer        |
| Paper 2 quality        | Part dependencies, marking points, marks and solutions are coherent               |
| Educational usefulness | Human review of level, command terms, difficulty and syllabus fit                 |
| Diversity              | Duplicate rate, family coverage and quality on held-out combinations              |
| Operations             | End-to-end latency, retries, rejection rate and cost per accepted package         |

Report sample sizes and uncertainty, and slice results by paper, level, topic and visual family. Keep quality measurements separate from coverage: high accuracy on one supported family does not imply broad syllabus support. Set explicit release thresholds before the training experiment; no accuracy or coverage claim is made by this plan.

## 7. Immediate implementation checklist

- [x] Inventory source papers and mark schemes and reproduce extraction: 80 PDFs, 33 canonical English question papers, 643 questions, 337 visual plans and 522 crops.
- [x] Implement the versioned visual specifications, 16-family registry and package/run schema foundations.
- [x] Build the Cartesian renderer, eight checked source reconstructions, 24 parameter exercises and 24 source-linked expansion fixtures.
- [x] Build the reproducible 100-question source sampler, corpus-wide split manifest and coverage report: 25 questions per paper/level stratum, 70 train, 15 validation and 15 test. Include all 24 checked packages and bound renderer-gap discovery to 20 sources.
- [ ] Complete and human-review the 100 pilot packages, including source-only records, conceptual questions and questions without visuals.
- [ ] Confirm syllabus taxonomy and pilot family coverage, including both papers.
- [ ] Confirm the schemas against the reviewed pilot and finalize training-record formats.
- [x] Build the source-backed circuit renderer and representative fixtures.
- [x] Add a coordinate-free circuit intent contract and deterministic series/parallel compiler.
- [x] Build the source-backed field-map renderer, intent compiler and representative fixtures.
- [x] Complete the mechanics-scene vertical slice: eight source-backed packages, balanced four Paper 1A and four Paper 2, with coordinate-free intent, deterministic physics, figures, solutions and harness replay.
- [x] Demonstrate extraction -> specification -> solution -> render -> validated package for the eight-circuit vertical slice.
- [x] Repeat the complete-package vertical slice for eight balanced field questions.
- [x] Build the deterministic QuestionRun harness with bounded retries, rejection evidence and circuit, field and mechanics replay.
- [x] Persist versioned runs and provide authenticated human review with independent training-readiness gates.
- [x] Freeze source-group evaluation membership across the extracted corpus. Keep all 55 previously developed source questions and their siblings in train; reserve fresh validation and test sources for each working visual family.
- [x] Connect a schema-constrained local Qwen planner and source-conditioned author to the native harness. Persist model-written candidates separately and resolve them for authenticated review.
- [x] Run the 20-request development authoring pilot, with five cases per working visual family and all 40 local model calls retained. Fifteen candidates passed structure/target checks; five were rejected. All question wording was copied from the supplied reference, and content diagnostics found issues in 15 outputs.
- [x] Preserve the 20-request source-conditioned authoring experiment as historical engineering evidence. It copied supplied question objects, so it is not a new-question review milestone.
- [x] Build a deterministic original-scenario generator with checked physics, fresh wording and assessment targets, figure compilation, duplicate rejection, mark-balance checks and split lineage.
- [x] Add regular labelled scales and half-step grids to generated quantitative graphs, with rendered-SVG regression checks for interpolated readings. See [the new question pilot](SYNTHETIC_QUESTION_PILOT.md).
- [x] Independently check all 20 new packages with GPT-6.1 Sol reviewers, including calculations, working, marking points and 40 desktop/mobile screenshots. Bind the evidence to the final artifacts; agent checks do not record human acceptance.
- [ ] Human-review the new 20-question synthetic pilot. It contains five new packages each for graphs, circuits, fields and mechanics; all remain blocked from training until review and source-use clearance.
- [ ] Capture the untuned baseline using the live model adapters.
- [ ] Assemble approximately 1,000 reviewed source-backed and synthetic question packages for the initial training experiment; track independent families and tokens separately from training-record counts.
- [ ] Agree the training experiment contract, including budget, evidence thresholds and stop rules.
- [ ] Train, compare and decide whether to expand data or revise the architecture.
- [ ] Connect parameter-bearing Qwen scenario generation and fresh-question authoring to the native harness and review workflow.
- [x] Publish the existing harness source and local setup instructions on GitHub.
- [ ] Release and document the live model workflow, evaluated adapter and reproducible training setup on Hugging Face.

### Current build sequence

1. Connect the tested fresh-scenario contracts to local Qwen planning and authoring, then persist the resulting packages in the native run and review workflow. Use the [20 checked synthetic questions](SYNTHETIC_QUESTION_PILOT.md) as development fixtures. Independent checks are complete; human acceptance remains a separate decision. The earlier [source-conditioned experiment](UNTUNED_AUTHOR_BASELINE.md) remains historical evidence and does not need re-acceptance.
2. Complete packages for the 76 source-only selections and review the [100-question source pilot](PILOT_DATASET.md). Confirm provisional labels and grouping evidence, then capture the held-out untuned baseline with the same validators and review workflow.
3. Generate, validate and review diverse synthetic packages toward the approximately 1,000-package training target. Keep every source and its descendants in one split and measure independent family diversity separately from package count.
4. Run the bounded QLoRA experiment and compare held-out package quality before deciding whether to expand.

The circuit, field and mechanics slices contain 24 complete physics-checked source packages. The fresh synthetic pilot adds 20 complete checked packages; the older 24 Cartesian parameter exercises remain incomplete packages. The corpus split is frozen. Human acceptance, source-use clearance and training metadata remain open. A general force-diagram family and broader mechanics coverage remain open, alongside live Qwen generation of fresh scenarios, novelty assessment and broader batch adapters.

### Mechanics implementation note, 2026-10-01

Visual review: the user confirmed that all eight mechanics reconstructions look acceptable after raising the distance lines on May 2026 TZ3 HL Paper 1A Q5 and May 2026 TZ2 SL Paper 2 Q1. This records figure approval; full question and solution acceptance remains a separate review.

The mechanics slice includes projectile flight, cart momentum, vertical-circle tension, constant-speed ramp resistance, incline friction, pendulum collision, elastic-rope energy and truck motion. Four Paper 1A and four Paper 2 packages preserve the diagram givens, verified scheme targets, complete worked solutions and per-part marking points. The mixed elastic-rope source is explicitly scoped to mechanics parts a and b; its water-wave parts are excluded.

A strict `mechanics-intent/0.1.0` contract keeps model output free of drawing coordinates. Deterministic code compiles bodies, surfaces, connectors, paths, dimensions, angle arcs and velocity vectors into `scene.mechanics.v1` SVGs. Student diagrams exclude derived answers and solution force arrows. The generator verifies source PDF hashes, question/crop links and one-based PDF page bounds, checks all packages and creates recoverable source-replay runs for the authenticated reviewer. See [the mechanics review workflow](VISUAL_PILOT.md#mechanics-package-pipeline).

Remaining choices: final syllabus taxonomy, pilot composition, training-record formats, compute budget and hardware, adapter strategy, quality thresholds, local Qwen inference setup and milestone dates. The next dataset artifact is the reviewed pilot and its coverage report. Extraction, deterministic SVG rendering and tested physics calculations already have working implementations.

### Implementation note — 2026-09-18

The first reproducible corpus pass now inventories all 80 PDFs, links duplicate donated copies, extracts sequential question records from 33 canonical English question papers, crops born-digital vector figures, OCRs the unmatched scan, and emits review-gated visual plans. The typed visual contract and 16-family template registry are documented in `docs/VISUAL_SYSTEM.md`. The first 287-item safety queue was regenerated after fixing false question boundaries, recognizing graphical A-D choices, applying unambiguous question context to low-text crops, splitting mechanics, electromagnetic, and thermal scenes from generic geometry, and tightening graph/energy-level/optics cues; 124 gated records remain. A private local reviewer now supplies the question, visual evidence, original page, and exact decision, with a representative 20-record default sample, instead of relying on context-free thumbnail sheets. These are catalogue/schema deliverables only: unresolved records are not accepted training data, mark-scheme answers have not yet been converted into verified solutions, and deterministic renderer implementations still need reconstruction tests.

The subsequent Cartesian pilot reconstructed eight source-backed plots and verified
their assessed results against linked schemes. It now produces 24 synthetic
parameter variations with scenario-driven figures, short prompts and checked
results. Displayed calculated answers use three significant figures, givens are
calculator-friendly rather than raw floating-point expansions, and multipart
sketch tasks include separate teacher-only worked graphs. Grid proportions, tick
readability, valid physical domains, complete solution parts and answer visibility
have focused tests. This proves only a narrow graph-family workflow: each variant
and its manifest explicitly block training use because the variants are not
complete question packages; human review and source-use rights remain open.

The circuit pilot now reconstructs eight additional source-backed figures, balanced
across four Paper 1A and four Paper 2 questions. Its semantic graph separates nodes,
wires and two-terminal components from normalized layout hints, validates connectivity
and explicit junctions, and covers resistor networks, switches, lamps, meters, a
variable resistor, an LDR and a thermistor.

Those same eight cases now form the first complete package vertical slice. Each package
links a typed scenario to deterministic circuit calculations, student givens, the
visual, three-significant-figure final answers, complete worked solutions and marking
points. Validation binds required givens and final answers back to the scenario/results;
it does not claim that prose is generated automatically from the scenario. Every result
is checked against a manually transcribed target from its linked mark scheme; the Paper
1A answer sequence is D, A, A, C, and all Paper 2 numerical and qualitative targets
pass. The cited PDF pages were also manually compared, while the generator itself
verifies source identity, file existence and page bounds rather than parsing scheme
content. Graph-dependent source values are made explicit in the derivative stems, and
the November 2025 mixed question is scoped to its circuit parts rather than silently
including the unrelated entropy part. The private `circuit-packages.html` review page
and manifest are still blocked from training until human review, source-use rights
clearance, and assignment of training metadata and a grouped split. This establishes
the pipeline for one family; it does not complete the approximately 100-package pilot.

A separate `circuit-intent/0.1.0` model contract now removes renderer coordinates from
the generation target. It represents recursive series/parallel structure, visible
labels, component states and panel overrides; a validated deterministic compiler adds
explicit nodes, junctions, orthogonal wires and normalized layout. Three source-linked
intent examples compile into the existing renderer while preserving component
inventories and electrical connectivity. This is an engineering contract, not a
complete training package or a general graph-layout claim: unsupported
non-series-parallel circuits are rejected or remain source-authored.

The field-map pilot now repeats that complete path for eight distinct source questions,
balanced four Paper 1A and four Paper 2. Its coordinate-free `field-intent/0.1.0`
contract describes source types, signs, relative strengths, markers, symbolic
dimensions, representation mode and panels; deterministic code validates it and owns
layout. The renderer covers discrete sources, bodies, equipotentials, dimensions,
vectors and a genuine 2×2 field-line choice grid with source-matched distractor
semantics. Three Paper 2 scenarios derive Cartesian plots, including explicit exclusion
of point-source singularities; the two graph-only sources remain plot-only instead of
receiving invented spatial companions. Three selected low-confidence `geometry_scene`
records are now explicitly treated as field maps, without claiming that the full
geometry review bucket has been resolved.

All eight field packages contain complete worked solutions and marking points, use
three-significant-figure calculated answers, and pass their source/scheme targets. The
private `field-packages.html` review page and manifest remain blocked from training for
the same three reasons as circuits: human acceptance, source-use rights and training
metadata with a grouped split. This establishes a second family-level architecture
test. The approximately 100-package pilot remains open; the mechanics slice described above adds the subsequent visual family.
See `docs/VISUAL_PILOT.md`.

The Cartesian corpus audit now evaluates every primary plot candidate rather than
extrapolating from the eight fixtures. It groups repeated stems, identifies missing
source crops, maps questions to renderer capabilities, and selects a balanced,
source-linked 24-question expansion set. This does not make the automatic labels
correct by declaration; it supplies the evidence and coverage matrix needed to close
the graph renderer deliberately. That closure was the prerequisite used before the
circuit pilot began.

## 8. Reference material

- [Qwen3-8B model card](https://huggingface.co/Qwen/Qwen3-8B)
- [Qwen3-8B-Base model card](https://huggingface.co/Qwen/Qwen3-8B-Base)
- [PEFT quantization and QLoRA documentation](https://huggingface.co/docs/peft/developer_guides/quantization)
- [vLLM structured outputs](https://docs.vllm.ai/en/latest/features/structured_outputs/)

These are implementation references from the architecture discussion, not pinned dependencies. Recheck supported versions when implementation begins.
