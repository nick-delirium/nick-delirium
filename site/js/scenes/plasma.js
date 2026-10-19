// STACK: dim plasma underlay with digital rain spelling the toolbox; words lock into frame.
import { HUE, G, rng, clamp, smooth } from "../engine/util.js";

// int hash → 0..1 (util.hash1 loses precision on large inputs)
const hash1 = (n) => {
  n = Math.imul((n | 0) ^ ((n | 0) >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

const WORDS = [
  "REACT", "TYPESCRIPT", "VUE", "FLUTTER", "SWIFT", "MOBX", "VITE", "WEBPACK",
  "NODE", "BUN", "FFLATE", "JEST", "WEB WORKERS", "CANVAS", "WASM", "LLM",
];
const NOISE = Array.from("01<>/\\{}[]=+*#$%&").map(G);

let drops = [];
let lock = null;
let nextLock = 2.2;
let r = rng(7);

function spawn(d, cols, rows, fresh) {
  d.word = WORDS[(r() * WORDS.length) | 0] + "·";
  d.speed = 9 + r() * 26;
  d.tail = 6 + ((r() * 18) | 0);
  d.y = fresh ? -r() * rows * 1.2 : -d.tail * r();
  d.off = (r() * 40) | 0;
  return d;
}

export default {
  id: "plasma",
  title: "STACK_RAIN",
  caption: "everything i reach for, falling in order",

  init(f, S) {
    r = rng(7);
    drops = [];
    const gap = S.cols > 140 ? 3 : 2;
    for (let x = 1; x < S.cols - 1; x += gap) {
      if (r() < 0.62) drops.push(spawn({ x }, S.cols, S.rows, true));
    }
    lock = null;
    nextLock = 2.2;
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gs = f.g;
    f.clear();

    // plasma underlay: sparse, low, two-tone
    const fade = smooth(0, 1.6, t) * 0.32;
    const tt = t * 0.35;
    for (let y = 0; y < rows; y++) {
      const py = y / ax;
      const s2 = Math.sin(py * 0.045 + tt * 0.8);
      for (let x = 0; x < cols; x++) {
        const s1 = Math.sin(x * 0.06 + tt);
        const s3 = Math.sin((x + py) * 0.035 - tt * 1.3);
        const dx = x - cols * (0.5 + 0.3 * Math.sin(tt * 0.5)), dy = py - (rows / ax) * 0.5;
        const s4 = Math.sin(Math.sqrt(dx * dx + dy * dy) * 0.07 - tt * 1.7);
        const p = (s1 + s2 + s3 + s4) * 0.25; // -1..1
        // topographic contours of the plasma instead of filled blobs
        const c = p * 5 + tt * 0.4;
        const band = 1 - Math.abs(c - Math.floor(c) - 0.5) * 2;
        if (band < 0.72) continue;
        const i = y * cols + x;
        V[i] = (0.35 + (band - 0.72) * 2.3) * fade * (0.55 + 0.45 * Math.abs(p));
        H[i] = p > 0 ? HUE.alt : HUE.fg;
      }
    }

    // rain
    const tick = Math.floor(t * 18);
    for (const d of drops) {
      let sp = d.speed;
      if (input.inside && Math.abs(input.x - d.x) < 5) sp *= 2.4;
      d.y += sp * dt;
      if (d.y - d.tail > rows) spawn(d, cols, rows, false);
      const head = Math.floor(d.y);
      const wl = d.word.length;
      for (let k = 0; k <= d.tail; k++) {
        const y = head - k;
        if (y < 0 || y >= rows) continue;
        const i = y * cols + d.x;
        let ch = d.word[(((y + d.off) % wl) + wl) % wl];
        if (ch === " ") continue;
        let g = G(ch === "·" ? "·" : ch);
        let v, h;
        if (k === 0) {
          v = 1;
          h = HUE.white;
          if (hash1(d.x * 31 + tick) < 0.5) g = NOISE[(hash1(d.x + tick * 7) * NOISE.length) | 0];
        } else {
          const q = 1 - k / (d.tail + 1);
          v = 0.18 + 0.72 * q * q;
          h = k < 3 ? HUE.main : HUE.alt;
          if (hash1(i * 13 + tick) < 0.02) g = NOISE[(hash1(i + tick) * NOISE.length) | 0];
        }
        V[i] = v;
        H[i] = h;
        Gs[i] = g;
      }
    }

    // word lock: decode into a frame, hold, dissolve
    if (!lock && t > nextLock) {
      lock = { word: WORDS[(r() * WORDS.length) | 0], t0: t };
    }
    if (lock) {
      const age = t - lock.t0;
      const life = 3.4;
      if (age > life) {
        lock = null;
        nextLock = t + 2.5 + r() * 2.5;
      } else {
        const w = lock.word;
        const bw = Math.max(w.length + 8, 18);
        const bh = 5;
        const bx = Math.floor((cols - bw) / 2);
        const by = Math.floor(rows * 0.5 - bh / 2);
        const open = smooth(0, 0.25, age) * (1 - smooth(life - 0.35, life, age));
        const ww = Math.max(2, Math.round(bw * open));
        const wx = Math.floor((cols - ww) / 2);
        for (let y = by - 1; y < by + bh + 1; y++)
          for (let x = wx - 1; x < wx + ww + 1; x++) f.set(x, y, 0, 0);
        if (ww > 3) {
          f.box(wx, by, ww, bh, HUE.main, 0.95, true);
          const label = "[STACK::LOCK]";
          if (ww > label.length + 2) f.text(wx + 2, by, label, HUE.hot, 0.9);
          const decoded = clamp((age - 0.25) / 0.7);
          const tx = Math.floor((cols - w.length) / 2);
          for (let k = 0; k < w.length; k++) {
            if (w[k] === " ") continue;
            const x = tx + k;
            if (x <= wx || x >= wx + ww - 1) continue;
            const done = k / w.length < decoded;
            const g = done ? G(w[k]) : NOISE[(hash1(k * 17 + tick) * NOISE.length) | 0];
            f.set(x, by + 2, done ? 1 : 0.6, done ? HUE.white : HUE.alt, g);
          }
          const pct = `${Math.round(decoded * 100)}%`.padStart(4);
          if (ww > 10) f.text(wx + ww - pct.length - 2, by + bh - 1, pct, HUE.alt, 0.8);
        }
      }
    }
  },
};
