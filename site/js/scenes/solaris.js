// Solaris: a heavy, oily ocean under a red and a blue sun. Each cycle the ocean raises a
// structure (a symmetriad, a set of arches or a mirrored mimoid), holds it while it morphs,
// then melts it back. A small research station hangs above the water.
import { HUE, clamp, smooth, hash2 } from "../engine/util.js";

const CYCLE = 18;
const KINDS = ["symmetriad", "arches", "mimoid"];
const CAM_H = 2;
let H = 5; // structure height, world units (set per layout)
// [dir x, dir z, wavenumber, amplitude, speed, ridged]
const WAVES = [
  [0.28, 0.96, 0.9, 0.16, 0.42, 0],
  [-0.62, 0.78, 1.6, 0.08, 0.55, 1],
  [0.95, 0.31, 2.9, 0.03, 0.8, 1],
  [0.55, -0.83, 4.6, 0.022, 1.1, 1],
];
const NW = WAVES.length;

let portrait, hy, cx, F, Fy, suns, bz, bx, baseX, baseY, scale, stx, sty;
const ws = new Float64Array(NW), wc = new Float64Array(NW), wsa = new Float64Array(NW), wca = new Float64Array(NW), watt = new Float64Array(NW);
// structure sample output
let oV = 0, oH = 0;

/** structure brightness at local world coords (lx across, ly up from the waterline); false if empty */
function structure(kind, lx, ly, t, g, melt) {
  if (ly < 0 || g <= 0.001) return false;
  // melting: the form sags and drips
  if (melt > 0) lx += Math.sin(ly * 3.1 + t * 2.3) * 0.12 * melt;
  let nx = 0, ny = 0, nf = 1, inside = false, glow = 0;

  if (kind === 0) {
    // symmetriad: a revolved, banded stem opening into a cup, with mirrored petals
    const top = g * H * (1 + 0.04 * Math.sin(t * 0.7));
    const u = ly / H;
    if (ly <= top) {
      const r = prof(u, t) * (0.35 + 0.65 * g);
      if (Math.abs(lx) < r) {
        inside = true;
        nx = lx / r;
        nf = Math.sqrt(Math.max(0, 1 - nx * nx));
        const dr = (prof(u + 0.02, t) - prof(u, t)) / (0.02 * H);
        ny = clamp(-dr * 0.6, -0.8, 0.8) * nf;
        glow = 0.05 * (0.5 + 0.5 * Math.sin(u * 22 - t * 2.2));
      }
    }
    if (!inside && g > 0.6) {
      // petals: mirrored ellipses fanning out from the rim
      const open = smooth(0.6, 1, g) * (0.85 + 0.15 * Math.sin(t * 0.6));
      const tx = prof(top / H, t) * (0.35 + 0.65 * g) * 0.85, ty = top;
      for (let k = 0; k < 3 && !inside; k++) {
        const ang = (0.35 + k * 0.42) * open;
        const L = H * (0.24 - k * 0.05) * open, W = L * 0.2;
        const s = Math.sign(lx) || 1;
        const px = Math.abs(lx) - tx, py = ly - ty;
        const c = Math.cos(ang), sn = Math.sin(ang);
        // rotate into petal frame (petal axis tilted outward from vertical)
        const a = (px * sn + py * c) - L * 0.5, b = px * c - py * sn;
        const q = (a * a) / (L * L * 0.25) + (b * b) / (W * W);
        if (q < 1) {
          inside = true;
          nf = Math.sqrt(1 - q);
          nx = s * clamp(b / W, -1, 1) * 0.7;
          ny = clamp(a / (L * 0.5), -1, 1) * 0.5;
          glow = 0.08 * (1 - q);
        }
      }
    }
  } else if (kind === 1) {
    // arches: nested rainbows of jelly, breathing out of phase, plus mirrored side arches
    const R0 = H * 0.27 * g;
    const arcs = [
      [0, R0 * (1 + 0.05 * Math.sin(t * 0.8)), H * 0.07],
      [0, R0 * (1.45 + 0.06 * Math.sin(t * 0.8 + 1.7)), H * 0.055],
      [0, R0 * (1.85 + 0.07 * Math.sin(t * 0.8 + 3.1)), H * 0.04],
      [R0 * 1.6, R0 * 0.45, H * 0.035],
      [-R0 * 1.6, R0 * 0.45, H * 0.035],
    ];
    for (const [ax0, R, th] of arcs) {
      const dx = lx - ax0;
      const d = Math.hypot(dx * 0.9, ly);
      const e = Math.abs(d - R);
      if (e < th * g) {
        inside = true;
        const q = e / (th * g);
        nf = Math.sqrt(1 - q * q);
        const sgn = d > R ? 1 : -1;
        nx = (dx / (d || 1)) * q * sgn;
        ny = (ly / (d || 1)) * q * sgn;
        glow = 0.06 * (0.5 + 0.5 * Math.sin(Math.atan2(ly, dx) * 9 - t * 2));
        break;
      }
    }
  } else {
    // mimoid: mirrored metaballs that drift, merge and part
    let Fv = 0, gx = 0, gy = 0;
    for (let k = 0; k < 5; k++) {
      const ph = t * (0.35 + k * 0.07) + k * 1.9;
      const bxk = (0.12 + 0.2 * k * (1 - k * 0.12) + 0.08 * Math.sin(ph)) * H * 0.3;
      const byk = (0.1 + 0.19 * k + 0.05 * Math.cos(ph * 1.3)) * H * g;
      const rk = H * (0.12 - k * 0.012) * (0.4 + 0.6 * g);
      for (const sx of [-1, 1]) {
        const ddx = lx - sx * bxk, ddy = ly - byk;
        const d2 = ddx * ddx + ddy * ddy + 1e-3;
        const w = (rk * rk) / d2;
        Fv += w;
        gx += (-2 * w * ddx) / d2;
        gy += (-2 * w * ddy) / d2;
      }
    }
    // central stalk keeps it rooted in the water
    const sw = H * 0.09 * (0.5 + 0.5 * g);
    if (ly < H * 0.5 * g && Math.abs(lx) < sw * (1.6 - ly / (H * 0.5 * g + 1e-3))) Fv = Math.max(Fv, 1.2);
    if (Fv > 1) {
      inside = true;
      const gl = Math.hypot(gx, gy) || 1;
      const e = clamp((Fv - 1) / 1.4);
      nf = e;
      nx = (-gx / gl) * (1 - e);
      ny = (-gy / gl) * (1 - e);
      glow = 0.07 * (0.5 + 0.5 * Math.sin(Fv * 3 - t * 1.5));
    }
  }
  if (!inside) return false;

  // back-lit by both suns: colored rims on the edges facing them, a dim living body
  const edge = 1 - nf;
  const rimR = edge * edge * clamp(-nx * 0.9 + ny * 0.45 + 0.15);
  const rimB = edge * edge * clamp(nx * 0.9 + ny * 0.6 + 0.05);
  const body = 0.21 + 0.1 * nf + 0.05 * ny + glow;
  oV = (body + rimR * 0.95 + rimB * 0.85) * (1 - melt * 0.35);
  oH = rimR > 0.12 && rimR >= rimB ? HUE.hot : rimB > 0.12 ? HUE.alt : glow > 0.06 ? HUE.alt : HUE.fg;
  if (oV > 0.85) oH = HUE.white;
  return true;
}

// symmetriad radius profile: banded stem, flared foot, opening cup
function prof(q, t) {
  return H * (0.075 + 0.045 * Math.sin(q * 11 - t * 0.9) * q + 0.16 * Math.exp(-q * 9) + (q > 0.6 ? (q - 0.6) * (q - 0.6) * 0.9 : 0));
}

export default {
  id: "solaris",
  title: "SOLARIS",
  caption: "an ocean that answers in shapes",

  init(f, S) {
    const { cols, rows, ax } = S;
    portrait = rows / ax > cols * 1.1;
    hy = Math.round(rows * (portrait ? 0.45 : 0.42));
    cx = cols * 0.5;
    F = Math.max(cols * 0.45, (rows / ax) * 0.5);
    Fy = F * ax;
    const m = Math.min(cols, rows / ax);
    suns = [
      { x: cols * (portrait ? 0.25 : 0.3), y: hy - rows * 0.085, r: m * 0.075, hue: HUE.hot, k: 1 },
      { x: cols * (portrait ? 0.77 : 0.71), y: hy - rows * 0.26, r: m * 0.04, hue: HUE.alt, k: 0.9 },
    ];
    for (const s of suns) {
      const dx = (s.x - cx) / F, dy = (hy - s.y) / Fy;
      const l = Math.hypot(dx, dy, 1);
      s.dx = dx / l;
      s.dy = dy / l;
      s.dz = 1 / l;
    }
    // structure distance: tall enough to nearly reach the top edge
    // distant enough to read as a structure on the sea, tall enough to rise most of the way up
    bz = portrait ? 16 : 20;
    H = CAM_H + (0.72 * hy * bz) / Fy;
    baseX = cols * (portrait ? 0.5 : 0.6);
    bx = ((baseX - cx) / F) * bz;
    baseY = hy + (CAM_H / bz) * Fy;
    scale = F / bz;
    stx = Math.round(cols * (portrait ? 0.17 : 0.88));
    sty = Math.round(rows * (portrait ? 0.08 : 0.1));
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    const V = f.v, Hh = f.h, Gg = f.g;
    const intro = smooth(0, 1.2, t);

    // structure lifecycle (start mid-rise so the first second already shows something)
    const ct = t + 4;
    const kind = Math.floor(ct / CYCLE) % KINDS.length;
    const p = ct % CYCLE;
    const rise = smooth(2.5, 6, p);
    const melt = smooth(13, 16.5, p);
    const g = rise * (1 - melt);
    const act = smooth(2, 4, p) * (1 - smooth(15, 17.5, p));
    const status = p < 2.5 || p > 16.5 ? "calm" : p < 6 ? `${KINDS[kind]} forming` : p < 13 ? `${KINDS[kind]} stable` : "dissolving";
    const trend = p < 2.5 || p > 16.5 ? "~" : p < 13 ? "↑" : "↓";

    // ── sky ──
    for (let y = 0; y <= hy && y < rows; y++) {
      const vy = Math.pow(y / hy, 3);
      for (let x = 0, i = y * cols; x < cols; x++, i++) {
        const hb = hy - y;
        let v = 0.015 + 0.13 * vy + 0.1 * Math.exp(-hb * hb * 0.25), hue = HUE.fg;
        if (y < hy * 0.62) {
          const h = hash2(x, y);
          if (h > 0.993) {
            v = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t * 1.7 + h * 999));
            hue = HUE.fg;
          }
        }
        for (const s of suns) {
          const ddx = x - s.x, ddy = (y - s.y) / ax;
          const d = Math.sqrt(ddx * ddx + ddy * ddy) / s.r;
          if (d < 1) {
            v = 1 - d * 0.3;
            hue = d < 0.45 ? HUE.white : s.hue;
          } else {
            const gl = (0.34 * s.k) / (1 + (d - 1) * (d - 1) * 2.6);
            if (gl > v) {
              v = gl;
              hue = s.hue;
            }
          }
        }
        V[i] = v * intro;
        Hh[i] = hue;
        Gg[i] = -1;
      }
    }

    // ── ocean: per-row phase rotation keeps the swells trig-free per cell ──
    for (let y = hy + 1; y < rows; y++) {
      const dyp = (y - hy) / Fy;
      const z = CAM_H / dyp;
      const fog = smooth(16, 80, z);
      for (let k = 0; k < NW; k++) {
        const [dxw, dzw, kn, , sp] = WAVES[k];
        const a = (kn * dxw * z) / F;
        const b = kn * (dzw * z - (dxw * z * cx) / F) - sp * t * kn;
        ws[k] = Math.sin(b);
        wc[k] = Math.cos(b);
        wsa[k] = Math.sin(a);
        wca[k] = Math.cos(a);
        watt[k] = clamp(1.25 - Math.abs(a) * 0.7);
      }
      const vyRow = -dyp;
      const nearK = clamp((z - 1.5) / 6);
      const rz = z - bz;
      for (let x = 0, i = y * cols; x < cols; x++, i++) {
        let hx = 0, hz = 0;
        for (let k = 0; k < NW; k++) {
          const w = WAVES[k];
          const s = ws[k], c = wc[k];
          const der = w[5] ? (s < 0 ? c : -c) : c;
          const amp = w[3] * watt[k] * w[2] * der;
          hx += amp * w[0];
          hz += amp * w[1];
          ws[k] = s * wca[k] + c * wsa[k];
          wc[k] = c * wca[k] - s * wsa[k];
        }
        const dx = (x - cx) / F;
        // rings spreading from the structure's base while the ocean is active
        if (act > 0.01 && rz * rz < 400) {
          const rx = dx * z - bx;
          const r2 = rx * rx + rz * rz;
          if (r2 < 400 && r2 > 1e-4) {
            const r = Math.sqrt(r2);
            const d = 0.3 * act * Math.exp(-r * 0.12) * Math.cos(r * 1.6 - t * 2.4);
            hx += (d * rx) / r;
            hz += (d * rz) / r;
          }
        }
        const nl = 1 / Math.sqrt(hx * hx + 1 + hz * hz);
        const nx = -hx * nl, ny = nl, nz = -hz * nl;
        const vl = 1 / Math.sqrt(dx * dx + dyp * dyp + 1);
        const vx = dx * vl, vy = vyRow * vl, vz = vl;
        const vn = vx * nx + vy * ny + vz * nz;
        const rxv = vx - 2 * vn * nx, ryv = vy - 2 * vn * ny, rzv = vz - 2 * vn * nz;
        const up = ryv > 0 ? ryv : 0;
        const q = 1 + vn;
        const fres = 0.45 + 0.55 * q * q * q;
        let v = 0.03 + (0.22 / (1 + up * up * 30)) * fres + 0.05 * clamp(0.45 - hz * 2.2 + hx * 0.6);
        let hue = HUE.fg;
        let best = 0;
        for (let k = 0; k < 2; k++) {
          const s = suns[k];
          let d = rxv * s.dx + ryv * s.dy + rzv * s.dz;
          if (d > 0.97) {
            d = (d - 0.97) * 33.3;
            d = d * d * d;
            const sp = d * s.k * (k ? 0.95 : 1.15) * nearK;
            v += sp;
            if (sp > best) {
              best = sp;
              if (sp > 0.05) hue = s.hue;
            }
          }
        }
        if (v > 0.85) hue = HUE.white;
        if (fog > 0) {
          v = v * (1 - fog) + 0.13 * fog;

        }
        V[i] = v * intro;
        Hh[i] = hue;
        Gg[i] = -1;
      }
    }

    // ── the structure, plus its broken reflection under the waterline ──
    if (g > 0.01) {
      const sxp = scale, syp = scale * ax;
      // per-kind bounds (half width, height) keep the per-cell shape tests to the structure itself
      const halfW = H * [0.6, 0.62, 0.36][kind], topH = H * [1.27, 0.62, 1.05][kind];
      const x0 = Math.max(0, Math.floor(baseX - halfW * sxp)), x1 = Math.min(cols - 1, Math.ceil(baseX + halfW * sxp));
      const y0 = Math.max(0, Math.floor(baseY - topH * syp)), y1 = Math.min(rows - 1, Math.ceil(baseY + H * 0.3 * syp));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * cols + x;
          let lx = (x - baseX) / sxp, ly = (baseY - y) / syp;
          let k = 1;
          if (ly < 0) {
            // reflection: mirrored and rippled, fading with depth
            k = 0.3 * (1 + ly / (H * 0.3));
            lx += Math.sin(y * 1.3 + t * 3) * 0.08;
            ly = -ly;
          }
          if (structure(kind, lx, ly, t, g, melt)) {
            const v = oV * k * intro;
            if (v > V[i] || k === 1) {
              V[i] = v;
              Hh[i] = oH;
              Gg[i] = -1;
            }
          }
        }
      }
    }

    // ── research station ──
    if (cols > 24) {
      const yy = sty + Math.round(Math.sin(t * 0.5) * 0.8);
      const xx = stx - 3;
      f.text(xx, yy, "  ╔═╗", HUE.fg, 0.55 * intro);
      f.text(xx, yy + 1, "──╣", HUE.fg, 0.55 * intro);
      f.set(xx + 3, yy + 1, 0.75 * intro, HUE.alt, -1);
      f.text(xx + 3, yy + 1, "█", HUE.alt, 0.7 * intro);
      f.text(xx + 4, yy + 1, "╠──", HUE.fg, 0.55 * intro);
      f.text(xx, yy + 2, "  ╚╦╝", HUE.fg, 0.55 * intro);
      if ((t % 1.6) < 0.18) f.set(xx + 3, yy + 3, 0.95, HUE.hot, -1);
    }

    // ── HUD ──
    const hud = `SOLARIS · station · ocean activity ${trend} · ${status}`;
    const short = `SOLARIS · ${status}`;
    const line = hud.length + 4 <= cols ? hud : short.length + 4 <= cols ? short : "";
    if (line) {
      for (let k = 0; k < line.length + 2; k++) f.set(1 + k, rows - 2, 0);
      f.text(2, rows - 2, line, HUE.fg, 0.42 * intro);
    }
  },
};
