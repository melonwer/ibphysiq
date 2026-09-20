# Source-backed visual renderer pilots

Run from the repository root after `scripts/paper-mining/mine_papers.py` has produced
`dataset/_derived/paper-mining-v0.1/`:

```bash
node scripts/visual-pilot/generate.cjs
python scripts/visual-pilot/audit_cartesian.py
```

The script verifies that each of the eight fixture IDs resolves to a mined question,
its selected source crop, and its linked mark-scheme PDF. It then checks a physics
result against the scheme target, renders the student-facing SVG, and writes a
private side-by-side review page and provenance manifest to
`dataset/_derived/visual-pilot-v0.1/`.

It also renders the balanced 24-question Cartesian expansion as `expansion.html`
and `expansion-manifest.json`. Those records prove source-linked renderer
capabilities and preserve audit corrections, but do not claim complete checked
solutions. Training use remains blocked. When the automatic crop for the two
sound-wave questions points at a later car diagram, the generator uses
`pdftoppm` to derive clean graph-only evidence from the original PDFs without
modifying either source file.

The same generator writes `circuits.html` and `circuits-manifest.json` for eight
source-linked circuit fixtures, balanced four Paper 1A and four Paper 2. The circuit
renderer uses explicit nodes, wires and components plus separate normalized layout
hints. The fixtures cover series/parallel networks, bypass connections, an open switch,
lamp failure, meters, a variable resistor, an LDR and a thermistor. Those source-fixture
artifacts validate visual topology and source lineage.

The generator also writes `circuit-packages.html`, eight package SVGs and
`circuit-packages-manifest.json`. This is the complete circuit vertical slice: all eight
fixtures have typed scenarios, deterministic calculations, self-contained student
questions, complete worked solutions, marking points and linked mark-scheme checks.
Calculated answers use three significant figures. The two questions that originally
used separate graphs receive their required operating points in the derivative stem,
and mixed-source scope is recorded explicitly. The manifest status is
`physics-verified-awaiting-human-review`; training remains blocked pending human review,
source-use rights clearance, and assignment of the training metadata and grouped split.

The generator additionally writes `circuit-intents.html` and
`circuit-intents-manifest.json` for three source-linked, coordinate-free intent
examples. These records show the exact JSON a model would emit and the circuit SVG
produced after deterministic compilation. The current intent grammar supports nested
series/parallel paths, direct wire branches, panel-specific topology, semantic state
overrides and two layout directions. Unsupported topologies fail validation; the model
does not emit coordinates or drawing code.

The same command also generates `variants.html` and `variants-manifest.json`
there: three synthetic parameter variations per source case (24 total). Each
variant's prompt, graph and result come from one scenario. The checked solution
is shown only in the private review page, never in the student-facing SVG.
Calculated results are displayed to three significant figures. Multipart graph
questions also receive a separate teacher-only expected-graph SVG so every asked
part is covered by the review solution.

Fixtures and independent calculations live in `lib/visuals/pilot-fixtures.ts`,
`lib/visuals/pilot-physics.ts`, and
`lib/visuals/cartesian-expansion-fixtures.ts`. Circuit fixtures and rendering live in
`lib/visuals/circuit-source-fixtures.ts` and `lib/visuals/render-circuit.ts`;
the model-facing contract, compiler and source-linked examples live in
`lib/visuals/circuit-intent.ts` and `lib/visuals/circuit-intent-fixtures.ts`. Circuit
solvers and complete packages live in `lib/visuals/circuit-physics.ts` and
`lib/visuals/circuit-question-packages.ts`. The figures and PDF inputs remain under the
ignored `dataset/` boundary. The script does not edit source captures or promote any
question to training-ready status. The manifests and every variant or expansion fixture
explicitly mark training eligibility as blocked. The synthetic Cartesian variants are
engineering test cases, not records to paste into a training dataset; they still require
complete package authoring, human review and source-material rights clearance. The
generated HTML is for local review; do not publish it without that separate rights
decision.

## Cartesian corpus coverage audit

`audit_cartesian.py` reads every question whose primary mined family is
`cartesian_plot`, compares its inferred requirements with the capabilities proved by
the current renderer pilot, and writes `cartesian-coverage.json` plus
`cartesian-coverage.html` beside the other private pilot artifacts. The page contains
all candidate records and defaults to a 24-question, source-linked expansion set.

The selection removes repeated question stems, balances Paper 1A and Paper 2, and
prioritizes capabilities the renderer lacks or has not reconstructed from a source.
Records without an isolated plot crop remain visible in a separate evidence-review
bucket rather than being treated as confirmed plot examples. All classifications are
automatic audit hypotheses and every record remains blocked from training.

Run the focused audit checks with:

```bash
python -m unittest scripts/visual-pilot/test_audit_cartesian.py
```
