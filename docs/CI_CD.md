# Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) checks the local code on
pushes and pull requests. It can also be started manually.

The Node.js job uses the version in [`.nvmrc`](../.nvmrc), installs dependencies
with `npm ci`, then runs lint, type checking, the self-contained Jest suite, and
a Next.js build. The Python 3.12 job installs the paper-mining dependencies and runs
the paper-mining and visual-pilot unit tests.

These checks do not need provider API keys or the private PDF corpus. Source-backed
fixture tests run separately with `npm run test:research-fixtures` when their
local inputs are available. See [local setup](GETTING_STARTED.md) for commands.

CI does not deploy websites, push container images, publish packages, create
releases, or run scheduled jobs. The delivery target is the
[local harness and model described in the V2 plan](V2_UPGRADE_PLAN.md).

Dependency vulnerability reports remain available through `npm audit`.
Removing the old deployment and scanner workflows does not resolve dependency
advisories; review and update affected dependencies separately.

Third-party GitHub App checks are configured in the provider's project settings.
Removing a workflow from this repository does not disconnect an external service.
