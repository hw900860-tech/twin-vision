#!/usr/bin/env node
/**
 * AERIS-TWIN — SIH Idea Submission deck generator.
 *
 * Renders a 6-page landscape A4 PDF with zero dependencies (no Chrome, no LaTeX,
 * no PDF library): we emit the PDF object graph, xref table and content streams
 * by hand and draw every diagram with vector primitives.
 *
 *   node scripts/generate-sih-deck-pdf.mjs
 *
 * Output: public/sih-idea-submission.pdf  (served at /sih-idea-submission.pdf)
 */

import fs from "node:fs";
import path from "node:path";

const PAGE_W = 842; // A4 landscape, points
const PAGE_H = 595;
const M = 40; // page margin
const CW = PAGE_W - M * 2; // content width = 762

/* ------------------------------------------------------------------ palette */

const hex = (h) => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

const C = {
  bg: hex("#0E1219"),
  panel: hex("#161D27"),
  panel2: hex("#1C2531"),
  panelHi: hex("#22303F"),
  line: hex("#2B3644"),
  text: hex("#E7EEF6"),
  dim: hex("#9AA8B8"),
  muted: hex("#6E7C8C"),
  cyan: hex("#79D6E8"),
  cyanDeep: hex("#1E4A57"),
  amber: hex("#E3A94F"),
  amberDeep: hex("#4A3A1C"),
  red: hex("#E4594C"),
  redDeep: hex("#4C2320"),
  green: hex("#5FD29E"),
  greenDeep: hex("#1D4436"),
  white: hex("#FFFFFF"),
};

/* ------------------------------------------------------- text metrics + utf8 */

const NARROW = "iljtfr.,:;'\"!|()[]{}/\\ -";
const WIDE = "mwMW";

function charW(ch, bold) {
  if (ch === " ") return 0.278;
  if (WIDE.includes(ch)) return bold ? 0.9 : 0.84;
  if (NARROW.includes(ch)) return bold ? 0.33 : 0.3;
  const c = ch.charCodeAt(0);
  if (c >= 48 && c <= 57) return 0.556; // digits
  if (c >= 65 && c <= 90) return bold ? 0.75 : 0.7; // uppercase
  if (c >= 97 && c <= 122) return bold ? 0.57 : 0.53; // lowercase
  return 0.6;
}

/** Conservative Helvetica width estimate (slightly over-measures: safe for wrapping). */
function textWidth(str, size, bold = false) {
  let w = 0;
  for (const ch of str) w += charW(ch, bold);
  return w * size * 1.015;
}

/** Map anything outside WinAnsi to a printable ASCII/bullet equivalent. */
function san(s) {
  return String(s)
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/\u2191/g, "^")
    .replace(/\u2193/g, "v")
    .replace(/\u20b9/g, "INR ")
    .replace(/\u2265/g, ">=")
    .replace(/\u2264/g, "<=")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2022/g, "\x95")
    .replace(/\u00b0/g, "\xB0")
    .replace(/\u00b7/g, "\xB7")
    .replace(/[^\x00-\xFF]/g, "?");
}

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function wrap(str, maxW, size, bold = false) {
  const words = san(str).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (textWidth(test, size, bold) > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ------------------------------------------------------------ pdf page model */

const Y = (topY) => PAGE_H - topY; // top-left -> pdf (bottom-left) coordinate
const n = (v) => (Math.round(v * 1000) / 1000).toString();
const col = (c) => (c ? `${n(c[0])} ${n(c[1])} ${n(c[2])}` : "0 0 0");

const BULLET = "\x95";
const DEG = "\xB0";

class Page {
  constructor() {
    this.ops = [];
    this.maxTextRight = 0;
  }

  _fill(c) {
    if (c) this.ops.push(`${col(c)} rg`);
  }
  _stroke(c, lw) {
    if (c) this.ops.push(`${col(c)} RG`);
    if (lw) this.ops.push(`${n(lw)} w`);
  }
  _dash(d) {
    this.ops.push(d ? `[${d[0]} ${d[1]}] 0 d` : "[] 0 d");
  }

  rect(x, y, w, h, o = {}) {
    const yy = Y(y + h);
    if (o.r) {
      const r = Math.min(o.r, w / 2, h / 2);
      const k = 0.5523 * r;
      const x0 = x, x1 = x + w, y0 = yy, y1 = yy + h;
      this.ops.push(
        [
          `${n(x0 + r)} ${n(y0)} m`,
          `${n(x1 - r)} ${n(y0)} l`,
          `${n(x1 - r + k)} ${n(y0)} ${n(x1)} ${n(y0 + r - k)} ${n(x1)} ${n(y0 + r)} c`,
          `${n(x1)} ${n(y1 - r)} l`,
          `${n(x1)} ${n(y1 - r + k)} ${n(x1 - r + k)} ${n(y1)} ${n(x1 - r)} ${n(y1)} c`,
          `${n(x0 + r)} ${n(y1)} l`,
          `${n(x0 + r - k)} ${n(y1)} ${n(x0)} ${n(y1 - r + k)} ${n(x0)} ${n(y1 - r)} c`,
          `${n(x0)} ${n(y0 + r)} l`,
          `${n(x0)} ${n(y0 + r - k)} ${n(x0 + r - k)} ${n(y0)} ${n(x0 + r)} ${n(y0)} c`,
          "h",
        ].join("\n")
      );
    } else {
      this.ops.push(`${n(x)} ${n(yy)} ${n(w)} ${n(h)} re`);
    }
    if (o.fill && o.stroke) {
      this._fill(o.fill);
      this._stroke(o.stroke, o.lw || 0.7);
      this.ops.push("B");
    } else if (o.fill) {
      this._fill(o.fill);
      this.ops.push("f");
    } else {
      this._stroke(o.stroke || C.line, o.lw || 0.7);
      this.ops.push("S");
    }
  }

  line(x1, y1, x2, y2, o = {}) {
    this._stroke(o.stroke || C.line, o.lw || 0.7);
    this._dash(o.dash);
    this.ops.push(`${n(x1)} ${n(Y(y1))} m ${n(x2)} ${n(Y(y2))} l S`);
    this._dash(null);
  }

  poly(pts, o = {}) {
    this._stroke(o.stroke || C.line, o.lw || 0.7);
    this._dash(o.dash);
    const d = pts.map((p, i) => `${n(p[0])} ${n(Y(p[1]))} ${i === 0 ? "m" : "l"}`).join(" ");
    this.ops.push(`${d} ${o.close ? "h " : ""}${o.fill ? "f" : "S"}`);
    if (o.fill) {
      this._fill(o.fill);
      this.ops.push(`${d} h f`);
    }
    this._dash(null);
  }

  /** Draw text. y is the TOP of the text box, matching how you'd read the layout. */
  text(x, yTop, str, o = {}) {
    const size = o.size || 10;
    const s = san(str);
    const bold = !!o.bold;
    const font = o.italic ? "/F3" : bold ? "/F2" : "/F1";
    let tx = x;
    if (o.align === "center") tx = x - textWidth(s, size, bold) / 2;
    if (o.align === "right") tx = x - textWidth(s, size, bold);
    const baseline = Y(yTop + size * 0.8);
    this._fill(o.color || C.text);
    this.ops.push(
      `BT ${font} ${n(size)} Tf ${o.track ? n(o.track) + " Tc" : "0 Tc"} ` +
        `1 0 0 1 ${n(tx)} ${n(baseline)} Tm (${esc(s)}) Tj ET`
    );
    this.maxTextRight = Math.max(this.maxTextRight, tx + textWidth(s, size, bold));
  }

  /** Word-wrapped paragraph. Returns the y below the last line. */
  para(x, yTop, w, str, o = {}) {
    const size = o.size || 9.5;
    const lh = o.lh || size * 1.42;
    const lines = wrap(str, w, size, !!o.bold);
    lines.forEach((ln, i) => this.text(x, yTop + i * lh, ln, o));
    return yTop + lines.length * lh;
  }

  /** Bulleted list. Returns the y below the last bullet. */
  bullets(x, yTop, w, items, o = {}) {
    const size = o.size || 9.5;
    const lh = o.lh || size * 1.4;
    const gap = o.gap == null ? 6 : o.gap;
    let y = yTop;
    for (const it of items) {
      const lines = wrap(it, w - 12, size, false);
      this.text(x, y, BULLET, { size, color: o.dot || C.cyan });
      lines.forEach((ln, i) => this.text(x + 12, y + i * lh, ln, { size, color: o.color || C.dim }));
      y += lines.length * lh + gap;
    }
    return y - gap;
  }

  /** Small label + wrapped body, used for chips and info cards. */
  chip(x, y, w, h, label, body, accent) {
    this.rect(x, y, w, h, { fill: C.panel, stroke: C.line, lw: 0.6, r: 4 });
    this.rect(x, y, 3, h, { fill: accent, r: 1.5 });
    this.text(x + 12, y + 11, label, { size: 8.4, bold: true, color: accent, track: 0.4 });
    this.para(x + 12, y + 24, w - 22, body, { size: 8.1, color: C.dim, lh: 10.4 });
  }

  stream() {
    return this.ops.join("\n");
  }
}

class Doc {
  constructor() {
    this.pages = [];
  }
  addPage() {
    const p = new Page();
    this.pages.push(p);
    return p;
  }
  build() {
    const objs = [];
    const add = (body) => (objs.push(body), objs.length);

    const fR = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const fB = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const fI = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>");

    const pagesId = add("__PAGES__");
    const kids = this.pages.map((p) => {
      const content = p.stream();
      const cId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      return add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
          `/Resources << /Font << /F1 ${fR} 0 R /F2 ${fB} 0 R /F3 ${fI} 0 R >> >> ` +
          `/Contents ${cId} 0 R >>`
      );
    });
    objs[pagesId - 1] =
      `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;

    const infoId = add(
      "<< /Title (AERIS-TWIN - SIH Idea Submission) /Author (Team [Team Name]) /Subject (6-slide SIH idea submission deck) /Creator (AERIS-TWIN deck generator) >>"
    );
    const catId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

    let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets = [];
    objs.forEach((body, i) => {
      offsets[i] = out.length;
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catId} 0 R /Info ${infoId} 0 R >>\n`;
    out += `startxref\n${xref}\n%%EOF\n`;
    return { data: Buffer.from(out, "latin1"), objects: objs.length, xref };
  }
}

/* ------------------------------------------------------------ slide chrome */

function chrome(p, num, title, kicker) {
  p.rect(0, 0, PAGE_W, PAGE_H, { fill: C.bg });
  p.text(M, 20, "AERIS-TWIN", { size: 12.5, bold: true, color: C.cyan, track: 1.1 });
  p.text(PAGE_W - M, 22, `SIH IDEA SUBMISSION  |  ${String(num).padStart(2, "0")} / 06`, {
    size: 8,
    color: C.muted,
    align: "right",
    track: 0.8,
  });
  p.line(M, 40, PAGE_W - M, 40, { stroke: C.line, lw: 0.6 });
  if (title) {
    p.text(M, 56, kicker, { size: 8, bold: true, color: C.cyan, track: 1.2 });
    p.text(M, 70, title, { size: 19, bold: true, color: C.white });
    p.line(M, 98, M + 46, 98, { stroke: C.cyan, lw: 2 });
  }
  p.line(M, PAGE_H - 30, PAGE_W - M, PAGE_H - 30, { stroke: C.line, lw: 0.6 });
  p.text(M, PAGE_H - 24, "Team [Team Name]  |  PS ID [PS ID]", { size: 7.6, color: C.muted });
  p.text(PAGE_W - M, PAGE_H - 24, "[PS Title from SIH portal]", { size: 7.6, color: C.muted, align: "right" });
}

function panelTitle(p, x, y, num, label, accent = C.cyan) {
  p.text(x, y, num, { size: 8, bold: true, color: accent, track: 0.9 });
  p.text(x + 18, y, label, { size: 8, bold: true, color: C.text, track: 0.9 });
  p.line(x, y + 12, x + 300, y + 12, { stroke: C.line, lw: 0.5 });
}

/** Horizontal arrow head at (x2,y2) pointing right. */
function arrow(p, x1, y1, x2, y2, color = C.muted, dash = null, lw = 0.9) {
  p.line(x1, y1, x2 - 5, y2, { stroke: color, lw, dash });
  p.poly(
    [
      [x2, y2],
      [x2 - 6, y2 - 3.4],
      [x2 - 6, y2 + 3.4],
    ],
    { stroke: color, lw: 0.9, fill: true, close: true }
  );
}

function tick(p, x, y, color = C.green, s = 1) {
  p.poly(
    [
      [x, y + 4 * s],
      [x + 3.2 * s, y + 7.4 * s],
      [x + 9 * s, y],
    ],
    { stroke: color, lw: 1.7 * s }
  );
}

/* ----------------------------------------------------------------- slide 1 */

function slide1(p) {
  chrome(p, 1, null, null);

  p.text(M, 74, "AERIS-TWIN", { size: 42, bold: true, color: C.white });
  p.text(M, 128, "AI-Enabled Digital Engine Intelligence System for MALE UAVs", {
    size: 12.5,
    color: C.dim,
  });

  // tagline
  p.rect(M, 158, 452, 56, { fill: C.cyanDeep, stroke: C.cyan, lw: 0.8, r: 5 });
  p.rect(M, 158, 3.5, 56, { fill: C.cyan, r: 1.75 });
  p.para(M + 16, 170, 420, '"The engine tells you it is about to fail - six hours before it does."', {
    size: 13.5,
    bold: true,
    color: C.white,
    lh: 17,
  });
  p.para(M + 16, 192, 420, "A real-time digital twin that converts raw engine telemetry into a failure prediction, a remaining-useful-life countdown, and a specific action for the ground crew.", {
    size: 8.4,
    color: C.dim,
    lh: 10.6,
  });

  // metadata
  const rows = [
    ["TEAM NAME", "[Team Name]"],
    ["PROBLEM STATEMENT ID", "[PS ID]"],
    ["PROBLEM STATEMENT TITLE", "[PS Title]"],
    ["SOLUTION NAME", "AERIS-TWIN - Digital Engine Intelligence System"],
  ];
  let y = 240;
  for (const [k, v] of rows) {
    p.text(M, y, k, { size: 7.6, bold: true, color: C.muted, track: 0.7 });
    p.para(M, y + 11, 452, v, { size: 10.4, color: C.text, lh: 12.5 });
    p.line(M, y + 30, M + 452, y + 30, { stroke: C.line, lw: 0.5 });
    y += 40;
  }

  /* engine schematic (right) */
  const ex = 512, ew = 290;
  p.rect(ex, 74, ew, 356, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  p.text(ex + 14, 88, "ROTAX 914  |  FLAT-4  |  115 HP", { size: 8, bold: true, color: C.cyan, track: 0.7 });

  // crankshaft
  p.line(ex + 30, 236, ex + ew - 30, 236, { stroke: C.muted, lw: 3.2 });
  const cyls = [
    { x: ex + 36, y: 150, t: "CYL 1", cht: "154" + DEG + "C", c: C.cyan, fill: C.cyanDeep },
    { x: ex + 156, y: 150, t: "CYL 2", cht: "231" + DEG + "C", c: C.red, fill: C.redDeep },
    { x: ex + 36, y: 252, t: "CYL 3", cht: "151" + DEG + "C", c: C.cyan, fill: C.cyanDeep },
    { x: ex + 156, y: 252, t: "CYL 4", cht: "157" + DEG + "C", c: C.amber, fill: C.amberDeep },
  ];
  for (const cyl of cyls) {
    p.rect(cyl.x, cyl.y, 98, 58, { fill: cyl.fill, stroke: cyl.c, lw: 1.2, r: 4 });
    p.text(cyl.x + 49, cyl.y + 12, cyl.t, { size: 8, bold: true, color: cyl.c, align: "center", track: 0.6 });
    p.text(cyl.x + 49, cyl.y + 26, cyl.cht, { size: 13, bold: true, color: C.white, align: "center" });
    p.text(cyl.x + 49, cyl.y + 43, "CHT", { size: 6.6, color: C.muted, align: "center", track: 0.5 });
  }
  // turbo label
  p.text(ex + ew / 2, 218, "TURBOCHARGER - FULL BOOST", { size: 6.8, color: C.muted, align: "center", track: 0.5 });

  // twin readouts
  p.rect(ex + 20, 330, ew - 40, 84, { fill: C.panel2, stroke: C.line, lw: 0.6, r: 4 });
  p.text(ex + 32, 342, "DIGITAL TWIN - LIVE STATE", { size: 7.4, bold: true, color: C.cyan, track: 0.7 });
  const readouts = [
    ["HEALTH INDEX", "71%", C.amber],
    ["RUL REMAINING", "412 h", C.red],
    ["ANOMALY SCORE", "0.62", C.cyan],
  ];
  readouts.forEach(([k, v, c], i) => {
    const rx = ex + 32 + i * 82;
    p.text(rx, 358, k, { size: 6.4, color: C.muted, track: 0.4 });
    p.text(rx, 370, v, { size: 14, bold: true, color: c });
  });
  p.line(ex + 32, 392, ex + ew - 32, 392, { stroke: C.line, lw: 0.5 });
  p.para(ex + 32, 397, ew - 68, "ALERT: CYL 2 OVERHEAT - cooling duct restriction, CHT +74" + DEG + "C above baseline.", {
    size: 7.4,
    color: C.red,
    lh: 9.4,
  });

  // data ribbon crankshaft -> twin
  arrow(p, ex + 145, 300, ex + 145, 326, C.cyan, [3, 3], 1.2);

  // KPI chips
  const chips = [
    ["20 Hz", "coupled physics twin"],
    ["112 B / frame", "20 Hz binary telemetry ~18 kbps"],
    ["20-40 ms", "measured LOS one-way latency"],
    ["220-520 ms", "SATCOM - measured, never hidden"],
  ];
  const cw = (CW - 3 * 12) / 4;
  chips.forEach(([k, v], i) => {
    const x = M + i * (cw + 12);
    p.rect(x, 462, cw, 52, { fill: C.panel, stroke: C.line, lw: 0.6, r: 4 });
    p.text(x + 12, 472, k, { size: 15, bold: true, color: C.cyan });
    p.para(x + 12, 492, cw - 22, v, { size: 7.6, color: C.dim, lh: 9.6 });
  });
}

/* ----------------------------------------------------------------- slide 2 */

function slide2(p) {
  chrome(p, 2, "Problem Understanding & Proposed Solution", "PROBLEM  |  SOLUTION  |  NOVELTY");

  /* left: problem */
  const lx = M, lw = 356;
  p.rect(lx, 116, lw, 268, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  panelTitle(p, lx + 16, 130, "01", "THE PROBLEM", C.red);

  p.bullets(
    lx + 16,
    156,
    lw - 32,
    [
      "TAPAS BH-201: 8 years and INR 1,786 crore spent, project closed January 2024.",
      "Sensors worked. The intelligence layer did not exist - 10+ channels logged, never interpreted.",
      "Fixed 1,200 h overhaul interval: too early (wasted cost) or too late (catastrophic).",
      "Failure is never sudden. Rising CHT, drifting EGT and vibration always precede it - warning time today is zero.",
    ],
    { size: 9, lh: 12.2, gap: 8, color: C.text, dot: C.red }
  );

  // mini forecast chart: vibration rising past threshold
  const cx = lx + 16, cy = 292, cwid = lw - 32, chg = 76;
  p.rect(cx, cy, cwid, chg, { fill: C.bg, stroke: C.line, lw: 0.5, r: 3 });
  p.text(cx + 6, cy + 6, "VIBRATION RMS - FFT ISOLATES 140 Hz BPFO", { size: 6.4, color: C.muted, track: 0.4 });
  p.line(cx + 6, cy + 26, cx + cwid - 6, cy + 26, { stroke: C.red, lw: 0.7, dash: [3, 2] });
  p.text(cx + cwid - 8, cy + 20, "FAILURE THRESHOLD", { size: 5.6, color: C.red, align: "right" });
  const pts = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    const val = 0.28 + Math.pow(t, 2.1) * 0.62 + (i > 14 ? (i - 14) * 0.012 : 0);
    pts.push([cx + 8 + t * (cwid - 60), cy + 62 - val * 40]);
  }
  p.poly(pts, { stroke: C.amber, lw: 1.5 });
  p.line(pts[11][0], pts[11][1], pts[22][0], pts[22][1], { stroke: C.red, lw: 1.1, dash: [3, 2] });
  p.text(cx + cwid - 52, cy + 58, "PREDICTED", { size: 5.8, color: C.red, track: 0.3 });
  p.text(cx + cwid - 52, cy + 66, "TIME TO FAILURE", { size: 5.8, color: C.red, track: 0.3 });

  /* right: solution */
  const rx = lx + lw + 14, rw = CW - lw - 14;
  p.rect(rx, 116, rw, 268, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  panelTitle(p, rx + 16, 130, "02", "OUR SOLUTION");

  const sol = [
    ["Real-time digital twin", "20 Hz coupled physics model of the Rotax 914 across 10 live channels."],
    ["Multi-parameter anomaly detection", "Isolation Forest over all channels + FFT isolation of the 140 Hz bearing (BPFO) signature - not single-threshold alarms."],
    ["Weibull RUL + explainable diagnostics", "Hours-to-failure countdown; every alert names its contributing factors and confidence."],
    ["JARVIS conversational copilot", "The operator asks anything and gets an answer grounded in the live aircraft snapshot."],
  ];
  let y = 158;
  sol.forEach(([t, d], i) => {
    p.rect(rx + 16, y, 14, 14, { fill: C.cyanDeep, stroke: C.cyan, lw: 0.6, r: 3 });
    p.text(rx + 23, y + 2, String(i + 1), { size: 8, bold: true, color: C.cyan, align: "center" });
    p.text(rx + 38, y + 1, t, { size: 9.6, bold: true, color: C.white });
    const ny = p.para(rx + 38, y + 16, rw - 60, d, { size: 8.2, color: C.dim, lh: 10.2 });
    y = ny + 8;
  });
  // output chain
  p.rect(rx + 16, 348, rw - 32, 24, { fill: C.panel2, stroke: C.line, lw: 0.5, r: 3 });
  p.text(rx + 24, 355, "200 readings/sec  ->  1 health index  +  1 actionable advisory", {
    size: 8.4,
    bold: true,
    color: C.green,
  });

  /* bottom: novelty */
  p.text(M, 400, "03", { size: 8, bold: true, color: C.amber, track: 0.9 });
  p.text(M + 18, 400, "NOVELTY - WHY THIS IS NOT ANOTHER DASHBOARD", {
    size: 8,
    bold: true,
    color: C.text,
    track: 0.9,
  });
  p.line(M, 412, PAGE_W - M, 412, { stroke: C.line, lw: 0.5 });

  const nov = [
    ["PREDICTIVE, NOT REACTIVE", "Computes the future state and time-to-failure, not just the present value."],
    ["EXPLAINABLE BY DESIGN", "Confidence and contributing factors on every alert - built to defeat false-alarm distrust."],
    ["CAN-NATIVE FRONT END", "Consumes the exact 8-byte scaled frames a real FADEC emits. Simulation to hardware = one transport swap."],
    ["ENGINE-AGNOSTIC", "Parameterised frame map and model: Rotax today, any piston or turboprop tomorrow."],
  ];
  const nw = (CW - 3 * 12) / 4;
  nov.forEach(([k, v], i) => {
    const x = M + i * (nw + 12);
    p.rect(x, 422, nw, 108, { fill: C.panel, stroke: C.line, lw: 0.6, r: 4 });
    p.rect(x, 422, nw, 2.5, { fill: C.amber, r: 1.25 });
    p.para(x + 11, 434, nw - 22, k, { size: 8.2, bold: true, color: C.amber, lh: 10 });
    p.para(x + 11, 454, nw - 22, v, { size: 8, color: C.dim, lh: 10.2 });
  });
}

/* ----------------------------------------------------------------- slide 3 */

function slide3(p) {
  chrome(p, 3, "Technical Architecture & Approach", "INPUT  ->  PROCESSING  ->  OUTPUT");

  /* architecture diagram */
  const dy = 116, dh = 152;
  p.rect(M, dy, CW, dh, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  p.text(M + 14, dy + 10, "END-TO-END DATA PATH - SENSOR TO OPERATOR", {
    size: 7.4,
    bold: true,
    color: C.cyan,
    track: 0.8,
  });

  const lanes = [
    ["ECU / FADEC", ["13 frames @ 50 Hz", "8-byte scaled ints", "11-bit IDs"], C.cyan],
    ["CAN BUS", ["0x0C0 - 0x0D2", "500 kbit/s", "~14% bus load"], C.cyan],
    ["AIRBORNE ENCODER", ["112 B frame @ 20 Hz", "CRC-16 per frame", "60 s ring buffer"], C.green],
    ["DATALINK", ["LOS 20-40 ms", "SATCOM 220-520 ms", "loss + jitter modelled"], C.amber],
    ["GCS RELAY", ["session hub", "binary recorder", "command ACK"], C.amber],
    ["TWIN + ML + RUL", ["Isolation Forest", "FFT 140 Hz BPFO", "Weibull RUL"], C.red],
  ];
  const bw = 104, gap = (CW - 34 - 6 * bw) / 5;
  const by = dy + 40, bh = 66;
  lanes.forEach(([t, lines, accent], i) => {
    const x = M + 17 + i * (bw + gap);
    p.rect(x, by, bw, bh, { fill: C.panel2, stroke: C.line, lw: 0.6, r: 4 });
    p.rect(x, by, bw, 2.5, { fill: accent, r: 1.25 });
    p.para(x + 7, by + 9, bw - 14, t, { size: 7.6, bold: true, color: C.white, lh: 9 });
    lines.forEach((l, li) => p.text(x + 7, by + 30 + li * 9.4, l, { size: 6.6, color: C.dim }));
    if (i < lanes.length - 1) {
      const ax = x + bw + gap;
      const dashed = i === 2; // the radio hop
      arrow(p, ax - gap + 2, by + bh / 2, ax - 2, by + bh / 2, dashed ? C.amber : C.muted, dashed ? [2.5, 2.5] : null, dashed ? 1.2 : 0.9);
      if (dashed) p.text((ax - gap + ax) / 2, by - 12, "RADIO", { size: 5.6, color: C.amber, align: "center" });
    }
  });

  // swap point callout
  const swapX = M + 17 + 2 * (bw + gap);
  p.rect(swapX - 6, by + bh + 8, bw + 12, 26, { fill: C.greenDeep, stroke: C.green, lw: 0.7, r: 3 });
  p.text(swapX + bw / 2, by + bh + 14, "SWAP POINT", { size: 6.6, bold: true, color: C.green, align: "center", track: 0.5 });
  p.text(swapX + bw / 2, by + bh + 23, "real hardware plugs in", { size: 6, color: C.dim, align: "center" });

  // output band
  p.rect(M + 17, dy + 116, CW - 34, 26, { fill: C.panelHi, stroke: C.line, lw: 0.6, r: 3 });
  p.text(M + 27, dy + 123, "OUTPUT", { size: 7, bold: true, color: C.cyan, track: 0.7 });
  p.text(M + 72, dy + 123, "GCS command center  |  exploded 3D engine with live per-cylinder CHT heat-map  |  advisory banner  |  JARVIS copilot  |  post-flight analytics", {
    size: 7.4,
    color: C.text,
  });

  /* data flow */
  const fy = 292;
  const flw = 366;
  p.rect(M, fy, flw, 258, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  panelTitle(p, M + 16, fy + 14, "01", "DATA FLOW: INPUT -> OUTPUT");
  const flow = [
    ["INPUT", "ECU/FADEC publishes CAN frames - 13 frames @ 50 Hz, 650 frames/s."],
    ["DECODE", "Quantisation-aware scaling to engineering units (0.25 rpm, 0.1" + DEG + "C, 1 ft per LSB)."],
    ["PROCESS", "Coupled physics engine at 20 Hz produces the telemetry snapshot."],
    ["INTELLIGENCE", "Anomaly scoring + FFT bearing isolation + Weibull RUL + weighted health index (0-100)."],
    ["TRANSPORT", "112-byte frame @ 20 Hz with CRC-16 over WebSocket; 60 s store-and-forward ring recovers lost frames in strict order."],
    ["OUTPUT", "Operator surfaces: alerts, RUL countdown, explainable diagnostics, replay, debrief."],
  ];
  let fy2 = fy + 40;
  flow.forEach(([k, v], i) => {
    p.rect(M + 16, fy2, 62, 13, { fill: C.panel2, stroke: C.line, lw: 0.5, r: 2.5 });
    p.text(M + 47, fy2 + 2.4, k, { size: 6.6, bold: true, color: C.cyan, align: "center", track: 0.3 });
    const ny = p.para(M + 86, fy2 + 1, flw - 104, v, { size: 8.2, color: C.dim, lh: 10.2 });
    fy2 = Math.max(ny, fy2 + 15) + 6.5;
    if (i < flow.length - 1) p.line(M + 47, fy2 - 6.5, M + 47, fy2 - 1.5, { stroke: C.line, lw: 0.5 });
  });

  /* stack */
  const sx = M + flw + 14, sw = CW - flw - 14;
  p.rect(sx, fy, sw, 258, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  panelTitle(p, sx + 16, fy + 14, "02", "TECH STACK BY LAYER");
  const stack = [
    ["AIRBORNE / EDGE", "TypeScript CAN encoder + decoder, fixed-layout binary codec, ECU telegram generator; socketcan transport for physical hardware."],
    ["GROUND GATEWAY", "Node.js WebSocket relay - a real network hop - plus a binary frame recorder that feeds the post-flight debrief."],
    ["OPERATOR UI", "React 19, TanStack Start/Router, TypeScript, Tailwind, Radix/shadcn, Zustand state, Three.js + React Three Fiber."],
    ["INTELLIGENCE", "Isolation Forest, Weibull reliability, FFT spectral analysis; optional Python model server with automatic physics-backed fallback; Gemini-powered copilot."],
    ["DATA / ACCESS", "Drizzle ORM + SQLite, role-based operator and admin auth, complete prediction audit trail."],
  ];
  let sy = fy + 40;
  for (const [k, v] of stack) {
    p.text(sx + 16, sy, k, { size: 7.4, bold: true, color: C.amber, track: 0.6 });
    const ny = p.para(sx + 16, sy + 11, sw - 32, v, { size: 8.1, color: C.dim, lh: 10 });
    sy = ny + 7;
  }
}

/* ----------------------------------------------------------------- slide 4 */

function slide4(p) {
  chrome(p, 4, "Feasibility & Viability", "36-HOUR GRAND FINALE  |  RESOURCES  |  SCALABILITY");

  /* gantt */
  const gx = M, gw = 462, gy = 116, gh = 300;
  p.rect(gx, gy, gw, gh, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  panelTitle(p, gx + 16, gy + 14, "01", "36-HOUR BUILD PLAN");

  const plotX = gx + 16, plotW = gw - 32, axisY = gy + 44;
  const hToX = (h) => plotX + (h / 36) * plotW;
  // gradient-ish hour bands + ticks
  for (let h = 0; h <= 36; h += 6) {
    p.line(hToX(h), axisY, hToX(h), axisY + 8 + 6 * 21, { stroke: C.line, lw: 0.4 });
    p.text(hToX(h), axisY - 11, "H" + h, { size: 6.2, color: C.muted, align: "center" });
  }
  const tasks = [
    ["CAN frame map + freeze wire format", 0, 4, C.cyan],
    ["ML training: Isolation Forest + RUL", 4, 10, C.cyan],
    ["Hardware bring-up: CAN adapter swap", 14, 10, C.green],
    ["False-alarm tuning + latency soak test", 24, 8, C.green],
    ["Demo rehearsal + pitch build", 32, 4, C.amber],
  ];
  tasks.forEach(([label, start, dur, accent], i) => {
    const rowY = axisY + 10 + i * 27;
    p.text(plotX, rowY - 8, label, { size: 7.4, color: C.text });
    const x = hToX(start), w = hToX(start + dur) - x;
    p.rect(x, rowY, w, 12, { fill: accent, r: 2.5 });
  });
  // already built ghost bar
  const gy2 = axisY + 10 + 5 * 27;
  p.text(plotX, gy2 - 8, "Already-built MVP (working baseline today)", { size: 7.4, bold: true, color: C.green });
  p.rect(plotX, gy2, plotW, 12, { fill: C.greenDeep, stroke: C.green, lw: 0.7, r: 2.5 });
  for (let h = 0; h <= 36; h += 6) p.line(hToX(h), gy2, hToX(h), gy2 + 12, { stroke: C.bg, lw: 0.6 });

  // demo-ready gate
  const gateX = hToX(32);
  p.line(gateX, axisY - 4, gateX, gy2 + 14, { stroke: C.red, lw: 1.4, dash: [4, 3] });
  p.text(gateX - 4, axisY - 11, "DEMO-READY", { size: 6.6, bold: true, color: C.red, align: "right", track: 0.4 });

  p.para(gx + 16, gy + gh - 42, gw - 32, "Team split: 2 frontend/3D  |  2 backend/datalink  |  1 ML  |  1 hardware + telemetry. The 36 hours harden a system that already runs - they do not build it from zero.", {
    size: 7.6,
    color: C.dim,
    lh: 9.6,
  });

  /* right column */
  const rx = gx + gw + 14, rw = CW - gw - 14;
  p.rect(rx, gy, rw, 140, { fill: C.greenDeep, stroke: C.green, lw: 0.8, r: 5 });
  p.text(rx + 16, gy + 14, "ALREADY BUILT - THE 36-HOUR PROOF", { size: 7.6, bold: true, color: C.green, track: 0.6 });
  p.bullets(
    rx + 16,
    gy + 34,
    rw - 32,
    [
      "Three live surfaces: landing, airborne sim, GCS command center.",
      "Two-window datalink over a real WebSocket hop, with latency, loss and CRC measured live.",
      "CAN ingestion layer, anomaly scoring, RUL countdown, mission replay, post-flight analytics.",
    ],
    { size: 8, lh: 10.4, gap: 5, color: C.text, dot: C.green }
  );

  p.rect(rx, gy + 152, rw, 148, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  panelTitle(p, rx + 16, gy + 166, "02", "RESOURCES");
  const res = [
    ["OPEN SOURCE", "React + Three.js, ws, Drizzle, scikit-learn (IsolationForest), SciPy (FFT), NumPy."],
    ["DATASETS", "NASA C-MAPSS turbofan degradation, Rotax 914 published performance data, standard-atmosphere tables."],
    ["HARDWARE", "USB-CAN adapter, Raspberry Pi-class edge node, engine test cell or a recorded ECU trace."],
    ["APIS", "Gemini for the copilot; optional weather and airspace feeds. No licensed component required to demo."],
  ];
  let ry = gy + 190;
  for (const [k, v] of res) {
    p.text(rx + 16, ry, k, { size: 7, bold: true, color: C.amber, track: 0.6 });
    const ny = p.para(rx + 16, ry + 10, rw - 32, v, { size: 7.8, color: C.dim, lh: 9.4 });
    ry = ny + 5;
  }

  /* scalability band */
  const sy = 432;
  p.text(M, sy, "03", { size: 8, bold: true, color: C.green, track: 0.9 });
  p.text(M + 18, sy, "SCALABILITY - 1 TO 1,000,000", { size: 8, bold: true, color: C.text, track: 0.9 });
  p.line(M, sy + 12, PAGE_W - M, sy + 12, { stroke: C.line, lw: 0.5 });
  const scale = [
    ["1 AIRFRAME", "Every byte already crosses a real socket; the twin is the same code path."],
    ["10 AIRFRAMES", "Relay state is per-session (60 s ring) - add a session, not a service."],
    ["1,000 AIRFRAMES", "Fixed 112 B/frame = ~1.6 GB per aircraft per flight-day. Shard sessions; storage is a rounding error."],
    ["1,000,000 USERS", "The analytics and debrief layer is a read-only API over recorded frames - horizontally trivial."],
    ["ZERO INFRASTRUCTURE", "Edge inference on board delivers alerts with no ground segment at all."],
  ];
  const sw2 = (CW - 4 * 10) / 5;
  scale.forEach(([k, v], i) => {
    const x = M + i * (sw2 + 10);
    p.rect(x, sy + 22, sw2, 88, { fill: C.panel, stroke: C.line, lw: 0.6, r: 4 });
    p.rect(x, sy + 22, 2.5, 88, { fill: C.green, r: 1.25 });
    p.para(x + 10, sy + 32, sw2 - 20, k, { size: 8, bold: true, color: C.green, lh: 9.6 });
    p.para(x + 10, sy + 50, sw2 - 20, v, { size: 7.6, color: C.dim, lh: 9.4 });
  });
}

/* ----------------------------------------------------------------- slide 5 */

function slide5(p) {
  chrome(p, 5, "Impact & Benefits", "USERS  |  QUANTIFIED OUTCOMES  |  EVIDENCE");

  /* bar chart */
  const bx = M, bwid = 372, by = 116, bhei = 292;
  p.rect(bx, by, bwid, bhei, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  panelTitle(p, bx + 16, by + 14, "01", "DETECTION LEAD TIME (HOURS)", C.green);

  const originY = by + 238, maxH = 168;
  p.line(bx + 16, originY, bx + bwid - 16, originY, { stroke: C.line, lw: 0.8 });
  p.line(bx + 16, by + 44, bx + 16, originY, { stroke: C.line, lw: 0.8 });
  for (let i = 1; i <= 4; i++) {
    const gy = originY - (maxH / 4) * i;
    p.line(bx + 16, gy, bx + bwid - 16, gy, { stroke: C.line, lw: 0.3, dash: [2, 3] });
  }
  const bars = [
    ["TRADITIONAL\nMONITORING", 0, C.muted, "0 h"],
    ["THRESHOLD\nALARMS", 0.33, C.amber, "[X] h"],
    ["AERIS-TWIN\nPREDICTIVE", 1, C.green, "[Y] h"],
  ];
  const barW = 58;
  bars.forEach(([label, frac, accent, val], i) => {
    const x = bx + 58 + i * 100;
    const h = Math.max(frac * maxH, 3);
    p.rect(x, originY - h, barW, h, { fill: accent, r: 2 });
    p.text(x + barW / 2, originY - h - 16, val, { size: 13, bold: true, color: accent, align: "center" });
    label.split("\n").forEach((l, li) =>
      p.text(x + barW / 2, originY + 8 + li * 9, l, { size: 6.6, color: C.dim, align: "center", track: 0.3 })
    );
  });
  // point of no return
  const pnY = originY - maxH * 0.16;
  p.line(bx + 16, pnY, bx + bwid - 16, pnY, { stroke: C.red, lw: 1.1, dash: [4, 3] });
  p.text(bx + bwid - 20, pnY - 10, "POINT OF NO RETURN", {
    size: 6.4,
    bold: true,
    color: C.red,
    align: "right",
    track: 0.4,
  });
  p.text(bx + 16, originY + 34, "Illustrative geometry - replace [X] / [Y] with your validated measurements.", {
    size: 6.6,
    color: C.muted,
  });

  /* right: users + impact */
  const rx = bx + bwid + 14, rw = CW - bwid - 14;
  p.rect(rx, by, rw, 132, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  panelTitle(p, rx + 16, by + 14, "02", "WHO THIS SERVES");
  const users = [
    ["GROUND OPERATORS / MISSION ENGINEERS", "high-altitude endurance UAV fleets"],
    ["MAINTENANCE PLANNERS + AIRWORTHINESS", "prediction evidence and a full audit trail"],
    ["EVERY PISTON / TURBOPROP OPERATOR", "trainers, ISR, ag-drones, remote power generation"],
  ];
  let uy = by + 38;
  for (const [k, v] of users) {
    tick(p, rx + 16, uy + 1, C.cyan, 0.85);
    p.text(rx + 32, uy, k, { size: 7.6, bold: true, color: C.text, track: 0.3 });
    p.text(rx + 32, uy + 11, v, { size: 7.4, color: C.muted });
    uy += 30;
  }

  p.rect(rx, by + 144, rw, 148, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  panelTitle(p, rx + 16, by + 158, "03", "QUANTIFIED IMPACT", C.amber);
  const imp = [
    ["Unplanned engine events", "target -[X]% per 1,000 flight hours [SRC]"],
    ["Avoided premature overhauls", "1,200 h fixed TBO -> condition-based, ~[X]% avoided [SRC]"],
    ["Asset protection", "one prevented engine + airframe loss = INR [X] crore"],
    ["Program risk", "TAPAS-class INR 1,786 crore - signature was diagnosable years earlier"],
    ["Operator workload", "200 readings/sec collapsed to 1 health index + 1 advisory"],
  ];
  let iy = by + 182;
  for (const [k, v] of imp) {
    p.text(rx + 16, iy, k, { size: 7.8, bold: true, color: C.amber });
    const ny = p.para(rx + 16, iy + 10, rw - 32, v, { size: 7.7, color: C.dim, lh: 9.2 });
    iy = ny + 4.5;
  }

  /* waterfall */
  const wy = 422;
  p.text(M, wy, "04", { size: 8, bold: true, color: C.cyan, track: 0.9 });
  p.text(M + 18, wy, "VALUE ACCRUED PER 100 FLIGHT HOURS", { size: 8, bold: true, color: C.text, track: 0.9 });
  p.line(M, wy + 12, PAGE_W - M, wy + 12, { stroke: C.line, lw: 0.5 });
  const cols = [
    ["AVOIDED OVERHAULS", "[X]%", 0.42, C.cyan],
    ["PREVENTED EVENTS", "[X] events", 0.3, C.green],
    ["REDUCED DOWNTIME", "[X] h", 0.22, C.amber],
    ["NET COST AVOIDED", "INR [X]", 0.62, C.white],
  ];
  const cw2 = (CW - 3 * 12) / 4;
  cols.forEach(([k, v, frac, accent], i) => {
    const x = M + i * (cw2 + 12);
    p.rect(x, wy + 22, cw2, 88, { fill: C.panel, stroke: C.line, lw: 0.6, r: 4 });
    p.text(x + 12, wy + 32, k, { size: 7.2, bold: true, color: C.dim, track: 0.5 });
    p.text(x + 12, wy + 46, v, { size: 17, bold: true, color: accent });
    p.rect(x + 12, wy + 86, cw2 - 24, 8, { fill: C.bg, r: 2 });
    p.rect(x + 12, wy + 86, (cw2 - 24) * frac, 8, { fill: accent, r: 2 });
  });
}

/* ----------------------------------------------------------------- slide 6 */

function slide6(p) {
  chrome(p, 6, "Research, Market & References", "CONTEXT  |  COMPETITIVE LANDSCAPE  |  CITATIONS");

  /* left */
  const lx = M, lw = 380;
  p.rect(lx, 116, lw, 150, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  panelTitle(p, lx + 16, 130, "01", "MARKET CONTEXT");
  p.bullets(
    lx + 16,
    154,
    lw - 32,
    [
      "Aerospace predictive maintenance and digital twins growing at [X]% CAGR to $[X]B by [year] [SRC].",
      "India's pull: indigenous MALE/HALE programs, HAL, private UAV OEMs and fleet sustainment under mandate to cut imports.",
      "Regulatory tailwind: condition-based maintenance approval requires demonstrated prediction accuracy - our audit trail produces exactly that evidence.",
    ],
    { size: 8.2, lh: 10.4, gap: 6, color: C.text, dot: C.cyan }
  );

  p.rect(lx, 276, lw, 138, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  panelTitle(p, lx + 16, 290, "02", "EXISTING SOLUTIONS vs OURS", C.amber);
  const cmp = [
    ["OEM / FADEC diagnostics", "Threshold display only, engine-locked. No prediction, no explanation."],
    ["Enterprise CBM platforms", "Ground-only offline analytics at procurement-scale cost. No live twin."],
    ["SCADA / telemetry loggers", "Record and plot data. Never interpret it."],
  ];
  let cy = 314;
  for (const [k, v] of cmp) {
    p.text(lx + 16, cy, k, { size: 7.8, bold: true, color: C.text });
    const ny = p.para(lx + 16, cy + 10, lw - 32, v, { size: 7.6, color: C.dim, lh: 9.2 });
    cy = ny + 6;
  }
  p.rect(lx + 16, 388, lw - 32, 20, { fill: C.cyanDeep, stroke: C.cyan, lw: 0.6, r: 3 });
  p.text(lx + 24, 393, "OUR MOAT: prediction + explainability + CAN-native + edge-capable", {
    size: 7.4,
    bold: true,
    color: C.white,
  });

  /* quadrant */
  const qx = lx + lw + 14, qw = CW - lw - 14, qy = 116, qh = 298;
  p.rect(qx, qy, qw, qh, { fill: C.panel, stroke: C.line, lw: 0.7, r: 5 });
  panelTitle(p, qx + 16, qy + 14, "03", "COMPETITIVE POSITION", C.green);

  const ax0 = qx + 54, ax1 = qx + qw - 26, ay0 = qy + 250, ay1 = qy + 46;
  const mx = (ax0 + ax1) / 2, my = (ay0 + ay1) / 2;
  p.line(ax0, ay0, ax1, ay0, { stroke: C.muted, lw: 0.9 });
  p.line(ax0, ay0, ax0, ay1, { stroke: C.muted, lw: 0.9 });
  p.line(mx, ay0, mx, ay1, { stroke: C.line, lw: 0.4, dash: [2, 3] });
  p.line(ax0, my, ax1, my, { stroke: C.line, lw: 0.4, dash: [2, 3] });
  p.text(ax0 - 6, ay0 - 16, "PREDICTION CAPABILITY", { size: 6.4, bold: true, color: C.dim });
  p.text((ax0 + ax1) / 2, ay0 + 8, "TIME TO FIELD / DEPLOYABILITY", {
    size: 6.4,
    bold: true,
    color: C.dim,
    align: "center",
  });
  p.text(ax1 - 4, ay1 - 12, "TOP-RIGHT QUADRANT", { size: 6.2, color: C.green, align: "right", track: 0.4 });

  const dots = [
    ["OEM / FADEC diagnostics", 0.2, 0.2, C.muted],
    ["Enterprise CBM platforms", 0.42, 0.72, C.muted],
    ["SCADA / telemetry loggers", 0.18, 0.9, C.muted],
    ["AERIS-TWIN", 0.9, 0.88, C.green],
  ];
  dots.forEach(([label, dx, dy, accent]) => {
    const x = ax0 + dx * (ax1 - ax0);
    const y = ay0 + dy * (ay1 - ay0);
    const isOurs = accent === C.green;
    p.rect(x - 4.5, y - 4.5, 9, 9, { fill: accent, r: 4.5 });
    // right-hand dots label to the left so nothing runs past the page margin
    if (dx > 0.5) {
      p.text(x - 9, y - 4, label, { size: 6.8, bold: isOurs, color: isOurs ? C.white : C.dim, align: "right" });
    } else {
      p.text(x + 10, y - 4, label, { size: 6.8, bold: isOurs, color: isOurs ? C.white : C.dim });
    }
  });
  p.text(qx + 16, qy + qh - 20, "Deployable in a weekend, not a procurement cycle.", { size: 7, color: C.muted });

  /* references */
  const ry = 426;
  p.text(M, ry, "04", { size: 8, bold: true, color: C.muted, track: 0.9 });
  p.text(M + 18, ry, "REFERENCES", { size: 8, bold: true, color: C.text, track: 0.9 });
  p.line(M, ry + 12, PAGE_W - M, ry + 12, { stroke: C.line, lw: 0.5 });
  const refs = [
    "[1] DRDO/ADE TAPAS BH-201 program status and performance data - [SRC]",
    "[2] Rotax 914 overhaul / operator manual - 1,200 h TBO, CHT & EGT limits - [SRC]",
    "[3] NASA C-MAPSS turbofan degradation dataset - [SRC]",
    "[4] Liu et al., Isolation Forest (2008) - [SRC]",
    "[5] Weibull reliability and RUL modelling reference - [SRC]",
    "[6] Bearing outer-race fault frequency (BPFO) derivation - [SRC]",
    "[7] SATCOM link latency and link-budget analysis - [SRC]",
    "[8] UAV predictive-maintenance market size - [SRC]",
  ];
  const half = Math.ceil(refs.length / 2);
  refs.forEach((r, i) => {
    const colIdx = i < half ? 0 : 1;
    const row = i < half ? i : i - half;
    p.text(M + colIdx * (CW / 2 + 10), ry + 24 + row * 12, r, { size: 7, color: C.dim });
  });
}

/* -------------------------------------------------------------------- build */

const doc = new Doc();
slide1(doc.addPage());
slide2(doc.addPage());
slide3(doc.addPage());
slide4(doc.addPage());
slide5(doc.addPage());
slide6(doc.addPage());

const { data, objects } = doc.build();
const outPath = path.join(process.cwd(), "public", "sih-idea-submission.pdf");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, data);

/* ------------------------------------------------------------ self-verify */

const check = fs.readFileSync(outPath);
const problems = [];

if (check.subarray(0, 5).toString("latin1") !== "%PDF-") problems.push("missing %PDF header");
if (!check.subarray(-6).toString("latin1").startsWith("%%EOF")) problems.push("missing %%EOF trailer");

const xrefAt = check.lastIndexOf("startxref");
const xrefOffset = parseInt(check.subarray(xrefAt + 9).toString("latin1").trim(), 10);
if (check.subarray(xrefOffset, xrefOffset + 4).toString("latin1") !== "xref") {
  problems.push("startxref does not point at the xref table");
}
const xrefText = check.subarray(xrefOffset).toString("latin1");
const entries = [...xrefText.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => parseInt(m[1], 10));
entries.forEach((off, i) => {
  const head = check.subarray(off, off + 12).toString("latin1");
  if (!/^\d+ 0 obj/.test(head)) problems.push(`xref entry ${i + 1} points at ${JSON.stringify(head)}`);
});
const pageCount = (check.toString("latin1").match(/\/Type \/Page[^s]/g) || []).length;
if (pageCount !== 6) problems.push(`expected 6 pages, found ${pageCount}`);

// text must not run outside the printable area
for (const [i, p] of doc.pages.entries()) {
  if (p.maxTextRight > PAGE_W - M + 2) {
    problems.push(`page ${i + 1}: text extends to x=${p.maxTextRight.toFixed(1)} (limit ${PAGE_W - M})`);
  }
}

const kb = (check.length / 1024).toFixed(1);
console.log(`wrote ${path.relative(process.cwd(), outPath)}  ${kb} KB  objects=${objects}  pages=${pageCount}`);
if (problems.length) {
  console.error("VERIFY FAILED:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log("verify: ok (header, xref offsets, trailer, 6 pages, no text overflow)");
