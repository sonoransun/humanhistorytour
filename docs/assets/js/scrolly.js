/* ============================================================================
   scrolly.js — the scroll engine
   ----------------------------------------------------------------------------
   One shared requestAnimationFrame loop + three IntersectionObserver instances.
   All motion is expressed in CSS (transform/opacity); this module only toggles
   classes / writes custom properties. Exports a subscribe() API so the rail can
   read the same scroll state (single source of truth).
   ========================================================================== */

const reduce = () =>
  document.documentElement.classList.contains("reduce-motion") ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- Shared scroll store ------------------------------------------------- */
const subscribers = new Set();
let ticking = false;
let metrics = { scrollY: 0, vh: 0, docH: 0, progress: 0 };

/* NOTE: docH is read from scrollHeight, which GROWS as Mermaid diagrams render
   lazily mid-scroll. That re-derives `progress`, so the rail fill can visibly
   jump on a diagram-heavy page. The body ResizeObserver below re-measures, which
   keeps rail and content consistent — it does not eliminate the jump. */
function measure() {
  metrics.vh = window.innerHeight;
  metrics.docH = document.documentElement.scrollHeight;
}

function frame() {
  ticking = false;
  metrics.scrollY = window.scrollY || window.pageYOffset;
  const scrollable = Math.max(1, metrics.docH - metrics.vh);
  metrics.progress = Math.min(1, Math.max(0, metrics.scrollY / scrollable));
  // read phase done; write phase:
  for (const fn of subscribers) {
    try { fn(metrics); } catch (e) { /* keep loop alive */ }
  }
}

function requestTick() {
  if (!ticking) { ticking = true; requestAnimationFrame(frame); }
}

export function subscribe(fn) {
  subscribers.add(fn);
  fn(metrics);
  return () => subscribers.delete(fn);
}

let ro;
function bindGlobalScroll() {
  measure();
  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", () => { measure(); requestTick(); }, { passive: true });
  window.addEventListener("orientationchange", () => { measure(); requestTick(); });
  ro = new ResizeObserver(() => { measure(); requestTick(); });
  ro.observe(document.body);
  requestTick();
}

/* ---- 1. Reveal observer -------------------------------------------------- */
function initReveal() {
  const els = document.querySelectorAll(".reveal");
  if (!els.length) return;
  if (reduce()) { els.forEach((el) => el.classList.add("is-visible")); return; }
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("is-visible"); obs.unobserve(e.target); }
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.15 });
  els.forEach((el) => io.observe(el));
}

/* ---- 2. Scene-step observer + progress scrub ----------------------------- */
function initScenes() {
  const scenes = document.querySelectorAll(".scene");
  scenes.forEach((scene) => {
    const steps = [...scene.querySelectorAll(".step")];
    if (!steps.length) return;
    const stage = scene.querySelector(".scene__stage");

    // Center-band observer decides the active step.
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const idx = steps.indexOf(e.target);
        if (idx < 0) return;
        scene.dataset.step = String(idx);
        steps.forEach((s, i) => s.classList.toggle("is-active", i === idx));
        applyStepState(scene, stage, idx);
        announceScene(scene, idx);
      });
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
    steps.forEach((s) => io.observe(s));

    // First step active by default (so no-JS + first paint look right).
    if (!reduce()) { steps[0].classList.add("is-active"); scene.dataset.step = "0"; applyStepState(scene, stage, 0); }
    else { steps.forEach((s) => s.classList.add("is-active")); }
  });
}

function applyStepState(scene, stage, idx) {
  if (!stage) return;
  // Reveal any [data-until] graphic layers up to the active step index.
  stage.querySelectorAll("[data-step-show]").forEach((el) => {
    const show = Number(el.dataset.stepShow);
    el.style.opacity = idx >= show ? "1" : "0";
  });
  // draw paths belonging to steps <= idx
  stage.querySelectorAll(".draw[data-step-draw]").forEach((el) => {
    if (idx >= Number(el.dataset.stepDraw)) el.classList.add("is-drawn");
  });
  // light regions belonging to steps <= idx
  stage.querySelectorAll(".region[data-step-lit]").forEach((el) => {
    if (idx >= Number(el.dataset.stepLit)) el.classList.add("is-lit");
  });
  // Update the stage caption if the active step provides one.
  const cap = stage.querySelector(".stage-cap");
  const step = scene.querySelectorAll(".step")[idx];
  if (cap && step && step.dataset.caption) cap.textContent = step.dataset.caption;
}

let announceEl;
function announceScene(scene, idx) {
  if (!announceEl) announceEl = document.querySelector(".announcer");
  const step = scene.querySelectorAll(".step")[idx];
  if (announceEl && step) {
    const h = step.querySelector("h3");
    if (h) announceEl.textContent = h.textContent;
  }
}

/* ---- 3. Prep observer (lazy work when a section is ~2 viewports away) ---- */
function initPrep() {
  const els = document.querySelectorAll("[data-prep]");
  if (!els.length) return;
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add("is-prepped");
      obs.unobserve(el);
    });
  }, { rootMargin: "200% 0px" });
  els.forEach((el) => io.observe(el));
}

/* ---- Number counters ----------------------------------------------------- */
const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

function initCounters() {
  const els = document.querySelectorAll("[data-counter]");
  if (!els.length) return;
  // Markup carries the final value so the page reads correctly with JS off; zero
  // it here only if it will actually animate.
  if (!reduce()) els.forEach((el) => { el.textContent = (el.dataset.prefix || "") + "0" + (el.dataset.suffix || ""); });
  const io = new IntersectionObserver((entries, obs) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      obs.unobserve(el);
      const to = Number(el.dataset.counter);
      const compact = el.dataset.compact === "true";
      const fmt = compact
        ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
        : new Intl.NumberFormat("en");
      const bar = el.parentElement?.querySelector(".counter__fill");
      const barPct = el.dataset.bar ? Number(el.dataset.bar) : null;
      if (reduce()) {
        el.textContent = (el.dataset.prefix || "") + fmt.format(to) + (el.dataset.suffix || "");
        if (bar && barPct != null) bar.style.width = barPct + "%";
        return;
      }
      const dur = 1500, start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const v = to * easeOutExpo(p);
        el.textContent = (el.dataset.prefix || "") + fmt.format(Math.round(v)) + (el.dataset.suffix || "");
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      if (bar && barPct != null) requestAnimationFrame(() => (bar.style.width = barPct + "%"));
    });
  }, { threshold: 0.5 });
  els.forEach((el) => io.observe(el));
}

/* ---- Parallax (subscribe to shared loop) --------------------------------- */
function initParallax() {
  const layers = [...document.querySelectorAll("[data-parallax]")];
  if (!layers.length) return;
  const meta = layers.map((el) => ({ el, depth: Number(el.dataset.parallax) || 0.3, host: el.closest(".hero,.titlecard,.chapter,section") || el.parentElement }));
  subscribe(({ scrollY, vh }) => {
    if (reduce()) { for (const m of meta) m.el.style.transform = ""; return; } // header toggle can flip mid-session
    for (const m of meta) {
      const rect = m.host.getBoundingClientRect();
      if (rect.bottom < -vh || rect.top > vh * 2) continue; // offscreen
      const center = rect.top + rect.height / 2 - vh / 2;
      const shift = (center / vh) * m.depth * -60;
      m.el.style.transform = `translate3d(0, ${shift.toFixed(1)}px, 0)`;
    }
  });
}

/* ---- Draw the "thread of time" spine as you scroll its section ----------- */
function initThreadReveal() {
  const paths = document.querySelectorAll("[data-thread-path]");
  if (!paths.length || reduce()) return;
  paths.forEach((p) => {
    const len = p.getTotalLength ? p.getTotalLength() : 1000;
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len;
    subscribe(() => {
      const rect = p.getBoundingClientRect();
      const vh = window.innerHeight;
      const prog = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height)));
      p.style.strokeDashoffset = String(len * (1 - prog));
    });
  });
}

/* ---- Public init --------------------------------------------------------- */
export function initScrolly() {
  bindGlobalScroll();
  initReveal();
  initScenes();
  initPrep();
  initCounters();
  initParallax();
  initThreadReveal();
}
