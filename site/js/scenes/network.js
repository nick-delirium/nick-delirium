// Arctius: a rotating federated graph of Lemmy instances, packets syncing along edges.
import { HUE, G, clamp, rng, TAU, smooth, rotX, rotY, slopeGlyph } from "../engine/util.js";

const NAMES = [
  "lemmy.world",
  "beehaw.org",
  "sh.itjust.works",
  "lemmy.ml",
  "programming.dev",
  "lemm.ee",
  "feddit.de",
  "midwest.social",
  "lemmy.zip",
  "sopuli.xyz",
];

let st = null;

function build(S) {
  const r = rng(42);
  const count = S.cols < 60 ? 7 : S.cols < 120 ? 9 : 10;
  // stretch the graph along the long axis of portrait panels
  const ys = clamp(S.rows / S.ax / S.cols, 0.85, 1.7);
  const xs = clamp(S.cols / (S.rows / S.ax), 1, 1.7);
  const nodes = [];
  for (let i = 0; i < count; i++) {
    // fibonacci sphere with jitter, flattened a little into a band
    const y = 1 - ((i + 0.5) / count) * 2;
    const rad = Math.sqrt(1 - y * y);
    const a = i * 2.399963 + r() * 0.4;
    const d = 0.85 + r() * 0.3;
    nodes.push({
      p: [Math.cos(a) * rad * d * xs, y * 0.78 * d * ys, Math.sin(a) * rad * d * xs],
      name: NAMES[i],
      flash: 0,
      users: Array.from({ length: 5 + ((r() * 9) | 0) }, () => ({
        rad: 0.1 + r() * 0.12,
        sp: (0.5 + r() * 1.3) * (r() < 0.5 ? -1 : 1),
        ph: r() * TAU,
        ta: r() * Math.PI,
        tb: r() * TAU,
      })),
    });
  }
  const edges = [];
  const has = (a, b) => edges.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a));
  for (let i = 0; i < count; i++) {
    const near = nodes
      .map((n, j) => [j, Math.hypot(n.p[0] - nodes[i].p[0], n.p[1] - nodes[i].p[1], n.p[2] - nodes[i].p[2])])
      .filter(([j]) => j !== i)
      .sort((a, b) => a[1] - b[1]);
    for (let k = 0; k < 2; k++) if (!has(i, near[k][0])) edges.push([i, near[k][0]]);
  }
  for (let k = 0; k < 2; k++) {
    const a = (r() * count) | 0, b = (r() * count) | 0;
    if (a !== b && !has(a, b)) edges.push([a, b]);
  }
  edges.forEach((e, i) => (e.born = 0.5 + i * 0.07));
  // small peers on an outer shell, each tied to its nearest instance
  const peers = Array.from({ length: Math.round(clamp((S.cols * S.rows) / 160, 24, 70)) }, () => {
    const u = r() * 2 - 1, a = r() * TAU, d = 1.25 + r() * 0.45;
    const rad = Math.sqrt(1 - u * u);
    const p = [Math.cos(a) * rad * d * xs, u * d * 0.8 * ys, Math.sin(a) * rad * d * xs];
    let best = 0, bd = 1e9;
    nodes.forEach((n, j) => {
      const dd = Math.hypot(n.p[0] - p[0], n.p[1] - p[1], n.p[2] - p[2]);
      if (dd < bd) (bd = dd), (best = j);
    });
    return { p, to: best, tw: r() * TAU };
  });
  st = { nodes, edges, peers, ys, xs, packets: [], bursts: [], r, nextPacket: 0.8, synced: 0, votes: 1200 };
}

export default {
  id: "network",
  title: "FEDIVERSE_GRAPH",
  caption: "no center, every instance a peer",

  init(f, S) {
    build(S);
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    if (!st) build(S);
    f.clear();
    const F = Math.min(cols, rows / ax) * 0.4;
    const cx = cols / 2, cy = rows / 2;
    let rotA = t * 0.16;
    if (input.inside) rotA += ((input.x / cols) - 0.5) * 1.2;
    const tilt = 0.32 + 0.12 * Math.sin(t * 0.11);
    const proj = (p) => {
      const q = rotX(rotY(p, rotA), tilt);
      const k = 3.2 / (3.2 + q[2] / xs);
      return [cx + q[0] * F * k, cy - q[1] * F * k * ax, q[2], k];
    };
    const front = (z) => clamp((1 - z / st.xs) * 0.5);

    const { nodes, edges, peers, ys, xs } = st;
    const P = nodes.map((n) => proj(n.p));

    // dotted shell: the network's horizon
    const shell = smooth(0, 1.2, t);
    for (let la = -75; la <= 75; la += 15) {
      const cy0 = Math.sin((la * Math.PI) / 180), cr = Math.cos((la * Math.PI) / 180);
      const n = Math.max(12, Math.round(cr * 70));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const q = proj([Math.cos(a) * cr * 1.08 * xs, cy0 * 1.08 * 0.85 * ys, Math.sin(a) * cr * 1.08 * xs]);
        const fr = front(q[2]);
        if (fr > 0.35 && k % 2 === 0) f.plot(q[0], q[1], (0.06 + 0.12 * fr) * shell, HUE.fg, G("·"));
      }
    }

    // small peers + their uplinks
    for (const pr of peers) {
      const q = proj(pr.p);
      const fr = front(q[2]);
      const a = P[pr.to];
      const steps = Math.ceil(Math.hypot(a[0] - q[0], a[1] - q[1]) * shell);
      for (let s = 0; s <= steps; s += 2) {
        const u = s / Math.max(1, Math.ceil(Math.hypot(a[0] - q[0], a[1] - q[1])));
        f.plot(q[0] + (a[0] - q[0]) * u, q[1] + (a[1] - q[1]) * u, 0.07 + 0.1 * fr, HUE.fg, G("·"));
      }
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + pr.tw);
      f.plot(q[0], q[1], (0.25 + 0.4 * fr) * shell * (0.6 + 0.4 * tw), fr > 0.5 ? HUE.alt : HUE.fg, G(fr > 0.6 ? "◇" : "•"));
    }

    // edges, growing in during the intro
    for (const e of edges) {
      const grow = smooth(e.born, e.born + 0.6, t);
      if (grow <= 0) continue;
      const a = P[e[0]], b = P[e[1]];
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * grow);
      const g = slopeGlyph(b[0] - a[0], b[1] - a[1], ax);
      for (let s = 0; s <= steps; s++) {
        const u = (s / Math.max(1, steps)) * grow;
        const z = a[2] + (b[2] - a[2]) * u;
        const fr = front(z);
        const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
        if (fr < 0.42) {
          if (s % 2 === 0) f.plot(x, y, 0.12 + 0.2 * fr, HUE.fg, G("·"));
        } else f.plot(x, y, 0.16 + 0.32 * fr, HUE.alt, g);
      }
    }

    // spawn & move packets
    if (t > 1.4 && t > st.nextPacket) {
      const e = edges[(st.r() * edges.length) | 0];
      const dir = st.r() < 0.5;
      st.packets.push({ a: dir ? e[0] : e[1], b: dir ? e[1] : e[0], u: 0, sp: 0.45 + st.r() * 0.5 });
      st.nextPacket = t + 0.12 + st.r() * 0.35;
    }
    st.packets = st.packets.filter((pk) => {
      pk.u += pk.sp * dt;
      if (pk.u >= 1) {
        const n = nodes[pk.b];
        n.flash = 1;
        st.synced++;
        if (st.r() < 0.35) {
          const q = P[pk.b];
          for (let k = 0; k < 3 + ((st.r() * 3) | 0); k++) {
            st.bursts.push({ x: q[0] + (st.r() - 0.5) * 4, y: q[1], vy: -(5 + st.r() * 6), life: 1, hot: st.r() < 0.3 });
          }
          st.votes += 1 + ((st.r() * 9) | 0);
        }
        return false;
      }
      const a = P[pk.a], b = P[pk.b];
      for (let k = 3; k >= 0; k--) {
        const u = pk.u - k * 0.025;
        if (u < 0) continue;
        const x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u;
        if (k === 0) f.set(x, y, 1, HUE.white, G("■"));
        else f.set(x, y, 0.8 - k * 0.18, HUE.main, G("·"));
      }
      return true;
    });

    // orbiting users
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (t < 0.2 + i * 0.1) continue;
      for (const u of n.users) {
        const ph = u.ph + t * u.sp;
        const lx = Math.cos(ph) * u.rad, ly = Math.sin(ph) * u.rad;
        const o = [lx, ly * Math.cos(u.ta), ly * Math.sin(u.ta)];
        const q = proj([n.p[0] + o[0] * Math.cos(u.tb), n.p[1] + o[1], n.p[2] + o[0] * Math.sin(u.tb) + o[2]]);
        const fr = front(q[2]);
        f.plot(q[0], q[1], 0.3 + 0.45 * fr, HUE.alt, G(fr > 0.6 ? "•" : "·"));
      }
    }

    // instance nodes, far to near so near labels win
    const order = nodes.map((_, i) => i).sort((a, b) => P[b][2] - P[a][2]);
    const placed = [];
    const free = (x, y, w) => !placed.some((r) => r.y === y && x < r.x + r.w + 1 && r.x < x + w + 1);
    for (const i of order) {
      const n = nodes[i];
      const appear = smooth(0.1 + i * 0.1, 0.4 + i * 0.1, t);
      if (appear <= 0) continue;
      const [x, y, z, k] = P[i];
      const fr = front(z);
      n.flash = Math.max(0, n.flash - dt * 2.5);
      const r = (0.9 + 0.9 * fr) * k * appear + n.flash * 0.9;
      f.disc(x, y, r + 1.2, 0.1 + 0.15 * fr + n.flash * 0.25, HUE.main, ax);
      f.disc(x, y, r, 0.55 + 0.4 * fr, n.flash > 0.3 ? HUE.white : HUE.main, ax);
      f.set(x, y, 1, HUE.white, G("◉"));
      const label = n.name;
      let lx = Math.round(x + r + 2);
      if (lx + label.length >= cols) lx = Math.round(x - r - 2 - label.length);
      const lv = (0.3 + 0.55 * fr) * appear;
      lx = clamp(lx, 0, cols - label.length);
      let ly = Math.round(y);
      for (const d of [0, -1, 1, -2, 2]) {
        if (free(lx, ly + d, label.length)) {
          ly += d;
          break;
        }
      }
      placed.push({ x: lx, y: ly, w: label.length });
      if (lv > 0.05) f.text(lx, ly, label, n.flash > 0.4 ? HUE.main : HUE.fg, lv);
    }

    // upvote bursts
    st.bursts = st.bursts.filter((b) => {
      b.life -= dt * 0.9;
      b.y += b.vy * dt * ax;
      if (b.life <= 0) return false;
      f.set(b.x, b.y, 0.3 + 0.7 * b.life, b.hot ? HUE.hot : HUE.main, G("▲"));
      return true;
    });

    // HUD
    const hud = `peers ${nodes.length}  synced ${st.synced}  ▲ ${(st.votes / 1000).toFixed(1)}k`;
    if (cols > hud.length + 2) f.text(1, rows - 2, hud, HUE.fg, 0.4);
    f.text(1, 1, "activitypub://federation", HUE.alt, 0.35 * smooth(0, 1, t));
  },
};
