# Architecture & Field Notes

Long-form companion to [`CLAUDE.md`](CLAUDE.md) (which stays short and operational) and
[`README.md`](README.md) (which is for visitors). This file is for whoever changes the site next: the
reasoning behind its shape, the constraints that are load-bearing, and the edge cases that will bite
silently if you don't know they exist.

Every claim here was verified against the code, with counts, at the time of writing. Where a number
appears, the command that produces it is given so you can tell when this document has gone stale.

---

## 1. Why this shape

**Output *is* source.** There is no build step, bundler, CI, dependency install, or generated artifact.
`docs/` is byte-for-byte what GitHub Pages serves. Editing "the build output" is the normal workflow —
that inversion is deliberate:

- Pages serves a `/docs` folder natively, so a build step would have added a GitHub Action and a
  deploy pipeline to a site that is fundamentally 19 HTML files.
- Scrollytelling pages are bespoke by nature — nine chapters share a structure but almost no reusable
  components — so a component framework would have bought very little.
- The site should still work in five years. Nothing to `npm install` means nothing to rot.

The two costs are accepted knowingly: **markup is duplicated** across pages (header, footer, and nav are
hand-copied into all 19), and **there is no type checking** (a stdlib content linter, `scripts/lint-pages.py`, was added in September 2026). The duplication is what makes the
no-JS guarantee possible (§6), which was judged the better trade.

## 2. The real design problem: deep time

The hard problem is not animation — it is that **human history does not fit on a linear scale.**

Scaled honestly on a 10,000-pixel scroll covering 7 million years, *all of recorded history* occupies
about **7 pixels**. Chapter IX (1945–present) is 81 years out of ~7,000,000 — roughly **0.001%** of the
span. Give every era its true proportion and eight of the nine chapters vanish; give every era equal
space and you have quietly lied about time.

The site refuses to resolve that tension and instead **shows both scales at once**. This is the whole
point of the timeline rail, and it is why the rail is not decoration:

| Rail element | Scale | What it tells you |
|---|---|---|
| `.rail__track` + `.rail__fill` | **Page share** — every chapter equal | "You are 40% through the tour" |
| `.rail__true` segments | **True duration** — `durationYears` | "…and still inside the first 4% of actual time" |

Chapter I's true-time segment is ~96% of the bar. Seeing the two bars disagree *is* the lesson. The
landing page's epilogue makes the same point full-width, and `reference/master-timeline.html` restates it
as a 24-hour clock (1 second ≈ 81 years; all recorded history is the final ~62 seconds). Inside each
chapter, the **chrono strip** at the head of `#milestones` (§4a) does the same job at chapter scale:
every milestone card plotted at its true date, logarithmic in Chapters I–II and linear after.

Consequences that follow from this and should not be "fixed":
- Chapters are roughly **equal in reading length** despite spanning wildly different durations.
- The rail's year readout is **interpolated**, not measured — it maps scroll progress across the
  chapter's `y0`→`y1`, so it is a narrative device, not a data display.

## 3. Two page types, deliberately asymmetric

This is the most common source of "is this a bug?" confusion.

**Tour chapters** (`docs/tour/*.html`) — `<body class="tour" data-era="N">`. `data-era` re-skins
`--bg/--ink/--accent/--accent-2`, and because it sits on `<body>` it **overrides** `:root[data-theme]`.
Chapters are therefore *always* in their era palette. They are an immersive, art-directed experience;
light mode would fight the concept.

**Reference pages** (`docs/reference/*.html`) — `<body>` with **no `data-era`**, so the neutral
`data-theme` light/dark palette applies and the theme toggle genuinely works. These are for reading.

Because the toggle can only ever affect reference pages, it is **hidden** where it would be inert, via a
single rule in `base.css`:

```css
[data-era] [data-theme-toggle] { display: none; }
```

That covers the landing page (`data-era="1"`) and all nine chapters. **Adding `data-era` to a reference
page silently removes its theme toggle.**

The two toggles end up neatly complementary — **every page surfaces exactly the control that does
something**, and nothing else:

| | theme toggle | motion toggle |
|---|---|---|
| Landing + 9 chapters | hidden (inert — `data-era` wins) | **shown** — they animate |
| 8 reference pages | **shown** — they're themeable | absent — they contain 0 `.reveal` elements and nothing animates |

So if you add scroll animation to a reference page, add a motion toggle to its header at the same time;
and if you ever want a chapter to be themeable, the `data-era` decision has to change first.

## 4. The scroll engine

`scrolly.js` owns **one** `requestAnimationFrame` loop and **three** `IntersectionObserver`s (reveal;
center-band scene-step at `rootMargin: -45% 0px -45% 0px`; and a `200%` prep observer). It exports
`subscribe(fn)`; `rail.js` consumes that rather than reading scroll itself, so the rail and the content
are mathematically incapable of disagreeing.

There are **zero scroll event listeners** on purpose. New scroll-driven behaviour should `subscribe()`.

Scenes are driven **declaratively** — JS only toggles classes and writes `opacity`; CSS does the
animating. The step attributes take a 0-based step index:

| Attribute | Effect |
|---|---|
| `data-step-show="N"` | fade a graphic layer in from step N |
| `data-step-draw="N"` | draw an SVG path (**requires `pathLength="1"`** — all 116 uses comply; `lint-pages.py` enforces it) |
| `data-step-lit="N"` | illuminate a region via `fill-opacity` |
| `data-caption` on `.step` | text for the sticky stage caption |

`docs/data/chapters.json` is the single source of truth for the rail, the mobile chapter sheet, and
cross-page links — including `y0`/`y1` (signed calendar years, negative = BCE) and `durationYears`.
Reordering or adding a chapter without updating it silently corrupts the rail. (The rail's true-time
"now" marker is placed on the true-time scale — earlier chapters' `durationYears` plus scroll progress
through this one — so in Chapters III–IX it sits pinned near the bottom. That is the point.)

## 4a. The September 2026 expansion components

Every chapter now carries the same set of sections, in a fixed order, specified with paste-ready markup
in [`templates/COMPONENTS.md`](templates/COMPONENTS.md): a jump nav, a **stats strip** (animated
counters), the existing scenes plus an **atlas scene** on real coastlines, `#milestones` with its
**chrono strip**, `#why`, a sixteen-region **"Meanwhile, everywhere"** panel (`#world`), **ordinary
lives** (`#lives`), **primary-source voices** (`#voices`, Chapters IV–IX), `#diagrams`, `#objects`.

- **Chrono strip — `assets/js/chrono.js`.** Built at runtime *from the milestone cards themselves*: each
  `.dev` carries `data-y` (signed year of its start; for kya/Mya dates `2000 − years ago`, the same
  reference year as `rail.js`) and `data-y2` for spans. It cannot disagree with the cards, but it *will*
  misplace a card whose `data-y` was not updated when its visible date changed — `scripts/lint-pages.py`
  re-parses every visible date and fails on a mismatch. Its axis is a `[data-thread-path]`, so this is
  where the long-dormant "thread of time" hook finally lives. `main.js` must call `initChrono()` *before*
  `initScrolly()`. Enhancement only: with JS off the placeholder stays empty.
- **Atlas scenes — `assets/img/world.svg` + `scripts/mapkit.py`.** One shared, cached SVG (Natural Earth
  1:50m land, lakes, rivers with named groups such as `#r-nile`, and 1:10m 200 m bathymetry for the
  ice-age view; ~300 KB, ~90 KB gzipped) referenced with `<use href="../assets/img/world.svg#land">`.
  `mapkit.py` computes the `<use>` transform and every pin/route pixel for a lon/lat window on the
  standard 500 × 400 stage; never hand-place a map coordinate. A scene "cuts" to a new window by
  revealing a later layer with its own opaque sea rect — `data-step-show` only ever reveals, so a later
  layer must fully cover the one beneath. `build-basemap.py` regenerates the file (needs network once).
- **Stats strip.** Uses the old counter engine, now in all nine chapters. Counters are authored with
  their **final formatted value** in the markup (no-JS readers see it); `scrolly.js` zeroes them only if
  it is about to animate. The linter checks the authored text equals what `Intl.NumberFormat` produces.
- **Region panels.** Sixteen fixed regions in a fixed order with fixed mini-map spots, identical in every
  chapter, so the polycentric rule (§11) is now visible and checkable as a 16 × 9 grid. Cards use class
  `regioncard` — **never `region`**, which is the scene *lit* primitive (`fill-opacity: 0` until lit).

## 5. Mermaid — the highest-risk subsystem

**105 diagrams** (63 across the nine chapters — seven per chapter — and 42 across reference) plus bespoke inline SVG charts on `great-acceleration`.
Mermaid v11 is pinned to `11.16.0` and loaded from jsDelivr on demand.

Four constraints, each of which caused *silent* breakage during the build:

1. **Line breaks must be HTML entities.** Write `&lt;br/&gt;`, `&lt;i&gt;`, `&amp;`. A literal `<br/>`
   inside `<pre class="mermaid">` is parsed by the browser as a real element, so `pre.textContent` —
   which is what feeds Mermaid — drops it and mashes words together ("Myaopportunistic"). **The diagram
   still renders**, so nothing errors; you just get corrupted labels.
2. **Never hand Mermaid an `oklab()` colour.** `getComputedStyle().getPropertyValue('--x')` does not
   resolve custom properties, and anything derived from `color-mix(in oklab, …)` computes to `oklab()`,
   which Mermaid's colour library throws on — *inside* `initialize()`, which aborts the first diagram.
   `mermaid-init.js` therefore resolves colours through a hidden probe element and mixes surfaces in
   **rgb**. Keep it that way.
3. **Renders are serialized.** `mermaid.render()` shares global state; concurrent calls clobber each
   other. `mermaid-init.js` drains a queue one at a time. Do not parallelize it.
4. **`securityLevel: "loose"`** is required for `<br>`/`<i>` in labels to survive. This is safe *only*
   because every diagram source is static and authored in-repo. It would be an XSS vector the moment
   any diagram source came from user input.

Other notes: **`xychart-beta` has no logarithmic axis**, which is exactly why the signature population
hockey stick is hand-authored SVG (`reference/great-acceleration.html`). Limits are raised deliberately
(`maxTextSize: 120000`, `maxEdges: 800`). Beta diagram types in production use and verified rendering:
`xychart-beta`, `quadrantChart`, `pie`. Diagrams render **lazily on scroll**, so any automated check must
scroll the page to the bottom and wait for the queue before asserting.

## 6. The no-JS contract

Content is authored **visible by default**. JS adds `html.js`, and CSS uses that to *opt into* hidden
pre-animation states (`html.js .reveal { opacity: 0 }`). With JS off, nothing is hidden.

This is why the header, footer, and prev/next chapter links are **hardcoded into every page** rather than
injected from a partial. An earlier design used an `include.js` + `assets/partials/` approach; it was
abandoned precisely because it made navigation dependent on JS. **Do not move navigation into a
JS-injected partial.** (`chapters.json` is enhancement-only: if its fetch fails, the rail simply never
appears and the hardcoded nav carries the page.)

Verified behaviour with JavaScript disabled: all prose and milestone cards present, prev/next and header
links working, and `opacity: 1` on both `.reveal` and `.step`.

## 7. Browser support floor — the largest compatibility risk

The CSS uses **`color-mix()` 30 times** and **`svh` 8 times**, with **zero `@supports` guards anywhere**
(`grep -rc '@supports' docs/assets/css/` → 0 in all five files).

Effective floor: **Chrome/Edge 111+, Safari 16.2+, Firefox 113+.**

The failure mode is not graceful. `--surface`, `--ink-muted`, `--ink-faint`, `--line`, `--accent-soft`
and `--sel` are *all* derived via `color-mix`. On an unsupporting engine they resolve to nothing, and
borders, muted text, and surfaces collapse — producing an unreadable, low-contrast page rather than a
plain one. This is a knowing modern-only trade; if the floor ever needs lowering, the fix is a block of
literal fallback values declared *before* each `color-mix` line, not a polyfill.

Also in use without fallbacks: `<dialog>` + `showModal()` (mobile chapter sheet), `backdrop-filter`
(header/sheet — degrades acceptably), `aspect-ratio`, `text-wrap: balance`, and `clamp()` (17×).

> **Note:** the palettes are **hex**, not `oklch()` — `tokens.css` contains **0** `oklch()` occurrences.
> Only the *interpolation space* of `color-mix` is oklab (9 occurrences). An earlier README claimed
> OKLCH palettes; that was wrong and has been corrected.

## 8. Environmental contexts

- **`file://` does not work.** ES modules and the `chapters.json` fetch both fail. A local HTTP server
  is mandatory, not a nicety: `python3 -m http.server 8000 --directory docs`.
- **Two CDN dependencies:** Mermaid (`11.16.0`, jsDelivr) and Google Fonts. Offline, behind a blocking
  corporate proxy, or in a region that filters them: diagrams show a written fallback and fonts fall back
  to system serif/mono — the site still reads. Google Fonts is a **third-party request**, which may
  matter under GDPR; self-hosting the three families would remove it.
- **GitHub Pages project subpath.** The site lives at `/humanhistorytour/`, so every in-page link is
  **relative** (`../assets/…`). Root-absolute paths (`/assets/…`) would 404 in production while appearing
  to work on a local server rooted at `docs/`.
- **`404.html` is served at arbitrary URL depths**, so relative asset paths would break unpredictably.
  It therefore **inlines its CSS** and uses absolute links, and must stay self-contained.
- **Hard-coded host** `https://sonoransun.github.io/humanhistorytour/` appears in every `<link rel=canonical>`,
  the `og:*` tags, `sitemap.xml`, `robots.txt`, and all `404.html` links. Publishing elsewhere is a
  find-and-replace.
- **Not a git repository yet.** `git init`, first push, and enabling Pages remain manual.
- **`forced-colors` / Windows High Contrast is untested.**
- **The basemap must be same-origin.** Atlas scenes and region mini-maps use `<use href="…/world.svg#…">`,
  which browsers only resolve for same-origin files. Serving `docs/` from one host (Pages, a local
  server) works; moving `assets/img/` to a CDN on another origin would silently blank every map.

## 9. Edge-case register

| Behaviour | Detail |
|---|---|
| **Year notation flips *mid-chapter*** | `formatYear()`'s guard is `mode === "ago" \|\| yearsAgo >= 12000` — the numeric test **overrides** `mode`. Chapter III (`y0 = -12000` → `y1 = -3500`) reads "14 kya" and switches to BCE at **~23.5% scroll**, not at the II→III boundary the prose promises. |
| **No year zero** | Calendar year 0 is rendered as **1 BCE** (guarded in `formatYear`). |
| **Unreachable branch** | `formatYear`'s `"yrs ago"` return cannot fire with current data — Chapters I and II both end at ≥14,000 years ago. It exists for future chapters. |
| **Lazy diagrams change page height** | `metrics.docH` comes from `scrollHeight`; diagrams rendering mid-scroll grow the document and re-derive `progress`, so the rail fill can visibly jump on diagram-heavy pages. The body `ResizeObserver` re-measures — it keeps rail and content consistent but does not remove the jump. |
| **`chapters.json` is `cache: "force-cache"`** | Manifest edits can appear stale in a warm browser. Hard-refresh while authoring. |
| **Rail fails invisibly** | If the manifest fetch fails, `initRail()` returns *before* adding `.is-in`, so the rail stays `translateX(-100%)`. Correct degradation, but there is no error surface. |
| **`reduce()` is sampled once** | Changing the OS reduced-motion setting mid-session does not re-initialize observers; the in-page toggle is the reliable control. |
| **Atlas cuts only reveal** | `data-step-show` sets opacity from step N onward and never hides. An atlas scene that changes window mid-scene does it by revealing a later layer whose own opaque sea rect covers everything beneath. With JS off or reduced motion every layer shows, so the *last* layer is what those readers see — design it to stand alone. |
| **Chrono placement depends on `data-y`** | Edit a card's visible date without its `data-y` and the strip silently plots it in the wrong place. `lint-pages.py` catches it. |
| **Reveal-count flakiness in checks** | A stepped-scroll snapshot can report e.g. 30/31 reveals if the final element has not crossed the threshold yet. It is a timing artifact of the harness, not a page fault. |

## 10. Known gaps & deliberate omissions

Planned during design, **never implemented**. Recorded so nobody re-plans finished work or "fixes"
something that was consciously dropped:

- **Tier-2 scroll-driven animation** (`@supports (animation-timeline: view())`) — 0 occurrences. The
  `IntersectionObserver` tier is the only tier.
- **`content-visibility: auto`** performance pass — 0 occurrences. Never needed; the pages are fast
  enough without it. Note it interacts badly with `position: sticky`, so adding it around scenes would
  break pinning.
- **The "Thread of Time" motif** — realized in September 2026 as the chrono strip (§4a), which uses the
  `data-thread-path` hook. The vertical `.thread` spine CSS is still unused.
- **Counters** now run in all nine chapters' stats strips (§4a), not just `08-industrial.html`.
- **Image assets.** There are still no photographs. Scene art is SVG: generative, plus one shared
  cartographic file, `img/world.svg` (§4a). `img/og/` holds 18 social cards; the two added in September
  2026 (`human-family`, `how-we-know`) were rendered with Playwright from an HTML card matching the
  originals' style.
- **`include.js` + `assets/partials/`** — abandoned in favour of hardcoded nav (§6); directories removed.

## 11. Editorial conventions

These are content rules, not code style, and they are stated theses of the site:

- **Polycentric coverage is mandatory.** No region may vanish after prehistory. Africa (Kush, Aksum, Nok,
  Mali/Timbuktu, Songhai, Swahili coast, Great Zimbabwe, Kongo, Benin), the Americas (Norte Chico, Olmec,
  Maya, Teotihuacan, Moche, Wari, Tiwanaku, Cahokia, Aztec, Inca), Oceania (Lapita → Rapa Nui, Hawai'i,
  Aotearoa), and the Steppe (Scythians, Xiongnu, Mongols) all carry explicit coverage.

  Four regions were **added later**, after an audit found the rule was being broken: a 14-region ×
  9-chapter grid scored 65 *full* / 27 *thin* / **34 absent** — 27% of the grid empty. The worst rows are
  now first-class and must stay that way:
  - **Australia** — 65,000 years of continuous occupation, Madjedbebe, Lake Mungo, fire-stick farming,
    **Budj Bim** aquaculture (c. 6,600 years ago, i.e. c. 4600 BCE — older than the pyramids; it was
    long misprinted on this site as "~6600 BCE"), songlines, Tasmania's isolation, the Macassan trepang
    trade. It previously appeared in exactly one chapter, as an arrival date.
  - **The Arctic / circumpolar north** — Yana RHS, the Arctic Small Tool tradition, Saqqaq, Dorset/Tuniit,
    Ipiutak, the **Thule expansion**, Norse Greenland, the Sámi. It previously returned **zero** hits
    site-wide for `Arctic`, `Inuit`, `Thule`, `Dorset`, `Saqqaq` and `Greenland`.
  - **North America north of Mexico** — the Eastern Agricultural Complex as an independent domestication
    centre, Watson Brake, Poverty Point, the Old Copper Complex, Adena/Hopewell, Cahokia, Chaco, the
    Haudenosaunee. It was one trailing bullet inside the Andes track.
  - **The Caribbean** — Saladoid and Taíno, the sugar complex, Palmares, the Maroon wars, and the Haitian
    Revolution. There was no row for it at all, which hid the strongest non-European material in VII–VIII.

  When adding content, check the region grid before the era. The failure mode is not a wrong claim; it is
  a silent blank that the surrounding confident prose disguises.

- **Non-sapiens hominins have their own page.** `reference/human-family.html` carries the family bush,
  Paranthropus, *naledi*, *floresiensis*, *luzonensis*, the Neanderthal and Denisovan record, and what
  each taught us. `tech-tree.html#hominins` keeps its id (two chapters link to it) but is now a summary
  that points there. Before this existed, the site named nine taxa total and returned **zero** hits for
  `Paranthropus`, `naledi`, `sediba`, `Orrorin`, `Kenyanthropus`, `rudolfensis`, `africanus` and
  `anamensis`.

- **Method is content.** `reference/how-we-know.html` explains dating, biomolecular and landscape
  evidence, historiography, live debates and common misconceptions. Chapters carry a "How we know"
  callout naming the actual method behind their claims, and a "Why it happened" section carrying
  causation — climate, disease, demography, coerced labour and gender — rather than narration.
- **Independent invention is emphasized** — farming arose at least seven times, writing at least three.
  The tech tree explicitly warns that it "is not one line" and that "branches die."
- **Date notation:** Chapters I–II use "years ago" (Mya/kya); III onward uses BCE/CE (with the caveat in
  §9 that the switch actually happens inside Chapter III).
- **Epistemic framing:** dates are approximate, "firsts" are "earliest currently known," and the site
  describes itself as an educational synthesis assembled with AI assistance — not scholarship. See
  `reference/sources.html`.
- **Accessibility is content policy:** every quantitative diagram ships a real `<table class="data">`
  (148 across the site), because Mermaid SVGs are `aria-hidden` and unreadable to screen readers.
- **The region grid is now explicit.** Each chapter's `#world` panel has all sixteen regions (the list
  and order are fixed in `templates/COMPONENTS.md` §5). A card may honestly say "no humans yet"
  (`regioncard--empty`), but it may not be filler. The Taíno, absent from every chapter before the
  expansion, now appear in four.

## 12. Verifying a change

See [`scripts/README.md`](scripts/README.md). Short version:

```bash
python3 scripts/check-links.py                    # no install; 1,343 links, 19 pages
python3 scripts/lint-pages.py                     # no install; the silent-failure traps (see scripts/README.md)
python3 -m http.server 8000 --directory docs
node scripts/verify/all.mjs                       # 105 diagrams render, no console errors
node scripts/verify/qa.mjs                        # no-JS · reduced-motion · mobile · theme · expansion contracts
```

**Staleness check for this document** — if any of these stops matching, the prose above is out of date:

```bash
grep -c 'oklch(' docs/assets/css/tokens.css                       # 0
grep -rho 'color-mix(' docs/assets/css/ | wc -l                   # 30
grep -rho '@supports' docs/assets/css/ | wc -l                    # 0
grep -rho '<pre class="mermaid' docs/index.html docs/tour docs/reference | wc -l   # 105
grep -rho 'pathLength="1"' docs --include='*.html' | wc -l        # 116, == data-step-draw count
grep -rho 'data-step-draw=' docs --include='*.html' | wc -l       # 116
```

**Coverage regression check** — the polycentric rule (§11) is the one that decays silently, because a
missing region reads exactly like a region that had nothing going on. These four were absent or
near-absent before and must never return to zero:

```bash
# Arctic / circumpolar — every chapter. Was 0 site-wide.
grep -ril 'Arctic\|Thule\|Dorset\|Inuit' docs/tour | wc -l                            # 9

# Australia / Sahul — every chapter. Was Chapter II only, as an arrival date.
grep -ril 'Budj Bim\|Aboriginal\|Gunditjmara\|Madjedbebe\|Sahul\|Tasmania' docs/tour | wc -l   # 9

# North America north of Mexico, pre-contact — Chapters III–VII. Chapters I–II
# correctly have none (nobody is there yet); VIII–IX use modern political terms.
grep -ril 'Cahokia\|Hopewell\|Adena\|Chaco\|Poverty Point\|Watson Brake\|Haudenosaunee\|Mississippian' \
  docs/tour | wc -l                                                                    # 5

# Non-sapiens hominins — 2 chapters + 5 reference pages. Was 1 section, 9 taxa.
grep -rl 'Paranthropus\|naledi\|floresiensis' docs/tour docs/reference | wc -l         # 7
```

The structural checks — including the count-desync traps in §9 ("Thirty-four turning points", "Six
ways to…"), `data-y` against visible dates, counter text, Mermaid entities, scene step counts, the
region order — are automated in `scripts/lint-pages.py`. Run it with `--baseline <older docs/>` to also
catch a changed step count in an existing scene.
