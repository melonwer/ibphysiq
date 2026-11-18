# Pilot dataset

The source pilot contains 100 questions in 100 source groups, selected from 643
extracted questions. Each of Paper 1A SL, Paper 1A HL, Paper 2 SL and Paper 2 HL
contributes 25 questions. The pilot split is 70 train, 15 validation and 15 test.

All 24 existing circuit, field and mechanics packages are included. The other 76
selected sources still need complete checked packages. Twenty selected sources
explore missing renderer families. The remaining 80 use an available visual family
or have no figures. Renderer availability does not establish support for every
question in that family.

The private browser artifact is
`dataset/_derived/pilot-dataset-v0.1/index.html`. It includes copied source crops,
original PDF-page previews, checked student reconstructions, source questions and
closed solution panels. Its filters make the pilot usable without reading JSON.
The artifact is also copied to the user's usual checkout at
`/home/d4ydy/ibphysiq/dataset/_derived/pilot-dataset-v0.1/`.

## Selection and split evidence

The sampler records a fixed seed and hashes of the four mining manifests and the
validated package inventory. It resolves duplicate-source chains and groups
related question records across the complete corpus, including unselected
siblings. All 55 source questions used in prior renderer development and their
group members stay in train. Each working visual family has fresh validation and
test sources.

Grouping covers exact and number-neutral text, spacing changes, shared scenario
context, lexical near-duplicates and reused SL/HL subparts. Administrative footer
text is removed from matching inputs. Original question text and PDFs remain
unchanged. Every grouping edge has an evidence record.

Same-input reruns reproduce the sample and preserve the frozen manifest. Changes
to inputs, seed, size or grouping that change the split require a new output
directory. A synthetic descendant inherits the split of every parent. Unknown
parents, excluded source records and cross-split parent combinations are rejected.

This split evaluates unseen source groups within available representations. It
does not establish a separate held-out-family benchmark. Lexical checks cannot
prove that every semantic paraphrase has been found.

## Coverage and review

`coverage.json`, `coverage.csv` and `COVERAGE.md` report paper, level,
representation, session, extraction flags, package completeness and split counts.
Theme and skill matches are provisional review aids. The source catalogue has no
reviewed syllabus, topic, skill or difficulty labels, and those remain open.

The sampler does not accept questions or clear source-use rights. Full wording,
options or subparts, scheme targets, educational acceptance and training metadata
still require review. The existing authenticated review service retains those
separate decisions.

See [the sampler commands and verification](../scripts/pilot-dataset/README.md)
and [the V2 upgrade checklist](V2_UPGRADE_PLAN.md#7-immediate-implementation-checklist).

The separate [20-question synthetic pilot](SYNTHETIC_QUESTION_PILOT.md) contains
new complete questions with train-only template-family lineage. Its count does
not change this frozen 100-source sample or its evaluation membership.
