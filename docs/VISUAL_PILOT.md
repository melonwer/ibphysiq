# Eight-question graph reconstruction pilot

Status: reconstruction and parameter-variation engineering pilot complete;
human acceptance, full question-package review, and source-material rights
clearance remain open. This is not training-ready data.

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

The current renderer accepts linear axes and bounded polyline data only. It does
not yet support error bars, log scales, bars, shaded areas, tangent constructions,
multiple styled series, or arbitrary figure composition. The eight
reconstructions and 24 variations show semantic consistency for these examples,
not complete coverage of the 119 automatically plot-labelled questions. Before
training or publication, a human should accept or correct the eight source
matches, review synthetic exercises as complete question packages, and confirm
the intended use of source material.
