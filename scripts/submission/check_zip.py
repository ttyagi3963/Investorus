#!/usr/bin/env python3
"""Check a submission zip against Clever's published limits (T233).

Limits (from the submission instructions):
  - the zip is at most 100 MB;
  - it holds at most 20,000 files and 500 MB once unzipped;
  - compose.yaml is at the top level;
  - installed dependencies and build output are left out.
Also checked, in case the zip is ever made by hand from the working folder:
  - the committed .env with working defaults is at the top level;
  - assignment.md (confidential, gitignored) is not included.

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
FORBIDDEN_DIRS = {"node_modules", "dist", ".next", ".turbo", "coverage"}
FORBIDDEN_FILES = {"assignment.md"}


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
