// Studybay — an education startup: a neural jack streams knowledge packages into a brain.
import { HUE, clamp, smooth, lerp, noise2, fbm2, rng, G, slopeGlyph } from "../engine/util.js";

const PKGS = [
  { name: "calculus.pkg", words: ["CALCULUS", "dy/dx", "LIMIT", "INTEGRAL", "Σ a_n", "TAYLOR"], region: [0.22, -0.45] },
  { name: "physics.pkg", words: ["PHYSICS", "F=ma", "E=mc2", "QUANTUM", "ENTROPY", "λ"], region: [-0.08, -0.5] },
  { name: "linguistics.pkg", words: ["LINGUISTICS", "SYNTAX", "MORPHEME", "PHONEME", "SEMANTICS"], region: [-0.52, 0.06] },
  { name: "history.pkg", words: ["HISTORY", "1066", "ROME", "1789", "DYNASTY", "EMPIRE"], region: [0.02, 0.3] },
  { name: "chemistry.pkg", words: ["CHEM", "C8H10N4O2", "H2O", "MOLE", "REDOX", "pH 7"], region: [-0.62, -0.24] },
  { name: "sql.pkg", words: ["SQL", "SELECT *", "JOIN", "INDEX", "GROUP BY"], region: [0.72, -0.12] },
  { name: "typescript.pkg", words: ["TYPESCRIPT", "GENERICS", "infer T", "keyof", "never"], region: [-0.36, -0.48] },
];
const KUNGFU = { name: "kung-fu.pkg", words: ["KUNG FU", "WING CHUN", "STANCE", "BLOCK", "STRIKE"], region: [0.6, 0.5], egg: true };
const NEED = 9; // word packets per package

let S0, R, bx, by, bbox, base, baseH, baseG, mask, fold, heat, learned, eeg;
let traces, packets, sparks, rand, chip, state, hudY, wordAcc, bitAcc;

/* ── shape: union of ellipses + brain stem capsule, local units (y down) ── */
function sdEllipse(px, py, cx, cy, rx, ry) {
  const dx = (px - cx) / rx, dy = (py - cy) / ry;
  return (Math.sqrt(dx * dx + dy * dy) - 1) * Math.min(rx, ry);
}
function smin(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k);
  return lerp(b, a, h) - k * h * (1 - h);
}
function sdCerebrum(px, py) {
  let d = sdEllipse(px, py, 0.02, -0.04, 0.98, 0.66);
  d = smin(d, sdEllipse(px, py, -0.48, 0.04, 0.52, 0.5), 0.12);
  d = smin(d, sdEllipse(px, py, -0.08, 0.32, 0.6, 0.29), 0.1);
  d = smin(d, sdEllipse(px, py, 0.6, 0.06, 0.42, 0.46), 0.12);
  return d;
}
const sdCerebellum = (px, py) => sdEllipse(px, py, 0.58, 0.5, 0.36, 0.21);
function sdStem(px, py) {
  const ax = 0.32, ay = 0.46, bx2 = 0.44, by2 = 1.12;
  const vx = bx2 - ax, vy = by2 - ay;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t) - lerp(0.11, 0.08, t);
}
function distPoly(px, py, pts) {
  let best = 1e9;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const vx = x1 - x0, vy = y1 - y0;
    const t = clamp(((px - x0) * vx + (py - y0) * vy) / (vx * vx + vy * vy));
    best = Math.min(best, Math.hypot(px - x0 - vx * t, py - y0 - vy * t));
  }
  return best;
}
const LATERAL = [[-0.56, 0.2], [-0.25, 0.12], [0.05, 0.09], [0.42, -0.03]];
const CENTRAL = [[0.1, -0.68], [0.03, -0.42], [-0.04, -0.2], [-0.12, 0.06]];

const toCell = (lx, ly) => [bx + lx * R, by + ly * R * S0.ax];

function buildBrain() {
  const { cols, rows, ax } = S0;
  const n = cols * rows;
  base = new Float32Array(n);
  baseH = new Uint8Array(n);
  baseG = new Int16Array(n).fill(-1);
  mask = new Uint8Array(n);
  fold = new Float32Array(n);
  heat = new Float32Array(n);
  learned = new Float32Array(n);
  const freq = clamp(R / 12, 2.0, 5.5);
  const x0 = Math.max(0, Math.floor(bx - R * 1.05)), x1 = Math.min(cols - 1, Math.ceil(bx + R * 1.05));
  const y0 = Math.max(0, Math.floor(by - R * ax * 0.75)), y1 = Math.min(rows - 1, Math.ceil(by + R * ax * 1.16));
  bbox = [x0, y0, x1, y1];
  const edgeW = 1.1 / R; // ~1 cell outline
  const outline = (i, sd, px, py) => {
    const e = 0.5 / R;
    const gx = sd(px + e, py) - sd(px - e, py), gy = sd(px, py + e) - sd(px, py - e);
    baseG[i] = slopeGlyph(-gy, gx * ax, ax);
  };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = (x - bx) / R, py = (y - by) / (R * ax);
      const i = y * cols + x;
      const dC = sdCerebrum(px, py);
      if (dC < 0) {
        mask[i] = 1;
        const qx = px * freq, qy = py * freq * 1.15;
        const wx = fbm2(qx * 0.6 + 1.7, qy * 0.6 + 9.2, 2), wy = fbm2(qx * 0.6 + 8.3, qy * 0.6 + 2.8, 2);
        const nz = noise2(qx + wx * 1.8, qy + wy * 1.8);
        const an = Math.abs(nz);
        let fb = an < 0.07 ? 0 : smooth(0.07, 0.38, an);
        const groove = Math.min(distPoly(px, py, LATERAL), distPoly(px, py, CENTRAL) * 1.3);
        if (groove < 0.04) fb = 0;
        const rim = smooth(0, 0.25, -dC);
        const light = 0.62 + 0.38 * clamp(-px * 0.35 - py * 0.8 + 0.15, -1, 1);
        fold[i] = fb;
        // each gyrus reads as a rounded tube: bright crest, darker flanks
        const crest = fb * (0.55 + 0.45 * Math.sin(clamp((an - 0.07) / 0.5) * Math.PI * 0.5));
        const v = (0.1 + 0.55 * crest) * light * (0.5 + 0.5 * rim);
        if (-dC < edgeW) {
          base[i] = 0.62;
          outline(i, sdCerebrum, px, py);
          baseH[i] = HUE.alt;
        } else {
          base[i] = fb === 0 ? 0.035 : v;
          baseH[i] = v > 0.42 ? HUE.alt : HUE.fg;
        }
        continue;
        continue;
      }
      const dB = sdCerebellum(px, py);
      if (dB < 0) {
        mask[i] = 2;
        const stripe = Math.abs(Math.sin((py - 0.5) * 46 + px * 7 + noise2(px * 6, py * 6) * 2));
        fold[i] = stripe;
        base[i] = -dB < edgeW ? 0.55 : 0.1 + 0.3 * stripe * (0.6 + 0.4 * smooth(0, 0.15, -dB));
        if (-dB < edgeW) outline(i, sdCerebellum, px, py);
        baseH[i] = HUE.alt;
        continue;
      }
      const dS = sdStem(px, py);
      if (dS < 0) {
        mask[i] = 3;
        fold[i] = 0.5;
        base[i] = -dS < edgeW ? 0.45 : 0.1 + 0.1 * Math.abs(Math.sin(px * 40));
        if (-dS < edgeW) outline(i, sdStem, px, py);
        baseH[i] = HUE.fg;
      }
    }
  }
}

/* ── chip + orthogonal bus traces into the brain stem ── */
function buildBus() {
  const { cols, rows, ax } = S0;
  const portrait = rows / ax > cols * 1.1;
  const w = Math.round(clamp(cols * (portrait ? 0.36 : 0.13), 14, 44));
  let h = Math.max(6, Math.round(w * 0.36));
  const n = clamp(Math.round(w / 5), 3, 7);
  traces = [];
  if (portrait) {
    const [sx, sy] = toCell(0.43, 1.1);
    const cx = clamp(Math.round(sx - w / 2), 2, cols - w - 2);
    const cy = clamp(Math.round(sy + n + 5), 2, rows - h - 6);
    chip = { x: cx, y: cy, w, h };
    for (let k = 0; k < n; k++) {
      const pts = [];
      const lane = k - (n - 1) / 2;
      const ex = Math.round(sx + lane), ey = Math.round(sy - 1);
      const px0 = Math.round(cx + ((k + 0.5) / n) * w), py0 = cy - 1;
      // outer lanes turn closer to the stem so traces never cross
      const bend = Math.round(lerp(py0 - 2, ey + 2, 0.15 + (0.7 * Math.abs(lane)) / Math.max(1, (n - 1) / 2)));
      walk(pts, px0, py0, px0, bend);
      walk(pts, px0, bend, ex, bend);
      walk(pts, ex, bend, ex, ey);
      traces.push(pts);
    }
    hudY = Math.min(rows - 4, cy + h + 2);
    return;
  }
  // landscape: chip to the left, bus fans into the side of the brain stem
  const [ex, eyc] = toCell(0.3, 0.8);
  h = Math.min(h, Math.max(5, rows - 6 - 3));
  const cx = clamp(Math.round(bx - R * 1.08 - w - 3), 2, cols - w - 2);
  const cy = clamp(Math.round(eyc - h / 2), 2, rows - h - 5);
  chip = { x: cx, y: cy, w, h };
  for (let k = 0; k < n; k++) {
    const pts = [];
    const lane = k - (n - 1) / 2;
    const px0 = cx + w, py0 = Math.round(cy + ((k + 0.5) / n) * h);
    const ey = Math.round(eyc + lane);
    const gap = Math.max(4, Math.round(ex) - px0 - 2);
    const jog = Math.round(px0 + 2 + gap * (0.85 - (0.6 * Math.abs(lane)) / Math.max(1, (n - 1) / 2)));
    walk(pts, px0, py0, jog, py0);
    walk(pts, jog, py0, jog, ey);
    walk(pts, jog, ey, Math.round(ex), ey);
    traces.push(pts);
  }
  hudY = rows - 4;
}
function walk(pts, x0, y0, x1, y1) {
  const dx = Math.sign(x1 - x0), dy = Math.sign(y1 - y0);
  let x = x0, y = y0;
  const push = () => {
    const last = pts[pts.length - 1];
    if (!last || last[0] !== x || last[1] !== y) pts.push([x, y]);
  };
  push();
  while (x !== x1 || y !== y1) {
    if (x !== x1) x += dx;
    else y += dy;
    push();
  }
}
function traceGlyph(pts, k) {
  const p = pts[k], a = pts[k - 1] || p, b = pts[k + 1] || p;
  const h = a[1] === p[1] && b[1] === p[1];
  const v = a[0] === p[0] && b[0] === p[0];
  if (h) return G("─");
  if (v) return G("│");
  // corner: which neighbours?
  const nx = (a[0] !== p[0] ? a[0] : b[0]) - p[0];
  const ny = (a[1] !== p[1] ? a[1] : b[1]) - p[1];
  if (nx > 0 && ny < 0) return G("└");
  if (nx > 0 && ny > 0) return G("┌");
  if (nx < 0 && ny < 0) return G("┘");
  return G("┐");
}

function newState(t) {
  const n = (state?.count ?? -1) + 1;
  const pkg = n > 0 && n % 5 === 4 ? KUNGFU : PKGS[(n - (n > 4 ? Math.floor(n / 5) : 0)) % PKGS.length];
  return { count: n, pkg, arrived: 0, phase: "dl", t0: t, rate: 11 + rand() * 4 };
}

export default {
  id: "brain",
  title: "NEURAL_DOWNLOAD",
  caption: "knowledge, streamed straight to the cortex",

  init(f, S) {
    S0 = S;
    rand = rng(1984);
    const physW = S.cols, physH = S.rows / S.ax;
    if (physH > physW * 1.1) {
      R = Math.min(physW * 0.44, physH * 0.3);
      bx = S.cols * 0.5;
      by = 4 + R * 0.74 * S.ax;
    } else {
      R = Math.min(physW * 0.22, physH * 0.38);
      bx = S.cols * 0.62;
      by = (physH * 0.42 - 2) * S.ax;
    }
    buildBrain();
    buildBus();
    packets = [];
    sparks = [];
    state = null;
    state = newState(0);
    wordAcc = 0;
    bitAcc = 0;
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gg = f.g;
    f.clear();

    // faint circuit dot grid
    for (let y = 1; y < rows; y += 4) for (let x = (y >> 2) % 2 ? 3 : 0; x < cols; x += 6) f.set(x, y, 0.07, HUE.alt, G("·"));

    // ── download state machine ──
    const pkg = state.pkg;
    if (state.phase === "dl") {
      wordAcc += dt * 2.6;
      while (wordAcc > 1) {
        wordAcc--;
        const tr = (rand() * traces.length) | 0;
        packets.push({ tr, s: 0, text: pkg.words[(rand() * pkg.words.length) | 0], word: true, sp: 22 + rand() * 10 });
      }
    }
    bitAcc += dt * 9;
    while (bitAcc > 1) {
      bitAcc--;
      const tr = (rand() * traces.length) | 0;
      let bits = "";
      const len = 3 + ((rand() * 5) | 0);
      for (let k = 0; k < len; k++) bits += rand() < 0.5 ? "0" : "1";
      packets.push({ tr, s: 0, text: bits, word: false, sp: 30 + rand() * 18 });
    }
    if (state.phase === "done" && t - state.t1 > 1.8) state = newState(t);

    // ── packets along traces ──
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i];
      const pts = traces[p.tr];
      p.s += p.sp * dt;
      if (p.s - p.text.length >= pts.length) {
        packets.splice(i, 1);
        if (p.word) {
          if (state.phase === "dl") {
            state.arrived++;
            spawnSparks(pts[pts.length - 1], state.pkg.region, 5);
            if (state.arrived >= NEED) {
              state.phase = "done";
              state.t1 = t;
              learn(state.pkg.region);
              spawnSparks(pts[pts.length - 1], state.pkg.region, 18);
            }
          }
        } else if (rand() < 0.35) spawnSparks(pts[pts.length - 1], [rand() * 1.6 - 0.8, rand() * 1.0 - 0.6], 1);
      }
    }

    // ── sparks: wander toward their region, staying inside the brain ──
    const decay = Math.exp(-dt * 2.4);
    for (let i = 0; i < heat.length; i++) heat[i] *= decay;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      const dx = s.tx - s.x, dy = (s.ty - s.y) / ax;
      const d = Math.hypot(dx, dy) || 1;
      const wob = noise2(s.x * 0.15 + s.seed, s.y * 0.15 + t * 0.8) * 2.2;
      const ang = Math.atan2(dy, dx) + wob;
      const nx = s.x + Math.cos(ang) * s.sp * dt, ny = s.y + Math.sin(ang) * s.sp * dt * ax;
      const j = Math.round(ny) * cols + Math.round(nx);
      if (j >= 0 && j < mask.length && mask[j]) {
        s.x = nx;
        s.y = ny;
      } else {
        s.x += (dx / d) * s.sp * dt * 0.5;
        s.y += (dy / d) * s.sp * dt * 0.5 * ax;
      }
      const k = Math.round(s.y) * cols + Math.round(s.x);
      if (k >= 0 && k < heat.length && mask[k]) heat[k] = Math.max(heat[k], 1);
      if (d < 1.5 || s.life <= 0) {
        burst(s.tx, s.ty, 2.5);
        sparks.splice(i, 1);
      }
    }

    // ── brain ──
    const [x0, y0, x1, y1] = bbox;
    const reveal = smooth(0, 1.3, t);
    const revealRow = y0 + (y1 - y0 + 2) * reveal;
    const pulse = 0.92 + 0.08 * Math.sin(t * 1.7);
    for (let y = y0; y <= y1; y++) {
      if (y > revealRow) break;
      const scan = Math.abs(y - revealRow) < 1 && reveal < 1;
      for (let x = x0; x <= x1; x++) {
        const i = y * cols + x;
        if (!mask[i]) continue;
        let v = base[i] * pulse, hue = baseH[i], g = baseG[i];
        const lv = learned[i] * (0.35 + 0.65 * fold[i]);
        if (lv > 0.07 && v > 0.04) {
          v = Math.max(v, lv * 0.9);
          hue = HUE.main;
        }
        const hv = heat[i] * (0.45 + 0.55 * fold[i]);
        if (hv > 0.12 && hv > v) {
          v = hv;
          hue = hv > 0.78 ? HUE.white : HUE.main;
          if (g >= 0) g = -1;
        }
        if (scan) {
          v = 0.8;
          hue = HUE.alt;
          g = -1;
        }
        V[i] = v;
        H[i] = hue;
        Gg[i] = g;
      }
    }
    for (const s of sparks) f.set(s.x, s.y, 1, HUE.white, G("•"));

    // ── bus + packets ──
    const busOn = smooth(0.6, 1.4, t);
    for (const pts of traces) {
      for (let k = 0; k < pts.length; k++) f.plot(pts[k][0], pts[k][1], 0.22 * busOn, HUE.alt, traceGlyph(pts, k));
    }
    for (const p of packets) {
      const pts = traces[p.tr];
      const hk = clamp(Math.floor(p.s), 0, pts.length - 2);
      // moving right, the last letter must lead so the word reads left→right
      const rev = pts[hk + 1] && pts[hk + 1][0] > pts[hk][0];
      const L = p.text.length;
      for (let c = 0; c < L; c++) {
        const k = Math.floor(p.s) - c;
        if (k < 0 || k >= pts.length) continue;
        const ch = p.text[rev ? L - 1 - c : c];
        if (ch === " ") continue;
        const head = c === 0;
        f.set(pts[k][0], pts[k][1], p.word ? (head ? 1 : 0.85) : 0.45, p.word ? (head ? HUE.white : HUE.main) : HUE.alt, G(ch));
      }
    }

    // ── chip ──
    drawChip(f, t, state.phase === "dl");

    // ── HUD ──
    drawHud(f, t, S);
    drawEeg(f, t, S);
  },
};

const EEG = [
  ["ALPHA", 0.9, 1.0, HUE.alt],
  ["BETA", 2.3, 0.6, HUE.main],
  ["GAMMA", 5.1, 0.4, HUE.fg],
];
function drawEeg(f, t, S) {
  const { cols, rows } = S;
  const top = hudY + 5, h = rows - top - 2;
  if (h < 9) return;
  const ch = Math.floor((h - 1) / EEG.length);
  const busy = state.phase === "dl" ? 0.4 + 0.6 * (state.arrived / NEED) : 1.4 - Math.min(1, (t - state.t1) * 0.8);
  f.text(2, top, "EEG // live", HUE.fg, 0.45);
  for (let c = 0; c < EEG.length; c++) {
    const [name, fr, amp, hue] = EEG[c];
    const mid = top + 1 + c * ch + ch / 2;
    f.text(2, Math.round(mid), name, hue, 0.7);
    f.line(8, mid, cols - 3, mid, 0.08, HUE.fg, G("·"));
    let py = null;
    for (let x = 8; x < cols - 2; x++) {
      const u = x * 0.22 - t * 3.2;
      const a = 0.62 * amp * (0.3 + busy * (0.55 + 0.45 * noise2(u * 0.05, c * 7)));
      const yv = Math.sin(u * fr) * a + noise2(u * 1.3, c * 3 + t) * 0.35 * a;
      const y = Math.round(mid - yv * (ch / 2 - 0.5));
      if (py !== null) f.line(x - 1, py, x, y, 0.55, hue, "auto", S.ax);
      else f.set(x, y, 0.55, hue);
      py = y;
    }
  }
}

function spawnSparks(from, region, n) {
  const [tx, ty] = toCell(region[0], region[1]);
  for (let k = 0; k < n; k++) {
    sparks.push({
      x: from[0],
      y: from[1],
      tx: tx + (rand() - 0.5) * R * 0.25,
      ty: ty + (rand() - 0.5) * R * 0.18 * S0.ax,
      sp: 18 + rand() * 18,
      life: 2.2 + rand(),
      seed: rand() * 100,
    });
  }
}

function burst(cx, cy, r) {
  const { cols, rows, ax } = S0;
  for (let y = Math.floor(cy - r * ax); y <= Math.ceil(cy + r * ax); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const d = Math.hypot(x - cx, (y - cy) / ax) / r;
      const i = y * cols + x;
      if (d < 1 && mask[i]) heat[i] = Math.max(heat[i], 1 - d * 0.6);
    }
  }
}

function learn(region) {
  const { cols, rows, ax } = S0;
  const [cx, cy] = toCell(region[0], region[1]);
  const r = R * 0.32;
  for (let y = Math.floor(cy - r * ax); y <= Math.ceil(cy + r * ax); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const i = y * cols + x;
      if (!mask[i]) continue;
      const d = Math.hypot(x - cx, (y - cy) / ax) / r;
      if (d < 1) learned[i] = Math.min(0.42, learned[i] + 0.3 * (1 - d * d));
    }
  }
  // memories fade a little so the map never saturates
  for (let i = 0; i < learned.length; i++) learned[i] *= 0.9;
}

function drawChip(f, t, active) {
  const { x, y, w, h } = chip;
  const on = smooth(0.2, 1.0, t);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) f.set(xx, yy, 0);
  // pins
  for (let xx = x + 2; xx < x + w - 2; xx += 2) {
    f.set(xx, y - 1, 0.35 * on, HUE.fg, G("╨") === G("?") ? G("│") : G("│"));
    f.set(xx, y + h, 0.35 * on, HUE.fg, G("│"));
  }
  for (let yy = y + 1; yy < y + h - 1; yy++) {
    f.set(x - 1, yy, 0.35 * on, HUE.fg, G("─"));
    f.set(x + w, yy, 0.35 * on, HUE.fg, G("─"));
  }
  f.box(x, y, w, h, HUE.alt, 0.75 * on, true);
  // die texture
  for (let yy = y + 1; yy < y + h - 1; yy++) {
    for (let xx = x + 1; xx < x + w - 1; xx++) {
      const n = noise2(xx * 0.4, yy * 0.7);
      if (n > 0.25) f.set(xx, yy, 0.12 * on, HUE.alt, G("▒"));
      else if (n < -0.45) f.set(xx, yy, 0.1 * on, HUE.fg, G("░"));
    }
  }
  const mid = y + Math.floor(h / 2);
  const label = w >= 22 ? "N-LINK // EDU" : "N-LINK";
  f.text(x + Math.floor((w - label.length) / 2), mid - 1, label, HUE.main, 0.95 * on);
  const sub = w >= 22 ? "STUDYBAY K7-2019" : "K7";
  f.text(x + Math.floor((w - sub.length) / 2), mid + 1, sub, HUE.fg, 0.5 * on);
  const blink = active && Math.sin(t * 22) > 0;
  f.set(x + 2, y + 1, blink ? 1 : 0.3, blink ? HUE.hot : HUE.fg, G("●"));
  f.set(x + w - 3, y + h - 2, 0.6 * on, HUE.alt, G("◢"));
}

function drawHud(f, t, S) {
  const { cols } = S;
  const pkg = state.pkg;
  const x = 2, y = hudY;
  const blank = (yy) => {
    for (let xx = 0; xx < cols; xx++) f.set(xx, yy, 0);
  };
  blank(y);
  blank(y + 1);
  blank(y + 2);
  const narrow = cols < 52;
  if (state.phase === "dl") {
    const p = state.arrived / NEED;
    const mbs = (state.rate + Math.sin(t * 3.1) * 1.3 + Math.sin(t * 7.3) * 0.6).toFixed(1);
    f.text(x, y, narrow ? "DOWNLOADING" : "> neural.link --sync", HUE.fg, 0.55);
    if (!narrow) f.text(x + 22, y, "DOWNLOADING", HUE.alt, Math.sin(t * 6) > -0.3 ? 0.85 : 0.4);
    f.text(x, y + 1, pkg.name, pkg.egg ? HUE.hot : HUE.main, 0.95);
    const bw = clamp(cols - 22, 8, 32);
    const filled = Math.round(p * bw);
    let bar = "";
    for (let k = 0; k < bw; k++) bar += k < filled ? "█" : "░";
    f.text(x, y + 2, bar, HUE.main, 0.8);
    f.text(x + bw + 1, y + 2, `${String(Math.round(p * 100)).padStart(3)}%`, HUE.white, 0.9);
    if (cols - (x + bw + 6) > 11) f.text(x + bw + 6, y + 2, `${mbs} MB/s`, HUE.fg, 0.5);
  } else {
    const flash = Math.sin((t - state.t1) * 18) > -0.2;
    f.text(x, y, "INSTALLED [OK]", HUE.white, flash ? 1 : 0.5);
    f.text(x, y + 1, pkg.name, HUE.main, 0.95);
    f.text(x, y + 2, pkg.egg ? "whoa." : "synapses rewired · ready", pkg.egg ? HUE.hot : HUE.alt, 0.7);
  }
  // package history (landscape only)
  if (!narrow && cols > 120) {
    const done = state.count;
    for (let k = 0; k < Math.min(5, done); k++) {
      const n = done - 1 - k;
      const name = n % 5 === 4 ? KUNGFU.name : PKGS[(n - (n > 4 ? Math.floor(n / 5) : 0)) % PKGS.length].name;
      f.text(cols - 26, 2 + k, `[OK] ${name}`, HUE.fg, 0.4 - k * 0.05);
    }
  }
}
