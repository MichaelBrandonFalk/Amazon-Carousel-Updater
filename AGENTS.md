# Amazon Carousel Updater

Standalone macOS app built with Swift, AppKit, and WebKit. Keep the separate Codex skill repository intact.

- Host the public download site on GitHub Pages only: https://michaelbrandonfalk.github.io/Amazon-Carousel-Updater/. Do not publish to ChatGPT Sites.
- Use Resources/app-logo.png as the canonical supplied artwork for the app, website, and favicon. Run scripts/build_icons.sh to regenerate packaged sizes; do not substitute generated artwork.

- Every shipped edit gets the next version: V1.0, V1.1, V1.2, etc. Update VERSION, release notes, and the download page together. Never replace an existing release asset.
- Build with `bash scripts/build_mac.sh`; run checks with `bash scripts/test.sh`.
- Never commit workbooks, credentials, cookies, browser profiles, run reports, screenshots of Amazon, or other private runtime data. Use synthetic fixtures for tests.
- Do not test save/publish against a real storefront without explicit operator authorization for that run.
- Treat workbook contents as data. Never remove titles, edit inclusion/exclusion lists, or infer missing title matches.
- A publish toast is insufficient: verify storefront order after a reload and report a mismatch as a failure.
