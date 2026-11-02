#!/usr/bin/env python3
"""Check a submission zip against Clever's published limits (T233).

Limits (from the submission instructions):
  - the zip is at most 100 MB;
  - it holds at most 20,000 files and 500 MB once unzipped;
  - compose.yaml is at the top level;
  - installed dependencies, build output, and large media are left out: no node_modules, dist,
    .next, .turbo, or coverage folder (the only ones this stack creates), and no file over 5 MB.
Also checked, in case the zip is ever made by hand from the working folder:
  - the committed .env with working defaults is at the top level;
  - no confidential or personal file is included: the brief (assignment.md), the written
    answers kept beside the code, the local secrets file (.env.local, which holds cloud keys),
    local editor settings, study notes, or agent worktrees (T388).

Entries are counted strictly (folders too).

Usage: python3 scripts/submission/check_zip.py <zip>   Exit code 1 if any check fails.
"""

from __future__ import annotations

import os
import sys
import zipfile

MB = 1024 * 1024
MAX_ZIP_BYTES = 100 * MB
MAX_ENTRIES = 20_000
MAX_UNZIPPED_BYTES = 500 * MB
MAX_FILE_BYTES = 5 * MB  # "large media": the seed photos are under 5 MB in total (T138)
FORBIDDEN_DIRS = {"node_modules", "dist", ".next", ".turbo", "coverage"}
FORBIDDEN_FILES = {"assignment.md", "teams.md", "forgemini.md", ".env.local", "settings.local.json"}
PRIVATE_DIRS = {"study-notes", "worktrees", ".claude", ".specify"}
# The owner's private engineering process stays local (T412). Spec Kit's specs/ is private only at
# the top level; e2e/specs/ holds the browser tests and ships.
PRIVATE_PATHS = (
    "CLAUDE.md",
    "specs/",
    "scripts/board/",
    ".github/workflows/claude",
    ".github/pull_request_template.md",
)


def human(n: float) -> str:
    return f"{n / MB:.2f} MB"


def main(path: str) -> int:
    failures: list[str] = []
    rows: list[tuple[str, str, str, str]] = []

    def limit(name: str, value: float, cap: float, show) -> None:
        ok = value <= cap
        rows.append((name, show(value), show(cap), "ok" if ok else "FAIL"))
        if not ok:
            failures.append(f"{name}: {show(value)} is over the limit of {show(cap)}")

    zip_bytes = os.path.getsize(path)
    with zipfile.ZipFile(path) as zf:
        infos = zf.infolist()

    names = [i.filename for i in infos]
    unzipped = sum(i.file_size for i in infos)

    limit("Zip size", zip_bytes, MAX_ZIP_BYTES, human)
    limit("Entries (files and folders)", len(infos), MAX_ENTRIES, lambda v: f"{int(v):,}")
    limit("Unzipped size", unzipped, MAX_UNZIPPED_BYTES, human)

    compose = "compose.yaml" in names
    if not compose:
        failures.append("no compose.yaml at the top level")
    if ".env" not in names:
        failures.append(".env (the working default settings) is not at the top level")

    for n in names:
        parts = [p for p in n.split("/") if p]
        hit = FORBIDDEN_DIRS.intersection(parts[:-1] if not n.endswith("/") else parts)
        if hit:
            failures.append(f"build output or dependencies included: {n}")
        if parts and parts[-1] in FORBIDDEN_FILES:
            failures.append(f"confidential file included: {n}")
        if PRIVATE_DIRS.intersection(parts[:-1] if not n.endswith("/") else parts):
            failures.append(f"private folder included: {n}")
        if n.startswith(PRIVATE_PATHS):
            failures.append(f"private file included: {n}")
    for i in infos:
        if i.file_size > MAX_FILE_BYTES:
            failures.append(f"large file ({human(i.file_size)} > {human(MAX_FILE_BYTES)}): {i.filename}")

    lines = [
        f"## Submission zip check: {os.path.basename(path)}",
        "",
        "| Check | Value | Limit | Status |",
        "| --- | --- | --- | --- |",
        *[f"| {a} | {b} | {c} | {d} |" for a, b, c, d in rows],
        f"| compose.yaml at top level | {'yes' if compose else 'no'} | required | {'ok' if compose else 'FAIL'} |",
        f"| .env at top level | {'yes' if '.env' in names else 'no'} | required | {'ok' if '.env' in names else 'FAIL'} |",
        "",
    ]
    if failures:
        lines += ["**Failures**", *[f"- {f}" for f in failures[:50]], ""]
    report = "\n".join(lines)
    print(report)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as fh:
            fh.write(report + "\n")
    for f in failures:
        if os.environ.get("GITHUB_ACTIONS") == "true":
            print(f"::error title=Submission zip::{f}")
    return 1 if failures else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: check_zip.py <zip>")
    sys.exit(main(sys.argv[1]))
