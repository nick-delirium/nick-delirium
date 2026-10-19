// Sim racing, modern F1 at night: chase-cam behind a detailed car on a segment-projected
// circuit with kerbs, sausage kerbs, gravel, TecPro + catch fencing, grandstands, floodlights,
// braking boards, a DRS zone, a car ahead to hunt down and a steering-wheel HUD.
import { HUE, clamp, lerp, smooth, noise2, hash2, rng, G, TAU } from "../engine/util.js";

const C = 0.001;
const D = 0.9;
const DD = 230;
const NEAR = 0.04;
const CAR_HW = 0.36; // car half width, in road half-widths (tight street-circuit feel)

const g = {
  full: G("█"), dark: G("▓"), mid: G("▒"), lite: G("░"), up: G("▀"), lo: G("▄"), hl: G("─"),
  vb: G("│"), x: G("╳"), dot: G("·"), tri: G("▲"), sq: G("■"), sm: G("▪"), led: G("●"), off: G("○"),
  lh: G("▌"), rh: G("▐"), fs: G("╱"), bs: G("╲"), haze: G("≈"), star: G("*"), flag: G("▶"),
};

// 3×5 pixel digits for the gear readout
const DIGITS = {
  N: ["101", "111", "111", "111", "101"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "010", "010", "010"],
  8: ["111", "101", "111", "101", "111"],
};
const GEAR_AT = [0, 95, 135, 170, 205, 240, 275, 305, 999];

let segs, N, line, tgt, sectorAt;
let st, R, proj, sparks;

function buildTrack() {
  segs = [];
  const starts = [];
  const add = (len, curve, hill, o = {}) => {
    const y0 = segs.length ? segs[segs.length - 1].y2 : 0;
    if (Math.abs(curve) >= 4 * C) starts.push([segs.length, -Math.sign(curve)]);
    for (let i = 0; i < len; i++) {
      const t0 = i / len, t1 = (i + 1) / len;
      const ease = smooth(0, 0.22, t0) * (1 - smooth(0.78, 1, t0));
      segs.push({
        curve: curve * ease,
        y1: y0 + (hill * (1 - Math.cos(Math.PI * t0))) / 2,
        y2: y0 + (hill * (1 - Math.cos(Math.PI * t1))) / 2,
        kerb: Math.abs(curve) >= 2.5 * C && ease > 0.25,
        apex: Math.abs(curve) >= 5 * C && t0 > 0.35 && t0 < 0.65,
        gravel: Math.abs(curve) >= 4 * C ? -Math.sign(curve) : 0,
        inside: Math.sign(curve),
        stands: !!o.stands && t0 > 0.15 && t0 < 0.85,
        drs: !!o.drs && t0 > 0.12,
        drsLine: false,
        board: 0,
        boardSide: 1,
        start: false,
      });
    }
  };
  add(150, 0, 0, { drs: true, stands: true });
  add(45, 7 * C, 0);
  add(40, 0, 3);
  add(70, -3 * C, 0);
  add(24, 0, 0);
  add(18, 6 * C, -1);
  add(18, -6 * C, -1);
  add(100, 0, -2, { drs: true });
  add(50, -9 * C, 0);
  add(60, 0, 1.5, { stands: true });
  add(60, 2.5 * C, 0);
  add(40, 4.5 * C, 1);
  add(70, 0, -1.5);
  N = segs.length;
  segs[0].start = segs[1].start = true;
  for (const [s, side] of starts) {
    for (const [d, v] of [[36, 300], [24, 200], [12, 100]]) {
      const k = (s - d + N) % N;
      segs[k].board = v;
      segs[k].boardSide = side;
    }
  }
  for (let i = 0; i < N; i++) if (segs[i].drs && !segs[(i - 1 + N) % N].drs) segs[i].drsLine = true;

  const avg = (i, a, b) => {
    let s = 0;
    for (let k = a; k <= b; k++) s += segs[(i + k + N) % N].curve;
    return s / (b - a + 1);
  };
  const raw = new Float32Array(N);
  line = new Float32Array(N);
  tgt = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    raw[i] = clamp((0.9 * avg(i, -8, 8) - 0.7 * avg(i, 16, 36) - 0.55 * avg(i, -36, -16)) / (4.5 * C), -0.66, 0.66);
    let m = 0;
    for (let k = 0; k < 48; k += 3) m = Math.max(m, Math.abs(avg(i, k - 4, k + 4)));
    tgt[i] = 330 - 245 * clamp(m / (9 * C));
  }
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -6; k <= 6; k++) s += raw[(i + k + N) % N];
    line[i] = s / 13;
  }
  sectorAt = [0, Math.floor(N / 3), Math.floor((2 * N) / 3)];
}
buildTrack();

/** fill a vertical quad column by column (far edge a → near edge b), rows clipped below `clip` */
function colQuad(f, cols, xa, ta, ba, xb, tb, bb, clip, shade) {
  if (xb < xa) {
    [xa, xb] = [xb, xa];
    [ta, tb] = [tb, ta];
    [ba, bb] = [bb, ba];
  }
  const c0 = Math.max(0, Math.floor(xa)), c1 = Math.min(cols - 1, Math.ceil(xb));
  for (let c = c0; c <= c1; c++) {
    const t = xb - xa < 0.6 ? 1 : clamp((c + 0.5 - xa) / (xb - xa));
    const top = lerp(ta, tb, t), bot = lerp(ba, bb, t);
    const r0 = Math.max(0, Math.round(top)), r1 = Math.min(clip - 1, Math.round(bot));
    for (let r = r0; r <= r1; r++) shade(c, r, bot - top < 0.6 ? 0.5 : (r - top) / (bot - top), t);
  }
}

const out = [0, 0, -1];
/** the car, rear view; u ∈ [-1,1] across the rear track, vv = height in car units (0 ground, ~1.15 top) */
function carPart(u, vv, rowsUp, o) {
  const au = Math.abs(u);
  // rear tyres
  if (au >= 0.64 && au <= 1 && vv >= 0 && vv <= 0.55 && !(au > 0.93 && (vv < 0.05 || vv > 0.5))) {
    if (au > 0.955) return set3(0.75, o.compound, u > 0 ? g.rh : g.lh);
    if (au < 0.675) return set3(0.3, HUE.fg, u > 0 ? g.lh : g.rh);
    return Math.floor(rowsUp + o.wheel) % 3 === 0 ? set3(0.34, HUE.fg, g.hl) : set3(0.15, HUE.fg, g.full);
  }
  // rain light + diffuser
  if (au < 0.07 && vv >= 0.17 && vv < 0.27) return set3(o.light ? 1 : 0.28, HUE.hot, g.sq);
  if (au < 0.5 && vv >= 0.02 && vv < 0.2) return Math.round(u * 9) % 3 === 0 ? set3(0.32, HUE.fg, g.vb) : set3(0.13, HUE.fg, g.dark);
  // endplates
  if (au >= 0.5 && au <= 0.6 && vv >= 0.56 && vv <= 1.03) return set3(0.62, o.livery, vv > 0.97 ? g.up : g.full);
  if (au < 0.5) {
    // DRS flap (opens upward) + main plane
    if (o.drs ? vv >= 0.99 && vv <= 1.04 : vv >= 0.9 && vv <= 0.99) return set3(0.8, HUE.alt, g.up);
    if (vv >= 0.79 && vv <= 0.89) return set3(0.85, HUE.white, g.full);
  }
  // beam wing / crash structure
  if (au < 0.22 && vv >= 0.27 && vv < 0.42) return set3(0.32, HUE.fg, g.dark);
  // sidepods / floor
  if (au < 0.63 && vv >= 0.2 && vv < 0.42) {
    if (vv > 0.29 && vv < 0.34) return set3(0.7, HUE.alt, g.full);
    return set3(0.4 + 0.25 * (1 - au), o.livery, g.full);
  }
  // engine cover / shark fin
  if (vv >= 0.42 && vv < 0.79 && au < 0.3 - (vv - 0.42) * 0.5) return set3(0.5 + 0.2 * (1 - au * 3), o.livery, g.full);
  // front tyres peeking past the sidepods
  if (au >= 0.58 && au <= 0.84 && vv >= 0.55 && vv <= 0.72) return Math.floor(rowsUp + o.wheel) % 3 === 0 ? set3(0.28, HUE.fg, g.hl) : set3(0.12, HUE.fg, g.full);
  // mirrors, halo, airbox / roll hoop
  if (au > 0.36 && au < 0.45 && vv > 0.97 && vv < 1.05) return set3(0.5, HUE.fg, g.sm);
  if (vv > 1.0 && vv < 1.17) {
    if (au < 0.09) return set3(0.65, o.livery, vv > 1.1 ? g.tri : g.full);
    if (au < 0.3 && vv < 1.07) return set3(0.5, HUE.fg, g.hl);
  }
  return null;
}
function set3(v, h, gl) {
  out[0] = v;
  out[1] = h;
  out[2] = gl;
  return out;
}

function drawCar(f, cols, rows, cx, by, hw, ax, clip, o) {
  const U = hw * 2 * 0.42 * ax; // rows per car-height unit
  if (hw < 0.8) return;
  const top = by - 1.17 * U;
  const V = f.v, H = f.h, Gg = f.g;
  const r0 = Math.max(0, Math.floor(top)), r1 = Math.min(clip - 1, rows - 1, Math.floor(by));
  const c0 = Math.max(0, Math.floor(cx - hw - 2)), c1 = Math.min(cols - 1, Math.ceil(cx + hw + 2));
  for (let r = r0; r <= r1; r++) {
    const up = by - r - 0.5;
    const vv = up / U;
    for (let c = c0; c <= c1; c++) {
      const u = (c + 0.5 - cx) / hw - o.lean * vv * 0.14;
      const p = carPart(u, vv, up, o);
      if (!p) continue;
      const i = r * cols + c;
      V[i] = p[0] * o.dim;
      H[i] = p[1];
      Gg[i] = hw < 3 ? -1 : p[2];
    }
  }
}

export default {
  id: "racing",
  title: "LIGHTS_OUT",
  caption: "late on the brakes, early on the throttle",

  init(f, S) {
    R = rng(44);
    st = {
      pos: 6,
      speed: 260,
      x: 0,
      lean: 0,
      bgX: 0,
      lap: 12,
      lapT: 0,
      sec: [28.441, 27.903, null],
      best: [28.512, 27.811, 31.204],
      secCol: [HUE.hot, HUE.main, HUE.fg],
      secT: 0,
      lastSec: 0,
      ers: 0.7,
      gap: 11,
      oppX: 0,
      spark: 0,
      wheel: 0,
      delta: -0.214,
    };
    sparks = [];
    const portrait = S.rows / S.ax > S.cols * 1.05;
    st.horizon = Math.round(S.rows * (portrait ? 0.4 : 0.47));
    st.HW = S.cols * (portrait ? 0.5 : 0.36);
    const carHalf = Math.min(S.cols * (portrait ? 0.19 : 0.14), (S.rows / S.ax) * 0.13);
    st.carZ = (CAR_HW * st.HW * D) / carHalf;
    const yb = S.rows * (portrait ? 0.86 : 0.88);
    st.camH = ((yb - st.horizon) * st.carZ) / (D * st.HW * S.ax);
    proj = new Array(DD);
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gg = f.g;
    const set = (c, r, v, h, gl = -1) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const i = r * cols + c;
      V[i] = v;
      H[i] = h;
      Gg[i] = gl;
    };
    f.clear();

    // ── physics ──
    const carS = Math.floor(st.pos + st.carZ) % N;
    const ahead = (carS + 6) % N;
    const target = tgt[ahead];
    const braking = st.speed > target + 4;
    if (braking) {
      st.speed -= 160 * dt;
      st.ers = Math.min(1, st.ers + dt * 0.12);
    } else {
      st.speed += Math.max(5, 46 - st.speed * 0.12) * dt;
      if (st.speed > 250) st.ers = Math.max(0, st.ers - dt * 0.05);
    }
    st.speed = clamp(st.speed, 80, 338);
    const prevPos = st.pos;
    st.pos += st.speed * 0.16 * dt;
    st.wheel += st.speed * dt * 0.25;
    st.bgX += segs[carS].curve * st.speed * dt * 2.2;
    // lap + sectors
    const lp = (prevPos + st.carZ) % N, ln = (st.pos + st.carZ) % N;
    st.lapT += dt;
    st.secT += dt;
    for (let k = 0; k < 3; k++) {
      const b = sectorAt[k];
      if ((lp < b && ln >= b) || (k === 0 && ln < lp)) {
        const done = (k + 2) % 3;
        const tm = st.best[done] + (R() - 0.55) * 0.6;
        st.sec[done] = tm;
        st.secCol[done] = tm < st.best[done] ? HUE.hot : tm < st.best[done] + 0.15 ? HUE.alt : HUE.main;
        st.best[done] = Math.min(st.best[done], tm);
        if (k === 0) {
          st.lap = st.lap >= 58 ? 1 : st.lap + 1;
          st.sec[1] = st.sec[2] = null;
        }
      }
    }
    st.delta = -0.214 + Math.sin(t * 0.31) * 0.16 + Math.sin(t * 1.3) * 0.03;
    // opponent: we are quicker, so the gap closes, we pass on the other side, a new car appears ahead
    st.gap -= dt * (0.55 + (braking ? 0.5 : 0));
    if (st.gap < -3) st.gap = 13 + R() * 4;
    const oppS = Math.floor(st.pos + st.carZ + st.gap) % N;
    st.oppX = lerp(st.oppX, line[(oppS + N) % N] * 0.9, dt * 2);
    let tx = line[carS];
    if (st.gap < 4.5 && st.gap > -2.5) tx = clamp(st.oppX - Math.sign(st.oppX || 1) * 0.62, -0.75, 0.75);
    const px = st.x;
    st.x = lerp(st.x, tx, clamp(dt * 2.4));
    st.lean = lerp(st.lean, clamp((st.x - px) / Math.max(dt, 1e-3) * 1.6 + segs[carS].curve / (6 * C), -1, 1), clamp(dt * 5));
    const drsOpen = segs[carS].drs && st.gap < 9 && st.gap > 0;
    // gear / rpm
    let gear = 1;
    while (gear < 8 && st.speed > GEAR_AT[gear]) gear++;
    const rpm = clamp((st.speed - GEAR_AT[gear - 1]) / (GEAR_AT[gear] - GEAR_AT[gear - 1]));

    // ── projection ──
    const portrait = rows / ax > cols * 1.05;
    const { horizon, HW, camH } = st;
    const base = Math.floor(st.pos) % N, frac = st.pos - Math.floor(st.pos);
    const s0 = segs[base];
    const camY = lerp(s0.y1, s0.y2, frac) + camH;
    const camX = st.x * 0.72;

    // ── sky, city, ferris wheel, floodlight towers ──
    for (let r = 0; r < horizon + 2 && r < rows; r++) {
      const k = r / horizon;
      for (let c = 0; c < cols; c++) {
        const n = noise2(c * 0.03 + st.bgX * 0.01, r * 0.12 + t * 0.03);
        let v = 0.16 * k * k * k * k + 0.02 * n;
        let h = k > 0.72 ? HUE.hot : HUE.alt;
        if (hash2(c * 7 + 3, r * 13) > 0.993 && k < 0.6) {
          v = 0.25;
          h = HUE.white;
        }
        set(c, r, v, h);
      }
    }
    // skyline (parallax)
    const skyH = horizon * (portrait ? 0.32 : 0.28);
    for (let c = 0; c < cols; c++) {
      const wx = c + st.bgX * 0.5;
      const bh = Math.floor(skyH * clamp(0.25 + 0.75 * (0.5 + 0.5 * noise2(Math.floor(wx / 5) * 0.37, 1.7)) ** 2));
      const tower = noise2(Math.floor(wx / 3) * 0.9, 5.1) > 0.55 ? skyH * 0.35 : 0;
      const top = horizon - bh - tower;
      for (let r = Math.max(0, Math.floor(top)); r < horizon; r++) {
        const lit = hash2(Math.floor(wx), r) > 0.9;
        set(c, r, lit ? 0.35 : 0.06, lit ? (hash2(r, Math.floor(wx)) > 0.5 ? HUE.main : HUE.white) : HUE.fg, lit ? g.sm : -1);
      }
    }
    // ferris wheel on the skyline
    {
      const wr = Math.min(cols * 0.12, horizon * 0.42);
      const wx = ((cols * 0.72 - st.bgX * 0.35) % (cols * 1.8) + cols * 1.8) % (cols * 1.8) - cols * 0.4;
      const wy = horizon - wr * ax - 2;
      const rot = t * 0.08;
      for (let k = 0; k < 28; k++) {
        const a = rot + (k / 28) * TAU;
        const ex = wx + Math.cos(a) * wr, ey = wy + Math.sin(a) * wr * ax;
        f.line(wx, wy, ex, ey, 0.14, HUE.fg, undefined, ax);
        set(Math.round(ex), Math.round(ey), 0.75, k % 3 ? HUE.alt : HUE.main, g.sm);
      }
      for (let k = 0; k < 90; k++) {
        const a = (k / 90) * TAU;
        f.plot(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr * ax, 0.3, HUE.alt);
      }
      f.line(wx, wy, wx - wr * 0.5, horizon, 0.2, HUE.fg, "auto", ax);
      f.line(wx, wy, wx + wr * 0.5, horizon, 0.2, HUE.fg, "auto", ax);
    }

    // ── ground, front to back, clipped by hills ──
    let x = 0, dx = -s0.curve * frac;
    let maxY = rows;
    const zCar = st.carZ, zOpp = st.carZ + st.gap;
    let carAt = null, oppAt = null;
    for (let n = 0; n < DD; n++) {
      const i = (base + n) % N, s = segs[i];
      const z1 = n - frac, z2 = z1 + 1;
      proj[n] = null;
      if (z2 <= NEAR) {
        x += dx;
        dx += s.curve;
        continue;
      }
      const za = Math.max(NEAR, z1);
      const xa = z1 < NEAR ? x + dx * ((NEAR - z1) / (z2 - z1)) : x;
      const sc1 = D / za, sc2 = D / z2;
      const W1 = sc1 * HW, W2 = sc2 * HW;
      const X1 = cols / 2 + (xa - camX) * W1, X2 = cols / 2 + (x + dx - camX) * W2;
      const Y1 = horizon + (camY - s.y1) * W1 * ax, Y2 = horizon + (camY - s.y2) * W2 * ax;
      const rec = { i, n, X1, Y1, W1, X2, Y2, W2, clip: maxY, z1: za, z2 };
      proj[n] = rec;
      if (zCar >= z1 && zCar < z2) carAt = { x: x + dx * (zCar - z1), y: lerp(s.y1, s.y2, zCar - z1), clip: maxY };
      if (zOpp >= z1 && zOpp < z2) oppAt = { x: x + dx * (zOpp - z1), y: lerp(s.y1, s.y2, zOpp - z1), clip: maxY, n };
      if (Y2 < maxY && Y1 > Y2 - 0.001) {
        const top = Math.max(0, Math.ceil(Y2));
        const bot = Math.min(maxY - 1, Math.floor(Y1));
        for (let r = top; r <= bot; r++) {
          const tt = Y1 - Y2 < 1e-3 ? 1 : (r - Y2) / (Y1 - Y2);
          groundRow(V, H, Gg, r, cols, X2 + (X1 - X2) * tt, W2 + (W1 - W2) * tt, s, i, 1 - tt, t);
        }
        maxY = Math.min(maxY, top);
      }
      x += dx;
      dx += s.curve;
    }

    // ── roadside + opponent, back to front ──
    const project = (at, z, lat) => {
      const W = (D / z) * HW;
      return { W, cx: cols / 2 + (at.x + lat - camX) * W, by: horizon + (camY - at.y) * W * ax };
    };
    for (let n = DD - 1; n >= 1; n--) {
      const rec = proj[n];
      if (!rec) continue;
      roadside(f, set, rec, cols, rows, ax, t);
      if (oppAt && n === oppAt.n && st.gap > 0.4) {
        const { W, cx, by } = project(oppAt, zOpp, st.oppX);
        // heat haze off the gearbox
        const hw = CAR_HW * W;
        for (let k = 0; k < hw * 1.2; k++) {
          const hx = cx + (hash2(k, Math.floor(t * 12)) - 0.5) * hw * 0.6;
          const hy = by - hw * 0.9 * ax - hash2(k * 3, Math.floor(t * 9)) * hw * 0.5 * ax;
          if (hy < rec.clip) set(Math.round(hx), Math.round(hy), 0.22, HUE.alt, g.haze);
        }
        drawCar(f, cols, rows, cx, by, hw, ax, oppAt.clip, {
          livery: HUE.alt, compound: HUE.main, drs: false, light: Math.floor(t * 4) % 2 === 0, wheel: st.wheel * 0.9, lean: 0, dim: 0.9,
        });
      }
    }

    // ── player car ──
    {
      if (carAt) {
        const { W, cx, by: by0 } = project(carAt, zCar, st.x);
        const by = by0 + Math.sin(t * 23) * 0.15;
        const hw = CAR_HW * W;
        // shadow
        for (let c = Math.round(cx - hw * 1.05); c <= Math.round(cx + hw * 1.05); c++) set(c, Math.round(by) + 1, 0.05, HUE.fg, g.dot);
        drawCar(f, cols, rows, cx, by, hw, ax, rows, {
          livery: HUE.main, compound: HUE.hot, drs: drsOpen, light: Math.floor(t * 4) % 2 === 0, wheel: st.wheel, lean: st.lean, dim: 1,
        });
        // plank sparks over crests and bumps
        const sl = segs[carS];
        st.spark -= dt;
        if ((sl.y2 - sl.y1 < -0.012 || R() < dt * 0.6) && st.speed > 220 && st.spark <= 0) {
          st.spark = 0.06;
          for (let k = 0; k < 8; k++) sparks.push({ x: cx + (R() - 0.5) * hw * 0.6, y: by - 0.2, vx: (R() - 0.5) * hw * 1.6, vy: 2 + R() * 6, life: 0.25 + R() * 0.35 });
        }
      }
    }
    for (let k = sparks.length - 1; k >= 0; k--) {
      const p = sparks[k];
      p.life -= dt;
      if (p.life <= 0) {
        sparks.splice(k, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 14 * dt;
      set(Math.round(p.x), Math.round(p.y), Math.min(1, p.life * 3), p.life > 0.2 ? HUE.white : HUE.main, p.life > 0.2 ? g.star : g.dot);
    }

    hud(f, S, set, { gear, rpm, drsOpen, drsZone: segs[carS].drs, t, portrait });
  },
};

function groundRow(V, H, Gg, r, cols, cx, w, s, i, tz, t) {
  const rowBase = r * cols;
  const segT = i + tz;
  const stripe = Math.floor(segT * 1.0) & 1;
  const ln = line[i];
  const inv = 1 / w;
  for (let c = 0; c < cols; c++) {
    const d = (c + 0.5 - cx) * inv;
    const ad = d < 0 ? -d : d;
    const side = d < 0 ? -1 : 1;
    let v, h = HUE.fg, gl = -1;
    if (ad < 1) {
      if (ad > 0.955) {
        v = 0.6;
        h = HUE.white;
      } else if (s.start) {
        v = (Math.floor(d * 7) + Math.floor(segT * 3)) & 1 ? 0.8 : 0.05;
        h = HUE.white;
        gl = g.full;
      } else if (s.drsLine && tz < 0.35) {
        v = 0.55;
        h = HUE.white;
      } else {
        const tex = hash2(Math.floor(d * 16), Math.floor(segT * 3));
        const pool = 0.75 + 0.5 * Math.exp(-(((segT % 16) - 8) ** 2) / 10);
        v = (0.09 + tex * 0.1) * pool;
        if (Math.abs(d - ln) < 0.2) v *= 0.45;
      }
    } else if (s.kerb && ad < 1.15) {
      v = 0.78;
      h = stripe ? HUE.hot : HUE.white;
      gl = g.full;
    } else if (s.apex && side === s.inside && ad < 1.27) {
      v = Math.floor(segT * 2) & 1 ? 0.8 : 0.35;
      h = HUE.main;
      gl = g.tri;
    } else if (ad < 1.32 || (ad < 1.75 && s.gravel !== side)) {
      v = Math.floor(segT / 3) & 1 ? 0.16 : 0.09;
      h = HUE.alt;
    } else if (s.gravel === side && ad < 2.4) {
      const k = hash2(c * 3 + r * 7, Math.floor(segT * 4));
      v = 0.09 + k * 0.16;
      h = HUE.main;
      gl = k > 0.6 ? g.dot : -1;
    } else {
      const k = hash2(Math.floor(d * 6), Math.floor(segT * 2));
      v = k > 0.86 ? 0.07 : 0;
      h = HUE.fg;
    }
    const idx = rowBase + c;
    V[idx] = v;
    H[idx] = h;
    Gg[idx] = gl;
  }
}

function roadside(f, set, rec, cols, rows, ax, t) {
  const s = segs[rec.i];
  const clip = rec.clip;
  const { X1, X2, Y1, Y2, W1, W2, i } = rec;
  const tiny = W1 < 4;

  for (const side of [-1, 1]) {
    const off = s.gravel === side ? 2.5 : 1.85;
    const xn = X1 + side * off * W1, xf = X2 + side * off * W2;
    // grandstand behind the barrier
    if (s.stands && !tiny) {
      const so = off + 0.55;
      const sn = X1 + side * so * W1, sf = X2 + side * so * W2;
      const hN = 1.5 * W1 * ax, hF = 1.5 * W2 * ax;
      colQuad(f, cols, sf, Y2 - hF, Y2, sn, Y1 - hN, Y1, clip, (c, r, vy) => {
        if (vy < 0.08) return set(c, r, 0.4, HUE.fg, g.lo);
        const tier = Math.floor(vy * 9);
        if (Math.floor(vy * 9 * 3) % 3 === 0) return set(c, r, 0.12, HUE.fg, g.hl);
        const k = hash2(c * 13 + tier, r * 7 + (i & 7));
        const hues = [HUE.main, HUE.alt, HUE.hot, HUE.white, HUE.fg];
        set(c, r, k > 0.35 ? 0.25 + k * 0.3 : 0.06, hues[(k * 97) % 5 | 0], k > 0.35 ? g.dot : -1);
      });
    }
    // floodlight pylons
    if (i % 16 === 8 && side === (i % 32 === 8 ? 1 : -1)) {
      const po = off + 0.35;
      const pxn = X1 + side * po * W1;
      const top = Y1 - 3.4 * W1 * ax;
      for (let r = Math.max(0, Math.round(top)); r < Math.min(clip, Math.round(Y1)); r++) set(Math.round(pxn), r, 0.22, HUE.fg, g.vb);
      const hw = Math.max(1, Math.round(0.35 * W1));
      for (let c = -hw; c <= hw; c++) {
        if (top >= clip) break;
        set(Math.round(pxn) + c, Math.round(top), 1, HUE.white, g.up);
        for (let k = 1; k < 3; k++) f.plot(Math.round(pxn) + c, Math.round(top) + k, 0.22 / k, HUE.white);
      }
    }
    // TecPro barrier + armco top rail
    const hN = 0.22 * W1 * ax, hF = 0.22 * W2 * ax;
    const tec = (i >> 1) & 1 ? HUE.hot : HUE.white;
    colQuad(f, cols, xf, Y2 - hF, Y2, xn, Y1 - hN, Y1, clip, (c, r, vy) => {
      if (vy < 0.3) set(c, r, 0.5, HUE.fg, tiny ? -1 : g.hl);
      else set(c, r, tiny ? 0.3 : 0.42, tec, tiny ? -1 : g.dark);
    });
    // catch fence
    if (!tiny) {
      const fN = 0.6 * W1 * ax, fF = 0.6 * W2 * ax;
      colQuad(f, cols, xf, Y2 - hF - fF, Y2 - hF, xn, Y1 - hN - fN, Y1 - hN, clip, (c, r) => {
        if ((c + r) % 3 === 0) set(c, r, 0.09, HUE.fg, g.x);
      });
      if (i % 3 === 0) for (let r = Math.max(0, Math.round(Y1 - hN - fN)); r < Math.min(clip, Math.round(Y1 - hN)); r++) set(Math.round(xn), r, 0.3, HUE.fg, g.vb);
    }
  }

  // braking boards on the outside of the coming corner
  if (s.board) {
    const side = s.boardSide;
    const bx = X1 + side * 1.42 * W1;
    const bw = Math.max(1, 0.32 * W1);
    const top = Y1 - 0.62 * W1 * ax, bot = Y1 - 0.2 * W1 * ax;
    const txt = String(s.board);
    const c0 = Math.round(bx - bw / 2), c1 = Math.round(bx + bw / 2);
    for (let r = Math.round(bot); r < Math.min(clip, Math.round(Y1)); r++) set(Math.round(bx), r, 0.3, HUE.fg, g.vb);
    for (let r = Math.max(0, Math.round(top)); r <= Math.min(clip - 1, Math.round(bot)); r++) {
      for (let c = c0; c <= c1; c++) set(c, r, 0.85, HUE.white, g.full);
    }
    const tr = Math.round((top + bot) / 2);
    if (c1 - c0 + 1 >= txt.length + 1 && tr < clip) f.text(Math.round(bx - txt.length / 2 + 0.5), tr, txt, HUE.hot, 1);
  }
  // DRS detection board
  if (s.drsLine && W1 > 6) {
    const bx = X1 + 1.45 * W1;
    const r = Math.round(Y1 - 0.5 * W1 * ax);
    if (r < clip) {
      f.text(Math.round(bx - 2), r, " DRS ", HUE.white, 1);
      for (let c = 0; c < 5; c++) f.v[r * cols + Math.round(bx - 2) + c] !== undefined && set(Math.round(bx - 2) + c, r - 1, 0.6, HUE.alt, g.lo);
    }
  }
  // start gantry with the five red lights
  if (s.start && rec.i === 0) {
    const h = 1.75 * W1 * ax;
    const xl = X1 - 1.25 * W1, xr = X1 + 1.25 * W1;
    for (let r = Math.max(0, Math.round(Y1 - h)); r < Math.min(clip, Math.round(Y1)); r++) {
      set(Math.round(xl), r, 0.4, HUE.fg, g.vb);
      set(Math.round(xr), r, 0.4, HUE.fg, g.vb);
    }
    const gy = Math.round(Y1 - h);
    if (gy >= 0 && gy < clip) {
      for (let c = Math.round(xl); c <= Math.round(xr); c++) set(c, gy, 0.35, HUE.fg, g.full);
      const on = Math.floor(t * 1.4) % 8;
      for (let k = 0; k < 5; k++) {
        const lx = Math.round(X1 + (k - 2) * 0.22 * W1);
        set(lx, gy + 1, k < on && on < 6 ? 1 : 0.25, HUE.hot, k < on && on < 6 ? g.led : g.off);
      }
    }
  }
  // marshal post with a waving flag
  if (i % 70 === 40) {
    const mx = X1 - 2.2 * W1;
    const hy = Y1 - 0.45 * W1 * ax;
    const hw = Math.max(1, Math.round(0.18 * W1));
    for (let r = Math.max(0, Math.round(hy)); r < Math.min(clip, Math.round(Y1)); r++)
      for (let c = -hw; c <= hw; c++) set(Math.round(mx) + c, r, 0.2, HUE.fg, g.dark);
    const fy = Math.round(hy - 0.35 * W1 * ax);
    if (fy >= 0 && fy < clip) {
      for (let r = fy; r < Math.min(clip, Math.round(hy)); r++) set(Math.round(mx), r, 0.35, HUE.fg, g.vb);
      const wave = Math.floor(t * 6) & 1;
      for (let c = 1; c <= Math.max(1, Math.round(0.25 * W1)); c++) set(Math.round(mx) + c, fy + ((c + wave) & 1 ? 0 : 0), 0.85, HUE.alt, wave ? g.full : g.up);
    }
  }
}

function hud(f, S, set, o) {
  const { cols, rows } = S;
  const write = (x, y, s, h, v = 0.95) => {
    x = Math.round(x);
    if (y < 0 || y >= rows) return;
    for (let k = -1; k <= s.length; k++) set(x + k, y, 0);
    f.text(x, y, s, h, v);
  };
  // shift lights
  const nL = 15, sp = cols >= 70 ? 2 : 1;
  const x0 = Math.round(cols / 2 - (nL * sp) / 2);
  const lit = Math.floor(clamp((o.rpm - 0.12) / 0.86) * nL + 0.5);
  const limiter = o.rpm > 0.97 && Math.floor(o.t * 10) & 1;
  for (let k = -1; k <= nL * sp; k++) set(x0 + k, 1, 0);
  for (let k = 0; k < nL; k++) {
    const on = limiter || k < lit;
    const h = limiter ? HUE.hot : k < 5 ? HUE.alt : k < 10 ? HUE.hot : HUE.white;
    set(x0 + k * sp, 1, on ? 1 : 0.22, h, on ? g.led : g.off);
  }
  // gear digit
  const gch = String(o.gear);
  if (rows >= 40 && cols >= 50) {
    const bm = DIGITS[gch];
    const gx = Math.round(cols / 2 - 3);
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++) {
        const on = bm[r][c] === "1";
        set(gx + c * 2, 3 + r, on ? 0.95 : 0, HUE.white, on ? g.full : -1);
        set(gx + c * 2 + 1, 3 + r, on ? 0.95 : 0, HUE.white, on ? g.full : -1);
      }
    write(gx - 9, 4, String(Math.round(stSpeed())).padStart(3, " "), HUE.main);
    write(gx - 9, 5, "KM/H", HUE.fg, 0.55);
    const dl = st.delta;
    write(gx + 9, 4, `△${dl < 0 ? "-" : "+"}${Math.abs(dl).toFixed(3)}`, dl < 0 ? HUE.alt : HUE.hot);
    write(gx + 9, 5, o.drsOpen ? "DRS OPEN" : o.drsZone ? "DRS ZONE" : "ERS " + "█".repeat(Math.round(st.ers * 5)) + "░".repeat(5 - Math.round(st.ers * 5)), o.drsOpen ? HUE.alt : o.drsZone ? HUE.white : HUE.main, o.drsOpen ? 1 : 0.7);
  } else {
    write(Math.round(cols / 2 - 4), 3, `${gch} ${Math.round(stSpeed())}`, HUE.white);
  }
  if (cols < 70) return;
  // lap + sectors (top left)
  write(2, 3, `L ${st.lap}/58`, HUE.white);
  for (let k = 0; k < 3; k++) {
    const v = st.sec[k];
    write(2, 4 + k, `S${k + 1} ${v == null ? "--.---" : v.toFixed(3)}`, v == null ? HUE.fg : st.secCol[k], v == null ? 0.4 : 0.9);
  }
  // tyres + ERS (top right)
  const tx = cols - 15;
  const temps = [0, 1, 2, 3].map((k) => Math.round(97 + 6 * Math.sin(o.t * 0.4 + k * 1.7) + (o.drsZone ? 0 : 3)));
  const th = (v) => (v > 104 ? HUE.hot : v < 93 ? HUE.alt : HUE.main);
  write(tx, 3, "TYRE", HUE.fg, 0.5);
  write(tx, 4, `${temps[0]}`, th(temps[0]));
  write(tx + 5, 4, `${temps[1]}`, th(temps[1]));
  write(tx, 5, `${temps[2]}`, th(temps[2]));
  write(tx + 5, 5, `${temps[3]}`, th(temps[3]));
  write(tx + 9, 4, "SOFT", HUE.hot, 0.8);
  write(tx + 9, 5, "L7", HUE.fg, 0.5);
}
function stSpeed() {
  return st.speed;
}
