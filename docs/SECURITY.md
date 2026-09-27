# Handle local credentials and research data

Keep API credentials and `REVIEW_ADMIN_TOKEN` in `.env.local`.
Use [`.env.example`](../.env.example) for placeholder configuration, and never
put secrets in `NEXT_PUBLIC_*` variables, which are exposed to the browser.

The app runs on `127.0.0.1` by default. Keep the review UI local. Its shared admin
token and signed sessions are described in the
[review documentation](QUESTION_GENERATION_HARNESS.md#authentication-and-csrf).
With no admin token configured, the review service is disabled.

Keep source PDFs, extracted figures, private review records, and model weights
out of Git. Preserve raw inputs and write derived artifacts separately.
Review source-use rights before publishing a dataset or generated examples.

Before sharing logs or bug reports, remove credentials and private source content.
If a credential is exposed, revoke it with its provider and replace the local
value. Removing the value from a file does not revoke the credential.

Use `npm audit` to inspect JavaScript dependency advisories.
Report vulnerabilities privately using the [security policy](../SECURITY.md).
