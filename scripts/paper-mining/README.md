# Paper mining

This pipeline turns the ignored raw PDF corpus into a derived, reviewable question
and visual-plan catalogue. It never edits source PDFs.

```bash
python -m pip install -r scripts/paper-mining/requirements-ocr.txt
python scripts/paper-mining/mine_papers.py --ocr-scans
python scripts/paper-mining/validate_run.py
python scripts/paper-mining/review_server.py
python scripts/paper-mining/materialize_reviews.py
```

The default output is `dataset/_derived/paper-mining-v0.1/`, which remains under
the ignored raw-dataset boundary. It contains:

- `sources.jsonl`: enriched source inventory, hashes, duplicate links, and PDF mode;
- `questions.jsonl`: complete question-level packages and provenance;
- `visual-plans.jsonl`: proposed visual families, templates, evidence, and review state;
- `visual-assets.jsonl` plus `assets/`: cropped vector/raster evidence;
- `visual-catalogue.json`: renderer-family backlog;
- `review-queue.jsonl`: OCR, crop, and low-confidence items that must not silently enter training;
- `summary.json` and `CATALOGUE.md`: run receipt.

The review server opens a private local workflow at `http://127.0.0.1:8765`. Each
record includes its question wording, extracted image, original PDF page, a plain-language
explanation of the uncertainty, and the decision being requested. Decisions are written
to `review-decisions.json` inside the derived run. They do not modify the source PDFs.
The default view is a 20-record sample spread across visual families and both papers;
switch to “Full safety queue” only when doing detailed corpus QA.
`materialize_reviews.py` applies accepted or corrected labels to separate copies in
`reviewed/visual-plans.jsonl` and reports unresolved items in `reviewed/report.json`.
It does not claim any question package is training-ready: answers, physics, mark
schemes, and rights still require their own checks. A `--force` extraction rerun
preserves the previous run as a timestamped backup and carries forward decisions
whose stable IDs are still in the new queue.

The optional `make_contact_sheets.py` command creates thumbnail grids for bulk quality
control. A grid is simply 16 cropped figures shown on one page so a reviewer can spot a
mis-grouped image quickly; it is not the primary record-by-record review interface.

The queue mixes three gates that have different resolutions:

- extraction problems require a crop or parsing correction;
- source limitations require a scan comparison or a missing mark scheme;
- visual-semantic decisions require accepting or correcting the proposed renderer family.

Reason counts overlap, so the number of reasons must not be presented as the amount of
human work. Automatic corrections should be rerun before any manual review, and a human
should review a representative acceptance sample rather than raw JSON lines.

Re-running without `--force` refuses to overwrite an existing run. With `--force`,
the old run is renamed to a timestamped backup before the replacement is staged.

Run the focused unit checks with:

```bash
python -m unittest scripts/paper-mining/test_mine_papers.py scripts/paper-mining/test_review_server.py scripts/paper-mining/test_materialize_reviews.py
```
