/**
 * Render check for every page on the site.
 *
 * Asserts, per page: HTTP 200 · no page/console errors · every <pre class="mermaid">
 * actually produced an <svg> · an <h1> exists · (chapters) the 9-node rail built.
 *
 * Mermaid renders lazily on scroll, so each page is scrolled top-to-bottom first.
 *
 * Requires a local server AND an optional Playwright install — see scripts/README.md.
 *   python3 -m http.server 8000 --directory docs
 *   node scripts/verify/all.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || process.env.BASE || "http://localhost:8000";

const PAGES = [
  "/index.html", "/404.html",
  "/tour/01-deep-prehistory.html", "/tour/02-paleolithic.html", "/tour/03-neolithic.html",
  "/tour/04-first-civilizations.html", "/tour/05-classical-antiquity.html", "/tour/06-medieval.html",
  "/tour/07-early-modern.html", "/tour/08-industrial.html", "/tour/09-information-age.html",
  "/reference/master-timeline.html", "/reference/tech-tree.html", "/reference/great-acceleration.html",
  "/reference/civilizations.html", "/reference/further-reading.html", "/reference/sources.html",
  "/reference/human-family.html", "/reference/how-we-know.html",
];

const browser = await chromium.launch();
let allOk = true;
let totalDiagrams = 0;

for (const p of PAGES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on("pageerror", (e) => errs.push("JS " + String(e).slice(0, 100)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("CON " + m.text().slice(0, 100)); });
  page.on("requestfailed", (r) => {
    const u = r.url();
    // 404.html deliberately points at the production host; ignore those.
    if (!u.includes("favicon") && !u.includes("sonoransun.github.io")) errs.push("REQ " + u.slice(0, 80));
  });

  try {
    const resp = await page.goto(BASE + p, { waitUntil: "networkidle", timeout: 45000 });
    const status = resp.status();

    const H = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y <= H; y += 700) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1200); // let the serial Mermaid queue drain

    const info = await page.evaluate(() => {
      const pres = [...document.querySelectorAll("pre.mermaid")];
      return {
        mmTotal: pres.length,
        mmOk: pres.filter((x) => x.querySelector("svg")).length,
        railNodes: document.querySelectorAll(".rail__node").length,
        tables: document.querySelectorAll("table.data").length,
        h1: !!document.querySelector("h1"),
      };
    });

    totalDiagrams += info.mmOk;
    const isChapter = p.startsWith("/tour/");
    const ok = status === 200 && errs.length === 0 && info.mmOk === info.mmTotal && info.h1 &&
               (!isChapter || info.railNodes === 9);
    if (!ok) allOk = false;

    console.log(
      `${ok ? "PASS" : "FAIL"}  ${p}  [${status}] diagrams ${info.mmOk}/${info.mmTotal}` +
      ` · rail ${info.railNodes} · tables ${info.tables}` +
      (errs.length ? `\n        ${errs.slice(0, 3).join("\n        ")}` : "")
    );
  } catch (e) {
    allOk = false;
    console.log(`FAIL  ${p}  EXCEPTION ${String(e).slice(0, 120)}`);
  }
  await page.close();
}

await browser.close();
console.log(`\n${totalDiagrams} diagrams rendered. ${allOk ? "ALL PAGES PASS" : "SOME PAGES FAILED"}`);
process.exit(allOk ? 0 : 1);
