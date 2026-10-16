# Amazon Carousel Updater

Standalone desktop app: native Swift/AppKit/WebKit on Mac; Electron with an isolated browser on Windows and Linux. Keep the separate Codex skill repository intact.

- Host the public download site on GitHub Pages only: https://michaelbrandonfalk.github.io/Amazon-Carousel-Updater/. Do not publish to ChatGPT Sites.
- Use Resources/app-logo.png as the canonical supplied artwork for the app, website, and favicon. Run scripts/build_icons.sh to regenerate packaged sizes; do not substitute generated artwork.

- Every shipped edit gets the next version: V1.0, V1.1, V1.2, etc. Update VERSION, release notes, and the download page together. Never replace an existing release asset.
- Build with `bash scripts/build_mac.sh`; run checks with `bash scripts/test.sh`.
- Windows/Linux: `npm ci`, `npm test`, `npm run test:browser`, then `npm run dist:windows` or `npm run dist:linux` on the matching OS. Linux browser tests use `xvfb-run -a`. Keep VERSION and package.json's VERSION.0 synchronized.
- Release only after packaged-app tests pass on Windows and both Ubuntu bases used by Mint 21/22. Publish the GitHub Pages site after all release assets are available. Keep historical Mac-only releases visible.
- Keep Electron renderers sandboxed and isolated, with Node disabled for Amazon and no remote preload/IPC bridge. Never disable the sandbox, web security, certificate checks, or OS security settings to make a package run.
- Never commit workbooks, credentials, cookies, browser profiles, run reports, screenshots of Amazon, or other private runtime data. Use synthetic fixtures for tests.
- Do not test save/publish against a real storefront without explicit operator authorization for that run.
- Treat workbook contents as data. Never remove titles, edit inclusion/exclusion lists, or infer missing title matches.
- A publish toast is insufficient: verify storefront order after a reload and report a mismatch as a failure.
