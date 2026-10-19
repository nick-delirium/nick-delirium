// Fleet engagement in the spirit of Legend of the Galactic Heroes: two vast formations
// trade rippling beam salvos across the gap while a white flagship glides through the
// foreground. Slow, grand, sparse.
import { HUE, clamp, smooth, lerp, fbm2, hash1, rng, G, TAU } from "../engine/util.js";

const CYCLE = 26;
const CAM = 170;
const SALVO0 = 1.1;
const SALVO_GAP = 2.4;
const FLAG_T0 = -1.2;
const FLAG_DUR = 12.5;

let R, cols, rows, ax, portrait, scale, cx0, cy0;
let ships, total, beams, fx, debris, stars, neb, nebH, nebPad, nebW;
let cycleIdx, nextSalvo, salvoCount, yaw, pitch, cyw, syw, cp, sp;

const IMP = 0, ALL = 1;

function mk(fleet, sx, sy, sz) {
  return { fleet, sx, sy, sz, lat: clamp((sz + 30) / 60), alive: true, ph: R() * TAU, x: 0, y: 0, z: 0, col: 0, row: 0, k: 1, c: 0 };
}

function buildFleets() {
  ships = [];
  // Imperial: a crescent, horns reaching toward the enemy, in staggered layers
  const nTh = 22;
  for (let row = 0; row < 2; row++)
    for (let ly = 0; ly < 5; ly++)
      for (let i = 0; i < nTh; i++) {
        const th = -1.05 + (2.1 * i) / (nTh - 1);
        ships.push(mk(IMP, (1 - Math.cos(th)) * 14 - row * 4.5, (ly - 2) * 4 + (i % 2) * 1.6 + row * 1.8, 30 * Math.sin(th) + row * 1.2));
      }
  // Alliance: a disciplined block, three ranks deep
  for (let row = 0; row < 3; row++)
    for (let ly = 0; ly < 6; ly++)
      for (let i = 0; i < 13; i++) ships.push(mk(ALL, row * 4.2, -10 + ly * 4, -26 + i * 4.33 + (ly % 2) * 2.1));
  total = [2 * 5 * nTh, 3 * 6 * 13];
  beams = [];
  fx = [];
  debris = [];
  nextSalvo = 0;
}

function cam(x, y, z) {
  const x1 = x * cyw - z * syw, z1 = x * syw + z * cyw;
  return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}

/** world → [col, row, k, depth] */
function proj(x, y, z, out) {
  const [a, b, c] = cam(x, y, z);
  const k = CAM / (CAM + c);
  const sx = portrait ? b : a;
  const sy = portrait ? -a : b;
  out[0] = cx0 + sx * scale * k;
  out[1] = cy0 - sy * scale * k * ax;
  out[2] = k;
  out[3] = c;
  return out;
}

function buildBackdrop() {
  stars = [];
  const n = Math.round((cols * rows) / 85);
  for (let i = 0; i < n; i++) stars.push([R(), R(), R()]);
  // nebula band, precomputed once (wider than the screen so the camera can pan over it)
  nebPad = Math.ceil(cols * 0.2);
  nebW = cols + nebPad * 2;
  neb = new Float32Array(nebW * rows);
  nebH = new Uint8Array(nebW * rows);
  const physH = rows / ax;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < nebW; x++) {
      const px = (x - nebPad) / cols, py = y / ax / physH;
      // a soft diagonal band across the sky
      const d = portrait ? px * 0.55 + py * 0.9 - 0.75 : px * 0.35 - py * 0.9 + 0.12;
      const band = Math.exp(-(d * d) / 0.02);
      if (band < 0.01) continue;
      const n1 = fbm2(x * 0.035, y * 0.06, 4);
      const v = band * clamp(n1 + 0.2) * 0.1;
      if (v < 0.04 || hash1(x * 7 + y * 131) > v * 9) continue; // sparse dust, not a texture
      const i = y * nebW + x;
      neb[i] = v;
      nebH[i] = fbm2(x * 0.02 + 40, y * 0.03, 2) > 0 ? HUE.hot : HUE.alt;
    }
  }
}

function spawnSalvo(j, t) {
  const fleet = j % 2 === 0 ? IMP : ALL;
  const enemies = ships.filter((s) => s.alive && s.fleet !== fleet);
  if (!enemies.length) return;
  for (const s of ships) {
    if (!s.alive || s.fleet !== fleet || R() > 0.11) continue;
    // aim roughly across: prefer an enemy at a similar lateral position
    let best = enemies[(R() * enemies.length) | 0];
    for (let tries = 0; tries < 3; tries++) {
      const cand = enemies[(R() * enemies.length) | 0];
      if (Math.abs(cand.lat - s.lat) < Math.abs(best.lat - s.lat)) best = cand;
    }
    beams.push({
      t0: t + s.lat * 0.6 + R() * 0.08, // the ripple sweeps along the line
      dur: 0.55 + R() * 0.2,
      src: s,
      dst: best,
      fleet,
      jy: (R() - 0.5) * 1.6,
      jz: (R() - 0.5) * 1.6,
      hit: false,
    });
  }
  salvoCount++;
}

function explode(s, t) {
  s.alive = false;
  fx.push({ type: 1, x: s.x, y: s.y, z: s.z, t0: t });
  const n = 9 + ((R() * 6) | 0);
  for (let i = 0; i < n; i++) {
    const th = R() * TAU, ph = Math.acos(2 * R() - 1), sp2 = 2.5 + R() * 6;
    debris.push({
      x: s.x, y: s.y, z: s.z,
      vx: Math.sin(ph) * Math.cos(th) * sp2, vy: Math.cos(ph) * sp2, vz: Math.sin(ph) * Math.sin(th) * sp2,
      t0: t, life: 1 + R() * 1.1, g: G("*+·°'"[(R() * 5) | 0]),
    });
  }
}

const BLOCKS = [G("░"), G("▒"), G("▓"), G("█")];
const blockGlyph = (v) => BLOCKS[v > 0.8 ? 3 : v > 0.58 ? 2 : v > 0.36 ? 1 : 0];

// ── flagship: smooth white hull, swept fins, engine plume. u along the hull (0 tail → 1 nose), w across (up +)
function hull(s, w, L, t) {
  if (s < -0.24 || s > 1) return null;
  const body = s >= 0 ? 0.074 * Math.sqrt(Math.max(0, 1 - ((s - 0.43) / 0.57) ** 2)) * (1 - 0.45 * smooth(0.72, 1, s)) : 0;
  const camber = 0.024 * Math.sin(Math.PI * Math.max(0, s)) - 0.008;
  const top = camber + body, bot = camber - body * 0.78;
  if (s >= 0 && w <= top && w >= bot && body > 0.004) {
    const m = (w - (top + bot) / 2) / ((top - bot) / 2);
    let v = 0.22 + 0.5 * Math.sqrt(Math.max(0, 1 - m * m)) + 0.28 * Math.max(0, m);
    let hue = HUE.white;
    if (m > 0.42 && m < 0.72 && s > 0.12 && s < 0.92) v = 0.97; // specular streak along the spine
    if (Math.abs(m) > 0.88) v *= 0.7;
    const panel = s * 22 - Math.floor(s * 22);
    if (panel < 0.07 && Math.abs(m) < 0.8) v *= 0.55;
    if (L > 70 && Math.abs(m + 0.18) < 0.09 && s > 0.2 && s < 0.85 && (s * 70) % 1 < 0.45) {
      v = 0.75;
      hue = HUE.main;
    }
    if (s < 0.009) {
      v = 0.95;
      hue = HUE.main;
    }
    v = clamp(v);
    return [v, hue, hue === HUE.main && s >= 0.009 ? G("▪") : blockGlyph(v)];
  }
  // dorsal fin, tall at the back, swept forward into the hull
  if (s >= 0.03 && s <= 0.44 && w > top) {
    const q = (s - 0.03) / 0.41;
    const tip = top + 0.12 * Math.pow(1 - q, 1.5) * (1 + 0.25 * Math.sin(q * Math.PI));
    if (w <= tip) {
      const e = (tip - w) / (tip - top + 1e-6);
      const v = e < 0.12 ? 0.85 : 0.32 + 0.25 * (1 - e);
      return [v, HUE.white, blockGlyph(v)];
    }
  }
  // ventral fin, shorter
  if (s >= 0.05 && s <= 0.36 && w < bot) {
    const q = (s - 0.05) / 0.31;
    const tip = bot - 0.065 * Math.pow(1 - q, 1.7);
    if (w >= tip) {
      const e = (w - tip) / (bot - tip + 1e-6);
      const v = e < 0.14 ? 0.7 : 0.22 + 0.2 * (1 - e);
      return [v, HUE.white, blockGlyph(v)];
    }
  }
  // engine plume trailing the blunt tail
  if (s < 0) {
    const a = 1 + s / 0.24; // 1 at the nozzle → 0 at the end
    const hw = 0.034 * a + 0.004;
    const mid = -0.006;
    if (Math.abs(w - mid) < hw) {
      const flick = 0.8 + 0.2 * Math.sin(t * 31 + s * 90);
      const v = Math.pow(a, 1.6) * flick * (1 - Math.abs(w - mid) / hw) * 1.1;
      if (v < 0.05) return null;
      return [clamp(v), a > 0.8 ? HUE.white : a > 0.4 ? HUE.main : HUE.hot, -1];
    }
  }
  return null;
}

function drawFlagship(f, t, tc) {
  const e = (tc - FLAG_T0) / FLAG_DUR;
  if (e < 0 || e > 1) return;
  const physW = cols, physH = rows / ax;
  let L, x0, y0, x1, y1, dx, dy;
  if (portrait) {
    L = physW * 0.82;
    const a = 0.07;
    dx = Math.cos(a);
    dy = -Math.sin(a);
    x0 = -L * 0.62;
    y0 = physH * 0.62;
    x1 = physW + L * 0.62;
    y1 = y0 + dy * (physW + L * 1.24);
  } else {
    L = Math.min(physW * 0.44, physH * 1.45);
    const a = 0.045;
    dx = Math.cos(a);
    dy = -Math.sin(a);
    x0 = -L * 0.62;
    y0 = physH * 0.76;
    x1 = physW + L * 0.62;
    y1 = y0 + dy * (physW + L * 1.24);
  }
  const px = lerp(x0, x1, e), py = lerp(y0, y1, e);
  const nx = dy, ny = -dx; // "up" side of the hull
  const nxs = nx, nys = ny;
  const Rr = L * 0.78;
  const cMin = Math.max(0, Math.floor(px - Rr)), cMax = Math.min(cols - 1, Math.ceil(px + Rr));
  const rMin = Math.max(0, Math.floor((py - Rr) * ax)), rMax = Math.min(rows - 1, Math.ceil((py + Rr) * ax));
  const V = f.v, H = f.h, Gg = f.g;
  for (let row = rMin; row <= rMax; row++) {
    const Y = row / ax - py;
    for (let col = cMin; col <= cMax; col++) {
      const X = col - px;
      const u = (X * dx + Y * dy) / L;
      const w = (X * nxs + Y * nys) / L;
      if (w > 0.2 || w < -0.12) continue;
      const r = hull(u + 0.5, w, L, t);
      if (!r) continue;
      const i = row * cols + col;
      V[i] = r[0];
      H[i] = r[1];
      Gg[i] = r[2];
    }
  }
  // a quiet name tag riding just above the dorsal fin
  const tx = Math.round(px - dx * L * 0.3 + nxs * L * 0.19);
  const ty = Math.round((py - dy * L * 0.3 + nys * L * 0.19) * ax);
  if (ty > 1 && ty < rows - 2 && tx > 1 && tx < cols - 12) f.text(tx, ty, "BRUNHILD", HUE.fg, 0.4);
}

export default {
  id: "fleet",
  title: "FLEET_ENGAGEMENT",
  caption: "twelve thousand ships, one quiet flagship",

  init(f, S) {
    R = rng(796);
    cols = S.cols;
    rows = S.rows;
    ax = S.ax;
    const physW = cols, physH = rows / ax;
    portrait = physH > physW * 1.05;
    scale = portrait ? Math.min(physH / 2 / 66, physW / 2 / 34) : Math.min(physW / 2 / 66, physH / 2 / 36);
    cx0 = cols / 2;
    cy0 = rows / 2;
    cycleIdx = 0;
    salvoCount = 0;
    buildFleets();
    buildBackdrop();
  },

  frame(f, t, dt, S) {
    const V = f.v, H = f.h, Gg = f.g;
    const ci = Math.floor(t / CYCLE), tc = t - ci * CYCLE;
    if (ci !== cycleIdx) {
      cycleIdx = ci;
      buildFleets();
    }

    yaw = (portrait ? 0.2 : -0.3) + 0.14 * Math.sin(t * 0.06);
    pitch = (portrait ? 0.85 : 0.42) + 0.05 * Math.sin(t * 0.045 + 1);
    cyw = Math.cos(yaw);
    syw = Math.sin(yaw);
    cp = Math.cos(pitch);
    sp = Math.sin(pitch);

    // ── backdrop: nebula band + stars ──
    const shift = Math.round(yaw * cols * 0.18);
    for (let y = 0, i = 0; y < rows; y++) {
      const base = y * nebW + nebPad + shift;
      for (let x = 0; x < cols; x++, i++) {
        const j = base + x;
        V[i] = neb[j] || 0;
        H[i] = nebH[j];
        Gg[i] = -1;
      }
    }
    for (const [u, v, b] of stars) {
      const c = Math.floor((((u + yaw * 0.12) % 1) + 1) % 1 * cols);
      const r = Math.floor((((v + pitch * 0.08) % 1) + 1) % 1 * rows);
      const tw = 0.6 + 0.4 * Math.sin(t * (1 + b * 2) + b * 50);
      f.plot(c, r, (0.1 + b * b * 0.4) * tw, b > 0.93 ? HUE.white : HUE.fg, b > 0.97 ? G("+") : -1);
    }

    // ── faint tactical range rings on a plane below the fleets ──
    const P = [0, 0, 0, 0];
    for (const rad of [26, 52]) {
      for (let k = 0; k < 96; k++) {
        if (k % 3 === 2) continue;
        const a = (k / 96) * TAU;
        proj(Math.cos(a) * rad, -24, Math.sin(a) * rad, P);
        f.plot(P[0], P[1], 0.09, HUE.fg, G("·"));
      }
    }
    for (let x = -60; x <= 60; x += 10) {
      proj(x, -24, 0, P);
      f.plot(P[0], P[1], x === 0 ? 0.2 : 0.12, HUE.fg, G(x === 0 ? "+" : "·"));
    }

    // ── fleets ──
    const adv = smooth(0, CYCLE * 0.8, tc);
    const xI = -46 + 12 * adv, xA = 46 - 12 * adv;
    const warpIn = ci > 0 ? 1 - smooth(0, 1.8, tc) : 0;
    const warpOut = smooth(CYCLE - 1.6, CYCLE, tc);
    const warp = warpIn * warpIn + warpOut * warpOut;
    const alive = [0, 0];
    for (const s of ships) if (s.alive) alive[s.fleet]++;
    const frac = [alive[0] / total[0], alive[1] / total[1]];
    for (const s of ships) {
      if (!s.alive) continue;
      const dir = s.fleet === IMP ? 1 : -1;
      const sc = 0.78 + 0.22 * frac[s.fleet];
      s.x = (s.fleet === IMP ? xI : xA) + s.sx - dir * warp * 160;
      s.y = s.sy * sc + 0.6 * Math.sin(t * 0.6 + s.ph);
      s.z = s.sz * sc + 0.5 * Math.sin(t * 0.45 + s.ph * 1.7);
      proj(s.x, s.y, s.z, P);
      s.col = P[0];
      s.row = P[1];
      s.k = P[2];
      s.c = P[3];
    }
    for (const s of ships) {
      if (!s.alive) continue;
      const imp = s.fleet === IMP;
      const hue = imp ? HUE.main : HUE.alt;
      const v = clamp(0.3 + 0.6 * (1 - (s.c + 45) / 90), 0.18, 0.95);
      const size = 1.3 * scale * s.k;
      const c = Math.round(s.col), r = Math.round(s.row);
      if (warp > 0.004) {
        const dir = imp ? 1 : -1;
        proj(s.x - dir * (6 + warp * 40), s.y, s.z, P);
        f.line(P[0], P[1], s.col, s.row, v * 0.5, hue, "auto", ax);
      }
      if (portrait) {
        if (size > 3.2) {
          f.plot(c, r, v, hue, G(imp ? "▼" : "▲"));
          f.plot(c, imp ? r - 1 : r + 1, v * 0.7, hue, G(imp ? "║" : "█"));
        } else f.plot(c, r, v, hue, G(size > 1.4 ? (imp ? "▼" : "■") : size > 0.9 ? (imp ? "v" : "▪") : "·"));
      } else if (size > 3.2) {
        f.plot(c, r, v, hue, G(imp ? "▶" : "◀"));
        f.plot(imp ? c - 1 : c + 1, r, v * 0.7, hue, G(imp ? "═" : "█"));
      } else f.plot(c, r, v, hue, G(size > 1.4 ? (imp ? "▶" : "■") : size > 0.9 ? (imp ? ">" : "▪") : "·"));
    }

    // ── salvos: a FIRE call, then a ripple of beams along the line (after any warp-in) ──
    const s0 = ci > 0 ? SALVO0 + 1.2 : SALVO0;
    while (true) {
      const ts = s0 + nextSalvo * SALVO_GAP;
      if (ts > tc || ts > CYCLE - 3.2) break;
      spawnSalvo(nextSalvo, t - (tc - ts));
      nextSalvo++;
    }
    for (let b = beams.length - 1; b >= 0; b--) {
      const bm = beams[b];
      const age = t - bm.t0;
      if (age < 0) {
        if (!bm.src.alive) beams.splice(b, 1);
        continue;
      }
      const p = age / bm.dur;
      if (p >= 1 && !bm.hit) {
        bm.hit = true;
        if (bm.dst.alive) {
          if (R() < 0.13) explode(bm.dst, t);
          else fx.push({ type: 0, ship: bm.dst, t0: t, fleet: bm.dst.fleet });
        }
      }
      const tail = clamp(p - 0.2);
      if (tail >= 1) {
        beams.splice(b, 1);
        continue;
      }
      const head = clamp(p), mid = (tail + head) / 2;
      const tx = bm.dst.col, ty = bm.dst.row;
      const at = (q) => [lerp(bm.src.col, tx, q), lerp(bm.src.row, ty, q)];
      const [ax0, ay0] = at(tail), [axm, aym] = at(mid), [ax1, ay1] = at(head);
      const imp = bm.fleet === IMP;
      const hue = imp ? HUE.main : HUE.alt;
      f.line(ax0, ay0, axm, aym, 0.3, hue, "auto", ax);
      f.line(axm, aym, ax1, ay1, 0.7, imp ? HUE.white : HUE.alt, "auto", ax);
      if (p < 1) f.plot(ax1, ay1, 0.95, HUE.white, G("•"));
    }

    // ── hits: shield flashes and explosions ──
    for (let k = fx.length - 1; k >= 0; k--) {
      const e = fx[k];
      const a = (t - e.t0) / (e.type ? 0.7 : 0.35);
      if (a >= 1) {
        fx.splice(k, 1);
        continue;
      }
      if (e.type === 0) {
        if (!e.ship.alive) continue;
        const r = 1 + a * 2.2;
        for (let q = 0; q < 10; q++) {
          const th = (q / 10) * TAU;
          f.plot(e.ship.col + Math.cos(th) * r, e.ship.row + Math.sin(th) * r * ax, (1 - a) * 0.6, e.fleet === IMP ? HUE.main : HUE.alt, G("·"));
        }
        f.plot(e.ship.col, e.ship.row, (1 - a) * 0.9, HUE.white, G("◇"));
      } else {
        proj(e.x, e.y, e.z, P);
        const r = 0.6 + a * 2.6 * P[2] * (scale / 2);
        f.disc(P[0], P[1], r, (1 - a) * 0.95, a < 0.25 ? HUE.white : a < 0.55 ? HUE.main : HUE.hot, ax);
      }
    }
    for (let k = debris.length - 1; k >= 0; k--) {
      const d = debris[k];
      const age = t - d.t0;
      if (age > d.life) {
        debris.splice(k, 1);
        continue;
      }
      const fade = 1 - age / d.life;
      proj(d.x + d.vx * age, d.y + d.vy * age, d.z + d.vz * age, P);
      f.plot(P[0], P[1], 0.75 * fade, fade > 0.6 ? HUE.main : HUE.hot, d.g);
    }

    // ── foreground flagship ──
    drawFlagship(f, t, tc);

    // ── sparse HUD ──
    const lab = (x, y, s, hue, v) => {
      x = Math.round(x);
      if (y < 0 || y >= rows || x < 0) return;
      if (x + s.length > cols) x = cols - s.length - 1;
      if (x < 0) return;
      f.text(x, y, s, hue, v);
    };
    const fmt = (n) => String(Math.round(n / 10) * 10).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    const impTxt = `IMPERIAL · ${fmt(12000 * frac[0])} ships`;
    const allTxt = `ALLIANCE · 13th FLEET · ${fmt(13000 * frac[1])}`;
    const ts = s0 + nextSalvo * SALVO_GAP;
    const callIn = ts - tc, callFleet = nextSalvo % 2 === 0 ? IMP : ALL;
    const lastFleet = (nextSalvo - 1) % 2 === 0 ? IMP : ALL;
    const sinceLast = tc - (s0 + (nextSalvo - 1) * SALVO_GAP);
    let fireFleet = -1;
    if (callIn < 0.55 && ts <= CYCLE - 3.2) fireFleet = callFleet;
    else if (nextSalvo > 0 && sinceLast < 0.4) fireFleet = lastFleet;
    const blink = Math.sin(t * 22) > -0.3 ? 0.95 : 0.5;
    if (portrait) {
      lab(2, 1, impTxt, HUE.main, 0.5);
      lab(2, rows - 4, allTxt, HUE.alt, 0.5);
      if (fireFleet === IMP) lab(2, 2, "FIRE ▶", HUE.white, blink);
      if (fireFleet === ALL) lab(2, rows - 5, "FIRE ▶", HUE.white, blink);
    } else {
      lab(2, 1, impTxt, HUE.main, 0.5);
      lab(cols - allTxt.length - 2, 1, allTxt, HUE.alt, 0.5);
      if (fireFleet === IMP) lab(2, 2, "FIRE ▶", HUE.white, blink);
      if (fireFleet === ALL) lab(cols - 8, 2, "◀ FIRE", HUE.white, blink);
    }
    const range = ((xA - xI) * 0.075).toFixed(1);
    lab(2, rows - 2, `salvo ${salvoCount} · range ${range} ls`, HUE.fg, 0.4);
  },
};
