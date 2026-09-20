# IB Physics visual system

Status: schema and catalogue foundation implemented; deterministic Cartesian, circuit
and field-map SVG renderers have source-backed engineering pilots. Other renderer
families remain incomplete.

This system separates the physics meaning of a figure from its layout. A question
package references one versioned visual specification; the registry selects a
supported template; deterministic code validates and renders it. The model does not
emit arbitrary SVG or drawing code.

## Corpus evidence

The 2025–2026 corpus pass processed 80 PDFs: 48 question papers and 32 mark schemes.
After linking seven donated copies to canonical official papers, 33 English question
papers were mined (16 Paper 1A and 17 Paper 2, including one OCR-only donated paper).

- 643 sequential question records: 520 Paper 1A and 123 Paper 2.
- 32 of 33 canonical papers have a matching mark-scheme source; the donated November
  2025 HL Paper 2 does not.
- 337 questions have a visual plan and 522 source crops. Counts below are automatic candidates and require
  the review gate before they become accepted labels.
- 13 families were observed by the revised classifier; three reserved families had
  no direct keyword evidence. A zero does not prove absence until source figures are
  reviewed.

| Visual family                 | Primary | Primary or alternative | Template                             |
| ----------------------------- | ------: | ---------------------: | ------------------------------------ |
| General geometry/object scene |      58 |                    223 | `scene.geometry.v1`                  |
| Cartesian plot                |     119 |                    125 | `plot.cartesian.v1`                  |
| Mechanics scene               |      32 |                     43 | `scene.mechanics.v1`                 |
| Electromagnetic scene         |      30 |                     50 | `scene.electromagnetic.v1`           |
| Circuit/network schematic     |      28 |                     32 | `network.circuit.v1`                 |
| Thermal/energy-flow scene     |       9 |                     21 | `scene.thermal-energy.v1`            |
| Ray/wave path                 |      15 |                     20 | `path.ray-wave.v1`                   |
| Energy-level diagram          |      16 |                     16 | `levels.energy.v1`                   |
| Force/vector diagram          |      11 |                     16 | `vector.force.v1`                    |
| Field/equipotential map       |      11 |                     12 | `field.map.v1`                       |
| Matter/particle model         |       3 |                      7 | `matter.particle-model.v1`           |
| Spatial/orbital scene         |       3 |                      6 | `scene.spatial-orbital.v1`           |
| Data table                    |       2 |                      2 | `data.table.v1`                      |
| Experimental apparatus        |       0 |                      0 | `scene.apparatus.v1` (reserved)      |
| Particle interaction/track    |       0 |                      0 | `particle.interaction.v1` (reserved) |
| Annotated image               |       0 |                      0 | `image.annotated.v1` (reserved)      |

The broad geometry family is deliberately a review bucket, not a final renderer. The
revised classifier already split repeated mechanics, electromagnetic, and thermal
arrangements into explicit scene families. The remaining geometry records need
inspection for apparatus, cross-sections, hybrid arrangements, or false visual cues.

## Rendering contract

```text
verified scenario
      |
      v
versioned VisualSpec -- public/private parameter allowlists
      |
      v
family template registry -- supported primitives and scenario contract
      |
      v
semantic validation -- topology, units, domains, references, answer leaks
      |
      v
layout/composition -- single, overlay, panel grid, or sequence
      |
      v
deterministic SVG renderer -- accessible student-safe alt text
      |
      v
readability + reconstruction checks
```

The typed contract and registry are in `lib/visuals/`. A specification contains:

- a stable ID, schema version, family, template version, and scenario reference;
- a family-specific semantic payload, not absolute drawing commands;
- public and private parameter IDs so labels and alt text cannot expose an answer;
- optional layers for hybrid figures, such as a conductor, circuit, magnetic field,
  and velocity vector in one scene;
- a composition mode for single figures, overlays, option grids, and sequences;
- layout hints that may change without changing the physical model;
- source-question and renderer provenance.

## Template capabilities

### Cartesian plots

The pilot renderer handles linear axes, source-matched ticks, grids, bounded
polyline curves, and deliberately blank student axes. It derives square grid
cells from axis ranges and minor-tick increments when requested, and rejects
overlapping tick labels. Eight source-linked reconstructions and 24 checked
parameter variations are documented in [VISUAL_PILOT.md](VISUAL_PILOT.md).
The broader renderer should cover quantitative and qualitative curves, measured points,
uncertainties, multiple series, histograms, waveforms, tangents, intercepts, and
shaded regions. It must record whether a graph is quantitative, qualitative, or
schematic; axis limits and tick precision are part of the assessment contract.

### Networks and paths

Circuit figures store electrical nodes, wires and two-terminal components independently
of normalized source-layout hints. The renderer supports source-confirmed cells,
batteries, fixed and variable resistors, thermistors, LDRs, lamps, open/closed switches,
ammeters and voltmeters. It renders single circuits, option panels and before/after
sequences, including inactive components. Validation rejects unresolved terminals,
disconnected nodes, diagonal component/wire segments, implicit branch points, missing
layout positions and labels outside the public visibility allowlist.

Model-generated circuits use the smaller `circuit-intent/0.1.0` contract instead of
the reconstruction payload. The intent contains component identities, recursive
series/parallel relationships, visible labels, semantic states, panel overrides and a
left-to-right or top-to-bottom preference. It contains no nodes, coordinates or SVG.
The deterministic compiler validates that contract, creates explicit junctions and
orthogonal wires, assigns normalized positions, builds the student-visibility
allowlist and emits `network.circuit.v1`. Its exported JSON Schema can be used for
constrained model decoding.

Field maps use a dedicated payload of source/marker entities, field/equipotential/
dimension paths, vectors and annotations. `field-intent/0.1.0` is the smaller
model-facing contract: the model selects a reviewed semantic template and supplies
source type, sign, relative strength, labels, marker relationships, symbolic dimensions
and panel variants. It cannot supply coordinates or SVG. The compiler deterministically
places linear sources, parallel equipotentials, radial sources, body pairs and 2×2
field-line choices, constructs the public-label allowlist, and emits `field.map.v1`.
Validation rejects source singularities in calculations, invalid normalized geometry,
out-of-bounds vectors, unsupported keys and private labels. Graph-bearing packages use
the same scenario to derive their Cartesian data rather than asking the model to redraw
a curve independently. Package composition is also source-gated: a field map is emitted
only when the source question contains a spatial field diagram, so graph-only questions
do not acquire synthetic companion figures.

This first compiler deliberately accepts only series-parallel topology plus direct wire
branches. Unsupported bridge networks and other non-series-parallel graphs must remain
source-authored or be rejected until a reviewed macro or netlist-layout extension is
implemented. The model is never permitted to supply drawing code or bypass validation.

Eight source-linked fixtures, balanced across four Paper 1A and four Paper 2 questions,
exercise series/parallel resistor options, bypass wiring, switching, lamp failure,
meter placement, an LDR and a thermistor. They are documented in
[VISUAL_PILOT.md](VISUAL_PILOT.md) and remain blocked from training because the pilot
proves reconstruction and source lineage, not complete independently checked solutions.
Capacitor and diode types remain in the schema but are not claimed as source-proven
capabilities by this fixture set.

Ray and wave figures store media, boundaries, rays/wavefronts, normals, and angles.
Field figures store sources, excluded singularities, sign conventions, and the requested
representation (lines, equipotentials, or vectors).

### Scenes and vectors

Scene templates compose bodies, surfaces, paths, dimensions, angles, and signed
vectors. Force diagrams share the vector primitive but use stricter checks for
origin, direction, coordinate convention, and visibility. Apparatus is a specialized
scene with physical connections and a complete measurement path.

### Discrete scientific representations

Tables preserve measured values and uncertainties. Energy-level diagrams preserve
ordered levels and transition energies. Matter and particle diagrams preserve counts,
containers/lattices, vertices, directions, and conservation links. Annotated images
require a licensed asset, in-bounds anchors, and valid scale metadata.

## Non-negotiable validation

Every supported template must demonstrate all of the following before its status can
move from `planned` to `supported`:

1. The same scenario drives calculations and the figure.
2. All entity, node, series, and quantity references resolve.
3. Units, domains, signs, connections, and directions are valid for the family.
4. Public and private parameter sets do not overlap; student labels and alt text use
   an explicit allowlist.
5. The figure remains readable at the application target size and in grayscale.
6. Source reconstruction preserves answer-relevant information, even when layout and
   typography differ.
7. Parameter and topology variants remain consistent; deliberately invalid variants
   fail explicitly.

## Implementation order

The pilot backlog is evidence-driven:

1. `plot.cartesian.v1`, `network.circuit.v1`, and `field.map.v1` now have source-backed
   renderer and complete-package evidence.
2. Build mechanics and electromagnetic scene primitives as reusable layers, then
   implement ray/wave, thermal, matter, energy-level, orbital, table, and apparatus
   templates according to reviewed frequency.
3. Keep particle-interaction and annotated-image templates reserved until reviewed
   corpus evidence or a generation requirement justifies them.

## Derived review artifacts

Run `scripts/paper-mining/mine_papers.py --ocr-scans` to reproduce the catalogue under
`dataset/_derived/paper-mining-v0.1/`. Question records, visual plans, cropped assets,
source checksums, and the review queue stay inside the ignored dataset boundary.

The initial 287-item safety queue included mechanical false alarms as well as real visual
judgments. A question-boundary correction, explicit support for A-D labels embedded in
figures, provenance-preserving use of question context, and the three new scene families
reduced the regenerated queue to 124 records: 123 questions and one source-level
missing-mark-scheme record. The current reasons overlap across records: 95 have an
uncertain crop family, 58 have an uncertain question-level family, 27 need better crop
isolation, eight are OCR-derived, and one lacks a mark scheme.

Run `scripts/paper-mining/review_server.py` for the primary review workflow. It shows the
question, crop, original page, reason for the gate, and requested decision, then records
accept/correct/exclude/defer decisions locally. Its default view is a stable, diverse
20-record visual sample; the full queue remains available for specialist QA.
`make_contact_sheets.py` remains an optional
bulk-QA aid: each sheet is a grid of up to 16 thumbnails used to spot obviously mis-grouped
crops, not a context-free task for the user. OCR text, unresolved family assignments, and
unisolated visuals remain excluded from training until reviewed.

`materialize_reviews.py` creates a separate reviewed visual-plan overlay from saved
accept/correct decisions. It never overwrites mined plans. No visual-label decision
alone makes a complete question training-ready: answer, mark-scheme, physics, and
rights checks remain separate gates.
