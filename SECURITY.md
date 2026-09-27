# Security policy

Report vulnerabilities privately to
[dmitrii.burkov@proton.me](mailto:dmitrii.burkov@proton.me).
Include the affected commit, reproduction steps, and the expected impact.
Do not include live credentials or private source papers in the report.
Avoid public issues for vulnerabilities until the problem is resolved.

This repository contains a local research harness under development. It does not
have a supported-version schedule or a guaranteed response time.

Keep credentials in local environment files and model artifacts outside Git.
If a credential is exposed, revoke it with its provider.
See [local data and credential handling](docs/SECURITY.md) for project-specific
configuration.
