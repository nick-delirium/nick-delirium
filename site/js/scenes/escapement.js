// Swiss lever escapement, macro view: 15-tooth club escape wheel, pallet fork with ruby
// pallets and banking pins, impulse roller, balance with timing screws and a breathing
// hairspring. Real phases (lock → unlock → impulse → drop), time slows down through
// each impulse so the eye can follow it.
import { HUE, clamp, smooth, lerp, G, TAU } from "../engine/util.js";

const NT = 15;
const PITCH = TAU / NT;
const HALF = PITCH / 2;
const SIG = (30 * Math.PI) / 180; // pallets embrace 2.5 teeth: stones at ±30° on the wheel
const D_EP = 1 / Math.cos(SIG); // escape arbor → pallet arbor
const LF = 1.05; // pallet arbor → fork slot
const RPIN = 0.33; // impulse jewel radius on the roller
const BETA = (8 * Math.PI) / 180; // fork swing to each banking pin
const RB = 1.25; // balance rim
const AMP = (280 * Math.PI) / 180; // balance amplitude
const SLOWMO = 0.4;
const OMEGA = TAU * 4 * SLOWMO; // 4 Hz, slowed down
const LOCK0 = (33 * Math.PI) / 180; // leading tooth corner when locked on the entry pallet
const PX = D_EP, BX = D_EP + LF + RPIN; // pallet arbor and balance staff (both on y = 0)
const SPR0 = 0.48, SPR1 = 1.08, COILS = 6; // hairspring
const SPC = (SPR1 - SPR0) / (COILS * TAU);
const STUD = -2.35; // hairspring stud angle (fixed to the cock)
const BANK = BETA + Math.asin((0.032 + 0.03) / 0.55);
const SCREWS = 14;

const STONE_IN = [Math.cos(SIG) * 1.14 - PX, Math.sin(SIG) * 1.14];
const STONE_OUT = [Math.cos(SIG) * 1.14 - PX, -Math.sin(SIG) * 1.14];
const TIP_IN = [Math.cos(SIG) * 1.25 - PX, Math.sin(SIG) * 1.25];
const TIP_OUT = [Math.cos(SIG) * 1.25 - PX, -Math.sin(SIG) * 1.25];

const TEXT_PHASES = ["LOCK", "UNLOCK", "IMPULSE", "DROP"];

let S0, s, Cx, Cy, cxw, portrait, phase, windowM, lastDrop, dropT, dropPallet, revealSpan;

// ── geometry helpers ──
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const glint = (c, n) => {
  // max(0, c)^n for small integer n via repeated squaring-ish multiplication
  if (c <= 0) return 0;
  let r = c;
  for (let k = 1; k < n; k++) r *= c;
  return r;
};
function seg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return hyp(px - ax - dx * t, py - ay - dy * t);
}

function pinOf(alpha) {
  return [BX - RPIN * Math.cos(alpha), -RPIN * Math.sin(alpha)];
}
function gammaOf(alpha) {
  const [x, y] = pinOf(alpha);
  return Math.atan2(y, x - PX);
}

// pallet stone in fork-local coords (relative to the pallet arbor, fork at β = 0)
function stoneSDF(qx, qy, which) {
  const a0 = which ? SIG : -SIG;
  const ux = Math.cos(a0), uy = Math.sin(a0);
  const cx = ux * 1.14 - PX, cy = uy * 1.14;
  const rx = qx - cx, ry = qy - cy;
  const a = rx * ux + ry * uy; // along the stone (toward the wheel rim = negative)
  const b = -rx * uy + ry * ux;
  const hl = 0.11, hw = 0.034;
  const dx = Math.abs(a) - hl, dy = Math.abs(b) - hw;
  let d = hyp(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
  // impulse face: chamfer the inner tip, keep the locking corner sharp
  const sg = which ? 1 : -1;
  const nl = hyp(2 * hw, 0.06);
  const na = (2 * hw) / nl, nb = (0.06 * sg) / nl;
  d = Math.max(d, -((a + hl) * na + (b - hw * sg) * nb));
  return { d, a };
}

// escape wheel: returns signed-ish distance and kind, given local polar coords
function wheel(r, phi, th, out) {
  if (r > 1.01) return false;
  out.hue = HUE.fg;
  if (r < 0.035) {
    out.v = 0.95;
    out.hue = HUE.hot;
    out.g = G("●");
    return true;
  }
  const lp = phi - th;
  if (r < 0.125) {
    const leaf = 0.072 + 0.04 * smooth(-0.35, 0.65, Math.cos(8 * lp));
    if (r > leaf) return false;
    out.d = r - leaf;
    out.kind = 1;
    return true;
  }
  if (r < 0.17) {
    out.d = -Math.min(r - 0.125, 0.17 - r);
    out.kind = 1;
    return true;
  }
  if (r < 0.645) {
    const a = lp - 0.55 * (r - 0.17);
    const dphi = a - Math.round(a / (TAU / 5)) * (TAU / 5);
    const dd = Math.abs(Math.sin(dphi) * r) - 0.036;
    if (dd >= 0) return false;
    out.d = dd;
    out.kind = 1;
    return true;
  }
  if (r < 0.79) {
    out.d = -Math.min(r - 0.645, 0.79 - r + 0.02);
    out.kind = 1;
    return true;
  }
  // club teeth: leading corner at th + k·PITCH, body trails counter-clockwise
  const dl = ((phi - th) % PITCH + PITCH) % PITCH;
  const lead = 0.13 * (1 - r) / 0.21;
  const w = r > 0.9 ? 0.15 : lerp(0.21, 0.085, smooth(0.79, 0.87, r));
  const da = dl - lead;
  if (da < 0 || da > w) return false;
  const rout = 1.0 - 0.08 * clamp(da / 0.15);
  if (r > rout) return false;
  out.d = -Math.min(da * r, (w - da) * r, rout - r);
  out.kind = 1;
  return true;
}

export default {
  id: "escapement",
  title: "SWISS_LEVER",
  caption: "lock, unlock, impulse, drop. 28 800 times an hour.",

  init(f, S) {
    S0 = S;
    const physW = S.cols, physH = S.rows / S.ax;
    portrait = physH > physW * 1.05;
    // crop the far side of the balance for a macro feel
    const xmin = -1.08, xmax = BX + RB * 0.42, ymax = 1.12;
    const spanX = xmax - xmin;
    cxw = (xmin + xmax) / 2;
    s = portrait ? Math.min((physH * 0.92) / spanX, (physW * 0.98) / (2 * ymax)) : Math.min((physW * 0.95) / spanX, (physH * 0.92) / (2 * ymax));
    Cx = S.cols / 2;
    Cy = S.rows / 2 + (portrait ? 0 : S.rows * 0.03);
    // engagement window (balance angle where the jewel is in the fork slot)
    let lo = 0, hi = Math.PI / 2;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (Math.abs(gammaOf(mid)) < BETA) lo = mid;
      else hi = mid;
    }
    windowM = Math.asin(lo / AMP) / Math.PI;
    phase = phase ?? 0;
    lastDrop = lastDrop ?? -1;
    dropT = -9;
    dropPallet = 0;
    revealSpan = portrait ? S.rows : S.cols;
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gg = f.g;

    // ── kinematics: time slows to a crawl while the jewel is in the fork ──
    {
      const m0 = (phase - Math.PI / 2) / Math.PI;
      const near = Math.abs(m0 - Math.round(m0));
      const rate = lerp(0.35, 1, smooth(windowM * 0.8, windowM * 2.2, near));
      phase += OMEGA * dt * rate;
      this.rate = rate;
    }
    const m = (phase - Math.PI / 2) / Math.PI;
    const alpha = AMP * Math.sin(Math.PI * m);
    const k = Math.round(m);
    const inWin = k >= 0 && Math.abs(m - k) < windowM;
    const passes = Math.max(0, Math.floor(m - windowM) + 1);
    let beta, fprog = 0;
    if (inWin) {
      beta = clamp(gammaOf(alpha), -BETA, BETA);
      fprog = k % 2 === 0 ? (BETA - beta) / (2 * BETA) : (beta + BETA) / (2 * BETA);
    } else beta = passes % 2 === 0 ? BETA : -BETA;
    let wv = 0;
    if (inWin) {
      if (fprog < 0.18) wv = -0.05 * (fprog / 0.18); // unlock: slight recoil
      else if (fprog < 0.82) wv = lerp(-0.05, 0.8, (fprog - 0.18) / 0.64); // impulse
      else wv = lerp(0.8, 1, smooth(0.82, 0.88, fprog)); // drop
      if (fprog >= 0.84 && lastDrop !== k) {
        lastDrop = k;
        dropT = t;
        dropPallet = k % 2 === 0 ? 0 : 1; // even pass drops onto the exit pallet
      }
    }
    const th = LOCK0 - (passes + (inWin ? wv : 0)) * HALF;
    this.dbg = { alpha, beta, th, inWin, fprog, passes };
    const phaseIdx = !inWin ? 0 : fprog < 0.18 ? 1 : fprog < 0.82 ? 2 : 3;
    const [pinx, piny] = pinOf(alpha);
    const cb = Math.cos(beta), sbt = Math.sin(beta);
    const ca = Math.cos(alpha), sa = Math.sin(alpha);

    const e = 0.75 / s; // outline band (world units)
    const sweep = t * 1.3;
    const out = { v: 0, hue: 0, g: -1, d: 0, kind: 0 };

    for (let y = 0, i = 0; y < rows; y++) {
      const sy = (y - Cy) / (s * ax);
      for (let x = 0; x < cols; x++, i++) {
        // reveal sweep on enter
        const rp = (portrait ? y : x) / revealSpan;
        if (rp > sweep) {
          V[i] = Math.abs(rp - sweep) < 0.012 ? 0.7 : 0;
          H[i] = HUE.alt;
          Gg[i] = -1;
          continue;
        }
        const sx = (x - Cx) / s;
        let wx, wy;
        if (portrait) {
          wx = cxw + sy;
          wy = -sx;
        } else {
          wx = cxw + sx;
          wy = -sy;
        }
        let v = 0, hue = HUE.fg, g = -1;
        out.g = -1;

        // impulse jewel (topmost)
        const dpin = hyp(wx - pinx, wy - piny);
        if (dpin < 0.04) {
          v = dpin < 0.016 ? 1 : 0.85;
          hue = dpin < 0.016 ? HUE.white : HUE.hot;
          V[i] = v; H[i] = hue; Gg[i] = -1;
          continue;
        }

        // pallet fork (rotated by beta about the pallet arbor)
        const rx = wx - PX, ry = wy;
        const qx = rx * cb + ry * sbt, qy = -rx * sbt + ry * cb;
        let hit = false;
        if (qx > -0.42 && qx < LF + 0.2 && Math.abs(qy) < 0.76) {
          const anchorZone = qx < 0.16;
          if (anchorZone) {
            for (let wch = 0; wch < 2 && !hit; wch++) {
              const sc = wch === 0 ? STONE_IN : STONE_OUT;
              const ddx = qx - sc[0], ddy = qy - sc[1];
              if (ddx * ddx + ddy * ddy > 0.017) continue;
              const st = stoneSDF(qx, qy, wch === 0);
              if (st.d < 0) {
                hit = true;
                const edge = st.d > -e * 0.8;
                v = edge ? 0.95 : 0.7 + 0.2 * Math.sin(st.a * 40);
                hue = edge ? HUE.white : HUE.hot;
              }
            }
          }
          if (!hit) {
            let d = 9;
            if (anchorZone) {
              d = Math.min(seg(qx, qy, 0, 0, TIP_IN[0], TIP_IN[1]) - 0.055, seg(qx, qy, 0, 0, TIP_OUT[0], TIP_OUT[1]) - 0.055, hyp(qx, qy) - 0.085);
            }
            let dart = 9;
            if (Math.abs(qy) < 0.16) {
              d = Math.min(d, Math.abs(qy) - 0.032 + (qx < 0 ? -qx : qx > LF - 0.09 ? qx - LF + 0.09 : 0) * 9);
              if (qx > LF - 0.14) {
                d = Math.min(d, seg(qx, qy, LF - 0.09, -0.067, LF - 0.09, 0.067) - 0.022);
                for (const sg of [1, -1]) {
                  d = Math.min(d, seg(qx, qy, LF - 0.09, 0.067 * sg, LF + 0.05, 0.067 * sg) - 0.02);
                  d = Math.min(d, seg(qx, qy, LF + 0.05, 0.067 * sg, LF + 0.13, 0.12 * sg) - 0.017);
                }
                dart = seg(qx, qy, LF - 0.07, 0, LF - 0.035, 0) - 0.01;
              }
            }
            if (anchorZone && qx * qx + qy * qy < 0.001) {
              hit = true;
              v = 0.95;
              hue = HUE.hot;
              g = G("●");
            } else if (d < 0) {
              hit = true;
              const edge = d > -e;
              const gl = glint(Math.cos((qx + qy) * 5 - t * 0.4), 14);
              v = edge ? 0.85 : 0.38 + 0.45 * gl;
              hue = edge || gl > 0.6 ? HUE.white : HUE.fg;
            } else if (dart < 0) {
              hit = true;
              v = 0.6;
              hue = HUE.alt;
            }
          }
        }
        if (hit) {
          V[i] = v; H[i] = hue; Gg[i] = g;
          continue;
        }

        // banking pins
        for (const sg of [1, -1]) {
          const bx = PX + 0.55 * Math.cos(BANK * sg), by = 0.55 * Math.sin(BANK * sg);
          const db = hyp(wx - bx, wy - by);
          if (db < 0.034) {
            hit = true;
            v = db < 0.014 ? 1 : 0.75;
            hue = db < 0.014 ? HUE.white : HUE.fg;
          }
        }
        if (hit) {
          V[i] = v; H[i] = hue; Gg[i] = -1;
          continue;
        }

        // balance staff: roller + jewel, rotating with alpha
        const bxr = wx - BX, byr = wy;
        const rb = hyp(bxr, byr);
        if (rb < 0.4) {
          if (rb < 0.03) {
            v = 0.95; hue = HUE.hot; g = G("●");
          } else if (rb < 0.07) {
            v = 0.7; hue = HUE.main;
          } else {
            // impulse roller with a crescent cut by the jewel
            const lx = bxr * ca + byr * sa, ly = -bxr * sa + byr * ca;
            const crescent = hyp(lx + RPIN, ly) < 0.075;
            const edge = rb > 0.4 - e;
            v = crescent ? 0 : edge ? 0.6 : rb < 0.16 ? 0.28 : 0.14 + 0.1 * glint(Math.cos(2 * Math.atan2(ly, lx) - 1), 8);
            hue = HUE.main;
          }
          V[i] = v; H[i] = hue; Gg[i] = g;
          continue;
        }

        // escape wheel
        const re = hyp(wx, wy);
        if (re < 1.01) {
          const pe = Math.atan2(wy, wx);
          if (wheel(re, pe, th, out)) {
            if (out.g >= 0) {
              V[i] = out.v; H[i] = out.hue; Gg[i] = out.g;
              continue;
            }
            const edge = out.d > -e;
            const spec = glint(Math.cos(2 * pe - 0.9), 10);
            V[i] = edge ? 0.92 : 0.46 + 0.45 * spec;
            H[i] = edge || spec > 0.7 ? HUE.white : HUE.fg;
            Gg[i] = -1;
            continue;
          }
        }

        // hairspring (outer end fixed at the stud, inner end turns with the balance)
        if (rb > SPR0 - 0.04 && rb < SPR1 + 0.09) {
          const ps = Math.atan2(byr, bxr);
          const sx2 = BX + SPR1 * Math.cos(STUD), sy2 = SPR1 * Math.sin(STUD);
          const dst = hyp(wx - sx2, wy - sy2);
          if (dst < 0.07) {
            V[i] = dst < 0.025 ? 0.9 : 0.6;
            H[i] = dst < 0.025 ? HUE.white : HUE.fg;
            Gg[i] = -1;
            continue;
          }
          const u = clamp((rb - SPR0) / (SPR1 - SPR0));
          let pl = ps - STUD - alpha * (1 - u) * 0.35;
          pl = ((pl % TAU) + TAU) % TAU;
          const n = Math.round((rb - SPR0 - SPC * pl) / (SPC * TAU));
          if (n >= 0 && n < COILS) {
            const rs = SPR0 + SPC * (pl + n * TAU);
            const dd = Math.abs(rb - rs);
            if (dd < 0.6 / (s * ax)) {
              const spec = glint(Math.cos(ps * 2 - 0.9), 6);
              V[i] = 0.42 + 0.45 * spec;
              H[i] = spec > 0.85 ? HUE.white : HUE.alt;
              Gg[i] = -1;
              continue;
            }
          }
        }

        // balance wheel: rim, timing screws, arms
        if (rb < RB + 0.09) {
          const lx = bxr * ca + byr * sa, ly = -bxr * sa + byr * ca;
          const pl = Math.atan2(ly, lx);
          if (rb > RB - 0.085 && rb <= RB) {
            const edge = rb > RB - e || rb < RB - 0.085 + e;
            const spec = glint(Math.cos(2 * Math.atan2(byr, bxr) - 0.9), 10);
            V[i] = edge ? 0.85 : 0.4 + 0.5 * spec;
            H[i] = spec > 0.7 ? HUE.white : HUE.main;
            Gg[i] = -1;
            continue;
          }
          if (rb > RB) {
            const j = Math.round(pl / (TAU / SCREWS));
            const ang = j * (TAU / SCREWS);
            const scx = Math.cos(ang) * (RB + 0.045), scy = Math.sin(ang) * (RB + 0.045);
            const ds = hyp(lx - scx, ly - scy);
            if (ds < 0.05) {
              const slot = Math.abs(-(lx - scx) * Math.sin(ang) + (ly - scy) * Math.cos(ang)) < 0.011;
              V[i] = slot ? 0.08 : ds < 0.02 ? 0.95 : 0.65;
              H[i] = ds < 0.02 ? HUE.white : HUE.main;
              Gg[i] = -1;
              continue;
            }
          }
          if (rb < RB - 0.085 && rb > 0.06) {
            const dphi = pl - Math.round(pl / (TAU / 3)) * (TAU / 3);
            const dd = Math.abs(Math.sin(dphi) * rb);
            if (dd < 0.042) {
              V[i] = dd > 0.042 - e ? 0.55 : 0.25;
              H[i] = HUE.main;
              Gg[i] = -1;
              continue;
            }
          }
        }

        // plate: perlage (overlapping circular graining), dim
        const gsz = 0.2;
        const gx = wx / gsz, gy = wy / gsz;
        const ax0 = gx - Math.round(gx), ay0 = gy - Math.round(gy);
        const ax1 = gx - 0.5 - Math.round(gx - 0.5), ay1 = gy - 0.5 - Math.round(gy - 0.5);
        const best = Math.sqrt(Math.min(ax0 * ax0 + ay0 * ay0, ax1 * ax1 + ay1 * ay1));
        const ring = 0.5 + 0.5 * Math.cos(best * 14);
        V[i] = best < 0.6 && ring > 0.82 ? 0.05 + 0.05 * (1 - best) : 0;
        H[i] = HUE.fg;
        Gg[i] = -1;
      }
    }

    // ── overlays ──
    const toScr = (wx, wy) => {
      const dx = wx - cxw, dy = wy;
      const sx = portrait ? -dy : dx, sy = portrait ? dx : -dy;
      return [Cx + sx * s, Cy + sy * s * ax];
    };
    const lab = (wx, wy, ox, oy, text, hue = HUE.fg) => {
      const [X, Y] = toScr(wx, wy);
      let lx = Math.round(X + ox), ly = Math.round(Y + oy);
      lx = Math.max(1, Math.min(cols - text.length - 1, lx));
      ly = Math.max(1, Math.min(rows - 2, ly));
      const ex = ox >= 0 ? lx - 1 : lx + text.length;
      const steps = Math.max(Math.abs(ex - X), Math.abs(ly - Y));
      for (let k = 2; k < steps; k++) {
        const px = Math.round(X + ((ex - X) * k) / steps), py = Math.round(Y + ((ly - Y) * k) / steps);
        const ii = f.idx(px, py);
        if (ii >= 0 && V[ii] < 0.2) f.set(px, py, 0.35, HUE.fg, G("·"));
      }
      for (let k = -1; k <= text.length; k++) f.set(lx + k, ly, 0);
      f.text(lx, ly, text, hue, 0.85);
    };
    if (t > 1) {
      const rot = (px, py) => [PX + (px - PX) * cb - py * sbt, (px - PX) * sbt + py * cb];
      const big = Math.min(cols, rows / ax) > 70;
      const L = (lx, ly, px, py) => (portrait ? [px, py] : [lx, ly]);
      lab(Math.cos(2.4) * 0.98, Math.sin(2.4) * 0.98, ...L(-6, -4, -14, -3), "ESCAPE WHEEL");
      const [ex, ey] = rot(Math.cos(SIG) * 1.2, Math.sin(SIG) * 1.2);
      lab(ex, ey, ...L(3, -5, -16, 2), "ENTRY PALLET", HUE.hot);
      const [xx, xy] = rot(Math.cos(SIG) * 1.2, -Math.sin(SIG) * 1.2);
      lab(xx, xy, ...L(-4, 5, 6, 2), "EXIT PALLET", HUE.hot);
      const [fx, fy] = rot(PX + LF * 0.62, 0);
      lab(fx, fy, ...L(-6, 7, -18, -2), "PALLET FORK");
      lab(PX + 0.55 * Math.cos(BANK), 0.55 * Math.sin(BANK), ...L(0, -6, -16, -1), "BANKING PIN");
      lab(pinx, piny, ...L(5, 4, 4, 3), "IMPULSE JEWEL", HUE.hot);
      if (big) {
        lab(BX + RB * Math.cos(1.0), RB * Math.sin(1.0), ...L(4, -3, 5, -2), "BALANCE", HUE.main);
        const hs = SPR0 + (SPR1 - SPR0) * 0.7;
        lab(BX + hs * Math.cos(-0.9), hs * Math.sin(-0.9), ...L(6, 4, 6, 3), "HAIRSPRING", HUE.alt);
      }
    }

    // drop spark at the pallet that just caught a tooth
    const age = t - dropT;
    if (age < 0.25) {
      const sgn = dropPallet === 0 ? -1 : 1;
      const px0 = Math.cos(SIG) * 1.0, py0 = sgn * Math.sin(SIG) * 1.0;
      const [X, Y] = toScr(px0, py0);
      const r = 1 + age * 14;
      for (let a = 0; a < 8; a++) {
        const an = (a / 8) * TAU;
        f.set(X + Math.cos(an) * r, Y + Math.sin(an) * r * ax, 1 - age * 3, HUE.white, G(a % 2 ? "·" : "*"));
      }
      f.text(Math.round(X) + 3, Math.round(Y) - 2, "TICK", HUE.white, 1 - age * 2.5);
    }

    // readouts
    if (t > 0.6) {
      let px = 2;
      for (let p = 0; p < 4; p++) {
        const on = p === phaseIdx;
        f.text(px, 1, TEXT_PHASES[p], on ? HUE.main : HUE.fg, on ? 1 : 0.35);
        px += TEXT_PHASES[p].length;
        if (p < 3) {
          f.text(px + 1, 1, "→", HUE.fg, 0.3);
          px += 3;
        }
      }
      const rate = (SLOWMO * (this.rate ?? 1)).toFixed(2).replace(/0+$/, "");
      f.text(2, 2, `28 800 vph · 4 Hz · slow-mo ×${rate}`, HUE.fg, 0.45);
      const tick = `tick ${String(passes).padStart(5, "0")}`;
      f.text(cols - tick.length - 2, 1, tick, HUE.alt, 0.6);
      f.text(cols - 15, 2, `fork ${(beta * 57.3).toFixed(1).padStart(5)}°`, HUE.fg, 0.4);
    }
  },
};
