# Human History Tour

An expansive, animated exploration of the historically significant developments of
proto-humans to the present day — built as a zero-dependency static website, ready to
publish on **GitHub Pages** from the [`/docs`](docs) directory.

Seven million years, from the first upright step in the African Rift to machines that
hold a conversation, told as a single scroll: nine scroll-driven chapters with real-map
scenes, animated timelines, ~100 Mermaid diagrams, and a data layer — plus a persistent
timeline rail that shows two scales at once (*where you are on the page* vs. *where you are
in actual time*).

Every chapter also carries a **sixteen-region "Meanwhile, everywhere" panel** (so no part of
the world drops out of the story after prehistory), **ordinary lives** told from real
evidence, **primary-source voices** (Chapter IV onward), a **true-scale strip** of its
milestones, and "why it happened" and "how we know" sections that carry causation and
method, not just narration.

## The tour

| # | Chapter | Span |
|---|---------|------|
| I | [Deep Prehistory & Human Origins](docs/tour/01-deep-prehistory.html) | ~7 Mya – 300 kya |
| II | [Paleolithic & the Cognitive Revolution](docs/tour/02-paleolithic.html) | 300 kya – 12,000 BCE |
| III | [The Neolithic Revolution](docs/tour/03-neolithic.html) | 12,000 – 3500 BCE |
| IV | [First Civilizations & the Bronze Age](docs/tour/04-first-civilizations.html) | 3500 – 1200 BCE |
| V | [Classical Antiquity & the Iron Age](docs/tour/05-classical-antiquity.html) | 1200 BCE – 500 CE |
| VI | [The Post-Classical / Medieval World](docs/tour/06-medieval.html) | 500 – 1450 CE |
| VII | [The Early Modern Age](docs/tour/07-early-modern.html) | 1450 – 1750 CE |
| VIII | [The Industrial & Modern Age](docs/tour/08-industrial.html) | 1750 – 1945 CE |
| IX | [The Contemporary & Information Age](docs/tour/09-information-age.html) | 1945 – present |

**Reference layer:** [Master Timeline](docs/reference/master-timeline.html) ·
[Human Tech Tree](docs/reference/tech-tree.html) ·
[The Great Acceleration](docs/reference/great-acceleration.html) ·
[Parallel Civilizations](docs/reference/civilizations.html) ·
[The Human Family](docs/reference/human-family.html) ·
[How We Know](docs/reference/how-we-know.html) ·
[Further Reading](docs/reference/further-reading.html) ·
[Sources & Method](docs/reference/sources.html)

## Run it locally

The site uses ES modules and `fetch`, so it must be served over HTTP (opening the files
directly over `file://` will not work):

```bash
python3 -m http.server 8000 --directory docs
# then open http://localhost:8000
```

That's the whole toolchain — there is no build step, bundler, or dependency install.

## Publish to GitHub Pages

1. `git init && git add . && git commit -m "Human History Tour"`
2. Create a GitHub repo named **`humanhistorytour`** and push to it.
3. In **Settings → Pages**, set **Source = Deploy from a branch**, **Branch = `main`**, **Folder = `/docs`**.
4. The site goes live at `https://<your-username>.github.io/humanhistorytour/`.

> The canonical/OpenGraph/sitemap URLs and the `404.html` links are hard-coded to
> `https://sonoransun.github.io/humanhistorytour/`. If you publish under a different account
> or a custom domain, find-and-replace that host. The `.nojekyll` file tells Pages to serve
> everything verbatim.

## How it's built

- **Zero build.** Hand-authored semantic HTML, modern CSS (custom properties, `color-mix`,
  `position: sticky`, container-safe layout), and vanilla ES modules. Output *is* source.
- **One scroll engine.** [`scrolly.js`](docs/assets/js/scrolly.js) runs three
  `IntersectionObserver`s and a single shared `requestAnimationFrame` loop; all motion is
  CSS on `transform`/`opacity`. [`rail.js`](docs/assets/js/rail.js) reads the same scroll
  store to keep the timeline rail honest.
- **Diagrams** render at runtime via [Mermaid](https://mermaid.js.org/) v11 from a pinned
  CDN, themed to each era's palette, with a real HTML data table beside every quantitative
  figure (screen readers cannot read the SVG).
- **Maps** are real coastlines from [Natural Earth](https://www.naturalearthdata.com/) (public
  domain), built once into a shared SVG by `scripts/build-basemap.py` and laid out per scene
  by `scripts/mapkit.py`; ice-age scenes draw the approximate glacial coastline.
- **Nine era palettes**, arcing from dark-and-mineral deep time to bright-and-electric modernity.
  Each palette authors four hex values (`--bg/--ink/--accent/--accent-2`); the remaining tokens are
  derived with `color-mix()` in the **oklab** interpolation space, so blends never pass through muddy
  grey. Three-voice typography (Fraunces / Source Serif 4 / IBM Plex Mono).
- **Accessible & robust by default.** Content is visible and navigable with **JavaScript
  disabled** (JS only *adds* motion), a visible reduce-motion toggle plus
  `prefers-reduced-motion`, and keyboard/ARIA support. Light/dark theming applies to the
  **reference pages**; the landing page and the nine chapters are intentionally fixed to their era
  palette (the toggle is hidden there rather than shown doing nothing).

For the deep detail — the dual-scale rail, the Mermaid constraints, the edge-case register, and the
known gaps — see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

### Browser support

The CSS uses `color-mix()` (30 occurrences) and `svh` units with **no `@supports` fallbacks**, which
sets a hard floor of **Chrome/Edge 111+, Safari 16.2+, Firefox 113+**. Below that, derived tokens
collapse and the UI degrades badly — this is a deliberate modern-only trade, not an oversight.

### Network, offline & privacy

Two runtime dependencies load from CDNs: **Mermaid** (pinned to `11.16.0`, jsDelivr) and **Google
Fonts**. Everything else is self-contained. If those hosts are unreachable — offline, a blocked
corporate network, or a region that filters them — the site still reads correctly: diagrams show a
written fallback message and fonts fall back to system serif/mono. Note that Google Fonts is a
third-party request, which may matter for GDPR-sensitive deployments; self-hosting the three families
would remove it.

### Repository layout

```
docs/                     ← the published site (GitHub Pages root)
  index.html              landing: Deep Time hero → chapter grid → "One Second to Midnight"
  tour/01…09-*.html       the nine animated chapters
  reference/*.html        the eight documentation pages
  data/chapters.json      single source of truth for the rail & navigation
  assets/css|js|img       tokens, base, tour, reference, print · scroll engine, rail, chrono ·
                          world.svg basemap · social cards
  .nojekyll, 404.html, sitemap.xml, robots.txt, favicon.svg
scripts/                  ← optional tooling (site needs none of it)
  check-links.py          link + #fragment checker, pure stdlib
  lint-pages.py           static checks for the silent-failure traps, pure stdlib
  mapkit.py               lays out an atlas scene on the shared basemap, pure stdlib
  build-basemap.py        regenerates docs/assets/img/world.svg from Natural Earth
  verify/*.mjs            headless-browser render & accessibility checks
templates/
  TEMPLATE-chapter.html   canonical chapter skeleton + the authoring rules
  COMPONENTS.md           the chapter section contract with paste-ready markup
```

## A note on accuracy

This is an **educational synthesis**, assembled with AI assistance from standard reference
knowledge — not original scholarship or a peer-reviewed source. Dates are approximate
(deep-time figures especially so), and many "firsts" are really "earliest currently known."
See [Sources & Method](docs/reference/sources.html) for the dating conventions, the genuinely
contested questions, where the numbers come from, how the September 2026 review checked every
correction with two independent fact-checkers, and the errata it produced.
