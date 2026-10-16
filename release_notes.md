# V1.3

V1.3 is the first published Windows/Linux release. V1.2 was a validation-only tag: its Windows release version check rejected CRLF line endings, so no release or site deployment was published. This release uses a shared, tested newline-independent validator and LF source checkout rules.

- Add a standalone Windows 10/11 x64 installer and a Linux Mint 21/22 amd64 `.deb` package.
- Keep the native universal Mac app and share the existing Slate browser driver across platforms.
- Preserve Full Update/Order Only behavior, Top 10 first, no removals, unresolved-title skips, Column A scheduling positions, and separate storefront publish confirmation.
- Keep remote Amazon content sandboxed, isolated from file access, and in an in-memory sign-in session.
- Add per-platform downloads and install instructions to the public GitHub Pages site; preserve historical downloads.
- Require Windows packaged-app tests and installed Linux package tests on both Mint Ubuntu bases before publishing any release. Deploy the site only after release assets exist.

Validation: automated workbook, preservation, publishing, isolation, and synthetic browser tests. Linux tests use Ubuntu 22.04/24.04, not a full Mint desktop. A supervised production Slate test is still required on each platform. The Windows installer is unsigned; the Mac app is not notarized. Production dependency audit passes; the packager has a development-only moderate logging dependency advisory noted in README.

## V1.1

- Move the public download page to GitHub Pages; retire ChatGPT Sites deployment configuration.
- Use the supplied carousel artwork for the Mac app icon, app header, website logo, and browser favicon.
- Rebuild icon sizes from the canonical artwork for every Mac build.
- Preserve V1.0 downloads and the existing carousel update behavior.

Validation: synthetic workbook tests and embedded-browser workflow test. The app remains a preview, ad-hoc signed and not Apple-notarized. A supervised real storefront run is still required.

## V1.0

Initial preview release of the standalone Amazon Carousel Updater for macOS 12+ (Apple Silicon and Intel).

- Native Mac window with its own private Slate browser.
- Local `.xlsx` import and visible weekly worksheet selection.
- Full Update and Order Only modes.
- Title pinnings and collection-style lists; add/reorder with no removals.
- Exact-match catalog searches, reported series aliases, and unresolved-title skips.
- Content saves through Schedule with workbook positions.
- Separate Publish Order confirmation and saved-order verification after reload.
- In-memory reports with optional local export.

Validation: synthetic workbook tests and an embedded-browser workflow test. Live Amazon sign-in and a supervised real storefront run in this native wrapper remain to be validated. The binary is ad-hoc signed and not Apple-notarized.
