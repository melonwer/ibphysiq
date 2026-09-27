# IBPhysiq

IBPhysiq is a local research project for generating IB Physics practice questions. It is being built around a question-generation harness that combines a language model with deterministic physics calculations, graph and diagram rendering, validation, and human review.

The goal is to produce complete question packages for SL and HL: Paper 1 multiple-choice questions and coherent, multipart Paper 2 questions, with figures, worked solutions, and marking points that agree.

The delivery plan is straightforward: build the harness, assemble and review the dataset, train and evaluate the model, then release the harness on GitHub and the model or adapter on Hugging Face. The Next.js app provides a local interface for development and review. Running a hosted website or community service is outside the project scope.

## Current status

**V2 is in development.** The [V2 upgrade plan](docs/V2_UPGRADE_PLAN.md) records the architecture, delivery phases, and remaining work.

| Area | Where it stands |
| --- | --- |
| Paper mining | Extraction, provenance tracking, and source-review tools are implemented; pilot corpus review remains open. |
| Visuals and physics | Cartesian, circuit, and field-map renderers are implemented, with eight complete circuit packages and eight complete field packages checked against source targets. Coverage is still limited to supported families. |
| Harness | `QuestionRun v0.1` deterministically replays one checked circuit package and one checked field package through calculation, rendering, validation, and review preparation. |
| Persistence and review | A persistent run store and authenticated local review UI are implemented. |
| Live generation | V2 planning and authoring model adapters, broader coverage, and integration with the app's generation route remain to be built. |
| Dataset and model | Reviewed dataset assembly, baseline evaluation, V2 training, and the evaluated Hugging Face release are still ahead. |

The current replay makes no model calls. It tests the execution and review workflow; it does not establish the quality or diversity of a live generator. The existing root-page generator uses the older provider-based path and is separate from V2.

## How the system is intended to work

One structured physics scenario is the shared source for the question, calculations, figures, and solution:

1. Select supported topics, skills, and question families for a generation request.
2. Have the model propose a scenario and question plan.
3. Validate the specification and calculate the supported physics deterministically.
4. Have the model write the question and marking points using the verified results.
5. Render figures and validate the complete package, including answer consistency and visibility.
6. Send the package for human review, bounded repair and revalidation, or rejection.

The initial model experiment proposed in the plan is `Qwen/Qwen3-8B` with a mixed QLoRA adapter. The untuned checkpoint must be evaluated in the same harness before training; the final model and adapter choices depend on measured results.

The initial scope covers Paper 1 MCQs and Paper 2, including graphical and non-graphical questions. Paper 1B is outside this upgrade's initial scope. Full syllabus coverage is a goal, not a current capability.

## Run locally

Use **Node.js 22** and **npm 10+**. The Node version is recorded in [`.nvmrc`](.nvmrc).

```bash
git clone https://github.com/melonwer/ibphysiq.git
cd ibphysiq
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The development server binds to the local machine.

- **Existing generator:** the root page uses the older provider integrations. For that path, copy [`.env.example`](.env.example) to `.env.local` and configure the provider settings you need.
- **Review UI:** visit `/review` after setting a long random `REVIEW_ADMIN_TOKEN` in `.env.local`. It reads stored question runs from `data/question-runs/` by default; `REVIEW_RUN_STORE_DIR` selects another directory.
- **V2 replay:** the deterministic replay and ordinary tests require no model API credentials. Starting the app does not start V2 model generation or populate the review queue.

For local setup, Python research tooling, and optional configuration, see [Getting started](docs/GETTING_STARTED.md). The [harness documentation](docs/QUESTION_GENERATION_HARNESS.md) describes the run, persistence, and review contracts.

## Development checks

```bash
npm run check
```

This runs lint, TypeScript checks, the self-contained tests, and a local app build.

Source-backed research fixture suites run separately with `npm run test:research-fixtures` and require the local paper corpus and derived records described in the [visual pilot guide](scripts/visual-pilot/README.md).

## Repository map

| Path | Purpose |
| --- | --- |
| `lib/generation-harness/` | Versioned run contracts, deterministic replay, validation stages, and persistence |
| `lib/visuals/` | Physics calculations, figure specifications, SVG renderers, and pilot fixtures |
| `lib/review/`, `app/review/` | Review service and local review interface |
| `scripts/paper-mining/` | PDF extraction, source provenance, and extraction review |
| `scripts/visual-pilot/` | Figure reconstruction and question-package pilot tooling |
| `app/`, `components/` | Next.js routes and local UI |
| `lib/services/` | Existing provider integrations |
| `docs/` | Architecture, implementation notes, setup, and the V2 plan |

The root Python frontends and training notebooks are earlier experiments. The current workflow is documented in the local setup and V2 guides.

## Dataset and release path

The harness comes before bulk dataset assembly so training examples match the tasks the system actually performs: proposing structured scenarios and writing questions from verified results.

The next milestones are to finish the reviewed pilot, connect live model adapters, assemble versioned training and evaluation splits, and compare the trained model against the untuned baseline. Source questions and their derivatives stay grouped in the same split.

Passing automated checks does not grant final acceptance. Training readiness also requires human acceptance, source-use clearance, training metadata, and a grouped split assignment. Private source papers and unapproved derived data stay out of the releases.

The intended outputs are:

- **GitHub:** harness source, local setup instructions, and reproducible evaluation tooling.
- **Hugging Face:** the evaluated V2 model or adapter, model card, and reproducible training configuration.

Release timing, dataset scale, compute budget, and quality thresholds remain open experiment choices. See the [V2 plan](docs/V2_UPGRADE_PLAN.md) for details.

## Documentation

- [Local setup](docs/GETTING_STARTED.md)
- [V2 upgrade plan](docs/V2_UPGRADE_PLAN.md)
- [Question generation harness](docs/QUESTION_GENERATION_HARNESS.md)
- [Visual system](docs/VISUAL_SYSTEM.md)
- [Visual pilot and reconstruction work](docs/VISUAL_PILOT.md)
- [Paper mining tools](scripts/paper-mining/README.md)

## License

The code is available under the [MIT License](LICENSE.md). Source papers, datasets, and model artifacts are subject to their own terms.
