// Library of Babel: a hexagonal gallery seen down its air shaft, shelves of
// random pages scrolling past, and now and then a real title resolves in the noise.
import { HUE, G, clamp, lerp, smooth, rng } from "../engine/util.js";

function hash2(x, y) {
  let h = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((y | 0) + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const ALPHA = Array.from("abcdefghijklmnopqrstuvwxyz,.").map(G);
const WORDS = [
  "neuromancer", "snow crash", "ubik", "solaris", "dune", "foundation", "hyperion", "blindsight",
  "accelerando", "akira", "ghost in the shell", "permutation city", "the diamond age", "count zero",
  "call me ishmael", "it was the best of times", "frankenstein", "the time machine", "dracula",
  "flatland", "we", "roadside picnic", "altered carbon", "the stars my destination",
];
const COS30 = Math.cos(Math.PI / 6);
const INNER = 0.3;

const st = {};

/** flat-top hex "radius": 1 on the boundary of a hex with circumradius R */
const hexR = (px, py, R) => Math.max(Math.abs(py), Math.abs(px) * COS30 + Math.abs(py) * 0.5) / (R * COS30);

function hexPts(cx, cy, R, ax) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R * ax]);
  }
  return pts;
}

export default {
  id: "babel",
  title: "LIBRARY_OF_BABEL",
  caption: "every book that could be written, shelved somewhere",

  init(f, S) {
    const { cols, rows, ax } = S;
    st.cx = cols / 2;
    st.cy = rows / 2;
    st.R = Math.min(cols * 0.5, (rows / ax) * 0.5) / COS30 * 0.98;
    const colW = clamp(Math.round(cols / 9), 9, 18);
    const gap = 2;
    st.cols = [];
    const r = rng(1941);
    for (let x = 1; x + 4 < cols; x += colW + gap) {
      const w = Math.min(colW, cols - 1 - x);
      const sp = (0.6 + r() * 2.6) * (r() < 0.5 ? -1 : 1);
      st.cols.push({ x, w, sp, off: r() * 500, page: 12 + ((r() * 8) | 0), seed: (r() * 1e6) | 0 });
    }
    st.words = [];
    st.next = 0.6;
    st.r = r;
    st.found = null;
    st.dust = Array.from({ length: Math.max(6, Math.round(cols / 6)) }, () => ({ x: r(), y: r(), s: 0.2 + r() * 0.8 }));
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const { cx, cy, R } = st;
    const fade = smooth(0, 1.2, t);
    f.clear();

    // reading lamp: drifts, or follows the cursor
    const lx = input.inside ? input.x : cx + Math.sin(t * 0.13) * cols * 0.3;
    const ly = input.inside ? input.y : cy + Math.cos(t * 0.17) * rows * 0.28;
    const lr = Math.max(10, Math.min(cols, rows / ax) * 0.18);

    // ---- shelves: scrolling columns of pages ----
    for (const c of st.cols) {
      c.off += c.sp * dt;
      const base = Math.floor(c.off);
      for (let y = 0; y < rows; y++) {
        const wr = y + base;
        const pr = ((wr % (c.page + 1)) + c.page + 1) % (c.page + 1);
        if (pr === c.page) continue; // gap between pages
        const lineLen = pr === c.page - 1 ? c.w * (0.2 + 0.5 * hash2(c.seed, wr)) : c.w * (0.72 + 0.28 * hash2(wr, c.seed));
        for (let k = 0; k < lineLen; k++) {
          const x = c.x + k;
          const px = x - cx, py = (y - cy) / ax;
          const h = hexR(px, py, R);
          if (h < INNER) continue; // the air shaft
          const reveal = hash2(x * 31, y * 17) < t / 1.0;
          if (!reveal) continue;
          const hh = hash2(x * 7 + c.seed, wr * 13);
          if (hh < 0.24) continue; // word gaps
          const depth = h > 1 ? 0.75 : clamp((h - INNER) / (1 - INNER));
          const d2 = ((x - lx) ** 2 + ((y - ly) / ax) ** 2) / (lr * lr);
          const lamp = Math.exp(-d2) * 0.45;
          const v = (0.08 + 0.17 * depth) * (h > 1 ? 0.65 : 1) + lamp;
          f.set(x, y, v * fade, lamp > 0.12 ? HUE.main : HUE.fg, ALPHA[(hh * 1000) % ALPHA.length | 0]);
        }
      }
    }

    // ---- spawn a revelation every so often ----
    if (t > st.next) {
      st.next = t + 0.6 + st.r() * 0.9;
      const c = st.cols[(st.r() * st.cols.length) | 0];
      const fits = WORDS.filter((w) => w.length <= c.w);
      if (fits.length) {
        const word = fits[(st.r() * fits.length) | 0];
        const y = 2 + ((st.r() * (rows - 4)) | 0);
        const x0 = c.x + ((st.r() * (c.w - word.length + 1)) | 0);
        const px = x0 + word.length / 2 - cx, py = (y - cy) / ax;
        if (hexR(px, py, R) > INNER + 0.08) {
          st.words.push({ c, x0, wr: y + Math.floor(c.off), word, born: t });
          const r = st.r;
          st.found = { word, wall: 1 + ((r() * 6) | 0), shelf: 1 + ((r() * 5) | 0), vol: 1 + ((r() * 32) | 0), page: 1 + ((r() * 410) | 0), t };
        }
      }
    }

    // ---- revelations: decode, glow, decay with their shelf ----
    for (const w of st.words) {
      const age = t - w.born;
      const y = w.wr - Math.floor(w.c.off);
      if (y < 0 || y >= rows) continue;
      for (let i = 0; i < w.word.length; i++) {
        const ch = w.word[i];
        const x = w.x0 + i;
        const lock = 0.08 + i * 0.045 + hash2(i, w.born * 100) * 0.25;
        let v, hue, g;
        if (ch === " ") {
          f.set(x, y, 0);
          continue;
        }
        if (age < lock) {
          v = 0.6;
          hue = HUE.alt;
          g = ALPHA[(hash2(x, Math.floor(t * 30)) * 1000) % ALPHA.length | 0];
        } else {
          const hold = 1 - smooth(2.4, 4.6, age);
          v = 0.35 + 0.65 * hold;
          hue = age - lock < 0.15 ? HUE.white : hold > 0.3 ? HUE.main : HUE.fg;
          g = G(ch);
        }
        f.set(x, y, v * fade, hue, g);
      }
      // brackets while fresh
      if (age < 2.6) {
        const bv = (1 - smooth(1.8, 2.6, age)) * 0.7;
        f.set(w.x0 - 1, y, bv, HUE.alt, G("["));
        f.set(w.x0 + w.word.length, y, bv, HUE.alt, G("]"));
      }
    }
    st.words = st.words.filter((w) => t - w.born < 4.8);

    // ---- the gallery: outer hex, shaft hex, perspective edges ----
    const outer = hexPts(cx, cy, R, ax);
    const inner = hexPts(cx, cy, R * INNER, ax);
    const fv = 0.22 * fade;
    for (let k = 0; k < 6; k++) {
      const a = outer[k], b = outer[(k + 1) % 6];
      const c = inner[k], d = inner[(k + 1) % 6];
      f.line(a[0], a[1], b[0], b[1], fv, HUE.alt, "auto", ax);
      f.line(c[0], c[1], d[0], d[1], fv * 1.8, HUE.alt, "auto", ax);
      f.line(a[0], a[1], c[0], c[1], fv * 0.8, HUE.fg, "auto", ax);
    }

    // ---- dust falling down the shaft ----
    const sr = R * INNER * COS30 * 0.85;
    for (const d of st.dust) {
      d.y += d.s * dt * 0.25;
      if (d.y > 1) (d.y = 0), (d.x = st.r());
      const x = cx + (d.x * 2 - 1) * sr * 0.9;
      const y = cy - sr * ax + d.y * sr * ax * 2;
      if (hexR(x - cx, (y - cy) / ax, R) < INNER * 0.95) f.plot(x, y, (0.15 + d.s * 0.3) * fade, HUE.alt, G("·"));
    }

    // ---- index card ----
    const hex = (0x3f2a + Math.floor(t / 7)).toString(16);
    const card = st.found
      ? `found "${st.found.word}" · wall ${st.found.wall} · shelf ${st.found.shelf} · vol ${st.found.vol} · p.${st.found.page}`
      : "searching...";
    const head = `HEX 0x${hex}`;
    for (let i = -1; i <= Math.min(cols - 2, card.length + 1); i++) {
      f.set(1 + i, rows - 2, 0);
      if (i <= head.length) f.set(1 + i, 1, 0);
    }
    f.text(1, 1, head, HUE.alt, 0.7 * fade);
    f.text(1, rows - 2, card.slice(0, cols - 3), HUE.fg, (st.found && t - st.found.t < 0.4 ? 0.95 : 0.55) * fade);
  },
};
