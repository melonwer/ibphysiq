# Session handoff

Updated: 2026-10-02

Checkpoint branch: `feat/v2-mechanics-synthetic-pilot`. Resume from this branch's
latest commit. Changes are committed locally; no remote push is part of this
checkpoint.

## Current state

The mechanics pipeline is complete for eight source packages. The source sampler
contains 100 questions with a frozen 70/15/15 split and a coverage report.
Circuits, fields and mechanics have 24 complete checked source packages in total.

The fresh synthetic pilot contains 20 complete new questions, five each for
graphs, circuits, fields and mechanics. It uses deterministic code, not Qwen.
Three GPT-6.1 Sol reviewers checked the calculations, worked solutions, marking
points and all 40 final desktop/mobile screenshots. No material findings remain.
Regular graph scales and half-step grids are built into the templates.

The user approved the reconstructed figures and said the revised graph detail
looks good. Do not ask them to re-review the reconstructions. Agent verification
and this appearance feedback do not fabricate formal package acceptance or
training clearance.

## Resume here

Connect fresh, parameter-bearing scenario generation and authoring to the local
Qwen adapters and native `QuestionRun` review workflow. The existing adapters
use source-conditioned scenarios; their earlier 20-request experiment copied
the supplied question objects. Preserve that experiment as diagnostic evidence.

Use the checked fresh packages as development fixtures, keep student text,
calculations and figures driven by the same scenario, and preserve parent-group
train membership. Do not use held-out sources for development or mark agent
checks as human acceptance.

After that integration, capture the held-out untuned baseline, complete the 76
source-only pilot packages and expand the reviewed dataset toward the user's
approximately 1,000-package target. Training needs its experiment contract first.

## Artifacts and verification

The code and documentation are in this worktree. Private outputs also have
checksum-matched copies under `/home/d4ydy/ibphysiq/dataset/_derived/`:

- `new-question-pilot-v0.1/index.html`: fresh batch `synthetic-20-b194f62ea94a8fe8`.
- `new-question-pilot-v0.1/REVIEW.md`: review summary and evidence links.
- `pilot-dataset-v0.1/index.html`: frozen source pilot `pilot-b95e16b264a65951`.
- `qwen-author-baseline-v0.1/index.html`: historical source-conditioned experiment.
- `mechanics-pilot-v0.1/index.html`: accepted reconstructed figures.

The fresh-pilot calculation and graph suites passed 77 tests, type checking,
focused ESLint and browser checks. A clean generator rerun reproduced 45 core
files byte for byte; the review verifier rejects questions changed after review.
The complete checkpoint also passes `npm run check`, including all 471 Jest
tests and the production build, plus 15 sampler tests. Lint reports existing
warnings without errors. The concurrent review test now supplies the signing
secret to both store instances; production authorization checks stay intact.
The [V2 plan](V2_UPGRADE_PLAN.md#7-immediate-implementation-checklist) remains the
main checklist. [The pilot guide](SYNTHETIC_QUESTION_PILOT.md) has reproducible
commands. Private corpus, generated artifacts and review state remain outside Git.
