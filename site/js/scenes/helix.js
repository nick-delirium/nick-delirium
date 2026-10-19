// dolly: rotating DNA double helix with base-pair rungs and travelling "commit" pulses.
import { HUE, G, clamp, hash1, rng, TAU, smooth, lerp } from "../engine/util.js";

const BASES = "ATGC";
const PAIR = { A: "T", T: "A", G: "C", C: "G" };
const MSGS = [
  (n) => `step 0x${((0x3f + n * 23) & 0xff).toString(16).padStart(2, "0")} · spec v${2 + (n % 4)}`,
  (n) => `ctx restored · ${6 + ((n * 7) % 30)} steps`,
  () => `status → validating`,
  (n) => `clone #${n + 1} · 0 drift`,
];

let st = null;

export default {
  id: "helix",
  title: "DOLLY_HELIX",
  caption: "task memory, cloned into every session",

  init(f, S) {
    const r = rng(11);
    const n = Math.round(clamp((S.cols * S.rows) / 110, 25, 140));
    st = {
      zb: new Float32Array(S.cols * S.rows),
      motes: Array.from({ length: n }, () => ({ x: r() * S.cols, y: r() * S.rows, s: 0.4 + r() * 1.2, p: r() * TAU })),
    };
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    if (!st || st.zb.length !== cols * rows) this.init(f, S);
    const zb = st.zb;
    zb.fill(1e9);
    f.clear();

    const H = rows / ax;
    const portrait = cols < H * 0.9;
    const Rm = Math.max(5, Math.min(cols * (portrait ? 0.27 : 0.15), H * 0.17, 34));
    const tilt = portrait ? 0.14 : 0.42;
    const ct = Math.cos(tilt), stl = Math.sin(tilt);
    const spin = t * 0.8, scroll = t * Rm * 0.3;
    const cx = cols * 0.5, cy = rows * 0.5;
    const half = Math.hypot(cols, H) * 0.5 + Rm * 2;
    const off = Math.PI * 0.78;
    const zput = (sx, sy, z, v, hue, g = -1) => {
      sx = Math.round(sx);
      sy = Math.round(sy);
      if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) return;
      const i = sy * cols + sx;
      if (z > zb[i]) return;
      zb[i] = z;
      f.v[i] = v;
      f.h[i] = hue;
      f.g[i] = g;
    };

    // a helix around screen point (hx, cy); clones are dimmer, smaller and sit behind
    const helix = (hx, R, phase, dim, zOff, hueA, hueB, letters) => {
      const pitch = R * 3.6, freq = TAU / pitch, bp = pitch / 10;
      const sc = scroll * (R / Rm);
      const D = R * 6;
      const proj = (x, y, z) => {
        const k = D / (D + z);
        const X = x * k, Y = y * k;
        return [hx + X * ct + Y * stl, cy - (-X * stl + Y * ct) * ax];
      };
      const vis = half * smooth(0, 1.6, t - (letters ? 0 : 0.5));
      for (let s = -vis; s <= vis; s += 0.2) {
        const u = s + sc;
        for (let k = 0; k < 2; k++) {
          const th = u * freq + spin + phase + k * off;
          const x = R * Math.cos(th), z = R * Math.sin(th);
          const fr = (1 - z / R) * 0.5;
          let v = (0.2 + 0.72 * fr) * dim;
          let hue = k ? hueB : hueA;
          if (letters && k === 0 && t > 1.2) {
            const dp = Math.abs(s - pulseS);
            if (dp < 5) {
              v = Math.max(v, 1 - dp / 7);
              if (dp < 1.6) hue = HUE.white;
            }
          }
          const [sx, sy] = proj(x, s, z);
          zput(sx, sy, z + zOff, v, hue);
          if (fr > 0.5 && letters) {
            zput(sx - 1, sy, z + zOff + 0.3, v * 0.5, hue);
            zput(sx + 1, sy, z + zOff + 0.3, v * 0.5, hue);
          }
        }
      }
      const j0 = Math.ceil((-vis + sc) / bp), j1 = Math.floor((vis + sc) / bp);
      const steps = Math.max(6, Math.round(R * 2.6));
      for (let j = j0; j <= j1; j++) {
        if (!letters && j % 2) continue;
        const s = j * bp - sc;
        const th = j * bp * freq + spin + phase;
        const ax0 = R * Math.cos(th), az0 = R * Math.sin(th);
        const ax1 = R * Math.cos(th + off), az1 = R * Math.sin(th + off);
        for (let m = 1; m < steps; m++) {
          const u = m / steps;
          const x = lerp(ax0, ax1, u), z = lerp(az0, az1, u);
          const fr = (1 - z / R) * 0.5;
          const [sx, sy] = proj(x, s, z);
          const g = letters ? (fr > 0.5 ? "=" : "-") : "·";
          zput(sx, sy, z + zOff + 0.2, (0.14 + 0.36 * fr) * dim, u < 0.5 ? hueA : hueB, G(g));
        }
        if (!letters) continue;
        const base = BASES[(hash1(j * 131 + 7) * 4) | 0];
        for (const [u, ch, hue] of [
          [0.13, base, hueA],
          [0.87, PAIR[base], hueB],
        ]) {
          const x = lerp(ax0, ax1, u), z = lerp(az0, az1, u);
          const fr = (1 - z / R) * 0.5;
          const [sx, sy] = proj(x, s, z);
          zput(sx, sy, z + zOff - 0.4, 0.35 + 0.6 * fr, fr > 0.75 ? HUE.white : hue, G(ch));
        }
      }
      return proj;
    };

    const pulseP = 2.8;
    const pn = Math.floor(t / pulseP);
    const pu = (t % pulseP) / pulseP;
    const pulseS = -half * 0.8 + pu * 1.6 * half;

    // clones in the background
    if (!portrait) {
      const free = cols - Rm * 3;
      const n = clamp(Math.floor(free / (Rm * 2.2)), 0, 4);
      for (let c = 0; c < n; c++) {
        const side = c % 2 ? 1 : -1;
        const dist = Math.floor(c / 2) + 1;
        const hx = cx + side * (Rm * 1.9 + dist * Rm * 1.7);
        if (hx < -Rm || hx > cols + Rm) continue;
        helix(hx, Rm * (0.62 - dist * 0.14), c * 1.7 + 0.6, 0.42 - dist * 0.1, 200 * dist, HUE.fg, c % 2 ? HUE.alt : HUE.main, false);
      }
    }
    const proj = helix(cx, Rm, 0, 1, 0, HUE.main, HUE.alt, true);
    const R = Rm, freq = TAU / (R * 3.6), bp = (R * 3.6) / 10;

    // pulse label
    if (t > 1.2) {
      const th = (pulseS + scroll) * freq + spin;
      const [px, py] = proj(R * Math.cos(th), pulseS, R * Math.sin(th));
      const a = smooth(0, 0.08, pu) * (1 - smooth(0.85, 1, pu));
      const msg = "◆ " + MSGS[pn % MSGS.length](pn);
      let lx = Math.round(px + 3);
      if (lx + msg.length >= cols) lx = Math.round(px - 3 - msg.length);
      lx = clamp(lx, 0, Math.max(0, cols - msg.length));
      const ly = Math.round(py);
      if (a > 0.05 && ly >= 0 && ly < rows) f.text(lx, ly, msg, HUE.fg, 0.35 + 0.6 * a);
    }

    // genome ruler on the left edge
    if (cols >= 48) {
      const tick = bp * 5;
      const k0 = Math.ceil((-H + scroll) / tick), k1 = Math.floor((H + scroll) / tick);
      for (let k = k0; k <= k1; k++) {
        const sy = Math.round(cy - (k * tick - scroll) * ax);
        if (sy < 0 || sy >= rows) continue;
        f.text(0, sy, `─ ${((k * 5) & 0xfff).toString(16).padStart(3, "0")}`, HUE.fg, 0.26);
      }
    }

    // drifting motes, only in empty space
    for (const m of st.motes) {
      m.y -= dt * m.s * 1.6;
      m.x += Math.sin(t * 0.7 + m.p) * dt * 0.8;
      if (m.y < 0) {
        m.y += rows;
        m.x = hash1((t * 1000) | 0) * cols;
      }
      const i = f.idx(m.x, m.y);
      if (i >= 0 && f.v[i] < 0.05) {
        f.v[i] = 0.14 + 0.08 * Math.sin(t * 2 + m.p);
        f.h[i] = HUE.fg;
        f.g[i] = G("·");
      }
    }

    if (t < 2.2) {
      const dots = ".".repeat(1 + (Math.floor(t * 4) % 3));
      f.text(2, 1, `cloning sequence${dots}`, HUE.alt, 0.8 * (1 - smooth(1.6, 2.2, t)));
    }
  },
};
