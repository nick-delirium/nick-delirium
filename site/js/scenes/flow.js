// bluejay: feather-like wind currents from curl noise, with a flock crossing now and then.
import { HUE, G, clamp, rng, smooth, noise3 } from "../engine/util.js";

let st = null;

function build(S) {
  const r = rng(5);
  const n = Math.round(clamp((S.cols * S.rows) / 26, 90, 1100));
  const p = {
    n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    age: new Float32Array(n),
    life: new Float32Array(n),
    kind: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) spawn(p, i, S, r, true);
  st = { r, p, labels: [] };
}

function spawn(p, i, S, r, anywhere) {
  p.x[i] = anywhere || r() > 0.4 ? r() * S.cols : -1;
  p.y[i] = (r() * S.rows) / S.ax;
  p.age[i] = 0;
  p.life[i] = 2 + r() * 5;
  const k = r();
  p.kind[i] = k < 0.03 ? 2 : k < 0.16 ? 1 : 0;
}

export default {
  id: "flow",
  title: "WINDFIELD",
  caption: "a thousand threads, one current",

  init(f, S) {
    build(S);
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    if (!st) build(S);
    const { p, r } = st;
    const H = rows / ax;

    for (const [lx, ly, len] of st.labels) for (let k = 0; k < len; k++) f.set(lx + k, ly, 0);
    st.labels.length = 0;
    f.fade(Math.exp(-dt * 3.2));

    const sc = 1 / 26, e = 0.6, z = t * 0.07;
    const active = Math.floor(p.n * smooth(0, 1.4, t));
    const gust = 1 + 0.6 * Math.max(0, Math.sin(t * 0.35)) ** 4;
    for (let i = 0; i < active; i++) {
      const x = p.x[i], y = p.y[i];
      // curl of a scalar noise field → divergence-free swirls
      const n1 = noise3(x * sc, (y + e) * sc, z), n2 = noise3(x * sc, (y - e) * sc, z);
      const n3 = noise3((x + e) * sc, y * sc, z), n4 = noise3((x - e) * sc, y * sc, z);
      const cxv = (n1 - n2) / (2 * e * sc), cyv = -(n3 - n4) / (2 * e * sc);
      const vx = cxv * 5.5 + 7 * gust, vy = cyv * 5.5 + Math.sin(x * 0.05 + t * 0.3) * 0.8;
      p.x[i] = x + vx * dt;
      p.y[i] = y + vy * dt;
      p.age[i] += dt;
      if (p.age[i] > p.life[i] || p.x[i] > cols + 1 || p.x[i] < -2 || p.y[i] < -1 || p.y[i] > H + 1) {
        spawn(p, i, S, r, false);
        continue;
      }
      const a = p.age[i], l = p.life[i];
      const fade = smooth(0, 0.4, a) * (1 - smooth(l - 0.6, l, a));
      const sp = clamp(Math.hypot(vx, vy) / 22);
      const k = p.kind[i];
      const v = (k === 2 ? 1 : k === 1 ? 0.7 + 0.2 * sp : 0.3 + 0.35 * sp) * fade;
      f.plot(p.x[i], p.y[i] * ax, v, k === 2 ? HUE.white : k === 1 ? HUE.main : HUE.alt);
    }

    // a flock of tiny birds every ~11s
    const fp = 11, ft = (t - 3) % fp, fn = Math.floor((t - 3) / fp);
    if (t > 3 && ft < 6) {
      const u = ft / 6;
      const bx = -12 + u * (cols + 24);
      const by = rows * (0.25 + 0.45 * ((fn * 0.37) % 1)) + Math.sin(u * 6) * rows * 0.04;
      const count = 7;
      for (let b = 0; b < count; b++) {
        const side = b % 2 ? 1 : -1, rank = Math.ceil(b / 2);
        const x = bx - rank * 3, y = by + side * rank * 1.2 * ax * 1.6;
        const flap = Math.sin(t * 9 + b * 1.3) > 0;
        f.set(x, y, 1, b === 0 ? HUE.white : HUE.main, G(flap ? "v" : "-"));
        st.labels.push([Math.round(x), Math.round(y), 1]);
      }
    }

    const hud = `wind ${(7 * gust).toFixed(1)} kn · r/all streaming`;
    f.text(1, rows - 2, hud, HUE.fg, 0.4);
    st.labels.push([1, rows - 2, hud.length]);
  },
};
