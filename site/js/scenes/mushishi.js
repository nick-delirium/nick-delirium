// Mushishi: a night valley of layered forest ridges and drifting fog. Mushi glow and wander;
// a lone traveller smokes on the ridge and the smoke keeps them at a distance. Now and then
// a kouki, a river of light, winds through the valley and thins out again.
import { HUE, clamp, smooth, noise2, noise3, fbm2, hash1, hash2, rng, G, TAU, lerp, slopeGlyph } from "../engine/util.js";

const KT = 26; // kouki cycle
const KOFF = 6; // first frame lands while the river is flowing
// ridge outline brightness, far → near; interiors stay dark so silhouettes read
const EDGE_V = [0.2, 0.17, 0.14, 0.12];
const EDGE_H = [HUE.alt, HUE.alt, HUE.fg, HUE.fg];

const DOT = G("."), MID = G("·"), PEAK = G("^"), UP = G("/"), DOWN = G("\\"), FLAT = G("-");

let portrait, tops, bases, bandC, bandW, fogD, idxMap, stars, gx, gy;
let mushi, smoke, kouki, path, P;

const TRAVELLER = [
  "  ▄▒▄   ",
  "  ▐█▌-• ",
  " █▐██▌  ",
  " █▐██▌  ",
  "   ▌▐   ",
];

export default {
  id: "mushishi",
  title: "MUSHI",
  caption: "simple life, drifting just outside of sight",

  init(f, S) {
    const { cols, rows, ax } = S;
    portrait = rows / ax > cols;
    P = rng(1886);
    const R = rng(4242);

    // far → near: hazy ridge, two forested ridges, the dark foreground knoll
    bases = portrait ? [0.42, 0.53, 0.65, 0.84] : [0.46, 0.57, 0.7, 0.88];
    const amps = [0.13, 0.1, 0.085, 0.07];
    gx = Math.round(cols * (portrait ? 0.24 : 0.86));
    tops = [];
    for (let i = 0; i < 4; i++) {
      const base = rows * bases[i], amp = rows * amps[i];
      const top = new Float32Array(cols);
      const sc = (portrait ? 0.03 : 0.014) * (1 + i * 0.25);
      for (let x = 0; x < cols; x++) {
        if (i === 3) {
          const knoll = Math.exp(-(((x - gx) / (cols * (portrait ? 0.18 : 0.1))) ** 2));
          top[x] = base - amp * (0.2 + 1.4 * knoll) - noise2(x * 0.08, 5) * 1.2;
        } else {
          top[x] = base - amp * clamp(0.5 + fbm2(x * sc + i * 13.1, i * 3.7, 4) * 1.1, 0.05, 1.3);
        }
      }
      // conifers on the middle ridges, sparse on the far one
      if (i < 3) {
        const ridge = Float32Array.from(top);
        let x = Math.floor(R() * 3);
        while (x < cols) {
          const th = rows * amps[i] * (i === 0 ? 0.18 : 0.32) * (0.5 + R());
          const tw = Math.max(1, (th * 0.36) / ax);
          for (let k = Math.floor(x - tw); k <= Math.ceil(x + tw); k++) {
            if (k < 0 || k >= cols) continue;
            const h = ridge[Math.round(clamp(x, 0, cols - 1))] - th * (1 - Math.abs(k - x) / tw);
            if (h < top[k]) top[k] = h;
          }
          x += 1 + R() * (i === 0 ? 5 : 3);
        }
      }
      tops.push(top);
    }
    // fog sits low in each valley, in front of its ridge
    bandC = bases.map((b, i) => rows * b - rows * amps[i] * 0.15);
    bandW = rows * (portrait ? 0.035 : 0.05);
    fogD = [0, 1, 2, 3].map(() => new Float32Array(cols));
    idxMap = new Int8Array(cols * rows);

    stars = [];
    for (let i = 0; i < (cols * rows) / 140; i++) stars.push({ x: Math.floor(R() * cols), y: Math.floor(R() * rows * 0.4), b: 0.08 + R() ** 2 * 0.3, ph: R() * TAU });

    gy = Math.floor(tops[3][gx]);

    // the river of light: far and thin on one side, near and wide on the other
    const xa = portrait ? cols * 0.98 : cols * 0.02, xb = portrait ? cols * 0.02 : cols * 0.98;
    path = [];
    for (let k = 0; k <= 160; k++) {
      const s = k / 160;
      path.push({
        x: lerp(xa, xb, s) + cols * 0.07 * Math.sin(s * TAU * 1.2 + 0.7),
        y: lerp(rows * 0.34, rows * 0.64, s) + rows * 0.05 * Math.sin(s * TAU * 0.9 + 2.1),
        w: lerp(0.8, portrait ? 5 : 7, s ** 1.2),
      });
    }
    kouki = [];
    const nk = clamp(Math.round((cols * rows) / 34), 260, 1100);
    for (let k = 0; k < nk; k++) kouki.push({ s: R(), o: (R() + R() + R()) / 1.5 - 1, sp: 0.03 + R() * 0.035, ph: R() * TAU, alive: true, gl: R() });

    mushi = [];
    const nm = clamp(Math.round((cols * rows) / 200), 18, 140);
    for (let k = 0; k < nm; k++) {
      const r = R();
      mushi.push({
        x: R() * cols,
        y: rows * (0.12 + R() * 0.62),
        vx: 0, vy: 0,
        type: r < 0.22 ? 0 : r < 0.6 ? 1 : r < 0.78 ? 2 : 3, // jelly, spore, spiral, wisp
        sp: 0.8 + R() * 1.6,
        ph: R() * TAU,
        hist: new Float32Array(16),
        hi: 0,
        ht: 0,
      });
    }
    for (const m of mushi) for (let k = 0; k < 8; k++) (m.hist[k * 2] = m.x), (m.hist[k * 2 + 1] = m.y);
    smoke = [];
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gg = f.g;

    // ── fog density per column, per band ──
    for (let b = 0; b < 4; b++) {
      const d = fogD[b];
      for (let x = 0; x < cols; x++) d[x] = clamp(0.5 + 0.8 * noise2(x * 0.022 - t * 0.05 * (b + 1), b * 7.7 + t * 0.02));
    }

    // ── ridges, fog, sky ──
    const fy = [0, 0, 0, 0];
    for (let y = 0, i = 0; y < rows; y++) {
      let anyFog = false;
      for (let b = 0; b < 4; b++) {
        const e = (y - bandC[b]) / bandW;
        fy[b] = e * e < 9 ? Math.exp(-e * e) : 0;
        if (fy[b]) anyFog = true;
      }
      for (let x = 0; x < cols; x++, i++) {
        let L = -1;
        for (let l = 3; l >= 0; l--) {
          if (y >= tops[l][x]) {
            L = l;
            break;
          }
        }
        let v = 0, h = HUE.fg, g = -1;
        const hs = hash2(x, y);
        if (L >= 0) {
          if (y < tops[L][x] + 1) {
            v = EDGE_V[L];
            h = EDGE_H[L];
            g = ridgeGlyph(tops[L], x);
          } else if (L === 0 && hs > 0.72) {
            v = 0.07;
            h = HUE.alt;
            g = DOT;
          }
        }
        // fog: stochastic dots whose density drifts with the noise, in front of its ridge
        if (anyFog && g < 0) {
          let fog = 0;
          for (let b = L > 0 ? L : 0; b < 4; b++) if (fy[b]) fog += fy[b] * fogD[b][x];
          if (fog > 0.05 && hs < fog * 0.55) {
            v = 0.08 + fog * 0.08;
            h = HUE.fg;
            g = hs < fog * 0.12 ? MID : DOT;
          }
        }
        idxMap[i] = L;
        V[i] = v;
        H[i] = h;
        Gg[i] = g;
      }
    }
    for (const s of stars) {
      const i = s.y * cols + s.x;
      if (idxMap[i] < 0) f.plot(s.x, s.y, s.b * (0.6 + 0.4 * Math.sin(t * 1.3 + s.ph)), HUE.fg, G("."));
    }

    // ── kouki: a river of light that swells, flows and thins out ──
    const kt = (t + KOFF) % KT;
    const env = smooth(0, 3, kt) * (1 - smooth(11, 17, kt));
    if (env > 0.01 || kouki.some((p) => p.alive)) {
      for (let k = 0; k < path.length; k++) {
        const p = path[k];
        for (let o = -p.w * 1.8; o <= p.w * 1.8; o += 1) {
          const x = Math.round(p.x), y = Math.round(p.y + o * 0.5);
          if (x < 0 || y < 0 || x >= cols || y >= rows || idxMap[y * cols + x] > 2) continue;
          const fall = 1 - Math.abs(o) / (p.w * 1.9);
          f.add(x, y, 0.07 * env * fall, HUE.alt);
          const tw = hash1(x * 31 + y * 17 + Math.floor(t * 3) * 7);
          if (tw < 0.3 * env) f.plot(x, y, (0.18 + tw * 0.8) * env * fall, HUE.alt, MID);
        }
      }
      for (const q of kouki) {
        q.s += q.sp * dt;
        if (q.s > 1) {
          q.s -= 1;
          q.alive = P() < env * 1.1;
        }
        if (!q.alive) continue;
        const fi = q.s * (path.length - 1), k0 = Math.floor(fi), fr = fi - k0;
        const a = path[k0], b = path[Math.min(path.length - 1, k0 + 1)];
        const px = lerp(a.x, b.x, fr), py = lerp(a.y, b.y, fr), w = lerp(a.w, b.w, fr);
        const x = px + Math.sin(t * 1.7 + q.ph) * 0.4;
        const y = py + q.o * w * 0.5 + Math.sin(t * 2.3 + q.ph) * 0.25;
        const xi = Math.round(x), yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= cols || yi >= rows || idxMap[yi * cols + xi] > 2) continue;
        const core = (1 - Math.abs(q.o)) ** 1.5;
        const fl = 0.8 + 0.2 * Math.sin(t * 5 + q.ph * 3);
        const v = (0.4 + 0.6 * core) * fl * Math.max(env, 0.4) * smooth(0, 0.08, q.s) * (1 - smooth(0.95, 1, q.s));
        const hue = q.gl < 0.1 ? HUE.main : core > 0.6 ? HUE.white : HUE.alt;
        const g = core > 0.75 ? G("•") : core > 0.3 ? slopeGlyph(b.x - a.x, b.y - a.y, 0.6) : G("·");
        f.plot(xi, yi, v, hue, g);
      }
    }

    // ── smoke from the traveller's cigarette ──
    const tipX = gx - 4 + 6, tipY = gy - 5 + 1;
    if (P() < dt * 11) {
      smoke.push({ x: tipX + 0.5, y: tipY - 0.5, vx: 0.4 + P() * 0.5, vy: -(2 + P() * 1.2), age: 0, life: 4.5 + P() * 2.5, ph: P() * TAU });
    }
    for (let k = smoke.length - 1; k >= 0; k--) {
      const s = smoke[k];
      s.age += dt;
      if (s.age > s.life) {
        smoke.splice(k, 1);
        continue;
      }
      s.vx += noise3(s.x * 0.09, s.y * 0.09, t * 0.3 + s.ph) * dt * 4;
      s.vx *= 0.985;
      s.vy *= 0.994;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const k01 = s.age / s.life;
      const v = 0.5 * (1 - k01) * smooth(0, 0.3, s.age);
      const g = k01 < 0.15 ? G("·") : k01 < 0.6 ? G("~") : G("°");
      f.plot(s.x, s.y, v, k01 < 0.3 ? HUE.white : HUE.fg, g);
      if (k01 > 0.4) f.plot(s.x + (s.vx > 0 ? 1 : -1), s.y, v * 0.4, HUE.fg, G("·"));
    }

    // ── mushi ──
    for (const m of mushi) {
      const ang = noise3(m.x * 0.025, m.y * 0.04, t * 0.06 + m.ph) * TAU * 1.3;
      let tx = Math.cos(ang) * m.sp, ty = Math.sin(ang) * m.sp * 0.45;
      // smoke keeps them away
      for (const s of smoke) {
        const dx = m.x - s.x, dy = (m.y - s.y) / ax;
        const d2 = dx * dx + dy * dy;
        if (d2 < 140 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          tx += (dx / d) * (12 / (d + 2));
          ty += ((dy / d) * (12 / (d + 2))) * ax;
        }
      }
      if (m.y < rows * 0.1) ty += 1.5;
      if (m.y > rows * 0.8) ty -= 1.5;
      m.vx = lerp(m.vx, tx, Math.min(1, dt * 0.9));
      m.vy = lerp(m.vy, ty, Math.min(1, dt * 0.9));
      m.x += m.vx * dt;
      m.y += (m.vy + Math.sin(t * 0.9 + m.ph) * 0.4) * dt;
      if (m.x < -4) m.x += cols + 8;
      if (m.x > cols + 4) m.x -= cols + 8;
      m.ht += dt;
      if (m.ht > 0.12) {
        m.ht = 0;
        m.hi = (m.hi + 1) & 7;
        m.hist[m.hi * 2] = m.x;
        m.hist[m.hi * 2 + 1] = m.y;
      }
      drawMushi(f, m, t);
    }

    // ── the traveller on the knoll ──
    const left = gx - 4, top = gy - 5;
    for (let r = 0; r < TRAVELLER.length; r++) {
      const row = Array.from(TRAVELLER[r]);
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === " ") continue;
        let v = 0.2, h = HUE.fg;
        if (r === 0) {
          v = 0.75;
          h = HUE.white;
        } else if (ch === "•") {
          v = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 2.2));
          h = HUE.hot;
        } else if (ch === "-") {
          v = 0.5;
          h = HUE.white;
        } else if (c === 1) {
          v = 0.12;
        } else if (r === 4) {
          v = 0.15;
        }
        f.set(left + c, top + r, v, h, G(ch));
      }
    }

    // ── HUD ──
    const s = "mushi · light vein · kouki";
    if (cols > s.length + 4) {
      const hy = rows - 2;
      for (let k = -1; k <= s.length; k++) f.set(2 + k, hy, 0);
      f.text(2, hy, s, HUE.fg, 0.38);
    }
  },
};

function ridgeGlyph(top, x) {
  const a = top[Math.max(0, x - 1)], c = top[x], b = top[Math.min(top.length - 1, x + 1)];
  if (c < a - 0.3 && c < b - 0.3) return PEAK;
  const d = b - a;
  return d > 0.8 ? DOWN : d < -0.8 ? UP : FLAT;
}

function drawMushi(f, m, t) {
  let b = 0.72 + 0.28 * Math.sin(t * (1.2 + m.ph * 0.3) + m.ph * 7);
  if (hash1(Math.floor(t * 0.7 + m.ph * 13)) < 0.06) b *= 0.35; // a shy blink
  const x = Math.round(m.x), y = Math.round(m.y);
  if (m.type === 0) {
    // jellyfish: a soft bell, bright core, three trailing threads
    for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) f.add(x + dx, y + dy, 0.08 * b, HUE.alt);
    f.plot(x - 1, y - 1, 0.35 * b, HUE.alt, G("."));
    f.plot(x, y - 1, 0.4 * b, HUE.alt, G("-"));
    f.plot(x + 1, y - 1, 0.35 * b, HUE.alt, G("."));
    f.plot(x - 1, y, 0.55 * b, HUE.alt, G("("));
    f.plot(x + 1, y, 0.55 * b, HUE.alt, G(")"));
    f.plot(x, y, b, HUE.white, G("o"));
    for (let j = -1; j <= 1; j++) {
      for (let k = 1; k <= 4; k++) {
        const sw = Math.sin(t * 2 + m.ph + k * 0.8 + j) * 0.6;
        f.plot(x + j + sw, y + k, (0.42 - k * 0.08) * b, HUE.alt, k < 3 ? G(":") : G("·"));
      }
    }
  } else if (m.type === 1) {
    f.add(x - 1, y, 0.05 * b, HUE.alt);
    f.add(x + 1, y, 0.05 * b, HUE.alt);
    f.plot(x, y, (0.45 + 0.35 * b) * b, b > 0.8 ? HUE.white : HUE.alt, b > 0.85 ? G("•") : G("·"));
  } else if (m.type === 2) {
    // spiral cilia turning around a small core
    const a0 = t * 1.6 + m.ph;
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * TAU) / 4, r = 1.3 + 0.4 * Math.sin(t * 2 + k);
      f.plot(m.x + Math.cos(a) * r, m.y + Math.sin(a) * r * 0.6, 0.45 * b, HUE.alt, G("."));
    }
    f.plot(x, y, 0.75 * b, HUE.white, G("•"));
  } else {
    // wisp: a comet tail along where it has been
    for (let k = 1; k < 8; k++) {
      const hi = (m.hi - k + 8) & 7;
      const hx = m.hist[hi * 2], hy = m.hist[hi * 2 + 1];
      f.plot(hx, hy, (0.5 - k * 0.06) * b, HUE.alt, k < 3 ? G("~") : G("·"));
    }
    f.plot(x, y, 0.85 * b, HUE.white, G("•"));
  }
}
