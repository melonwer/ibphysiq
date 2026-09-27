# Work locally

IBPhysiq is a local research project for an IB Physics question-generation harness.
The delivery plan is to publish the harness on GitHub and the trained model on
Hugging Face. Dataset assembly and the V2 training experiment are still ahead.

## Start the local app

Use Node.js 22, as recorded in [`.nvmrc`](../.nvmrc). If you use nvm, run `nvm use`
from the repository root. Then install the locked dependencies and start Next.js:

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:3000>. Installation does not build the app.
The development server listens on the local machine.

The root page still uses the older provider-based generator. To use that path,
copy [`.env.example`](../.env.example) to `.env.local` if the local file does not
exist, then supply the provider settings you need. Keep real credentials local.
The V2 replay and ordinary tests do not require model API credentials.

The review UI is at `/review`. It reads stored question runs and requires
`REVIEW_ADMIN_TOKEN` in `.env.local`. Runs default to `data/question-runs/`;
`REVIEW_RUN_STORE_DIR` selects another directory. See the
[review and persistence documentation](QUESTION_GENERATION_HARNESS.md) for the
current authentication and run contracts.

To run a built copy locally:

```bash
npm run build
npm start
```

## Find the code

| Path                         | Contents                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `lib/generation-harness/`    | V2 run contracts, deterministic replay, validation stages, and persistent run store  |
| `lib/visuals/`               | Visual specifications, SVG renderers, physics calculations, and pilot fixtures       |
| `lib/review/`, `app/review/` | Authenticated review service and local review UI                                     |
| `scripts/paper-mining/`      | PDF extraction, provenance, and source review tools                                  |
| `scripts/visual-pilot/`      | Source-backed visual and question-package reconstruction tools                       |
| `app/`, `components/`        | Next.js routes and UI, including the older generator                                 |
| `lib/services/`              | Older provider integration and generation services                                   |
| `dataset/`, `data/`          | Local source corpus, derived artifacts, and run data; keep private inputs out of Git |

The current V2 adapters replay checked circuit and field packages without model
calls. They exercise calculations, rendering, validation, persistence, and review.
Live planning and authoring adapters remain to be built. Start with the
[V2 upgrade plan](V2_UPGRADE_PLAN.md), then read the
[generation harness](QUESTION_GENERATION_HARNESS.md) and
[visual system](VISUAL_SYSTEM.md) docs.

## Run the checks

```bash
npm run check
```

This runs lint, type checking, the self-contained tests, and a local app build.
Each step is also available through `npm run lint`, `npm run type-check`,
`npm test`, and `npm run build`.

`npm test` runs the tests that can work from a checkout. To run the source-backed
fixture suites against your local paper corpus and derived records, use
`npm run test:research-fixtures`. Their inputs are described in the
[visual pilot guide](../scripts/visual-pilot/README.md).

## Use the Python research tools

Python is optional for the Next.js app. For paper mining and visual pilot tooling,
use Python 3.12, create a virtual environment, and install their dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r scripts/paper-mining/requirements.txt
python -m unittest discover -s scripts/paper-mining -p 'test_*.py'
python -m unittest discover -s scripts/visual-pilot -p 'test_*.py'
```

Follow the [paper mining guide](../scripts/paper-mining/README.md) for extraction,
OCR dependencies, and source review. The root Python frontends and training
notebooks are earlier experiments; their dependencies are separate from these
tools. Preserve source PDFs and generate derived copies.
