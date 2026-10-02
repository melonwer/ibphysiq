# New question pilot

The private review page is `dataset/_derived/new-question-pilot-v0.1/index.html`.
It contains 20 complete newly authored questions, five each for Cartesian graphs,
circuits, fields and mechanics. Ten are Paper 1A and ten are Paper 2. Generation
uses deterministic code and checked physics; this batch does not measure Qwen's
ability to generate original questions.

Each package includes student wording, a diagram, a complete worked solution,
marking points and template-family lineage. All descendants inherit their
parent's train split. Source records and the frozen evaluation split stay intact.

## Generate and check

Run from this worktree with the locked Node dependencies installed and the
existing source pilot's split manifest available:

```bash
node scripts/pilot-dataset/generate-synthetic-pilot.cjs dataset/_derived/new-question-pilot-rebuild
node scripts/pilot-dataset/verify-synthetic-browser.cjs dataset/_derived/new-question-pilot-rebuild
npm test -- --runTestsByPath lib/visuals/__tests__/synthetic-pilot.test.ts
npm run type-check
```

The generator stages a replacement and preserves a timestamped backup of an
existing output. Browser checks cover desktop and mobile widths, filters, hidden
answers, review-note persistence and download, all student figures and label
bounds. Review notes in the page are informal feedback, not authenticated native
acceptance decisions.

## Quantitative graph scales

Generated measurement graphs use `measurementAxisTicks`, which chooses regular
1, 2 or 5 steps scaled by powers of ten, with at most about eleven labelled ticks
and a half-step minor grid. Tick positions depend on the public axis range, not
on derived answers. This lets students interpolate crossings and read slopes
without revealing the solution as a special annotation.

The rover graph labels every second and includes half-second grid lines. Its
5.5-second zero crossing is therefore readable. The lift graph labels 6 seconds,
and the momentum graph labels the 0.6 kg m s⁻¹ plateau. Regression checks inspect
the actual rendered rover SVG, including its 5-second label and 5.5-second grid
line. Small-screen diagrams can be opened at full size and zoomed.

Three GPT-6.1 Sol reviewers checked all 20 questions. The retained evidence
includes independent calculations and 40 inspected desktop and mobile screenshots.
`verify_synthetic_review.py` checks review coverage and package, figure and
screenshot hashes against the current batch. Changes after review invalidate the
receipt. The reviews are stored in the artifact's `reviews/` folder.

To check the retained reviews against the delivered batch, run:

```bash
python3 scripts/pilot-dataset/verify_synthetic_review.py
```

Generation does not create agent review receipts. Keep rebuilt artifacts in a
separate folder; a changed batch needs new reviews before that command can pass.

Agent checks do not replace human acceptance or source-use clearance. Packages
remain blocked from training until those decisions are made.
