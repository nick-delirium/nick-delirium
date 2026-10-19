// The dark tower and its burning eye. The eye scans the plain (or follows the cursor), a faint
// search beam sweeps the ground, the volcano smoulders, storm clouds roll, ash and embers rise.
import { HUE, clamp, smooth, noise2, hash1, hash2, rng, G } from "../engine/util.js";

let portrait, m, ex, ey, rx, ryR, groundY, towerX, tTop, mask, edge, crack;
let cw, chh, cloud, parts, R, scan, bolt, nextBolt, flash, colE, colD;
let doomX, doomPeak, doomW, lava;

const EDGE_SOFT = G("▒"), EDGE_HARD = G("▓"), WIN = G("▪"), RIB = G("│");

function setMask(cols, rows, x, y, v) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= cols || y >= rows) return;
  const i = y * cols + x;
  if (!mask[i] || v === 1) mask[i] = v;
}

function spawn(p, cols, rows, fresh) {
  const fromDoom = R() < 0.45;
  p.x = fromDoom ? doomX + (R() - 0.5) * doomW * 0.25 : R() * cols;
  p.y = fromDoom ? doomPeak + R() * 3 : groundY + R() * (rows - groundY);
  if (fresh) p.y = R() * rows;
  p.vy = -(3 + R() * 6);
  p.ph = R() * 6.28;
  p.life = 3 + R() * 4;
  p.ember = fromDoom || R() < 0.5;
}

export default {
  id: "sauron",
  title: "BARAD_DUR",
  caption: "a tower, a fire, a gaze across the plain",

  init(f, S) {
    const { cols, rows, ax } = S;
    R = rng(1954);
    portrait = rows / ax > cols * 1.1;
    m = Math.min(cols, rows / ax);
    towerX = cols * (portrait ? 0.54 : 0.6);
    groundY = Math.round(rows * (portrait ? 0.86 : 0.83));
    ex = towerX;
    ey = rows * (portrait ? 0.19 : 0.21);
    rx = m * (portrait ? 0.17 : 0.13);
    ryR = rx * 0.5 * ax;
    tTop = ey + ryR * 1.7;
    mask = new Uint8Array(cols * rows);
    edge = new Uint8Array(cols * rows);
    crack = new Uint8Array(cols * rows);

    // ── the tower: tapering body with flared, spiked ledges ──
    const topW = rx * 0.42, baseW = m * (portrait ? 0.27 : 0.2);
    const ledges = [0.16, 0.36, 0.58, 0.79];
    for (let y = Math.floor(tTop); y <= groundY; y++) {
      const u = (y - tTop) / (groundY - tTop);
      let hw = topW + (baseW - topW) * Math.pow(u, 1.8);
      for (const uk of ledges) {
        const b = (u - uk) / 0.022;
        hw += rx * 0.32 * (1 - uk * 0.3) * Math.exp(-b * b);
      }
      if (hash1(y * 7 + 3) < 0.22) hw -= 1;
      for (let x = Math.floor(towerX - hw); x <= Math.ceil(towerX + hw); x++) setMask(cols, rows, x, y, 1);
    }
    // horns that cradle the eye
    for (const side of [-1, 1]) {
      const p0x = towerX + side * topW * 0.9, p0y = tTop;
      const p1x = towerX + side * rx * 1.6, p1y = ey + ryR * 0.3;
      const p2x = towerX + side * rx * 1.02, p2y = ey - ryR * 2.5;
      const steps = 220;
      for (let k = 0; k <= steps; k++) {
        const s = k / steps, a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c = s * s;
        const px = a * p0x + b * p1x + c * p2x, py = a * p0y + b * p1y + c * p2y;
        const th = topW * 0.55 * (1 - s) + 0.5;
        for (let dy = -Math.ceil(th * ax); dy <= Math.ceil(th * ax); dy++)
          for (let dx = -Math.ceil(th); dx <= Math.ceil(th); dx++)
            if (dx * dx + (dy / ax) * (dy / ax) <= th * th) setMask(cols, rows, px + dx, py + dy, 1);
      }
    }
    // flanking spires
    for (const side of [-1, 1]) {
      const sx = towerX + side * baseW * 1.3;
      const sh = (groundY - tTop) * (portrait ? 0.32 : 0.38);
      for (let y = Math.floor(groundY - sh); y <= groundY; y++) {
        const u = (y - (groundY - sh)) / sh;
        const hw = baseW * 0.2 * Math.pow(u, 0.8) + (hash1(y * 13 + side) < 0.2 ? 0.5 : 0);
        for (let x = Math.floor(sx - hw); x <= Math.ceil(sx + hw); x++) setMask(cols, rows, x, y, 1);
      }
    }

    // ── the volcano ──
    doomX = cols * (portrait ? 0.12 : 0.17);
    doomW = m * (portrait ? 0.32 : 0.34);
    doomPeak = groundY - rows * (portrait ? 0.2 : 0.3);
    const doomTop = (x) => {
      const q = Math.abs(x - doomX) / doomW;
      let y = doomPeak + Math.pow(q, 0.85) * (groundY - doomPeak) + (hash1(Math.round(x) * 5) - 0.5) * 1.2;
      if (q < 0.07) y += 1.5;
      return y;
    };
    for (let x = Math.max(0, Math.floor(doomX - doomW)); x <= Math.min(cols - 1, Math.ceil(doomX + doomW)); x++) {
      for (let y = Math.round(doomTop(x)); y <= groundY; y++) setMask(cols, rows, x, y, 2);
    }
    // a distant jagged ridge along the horizon
    for (let x = 0; x < cols; x++) {
      const h = rows * 0.04 * (0.35 + 0.65 * (noise2(x * 0.035, 3.3) * 0.5 + 0.5)) + noise2(x * 0.3, 7.7) * 0.8;
      for (let y = Math.round(groundY - h); y <= groundY; y++) setMask(cols, rows, x, y, 3);
    }
    // edges: solid cells touching open sky
    const solid = (x, y) => y > groundY || (x >= 0 && x < cols && y >= 0 && mask[y * cols + x] > 0) || x < 0 || x >= cols;
    for (let y = 0; y <= groundY; y++)
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (mask[i] && (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1))) edge[i] = 1;
      }

    // lava: from the crater down the near slope, then across the plain toward the tower
    lava = [];
    for (let k = 0; k <= 80; k++) {
      const s = k / 80;
      const x = doomX + s * doomW * 0.95 + Math.sin(s * 11) * 1.2;
      lava.push([x, doomTop(x) + 0.6]);
    }
    const lx0 = doomX + doomW * 0.95, lx1 = towerX - baseW * 1.1;
    for (let k = 0; k <= 120; k++) {
      const s = k / 120;
      lava.push([lx0 + (lx1 - lx0) * s, groundY + 1.5 + (rows - groundY) * 0.35 * Math.sin(s * Math.PI) + Math.sin(s * 23) * 0.6]);
    }
    // ground cracks
    for (let y = groundY + 1; y < rows; y++)
      for (let x = 0; x < cols; x++)
        if (Math.abs(noise2(x * 0.07, y * 0.33)) < 0.035) crack[y * cols + x] = 1;

    // per-column glow terms, so the per-cell loop is just adds and one divide
    colE = new Float32Array(cols);
    colD = new Float32Array(cols);
    for (let x = 0; x < cols; x++) {
      const a = (x - ex) / rx, b = (x - doomX) / (doomW * 0.8);
      colE[x] = a * a * 0.2;
      colD[x] = b * b;
    }
    cw = Math.ceil(cols / 2);
    chh = Math.ceil((groundY + 1) / 2);
    cloud = new Float32Array(cw * chh);
    parts = [];
    const n = Math.round((cols * rows) / 110);
    for (let k = 0; k < n; k++) {
      const p = {};
      spawn(p, cols, rows, true);
      parts.push(p);
    }
    scan = 0;
    bolt = null;
    nextBolt = 4 + R() * 4;
    flash = 0;
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gg = f.g;
    const intro = smooth(0, 1.4, t);

    // gaze: slow patrol, or the cursor when it is over the panel
    const target = input.inside ? clamp((input.x - ex) / (cols * 0.45), -1, 1) : Math.sin(t * 0.32) * 0.9;
    scan += (target - scan) * Math.min(1, dt * (input.inside ? 3 : 1.5));
    const pupilX = scan * 0.24;
    const pw = 0.1 + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.5 + Math.sin(t * 0.13) * 2));

    // lightning
    if (t > nextBolt) {
      nextBolt = t + 5 + R() * 8;
      let bx = R() < 0.5 ? cols * (0.05 + R() * 0.3) : cols * (0.68 + R() * 0.28);
      if (Math.abs(bx - ex) < rx * 2) bx += rx * 3;
      const pts = [];
      let by = 0;
      while (by < groundY * 0.45) {
        pts.push([bx, by]);
        bx += (R() - 0.5) * 5;
        by += 1 + R() * 2.5;
      }
      bolt = { pts, life: 0.22 };
      flash = 1;
    }
    flash = Math.max(0, flash - dt * 3);

    // ── storm clouds at half resolution ──
    const kx = 2.6 / m, ky = (5.5 * ax) / m;
    for (let j = 0; j < chh; j++)
      for (let i = 0; i < cw; i++) {
        const X = i * 2, Y = j * 2;
        cloud[j * cw + i] = noise2(X * kx + t * 0.05, Y * ky - t * 0.012) * 0.65 + noise2(X * kx * 2.3 - t * 0.08, Y * ky * 2.3 + 4) * 0.35;
      }

    const doomR = rows * 0.28;
    const ribX = Math.round(towerX) % 4;
    for (let y = 0, i = 0; y < rows; y++) {
      const lightY = 0.3 + 0.7 * Math.pow(Math.min(1, y / groundY), 1.5);
      const ry = (y - ey) / ryR, rowE = ry * ry * 0.06;
      const rd = (y - doomPeak) / doomR, rowD = rd * rd;
      const pyN = (doomPeak - y) / doomR;
      const plume = pyN > 0 && pyN < 1.6;
      const plumeX = doomX + pyN * doomW * 0.35 + Math.sin(pyN * 3 + t * 0.4) * 2;
      const plumeW = 2 + pyN * doomW * 0.25;
      for (let x = 0; x < cols; x++, i++) {
        let v = 0, hue = HUE.fg, g = -1;
        const mk = mask[i];
        if (y > groundY) {
          // the plain: ash texture, glowing cracks
          v = hash2(x, y) < 0.3 ? 0.05 : 0.025;
          if (crack[i]) {
            v = 0.14 + 0.1 * (0.5 + 0.5 * Math.sin(t * 2 + x * 0.3));
            hue = HUE.hot;
          }
        } else if (mk) {
          if (edge[i]) {
            const dE = ((x - ex) / (rx * 3.2)) ** 2 + ((y - ey) / (ryR * 9)) ** 2;
            const eye = 1 / (1 + dE);
            if (mk === 1) {
              v = 0.1 + 0.62 * eye * Math.sqrt(eye);
              hue = eye > 0.3 ? HUE.hot : HUE.fg;
            } else if (mk === 2) {
              const dD = ((x - doomX) / (doomW * 0.5)) ** 2 + ((y - doomPeak) / (doomR * 0.6)) ** 2;
              v = 0.08 + 0.55 / (1 + dD * 6);
              hue = v > 0.22 ? HUE.hot : HUE.fg;
            } else {
              v = 0.1;
              g = G("▄");
            }
            v += flash * 0.35;
            if (flash > 0.6) hue = HUE.white;
            if (g < 0) g = v > 0.4 ? EDGE_HARD : EDGE_SOFT;
          } else if (mk === 1 && hash2(x * 3, y) < 0.012) {
            v = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.3 + x));
            hue = HUE.hot;
            g = WIN;
          } else if (mk === 1 && x % 4 === ribX && y > tTop + 2) {
            v = 0.05;
            g = RIB;
          }
        } else {
          // sky: dark rolling clouds, lit from below by fire and by the eye
          const c = cloud[(y >> 1) * cw + (x >> 1)];
          const cl = clamp(c * 1.5 + 0.05);
          const eg = 1 / (1 + colE[x] + rowE);
          const dg = 0.9 / (1 + (colD[x] + rowD) * 3);
          v = 0.24 * cl * cl * (lightY + eg * 1.8 + dg) + 0.05 * eg + flash * 0.18 * cl;
          hue = eg + dg > 0.45 ? HUE.hot : HUE.fg;
          // smoke plume over the crater
          if (plume) {
            const q = Math.abs(x - plumeX) / plumeW;
            if (q < 1) {
              const s = (1 - q) * (1 - pyN / 1.6) * (0.6 + 0.4 * noise2(x * 0.2, y * 0.3 - t * 0.6));
              v += s * 0.18;
            }
          }
        }
        V[i] = v * intro;
        H[i] = hue;
        Gg[i] = g;
      }
    }

    // ── search beam across the plain ──
    const gx = ex + scan * cols * 0.5, gy = groundY + (rows - groundY) * 0.5;
    const y0 = Math.ceil(ey + ryR * 1.2);
    for (let y = y0; y < rows && y <= gy + 2; y++) {
      const tt = (y - y0) / Math.max(1, gy - y0);
      const cxl = ex + (gx - ex) * tt;
      const hwid = 0.8 + tt * cols * 0.05;
      for (let x = Math.max(0, Math.floor(cxl - hwid)); x <= Math.min(cols - 1, Math.ceil(cxl + hwid)); x++) {
        const i = y * cols + x;
        if (mask[i]) continue;
        const k = 1 - Math.abs(x - cxl) / hwid;
        if (k <= 0) continue;
        const add = 0.09 * k * (0.35 + 0.65 * tt) * intro;
        V[i] += add;
        if (add > 0.03) H[i] = HUE.main;
      }
    }
    const spotW = cols * 0.07, spotH = (rows - groundY) * 0.35;
    for (let y = Math.max(groundY + 1, Math.floor(gy - spotH)); y <= Math.min(rows - 1, Math.ceil(gy + spotH)); y++)
      for (let x = Math.max(0, Math.floor(gx - spotW)); x <= Math.min(cols - 1, Math.ceil(gx + spotW)); x++) {
        const d = ((x - gx) / spotW) ** 2 + ((y - gy) / spotH) ** 2;
        if (d < 1) {
          const i = y * cols + x;
          V[i] = Math.max(V[i], (0.12 + 0.22 * (1 - d)) * intro);
          H[i] = HUE.main;
        }
      }

    // ── lava ──
    for (let k = 0; k < lava.length; k++) {
      const [lx, ly] = lava[k];
      const fl = 0.55 + 0.35 * Math.sin(t * 3 - k * 0.35) + 0.1 * hash1(k + Math.floor(t * 8) * 131);
      f.plot(lx, ly, fl * intro, fl > 0.75 ? HUE.main : HUE.hot, k < 81 ? -1 : G("~"));
    }

    // ── ash and embers ──
    for (const p of parts) {
      p.life -= dt;
      p.y += p.vy * dt;
      p.x += Math.sin(t * 0.8 + p.ph) * dt * 2 + dt * 1.2;
      if (p.life <= 0 || p.y < 0 || p.x > cols) spawn(p, cols, rows, false);
      const fade = clamp(p.life / 1.5);
      if (p.ember) f.plot(p.x, p.y, (0.45 + 0.4 * fade) * intro, fade > 0.6 ? HUE.main : HUE.hot, G(p.vy < -6 ? "•" : "·"));
      else f.plot(p.x, p.y, 0.14 * fade * intro, HUE.fg, G("."));
    }

    // ── the eye ──
    const bx0 = Math.max(0, Math.floor(ex - rx * 1.8)), bx1 = Math.min(cols - 1, Math.ceil(ex + rx * 1.8));
    const by0 = Math.max(0, Math.floor(ey - ryR * 3.4)), by1 = Math.min(rows - 1, Math.ceil(ey + ryR * 1.6));
    for (let y = by0; y <= by1; y++) {
      const dy = (y - ey) / ryR;
      for (let x = bx0; x <= bx1; x++) {
        const dx = (x - ex) / rx;
        const dyA = dy / Math.max(0.2, 1 - 0.5 * dx * dx);
        const d = Math.sqrt(dx * dx + dyA * dyA);
        const i = y * cols + x;
        const ang = Math.atan2(dy, dx);
        const edgeR = 1 + noise2(ang * 2.3 + 11, t * 1.7) * 0.14 + noise2(dx * 3, dy * 3 - t * 3) * 0.08;
        let v = -1, hue = HUE.hot;
        if (d < edgeR) {
          const ad = Math.abs(dx - pupilX);
          const slit = pw * Math.sqrt(Math.max(0, 1 - dy * dy * 0.92));
          if (ad < slit) v = 0;
          else {
            const k = ad - slit;
            const heat = Math.exp(-k * 3) * 0.6 + (1 - d / edgeR) * 0.3 + 0.36 + 0.14 * noise2(dx * 4 + t, dy * 4 - t * 2);
            v = clamp(heat);
            hue = heat > 0.88 ? HUE.white : heat > 0.58 ? HUE.main : HUE.hot;
            if (k < 0.05) {
              v = 0.3;
              hue = HUE.hot;
            }
          }
        } else {
          const up = dy < 0 ? -dy : 0;
          const n = noise2(dx * 2.2, dy * 2.2 + t * 2.6) * 0.5 + 0.5;
          const reach = 0.45 + 1.1 * up * n;
          const o = (d - edgeR) / reach;
          if (o < 1) {
            v = (1 - o) * (1 - o) * (0.7 * n + 0.25);
            hue = v > 0.5 ? HUE.main : HUE.hot;
          }
        }
        if (v >= 0 && (v > V[i] || v === 0 || mask[i])) {
          V[i] = v * intro;
          H[i] = hue;
          Gg[i] = -1;
        }
      }
    }

    // ── lightning ──
    if (bolt) {
      bolt.life -= dt;
      if (bolt.life <= 0) bolt = null;
      else for (let k = 1; k < bolt.pts.length; k++) f.line(bolt.pts[k - 1][0], bolt.pts[k - 1][1], bolt.pts[k][0], bolt.pts[k][1], 1, HUE.white, "auto", ax);
    }

    // ── HUD ──
    const line = "Mordor · the eye is watching";
    if (cols > line.length + 4) {
      for (let k = 0; k < line.length + 2; k++) f.set(1 + k, rows - 2, 0);
      f.text(2, rows - 2, line, HUE.fg, 0.42 * intro);
    }
  },
};
