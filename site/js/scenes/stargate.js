// EVE Online: a stargate hanging in a nebula. A ship burns in, the gate charges,
// arcs crawl over the ring, the jump flashes white, local says o7.
import { HUE, G, TAU, clamp, lerp, smooth, fract, fbm2, rng } from "../engine/util.js";

function hash2(x, y) {
  let h = Math.imul((x | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((y | 0) + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const CYCLE = 13;
const DC = 3.2; // camera distance in gate radii
const DOT = G("·"), PLUS = G("+"), STAR = G("*"), BULLET = G("●"), HLINE = G("─"), VLINE = G("│");
const L = (() => {
  const v = [-0.55, 0.45, -0.7];
  const m = Math.hypot(...v);
  return v.map((c) => c / m);
})();

const st = {};

/** text on a cleared backing so the nebula doesn't bleed through spaces */
function label(f, x, y, str, hue, v) {
  for (let i = -1; i <= str.length; i++) f.set(x + i, y, 0);
  f.text(x, y, str, hue, v);
}

function layout(S) {
  const { cols, rows, ax } = S;
  const portrait = rows * ax > cols;
  const Rg = Math.min(cols * (portrait ? 0.38 : 0.25), (rows / ax) * (portrait ? 0.26 : 0.3));
  return { cx: cols * (portrait ? 0.5 : 0.56), cy: rows * (portrait ? 0.42 : 0.47), Rg, portrait };
}

/** gate geometry in unit radii: ring band, energy ring, pylons with lattice, tip lights */
function buildModel(Rg) {
  const P = [];
  const push = (x, y, z, nx, ny, nz, kind, sh, th) => P.push({ x, y, z, nx, ny, nz, kind, sh, th });
  const SEG = 18;
  const nth = Math.ceil(TAU * Rg * 1.6);
  const nr = Math.max(3, Math.ceil((0.1 * Rg) / 0.7));
  for (let i = 0; i < nth; i++) {
    const th = (i / nth) * TAU;
    const sp = ((th / TAU) * SEG) % 1;
    if (sp < 0.045) continue;
    const plate = Math.floor((th / TAU) * SEG) % 2;
    const c = Math.cos(th), s = Math.sin(th);
    for (let a = 0; a < nr; a++) {
      const r = 0.9 + (0.1 * a) / (nr - 1);
      for (const z of [-0.07, 0, 0.07]) {
        let nx = c, ny = s, nz = 0;
        if (a === 0) (nx = -c), (ny = -s);
        else if (a < nr - 1) (nx = 0), (ny = 0), (nz = z < 0 ? -1 : z > 0 ? 1 : -1);
        const seam = sp < 0.09 || sp > 0.97;
        push(c * r, s * r, z, nx, ny, nz, 0, (plate ? 0.88 : 0.7) * (seam ? 0.6 : 1), th);
      }
    }
  }
  // energy ring (kind 1), spun at draw time
  const ne = Math.ceil(TAU * Rg * 1.4);
  for (let i = 0; i < ne; i++) {
    const th = (i / ne) * TAU;
    push(Math.cos(th) * 0.83, Math.sin(th) * 0.83, 0, 0, 0, -1, 1, 1, th);
  }
  // four lattice pylons (kind 2) + tip lights (kind 3)
  const nu = Math.ceil(0.62 * Rg * 1.6);
  for (let k = 0; k < 4; k++) {
    const phi = Math.PI / 4 + (k * Math.PI) / 2;
    const c = Math.cos(phi), s = Math.sin(phi);
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const r = 1 + 0.62 * u;
      const w = 0.13 * (1 - u) + 0.03;
      // edges
      for (const side of [-1, 1]) {
        const px = c * r - s * w * side, py = s * r + c * w * side;
        for (const z of [-0.05, 0.05]) push(px, py, z, c, s, 0, 2, 0.8, phi);
      }
      // zigzag brace
      const zz = (fract(u * 7) * 2 - 1) * (Math.floor(u * 7) % 2 ? 1 : -1);
      push(c * r - s * w * zz, s * r + c * w * zz, 0, c, s, 0, 2, 0.6, phi);
    }
    push(c * 1.66, s * 1.66, 0, c, s, 0, 3, 1, k);
  }
  return P;
}

export default {
  id: "stargate",
  title: "STARGATE",
  caption: "jita > perimeter. fly safe, capsuleer",

  init(f, S) {
    const { cols, rows, ax } = S;
    st.L = layout(S);
    st.model = buildModel(st.L.Rg);
    const n = cols * rows;
    st.neb = new Float32Array(n);
    st.nebH = new Uint8Array(n);
    const sc = 3.2 / Math.max(cols, rows / ax);
    for (let y = 0, i = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++, i++) {
        const X = x * sc, Y = (y / ax) * sc;
        const band = Math.exp(-Math.pow((x / cols) * 0.8 + (y / rows) * 0.6 - 0.72, 2) / 0.07);
        const d = clamp(fbm2(X * 1.5, Y * 1.5, 5) * 1.3 + 0.22) * (0.3 + 0.7 * band);
        const v = d * d * 0.36;
        st.neb[i] = v > 0.035 ? v : 0;
        st.nebH[i] = fbm2(X + 31, Y - 7, 3) > 0.06 ? HUE.hot : HUE.alt;
      }
    }
    const r = rng(7);
    st.stars = [];
    for (let k = 0; k < n / 90; k++) st.stars.push({ x: (r() * cols) | 0, y: (r() * rows) | 0, b: Math.pow(r(), 3), ph: r() * 50 });
    st.trail = [];
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    const { cx, cy, Rg } = st.L;
    const fade = smooth(0, 1, t);
    const tau = t % CYCLE;
    const charge = smooth(7, 9.2, tau) * (tau < 9.35 ? 1 : 0);
    const flashT = tau - 9.3;
    const flash = flashT > 0 ? Math.exp(-flashT * 2.6) : 0;

    // ---- nebula + stars ----
    const { neb, nebH } = st;
    const nf = fade * (1 + flash * 0.8);
    for (let i = 0; i < f.n; i++) {
      f.v[i] = neb[i] * nf;
      f.h[i] = nebH[i];
      f.g[i] = -1;
    }
    for (const s of st.stars) {
      const tw = 0.6 + 0.4 * Math.sin(t * (1 + s.b * 3) + s.ph);
      const v = (0.15 + s.b * 0.8) * tw * fade;
      f.plot(s.x, s.y, v, s.b > 0.5 ? HUE.white : HUE.fg, s.b > 0.75 ? STAR : s.b > 0.35 ? PLUS : DOT);
    }

    // ---- gate transform ----
    const yaw = 0.62 + 0.22 * Math.sin(t * 0.09);
    const tilt = 0.2 + 0.07 * Math.sin(t * 0.13);
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), ct = Math.cos(tilt), stl = Math.sin(tilt);
    const xf = (x, y, z) => {
      const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      return [x1, y * ct - z1 * stl, y * stl + z1 * ct];
    };
    const proj = (p) => {
      const k = DC / (DC + p[2]);
      return [cx + p[0] * Rg * k, cy - p[1] * Rg * ax * k, k];
    };
    const reveal = smooth(0, 1.4, t);
    const spin = t * (0.35 + charge * 3);

    // ---- vortex inside the ring while charging ----
    if (charge > 0.02) {
      for (let r = 0.04; r < 0.86; r += 0.7 / Rg) {
        const steps = Math.ceil((TAU * r * Rg) / 0.9) + 6;
        for (let j = 0; j < steps; j++) {
          const th = (j / steps) * TAU;
          const w = 0.5 + 0.5 * Math.sin(5 * th - r * 15 + tau * 9);
          const v = charge * (0.18 + 0.6 * w * w) * (1 - r * 0.55);
          if (v < 0.06) continue;
          const [sx, sy] = proj(xf(Math.cos(th) * r, Math.sin(th) * r, 0));
          f.plot(sx, sy, v, r < 0.18 * charge ? HUE.white : HUE.alt);
        }
      }
    }

    // ---- gate ----
    for (const p of st.model) {
      if (p.kind === 0 && p.th / TAU > reveal) continue;
      if (p.kind >= 2 && t < 0.9) continue;
      let x = p.x, y = p.y;
      if (p.kind === 1) {
        const th = p.th + spin;
        if (fract((th * 30) / TAU) > 0.45 + charge * 0.4) continue;
        x = Math.cos(th) * 0.83;
        y = Math.sin(th) * 0.83;
      }
      const q = xf(x, y, p.z);
      const [sx, sy] = proj(q);
      if (p.kind === 3) {
        const on = Math.sin(t * 2.4 + p.th * 1.7) > 0.55;
        f.set(sx, sy, (on ? 1 : 0.35) * fade, HUE.hot, BULLET);
        continue;
      }
      const n = xf(p.nx, p.ny, p.nz);
      const lam = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      const depth = clamp(1 - q[2] * 0.35, 0.45, 1.2);
      let v, hue;
      if (p.kind === 1) {
        v = (0.3 + 0.65 * charge) * depth;
        hue = charge > 0.6 ? HUE.white : HUE.alt;
      } else {
        v = (0.16 + 0.72 * lam) * p.sh * depth + charge * 0.25 + flash * 0.5;
        hue = charge > 0.5 && lam < 0.3 ? HUE.alt : HUE.fg;
      }
      f.plot(sx, sy, v * fade, hue);
    }

    // ---- arcs crawling over the ring ----
    if (charge > 0.15) {
      const rr = rng(Math.floor(tau / 0.07) + 1);
      const count = Math.round(2 + charge * 5);
      for (let a = 0; a < count; a++) {
        const th = rr() * TAU;
        let prev = proj(xf(Math.cos(th) * 0.92, Math.sin(th) * 0.92, 0));
        const th2 = th + (rr() - 0.5) * 1.2;
        const end = 0.15 + rr() * 0.4;
        for (let s = 1; s <= 7; s++) {
          const u = s / 7;
          const r = lerp(0.92, end, u) + (rr() - 0.5) * 0.08;
          const tt = lerp(th, th2, u) + (rr() - 0.5) * 0.15;
          const cur = proj(xf(Math.cos(tt) * r, Math.sin(tt) * r, 0));
          f.line(prev[0], prev[1], cur[0], cur[1], 0.95, rr() < 0.4 ? HUE.white : HUE.alt, "auto", ax);
          prev = cur;
        }
      }
    }

    // ---- ship: burn in, hold, jump ----
    const gc = [cx, cy];
    if (tau > 1.5 && tau < 9.35) {
      const e = 1 - Math.pow(1 - clamp((tau - 1.5) / 5.5), 3);
      const j = clamp((tau - 9.0) / 0.35);
      const P0 = [1.9, -1.05, -2.05], P1 = [0.12, -0.05, -0.18];
      let pw = [lerp(P0[0], P1[0], e), lerp(P0[1], P1[1], e) + Math.sin(e * Math.PI) * 0.25, lerp(P0[2], P1[2], e)];
      if (j > 0) pw = [lerp(pw[0], 0, j * j), lerp(pw[1], 0, j * j), lerp(pw[2], 0.05, j * j)];
      const [sx, sy, k] = proj(pw);
      let dx = gc[0] - sx, dy = (gc[1] - sy) / ax;
      const dm = Math.hypot(dx, dy) || 1;
      dx /= dm;
      dy /= dm;
      if (dm < 2) (dx = -0.8), (dy = 0.6);
      const len = Math.max(3, Rg * 0.16 * k) * (1 - j * 0.8);
      const nx = -dy, ny = dx;
      const P = (fx, fy) => [sx + fx, sy + fy * ax];
      const nose = P(dx * len * 0.65, dy * len * 0.65);
      const tl = P(-dx * len * 0.35 + nx * len * 0.3, -dy * len * 0.35 + ny * len * 0.3);
      const tr = P(-dx * len * 0.35 - nx * len * 0.3, -dy * len * 0.35 - ny * len * 0.3);
      const tail = P(-dx * len * 0.42, -dy * len * 0.42);
      st.trail.push({ x: tail[0], y: tail[1], life: 1 });
      f.tri(nose[0], nose[1], tl[0], tl[1], tr[0], tr[1], 0.42 * fade, HUE.fg);
      f.line(nose[0], nose[1], tl[0], tl[1], 0.85 * fade, HUE.white, "auto", ax);
      f.line(nose[0], nose[1], tr[0], tr[1], 0.85 * fade, HUE.white, "auto", ax);
      f.line(tl[0], tl[1], tr[0], tr[1], 0.6 * fade, HUE.fg, "auto", ax);
      f.set(tail[0], tail[1], fade, j > 0 ? HUE.white : HUE.main, STAR);
      if (j > 0) f.line(sx, sy, gc[0], gc[1], 1, HUE.white, "auto", ax);
    }
    for (const p of st.trail) {
      p.life -= dt * 1.6;
      if (p.life > 0) f.plot(p.x, p.y, p.life * 0.55 * fade, p.life > 0.6 ? HUE.main : HUE.hot, p.life > 0.5 ? G("°") : DOT);
    }
    st.trail = st.trail.filter((p) => p.life > 0);

    // ---- jump flash: core bloom + anamorphic flare ----
    if (flash > 0.02) {
      const rf = Rg * (0.15 + flashT * 0.9);
      f.disc(cx, cy, rf * flash, flash, HUE.white, ax);
      for (let x = 0; x < cols; x++) {
        const fall = 1 - Math.abs(x - cx) / (cols * (0.3 + flash * 0.7));
        if (fall > 0) f.plot(x, Math.round(cy), flash * fall, HUE.white, HLINE);
      }
      const vh = Rg * ax * flash * 0.9;
      for (let y = Math.round(cy - vh); y <= cy + vh; y++) f.plot(cx, y, flash * 0.8, HUE.alt, VLINE);
    }

    // ---- overview bracket + HUD + local chat ----
    const gateLabel = "◇ Stargate (Perimeter)";
    let lx = Math.round(cx + Rg * 0.8), ly = Math.round(cy - Rg * ax * 1.05);
    if (lx + gateLabel.length >= cols) lx = Math.max(1, Math.round(cx - Rg * 0.8 - gateLabel.length));
    if (ly < 4) ly = Math.round(cy + Rg * ax * 1.05);
    label(f, lx, ly, gateLabel, HUE.fg, 0.6 * fade);
    label(f, 2, 1, "Jita 0.9 · The Forge", HUE.fg, 0.55 * fade);
    if (charge > 0.05 && Math.sin(t * 14) > -0.3) label(f, 2, 2, "GATE ACTIVATION", HUE.hot, 0.9);
    else if (flash > 0.05) label(f, 2, 2, "SESSION CHANGE", HUE.alt, 0.9);
    const cf = smooth(9.6, 10.2, tau) * (1 - smooth(12.2, 12.8, tau));
    if (cf > 0.02) {
      const by = rows - 4;
      label(f, 2, by, "[ Local ]", HUE.fg, 0.55 * cf);
      label(f, 2, by + 1, "capsuleer > o7", HUE.main, 0.95 * cf);
      label(f, 2, by + 2, "JUMP  Jita > Perimeter", HUE.alt, 0.8 * cf);
    }
  },
};
