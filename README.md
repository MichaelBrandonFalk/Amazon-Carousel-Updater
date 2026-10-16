# Amazon Carousel Updater V1.0

Standalone Mac app for updating Amazon Slate from a weekly `.xlsx` workbook. It includes its own Slate browser and runs without Codex, Python, Node.js, an API key, or an AI subscription.

[Download V1.0 for macOS](https://github.com/MichaelBrandonFalk/Amazon-Carousel-Updater/releases/tag/v1.0) · [Public download page](https://amazon-carousel-updater.great-americ-8514.chatgpt.site) · [Separate Codex skill](https://github.com/MichaelBrandonFalk/Amazon-Rails-Update-Via-Spreadsheet)

## Install And Run

1. Download `Amazon-Carousel-Updater-V1.0-macOS-universal.zip`, unzip it, and move the app into Applications.
2. Open the app, choose the weekly workbook, and select the visible weekly worksheet.
3. Sign in to Slate inside the app. Use **Storefront…** to change the storefront URL if needed.
4. Choose **Full Update** or **Order Only**, then **Run Update**.
5. Review any unresolved titles and the result. Click **Publish Order…** to apply the final carousel order.

Full Update saves each carousel's content immediately through Amazon's Schedule dialog. The final storefront order has a separate confirmation. Stop prevents further actions but cannot undo saves already submitted to Amazon.

Requires macOS 12 Monterey or newer. One universal app supports both Apple Silicon and Intel. This initial release is ad-hoc signed, not Apple-notarized: macOS may block first launch. Review the source and use your organization's approved installation process. No bypass or quarantine-removal script is included.

## Update Rules

- Top 10 in the U.S. stays first. Workbook rails follow, sorted by Position; extra existing rails stay below them.
- Full Update edits the first six leading titles in eligible Title pinnings or Title collection lists.
- Add missing exact catalog matches and reorder existing titles. Preserve every existing title, including duplicate entries and their relative order outside the leading targets.
- Title inclusions and Title exclusions are never edited. Dynamic/Leaving Soon rows skip content edits.
- A missing or ambiguous catalog match leaves that carousel unchanged and appears in the report.
- Broad series names reuse the first matching existing season on that rail. The app records the resolved title in its report. It does not guess new seasons from search results.
- Scheduling uses the workbook Position value. The final storefront order separately reserves slot 1 for Top 10.
- Publish is verified after a reload. A success toast followed by a different saved order is a failure, not a completed update.

Known explicit workbook aliases include WHC, Iggy and Mr. Krik, Watchmaker, and the demonstrated Cinderella spelling variant. Other unresolved spellings require a workbook correction.

## Privacy

Workbooks are parsed locally in memory using the Mac's built-in ZIP/XML tools. The app sends requested title searches and merchandising updates to Amazon only. There is no analytics service or workbook-upload endpoint.

The browser uses a nonpersistent WebKit session. Passwords are entered directly on Amazon's sign-in page; the app never reads password fields or exports cookies. Sign in again after quitting. Browser sessions, workbooks, and run logs are never included in builds, GitHub, or the public site. Reports remain in memory unless the operator exports one. The storefront URL is the only saved preference.

## Verification Status

V1.0 is an initial preview release. It is built for both Mac architectures and tested against synthetic workbook cases and a local Slate-like browser fixture. Those checks cover query/collection lists, search/add, keyboard reordering, preservation, scheduling positions, unresolved matches, and publish/reload verification. A supervised run in this new embedded browser against a real Amazon storefront is still required. The separate Codex skill has been used against Slate; that does not establish that the native wrapper has passed a production run.

## Build And Test

```bash
bash scripts/build_mac.sh
bash scripts/test.sh
```

Development requires Apple's Command Line Tools and Python 3 for synthetic test generation. The distributed app requires neither. Build output is under `dist/` and excluded from Git. `--self-test` uses a bundled synthetic storefront and never connects to Amazon.

## Release Every Edit

The app has its own version line, separate from the skill's v2.x versions. V1.0 is the initial app; the next shipped edit is V1.1, then V1.2, etc.

1. Run `python3 scripts/new_version.py 1.1` before the next release and update `release_notes.md`.
2. Build and test, commit the exact source, and push.
3. Tag that commit `v1.1` and push the tag.
4. GitHub Actions builds, tests, and creates the matching release assets. Old releases are retained.

The download page reads release history from the public GitHub releases API and retains a direct V1.0 link if that API is unavailable. A skill change is not automatically ported into the app; port and test applicable changes before shipping a new app version.

Independent utility; not affiliated with or endorsed by Amazon.
