// Neuromancer: a 20s loop in four beats.
// CHIBA CITY under a static sky → JACK IN tunnel → THE MATRIX, where an iridescent icebreaker
// bores through five ICE shells around a corporate core → BLACK ICE flatline, or (every third
// loop) the core opens and an AI face assembles from data points.
import { HUE, clamp, smooth, lerp, fract, hash1, rng, G, TAU, noise2 } from "../engine/util.js";

const CYCLE = 20;
const T_CITY = 4, T_JACK = 2, T_MATRIX = 10;
const SHELLS = [1.45, 1.9, 2.35, 2.85, 3.35]; // ICE radii, inner → outer
const BREAKS = [8.3, 7.1, 5.9, 4.6, 3.2]; // matrix time each shell gives way (inner → outer)
const ORDER = [4, 3, 2, 1, 0]; // breach order: outer first
const SIGNS = ["CHATSUBO", "NINSEI", "HOTEL", "BAR", "CLINIC", "ARCADE", "OPEN"];
const CORPS = ["SENSE/NET", "HOSAKA", "MAAS-NEOTEK", "ONO-SENDAI"];
const KHUES = [HUE.main, HUE.alt, HUE.white, HUE.hot];
const NOISE = Array.from("!<>-_\\/[]{}=+*^?#░▒").map(G);

let R, AX, cx, cy, F, D, cYw, sYw, cPt, sPt;
let city, colB, ground, cranes;
let armX, armY, armZ, armB;
let objs, frags, sparks, broken, lastCycle;
let faceU, faceV, faceW, faceSX, faceSY, faceSZ;
const g = {};

/* ───────── meshes ───────── */
function box(w, h, d, y0, V, Fc, E) {
  const o = V.length;
  for (const [x, y, z] of [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]) {
    V.push([(x * w) / 2, y0 + y * h, (z * d) / 2]);
  }
  for (const f of [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]) Fc.push(f.map((i) => i + o));
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) E.push([a + o, b + o]);
}
function mesh(type) {
  const V = [], Fc = [], E = [];
  if (type === "zig") {
    box(1.7, 0.45, 1.7, 0, V, Fc, E);
    box(1.2, 0.45, 1.2, 0.45, V, Fc, E);
    box(0.7, 0.45, 0.7, 0.9, V, Fc, E);
  } else if (type === "obelisk") {
    box(0.6, 2.1, 0.6, 0, V, Fc, E);
    const o = V.length;
    V.push([0, 2.65, 0]);
    for (const [a, b] of [[4, 5], [5, 6], [6, 7], [7, 4]]) {
      Fc.push([a, b, o]);
      E.push([a, o]);
    }
  } else {
    // crystal: stretched octahedron
    V.push([0.7, 1.1, 0], [0, 1.1, 0.7], [-0.7, 1.1, 0], [0, 1.1, -0.7], [0, 2.5, 0], [0, -0.3, 0]);
    for (let k = 0; k < 4; k++) {
      Fc.push([k, (k + 1) % 4, 4], [(k + 1) % 4, k, 5]);
      E.push([k, (k + 1) % 4], [k, 4], [k, 5]);
    }
  }
  return { V, F: Fc, E };
}
const MESH = { zig: mesh("zig"), obelisk: mesh("obelisk"), crystal: mesh("crystal") };

// icosahedron for the icebreaker
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map(([x, y, z]) => [x / 1.902, y / 1.902, z / 1.902]);
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/* ───────── projection (camera orbits the origin) ───────── */
function setCam(yaw, pitch) {
  cYw = Math.cos(yaw);
  sYw = Math.sin(yaw);
  cPt = Math.cos(pitch);
  sPt = Math.sin(pitch);
}
function toCam(x, y, z) {
  const x1 = cYw * x - sYw * z, z1 = sYw * x + cYw * z;
  return [x1, cPt * y - sPt * z1, sPt * y + cPt * z1];
}
function projC(x, y, z) {
  const d = z + D;
  if (d < 0.35) return null;
  return [cx + (x / d) * F, cy - (y / d) * F * AX, d];
}
const proj = (x, y, z) => {
  const c = toCam(x, y, z);
  return projC(c[0], c[1], c[2]);
};

/* ───────── shared helpers ───────── */
function hud(f, S, lines) {
  const y0 = S.rows - lines.length - 1;
  lines.forEach(([s, h, v = 0.8], k) => {
    for (let c = 1; c <= s.length + 2; c++) f.set(c, y0 + k, 0);
    f.text(2, y0 + k, s, h, v);
  });
}
function center(f, S, y, s, h, v) {
  const x = Math.round(S.cols / 2 - s.length / 2);
  for (let c = x - 1; c <= x + s.length; c++) f.set(c, y, 0);
  f.text(x, y, s, h, v);
}
function glitch(f, S, k, t) {
  const { cols, rows } = S;
  const tick = Math.floor(t * 30);
  for (let r = 0; r < rows; r++) {
    if (hash1(r * 31 + tick * 7) < k * 0.5) {
      const sh = Math.round((hash1(r + tick * 13) - 0.5) * k * 28);
      const o = r * cols;
      const v = f.v.slice(o, o + cols), h = f.h.slice(o, o + cols), gl = f.g.slice(o, o + cols);
      for (let c = 0; c < cols; c++) {
        const s = c - sh;
        f.v[o + c] = s < 0 || s >= cols ? 0 : v[s];
        f.h[o + c] = s < 0 || s >= cols ? 0 : h[s];
        f.g[o + c] = s < 0 || s >= cols ? -1 : gl[s];
      }
    }
  }
  const n = Math.floor(k * cols * rows * 0.025);
  for (let q = 0; q < n; q++) {
    const i = Math.floor(hash1(q * 977 + tick * 131) * cols * rows);
    f.v[i] = 0.35 + hash1(q + tick) * 0.6;
    f.h[i] = hash1(q * 3 + tick) < 0.6 ? HUE.hot : HUE.alt;
    f.g[i] = NOISE[(hash1(q * 7 + tick) * NOISE.length) | 0];
  }
}
function scale(f, k) {
  for (let i = 0; i < f.n; i++) f.v[i] *= k;
}

/* ───────── 1 · CHIBA CITY ───────── */
function buildCity(S) {
  const { cols, rows } = S;
  ground = Math.round(rows * 0.86);
  city = [];
  colB = new Int16Array(cols).fill(-1);
  let x = 0;
  while (x < cols) {
    const w = 3 + Math.floor(R() * 8);
    const h = Math.round(rows * (0.1 + Math.pow(R(), 1.5) * 0.34));
    const b = {
      x0: x,
      x1: Math.min(cols - 1, x + w - 1),
      top: ground - h,
      seed: (R() * 1e6) | 0,
      sign: R() < 0.24 ? SIGNS[(R() * SIGNS.length) | 0] : null,
      hue: [HUE.hot, HUE.alt, HUE.main][(R() * 3) | 0],
      flick: R() < 0.35,
    };
    for (let c = b.x0; c <= b.x1; c++) colB[c] = city.length;
    city.push(b);
    x += w + (R() < 0.35 ? 1 + Math.floor(R() * 2) : 0);
  }
  cranes = [
    { x: Math.round(cols * 0.74), h: Math.round(rows * 0.44), jib: Math.round(cols * 0.16) },
    { x: Math.round(cols * 0.9), h: Math.round(rows * 0.37), jib: -Math.round(cols * 0.11) },
  ];
}

function cityFrame(f, S, tp, t) {
  const { cols, rows } = S;
  const V = f.v, H = f.h, Gg = f.g;
  const tick = Math.floor(t * 24);
  const roll = fract(tp * 0.42) * rows * 1.4 - rows * 0.2;
  for (let y = 0, i = 0; y < rows; y++) {
    const inRoll = Math.abs(y - roll) < 2.5;
    const tear = inRoll ? Math.round((hash1(y * 13 + tick) - 0.5) * 6) : 0;
    for (let x = 0; x < cols; x++, i++) {
      let v = 0, h = HUE.fg, gl = -1;
      const bi = colB[x];
      const b = bi >= 0 ? city[bi] : null;
      if (y >= ground) {
        // harbour: rippling dark water, neon smeared in it
        const r = y - ground;
        const n = noise2(x * 0.22 - t * 0.9, r * 1.3 + t * 0.2);
        v = 0.04 + Math.max(0, n) * 0.1;
        h = HUE.alt;
        gl = n > 0.3 ? G("~") : -1;
        if (b && b.sign && Math.abs(x - (b.x0 + 1)) <= 1 && hash1(x * 7 + r * 3 + tick) < 0.6) {
          v = 0.3 - r * 0.03;
          h = b.hue;
          gl = G("~");
        }
      } else if (b && y >= b.top) {
        // skyline: black mass, roof edge, sparse windows, one vertical sign
        const fy = ground - y, lx = x - b.x0;
        if (y === b.top) {
          v = 0.16;
          gl = G("▄");
        } else if (b.sign && lx === 1 && y - b.top - 2 >= 0 && y - b.top - 2 < b.sign.length) {
          const on = !b.flick || hash1(b.seed + Math.floor(t * 9)) > 0.18;
          v = on ? 0.85 : 0.15;
          h = b.hue;
          gl = G(b.sign[y - b.top - 2]);
        } else if (lx % 2 === 1 && fy % 2 === 0 && x < b.x1) {
          const hl = hash1(b.seed + x * 31 + y * 977);
          if (hl < 0.12) {
            v = (0.3 + hash1(b.seed + y) * 0.35) * (hl < 0.01 && hash1(tick + x) < 0.5 ? 0.2 : 1);
            h = hl < 0.05 ? HUE.alt : HUE.main;
            gl = G("▪");
          }
        }
      } else {
        // sky: grey static, a sync bar rolling down through it
        const hh = hash1((x + tear) * 7 + y * 7919 + tick * 104729);
        v = 0.03 + 0.24 * hh * hh * hh;
        if (inRoll) v = v * 2 + 0.06;
        if (Math.abs(y - roll + 2.5) < 0.5) {
          v = 0.32;
          gl = G("─");
        }
      }
      V[i] = v;
      H[i] = h;
      Gg[i] = gl;
    }
  }
  // harbour cranes
  for (const c of cranes) {
    const top = ground - c.h;
    f.line(c.x, ground - 1, c.x, top, 0.22, HUE.fg, G("│"));
    f.line(c.x - c.jib * 0.3, top, c.x + c.jib, top, 0.22, HUE.fg, G("─"));
    f.line(c.x, top - 3, c.x + c.jib * 0.95, top, 0.14, HUE.fg, "auto", AX);
    f.line(c.x, top - 3, c.x - c.jib * 0.3, top, 0.14, HUE.fg, "auto", AX);
    f.line(c.x + c.jib * 0.8, top + 1, c.x + c.jib * 0.8, top + Math.round(c.h * 0.4), 0.12, HUE.fg, G("│"));
    if (Math.sin(t * 3 + c.x) > 0.2) f.set(c.x, top - 4, 0.9, HUE.hot, G("•"));
  }
  hud(f, S, [
    ["CHIBA CITY · 03:12", HUE.fg, 0.7],
    ["sky: ch.00 · no signal", HUE.fg, 0.45],
  ]);
}

/* ───────── 2 · JACK IN ───────── */
function jackFrame(f, S, tj, t) {
  const { cols, rows } = S;
  const p = tj / T_JACK;
  const V = f.v, H = f.h, Gg = f.g;
  const tick = Math.floor(t * 24);
  const Rmax = Math.hypot(cols / 2, rows / AX / 2) * 1.05;
  const k = clamp(p / 0.45);
  const Rk = Rmax * Math.pow(1 - k, 2.2);
  // static collapses into a point, glowing hotter as it shrinks
  for (let y = 0, i = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++, i++) {
      const d = Math.hypot(x - cx, (y - cy) / AX);
      let v = 0, h = HUE.fg;
      if (d < Rk) {
        const hh = hash1(x * 7 + y * 7919 + tick * 104729);
        v = (0.04 + 0.26 * hh * hh * hh) * (1 + k * 2.5);
        if (k > 0.6) h = HUE.white;
      } else if (k < 1 && Math.abs(d - Rk) < 1.1) {
        v = 0.7;
        h = HUE.alt;
      }
      V[i] = v;
      H[i] = h;
      Gg[i] = -1;
    }
  }
  if (p > 0.38 && p < 0.55) f.disc(cx, cy, 1.5, 1, HUE.white, AX);
  // then the tunnel: data streaks rushing past
  if (p > 0.42) {
    const q = (p - 0.42) / 0.58;
    for (let s = 0; s < 280; s++) {
      const a = hash1(s * 13 + 5) * TAU;
      const ph = fract(hash1(s * 3 + 1) + q * (0.8 + hash1(s * 7) * 1.1) * 2.2);
      const r = ph * ph * Rmax * 1.2, len = 1 + r * 0.28;
      const ca = Math.cos(a), sa = Math.sin(a);
      const hue = s % 7 === 0 ? HUE.main : s % 3 === 0 ? HUE.white : HUE.alt;
      f.line(cx + ca * r, cy + sa * r * AX, cx + ca * (r + len), cy + sa * (r + len) * AX, 0.25 + 0.7 * ph, hue, "auto", AX);
    }
  }
  // white-out
  const w = smooth(0.84, 1, p);
  if (w > 0) {
    for (let i = 0; i < f.n; i++) {
      if (V[i] < w * 0.85) {
        V[i] = w * 0.85;
        H[i] = HUE.white;
        Gg[i] = w > 0.75 ? G("█") : -1;
      }
    }
  }
  if (p < 0.84 && Math.floor(t * 8) % 2 === 0) center(f, S, Math.round(cy + rows * 0.3), "▮ JACK IN", HUE.main, 0.95);
  hud(f, S, [
    ["ONO-SENDAI CYBERSPACE 7", HUE.fg, 0.6],
    ["deck: live · trodes: on", HUE.fg, 0.45],
  ]);
}

/* ───────── 3 · THE MATRIX ───────── */
function buildMatrix() {
  const n = 900;
  armX = new Float32Array(n);
  armY = new Float32Array(n);
  armZ = new Float32Array(n);
  armB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // stored polar: radius, angle, depth — drawn face-on behind the core, in camera space
    const arm = i % 3, s = R();
    armX[i] = 3 + s * 20 + (R() - 0.5) * 1.4;
    armY[i] = (arm / 3) * TAU + s * 3.6 + (R() - 0.5) * 0.3;
    armZ[i] = 9 + R() * 6;
    armB[i] = R() < 0.08 ? 0.55 : 0.12 + R() * 0.18;
  }
  objs = [];
  const types = ["zig", "obelisk", "crystal", "zig", "obelisk", "crystal"];
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * TAU + R() * 0.4, r = 4.6 + R() * 3.6;
    objs.push({
      x: Math.cos(a) * r,
      y: -1.6 + (R() - 0.5) * 3.5,
      z: Math.sin(a) * r,
      type: types[k % types.length],
      s: 0.7 + R() * 0.6,
      rot: R() * TAU,
      rs: (R() - 0.5) * 0.4,
      hue: R() < 0.6 ? HUE.alt : HUE.main,
      label: k < CORPS.length ? CORPS[k] : null,
    });
  }
  // a face made of data points (rare ending)
  const U = [], Vv = [], W = [];
  const push = (u, v, w) => (U.push(u), Vv.push(v), W.push(w));
  for (let k = 0; k < 90; k++) {
    const a = (k / 90) * TAU;
    push(0.78 * Math.cos(a), Math.sin(a), 0.55);
  }
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * TAU;
      push(sx * 0.32 + 0.17 * Math.cos(a), 0.22 + 0.07 * Math.sin(a), 0.75);
    }
    for (let k = 0; k < 4; k++) push(sx * 0.32 + (k % 2) * 0.03, 0.22 + (k > 1 ? 0.02 : 0), 1);
    for (let k = 0; k < 9; k++) push(sx * (0.15 + k * 0.042), 0.4 + k * 0.006 * (k < 5 ? 1 : -1), 0.6);
    for (let k = 0; k < 10; k++) push(sx * (0.62 - k * 0.02), -0.1 - k * 0.07, 0.4);
  }
  for (let k = 0; k < 9; k++) push(0.01 * k, 0.15 - k * 0.04, 0.55);
  for (let k = 0; k < 6; k++) push(-0.09 + k * 0.036, -0.21, 0.6);
  for (let k = 0; k < 17; k++) {
    const x = -0.28 + k * 0.035;
    push(x, -0.46 - 0.04 * Math.cos((x / 0.28) * 1.4), 0.8);
  }
  for (let k = 0; k < 140; k++) {
    const a = R() * TAU, r = Math.sqrt(R()) * 0.95;
    push(0.78 * r * Math.cos(a), r * Math.sin(a), 0.18);
  }
  faceU = Float32Array.from(U);
  faceV = Float32Array.from(Vv);
  faceW = Float32Array.from(W);
  const n2 = U.length;
  faceSX = new Float32Array(n2);
  faceSY = new Float32Array(n2);
  faceSZ = new Float32Array(n2);
  for (let i = 0; i < n2; i++) {
    const a = R() * TAU, b = Math.acos(2 * R() - 1), r = 2 + R() * 2.5;
    faceSX[i] = Math.sin(b) * Math.cos(a) * r;
    faceSY[i] = Math.cos(b) * r;
    faceSZ[i] = Math.sin(b) * Math.sin(a) * r;
  }
}

function resetRun() {
  frags = [];
  sparks = [];
  broken = [false, false, false, false, false];
}

// shell lattice in world space, rotating with time
function shellPoints(k, t) {
  const r = SHELLS[k];
  const rY = t * (0.22 + 0.07 * k) * (k % 2 ? -1 : 1), rX = 0.45 + 0.35 * k;
  const cy1 = Math.cos(rY), sy1 = Math.sin(rY), cx1 = Math.cos(rX), sx1 = Math.sin(rX);
  const pts = [];
  const lats = [-1.05, -0.52, 0, 0.52, 1.05];
  for (const phi of lats) {
    for (let j = 0; j < 24; j++) {
      const th = (j / 24) * TAU;
      let x = Math.cos(phi) * Math.cos(th) * r, y = Math.sin(phi) * r, z = Math.cos(phi) * Math.sin(th) * r;
      const y1 = y * cx1 - z * sx1, z1 = y * sx1 + z * cx1;
      pts.push([x * cy1 + z1 * sy1, y1, -x * sy1 + z1 * cy1]);
    }
  }
  for (const s of [-1, 1]) {
    const y = s * r, z = 0;
    const y1 = y * cx1 - z * sx1, z1 = y * sx1 + z * cx1;
    pts.push([z1 * sy1, y1, z1 * cy1]);
  }
  return pts;
}

function kuangPos(tm) {
  // camera-frame waypoints: arrive from upper right, then drill shell after shell
  const off = (z) => [0.62, 0.45, -z];
  const pts = [[1.0, [2.6, 1.6, -D + 2.6]]];
  for (const k of ORDER) {
    pts.push([BREAKS[k] - 0.45, off(SHELLS[k] + 0.32)], [BREAKS[k], off(SHELLS[k] + 0.32)]);
  }
  pts.push([9.0, off(1.25)]);
  if (tm <= pts[0][0]) return [...pts[0][1], false];
  for (let i = 1; i < pts.length; i++) {
    const [t0, a] = pts[i - 1], [t1, b] = pts[i];
    if (tm <= t1) {
      const e = smooth(0, 1, (tm - t0) / Math.max(0.001, t1 - t0));
      const drilling = a[2] === b[2] || i === pts.length - 1;
      return [lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2], e), drilling];
    }
  }
  return [...pts[pts.length - 1][1], true];
}

function drawObj(f, o, t) {
  const m = MESH[o.type];
  const c = Math.cos(o.rot + t * o.rs), s = Math.sin(o.rot + t * o.rs);
  const cam = m.V.map(([x, y, z]) => {
    const X = o.x + (x * c + z * s) * o.s, Y = o.y + y * o.s, Z = o.z + (-x * s + z * c) * o.s;
    return toCam(X, Y, Z);
  });
  const P = cam.map((p) => projC(p[0], p[1], p[2]));
  const depth = P[0] ? P[0][2] : 99;
  // fade by distance, and dissolve constructs the orbiting camera gets too close to
  const fade = clamp(1.5 - depth / 20) * smooth(3, 5.5, depth) * (o.dim ?? 1);
  if (fade <= 0) return;
  // translucent faces, far → near, back faces skipped
  const faces = m.F.map((fc) => {
    let dz = 0;
    for (const i of fc) dz += cam[i][2];
    return [dz / fc.length, fc];
  }).sort((a, b) => b[0] - a[0]);
  for (const [, fc] of faces) {
    const a = cam[fc[0]], b = cam[fc[1]], d = cam[fc[2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * a[0] + ny * a[1] + nz * (a[2] + D) >= 0) continue;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const lam = clamp((-nx * 0.3 + ny * 0.7 - nz * 0.6) / nl);
    const pts = fc.map((i) => P[i]);
    if (pts.some((p) => !p)) continue;
    f.poly(pts, (0.07 + 0.17 * lam) * fade, o.hue);
  }
  for (const [a, b] of m.E) {
    if (P[a] && P[b]) f.line(P[a][0], P[a][1], P[b][0], P[b][1], 0.55 * fade, o.hue, "auto", AX);
  }
  if (o.label && depth < 13) {
    const top = P[P.length - 1] || P[0];
    if (top) f.text(Math.round(top[0] - o.label.length / 2), Math.round(top[1] - 2), o.label, HUE.fg, 0.5 * fade);
  }
}

function eeg(f, S, x0, y0, w, h, bpm, amp, t, flat) {
  const label = flat ? (Math.floor(t * 4) % 2 ? "FLATLINE" : "") : `EEG · ${Math.round(bpm)} bpm`;
  for (let c = 0; c < w; c++) f.set(x0 + c, y0 - 1, 0);
  if (label) f.text(x0, y0 - 1, label, flat ? HUE.hot : HUE.fg, flat ? 0.95 : 0.5);
  let px = 0, py = 0;
  for (let c = 0; c < w; c++) {
    const tt = t - (w - 1 - c) * 0.035;
    const ph = fract((tt * bpm) / 60);
    let s = 0;
    if (ph < 0.03) s = -0.15;
    else if (ph < 0.06) s = 1;
    else if (ph < 0.09) s = -0.45;
    else if (ph > 0.3 && ph < 0.42) s = 0.22 * Math.sin(((ph - 0.3) / 0.12) * Math.PI);
    const x = x0 + c, y = y0 + h / 2 - s * amp * (h / 2 - 0.5);
    if (c > 0) f.line(px, py, x, y, flat ? 0.75 : 0.6, flat ? HUE.hot : HUE.alt, "auto", AX);
    px = x;
    py = y;
  }
}

/* mode: "matrix" | "ice" | "wm"; tq = time into the ending (0 while still in the matrix) */
function matrixFrame(f, S, tm, dt, t, mode, tq, variant) {
  const { cols, rows } = S;
  const V = f.v, H = f.h, Gg = f.g;
  D = 11.5 - clamp(tm / 12) * 2.6;
  setCam(0.35 + tm * 0.07, 0.24 + 0.05 * Math.sin(tm * 0.3));

  // breaches
  for (const k of ORDER) {
    if (variant === "ice" && k === 0) continue;
    if (!broken[k] && tm >= BREAKS[k]) {
      broken[k] = true;
      for (const p of shellPoints(k, t).slice(0, 120)) {
        const l = Math.hypot(p[0], p[1], p[2]) || 1;
        const sp = 1.4 + R() * 2.6;
        const q = [p[0] + (R() - 0.5) * 0.5, p[1] + (R() - 0.5) * 0.5, p[2] + (R() - 0.5) * 0.5];
        frags.push({ a: p, b: q, v: [(p[0] / l) * sp + (R() - 0.5), (p[1] / l) * sp + (R() - 0.5), (p[2] / l) * sp + (R() - 0.5)], life: 1.6 });
      }
    }
  }

  // data arms
  for (let i = 0; i < armX.length; i++) {
    const a = armY[i] + t * 0.05;
    const p = projC(Math.cos(a) * armX[i], Math.sin(a) * armX[i] * 0.8, armZ[i]);
    if (!p) continue;
    const tw = armB[i] > 0.5 ? 0.7 + 0.3 * Math.sin(t * 3 + i) : 1;
    f.plot(p[0], p[1], armB[i] * tw * clamp(1.25 - p[2] / 28), i % 5 === 0 ? HUE.main : HUE.alt);
  }

  // core position and size
  const pc = proj(0, 0, 0);
  const coreD = pc[2];
  const rr = (F * 1.0) / coreD;

  // constructs behind the core, then the core, then those in front
  const order = objs.map((o) => [toCam(o.x, o.y, o.z)[2], o]).sort((a, b) => b[0] - a[0]);
  for (const o of objs) o.dim = mode === "wm" ? 1 - 0.6 * smooth(0, 1, tq) : 1;
  for (const [z, o] of order) if (z >= 0) drawObj(f, o, t);

  // core: shaded sphere; in the rare ending it splits open
  const open = mode === "wm" ? smooth(0, 0.8, tq) : 0;
  const y0 = Math.floor(pc[1] - rr * AX * 1.4), y1 = Math.ceil(pc[1] + rr * AX * 1.4);
  for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++) {
    for (let x = Math.max(0, Math.floor(pc[0] - rr * 1.4)); x <= Math.min(cols - 1, Math.ceil(pc[0] + rr * 1.4)); x++) {
      const dx = (x - pc[0]) / rr, dy = (y - pc[1]) / (rr * AX);
      const d2 = dx * dx + dy * dy;
      const i = y * cols + x;
      if (d2 < 1) {
        if (open > 0 && Math.abs(dy) < open * 0.55) {
          if (Math.abs(Math.abs(dy) - open * 0.55) < 0.12) {
            V[i] = 0.8;
            H[i] = HUE.alt;
            Gg[i] = G("─");
          } else {
            V[i] = 0.04;
            Gg[i] = -1;
          }
          continue;
        }
        const nz = Math.sqrt(1 - d2);
        const lam = clamp(-dx * 0.45 - dy * 0.5 + nz * 0.74);
        const band = 0.08 * Math.sin(dy * 18 + t * 3);
        V[i] = (0.22 + 0.62 * lam + band) * (mode === "ice" ? 1 - 0.4 * smooth(0, 1.5, tq) : 1 - 0.75 * smooth(0.3, 1.5, tq));
        H[i] = lam > 0.85 ? HUE.white : HUE.main;
        Gg[i] = -1;
      } else if (d2 < 1.9) {
        const k = (1.9 - d2) / 0.9;
        if (k * 0.16 > V[i]) {
          V[i] = k * 0.16;
          H[i] = HUE.main;
          Gg[i] = -1;
        }
      }
    }
  }

  // ICE shells
  for (let k = 0; k < SHELLS.length; k++) {
    if (broken[k]) continue;
    const pts = shellPoints(k, t).map((p) => proj(p[0], p[1], p[2]));
    const blackIce = variant === "ice" && k === 0 && tm > BREAKS[1] + 0.8;
    const warn = tm > BREAKS[k] - 0.45 && tm < BREAKS[k] && !(variant === "ice" && k === 0);
    const tick = Math.floor(t * 20);
    const seg = (a, b) => {
      const A = pts[a], B = pts[b];
      if (!A || !B) return;
      const md = (A[2] + B[2]) / 2;
      const behind = md > coreD;
      if (behind) {
        const mx = (A[0] + B[0]) / 2 - pc[0], my = ((A[1] + B[1]) / 2 - pc[1]) / AX;
        if (mx * mx + my * my < rr * rr * 1.1) return;
      }
      let v = behind ? 0.12 : 0.4 + 0.05 * k;
      let h = HUE.hot;
      if (warn) {
        const fl = hash1(a * 7 + tick);
        v *= fl > 0.5 ? 1.6 : 0.6;
        if (fl > 0.85) h = HUE.white;
      }
      if (blackIce) v = (behind ? 0.3 : 0.9) * (0.75 + 0.25 * Math.sin(t * 9));
      f.line(A[0], A[1], B[0], B[1], v, h, behind ? undefined : "auto", AX);
    };
    for (let i = 0; i < 5; i++) for (let j = 0; j < 24; j++) seg(i * 24 + j, i * 24 + ((j + 1) % 24));
    for (let j = 0; j < 24; j += 2) {
      seg(120, j);
      for (let i = 0; i < 4; i++) seg(i * 24 + j, (i + 1) * 24 + j);
      seg(4 * 24 + j, 121);
    }
  }

  for (const [z, o] of order) if (z < 0) drawObj(f, o, t);

  if (mode !== "wm") {
    const lab = "TESSIER-ASHPOOL S.A.";
    const outer = broken.lastIndexOf(false);
    const ly = Math.round(pc[1] + ((F * (outer >= 0 ? SHELLS[outer] : 1)) / coreD) * AX + 2);
    if (ly < rows - 4) f.text(Math.round(pc[0] - lab.length / 2), ly, lab, HUE.fg, 0.55);
  }

  // shell fragments flying apart
  for (let i = frags.length - 1; i >= 0; i--) {
    const fr = frags[i];
    fr.life -= dt;
    if (fr.life <= 0) {
      frags.splice(i, 1);
      continue;
    }
    for (const p of [fr.a, fr.b]) {
      p[0] += fr.v[0] * dt;
      p[1] += fr.v[1] * dt;
      p[2] += fr.v[2] * dt;
    }
    const A = proj(fr.a[0], fr.a[1], fr.a[2]), B = proj(fr.b[0], fr.b[1], fr.b[2]);
    if (A && B) f.line(A[0], A[1], B[0], B[1], 0.8 * (fr.life / 1.6), fr.life > 1.25 ? HUE.white : HUE.hot, "auto", AX);
  }

  // the icebreaker
  const kVis = tm > 1.0 ? (mode === "ice" ? 1 - smooth(0, 0.6, tq) : mode === "wm" ? 1 - smooth(0, 0.7, tq) : 1) : 0;
  if (kVis > 0) {
    const [kx, ky, kz, drilling] = kuangPos(Math.min(tm, 10));
    const jit = drilling ? 0.03 : 0;
    const a1 = t * 1.9, a2 = t * 1.3;
    const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
    const sc = 0.55 * (1 + 0.06 * Math.sin(t * 11));
    const cam = ICO_V.map(([x, y, z]) => {
      const x1 = x * c1 - z * s1, z1 = x * s1 + z * c1;
      const y2 = y * c2 - z1 * s2, z2 = y * s2 + z1 * c2;
      return [kx + x1 * sc + (hash1(Math.floor(t * 40)) - 0.5) * jit, ky + y2 * sc, kz + z2 * sc];
    });
    const P = cam.map((p) => projC(p[0], p[1], p[2]));
    const faces = ICO_F.map((fc, fi) => [(cam[fc[0]][2] + cam[fc[1]][2] + cam[fc[2]][2]) / 3, fc, fi]).sort((a, b) => b[0] - a[0]);
    for (const [, fc, fi] of faces) {
      const a = cam[fc[0]], b = cam[fc[1]], d = cam[fc[2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * a[0] + ny * a[1] + nz * (a[2] + D) >= 0) continue;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const lam = clamp((-nx * 0.4 + ny * 0.6 - nz * 0.7) / nl);
      const pts = fc.map((i) => P[i]);
      if (pts.some((p) => !p)) continue;
      f.poly(pts, (0.4 + 0.55 * lam) * kVis, KHUES[(fi + Math.floor(t * 3)) % 4]);
    }
    for (const fc of ICO_F) {
      for (let e = 0; e < 3; e++) {
        const A = P[fc[e]], B = P[fc[(e + 1) % 3]];
        if (A && B && (A[2] + B[2]) / 2 < kz + D) f.line(A[0], A[1], B[0], B[1], 0.7 * kVis, HUE.white, "auto", AX);
      }
    }
    if (drilling && mode !== "ice") {
      for (let s = 0; s < 6; s++) {
        sparks.push({ x: kx, y: ky, z: kz + 0.2, vx: (R() - 0.5) * 3.5, vy: (R() - 0.5) * 3.5, vz: -R() * 2, life: 0.3 + R() * 0.3 });
      }
    }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    if (s.life <= 0) {
      sparks.splice(i, 1);
      continue;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    const p = projC(s.x, s.y, s.z);
    if (p) f.plot(p[0], p[1], 0.5 + s.life, s.life > 0.35 ? HUE.white : s.life > 0.2 ? HUE.main : HUE.hot);
  }
  if (sparks.length > 400) sparks.splice(0, sparks.length - 400);

  return { pc, rr };
}

/* ───────── 4 · endings ───────── */
function tendrils(f, S, pc, tq, t) {
  const { cols, rows } = S;
  const Rs = Math.hypot(cols, rows / AX) * 0.7;
  for (let i = 0; i < 11; i++) {
    const L = Rs * Math.pow(smooth(0, 1, (tq - i * 0.07) / 1.2), 1.6);
    if (L < 1) continue;
    const base = (i / 11) * TAU + hash1(i * 17) * 0.5;
    let px = pc[0], py = pc[1];
    for (let s = 1; s <= 36; s++) {
      const u = s / 36;
      const ang = base + 0.9 * u * Math.sin(t * 5 + i * 1.7 + u * 4);
      const x = pc[0] + Math.cos(ang) * u * L, y = pc[1] + Math.sin(ang) * u * L * AX;
      const v = u > 0.95 ? 1 : 0.85 - 0.3 * u;
      const tw = Math.round(u * u * 3 * smooth(0, 1.5, tq));
      const nx = -Math.sin(ang), ny = Math.cos(ang) * AX;
      for (let w = -tw; w <= tw; w++) f.line(px + nx * w, py + ny * w, x + nx * w, y + ny * w, v, u > 0.95 ? HUE.white : HUE.hot, undefined, AX);
      px = x;
      py = y;
    }
  }
}

function face(f, S, tq, t) {
  const form = 1 - Math.pow(1 - clamp((tq - 0.3) / 1.4), 3);
  const diss = smooth(3.0, 3.6, tq);
  const yaw = Math.sin(t * 0.7) * 0.3, cyw = Math.cos(yaw), syw = Math.sin(yaw);
  const breathe = 1 + 0.02 * Math.sin(t * 2);
  for (let i = 0; i < faceU.length; i++) {
    const u = faceU[i] * 1.35 * breathe, v = faceV[i] * 1.8 * breathe;
    const bul = -Math.sqrt(Math.max(0, 1 - (faceU[i] / 0.78) ** 2 - faceV[i] ** 2)) * 0.6;
    const X = cyw * u + syw * bul, Z = -syw * u + cyw * bul;
    let x = lerp(faceSX[i], X, form), y = lerp(faceSY[i], v + 0.15, form), z = lerp(faceSZ[i], Z - 2.2, form);
    if (diss > 0) {
      x += faceSX[i] * diss * 0.8;
      y += faceSY[i] * diss * 0.8;
      z += faceSZ[i] * diss * 0.8;
    }
    const p = projC(x, y, z);
    if (!p) continue;
    const w = faceW[i];
    const val = (0.25 + 0.75 * w) * (1 - diss) * (0.4 + 0.6 * form) * (0.85 + 0.15 * Math.sin(t * 4 + i));
    f.plot(p[0], p[1], val, w > 0.95 ? HUE.white : w > 0.78 ? HUE.main : HUE.alt);
  }
  if (tq > 1.4 && diss < 1) {
    const p = projC(0, -2.05, -2.2);
    if (p) {
      const lab = "WINTERMUTE";
      f.text(Math.round(p[0] - lab.length / 2), Math.round(p[1]), lab, HUE.alt, smooth(1.4, 2.2, tq) * (1 - diss));
    }
  }
}

/* ───────── scene ───────── */
export default {
  id: "neuromancer",
  title: "NEUROMANCER",
  caption: "static sky, a deck, and five layers of ice",

  init(f, S) {
    R = rng(1984);
    AX = S.ax;
    const physH = S.rows / S.ax;
    const landscape = S.cols > physH * 1.25;
    cx = S.cols * (landscape ? 0.6 : 0.5);
    cy = S.rows * 0.46;
    F = Math.min(S.cols, physH) * (landscape ? 0.8 : 1.2);
    D = 11;
    buildCity(S);
    buildMatrix();
    resetRun();
    lastCycle = -1;
  },

  frame(f, t, dt, S) {
    AX = S.ax;
    const cyc = Math.floor(t / CYCLE);
    if (cyc !== lastCycle) {
      lastCycle = cyc;
      resetRun();
    }
    const variant = cyc % 3 === 2 ? "wm" : "ice";
    const tc = t - cyc * CYCLE;
    f.clear();

    if (tc < T_CITY) {
      cityFrame(f, S, tc, t);
      if (cyc > 0 && tc < 0.6) scale(f, tc / 0.6);
      return;
    }
    if (tc < T_CITY + T_JACK) {
      jackFrame(f, S, tc - T_CITY, t);
      return;
    }
    const tm = tc - T_CITY - T_JACK;
    const { cols, rows } = S;
    const eegW = Math.min(26, Math.floor(cols * 0.3));
    const eegX = cols - eegW - 2, eegY = rows - 6;

    if (tm < T_MATRIX) {
      matrixFrame(f, S, tm, dt, t, "matrix", 0, variant);
      // fade in from the white-out
      const w = 1 - smooth(0, 0.6, tm);
      if (w > 0) for (let i = 0; i < f.n; i++) if (f.v[i] < w * 0.85) (f.v[i] = w * 0.85), (f.h[i] = HUE.white), (f.g[i] = -1);
      const nb = broken.filter(Boolean).length;
      const pct = Math.floor(clamp(tm / BREAKS[0]) * (variant === "ice" ? 82 : 100));
      const blackSoon = variant === "ice" && tm > BREAKS[1] + 0.8;
      hud(f, S, [
        ["KUANG GRADE MARK 11", HUE.alt, 0.85],
        [`penetrating ICE ${Math.min(5, nb + 1)}/5 · ${pct}%`, HUE.main, 0.85],
        blackSoon ? ["BLACK ICE DETECTED", HUE.hot, Math.floor(t * 6) % 2 ? 0.95 : 0.4] : ["target: TESSIER-ASHPOOL S.A.", HUE.fg, 0.5],
      ]);
      if (cols >= 60) eeg(f, S, eegX, eegY, eegW, 4, blackSoon ? 96 : 72, 1, t, false);
      return;
    }

    const tq = tm - T_MATRIX;
    if (variant === "ice") {
      if (tq < 3.0) {
        const { pc } = matrixFrame(f, S, tm, dt, t, "ice", tq, variant);
        // the ice infects the view
        const inf = smooth(0.4, 1.8, tq);
        for (let i = 0; i < f.n; i++) {
          if (f.v[i] > 0.04 && hash1(i * 13) < inf) f.h[i] = HUE.hot;
          f.v[i] *= 1 - 0.45 * smooth(0, 1.5, tq);
        }
        tendrils(f, S, pc, tq, t);
        const flat = tq > 1.8;
        if (cols >= 60) eeg(f, S, eegX, eegY, eegW, 4, 72 + 110 * smooth(0, 1.6, tq), flat ? 0 : 1, t, flat);
        hud(f, S, [
          ["BLACK ICE", HUE.hot, 0.95],
          [flat ? "FLATLINE" : "deck overload", HUE.hot, flat && Math.floor(t * 4) % 2 ? 0.95 : 0.55],
        ]);
        if (tq > 2.2) glitch(f, S, smooth(2.2, 3.0, tq), t);
      } else {
        // black, and a single flat trace across the screen
        const yy = Math.round(rows * 0.5);
        f.line(0, yy, cols - 1, yy, 0.6, HUE.hot, G("─"));
        if (Math.floor(t * 3) % 2) center(f, S, yy - 2, "FLATLINE", HUE.hot, 0.9);
        scale(f, 1 - smooth(3.6, 4, tq));
      }
    } else {
      if (tq < 3.6) {
        matrixFrame(f, S, tm, dt, t, "wm", tq, variant);
        face(f, S, tq, t);
        hud(f, S, [
          ["ICE 5/5 · core open", HUE.main, 0.85],
          ["AI · WINTERMUTE", HUE.alt, 0.85],
        ]);
        if (tq > 3.1) glitch(f, S, smooth(3.1, 3.6, tq), t);
      }
      // 3.6 → 4.0: black before the city returns
    }
  },
};
