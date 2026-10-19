// Hansang Lab: scattered individuals flock, then gather into warm community hubs.
import { HUE, G, clamp, rng, TAU, smooth, noise2 } from "../engine/util.js";

const ARROWS = ["→", "↗", "↑", "↖", "←", "↙", "↓", "↘"].map(G);
const ARROW_SET = new Set(ARROWS);
const CYCLE = 24;

let st = null;

function build(S) {
  const r = rng(9);
  const W = S.cols, H = S.rows / S.ax; // physical units: cell widths
  const n = Math.round(clamp((S.cols * S.rows) / 40, 60, 420));
  const x = new Float32Array(n), y = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = r() * W;
    y[i] = r() * H;
    const a = r() * TAU;
    vx[i] = Math.cos(a) * 5;
    vy[i] = Math.sin(a) * 5;
  }
  const portrait = W < H;
  const hubCount = portrait ? 3 : 4;
  const hubs = Array.from({ length: hubCount }, (_, k) => {
    const u = (k + 0.5) / hubCount;
    return {
      bx: portrait ? W * (0.3 + 0.4 * (k % 2)) : W * u,
      by: portrait ? H * u : H * (0.35 + 0.3 * (k % 2)),
      x: 0,
      y: 0,
      count: 0,
      glow: 0,
      seed: r() * 100,
    };
  });
  const cell = 5;
  const gw = Math.ceil(W / cell) + 1, gh = Math.ceil(H / cell) + 1;
  st = { r, n, x, y, vx, vy, W, H, hubs, cell, gw, gh, head: new Int32Array(gw * gh), next: new Int32Array(n), cycleN: -1, labels: [] };
}

export default {
  id: "boids",
  title: "COMMUNITY_FLOCK",
  caption: "strangers in a new city, finding each other",

  init(f, S) {
    build(S);
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    if (!st) build(S);
    const { n, x, y, vx, vy, W, H, hubs, cell, gw, gh, head, next } = st;

    // cycle: drift apart → gather → hold → scatter
    const ph = t % CYCLE;
    const cn = Math.floor(t / CYCLE);
    const gather = smooth(3, 10, ph) * (1 - smooth(20, 21.5, ph));
    if (cn !== st.cycleN) {
      st.cycleN = cn;
      if (cn > 0) {
        for (let i = 0; i < n; i++) {
          const a = st.r() * TAU;
          vx[i] += Math.cos(a) * 8;
          vy[i] += Math.sin(a) * 8;
        }
      }
    }
    for (const h of hubs) {
      h.x = h.bx + noise2(h.seed, t * 0.05) * W * 0.08;
      h.y = h.by + noise2(h.seed + 9, t * 0.05) * H * 0.06;
      h.count = 0;
    }

    // spatial hash
    head.fill(-1);
    for (let i = 0; i < n; i++) {
      const gx = clamp((x[i] / cell) | 0, 0, gw - 1), gy = clamp((y[i] / cell) | 0, 0, gh - 1);
      const k = gy * gw + gx;
      next[i] = head[k];
      head[k] = i;
    }

    const hr = Math.min(W, H) * 0.09 + 3;
    const mx = input.x, my = input.y / ax;
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, ax2 = 0, ay2 = 0, cx = 0, cy = 0, cnt = 0;
      const gx = (x[i] / cell) | 0, gy = (y[i] / cell) | 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const qx = gx + ox, qy = gy + oy;
          if (qx < 0 || qy < 0 || qx >= gw || qy >= gh) continue;
          for (let j = head[qy * gw + qx]; j >= 0; j = next[j]) {
            if (j === i) continue;
            const dx = x[j] - x[i], dy = y[j] - y[i];
            const d2 = dx * dx + dy * dy;
            if (d2 > 25) continue;
            if (d2 < 5) {
              const inv = 1 / (d2 + 0.1);
              sx -= dx * inv;
              sy -= dy * inv;
            }
            ax2 += vx[j];
            ay2 += vy[j];
            cx += dx;
            cy += dy;
            cnt++;
          }
        }
      }
      let fx = sx * 2.2, fy = sy * 2.2;
      if (cnt) {
        fx += (ax2 / cnt - vx[i]) * 0.7 + (cx / cnt) * 0.3;
        fy += (ay2 / cnt - vy[i]) * 0.7 + (cy / cnt) * 0.3;
      }
      // nearest hub: pull in, then orbit
      let best = null, bd = 1e9;
      for (const h of hubs) {
        const d = Math.hypot(h.x - x[i], h.y - y[i]);
        if (d < bd) (bd = d), (best = h);
      }
      if (bd < hr * 1.4) best.count++;
      if (gather > 0) {
        const dx = (best.x - x[i]) / bd, dy = (best.y - y[i]) / bd;
        const pull = bd > hr ? 6 : 1.5;
        fx += (dx * pull - dy * 3.5) * gather;
        fy += (dy * pull + dx * 3.5) * gather;
      }
      if (input.inside) {
        const dx = mx - x[i], dy = my - y[i];
        const d = Math.hypot(dx, dy);
        if (d < 30 && d > 0.5) {
          fx += (dx / d) * 9;
          fy += (dy / d) * 9;
        }
      }
      fx += noise2(i * 0.31, t * 0.4) * 2;
      fy += noise2(i * 0.31 + 50, t * 0.4) * 2;
      vx[i] += fx * dt;
      vy[i] += fy * dt;
      const sp = Math.hypot(vx[i], vy[i]);
      const lo = 3.5, hi = 9;
      if (sp > hi) {
        vx[i] *= hi / sp;
        vy[i] *= hi / sp;
      } else if (sp < lo && sp > 0) {
        vx[i] *= lo / sp;
        vy[i] *= lo / sp;
      }
    }
    for (let i = 0; i < n; i++) {
      x[i] = (x[i] + vx[i] * dt + W) % W;
      y[i] = (y[i] + vy[i] * dt + H) % H;
    }

    // render: trails fade (old heads become plain ramp dots), hub glows, then heads
    for (const [lx, ly, len] of st.labels) for (let k = 0; k < len; k++) f.set(lx + k, ly, 0);
    st.labels.length = 0;
    const label = (lx, ly, str, hue, v) => {
      f.text(lx, ly, str, hue, v);
      st.labels.push([lx, ly, str.length]);
    };
    f.fade(Math.exp(-dt * 5));
    for (let i = 0; i < f.n; i++) {
      if (ARROW_SET.has(f.g[i])) {
        f.g[i] = -1;
        f.v[i] *= 0.42;
      }
    }
    const pending = [];
    for (const h of hubs) {
      h.glow += (smooth(2, n / hubs.length / 2, h.count) * gather - h.glow) * Math.min(1, dt * 2);
      if (h.glow < 0.02) continue;
      const hx = h.x, hy = h.y * ax, R = hr * 1.7;
      for (let yy = Math.floor(hy - R * ax); yy <= hy + R * ax; yy++) {
        for (let xx = Math.floor(hx - R); xx <= hx + R; xx++) {
          const d = Math.hypot(xx - hx, (yy - hy) / ax) / R;
          if (d > 1) continue;
          const ring = Math.abs(d - 0.62) < 0.035 ? 0.25 : 0;
          f.plot(xx, yy, h.glow * (0.32 * (1 - d) * (1 - d) + ring), ring ? HUE.hot : HUE.main);
        }
      }
      f.set(hx, hy, 0.6 + 0.4 * h.glow, HUE.white, G("◉"));
      if (h.glow > 0.3) {
        const str = `hub.0${hubs.indexOf(h) + 1} · ${h.count} online`;
        const lx = clamp(Math.round(hx - str.length / 2), 0, cols - str.length);
        let ly = Math.round(hy - R * ax - 1);
        if (ly < 3) ly = Math.round(hy + R * ax + 1);
        pending.push([lx, ly, str, 0.25 + 0.5 * h.glow]);
      }
    }
    for (let i = 0; i < n; i++) {
      const sx = x[i], sy = y[i] * ax;
      const a = Math.atan2(-vy[i], vx[i]);
      const g = ARROWS[(Math.round(a / (Math.PI / 4)) + 8) % 8];
      let hue = HUE.alt;
      for (const h of hubs) {
        const d = Math.hypot(h.x - x[i], h.y - y[i]);
        if (d < hr * 1.3 && gather > 0.3) hue = d < hr * 0.5 ? HUE.white : HUE.main;
      }
      f.set(sx, sy, 0.92, hue, g);
    }

    for (const [lx, ly, str, v] of pending) label(lx, ly, str, HUE.fg, v);
    label(1, rows - 2, "community.sync()", HUE.alt, 0.4);
    const status = gather > 0.5 ? "gathering " : ph > 20 ? "dispersing" : "wandering ";
    label(1, 1, `members ${n} · ${status}`, HUE.fg, 0.38);
  },
};
