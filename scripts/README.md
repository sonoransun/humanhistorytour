# scripts/ — optional verification tooling

**The website itself has zero dependencies.** Nothing here is required to build, run, or publish it —
`docs/` is served exactly as it sits. These are tools for *checking* the site after a change, and they
are opt-in. There is deliberately **no `package.json` at the repo root** so the zero-dependency stance
stays visible.

## check-links.py — no install required

Pure Python standard library. Walks every `.html` under `docs/`, resolves each internal `href`, and
verifies both the target file **and** any `#fragment` exist.

```bash
python3 scripts/check-links.py          # exits 1 if anything is broken
```

Run this after touching navigation, "Go deeper" cards, or reference-page section ids. It is the check
that caught 13 broken anchors when chapter cards pointed at reference sections that were never created.

## lint-pages.py — no install required

Static checks for the traps that fail **silently** (nothing errors; the page just quietly lies):
a literal tag inside `<pre class="mermaid">`; a `data-step-draw` path without `pathLength="1"`; a scene
whose stage references a step it does not have (and, with `--baseline`, an existing scene whose step
count changed); a milestone card without `data-y`, or whose `data-y` disagrees with its visible date;
"Thirty-four turning points" or "Six ways to…" not matching what the page contains; a counter whose
authored text is not the value JS would produce (no-JS readers see the markup); the `#world` panel not
having the sixteen regions in canonical order; duplicate ids; unbalanced structural tags.

```bash
python3 scripts/lint-pages.py                         # every page; exits 1 on any error
python3 scripts/lint-pages.py docs/tour/06-medieval.html --baseline /path/to/older/docs
```

## mapkit.py and build-basemap.py — authoring the atlas scenes

Every chapter's `#scene-atlas` draws real coastlines from one shared file,
`docs/assets/img/world.svg`, referenced with `<use href="../assets/img/world.svg#land">`.

- **`mapkit.py`** lays a lon/lat window out on the standard 500 × 400 stage and prints paste-ready SVG:
  the sea, land, lakes and rivers, pixel positions for every pin, and smooth drawable routes. Never
  hand-place a map coordinate. `--ice` draws the approximate ice-age coastline, `--parallel 0` suits
  near-global windows, and a window whose west edge is east of its east edge crosses the date line.
  Pins that fall off the stage are flagged. Pure stdlib.

  ```bash
  python3 scripts/mapkit.py --bounds 20,10,90,50 --pt "Uruk|31.32|45.64" \
    --route "Gulf trade|31.3,45.6;26.0,50.5;24.8,67.0" --river tigris,euphrates,indus
  ```

- **`build-basemap.py`** regenerates `world.svg` from Natural Earth (public domain): 1:50m land,
  lakes and river centrelines (with named-river groups such as `#r-nile`), and the 1:10m 200 m
  bathymetry used for the ice-age view. It needs network access once (it caches the GeoJSON in a temp
  directory); otherwise stdlib only. The ice-age coastline is drawn at the 200 m isobath, so it slightly
  over-draws land relative to the ~120–130 m Last Glacial Maximum sea-level fall and must be captioned
  as approximate.

## verify/ — needs Playwright (optional)

These drive a real headless browser, because the things worth checking (does Mermaid actually render?
does the page survive JS being off?) cannot be checked statically.

```bash
# one-time, only if you want these:
npm install playwright && npx playwright install chromium

# then, in one terminal:
python3 -m http.server 8000 --directory docs

# and in another:
node scripts/verify/all.mjs      # all 19 pages render, ~92 diagrams, no console errors
node scripts/verify/qa.mjs       # no-JS · reduced-motion · mobile · theme toggle ·
                                 # counters, region panels, chrono strips, atlas maps
```

Both accept an optional base URL (`node scripts/verify/all.mjs http://localhost:9000`) and exit
non-zero on failure.

`all.mjs` scrolls each page top-to-bottom before asserting, because diagrams render lazily on scroll
and the Mermaid queue is drained serially — a snapshot taken too early reports false failures.

## If you skip the tooling

The manual equivalent, in rough priority order:

1. Serve `docs/` over HTTP (never `file://` — ES modules and the `chapters.json` fetch both fail).
2. Open a chapter, scroll to the bottom, and confirm the console is clean and **every** diagram drew an
   SVG (a Mermaid failure shows a written fallback message in place of the figure).
3. Run `check-links.py` and `lint-pages.py`.
4. Disable JavaScript and reload a chapter: all prose, milestone cards, and prev/next links must still
   be there and usable.
5. Narrow the window to phone width: no horizontal scrolling, and the left rail should be replaced by a
   bottom progress bar plus a year chip.
