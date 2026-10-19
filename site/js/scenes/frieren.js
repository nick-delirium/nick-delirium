// Frieren: twilight field. A small mage taps her staff, a ring of light runs across the grass
// and flowers bloom in its wake; petals and motes drift up, the field fades, and it starts again.
// Every other cycle the bloom is blue moon-weed.
import { HUE, clamp, smooth, noise2, fbm2, hash1, hash2, rng, G, TAU, slopeGlyph } from "../engine/util.js";

const T = 18; // seconds per bloom cycle
const OFFSET = 2.6; // start mid-bloom so the first frame already has flowers
const TAP = 1.4; // staff tap, within the cycle
const SPREAD = 6; // seconds for the ring to cross the field
const FADE = 12.8; // flowers begin to let go of their petals

// staff in column 8; its foot sits on the ground point (bx, by)
const SPRITE = [
  "  ▄██▄  ◇",
  " <(··)> │",
  " ║▐██▌║ │",
  " ║▐██▌║─┤",
  " ' ██ ' │",
  "   ▌▐   │",
];

let portrait, yH, far, near, windPh, stars, flowers, eMax;
let bx, by, mx, my, mr, pil, parts, meteor, nextMeteor, P;

// the ring lives on the ground: an ellipse around the staff, squashed more on the far side
const KF = 0.2, KN = 0.34;
function ellipseDist(x, y) {
  const dx = x - bx, dy = y - by;
  const q = dy / (dy < 0 ? KF : KN);
  return Math.sqrt(dx * dx + q * q);
}

const GRASS = Array.from(",'.`").map(G);
const BLADE = [G("/"), G("|"), G("\\")];
const FAR_G = Array.from(".·°,").map(G);
const MID_G = Array.from("*x%+¤").map(G);
const PETAL_G = Array.from("',°·").map(G);
const FLOWER_HUES = [HUE.hot, HUE.main, HUE.white, HUE.hot, HUE.main];
const WEED_HUES = [HUE.alt, HUE.alt, HUE.white];

function ringRadius(ct) {
  return eMax * Math.pow(clamp((ct - TAP) / SPREAD), 1.1);
}

export default {
  id: "frieren",
  title: "FIELD_OF_FLOWERS",
  caption: "the most useless spell, and her favourite",

  init(f, S) {
    const { cols, rows, ax } = S;
    portrait = rows / ax > cols;
    P = rng(2023);
    const R = rng(1104);
    yH = Math.round(rows * (portrait ? 0.48 : 0.5));
    const gh = rows - yH;

    // two mountain lines: hazy far range with one tall peak, low dark hills in front
    far = new Float32Array(cols);
    near = new Float32Array(cols);
    const hFar = rows * (portrait ? 0.13 : 0.22);
    const peakX = cols * (portrait ? 0.6 : 0.3);
    for (let x = 0; x < cols; x++) {
      const m = fbm2(x * (portrait ? 0.03 : 0.016) + 7.3, 2.1, 4);
      const peak = Math.exp(-(((x - peakX) / (cols * 0.13)) ** 2));
      far[x] = yH - hFar * clamp(0.32 + m * 0.9 + peak * 0.7, 0.06, 1.2);
      near[x] = yH - Math.max(1, rows * 0.035) * clamp(0.55 + noise2(x * 0.045, 3.3) * 0.9, 0.1, 1.3);
    }
    windPh = new Float32Array(cols);
    for (let x = 0; x < cols; x++) windPh[x] = R() * TAU;

    stars = [];
    const ns = Math.round((cols * yH) / 55);
    for (let i = 0; i < ns; i++) {
      const x = Math.floor(R() * cols), y = Math.floor(R() * yH * 0.88);
      if (y < far[x] - 1) stars.push({ x, y, b: 0.12 + R() ** 3 * 0.6, ph: R() * TAU, sp: 0.5 + R() * 2 });
    }

    mr = clamp(Math.min(cols, rows / ax) * 0.055, 2.5, 9);
    mx = Math.round(cols * (portrait ? 0.78 : 0.12));
    my = Math.round(Math.max(mr * ax + 2, rows * (portrait ? 0.12 : 0.18)));

    bx = clamp(Math.round(cols * (portrait ? 0.42 : 0.78)), 9, cols - 2);
    by = Math.round(yH + gh * (portrait ? 0.42 : 0.5));

    // broken pillar, a stump and a fallen drum, mid-distance on the far side from the mage
    const ph = Math.max(4, Math.round(rows * (portrait ? 0.085 : 0.12)));
    const pw = Math.max(3, Math.round(ph / ax / 3.2));
    const px = Math.round(cols * (portrait ? 0.76 : 0.9));
    pil = { x: Math.min(px, cols - pw - 6), base: Math.round(yH + gh * 0.14), h: ph, w: pw, lit: mx > px };

    flowers = [];
    const nf = clamp(Math.round(cols * gh * 0.06), 120, 1400);
    for (let i = 0; i < nf; i++) {
      const sy = yH + 1 + Math.floor((gh - 2) * R() ** 1.7);
      const sx = Math.floor(R() * cols);
      if (R() < 0.45 * ((sy - yH) / gh)) continue; // fewer, larger blooms up front
      const k = (sy - yH) / gh;
      flowers.push({
        sx, sy, k,
        d: ellipseDist(sx, sy),
        size: k > 0.55 ? 2 : k > 0.2 ? 1 : 0,
        hp: R(), gp: R(), ph: R() * TAU, j: R(),
        fs: FADE + R() * 2.4,
        spawned: -1,
      });
    }
    const ds = flowers.map((fl) => fl.d).sort((a, b) => a - b);
    eMax = (ds[Math.floor(ds.length * 0.95)] || 1) * 1.05;
    for (const fl of flowers) fl.bt = TAP + SPREAD * Math.pow(Math.min(1.3, fl.d / eMax), 1 / 1.1) + fl.j * 0.25;
    flowers.sort((a, b) => a.sy - b.sy);

    parts = [];
    meteor = null;
    nextMeteor = 2.2;
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gg = f.g;
    const tc = t + OFFSET, ct = tc % T, cyc = Math.floor(tc / T);
    const weed = cyc % 2 === 1;
    const gh = rows - yH;
    const R = ringRadius(ct);
    const ringEnv = ct >= TAP ? 1 - smooth(TAP + SPREAD * 0.7, TAP + SPREAD + 1.4, ct) : 0;
    const ringHue = weed ? HUE.alt : HUE.white;

    // ── sky, mountains, grass and the ring of light ──
    for (let y = 0, i = 0; y < rows; y++) {
      if (y < yH) {
        const d = (yH - y) / rows;
        const glow = 0.12 * Math.exp(-d / 0.07);
        const hue = d < 0.06 ? HUE.main : HUE.hot;
        for (let x = 0; x < cols; x++, i++) {
          const hs = hash2(x, y);
          let v = hs > 0.55 ? glow * hs : 0, h = hue, g = -1;
          if (y >= Math.floor(near[x])) {
            v = 0;
            if (y === Math.floor(near[x])) {
              v = 0.17;
              h = HUE.fg;
              g = slope(near, x);
            }
          } else if (y >= Math.floor(far[x])) {
            v = 0.07 * (0.75 + 0.25 * hash2(x * 5, y));
            h = HUE.alt;
            if (y === Math.floor(far[x])) {
              v = 0.3;
              g = slope(far, x);
            }
          }
          V[i] = v;
          H[i] = h;
          Gg[i] = g;
        }
        continue;
      }
      const k = (y - yH) / gh;
      for (let x = 0; x < cols; x++, i++) {
        let v = 0, h = HUE.fg, g = -1;
        const hs = hash2(x * 3 + 1, y * 7 + 2);
        if (hs > 0.5 + 0.22 * k) {
          const wind = 0.5 + 0.5 * Math.sin(x * 0.07 - t * 1.1 + y * 0.4 + windPh[x]);
          v = (0.05 + 0.06 * k) * (0.6 + 0.6 * wind);
          g = k > 0.8 && hs > 0.9 ? BLADE[wind > 0.66 ? 0 : wind < 0.33 ? 2 : 1] : GRASS[(hs * 97) & 3];
        }
        if (ringEnv > 0 && hs < 0.3) {
          const dd = ellipseDist(x, y);
          if (dd < R) {
            const r = 0.12 * Math.exp(-(R - dd) / (4 + R * 0.08)) * ringEnv;
            if (r > v) {
              v = r;
              h = ringHue;
              g = G("·");
            }
          }
        }
        V[i] = v;
        H[i] = h;
        Gg[i] = g;
      }
    }

    // ── the ring of light: two ripples, clipped at the horizon ──
    if (ringEnv > 0 && R > 0.5) {
      for (const [rr, b] of [[R, 0.95], [R * 0.86, 0.4]]) {
        const steps = Math.max(48, Math.ceil(rr * 9));
        for (let s = 0; s < steps; s++) {
          const th = (s / steps) * TAU;
          const c = Math.cos(th), sn = Math.sin(th);
          const k = sn < 0 ? KF : KN;
          const x = bx + rr * c, y = by + rr * k * sn;
          if (y <= yH) continue;
          f.plot(x, y, b * ringEnv, ringHue, slopeGlyph(-sn, k * c, ax));
        }
      }
    }

    // ── moon, stars, a shooting star now and then ──
    drawMoon(f, ax, weed);
    for (const s of stars) {
      const tw = 0.6 + 0.4 * Math.sin(t * s.sp + s.ph);
      f.plot(s.x, s.y, s.b * tw, s.b > 0.45 ? HUE.white : HUE.fg, s.b > 0.55 ? G("+") : s.b > 0.3 ? G("·") : G("."));
    }
    if (t > nextMeteor && !meteor) {
      meteor = { x: cols * (0.25 + P() * 0.7), y: 1 + P() * yH * 0.35, life: 0, dir: P() < 0.5 ? -1 : 1 };
      nextMeteor = t + 4 + P() * 6;
    }
    if (meteor) {
      meteor.life += dt;
      const k = meteor.life / 0.9;
      if (k > 1) meteor = null;
      else {
        const hx = meteor.x + meteor.dir * k * cols * 0.18, hy = meteor.y + k * yH * 0.22;
        for (let j = 0; j < 12; j++) {
          const px = hx - meteor.dir * j * 1.2, py = hy - j * 0.3;
          if (py < far[clamp(Math.round(px), 0, cols - 1)] - 1) f.plot(px, py, (1 - j / 12) * (1 - k) * 0.9, HUE.white, j ? G("·") : G("•"));
        }
      }
    }

    // ── field: flowers in painter's order, pillar and mage slotted in by depth ──
    let pilDone = false, figDone = false;
    for (const fl of flowers) {
      if (!pilDone && fl.sy > pil.base) {
        drawPillar(f);
        pilDone = true;
      }
      if (!figDone && fl.sy > by) {
        drawMage(f, ct, t);
        figDone = true;
      }
      drawFlower(f, fl, ct, cyc, t, weed);
    }
    if (!pilDone) drawPillar(f);
    if (!figDone) drawMage(f, ct, t);

    // ── motes and petals ──
    if (ct > TAP + 1.2 && ct < FADE + 2.5) {
      let n = dt * clamp((cols * gh) / 900, 3, 26);
      while (n > 0) {
        if (P() < n) {
          const fl = flowers[Math.floor(P() * flowers.length)];
          if (ct - fl.bt > 0.8) {
            parts.push({ x: fl.sx, y: fl.sy - 1, vx: (P() - 0.5) * 0.8, vy: -(1.2 + P() * 1.8), life: 2.5 + P() * 2, max: 4.5, hue: weed ? HUE.alt : P() < 0.5 ? HUE.white : HUE.main, g: G("·"), ph: P() * TAU });
          }
        }
        n -= 1;
      }
    }
    for (let k = parts.length - 1; k >= 0; k--) {
      const p = parts[k];
      p.life -= dt;
      if (p.life <= 0 || p.y < -2) {
        parts.splice(k, 1);
        continue;
      }
      p.x += (p.vx + Math.sin(t * 1.8 + p.ph) * 0.6) * dt;
      p.y += p.vy * dt;
      p.vy *= 0.997;
      const tw = 0.7 + 0.3 * Math.sin(t * 6 + p.ph);
      f.plot(p.x, p.y, Math.min(1, p.life / p.max) * 0.7 * tw, p.hue, p.g);
    }

    // ── HUD ──
    const s = "spell: field of flowers · * favourite";
    if (cols > s.length + 4) {
      const hy = rows - 2;
      for (let k = -1; k <= s.length; k++) f.set(2 + k, hy, 0);
      f.text(2, hy, s, HUE.fg, 0.42);
      f.set(2 + s.indexOf("*"), hy, 0.7, weed ? HUE.alt : HUE.main, G("*"));
    }
  },
};

function slope(arr, x) {
  const a = arr[Math.max(0, x - 1)], b = arr[Math.min(arr.length - 1, x + 1)];
  const d = b - a;
  return d > 0.7 ? G("\\") : d < -0.7 ? G("/") : G("-");
}

function drawMoon(f, ax, weed) {
  const { cols, rows } = f;
  const r2 = mr * 2.3;
  for (let y = Math.floor(my - r2 * ax); y <= Math.ceil(my + r2 * ax); y++) {
    if (y < 0 || y >= yH) continue;
    for (let x = Math.floor(mx - r2); x <= Math.ceil(mx + r2); x++) {
      if (x < 0 || x >= cols) continue;
      const dx = x - mx, dy = (y - my) / ax;
      const d = Math.hypot(dx, dy);
      if (d < mr) {
        const crater = noise2(dx * 0.22 + 5, dy * 0.22 + 1);
        const edge = d > mr - 0.8;
        const mare = crater > 0.32;
        f.set(x, y, edge ? 0.45 : mare ? 0.5 : 0.72, mare ? HUE.fg : HUE.white, edge ? G("▒") : mare ? G("▓") : G("█"));
      } else {
        const v = 0.1 * (1 - (d - mr) / (r2 - mr));
        if (v > 0.03) f.plot(x, y, v, weed ? HUE.alt : HUE.fg);
      }
    }
  }
}

function drawPillar(f) {
  const { x, base, h, w, lit } = pil;
  const column = (x0c, wc, hc, seed) => {
    for (let c = 0; c < wc; c++) {
      // snapped top: a diagonal break plus chipped stone
      const top = base - hc + Math.floor((c / wc) * hc * 0.35 + hash1(seed + c * 17) * Math.max(2, hc * 0.18));
      for (let y = top; y <= base; y++) {
        // solid stone, moonlit on one side, shallow flutes in between
        const edge = c === (lit ? wc - 1 : 0) ? 1 : c === (lit ? 0 : wc - 1) ? -1 : 0;
        const v = edge > 0 ? 0.3 : edge < 0 ? 0.08 : c % 2 ? 0.13 : 0.17;
        f.set(x0c + c, y, v, HUE.fg, y === top ? G("▄") : G("█"));
      }
    }
    for (let c = -1; c <= wc; c++) f.set(x0c + c, base + 1, 0.2, HUE.fg, G("▀"));
  };
  column(x, w, h, 31);
  const sw = Math.max(2, w - 1);
  column(x + w + 3, sw, Math.max(3, Math.round(h * 0.38)), 77);
  // fallen drum on its side
  const dw = Math.round(w * 1.5), dy = base + Math.max(2, Math.round(h * 0.06));
  for (let c = 0; c < dw; c++) {
    f.set(x - dw - 2 + c, dy, 0.14, HUE.fg, G("▒"));
    f.set(x - dw - 2 + c, dy - 1, 0.2, HUE.fg, G("▄"));
  }
}

function drawMage(f, ct, t) {
  const left = bx - 8, top = by - 5;
  const lift = ct > TAP - 0.45 && ct < TAP ? 1 : 0;
  const flare = ct >= TAP && ct < TAP + 0.9 ? 1 - (ct - TAP) / 0.9 : 0;
  for (let r = 0; r < SPRITE.length; r++) {
    const row = Array.from(SPRITE[r]);
    const first = row.findIndex((c) => c !== " ");
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      const x = left + c;
      let y = top + r;
      if (c === 8) y -= lift;
      if (ch === " ") {
        if (c > first && c < 7 && r > 0) f.set(x, y, 0);
        continue;
      }
      let v = 0.5, h = HUE.fg;
      if (ch === "◇") {
        v = 0.65 + 0.15 * Math.sin(t * 2) + flare * 0.4;
        h = flare > 0.2 ? HUE.white : HUE.hot;
      } else if (c === 8 || ch === "─") {
        v = 0.4;
      } else if (r === 0 || ch === "<" || ch === ">" || ch === "║" || ch === "'") {
        v = r === 4 ? 0.45 : 0.72;
        h = HUE.white;
      } else if (ch === "·") {
        v = 0.8;
        h = HUE.alt;
      } else if (ch === "(" || ch === ")") {
        v = 0.5;
        h = HUE.white;
      } else if (r === 5) {
        v = 0.3;
      } else {
        v = 0.55;
        h = HUE.white;
      }
      f.set(x, y, Math.min(1, v), h, G(ch));
    }
  }
  // orb sparkle and the tap itself
  if (flare > 0) {
    const ox = left + 8, oy = top - lift;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + 0.4, rr = 1 + (1 - flare) * 4;
      f.plot(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr * 0.6, flare * 0.8, HUE.white, G("·"));
    }
    f.plot(bx, by + 1, flare, HUE.white, G("*"));
  }
}

function drawFlower(f, fl, ct, cyc, t, weed) {
  const a = ct - fl.bt;
  if (a < 0) return;
  const fk = 1 - smooth(fl.fs, fl.fs + 1.4, ct);
  if (fk <= 0.02) return;
  if (ct > fl.fs + 0.5 && fl.spawned !== cyc) {
    fl.spawned = cyc;
    if (parts.length < 900) {
      const hue = weed ? WEED_HUES[Math.floor(fl.hp * 3)] : FLOWER_HUES[Math.floor(fl.hp * 5)];
      parts.push({ x: fl.sx, y: fl.sy, vx: 0.8 + P() * 2, vy: -(2 + P() * 3), life: 3 + P() * 2, max: 5, hue, g: PETAL_G[Math.floor(P() * 4)], ph: P() * TAU });
    }
  }
  const hue = weed ? WEED_HUES[Math.floor(fl.hp * 3)] : FLOWER_HUES[Math.floor(fl.hp * 5)];
  const x = fl.sx, y = fl.sy;
  if (a < 0.35) {
    f.plot(x, y, 0.3 * fk, HUE.fg, G("."));
    return;
  }
  const grow = smooth(0.35, 0.8, a);
  const pop = 1 + 0.35 * (1 - smooth(0.8, 1.5, a));
  const v = Math.min(1, (0.4 + 0.4 * grow) * pop * fk * (0.85 + 0.15 * Math.sin(t * 1.3 + fl.ph)));
  if (fl.size === 0 || a < 0.8) {
    f.plot(x, y, v * (fl.size ? 0.9 : 0.75), hue, fl.size === 0 ? FAR_G[Math.floor(fl.gp * 4)] : G(","));
    return;
  }
  if (a < 0.95) f.set(x, y, fk, HUE.white, G("+"));
  else if (fl.size === 1) f.plot(x, y, v, hue, MID_G[Math.floor(fl.gp * 5)]);
  else {
    const sw = Math.round(Math.sin(t * 1.2 + fl.ph) * 0.6);
    f.plot(x - 1, y + 1, 0.25 * fk, HUE.fg, G(","));
    f.plot(x, y + 1, 0.3 * fk, HUE.fg, G("|"));
    const c = x + sw;
    if (weed) {
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]]) f.plot(c + dx, y + dy, 0.1 * fk, HUE.alt);
    }
    f.plot(c - 1, y, v * 0.75, hue, G("°"));
    f.plot(c + 1, y, v * 0.75, hue, G("°"));
    f.plot(c, y - 1, v * 0.7, hue, G("°"));
    f.set(c, y, v, weed ? HUE.white : HUE.main, fl.gp > 0.5 ? G("@") : G("o"));
  }
}
