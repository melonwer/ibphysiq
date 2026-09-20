# Visual reconstruction pilots

Status: Cartesian reconstruction and parameter-variation pilots, plus the circuit
reconstruction pilot, are complete; human acceptance, full question-package review,
and source-material rights clearance remain open. This is not training-ready data.

The pilot selected eight distinct, readable source questions with matching mark
schemes: four Paper 1A multiple-choice items and four Paper 2 multipart items. It
tests whether one deterministic Cartesian SVG renderer can reconstruct the
answer-relevant graph semantics across piecewise lines, smooth oscillations, a
terminal-velocity curve, and axes deliberately left blank for the student.

| Paper | Source question         | Graph and independent check                         | Scheme target |
| ----- | ----------------------- | --------------------------------------------------- | ------------- |
| 1A    | May 2025 TZ1 HL Q2      | Acceleration–time triangle area                     | 32 m/s, B     |
| 1A    | November 2025 TZ3 HL Q3 | Mean acceleration × mass                            | 6 N, B        |
| 1A    | May 2026 TZ2 HL Q7      | Negative acceleration–distance area × mass          | 120 kJ, C     |
| 1A    | May 2026 TZ1 HL Q19     | Sine displacement gradient at 1.0 s                 | 3.9 cm/s, C   |
| 2     | May 2025 TZ1 HL Q1      | Force–distance area and work–energy                 | 17 m/s        |
| 2     | November 2025 TZ1 HL Q1 | Buoyancy–weight balance and Stokes drag             | 2.2 m/s       |
| 2     | May 2025 TZ1 HL Q9      | Elastic-energy extrema and SHM speed                | 0.83 m/s      |
| 2     | May 2026 TZ1 HL Q6      | SHM maximum acceleration; blank student energy axes | 111 m/s²      |

The source IDs, exact crop paths, scheme PDF pages, SVGs, computed values, and
source/result pairs are in the local generated
`dataset/_derived/visual-pilot-v0.1/manifest.json` and `index.html`. Regenerate them
with `node scripts/visual-pilot/generate.cjs`. No copyrighted source image or
question text is copied into tracked pilot fixtures.

The same command writes `variants.html` and `variants-manifest.json` with three
new parameter sets for each of the eight cases. These 24 exercises are synthetic
derivatives with source lineage, not copies of the source questions. One scenario
drives each SVG, short student prompt, and independently checked numerical
result. Calculated answers are displayed to three significant figures. The
solution is collapsed on the local review page and absent from the student SVG.
The manifest and every variant explicitly set training eligibility to `blocked`;
these engineering test cases must not be copied raw into a training dataset.
They are not yet four-option Paper 1A items or complete multipart Paper 2
packages, and must first be converted into reviewed packages.

The source and reconstructed figures were visually compared for graph shape,
axis quantities, critical coordinates, and whether a line should be absent. The
renderer intentionally does not reproduce the exam's font, page layout, or arrowhead
style. For the November 2025 oil-droplet graph, the source gives no vertical
numerical scale; the SVG therefore uses a normalized internal ordinate but shows
no numeric y ticks. For the May 2026 Paper 2 sketching task, the expected
kinetic-energy curve is checked privately and never rendered in the student view.
Each loudspeaker variant has a separate teacher-only solution SVG and worked
explanation: because `v = −Aω sin(ωt)`, kinetic energy is proportional to
`sin²(ωt)`, begins at zero, reaches `Eₜ` at equilibrium, and repeats every `π/ω`.
Its angular-frequency givens are short three-significant-figure values such as
`15.7`, never raw floating-point expansions.

The first two source graphs need different drawing-area shapes: May 2025 Paper 1A
Q2 has equal 0–10 ranges and a square plot, while November 2025 Paper 1A Q3 is
tall and narrow, with 0.4 s horizontal minor steps and 0.2 m s⁻² vertical minor
steps. Both have square printed grid cells. The renderer now derives the frame
ratio from axis ranges and minor-grid increments whenever square cells are
requested, including after parameters change; it does not change the data or
any physics result.

The synthetic oil-drop cases use small droplets in a viscous liquid and reject
cases with Reynolds number at or above 0.1, so the Stokes-drag model is used
within its intended low-speed regime. Invalid times, masses, buoyancy and
spring extensions are rejected in focused tests.

The renderer now supports linear and logarithmic axes, ascending or descending
axis direction, source-matched grid proportions, styled and marked series,
directional closed paths, annotations, histograms, steps, overlays, and panel or
sequence composition. It still does not support uncertainty bars or general
shaded regions. Tangent lines can be represented as construction series, but the
24-source inspection found that the audit's apparent tangent examples were
lexical false positives: their text asked about a gradient without showing a
tangent. Those corrections remain explicit rather than being counted as source
proof.

The eight checked reconstructions, 24 generated variations, and 24-source
expansion show semantic consistency for the exercised cases, not universal
coverage of all automatically plot-labelled questions. Before training or
publication, a human should accept the source matches, review synthetic exercises
as complete question packages, and confirm the intended use of source material.

## Full Cartesian candidate audit

Run `python scripts/visual-pilot/audit_cartesian.py` after generating the pilot. It
audits all 119 primary Cartesian candidates against an explicit capability matrix
and produces the private `cartesian-coverage.html` and
`cartesian-coverage.json` artifacts. The audit reports repeated question stems,
missing plot crops, existing pilot fixtures, capabilities already exercised,
implemented-but-untested cases, and renderer gaps.

Its default review view is a balanced, deduplicated 24-question expansion set with
question context, plot crops, source-page links, mark-scheme links and plain-language
selection reasons. This is a test-planning artifact rather than a label-acceptance
workflow: automatic capability tags, source extraction, physics, solutions and rights
remain separate review gates, and training eligibility stays blocked.

## Source-linked capability expansion

`node scripts/visual-pilot/generate.cjs` also writes `expansion.html` and
`expansion-manifest.json`. They contain deterministic reconstructions of all 24
selected audit records, balanced 12 Paper 1A and 12 Paper 2. Each fixture records
its exact source question, local source evidence, capabilities exercised, and any
correction made after visual inspection. Two clean wave-graph crops are derived
non-destructively from the relevant PDF pages because the automatic miner had
selected a later car diagram instead. One blank HL crop is represented by the
clean crop from its identical SL question stem and is labelled as duplicate
evidence.

The inspection deliberately corrected several automatic hypotheses:

- a request to calculate or discuss a gradient is not evidence of a drawn tangent;
- two separate wave plots are multiple panels, not multiple series on one axis;
- a rod diagram plus one graph is not a Cartesian multi-panel composition; and
- the rubidium question contains a binding-energy curve, not a decay curve.

These fixtures prove renderer behavior and source lineage only. They do not yet
include independently checked solutions for every source question, so the
manifest and every fixture keep training eligibility blocked.

## Circuit renderer pilot

The circuit milestone adds a deterministic SVG renderer driven by explicit electrical
nodes, wires and two-terminal components. Normalized node positions are layout hints;
they do not replace or alter the electrical topology. The renderer keeps meter letters
upright regardless of component orientation and draws junction dots only where the
semantic graph declares a branch.

The eight selected fixtures are balanced across four Paper 1A and four Paper 2 source
questions:

| Paper | Source question         | Capability represented                         |
| ----- | ----------------------- | ---------------------------------------------- |
| 1A    | May 2025 TZ1 HL Q14     | Three series/parallel resistor panels          |
| 1A    | May 2025 TZ3 HL Q17     | Open switch and labelled resistor branches     |
| 1A    | May 2025 TZ3 HL Q18     | Bypass wires, junctions and terminal labels    |
| 1A    | May 2026 TZ2 HL Q16     | Initial/failed-lamp sequence with ideal meters |
| 2     | May 2025 TZ1 SL Q3      | Ammeter in series and voltmeter in parallel    |
| 2     | November 2025 TZ1 HL Q2 | Variable-resistor internal-resistance circuit  |
| 2     | May 2026 TZ1 HL Q2      | LDR divider with labelled quantities           |
| 2     | May 2026 TZ3 HL Q1      | Thermistor network and two-cell battery        |

`node scripts/visual-pilot/generate.cjs` writes the private comparison page
`circuits.html`, the eight SVGs and `circuits-manifest.json` under
`dataset/_derived/visual-pilot-v0.1/`. Each manifest record resolves back to its mined
question, exact crop and source PDF page. Focused tests cover deterministic rendering,
source existence, public/private label separation, topology resolution, orthogonal
layout, explicit junctions and the failed-lamp state.

This circuit set is a reconstruction pilot, not a physics-solution pilot. It does not
independently verify every source answer or mark scheme, and it does not prove capacitor
or diode rendering from the corpus. Every fixture and generated manifest therefore
keeps training eligibility blocked pending complete package authoring, human review and
source-use clearance.

## Coordinate-free circuit intent pilot

`lib/visuals/circuit-intent.ts` defines the separate model-facing
`circuit-intent/0.1.0` contract and its JSON Schema. A model specifies components,
recursive series/parallel structure, labels, switch/lamp states and minimal layout
direction. It does not specify nodes, line routes, coordinates, SVG or executable
drawing code. The compiler derives those renderer details deterministically and emits
the existing `VisualSpec<"circuit_network">` format.

Three source-linked examples exercise distinct panel topologies, a before/after
`failed-open` lamp override and an internal-resistance measurement circuit. The
generator writes `circuit-intents.html` and `circuit-intents-manifest.json`, including
the compact JSON beside its compiled SVG. Focused tests compare each compiled panel's
component inventory and electrical connectivity with the established source
reconstruction, and reject duplicate components, underspecified parallel groups,
incompatible states and unknown overrides.

The compiler currently covers series-parallel graphs and direct wire branches. It is
not a general circuit-graph layout engine, does not solve electrical quantities, and
does not make the three examples training-ready. Bridge networks require a later
reviewed topology extension; checked solutions, complete question packages, human
review and source-use clearance remain separate gates.
