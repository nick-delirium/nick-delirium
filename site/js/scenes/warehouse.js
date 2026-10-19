// OZON: secure delivery + warehouse management → isometric fulfilment floor.
import { HUE, rng, clamp, smooth, G } from "../engine/util.js";

// integer hash → [0,1)
function hh(n) {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

let W = {}; // world config
let boxes = [];
let r = rng(5);
let shipped = 0;

function newBox(lane, x) {
  const s = 0.9 + r() * 0.9;
  return {
    lane,
    x,
    w: s + r() * 0.6, // along x
    d: Math.min(1.25, 0.7 + r() * 0.5), // along y
    h: 0.6 + r() * 1.1,
    sku: `SKU-${((r() * 90) | 0) + 10}${"ABCDEFHKMX"[(r() * 10) | 0]}${(r() * 9) | 0}`,
    otp: String(1000 + ((r() * 8999) | 0)),
    scanned: -1,
    hue: r() < 0.18 ? HUE.alt : HUE.main,
  };
}

export default {
  id: "warehouse",
  title: "FULFILMENT_FLOOR",
  caption: "every parcel signed, scanned, sealed // ozon wms",

  init(f, S) {
    r = rng(5);
    const portrait = S.cols / (S.rows / S.ax) < 1;
    const L = portrait ? 13 : 24; // lane length (world x)
    const lanes = 3;
    const D = 3 + lanes * 3; // floor depth (world y)
    const rack = 4.2;
    const levels = portrait ? clamp(Math.round((S.rows / S.ax / S.cols) * 1.3), 2, 3) : 1;
    // iso fit: width = (L + D) * u * c30, height = ((L + D) * 0.5 + rack + (levels - 1) * Hl) * u * ax
    const c30 = Math.cos(Math.PI / 6);
    const uw = (S.cols * 0.94) / ((L + D) * c30);
    const Hl = levels > 1 ? Math.max(5.5, ((S.rows * 0.84) / (uw * S.ax) - ((L + D) * 0.5 + rack)) / (levels - 1)) : 0;
    const tall = rack + (levels - 1) * Hl;
    const u = Math.min(uw, (S.rows * 0.84) / (((L + D) * 0.5 + tall) * S.ax));
    const ox = S.cols / 2 - ((L - D) / 2) * u * c30;
    const oy = S.rows / 2 - (((L + D) * 0.5 - tall) * u * S.ax) / 2 + 1;
    W = { L, D, lanes, levels, Hl, u, c30, ox, oy, ax: S.ax, rack, gate: Math.round(L * 0.62), laneY: [] };
    for (let k = 0; k < lanes; k++) W.laneY.push(3.2 + k * 3);
    boxes = [];
    for (let k = 0; k < lanes * levels; k++) {
      let x = -2 - r() * 4;
      while (x < L) {
        boxes.push(newBox(k, x));
        x += 3.5 + r() * 4;
      }
    }
    f.clear();
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const { L, D, u, c30, ox, oy, lanes, levels, Hl, laneY, gate, rack } = W;
    let zo = 0;
    f.clear();
    const intro = smooth(0, 1.2, t);
    const P = (x, y, z) => [ox + (x - y) * u * c30, oy + ((x + y) * 0.5 * u - (z + zo) * u) * ax];
    const line3 = (a, b, v, hue, g = "·") => {
      const p = P(...a), q = P(...b);
      f.line(p[0], p[1], q[0], q[1], v, hue, G(g), ax);
    };
    const quad = (pts, v, hue, glyph = -1) => f.poly(pts.map((p) => P(...p)), v, hue, glyph);

    const labels = [], tags = [];
    for (let lvl = 0; lvl < levels; lvl++) {
      zo = lvl * Hl;
      if (lvl > 0) {
        // mezzanine slab edge + support columns
        zo = 0;
        for (const [cx, cy] of [[L, D], [0, D], [L, 0]]) line3([cx, cy, (lvl - 1) * Hl], [cx, cy, lvl * Hl], 0.3, HUE.fg, "│");
        zo = lvl * Hl;
        line3([0, D, 0], [L, D, 0], 0.4, HUE.alt, "─");
        line3([L, 0, 0], [L, D, 0], 0.35, HUE.alt);
      }
      // floor grid dots, revealed diagonally
      for (let x = 0; x <= L; x++) {
        for (let y = 0; y <= D; y++) {
          if ((x + y) / (L + D) > intro * 1.2) continue;
          const [sx, sy] = P(x, y, 0);
          f.plot(sx, sy, 0.16, HUE.fg, G(x % 4 === 0 && y % 3 === 0 ? "+" : "·"));
        }
      }

      // back racks along y = 0..1.2, with shelves, stock and blinking status lights
      const racks = Math.floor(L / 3);
      for (let k = 0; k < racks; k++) {
        const x0 = 0.4 + k * 3, x1 = x0 + 2.6;
        const y0 = 0.2, y1 = 1.3;
        const vis = intro > k / racks ? 1 : 0;
        if (!vis) continue;
        for (const [px, py] of [[x0, y1], [x1, y1], [x0, y0], [x1, y0]]) line3([px, py, 0], [px, py, rack], py === y1 ? 0.45 : 0.25, HUE.fg, "│");
        for (let s = 1; s <= 3; s++) {
          const z = (s / 3) * rack * 0.92;
          line3([x0, y1, z], [x1, y1, z], 0.4, HUE.fg);
          // stock on the shelf
          const seed = k * 7 + s;
          const n = 1 + Math.floor(hh(seed) * 3);
          for (let b = 0; b < n; b++) {
            const bx = x0 + 0.3 + b * 0.8;
            const bh = 0.5 + hh(seed * 3 + b) * 0.5;
            quad([[bx, y1 - 0.2, z - rack * 0.3 + bh], [bx + 0.6, y1 - 0.2, z - rack * 0.3 + bh], [bx + 0.6, y1 - 0.2, z - rack * 0.3], [bx, y1 - 0.2, z - rack * 0.3]], 0.3, HUE.fg, G("▒"));
          }
          // status LED
          const blink = Math.sin(t * (2 + hh(seed) * 3) + seed) > 0.2;
          const [lx, ly] = P(x1 - 0.2, y1, z - 0.25);
          f.set(lx, ly, blink ? 0.95 : 0.3, hh(seed + 9) < 0.2 ? HUE.hot : HUE.alt, G("•"));
        }
        line3([x0, y1, rack], [x1, y1, rack], 0.5, HUE.alt);
        if (cols > 60) {
          const [tx, ty] = P(x0 + 0.2, y1, rack + 0.6);
          f.text(tx, ty, `R${String(k + 1).padStart(2, "0")}`, HUE.alt, 0.5 * intro);
        }
      }

        // lanes, back to front
      for (let k = 0; k < lanes; k++) {
        const ly = laneY[k];
        const half = 0.8;
        const bz = 0.35;
        // belt surface and edges
        quad([[0, ly - half, bz], [L, ly - half, bz], [L, ly + half, bz], [0, ly + half, bz]], 0.14, HUE.fg, G("░"));
        line3([0, ly - half, bz], [L, ly - half, bz], 0.35, HUE.fg);
        line3([0, ly + half, bz], [L, ly + half, bz], 0.6, HUE.main, "─");
        line3([0, ly + half, 0], [L, ly + half, 0], 0.22, HUE.fg);
        // moving chevrons
        const off = (t * 1.6) % 1.5;
        for (let x = off; x < L; x += 1.5) {
          const [sx, sy] = P(x, ly, bz);
          f.set(sx, sy, 0.45 * intro, HUE.alt, G("↘"));
        }
        labels.push([...P(0, ly + half + 0.5, 0), `${levels > 1 ? `L${lvl + 1}·` : ""}LANE_0${k + 1}`]);

        // gate: back post
        const gz = 2.6;
        line3([gate, ly - half - 0.3, 0], [gate, ly - half - 0.3, gz], 0.6, HUE.fg, "│");

        // boxes on this lane
        const lb = boxes.filter((b) => b.lane === lvl * lanes + k).sort((a, b) => a.x - b.x);
        for (const b of lb) {
          if (b.x > L + 1 || b.x + b.w < -1) continue;
          const x0 = Math.max(0, b.x), x1 = Math.min(L, b.x + b.w);
          if (x1 - x0 < 0.15) continue;
          const y0 = ly - b.d / 2, y1 = ly + b.d / 2;
          const z0 = bz, z1 = bz + b.h;
          const flash = b.scanned >= 0 && t - b.scanned < 0.8;
          const top = flash ? HUE.white : b.hue;
          // right face (x = x1), left face (y = y1), top
          quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], 0.32, b.hue, G("▒"));
          quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], 0.55, b.hue, G("▓"));
          quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], flash ? 1 : 0.82, top, G("█"));
          // vertical front edge + tape seam
          line3([x1, y1, z1], [x1, y1, z0], 0.75, HUE.white, "│");
          line3([(x0 + x1) / 2, y0, z1], [(x0 + x1) / 2, y1, z1], 0.7, HUE.hot, "▪");
          if (flash && cols > 50) tags.push([...P(x1, y0, z1 + 1.1), b]);
        }

        // laser sheet + front post + beam
        const lit = lb.some((b) => b.x < gate && b.x + b.w > gate);
        const flick = 0.55 + 0.45 * Math.sin(t * 40 + k);
        for (let z = 0.4; z < gz; z += 0.18) {
          const [ax0, ay0] = P(gate, ly - half - 0.3, z);
          const [ax1, ay1] = P(gate, ly + half + 0.3, z);
          if (Math.abs(((z * 10) | 0) % 3) === 0) f.line(ax0, ay0, ax1, ay1, (lit ? 0.9 : 0.35) * flick * intro, HUE.hot, G("·"), ax);
        }
        line3([gate, ly + half + 0.3, 0], [gate, ly + half + 0.3, gz], 0.85, HUE.main, "│");
        line3([gate, ly - half - 0.3, gz], [gate, ly + half + 0.3, gz], 0.85, HUE.main);
        const [bx, by] = P(gate, ly + half + 0.3, gz);
        f.set(bx, by, 1, lit ? HUE.hot : HUE.main, G("◆"));
      }
    }
    zo = 0;

    // advance boxes
    const speed = 1.6;
    for (const b of boxes) {
      const px = b.x;
      b.x += speed * dt;
      if (px + b.w * 0.5 < gate && b.x + b.w * 0.5 >= gate) {
        b.scanned = t;
        shipped++;
      }
      if (b.x > L + 1.5) {
        const lane = b.lane;
        const minX = Math.min(...boxes.filter((o) => o.lane === lane).map((o) => o.x));
        Object.assign(b, newBox(lane, Math.min(-2, minX - 3.5 - r() * 4)));
      }
    }

    // HUD
    const hv = 0.85 * intro;
    const label = (x, y, str, hue, v) => {
      for (let i = -1; i <= str.length; i++) f.set(x + i, y, 0);
      f.text(x, y, str, hue, v);
    };
    for (const [lx, ly, str] of labels) if (lx > 9) label(Math.round(lx - 9), Math.round(ly), str, HUE.fg, 0.6 * intro);
    for (const [tx, ty, b] of tags) {
      label(Math.round(tx - 2), Math.round(ty), `[OK] OTP ${b.otp}`, HUE.white, 0.95);
      label(Math.round(tx - 2), Math.round(ty) + 1, b.sku, HUE.alt, 0.7);
    }
    f.text(2, 1, "OZON//WMS  NODE SPB-07", HUE.alt, hv);
    f.text(2, 2, `THROUGHPUT ${(1284 + shipped).toLocaleString("en-US")}/h`, HUE.main, hv);
    if (rows > 30) f.text(2, 3, `SECURE DELIVERY · OTP ${shipped % 2 ? "ARMED" : "VERIFIED"}`, HUE.fg, hv * 0.6);
    const last = boxes.filter((b) => b.scanned >= 0).sort((a, b) => b.scanned - a.scanned)[0];
    if (last && cols > 40) {
      const s = `LAST ${last.sku} → BAY ${String((last.lane + 1) * 7).padStart(2, "0")}`;
      f.text(Math.max(2, cols - s.length - 2), rows - 2, s, HUE.fg, hv * 0.7);
    }
  },
};
