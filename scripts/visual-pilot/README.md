# Eight-question Cartesian pilot

Run from the repository root after `scripts/paper-mining/mine_papers.py` has produced
`dataset/_derived/paper-mining-v0.1/`:

```bash
node scripts/visual-pilot/generate.cjs
```

The script verifies that each of the eight fixture IDs resolves to a mined question,
its selected source crop, and its linked mark-scheme PDF. It then checks a physics
result against the scheme target, renders the student-facing SVG, and writes a
private side-by-side review page and provenance manifest to
`dataset/_derived/visual-pilot-v0.1/`.

The same command also generates `variants.html` and `variants-manifest.json`
there: three synthetic parameter variations per source case (24 total). Each
variant's prompt, graph and result come from one scenario. The checked solution
is shown only in the private review page, never in the student-facing SVG.
Calculated results are displayed to three significant figures. Multipart graph
questions also receive a separate teacher-only expected-graph SVG so every asked
part is covered by the review solution.

Fixtures and independent calculations live in `lib/visuals/pilot-fixtures.ts` and
`lib/visuals/pilot-physics.ts`. The figures and PDF inputs remain under the ignored
`dataset/` boundary. The script does not edit source captures or promote any question
to training-ready status. Both the manifest and each variant explicitly mark
training eligibility as blocked. The synthetic variants are engineering test cases,
not records to paste into a training dataset; they require complete package authoring,
human review and source-material rights clearance first. The generated HTML is for
local review; do not publish it without that separate rights decision.
