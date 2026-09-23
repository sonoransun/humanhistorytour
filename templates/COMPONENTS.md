# Chapter components — the expansion contract (Sept 2026)

Lives outside `docs/` so it is never published. It defines the sections every tour chapter carries
and gives paste-ready markup. CSS for all of it is in `docs/assets/css/tour.css` (bottom block);
`reference.css` supplies `figure.diagram`, `details.datatable` and `table.data` and is now linked by
every chapter.

The existing rules in `CLAUDE.md` all still apply — especially: Mermaid text uses `&lt;br/&gt;`
entities; never add/remove a `.step` in an existing scene (a whole new scene section is safe); every
quantitative diagram needs a `<table class="data">`; spelled-out counts in headings must match;
content is visible with JS off.

## Section order in a chapter

```
titlecard → overview (+ jumpnav) → stats strip → existing scenes (+ pullquote) → ATLAS scene
→ #milestones (chrono strip + cards) → #why (Why it happened) → #world (sixteen regions)
→ #lives (ordinary lives + life-by-numbers table) → #voices (primary sources)
→ #diagrams (Seen whole + How we know) → #objects (artifact shelf) → Go deeper → chapter nav
```

Give each of those sections the listed `id` (add `id="…"` to the existing `<section class="section">`
— that never shifts a step index). The `id`s are what the jump nav and cross-page links target;
run `python3 scripts/check-links.py` after changing any of them.

---

## 1. Jump nav (inside the overview, after its last paragraph)

```html
<nav class="jumpnav" aria-label="In this chapter">
  <a class="chip" href="#scene-atlas">The map</a>
  <a class="chip" href="#milestones">Milestones</a>
  <a class="chip" href="#why">Why it happened</a>
  <a class="chip" href="#world">Around the world</a>
  <a class="chip" href="#lives">Ordinary lives</a>
  <a class="chip" href="#voices">In their own words</a>
  <a class="chip" href="#diagrams">Seen whole</a>
  <a class="chip" href="#objects">Objects</a>
</nav>
```
Omit a chip whose section the chapter does not have (e.g. no `#voices` in Chapters I–II).

## 2. Stats strip — "the world at the start and end of this chapter"

Three or four figures. **The markup carries the final value** (no-JS readers see it); `scrolly.js`
zeroes and animates it. `data-counter` is the exact number; `data-compact="true"` gives "7M"/"1.2B";
`data-prefix`/`data-suffix` are optional. Every figure needs a source line and must be the kind of
number the literature actually gives (state ranges as prose in the note, not false precision).

```html
<section class="section" aria-label="The world at a glance" style="padding-block:var(--space-l)">
  <div class="wrap">
    <div class="stats">
      <div class="stat reveal">
        <p class="stat__label">People alive, 3500 BCE</p>
        <p class="counter" data-counter="10000000" data-compact="true">10M</p>
        <p class="stat__note">Perhaps 7–14 million; no census exists before the first states.
          <span class="stat__src">HYDE 3.3 · McEvedy &amp; Jones</span></p>
      </div>
      <!-- 2–3 more -->
    </div>
  </div>
</section>
```
Compact formatting uses `Intl.NumberFormat("en", {notation:"compact", maximumFractionDigits:1})`, so
the authored text must match what that produces: `10000000` → `10M`, `1250000000` → `1.3B`,
`40000` → `40K`. Without `data-compact` it is `40,000`.

## 3. Atlas scene — a real map, driven by scroll

A new `<section class="section scene" id="scene-atlas">` placed after the existing scenes. It is a
whole new scene, so its steps index from 0 and cannot desync anything. The stage keeps the standard
`viewBox="0 0 500 400"`; the coastline comes from the shared `docs/assets/img/world.svg`.

**Never hand-place a map coordinate.** Run the layout tool and paste its output:

```bash
python3 scripts/mapkit.py --bounds 20,10,90,50 \
  --pt "Uruk|31.32|45.64" --pt "Mohenjo-daro|27.33|68.14" \
  --route "Gulf trade|31.3,45.6;26.0,50.5;24.5,56.5;24.8,67.0" \
  --river tigris,euphrates,indus
# --ice          ice-age coastline (sea only where deeper than 200 m) — Chapters I–II
# --parallel 0   for near-global windows; W > E means the window crosses the date line
```

It prints the `<g class="atlas">` base layers, one `<circle class="atlas__pin">` per point and a
`<path class="atlas__route draw" pathLength="1">` per route. Then add step bindings yourself:
`data-step-show="N"` on pins, labels, halos and named-river `<use>`s; `data-step-draw="N"` on routes
(every `data-step-draw` path must keep `pathLength="1"`). Labels are
`<text class="atlas__label" x=".." y="..">`, offset ~6 px from the pin; `atlas__label--small` and
`atlas__label--sea` exist. Halos: `<circle class="atlas__halo" r="14">`. Regions:
`<path class="atlas__area" d="…">` (build its outline from `--route` output if needed).
Do not use the class name `region` — it is the scene *lit* primitive (`fill-opacity:0` until lit).

```html
<section class="section scene" id="scene-atlas" aria-label="…one-line description…">
  <div class="scene__sticky">
    <figure class="scene__stage" aria-hidden="true">
      <svg class="stage-svg" viewBox="0 0 500 400" preserveAspectRatio="xMidYMid meet">
        <!-- mapkit output here, then pins / labels / routes with data-step-* -->
      </svg>
      <figcaption class="stage-cap">…caption for step 0…</figcaption>
    </figure>
  </div>
  <div class="scene__steps">
    <div class="step" data-caption="…">
      <p class="step__n">01 · …</p>
      <h3>…</h3>
      <p>…</p>
    </div>
    <!-- 4–6 steps -->
  </div>
</section>
```
Ice-age maps must say so in a caption ("coastline approximate: sea ~120 m lower; shelf drawn at the
200 m isobath"). Keep 4–6 steps and 6–14 pins; a map that is unreadable at 500 px is worse than none.

## 4. Milestones — `#milestones`

Every `<article class="dev">` carries **`data-y`** (signed calendar year of its start; negative =
BCE; for "kya"/"Mya" dates use `2000 − years ago`, e.g. 45.5 kya → `-43500`, 7 Mya → `-6998000`) and,
for spans, **`data-y2`**. `chrono.js` builds the true-scale strip from these, so **if you change a
card's visible date you must change its `data-y`**. Give new cards an `id="m-slug"` only if you link
to them. After adding cards, update the spelled-out count in the `<h2>` ("Thirty-four turning points").

```html
<article class="dev reveal" data-y="-4600"><p class="dev__date">c. 4600 BCE</p><h3 class="dev__name">…</h3><p class="dev__region">…</p><p class="dev__sig">…</p></article>
```

## 5. Around the world — `#world`

Sixteen fixed regions, always in this order, always with the same mini-map snippet so the panel reads
as one system across all nine chapters. One card each: a date span (or an honest "no humans yet"),
then 2–4 sentences naming real places, polities, peoples and what was happening *in this chapter's
span*. Where nobody lived yet, use `regioncard regioncard--empty` and describe the land and its
animals instead of inventing people.

```html
<section class="section" id="world" aria-labelledby="world-title">
  <div class="wrap">
    <p class="eyebrow reveal">Meanwhile, everywhere</p>
    <h2 class="reveal" id="world-title">…a chapter-specific title…</h2>
    <p class="lede reveal" style="max-width:var(--measure)">…one or two sentences…</p>
    <div class="regions">
      <article class="regioncard reveal">
        <svg class="regioncard__map" viewBox="0 10 360 140" aria-hidden="true"><use class="land" href="../assets/img/world.svg#land"/>SPOT</svg>
        <h3 class="regioncard__name">West Asia</h3>
        <p class="regioncard__when">c. 3500–1200 BCE</p>
        <p>…</p>
      </article>
      <!-- …15 more, in the order below -->
    </div>
  </div>
</section>
```

Replace `SPOT` with the region's fixed shape:

| # | Region (`regioncard__name`) | SPOT |
|---|---|---|
| 1 | West Asia | `<ellipse class="spot" cx="225" cy="57" rx="20" ry="13"/>` |
| 2 | North Africa &amp; the Nile | `<ellipse class="spot" cx="192" cy="66" rx="25" ry="12"/>` |
| 3 | West &amp; Central Africa | `<ellipse class="spot" cx="185" cy="86" rx="22" ry="11"/>` |
| 4 | East &amp; Southern Africa | `<ellipse class="spot" cx="213" cy="102" rx="13" ry="24"/>` |
| 5 | Europe &amp; the Mediterranean | `<ellipse class="spot" cx="195" cy="42" rx="24" ry="12"/>` |
| 6 | Central Asia &amp; the Steppe | `<ellipse class="spot" cx="255" cy="43" rx="36" ry="9"/>` |
| 7 | South Asia | `<ellipse class="spot" cx="258" cy="69" rx="13" ry="14"/>` |
| 8 | East Asia | `<ellipse class="spot" cx="298" cy="56" rx="20" ry="13"/>` |
| 9 | Southeast Asia | `<ellipse class="spot" cx="290" cy="86" rx="20" ry="13"/>` |
| 10 | Australia | `<ellipse class="spot" cx="314" cy="115" rx="21" ry="14"/>` |
| 11 | Oceania &amp; the Pacific | `<ellipse class="spot" cx="347" cy="100" rx="20" ry="22"/><ellipse class="spot" cx="12" cy="100" rx="14" ry="20"/>` |
| 12 | The Arctic | `<rect class="spot" x="0" y="11" width="360" height="17"/>` |
| 13 | North America | `<ellipse class="spot" cx="83" cy="48" rx="28" ry="15"/>` |
| 14 | Mesoamerica | `<ellipse class="spot" cx="85" cy="72" rx="10" ry="6"/>` |
| 15 | The Caribbean | `<ellipse class="spot" cx="108" cy="72" rx="10" ry="6"/>` |
| 16 | South America | `<ellipse class="spot" cx="120" cy="108" rx="16" ry="30"/>` |

(North America means north of Mexico. The Arctic includes Siberia's far north, Greenland, the
Inuit/Thule/Dorset world and Sámi country.)

## 6. Ordinary lives — `#lives`

Three or four vignettes, each anchored to **real evidence** — a named skeleton, a household
excavation, a document, an isotope study — never a composite presented as a real person. If the
person is a type, say so ("a woman buried at…", "a weaver named in the Pylos tablets"). Close each with
the evidence line. Follow with a "life by the numbers" table (life expectancy at birth and at 15, adult
height, staple diet, share in towns, literacy — whatever the evidence supports, with ranges and a
source column).

```html
<section class="section" id="lives" aria-labelledby="lives-title">
  <div class="wrap">
    <p class="eyebrow reveal">Ordinary lives</p>
    <h2 class="reveal" id="lives-title">…</h2>
    <div class="lives">
      <article class="life reveal">
        <p class="life__where">Çatalhöyük, central Anatolia · c. 7000 BCE</p>
        <h3 class="life__who">…</h3>
        <p>…</p>
        <p class="life__evidence"><b>How we know</b> …bone chemistry / excavation / text…</p>
      </article>
    </div>
    <details class="datatable reveal" style="margin-top:var(--space-l)"><summary>Life by the numbers</summary>
      <div class="table-scroll"><table class="data">
        <caption>…</caption>
        <thead><tr><th>Measure</th><th>Estimate</th><th>Where / who</th><th>Source &amp; confidence</th></tr></thead>
        <tbody>…</tbody>
      </table></div>
    </details>
  </div>
</section>
```

## 7. In their own words — `#voices` (Chapters IV–IX; oral tradition only where genuinely recorded)

Three to five short excerpts (≤ 60 words each) from real primary sources, in a standard published
translation. **Quote only what you have verified** — text, speaker, work, date. If you cannot confirm
the wording, paraphrase in prose elsewhere instead of inventing quotation marks. Include voices from
outside Europe and from people other than rulers.

```html
<section class="section" id="voices" aria-labelledby="voices-title">
  <div class="wrap">
    <p class="eyebrow reveal">In their own words</p>
    <h2 class="reveal" id="voices-title">…</h2>
    <div class="voices">
      <figure class="voice reveal">
        <blockquote><p>…</p></blockquote>
        <figcaption><b>Speaker</b>, <cite>Work</cite>, date
          <span class="voice__note">One sentence of context: who, why it matters, translation used.</span></figcaption>
      </figure>
    </div>
  </div>
</section>
```

## 8. Evidence language

Keep the site's register: dates approximate, firsts "earliest currently known", and the evidence
labels already used in tables — **well attested**, **widely accepted**, **contested** — plus the
method. When a 2023–2026 study changes a claim, say what changed and when. Polycentric coverage
(`ARCHITECTURE.md` §11) is mandatory; the region panel makes a gap visible, so do not fill a card with
filler — a short true card beats a long vague one.
