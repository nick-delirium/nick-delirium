// Mobile-suit portrait: a hand-built low-poly RX-78-style head, z-buffered and shaded into
// dense glyphs over a field of "/" hatching. Rim light reveals it, the eyes ignite with an
// anamorphic flare, the camera orbits and pushes in, then a beam saber lights it from below.
import { HUE, clamp, smooth, lerp, hash2, rng, G } from "../engine/util.js";

const LOOP = 16;
const RAMP_S = " .`':;!*+%$#&8@";
const RG = Array.from(RAMP_S, (c) => G(c));
const NR = RG.length;
const SLASH = G("/");
const LINE = G("─");
const EQ = G("=");
const PLUS = G("+");
const BAR = G("|");
const STAR = G("*");
const DOT = G("·");
const SOLID = G("█");
const HASH = G("#");
const SHADE = G("▓");

/* ───────── materials ───────── */
// albedo, hue, emissive kind (0 none, 1 eye, 2 camera)
const MATS = {
  white: [0.95, HUE.white, 0],
  grey: [0.74, HUE.white, 0],
  dark: [0.1, HUE.fg, 0],
  fin: [0.92, HUE.main, 0],
  red: [0.6, HUE.hot, 0],
  eye: [0.16, HUE.alt, 1],
  cam: [0.3, HUE.alt, 2],
  collar: [0.4, HUE.fg, 0],
};
const MAT_NAMES = Object.keys(MATS);
const M_ALB = MAT_NAMES.map((k) => MATS[k][0]);
const M_HUE = MAT_NAMES.map((k) => MATS[k][1]);
const M_EMIT = MAT_NAMES.map((k) => MATS[k][2]);
const M_FIN = MAT_NAMES.indexOf("fin");

/* ───────── mesh (model space: x right, y up, z toward the viewer) ───────── */
const VX = [], VY = [], VZ = [], VU = [];
const TRI = []; // [a, b, c, mat, part, nx, ny, nz]
let partId = 0;

function addConvex(pts, faces, mat, us) {
  const base = VX.length;
  let cx = 0, cy = 0, cz = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
    cz += p[2];
  }
  cx /= pts.length;
  cy /= pts.length;
  cz /= pts.length;
  pts.forEach((p, i) => {
    VX.push(p[0]);
    VY.push(p[1]);
    VZ.push(p[2]);
    VU.push(us ? us[i] : 0);
  });
  const m = MAT_NAMES.indexOf(mat);
  const part = partId++;
  for (const face of faces) {
    for (let k = 1; k < face.length - 1; k++) {
      let a = face[0], b = face[k], c = face[k + 1];
      const A = pts[a], B = pts[b], C = pts[c];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
      const wx = C[0] - A[0], wy = C[1] - A[1], wz = C[2] - A[2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-9) continue;
      nx /= len;
      ny /= len;
      nz /= len;
      const fx = (A[0] + B[0] + C[0]) / 3 - cx, fy = (A[1] + B[1] + C[1]) / 3 - cy, fz = (A[2] + B[2] + C[2]) / 3 - cz;
      if (nx * fx + ny * fy + nz * fz < 0) {
        [b, c] = [c, b];
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      TRI.push([base + a, base + b, base + c, m, part, nx, ny, nz]);
    }
  }
}

const HEX_FACES = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [0, 1, 5, 4],
  [1, 2, 6, 5],
  [2, 3, 7, 6],
  [3, 0, 4, 7],
];
// front quad (bl, br, tr, tl) + back quad in the same order
const hex = (front, back, mat) => addConvex([...front, ...back], HEX_FACES, mat);
const mx = (p) => [-p[0], p[1], p[2]];
const mirrorHex = (front, back, mat) => {
  hex(front, back, mat);
  hex([front[1], front[0], front[3], front[2]].map(mx), [back[1], back[0], back[3], back[2]].map(mx), mat);
};
const box = (x0, x1, y0, y1, z0, z1, mat) =>
  hex(
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]],
    mat
  );

function blade(P0, P1, w0, w1, u0, u1, mat) {
  const dx = P1[0] - P0[0], dy = P1[1] - P0[1];
  const len = Math.hypot(dx, dy);
  const px = -dy / len, py = dx / len;
  const th = 0.03, bump = 0.014;
  const end = (P, w) => [
    [P[0] + (px * w) / 2, P[1] + (py * w) / 2, P[2] + th / 2],
    [P[0], P[1], P[2] + th / 2 + bump],
    [P[0] - (px * w) / 2, P[1] - (py * w) / 2, P[2] + th / 2],
    [P[0] + (px * w) / 2, P[1] + (py * w) / 2, P[2] - th / 2],
    [P[0] - (px * w) / 2, P[1] - (py * w) / 2, P[2] - th / 2],
  ];
  const e0 = end(P0, w0), e1 = end(P1, w1);
  // 0 A0 1 C0 2 B0 3 A0b 4 B0b | 5 A1 6 C1 7 B1 8 A1b 9 B1b
  addConvex(
    [...e0, ...e1],
    [
      [0, 1, 6, 5],
      [1, 2, 7, 6],
      [3, 8, 9, 4],
      [0, 5, 8, 3],
      [2, 4, 9, 7],
      [0, 3, 4, 2, 1],
      [5, 6, 7, 9, 8],
    ],
    mat,
    [u0, u0, u0, u0, u0, u1, u1, u1, u1, u1]
  );
}

function prismX(x0, x1, cy, cz, r0, r1, mat) {
  const pts = [];
  for (const [x, r] of [[x0, r0], [x1, r1]]) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + Math.PI / 8;
      pts.push([x, cy + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  }
  const faces = [[0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14, 15]];
  for (let k = 0; k < 8; k++) faces.push([k, (k + 1) % 8, 8 + ((k + 1) % 8), 8 + k]);
  addConvex(pts, faces, mat);
}

function buildMesh() {
  // helmet crown + top ridge
  hex(
    [[-0.44, 0.3, 0.36], [0.44, 0.3, 0.36], [0.3, 0.58, 0.16], [-0.3, 0.58, 0.16]],
    [[-0.46, 0.3, -0.42], [0.46, 0.3, -0.42], [0.32, 0.6, -0.3], [-0.32, 0.6, -0.3]],
    "white"
  );
  hex(
    [[-0.06, 0.56, 0.2], [0.06, 0.56, 0.2], [0.05, 0.665, 0.08], [-0.05, 0.665, 0.08]],
    [[-0.06, 0.58, -0.32], [0.06, 0.58, -0.32], [0.05, 0.665, -0.26], [-0.05, 0.665, -0.26]],
    "white"
  );
  // brow, a shallow V meeting at the centre
  mirrorHex(
    [[-0.41, 0.17, 0.36], [0, 0.145, 0.43], [0, 0.3, 0.41], [-0.45, 0.3, 0.35]],
    [[-0.41, 0.17, 0.08], [0, 0.145, 0.08], [0, 0.3, 0.08], [-0.45, 0.3, 0.08]],
    "white"
  );
  // centre crest, forehead camera, fin root
  hex(
    [[-0.05, 0.17, 0.455], [0.05, 0.17, 0.455], [0.04, 0.4, 0.43], [-0.04, 0.4, 0.43]],
    [[-0.05, 0.17, 0.24], [0.05, 0.17, 0.24], [0.04, 0.4, 0.24], [-0.04, 0.4, 0.24]],
    "red"
  );
  box(-0.022, 0.022, 0.25, 0.3, 0.42, 0.458, "cam");
  hex(
    [[-0.1, 0.38, 0.44], [0.1, 0.38, 0.44], [0.08, 0.47, 0.41], [-0.08, 0.47, 0.41]],
    [[-0.1, 0.38, 0.3], [0.1, 0.38, 0.3], [0.08, 0.47, 0.3], [-0.08, 0.47, 0.3]],
    "fin"
  );
  // the V-fin: two long blades, each in two segments
  for (const s of [1, -1]) {
    const B = [0.07 * s, 0.42, 0.42], M = [0.37 * s, 0.86, 0.38], T = [0.76 * s, 1.42, 0.32];
    blade(B, M, 0.085, 0.062, 0, 0.47, "fin");
    partId--; // both segments share a part, so no seam between them
    blade(M, T, 0.062, 0.012, 0.47, 1, "fin");
  }
  // vulcans on the temples, with dark muzzles
  for (const s of [1, -1]) {
    box(s > 0 ? 0.34 : -0.46, s > 0 ? 0.46 : -0.34, 0.29, 0.37, 0.24, 0.39, "white");
    box(s > 0 ? 0.37 : -0.43, s > 0 ? 0.43 : -0.37, 0.31, 0.35, 0.38, 0.4, "dark");
  }
  // eye socket and the angular eyes
  hex(
    [[-0.37, 0.015, 0.33], [0.37, 0.015, 0.33], [0.39, 0.18, 0.35], [-0.39, 0.18, 0.35]],
    [[-0.37, 0.015, 0.1], [0.37, 0.015, 0.1], [0.39, 0.18, 0.1], [-0.39, 0.18, 0.1]],
    "dark"
  );
  mirrorHex(
    [[-0.32, 0.09, 0.372], [-0.07, 0.06, 0.38], [-0.1, 0.112, 0.378], [-0.345, 0.165, 0.37]],
    [[-0.32, 0.09, 0.3], [-0.07, 0.06, 0.3], [-0.1, 0.112, 0.3], [-0.345, 0.165, 0.3]],
    "eye"
  );
  // cheeks, angled outward
  mirrorHex(
    [[-0.26, -0.34, 0.27], [-0.18, -0.355, 0.345], [-0.21, 0.02, 0.365], [-0.37, 0.02, 0.32]],
    [[-0.26, -0.34, 0.04], [-0.18, -0.355, 0.04], [-0.21, 0.02, 0.04], [-0.37, 0.02, 0.04]],
    "grey"
  );
  // faceplate in two halves with a centre ridge, plus the mouth vents
  mirrorHex(
    [[-0.12, -0.33, 0.39], [0, -0.345, 0.425], [0, 0.02, 0.405], [-0.205, 0.02, 0.365]],
    [[-0.12, -0.33, 0.14], [0, -0.345, 0.14], [0, 0.02, 0.14], [-0.205, 0.02, 0.14]],
    "grey"
  );
  for (const x of [-0.105, -0.055, 0.03, 0.08]) {
    const zc = 0.41 - Math.abs(x + 0.0125) * 0.2;
    box(x, x + 0.025, -0.25, -0.025, zc - 0.03, zc + 0.014, "dark");
  }
  // chin and jaw underside
  hex(
    [[-0.1, -0.49, 0.36], [0.1, -0.49, 0.36], [0.125, -0.33, 0.41], [-0.125, -0.33, 0.41]],
    [[-0.09, -0.48, 0.1], [0.09, -0.48, 0.1], [0.11, -0.33, 0.1], [-0.11, -0.33, 0.1]],
    "red"
  );
  box(-0.28, 0.28, -0.45, -0.32, -0.3, 0.25, "grey");
  // side guards of the helmet and the round "ears"
  mirrorHex(
    [[-0.46, -0.36, 0.12], [-0.34, -0.36, 0.15], [-0.36, 0.3, 0.36], [-0.5, 0.3, 0.32]],
    [[-0.46, -0.36, -0.36], [-0.34, -0.36, -0.36], [-0.36, 0.3, -0.4], [-0.5, 0.3, -0.4]],
    "white"
  );
  for (const s of [1, -1]) {
    prismX(s * 0.44, s * 0.6, 0.03, -0.03, 0.15, 0.13, "white");
    prismX(s * 0.595, s * 0.615, 0.03, -0.03, 0.075, 0.06, "dark");
  }
  // back plate, neck with ribs, collar
  box(-0.37, 0.37, -0.38, 0.31, -0.42, -0.2, "white");
  hex(
    [[-0.28, -0.68, 0.17], [0.28, -0.68, 0.17], [0.25, -0.4, 0.13], [-0.25, -0.4, 0.13]],
    [[-0.28, -0.68, -0.26], [0.28, -0.68, -0.26], [0.25, -0.4, -0.26], [-0.25, -0.4, -0.26]],
    "grey"
  );
  for (const y of [-0.5, -0.59]) {
    const zf = 0.13 + ((-0.4 - y) / 0.28) * 0.04;
    box(-0.23, 0.23, y - 0.014, y + 0.014, zf - 0.03, zf + 0.016, "dark");
  }
  hex(
    [[-0.86, -0.98, 0.34], [0.86, -0.98, 0.34], [0.5, -0.64, 0.22], [-0.5, -0.64, 0.22]],
    [[-0.86, -0.98, -0.44], [0.86, -0.98, -0.44], [0.5, -0.64, -0.32], [-0.5, -0.64, -0.32]],
    "collar"
  );
  hex(
    [[-0.9, -1.4, 0.36], [0.9, -1.4, 0.36], [0.86, -0.98, 0.34], [-0.86, -0.98, 0.34]],
    [[-0.9, -1.4, -0.44], [0.9, -1.4, -0.44], [0.86, -0.98, -0.44], [-0.86, -0.98, -0.44]],
    "white"
  );
}
buildMesh();

const NV = VX.length;
const NT = TRI.length;
const T_A = Int32Array.from(TRI, (t) => t[0]);
const T_B = Int32Array.from(TRI, (t) => t[1]);
const T_C = Int32Array.from(TRI, (t) => t[2]);
const T_M = Uint8Array.from(TRI, (t) => t[3]);
const T_P = Int16Array.from(TRI, (t) => t[4]);
const T_NX = Float32Array.from(TRI, (t) => t[5]);
const T_NY = Float32Array.from(TRI, (t) => t[6]);
const T_NZ = Float32Array.from(TRI, (t) => t[7]);

const MVX = Float32Array.from(VX), MVY = Float32Array.from(VY), MVZ = Float32Array.from(VZ), MVU = Float32Array.from(VU);
const RX = new Float32Array(NV), RY = new Float32Array(NV), RZ = new Float32Array(NV);
const PX = new Float32Array(NV), PY = new Float32Array(NV), PD = new Float32Array(NV);

const EYE_L = [-0.2, 0.11, 0.38], EYE_R = [0.2, 0.11, 0.38];
const CAM_D = 3.2;

let zb, pb, sv, sh, eyeMask, sparks, R;
let cols, rows, ax, closeUp, scale0, ycen, ox, oy;

function norm3(x, y, z) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
const LK = norm3(-0.5, 0.55, 0.78);
const LF = norm3(0.7, -0.15, 0.45);

export default {
  id: "gundam",
  title: "MOBILE_SUIT",
  caption: "eyes on. the white one wakes up",

  init(f, S) {
    ({ cols, rows, ax } = S);
    const n = cols * rows;
    zb = new Float32Array(n);
    pb = new Int16Array(n);
    sv = new Float32Array(n);
    sh = new Uint8Array(n);
    eyeMask = new Uint8Array(n);
    sparks = [];
    R = rng(78);
    const physW = cols, physH = rows / ax;
    closeUp = physW / physH > 1.25;
    if (closeUp) {
      scale0 = physH / 1.8;
      ycen = 0.16;
      ox = cols * 0.66;
      oy = rows * 0.5;
    } else {
      scale0 = Math.min((physH * 0.9) / 1.9, (physW * 1.04) / 1.22);
      ycen = 0.12;
      ox = cols * 0.5;
      // chin near the bottom of the panel: the V-fin owns the upper third
      oy = rows * 0.8 - (0.49 + ycen) * scale0 * ax;
    }
  },

  frame(f, t, dt, S) {
    const V = f.v, H = f.h, Gg = f.g;
    const n = cols * rows;
    const tl = t % LOOP;
    const loop = Math.floor(t / LOOP);
    const side = loop % 2 ? -1 : 1;

    /* ── timeline ── */
    const fadeOut = 1 - smooth(14.6, 15.8, tl);
    const key = lerp(0.3, 1, smooth(1.1, 4, tl)) * lerp(0.16, 1, fadeOut);
    const theta = lerp(-1.5, 1.5, smooth(0, 3.4, tl));
    const rimI = lerp(1.1, 0.55, smooth(2.6, 4.5, tl)) * lerp(0.45, 1, fadeOut);
    let eye = 0;
    if (tl > 3.3 && tl < 15.4) {
      if (tl < 3.42) eye = 0.85;
      else if (tl < 3.55) eye = 0.08;
      else if (tl < 3.62) eye = 0.7;
      else eye = Math.min(1, 0.55 + (tl - 3.62) * 2);
      eye *= 1 - smooth(14.7, 15.3, tl);
    }
    const flare = tl > 3.55 ? (0.3 + 0.85 * Math.exp(-(tl - 3.6) / 0.6)) * (1 - smooth(14.4, 15, tl)) : 0;
    const hatchBoost = tl > 3.55 ? 0.13 * Math.exp(-(tl - 3.6) / 0.45) : 0;
    const saberLen = smooth(9.6, 9.95, tl) * (1 - smooth(13.35, 13.65, tl));
    const glintOn = smooth(4.5, 5.5, tl) * fadeOut;
    const glintU = (((tl - 4.5) / 2.4) % 1) * 1.35 - 0.2;

    /* ── camera ── */
    const vary = [-0.1, 0.12, -0.04, 0.07][loop % 4];
    const yaw = lerp(-0.34, 0.36, smooth(0, 14.5, tl)) + vary;
    const pitch = -0.13 + 0.04 * Math.sin(tl * 0.4);
    const roll = (0.07 + 0.02 * Math.sin(tl * 0.3)) * side;
    const scale = scale0 * (1 + 0.1 * smooth(3, 14, tl));
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const rot = (x, y, z, out, i) => {
      const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      out[0] = x1 * cr - y2 * sr;
      out[1] = x1 * sr + y2 * cr;
      out[2] = z2;
    };
    const tmp = [0, 0, 0];
    const project = (x, y, z) => {
      const k = CAM_D / (CAM_D - z);
      return [ox + x * scale * k, oy - (y - ycen) * scale * ax * k];
    };
    for (let i = 0; i < NV; i++) {
      rot(MVX[i], MVY[i], MVZ[i], tmp);
      RX[i] = tmp[0];
      RY[i] = tmp[1];
      RZ[i] = tmp[2];
      const k = CAM_D / (CAM_D - tmp[2]);
      PX[i] = ox + tmp[0] * scale * k;
      PY[i] = oy - (tmp[1] - ycen) * scale * ax * k;
      PD[i] = CAM_D - tmp[2];
    }

    /* ── beam saber (foreground, view space) ── */
    // the blade rises out of the bottom edge of the frame, across the jaw
    const yBottom = ycen - (rows - oy) / (scale * ax);
    const hilt = [-0.5 * side, yBottom - 0.04, 0.6];
    const tipFull = [0.78 * side, yBottom + 0.72, 0.72];
    const tip = [lerp(hilt[0], tipFull[0], saberLen), lerp(hilt[1], tipFull[1], saberLen), lerp(hilt[2], tipFull[2], saberLen)];
    const sdx = tip[0] - hilt[0], sdy = tip[1] - hilt[1], sdz = tip[2] - hilt[2];
    const sl2 = sdx * sdx + sdy * sdy + sdz * sdz || 1;

    /* ── raster ── */
    zb.fill(1e9);
    pb.fill(-1);
    eyeMask.fill(0);
    const rimL = norm3(Math.sin(theta), 0.3, -0.55 * Math.cos(theta) - 0.25);
    for (let ti = 0; ti < NT; ti++) {
      const a = T_A[ti], b = T_B[ti], c = T_C[ti];
      rot(T_NX[ti], T_NY[ti], T_NZ[ti], tmp);
      const nx = tmp[0], ny = tmp[1], nz = tmp[2];
      // back-face cull against the camera at (0, ycen, CAM_D)
      if (nx * -RX[a] + ny * (ycen - RY[a]) + nz * (CAM_D - RZ[a]) <= 0) continue;
      const m = T_M[ti];
      const alb = M_ALB[m];
      const emit = M_EMIT[m];
      const kd = Math.max(0, nx * LK[0] + ny * LK[1] + nz * LK[2]);
      const fd = Math.max(0, nx * LF[0] + ny * LF[1] + nz * LF[2]);
      const rd = Math.max(0, nx * rimL[0] + ny * rimL[1] + nz * rimL[2]);
      const fres = Math.pow(1 - Math.max(0, nz), 3);
      let base = alb * (0.03 + key * (0.06 + 0.94 * kd * Math.sqrt(kd)) + 0.08 * fd) + rimI * (rd * (alb > 0.3 ? 0.7 : 0.2) + fres * 0.2);
      let hue = M_HUE[m];
      let isEye = 0;
      if (emit === 1 && eye > 0.05) {
        base = Math.max(base, 0.35 + 0.65 * eye);
        isEye = 1;
      } else if (emit === 2 && eye > 0.05) {
        base = Math.max(base, 0.25 + 0.5 * eye);
      } else if (emit) {
        hue = HUE.fg;
      }
      if (m === 4) base *= 0.8; // red parts stay dim

      const x0 = PX[a], y0 = PY[a], x1 = PX[b], y1 = PY[b], x2 = PX[c], y2 = PY[c];
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-6) continue;
      const inv = 1 / area;
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(cols - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(rows - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minX > maxX || minY > maxY) continue;
      const d0 = PD[a], d1 = PD[b], d2 = PD[c];
      const part = T_P[ti];
      const fin = m === M_FIN;
      const lit = saberLen > 0.02 && !isEye;
      for (let y = minY; y <= maxY; y++) {
        let i = y * cols + minX;
        for (let x = minX; x <= maxX; x++, i++) {
          const w0 = ((x1 - x) * (y2 - y) - (x2 - x) * (y1 - y)) * inv;
          if (w0 < -0.002) continue;
          const w1 = ((x2 - x) * (y0 - y) - (x0 - x) * (y2 - y)) * inv;
          if (w1 < -0.002) continue;
          const w2 = 1 - w0 - w1;
          if (w2 < -0.002) continue;
          const d = w0 * d0 + w1 * d1 + w2 * d2;
          if (d >= zb[i]) continue;
          zb[i] = d;
          pb[i] = part;
          eyeMask[i] = isEye;
          let v = base;
          let hh = hue;
          if (fin && glintOn > 0) {
            const u = w0 * MVU[a] + w1 * MVU[b] + w2 * MVU[c];
            const g = Math.exp(-((u - glintU) * (u - glintU)) / 0.004);
            v += g * 0.75 * glintOn * key;
          }
          if (lit) {
            const px = w0 * RX[a] + w1 * RX[b] + w2 * RX[c];
            const py = w0 * RY[a] + w1 * RY[b] + w2 * RY[c];
            const pz = w0 * RZ[a] + w1 * RZ[b] + w2 * RZ[c];
            let s = ((px - hilt[0]) * sdx + (py - hilt[1]) * sdy + (pz - hilt[2]) * sdz) / sl2;
            s = s < 0 ? 0 : s > 1 ? 1 : s;
            const lx = hilt[0] + sdx * s - px, ly = hilt[1] + sdy * s - py, lz = hilt[2] + sdz * s - pz;
            const l2 = lx * lx + ly * ly + lz * lz;
            const il = 1 / Math.sqrt(l2 || 1e-6);
            const ndl = Math.max(0, (nx * lx + ny * ly + nz * lz) * il);
            const sc = (saberLen * 1.15 * ndl) / (1 + l2 * 9);
            if (sc > 0.04) {
              v += sc * Math.max(alb, 0.3);
              if (sc > 0.3 && hh !== HUE.alt) hh = HUE.main;
            }
          }
          sv[i] = v;
          sh[i] = hh;
        }
      }
    }

    /* ── compose: hatch background, then the shaded mesh with seams and silhouette ── */
    const hcx = ox, hcy = oy;
    const physMax = Math.max(cols, rows / ax);
    const bandC = ((tl * 0.09) % 1.4) - 0.2;
    for (let y = 0, i = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++, i++) {
        const p = pb[i];
        if (p < 0) {
          const dx = x - hcx, dy = (y - hcy) / ax;
          const r = Math.sqrt(dx * dx + dy * dy) / physMax;
          const vig = 1 - 0.6 * smooth(0.2, 0.8, r);
          const s = (x + y) / (cols + rows);
          const band = Math.exp(-((s - bandC) * (s - bandC)) / 0.012);
          const ripple = 0.5 + 0.5 * Math.sin((x + y) * 0.21 - tl * 0.9);
          let v = (0.1 + 0.035 * ripple + 0.09 * band + hatchBoost) * vig;
          if (hash2(x, y) < 0.03) v *= 0.4;
          V[i] = v;
          H[i] = HUE.fg;
          Gg[i] = SLASH;
          continue;
        }
        let v = sv[i];
        if (!eyeMask[i]) {
          const z = zb[i];
          let seam = false, edge = false;
          if (x + 1 < cols) {
            const q = pb[i + 1];
            if (q < 0) edge = true;
            else if (q !== p && z >= zb[i + 1] - 0.015) seam = true;
          } else edge = true;
          if (y + 1 < rows) {
            const q = pb[i + cols];
            if (q < 0) edge = true;
            else if (q !== p && z >= zb[i + cols] - 0.015) seam = true;
          } else edge = true;
          if (x > 0) {
            const q = pb[i - 1];
            if (q < 0) edge = true;
            else if (q !== p && z > zb[i - 1] + 0.015) seam = true;
          }
          if (y > 0) {
            const q = pb[i - cols];
            if (q < 0) edge = true;
            else if (q !== p && z > zb[i - cols] + 0.015) seam = true;
          }
          if (seam) v *= 0.16;
          else if (edge) v = Math.max(v * 1.12, 0.2 + 0.32 * rimI * key + 0.1);
        }
        if (v < 0.05) {
          V[i] = 0;
          Gg[i] = -1;
          continue;
        }
        const dith = (hash2(x * 3 + 1, y * 7 + 2) - 0.5) * 0.09;
        const gi = Math.max(1, Math.min(NR - 1, Math.round(Math.pow(clamp(v + dith), 0.9) * (NR - 1))));
        V[i] = Math.min(1, v);
        H[i] = sh[i];
        Gg[i] = RG[gi];
      }
    }

    /* ── anamorphic flare from each eye ── */
    if (flare > 0.02 && eye > 0.05) {
      for (const E of [EYE_L, EYE_R]) {
        rot(E[0], E[1], E[2], tmp);
        const [ex, ey] = project(tmp[0], tmp[1], tmp[2]);
        const L = Math.min(cols * 0.62, 120) * Math.sqrt(flare);
        const ry = Math.round(ey);
        for (let dx = -Math.ceil(L); dx <= L; dx++) {
          const ad = Math.abs(dx);
          const fv = flare * Math.exp(-ad / (L * 0.26)) * (1 - ad / (L + 1));
          if (fv < 0.05) continue;
          if (fv > 0.16) f.set(ex + dx, ry, Math.min(1, fv), HUE.alt, ad < 2 ? EQ : LINE);
          else f.plot(ex + dx, ry, fv, HUE.alt, LINE);
        }
        if (flare > 0.3) {
          for (let k = 1; k <= 2; k++) {
            f.plot(ex, ry - k, flare * (0.6 - k * 0.2), HUE.alt, BAR);
            f.plot(ex, ry + k, flare * (0.6 - k * 0.2), HUE.alt, BAR);
          }
          f.plot(ex, ry, 1, HUE.white, PLUS);
        }
      }
    }

    /* ── beam saber blade, hilt and sparks ── */
    if (saberLen > 0.01) {
      const [hx, hy] = project(hilt[0], hilt[1], hilt[2]);
      const [tx, ty] = project(tip[0], tip[1], tip[2]);
      const [bx, by] = project(hilt[0] - sdx * 0.12 / Math.max(saberLen, 0.05), hilt[1] - sdy * 0.12 / Math.max(saberLen, 0.05), hilt[2]);
      const glow = 4.2;
      const drawSeg = (x0, y0, x1, y1, fn) => {
        const minX = Math.max(0, Math.floor(Math.min(x0, x1) - glow - 1));
        const maxX = Math.min(cols - 1, Math.ceil(Math.max(x0, x1) + glow + 1));
        const minY = Math.max(0, Math.floor(Math.min(y0, y1) - glow * ax - 1));
        const maxY = Math.min(rows - 1, Math.ceil(Math.max(y0, y1) + glow * ax + 1));
        const ex = x1 - x0, ey = (y1 - y0) / ax;
        const el = ex * ex + ey * ey || 1;
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const qx = x - x0, qy = (y - y0) / ax;
            let s = (qx * ex + qy * ey) / el;
            s = s < 0 ? 0 : s > 1 ? 1 : s;
            const ddx = qx - ex * s, ddy = qy - ey * s;
            fn(x, y, Math.sqrt(ddx * ddx + ddy * ddy), s);
          }
        }
      };
      const flick = 0.92 + 0.08 * Math.sin(t * 47);
      drawSeg(hx, hy, tx, ty, (x, y, d) => {
        if (d < 0.8) f.set(x, y, flick, HUE.white, SOLID);
        else if (d < 1.7) f.set(x, y, 0.9 * flick, HUE.main, HASH);
        else if (d < glow) {
          const gv = 0.62 * Math.exp(-(d - 1.7) / 1.1) * flick;
          if (gv > 0.06) f.plot(x, y, gv, HUE.main, RG[Math.max(1, Math.round(gv * (NR - 1)))]);
        }
      });
      drawSeg(bx, by, hx, hy, (x, y, d) => {
        if (d < 1.3) f.set(x, y, 0.32, HUE.fg, SHADE);
      });
      if (saberLen > 0.95 && R() < 0.5) {
        const fromTip = R() < 0.35;
        sparks.push({ x: fromTip ? tx : hx, y: fromTip ? ty : hy, vx: (R() - 0.5) * 30, vy: (R() - 0.8) * 14, life: 0.4 + R() * 0.5 });
      }
    }
    for (let k = sparks.length - 1; k >= 0; k--) {
      const s = sparks[k];
      s.life -= dt;
      if (s.life <= 0) {
        sparks.splice(k, 1);
        continue;
      }
      s.vy += 26 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt * ax;
      f.plot(s.x, s.y, Math.min(1, s.life * 1.8), s.life > 0.35 ? HUE.white : HUE.main, s.life > 0.3 ? STAR : DOT);
    }

    /* ── one quiet HUD line ── */
    if (cols > 40) {
      const msg = `RX-78 · head unit · eyes: ${eye > 0.5 ? "ON" : "OFF"}`;
      for (let k = -1; k <= msg.length; k++) f.set(2 + k, rows - 2, 0);
      f.text(2, rows - 2, msg, eye > 0.5 ? HUE.alt : HUE.fg, 0.38);
    }
  },
};
