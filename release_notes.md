# V1.1

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
