// Accretion disk around a black hole: analytic thin disk with doppler beaming,
// a lensed far-side arc over the shadow, photon ring, relativistic jet, an infalling
// stream from the right and gravitationally lensed background stars.
import { HUE, clamp, smooth, noise2, noise3, hash2, rng, G } from "../engine/util.js";

const SIN_E = 0.25; // camera elevation above the disk plane
const R_IN = 1.55; // inner edge (shadow radius = 1)
const R_OUT = 7.2;
const GM = 9; // keplerian ω = sqrt(GM / r³)
const EINSTEIN = 1.65;

let cx, cy, Rs, trail, trailH, parts, rand, spawnAcc;

function emission(r, phi, t) {
  if (r < R_IN || r > R_OUT) return 0;
  const prof = smooth(R_IN, R_IN + 0.3, r) * (1 - smooth(R_OUT - 2.8, R_OUT, r)) * Math.pow(R_IN / r, 1.5) * 1.15;
  const psi = phi - Math.sqrt(GM / (r * r * r)) * t;
  const c = Math.cos(psi), s = Math.sin(psi);
  const n = noise3(c * 0.9, s * 0.9, r * 1.7) * 0.7 + noise3(c * 2.2, s * 2.2, r * 5.5 + 7) * 0.3;
  const beam = 1 + 0.7 * -Math.cos(phi); // approaching side (left) brighter
  return prof * clamp(0.5 + 0.9 * n, 0.05, 1.5) * beam;
}

function diskHue(v) {
  return v > 0.82 ? HUE.white : v > 0.34 ? HUE.main : HUE.hot;
}

// stream matter follows a tightening spiral: keplerian spin, accelerating infall
function spawnStream() {
  const lane = (rand() + rand() + rand() - 1.5) * 0.5;
  parts.push({ kind: 0, r: R_OUT * 1.45 + lane, phi: -0.42 + lane * 0.05, k: 0.85 + rand() * 0.3, life: 60 });
}

function spawnJet(dir) {
  parts.push({
    kind: 1,
    x: (rand() - 0.5) * 0.15,
    y: dir * 1.05,
    vx: (rand() - 0.5) * 0.35,
    vy: dir * (5 + rand() * 6),
    life: 1.6 + rand() * 1.2,
  });
}

export default {
  id: "blackhole",
  title: "ACCRETION_DISK",
  caption: "everything falls in. the record stays.",

  init(f, S) {
    const physW = S.cols, physH = S.rows / S.ax;
    if (physH > physW * 1.1) {
      cx = S.cols * 0.34;
      cy = S.rows * 0.62;
      Rs = physW * 0.12;
    } else {
      cx = S.cols * 0.42;
      cy = S.rows * 0.6;
      Rs = Math.min(physW * 0.075, physH * 0.13);
    }
    trail = new Float32Array(S.cols * S.rows);
    trailH = new Uint8Array(S.cols * S.rows);
    parts = [];
    rand = rng(42);
    spawnAcc = 0;
    // pre-seed the stream so it is already flowing
    for (let i = 0; i < 700; i++) {
      spawnStream();
      const p = parts[parts.length - 1];
      for (let k = 0; k < i / 2; k++) step(p, 1 / 30);
      if (p.r < R_IN * 1.05) parts.pop();
    }
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gg = f.g;
    const intro = smooth(0, 1.6, t);

    // ── particles ──
    spawnAcc += dt * 45;
    while (spawnAcc > 1) {
      spawnAcc--;
      if (parts.length < 1100) spawnStream();
    }
    const fade = Math.exp(-dt * 5);
    for (let i = 0; i < trail.length; i++) trail[i] *= fade;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.kind === 0) {
        step(p, dt);
        if (p.r < R_IN * 1.05) {
          parts.splice(i, 1);
          if (rand() < 0.5) spawnJet(rand() < 0.8 ? 1 : -1);
          continue;
        }
        const X = Math.cos(p.phi) * p.r, Z = Math.sin(p.phi) * p.r, Y = Z * SIN_E;
        if (Z > 0 && Math.hypot(X, Y) < 1) continue;
        const heat = clamp((R_OUT * 1.45 - p.r) / (R_OUT * 1.45 - R_IN));
        plotTrail(cols, rows, cx + X * Rs, cy - Y * Rs * ax, 0.3 + heat * 0.55, heat > 0.8 ? HUE.white : HUE.main);
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.99;
        if (p.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        plotTrail(cols, rows, cx + p.x * Rs, cy - p.y * Rs * ax, clamp(p.life * 0.4, 0, 0.75), HUE.alt);
      }
      if (p.life <= 0) parts.splice(i, 1);
    }

    // ── analytic field ──
    const invR = 1 / Rs, invRy = 1 / (Rs * ax);
    const ringW = Math.max(0.035, 0.55 * invRy);
    for (let y = 0, i = 0; y < rows; y++) {
      const Y = -(y - cy) * invRy;
      for (let x = 0; x < cols; x++, i++) {
        const X = (x - cx) * invR;
        const rho = Math.hypot(X, Y);
        let v = 0, hue = HUE.fg;

        // lensed background stars
        if (rho > 1) {
          const k = 1 - (EINSTEIN * EINSTEIN) / (rho * rho);
          const sx = X * k * Rs, sy = Y * k * Rs * ax;
          const h = hash2(Math.floor(sx * 0.9), Math.floor(sy * 0.9));
          if (h > 0.986) {
            v = 0.12 + (h - 0.986) * 28 * (0.6 + 0.4 * Math.sin(t * 2 + h * 900));
            if (rho < 2.6) v *= 1.5;
          }
        }

        // lensed image of the far disk side, wrapped over and under the shadow
        if (rho > 1.02 && rho < 3.6) {
          const sinT = Y / rho;
          const w = 1.35 * smooth(-0.45, 0.6, sinT) + 0.45 * smooth(0.1, 0.9, -sinT);
          if (w > 0.02) {
            const e = emission(R_IN + (rho - 1.07) / 0.36, Math.atan2(Y, X), t) * w;
            if (e > v) {
              v = e;
              hue = diskHue(e);
            }
          }
        }

        // photon ring
        const pr = Math.exp(-Math.pow((rho - 1.04) / ringW, 2));
        if (pr > 0.05 && pr * 0.85 > v) {
          v = pr * 0.85;
          hue = HUE.white;
        }

        if (rho < 1) v = 0;

        // primary disk image (thin, nearly edge-on)
        const dz = Y / SIN_E;
        const r = Math.hypot(X, dz);
        if (r > R_IN && r < R_OUT && (dz < 0 || rho >= 1)) {
          const e = emission(r, Math.atan2(dz, X), t);
          if (e > 0.04 && (dz < 0 || e > v * 0.8)) {
            v = dz < 0 ? Math.max(e, v * 0.25) : Math.max(e, v);
            hue = diskHue(v);
          }
        }

        // relativistic jets along the spin axis
        const ay = Math.abs(Y);
        if (ay > 0.95) {
          const up = Y > 0;
          const wj = 0.09 + 0.045 * (ay - 0.95);
          const prof = Math.exp(-(X * X) / (wj * wj));
          if (prof > 0.04) {
            const knots = 0.25 + 0.75 * Math.max(0, noise2(X * 1.3, ay * 0.75 - t * 2.4) * 0.8 + 0.3);
            const j = 0.62 * prof * knots * Math.exp(-(ay - 0.95) / (up ? 7 : 3.5)) * smooth(0.95, 1.6, ay) * (up ? 1 : 0.45);
            if (j > v) {
              v = j;
              hue = j > 0.5 ? HUE.white : HUE.alt;
            }
          }
        }

        v *= intro;
        const tv = trail[i];
        if (tv > v) {
          v = tv;
          hue = trailH[i];
        }
        V[i] = v;
        H[i] = hue;
        Gg[i] = -1;
      }
    }

    // ── HUD labels ──
    const lab = (x, y, s, hue = HUE.fg, val = 0.5) => {
      x = Math.round(x);
      y = Math.round(y);
      if (y < 0 || y >= rows || x < 0 || x + s.length > cols) return;
      for (let k = -1; k <= s.length; k++) f.set(x + k, y, 0);
      f.text(x, y, s, hue, val * intro);
    };
    lab(cx + Rs * 0.55 + 2, cy - Rs * ax * 4.2, "◀ JET 0.31c", HUE.alt, 0.65);
    const sx = cx + Math.cos(-0.42) * R_OUT * 1.2 * Rs, sy = cy - Math.sin(-0.42) * R_OUT * 1.2 * SIN_E * Rs * ax;
    lab(Math.min(cols - 17, sx - 6), sy + 2, "CAPTURE_STREAM", HUE.main, 0.55);
    lab(2, rows - 4, `M_BH  6.5e9 Msun`, HUE.fg, 0.4);
    lab(2, rows - 3, `SPIN  a*=0.94`, HUE.fg, 0.4);
    lab(2, rows - 2, `INFLOW ${(parts.length * 0.013).toFixed(2)} Msun/yr`, HUE.fg, 0.4);
  },
};

function step(p, dt) {
  p.phi += Math.sqrt(GM / (p.r * p.r * p.r)) * dt;
  p.r -= (0.3 + 2.4 / p.r) * p.k * dt;
}

function plotTrail(cols, rows, x, y, v, hue) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= cols || y >= rows) return;
  const i = y * cols + x;
  if (v > trail[i]) {
    trail[i] = v;
    trailH[i] = hue;
  }
}
