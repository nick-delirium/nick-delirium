// Attack on Titan: scouts chain ODM-gear swings across a walled town. Each scout is a
// rope pendulum (gravity + length constraint + gas thrust) that releases near the apex
// and fires the next anchor ahead. Every cycle the Colossal Titan peeks over the Wall,
// then a 15m titan wanders into a plaza and the lead scout spirals around it for the nape.
// Physics runs in "physical" units (cell widths on both axes); screen row = y * ax.
import { HUE, clamp, smooth, noise2, hash1, rng, G, slopeGlyph } from "../engine/util.js";

const CYCLE = 26;
const MAXP = 700;

let cols, rows, ax, H, gy, R;
let near, nextBX, scouts, parts, titan, slash, cam, clock, gas, blades, wallTop, wallBot;

const GC = {};
const g = (ch) => GC[ch] ?? (GC[ch] = G(ch));

/* ---------------- world ---------------- */

function addBuilding() {
  const tower = R() < 0.15;
  const w = tower ? 5 + ((R() * 3) | 0) : 8 + ((R() * 11) | 0);
  const h = tower ? H * (0.58 + R() * 0.1) : H * (0.26 + R() * 0.2);
  near.push({
    x0: nextBX,
    w,
    h,
    tower,
    seed: (R() * 1e6) | 0,
    chim: !tower && R() < 0.65 ? (R() < 0.5 ? 0.22 : 0.74) : -1,
  });
  nextBX += w + (R() < 0.22 ? 1 + ((R() * 3) | 0) : 0);
}

function ensureWorld(maxX) {
  while (nextBX < maxX) addBuilding();
  while (near.length && near[0].x0 + near[0].w < cam - 60) near.shift();
}

/** best anchor ahead of (x, y): facades, roof peaks, towers and a living titan's shoulders */
function findAnchor(x, y, reach = 0.55) {
  let best = null, bs = -1e9;
  const consider = (X, Y) => {
    const dx = X - x;
    if (dx < 0.1 * H || dx > reach * H || Y > y - 0.05 * H) return;
    const s = (gy - Y) / H - Math.abs(dx - 0.3 * H) / H;
    if (s > bs) {
      bs = s;
      best = { x: X, y: Y };
    }
  };
  for (const b of near) {
    if (b.x0 > x + reach * H) break;
    const top = gy - b.h;
    if (b.tower) consider(b.x0 + b.w / 2, gy - b.h * 0.86);
    else {
      consider(b.x0 + b.w * 0.5, top + 1.2);
      consider(b.x0 + b.w * 0.5, top - (b.w / 2) * 0.6 / ax);
    }
  }
  if (titan && !titan.dying) {
    consider(titan.x - 0.16 * titan.Ht, gy - 0.76 * titan.Ht);
    consider(titan.x + 0.16 * titan.Ht, gy - 0.76 * titan.Ht);
  }
  return best;
}

/* ---------------- scouts ---------------- */

function makeScout(x, y, lead, seed) {
  return { x, y, vx: 0.6 * H, vy: 0, att: false, ax: 0, ay: 0, L: 0, Lt: 0, hook: null, wait: 0, lead, mode: "swing", seed, boost: 0, atk: null, trail: [] };
}

// the winch reels the cable toward a length whose swing bottom clears the street
function attach(s, X, Y) {
  s.att = true;
  s.ax = X;
  s.ay = Y;
  s.L = Math.hypot(s.x - X, s.y - Y);
  s.Lt = clamp(gy - 0.16 * H - Y, 0.12 * H, 0.38 * H);
}

function puff(x, y, vx, vy, life, kind, scr = false) {
  if (parts.length >= MAXP) return;
  parts.push({ x, y, vx, vy, life, max: life, kind, scr });
}

function stepScout(s, dt, i) {
  const gAcc = 0.8 * H;
  if (s.mode === "attack") return stepAttack(s, dt);
  const lead = scouts[0];

  if (s.hook) {
    s.hook.p += dt / s.hook.dur;
    if (s.hook.p >= 1) {
      attach(s, s.hook.x, s.hook.y);
      s.hook = null;
    }
  }

  // followers chase a slot behind the lead
  let vt = 0.5 * H;
  if (!s.lead) {
    const target = lead.x - (0.07 + 0.06 * i) * H;
    vt = clamp(0.5 * H + (target - s.x) * 1.6, 0.25 * H, 0.75 * H);
    if (s.x > lead.x + 0.03 * H) s.vx *= 1 - dt * 0.9;
    if (s.x < cam - 30 || s.x > cam + cols + 30) {
      Object.assign(s, makeScout(cam - 6, gy - 0.5 * H, false, s.seed));
      s.wait = 0.05;
    }
  }

  s.vy += gAcc * dt;
  if (s.att) {
    const dx = s.x - s.ax, dy = s.y - s.ay, d = Math.hypot(dx, dy) || 1;
    let tx = -dy / d, ty = dx / d;
    if (tx < 0) {
      tx = -tx;
      ty = -ty;
    }
    if (dy > 0 && s.vx < vt && (s.lead || s.x < lead.x)) {
      s.vx += tx * 0.6 * gAcc * dt;
      s.vy += ty * 0.6 * gAcc * dt;
      s.boost = 0.1;
    }
    const low = s.y > gy - 0.14 * H;
    if (s.L > s.Lt) s.L = Math.max(s.Lt, s.L - (low ? 0.9 : 0.45) * H * dt);
    // release near the apex on the forward side of the arc
    if ((s.x > s.ax + 0.3 * s.L && s.vy < 0 && s.vy > -0.1 * H) || s.x > s.ax + 0.8 * s.L) {
      s.att = false;
      s.vx += 0.03 * H;
      s.wait = 0.06 + R() * 0.12;
    }
  } else if (!s.hook) {
    s.wait -= dt;
    if (s.wait <= 0) {
      const a = findAnchor(s.x, s.y) || findAnchor(s.x, s.y + 0.15 * H, 0.95);
      if (a) {
        s.hook = { x: a.x, y: a.y, p: 0, dur: Math.max(0.08, Math.hypot(a.x - s.x, a.y - s.y) / (2.6 * H)) };
      } else {
        s.wait = 0.08;
        s.vy -= 1.6 * gAcc * dt;
        s.vx += 0.3 * gAcc * dt;
        s.boost = 0.1;
      }
    }
    if (s.y > gy - 0.16 * H) {
      s.vy -= 1.5 * gAcc * dt;
      s.boost = 0.1;
    }
  }

  s.x += s.vx * dt;
  s.y += s.vy * dt;
  if (s.att) {
    const dx = s.x - s.ax, dy = s.y - s.ay, d = Math.hypot(dx, dy) || 1;
    if (d > s.L) {
      const nx = dx / d, ny = dy / d;
      s.x = s.ax + nx * s.L;
      s.y = s.ay + ny * s.L;
      const vr = s.vx * nx + s.vy * ny;
      if (vr > 0) {
        s.vx -= vr * nx;
        s.vy -= vr * ny;
      }
    }
  }
  const sp = Math.hypot(s.vx, s.vy), cap = 0.72 * H;
  if (sp > cap) {
    s.vx *= cap / sp;
    s.vy *= cap / sp;
  }
  if (s.y > gy - 1.5) {
    s.y = gy - 1.5;
    s.vy = Math.min(s.vy, -0.35 * H);
  }
  if (s.y < 4 / ax) {
    s.y = 4 / ax;
    s.vy = Math.max(s.vy, 0);
  }
  if (s.boost > 0) {
    s.boost -= dt;
    if (R() < 0.45) puff(s.x - Math.sign(s.vx), s.y + 0.6 / ax, -s.vx * 0.15 + (R() - 0.5) * 6, -s.vy * 0.15 + (R() - 0.5) * 6, 0.45 + R() * 0.3, 0);
  }
}

function startAttack(s) {
  const T = titan;
  const cx = T.x + 0.01 * T.Ht, cy = gy - 0.84 * T.Ht;
  let a0 = Math.atan2(s.y - cy, s.x - cx);
  if (a0 < 0) a0 += Math.PI * 2;
  a0 = clamp(a0, Math.PI * 0.55, Math.PI * 1.45);
  s.mode = "attack";
  s.att = false;
  s.hook = null;
  s.atk = { t: 0, cx, cy, a0, r0: clamp(Math.hypot(s.x - cx, s.y - cy), 0.25 * T.Ht, 0.55 * T.Ht), ax: T.x - 0.16 * T.Ht, ay: gy - 0.76 * T.Ht, px: s.x, py: s.y };
}

const HOOK_T = 0.16, ORBIT_T = 1.15;

function stepAttack(s, dt) {
  const A = s.atk, T = titan;
  A.t += dt;
  const px = s.x, py = s.y;
  if (A.t < HOOK_T) {
    // reel toward the shoulder while the hook bites
    const k = dt * 5;
    s.x += (A.cx + Math.cos(A.a0) * A.r0 - s.x) * k;
    s.y += (A.cy + Math.sin(A.a0) * A.r0 - s.y) * k;
  } else {
    const p = clamp((A.t - HOOK_T) / ORBIT_T);
    const e = p * p * (3 - 2 * p);
    const a = A.a0 + (Math.PI * 2 + 0.45 - A.a0) * e;
    const r = A.r0 + (0.2 * T.Ht - A.r0) * e;
    s.x = A.cx + Math.cos(a) * r;
    s.y = A.cy + Math.sin(a) * r;
    if (p > 0.5) {
      A.ax = T.x + 0.12 * T.Ht;
      A.ay = gy - 0.95 * T.Ht;
    }
    s.boost = 0.1;
    if (R() < 0.8) puff(s.x, s.y, (R() - 0.5) * 10, (R() - 0.5) * 10, 0.5, 0);
    if (p >= 1) {
      slash = { x: A.cx + 0.07 * T.Ht, y: A.cy + 0.03 * T.Ht, r: 0.11 * T.Ht, t: 0 };
      for (let k = 0; k < 90; k++) {
        const an = R() * Math.PI * 2, v = (0.1 + R() * 0.35) * H;
        puff(slash.x, slash.y, Math.cos(an) * v, Math.sin(an) * v - 0.15 * H, 0.9 + R() * 1.4, 1);
      }
      T.dying = 0.0001;
      blades = blades > 2 ? blades - 2 : 8;
      s.mode = "swing";
      s.atk = null;
      s.vx = 0.12 * H;
      s.vy = -0.4 * H;
      s.wait = 0.3;
    }
  }
  if (s.atk) {
    s.vx = (s.x - px) / Math.max(dt, 1e-3);
    s.vy = (s.y - py) / Math.max(dt, 1e-3);
  }
}

/* ---------------- titan ---------------- */

function spawnTitan() {
  const Ht = clamp(0.44 * H, 15 / ax, 0.6 * H);
  const x = cam + cols + 0.4 * Ht + 8;
  ensureWorld(x + Ht);
  const hw = 0.42 * Ht;
  near = near.filter((b) => b.x0 + b.w < x - hw || b.x0 > x + hw);
  titan = { x, Ht, t: 0, dying: 0, seed: (R() * 1000) | 0 };
}

function capsule(px, py, ax0, ay0, bx, by, r) {
  const vx = bx - ax0, vy = by - ay0;
  const t = clamp(((px - ax0) * vx + (py - ay0) * vy) / (vx * vx + vy * vy || 1));
  return Math.hypot(px - ax0 - vx * t, py - ay0 - vy * t) - r;
}

/** signed distance in titan-local units (u right, w up from the feet), scaled by Ht */
function titanSDF(u, w, sway) {
  let d = capsule(u, w, -0.075, 0, -0.06, 0.45, 0.048);
  d = Math.min(d, capsule(u, w, 0.075, 0, 0.06, 0.45, 0.048));
  d = Math.min(d, capsule(u, w, 0, 0.46, 0, 0.72, 0.135));
  d = Math.min(d, capsule(u, w, -0.15, 0.74, -0.2 - sway, 0.4, 0.038));
  d = Math.min(d, capsule(u, w, 0.15, 0.74, 0.21 + sway * 0.6, 0.42, 0.038));
  d = Math.min(d, capsule(u, w, 0, 0.72, 0, 0.82, 0.055));
  const hx = (u + 0.01) / 0.1, hy = (w - 0.9) / 0.108;
  d = Math.min(d, (Math.hypot(hx, hy) - 1) * 0.1);
  return d;
}

function drawTitan(f, t) {
  const T = titan, Ht = T.Ht;
  const dp = T.dying ? clamp(T.dying / 3) : 0;
  const ang = T.dying ? 1.25 * smooth(0, 1, T.dying / 1.6) : 0;
  const sink = T.dying ? 0.12 * smooth(0.6, 2.6, T.dying) : 0;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const sway = Math.sin(t * 1.7 + T.seed) * 0.02;
  const left = T.x - (ang > 0 ? 1.1 : 0.34) * Ht, right = T.x + 0.34 * Ht;
  const c0 = Math.max(0, Math.floor(left - cam)), c1 = Math.min(cols - 1, Math.ceil(right - cam));
  const r0 = Math.max(0, Math.floor((gy - 1.05 * Ht) * ax)), r1 = Math.min(rows - 1, Math.ceil(gy * ax));
  const V = f.v, Hh = f.h, Gg = f.g;
  const edge = 1.1 / Ht;
  for (let r = r0; r <= r1; r++) {
    const wy = (gy - r / ax) / Ht;
    for (let c = c0; c <= c1; c++) {
      let u = (c + cam - T.x) / Ht, w = wy;
      if (ang) {
        const ru = u * ca + w * sa, rw = -u * sa + w * ca;
        u = ru;
        w = rw + sink;
      }
      if (w < -0.02 || w > 1.05) continue;
      const d = titanSDF(u, w, sway);
      if (d > 0) continue;
      if (dp && hash1(c * 131 + r * 977 + T.seed) < dp * 1.15) continue;
      const i = r * cols + c;
      let v = 0.11 + 0.07 * clamp(-u * 3 + 0.5), hue = HUE.fg, gl = -1;
      if (d > -edge) v = 0.42;
      // face looks left: wide eyes and a lipless grin
      if (w > 0.82) {
        const e1 = Math.hypot((u + 0.07) / 0.022, (w - 0.93) / 0.022), e2 = Math.hypot((u + 0.025) / 0.02, (w - 0.935) / 0.02);
        if (e1 < 1 || e2 < 1) {
          v = 0.9;
          hue = HUE.white;
          gl = g("o");
        }
        const mw = 0.858 + 3 * (u + 0.035) * (u + 0.035);
        if (u > -0.1 && u < 0.03 && Math.abs(w - mw) < 0.016) {
          v = 0.78;
          hue = HUE.white;
          gl = c % 2 ? g("▪") : g("|");
        }
      }
      V[i] = v * (1 - dp * 0.6);
      Hh[i] = hue;
      Gg[i] = gl;
    }
  }
  if (T.dying) {
    for (let k = 0; k < 5; k++) {
      const u = (R() - 0.5) * 0.5, w = R();
      if (titanSDF(u, w, 0) < 0) {
        const X = T.x + (u * ca - w * sa) * Ht, Y = gy - (u * sa + w * ca - sink) * Ht;
        puff(X, Y, (R() - 0.5) * 0.08 * H, -(0.08 + R() * 0.15) * H, 1 + R() * 1.4, 1);
      }
    }
  }
}

/* ---------------- scene ---------------- */

export default {
  id: "aot",
  title: "ODM_GEAR",
  caption: "anchor, swing, release. the wall is watching",

  init(f, S) {
    ({ cols, rows, ax } = S);
    H = rows / ax;
    gy = (rows - 1.5) / ax;
    wallTop = Math.round(rows * 0.3);
    wallBot = Math.round(rows * 0.62);
    R = rng(845);
    near = [];
    nextBX = -60;
    cam = 0;
    clock = 0;
    gas = 72;
    blades = 8;
    parts = [];
    titan = null;
    slash = null;
    ensureWorld(cols + 140);
    const n = cols > 140 ? 4 : cols > 70 ? 3 : 2;
    scouts = [];
    for (let i = 0; i < n; i++) {
      const x = cols * 0.5 - i * 0.07 * H;
      const s = makeScout(x, gy - 0.45 * H, i === 0, i * 17 + 3);
      const a = findAnchor(x - 0.3 * H, gy - 0.2 * H, 0.75) || { x: x + 10, y: gy - 0.55 * H };
      s.ax = a.x;
      s.ay = a.y;
      s.att = true;
      s.L = s.Lt = clamp(gy - 0.16 * H - a.y, 0.12 * H, 0.38 * H);
      const th = -0.55 + i * 0.25;
      s.x = a.x + Math.sin(th) * s.L;
      s.y = a.y + Math.cos(th) * s.L;
      s.vx = Math.cos(th) * 0.45 * H;
      s.vy = -Math.sin(th) * 0.45 * H;
      scouts.push(s);
    }
    cam = scouts[0].x - cols * (cols < 160 ? 0.58 : 0.5);
  },

  frame(f, t, dt, S) {
    if (S.cols !== cols || S.rows !== rows) this.init(f, S);
    dt = Math.min(dt, 0.05);
    clock += dt;
    const phase = clock % CYCLE;

    /* ---- simulate ---- */
    const steps = 3, h = dt / steps;
    for (let k = 0; k < steps; k++) scouts.forEach((s, i) => stepScout(s, h, i));
    const lead = scouts[0];
    for (const s of scouts) {
      s.trail.push(s.x, s.y);
      if (s.trail.length > 44) s.trail.splice(0, 2);
    }
    if (lead.boost > 0) gas = Math.max(8, gas - dt * 3);
    else gas = Math.min(96, gas + dt * 1.5);

    if (!titan && phase > 8 && phase < 9) spawnTitan();
    if (titan) {
      titan.t += dt;
      if (titan.dying) titan.dying += dt;
      const gap = titan.x - lead.x;
      if (!titan.dying && lead.mode !== "attack" && gap < 0.32 * H && lead.y < gy - 0.12 * H) startAttack(lead);
      if (titan.dying > 3.4 || titan.x < cam - titan.Ht) titan = null;
    }
    if (slash) {
      slash.t += dt;
      if (slash.t > 0.7) slash = null;
    }

    let target = lead.x - cols * (cols < 160 ? 0.58 : 0.5);
    if (titan && titan.dying && titan.dying < 2.4) target = Math.max(Math.min(target, titan.x - cols * 0.4), lead.x - cols * 0.88);
    cam += (target - cam) * Math.min(1, dt * 7);
    ensureWorld(cam + cols + 140);

    // Colossal Titan peeks over the Wall at the start of each cycle
    const peek = smooth(0.2, 1.8, phase) * (1 - smooth(5, 7, phase));
    const frx = clamp(cols * 0.12, 8, 26), fry = frx * 1.25 * ax;
    const fcx = Math.round(cols * 0.64), ftop = wallTop - peek * fry * 1.25, fcy = ftop + fry;
    if (peek > 0.3 && R() < 0.8) puff(fcx + (R() - 0.5) * frx * 1.4, ftop / ax, (R() - 0.5) * 4, -(4 + R() * 6), 1.6 + R(), 2, true);

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.8;
      p.vy = p.vy * (1 - dt * 1.2) - (p.kind ? 0.06 * H * dt : 0);
    }

    /* ---- render ---- */
    const V = f.v, Hh = f.h, Gg = f.g;
    f.clear();

    // sky: dusk glow toward the wall, a few drifting clouds
    for (let r = 0; r < wallTop; r++) {
      const k = r / wallTop;
      for (let c = 0, i = r * cols; c < cols; c++, i++) {
        let v = 0.012 + 0.034 * k * k * k, hue = HUE.fg;
        const n = noise2((c + cam * 0.05) * 0.025 - t * 0.03, r * 0.16);
        if (n > 0.38) {
          v = Math.max(v, (n - 0.38) * 0.25);
          hue = HUE.fg;
        }
        V[i] = v;
        Hh[i] = hue;
      }
    }

    // Colossal face (skinless, steaming), drawn above the wall line only
    if (peek > 0.01) {
      for (let r = Math.max(0, Math.floor(ftop)); r < wallTop; r++) {
        for (let c = Math.max(0, Math.floor(fcx - frx)); c <= Math.min(cols - 1, Math.ceil(fcx + frx)); c++) {
          const nx = (c - fcx) / frx, ny = (r - fcy) / fry, e = nx * nx + ny * ny;
          if (e > 1) continue;
          const i = r * cols + c;
          let v = 0.15 + 0.1 * (0.5 + 0.5 * Math.sin((c - fcx) * 1.5 + ny * 2)), hue = HUE.hot, gl = -1;
          if (e > 0.82) v = 0.36;
          for (const side of [-1, 1]) {
            const de = Math.hypot((nx - 0.36 * side) / 0.2, (ny + 0.18) / 0.13);
            if (de < 1) v = 0.015;
            if (de < 0.32) {
              v = 0.85;
              hue = HUE.white;
              gl = g("•");
            }
          }
          if (Math.abs(nx) < 0.12 && ny > 0.12 && ny < 0.3) v = 0.02;
          if (ny > 0.45 && ny < 0.62 && Math.abs(nx) < 0.45) {
            v = 0.55;
            hue = HUE.white;
            gl = c % 2 ? g("▪") : g("|");
          }
          V[i] = v;
          Hh[i] = hue;
          Gg[i] = gl;
        }
      }
    }

    // the Wall
    const wsh = Math.floor(cam * 0.12);
    for (let r = wallTop; r < wallBot; r++) {
      const k = (r - wallTop) / (wallBot - wallTop), band = ((r - wallTop) / 6) | 0;
      for (let c = 0, i = r * cols; c < cols; c++, i++) {
        let v = 0.02, gl = -1;
        if (r === wallTop) {
          v = 0.3;
          gl = g("▄");
        } else if ((r - wallTop) % 6 === 0) {
          v = 0.055 - k * 0.025;
          gl = g("─");
        } else if (k < 0.5 && (((c + wsh + (band & 1) * 11) % 22) + 22) % 22 === 0) {
          v = 0.05;
          gl = g("│");
        }
        V[i] = v;
        Hh[i] = HUE.fg;
        Gg[i] = gl;
      }
    }

    // mid rooftops (half parallax)
    for (let c = 0; c < cols; c++) {
      const mx = c + cam * 0.5, k = Math.floor(mx / 13), local = mx - k * 13;
      const bw = 9 + Math.floor(hash1(k * 7 + 3) * 3);
      if (local >= bw) continue;
      const tower = hash1(k * 31 + 1) < 0.1;
      const hb = H * (tower ? 0.62 : 0.3 + 0.22 * hash1(k * 13 + 5));
      const top = Math.round((gy - hb) * ax), cw = (bw - 1) / 2, off = Math.abs(local - cw);
      const roof = Math.round(top - (cw - off) * (tower ? 2.4 : 1));
      for (let r = Math.max(0, roof); r < rows - 1; r++) {
        const i = r * cols + c;
        let v = 0.01, hue = HUE.fg, gl = -1;
        if (r === roof) {
          v = 0.13;
          gl = off < 0.6 ? g("^") : local < cw ? g("/") : g("\\");
        } else if (r > top && (r - top) % 4 === 2 && Math.floor(local) % 3 === 1 && hash1(k * 97 + r * 13 + Math.floor(local)) < 0.2) {
          v = 0.2;
          hue = HUE.main;
          gl = g("·");
        }
        V[i] = v;
        Hh[i] = hue;
        Gg[i] = gl;
      }
    }

    // near buildings: tiled roofs, timber frames, windows, chimneys, bell towers
    for (const b of near) {
      const sx0 = Math.round(b.x0 - cam);
      if (sx0 > cols || sx0 + b.w < 0) continue;
      const top = Math.round((gy - b.h) * ax), cw = (b.w - 1) / 2;
      const chc = b.chim >= 0 ? Math.round(b.chim * (b.w - 1)) : -9;
      for (let dx = 0; dx < b.w; dx++) {
        const c = sx0 + dx;
        if (c < 0 || c >= cols) continue;
        const off = Math.abs(dx - cw);
        const roof = Math.round(top - (cw - off) * (b.tower ? 2.6 : 1));
        if (dx === chc) {
          for (let r = Math.max(0, roof - 3); r < roof; r++) {
            const i = r * cols + c;
            V[i] = 0.16;
            Hh[i] = HUE.fg;
            Gg[i] = g("█");
          }
        }
        for (let r = Math.max(0, roof); r < rows - 1; r++) {
          const i = r * cols + c;
          let v = 0.01, hue = HUE.fg, gl = -1;
          if (r < top) {
            hue = HUE.hot;
            if (r === roof) {
              v = 0.32;
              gl = off < 0.6 ? g("^") : dx < cw ? g("/") : g("\\");
            } else {
              v = (r + dx) % 2 ? 0.08 : 0.11;
              gl = (r + dx) % 2 ? g("░") : g("▒");
            }
          } else if (r === top) {
            v = 0.3;
            gl = g("─");
          } else if (dx === 0 || dx === b.w - 1) {
            v = 0.11;
            gl = g("│");
          } else {
            const fy = (r - top) % 5;
            if (fy === 0 && b.seed % 2 === 0) {
              v = 0.07;
              gl = g("─");
            } else if (b.tower && r - top < 5 && off < 1.2) {
              v = 0.01;
            } else if (fy === 2 && dx % 4 === 2) {
              const lit = hash1(b.seed + dx * 31 + r * 7) < 0.22;
              v = lit ? 0.42 : 0.06;
              hue = lit ? HUE.main : HUE.fg;
              gl = lit ? g("▪") : g("·");
            } else if (!b.tower && b.seed % 3 === 0 && fy > 0 && dx % 8 === 4 && (fy === 1 || fy === 3)) {
              v = 0.06;
              gl = fy === 1 ? g("╲") : g("╱");
            }
          }
          V[i] = v;
          Hh[i] = hue;
          Gg[i] = gl;
        }
      }
    }

    // street
    for (let c = 0, i = (rows - 1) * cols; c < cols; c++, i++) {
      V[i] = 0.1;
      Hh[i] = HUE.fg;
      Gg[i] = (c + Math.floor(cam)) % 3 ? g("_") : g(".");
    }

    if (titan) drawTitan(f, t);

    // gas and steam
    for (const p of parts) {
      const k = p.life / p.max;
      const c = p.scr ? p.x : p.x - cam, r = p.y * ax;
      if (p.kind === 0) f.plot(c, r, 0.22 * k + 0.06, HUE.fg, k > 0.7 ? g("°") : g("·"));
      else {
        const v = (p.kind === 2 ? 0.26 : 0.4) * Math.min(1, k * 1.6);
        f.plot(c, r, v, v > 0.3 ? HUE.white : HUE.fg, k > 0.5 ? g("°") : -1);
      }
    }

    // cables and scouts
    scouts.forEach((s, idx) => {
      const sc = s.x - cam, sr = s.y * ax;
      let axp = null;
      if (s.mode === "attack") axp = [s.atk.ax, s.atk.ay];
      else if (s.att) axp = [s.ax, s.ay];
      if (axp) {
        const ec = axp[0] - cam, er = axp[1] * ax;
        f.line(sc, sr, ec, er, 0.72, HUE.white, "auto", ax);
        f.set(ec, er, 0.9, HUE.white, g("×"));
      } else if (s.hook) {
        const p = Math.min(1, s.hook.p);
        const ec = sc + (s.hook.x - cam - sc) * p, er = sr + (s.hook.y * ax - sr) * p;
        f.line(sc, sr, ec, er, 0.5, HUE.white, "auto", ax);
        f.set(ec, er, 0.9, HUE.white, g("•"));
      }
      const hue = s.lead ? HUE.main : HUE.alt;
      for (let k = 0, n = s.trail.length / 2; k < n - 1; k++) {
        const a = k / n;
        f.plot(s.trail[k * 2] - cam, s.trail[k * 2 + 1] * ax, 0.08 + a * 0.3, hue, a > 0.6 ? g("·") : -1);
      }
      const sp = Math.hypot(s.vx, s.vy) || 1;
      const bx = -s.vx / sp, by = (-s.vy / sp) * ax;
      const flap = (Math.floor(t * 14 + s.seed) & 1) === 1;
      for (let k = 1; k <= 3; k++) f.set(sc + bx * k * 1.2, sr + by * k * 0.9 - (k === 3 && flap ? 1 : 0), 0.95 - k * 0.16, hue, flap === (k % 2 === 1) ? g("~") : g("≈"));
      const lean = s.vx > 0.25 * H ? "/" : s.vx < -0.25 * H ? "\\" : "|";
      f.set(sc - Math.sign(s.vx || 1), sr + 1, 0.7, HUE.white, s.vx >= 0 ? g("/") : g("\\"));
      f.set(sc, sr, 0.95, HUE.white, g(lean));
      f.set(sc, sr - 1, 1, HUE.white, g("o"));
      if (s.mode === "attack") f.set(sc + Math.sign(s.vx || 1), sr, 0.95, HUE.white, g("-"));
    });

    // the nape cut
    if (slash) {
      const k = slash.t / 0.7, grow = Math.min(1, slash.t / 0.12);
      const scx = slash.x - cam, scy = slash.y * ax;
      const a0 = -1.3, a1 = -1.3 + 2.6 * grow;
      for (let a = a0; a <= a1; a += 0.04) {
        const x = scx + Math.cos(a) * slash.r, y = scy + Math.sin(a) * slash.r * ax;
        f.set(x, y, 1 - k * 0.8, HUE.white, slopeGlyph(-Math.sin(a), Math.cos(a) * ax, ax));
      }
      if (slash.t < 0.15) f.set(scx + slash.r, scy, 1, HUE.white, g("*"));
    }

    // HUD
    if (cols >= 36) {
      const hud = (y, str, hue, v) => {
        for (let k = 0; k <= str.length + 1; k++) f.set(k, y, 0);
        f.text(1, y, str, hue, v);
      };
      hud(1, `ODM gear · gas ${Math.round(gas)}% · blades ${blades}/8`, HUE.fg, 0.5);
      if (titan) hud(2, `titan · 15m class${titan.dying ? " · down" : ""}`, HUE.hot, 0.55);
    }
  },
};
