// Kupibilet — travel by plane: a night widebody cruising over a city through cloud decks,
// contrails, nav lights, plus a split-flap departures board and a route map.
import { HUE, clamp, smooth, lerp, noise2, fbm2, hash2, rng, G } from "../engine/util.js";

/* ── airliner geometry, local units: length 1, nose at +0.5, y up ── */
const FUSE = [
  [0.4, 0.055], [0.445, 0.047], [0.475, 0.033], [0.494, 0.013], [0.5, -0.008], [0.492, -0.027], [0.465, -0.043],
  [0.42, -0.053], [-0.16, -0.053], [-0.28, -0.042], [-0.4, -0.016], [-0.475, 0.012], [-0.49, 0.036], [-0.44, 0.052], [-0.3, 0.056],
];
const FIN = [[-0.3, 0.054], [-0.43, 0.27], [-0.488, 0.27], [-0.475, 0.03]];
const WING_NEAR = [[0.1, -0.046], [-0.1, -0.046], [-0.275, -0.29], [-0.215, -0.29]];
const WINGLET = [[-0.215, -0.29], [-0.275, -0.29], [-0.29, -0.245], [-0.27, -0.245]];
const WING_FAR = [[0.04, 0.05], [-0.1, 0.05], [-0.2, 0.14], [-0.165, 0.14]];
const STAB_NEAR = [[-0.37, -0.012], [-0.44, -0.008], [-0.52, -0.085], [-0.485, -0.085]];
const STAB_FAR = [[-0.4, 0.04], [-0.45, 0.042], [-0.51, 0.085], [-0.49, 0.085]];
const PYLON = [[0.03, -0.06], [-0.04, -0.06], [-0.05, -0.085], [0.04, -0.09]];
const ENG = { x0: 0.085, x1: -0.065, cy: -0.112, r: 0.032 };

const AIRPORTS = ["LED", "CDG", "SVO", "IST", "DXB", "KZN", "BCN", "HND", "JFK", "LIS", "AMS", "TBS", "EVN", "BKK", "ICN", "MUC"];
const AIRLINES = ["SU", "AF", "TK", "EK", "JL", "LH", "KL", "QR", "BA", "AY"];
const STATUSES = [
  ["ON TIME", HUE.alt],
  ["BOARDING", HUE.main],
  ["GATE 12", HUE.main],
  ["DELAYED", HUE.hot],
  ["FINAL CALL", HUE.hot],
  ["DEPARTED", HUE.fg],
];
const FLAP = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:→-";

let S0, L, pcx0, pcy0, hy, rand, trail, board, boardT, clock, routeT, portrait, compact;

const e7 = (k) => ((k * 0.618034) % 1 + 1) % 1;

/* ── transforms ── */
let pcx, pcy, rot;
function T(lx, ly) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const x = lx * c - ly * s, y = lx * s + ly * c;
  return [pcx + x * L, pcy - y * L * S0.ax];
}
function Ti(cx, cy) {
  const X = (cx - pcx) / L, Y = -(cy - pcy) / (L * S0.ax);
  const c = Math.cos(-rot), s = Math.sin(-rot);
  return [X * c - Y * s, X * s + Y * c];
}

/** scanline fill of an arbitrary polygon (local coords); shade(lx, ly) → [v, hue, glyph] | null */
function fillPoly(f, local, shade) {
  const pts = local.map(([x, y]) => T(x, y));
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const { cols, rows } = S0;
  for (let y = Math.max(0, Math.ceil(minY - 0.5)); y <= Math.min(rows - 1, Math.floor(maxY + 0.5)); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.max(0, Math.round(xs[k])); x <= Math.min(cols - 1, Math.round(xs[k + 1])); x++) {
        const [lx, ly] = Ti(x, y);
        const r = shade(lx, ly, x, y);
        if (r) f.set(x, y, r[0], r[1], r[2]);
      }
    }
  }
}

const BLOCKS = ["░", "▒", "▓", "█"].map(G);
const block = (v) => BLOCKS[v > 0.62 ? 3 : v > 0.44 ? 2 : v > 0.26 ? 1 : 0];

/* ── departures board ── */
function newFlight() {
  const a = AIRPORTS[(rand() * AIRPORTS.length) | 0];
  let b = a;
  while (b === a) b = AIRPORTS[(rand() * AIRPORTS.length) | 0];
  const from = rand() < 0.45 ? "LED" : a;
  if (b === from) b = "CDG";
  clock += 5 + ((rand() * 4) | 0) * 5;
  const hh = String(Math.floor(clock / 60) % 24).padStart(2, "0"), mm = String(clock % 60).padStart(2, "0");
  const st = STATUSES[(rand() * 5) | 0];
  return {
    flt: AIRLINES[(rand() * AIRLINES.length) | 0] + String(100 + ((rand() * 8900) | 0)),
    route: `${from}→${b}`,
    time: `${hh}:${mm}`,
    st: st[0],
    stHue: st[1],
  };
}
function rowText(fl) {
  const status = fl.st.padEnd(10).slice(0, compact ? 8 : 10);
  return compact ? `${fl.route} ${fl.time} ${status}` : `${fl.flt.padEnd(6)} ${fl.route} ${fl.time} ${status}`;
}
function setTargets() {
  board.rows.forEach((fl, r) => {
    const txt = rowText(fl);
    const cells = board.cells[r];
    for (let c = 0; c < txt.length; c++) {
      if (cells[c].target !== txt[c]) {
        cells[c].target = txt[c];
        cells[c].delay = c * 0.025 + rand() * 0.15;
      }
    }
  });
}
function initBoard() {
  board = { rows: [], cells: [] };
  clock = 14 * 60 + 5;
  const n = S0.rows < 40 ? 3 : 5;
  for (let r = 0; r < n; r++) board.rows.push(newFlight());
  board.rows[0].st = "BOARDING";
  board.rows[0].stHue = HUE.main;
  board.rows[0].route = "LED→CDG";
  const w = rowText(board.rows[0]).length;
  for (let r = 0; r < n; r++) {
    board.cells.push(Array.from({ length: w }, () => ({ cur: " ", target: " ", delay: 0, acc: 0 })));
  }
  setTargets();
  boardT = 0;
}
function stepBoard(dt) {
  boardT += dt;
  if (boardT > 3.4) {
    boardT = 0;
    if (rand() < 0.4) {
      board.rows.shift();
      board.rows.push(newFlight());
    } else {
      const r = (rand() * board.rows.length) | 0;
      const st = STATUSES[(rand() * STATUSES.length) | 0];
      board.rows[r].st = st[0];
      board.rows[r].stHue = st[1];
    }
    setTargets();
  }
  for (const row of board.cells) {
    for (const c of row) {
      if (c.cur === c.target) continue;
      if (c.delay > 0) {
        c.delay -= dt;
        continue;
      }
      c.acc += dt;
      while (c.acc > 0.035 && c.cur !== c.target) {
        c.acc -= 0.035;
        const i = FLAP.indexOf(c.cur);
        c.cur = FLAP[(i + 1) % FLAP.length];
        if (FLAP.indexOf(c.target) < 0) c.cur = c.target;
      }
    }
  }
}
function drawBoard(f, t) {
  const w = board.cells[0].length;
  const bw = w + 4, bh = board.rows.length + 4;
  const x0 = portrait ? Math.max(1, Math.floor((S0.cols - bw) / 2)) : 2, y0 = 1;
  for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) f.set(x, y, 0);
  f.box(x0, y0, bw, bh, HUE.alt, 0.6);
  const head = compact ? "DEPARTURES" : "DEPARTURES ▶ LED";
  f.text(x0 + 2, y0 + 1, head, HUE.main, 0.95);
  const now = `${String(14 + Math.floor((t / 60) % 10)).padStart(2, "0")}:${String(Math.floor(t) % 60).padStart(2, "0")}`;
  if (!compact) f.text(x0 + bw - 2 - now.length, y0 + 1, now, HUE.white, 0.7);
  for (let x = x0 + 1; x < x0 + bw - 1; x++) f.set(x, y0 + 2, 0.3, HUE.alt, G("─"));
  const stCol = compact ? 14 : 21;
  board.cells.forEach((row, r) => {
    const fl = board.rows[r];
    const blink = (fl.st === "BOARDING" || fl.st === "FINAL CALL") && Math.sin(t * 5) < -0.2;
    row.forEach((c, k) => {
      if (c.cur === " ") return;
      const flipping = c.cur !== c.target;
      let hue = HUE.fg, v = 0.85;
      if (flipping) {
        hue = HUE.fg;
        v = 0.55;
      } else if (k >= stCol) {
        hue = fl.stHue;
        v = blink ? 0.45 : 0.95;
      } else if (k >= stCol - 6) hue = HUE.main;
      else hue = HUE.white;
      f.set(x0 + 2 + k, y0 + 3 + r, v, hue, G(c.cur));
    });
  });
}

/* ── route map ── */
function drawRoute(f, t) {
  const { cols, rows } = S0;
  const w = 36, h = 11;
  const x0 = cols - w - 2, y0 = rows - h - 2;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) f.set(x, y, 0);
  f.box(x0, y0, w, h, HUE.fg, 0.4);
  f.text(x0 + 2, y0, " ROUTE ", HUE.main, 0.8);
  const ax0 = x0 + 5, ay0 = y0 + h - 3, bx0 = x0 + w - 6, by0 = y0 + 4;
  const p = ((t * 0.06) % 1 + 1) % 1;
  let px = ax0, py = ay0;
  for (let k = 0; k <= 60; k++) {
    const u = k / 60;
    const x = lerp(ax0, bx0, u), y = lerp(ay0, by0, u) - Math.sin(u * Math.PI) * 3.5;
    if (u <= p) f.plot(x, y, 0.75, HUE.main, G("·"));
    else if (k % 3 === 0) f.plot(x, y, 0.3, HUE.fg, G("·"));
    if (Math.abs(u - p) < 1 / 120) {
      px = x;
      py = y;
    }
  }
  f.set(ax0, ay0, 1, HUE.alt, G("◉"));
  f.set(bx0, by0, 1, HUE.alt, G("◉"));
  f.text(ax0 - 3, ay0 + 1, "LED", HUE.fg, 0.7);
  f.text(bx0 - 1, by0 - 1, "CDG", HUE.fg, 0.7);
  f.set(px, py, 1, HUE.white, G("▶"));
  const left = Math.round((1 - p) * 212);
  f.text(x0 + 2, y0 + h - 1, ` ETA ${Math.floor(left / 60)}h${String(left % 60).padStart(2, "0")} · FL380 `, HUE.fg, 0.55);
}

export default {
  id: "flight",
  title: "RED_EYE_TO_PARIS",
  caption: "LED → CDG · somewhere above the clouds",

  init(f, S) {
    S0 = S;
    rand = rng(380);
    const physW = S.cols, physH = S.rows / S.ax;
    portrait = physH > physW * 1.1;
    compact = S.cols < 46 || S.rows < 40;
    if (portrait) {
      L = Math.min(physW * 0.96, physH * 0.62);
      pcx0 = S.cols * 0.5;
      pcy0 = Math.max(S.rows * 0.4, 12 + L * S.ax * 0.3);
      hy = Math.max(S.rows * 0.8, pcy0 + L * S.ax * 0.36);
    } else {
      L = Math.min(physW * 0.56, physH * 1.45);
      pcx0 = S.cols * (S.cols > 140 ? 0.5 : 0.56);
      pcy0 = S.rows * 0.46;
      hy = S.rows * 0.76;
    }
    trail = [];
    initBoard();
    routeT = 0;
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gg = f.g;
    const speed = 30 + L * 0.25; // world scroll, cells/s

    const intro = 1 - Math.pow(1 - smooth(0, 1.8, t), 3);
    pcx = pcx0 - (1 - intro) * cols * 0.9;
    pcy = pcy0 + Math.sin(t * 0.7) * 0.7;
    rot = 0.018 * Math.sin(t * 0.45) + 0.01;

    // ── background: sky, stars, horizon glow, city lights, cloud decks ──
    const bankTop = hy - rows * 0.09, deckTop = pcy + L * ax * 0.32;
    for (let y = 0, i = 0; y < rows; y++) {
      const above = y < hy;
      for (let x = 0; x < cols; x++, i++) {
        let v = 0, hue = HUE.fg, g = -1;
        if (above) {
          const k = y / hy;
          const glow = smooth(0.82, 1, k);
          v = glow * glow * (0.12 + 0.12 * (noise2(x * 0.05 + t * 0.02, y * 0.3) * 0.5 + 0.5));
          hue = k > 0.95 ? HUE.hot : HUE.main;
          if (v < 0.04) v = 0;
          const st = hash2(x, y);
          if (st > 0.993 && k < 0.75) {
            v = 0.18 + (st - 0.993) * 60 * (0.6 + 0.4 * Math.sin(t * 2 + st * 500));
            hue = HUE.fg;
            g = st > 0.9988 ? G("•") : G("·");
          }
        } else {
          const dz = y - hy + 0.5;
          const z = (rows * 0.9) / dz;
          const wx = (x - cols / 2) * z * 0.02 + t * speed * 0.004 * 3;
          const wz = z * 0.6;
          const ix = Math.floor(wx * 3), iz = Math.floor(wz * 3);
          const street = Math.abs(((wx * 3) % 4) + 4) % 4 < 0.35 || Math.abs(((wz * 3) % 5) + 5) % 5 < 0.3;
          const hsh = hash2(ix, iz);
          const fade = 1 / (1 + z * 0.08);
          if (street && hsh > 0.35) {
            v = (0.25 + 0.55 * hsh) * fade;
            hue = hsh > 0.85 ? HUE.white : HUE.main;
            g = G("·");
          } else if (hsh > 0.93) {
            v = (0.3 + 0.6 * (hsh - 0.93) * 14) * fade * (0.7 + 0.3 * Math.sin(t * 3 + hsh * 99));
            hue = hsh > 0.985 ? HUE.hot : HUE.main;
            g = hsh > 0.975 ? G("•") : G("·");
          }
          const haze = 0.18 * (1 - smooth(0, 6, dz));
          if (haze > v) {
            v = haze;
            hue = HUE.hot;
            g = -1;
          }
        }
        // far cloud bank on the horizon
        if (y > bankTop && y < hy + 2) {
          const n = fbm2(x * 0.018 + t * 0.03, y * 0.22, 2) + 0.25 - Math.abs(y - (hy - rows * 0.035)) / (rows * 0.07);
          if (n > 0.12) {
            v = Math.min(0.42, 0.14 + (n - 0.12) * 0.7);
            hue = y > hy - 2 ? HUE.hot : HUE.fg;
            g = n > 0.3 ? G("▒") : G("░");
          }
        }
        // mid deck between plane and ground, lit from below by the city
        if (y > deckTop && y < hy - 1) {
          const n = fbm2(x * 0.03 + t * 0.11, y * 0.17 + 3, 2) - 0.08;
          if (n > 0.05) {
            const under = smooth(0, 0.3, n) * (0.5 + 0.5 * smooth(deckTop, hy, y));
            v = 0.14 + 0.3 * under;
            hue = n > 0.2 ? HUE.fg : HUE.hot;
            g = n > 0.2 ? G("▒") : G("░");
          }
        }
        V[i] = v;
        H[i] = hue;
        Gg[i] = g;
      }
    }

    // ── contrails (behind the plane): one streak per engine, widening with age ──
    const emitters = [
      [ENG.x1 - 0.02, ENG.cy, 1],
      [ENG.x1 + 0.03, ENG.cy + 0.045, 0.5],
    ];
    emitters.forEach(([ex, ey, a], e) => {
      const [cx, cy] = T(ex, ey);
      const tr = trail[e] || (trail[e] = []);
      tr.push({ x: cx, y: cy, age: 0, a });
    });
    for (const tr of trail) {
      for (const p of tr) {
        p.age += dt;
        p.x -= speed * dt;
        p.y += Math.sin(p.age * 1.1 + p.a * 9) * dt * 0.35;
      }
      while (tr.length && (tr[0].x < -4 || tr[0].age > 7)) tr.shift();
      for (let k = tr.length - 1; k > 0; k--) {
        const p = tr[k], q = tr[k - 1];
        const form = smooth(0.03, 0.25, p.age);
        const v = p.a * form * 0.8 * (1 - p.age / 7);
        if (v < 0.04) continue;
        f.line(p.x, p.y, q.x, q.y, v, HUE.white, G("─"));
        const spread = p.age * 0.55;
        if (spread > 0.7) {
          const j = ((q.x * 0.37 + e7(k)) % 1) * spread;
          f.plot(q.x, q.y - j * 0.6, v * 0.4, HUE.white, G("·"));
          f.plot(q.x, q.y + (spread - j) * 0.6, v * 0.4, HUE.white, G("·"));
        }
      }
    }

    // ── the airliner ──
    const night = (lx, ly) => {
      // fuselage: white body, cylinder shading lit from above
      const u = clamp((ly + 0.053) / 0.108);
      const shade = 0.22 + 0.5 * Math.pow(Math.sin(u * Math.PI * 0.92 + 0.12), 0.7) * (0.55 + 0.45 * u);
      return shade;
    };
    fillPoly(f, WING_FAR, () => [0.16, HUE.fg, BLOCKS[0]]);
    fillPoly(f, STAB_FAR, () => [0.18, HUE.fg, BLOCKS[0]]);
    fillPoly(f, FUSE, (lx, ly) => {
      const v = night(lx, ly);
      const u = clamp((ly + 0.053) / 0.108);
      if (u < 0.28) return [v * 0.75, HUE.alt, block(v * 0.75)];
      return [v, HUE.fg, block(v)];
    });
    // cheatline + window row + doors + cockpit
    const [, wy] = T(0, 0.012);
    const [, cy] = T(0, -0.012);
    const [wxs] = T(-0.33, 0), [wxe] = T(0.37, 0);
    const step = L > 70 ? 2 : 3;
    for (let x = Math.ceil(wxs); x <= wxe; x++) {
      const [lx] = Ti(x, wy);
      const [, yW] = T(lx, 0.014), [, yC] = T(lx, -0.012);
      if (L >= 60) f.set(x, yC, 0.85, HUE.main, G("▄"));
      if (x % step === 0) {
        const lit = hash2(x, 7) > 0.18;
        f.set(x, yW, lit ? 0.95 : 0.25, lit ? HUE.main : HUE.fg, G("▪"));
      }
    }
    fillPoly(f, [[0.475, 0.034], [0.44, 0.047], [0.425, 0.03], [0.47, 0.022]], () => [0.9, HUE.alt, G("▀")]);
    // tail fin with livery
    fillPoly(f, FIN, (lx, ly) => {
      const stripe = Math.abs(ly - 0.1 - (lx + 0.43) * 1.6) < 0.025;
      if (stripe) return [0.9, HUE.hot, G("█")];
      const logoLit = 0.38 + 0.24 * smooth(0.27, 0.06, ly);
      return [logoLit, HUE.main, block(logoLit)];
    });
    {
      const [lx, ly] = T(-0.445, 0.18);
      f.set(lx, ly, 1, HUE.white, G("◢"));
    }
    fillPoly(f, STAB_NEAR, (lx, ly) => [0.36 + ly * 1.2, HUE.fg, block(0.36 + ly * 1.2)]);
    // near wing: underside, leading-edge highlight
    fillPoly(f, WING_NEAR, (lx, ly) => {
      const span = clamp((-0.046 - ly) / 0.244);
      const le = lerp(0.1, -0.215, span);
      const v = 0.3 + 0.14 * (1 - span) - (le - lx) * 0.6;
      return [v, HUE.fg, block(v)];
    });
    {
      const [x0, y0] = T(0.1, -0.046), [x1, y1] = T(-0.215, -0.29);
      f.line(x0, y0, x1, y1, 0.9, HUE.white, G("/"));
      const [x2, y2] = T(-0.1, -0.046), [x3, y3] = T(-0.275, -0.29);
      f.line(x2, y2, x3, y3, 0.35, HUE.fg, G("/"));
    }
    fillPoly(f, WINGLET, () => [0.5, HUE.main, BLOCKS[2]]);
    fillPoly(f, PYLON, () => [0.3, HUE.fg, BLOCKS[1]]);
    // engine nacelle + spinning fan
    fillPoly(
      f,
      [[ENG.x0, ENG.cy + ENG.r], [ENG.x1 + 0.02, ENG.cy + ENG.r * 0.8], [ENG.x1, ENG.cy], [ENG.x1 + 0.02, ENG.cy - ENG.r * 0.8], [ENG.x0, ENG.cy - ENG.r]],
      (lx, ly) => {
        const u = (ly - ENG.cy) / ENG.r;
        if (lx > ENG.x0 - 0.014) {
          const a = Math.atan2(u, (lx - ENG.x0 + 0.007) / 0.007);
          const blade = Math.sin(a * 7 + t * 40) > 0;
          return Math.abs(u) > 0.78 ? [0.85, HUE.alt, G("█")] : [blade ? 0.55 : 0.2, HUE.fg, blade ? G("▓") : G("░")];
        }
        const v = 0.25 + 0.4 * (1 - Math.abs(u - 0.35));
        return [v, HUE.fg, block(v)];
      }
    );
    {
      // exhaust shimmer
      const [ex, ey] = T(ENG.x1, ENG.cy);
      for (let k = 1; k < 5; k++) f.plot(ex - k, ey + Math.sin(t * 20 + k) * 0.4, 0.35 - k * 0.06, HUE.alt, G("~"));
    }

    // ── lights ──
    const strobe = (t % 1.3 < 0.06) || (t % 1.3 > 0.14 && t % 1.3 < 0.2);
    const beacon = Math.sin(t * 6.3) > 0.55;
    const light = (lx, ly, v, hue, g, glow) => {
      const [x, y] = T(lx, ly);
      f.set(x, y, v, hue, G(g));
      if (glow) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) f.plot(x + dx, y + dy, glow, hue, G("·"));
    };
    light(-0.245, -0.292, 1, HUE.hot, "●", 0.4);
    light(-0.18, 0.142, 0.95, HUE.alt, "●", 0.3);
    if (strobe) {
      light(-0.255, -0.3, 1, HUE.white, "*", 0.9);
      light(-0.49, 0.03, 1, HUE.white, "*", 0.8);
      light(-0.19, 0.15, 1, HUE.white, "*", 0.7);
    }
    if (beacon) {
      light(0.0, 0.062, 1, HUE.hot, "▲", 0.5);
      light(0.06, -0.06, 1, HUE.hot, "▼", 0.5);
    }

    // ── near cloud wisps sliding past in front ──
    const env = smooth(0.45, 0.8, noise2(t * 0.09, 4.2) * 0.5 + 0.5);
    if (env > 0.02) {
      const yA = Math.floor(pcy - L * ax * 0.32), yB = Math.ceil(pcy + L * ax * 0.25);
      for (let y = Math.max(0, yA); y < Math.min(rows, yB); y++) {
        for (let x = 0; x < cols; x++) {
          const n = fbm2(x * 0.022 + t * 0.55, y * 0.14 + 9, 2) * env - 0.3;
          if (n > 0) {
            const i = y * cols + x;
            const v = 0.16 + n * 0.9;
            if (v > V[i] * 0.6 || n > 0.12) {
              V[i] = Math.min(0.5, v);
              H[i] = HUE.fg;
              Gg[i] = n > 0.1 ? G("▒") : G("░");
            }
          }
        }
      }
    }

    // ── board + route map ──
    stepBoard(dt);
    drawBoard(f, t);
    if (!portrait && cols >= 140 && rows >= 40) drawRoute(f, t);
    else if (rows >= 60) {
      const msg = "FL380 · 902 km/h · -54°C";
      f.text(Math.max(1, Math.floor((cols - msg.length) / 2)), rows - 3, msg, HUE.fg, 0.5);
    }
  },
};
