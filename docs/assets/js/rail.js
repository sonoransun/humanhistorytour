/* ============================================================================
   rail.js — persistent global timeline rail (desktop) + mobile bar & sheet
   ----------------------------------------------------------------------------
   Two scales side by side: a PAGE-SHARE track (equal weight per chapter, the
   honest "you are here in the tour") and a TRUE-TIME sliver (real chronological
   proportion, where deep prehistory dwarfs everything). Reads the shared scroll
   store from scrolly.js so rail and content never disagree.
   ========================================================================== */

import { subscribe } from "./scrolly.js";

const ICONS = {
  footprints: "M7 4c-1 1-1 3 0 4s1 2 0 3M11 3c-1 1-1 3 0 4M16 7c1 1 1 3 0 4s-1 2 0 3M13 8c1 1 1 3 0 4",
  hand: "M8 13V7a1.4 1.4 0 0 1 2.8 0V6a1.4 1.4 0 0 1 2.8 0v1a1.4 1.4 0 0 1 2.8 0v4c0 3-2 6-5 6s-5-2-5.4-4L4.6 12a1.3 1.3 0 0 1 2.2-1.3z",
  wheat: "M12 21V8M12 8c0-2 2-3 2-3M12 8c0-2-2-3-2-3M12 12c0-2 2-3 2-3M12 12c0-2-2-3-2-3M12 16c0-2 2-3 2-3M12 16c0-2-2-3-2-3",
  ziggurat: "M4 20h16M6 20v-4h12v4M8 16v-4h8v4M10 12V8h4v4M11 8V5h2v3",
  column: "M6 20h12M7 20l1-10M17 20l-1-10M8 10h8M7 8h10l-1-3H8z",
  spice: "M12 3c3 3 4 6 4 9a4 4 0 0 1-8 0c0-3 1-6 4-9zM12 12v9",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15 9l-4 1.5L9 15l4-1.5z",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5 19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5 19 5",
  chip: "M8 8h8v8H8zM10 4v2M14 4v2M10 18v2M14 18v2M4 10h2M4 14h2M18 10h2M18 14h2",
};

/* Year readout formatting.
   NOTE: the `yearsAgo >= 12000` test intentionally OVERRIDES `mode`, so a
   chapter declared "era" still reads in kya until it crosses 10,000 BCE. That
   makes Chapter 3's notation flip mid-chapter (~23.5% scroll) rather than at the
   II→III boundary. Known behaviour — see ARCHITECTURE.md "Edge-case register".
   There is no year zero: calendar 0 is rendered as 1 BCE. */
function formatYear(y, mode) {
  const yearsAgo = 2000 - y;
  if (mode === "ago" || yearsAgo >= 12000) {
    if (yearsAgo >= 1e6) return (yearsAgo / 1e6).toFixed(2) + " Mya";
    if (yearsAgo >= 1e4) return Math.round(yearsAgo / 1000).toLocaleString() + " kya";
    return Math.round(yearsAgo).toLocaleString() + " yrs ago";
  }
  if (y < 1) {
    const bce = Math.abs(Math.round(y)) || 1; // no year zero
    return bce.toLocaleString() + " BCE";
  }
  return Math.round(y).toLocaleString() + " CE";
}

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function iconSvg(key) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[key] || ICONS.column}"/></svg>`;
}

export async function initRail(chaptersUrl) {
  const host = document.querySelector("[data-rail]");
  const mrail = document.querySelector(".mrail");
  const mchip = document.querySelector(".mchip");
  if (!host && !mrail) return;

  let chapters;
  try {
    const res = await fetch(chaptersUrl, { cache: "force-cache" });
    chapters = (await res.json()).chapters;
  } catch (e) {
    return; // enhancement only; static nav remains usable
  }

  const root = document.documentElement.getAttribute("data-tour-root") || "";
  const currentIndex = Number(document.body.dataset.chapter || 0) - 1; // 0-based; -1 if not a chapter
  const total = chapters.length;
  const totalDur = chapters.reduce((s, c) => s + c.durationYears, 0);

  // ---- Desktop rail ------------------------------------------------------
  let yearEl, fillEl, nowEl;
  if (host) {
    const year = el("div", "rail__year mono", "&nbsp;");
    year.setAttribute("aria-hidden", "true");
    const body = el("div", "rail__body");
    const track = el("div", "rail__track");
    const fill = el("div", "rail__fill");
    track.appendChild(fill);
    const trueBar = el("div", "rail__true");
    chapters.forEach((c) => {
      const seg = el("div", "rail__true-seg");
      seg.style.background = `color-mix(in oklab, ${c.accent} 55%, transparent)`;
      trueBar.appendChild(seg);
    });
    const trueNow = el("div", "rail__true-now");
    trueBar.appendChild(trueNow);

    const nodes = el("nav", "rail__nodes");
    nodes.setAttribute("aria-label", "Tour timeline");
    chapters.forEach((c, i) => {
      const a = el("a", "rail__node");
      a.href = root + c.href;
      a.innerHTML = iconSvg(c.icon) + `<span class="rail__tip">${c.roman}. ${c.short} · ${c.span}</span>`;
      a.setAttribute("aria-label", `Chapter ${c.n}: ${c.title}, ${c.span}`);
      if (i === currentIndex) a.setAttribute("aria-current", "true");
      a.style.top = ((i + 0.5) / total) * 100 + "%";
      nodes.appendChild(a);
    });

    body.append(track, trueBar, nodes);
    host.append(year, body);
    yearEl = year; fillEl = fill; nowEl = trueNow;

    // size true-time segments by real proportion (min visibility floor)
    // (the floor only affects drawing; the "now" marker uses exact proportions)
    const segs = [...trueBar.querySelectorAll(".rail__true-seg")];
    let acc = 0;
    chapters.forEach((c, i) => {
      const h = Math.max(1.2, (c.durationYears / totalDur) * 100);
      segs[i].style.top = acc + "%";
      segs[i].style.height = h + "%";
      acc += (c.durationYears / totalDur) * 100;
    });
  }

  // ---- Mobile sheet ------------------------------------------------------
  const sheet = document.querySelector("#tour-sheet");
  if (sheet && mchip) {
    const ol = sheet.querySelector("ol");
    if (ol && !ol.children.length) {
      chapters.forEach((c, i) => {
        const li = el("li");
        li.innerHTML = `<a href="${root + c.href}"${i === currentIndex ? ' aria-current="true"' : ""}><span>${c.n}. ${c.short}</span><span class="sp">${c.span}</span></a>`;
        ol.appendChild(li);
      });
    }
    mchip.addEventListener("click", () => sheet.showModal());
    sheet.addEventListener("click", (e) => { if (e.target === sheet) sheet.close(); });
  }

  // ---- Live update from the shared scroll store --------------------------
  const cur = chapters[currentIndex];
  const y0 = cur ? cur.y0 : 0, y1 = cur ? cur.y1 : 0;
  const mode = cur ? cur.mode : "era";
  const totalTrue = chapters.reduce((s, c) => s + c.durationYears, 0);
  const trueBefore = chapters.slice(0, Math.max(0, currentIndex)).reduce((s, c) => s + c.durationYears, 0);
  const mfill = mrail ? mrail.querySelector(".mrail__fill") : null;
  const mchipYear = mchip ? mchip.querySelector("[data-year]") : null;
  let lastYearStr = "";

  // slide the rail in shortly after load
  if (host) requestAnimationFrame(() => host.classList.add("is-in"));

  subscribe(({ progress }) => {
    // page-share fill: earlier chapters full, current chapter proportional
    if (fillEl && currentIndex >= 0) {
      const global = (currentIndex + progress) / total;
      fillEl.style.height = (global * 100).toFixed(2) + "%";
      // true-time marker: where this scroll position sits in REAL time — the whole
      // point of the second bar is that it disagrees with the fill beside it.
      if (nowEl && cur) nowEl.style.top = (((trueBefore + progress * cur.durationYears) / totalTrue) * 100).toFixed(3) + "%";
    }
    if (mfill) mfill.style.width = (progress * 100).toFixed(1) + "%";

    // year readout interpolated within the current chapter
    if (cur) {
      const y = y0 + (y1 - y0) * progress;
      const str = formatYear(y, mode);
      if (str !== lastYearStr) {
        lastYearStr = str;
        if (yearEl) yearEl.textContent = str.replace(" ", "\n"); // number over unit: "2,806 BCE" is wider than the rail
        if (mchipYear) mchipYear.textContent = str;
      }
    }
  });
}
