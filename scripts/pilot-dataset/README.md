# Build the source pilot

Run the sampler from the repository containing the V2 code. Install the locked
Node dependencies and the paper-mining Python requirements first.

```bash
npm ci
python3 -m pip install -r scripts/paper-mining/requirements.txt
python3 scripts/pilot-dataset/sample_pilot.py --source-root /home/d4ydy/ibphysiq
python3 scripts/pilot-dataset/verify_pilot.py --source-root /home/d4ydy/ibphysiq
```

Open `dataset/_derived/pilot-dataset-v0.1/index.html` in a browser. The page works
without an application server. Filters cover paper, level, split, representation,
package status and wording. Source PDF pages and crop copies stay inside the
private artifact. Solutions remain inside closed disclosure panels.

The default sample contains 100 source questions, including all 24 checked
circuit, field and mechanics packages. It targets 25 questions per paper/level
stratum, allows at most 20 questions from renderer-gap families and reserves fresh
evaluation sources for each working visual family. Source-only records still need
complete checked package construction.

`pilot-manifest.json` records the seed, input hashes, selection policy and each
source's provenance. `split-manifest.json` assigns the entire extracted corpus to
source groups and splits, including unselected siblings. `coverage.json`,
`coverage.csv` and `COVERAGE.md` describe the sample, corpus and remaining work.
`grouping-evidence.jsonl` records why source records were joined.

Every previously developed source group stays in train. Exact text, number-neutral
text, spacing changes, shared scenario context, lexical similarity and reused
SL/HL subparts keep related questions together. These checks do not establish
semantic independence for all paraphrases. Review uncertain grouping evidence
before using evaluation scores for claims.

Theme and skill tags are provisional keyword matches. Topic, syllabus, difficulty
and skill metadata still need human classification. Sampling or split assignment
does not grant educational acceptance, source-use rights or training readiness.

Same-input reruns preserve the frozen split and save a timestamped artifact
backup. A changed seed, corpus, size or grouping policy cannot replace an existing
split manifest. Use a new `--output` directory for a deliberate new pilot version.
`--no-page-previews` skips PDF thumbnails for lightweight verification.

Use `sample_pilot.descendant_split(parent_question_ids, split_manifest)` when
assigning synthetic descendants. It rejects unknown parents, excluded source
questions and combinations spanning different splits.

Run focused tests with:

```bash
python3 -m unittest discover -s scripts/pilot-dataset -p 'test_*.py' -v
```

The real-artifact verifier rechecks all source PDF hashes, reproduces the sample
after shuffling inputs, validates source copies and student SVGs, checks development
protection and fresh evaluation coverage, and exercises CLI restarts and rejected
split changes in a temporary directory. It leaves the raw corpus untouched.

The [20-request local Qwen authoring experiment](../../docs/UNTUNED_AUTHOR_BASELINE.md)
uses the frozen train sources and persists model-written candidates separately.
Its standalone report includes every first-attempt outcome and raw reply.

The [new question pilot](../../docs/SYNTHETIC_QUESTION_PILOT.md) separately creates
20 fresh complete questions using deterministic physics and SVG templates. It
includes regular labelled graph scales and half-step grids. The retained GPT-6.1
Sol reviews cover every question and 40 desktop/mobile screenshots. Read the
[session handoff](../../docs/SESSION_HANDOFF.md) before resuming development.
