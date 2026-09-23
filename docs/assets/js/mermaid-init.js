/* ============================================================================
   mermaid-init.js — lazy, theme-aware Mermaid rendering
   ----------------------------------------------------------------------------
   Diagrams are authored as <figure class="diagram"><pre class="mermaid">…</pre></figure>.
   The source text is stashed in dataset.src so we can re-render on theme change.
   Mermaid is imported once, on demand, from a PINNED CDN (chunks load from the
   same CDN — no vendoring-chunk pitfall). SVGs are aria-hidden; the accessible
   equivalent is the adjacent data <table> / figcaption.
   ========================================================================== */

const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.16.0/dist/mermaid.esm.min.mjs";

let mermaidPromise = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import(MERMAID_URL).then((m) => m.default).catch((err) => {
      mermaidPromise = null;
      throw err;
    });
  }
  return mermaidPromise;
}

// Custom properties are NOT resolved by getPropertyValue, so paint each through
// a probe and read the computed color. We only resolve the PLAIN hex era vars
// (which compute to rgb()); mixed/surface tones are derived in rgb here, because
// color-mix(in oklab, …) computes to oklab(), which Mermaid's color lib rejects.
let _probe;
function resolveColor(varName, fallback) {
  if (!_probe) {
    _probe = document.createElement("span");
    _probe.style.cssText = "position:absolute;left:-9999px;top:-9999px;";
    document.body.appendChild(_probe);
  }
  _probe.style.color = "";
  _probe.style.color = `var(${varName}, ${fallback})`;
  const c = getComputedStyle(_probe).color;
  return c && c !== "" ? c : fallback;
}
function parseRgb(s) {
  const m = s.match(/(\d+(?:\.\d+)?)/g);
  return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
}
function mixRgb(a, b, t) {
  const A = parseRgb(a), B = parseRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function themeVars() {
  const ink = resolveColor("--ink", "rgb(232,223,211)");
  const bgc = resolveColor("--bg", "rgb(20,15,12)");
  const accent = resolveColor("--accent", "rgb(193,80,46)");
  const accent2 = resolveColor("--accent-2", "rgb(138,59,36)");
  const bg = mixRgb(bgc, ink, 0.14);      // surface
  const line = mixRgb(ink, bgc, 0.62);    // line-strong-ish
  return {
    theme: "base",
    themeVariables: {
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      fontSize: "14px",
      background: bg,
      primaryColor: bg,
      primaryTextColor: ink,
      primaryBorderColor: accent,
      secondaryColor: accent2,
      tertiaryColor: bg,
      lineColor: line,
      textColor: ink,
      mainBkg: bg,
      nodeBorder: accent,
      clusterBkg: "transparent",
      clusterBorder: line,
      titleColor: accent,
      edgeLabelBackground: bg,
      pie1: accent, pie2: accent2, pie3: "#6b8f3c", pie4: "#d9a441",
      pie5: "#3fa7a0", pie6: "#8c2f39", pie7: "#5e86bd", pie8: "#a78bfa",
    },
  };
}

async function renderOne(mermaid, pre) {
  const fig = pre.closest("figure.diagram") || pre.parentElement;
  const loading = fig ? fig.querySelector(".diagram__loading") : null;
  try {
    const src = pre.dataset.src || pre.textContent;
    pre.dataset.src = src;
    const id = "m" + Math.abs(hash(src + (pre.id || ""))).toString(36);
    const { svg } = await mermaid.render(id, src);
    pre.innerHTML = svg;
    pre.setAttribute("data-processed", "true");
    const svgEl = pre.querySelector("svg");
    if (svgEl) { svgEl.setAttribute("aria-hidden", "true"); svgEl.removeAttribute("height"); svgEl.style.maxWidth = "100%"; }
    if (loading) loading.remove();
  } catch (err) {
    if (loading) loading.remove();
    pre.innerHTML = `<div class="diagram__err">Diagram could not be rendered. The description and data table below convey the same information.</div>`;
  }
}

function showFallback(pre) {
  const fig = pre.closest("figure.diagram") || pre.parentElement;
  fig?.querySelector(".diagram__loading")?.remove();
  pre.innerHTML = `<div class="diagram__err">Diagrams could not be loaded (the Mermaid library is unreachable — offline or blocked). The description and data table below convey the same information.</div>`;
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }

export async function initMermaid() {
  const pres = [...document.querySelectorAll("pre.mermaid")];
  if (!pres.length) return;
  pres.forEach((p) => { p.dataset.src = p.dataset.src || p.textContent.trim(); });

  let mermaid;
  const ensure = async () => {
    if (mermaid) return mermaid;
    mermaid = await loadMermaid();
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      maxTextSize: 120000,
      maxEdges: 800,
      flowchart: { htmlLabels: true, curve: "basis", useMaxWidth: true },
      themeCSS: ".node rect,.node circle,.node polygon{stroke-width:1.5px}",
      ...themeVars(),
    });
    return mermaid;
  };

  // Serial render queue — Mermaid.render shares global state, so concurrent
  // renders can clobber one another. Drain one at a time.
  const queue = [];
  let draining = false;
  async function drain() {
    if (draining) return;
    draining = true;
    while (queue.length) {
      const pre = queue.shift();
      const m = await ensure().catch(() => null);
      if (m) await renderOne(m, pre);
      else showFallback(pre); // CDN unreachable: say so instead of "Rendering…" forever
    }
    draining = false;
  }

  // Render when a diagram nears the viewport.
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      queue.push(e.target);
      drain();
    });
  }, { rootMargin: "300px 0px" });
  pres.forEach((p) => io.observe(p));

  // Re-render on theme/era change (debounced) so colors track the palette.
  let t;
  const rerender = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      if (!mermaid) return;
      mermaid.initialize({ startOnLoad: false, securityLevel: "loose", maxTextSize: 120000, maxEdges: 800, flowchart: { htmlLabels: true, curve: "basis", useMaxWidth: true }, ...themeVars() });
      // Re-queue rather than render here: mermaid.render() shares global state,
      // and the lazy queue may be mid-drain.
      for (const p of pres) {
        if (p.getAttribute("data-processed") && !queue.includes(p)) { p.removeAttribute("data-processed"); queue.push(p); }
      }
      drain();
    }, 250);
  };
  const mo = new MutationObserver((muts) => {
    if (muts.some((m) => m.attributeName === "data-theme" || m.attributeName === "data-era")) rerender();
  });
  mo.observe(document.documentElement, { attributes: true });
  mo.observe(document.body, { attributes: true });
}
