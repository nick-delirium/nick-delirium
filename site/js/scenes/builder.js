// BMSGroup: client brand websites generated on demand from a chat message.
import { HUE, rng, clamp, smooth, G } from "../engine/util.js";

// integer hash → [0,1) (local: Math.imul keeps it exact for large inputs)
function hh(n) {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const hh2 = (x, y) => hh(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663));

const BRANDS = ["neon_noodles", "kiber_kofe", "delta_vape", "nord_bikes", "luna_sushi", "pixel_barber", "volt_gym", "sakura_tea"];
const CYCLE = 10.5;
const TYPE_END = 1.8, BUILD_END = 6.4, HOLD_END = 9.4;

// 3x5 pixel font for brand headings
const FONT = {
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
  F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
  K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
  P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
  Z: "111001010100111", _: "000000000000111",
};

let layout = null;
let lastCycle = -1;

function buildLayout(seed, S) {
  const r = rng(seed * 7919 + 3);
  const brand = BRANDS[seed % BRANDS.length];
  const { cols, rows } = S;
  const narrow = cols < 70;
  const fx = 2, fy = 6, fw = cols - 4, fh = rows - fy - 2;
  const blocks = [];
  const iw = fw - 4; // inner width
  let y = fy + 3;
  const x0 = fx + 2;
  // navbar
  blocks.push({ type: "nav", x: x0, y, w: iw, h: 2 });
  y += 3;
  // hero
  const word = brand.split("_")[0].toUpperCase();
  const scale = narrow ? 1 : 2;
  const textW = word.length * 4 * scale;
  const heroH = 5 * scale + 6;
  if (!narrow && r() < 0.55 && textW < iw * 0.6) {
    blocks.push({ type: "bigtext", x: x0 + 1, y: y + 1, w: textW, h: 5 * scale, word, scale });
    blocks.push({ type: "lines", x: x0 + 1, y: y + 5 * scale + 2, w: Math.min(textW, iw * 0.45) | 0, h: 2 });
    const ix = x0 + textW + 4;
    blocks.push({ type: "img", x: ix, y, w: iw - (ix - x0), h: heroH });
  } else {
    const tw = Math.min(textW, iw);
    const s2 = textW > iw ? 1 : scale;
    const tw2 = word.length * 4 * s2;
    blocks.push({ type: "bigtext", x: x0 + Math.max(0, ((iw - tw2) / 2) | 0), y: y + 1, w: tw, h: 5 * s2, word, scale: s2 });
    blocks.push({ type: "lines", x: x0 + ((iw * 0.2) | 0), y: y + 5 * s2 + 2, w: (iw * 0.6) | 0, h: 2, center: true });
  }
  blocks.push({ type: "button", x: x0 + 1, y: y + heroH - 1, w: Math.min(16, iw), h: 3, label: r() < 0.5 ? "ORDER NOW" : "BOOK" });
  y += heroH + 3;
  // remaining sections until the frame is full
  let guard = 0;
  while (y < fy + fh - 5 && guard++ < 12) {
    const room = fy + fh - 2 - y;
    const pick = r();
    if (pick < 0.45 && room >= 9) {
      const n = narrow ? 2 : 3 + (r() < 0.3 ? 1 : 0);
      const gap = 2;
      const cw = Math.floor((iw - gap * (n - 1)) / n);
      const ch = Math.min(room - 1, 10 + ((r() * 3) | 0));
      for (let k = 0; k < n; k++) blocks.push({ type: "card", x: x0 + k * (cw + gap), y, w: cw, h: ch });
      y += ch + 2;
    } else if (pick < 0.7 && room >= 6) {
      const h = Math.min(room - 1, 6 + ((r() * 4) | 0));
      const half = Math.floor(iw * (0.4 + r() * 0.2));
      const imgLeft = r() < 0.5;
      blocks.push({ type: "img", x: imgLeft ? x0 : x0 + iw - half, y, w: half, h });
      blocks.push({ type: "lines", x: imgLeft ? x0 + half + 2 : x0, y: y + 1, w: iw - half - 2, h: Math.min(h - 1, 4) });
      y += h + 2;
    } else if (room >= 3) {
      blocks.push({ type: "lines", x: x0, y, w: iw, h: Math.min(room, 2 + ((r() * 2) | 0)) });
      y += 4;
    } else break;
  }
  blocks.push({ type: "footer", x: x0, y: fy + fh - 2, w: iw, h: 1 });
  return { brand, blocks, frame: { x: fx, y: fy, w: fw, h: fh }, seed, url: `https://${brand.replace("_", "-")}.site` };
}

function drawBlock(f, b, reveal, t, S) {
  // reveal: highest row (exclusive) that's printed
  const vis = (y) => y < reveal;
  const put = (x, y, v, hue, ch) => {
    if (vis(y)) f.set(x, y, v, hue, typeof ch === "string" ? G(ch) : ch);
  };
  switch (b.type) {
    case "nav": {
      const logo = "◆";
      put(b.x, b.y, 0.95, HUE.main, logo);
      for (let k = 0; k < 6; k++) put(b.x + 2 + k, b.y, 0.6, HUE.fg, "▀");
      const items = 3;
      for (let k = 0; k < items; k++) {
        const ix = b.x + b.w - (items - k) * 7;
        for (let j = 0; j < 5; j++) put(ix + j, b.y, 0.45, HUE.fg, "─");
      }
      for (let k = 0; k < b.w; k++) put(b.x + k, b.y + 1, 0.22, HUE.alt, "─");
      break;
    }
    case "bigtext": {
      let cx = b.x;
      const s = b.scale;
      for (const ch of b.word) {
        const bits = FONT[ch] || FONT._;
        for (let py = 0; py < 5; py++)
          for (let px = 0; px < 3; px++)
            if (bits[py * 3 + px] === "1")
              for (let sy = 0; sy < s; sy++)
                for (let sx = 0; sx < s; sx++) put(cx + px * s + sx, b.y + py * s + sy, 0.95, HUE.main, "█");
        cx += 4 * s;
      }
      break;
    }
    case "lines": {
      for (let j = 0; j < b.h; j++) {
        const len = Math.max(3, Math.round(b.w * (j === b.h - 1 ? 0.55 : 0.85 + hh(b.x * 31 + b.y * 7 + j) * 0.15)));
        const off = b.center ? Math.round((b.w - len) / 2) : 0;
        for (let k = 0; k < len; k++) {
          const word = hh(b.x + k * 13 + j * 101) > 0.16;
          if (word) put(b.x + off + k, b.y + j, 0.3, HUE.fg, "▒");
        }
      }
      break;
    }
    case "img": {
      if (b.w < 3 || b.h < 3) break;
      if (vis(b.y)) f.box(b.x, b.y, b.w, Math.min(b.h, Math.max(1, reveal - b.y)), HUE.alt, 0.6);
      const steps = Math.max(b.w, b.h);
      for (let s = 1; s < steps; s++) {
        const px = b.x + 1 + ((s / steps) * (b.w - 2)) | 0;
        const py = b.y + 1 + ((s / steps) * (b.h - 2)) | 0;
        put(px, py, 0.35, HUE.alt, "╲");
        put(b.x + b.w - 2 - (px - b.x - 1), py, 0.35, HUE.alt, "╱");
      }
      if (b.h > 4 && b.w > 10) for (let k = 0; k < 5; k++) put(b.x + 2 + k, b.y + b.h - 2, 0.5, HUE.fg, "[img]"[k]);
      break;
    }
    case "button": {
      if (b.w < 6) break;
      const hover = Math.sin(t * 3) > 0.6;
      if (vis(b.y)) f.box(b.x, b.y, b.w, Math.min(3, Math.max(1, reveal - b.y)), hover ? HUE.white : HUE.main, 0.85, true);
      const lx = b.x + Math.max(1, Math.round((b.w - b.label.length) / 2));
      for (let k = 0; k < b.label.length; k++) put(lx + k, b.y + 1, 0.95, hover ? HUE.white : HUE.main, b.label[k]);
      break;
    }
    case "card": {
      if (b.w < 5) break;
      if (vis(b.y)) f.box(b.x, b.y, b.w, Math.min(b.h, Math.max(1, reveal - b.y)), HUE.fg, 0.4);
      const ih = Math.max(2, Math.round(b.h * 0.45));
      for (let y = b.y + 1; y < b.y + ih; y++)
        for (let x = b.x + 1; x < b.x + b.w - 1; x++) put(x, y, 0.16 + ((x + y) % 2) * 0.1, HUE.alt, "░");
      for (let j = 0; j < 2; j++) {
        const len = Math.round((b.w - 4) * (j ? 0.6 : 0.9));
        for (let k = 0; k < len; k++) put(b.x + 2 + k, b.y + ih + 1 + j, j ? 0.25 : 0.5, j ? HUE.fg : HUE.white, j ? "▒" : "▀");
      }
      if (b.h - ih > 4) put(b.x + 2, b.y + b.h - 2, 0.8, HUE.main, "→");
      break;
    }
    case "footer": {
      for (let k = 0; k < b.w; k += 2) put(b.x + k, b.y, 0.25, HUE.fg, "·");
      break;
    }
  }
}

export default {
  id: "builder",
  title: "SITE_FORGE",
  caption: "text a brand name, get a website // bms loyalty",

  init(f, S) {
    lastCycle = -1;
    layout = null;
    f.clear();
  },

  frame(f, t, dt, S) {
    const { cols, rows } = S;
    const cyc = Math.floor(t / CYCLE);
    const p = t - cyc * CYCLE;
    if (cyc !== lastCycle || !layout) {
      layout = buildLayout(cyc + 1, S);
      lastCycle = cyc;
    }
    f.clear();
    const { frame: fr, blocks, brand, url } = layout;

    // chat bubble with the incoming request
    const msg = `> build site --brand ${brand}`;
    const typed = Math.floor(clamp(p / TYPE_END) * msg.length);
    const bw = Math.min(cols - 4, Math.max(msg.length + 4, 24));
    const text = msg.slice(0, typed);
    f.box(2, 1, bw, 3, HUE.alt, 0.7);
    f.set(4, 4, 0.7, HUE.alt, G("╲"));
    const shown = text.length > bw - 4 ? text.slice(text.length - (bw - 4)) : text;
    f.text(4, 2, shown, HUE.white, 0.95);
    if (p < TYPE_END + 0.6 && Math.floor(t * 4) % 2 === 0) f.set(4 + shown.length, 2, 0.9, HUE.main, G("█"));
    f.text(2, 0, `msg://client_0${(cyc % 89) + 10} · whatsapp`, HUE.fg, 0.45);
    if (p > TYPE_END) f.text(bw - 3, 4, p > BUILD_END ? "◆◆" : "◆", HUE.alt, 0.6);

    // browser frame
    const top = fr.y + fr.h;
    const buildP = smooth(TYPE_END, BUILD_END, p);
    const frameOn = p > TYPE_END - 0.3;
    if (!frameOn) return;
    const reveal = Math.floor(fr.y + 2 + buildP * (fr.h - 1)) + (p > BUILD_END ? 999 : 0);
    f.box(fr.x, fr.y, fr.w, fr.h, HUE.fg, 0.5);
    f.text(fr.x + 2, fr.y + 1, "● ● ●", HUE.hot, 0.55);
    const u = url.length > fr.w - 12 ? url.slice(8) : url;
    if (fr.w > 20) f.text(fr.x + 9, fr.y + 1, u.slice(0, fr.w - 12), HUE.fg, 0.55);
    for (let k = 1; k < fr.w - 1; k++) f.set(fr.x + k, fr.y + 2, 0.3, HUE.fg, G("─"));

    for (const b of blocks) drawBlock(f, b, reveal, t, S);

    // printer head
    if (p > TYPE_END && p < BUILD_END) {
      const hy = reveal;
      for (let x = fr.x + 1; x < fr.x + fr.w - 1; x++) {
        f.set(x, hy, 0.9, HUE.white, G("▀"));
        if (hh(x * 17 + Math.floor(t * 30)) > 0.93) f.set(x, hy + 1, 0.7, HUE.hot, G("·"));
      }
      f.set(fr.x, hy, 1, HUE.main, G("▶"));
      f.set(fr.x + fr.w - 1, hy, 1, HUE.main, G("◀"));
      const pct = `${Math.round(buildP * 100)}%`;
      f.text(fr.x + fr.w - pct.length - 2, Math.min(top - 1, hy + 1), pct, HUE.main, 0.9);
    }

    // status line
    if (p > BUILD_END && p < HOLD_END) {
      const status = `deploy: ok · ${(2 + (cyc % 7) * 0.3).toFixed(1)}s · ${brand}`;
      f.text(fr.x + 2, Math.min(rows - 1, top), status.slice(0, fr.w - 4), HUE.main, 0.8);
    }

    // glitch dissolve
    if (p > HOLD_END) {
      const q = (p - HOLD_END) / (CYCLE - HOLD_END);
      const tick = Math.floor(t * 20);
      const NOISE = "!<>-_\\/[]{}=+*^?#░▒";
      for (let y = fr.y; y < Math.min(rows, top + 1); y++) {
        const rowShift = hh(y * 13 + tick) < q * 0.3 ? Math.round((hh(y + tick * 7) - 0.5) * 8) : 0;
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const h = hh(i * 3 + 11);
          if (h < q) {
            if (hh(i + tick * 131) < 0.08 * (1 - q)) {
              f.set(x, y, 0.6, hh(i) < 0.2 ? HUE.hot : HUE.alt, G(NOISE[(hh(i + tick) * NOISE.length) | 0]));
            } else f.set(x, y, 0);
          } else if (rowShift && x + rowShift >= 0 && x + rowShift < cols) {
            const j = y * cols + x + rowShift;
            f.v[i] = f.v[j];
            f.h[i] = HUE.alt;
            f.g[i] = f.g[j];
          }
        }
      }
    }
  },
};
