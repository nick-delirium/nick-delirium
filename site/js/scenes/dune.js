// Reading: two worlds on repeat. ARRAKIS — a voxel-marched dune sea under two moons, a thumper,
// spice glints and a colossal sandworm breach. CYBERSPACE — an infinite neon lattice with
// rotating data constructs and flickering black ICE. A glitch cut joins them.
import { HUE, clamp, lerp, smooth, fract, noise2, hash1, hash2, rng, G, TAU } from "../engine/util.js";

const PHASE = 13;
const g = {
  rip: G("~"), dot: G("·"), star: G("*"), tooth: G("▲"), dia: G("◆"), seg: G("═"), lo: G("▄"), vb: G("│"),
  sq: G("■"), plus: G("+"), hl: G("─"), noise: Array.from("░▒▓█<>/\\[]{}#").map(G),
};

let R, parts, objs, thump;

/* ═════════════ ARRAKIS ═════════════ */
let lastP = 0;
function duneH(wx, wz) {
  const warp = noise2(wx * 0.03, wz * 0.02) * 1.7;
  const p = fract(wz * 0.085 + warp + 0.12 * noise2(wx * 0.09, 3.3));
  lastP = p;
  // steep shadowed slip face toward the camera, long sunlit back-slope away from it
  const prof = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75;
  const amp = 2.6 + 1.3 * noise2(wx * 0.02 + 5, wz * 0.015);
  return amp * prof * Math.sqrt(prof);
}

function arrakis(f, S, tp, dt, t) {
  const { cols, rows, ax } = S;
  const V = f.v, H = f.h, Gg = f.g;
  const portrait = rows / ax > cols * 1.05;
  const hz = Math.round(rows * (portrait ? 0.38 : 0.44));
  const set = (c, r, v, h, gl = -1) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const i = r * cols + c;
    V[i] = v;
    H[i] = h;
    Gg[i] = gl;
  };

  // sky: deep dusk above, burnt haze at the horizon, faint stars
  for (let r = 0; r < hz; r++) {
    const k = r / hz;
    for (let c = 0; c < cols; c++) {
      let v = 0.24 * k ** 4 * (0.85 + 0.15 * noise2(c * 0.05 + t * 0.05, r * 0.2));
      let h = k > 0.55 ? HUE.hot : HUE.main;
      if (k < 0.6 && hash2(c * 3 + 1, r * 5 + 2) > 0.992) {
        v = 0.18 + 0.1 * Math.sin(t * 2 + c);
        h = HUE.white;
      }
      set(c, r, v, h);
    }
  }
  // two moons
  const m = Math.min(cols, rows / ax);
  const moons = [
    [cols * (portrait ? 0.7 : 0.76), hz * 0.3, m * 0.085],
    [cols * (portrait ? 0.42 : 0.6), hz * 0.17, m * 0.038],
  ];
  for (const [mx, my, mr] of moons) {
    for (let r = Math.floor(my - mr * ax - 1); r <= Math.ceil(my + mr * ax + 1); r++) {
      for (let c = Math.floor(mx - mr - 1); c <= Math.ceil(mx + mr + 1); c++) {
        const nx = (c - mx) / mr, ny = (r - my) / (mr * ax);
        const d2 = nx * nx + ny * ny;
        if (d2 > 1.25 || r < 0 || r >= hz) continue;
        if (d2 > 1) {
          set(c, r, 0.12 * (1.25 - d2) * 4, HUE.main);
          continue;
        }
        const nz = Math.sqrt(1 - d2);
        const lam = clamp(-nx * 0.62 - ny * 0.15 + nz * 0.77);
        const crater = noise2(nx * 3 + mx, ny * 3) * 0.5 + 0.5;
        set(c, r, 0.08 + 0.72 * lam * (0.75 + 0.25 * crater), lam > 0.75 ? HUE.white : HUE.fg);
      }
    }
  }
  // ornithopter crossing the sky
  {
    const ox = -8 + ((tp * 7) % (cols + 16)), oy = Math.round(hz * 0.55 + Math.sin(tp * 1.3) * 2);
    const wing = ["\\o/", "-o-", "/o\\"][Math.floor(t * 12) % 3];
    f.text(ox, oy, wing, HUE.fg, 0.6);
  }

  // dune sea: per-column voxel march, near to far
  const F = cols * (portrait ? 0.62 : 0.5);
  const camH = 4.8;
  const camZ = t * 2.4, camX = Math.sin(t * 0.05) * 6;
  const ZF = 95;
  const thx = thump.x, thz = thump.z;
  if (thz < camZ + 10) {
    thump.z = camZ + 40 + R() * 20;
    thump.x = camX + (R() - 0.5) * 30;
  }
  const ring = (t * 3.5) % 10;
  for (let c = 0; c < cols; c++) {
    let yb = rows;
    const dirX = (c - cols / 2) / F;
    let z = 2.6;
    while (z < ZF && yb > hz) {
      const wx = camX + dirX * z, wz = camZ + z;
      const h = duneH(wx, wz);
      const y = hz + ((camH - h) * F * ax) / z;
      if (y < yb) {
        const p = lastP;
        const fade = 1 - z / ZF;
        let v, hue = HUE.main, gl = -1, crest = false;
        if (p < 0.25) {
          v = 0.02 + 0.05 * (p / 0.25);
          hue = HUE.hot;
          crest = p > 0.17;
        } else {
          const q = (p - 0.25) / 0.75;
          v = (0.3 - 0.22 * q) * (0.7 + 0.5 * noise2(wx * 0.15, wz * 0.1));
          if (z < 34) gl = -2;
        }
        v *= 0.45 + 0.55 * fade;
        if (z > 50 && hue === HUE.main) hue = HUE.hot;
        // thumper rings travelling through the sand
        const dd = Math.hypot(wx - thx, (wz - thz) * 1.2);
        if (Math.abs(dd - ring) < 0.35 && ring > 0.6) {
          v = Math.max(v, 0.55 * (1 - ring / 10));
          hue = HUE.alt;
        }
        const top = Math.max(hz, Math.ceil(y));
        for (let r = top; r < yb; r++) {
          const i = r * cols + c;
          // per-cell ripple texture + slight darkening down the span (wind-side curvature)
          const k = yb - top > 1 ? (r - top) / (yb - top) : 0;
          if (crest && r === top) {
            V[i] = 0.45 + 0.4 * fade;
            H[i] = fade > 0.6 ? HUE.white : HUE.main;
            Gg[i] = G("▀");
            continue;
          }
          V[i] = gl === -2 ? v * (1 - 0.3 * k) : v;
          H[i] = hue;
          Gg[i] = gl === -2 ? ((r * 3 + Math.floor(c * 0.4 + wz * 3)) % 7 === 0 ? g.rip : -1) : gl;
        }
        yb = top;
      }
      z += 0.14 + z * 0.026;
    }
    // whatever is left between the last dune and the horizon dissolves into haze
    for (let r = hz; r < yb; r++) {
      const i = r * cols + c;
      V[i] = 0.2 - (r - hz) * 0.02;
      H[i] = HUE.hot;
      Gg[i] = -1;
    }
  }
  // thumper post
  {
    const zt = thz - camZ;
    if (zt > 2) {
      const sx = Math.round(cols / 2 + ((thx - camX) / zt) * F);
      const sy = Math.round(hz + ((camH - duneH(thx, thz)) * F * ax) / zt);
      const hgt = Math.max(1, Math.round((1.2 * F * ax) / zt));
      for (let k = 1; k <= hgt; k++) set(sx, sy - k, 0.45, HUE.fg, g.vb);
      set(sx, sy - hgt - 1, Math.floor(t * 3.5) % 2 ? 1 : 0.4, HUE.hot, g.sq);
    }
  }

  // spice glints
  for (let k = 0; k < (cols * rows) / 300; k++) {
    const c = (R() * cols) | 0, r = hz + 2 + ((R() * (rows - hz - 2)) | 0);
    if (V[r * cols + c] > 0.1 && R() < 0.5) set(c, r, 0.7 + R() * 0.3, R() < 0.5 ? HUE.hot : HUE.main, R() < 0.3 ? g.star : g.dot);
  }

  // sandworm breach
  const wt = (tp - 3.2) / 7;
  const wormOn = wt > 0 && wt < 1;
  if (wormOn) {
    const e = wt < 0.4 ? smooth(0, 0.4, wt) : 1 - smooth(0.55, 1, wt);
    const zW = Math.max(11, (10.5 * F * ax) / (0.82 * hz)); // head peaks just under the top edge
    const baseX = camX + (portrait ? -1.2 : zW * 0.28);
    const baseH = 0.6;
    const proj = (X, Y, Z) => {
      const z = zW + Z;
      return [cols / 2 + ((baseX + X - camX) / z) * F, hz + ((camH - baseH - Y) * F * ax) / z, F / z];
    };
    const U = e * 1.05;
    const path = (u) => [1.8 * u * u, 10 * Math.sin(u * 1.35), -3.8 * u * u];
    // body rings, ground → head
    for (let u = 0; u <= U; u += 0.018) {
      const [X, Y, Z] = path(u);
      const [sx, sy, sc] = proj(X, Y, Z);
      const rw = (2.0 + 0.45 * u) * sc;
      const ry = rw * 0.32 * ax + 0.6;
      const rim = fract(u * 9) < 0.18;
      for (let r = Math.floor(sy - ry); r <= Math.ceil(sy + ry); r++) {
        for (let c = Math.floor(sx - rw); c <= Math.ceil(sx + rw); c++) {
          const nx = (c - sx) / rw, ny = (r - sy) / ry;
          if (nx * nx + ny * ny > 1 || r >= rows) continue;
          const lit = clamp(0.55 - nx * 0.55 - ny * 0.1);
          set(c, r, rim ? 0.12 + lit * 0.25 : 0.14 + lit * 0.5, rim ? HUE.hot : HUE.main, rim ? g.seg : -1);
        }
      }
    }
    // mouth: crystal-tooth rings, 3/4 on
    const [X, Y, Z] = path(U);
    const [mx, my, sc] = proj(X, Y + 0.4, Z);
    const mr = (2.0 + 0.45 * U) * sc * 1.08;
    const mry = mr * 0.78 * ax;
    for (let r = Math.floor(my - mry); r <= Math.ceil(my + mry); r++) {
      for (let c = Math.floor(mx - mr); c <= Math.ceil(mx + mr); c++) {
        const nx = (c - mx) / mr, ny = (r - my) / mry;
        const d = Math.hypot(nx, ny);
        if (d > 1) continue;
        const a = Math.atan2(ny, nx);
        if (d > 0.84) set(c, r, 0.5 + 0.3 * clamp(-nx), HUE.main);
        else if (d < 0.2) set(c, r, 0.04 + 0.1 * (1 - d * 5), HUE.hot);
        else {
          const ringI = Math.floor(d * 4);
          const tooth = Math.sin(a * (10 + ringI * 4) + ringI * 1.7 + t * 0.6) > 0.15 && fract(d * 4) > 0.35;
          if (tooth) set(c, r, 0.95 - ringI * 0.12, ringI % 2 ? HUE.alt : HUE.white, ringI % 2 ? g.dia : g.tooth);
          else set(c, r, 0.12 + 0.12 * fract(d * 4), HUE.hot);
        }
      }
    }
    // sand cascading off the body + spray at the base
    const spawn = e > 0.05 ? (wt < 0.45 ? 26 : 10) : 0;
    for (let k = 0; k < spawn * dt * 30; k++) {
      const u = R() * U;
      const [bx, by, bz] = path(u);
      const [sx, sy, s2] = proj(bx, by, bz);
      const side = R() < 0.5 ? -1 : 1;
      parts.push({ x: sx + side * (2.0 + 0.45 * u) * s2, y: sy, vx: side * (2 + R() * 6), vy: -R() * 3, life: 0.8 + R() * 1.2 });
    }
    const [gx, gy, gs] = proj(0, 0, 0);
    if (wt < 0.5)
      for (let k = 0; k < 6; k++) parts.push({ x: gx + (R() - 0.5) * 3 * gs, y: gy, vx: (R() - 0.5) * 30, vy: -8 - R() * 14, life: 0.6 + R() * 0.6 });
    // disturbed sand crescent at the base
    for (let c = Math.round(gx - 2.6 * gs); c <= Math.round(gx + 2.6 * gs); c++) set(c, Math.round(gy) + 1, 0.55, HUE.main, g.lo);
  }
  for (let k = parts.length - 1; k >= 0; k--) {
    const p = parts[k];
    p.life -= dt;
    if (p.life <= 0 || p.y > rows) {
      parts.splice(k, 1);
      continue;
    }
    p.vy += 22 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    set(Math.round(p.x), Math.round(p.y), clamp(p.life), HUE.main, p.life > 0.6 ? g.dot : -1);
  }
  if (parts.length > 900) parts.splice(0, parts.length - 900);

  // heat shimmer just above the horizon
  for (let r = Math.max(0, hz - 3); r < Math.min(rows, hz + 4); r++) {
    const sh = Math.round(Math.sin(r * 1.7 + t * 6) * 0.8);
    if (sh) shiftRow(f, cols, r, sh);
  }

  const sign = tp > 2.4 && tp < 10.5;
  hud(f, S, [
    ["ARRAKIS · deep desert", HUE.main],
    [`spice 0.82 · ${sign ? "worm sign ▲" : "listening.."}`, sign ? HUE.hot : HUE.fg],
  ]);
}

/* ═════════════ CYBERSPACE ═════════════ */
const CORPS = ["T-A CORE", "HOSAKA", "SENSE/NET", "MAAS", "ZAIBATSU"];
function spawnObj(z) {
  const side = R() < 0.5 ? -1 : 1;
  const r = R();
  const type = r < 0.14 ? "ice" : r < 0.36 ? "tower" : r < 0.56 ? "pyr" : r < 0.78 ? "cube" : "sphere";
  return {
    type,
    x: side * (1.6 + R() * 5),
    z,
    s: 0.5 + R() * 0.7,
    rot: R() * TAU,
    rs: (R() - 0.5) * 1.6,
    label: type === "ice" ? "ICE//BLACK" : CORPS[(R() * CORPS.length) | 0],
    hue: type === "ice" ? HUE.hot : R() < 0.5 ? HUE.main : HUE.white,
  };
}
const CUBE_V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const CUBE_E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
const PYR_V = [[-1, 0, -1], [1, 0, -1], [1, 0, 1], [-1, 0, 1], [0, 1.8, 0]];
const PYR_E = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4]];
const OCT_V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const OCT_E = [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2]];

function cyberspace(f, S, tp, dt, t) {
  const { cols, rows, ax } = S;
  const V = f.v, H = f.h, Gg = f.g;
  const hz = Math.round(rows * 0.5);
  const F = Math.min(cols, rows / ax) * 0.8;
  const camY = 1.0, ceilY = 3.4;
  const camZ = t * 5.5;
  const camX = Math.sin(t * 0.4) * 0.7;
  const set = (c, r, v, h, gl = -1) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const i = r * cols + c;
    V[i] = v;
    H[i] = h;
    Gg[i] = gl;
  };

  // floor + ceiling lattice
  for (let r = 0; r < rows; r++) {
    const floor = r > hz;
    const dr = floor ? r - hz : hz - r;
    const glow = Math.max(0, 1 - dr / 4);
    if (dr === 0) {
      for (let c = 0; c < cols; c++) set(c, r, 0.55, HUE.hot);
      continue;
    }
    const Z = (F * ax * (floor ? camY : ceilY - camY)) / dr;
    const fade = clamp(1 - Z / 42) * (floor ? 1 : 0.35);
    const wz = Z + camZ;
    const zw = Math.max(0.035, (0.55 * Z * Z) / (F * ax * (floor ? camY : ceilY - camY)));
    const zLine = Math.abs(wz - Math.round(wz)) < zw && zw < 0.45;
    const xw = Math.max(0.03, (0.6 * Z) / F);
    for (let c = 0; c < cols; c++) {
      const X = camX + ((c - cols / 2) * Z) / F;
      const xLine = Math.abs(X - Math.round(X)) < xw && xw < 0.45;
      let v = glow * 0.3, h = HUE.hot;
      if (xLine || zLine) {
        v = Math.max(v, (xLine && zLine ? 0.95 : 0.5) * fade);
        h = xLine && zLine ? HUE.white : floor ? HUE.alt : HUE.fg;
      }
      set(c, r, v, h);
    }
  }

  // packets racing along floor lines toward the horizon
  for (let k = 0; k < 14; k++) {
    const lane = Math.round((hash1(k * 31) - 0.5) * 14);
    const zz = ((hash1(k * 17) * 40 - t * (8 + hash1(k) * 10)) % 40 + 40) % 40 + 0.8;
    const sx = cols / 2 + ((lane - camX) / zz) * F, sy = hz + (camY * F * ax) / zz;
    set(Math.round(sx), Math.round(sy), clamp(1.2 - zz / 40), HUE.white, g.sq);
  }

  // data constructs, far → near
  for (const o of objs) {
    o.z -= 5.5 * dt;
    o.rot += o.rs * dt;
    if (o.z < 0.9) Object.assign(o, spawnObj(36 + R() * 6));
  }
  objs.sort((a, b) => b.z - a.z);
  for (const o of objs) {
    const zr = o.z;
    const bright = clamp(1.25 - zr / 30);
    const flick = o.type === "ice" ? (hash1(Math.floor(t * 18) + o.x * 100) > 0.25 ? 1 : 0.3) : 1;
    const v = bright * flick;
    const P = (px, py, pz) => {
      const c = Math.cos(o.rot), s = Math.sin(o.rot);
      const X = o.x + (px * c + pz * s) * o.s, Z = zr + (-px * s + pz * c) * o.s, Y = py * o.s;
      if (Z < 0.3) return null;
      return [cols / 2 + ((X - camX) / Z) * F, hz - ((Y - camY) / Z) * F * ax];
    };
    const wire = (VV, EE, oy = 0, sy = 1) => {
      const pts = VV.map(([x, y, z]) => P(x, y * sy + oy, z));
      for (const [a, b] of EE) {
        if (!pts[a] || !pts[b]) continue;
        f.line(pts[a][0], pts[a][1], pts[b][0], pts[b][1], v * 0.75, o.hue, "auto", ax);
      }
      for (const p of pts) if (p) f.plot(p[0], p[1], v, HUE.white, g.plus);
      return pts;
    };
    let topPt = null;
    if (o.type === "cube") topPt = wire(CUBE_V, CUBE_E, 1.2)[6];
    else if (o.type === "pyr") topPt = wire(PYR_V, PYR_E, 0)[4];
    else if (o.type === "tower") {
      const pts = wire(CUBE_V, CUBE_E, 2.6, 2.6);
      topPt = pts[6];
      for (let k = 1; k < 7; k++) {
        const ring = [[-1, k * 0.72, -1], [1, k * 0.72, -1], [1, k * 0.72, 1], [-1, k * 0.72, 1]].map(([x, y, z]) => P(x, y, z));
        const lit = Math.sin(t * 3 + k + o.x) > 0;
        for (let q = 0; q < 4; q++) {
          const a = ring[q], b = ring[(q + 1) % 4];
          if (a && b) f.line(a[0], a[1], b[0], b[1], v * (lit ? 0.6 : 0.25), lit ? HUE.alt : o.hue, g.hl, ax);
        }
      }
    } else if (o.type === "sphere") {
      for (let lat = -2; lat <= 2; lat++) {
        const yy = 1.3 + lat * 0.45, rr = Math.sqrt(Math.max(0, 1 - (lat * 0.45) ** 2));
        let prev = null;
        for (let k = 0; k <= 18; k++) {
          const a = (k / 18) * TAU;
          const p = P(Math.cos(a) * rr, yy, Math.sin(a) * rr);
          if (p && prev) f.line(prev[0], prev[1], p[0], p[1], v * 0.6, o.hue, undefined, ax);
          prev = p;
        }
      }
      topPt = P(0, 2.3, 0);
    } else {
      // black ICE: octahedron + pulsing spikes + shell
      const pulse = 1 + 0.25 * Math.sin(t * 9);
      const pts = wire(OCT_V.map(([x, y, z]) => [x * 1.3, y * 1.3, z * 1.3]), OCT_E, 1.5);
      for (const [x, y, z] of OCT_V) {
        const a = P(x * 1.3, y * 1.3 + 1.5, z * 1.3), b = P(x * 2.2 * pulse, y * 2.2 * pulse + 1.5, z * 2.2 * pulse);
        if (a && b) f.line(a[0], a[1], b[0], b[1], v, HUE.hot, "auto", ax);
      }
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * TAU;
        const p = P(Math.cos(a) * 2.6 * pulse, 1.5 + Math.sin(a) * 2.6 * pulse, 0);
        if (p) f.plot(p[0], p[1], v * 0.4, HUE.hot);
      }
      topPt = pts[2];
    }
    // light pillar from the floor
    const base = P(0, 0, 0);
    if (base && zr < 26) {
      for (let k = 0; k < 6; k++) f.plot(base[0], base[1] - k, v * 0.3 * (1 - k / 6), HUE.alt, g.vb);
    }
    if (topPt && zr < 15 && zr > 1.4) f.text(Math.round(topPt[0]) - Math.floor(o.label.length / 2), Math.round(topPt[1]) - 2, o.label, o.type === "ice" ? HUE.hot : HUE.main, clamp(1.3 - zr / 15));
  }

  const pct = Math.floor(clamp(tp / (PHASE - 1)) * 100);
  const bar = "▓".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
  hud(f, S, [
    ["JACK IN · ICE: black", HUE.alt],
    ["cowboy@matrix", HUE.fg],
    [`decrypt ${bar} ${pct}%`, pct > 95 ? HUE.hot : HUE.main],
  ]);
}

/* ═════════════ shared ═════════════ */
function shiftRow(f, cols, r, sh) {
  const o = r * cols;
  const v = f.v.slice(o, o + cols), h = f.h.slice(o, o + cols), gl = f.g.slice(o, o + cols);
  for (let c = 0; c < cols; c++) {
    const s = c - sh;
    if (s < 0 || s >= cols) continue;
    f.v[o + c] = v[s];
    f.h[o + c] = h[s];
    f.g[o + c] = gl[s];
  }
}

function glitch(f, S, k, t) {
  const { cols, rows } = S;
  const tick = Math.floor(t * 30);
  for (let r = 0; r < rows; r++) {
    if (hash1(r * 31 + tick * 7) < k * 0.55) {
      shiftRow(f, cols, r, Math.round((hash1(r + tick * 13) - 0.5) * k * 30));
      if (hash1(r * 5 + tick) < 0.4) for (let c = 0; c < cols; c++) if (f.v[r * cols + c] > 0.05) f.h[r * cols + c] = HUE.hot;
    }
  }
  const n = Math.floor(k * cols * rows * 0.03);
  for (let q = 0; q < n; q++) {
    const i = Math.floor(hash1(q * 977 + tick * 131) * cols * rows);
    f.v[i] = 0.4 + hash1(q + tick) * 0.6;
    f.h[i] = hash1(q * 3 + tick) < 0.5 ? HUE.hot : HUE.alt;
    f.g[i] = g.noise[(hash1(q * 7 + tick) * g.noise.length) | 0];
  }
}

function hud(f, S, lines) {
  const y0 = S.rows - lines.length - 1;
  lines.forEach(([s, h], k) => {
    for (let c = 1; c <= s.length + 2; c++) f.set(c, y0 + k, 0);
    f.text(2, y0 + k, s, h, 0.85);
  });
}

export default {
  id: "dune",
  title: "SPICE_AND_ICE",
  caption: "two worlds i keep rereading",

  init(f, S) {
    R = rng(10191);
    parts = [];
    thump = { x: 6, z: 38 };
    objs = [];
    for (let k = 0; k < 16; k++) objs.push(spawnObj(2 + k * 2.5));
  },

  frame(f, t, dt, S) {
    f.clear();
    const cyc = t % (PHASE * 2);
    const phaseB = cyc >= PHASE;
    const tp = phaseB ? cyc - PHASE : cyc;
    if (phaseB) cyberspace(f, S, tp, dt, t);
    else arrakis(f, S, tp, dt, t);
    const db = Math.min(tp, PHASE - tp);
    if (db < 0.6 && t > 1) glitch(f, S, 1 - db / 0.6, t);
  },
};
