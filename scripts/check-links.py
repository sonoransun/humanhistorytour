#!/usr/bin/env python3
"""Check every internal link and #fragment across the site.

Pure standard library — no install, no server needed. This is the cheapest and
highest-value check in the repo: it caught 13 broken anchors when the chapter
"Go deeper" cards linked to reference-page sections that did not exist.

Usage:
    python3 scripts/check-links.py            # from the repo root
    python3 scripts/check-links.py path/to/docs

Exit status is 1 if anything is broken, so it can gate a commit hook or CI.
"""

import os
import re
import sys
from urllib.parse import urldefrag

EXTERNAL = ("http://", "https://", "mailto:", "tel:", "data:", "javascript:")


def main(root: str) -> int:
    pages = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            if fn.endswith(".html"):
                pages.append(os.path.join(dirpath, fn))
    pages.sort()

    if not pages:
        print(f"No HTML found under {root!r}", file=sys.stderr)
        return 1

    # id="..." present in each file
    ids = {}
    for p in pages:
        with open(p, encoding="utf-8") as fh:
            ids[os.path.normpath(p)] = set(re.findall(r'id="([^"]+)"', fh.read()))

    broken = []
    checked = 0
    for p in pages:
        here = os.path.normpath(p)
        d = os.path.dirname(p)
        with open(p, encoding="utf-8") as fh:
            html = fh.read()

        for href in re.findall(r'href="([^"]+)"', html):
            if href.startswith(EXTERNAL):
                continue
            checked += 1

            # in-page anchor
            if href.startswith("#"):
                frag = href[1:]
                if frag and frag not in ids[here]:
                    broken.append((p, href, "no such id on this page"))
                continue

            base, frag = urldefrag(href)
            if not base:
                continue

            target = os.path.normpath(os.path.join(d, base))
            if not os.path.exists(target):
                broken.append((p, href, "file not found"))
            elif frag and target in ids and frag not in ids[target]:
                broken.append((p, href, f"target exists but has no #{frag}"))

    rel = lambda p: os.path.relpath(p, root)  # noqa: E731
    print(f"Checked {checked} internal links across {len(pages)} pages.")
    if broken:
        print(f"\n{len(broken)} BROKEN:")
        for pg, href, why in broken:
            print(f"  {rel(pg)}  ->  {href}   ({why})")
        return 1

    print("No broken internal links or fragments.")
    return 0


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "docs"
    if not os.path.isdir(target):
        print(f"Not a directory: {target!r}", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(target))
