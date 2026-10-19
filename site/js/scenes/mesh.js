// Arctius: a flat, hub-less peer mesh. Every peer links to its nearest neighbours;
// a message gossips outward hop by hop while peers churn in and out.
import { HUE, G, clamp, noise2, rng, slopeGlyph, TAU } from "../engine/util.js";

const K = 3;
const COMMUNITIES = ["!asklemmy", "!programming", "c/selfhosted", "!linux", "c/technology", "!memes", "c/privacy", "!rust"];

let peers, R, N, msg, transfers, nextChurn, pendingJoin, lastDown, idSeq, msgSeq, adj, edges;

function hexId() {
  return ((R() * 0xffff) | 0).toString(16).padStart(4, "0");
}

function spot(S) {
  // best-candidate sampling keeps peers spread out without a grid look
  const mx = 3, top = 4, bot = 4;
  let best = null, bestD = -1;
  for (let k = 0; k < 16; k++) {
    const x = mx + R() * (S.cols - 2 * mx - 1);
    const y = top + R() * (S.rows - top - bot);
    let d = Infinity;
    for (const p of peers) {
      if (p.dying >= 0) continue;
      const dx = p.bx - x, dy = (p.by - y) / S.ax;
      d = Math.min(d, dx * dx + dy * dy);
    }
    if (d > bestD) {
      bestD = d;
      best = [x, y];
    }
  }
  return best;
}

function addPeer(S, t) {
  const [x, y] = spot(S);
  const id = idSeq++;
  peers.push({
    id,
    hex: hexId(),
    tag: id % 6 === 2 ? COMMUNITIES[(id / 6) % COMMUNITIES.length | 0] : null,
    bx: x,
    by: y,
    x,
    y,
    ph: R() * 100,
    born: t,
    dying: -1,
    inf: -1,
    hop: 0,
  });
}

function startMessage(t, src) {
  for (const p of peers) p.inf = -1;
  transfers = [];
  const alive = peers.filter((p) => p.dying < 0);
  src = src || alive[(R() * alive.length) | 0];
  msg = { t0: t, src, count: 0, maxHop: 0, done: -1, n: msgSeq++ };
  inform(src, t, 0);
}

function inform(p, t, hop) {
  p.inf = t;
  p.hop = hop;
  msg.count++;
  msg.maxHop = Math.max(msg.maxHop, hop);
  for (const q of adj.get(p) || []) {
    if (q.inf >= 0 || q.dying >= 0) continue;
    const d = Math.hypot(q.x - p.x, (q.y - p.y) / 0.6);
    transfers.push({ a: p, b: q, t0: t, t1: t + 0.28 + d * 0.012 + R() * 0.18 });
  }
}

function link(S) {
  const alive = peers.filter((p) => p.dying < 0);
  adj = new Map(alive.map((p) => [p, new Set()]));
  edges = [];
  for (const p of alive) {
    const near = alive
      .filter((q) => q !== p)
      .map((q) => [q, (q.x - p.x) ** 2 + ((q.y - p.y) / S.ax) ** 2])
      .sort((a, b) => a[1] - b[1])
      .slice(0, K);
    for (const [q] of near) {
      if (!adj.get(p).has(q)) {
        adj.get(p).add(q);
        adj.get(q).add(p);
        edges.push([p, q]);
      }
    }
  }
}

function dotted(f, x0, y0, x1, y1, v, hue, every, glyph) {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let s = 1; s < steps; s++) {
    if (every > 1 && s % every) continue;
    const u = s / steps;
    f.plot(x0 + dx * u, y0 + dy * u, v, hue, glyph);
  }
}

// node glyph in brackets, optional soft halo
function node(f, x, y, v, hue, glyph, ax, halo = 0) {
  x = Math.round(x);
  y = Math.round(y);
  if (halo > 0) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy / ax);
        if (d < 1.2 || d > 3.2) continue;
        f.plot(x + dx, y + dy, halo * (1 - d / 3.4), hue);
      }
    }
  }
  f.set(x - 1, y, v * 0.55, hue, G("["));
  f.set(x + 1, y, v * 0.55, hue, G("]"));
  f.set(x, y, v, hue, glyph);
}

export default {
  id: "mesh",
  title: "PEER_MESH",
  caption: "no hub, no master. every node tells three friends",

  init(f, S) {
    R = rng(1337);
    peers = [];
    idSeq = 0;
    msgSeq = 0x2f;
    const area = S.cols * (S.rows / S.ax);
    N = clamp(Math.round(Math.sqrt(area) * 0.4), 16, 70);
    for (let i = 0; i < N; i++) addPeer(S, -10);
    for (const p of peers) p.born = -10;
    link(S);
    startMessage(0.9);
    nextChurn = 3;
    pendingJoin = [];
    lastDown = false;
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    f.clear();

    // drift
    for (const p of peers) {
      p.x = p.bx + noise2(p.ph, t * 0.07) * 2.4;
      p.y = p.by + noise2(p.ph + 50, t * 0.07) * 1.4;
    }

    // churn: one peer leaves, a new one joins a moment later
    if (t > nextChurn) {
      nextChurn = t + 2.2 + R() * 2.4;
      const cand = peers.filter((p) => p.dying < 0 && p !== msg.src && p.born < t - 2);
      if (cand.length > 8) {
        cand[(R() * cand.length) | 0].dying = t;
        pendingJoin.push(t + 0.9);
      }
    }
    for (let i = pendingJoin.length - 1; i >= 0; i--) {
      if (t >= pendingJoin[i]) {
        pendingJoin.splice(i, 1);
        addPeer(S, t);
      }
    }
    peers = peers.filter((p) => p.dying < 0 || t - p.dying < 1.3);
    link(S);

    // click: gossip from the peer nearest the cursor
    if (input.inside && input.down && !lastDown) {
      let best = null, bd = Infinity;
      for (const p of peers) {
        if (p.dying >= 0) continue;
        const d = (p.x - input.x) ** 2 + ((p.y - input.y) / ax) ** 2;
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) startMessage(t, best);
    }
    lastDown = input.down;

    // deliver transfers
    for (let i = transfers.length - 1; i >= 0; i--) {
      const tr = transfers[i];
      if (t < tr.t1) continue;
      transfers.splice(i, 1);
      if (tr.b.inf < 0 && tr.b.dying < 0 && peers.includes(tr.b)) inform(tr.b, tr.t1, tr.a.hop + 1);
    }
    if (!transfers.length && msg.done < 0) msg.done = t;
    if (msg.done >= 0 && t - msg.done > 2.4) startMessage(t);

    const intro = (p) => p.born < 0 ? Math.min(1, t * 1.6 - (p.id / N) * 0.8) : 1;

    // background: sparse address-space dots
    for (let y = 4; y < rows - 3; y += 6) for (let x = (y / 6) % 2 ? 5 : 1; x < cols; x += 10) f.plot(x, y, 0.07, HUE.alt, G("+"));

    // links
    for (const [a, b] of edges) {
      const ia = intro(a), ib = intro(b);
      if (ia <= 0 || ib <= 0) continue;
      const lit = a.inf >= 0 && b.inf >= 0;
      const fresh = Math.max(t - a.born, t - b.born);
      if (Math.min(t - a.born, t - b.born) < 0.9) {
        // handshake: the link draws itself out from the newcomer
        const n = t - a.born < t - b.born ? a : b, o = n === a ? b : a;
        const u = clamp((t - n.born) / 0.9);
        dotted(f, n.x, n.y, n.x + (o.x - n.x) * u, n.y + (o.y - n.y) * u, 0.75, HUE.hot, 1, slopeGlyph(o.x - n.x, o.y - n.y, ax));
        continue;
      }
      if (lit) dotted(f, a.x, a.y, b.x, b.y, 0.42, HUE.alt, 1, slopeGlyph(b.x - a.x, b.y - a.y, ax));
      else dotted(f, a.x, a.y, b.x, b.y, 0.32 * Math.min(ia, ib), HUE.fg, 2, G("·"));
    }

    // packets in flight
    for (const tr of transfers) {
      if (t < tr.t0) continue;
      const u = clamp((t - tr.t0) / (tr.t1 - tr.t0));
      const hx = tr.a.x + (tr.b.x - tr.a.x) * u, hy = tr.a.y + (tr.b.y - tr.a.y) * u;
      const sg = slopeGlyph(tr.b.x - tr.a.x, tr.b.y - tr.a.y, ax);
      const len = Math.max(1, Math.hypot(hx - tr.a.x, hy - tr.a.y));
      const steps = Math.ceil(len);
      for (let s = 0; s <= steps; s++) {
        const k = s / steps;
        const tail = 1 - (len - s) / 7; // bright near the head, dimmer behind
        f.plot(tr.a.x + (hx - tr.a.x) * k, tr.a.y + (hy - tr.a.y) * k, Math.max(0.5, tail), tail > 0.6 ? HUE.main : HUE.alt, sg);
      }
      f.set(hx, hy, 1, HUE.white, G("◆"));
    }

    // receive ripples
    for (const p of peers) {
      if (p.inf < 0) continue;
      const age = t - p.inf;
      if (age > 0.7) continue;
      const r = 1.5 + age * 11;
      const v = (1 - age / 0.7) * 0.5;
      const n = Math.max(10, Math.round(r * 5));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        f.plot(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * ax, v, HUE.alt, G("·"));
      }
    }

    // peers
    for (const p of peers) {
      const ia = intro(p);
      if (ia <= 0) continue;
      if (p.dying >= 0) {
        const k = 1 - (t - p.dying) / 1.3;
        node(f, p.x, p.y, Math.max(0.1, k), HUE.hot, G("×"), ax);
        if (k > 0.4) f.text(Math.round(p.x) + 3, p.y, "drop", HUE.hot, k * 0.7);
        continue;
      }
      const born = t - p.born;
      if (born < 1.1) {
        node(f, p.x, p.y, Math.sin(born * 30) > 0 ? 1 : 0.5, HUE.hot, G("◇"), ax, 0.3);
        f.text(Math.round(p.x) + 3, p.y, "join " + p.hex, HUE.hot, 0.75);
        continue;
      }
      if (p === msg.src && t - msg.t0 < 4) {
        node(f, p.x, p.y, 1, HUE.white, G("◆"), ax, 0.5);
        f.text(p.x + 2, p.y - 1, "src", HUE.white, 0.85);
        continue;
      }
      if (p.inf < 0) {
        node(f, p.x, p.y, 0.55 * ia, HUE.fg, G("○"), ax);
      } else {
        const age = t - p.inf;
        if (age < 0.35) node(f, p.x, p.y, 1, HUE.white, G("◉"), ax, 0.55);
        else if (age < 3) node(f, p.x, p.y, 0.95 - age * 0.06, HUE.main, G("●"), ax, 0.35 * (1 - age / 3));
        else node(f, p.x, p.y, 0.75, HUE.alt, G("●"), ax);
      }
    }

    // id / community labels on a few peers
    for (const p of peers) {
      if (p.dying >= 0 || t - p.born < 1.1 || intro(p) < 1) continue;
      const label = p.tag || (p.id % 7 === 0 ? p.hex + ".." : null);
      if (!label || p.x + 3 + label.length >= cols) continue;
      f.text(Math.round(p.x) + 3, p.y, label, p.tag ? HUE.alt : HUE.fg, p.tag ? 0.7 : 0.45);
    }

    // HUD
    const alive = peers.filter((p) => p.dying < 0).length;
    const hud = (x, y, s, hue, v) => {
      if (y < 0 || y >= rows) return;
      s = s.slice(0, Math.max(0, cols - x - 1));
      for (let k = -1; k <= s.length; k++) f.set(x + k, y, 0);
      f.text(x, y, s, hue, v);
    };
    const done = msg.done >= 0;
    hud(2, 1, `hop ${msg.maxHop} · ${msg.count}/${alive} peers${done ? " · synced" : ""}`, done ? HUE.alt : HUE.main, 0.85);
    hud(2, 2, `gossip ▶ msg#0x${msg.n.toString(16)} · fanout ${K}`, HUE.fg, 0.45);
    hud(2, rows - 2, cols > 52 ? `peers ${alive} · no central server · federated` : `peers ${alive} · federated`, HUE.fg, 0.5);
  },
};
