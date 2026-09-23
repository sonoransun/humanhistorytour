#!/usr/bin/env python3
"""
lint-pages.py — static checks for the traps that fail SILENTLY on this site.

Pure stdlib. Run after any content edit:

    python3 scripts/lint-pages.py                 # every page
    python3 scripts/lint-pages.py docs/tour/04-first-civilizations.html
    python3 scripts/lint-pages.py --baseline DIR  # also compare scene step counts to an older copy of docs/

Errors (exit 1):
  - a literal tag inside <pre class="mermaid"> (must be &lt;br/&gt; entities — CLAUDE.md gotcha 1)
  - a data-step-draw path without pathLength="1"
  - a scene whose stage references a step index it does not have
  - with --baseline: an existing scene whose .step count changed (gotcha 8)
  - a milestone card (.dev) without data-y, or whose data-y disagrees with its visible date
  - "Thirty-four turning points" ≠ number of .dev cards; "Six ways to…" ≠ number of diagrams
  - a counter whose authored text is not the formatted final value (no-JS readers would see it)
  - the #world panel not having the sixteen regions in canonical order
  - duplicate id attributes; unbalanced structural tags; class="region" outside SVG
Warnings:
  - a Mermaid figure with no <table class="data"> beside it
"""
import argparse, glob, html, os, re, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOW = 2000

REGIONS = ["West Asia", "North Africa & the Nile", "West & Central Africa", "East & Southern Africa",
           "Europe & the Mediterranean", "Central Asia & the Steppe", "South Asia", "East Asia",
           "Southeast Asia", "Australia", "Oceania & the Pacific", "The Arctic", "North America",
           "Mesoamerica", "The Caribbean", "South America"]

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def words(n):
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("-" + ONES[n % 10] if n % 10 else "")
    return None


def word_to_int(w):
    w = w.lower().strip()
    for n in range(0, 100):
        if words(n) == w:
            return n
    return None


# ---- date parsing (mirrors the rules in templates/COMPONENTS.md §4) -------------
UNIT = r"(Mya|Ma|million years ago|kya|ka|thousand years ago|years ago|yrs ago|ya|BCE|BC|CE|AD)"


def parse_date(text, mode):
    d = html.unescape(re.sub(r"<[^>]+>", "", text)).replace("–", "-").replace("—", "-").replace("−", "-")
    d = re.sub(r"\b(c\.|ca\.|~|≥|>|<|≤|before|after|from|by|late|early|mid-?)\s*", "", d, flags=re.I).strip()
    d = re.sub(r"^~", "", d)
    parts = re.split(r"\s*(?:-|to|&|/|and|;)\s*", d)
    ys = []
    for p in parts:
        m = re.search(r"\d[\d,]*(?:\.\d+)?", p)
        if not m:
            continue
        u = re.search(r"\b" + UNIT + r"\b", p)
        ys.append([float(m.group(0).replace(",", "")), u.group(1) if u else None])
    if not ys:
        return None
    last = None
    for i in range(len(ys) - 1, -1, -1):
        if ys[i][1]:
            last = ys[i][1]
        ys[i][1] = ys[i][1] or last or ("CE" if mode == "era" else None)
        if ys[i][1] is None:
            return None

    def conv(v, u):
        if u in ("Mya", "Ma", "million years ago"):
            return NOW - v * 1e6
        if u in ("kya", "ka", "thousand years ago"):
            return NOW - v * 1e3
        if u in ("years ago", "yrs ago", "ya"):
            return NOW - v
        if u in ("BCE", "BC"):
            return -v
        return v

    out = [conv(v, u) for v, u in ys]
    if len(out) > 1 and out[0] >= 1000 and 0 <= out[-1] < 100:
        out[-1] = (int(out[0]) // 100) * 100 + out[-1]
        if out[-1] < out[0]:
            out[-1] += 100
    return round(out[0]), (round(out[-1]) if len(out) > 1 and round(out[-1]) != round(out[0]) else None)


def compact(n):
    """Intl.NumberFormat('en', {notation:'compact', maximumFractionDigits:1})."""
    for div, suf in ((1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")):
        if abs(n) >= div:
            v = n / div
            s = f"{v:.1f}".rstrip("0").rstrip(".") if abs(v) < 100 else f"{v:.0f}"
            # Intl rounds 999.95K up to "1M"
            if float(s) >= 1000 and suf != "T":
                continue
            return s + suf
    return f"{n:.1f}".rstrip("0").rstrip(".")


class Balance(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
            "path", "circle", "rect", "line", "ellipse", "polygon", "polyline", "use", "stop"}
    WATCH = {"section", "div", "article", "figure", "details", "table", "svg", "g", "main", "nav", "ul", "ol",
             "blockquote", "header", "footer", "aside", "dialog"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errors, self.in_pre = [], [], False

    def handle_starttag(self, tag, attrs):
        if tag == "pre":
            self.in_pre = True
        if tag in self.WATCH:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag == "pre":
            self.in_pre = False
        if tag not in self.WATCH:
            return
        if not self.stack:
            self.errors.append(f"line {self.getpos()[0]}: stray </{tag}>")
            return
        t, ln = self.stack.pop()
        if t != tag:
            self.errors.append(f"line {self.getpos()[0]}: </{tag}> closes <{t}> opened at line {ln}")


def scenes(s):
    out = {}
    for m in re.finditer(r'<section class="section scene" id="([^"]+)"(.*?)(?=<section class="section|<nav class="wrap chapternav"|</main>)', s, re.S):
        body = m.group(2)
        steps = len(re.findall(r'<div class="step"', body))
        idx = [int(v) for v in re.findall(r'data-step-(?:show|draw|lit)="(\d+)"', body)]
        out[m.group(1)] = (steps, max(idx) if idx else -1)
    return out


def lint(path, baseline):
    s = open(path, encoding="utf-8").read()
    rel = os.path.relpath(path, ROOT)
    E, W = [], []
    is_ch = "/tour/" in path

    for m in re.finditer(r'<pre class="mermaid">(.*?)</pre>', s, re.S):
        body = m.group(1)
        if re.search(r"<\s*/?\s*[a-zA-Z]", body):
            ln = s[: m.start()].count("\n") + 1
            E.append(f"line {ln}: literal tag inside <pre class=\"mermaid\"> — use &lt;br/&gt; entities")

    for m in re.finditer(r"<[^>]*data-step-draw=[^>]*>", s):
        if 'pathLength="1"' not in m.group(0):
            E.append(f"line {s[:m.start()].count(chr(10)) + 1}: data-step-draw without pathLength=\"1\"")

    for sid, (steps, mx) in scenes(s).items():
        if mx >= steps:
            E.append(f"scene #{sid}: stage uses step index {mx} but has only {steps} steps")
    if baseline:
        bp = os.path.join(baseline, os.path.relpath(path, os.path.join(ROOT, "docs")))
        if os.path.exists(bp):
            old = scenes(open(bp, encoding="utf-8").read())
            new = scenes(s)
            for sid, (steps, _) in old.items():
                if sid in new and new[sid][0] != steps:
                    E.append(f"scene #{sid}: step count changed {steps} → {new[sid][0]} (gotcha 8: indexes desync)")
                if sid not in new:
                    E.append(f"scene #{sid} disappeared")

    if is_ch:
        mode = "ago" if re.search(r'data-chapter="[12]"', s) else "era"
        cards = re.findall(r'(<article class="dev[^"]*"[^>]*>)<p class="dev__date">(.*?)</p><h3 class="dev__name">(.*?)</h3>', s)
        all_devs = len(re.findall(r'<article class="dev[ "]', s))
        if all_devs != len(cards):
            E.append(f"{all_devs - len(cards)} .dev card(s) not in the canonical one-line form (date, then name)")
        for tag, date, name in cards:
            my = re.search(r'data-y="(-?\d+)"', tag)
            my2 = re.search(r'data-y2="(-?\d+)"', tag)
            nm = html.unescape(re.sub(r"<[^>]+>", "", name))[:50]
            if not my:
                E.append(f"card '{nm}': missing data-y")
                continue
            p = parse_date(date, mode)
            if p is None:
                W.append(f"card '{nm}': could not parse date {date!r} to cross-check data-y")
                continue
            y, y2 = int(my.group(1)), (int(my2.group(1)) if my2 else None)
            tol = max(3, abs(p[0]) * 0.02) if mode == "ago" else 1
            if abs(p[0] - y) > tol:
                E.append(f"card '{nm}': data-y={y} but its date {html.unescape(date)!r} parses to {p[0]}")
            if p[1] is not None and y2 is not None and abs(p[1] - y2) > tol:
                E.append(f"card '{nm}': data-y2={y2} but its date parses to end {p[1]}")
        h = re.search(r'<section class="section" id="milestones">.*?<h2[^>]*>([A-Za-z-]+) turning points</h2>', s, re.S)
        if h:
            n = word_to_int(h.group(1))
            if n != len(cards):
                E.append(f"milestones heading says '{h.group(1)}' but there are {len(cards)} cards")
        else:
            E.append("no <section id=\"milestones\"> with a spelled-out 'N turning points' heading")
        d = re.search(r'<h2[^>]*>([A-Za-z-]+) ways to [^<]+</h2>(.*?)(?=<!-- -+ Artifact|<section class="section"[^>]*id="objects"|<p class="eyebrow reveal">In the hand)', s, re.S)
        if d:
            n = word_to_int(d.group(1))
            figs = len(re.findall(r'<figure class="diagram', d.group(2)))
            if n != figs:
                E.append(f"diagrams heading says '{d.group(1)}' but that section has {figs} diagrams")
        wm = re.search(r'<section class="section" id="world".*?(?=<section class="section")', s, re.S)
        if wm:
            names = [html.unescape(x).strip() for x in re.findall(r'<h3 class="regioncard__name">(.*?)</h3>', wm.group(0))]
            if names != REGIONS:
                E.append(f"#world panel regions out of order or incomplete: {names}")

    for m in re.finditer(r'<p class="counter"([^>]*)>(.*?)</p>', s):
        attrs, text = m.group(1), m.group(2)
        v = re.search(r'data-counter="([\d.]+)"', attrs)
        if not v:
            continue
        val = float(v.group(1))
        pre = (re.search(r'data-prefix="([^"]*)"', attrs) or [None, ""])[1]
        suf = (re.search(r'data-suffix="([^"]*)"', attrs) or [None, ""])[1]
        body = compact(val) if 'data-compact="true"' in attrs else f"{round(val):,}"
        want = html.unescape(pre) + body + html.unescape(suf)
        if html.unescape(text) != want:
            E.append(f"counter {v.group(1)}: authored text {text!r} should be {want!r} (what JS produces; no-JS readers see the markup)")

    ids = re.findall(r'\sid="([^"]+)"', s)
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        E.append(f"duplicate ids: {dup[:10]}")

    for m in re.finditer(r'<(div|p|article|section|span|li)\b[^>]*class="[^"]*\bregion\b[^"]*"', s):
        E.append(f"line {s[:m.start()].count(chr(10)) + 1}: class 'region' on <{m.group(1)}> — it is the SVG lit primitive (fill-opacity:0)")

    for m in re.finditer(r'<figure class="diagram[^"]*">(.*?)</figure>', s, re.S):
        if "<pre class=\"mermaid" in m.group(1) and "<table class=\"data" not in m.group(1):
            W.append(f"line {s[:m.start()].count(chr(10)) + 1}: Mermaid figure without a data table")

    b = Balance()
    try:
        b.feed(s)
        b.close()
    except Exception as ex:  # pragma: no cover
        E.append(f"parser error: {ex}")
    E.extend(b.errors[:10])
    if b.stack:
        E.append(f"unclosed: {[f'<{t}> line {ln}' for t, ln in b.stack[-5:]]}")

    return rel, E, W


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--baseline", help="an older copy of docs/ to compare scene step counts against")
    a = ap.parse_args()
    files = a.files or sorted(glob.glob(os.path.join(ROOT, "docs", "**", "*.html"), recursive=True))
    bad = 0
    for f in files:
        rel, E, W = lint(os.path.abspath(f), a.baseline)
        for e in E:
            print(f"ERROR {rel}: {e}")
        for w in W:
            print(f"warn  {rel}: {w}")
        bad += len(E)
    print(f"\n{len(files)} files, {bad} errors")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
