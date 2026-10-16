"""Advance the next app release without overwriting an existing version."""
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
current = (root / "VERSION").read_text().strip()
requested = sys.argv[1] if len(sys.argv) == 2 else ""
if not re.fullmatch(r"\d+\.\d+", requested):
    raise SystemExit("Usage: python3 scripts/new_version.py 1.1")
old = tuple(map(int, current.split(".")))
new = tuple(map(int, requested.split(".")))
if new <= old:
    raise SystemExit("The new version must be greater than " + current)
existing = subprocess.run(["git", "tag", "--list", "v" + requested], cwd=root, capture_output=True, text=True, check=True)
if existing.stdout.strip():
    raise SystemExit("That version already has a release tag.")
(root / "VERSION").write_text(requested + "\n")
readme = root / "README.md"
readme.write_text(readme.read_text().replace(f"Updater V{current}", f"Updater V{requested}").replace(f"Download V{current}", f"Download V{requested}").replace(f"tag/v{current}", f"tag/v{requested}").replace(f"-V{current}-macOS", f"-V{requested}-macOS"))
print(f"Next version: V{requested}. Update release_notes.md, build, test, commit, and tag v{requested}.")
