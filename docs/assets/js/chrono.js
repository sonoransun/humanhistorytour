/* ============================================================================
   chrono.js — "the chapter at true scale"
   ----------------------------------------------------------------------------
   Builds a proportional timeline strip from the milestone cards themselves, so
   the strip can never disagree with them: every <article class="dev"> carries
   data-y (signed calendar year of its start; negative = BCE) and, for spans,
   data-y2. The host is an empty placeholder:

     <div class="chrono" data-chrono data-y0="-3500" data-y1="-1200"
          data-scale="linear|log" data-mode="era|ago" aria-hidden="true"></div>

   This realises the long-dormant "thread of time": the strip's axis is a
   [data-thread-path] that scrolly.js draws as the strip scrolls into view.
   Enhancement only — with JS off the placeholder stays empty and the cards
   below it carry everything. It must run BEFORE initScrolly() so the thread
   path exists when scrolly.js looks for it.
   ========================================================================== */

const NS = "http://www.w3.org/2000/svg";
const NOW = 2000; // same reference year as rail.js formatYear()

function svg(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

function slug(s) {
  return "m-" + s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function fmtAgo(ya) {
  if (ya >= 1e6) return +(ya / 1e6).toFixed(ya >= 1e7 ? 0 : 1) + " Mya";
  if (ya >= 1e3) return Math.round(ya / 1e3).toLocaleString("en") + " kya";
  return Math.round(ya).toLocaleString("en") + " ya";
}
function fmtEra(y, allCE) {
  if (y < 1) return Math.abs(Math.round(y) || 1).toLocaleString("en") + " BCE";
  return allCE && y >= 1000 ? String(Math.round(y)) : Math.round(y) + " CE";
}

function niceStep(span, target) {
  const raw = span / target;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

export function initChrono() {
  document.querySelectorAll("[data-chrono]").forEach(build);
}

function build(host) {
  const scope = host.closest("section") || document;
  const cards = [...scope.querySelectorAll(".dev[data-y]")];
  const y0 = Number(host.dataset.y0), y1 = Number(host.dataset.y1);
  if (!cards.length || !Number.isFinite(y0) || !Number.isFinite(y1) || y0 === y1) return;
  const log = host.dataset.scale === "log";
  const ago = host.dataset.mode === "ago";
  const allCE = y0 >= 1;

  const W = 1000, L = 24, R = 24;
  // log scale runs on years-before-NOW, oldest at left
  const a0 = NOW - y0, a1 = Math.max(1, NOW - y1);
  const x = (y) => {
    let t;
    if (log) t = (Math.log10(a0) - Math.log10(Math.max(a1, NOW - y))) / (Math.log10(a0) - Math.log10(a1));
    else t = (y - y0) / (y1 - y0);
    return L + Math.min(1, Math.max(0, t)) * (W - L - R);
  };

  const items = cards.map((c) => {
    if (!c.id) c.id = slug(c.querySelector(".dev__name")?.textContent || "milestone");
    const ya = Number(c.dataset.y), yb = c.dataset.y2 != null ? Number(c.dataset.y2) : null;
    return {
      id: c.id,
      name: (c.querySelector(".dev__name")?.textContent || "").trim(),
      date: (c.querySelector(".dev__date")?.textContent || "").trim(),
      xa: x(ya), xb: yb != null && Number.isFinite(yb) ? x(yb) : null,
    };
  }).sort((p, q) => p.xa - q.xa);

  // greedy lanes so DOTS never overlap (spans are drawn faint and may cross)
  const GAP = 13, lanes = [];
  for (const it of items) {
    let lane = lanes.findIndex((end) => it.xa - end >= GAP);
    if (lane < 0) { lane = lanes.length < 7 ? lanes.length : lanes.indexOf(Math.min(...lanes)); }
    lanes[lane] = it.xa;
    it.lane = lane;
  }
  const nl = Math.max(1, lanes.length);
  const TOP = 26, LANE = 13, AXIS = TOP + nl * LANE + 6, H = AXIS + 28;

  const frame = document.createElement("div");
  frame.className = "chrono__frame";
  const head = document.createElement("div");
  head.className = "chrono__head";
  const span = ago ? `${fmtAgo(a0)} – ${fmtAgo(a1)}` : `${fmtEra(y0, allCE)} – ${fmtEra(y1, allCE)}`;
  head.innerHTML = `<span><b>The chapter at true scale</b> · ${items.length} milestones</span>` +
    `<span>${span} · ${log ? "logarithmic: each tick back is ×10 older" : "linear"}</span>`;
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet", role: "presentation" });
  frame.append(head, s);

  // ticks
  const ticks = [];
  if (log) {
    for (let e = Math.floor(Math.log10(a1)); e <= Math.floor(Math.log10(a0)); e++) {
      for (const m of [1, 2, 5]) { const v = m * Math.pow(10, e); if (v >= a1 && v <= a0) ticks.push(NOW - v); }
    }
  } else {
    const st = niceStep(Math.abs(y1 - y0), 7);
    for (let v = Math.ceil(Math.min(y0, y1) / st) * st; v <= Math.max(y0, y1); v += st) ticks.push(v);
  }
  // end labels first, then interior ticks that do not collide with them
  const label = (t) => (ago || log ? fmtAgo(NOW - t) : fmtEra(t, allCE));
  const placed = [];
  const put = (tx, text, anchor) => {
    const lbl = svg("text", { class: "c-ticklbl", x: tx, y: AXIS + 20, "text-anchor": anchor }, s);
    lbl.textContent = text;
    placed.push(tx);
  };
  put(L, label(y0), "start");
  put(W - R, label(y1), "end");
  for (const t of ticks.sort((p, q) => x(p) - x(q))) {
    const tx = x(t);
    svg("line", { class: "c-tick", x1: tx, x2: tx, y1: TOP - 6, y2: AXIS + 4 }, s);
    if (placed.some((px) => Math.abs(px - tx) < 80)) continue;
    put(tx, label(t), "middle");
  }

  svg("line", { class: "c-axis", x1: L, x2: W - R, y1: AXIS, y2: AXIS }, s);
  // the thread: drawn by scrolly.js initThreadReveal()
  svg("path", { class: "c-thread", d: `M${L} ${AXIS} H${W - R}`, "data-thread-path": "" }, s);

  for (const it of items) {
    const cy = AXIS - 8 - it.lane * LANE;
    const a = svg("a", { href: "#" + it.id, tabindex: "-1" }, s);
    if (it.xb != null && Math.abs(it.xb - it.xa) > 2) {
      svg("line", { class: "c-span", x1: Math.min(it.xa, it.xb), x2: Math.max(it.xa, it.xb), y1: cy, y2: cy }, a);
    }
    svg("line", { class: "c-tick", x1: it.xa, x2: it.xa, y1: cy, y2: AXIS }, a);
    svg("circle", { class: "c-dot", cx: it.xa, cy, r: 4.2 }, a);
    const t = svg("title", {}, a);
    t.textContent = `${it.date} — ${it.name}`;
    const anchor = it.xa < 160 ? "start" : it.xa > W - 160 ? "end" : "middle";
    const hint = svg("text", { class: "c-hint", x: it.xa, y: Math.max(12, cy - 9), "text-anchor": anchor }, a);
    hint.textContent = it.name.length > 46 ? it.name.slice(0, 44) + "…" : it.name;
  }

  host.replaceChildren(frame);
}
