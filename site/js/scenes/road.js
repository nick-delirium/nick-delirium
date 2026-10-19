// Simracing: pseudo-3D segment-projected track with kerbs, hills, a neon grid,
// a synthwave sun over a mountain range and live telemetry.
import { HUE, G, TAU, clamp, lerp, smooth, fract, fbm2, rng } from "../engine/util.js";

// int hash (imul based) → 0..1
function hash2(x, y) {
  let h = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((y | 0) + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const N = 960; // track segments (loops)
const DRAW = 160; // draw distance in segments
const ROAD_W = 1;
const CAM_H = 0.62;
const LAMP_EVERY = 16;

const curve = new Float32Array(N);
const hill = new Float32Array(N);
{
  const r = rng(2024);
  let i = 0;
  while (i < N) {
    const len = Math.min(N - i, 40 + ((r() * 90) | 0));
    const c = r() < 0.3 ? 0 : (r() < 0.5 ? -1 : 1) * (0.005 + r() * 0.012);
    for (let k = 0; k < len; k++) curve[i + k] = c * Math.sin((Math.PI * k) / len);
    i += len;
  }
  for (let j = 0; j < N; j++) {
    const u = (j / N) * TAU;
    hill[j] = Math.sin(u * 4) * 1.6 + Math.sin(u * 9 + 1.3) * 0.5;
  }
}

const FULL = G("█"), DARK = G("▓"), MID = G("▒"), LITE = G("░");
const DOT = G("·"), PLUS = G("+"), HLINE = G("─"), VBAR = G("│");
const SLASH = G("/"), BSLASH = G("\\"), DASH = G("-"), CARET = G("^");
const TOP_HALF = G("▀");

const CAR = [
  "   ▄▄▄▄▄▄▄▄▄▄▄   ",
  "  ▐░░░░░░░░░░░▌  ",
  " ▄█████████████▄ ",
  "▐█▓▓██▀▀▀▀▀██▓▓█▌",
  "▐███████████████▌",
  " ▀██▀       ▀██▀ ",
];

const st = { pos: 0, speed: 150, camX: 0, sky: 0, gear: 3, shift: 0, hz: 20 };

function drawCar(f, S, cx, by, braking, t, fade) {
  const scale = S.cols > 230 ? 2 : 1;
  const w = CAR[0].length * scale;
  const h = CAR.length * scale;
  const x0 = Math.round(cx - w / 2);
  const y0 = by - h + 1;
  for (let r = 0; r < CAR.length; r++) {
    const row = Array.from(CAR[r]);
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === " ") continue;
      let hue = HUE.fg, v = 0.5;
      if (ch === "░") (hue = HUE.alt), (v = 0.32);
      else if (ch === "▓") (hue = HUE.hot), (v = braking ? 1 : 0.7);
      else if (r === CAR.length - 1) v = 0.3;
      else if (r === 3 && ch === "▀") (hue = HUE.fg), (v = 0.68);
      for (let sy = 0; sy < scale; sy++)
        for (let sx = 0; sx < scale; sx++) f.set(x0 + c * scale + sx, y0 + r * scale + sy, v * fade, hue, G(ch));
    }
  }
  // exhaust pops on upshift
  if (st.shift > 0) {
    const ex = x0 + 3 * scale, ey = y0 + h;
    f.set(ex, ey, st.shift * 3, HUE.hot, G(Math.sin(t * 60) > 0 ? "*" : "x"));
    f.set(ex + 1, ey, st.shift * 2, HUE.main, G("°"));
  }
}

function drawHud(f, S, rpm, braking, fade, t) {
  const lap = ((Math.floor(st.pos / N) + 1) % 5) + 1;
  const delta = Math.sin(st.pos * 0.013) * 0.4;
  f.text(2, 1, `LAP ${lap}/5`, HUE.fg, 0.75 * fade);
  const ds = (delta < 0 ? "-" : "+") + Math.abs(delta).toFixed(3);
  if (S.cols > 34) f.text(12, 1, ds, delta < 0 ? HUE.alt : HUE.hot, 0.8 * fade);
  f.text(2, 2, `${String(Math.round(st.speed)).padStart(3, " ")} km/h`, HUE.main, 0.95 * fade);
  f.text(2, 3, `[${st.gear}]`, HUE.white, 0.9 * fade);
  const L = 12;
  const filled = Math.round(rpm * L);
  for (let i = 0; i < L; i++) {
    const hue = i < L * 0.58 ? HUE.alt : i < L * 0.84 ? HUE.main : HUE.hot;
    const on = i < filled;
    f.set(6 + i, 3, (on ? 0.92 : 0.22) * fade, hue, on ? FULL : LITE);
  }
  if (rpm > 0.93 && Math.sin(t * 30) > 0) f.text(6 + L + 1, 3, "SHIFT", HUE.hot, fade);
  if (braking) f.text(2, 4, "BRAKE", HUE.hot, 0.7 * fade);
}

export default {
  id: "road",
  title: "SIMRACING",
  caption: "late apex, early throttle, no traction control",

  init(f, S) {
    const portrait = S.rows * S.ax > S.cols * 0.75;
    st.portrait = portrait;
    st.hz = Math.round(S.rows * (portrait ? 0.44 : 0.42));
    const n = DRAW + 2;
    st.py = new Float32Array(n);
    st.pcx = new Float32Array(n);
    st.pw = new Float32Array(n);
    st.pdz = new Float32Array(n);
    st.clip = new Float32Array(n);
    st.tops = new Float32Array(S.cols);
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const hz = st.hz;
    const fade = smooth(0, 0.8, t);
    f.clear();

    // ---- physics: brake for curves ahead, gears follow speed ----
    let base = Math.floor(st.pos);
    let ahead = 0;
    for (let k = 8; k < 60; k += 2) ahead += Math.abs(curve[(base + k) % N]);
    const target = 296 - Math.min(170, ahead * 520);
    const braking = target < st.speed - 6;
    st.speed += clamp(target - st.speed, -120 * dt, 38 * dt);
    st.pos += (st.speed / 290) * 32 * dt;
    base = Math.floor(st.pos);
    const gear = clamp(1 + Math.floor((st.speed - 20) / 48), 1, 6);
    if (gear > st.gear) st.shift = 0.35;
    st.gear = gear;
    st.shift = Math.max(0, st.shift - dt);
    const lo = 20 + (gear - 1) * 48;
    const rpm = gear === 6 ? clamp(0.6 + (st.speed - lo) / 110, 0, 0.97) : clamp(0.35 + (0.65 * (st.speed - lo)) / 48);
    const camTarget = input.inside ? (input.x / cols - 0.5) * 1.3 : Math.sin(t * 0.35) * 0.28;
    st.camX = lerp(st.camX, camTarget, Math.min(1, dt * 2.5));
    st.sky += curve[base % N] * st.speed * dt * 0.9;

    // ---- stars ----
    for (let y = 0; y < hz - 2; y++) {
      for (let x = 0; x < cols; x++) {
        const h = hash2(x * 3 + 11, y * 7 + 5);
        if (h < 0.988) continue;
        const tw = 0.5 + 0.5 * Math.sin(t * 2.3 + h * 300);
        f.set(x, y, (0.12 + 0.33 * tw) * fade * (1 - (y / hz) * 0.5), HUE.fg, h > 0.997 ? PLUS : DOT);
      }
    }

    // ---- synthwave sun with cut lines ----
    const R = Math.min(cols * (st.portrait ? 0.4 : 0.26), (hz * 0.92) / (ax * 1.3));
    const sx = cols * 0.5 - st.sky * 0.15;
    const sy = hz - R * ax * 0.5;
    for (let y = Math.max(0, Math.floor(sy - R * ax * 1.3)); y < hz; y++) {
      const dy = (y - sy) / ax;
      const u = (y - (sy - R * ax)) / (2 * R * ax);
      const cut = u > 0.32 && fract(u * 9 - t * 0.3) < (u - 0.32) * 1.4;
      const hw = R * 1.3;
      for (let x = Math.max(0, Math.floor(sx - hw)); x <= Math.min(cols - 1, Math.ceil(sx + hw)); x++) {
        const d = Math.hypot(x - sx, dy);
        if (d <= R) {
          if (cut) continue;
          f.set(x, y, (0.97 - u * 0.32) * fade, u < 0.5 ? HUE.main : HUE.hot);
        } else {
          const g = 1 - (d - R) / (R * 0.3);
          if (g > 0) f.plot(x, y, g * g * 0.24 * fade, HUE.hot);
        }
      }
    }

    // ---- two mountain ranges with parallax ----
    const tops = st.tops;
    for (let layer = 0; layer < 2; layer++) {
      const par = layer ? 0.9 : 0.45;
      const amp = (layer ? 0.14 : 0.3) * hz;
      const freq = layer ? 0.04 : 0.024;
      for (let x = 0; x < cols; x++) {
        const n = fbm2((x + st.sky * par) * freq, layer * 7.7, 3);
        tops[x] = hz - amp * clamp(0.22 + Math.abs(n) * 1.9, 0, 1.3);
      }
      const rv = (layer ? 0.7 : 0.42) * fade;
      for (let x = 0; x < cols; x++) {
        const ty = Math.round(tops[x]);
        for (let y = Math.max(0, ty + 1); y < hz; y++) {
          const hatch = (y - ty) % 3 === 0 && hash2(x * 5 + layer, y) < (layer ? 0.18 : 0.35);
          f.set(x, y, hatch ? 0.1 * fade : 0, HUE.alt, hatch ? DOT : -1);
        }
        const l = tops[Math.max(0, x - 1)], r = tops[Math.min(cols - 1, x + 1)];
        const slope = r - l;
        const g = l > tops[x] + 0.3 && r > tops[x] + 0.3 ? CARET : slope < -0.7 ? SLASH : slope > 0.7 ? BSLASH : DASH;
        f.set(x, ty, rv, HUE.alt, g);
        const prev = Math.round(l);
        for (let y = Math.min(prev, ty) + 1; y < Math.max(prev, ty); y++) f.set(x, y, rv * 0.85, HUE.alt, prev > ty ? SLASH : BSLASH);
      }
    }
    for (let x = 0; x < cols; x++) f.set(x, hz, 0.5 * fade, HUE.alt, HLINE);
    for (let y = hz + 1; y < rows; y++)
      for (let x = 0; x < cols; x++) if (hash2(x, y + 99) < 0.05) f.set(x, y, 0.08 * fade, HUE.alt, DOT);

    // ---- project segments ----
    const { py, pcx, pw, pdz, clip } = st;
    const frac = st.pos - base;
    const D = 2;
    const Py = ((rows - hz) * 1.6) / (CAM_H * ax);
    const Px = Math.min(Py, cols * 0.78);
    const camY = CAM_H + lerp(hill[base % N], hill[(base + 1) % N], frac);
    const n = Math.max(3, Math.floor(DRAW * smooth(0, 1.4, t)));
    let x = 0, dx = -curve[base % N] * frac;
    for (let k = 0; k <= n; k++) {
      const seg = (base + k) % N;
      const dz = k - frac + D;
      py[k] = hz + ((camY - hill[seg]) * Py * ax) / dz;
      pcx[k] = cols / 2 + ((x - st.camX) * Px) / dz;
      pw[k] = (ROAD_W * Px) / dz;
      pdz[k] = dz;
      x += dx;
      dx += curve[seg];
    }

    // ---- road, near to far, clipped by crests ----
    let maxy = rows;
    for (let k = 0; k < n; k++) {
      clip[k] = maxy;
      const y1 = py[k], y2 = py[k + 1];
      if (y2 >= maxy || y2 >= y1) continue;
      const top = Math.max(0, Math.ceil(y2));
      const bot = Math.min(maxy - 1, Math.floor(y1));
      if (bot < top) continue;
      const seg = base + k;
      const fog = (1 - smooth(n * 0.3, n, k)) * fade;
      const kerbRed = (seg >> 1) & 1;
      const dashOn = ((seg / 3) | 0) & 1;
      for (let y = top; y <= bot; y++) {
        const fr = (y1 - y) / (y1 - y2);
        const cx = lerp(pcx[k], pcx[k + 1], fr);
        const w = lerp(pw[k], pw[k + 1], fr);
        const gridRow = seg % 4 === 0 && y === bot;
        for (let xx = 0; xx < cols; xx++) {
          const d = (xx - cx) / w;
          const ad = Math.abs(d);
          const i = y * cols + xx;
          let v = 0, hue = HUE.alt, g = -1;
          if (ad <= 1) {
            if (dashOn && Math.abs(ad - 0.34) * w < Math.max(0.45, 0.03 * w)) {
              v = 0.75;
              hue = HUE.white;
              g = w > 30 ? FULL : -1;
            } else if (hash2(xx * 13, y + seg * 31) < 0.1) {
              v = 0.1;
              hue = HUE.fg;
              g = DOT;
            }
          } else if (ad <= 1.16) {
            v = 0.9;
            hue = kerbRed ? HUE.hot : HUE.white;
            g = fog > 0.75 ? FULL : fog > 0.45 ? DARK : MID;
          } else if (ad <= 1.5) {
            v = hash2(xx * 7, y + seg * 13) < 0.35 ? 0.17 : 0;
            hue = HUE.main;
            g = DOT;
          } else if (gridRow) {
            v = 0.45;
            g = HLINE;
          } else if (hash2(xx * 3, y + seg * 7) < 0.045) {
            v = 0.12;
            g = DOT;
          }
          f.v[i] = v * fog;
          f.h[i] = hue;
          f.g[i] = g;
        }
      }
      maxy = top;
    }

    // ---- roadside lamps, far to near, clipped by nearer crests ----
    for (let k = Math.floor(n * 0.55); k >= 3; k--) {
      if ((base + k) % LAMP_EVERY !== 0) continue;
      const fog = (1 - smooth(n * 0.3, n, k)) * fade;
      const hpx = (1.6 * Math.sqrt(Px * Py) * ax) / pdz[k];
      for (const side of [-1, 1]) {
        const lx = Math.round(pcx[k] + side * 1.65 * pw[k]);
        if (lx < 0 || lx >= cols) continue;
        const yb = Math.min(py[k], clip[k] - 1);
        const yt = py[k] - hpx;
        for (let y = Math.floor(yb); y >= Math.ceil(yt); y--) {
          if (y < 0 || y >= clip[k]) continue;
          f.set(lx, y, 0.5 * fog, HUE.fg, VBAR);
        }
        const hy = Math.round(yt);
        if (hy >= 0 && hy < clip[k]) {
          const arm = Math.max(1, Math.round(pw[k] * 0.35));
          for (let a = 1; a <= arm; a++) f.set(lx - side * a, hy, 0.55 * fog, HUE.fg, HLINE);
          f.set(lx - side * arm, hy + 1, fog, HUE.main, TOP_HALF);
        }
      }
    }

    drawCar(f, S, cols / 2 + (st.camX - camTarget) * 4, rows - 2, braking, t, fade);
    drawHud(f, S, rpm, braking, fade, t);
  },
};
