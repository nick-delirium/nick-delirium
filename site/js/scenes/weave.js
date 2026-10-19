// Hansang Lab: little people wander a plaza; every meeting leaves a glowing thread.
// Threads knit into communities, the whole web briefly forms a heart, then relaxes.
import { HUE, G, clamp, noise2, rng, hash1, TAU, slopeGlyph } from "../engine/util.js";

const CYCLE = 46;
const HEART = [27, 36]; // seconds into the cycle
const LABELS = ["book club", "language exchange", "family day", "k-food potluck", "newcomers help", "chess night", "volunteers", "film club"];
const HELLOS = ["hi!", "privet!", "annyeong!", "hey!", "hello!"];
const MEET = 7; // physical distance (cell widths)

let people, threads, keys, pulses, pops, R, N, box, total, cycleN, heartSet, lastPulse, spots;

function key(a, b) {
  return a < b ? a * 1000 + b : b * 1000 + a;
}

function spawnPeople(S) {
  people = [];
  for (let i = 0; i < N; i++) {
    people.push({
      id: i,
      x: box.x0 + R() * (box.x1 - box.x0),
      y: box.y0 + R() * (box.y1 - box.y0),
      ph: R() * 100,
      sp: 2 + R() * 1.6,
      pause: 0,
      wave: 0,
      hx: 0,
      hy: 0,
      spot: i % 4,
    });
  }
}

function heartTargets(S) {
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2 + 1;
  const w = box.x1 - box.x0, h = (box.y1 - box.y0) / S.ax;
  const s = Math.min((w / 32) * 0.82, (h / 29) * 0.82);
  // order people by angle around the centre (clockwise from top) to avoid crossings
  const order = people
    .map((p) => ({ p, a: (Math.atan2(p.x - cx, -(p.y - cy) / S.ax) + TAU) % TAU }))
    .sort((u, v) => u.a - v.a)
    .map((o) => o.p);
  order.forEach((p, i) => {
    const th = (i / order.length) * TAU;
    const hx = 16 * Math.sin(th) ** 3;
    const hy = -(13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th));
    p.hx = cx + hx * s;
    p.hy = cy + (hy - 2.5) * s * S.ax;
  });
  return order;
}

function components() {
  const parent = people.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const th of threads) if (th.fade < 0) parent[find(th.a)] = find(th.b);
  const groups = new Map();
  for (const p of people) {
    const r = find(p.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(p);
  }
  const comp = new Int16Array(people.length).fill(-1);
  const out = [];
  for (const g of groups.values()) {
    if (g.length < 4) continue;
    const idx = out.length;
    g.forEach((p) => (comp[p.id] = idx));
    out.push({
      members: g,
      minId: Math.min(...g.map((p) => p.id)),
      cx: g.reduce((s, p) => s + p.x, 0) / g.length,
      cy: g.reduce((s, p) => s + p.y, 0) / g.length,
    });
  }
  // stable, distinct labels: ordered by each group's oldest member
  const base = (hash1(cycleN * 7 + 3) * LABELS.length) | 0;
  [...out].sort((a, b) => a.minId - b.minId).forEach((g, k) => (g.label = LABELS[(base + k) % LABELS.length]));
  return { comp, groups: out };
}

function sprite(f, p, t, hue, v) {
  const x = Math.round(p.x), y = Math.round(p.y);
  const waving = p.wave > 0;
  const walk = !waving && p.pause <= 0 && (Math.floor(t * 6 + p.ph) & 1);
  if (waving) {
    f.set(x - 1, y - 1, v, hue, G("\\"));
    f.set(x + 1, y - 1, v, hue, G("/"));
  }
  f.set(x, y - 1, v, hue, G("o"));
  if (!waving) {
    f.set(x - 1, y, v * 0.85, hue, G("/"));
    f.set(x + 1, y, v * 0.85, hue, G("\\"));
  }
  f.set(x, y, v * 0.85, hue, G("|"));
  if (walk) f.set(x, y + 1, v * 0.8, hue, G("|"));
  else {
    f.set(x - 1, y + 1, v * 0.8, hue, G("/"));
    f.set(x + 1, y + 1, v * 0.8, hue, G("\\"));
  }
}

export default {
  id: "weave",
  title: "SOCIAL_WEAVE",
  caption: "strangers in, community out",

  init(f, S) {
    R = rng(1988);
    const top = Math.max(4, Math.round(S.rows * 0.2));
    box = { x0: 3, x1: S.cols - 4, y0: top + 2, y1: S.rows - 5 };
    N = clamp(Math.round(Math.sqrt(S.cols * (S.rows / S.ax)) * 0.27), 10, 46);
    // gathering spots (a café, a bench, a stall...) that pull people together
    const portrait = S.rows / S.ax > S.cols;
    spots = Array.from({ length: 4 }, (_, i) => {
      // 2x2 (landscape: 4x1-ish) spread so communities form apart from each other
      const gx = portrait ? (i % 2) : i, gy = portrait ? (i >> 1) : i % 2;
      const nx = portrait ? 2 : 4, ny = 2;
      return {
        x: box.x0 + (box.x1 - box.x0) * ((gx + 0.5 + (R() - 0.5) * 0.3) / nx),
        y: box.y0 + (box.y1 - box.y0) * ((gy + 0.5 + (R() - 0.5) * 0.3) / ny),
        ph: R() * 10,
      };
    });
    spawnPeople(S);
    for (const p of people) {
      const sp = spots[p.spot];
      p.x = clamp(sp.x + (R() - 0.5) * 22, box.x0, box.x1);
      p.y = clamp(sp.y + (R() - 0.5) * 9, box.y0, box.y1);
    }
    threads = [];
    keys = new Set();
    pulses = [];
    pops = [];
    total = 0;
    cycleN = 0;
    heartSet = false;
    lastPulse = 0;
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    f.clear();
    const cyc = Math.floor(t / CYCLE);
    if (cyc !== cycleN) {
      cycleN = cyc;
      heartSet = false;
    }
    const ph = t - cyc * CYCLE;
    const inHeart = ph > HEART[0] && ph < HEART[1];
    const maxThreads = Math.round(N * 2.4);

    // ── movement ──
    let heartOrder = null;
    if (inHeart && !heartSet) {
      heartOrder = heartTargets(S);
      heartSet = heartOrder;
    } else if (inHeart) heartOrder = heartSet;
    const { comp, groups } = components();
    for (const p of people) {
      if (p.wave > 0) p.wave -= dt;
      if (inHeart) {
        const k = Math.min(1, dt * 1.8);
        p.x += (p.hx - p.x) * k;
        p.y += (p.hy - p.y) * k;
        if (ph > HEART[0] + 2.5) p.wave = 0.2;
        continue;
      }
      if (p.pause > 0) {
        p.pause -= dt;
        continue;
      }
      const a = noise2(p.ph, t * 0.12) * TAU;
      let vx = Math.cos(a) * p.sp, vy = Math.sin(a) * p.sp * ax;
      const sp = spots[p.spot];
      const sx = sp.x + Math.sin(t * 0.07 + sp.ph) * 3, sy = sp.y + Math.cos(t * 0.05 + sp.ph) * 1.5;
      vx += (sx - p.x) * 0.2;
      vy += (sy - p.y) * 0.2;
      if (R() < dt * 0.004) p.spot = (R() * spots.length) | 0;
      for (const q of people) {
        if (q === p) continue;
        const dx = p.x - q.x, dy = (p.y - q.y) / ax;
        const d = Math.hypot(dx, dy);
        if (d > 0.01 && d < 4.5) {
          vx += (dx / d) * (4.5 - d) * 2.2;
          vy += (dy / d) * (4.5 - d) * 2.2 * ax;
        }
      }
      p.x += vx * dt;
      p.y += vy * dt;
      if (p.x < box.x0 || p.x > box.x1) p.ph += 0.7;
      if (p.y < box.y0 || p.y > box.y1) p.ph += 1.3;
      p.x = clamp(p.x, box.x0, box.x1);
      p.y = clamp(p.y, box.y0, box.y1);
    }

    // ── meetings make threads ──
    if (!inHeart && ph < CYCLE - 5) {
      const deg = new Uint8Array(N);
      for (const th of threads) if (th.fade < 0) deg[th.a]++, deg[th.b]++;
      for (let i = 0; i < N; i++) {
        const a = people[i];
        for (let j = i + 1; j < N; j++) {
          const b = people[j];
          const d = Math.hypot(a.x - b.x, (a.y - b.y) / ax);
          if (d > MEET || keys.has(key(i, j)) || deg[i] >= 4 || deg[j] >= 4) continue;
          deg[i]++;
          deg[j]++;
          keys.add(key(i, j));
          threads.push({ a: i, b: j, t0: t, fade: -1 });
          total++;
          a.pause = b.pause = 0.8;
          a.wave = b.wave = 0.8;
          if (pops.length < 3) pops.push({ x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 3, t0: t, s: HELLOS[(R() * HELLOS.length) | 0] });
        }
      }
    }
    // keep the web from saturating: oldest threads fade first, everything fades at cycle end
    const live = threads.filter((th) => th.fade < 0);
    for (let k = 0; k < live.length - maxThreads; k++) live[k].fade = t;
    if (ph > CYCLE - 4.5) for (const th of live) if (th.fade < 0) th.fade = t + R() * 1.5;
    threads = threads.filter((th) => th.fade < 0 || t - th.fade < 2.5);
    keys = new Set(threads.map((th) => key(th.a, th.b)));

    // pulses travel along threads
    if (t - lastPulse > 0.12 && threads.length) {
      lastPulse = t;
      const th = threads[(R() * threads.length) | 0];
      if (th.fade < 0 && t - th.t0 > 0.7) pulses.push({ th, t0: t, dir: R() < 0.5 });
    }
    pulses = pulses.filter((pu) => t - pu.t0 < 0.9 && threads.includes(pu.th));

    // ── backdrop: skyline + plaza tiles ──
    const sky = box.y0 - 2;
    for (let x = 0; x < cols; x++) {
      const bw = 5 + ((hash1(Math.floor(x / 6) * 13) * 4) | 0);
      const h = Math.round(sky * (0.35 + hash1(Math.floor(x / bw) * 7 + 3) * 0.6));
      for (let y = sky - h; y < sky; y++) {
        if (y < 0) continue;
        const edge = y === sky - h;
        const win = (x % 3 === 1) && ((sky - y) % 2 === 0) && hash1(x * 97 + y * 13) < 0.3;
        if (edge) f.plot(x, y, 0.16, HUE.alt, G("▄"));
        else if (win) f.plot(x, y, 0.22 + 0.1 * Math.sin(t + x), HUE.main, G("▪"));
        else if ((x + y) % 2 === 0) f.plot(x, y, 0.05, HUE.alt, G("░"));
      }
    }
    for (let x = 0; x < cols; x++) f.plot(x, sky, 0.18, HUE.fg, G("─"));
    for (let y = sky + 3; y < rows - 3; y += 4) {
      for (let x = (y % 8 ? 0 : 4); x < cols; x += 8) f.plot(x, y, 0.07, HUE.fg, G("+"));
    }

    // ── community halos + labels ──
    for (const g of groups) {
      const r = 3 + Math.sqrt(g.members.length) * 2.6;
      const x0 = Math.floor(g.cx - r), x1 = Math.ceil(g.cx + r);
      const y0 = Math.floor(g.cy - r * ax), y1 = Math.ceil(g.cy + r * ax);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x - g.cx, (y - g.cy) / ax);
          if (d < r) f.plot(x, y, 0.15 * (1 - d / r) ** 1.5, HUE.main);
        }
      }
    }

    // ── threads ──
    for (const th of threads) {
      const a = people[th.a], b = people[th.b];
      const age = t - th.t0;
      const fade = th.fade < 0 ? 1 : clamp(1 - (t - th.fade) / 2.5);
      const u = clamp(age / 0.7);
      const ex = a.x + (b.x - a.x) * u, ey = a.y + (b.y - a.y) * u;
      const inComm = comp[th.a] >= 0;
      if (age < 1.2) {
        f.line(a.x, a.y, ex, ey, 0.95 * fade, HUE.white, slopeGlyph(b.x - a.x, b.y - a.y, ax));
      } else {
        const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)));
        for (let s = 1; s < steps; s++) {
          if (s % 2) continue;
          f.plot(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps, (inComm ? 0.55 : 0.4) * fade, HUE.main, G("·"));
        }
      }
    }
    for (const pu of pulses) {
      const a = people[pu.th.a], b = people[pu.th.b];
      let u = (t - pu.t0) / 0.9;
      if (pu.dir) u = 1 - u;
      f.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 1, HUE.white, G("•"));
    }

    // ── heart outline ──
    if (inHeart && heartOrder) {
      const k = clamp((ph - HEART[0] - 1.2) / 1.5) * clamp((HEART[1] - ph) / 1.2);
      if (k > 0) {
        for (let i = 0; i < heartOrder.length; i++) {
          const a = heartOrder[i], b = heartOrder[(i + 1) % heartOrder.length];
          f.line(a.x, a.y, b.x, b.y, 0.9 * k, HUE.hot, slopeGlyph(b.x - a.x, b.y - a.y, ax));
        }
        const cx = (box.x0 + box.x1) / 2;
        const msg = "hansang.lab";
        f.text(Math.round(cx - msg.length / 2), Math.round((box.y0 + box.y1) / 2), msg, HUE.white, k);
      }
    }

    // ── mouse joins in ──
    if (input.inside && input.y > box.y0 && input.y < rows - 2) {
      const me = { x: input.x, y: input.y, ph: 0, pause: 1, wave: 0 };
      for (const p of people) {
        const d = Math.hypot(p.x - me.x, (p.y - me.y) / ax);
        if (d < MEET * 2.2) {
          f.line(me.x, me.y, p.x, p.y, 0.7, HUE.alt, slopeGlyph(p.x - me.x, p.y - me.y, ax));
          p.wave = Math.max(p.wave, 0.3);
        }
      }
      sprite(f, me, t, HUE.alt, 1);
      f.text(Math.round(me.x) - 1, Math.round(me.y) + 2, "you", HUE.alt, 0.9);
    }

    // ── people ──
    for (const p of people) {
      const inComm = comp[p.id] >= 0;
      const hue = p.wave > 0 ? HUE.white : inComm ? HUE.main : HUE.fg;
      sprite(f, p, t, hue, p.wave > 0 ? 1 : inComm ? 0.9 : 0.75);
    }

    // ── greetings ──
    pops = pops.filter((po) => t - po.t0 < 1.4);
    for (const po of pops) {
      const k = 1 - (t - po.t0) / 1.4;
      f.text(Math.round(po.x - po.s.length / 2), Math.round(po.y - (1 - k) * 2), po.s, HUE.white, 0.4 + k * 0.6);
    }

    // community labels (on top, with a cleared backdrop)
    if (!inHeart) {
      for (const g of groups) {
        const s = `${g.label} · ${g.members.length}`;
        const r = 3 + Math.sqrt(g.members.length) * 2.6;
        let x = Math.round(g.cx - s.length / 2), y = Math.round(g.cy - r * ax) - 1;
        x = clamp(x, 1, cols - s.length - 1);
        y = clamp(y, box.y0 - 1, rows - 3);
        for (let k = -1; k <= s.length; k++) f.set(x + k, y, 0);
        f.text(x, y, s, HUE.main, 0.9);
      }
    }

    // HUD
    const hud = (x, y, s, hue, v) => {
      s = s.slice(0, Math.max(0, cols - x - 1));
      for (let k = -1; k <= s.length; k++) f.set(x + k, y, 0);
      f.text(x, y, s, hue, v);
    };
    hud(2, rows - 2, cols > 46 ? `connections ${total} · community.sync()` : `links ${total}`, HUE.fg, 0.6);
    if (cols > 70) hud(cols - 14, rows - 2, `online ${N}`, HUE.alt, 0.55);
  },
};
