# Amazon Carousel Updater V1.9

Standalone desktop app for updating Amazon Slate from a weekly `.xlsx` workbook. Available for macOS, Windows, and Linux Mint. Every distribution includes its own Slate browser and runs without separately installing Codex, Python, Node.js, or an AI subscription/API key.

[Download V1.9](https://github.com/MichaelBrandonFalk/Amazon-Carousel-Updater/releases/tag/v1.9) · [Public GitHub Pages download page](https://michaelbrandonfalk.github.io/Amazon-Carousel-Updater/) · [Separate Codex skill](https://github.com/MichaelBrandonFalk/Amazon-Rails-Update-Via-Spreadsheet)

## Platform Downloads

| Platform | File | Installation |
| --- | --- | --- |
| macOS 12+, Intel and Apple Silicon | `Amazon-Carousel-Updater-V1.9-macOS-universal.zip` | Unzip and move the app to Applications. |
| Windows 10/11 x64 | `Amazon-Carousel-Updater-V1.9-Windows-x64-Setup.exe` | Run the installer; launch from the Start menu. No administrator install required. |
| Linux Mint 21.x/22.x, Intel/AMD 64-bit | `Amazon-Carousel-Updater-V1.9-Linux-amd64.deb` | Open with Package Installer, then launch from the Mint menu. |

Linux terminal installation from the download directory:

```bash
sudo apt install ./Amazon-Carousel-Updater-V1.9-Linux-amd64.deb
amazon-carousel-updater
```

The `.deb` targets standard Ubuntu-based Mint, not ARM or a universal Linux binary. Package dependencies are installed through the system package manager. Do not run the app as root or use `--no-sandbox`. No AppImage/FUSE setup is required. Windows installers are unsigned and the Mac app remains ad-hoc signed, not notarized; organizational security policy may block installation. No security-bypass scripts are supplied.

## Install And Run

1. Download and install the matching platform distribution above.
2. Open the app, choose the weekly workbook, and select the visible weekly worksheet.
3. For a reusable sign-in, select **Remember sign-in** before logging in once inside the app. Leave it off for a private session. Use **Storefront…** to change the storefront URL if needed.
4. Choose **Full Update** or **Order Only**, then **Run Update**.
5. Use **Export Report** for the readable HTML report. Its first table lists titles not added, the reason, and whether the rest of each carousel saved. Download that table as an Excel-compatible CSV if needed.
6. Review any unresolved titles and the result. Click **Publish Order…** to apply the final carousel order.

Full Update saves each carousel's content immediately through Amazon's Schedule dialog. The final storefront order has a separate confirmation. Stop prevents further actions but cannot undo saves already submitted to Amazon.

Review the source and use your organization's approved installation process. Old Mac-only versions remain available on the download page.

## Update Rules

- Top 10 in the U.S. stays first. Workbook rails follow, sorted by Position; extra existing rails stay below them.
- Full Update edits the first six leading titles in eligible Title pinnings or Title collection lists.
- Add missing exact catalog matches and reorder existing titles. Preserve every existing title, including duplicate entries and their relative order outside the leading targets.
- Title inclusions and Title exclusions are never edited. Dynamic/Leaving Soon rows skip content edits.
- Missing or ambiguous titles are skipped individually and reported. Matched titles lead the carousel in workbook order, with no gaps; all other existing titles remain after them.
- Catalog lookup failures and unchanged failed additions skip that title and continue within the same carousel. Uncertain inventory changes still block saving. A carousel with no matched titles is left unchanged; no guessed titles are added. Partial saves are identified in the report.
- Broad series names reuse the first matching existing season on that rail. The app records the resolved title in its report. It does not guess new seasons from search results.
- Scheduling uses the workbook Position value. The final storefront order separately reserves slot 1 for Top 10.
- Publish is verified after a reload. A success toast followed by a different saved order is a failure, not a completed update.

Known explicit workbook aliases include WHC, Iggy and Mr. Krik, Watchmaker, and the demonstrated Cinderella spelling variant. Other unresolved spellings require a workbook correction.

## Privacy

Workbooks are parsed locally in memory: built-in ZIP/XML tools on Mac, bundled ZIP/XML readers on Windows/Linux. Formulas are never executed; hidden worksheets are ignored. The app sends requested title searches and merchandising updates to Amazon only. There is no analytics service or workbook-upload endpoint.

Private sessions are the default. **Remember sign-in** is an explicit opt-in that keeps Amazon's browser session on this computer using WebKit's default data store on Mac or a persistent Chromium partition on Windows/Linux. Enable it before signing in: switching modes restarts the browser and discards unsaved drafts, so sign in once in the remembered browser. Later launches can reuse that session, but Amazon can still require sign-in or MFA. Use remembered sessions only on a trusted, access-controlled computer.

To clear it, uncheck **Remember sign-in**, use **File > Forget Amazon Sign-In** on Mac, or click **Forget sign-in** on Windows/Linux. Saved website data is deleted and the browser returns to private mode; published carousel changes are not undone. Tests always use isolated private sessions and never enable or clear an operator's real saved sign-in.

Passwords are entered directly on Amazon's page; the app never records passwords or exports authentication data. Local session data, weekly workbooks, and run logs are never included in builds, GitHub, or the public site. Reports stay in memory unless explicitly exported. Only the storefront URL and remembered-sign-in preference are saved in app preferences. Windows/Linux keep Amazon in a sandboxed, Node-disabled `WebContentsView`, separate from the trusted local controls and workbook reader; permissions, remote IPC, extra windows and non-Amazon navigation are blocked.

## Verification Status

All distributions remain preview builds. Tests cover visible worksheet selection, query/collection lists, search/add, native browser keyboard input, nested drag handles, asynchronous drag/drop, lost-focus protection against Remove, link/input Publish controls, post-save editor navigation, retry from an editor, preservation, Column A positions, missing-title continuation, order-only mode, and publish/reload verification. The synthetic drag fixture rejects JavaScript-created keyboard events; it does not reproduce every possible production Slate behavior. CI builds and runs Windows, installs/tests the Linux `.deb` on Ubuntu 22.04/24.04 (the Mint 21/22 bases), and tests the native Mac app. V1.8 was also tested locally on Mac with an operator-provided workbook: live partial content saves were reopened and verified, and the final storefront publication was verified after a fresh reload. Windows/Linux have synthetic packaged-app tests; production Slate validation on those platforms remains outstanding. Automated regression tests never submit live saves.

## Build And Test

```bash
bash scripts/build_mac.sh
bash scripts/test.sh
```

Development requires Apple's Command Line Tools and Python 3 for synthetic test generation. The distributed app requires neither. Build output is under `dist/` and excluded from Git. `--self-test` uses a bundled synthetic storefront and never connects to Amazon.

Windows/Linux development uses Node.js 24+:

```bash
npm ci
npm test
npm run test:browser
npm run dist:windows
# On Linux instead: xvfb-run -a npm run test:browser
# Then: npm run dist:linux
```

Package on the matching operating system. Runtime dependencies are locked and production-audited in CI. The current packager has a moderate npm advisory in its development-only proxy logger dependency; it is not shipped in the app and receives no workbook or browser input. Do not apply forced dependency downgrades or turn off auditing to hide it. See [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security) and [Linux packaging](https://www.electron.build/docs/linux/).

## Release Every Edit

The app has its own version line, separate from the skill's v2.x versions. V1.9 is current; the next shipped edit is V1.10. V1.2 was an unpublished validation tag. V1.8 reads ordinal and title text separately, waits for the requested editor identity, and reloads Overview before each run to discard previous unsaved state. The public download site must use GitHub Pages, never ChatGPT Sites. The supplied artwork in `Resources/app-logo.png` is shared by all platforms, the site, and browser favicon; `bash scripts/build_icons.sh` regenerates Mac/site icon sizes. Electron packaging converts the same original artwork for Windows/Linux.

1. Run `python3 scripts/new_version.py 1.10` before the next release and update `release_notes.md` and the site's static download links.
2. Build and test, commit the exact source, and push.
3. Use the release workflow's manual dispatch to validate all platforms before tagging. Then tag that exact commit `v1.9` and push the tag.
4. GitHub Actions builds/tests all three platforms, creates a release with all installers plus SHA256 checksums, and only then deploys the matching GitHub Pages download site. A failing platform blocks publication. Old releases are retained.

The download page reads per-platform release history from the public GitHub releases API and retains direct release links if that API is unavailable. `website/dist` is deployed to GitHub Pages by the release workflow (or a manual Pages dispatch), not immediately on every source push. A skill change is not automatically ported into the app; port and test applicable changes before shipping a new app version.

Independent utility; not affiliated with or endorsed by Amazon.

## Test Before Updating

On Mac, choose **File → Test Workbook Without Saving** after loading a workbook. This exercises catalog searches, additions and title ordering against the signed-in Slate page, but blocks all app save/publish commands. The final page reload discards the unsaved draft. The report separates verified unsaved drafts from actual saves and lists unresolved titles and failures. This test does not verify production scheduling or persistence; those require an operator-authorized live update.

Each run starts from a fresh Overview page and fresh per-run logs. Remembered authentication remains local and is retained. Starting a run discards any previous unsaved Slate draft.

Publishing waits for a new Slate reorder-success message before reloading. The complete order, including extra rails, is verified on up to three fresh read-only page loads. A missing acknowledgement or persisted mismatch is reported with no second publish submission.

## Season 1 fallback

Existing pinned matches and unique exact catalog matches take precedence. If a broad series name has no unique exact catalog match, use Season 1 only when exactly one catalog result matches that same series name plus Season 1. Distinct Season 1 assets remain ambiguous. Explicit requests for another season are preserved. The report lists each fallback separately from skipped titles and shows whether its carousel was saved.

## Readable run reports

Exports are standalone local HTML files: Titles not added first, separate Other issues and Season 1 selections tables, per-carousel outcomes, and a collapsed technical log. The skipped-title table can be downloaded as an Excel-compatible CSV. Workbook text is rendered as text and CSV formula prefixes are neutralized. Reports contain private run data and must never be committed to GitHub.
