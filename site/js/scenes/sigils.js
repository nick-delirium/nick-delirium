// Witch Hat Atelier seals: a central sigil (spell type), inward-pointing signs (spell form)
// and a ring, inked stroke by stroke in conjuring ink. The ring is left open; the spell
// only fires once the pen closes the gap. Signs decide the shape: columns shoot, levitation
// floats, tilted signs spin, and one over-long column sign throws the spell off balance.
import { HUE, clamp, smooth, lerp, rng, noise2, noise3, fbm2, G, TAU } from "../engine/util.js";

const SPELLS = [
  { name: "watershot", sigil: "water", sign: "column", fx: "jet" },
  { name: "water orb", sigil: "water", sign: "lev", fx: "orb" },
  { name: "flame burst", sigil: "fire", sign: "column", fx: "flame" },
  { name: "pyreball", sigil: "fire", sign: "lev", fx: "pyre" },
  { name: "light beam", sigil: "light", sign: "column", fx: "beam" },
  { name: "floatglow", sigil: "light", sign: "lev", fx: "glow" },
  { name: "wayward whorlwind", sigil: "wind", sign: "band", fx: "whirl" },
  { name: "earth lift", sigil: "earth", sign: "column", fx: "pillar" },
];
const LINKABLE = ["watershot", "light beam", "floatglow", "water orb"];
const SIGN_DESC = { column: "columns", lev: "levitation", band: "tilted band" };
const DUR = 4.6; // cast length (s)
const GAP_W = 0.44; // open part of the ring (rad)
const DOT = G("·"), NIB = G("◆"), BULLET = G("•"), BALL = G("●"), DEG = G("°"), STAR = G("*");
const ROCK = [G("░"), G("▒"), G("▓"), G("█")];

let cols, rows, ax, U, rand, speed, seals, job, nextAt, deck, deckI, jobCount, lastCast, motes;
let F, V, Hh, Gg;

/* ───────────── geometry (normalized: ring radius 1, y down) ───────────── */
function arc(r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

function catmull(pts, per = 5) {
  const out = [], n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const c = (k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([c(0), c(1)]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}

const mirror = (lines) => lines.map((l) => l.map(([x, y]) => [-x, y]));

// canonical sigil shapes, traced from the series' reference sheets
const SIGILS = {
  fire: () => ({
    lines: [
      [[0, -0.5], [-0.46, 0.34], [0.46, 0.34], [0, -0.5]],
      [[-0.17, -0.2], [-0.44, -0.36]],
      [[0.17, -0.2], [0.44, -0.36]],
      [[0, 0.34], [0, 0.6]],
    ],
    dots: [],
  }),
  water: () => {
    const s = catmull([[0.15, -0.47], [0.07, -0.6], [-0.03, -0.52], [-0.02, -0.26], [0.04, 0], [0.02, 0.27], [-0.04, 0.52], [-0.13, 0.6], [-0.19, 0.5]], 5);
    const drop = (ox) => {
      const pts = [[ox, -0.27], [ox - 0.06, -0.13], [ox - 0.1, 0.02]];
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI - (Math.PI * i) / 10;
        pts.push([ox + Math.cos(a) * 0.1, 0.06 + Math.sin(a) * 0.1]);
      }
      pts.push([ox + 0.06, -0.13], [ox, -0.27]);
      return pts;
    };
    return { lines: [s, drop(-0.37), drop(0.37)], dots: [] };
  },
  earth: () => ({
    lines: [
      [[-0.46, -0.42], [0.46, -0.42]],
      [[0, -0.42], [0, 0.28]],
      [[-0.13, -0.2], [-0.3, 0.0], [0, 0.28], [0.3, 0.0], [0.13, -0.2]],
      [[-0.46, 0.44], [0.46, 0.44]],
    ],
    dots: [[-0.62, 0.0], [0.62, 0.0]],
  }),
  wind: () => {
    const top = [], bot = [], n = 56, turns = 1.25;
    for (let i = 0; i <= n; i++) {
      const u = i / n, r = 0.22 * (1 - 0.72 * u);
      const a1 = Math.PI / 2 + u * TAU * turns, a2 = -Math.PI / 2 + u * TAU * turns;
      top.push([Math.cos(a1) * r, -0.22 + Math.sin(a1) * r]);
      bot.push([Math.cos(a2) * r, 0.22 + Math.sin(a2) * r]);
    }
    const rays = [[[-0.36, -0.07], [-0.56, -0.15]], [[-0.36, 0], [-0.58, 0]], [[-0.36, 0.07], [-0.56, 0.15]]];
    return { lines: [[...top.reverse(), ...bot], ...rays, ...mirror(rays)], dots: [] };
  },
  light: () => {
    const s = 0.3;
    return {
      lines: [
        [[-s, -s], [s, -s], [s, s], [-s, s], [-s, -s]],
        [[0, -s], [s, 0], [0, s], [-s, 0], [0, -s]],
        [[0, -s], [0, -0.56]],
        [[0, s], [0, 0.56]],
        [[-s, 0], [-0.56, 0]],
        [[s, 0], [0.56, 0]],
      ],
      dots: [],
    };
  },
};

// signs sit just inside the ring and point to the centre; tilt rotates each about its base
function signLines(type, n, tilt, longK, baseR) {
  const lines = [];
  const c = Math.cos(tilt), s = Math.sin(tilt);
  for (let k = 0; k < n; k++) {
    const phi = -Math.PI / 2 + (TAU * k) / n;
    const ux = Math.cos(phi), uy = Math.sin(phi);
    const ix = -ux * c + uy * s, iy = -ux * s - uy * c; // inward, rotated
    const vx = -uy * c - ux * s, vy = -uy * s + ux * c; // across, rotated
    const bx = ux * baseR, by = uy * baseR;
    const at = (a, b) => [bx + ix * a + vx * b, by + iy * a + vy * b];
    if (type === "column") {
      lines.push([at(0, -0.1), at(0, 0.1)], [at(0, 0), at(k === longK ? 0.46 : 0.24, 0)]);
    } else if (type === "lev") {
      lines.push([at(0, -0.09), at(0, 0.09)], [at(0, 0), at(0.26, 0)], [at(0.16, -0.075), at(0.26, 0), at(0.16, 0.075)]);
    } else {
      lines.push([at(0, -0.06), at(0.11, 0), at(0, 0.06)]);
    }
  }
  return lines;
}

/* ───────────── seals and drawing jobs ───────────── */
function makeSeal(spell, cx, cwy, R, o) {
  const band = spell.sign === "band";
  const sg = SIGILS[spell.sigil]();
  const sc = band ? 0.56 : 0.74;
  const n = band ? 10 : o.n;
  const toW = (p, k = 1) => [cx + p[0] * k * R, cwy + p[1] * k * R];
  const strokes = [];
  for (const l of sg.lines) strokes.push({ pts: l.map((p) => toW(p, sc)) });
  for (const d of sg.dots) strokes.push({ pts: [toW(d, sc)], dot: true });
  if (band) strokes.push({ pts: arc(0.74, -Math.PI / 2, -Math.PI / 2 + TAU, 72).map((p) => toW(p)), thin: true });
  for (const l of signLines(spell.sign, n, band ? 0.55 : 0, o.longK, band ? 0.93 : 0.86)) strokes.push({ pts: l.map((p) => toW(p)) });
  if (!band && o.double) strokes.push({ pts: arc(0.93, -Math.PI / 2, -Math.PI / 2 + TAU, 88).map((p) => toW(p)), thin: true });
  const a0 = o.gapAt + GAP_W / 2, a1 = a0 + TAU - GAP_W;
  strokes.push({ pts: arc(1, a0, a1, 96).map((p) => toW(p)), ring: true });
  const close = { pts: arc(1, a1, a0 + TAU, 10).map((p) => toW(p)), ring: true };
  measure(close);
  // a long column sign on the left pushes the spell right, and vice versa
  const veer = o.longK >= 0 ? -Math.sign(Math.cos(-Math.PI / 2 + (TAU * o.longK) / n)) * 0.5 : 0;
  return { spell, cx, cwy, R, n, band, strokes, close, closeProg: 0, closed: false, castT: -1, veer, str: o.str || 1, parts: [], job: null };
}

function measure(st) {
  const cum = [0];
  for (let i = 1; i < st.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(st.pts[i][0] - st.pts[i - 1][0], st.pts[i][1] - st.pts[i - 1][1]));
  st.cum = cum;
  st.len = st.dot ? 1.2 : cum[cum.length - 1];
}

function makeJob(list, links = []) {
  const j = { seals: list, strokes: [], total: 0, prog: 0, phase: "draw", wait: 0, closeIdx: 0 };
  const lift = 0.07 * speed;
  const add = (st) => {
    measure(st);
    st.start = j.total + lift;
    j.total = st.start + st.len;
    j.strokes.push(st);
  };
  for (const s of list) {
    s.job = j;
    s.strokes.forEach(add);
  }
  links.forEach(add);
  return j;
}

function place(R, span = 0) {
  const W = rows / ax;
  let yMin = Math.max(2.7 * R + 2, W * 0.48), yMax = W - R - 1.5;
  if (yMin > yMax) yMin = yMax = (yMin + yMax) / 2;
  const xMin = R + 2 + span, xMax = Math.max(xMin, cols - R - 2 - span);
  let best = [(xMin + xMax) / 2, (yMin + yMax) / 2, -1e9], bs = -1e9;
  for (let i = 0; i < 40; i++) {
    const x = lerp(xMin, xMax, rand()), y = lerp(yMin, yMax, rand());
    let sc = 1e9;
    for (const s of seals) {
      const dx = Math.abs(x - s.cx) - span;
      sc = Math.min(sc, dx - 0.95 * (R + s.R));
    }
    if (sc + rand() * 2 > bs) {
      bs = sc + rand() * 2;
      best = [x, y, sc];
    }
  }
  return best;
}

function nextSpell() {
  if (deckI >= deck.length) {
    deck = SPELLS.slice().sort(() => rand() - 0.5);
    deckI = 0;
  }
  return deck[deckI++];
}

function newJob(balanced = false, force = false) {
  jobCount++;
  const gapAt = -Math.PI / 4 + (rand() - 0.5) * 1.4;
  if (!force && jobCount % 4 === 0 && cols >= 60) {
    // linked seals: three small identical seals joined by a line fire together, boosted
    const pick = LINKABLE[(rand() * LINKABLE.length) | 0];
    const spell = SPELLS.find((s) => s.name === pick);
    const R = Math.max(4.5, 0.085 * U), sp = 2.7 * R;
    const [cx, cy, room] = place(R, sp);
    if (room < 0) return null;
    const list = [-1, 0, 1].map((k) => makeSeal(spell, cx + k * sp, cy, R, { n: 4, longK: -1, gapAt, str: 1.3 }));
    const links = [0, 1].map((k) => ({ pts: [[list[k].cx + R, cy], [list[k + 1].cx - R, cy]], link: true }));
    seals.push(...list);
    return makeJob(list, links);
  }
  const big = rand() < 0.6;
  const R = big ? Math.max(8, 0.23 * U) : Math.max(6, 0.16 * U);
  const [cx, cy, room] = place(R);
  if (!force && room < -0.25 * R && seals.length) return null; // wait for the desk to clear
  const spell = nextSpell();
  const shoots = spell.fx === "jet" || spell.fx === "flame";
  const longK = shoots && !balanced && rand() < 0.3 ? (rand() < 0.5 ? 1 : 3) : -1;
  const n = longK >= 0 ? 4 : [4, 4, 6, 8][(rand() * 4) | 0];
  const s = makeSeal(spell, cx, cy, R, { n, longK, gapAt, double: rand() < 0.35 });
  seals.push(s);
  return makeJob([s]);
}

function advance(j, t, dt) {
  if (j.phase === "draw") {
    j.prog += speed * dt;
    if (j.prog >= j.total) {
      j.prog = j.total;
      j.phase = "wait";
      j.wait = 0;
    }
  } else if (j.phase === "wait") {
    j.wait += dt;
    if (j.wait > 0.8) j.phase = "close";
  } else if (j.phase === "close") {
    const s = j.seals[j.closeIdx];
    s.closeProg += speed * 0.35 * dt;
    if (s.closeProg >= s.close.len) {
      s.closed = true;
      j.closeIdx++;
      const group = j.seals.length > 1;
      if (!group) cast(s);
      if (j.closeIdx >= j.seals.length) {
        if (group) j.seals.forEach(cast);
        j.phase = "done";
        job = null;
        nextAt = t + 0.35;
      }
    }
  }
}

function cast(s) {
  s.castT = 0;
  lastCast = s;
}

/* ───────────── raster helpers ───────────── */
function put(x, y, v, h, g = -1) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= cols || y >= rows) return;
  const i = y * cols + x;
  if (v > V[i]) {
    V[i] = v;
    Hh[i] = h;
    Gg[i] = g;
  }
}
const wline = (x0, wy0, x1, wy1, v, h) => F.line(x0, wy0 * ax, x1, wy1 * ax, v, h, "auto", ax);

function label(x, y, str, hue, val) {
  x = Math.round(x);
  if (y < 0 || y >= rows) return;
  if (x < 0) x = 0;
  str = str.slice(0, Math.max(0, cols - x - 1));
  for (let k = -1; k <= str.length; k++) F.set(x + k, y, 0);
  F.text(x, y, str, hue, val);
}

/** draws a stroke up to `prog`; mode 0 = wet ink being laid, 1 = settled */
function drawStroke(st, prog, v, hue, mode) {
  if (prog < st.start) return null;
  const pts = st.pts;
  if (st.dot) {
    put(pts[0][0], pts[0][1] * ax, v, hue, BALL);
    return pts[0];
  }
  const d = prog - st.start, cum = st.cum;
  let tip = pts[0];
  for (let j = 0; j < pts.length - 1; j++) {
    if (d <= cum[j]) break;
    const a = pts[j], b = pts[j + 1];
    let bx = b[0], by = b[1];
    if (d < cum[j + 1]) {
      const k = (d - cum[j]) / (cum[j + 1] - cum[j]);
      bx = a[0] + (b[0] - a[0]) * k;
      by = a[1] + (b[1] - a[1]) * k;
    }
    let vv = v, hh = hue;
    if (mode === 0) {
      const behind = Math.max(0, d - cum[j + 1]);
      vv = v + (0.97 - v) * Math.exp(-behind / (0.16 * speed));
      if (behind < 0.08 * speed) hh = HUE.main;
    }
    wline(a[0], a[1], bx, by, vv, hh);
    tip = [bx, by];
  }
  return tip;
}

/* ───────────── spell effects ───────────── */
function spawn(s, x, wy, vx, vy, life, g, hue, v, grav = 0) {
  if (s.parts.length < 160) s.parts.push({ x, wy, vx, vy, life, max: life, g, hue, v, grav });
}

function column(s, t, e, kind, dt) {
  const R = s.R * s.str;
  const al = s.veer * smooth(0.1, 0.7, t);
  const dx = Math.sin(al), dy = -Math.cos(al), nx = Math.cos(al), ny = Math.sin(al);
  const L = kind === "flame" ? 3.1 * R : (s.cwy + 4) / Math.max(0.35, Math.cos(al));
  const Lc = L * smooth(0, kind === "flame" ? 0.35 : 0.55, t);
  const hwMax = kind === "beam" ? 0.6 * R : kind === "flame" ? 0.45 * R : 0.55 * R;
  const ex = s.cx + dx * Lc, ey = s.cwy + dy * Lc;
  const x0 = Math.max(0, Math.floor(Math.min(s.cx, ex) - hwMax)), x1 = Math.min(cols - 1, Math.ceil(Math.max(s.cx, ex) + hwMax));
  const y0 = Math.max(0, Math.floor((Math.min(s.cwy, ey) - hwMax) * ax)), y1 = Math.min(rows - 1, Math.ceil((Math.max(s.cwy, ey) + 0.2 * R) * ax));
  for (let y = y0; y <= y1; y++) {
    const wy = y / ax - s.cwy;
    for (let x = x0; x <= x1; x++) {
      const wx = x - s.cx;
      const sa = wx * dx + wy * dy, q = wx * nx + wy * ny;
      if (sa < -0.1 * R || sa > Lc) continue;
      const tipK = smooth(Lc, Lc - 3, sa);
      let v = 0, hue = HUE.alt;
      if (kind === "jet") {
        const hw = R * 0.36 * (0.7 + 0.3 * Math.min(1, sa / (0.8 * R))) * (1 + (0.35 * sa) / L) * (1 + 0.1 * noise2(sa * 0.08 - t * 5, 1.7));
        const a = Math.abs(q) / hw;
        if (a > 1) continue;
        const streak = noise2(q * 0.25, sa * 0.07 - t * 6) * 0.5 + 0.5;
        v = (0.26 + 0.24 * streak + 0.42 * a * a * a) * e * tipK;
        hue = v > 0.72 ? HUE.white : HUE.alt;
      } else if (kind === "flame") {
        const fr = sa / L;
        const hw = Math.max(0.5, R * 0.45 * (1 - 0.78 * Math.pow(Math.max(0, fr), 1.1)));
        const qq = q + noise2(sa * 0.09 - t * 3.5, 9.1) * R * 0.18 * fr;
        const nn = fbm2(q * 0.2, sa * 0.15 - t * 6, 3);
        v = clamp(1.05 - fr * 0.9 + nn * 0.6 - (Math.abs(qq) / hw) * 0.95) * e;
        hue = v > 0.8 ? HUE.white : v > 0.48 ? HUE.main : HUE.hot;
      } else {
        const core = Math.exp(-((q / (0.11 * R)) ** 2));
        const halo = 0.4 * Math.exp(-((q / (0.5 * R)) ** 2));
        v = (core + halo) * (0.88 + 0.12 * Math.sin(t * 17 + sa * 0.15)) * e * tipK;
        hue = core > 0.55 ? HUE.white : HUE.main;
      }
      if (v > 0.05) put(x, y, v, hue);
    }
  }
  // particles: spray, sparks, motes
  const rate = kind === "jet" ? 40 : kind === "flame" ? 36 : 14;
  if (e > 0.3 && rand() < rate * dt * 2) {
    const sa = rand() * Lc, side = rand() < 0.5 ? -1 : 1;
    const bx = s.cx + dx * sa, by = s.cwy + dy * sa;
    if (kind === "jet") {
      const hw = R * 0.4;
      spawn(s, bx + nx * hw * side, by + ny * hw * side, nx * side * (6 + rand() * 9), dy * (rand() * 4 - 1), 0.8, rand() < 0.5 ? DOT : DEG, HUE.alt, 0.7, 24);
    } else if (kind === "flame") {
      const k = rand() * 0.6;
      spawn(s, s.cx + dx * k * L + nx * (rand() - 0.5) * R * 0.5, s.cwy + dy * k * L, nx * (rand() - 0.5) * 6 + dx * 14, dy * (10 + rand() * 12), 0.7, rand() < 0.3 ? STAR : DOT, rand() < 0.5 ? HUE.main : HUE.hot, 0.85);
    } else {
      spawn(s, bx + nx * (rand() - 0.5) * R * 0.3, by, 0, dy * (5 + rand() * 5), 1.2, DOT, rand() < 0.5 ? HUE.white : HUE.main, 0.75);
    }
  }
}

function orb(s, t, e, kind, dt) {
  const R = s.R * s.str;
  const rise = smooth(0, 0.9, t);
  const Ox = s.cx, Oy = s.cwy - (kind === "glow" ? 2.05 : 1.95) * R * rise;
  const ro = (kind === "orb" ? 0.55 : kind === "pyre" ? 0.42 : 0.28) * R * Math.sqrt(Math.max(e, 0.001));
  const reach = kind === "pyre" ? 2.1 * ro : kind === "glow" ? 2.6 * ro : 1.2 * ro;
  const x0 = Math.max(0, Math.floor(Ox - reach)), x1 = Math.min(cols - 1, Math.ceil(Ox + reach));
  const y0 = Math.max(0, Math.floor((Oy - reach) * ax)), y1 = Math.min(rows - 1, Math.ceil((Oy + reach) * ax));
  for (let y = y0; y <= y1; y++) {
    const dy = y / ax - Oy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - Ox;
      const d = Math.hypot(dx, dy);
      if (d > reach) continue;
      let v = 0, hue = HUE.alt;
      if (kind === "orb") {
        const th = Math.atan2(dy, dx);
        const rb = ro * (1 + 0.07 * noise3(Math.cos(th) * 1.4, Math.sin(th) * 1.4, t * 1.6) + 0.04 * Math.sin(t * 2.6 + th * 3));
        if (d > rb) continue;
        const k = d / rb;
        v = (0.18 + 0.55 * k ** 4 + 0.2 * (noise3(dx * 0.16, dy * 0.16, t * 0.9) * 0.5 + 0.5)) * e;
        hue = v > 0.78 ? HUE.white : HUE.alt;
        if (Math.hypot(dx + 0.33 * ro, dy + 0.33 * ro) < 0.16 * ro) {
          v = 0.95 * e;
          hue = HUE.white;
        }
      } else if (kind === "pyre") {
        const up = -dy / (d + 1e-3);
        const reff = ro * (1 + 0.6 * Math.max(0, up) ** 1.6 * (0.55 + 0.45 * (fbm2(dx * 0.2, dy * 0.2 - t * 3.5, 2) * 0.5 + 0.5)));
        const k = d / reff;
        if (k > 1) continue;
        v = clamp((1 - k) * 1.25 + fbm2(dx * 0.22, dy * 0.22 - t * 4.5, 3) * 0.35) * e;
        hue = v > 0.8 ? HUE.white : v > 0.45 ? HUE.main : HUE.hot;
      } else {
        const k = d / ro;
        v = (k < 1 ? 0.9 + 0.1 * (1 - k) : 0.5 * Math.exp(-(k - 1) * 1.6)) * e * (0.9 + 0.1 * Math.sin(t * 5));
        hue = k < 0.8 ? HUE.white : HUE.main;
      }
      if (v > 0.05) put(x, y, v, hue);
    }
  }
  // levitation threads tie the floating spell to its seal
  const top = Oy + ro, bottom = s.cwy - 0.15 * R;
  for (let j = -1; j <= 1; j++) {
    for (let wy = top; wy < bottom; wy += 1.2 / ax) {
      if (((wy * 0.25 - t * 1.5 + j * 0.3) % 1 + 1) % 1 > 0.5) continue;
      const x = Ox + j * 0.22 * R + Math.sin(wy * 0.4 + t * 4 + j) * 0.6;
      put(x, wy * ax, 0.26 * e, kind === "pyre" ? HUE.hot : kind === "glow" ? HUE.main : HUE.alt, DOT);
    }
  }
  if (kind === "glow") {
    for (let k = 0; k < 8; k++) {
      const a = t * 0.6 + (TAU * k) / 8;
      const r0 = 1.25 * ro, r1 = ro * (2 + 0.7 * Math.sin(t * 2.3 + k * 1.7));
      wline(Ox + Math.cos(a) * r0, Oy + Math.sin(a) * r0, Ox + Math.cos(a) * r1, Oy + Math.sin(a) * r1, 0.45 * e, HUE.main);
    }
  }
  if (e > 0.3) {
    if (kind === "orb" && rand() < 7 * dt) spawn(s, Ox + (rand() - 0.5) * ro, Oy + ro * 0.95, (rand() - 0.5) * 3, 2, 2, BULLET, HUE.alt, 0.75, 30);
    if (kind === "pyre" && rand() < 30 * dt) spawn(s, Ox + (rand() - 0.5) * ro, Oy - ro * 0.6, (rand() - 0.5) * 5, -(8 + rand() * 10), 0.7, rand() < 0.3 ? STAR : DOT, rand() < 0.5 ? HUE.main : HUE.hot, 0.85);
    if (kind === "glow" && rand() < 10 * dt) spawn(s, Ox + (rand() - 0.5) * ro * 4, Oy + (rand() - 0.2) * ro * 3, 0, -(2 + rand() * 3), 1.4, DOT, HUE.white, 0.7);
  }
}

function whirl(s, t, e, dt) {
  // a spinning funnel of stacked rings: tilted signs give spin instead of reach
  const R = s.R * s.str;
  const H = 2.9 * R * smooth(0, 0.8, t);
  const M = Math.max(6, Math.round(H / (0.24 * R)));
  const rad = (h) => R * (0.14 + 0.56 * Math.pow(h / Math.max(H, 1), 0.9));
  for (let m = 0; m < M; m++) {
    const u = (((m + t * 1.1) / M) % 1 + 1) % 1; // rings drift upward and recycle
    const h = u * H;
    const rr = rad(h), sq = 0.22;
    const lean = Math.sin(t * 0.7 + u * 2) * R * 0.14 * u;
    const cx = s.cx + lean, cy = s.cwy - h;
    const fade = smooth(0, 0.08, u) * (1 - 0.55 * u) * e;
    const n = Math.max(10, Math.round(rr * 1.6));
    let px = cx + rr, py = cy;
    for (let k = 1; k <= n; k++) {
      const a = (TAU * k) / n;
      const x = cx + Math.cos(a) * rr, wy = cy + Math.sin(a) * rr * sq;
      const front = Math.sin(a) > 0;
      const dash = ((((a / TAU) * 3 - t * 2.2 + m * 0.37) % 1) + 1) % 1 < 0.62;
      if (dash) {
        if (front) wline(px, py, x, wy, 0.62 * fade, HUE.alt);
        else if (k % 2 === 0) put(x, wy * ax, 0.22 * fade, HUE.fg, DOT);
      }
      px = x;
      py = wy;
    }
  }
  for (let i = 0; i < 10; i++) {
    const u = ((((i * 0.37 + t * 0.15) % 1) + 1) % 1), h = u * H;
    const a = t * 3.4 + i * 1.9;
    put(s.cx + rad(h) * Math.cos(a), (s.cwy - h + Math.sin(a) * rad(h) * 0.22) * ax, (Math.sin(a) > 0 ? 0.6 : 0.25) * e, HUE.fg, BULLET);
  }
}

function pillar(s, t, e, dt) {
  const R = s.R * s.str;
  const k = smooth(0, 0.9, t);
  const back = 1 + 2.2 * (k - 1) * (k - 1) * k; // slight overshoot as it locks into place
  const Hc = 2.3 * R * k * Math.min(1.06, back) * (0.35 + 0.65 * Math.sqrt(e));
  const hw = 0.3 * R, base = s.cwy + 0.1 * R;
  const x0 = Math.max(0, Math.floor(s.cx - hw - 1)), x1 = Math.min(cols - 1, Math.ceil(s.cx + hw + 1));
  const y0 = Math.max(0, Math.floor((base - Hc - 0.3 * R) * ax)), y1 = Math.min(rows - 1, Math.floor(base * ax));
  for (let y = y0; y <= y1; y++) {
    const wy = y / ax;
    for (let x = x0; x <= x1; x++) {
      const q = x - s.cx;
      const topY = base - Hc + 0.12 * R * noise2(q * 0.3, 5.5);
      if (wy < topY) continue;
      const edge = hw * (1 - 0.06 * noise2(wy * 0.4, 2.2));
      if (Math.abs(q) > edge) continue;
      const i = y * cols + x;
      let v = (0.6 - 0.2 * (q / hw) + 0.14 * noise2(q * 0.45, wy * 0.3)) * (0.4 + 0.6 * e);
      let g = ROCK[v > 0.62 ? 3 : v > 0.5 ? 2 : v > 0.36 ? 1 : 0];
      const strata = (((wy - base) / (0.45 * R)) % 1 + 1) % 1;
      if (strata < 0.08) {
        v *= 0.5;
        g = G("─");
      } else if (Math.abs(noise2(q * 0.22, wy * 0.18)) < 0.05) {
        v *= 0.45;
        g = G("╱");
      }
      const cap = wy - topY < 0.9;
      if (cap) v = Math.max(v, 0.75 * e);
      V[i] = v;
      Hh[i] = cap ? HUE.main : HUE.fg;
      Gg[i] = g;
    }
  }
  if (t < 1.2 && rand() < 30 * dt) {
    const side = rand() < 0.5 ? -1 : 1;
    spawn(s, s.cx + side * hw, base - rand() * 1.5, side * (8 + rand() * 9), -(1 + rand() * 3), 0.6, DOT, HUE.fg, 0.45, 10);
  }
  if (e > 0.5 && rand() < 3 * dt) spawn(s, s.cx + (rand() - 0.5) * hw * 2, base - Hc, (rand() - 0.5) * 4, 0, 1.4, BULLET, HUE.fg, 0.55, 26);
}

/* ───────────── scene ───────────── */
export default {
  id: "sigils",
  title: "ATELIER",
  caption: "the spell waits for the ring to close",

  init(f, S) {
    cols = S.cols;
    rows = S.rows;
    ax = S.ax;
    U = Math.min(cols, rows / ax);
    rand = rng(1013);
    speed = 0.6 * U;
    seals = [];
    job = null;
    nextAt = 0;
    deck = [];
    deckI = 0;
    jobCount = 0;
    lastCast = null;
    motes = Array.from({ length: Math.round((cols * rows) / 260) }, () => ({ x: rand() * cols, y: rand() * rows, s: 0.3 + rand() * 0.7 }));
    // a floatglow already burning, and a watershot mid-draw with its ring nearly done
    const glowR = Math.max(6, 0.15 * U);
    const [gx, gy] = place(glowR);
    const g = makeSeal(SPELLS[5], gx, gy, glowR, { n: 4, longK: -1, gapAt: -0.8 });
    seals.push(g);
    const gj = makeJob([g]);
    gj.prog = gj.total;
    gj.phase = "done";
    g.closed = true;
    g.closeProg = g.close.len;
    g.castT = 1.4;
    jobCount = 1;
    deck = SPELLS.filter((s) => s.name !== "floatglow").sort(() => rand() - 0.5);
    deck.unshift(SPELLS[0]);
    job = newJob(true, true);
    const ring = job.strokes[job.strokes.length - 1];
    job.prog = job.total - ring.len * 0.28;
    lastCast = g;
  },

  frame(f, t, dt, S) {
    F = f;
    V = f.v;
    Hh = f.h;
    Gg = f.g;
    f.clear();

    for (const m of motes) {
      m.y -= m.s * dt * 1.5;
      if (m.y < 0) m.y = rows;
      put(m.x + Math.sin(t * 0.3 + m.s * 9) * 0.6, m.y, 0.08 + m.s * 0.06, HUE.fg, DOT);
    }

    if (!job && t >= nextAt) {
      job = newJob();
      if (!job) nextAt = t + 0.4;
    }
    if (job) advance(job, t, dt);
    for (const s of seals) if (s.castT >= 0) s.castT += dt;
    seals = seals.filter((s) => s.castT < DUR + 0.7);

    // pencil guides, then ink
    for (const s of seals) {
      if (s.castT >= 0) continue;
      const gv = 0.15 * smooth(0, 0.25 * speed, s.job.prog - (s.strokes[0].start - 0.07 * speed));
      const n = Math.max(24, Math.round(s.R * 3));
      for (let k = 0; k < n; k++) {
        const a = (TAU * k) / n;
        put(s.cx + Math.cos(a) * s.R, (s.cwy + Math.sin(a) * s.R) * ax, gv, HUE.fg, DOT);
      }
    }
    let nib = null;
    for (const s of seals) {
      const j = s.job;
      let v, hue, mode = 1;
      const fade = 1 - smooth(DUR - 0.6, DUR + 0.7, s.castT);
      if (s.castT >= 0) {
        if (s.castT < 0.14) {
          v = 1;
          hue = HUE.white;
        } else {
          v = (0.62 + 0.3 * Math.exp(-s.castT * 1.2) + 0.06 * Math.sin(s.castT * 6)) * fade;
          hue = HUE.main;
        }
      } else if (s.closed) {
        v = 0.82;
        hue = HUE.main;
      } else {
        v = 0.7;
        hue = HUE.hot;
        mode = j.phase === "draw" ? 0 : 1;
      }
      for (const st of s.strokes) {
        const tip = drawStroke(st, j.prog, st.thin ? v * 0.78 : v, hue, mode);
        if (tip && mode === 0 && j.prog < st.start + st.len) nib = tip;
      }
      if (s.closeProg > 0) {
        const tip = drawStroke({ ...s.close, start: 0 }, s.closeProg, v, s.closed ? hue : HUE.main, 1);
        if (!s.closed && j.phase === "close") nib = tip;
      }
      if (j.phase === "wait" && s === j.seals[0]) {
        const p = s.close.pts[0];
        nib = [p[0] + 1.2, p[1] - 1 - Math.abs(Math.sin(t * 4)) * 0.8];
      }
    }
    // link lines for linked seals
    for (const st of job ? job.strokes.filter((x) => x.link) : []) drawStroke(st, job.prog, 0.72, HUE.hot, job.phase === "draw" ? 0 : 1);
    for (const s of seals) {
      if (s.castT < 0 || !s.job.strokes.some((x) => x.link)) continue;
      for (const st of s.job.strokes) if (st.link && st.pts[0][0] > s.cx) drawStroke(st, s.job.prog, 0.75 * (1 - smooth(DUR - 0.6, DUR + 0.7, s.castT)), HUE.main, 1);
    }

    // spells
    for (const s of seals) {
      if (s.castT < 0) continue;
      const t2 = s.castT;
      const e = smooth(0, 0.35, t2) * (1 - smooth(DUR - 0.9, DUR, t2));
      const fx = s.spell.fx;
      if (fx === "jet" || fx === "flame" || fx === "beam") column(s, t2, e, fx, dt);
      else if (fx === "orb" || fx === "pyre" || fx === "glow") orb(s, t2, e, fx, dt);
      else if (fx === "whirl") whirl(s, t2, e, dt);
      else pillar(s, t2, e, dt);
      // the ring flashes as it closes
      if (t2 < 0.45) {
        const k = t2 / 0.45, rr = s.R * (1 + 0.9 * k);
        let px = s.cx + rr, py = s.cwy;
        for (let i = 1; i <= 48; i++) {
          const a = (TAU * i) / 48;
          const x = s.cx + Math.cos(a) * rr, wy = s.cwy + Math.sin(a) * rr;
          wline(px, py, x, wy, 0.95 * (1 - k), HUE.white);
          px = x;
          py = wy;
        }
      }
      for (let i = s.parts.length - 1; i >= 0; i--) {
        const p = s.parts[i];
        p.life -= dt;
        p.vy += p.grav * dt;
        p.x += p.vx * dt;
        p.wy += p.vy * dt;
        if (p.life <= 0 || (p.grav > 0 && p.wy > s.cwy + 0.2 * s.R && p.g === BULLET)) {
          if (p.g === BULLET && p.grav > 0 && p.life > 0) for (let k = 0; k < 3; k++) spawn(s, p.x, p.wy, (rand() - 0.5) * 10, -(2 + rand() * 4), 0.3, DOT, p.hue, 0.5, 30);
          s.parts.splice(i, 1);
          continue;
        }
        put(p.x, p.wy * ax, p.v * Math.min(1, (p.life / p.max) * 2), p.hue, p.g);
      }
      if (e > 0.2) {
        const name = `· ${s.spell.name} ·`;
        const y = Math.round((s.cwy + s.R) * ax) + 1;
        if (!(s.job.seals.length > 1 && s !== s.job.seals[1])) label(s.cx - name.length / 2, y, name, HUE.fg, 0.42 * e);
      }
    }

    if (nib) put(nib[0], nib[1] * ax, 1, HUE.white, NIB);

    // HUD
    const hx = 1;
    label(hx, 0, "atelier · conjuring ink", HUE.fg, 0.35);
    if (job) {
      const s0 = job.seals[0];
      const head = job.seals.length > 1
        ? `linked ×${job.seals.length} · ${s0.spell.name} seals`
        : `${s0.spell.name} seal · sigil: ${s0.spell.sigil} · signs: ${SIGN_DESC[s0.spell.sign]} ×${s0.n}`;
      label(hx, 1, head, HUE.fg, 0.45);
      const total = job.strokes.length;
      const done = job.strokes.filter((st) => job.prog >= st.start).length;
      const status = job.phase === "draw" ? `stroke ${done}/${total}` : job.phase === "wait" ? "ring open..." : "closing the ring...";
      label(hx, 2, status, job.phase === "draw" ? HUE.fg : HUE.main, 0.5);
    }
    if (lastCast && lastCast.castT >= 0 && lastCast.castT < DUR) {
      const l = lastCast;
      const msg = l.veer
        ? "unbalanced! one column sign drawn too long"
        : l.job.seals.length > 1
          ? `linked ×${l.job.seals.length} · ring closed → cast, boosted`
          : `ring closed → ${l.spell.name}`;
      label(hx, 3, msg, l.veer ? HUE.hot : HUE.main, 0.6);
    }
  },
};
