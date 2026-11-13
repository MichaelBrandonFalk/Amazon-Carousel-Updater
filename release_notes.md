# V1.7

- Read pinned-title names from the rendered row rather than detached-clone textContent, which can include hidden decorations.
- Exclude Slate's trailing Remove control and out-of-window availability warning, and normalize display whitespace. Warnings changing during a drag no longer masquerade as changes to the title inventory.
- Add the expected/actual row counts and first differing slot/title to every failed per-move full-list check, including the error path that was still generic in V1.6.
- Retain complete inventory, duplicate-count, remaining-title-order, and before-save/after-save verification. Genuine changed titles still fail closed.
- Add Mac and Electron regression coverage where an unrelated row gains an availability warning and hidden decoration after a successful drop. The unchanged V1.6 reader fails this fixture; the corrected reader passes. Also test a genuinely changed title and its exact error detail.

Validation: synthetic workbook and browser tests on supported package platforms. No live Slate save or publish. The production V1.6 drop was confirmed via Slate's accessibility announcement; its original expected array was not retained, so the exact live comparison mismatch cannot be recovered from that run.

## V1.6

- Wait for settled title lists before taking the original inventory and validating content.
- Verify the complete expected list after every drop, including duplicate counts and the order of all other titles, rather than accepting only the moved title reaching its slot.
- Require the announced destination after each keyboard arrow. Scrolling and row animation no longer count as successful movement.
- Block pointer clicks and wheel input inside Slate while a title move is active; restore interaction after success, cancellation, or failure. Stop remains available outside the Slate pane.
- Replace the generic order/preservation error with the exact leading slot, missing/extra title copies, or first remaining-title mismatch. Reports stay local.
- Add native Mac and Electron regression coverage for temporary tail-list changes during drop rendering and detailed validation failures.

Validation: synthetic browser fixtures and workbook checks; no live Slate save or publish. This release hardens known timing weaknesses and improves diagnosis. The reported V1.5 preservation failure could not be conclusively attributed because V1.5 did not record its original list or failing condition.

## V1.5

- Prefer drag-handle attributes on the row itself before checking nested handles. Never fall back to an arbitrary nested button, which might be Remove.
- Add native Mac and Electron regression coverage for a draggable row containing a focusable Remove control, in addition to lost-focus protection.
- Validate the universal Mac package on the supported Intel Mac runner; Apple Silicon is also tested locally.
- Includes V1.4's reliable browser input, Publish/Overview navigation fixes, non-blocking unresolved-title reporting, and opt-in local remembered sign-in.

Validation: synthetic browser tests exercise both row and nested-handle layouts without any Remove activation. No live Slate saves are performed by the tests; the operator should retry using V1.5 rather than V1.4.

## V1.4

- Replace JavaScript-created drag keys with native browser input on Mac, Windows, and Linux. Target the actual drag handle, wait for each move, and verify the dropped title order before saving.
- Check focus before every drag key; refuse input if it could hit another control such as Remove.
- Recognize enabled carousel Publish controls implemented as buttons, links, or input controls, including accessible labels.
- Return explicitly to Overview from the saved editor record, and recover safely when a retry begins inside an editor. Do not resubmit a save to work around a navigation timeout.
- Continue past missing/ambiguous titles and catalog lookup/selection failures. Report the affected title/carousel without saving it; continue with remaining safe carousels.
- Add opt-in Remember sign-in and Forget sign-in. Amazon sessions stay in local browser storage only; passwords are never recorded. Enabling it restarts the browser, so sign in once after enabling. Amazon can still request MFA or reauthentication.
- Update Electron within the existing major version and patch the workbook XML dependency.
- Move Mac CI to the supported macOS 15 runner; the distributed native app still targets macOS 12 and newer.
- Expand regression tests to reject untrusted keys, use nested handles and delayed drag/drop, divert focus toward Remove, exercise Publish markup variants and saved-editor landings, and continue updates after an unresolved rail.

Validation: synthetic workbook and embedded-browser tests on all supported build targets. These changes address the supplied error reports; production Slate still requires an operator-supervised retry. No real account credentials or private weekly sheets are part of this release.

## V1.3

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
