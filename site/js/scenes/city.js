// Megacity at night: three parallax skyline layers with lit windows, neon signs,
// a billboard, smog glow, moon, searchlights, spinners and rain.
import { HUE, clamp, smooth, noise2, fbm2, hash1, rng, G, lerp } from "../engine/util.js";

const LAYERS = [
  { speed: 1.4, hmin: 0.38, hmax: 0.78, wmin: 4, wmax: 9, gmax: 2, body: 0.13, lit: 0.12, hues: [HUE.alt, HUE.alt, HUE.fg] },
  { speed: 3.8, hmin: 0.25, hmax: 0.6, wmin: 6, wmax: 14, gmax: 4, body: 0, lit: 0.26, hues: [HUE.main, HUE.alt, HUE.fg, HUE.fg] },
  { speed: 9, hmin: 0.14, hmax: 0.44, wmin: 10, wmax: 22, gmax: 10, body: 0, lit: 0.34, hues: [HUE.main, HUE.white, HUE.main, HUE.hot] },
];
const SIGNS = ["NOODLES", "HOTEL", "RAMEN", "24H", "OPEN", "CLINIC", "ARCADE", "SAKE", "DATA", "BAR", "REPLAY", "NEON"];
const BOARD = ["NIKITA.MELNIKOV", "FRONTEND // R&D", "OPENREPLAY.COM", "PARIS  2026", "SYS.ONLINE"];

let layers, drops, cars, R, flash, bolt, nextFlash;

function buildLayer(cfg, li, cols, rows) {
  const span = Math.ceil(cols * 1.7) + 40;
  const map = new Int16Array(span).fill(-1);
  const list = [];
  let x = 0;
  while (x < span) {
    const w = Math.round(lerp(cfg.wmin, cfg.wmax, R()));
    if (x + w > span) break;
    const b = {
      x0: x,
      w,
      h: Math.round(rows * lerp(cfg.hmin, cfg.hmax, Math.pow(R(), 1.3))),
      roof: R() < 0.3 ? 1 : R() < 0.25 ? 2 : R() < 0.15 ? 3 : 0,
      style: (R() * 3) | 0,
      seed: (R() * 1e6) | 0,
      hue: cfg.hues[(R() * cfg.hues.length) | 0],
      antX: 1 + ((R() * (w - 2)) | 0),
      antH: 3 + ((R() * rows * 0.08) | 0),
      sign: null,
      board: false,
    };
    if (li > 0 && R() < 0.45) b.sign = { text: SIGNS[(R() * SIGNS.length) | 0], hue: R() < 0.5 ? HUE.hot : HUE.alt, x: R() < 0.5 ? 1 : w - 2 };
    if (li === 2 && w >= 18 && !list.some((o) => o.board)) b.board = true;
    for (let k = 0; k < w; k++) map[x + k] = list.length;
    list.push(b);
    x += w + Math.round(R() * cfg.gmax);
  }
  return { cfg, map, list, span };
}

/** returns [v, hue, glyph] or null for a layer at screen cell */
function sampleLayer(L, li, x, y, rows, t, grow, out) {
  const wx = ((Math.floor(x + t * L.cfg.speed) % L.span) + L.span) % L.span;
  const bi = L.map[wx];
  if (bi < 0) return false;
  const b = L.list[bi];
  const top = rows - Math.round(b.h * grow);
  const lx = wx - b.x0;
  if (y < top) {
    if (b.roof === 1 && lx === b.antX && y >= top - b.antH) {
      const tip = y === top - b.antH;
      out[0] = tip ? (Math.sin(t * 4 + b.seed) > 0 ? 0.9 : 0.15) : 0.25;
      out[1] = tip ? HUE.hot : HUE.fg;
      out[2] = tip ? G("•") : G("│");
      return true;
    }
    if (b.roof === 2) {
      const inset = Math.ceil(b.w * 0.25);
      if (lx >= inset && lx < b.w - inset && y >= top - 3) return body(L, li, b, lx, y, top - 3, rows, t, out);
    }
    if (b.roof === 3) {
      const half = b.w / 2;
      const d = Math.abs(lx + 0.5 - half);
      const sh = top - Math.round((half - d) * 1.4);
      if (y >= sh) {
        out[0] = li === 0 ? 0.08 : 0.02;
        out[1] = b.hue;
        out[2] = -1;
        if (y === sh) {
          out[0] = 0.3;
          out[2] = lx + 0.5 < half ? G("/") : G("\\");
        }
        return true;
      }
    }
    return false;
  }
  return body(L, li, b, lx, y, top, rows, t, out);
}

function body(L, li, b, lx, y, top, rows, t, out) {
  const cfg = L.cfg;
  out[0] = cfg.body;
  out[1] = li === 0 ? HUE.alt : b.hue;
  out[2] = li === 0 ? G("░") : -1;
  // roof edge
  if (y === top) {
    out[0] = li === 0 ? 0.14 : 0.32;
    out[1] = li === 2 ? HUE.alt : HUE.fg;
    out[2] = G("▄");
    return true;
  }
  // vertical neon sign
  if (b.sign && lx === b.sign.x) {
    const k = y - top - 2;
    if (k >= 0 && k < b.sign.text.length) {
      const on = hash1(b.seed + Math.floor(t * 6)) > 0.06;
      out[0] = on ? 0.95 : 0.2;
      out[1] = b.sign.hue;
      out[2] = G(b.sign.text[k]);
      return true;
    }
  }
  const fy = rows - y;
  const intro = clamp(t * 0.6);
  let win = false;
  if (b.style === 0) win = lx % 2 === 1 && fy % 2 === 0 && lx < b.w - 1;
  else if (b.style === 1) win = fy % 3 === 0 && lx > 0 && lx < b.w - 1;
  else win = lx % 3 !== 0 && fy % 2 === 0 && lx < b.w - 1;
  if (win) {
    const h = hash1(b.seed + lx * 131 + fy * 7919);
    let lit = h < cfg.lit * intro;
    if (h < 0.02) lit = Math.sin(t * 3 + h * 999) > 0; // flicker
    if (lit) {
      out[0] = 0.35 + hash1(b.seed + fy) * 0.5;
      out[1] = b.hue;
      out[2] = b.style === 1 ? G("─") : G("▪");
      if (li === 0) out[0] *= 0.6;
    } else if (li === 2 && h > 0.85) {
      out[0] = 0.08;
      out[1] = HUE.fg;
      out[2] = G("·");
    }
  }
  return true;
}

export default {
  id: "city",
  title: "NIGHT_CITY",
  caption: "rain on neon. somebody is still shipping.",

  init(f, S) {
    R = rng(2077);
    layers = LAYERS.map((cfg, i) => buildLayer(cfg, i, S.cols, S.rows));
    drops = [];
    const n = Math.round((S.cols * S.rows) / 110);
    for (let i = 0; i < n; i++) {
      const z = R();
      drops.push({ x: R() * (S.cols + 40), y: R() * S.rows, z, len: 1 + Math.round(z * 3) });
    }
    cars = [];
    for (let i = 0; i < 6; i++) {
      const dir = R() < 0.5 ? -1 : 1;
      cars.push({ x: R() * S.cols, y: S.rows * (0.12 + R() * 0.4), v: dir * (10 + R() * 22), seed: R() * 100 });
    }
    flash = 0;
    bolt = null;
    nextFlash = 6 + R() * 8;
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gg = f.g;
    const grow = 1 - Math.pow(1 - smooth(0, 1.4, t), 3);
    const out = [0, 0, -1];

    // lightning timing
    if (t > nextFlash) {
      nextFlash = t + 7 + R() * 10;
      flash = 1;
      const pts = [];
      let bx = cols * (0.2 + R() * 0.6), by = 0;
      while (by < rows * 0.45) {
        pts.push([bx, by]);
        bx += (R() - 0.5) * 6;
        by += 1 + R() * 2.5;
      }
      bolt = { pts, life: 0.25 };
    }
    flash = Math.max(0, flash - dt * 4);

    // moon
    const portrait = rows / ax > cols;
    const mx = cols * (portrait ? 0.62 : 0.74), my = rows * 0.2, mr = Math.min(cols, rows / ax) * 0.13;

    // searchlights
    const beams = [
      { x: cols * 0.25, a: Math.sin(t * 0.35) * 0.55 },
      { x: cols * 0.78, a: Math.sin(t * 0.27 + 2) * 0.6 },
    ];

    for (let y = 0, i = 0; y < rows; y++) {
      const yr = y / rows;
      for (let x = 0; x < cols; x++, i++) {
        let hit = false;
        for (let li = 2; li >= 0; li--) {
          if (sampleLayer(layers[li], li, x, y, rows, t, grow, out)) {
            hit = true;
            break;
          }
        }
        if (hit) {
          V[i] = out[0] + flash * 0.12;
          H[i] = out[1];
          Gg[i] = out[2];
          continue;
        }
        // sky: smog glow near horizon, cloud band, moon, beams
        let v = 0.22 * smooth(0.4, 1, yr) * (0.7 + 0.3 * noise2(x * 0.04 + t * 0.05, y * 0.09));
        let hue = HUE.hot;
        const cl = fbm2(x * 0.025 - t * 0.04, y * 0.11, 3);
        if (cl > 0.22 && yr < 0.4) {
          v = Math.max(v, (cl - 0.22) * 0.5);
          hue = HUE.fg;
        }
        const dx = x - mx, dy = (y - my) / ax;
        const dm = Math.hypot(dx, dy);
        if (dm < mr) {
          const crater = noise2(dx * 0.25, dy * 0.25) * 0.5 + 0.5;
          v = Math.max(v, 0.2 + crater * 0.22 - (dm / mr) * 0.08);
          hue = HUE.alt;
        } else if (dm < mr * 1.6) {
          v = Math.max(v, 0.12 * (1 - (dm - mr) / (mr * 0.6)));
          hue = HUE.alt;
        }
        for (const b of beams) {
          const ang = Math.atan2(x - b.x, (rows - y) / ax);
          const d = Math.abs(ang - b.a);
          if (d < 0.05) {
            v = Math.max(v, 0.16 * (1 - d / 0.05) * (0.6 + 0.4 * yr));
            hue = HUE.alt;
          }
        }
        V[i] = v + flash * 0.25;
        H[i] = hue;
        Gg[i] = -1;
      }
    }

    // billboard on the front layer
    const L = layers[2];
    for (const b of L.list) {
      if (!b.board) continue;
      let sx = b.x0 - ((t * L.cfg.speed) % L.span);
      if (sx < -b.w) sx += L.span;
      if (sx > cols) continue;
      const top = rows - Math.round(b.h * grow);
      const by = top - 6;
      if (by < 1) continue;
      const msg = BOARD[Math.floor(t / 3.2) % BOARD.length];
      const bw = Math.max(msg.length + 4, b.w);
      const bx = Math.round(sx + b.w / 2 - bw / 2);
      for (let yy = by; yy < by + 5; yy++) for (let xx = bx; xx < bx + bw; xx++) f.set(xx, yy, 0);
      f.box(bx, by, bw, 5, HUE.alt, 0.75);
      const glitch = hash1(Math.floor(t * 10)) < 0.08;
      let s = msg;
      if (glitch) s = Array.from(msg, (c) => (hash1(c.charCodeAt(0) + Math.floor(t * 30)) < 0.3 ? "▓" : c)).join("");
      f.text(bx + Math.floor((bw - s.length) / 2), by + 2, s, glitch ? HUE.hot : HUE.main, 0.95);
      f.line(bx + bw / 2, by + 5, bx + bw / 2, top - 1, 0.3, HUE.fg, G("│"));
    }

    // spinners
    for (const c of cars) {
      c.x += c.v * dt;
      if (c.x < -20) c.x = cols + 15;
      if (c.x > cols + 20) c.x = -15;
      const dir = Math.sign(c.v);
      for (let k = 1; k < 9; k++) f.plot(c.x - dir * k, c.y, 0.5 * (1 - k / 9), HUE.alt, G("─"));
      f.set(c.x, c.y, 0.95, HUE.white, G("◆"));
      if (Math.sin(t * 9 + c.seed) > 0.4) f.set(c.x - dir, c.y, 0.9, HUE.hot, G("•"));
    }

    // rain
    for (const d of drops) {
      const sp = 28 + d.z * 40;
      d.y += sp * dt;
      d.x -= sp * 0.3 * dt;
      if (d.y > rows) {
        d.y = -d.len;
        d.x = R() * (cols + 40);
      }
      const v = 0.12 + d.z * 0.3;
      for (let k = 0; k < d.len; k++) f.plot(d.x + k * 0.3, d.y - k, v * (1 - k / (d.len + 1)), HUE.alt, G("/"));
    }

    // ground fog
    const fogTop = rows * 0.8;
    for (let y = Math.floor(fogTop); y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const n = fbm2(x * 0.03 - t * 0.15, y * 0.2 + t * 0.05, 3);
        const k = smooth(fogTop, rows, y) * clamp(n + 0.35) * 0.35;
        if (k > 0.04) f.add(x, y, k, HUE.fg);
      }
    }

    // lightning bolt
    if (bolt) {
      bolt.life -= dt;
      if (bolt.life <= 0) bolt = null;
      else {
        for (let k = 1; k < bolt.pts.length; k++) {
          const [x0, y0] = bolt.pts[k - 1], [x1, y1] = bolt.pts[k];
          f.line(x0, y0, x1, y1, 1, HUE.white, "auto", ax);
        }
      }
    }
  },
};
