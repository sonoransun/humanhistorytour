/* ============================================================================
   main.js — single module entry point
   Wires site chrome (theme + reduce-motion toggles, active nav, resume chip),
   then conditionally boots the scroll engine, the rail, and Mermaid.
   The anti-FOUC head snippet has already set html.js + stored theme/motion.
   ========================================================================== */

import { initScrolly } from "./scrolly.js";
import { initRail } from "./rail.js";
import { initMermaid } from "./mermaid-init.js";
import { initChrono } from "./chrono.js";

const LS = { theme: "hht-theme", motion: "hht-motion", resume: "hht-resume" };

/* ---- Theme toggle -------------------------------------------------------- */
function currentTheme() {
  // The CSS default palette is dark and tokens.css has no prefers-color-scheme
  // rule, so "no explicit theme" IS dark. (Falling back to the OS preference here
  // made the first click a no-op for OS-light visitors, with aria-pressed wrong.)
  return document.documentElement.getAttribute("data-theme") || "dark";
}
function wireTheme() {
  const btn = document.querySelector("[data-theme-toggle]");
  if (!btn) return;
  const sync = () => {
    const t = currentTheme();
    btn.setAttribute("aria-pressed", String(t === "light"));
    btn.title = t === "light" ? "Switch to dark theme" : "Switch to light theme";
  };
  sync();
  btn.addEventListener("click", () => {
    const next = currentTheme() === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(LS.theme, next); } catch (e) {}
    sync();
  });
}

/* ---- Reduce-motion toggle ------------------------------------------------ */
function wireMotion() {
  const btn = document.querySelector("[data-motion-toggle]");
  if (!btn) return;
  const sync = () => {
    const on = document.documentElement.classList.contains("reduce-motion");
    btn.setAttribute("aria-pressed", String(on));
    btn.title = on ? "Enable motion" : "Reduce motion";
  };
  sync();
  btn.addEventListener("click", () => {
    const on = document.documentElement.classList.toggle("reduce-motion");
    try { localStorage.setItem(LS.motion, on ? "reduce" : "ok"); } catch (e) {}
    sync();
  });
}

/* ---- Active nav highlight ------------------------------------------------ */
function wireActiveNav() {
  const here = location.pathname.replace(/index\.html$/, "").replace(/\/$/, "");
  document.querySelectorAll(".site-nav a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    const path = new URL(href, location.href).pathname.replace(/index\.html$/, "").replace(/\/$/, "");
    if (path && here.endsWith(path) && path !== "") a.setAttribute("aria-current", "page");
  });
}

/* ---- Resume progress (persist current chapter; offer resume on landing) -- */
function wireResume() {
  const ch = document.body.dataset.chapter;
  const title = document.body.dataset.chapterTitle;
  if (ch && title) {
    try { localStorage.setItem(LS.resume, JSON.stringify({ n: ch, title, href: location.pathname })); } catch (e) {}
  }
  const chip = document.querySelector("[data-resume]");
  if (!chip) return;
  try {
    const raw = localStorage.getItem(LS.resume);
    if (!raw) return;
    const { n, title, href } = JSON.parse(raw);
    if (!n || !href) return;
    const link = chip.querySelector("a");
    const root = document.documentElement.getAttribute("data-tour-root") || "";
    // href stored as absolute path; fall back to root-relative chapter link
    link.href = href.includes("/tour/") ? href : root + href;
    link.textContent = `Resume · Ch. ${n}: ${title}`;
    chip.classList.add("is-shown");
    chip.querySelector("[data-resume-dismiss]")?.addEventListener("click", () => {
      chip.classList.remove("is-shown");
      try { localStorage.removeItem(LS.resume); } catch (e) {}
    });
  } catch (e) {}
}

/* ---- Move focus to the target heading after in-page nav (a11y) ----------- */
function wireHashFocus() {
  const focusTarget = () => {
    if (!location.hash) return;
    const t = document.querySelector(location.hash);
    if (t) { t.setAttribute("tabindex", "-1"); t.focus({ preventScroll: true }); }
  };
  window.addEventListener("hashchange", focusTarget);
}

/* ---- Boot ---------------------------------------------------------------- */
function boot() {
  wireTheme();
  wireMotion();
  wireActiveNav();
  wireResume();
  wireHashFocus();

  const isTour = document.body.classList.contains("tour");
  initChrono(); // builds [data-thread-path] strips; must precede initScrolly()
  if (isTour || document.querySelector(".scene, .reveal, [data-parallax], [data-chrono]")) {
    initScrolly();
  }
  if (isTour || document.querySelector("[data-rail], .mrail")) {
    const url = new URL("../../data/chapters.json", import.meta.url).href;
    initRail(url);
  }
  if (document.querySelector("pre.mermaid")) {
    initMermaid();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
