// Studybay: webpack build 3x faster → hyperspace jump.
import { HUE, rng, clamp, smooth, lerp, TAU, G, slopeGlyph } from "../engine/util.js";

const CYCLE = 11;
let stars = [];
let r = rng(7);

// speed profile over one cycle: idle → spool → JUMP → coast
function speedAt(p) {
  if (p < 2.5) return 0.12;
  if (p < 5.5) return lerp(0.12, 1.1, smooth(2.5, 5.5, p));
  if (p < 7) return lerp(1.1, 4.2, smooth(5.5, 5.9, p));
  return lerp(4.2, 0.12, smooth(7, 10.5, p));
}

function spawn(s, far) {
  const a = r() * TAU;
  const d = 0.04 + Math.pow(r(), 0.6) * 1.4;
  s.x = Math.cos(a) * d;
  s.y = Math.sin(a) * d;
  s.z = far ? 1 : 0.05 + r() * 0.95;
  s.hue = r() < 0.12 ? HUE.main : r() < 0.3 ? HUE.alt : HUE.fg;
  s.b = 0.55 + r() * 0.45;
}

// HUD text with a cleared backing so streaks don't bleed through
function hud(f, x, y, str, hue, v) {
  for (let i = -1; i <= str.length; i++) f.set(x + i, y, 0);
  f.text(x, y, str, hue, v);
}

export default {
  id: "warp",
  title: "HYPERSPACE_BUILD",
  caption: "bundle in, light out // webpack at x3",

  init(f, S) {
    r = rng(7);
    const n = clamp(Math.round((S.cols * S.rows) / 20), 160, 1400);
    stars = Array.from({ length: n }, () => {
      const s = {};
      spawn(s, false);
      return s;
    });
    f.clear();
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const p = t % CYCLE;
    const sp = speedAt(p);
    const jump = smooth(5.5, 6.2, p) * (1 - smooth(6.8, 8.5, p));
    const intro = smooth(0, 1.2, t);

    f.clear();

    let cx = cols / 2, cy = rows / 2;
    if (input.inside) {
      cx = lerp(cx, input.x, 0.25);
      cy = lerp(cy, input.y, 0.25);
    }
    const scale = Math.min(cols, rows / ax) * 0.55;

    // stars
    for (const s of stars) {
      const zPrev = s.z;
      s.z -= sp * dt * 0.42;
      if (s.z <= 0.02) {
        spawn(s, true);
        continue;
      }
      const hx = cx + (s.x / s.z) * scale;
      const hy = cy + (s.y / s.z) * scale * ax;
      if (hx < -2 || hy < -2 || hx > cols + 2 || hy > rows + 2) {
        spawn(s, true);
        continue;
      }
      const near = 1 - s.z;
      const v = (0.28 + near * 0.72) * s.b * intro;
      const tz = Math.min(1, s.z + sp * 0.05 + (zPrev - s.z) * 1.5);
      const tx = cx + (s.x / tz) * scale;
      const ty = cy + (s.y / tz) * scale * ax;
      const len = Math.hypot(hx - tx, (hy - ty) / ax);
      if (len < 0.9) {
        const tw = 0.75 + 0.25 * Math.sin(t * 6 + s.b * 40);
        f.plot(hx, hy, Math.min(1, v * 1.25 * tw), s.hue, near > 0.82 ? G("+") : -1);
      } else {
        const g = slopeGlyph(hx - tx, hy - ty, ax);
        const steps = Math.ceil(Math.max(Math.abs(hx - tx), Math.abs(hy - ty)));
        for (let k = 0; k <= steps; k++) {
          const q = k / steps; // 0 tail → 1 head
          f.plot(lerp(tx, hx, q), lerp(ty, hy, q), v * (0.12 + 0.88 * q * q), q > 0.85 && near > 0.7 ? HUE.white : s.hue, q < 0.3 ? -1 : g);
        }
      }
    }

    // tunnel rings during the jump
    if (jump > 0.02) {
      const maxR = Math.hypot(cols / 2, rows / ax / 2);
      for (let k = 0; k < 4; k++) {
        const q = (t * 1.6 + k / 4) % 1;
        const rad = q * q * maxR;
        const n = Math.max(24, Math.round(rad * 4));
        const v = jump * (1 - q) * 0.75;
        for (let i = 0; i < n; i++) {
          if ((i + k) % 3 === 0) continue;
          const a = (i / n) * TAU;
          f.plot(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * ax, v, k % 2 ? HUE.alt : HUE.main);
        }
      }
    }

    // core glow at the vanishing point
    const core = (0.6 + sp * 0.9 + jump * 4) * intro;
    const cr = core * 1.6;
    for (let y = Math.floor(cy - cr * ax - 1); y <= cy + cr * ax + 1; y++) {
      for (let x = Math.floor(cx - cr - 1); x <= cx + cr + 1; x++) {
        const d = Math.hypot(x - cx, (y - cy) / ax);
        const v = Math.exp(-d / (0.4 + core * 0.42)) * (0.65 + jump * 0.35);
        if (v > 0.05) f.plot(x, y, v, d < core * 0.6 ? HUE.white : HUE.main);
      }
    }

    // HUD
    const mult = 1 + 2 * smooth(0.12, 4.2, sp);
    const ms = Math.round(940 / mult);
    const pct = Math.min(100, Math.round((p / 7) * 100));
    const barW = Math.max(8, Math.min(24, cols - 22));
    const fill = Math.round((pct / 100) * barW);
    hud(f, 2, 1, "WEBPACK::HYPERSPACE", HUE.alt, 0.75 * intro);
    hud(f, 2, 2, `BUILD x${mult.toFixed(1)}`, mult > 2.9 ? HUE.white : HUE.main, 0.95 * intro);
    hud(f, 2, 3, `bundle.js ${String(ms).padStart(4)}ms`, HUE.fg, 0.7 * intro);
    const bar = "[" + "█".repeat(fill) + "░".repeat(barW - fill) + "] " + String(pct).padStart(3) + "%";
    hud(f, 2, rows - 2, bar, pct >= 100 ? HUE.main : HUE.alt, 0.8 * intro);
    if (jump > 0.5 && Math.floor(t * 8) % 2 === 0) {
      const msg = ">> JUMP <<";
      hud(f, Math.round(cx - msg.length / 2), Math.round(cy + Math.max(4, rows * 0.18)), msg, HUE.hot, 1);
    }
    const sx = cols - 14;
    if (sx > 26) hud(f, sx, 1, `v=${Math.min(0.99, sp / 4.2).toFixed(2)}c`, HUE.fg, 0.55 * intro);
    f.set(cols - 3, rows - 2, 0.9, HUE.main, G(p > 7 ? "●" : "○"));
  },
};
