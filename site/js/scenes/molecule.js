// ORIGIN: chemical engineer → frontend. A rotating ball-and-stick caffeine molecule.
import { HUE, G, clamp, smooth, noise3, slopeGlyph } from "../engine/util.js";

// approximate planar caffeine (1,3,7-trimethylxanthine), Å
function buildCaffeine() {
  const A = [];
  const B = [];
  const at = (el, x, y, z = 0) => (A.push({ el, p: [x, y, z] }), A.length - 1);
  const bond = (a, b, o = 1) => B.push([a, b, o]);
  const hx = (deg) => [1.4 * Math.cos((deg * Math.PI) / 180), 1.4 * Math.sin((deg * Math.PI) / 180)];
  // six-ring
  const C4 = at("C", ...hx(330)), C5 = at("C", ...hx(30)), C6 = at("C", ...hx(90));
  const N1 = at("N", ...hx(150)), C2 = at("C", ...hx(210)), N3 = at("N", ...hx(270));
  // five-ring fused on C4–C5
  const pc = 1.212 + 0.9635, pr = 1.191;
  const pv = (deg) => [pc + pr * Math.cos((deg * Math.PI) / 180), pr * Math.sin((deg * Math.PI) / 180)];
  const N7 = at("N", ...pv(72)), C8 = at("C", ...pv(0)), N9 = at("N", ...pv(-72));
  bond(N1, C2); bond(C2, N3); bond(N3, C4); bond(C4, C5, 2); bond(C5, C6); bond(C6, N1);
  bond(C5, N7); bond(N7, C8); bond(C8, N9, 2); bond(N9, C4);
  // carbonyls
  const O6 = at("O", 0, 1.4 + 1.22);
  bond(C6, O6, 2);
  const O2 = at("O", -1.212 - 1.22 * 0.866, -0.7 - 1.22 * 0.5);
  bond(C2, O2, 2);
  // methyls with tetrahedral H's
  const methyl = (n, dx, dy) => {
    const L = Math.hypot(dx, dy);
    dx /= L; dy /= L;
    const np = A[n].p;
    const c = at("C", np[0] + dx * 1.47, np[1] + dy * 1.47);
    bond(n, c);
    const cp = A[c].p;
    for (let k = 0; k < 3; k++) {
      const phi = (k * 2 * Math.PI) / 3 + 0.4;
      const ux = -dy, uy = dx; // in-plane perpendicular
      const hxp = dx * 0.334 + 0.943 * Math.cos(phi) * ux;
      const hyp = dy * 0.334 + 0.943 * Math.cos(phi) * uy;
      const hzp = 0.943 * Math.sin(phi);
      bond(c, at("H", cp[0] + hxp * 1.09, cp[1] + hyp * 1.09, hzp * 1.09));
    }
  };
  methyl(N1, -0.866, 0.5);
  methyl(N3, 0, -1);
  methyl(N7, Math.cos((72 * Math.PI) / 180), Math.sin((72 * Math.PI) / 180));
  bond(C8, at("H", A[C8].p[0] + 1.08, 0));
  // centre it
  const c = [0, 0, 0];
  for (const a of A) for (let k = 0; k < 3; k++) c[k] += a.p[k] / A.length;
  for (const a of A) for (let k = 0; k < 3; k++) a.p[k] -= c[k];
  return { A, B };
}

const MOL = buildCaffeine();
const STYLE = {
  C: { r: 0.56, hue: HUE.fg, k: 1 },
  N: { r: 0.53, hue: HUE.alt, k: 1 },
  O: { r: 0.53, hue: HUE.hot, k: 1 },
  H: { r: 0.33, hue: HUE.white, k: 0.62 },
};
const L = (() => {
  const l = [-0.45, 0.6, -0.66];
  const m = Math.hypot(...l);
  return l.map((v) => v / m);
})();

let zbuf = new Float32Array(1);
let proj = [];

export default {
  id: "molecule",
  title: "C8H10N4O2",
  caption: "chemical engineering degree, now running on caffeine",

  init(f, S) {
    zbuf = new Float32Array(S.cols * S.rows);
    proj = MOL.A.map(() => ({ x: 0, y: 0, z: 0, r: 0 }));
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gs = f.g;
    f.clear();
    zbuf.fill(1e9);

    // faint rising steam filaments behind everything
    const steamA = smooth(0, 2, t) * 0.3;
    for (let y = 0; y < rows; y += 1) {
      const py = y / ax;
      const fall = 0.25 + 0.75 * (y / rows);
      for (let x = 0; x < cols; x += 1) {
        const n = noise3(x * 0.07, py * 0.022 + t * 0.32, t * 0.09);
        const w = 1 - Math.abs(n);
        if (w < 0.93) continue;
        const patch = noise3(x * 0.018, py * 0.012 + t * 0.2, 7.3);
        if (patch < 0.05) continue;
        const i = y * cols + x;
        V[i] = (w - 0.93) * 14 * steamA * fall * Math.min(1, patch * 3);
        H[i] = HUE.fg;
      }
    }

    // camera
    const span = Math.min(cols, rows / ax);
    const scale = (span * 0.94) / 8.6; // cells per Å
    const cx = cols * 0.5, cy = rows * 0.5;
    let yaw = t * 0.55, pitch = 0.35 + Math.sin(t * 0.31) * 0.45, roll = Math.sin(t * 0.17) * 0.25;
    if (input.inside) {
      yaw += (input.x / cols - 0.5) * 1.6;
      pitch += (input.y / rows - 0.5) * 1.2;
    }
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const camD = 14;

    MOL.A.forEach((a, k) => {
      let [x, y, z] = a.p;
      // roll (z), yaw (y), pitch (x)
      [x, y] = [x * cr - y * sr, x * sr + y * cr];
      [x, z] = [x * cyw + z * syw, -x * syw + z * cyw];
      [y, z] = [y * cp - z * sp, y * sp + z * cp];
      const pers = camD / (camD + z);
      const grow = smooth(0, 0.5, t - k * 0.035);
      const P = proj[k];
      P.x = cx + x * scale * pers;
      P.y = cy - y * scale * pers * ax;
      P.z = z;
      P.r = STYLE[a.el].r * scale * pers * grow;
      P.w = pers;
    });

    // bonds first (spheres cover their ends via z-buffer)
    for (const [ia, ib, order] of MOL.B) {
      const a = proj[ia], b = proj[ib];
      if (a.r <= 0 || b.r <= 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy / ax) || 1;
      const g = slopeGlyph(dx, dy, ax);
      // perpendicular for double bonds, in cell units
      const px = (-dy / ax / len) * 0.9, py = (dx / len) * 0.9 * ax;
      const offs = order === 2 ? [-1, 1] : [0];
      const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 1.5) + 1;
      for (const o of offs) {
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const x = Math.round(a.x + dx * u + px * o), y = Math.round(a.y + dy * u + py * o);
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          const z = a.z + (b.z - a.z) * u;
          const i = y * cols + x;
          if (z >= zbuf[i]) continue;
          zbuf[i] = z;
          V[i] = clamp(0.62 - z * 0.06, 0.25, 0.8);
          H[i] = o === 0 ? HUE.fg : HUE.main;
          Gs[i] = g;
        }
      }
    }

    // spheres
    MOL.A.forEach((a, k) => {
      const P = proj[k];
      const r = P.r;
      if (r < 0.3) return;
      const st = STYLE[a.el];
      const y0 = Math.max(0, Math.floor(P.y - r * ax - 1)), y1 = Math.min(rows - 1, Math.ceil(P.y + r * ax + 1));
      const x0 = Math.max(0, Math.floor(P.x - r - 1)), x1 = Math.min(cols - 1, Math.ceil(P.x + r + 1));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = (x - P.x) / r, dy = (y - P.y) / ax / r;
          const d2 = dx * dx + dy * dy;
          if (d2 > 1) continue;
          const dz = Math.sqrt(1 - d2);
          const z = P.z - (dz * r) / scale;
          const i = y * cols + x;
          if (z >= zbuf[i]) continue;
          zbuf[i] = z;
          // normal faces the viewer (-z)
          const ndl = Math.max(0, dx * L[0] - dy * L[1] + -dz * L[2]);
          const spec = Math.pow(ndl, 18);
          const rim = d2 > 0.82 ? 0.12 : 0;
          V[i] = clamp((0.16 + 0.7 * ndl + rim) * st.k * (0.75 + 0.25 * P.w) + spec * 0.5, 0.08, 1);
          H[i] = spec > 0.45 ? HUE.white : st.hue;
          Gs[i] = -1;
        }
      }
      // element letter
      if (r >= 1.6) {
        const lx = Math.round(P.x), ly = Math.round(P.y);
        const i = ly * cols + lx;
        if (lx >= 0 && ly >= 0 && lx < cols && ly < rows && Math.abs(zbuf[i] - (P.z - r / scale)) < 0.05) {
          V[i] = 1;
          H[i] = a.el === "C" ? HUE.main : st.hue;
          Gs[i] = G(a.el);
        }
      }
    });

    // HUD
    const hudA = smooth(0.3, 1, t);
    if (hudA > 0) {
      f.text(2, 1, "fuel.exe", HUE.main, 0.95 * hudA);
      f.text(2, 2, "──────────", HUE.fg, 0.4 * hudA);
      const lab = "C8H10N4O2 · caffeine";
      f.text(2, rows - 3, lab, HUE.alt, 0.9 * hudA);
      f.text(2, rows - 2, "MW 194.19 g/mol · mp 235°C", HUE.fg, 0.5 * hudA);
      const deg = (((yaw * 180) / Math.PI) % 360 + 360) % 360;
      const rd = `rot ${deg.toFixed(0).padStart(3, "0")}°`;
      if (cols > 30) f.text(cols - rd.length - 2, 1, rd, HUE.fg, 0.55 * hudA);
      const leg = ["●C", "●N", "●O", "●H"];
      const lh = [HUE.fg, HUE.alt, HUE.hot, HUE.white];
      if (cols > 40)
        leg.forEach((s, k) => f.text(cols - 4, rows - 2 - (leg.length - 1 - k) * 1, s, lh[k], 0.8 * hudA));
    }
  },
};
