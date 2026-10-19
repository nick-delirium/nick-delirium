// COSMIC_MIND: a barred two-arm spiral galaxy whose stars periodically swirl into
// a layered neural network, run a forward pass, then dissolve back into the galaxy.
import { HUE, clamp, smooth, lerp, rng, hash1, G, TAU } from "../engine/util.js";

const N = 6200;
const LAYERS = [4, 6, 7, 6, 3];
const T_GAL = 13, T_IN = 3, T_HOLD = 7, T_OUT = 3;
const CYCLE = T_GAL + T_IN + T_HOLD + T_OUT;
const PATTERN = 0.11; // galaxy pattern speed, rad/s
const D = 3.2; // camera distance (model units)

// particle kinds
const BULGE = 0, BAR = 1, ARM = 2, DISK = 3, GAS = 4;

let P, nodes, edges, bgStars, arcs, comets, R, cx, cy, F, portrait, nextArc, nextComet;

function build(S) {
  R = rng(4207);
  const gr = () => Math.sqrt(-2 * Math.log(R() + 1e-9)) * Math.cos(TAU * R());
  P = {
    kind: new Uint8Array(N),
    r: new Float32Array(N),
    th: new Float32Array(N),
    h: new Float32Array(N),
    br: new Float32Array(N),
    ph: new Float32Array(N),
    jx: new Float32Array(N),
    jy: new Float32Array(N),
    jz: new Float32Array(N),
    nx: new Float32Array(N),
    ny: new Float32Array(N),
    nz: new Float32Array(N),
    nl: new Float32Array(N), // position along the network in layer units (for pulses)
    edge: new Uint8Array(N),
  };
  const pitch = 0.27; // spiral pitch angle
  for (let i = 0; i < N; i++) {
    const q = R();
    let kind, r, th, h;
    if (q < 0.12) {
      kind = BULGE;
      r = Math.abs(gr()) * 0.11;
      th = R() * TAU;
      h = gr() * 0.06;
    } else if (q < 0.2) {
      kind = BAR;
      r = Math.abs(gr()) * 0.15;
      th = R() < 0.5 ? 0 : Math.PI;
      th += gr() * 0.25;
      h = gr() * 0.03;
    } else if (q < 0.7) {
      kind = ARM;
      r = 0.16 + Math.pow(R(), 1.1) * 0.95;
      const arm = R() < 0.5 ? 0 : Math.PI;
      th = arm + Math.log(r / 0.16) / Math.tan(pitch) + gr() * (0.06 + r * 0.07);
      h = gr() * 0.022;
    } else if (q < 0.9) {
      kind = DISK;
      r = 0.1 + Math.pow(R(), 0.7) * 1.05;
      th = R() * TAU;
      h = gr() * 0.03;
    } else {
      kind = GAS;
      r = 0.22 + Math.pow(R(), 0.9) * 0.8;
      const arm = R() < 0.5 ? 0 : Math.PI;
      th = arm + Math.log(r / 0.16) / Math.tan(pitch) - 0.22 + gr() * 0.07;
      h = gr() * 0.015;
    }
    P.kind[i] = kind;
    P.r[i] = r;
    P.th[i] = th;
    P.h[i] = h;
    P.br[i] = 0.6 + 0.4 * R();
    P.ph[i] = R() * TAU;
    const a = R() * TAU, b = Math.acos(2 * R() - 1);
    P.jx[i] = Math.sin(b) * Math.cos(a);
    P.jy[i] = Math.cos(b);
    P.jz[i] = Math.sin(b) * Math.sin(a);
  }

  // composition
  portrait = S.rows / S.ax > S.cols * 1.05;
  if (portrait) {
    cx = S.cols * 0.5;
    cy = S.rows * 0.5;
    F = S.cols * 0.47;
  } else {
    cx = S.cols * 0.62;
    cy = S.rows * 0.52;
    F = Math.min(S.cols * 0.31, (S.rows / S.ax) * 0.56);
  }
  // network layout in model space (layers flow left→right, or top→bottom in tall panels)
  nodes = [];
  const L = LAYERS.length;
  LAYERS.forEach((n, l) => {
    for (let k = 0; k < n; k++) {
      const along = -0.95 + (1.9 * l) / (L - 1), across = (k - (n - 1) / 2) * (portrait ? 0.25 : 0.2);
      nodes.push({
        l,
        x: portrait ? across : along,
        y: portrait ? -along : across,
        z: 0.16 * Math.sin(k * 1.7 + l * 2.3),
      });
    }
  });
  edges = [];
  let base = 0;
  for (let l = 0; l < L - 1; l++) {
    const nb = base + LAYERS[l];
    for (let a = 0; a < LAYERS[l]; a++) for (let b = 0; b < LAYERS[l + 1]; b++) edges.push([base + a, nb + b, l]);
    base = nb;
  }
  for (let i = 0; i < N; i++) {
    if (i % 100 < 30) {
      const nd = nodes[i % nodes.length];
      P.nx[i] = nd.x + gr() * 0.026;
      P.ny[i] = nd.y + gr() * 0.026;
      P.nz[i] = nd.z + gr() * 0.026;
      P.nl[i] = nd.l;
      P.edge[i] = 0;
    } else {
      const e = edges[Math.floor(hash1(i * 7919 + 13) * edges.length)];
      const u = hash1(i * 104729 + 7);
      const A = nodes[e[0]], B = nodes[e[1]];
      P.nx[i] = lerp(A.x, B.x, u) + gr() * 0.006;
      P.ny[i] = lerp(A.y, B.y, u) + gr() * 0.006;
      P.nz[i] = lerp(A.z, B.z, u) + gr() * 0.006;
      P.nl[i] = e[2] + u;
      P.edge[i] = 1;
    }
  }

  bgStars = [];
  const nb = Math.round((S.cols * S.rows) / 70);
  for (let k = 0; k < nb; k++) bgStars.push([R() * S.cols, R() * S.rows, R(), R() * TAU]);
  arcs = [];
  comets = [];
  nextArc = 2.2;
  nextComet = 4 + R() * 4;
}

/** blend factor toward the network (0 galaxy … 1 network) and transition progress */
function phase(t) {
  const c = t % CYCLE;
  if (c < T_GAL) return { e: 0, k: 0, hold: -1 };
  if (c < T_GAL + T_IN) {
    const k = (c - T_GAL) / T_IN;
    return { e: smooth(0, 1, k), k, hold: -1 };
  }
  if (c < T_GAL + T_IN + T_HOLD) return { e: 1, k: 0, hold: c - T_GAL - T_IN };
  const k = (c - T_GAL - T_IN - T_HOLD) / T_OUT;
  return { e: 1 - smooth(0, 1, k), k, hold: -1 };
}

function jag(x0, y0, x1, y1, depth, out) {
  if (depth === 0) {
    out.push([x1, y1]);
    return;
  }
  const mx = (x0 + x1) / 2 + (R() - 0.5) * Math.abs(y1 - y0 + x1 - x0) * 0.35;
  const my = (y0 + y1) / 2 + (R() - 0.5) * Math.abs(x1 - x0) * 0.2;
  jag(x0, y0, mx, my, depth - 1, out);
  jag(mx, my, x1, y1, depth - 1, out);
}

export default {
  id: "cosmos",
  title: "COSMIC_MIND",
  caption: "a galaxy that learns to think",

  init(f, S) {
    build(S);
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    const V = f.v, H = f.h;
    f.fade(Math.pow(0.45, dt * 60));

    const { e, k, hold } = phase(t);
    const swirl = Math.sin(Math.PI * k) * (e > 0 && e < 1 ? 1 : 0);
    const ign = t < 1.3 ? 1 - Math.pow(1 - t / 1.3, 3) : 1;
    const scale = F * (0.45 + 0.55 * ign);

    // camera: tilted, slowly drifting view of the disk → near-frontal view of the network
    const yaw = lerp(0.35 + t * 0.018, 0.42 * Math.sin(t * 0.17), e) + swirl * 1.4;
    const pitch = lerp(0.82 + 0.08 * Math.sin(t * 0.09), 0.14, e);
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rot = PATTERN * t;
    const nnSY = 1;

    // forward-pass wavefront, in layer units
    const L = LAYERS.length;
    const wave = hold >= 0 ? ((hold * 1.5) % (L + 1.2)) - 0.3 : -9;

    const { kind, r, th, h, br, ph, jx, jy, jz, nx, ny, nz, nl, edge } = P;
    for (let i = 0; i < N; i++) {
      // galaxy position (pattern frame rotated rigidly, with a little shimmer)
      const kd = kind[i];
      let gx, gz;
      if (kd === BAR) {
        const lx = r[i] * Math.cos(th[i]) * 2.1, lz = r[i] * Math.sin(th[i]) * 0.55;
        const c = Math.cos(rot), s = Math.sin(rot);
        gx = lx * c - lz * s;
        gz = lx * s + lz * c;
      } else {
        const a = th[i] + rot * (kd === BULGE ? 1.6 : 1) + (0.05 * Math.sin(t * 0.3 + r[i] * 7)) / (r[i] + 0.4);
        gx = r[i] * Math.cos(a);
        gz = r[i] * Math.sin(a);
      }
      const gy = h[i];

      let x = gx, y = gy, z = gz;
      if (e > 0) {
        x = lerp(gx, nx[i], e);
        y = lerp(gy, ny[i] * nnSY, e);
        z = lerp(gz, nz[i], e);
        if (swirl > 0) {
          const amp = swirl * 0.28 * (0.6 + 0.4 * Math.sin(t * 2.3 + ph[i]));
          x += jx[i] * amp;
          y += jy[i] * amp;
          z += jz[i] * amp;
        }
      }

      // camera transform + perspective
      const x1 = x * cyw - z * syw, z1 = x * syw + z * cyw;
      const y2 = y * cp + z1 * sp, z2 = -y * sp + z1 * cp;
      const d = D + z2;
      if (d < 0.4) continue;
      const sc = (scale * D) / d;
      const sx = Math.round(cx + x1 * sc), sy = Math.round(cy - y2 * sc * ax);
      if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) continue;
      const shade = clamp(1.2 - z2 * 0.45, 0.55, 1.5);

      // galaxy look
      let vg, hg;
      if (kd === BULGE) {
        vg = 0.24;
        hg = r[i] < 0.05 ? HUE.white : HUE.main;
      } else if (kd === BAR) {
        vg = 0.22;
        hg = HUE.main;
      } else if (kd === ARM) {
        vg = 0.3 * (1.15 - r[i] * 0.5);
        hg = r[i] < 0.3 ? HUE.main : HUE.alt;
      } else if (kd === DISK) {
        vg = 0.07;
        hg = HUE.fg;
      } else {
        vg = 0.16;
        hg = HUE.hot;
      }
      vg *= br[i] * (0.85 + 0.15 * Math.sin(t * 3 + ph[i]));

      let v = vg, hue = hg;
      if (e > 0) {
        let vn, hn;
        if (edge[i]) {
          vn = 0.06;
          hn = HUE.alt;
        } else {
          vn = 0.3;
          hn = HUE.main;
        }
        if (wave > -1) {
          const dl = nl[i] - wave;
          const b = edge[i] ? Math.exp(-dl * dl * 14) * 1.1 : Math.exp(-dl * dl * 30) * 0.9;
          vn += b;
          if (b > 0.35) hn = HUE.white;
          if (!edge[i] && nl[i] === L - 1 && wave > L - 1.3) {
            vn += 0.5;
            hn = HUE.hot;
          }
        }
        v = lerp(vg, vn * br[i], e);
        hue = e < 0.5 ? hg : hn;
      }
      v *= shade * (0.6 + 0.4 * ign);

      const idx = sy * cols + sx;
      const o = V[idx];
      V[idx] = o + v;
      if (v >= o * 0.6) {
        H[idx] = hue;
        f.g[idx] = -1;
      }
    }

    // white-hot cores
    for (let i = 0; i < f.n; i++) if (V[i] > 1.35 && f.g[i] < 0) H[i] = HUE.white;

    // ignition flash
    if (t < 0.7) {
      const fr = (t / 0.7) * F * 0.5;
      f.disc(cx, cy, fr, 0.9 * (1 - t / 0.7), HUE.white, ax);
    }

    // background starfield
    for (const [x, y, z, p] of bgStars) {
      const tw = 0.08 + z * 0.22 * (0.55 + 0.45 * Math.sin(t * (1 + z * 2) + p));
      f.plot(x, y, tw, z > 0.85 ? HUE.white : HUE.fg);
    }

    // synapse lightning between stars while in galaxy form
    if (e === 0 && t > nextArc) {
      nextArc = t + 1.4 + R() * 1.8;
      const ang = R() * TAU, r0 = 0.25 + R() * 0.5, r1 = r0 + 0.12 + R() * 0.25;
      const p = (rr, aa) => {
        const x = rr * Math.cos(aa + rot), z = rr * Math.sin(aa + rot);
        const x1 = x * cyw - z * syw, z1 = x * syw + z * cyw;
        const y2 = z1 * sp, z2 = z1 * cp;
        const sc = (scale * D) / (D + z2);
        return [cx + x1 * sc, cy - y2 * sc * ax];
      };
      const [x0, y0] = p(r0, ang), [x1, y1] = p(r1, ang + 0.4 + R() * 0.5);
      const pts = [[x0, y0]];
      jag(x0, y0, x1, y1, 4, pts);
      arcs.push({ pts, life: 0.32 });
    }
    for (let i = arcs.length - 1; i >= 0; i--) {
      const a = arcs[i];
      a.life -= dt;
      if (a.life <= 0 || e > 0) {
        arcs.splice(i, 1);
        continue;
      }
      const v = a.life / 0.32;
      for (let k2 = 1; k2 < a.pts.length; k2++) {
        f.line(a.pts[k2 - 1][0], a.pts[k2 - 1][1], a.pts[k2][0], a.pts[k2][1], 0.9 * v, v > 0.6 ? HUE.white : HUE.alt, "auto", ax);
      }
      const [ex, ey] = a.pts[a.pts.length - 1];
      f.plot(ex, ey, v, HUE.white, G("◆"));
    }

    // comets
    if (t > nextComet) {
      nextComet = t + 6 + R() * 7;
      const fromLeft = R() < 0.5;
      comets.push({ x: fromLeft ? -5 : cols + 5, y: R() * rows * 0.5, vx: (fromLeft ? 1 : -1) * (40 + R() * 30), vy: 12 + R() * 14 });
    }
    for (let i = comets.length - 1; i >= 0; i--) {
      const c = comets[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.x < -20 || c.x > cols + 20 || c.y > rows + 5) {
        comets.splice(i, 1);
        continue;
      }
      const n = Math.hypot(c.vx, c.vy);
      for (let s = 0; s < 14; s++) {
        f.plot(c.x - (c.vx / n) * s, c.y - (c.vy / n) * s * ax, 0.9 * (1 - s / 14), s < 2 ? HUE.white : HUE.alt);
      }
    }

    // HUD
    if (cols > 40) {
      let msg;
      if (hold >= 0) msg = `layer ${clamp(Math.floor(wave) + 1, 1, L)}/${L} · forward pass`;
      else if (e > 0) msg = e > 0.5 && k < 0.5 ? "stars → neurons" : k > 0 && e < 1 && e > 0 ? "neurons → stars" : "reshaping";
      else msg = `NGC-2077 · ${(N / 1000).toFixed(1)}k nodes · params: 7e9 stars`;
      if (e > 0 && hold < 0) msg = phaseLabel(t);
      const y = rows - 2;
      for (let x = 1; x < msg.length + 3; x++) f.set(x, y, 0);
      f.text(2, y, msg, hold >= 0 ? HUE.main : HUE.fg, 0.6);
    }
  },
};

function phaseLabel(t) {
  const c = t % CYCLE;
  return c < T_GAL + T_IN ? "stars → neurons" : "neurons → stars";
}
