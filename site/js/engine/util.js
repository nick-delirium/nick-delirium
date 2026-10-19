// Shared math, noise and the Field: a character-cell framebuffer every scene draws into.
// Cells hold brightness (v, 0..1+), hue index and an optional explicit glyph.
// Coordinates are in cells; cells are taller than wide, so S.ax = cellW / cellH (~0.6).
// To draw round things, scale vertical distances by 1 / S.ax.

export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const fract = (x) => x - Math.floor(x);
export const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// hues: indices into the theme palette
export const HUE = { fg: 0, main: 1, alt: 2, hot: 3, white: 4 };

// deterministic PRNG (mulberry32)
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** integer hash → 0..1 (lowbias32; inputs are truncated to int32) */
export function hash1(n) {
  let x = n | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export const hash2 = (x, y) => hash1(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663));

/* ---------------- simplex noise (Gustavson) ---------------- */
const grad3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);
const perm = new Uint8Array(512);
const pm12 = new Uint8Array(512);
{
  const p = new Uint8Array(256);
  const r = rng(1337);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    pm12[i] = perm[i] % 12;
  }
}
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

/** 2D simplex noise, roughly -1..1 */
export function noise2(xin, yin) {
  let n0 = 0, n1 = 0, n2 = 0;
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const x0 = xin - (i - t);
  const y0 = yin - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    const g = pm12[ii + perm[jj]] * 3;
    t0 *= t0;
    n0 = t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    const g = pm12[ii + i1 + perm[jj + j1]] * 3;
    t1 *= t1;
    n1 = t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    const g = pm12[ii + 1 + perm[jj + 1]] * 3;
    t2 *= t2;
    n2 = t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2);
  }
  return 70 * (n0 + n1 + n2);
}

const F3 = 1 / 3;
const G3 = 1 / 6;

/** 3D simplex noise, roughly -1..1 */
export function noise3(xin, yin, zin) {
  let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
  const s = (xin + yin + zin) * F3;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const k = Math.floor(zin + s);
  const t = (i + j + k) * G3;
  const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
  let i1, j1, k1, i2, j2, k2;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }
  const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
  const ii = i & 255, jj = j & 255, kk = k & 255;
  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 >= 0) {
    const g = pm12[ii + perm[jj + perm[kk]]] * 3;
    t0 *= t0;
    n0 = t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0 + grad3[g + 2] * z0);
  }
  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 >= 0) {
    const g = pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
    t1 *= t1;
    n1 = t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1 + grad3[g + 2] * z1);
  }
  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 >= 0) {
    const g = pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
    t2 *= t2;
    n2 = t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2 + grad3[g + 2] * z2);
  }
  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 >= 0) {
    const g = pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
    t3 *= t3;
    n3 = t3 * t3 * (grad3[g] * x3 + grad3[g + 1] * y3 + grad3[g + 2] * z3);
  }
  return 32 * (n0 + n1 + n2 + n3);
}

export function fbm2(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

export function fbm3(x, y, z, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f, y * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

/* ---------------- 3D helpers ---------------- */
export function rotX(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}
export function rotY(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
export function rotZ(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}

/* ---------------- glyphs ---------------- */
// Brightness ramp: index 0 is blank. Everything else in GLYPHS can be used explicitly.
export const RAMP = " .·:;-~=+*cxoO8%#&@";
const EXTRA =
  "!\"$'()/<>?[\\]^_`{|}," +
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabdefghijklmnpqrstuvwyz" +
  "─│┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬╱╲╳" +
  "░▒▓█▀▄▌▐" +
  "●○◉◆◇■□▪▫▲▼◀▶△▽◢◣◤◥" +
  "←↑→↓↖↗↘↙" +
  "•°×÷≈≡∞∴※¤λΣΩπμ";
export const GLYPHS = Array.from(new Set(Array.from(RAMP + EXTRA)));
const GMAP = new Map(GLYPHS.map((c, i) => [c, i]));
const QMARK = GMAP.get("?");

/** glyph index for a character (unknown chars render as '?') */
export const G = (ch) => (GMAP.has(ch) ? GMAP.get(ch) : QMARK);
export const RAMP_LEN = RAMP.length;
export const RAMP_IDX = Int16Array.from(Array.from(RAMP), (c) => GMAP.get(c));

// Wide CJK glyphs, drawn as slices spanning several cells (the mono font has no CJK).
// Size 0 = 2×1 cells per char, size 1 = 4×2 cells per char.
export const CJK = Array.from(new Set(Array.from("ラーメン居酒屋カラオケホテル寿司薬局電脳未来東京新宿夜酒喫茶営業中危険ネオンパチンコ二十四時バー愛黒龍屋台映画館")));
export const CJK_SIZES = [[2, 1], [4, 2]];
export const CJK_FONT = '"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans CJK JP", sans-serif';
export const SLICES = [];
const SLICE_BASE = new Map();
{
  let n = GLYPHS.length;
  CJK_SIZES.forEach(([w, h], s) => {
    for (const ch of CJK) {
      SLICE_BASE.set(s + ":" + ch, n);
      for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++, n++) SLICES.push({ ch, w, h, sx, sy, size: s });
    }
  });
}
export const GLYPH_COUNT = GLYPHS.length + SLICES.length;

/** pick a line glyph for a direction (dx, dy in cells) */
export function slopeGlyph(dx, dy, ax = 0.6) {
  const a = Math.atan2(-dy / ax, dx); // physical angle, y up
  const o = ((a % Math.PI) + Math.PI) % Math.PI; // 0..PI
  if (o < Math.PI / 8 || o > (7 * Math.PI) / 8) return G("-");
  if (o < (3 * Math.PI) / 8) return G("/");
  if (o < (5 * Math.PI) / 8) return G("|");
  return G("\\");
}

/* ---------------- Field ---------------- */
export class Field {
  constructor(cols = 1, rows = 1) {
    this.resize(cols, rows);
  }

  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.n = cols * rows;
    this.v = new Float32Array(this.n);
    this.h = new Uint8Array(this.n);
    this.g = new Int16Array(this.n).fill(-1);
  }

  clear() {
    this.v.fill(0);
    this.h.fill(0);
    this.g.fill(-1);
  }

  /** multiply brightness (trails); explicit glyphs drop once dim */
  fade(k) {
    const { v, g, n } = this;
    for (let i = 0; i < n; i++) {
      v[i] *= k;
      if (g[i] >= 0 && v[i] < 0.12) g[i] = -1;
    }
  }

  idx(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return -1;
    return y * this.cols + x;
  }

  /** max-blend a cell */
  plot(x, y, val, hue = 0, glyph = -1) {
    const i = this.idx(x, y);
    if (i < 0 || val < this.v[i]) return;
    this.v[i] = val;
    this.h[i] = hue;
    this.g[i] = glyph;
  }

  /** additive blend; hue follows the dominant contribution */
  add(x, y, val, hue = 0) {
    const i = this.idx(x, y);
    if (i < 0) return;
    const o = this.v[i];
    this.v[i] = o + val;
    if (val >= o) {
      this.h[i] = hue;
      this.g[i] = -1;
    }
  }

  /** overwrite regardless of existing brightness */
  set(x, y, val, hue = 0, glyph = -1) {
    const i = this.idx(x, y);
    if (i < 0) return;
    this.v[i] = val;
    this.h[i] = hue;
    this.g[i] = glyph;
  }

  text(x, y, str, hue = 0, val = 1) {
    let cx = Math.round(x);
    for (const ch of str) {
      if (ch !== " ") this.set(cx, y, val, hue, G(ch));
      cx++;
    }
  }

  /** glyph: undefined → brightness ramp, 'auto' → slope glyph, number → that glyph */
  line(x0, y0, x1, y1, val, hue = 0, glyph, ax = 0.6) {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    const g = glyph === "auto" ? slopeGlyph(dx, dy, ax) : glyph === undefined ? -1 : glyph;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.plot(x0 + dx * t, y0 + dy * t, val, hue, g);
    }
  }

  /** filled triangle; val may be a number or fn(x, y) → brightness */
  tri(x0, y0, x1, y1, x2, y2, val, hue = 0, glyph = -1) {
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(this.cols - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(this.rows - 1, Math.ceil(Math.max(y0, y1, y2)));
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-6) return;
    const fn = typeof val === "function";
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((x1 - x) * (y2 - y) - (x2 - x) * (y1 - y)) / area;
        const w1 = ((x2 - x) * (y0 - y) - (x0 - x) * (y2 - y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.01 || w1 < -0.01 || w2 < -0.01) continue;
        const i = y * this.cols + x;
        this.v[i] = fn ? val(x, y) : val;
        this.h[i] = hue;
        this.g[i] = glyph;
      }
    }
  }

  /** filled convex polygon [[x,y],...] */
  poly(pts, val, hue = 0, glyph = -1) {
    for (let i = 1; i < pts.length - 1; i++) {
      this.tri(pts[0][0], pts[0][1], pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], val, hue, glyph);
    }
  }

  /** box-drawing frame */
  box(x, y, w, h, hue = 0, val = 1, heavy = false) {
    const [tl, tr, bl, br, hz, vt] = heavy ? "╔╗╚╝═║" : "┌┐└┘─│";
    for (let i = 1; i < w - 1; i++) {
      this.set(x + i, y, val, hue, G(hz));
      this.set(x + i, y + h - 1, val, hue, G(hz));
    }
    for (let j = 1; j < h - 1; j++) {
      this.set(x, y + j, val, hue, G(vt));
      this.set(x + w - 1, y + j, val, hue, G(vt));
    }
    this.set(x, y, val, hue, G(tl));
    this.set(x + w - 1, y, val, hue, G(tr));
    this.set(x, y + h - 1, val, hue, G(bl));
    this.set(x + w - 1, y + h - 1, val, hue, G(br));
  }

  /** CJK text from the CJK set; size 0 → 2×1 cells per char, 1 → 4×2; vertical stacks downward */
  cjk(x, y, str, hue = 0, val = 1, size = 0, vertical = false) {
    const [w, h] = CJK_SIZES[size];
    let cx = Math.round(x), cy = Math.round(y);
    for (const ch of str) {
      const base = SLICE_BASE.get(size + ":" + ch);
      if (base !== undefined) {
        for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) this.set(cx + sx, cy + sy, val, hue, base + sy * w + sx);
      }
      if (vertical) cy += h;
      else cx += w;
    }
  }

  /** aspect-corrected disc; r in cell widths */
  disc(cx, cy, r, val, hue = 0, ax = 0.6, glyph = -1) {
    const ry = r * ax;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx, dy = (y - cy) / ax;
        if (dx * dx + dy * dy <= r * r) this.plot(x, y, val, hue, glyph);
      }
    }
  }
}
