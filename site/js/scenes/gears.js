// OFF-DUTY: mechanical watches. A movement seen through a sapphire caseback:
// meshing train, ticking escapement, breathing hairspring, côtes de Genève bridges, swinging rotor.
import { HUE, G, TAU, clamp, smooth, lerp } from "../engine/util.js";

const BEAT_HZ = 2; // balance frequency (real 4 Hz, shown at half speed)

let M = null; // layout in physical units (cell widths; y grows down)

function segDist(px, py, ax_, ay_, bx, by) {
  const vx = bx - ax_, vy = by - ay_;
  const wx = px - ax_, wy = py - ay_;
  const u = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy || 1));
  const dx = wx - vx * u, dy = wy - vy * u;
  return Math.sqrt(dx * dx + dy * dy);
}

function layout(S) {
  // tall panels: zoom in and let the case crop at the sides
  const span = Math.min(S.cols * (S.rows / S.ax > S.cols * 1.2 ? 1.4 : 1), S.rows / S.ax);
  const R = span * 0.45 - 2;
  const cx = S.cols / 2, cy = S.rows / S.ax / 2;
  const P = (u, v) => [cx + u * R, cy - v * R]; // normalized (y up) → physical
  const pitch = Math.max(4, R * 0.11);
  const mk = (rn) => {
    const N = Math.max(7, Math.round((TAU * rn * R) / pitch));
    return { N, r: (N * pitch) / TAU };
  };

  // going train: barrel → centre → third → fourth, each meshing the previous
  const spec = [
    { rn: 0.36, at: [-0.4, 0.38], hue: HUE.fg, spokes: 0 },
    { rn: 0.21, phi: -43, hue: HUE.main, spokes: 4 },
    { rn: 0.17, phi: 15, hue: HUE.main, spokes: 4 },
    { rn: 0.14, phi: -70, hue: HUE.main, spokes: 5 },
  ];
  const train = [];
  spec.forEach((s, i) => {
    const g = { ...mk(s.rn), hue: s.hue, spokes: s.spokes };
    if (i === 0) [g.x, g.y] = P(...s.at);
    else {
      const prev = train[i - 1];
      const a = (s.phi * Math.PI) / 180;
      const d = prev.r + g.r;
      g.x = prev.x + Math.cos(a) * d;
      g.y = prev.y - Math.sin(a) * d;
    }
    g.add = pitch * 0.36;
    g.hub = Math.max(1.6, g.r * 0.22);
    train.push(g);
  });
  // meshing phase offsets (see derivation: teeth of B sit in gaps of A along the line of centres)
  train[0].b0 = 0;
  for (let i = 1; i < train.length; i++) {
    const A = train[i - 1], B = train[i];
    const phi = Math.atan2(B.y - A.y, B.x - A.x);
    B.b0 = phi + Math.PI - (Math.PI - A.N * (phi - A.b0)) / B.N;
  }
  const four = train[3];
  const esc = { ...mk(0.11), hue: HUE.alt, spokes: 5, add: pitch * 0.32 };
  esc.N = 15;
  const ea = (-125 * Math.PI) / 180;
  esc.x = four.x + Math.cos(ea) * (four.r + esc.r + pitch * 0.5);
  esc.y = four.y - Math.sin(ea) * (four.r + esc.r + pitch * 0.5);
  esc.hub = Math.max(1.4, esc.r * 0.24);

  // balance sits beyond the pallet fork, away from the escape wheel
  const dir = [-0.8, 0.6]; // physical (y down) direction escape → balance
  const rb = 0.25 * R;
  const bal = {
    r: rb,
    x: esc.x + dir[0] * (esc.r + 0.1 * R + rb),
    y: esc.y + dir[1] * (esc.r + 0.1 * R + rb),
  };
  const pivot = { x: esc.x + dir[0] * (esc.r + 0.06 * R), y: esc.y + dir[1] * (esc.r + 0.06 * R) };

  const barrel = train[0];
  const bridges = {
    caps: [
      // train bridge
      [train[1].x, train[1].y, train[2].x, train[2].y, 0.055 * R],
      [train[2].x, train[2].y, train[3].x, train[3].y, 0.055 * R],
      [train[3].x, train[3].y, esc.x, esc.y, 0.05 * R],
      [esc.x, esc.y, ...P(0.72, -0.5), 0.05 * R],
      // balance cock
      [bal.x, bal.y, ...P(-0.55, -0.72), 0.07 * R],
    ],
    discs: [[bal.x, bal.y, 0.075 * R]],
  };
  const jewels = [train[1], train[2], train[3], esc, bal].map((g) => [g.x, g.y]);
  const screws = [P(0.72, -0.5), P(-0.55, -0.72)];
  const ratchet = { x: barrel.x, y: barrel.y, r: 0.16 * R };
  ratchet.N = Math.max(12, Math.round((TAU * ratchet.r) / 1.6));

  return { R, cx, cy, pitch, train, esc, bal, pivot, bridges, jewels, screws, ratchet };
}

// edge band thickness: boundaries running horizontally need more, rows are 1/ax apart
const thick = (ang) => 0.55 + 0.8 * Math.abs(Math.sin(ang));

function gearShade(g, dx, dy, d, rot, saw) {
  const ang = Math.atan2(dy, dx);
  const a = ang - rot;
  let edge;
  if (saw) {
    let u = (g.N * a) / TAU;
    u -= Math.floor(u);
    edge = g.r - g.add + 2.6 * g.add * (u < 0.7 ? u / 0.7 : 0);
  } else {
    edge = g.r + g.add * clamp(Math.cos(g.N * a) * 2.2, -1, 1);
  }
  if (d > edge) return -1;
  const th = thick(ang);
  const sheen = 0.12 * Math.cos(ang - 2.4);
  if (edge - d < th) return 0.86 + sheen;
  const inner = g.r - g.add * 1.8;
  if (d > inner) return d - inner < th ? 0.7 : 0.3 + sheen;
  if (d < g.hub) return d < 1.05 ? 2 : g.hub - d < th ? 0.8 : 0.4 + sheen;
  if (g.spokes) {
    const k = (a * g.spokes) / TAU;
    const arc = Math.abs(k - Math.round(k)) * (TAU / g.spokes) * d;
    const sw = Math.max(0.9, g.r * 0.08);
    if (arc < sw) return sw - arc < 0.7 ? 0.7 : 0.4 + sheen;
    return -1;
  }
  // solid barrel: concentric turned grain
  return 0.16 + 0.12 * (Math.sin(d * 1.6) > 0.6 ? 1 : 0) + sheen * 0.5;
}

export default {
  id: "gears",
  title: "CAL_ND-26",
  caption: "28 800 vph of tiny, honest engineering",

  init(f, S) {
    M = layout(S);
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h, Gs = f.g;
    f.clear();
    const { R, cx, cy, train, esc, bal, pivot, bridges, jewels, screws, ratchet } = M;

    // escapement timing
    const ph = TAU * BEAT_HZ * t;
    const k = Math.floor(ph / Math.PI);
    const u = ph / Math.PI - k;
    const ease = smooth(0, 0.14, u);
    const balA = 1.35 * Math.sin(ph);
    const escRot = -(k + ease) * (Math.PI / esc.N);
    const s = k % 2 ? 1 : -1;
    const pal = 0.2 * lerp(-s, s, smooth(0, 0.12, u));
    // train driven back from the escape wheel
    const m = (escRot * esc.N) / train[0].N;
    const rots = [m];
    for (let i = 1; i < train.length; i++) {
      rots[i] = train[i].b0 - (rots[i - 1] - train[i - 1].b0) * (train[i - 1].N / train[i].N);
    }
    const rotorA = Math.PI / 2 + 1.25 * Math.sin(t * 0.33) + 0.3 * Math.sin(t * 0.71);
    const ratRot = m * 0.4 + t * 0.02;
    const reveal = R * 1.25 * smooth(0, 1.4, t) + 0.01;

    const capsHit = (px, py) => {
      let best = -1e9;
      for (const c of bridges.caps) {
        const sd = c[4] - segDist(px, py, c[0], c[1], c[2], c[3]);
        if (sd > best) best = sd;
      }
      for (const dsc of bridges.discs) {
        const sd = dsc[2] - Math.hypot(px - dsc[0], py - dsc[1]);
        if (sd > best) best = sd;
      }
      return best;
    };

    const stripe = Math.max(2.6, R * 0.085);
    const perl = Math.max(2.4, R * 0.06);
    const rotorIn = 0.8 * R, rotorOut = 0.93 * R;

    for (let y = 0; y < rows; y++) {
      const py = y / ax;
      for (let x = 0; x < cols; x++) {
        const px = x;
        const dxc = px - cx, dyc = py - cy;
        const dc = Math.sqrt(dxc * dxc + dyc * dyc);
        if (dc > reveal) continue;
        const i = y * cols + x;
        // case ring
        if (dc > R) {
          if (dc < R + 1.3) {
            V[i] = 0.55 + 0.2 * Math.cos(Math.atan2(dyc, dxc) - 2.4);
            H[i] = HUE.fg;
          }
          continue;
        }
        let v = -1, h = HUE.fg, g = -1;

        // rotor rim (topmost), swinging over the movement
        if (dc > rotorIn && dc < rotorOut) {
          const ang = Math.atan2(dyc, dxc);
          let da = ang - rotorA;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          if (Math.abs(da) < 1.3) {
            const th = thick(ang);
            const endArc = (1.3 - Math.abs(da)) * dc;
            const edgeD = Math.min(dc - rotorIn, rotorOut - dc, endArc);
            v = edgeD < th ? 0.85 : 0.2 + 0.1 * Math.cos(ang - 2.4);
            h = HUE.main;
          }
        }

        // ratchet wheel on the barrel bridge
        if (v < 0) {
          const rx = px - ratchet.x, ry = py - ratchet.y;
          const rd = Math.sqrt(rx * rx + ry * ry);
          if (rd < ratchet.r + 1) {
            const ang = Math.atan2(ry, rx);
            let tu = (ratchet.N * (ang - ratRot)) / TAU;
            tu -= Math.floor(tu);
            const edge = ratchet.r - 0.5 + tu * 1.2;
            if (rd < edge) {
              const sun = Math.sin(ang * 28) > 0.55 ? 0.34 : 0.12; // soleillage
              v = rd < 1.4 ? 0.95 : edge - rd < thick(ang) ? 0.85 : sun;
              h = rd < 1.4 ? HUE.alt : HUE.fg;
              if (rd < 1.4) g = G("◉");
            }
          }
        }

        // bridges with anglage + côtes de Genève
        if (v < 0) {
          const sd = capsHit(px, py);
          if (sd > 0) {
            if (sd < 1.1) {
              v = 0.8;
              h = HUE.white;
            } else {
              let b = (px + py) * 0.7071 / stripe;
              b -= Math.floor(b);
              v = b < 0.28 ? 0.34 : 0.07;
              h = HUE.fg;
            }
          }
        }

        // balance wheel
        if (v < 0) {
          const bx = px - bal.x, by = py - bal.y;
          const bd = Math.sqrt(bx * bx + by * by);
          if (bd < bal.r) {
            const ang = Math.atan2(by, bx);
            if (bd > bal.r * 0.82) {
              const th = thick(ang);
              v = bal.r - bd < th || bd - bal.r * 0.82 < th * 0.8 ? 0.9 : 0.35 + 0.15 * Math.cos(ang - 2.4);
              h = HUE.main;
              // timing screws
              const kk = ((ang - balA) * 8) / TAU;
              if (Math.abs(kk - Math.round(kk)) < 0.07 && bd > bal.r * 0.9) {
                v = 1;
                h = HUE.white;
              }
            } else {
              const kk = ((ang - balA) * 3) / TAU;
              const arc = Math.abs(kk - Math.round(kk)) * (TAU / 3) * bd;
              if (arc < Math.max(0.7, bal.r * 0.06)) {
                v = 0.55;
                h = HUE.main;
              }
            }
          }
        }

        // gears
        if (v < 0) {
          for (let gi = 0; gi < train.length; gi++) {
            const gr = train[gi];
            const gx = px - gr.x, gy = py - gr.y;
            const gd = Math.sqrt(gx * gx + gy * gy);
            if (gd > gr.r + gr.add + 0.5) continue;
            const sv = gearShade(gr, gx, gy, gd, rots[gi], false);
            if (sv >= 0) {
              v = sv;
              h = gr.hue;
              if (sv === 2) {
                v = 1;
                h = HUE.hot;
                g = G("●");
              }
              break;
            }
          }
        }
        if (v < 0) {
          const gx = px - esc.x, gy = py - esc.y;
          const gd = Math.sqrt(gx * gx + gy * gy);
          if (gd < esc.r + esc.add * 2) {
            const sv = gearShade(esc, gx, gy, gd, escRot, true);
            if (sv >= 0) {
              v = sv === 2 ? 1 : sv + 0.1;
              h = sv === 2 ? HUE.hot : HUE.alt;
            }
          }
        }

        // main plate perlage
        if (v < 0) {
          const qx = Math.round(px / perl), qy = Math.round(py / perl + (qx & 1) * 0.5);
          const lx = px - qx * perl, ly = py - (qy - (qx & 1) * 0.5) * perl;
          const pd = Math.sqrt(lx * lx + ly * ly) / perl;
          v = Math.abs(pd - 0.42) < 0.06 && ((qx + qy) & 1) ? 0.06 : 0;
          h = HUE.fg;
        }
        V[i] = v;
        H[i] = h;
        Gs[i] = g;
      }
    }

    // hairspring: breathing archimedean spiral, outer end pinned
    const rIn = Math.max(1.2, bal.r * 0.1), rOut = bal.r * 0.62;
    const turns = Math.max(2, Math.floor((rOut - rIn) / 1.9));
    const steps = Math.ceil(turns * TAU * rOut * 1.4);
    for (let sI = 0; sI <= steps; sI++) {
      const th = (sI / steps) * turns * TAU;
      const fr = sI / steps;
      const rr = rIn + (rOut - rIn) * fr;
      const a = th + balA * (1 - fr) + 0.6;
      const x = bal.x + Math.cos(a) * rr, y = (bal.y + Math.sin(a) * rr) * ax;
      if (Math.hypot(x - cx, y / ax - cy) > reveal) continue;
      f.set(x, y, 0.78, HUE.alt, G("·"));
    }

    // pallet fork
    const pv = [pivot.x, pivot.y];
    const toEsc = Math.atan2(esc.y - pivot.y, esc.x - pivot.x) + pal;
    const toBal = Math.atan2(bal.y - pivot.y, bal.x - pivot.x) + pal;
    const L1 = esc.r * 0.6, L2 = Math.hypot(bal.x - pivot.x, bal.y - pivot.y) - bal.r * 0.25;
    const sp = (a, l) => [pv[0] + Math.cos(a) * l, pv[1] + Math.sin(a) * l];
    const armA = sp(toEsc + 0.75, L1), armB = sp(toEsc - 0.75, L1), lev = sp(toBal, L2);
    const seg = (p, q, hue, v) => f.line(p[0], p[1] * ax, q[0], q[1] * ax, v, hue, "auto", ax);
    if (reveal > R * 0.6) {
      seg(pv, armA, HUE.fg, 0.85);
      seg(pv, armB, HUE.fg, 0.85);
      seg(pv, lev, HUE.fg, 0.8);
      f.set(armA[0], armA[1] * ax, 1, HUE.hot, G("■"));
      f.set(armB[0], armB[1] * ax, 1, HUE.hot, G("■"));
      f.set(lev[0], lev[1] * ax, 0.9, HUE.white, G("Y"));
      f.set(pv[0], pv[1] * ax, 1, HUE.hot, G("●"));
    }

    // jewels and blued screws on the bridges
    if (reveal > R * 0.9) {
      for (const [jx, jy] of jewels) {
        f.set(jx, jy * ax, 1, HUE.hot, G("●"));
        if (R > 30) {
          f.set(jx - 1, jy * ax, 0.7, HUE.main, G("("));
          f.set(jx + 1, jy * ax, 0.7, HUE.main, G(")"));
        }
      }
      for (const [sx, sy] of screws) f.set(sx, sy * ax, 0.95, HUE.alt, G("⊕") >= 0 ? G("◉") : G("o"));
    }

    // engraving along the rotor rim
    const msg = "DELIRIUM · AUTOMATIC · ND-26";
    const rm = (rotorIn + rotorOut) / 2;
    const step = 1.9 / rm;
    const a0 = rotorA - (step * (msg.length - 1)) / 2;
    if (rm > 14 && reveal > R) {
      for (let c = 0; c < msg.length; c++) {
        if (msg[c] === " ") continue;
        const a = a0 + c * step;
        f.set(cx + Math.cos(a) * rm, (cy + Math.sin(a) * rm) * ax, 0.95, HUE.white, G(msg[c]));
      }
    }

    // HUD
    const hud = smooth(0.6, 1.4, t);
    if (hud > 0) {
      f.text(2, 1, "CAL. ND-26 // AUTOMATIC", HUE.main, 0.9 * hud);
      f.text(2, rows - 2, "28 800 vph · slow-mo ×0.5", HUE.fg, 0.6 * hud);
      const amp = `amp ${Math.round(270 + 8 * Math.sin(t * 0.4))}°`;
      if (cols > 44) f.text(cols - amp.length - 2, rows - 2, amp, HUE.alt, 0.7 * hud);
      if (cols > 44) f.text(cols - 12, 1, "25 JEWELS", HUE.hot, 0.75 * hud);
    }
  },
};
