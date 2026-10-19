// Anime evening: striped retro sun behind a snow-capped volcano, a torii standing
// in still water, a drifting cloud band and cherry petals riding the wind.
import { HUE, G, clamp, lerp, smooth, fract, fbm2, noise2, rng } from "../engine/util.js";

function hash2(x, y) {
  let h = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((y | 0) + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const DOT = G("·"), PLUS = G("+"), SLASH = G("/"), BSLASH = G("\\");
const FULL = G("█"), DARK = G("▓"), TILDE = G("~"), DASH = G("-"), EQ = G("=");
const NEAR = ["%", "o", "*", "x", "°", "*"].map(G);
const MID = ["*", "x", "°", "+", "·"].map(G);
const FAR = ["·", "°", "·", "."].map(G);

const st = { petals: [], L: null };

function layout(S) {
  const { cols, rows, ax } = S;
  const portrait = rows * ax > cols * 0.8;
  const hz = Math.round(rows * (portrait ? 0.54 : 0.63));
  const B = cols * (portrait ? 0.78 : 0.4);
  const H = Math.min(hz * (portrait ? 0.5 : 0.56), B * ax * (portrait ? 1 : 0.62));
  const fuji = { x: cols * (portrait ? 0.55 : 0.56), H, B };
  // "diamond fuji": the sun sits right on the summit
  const Rr = Math.min(H * (portrait ? 0.66 : 0.62), cols * 0.36 * ax);
  const sun = { x: fuji.x, y: hz - H * 0.9 - Rr * 0.25, R: Rr / ax };
  const W = Math.max(8, Math.min(cols * (portrait ? 0.34 : 0.17), (hz * 0.55) / (1.15 * ax)));
  const torii = { x: cols * (portrait ? 0.24 : 0.18), base: Math.min(rows - 3, hz + Math.round(rows * 0.09)), W, H: W * 1.15 * ax };
  return { hz, sun, fuji, torii, portrait };
}

/** torii as a list of [x, y, glyph, v]; dy measured upward from base */
function toriiCells(T) {
  const out = [];
  const { W, H } = T;
  const half = W / 2;
  const put = (x, dy, g, v) => out.push([Math.round(T.x + x), Math.round(T.base - dy), g, v]);
  const span = (x0, x1, dy, g, v) => {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) put(x, dy, g, v);
  };
  const pw = Math.max(1, Math.round(W * 0.07));
  // pillars
  for (let dy = 0; dy <= H * 0.86; dy++) {
    for (let k = 0; k < pw; k++) {
      put(-half + k - pw / 2, dy, dy < H * 0.12 ? DARK : FULL, 0.72);
      put(half + k - pw / 2, dy, dy < H * 0.12 ? DARK : FULL, 0.72);
    }
  }
  // nuki (tie beam) + gakuzuka (centre strut)
  const nk = Math.round(H * 0.66);
  span(-half * 1.28, half * 1.28, nk, FULL, 0.8);
  for (let dy = nk + 1; dy < H * 0.86; dy++) put(0, dy, DARK, 0.6);
  // shimaki + kasagi with upturned ends
  const top = Math.round(H * 0.86);
  span(-half * 1.42, half * 1.42, top, FULL, 0.85);
  const kw = half * 1.62;
  for (let x = -Math.ceil(kw); x <= Math.ceil(kw); x++) {
    const lift = Math.pow(Math.abs(x) / kw, 4) * Math.max(1, H * 0.06);
    put(x, top + 1 + Math.round(lift), FULL, 0.95);
    if (Math.abs(x) < kw * 0.94) put(x, top + 1, FULL, 0.9);
  }
  return out;
}

function spawnPetal(p, S, r, anywhere) {
  p.z = Math.pow(r(), 1.6); // 0 far .. 1 near
  p.x = anywhere ? r() * S.cols : -2 - r() * S.cols * 0.3;
  p.y = r() * S.rows * (anywhere ? 1 : 0.9) - S.rows * 0.05;
  p.ph = r() * 100;
  p.sp = 0.7 + r() * 0.6;
  p.hue = r() < 0.5 ? HUE.hot : r() < 0.6 ? HUE.white : HUE.fg;
}

export default {
  id: "sakura",
  title: "HANAMI_SIGNAL",
  caption: "petals in the wind, frame by frame",

  init(f, S) {
    st.L = layout(S);
    st.torii = toriiCells(st.L.torii);
    const r = rng(88);
    const count = Math.round(clamp((S.cols * S.rows) / 40, 60, 800));
    st.petals = [];
    for (let i = 0; i < count; i++) {
      const p = {};
      spawnPetal(p, S, r, true);
      st.petals.push(p);
    }
    st.r = r;
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const { hz, sun, fuji, torii } = st.L;
    const fade = smooth(0, 1.1, t);
    f.clear();

    // ---- sky: sparse stars high up, warm haze near the horizon ----
    for (let y = 0; y < hz; y++) {
      const haze = smooth(hz * 0.45, hz, y);
      for (let x = 0; x < cols; x++) {
        const h = hash2(x * 7 + 3, y * 13 + 1);
        if (y < hz * 0.5 && h > 0.992) {
          const tw = 0.5 + 0.5 * Math.sin(t * 1.7 + h * 500);
          f.set(x, y, (0.1 + 0.25 * tw) * fade, HUE.fg, h > 0.998 ? PLUS : DOT);
        } else if (haze > 0 && h < haze * 0.08) {
          f.set(x, y, 0.08 * fade, HUE.hot, DOT);
        }
      }
    }

    // ---- sun: rises into place, cut lines drift downward ----
    const rise = (1 - smooth(0, 1.6, t)) * sun.R * ax * 0.6;
    const sy = sun.y + rise;
    const R = sun.R;
    for (let y = Math.max(0, Math.floor(sy - R * ax * 1.35)); y < hz; y++) {
      const dy = (y - sy) / ax;
      const u = (y - (sy - R * ax)) / (2 * R * ax);
      const cut = u > 0.3 && fract(u * 9 - t * 0.25) < (u - 0.3) * 1.25;
      for (let x = Math.max(0, Math.floor(sun.x - R * 1.35)); x <= Math.min(cols - 1, Math.ceil(sun.x + R * 1.35)); x++) {
        const d = Math.hypot(x - sun.x, dy);
        if (d <= R) {
          if (cut) continue;
          const v = 0.98 - u * 0.3 + (hash2(x, y) - 0.5) * 0.06;
          f.set(x, y, v * fade, u < 0.48 ? HUE.main : HUE.hot);
        } else {
          const g = 1 - (d - R) / (R * 0.35);
          if (g > 0) f.plot(x, y, g * g * 0.22 * fade, HUE.hot);
        }
      }
    }

    // ---- fuji: concave volcano, truncated crater, ridged snow cap ----
    const top = hz - fuji.H;
    for (let x = 0; x < cols; x++) {
      const dx = (x - fuji.x) / fuji.B;
      const ad = Math.abs(dx);
      if (ad >= 1) continue;
      let h = fuji.H * Math.pow(1 - ad, 1.7);
      h = Math.min(h, fuji.H * 0.9) + noise2(x * 0.35, 3.1) * 0.6;
      const ty = Math.round(hz - h);
      const snow = top + fuji.H * (0.2 + 0.09 * Math.abs(noise2(x * 0.45, 7.7)) + 0.05 * Math.sin(x * 1.3));
      for (let y = Math.max(0, ty); y < hz; y++) {
        if (y < snow) {
          const v = 0.55 + 0.3 * (1 - (y - ty) / (snow - ty + 1)) + (hash2(x, y) - 0.5) * 0.1;
          f.set(x, y, v * fade, HUE.white, y === ty ? (dx < -0.02 ? SLASH : dx > 0.02 ? BSLASH : DASH) : -1);
        } else {
          // dark body with engraved slope strokes
          const stroke = hash2(x * 3, y * 5) < 0.16 + 0.1 * smooth(snow, snow + 4, y);
          f.set(x, y, stroke ? 0.13 * fade : 0, HUE.alt, dx < 0 ? SLASH : BSLASH);
        }
      }
      if (ty >= 0 && ty >= snow) f.set(x, ty, 0.35 * fade, HUE.alt, dx < 0 ? SLASH : BSLASH);
    }

    // ---- cloud band drifting across the slopes ----
    const cb = hz - fuji.H * 0.42;
    for (let y = Math.max(0, Math.floor(cb - 3)); y <= Math.min(hz - 1, Math.ceil(cb + 3)); y++) {
      const band = 1 - Math.abs(y - cb) / 3.5;
      for (let x = 0; x < cols; x++) {
        const n = fbm2((x - t * 2.2) * 0.035, y * 0.3 + 4.2, 3);
        const d = (n + 0.15) * band * 1.6;
        if (d < 0.18) continue;
        const lit = Math.hypot(x - sun.x, (y - sy) / ax) < R * 1.15;
        f.set(x, y, clamp(d * 0.55, 0, 0.5) * fade, lit ? HUE.main : HUE.fg, d > 0.5 ? TILDE : DASH);
      }
    }

    // ---- water: wobbling reflection of everything above the horizon ----
    for (let y = hz; y < rows; y++) {
      const depth = y - hz;
      const src = hz - 1 - Math.floor(depth * 1.25);
      if (src < 0) break;
      const fall = 0.42 * (1 - depth / (rows - hz + 1));
      for (let x = 0; x < cols; x++) {
        const wob = Math.round(Math.sin(depth * 0.9 + t * 2.1 + x * 0.05) * (1 + depth * 0.06));
        const sx = clamp(x + wob, 0, cols - 1);
        const j = src * cols + sx;
        const v = f.v[j];
        const i = y * cols + x;
        if (v < 0.12 || hash2(x + Math.floor(t * 3), y) < 0.3) {
          f.v[i] = hash2(x * 5, y) < 0.03 ? 0.07 * fade : 0;
          f.h[i] = HUE.alt;
          f.g[i] = DASH;
          continue;
        }
        f.v[i] = v * fall;
        f.h[i] = f.h[j];
        f.g[i] = v > 0.6 ? EQ : v > 0.3 ? DASH : TILDE;
      }
    }
    for (let x = 0; x < cols; x++) f.plot(x, hz, 0.3 * fade, HUE.hot, DASH);

    // ---- torii + its reflection ----
    const tf = smooth(0.3, 1.3, t);
    for (const [x, y, g, v] of st.torii) {
      f.set(x, y, v * tf, HUE.hot, g);
      const ry = torii.base + (torii.base - y) + 1;
      if (ry < rows && hash2(x, ry + Math.floor(t * 4)) > 0.25) {
        const wob = Math.round(Math.sin((ry - torii.base) * 0.8 + t * 2) * 0.8);
        f.set(x + wob, ry, v * 0.32 * tf * (1 - (ry - torii.base) / (rows - torii.base + 2)), HUE.hot, DASH);
      }
    }

    // ---- petals ----
    const gust = 1 + 0.6 * Math.max(0, noise2(t * 0.25, 9.1));
    for (const p of st.petals) {
      const speed = 0.35 + p.z * 1.3;
      const wind = (7 + 5 * noise2(p.y * 0.04, t * 0.2)) * gust * speed * p.sp;
      p.x += (wind + Math.sin(t * 2.2 + p.ph) * 2.5 * speed) * dt;
      p.y += (2 + Math.sin(t * 3.1 + p.ph * 1.7) * 1.6) * speed * ax * dt;
      if (input.inside) {
        const dx = p.x - input.x, dy = (p.y - input.y) / ax;
        const d2 = dx * dx + dy * dy;
        if (d2 < 160) {
          const k = (1 - d2 / 160) * 40 * dt;
          const d = Math.sqrt(d2) || 1;
          p.x += (dx / d) * k;
          p.y += (dy / d) * k * ax;
        }
      }
      if (p.x > cols + 2 || p.y > rows + 1) spawnPetal(p, S, st.r, false);
      if (p.y < -3) p.y = rows * st.r();
      const set = p.z > 0.66 ? NEAR : p.z > 0.3 ? MID : FAR;
      const g = set[Math.floor(t * (3 + p.z * 5) + p.ph) % set.length];
      const v = (0.28 + p.z * 0.7) * fade;
      if (p.z > 0.5) f.set(p.x, p.y, v, p.hue, g);
      else f.plot(p.x, p.y, v, p.z > 0.25 ? p.hue : HUE.fg, g);
    }
  },
};
