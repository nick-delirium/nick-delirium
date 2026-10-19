// Easter egg: "One day I'll own a bee farm". A honeycomb filling up, bees on patrol.
import { HUE, G, rng, clamp, smooth, noise2, TAU } from "../engine/util.js";

const SQ3 = Math.sqrt(3);
let comb = null; // per-hex fill state keyed by "q,r"
let bees = [];
let Rh = 6;
let r = rng(5);

function hexState(q, k) {
  const key = q * 1000 + k;
  let s = comb.get(key);
  if (!s) {
    s = { lvl: 0, rate: 0.012 + r() * 0.03, delay: r() * r() * 16, cap: 0, hold: 0 };
    comb.set(key, s);
  }
  return s;
}

export default {
  id: "bees",
  title: "BEE_FARM",
  caption: "one day. someday. a bee farm",

  init(f, S) {
    r = rng(5);
    comb = new Map();
    const span = Math.min(S.cols, S.rows / S.ax);
    Rh = clamp(span / 11, 5, 11);
    const n = clamp(Math.round((S.cols * S.rows) / 650), 6, 28);
    bees = Array.from({ length: n }, (_, i) => ({
      x: r() * S.cols,
      y: (r() * S.rows) / S.ax,
      seed: i * 17.3,
      ox: r() * S.cols,
      oy: (r() * S.rows) / S.ax,
      trail: [],
    }));
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gs = f.g;
    f.clear();
    const a = (SQ3 / 2) * Rh; // apothem
    const colW = 1.5 * Rh, rowH = SQ3 * Rh;
    const midX = cols / 2, midY = rows / ax / 2;
    const reveal = smooth(0, 1.6, t) * Math.hypot(midX, midY) * 1.05 + 0.1;
    const gU = G("_"), gS = G("/"), gB = G("\\");

    // update fills
    let sum = 0, cnt = 0;
    for (const s of comb.values()) {
      if (s.hold > 0) {
        s.hold -= dt;
        if (s.hold <= 0) {
          s.lvl = 0;
          s.cap = 0;
          s.delay = 2 + r() * 8;
        }
      } else if (s.delay > 0) s.delay -= dt;
      else if (s.lvl < 1) s.lvl = Math.min(1, s.lvl + s.rate * dt * 2.2);
      else if (!s.cap) {
        s.cap = 1;
        s.hold = 3 + r() * 6;
      }
      sum += s.lvl;
      cnt++;
    }

    for (let y = 0; y < rows; y++) {
      const py = y / ax;
      for (let x = 0; x < cols; x++) {
        // nearest flat-top hex centre
        const q0 = Math.round(x / colW);
        let best = 1e9, bq = 0, bk = 0, bcx = 0, bcy = 0;
        for (let q = q0 - 1; q <= q0 + 1; q++) {
          const off = q & 1 ? rowH / 2 : 0;
          const k = Math.round((py - off) / rowH);
          const hx = q * colW, hy = k * rowH + off;
          const d = (x - hx) * (x - hx) + (py - hy) * (py - hy);
          if (d < best) {
            best = d;
            bq = q;
            bk = k;
            bcx = hx;
            bcy = hy;
          }
        }
        if (Math.hypot(bcx - midX, bcy - midY) > reveal) continue;
        const lx = x - bcx, ly = py - bcy;
        const alx = Math.abs(lx), aly = Math.abs(ly);
        const i = y * cols + x;
        // slanted edges: one cell per row, nearest the boundary √3|x| + |y| = √3 R
        const xb = Rh - aly / SQ3;
        if (aly < a && Math.abs(alx - xb) < 0.5) {
          V[i] = 0.5;
          H[i] = HUE.fg;
          Gs[i] = (lx > 0) === (ly < 0) ? gB : gS;
          continue;
        }
        // horizontal edge: drawn once, in the row just above the boundary
        if (ly > a - 1 / ax && ly <= a + 0.01 && alx <= Rh / 2 + 0.5) {
          V[i] = 0.5;
          H[i] = HUE.fg;
          Gs[i] = gU;
          continue;
        }
        const s = hexState(bq, bk);
        const fy = (ly + a) / (2 * a); // 0 top → 1 bottom
        const surface = 1 - s.lvl;
        if (s.lvl > 0.02 && fy > surface) {
          const depth = (fy - surface) * 2 * a * ax; // rows below the surface
          if (s.cap) {
            // wax cap: sparse dotted lid
            const lid = (x + y * 2) % 4;
            if (lid === 1) continue;
            V[i] = lid === 0 ? 0.38 : 0.1;
            H[i] = HUE.main;
            Gs[i] = G(lid === 0 ? "o" : "·");
          } else if (depth < 1) {
            const wob = Math.sin(x * 0.9 + t * 3 + bq) > 0.3;
            V[i] = 0.9;
            H[i] = HUE.white;
            Gs[i] = G(wob ? "~" : "-");
          } else {
            const shimmer = noise2(x * 0.3 + t * 0.4, py * 0.3 - t * 0.2);
            V[i] = 0.55 + 0.25 * shimmer;
            H[i] = HUE.main;
            Gs[i] = G(shimmer > 0.35 ? "▓" : shimmer > -0.3 ? "▒" : "░");
          }
        } else if ((x + y) % 7 === 0 && aly < a * 0.6) {
          V[i] = 0.08;
          H[i] = HUE.fg;
        }
      }
    }

    // bees: noisy orbits around drifting anchors; follow the cursor when it's here
    const tick = Math.floor(t * 20);
    for (const b of bees) {
      const ox = input.inside ? input.x : b.ox + Math.sin(t * 0.2 + b.seed) * cols * 0.2;
      const oy = input.inside ? input.y / ax : b.oy + Math.cos(t * 0.17 + b.seed) * (rows / ax) * 0.2;
      const ang = t * (1.4 + (b.seed % 1)) + b.seed;
      const rad = (input.inside ? 5 : 9) + 5 * noise2(b.seed, t * 0.5);
      const tx = ox + Math.cos(ang) * rad + 6 * noise2(t * 0.9, b.seed);
      const ty = oy + Math.sin(ang * 1.3) * rad * 0.8 + 6 * noise2(b.seed, t * 0.9);
      const k = 1 - Math.exp(-dt * 3.5);
      b.x += (tx - b.x) * k;
      b.y += (ty - b.y) * k;
      b.trail.push([b.x, b.y]);
      if (b.trail.length > 10) b.trail.shift();
      if (t < 0.6) continue;
      b.trail.forEach(([tx2, ty2], j) => {
        if (j % 2 === 0) f.plot(tx2, ty2 * ax, 0.16 + j * 0.02, HUE.fg, G("·"));
      });
      const bx = Math.round(b.x), by = Math.round(b.y * ax);
      const flap = (tick + (b.seed | 0)) % 2;
      f.set(bx, by, 1, HUE.main, G("¤"));
      f.set(bx - 1, by, 0.8, HUE.white, G(flap ? "'" : ","));
      f.set(bx + 1, by, 0.8, HUE.white, G(flap ? "'" : ","));
    }

    // HUD
    const hud = smooth(0.5, 1.2, t);
    if (hud > 0) {
      const title = " BEE_FARM.exe // someday ";
      const w = title.length + 2;
      for (let y = 0; y < 3; y++) for (let x = 1; x < 1 + w; x++) f.set(x, y + 1, 0, 0);
      f.box(1, 1, w, 3, HUE.main, 0.9 * hud);
      f.text(2, 2, title, HUE.white, 0.95 * hud);
      const pct = cnt ? Math.round((sum / cnt) * 100) : 0;
      const label = ` honey: ${pct}% `;
      const bar = 12;
      const filled = Math.round((pct / 100) * bar);
      const line = label + "[" + "▓".repeat(filled) + "░".repeat(bar - filled) + "] ";
      for (let x = 1; x < line.length + 2; x++) f.set(x, rows - 2, 0, 0);
      f.text(2, rows - 2, line, HUE.main, 0.9 * hud);
      const colony = ` colony: ${bees.length} `;
      if (cols > line.length + colony.length + 6) {
        for (let x = cols - colony.length - 3; x < cols - 1; x++) f.set(x, rows - 2, 0, 0);
        f.text(cols - colony.length - 2, rows - 2, colony, HUE.alt, 0.8 * hud);
      }
    }
  },
};
