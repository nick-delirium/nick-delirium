// Neon street canyon: raycast facades with neon strips and windows, vertical blade signs
// in Japanese, overhead cables with lanterns, rain and a wet street reflecting everything.
import { HUE, clamp, noise2, hash1, rng, G, lerp } from "../engine/util.js";

const SPAN = 48; // world length of the generated street, wraps
const CAM_H = 0.55;
const SPEED = 1.15;
const WORDS = ["ラーメン", "居酒屋", "カラオケ", "ホテル", "寿司", "薬局", "電脳", "未来", "東京", "酒", "喫茶", "営業中", "ネオン", "パチンコ", "二十四時", "バー", "黒龍", "屋台", "映画館", "夜"];
const SIGN_HUES = [HUE.hot, HUE.alt, HUE.main, HUE.hot, HUE.white, HUE.alt];

let R, segs, segIdx, signs, cables, drops, ground, x0, yh, F, Fy;

function build(S) {
  R = rng(1987);
  segs = [[], []];
  segIdx = [new Int16Array(SPAN * 8), new Int16Array(SPAN * 8)];
  for (let s = 0; s < 2; s++) {
    let z = 0;
    while (z < SPAN) {
      const len = Math.min(SPAN - z, 1.5 + R() * 3);
      const strips = [];
      const ns = (R() * 3) | 0;
      for (let k = 0; k < ns; k++) strips.push({ y: 1 + R() * 6, hue: SIGN_HUES[(R() * SIGN_HUES.length) | 0] });
      const seg = {
        z0: z,
        z1: z + len,
        h: 4 + R() * 7,
        seed: (R() * 1e6) | 0,
        lit: 0.15 + R() * 0.35,
        wd: 1.6 + R() * 1.6,
        wh: 1.8 + R() * 1.2,
        winHue: [HUE.main, HUE.alt, HUE.fg, HUE.fg][(R() * 4) | 0],
        strips,
      };
      for (let q = Math.floor(z * 8); q < Math.floor((z + len) * 8) && q < SPAN * 8; q++) segIdx[s][q] = segs[s].length;
      segs[s].push(seg);
      z += len;
    }
  }
  signs = [];
  for (let s = 0; s < 2; s++) {
    let z = R() * 2;
    while (z < SPAN) {
      const seg = segAt(s, z);
      const text = WORDS[(R() * WORDS.length) | 0];
      const n = Array.from(text).length;
      const top = Math.min(seg.h - 0.3, 1.6 + R() * 4);
      if (top - n * 0.3 > 0.9) {
        signs.push({ side: s ? 1 : -1, z, top, text, n, hue: SIGN_HUES[(R() * SIGN_HUES.length) | 0], flicker: R() < 0.2, seed: R() * 100, pw: 0.26 + R() * 0.12 });
      }
      z += 0.9 + R() * 2.2;
    }
  }
  cables = [];
  for (let z = 1; z < SPAN; z += 2.5 + R() * 4) {
    cables.push({ z, y: 3 + R() * 2.5, sag: 0.25 + R() * 0.5, lanterns: R() < 0.55 ? 3 + ((R() * 4) | 0) : 0 });
  }
  drops = [];
  const n = Math.round((S.cols * S.rows) / 120);
  for (let i = 0; i < n; i++) drops.push({ x: R() * S.cols, y: R() * S.rows, z: R() });
  ground = new Uint8Array(S.cols * S.rows);
}

function segAt(s, z) {
  z = ((z % SPAN) + SPAN) % SPAN;
  return segs[s][segIdx[s][Math.min(SPAN * 8 - 1, Math.floor(z * 8))]];
}

/** facade sample; writes into out, returns false above the roofline */
function facade(s, zw, Y, dist, t, out) {
  const seg = segAt(s, zw);
  if (Y > seg.h || Y < 0) return false;
  const fog = Math.exp(-dist / 11);
  const zl = (((zw % SPAN) + SPAN) % SPAN) - seg.z0;
  out[0] = 0.012;
  out[1] = HUE.fg;
  out[2] = -1;
  if (zl < 0.05 || seg.z1 - seg.z0 - zl < 0.05) {
    out[0] = 0.28 * fog;
    out[2] = G("│");
    return true;
  }
  if (seg.h - Y < 0.07) {
    out[0] = 0.32 * fog;
    out[1] = HUE.alt;
    out[2] = G("▄");
    return true;
  }
  for (const st of seg.strips) {
    if (Math.abs(Y - st.y) < 0.045) {
      out[0] = 0.25 + 0.65 * Math.max(fog, 0.35);
      out[1] = st.hue;
      out[2] = G("─");
      return true;
    }
  }
  const u = zl * seg.wd, w = Y * seg.wh;
  // floor ledges every two storeys give the canyon its perspective lines
  if (dist < 9 && Math.abs(w / 2 - Math.round(w / 2)) < 0.04) {
    out[0] = 0.09 * fog + 0.03;
    out[2] = G("─");
    return true;
  }
  const fu = u - Math.floor(u), fw = w - Math.floor(w);
  if (fu > 0.22 && fu < 0.78 && fw > 0.28 && fw < 0.72) {
    const h = hash1(seg.seed + Math.floor(u) * 31 + Math.floor(w) * 977);
    if (h < seg.lit) {
      const flick = h < 0.01 ? (Math.sin(t * 7 + h * 1e4) > 0 ? 1 : 0.2) : 1;
      out[0] = (0.3 + hash1(seg.seed + Math.floor(w) * 13) * 0.45) * Math.max(fog, 0.15) * flick;
      out[1] = seg.winHue;
      out[2] = -1;
      if (dist < 3.5) {
        // close windows: bright frame, dithered glass
        const edge = fu < 0.3 || fu > 0.7 || fw < 0.36 || fw > 0.64;
        out[2] = edge ? G("▪") : G("░");
        if (!edge) out[0] *= 0.7;
      }
    } else if (dist < 6) {
      out[0] = 0.05 * fog;
      out[2] = G("·");
    }
  }
  return true;
}

export default {
  id: "shinjuku",
  title: "SHINJUKU_2077",
  caption: "neon kanji, wet asphalt, last train long gone",

  init(f, S) {
    build(S);
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gg = f.g;
    const camZ = t * SPEED;
    x0 = cols / 2 + Math.sin(t * 0.23) * cols * 0.04;
    yh = rows * 0.6;
    F = Math.max(cols * 0.5, (rows / ax) * 0.3);
    Fy = F * ax;
    const out = [0, 0, -1];
    ground.fill(0);

    // ── per-cell raycast: facades, sky, wet ground ──
    for (let y = 0, i = 0; y < rows; y++) {
      const dy = (yh - y) / Fy;
      for (let x = 0; x < cols; x++, i++) {
        const dx = (x - x0) / F;
        const side = dx < 0 ? 0 : 1;
        const zw = Math.abs(dx) > 1e-3 ? 1 / Math.abs(dx) : 1e3;
        const zg = dy < 0 ? CAM_H / -dy : 1e9;
        let v = 0, hue = HUE.fg, g = -1;
        if (zg < zw) {
          // wet street: dim asphalt + rippled reflection of the facades
          ground[i] = 1;
          const gx = dx * zg, gz = camZ + zg;
          const rip = noise2(x * 0.35, y * 0.9 + t * 2.2) * 0.012;
          const dxr = dx + rip;
          const zr = Math.abs(dxr) > 1e-3 ? 1 / Math.abs(dxr) : 1e3;
          const Yr = -dy * zr - CAM_H;
          if (zr < 40 && facade(dxr < 0 ? 0 : 1, camZ + zr, Yr, zr, t, out)) {
            v = out[0] * 0.42;
            hue = out[1];
          }
          const stripe = (gz % 12) < 0.7 && Math.abs(gx) < 0.8 && ((gx * 4 + 10) % 1) < 0.5;
          if (stripe) {
            v = Math.max(v, 0.18 * Math.exp(-zg / 8));
            hue = HUE.fg;
          }
          v = Math.max(v, 0.03 * Math.exp(-zg / 5));
        } else if (zw < 60 && facade(side, camZ + zw, CAM_H + dy * zw, zw, t, out)) {
          v = out[0];
          hue = out[1];
          g = out[2];
        } else {
          // sky: smog glow pooling over the vanishing point
          const ddx = (x - x0) / cols, ddy = (y - yh) / rows;
          const glow = Math.exp(-(ddx * ddx * 18 + ddy * ddy * 10));
          v = 0.05 + 0.24 * glow * (0.8 + 0.2 * noise2(x * 0.05, y * 0.1 - t * 0.1));
          hue = glow > 0.55 ? HUE.alt : HUE.hot;
        }
        V[i] = v;
        H[i] = hue;
        Gg[i] = g;
      }
    }

    const project = (X, Y, zr) => [x0 + (X / zr) * F, yh - ((Y - CAM_H) / zr) * Fy];
    const baseRow = (zr) => yh + (CAM_H / zr) * Fy;
    const reflect = (x, y, yb, v, hue) => {
      const ry = Math.round(2 * yb - y);
      const rx = Math.round(x + Math.sin(ry * 0.9 + t * 3) * 0.7);
      if (rx < 0 || ry < 0 || rx >= cols || ry >= rows) return;
      const i = ry * cols + rx;
      if (!ground[i]) return;
      if (v * 0.38 > V[i]) {
        V[i] = v * 0.38;
        H[i] = hue;
        Gg[i] = -1;
      }
    };

    // ── overhead cables + lanterns ──
    for (const c of cables) {
      const zr = ((((c.z - camZ) % SPAN) + SPAN) % SPAN);
      if (zr < 0.35 || zr > 26) continue;
      const fog = Math.exp(-zr / 12);
      let px = null, py = null;
      for (let k = 0; k <= 24; k++) {
        const X = -1 + (k / 24) * 2;
        const [sx, sy] = project(X, c.y - c.sag * (1 - X * X), zr);
        if (px !== null) f.line(px, py, sx, sy, 0.2 * fog + 0.05, HUE.fg, G("·"));
        px = sx;
        py = sy;
      }
      for (let k = 0; k < c.lanterns; k++) {
        const X = -0.75 + (k / Math.max(1, c.lanterns - 1)) * 1.5;
        const [sx, sy] = project(X, c.y - c.sag * (1 - X * X) - 0.25, zr);
        const v = 0.55 + 0.4 * fog;
        f.set(sx, sy, v, HUE.hot, G("●"));
        if (zr < 4) f.set(sx, sy - 1, v * 0.6, HUE.fg, G("│"));
        reflect(sx, sy, baseRow(zr), v, HUE.hot);
      }
    }

    // ── blade signs, far to near ──
    const vis = [];
    for (const s of signs) {
      const zr = ((((s.z - camZ) % SPAN) + SPAN) % SPAN);
      if (zr > 0.45 && zr < 30) vis.push([zr, s]);
    }
    vis.sort((a, b) => b[0] - a[0]);
    for (const [zr, s] of vis) {
      const [xa] = project(s.side * (1 - s.pw), 0, zr);
      const [xb] = project(s.side * 0.985, 0, zr);
      const left = Math.round(Math.min(xa, xb)), right = Math.round(Math.max(xa, xb));
      const wCells = right - left + 1;
      const [, top] = project(0, s.top, zr);
      const perChar = (0.3 / zr) * Fy;
      const hRows = Math.max(2, Math.round(perChar * s.n) + 2);
      const y0 = Math.round(top), y1 = y0 + hRows - 1;
      if (y1 < 0 || y0 >= rows || right < 0 || left >= cols) continue;
      const on = !s.flicker || Math.sin(t * 9 + s.seed) > -0.6 || Math.sin(t * 23 + s.seed * 3) > 0.3;
      const glow = (0.4 + 0.6 * Math.exp(-zr / 16)) * (on ? 1 : 0.25);
      const yb = baseRow(zr);
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = left; xx <= right; xx++) {
          f.set(xx, yy, 0.02, s.hue);
          if (yy === y0 || yy === y1 || xx === left || xx === right) reflect(xx, yy, yb, glow * 0.7, s.hue);
        }
      }
      if (wCells >= 3 && hRows >= 3) f.box(left, y0, wCells, hRows, s.hue, glow * 0.75);
      const size = wCells >= 7 && perChar >= 2 ? 1 : wCells >= 4 && perChar >= 1 ? 0 : -1;
      if (size >= 0) {
        const cw = size ? 4 : 2, chh = size ? 2 : 1;
        const slot = Math.max(chh, perChar);
        const cx = left + Math.floor((wCells - cw) / 2);
        let k = 0;
        for (const ch of s.text) {
          const cy = Math.round(y0 + 1 + k * slot + (slot - chh) / 2);
          if (cy + chh <= y1) f.cjk(cx, cy, ch, s.hue, Math.min(1, glow * 1.1), size);
          reflect(cx + cw / 2, cy, yb, glow, s.hue);
          k++;
        }
      } else {
        for (let yy = y0 + 1; yy < y1; yy++) {
          for (let xx = left + (wCells > 2 ? 1 : 0); xx <= right - (wCells > 2 ? 1 : 0); xx++) {
            f.set(xx, yy, glow * (0.55 + 0.35 * hash1(xx * 7 + yy * 13 + (s.seed | 0))), s.hue);
            reflect(xx, yy, yb, glow * 0.8, s.hue);
          }
        }
      }
    }

    // ── rain ──
    for (const d of drops) {
      const sp = 26 + d.z * 38;
      d.y += sp * dt;
      d.x -= sp * 0.08 * dt;
      if (d.y > rows) {
        d.y = -3;
        d.x = R() * cols;
      }
      for (let k = 0; k < 1 + Math.round(d.z * 2); k++) f.plot(d.x, d.y - k, (0.14 + d.z * 0.26) * (1 - k * 0.3), HUE.alt, G("│"));
      if (d.y > yh + 2 && R() < 0.02) f.plot(d.x, rows - 1 - ((R() * (rows - yh) * 0.5) | 0), 0.35, HUE.white, G("°"));
    }

    // ── HUD ──
    const hy = rows - 2;
    if (cols > 34) {
      for (let k = 0; k < 30; k++) f.set(1 + k, hy, 0);
      f.cjk(2, hy, "新宿", HUE.hot, 0.9, 0);
      f.text(7, hy, `SHINJUKU · 02:${String(47 + (Math.floor(t / 60) % 12)).padStart(2, "0")} · rain 92%`, HUE.fg, 0.55);
    }
  },
};
