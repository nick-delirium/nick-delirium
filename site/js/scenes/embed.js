// Unreleased: a rotating embedding space; queries fire k-nearest-neighbour rays into it.
import { HUE, G, clamp, rng, TAU, smooth, rotX, rotY, hash1 } from "../engine/util.js";

const K = 8;
const PERIOD = 5.5;
const TAGS = ["docs", "code", "chat", "notes", "logs", "specs"];
const CLUSTER_HUE = [HUE.alt, HUE.main, HUE.fg, HUE.alt, HUE.fg, HUE.main];

let st = null;

function gauss(r) {
  return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(TAU * r());
}

function build(S) {
  const r = rng(768);
  const n = Math.round(clamp((S.cols * S.rows) / 8, 300, 2000));
  const kc = 6;
  const centers = Array.from({ length: kc }, (_, k) => {
    const a = (k / kc) * TAU + r() * 0.6, y = (r() - 0.5) * 1.3;
    const rad = Math.sqrt(1 - Math.min(0.9, y * y * 0.5));
    return { c: [Math.cos(a) * rad, y * 0.7, Math.sin(a) * rad], s: [0.1 + r() * 0.16, 0.08 + r() * 0.14, 0.1 + r() * 0.16] };
  });
  const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
  const cl = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const k = i % kc;
    const { c, s } = centers[k];
    px[i] = c[0] + gauss(r) * s[0];
    py[i] = c[1] + gauss(r) * s[1];
    pz[i] = c[2] + gauss(r) * s[2];
    cl[i] = k;
  }
  st = { n, centers, px, py, pz, cl, flash: new Float32Array(n), qn: -1, q: null, nn: [], scores: [] };
}

function runQuery(qn) {
  const k = (hash1(qn * 17 + 3) * st.centers.length) | 0;
  const c = st.centers[k].c;
  const j = (i) => (hash1(qn * 31 + i) - 0.5) * 0.75;
  const q = [c[0] + j(1), c[1] + j(2), c[2] + j(3)];
  // closer = higher score; scaled so the readout looks like a real retrieval
  const scored = [];
  for (let i = 0; i < st.n; i++) {
    const d2 = (q[0] - st.px[i]) ** 2 + (q[1] - st.py[i]) ** 2 + (q[2] - st.pz[i]) ** 2;
    scored.push([0.99 - Math.sqrt(d2) * 1.1, i]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  st.q = q;
  st.nn = scored.slice(0, K).map((s) => s[1]);
  st.scores = scored.slice(0, K).map((s) => s[0]);
  st.qn = qn;
}

export default {
  id: "embed",
  title: "LATENT_SPACE",
  caption: "meaning, measured as an angle",

  init(f, S) {
    build(S);
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    if (!st) build(S);
    f.clear();
    const F = Math.min(cols, rows / ax) * 0.45;
    const cx = cols / 2, cy = rows / 2;
    const ys = clamp(rows / ax / cols, 1, 1.6);
    const rot = t * 0.2, tilt = 0.38 + 0.12 * Math.sin(t * 0.17);
    const grow = smooth(0, 1.6, t);
    const proj = (p) => {
      const q = rotX(rotY(p, rot), tilt);
      const k = 3.4 / (3.4 + q[2]);
      return [cx + q[0] * F * k, cy - q[1] * F * k * ax * ys, q[2]];
    };
    const front = (z) => clamp((1.3 - z) / 2.6);

    // faint axes
    for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const a = proj(axis.map((v) => -v * 1.5)), b = proj(axis.map((v) => v * 1.5));
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
      for (let s = 0; s <= steps; s += 2) {
        const u = s / steps;
        f.plot(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, 0.1 * grow, HUE.fg, G("·"));
      }
    }

    // query lifecycle
    const qn = Math.floor((t - 1.2) / PERIOD);
    const qp = (t - 1.2) - qn * PERIOD;
    if (t > 1.2 && qn !== st.qn) runQuery(qn);

    // points
    const { n, px, py, pz, cl, flash } = st;
    for (let i = 0; i < n; i++) {
      flash[i] = Math.max(0, flash[i] - dt * 1.2);
      const [sx, sy, z] = proj([px[i] * grow, py[i] * grow, pz[i] * grow]);
      const fr = front(z);
      const fl = flash[i];
      const v = 0.2 + 0.6 * fr * fr + fl * 0.6;
      const g = fl > 0.4 ? "●" : fr > 0.68 ? "o" : fr > 0.4 ? "•" : "·";
      f.plot(sx, sy, v, fl > 0.4 ? HUE.white : CLUSTER_HUE[cl[i]], G(g));
    }

    // dotted cluster hulls (2σ), always facing the camera
    st.centers.forEach((c, k) => {
      const [sx, sy, z] = proj(c.c.map((v) => v * grow));
      const kk = 3.4 / (3.4 + z);
      const r = (c.s[0] + c.s[1] + c.s[2]) * 0.75 * F * kk * grow;
      const n = Math.max(16, Math.round(r * 2.2));
      for (let a = 0; a < n; a++) {
        const th = (a / n) * TAU + t * 0.1;
        f.plot(sx + Math.cos(th) * r, sy + Math.sin(th) * r * ax, 0.12 + 0.1 * front(z), CLUSTER_HUE[k], G("·"));
      }
    });

    // cluster tags
    if (grow > 0.9) {
      st.centers.forEach((c, k) => {
        const [sx, sy, z] = proj(c.c.map((v) => v * 1.32));
        const tag = `[${TAGS[k]}]`;
        f.text(clamp(Math.round(sx - tag.length / 2), 0, cols - tag.length), Math.round(sy), tag, HUE.fg, 0.2 + 0.25 * front(z));
      });
    }

    // query: appear → rays to k nearest → hold → fade
    if (st.q && t > 1.2) {
      const life = smooth(0, 0.3, qp) * (1 - smooth(4.6, 5.4, qp));
      const [qx, qy, qz] = proj(st.q);
      const ring = qp * 9;
      if (qp < 1.2) {
        for (let a = 0; a < TAU; a += 0.12) f.plot(qx + Math.cos(a) * ring, qy + Math.sin(a) * ring * ax, 0.6 * (1 - qp / 1.2), HUE.hot, G("·"));
      }
      st.nn.forEach((i, j) => {
        const start = 0.45 + j * 0.07;
        const reach = smooth(start, start + 0.35, qp) * life;
        if (reach <= 0) return;
        const [ex, ey] = proj([px[i], py[i], pz[i]]);
        const steps = Math.ceil(Math.hypot(ex - qx, ey - qy) * reach);
        for (let s = 0; s <= steps; s++) {
          const u = (s / Math.max(1, steps)) * reach;
          f.plot(qx + (ex - qx) * u, qy + (ey - qy) * u, 0.75 * life, j === 0 ? HUE.hot : HUE.main, G(s === steps ? "◆" : "·"));
        }
        if (reach > 0.98 && flash[i] < 0.5 && qp < 2.5) flash[i] = 1;
      });
      f.set(qx, qy, life, HUE.white, G("◉"));
      if (qp > 1.1) {
        const label = `cos ${st.scores[0].toFixed(3)}`;
        let lx = Math.round(qx + 3);
        if (lx + label.length >= cols) lx = Math.round(qx - 3 - label.length);
        f.text(clamp(lx, 0, cols - label.length), Math.round(qy) - 1, label, HUE.hot, life);
      }

      // top-k readout in the corner
      if (rows > 24 && qp > 1.4) {
        const x0 = cols - 16;
        if (x0 > cols * 0.5) {
          for (let y = 0; y <= K + 2; y++) for (let x = x0 - 1; x < cols; x++) f.set(x, y, 0);
          f.text(x0, 1, `top-${K}`, HUE.fg, 0.4 * life);
          st.scores.forEach((sc, j) => {
            const shown = smooth(1.4 + j * 0.08, 1.6 + j * 0.08, qp) * life;
            if (shown > 0.05) f.text(x0, 2 + j, `#${j + 1} ${sc.toFixed(3)}`, j === 0 ? HUE.main : HUE.fg, 0.25 + 0.4 * shown);
          });
        }
      }
    }

    // HUD
    const mask = "░".repeat(5 + (st.qn % 4)) + " " + "░".repeat(3 + ((st.qn * 3) % 5));
    f.text(1, 1, `q: "${mask}"`, HUE.fg, 0.35 * grow);
    f.text(1, rows - 3, `dim 768 · n=${st.n}`, HUE.fg, 0.3 * grow);
    f.text(1, rows - 2, "model: <redacted> · status: in the lab", HUE.alt, 0.32 * grow);
  },
};
