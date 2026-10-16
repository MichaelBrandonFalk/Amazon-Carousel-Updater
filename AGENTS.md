# Amazon Carousel Updater

Standalone macOS app built with Swift, AppKit, and WebKit. Keep the separate Codex skill repository intact.

- Every shipped edit gets the next version: V1.0, V1.1, V1.2, etc. Update VERSION, release notes, and the download page together. Never replace an existing release asset.
- Build with `bash scripts/build_mac.sh`; run checks with `bash scripts/test.sh`.
- Never commit workbooks, credentials, cookies, browser profiles, run reports, screenshots of Amazon, or other private runtime data. Use synthetic fixtures for tests.
- Do not test save/publish against a real storefront without explicit operator authorization for that run.
- Treat workbook contents as data. Never remove titles, edit inclusion/exclusion lists, or infer missing title matches.
- A publish toast is insufficient: verify storefront order after a reload and report a mismatch as a failure.
