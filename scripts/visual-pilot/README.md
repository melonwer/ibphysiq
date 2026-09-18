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

Fixtures and independent calculations live in `lib/visuals/pilot-fixtures.ts` and
`lib/visuals/pilot-physics.ts`. The figures and PDF inputs remain under the ignored
`dataset/` boundary. The script does not edit source captures or promote any question
to training-ready status. The generated HTML is for local review; do not publish it
without a separate source-material rights decision.
