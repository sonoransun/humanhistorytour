/**
 * Accessibility & robustness QA — the four contracts that are easy to break
 * silently and impossible to notice in normal desktop browsing.
 *
 *   1. NO-JS      content and navigation must survive JavaScript being disabled
 *   2. REDUCED    scenes must un-pin and all steps become visible
 *   3. MOBILE     no horizontal overflow; bottom rail + chapter chip replace the rail
 *   4. THEME      the light/dark toggle must work on reference pages
 *   5. EXPANSION  counters readable without JS, 16-region panels complete, every
 *                 chapter's chrono strip + atlas map built, theme first click (OS-light)
 *
 * Requires a local server AND an optional Playwright install — see scripts/README.md.
 *   python3 -m http.server 8000 --directory docs
 *   node scripts/verify/qa.mjs [baseUrl]
 */
import { chromium } from "playwright";

const B = process.argv[2] || process.env.BASE || "http://localhost:8000";
const browser = await chromium.launch();
let ok = true;
const check = (name, pass, detail) => {
  if (!pass) ok = false;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

// 1. NO-JS -------------------------------------------------------------------
{
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(B + "/tour/06-medieval.html", { waitUntil: "domcontentloaded" });
  const r = await page.evaluate(() => ({
    devCards: document.querySelectorAll(".dev").length,
    prevNext: document.querySelectorAll("#chapter-nav a").length,
    headerLinks: document.querySelectorAll(".site-header a").length,
    // reveal/step elements must NOT be stuck at opacity 0 without JS
    revealOpacity: getComputedStyle(document.querySelector(".reveal")).opacity,
    stepOpacity: getComputedStyle(document.querySelector(".step")).opacity,
  }));
  check("no-JS · content present", r.devCards > 0, `${r.devCards} milestone cards`);
  check("no-JS · navigation works", r.prevNext >= 2 && r.headerLinks >= 2,
        `${r.prevNext} prev/next, ${r.headerLinks} header links`);
  check("no-JS · nothing hidden", r.revealOpacity === "1" && r.stepOpacity === "1",
        `reveal=${r.revealOpacity} step=${r.stepOpacity}`);
  await ctx.close();
}

// 2. REDUCED MOTION ----------------------------------------------------------
{
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(B + "/tour/01-deep-prehistory.html", { waitUntil: "networkidle" });
  await page.evaluate(() => document.querySelector(".scene").scrollIntoView());
  await page.waitForTimeout(400);
  const pos = await page.evaluate(() => getComputedStyle(document.querySelector(".scene__sticky")).position);
  check("reduced-motion · scenes un-pin", pos !== "sticky", `position: ${pos}`);
  await ctx.close();
}

// 3. MOBILE ------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(B + "/tour/09-information-age.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({
    overflow: document.body.scrollWidth > window.innerWidth + 2,
    mrail: getComputedStyle(document.querySelector(".mrail")).display,
    mchip: getComputedStyle(document.querySelector(".mchip")).display,
    rail: getComputedStyle(document.querySelector(".rail")).display,
  }));
  check("mobile · no horizontal overflow", !r.overflow);
  check("mobile · bottom bar + chip replace rail",
        r.mrail !== "none" && r.mchip !== "none" && r.rail === "none");
  await ctx.close();
}

// 4. THEME TOGGLE ------------------------------------------------------------
{
  const page = await browser.newPage();
  // reference page: toggle must exist AND flip the palette
  await page.goto(B + "/reference/sources.html", { waitUntil: "networkidle" });
  const hasToggle = await page.evaluate(() =>
    !!document.querySelector("[data-theme-toggle]") &&
    getComputedStyle(document.querySelector("[data-theme-toggle]")).display !== "none");
  let flipped = false;
  if (hasToggle) {
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click("[data-theme-toggle]");
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    flipped = before !== after;
  }
  check("theme · reference page toggle works", hasToggle && flipped);

  // chapter: toggle is intentionally hidden (data-era overrides the theme)
  await page.goto(B + "/tour/01-deep-prehistory.html", { waitUntil: "networkidle" });
  const hidden = await page.evaluate(() => {
    const t = document.querySelector("[data-theme-toggle]");
    return !t || getComputedStyle(t).display === "none";
  });
  check("theme · chapter toggle hidden (inert by design)", hidden);
  await page.close();
}

// 5. EXPANSION CONTRACTS (Sept 2026) -------------------------------------------
const CHAPTERS = ["01-deep-prehistory", "02-paleolithic", "03-neolithic", "04-first-civilizations",
  "05-classical-antiquity", "06-medieval", "07-early-modern", "08-industrial", "09-information-age"];
{
  // no-JS: counters show their real value, region panels and cards are visible
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const bad = [];
  for (const c of CHAPTERS) {
    await page.goto(`${B}/tour/${c}.html`, { waitUntil: "domcontentloaded" });
    const r = await page.evaluate(() => ({
      zeroCounters: [...document.querySelectorAll(".counter")].filter((x) => /^\D*0\D*$/.test(x.textContent.trim())).length,
      regions: document.querySelectorAll("#world .regioncard").length,
    }));
    if (r.zeroCounters) bad.push(`${c}: ${r.zeroCounters} counter(s) read 0`);
    if (r.regions && r.regions !== 16) bad.push(`${c}: ${r.regions} region cards (want 16)`);
  }
  check("no-JS · counters carry real values; region panels complete", bad.length === 0, bad.join("; "));
  await ctx.close();
}
{
  // JS: every chapter builds its true-scale strip and its atlas map resolves the shared basemap
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bad = [];
  let basemapFailed = false;
  page.on("requestfailed", (r) => { if (r.url().includes("world.svg")) basemapFailed = true; });
  for (const c of CHAPTERS) {
    await page.goto(`${B}/tour/${c}.html`, { waitUntil: "networkidle" });
    const r = await page.evaluate(() => ({
      chrono: !!document.querySelector(".chrono svg circle"),
      atlas: document.querySelectorAll("#scene-atlas use").length,
    }));
    if (!r.chrono) bad.push(`${c}: no chrono strip`);
    if (!r.atlas) bad.push(`${c}: no atlas map`);
  }
  check("js · chrono strips + atlas maps in every chapter", bad.length === 0 && !basemapFailed,
        bad.join("; ") + (basemapFailed ? " world.svg failed to load" : ""));
  await page.close();
}
{
  // OS-light visitor: the theme toggle's first click must change something
  const ctx = await browser.newContext({ colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto(B + "/reference/sources.html", { waitUntil: "networkidle" });
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.click("[data-theme-toggle]");
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("theme · first click works for OS-light visitors", before !== after, `${before} → ${after}`);
  await ctx.close();
}

await browser.close();
console.log(`\n${ok ? "ALL QA CHECKS PASS" : "SOME QA CHECKS FAILED"}`);
process.exit(ok ? 0 : 1);
