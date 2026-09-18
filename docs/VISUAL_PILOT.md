# Eight-question graph reconstruction pilot

Status: engineering pilot complete; human acceptance, full question-package review,
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

The source and reconstructed figures were visually compared for graph shape,
axis quantities, critical coordinates, and whether a line should be absent. The
renderer intentionally does not reproduce the exam's font, page layout, or arrowhead
style. For the November 2025 oil-droplet graph, the source gives no vertical
numerical scale; the SVG therefore uses a normalized internal ordinate but shows
no numeric y ticks. For the May 2026 Paper 2 sketching task, the expected
kinetic-energy curve is checked privately and never rendered in the student view.

The first two source graphs need different drawing-area shapes: May 2025 Paper 1A
Q2 has equal 0–10 ranges and a square plot, while November 2025 Paper 1A Q3 is
tall and narrow, with 0.4 s horizontal minor steps and 0.2 m s⁻² vertical minor
steps. Both now have square printed grid cells. The source-specific frame ratio
is a layout hint; it does not change the data or any physics result.

The current renderer accepts linear axes and bounded polyline data only. It does
not yet support error bars, log scales, bars, shaded areas, tangent constructions,
multiple styled series, or arbitrary figure composition. The eight checks show
semantic reconstruction for these examples, not complete coverage of the 119
automatically plot-labelled questions. Before scaling, a human should accept or
correct the eight source matches, run parameter-variation tests, and confirm the
intended use of source material.
