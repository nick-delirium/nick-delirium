// Kupibilet: flights → low pass over a voxel-space grid terrain under a drifting cloud deck.
import { HUE, clamp, smooth, lerp, TAU, G, fbm2, fbm3 } from "../engine/util.js";

// integer hash → [0,1) (local: Math.imul keeps it exact for large inputs)
function hh(n) {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const hh2 = (x, y) => hh(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663));

const MW = 256; // heightmap width (seamless in x: noise sampled on a cylinder)
const MD = 512; // ring buffer depth
const HS = 20; // height scale
const GRID = 8; // world grid spacing
let hm = null;
let filledTo = -1;
let ybuf = null;
let depth = null;

function genRow(z) {
  const row = (((z % MD) + MD) % MD) * MW;
  const R = MW / TAU / 38;
  for (let x = 0; x < MW; x++) {
    const a = (x / MW) * TAU;
    let h = fbm3(Math.cos(a) * R, Math.sin(a) * R, z / 38, 4);
    h = h > 0 ? Math.pow(h, 1.2) * 2 : h * 0.5;
    // meandering river valley under the flight path
    const valley = Math.exp(-Math.pow((x / MW) * 2 - 1 - Math.sin(z / 90) * 0.135, 2) * 49);
    hm[row + x] = (h - valley * 0.4) * HS;
  }
}

function cell(xi, zi) {
  return hm[(((zi % MD) + MD) % MD) * MW + (((xi % MW) + MW) % MW)];
}

// bilinear height lookup
function height(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const a = cell(xi, zi), b = cell(xi + 1, zi), c = cell(xi, zi + 1), d = cell(xi + 1, zi + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// HUD text with a cleared backing
function hud(f, x, y, str, hue, v) {
  for (let i = -1; i <= str.length; i++) f.set(x + i, y, 0);
  f.text(x, y, str, hue, v);
}

export default {
  id: "terrain",
  title: "FLIGHT_LOW_PASS",
  caption: "LED → CDG // following the river at 400ft",

  init(f, S) {
    if (!hm) hm = new Float32Array(MW * MD);
    filledTo = -1;
    ybuf = new Float32Array(S.cols);
    depth = new Float32Array(S.cols * S.rows);
    f.clear();
  },

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    f.clear();
    const intro = smooth(0, 1.6, t);

    // camera
    const speed = 30;
    const pz = 40 + t * speed;
    const px = MW / 2 + Math.sin(pz / 90) * MW * 0.0675;
    const D = 300;
    const reveal = lerp(30, D, intro);
    if (filledTo < pz - 4) filledTo = Math.floor(pz) - 4;
    while (filledTo < pz + reveal + 4) genRow(++filledTo);

    const ground = Math.max(height(px, pz + 6), height(px, pz + 18), height(px, pz + 30) - 6, 0);
    const bob = Math.sin(t * 0.9) * 1.5 + Math.sin(t * 0.37) * 2;
    const ph = ground + 26 + bob;
    const heading = Math.cos(pz / 90) * 0.1;
    const fov = 1.2 * clamp(cols / (rows / ax), 0.6, 1.3);
    const horizon = rows * 0.36 + Math.sin(t * 0.5) * rows * 0.012;
    const scaleH = (cols / fov) * ax;

    // sky: haze, stars, cloud deck
    const cloudAlt = ph + 60;
    for (let y = 0; y <= Math.min(rows - 1, horizon + 1); y++) {
      const rayY = (horizon - y) / scaleH;
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const hz = y > horizon ? 0 : Math.exp(-(horizon - y) / (rows * 0.05));
        let v = hz * 0.16;
        let hue = HUE.hot;
        if (rayY > 0.03) {
          const ang = heading + (x / cols - 0.5) * fov;
          const d = (cloudAlt - ph) / rayY;
          if (d < 1200) {
            const wx = px + Math.sin(ang) * d, wz = pz + Math.cos(ang) * d;
            const c = fbm2(wx * 0.005 + t * 0.015, wz * 0.005, 3);
            const dens = smooth(0.08, 0.5, c) * (1 - d / 1200);
            if (dens > 0.03) {
              v = Math.max(v, 0.08 + dens * 0.6);
              hue = dens > 0.5 ? HUE.white : HUE.fg;
            }
          }
        }
        if (v < 0.1 && hh2(x, y) > 0.986 && y < horizon - 3) {
          v = 0.22 + 0.15 * Math.sin(t * 3 + x * y);
          hue = HUE.fg;
        }
        f.v[i] = v * intro;
        f.h[i] = hue;
      }
    }
    depth.fill(1e9);

    // terrain: hidden-line wireframe, rows of constant depth drawn front to back
    ybuf.fill(rows);
    const SP = 4;
    const off = pz % SP;
    const half = Math.tan(fov / 2);
    const WL = -4; // water level
    const prevY = new Float32Array(cols);
    for (let k = 1; k * SP - off < reveal; k++) {
      const z = k * SP - off;
      if (z < 9) continue;
      const wz = pz + z;
      const fog = 1 - smooth(D * 0.08, D * 0.95, z);
      const gridRow = Math.round(wz / SP) % 4 === 0;
      for (let x = 0; x < cols; x++) {
        const lat = ((x + 0.5) / cols - 0.5) * 2 * half;
        const wx = px + (lat + Math.sin(heading)) * z;
        const hRaw = height(wx, wz);
        const water = hRaw < WL;
        const h = water ? WL : hRaw;
        const sy = horizon + ((ph - h) / z) * scaleH;
        const py = x > 0 ? prevY[x - 1] : sy;
        prevY[x] = sy;
        if (sy >= ybuf[x]) continue;
        const yi = Math.max(0, Math.round(sy));
        const dy = sy - py;
        let g;
        if (water) g = G((x + k) % 4 === 0 ? "-" : "~");
        else if (Math.abs(dy) < 0.45) g = G(sy - Math.floor(sy) > 0.5 ? "_" : "-");
        else if (Math.abs(dy) > 2.2) g = G("|");
        else g = G(dy < 0 ? "/" : "\\");
        const peak = h > HS * 1.05;
        let v = (0.22 + 0.78 * fog) * (gridRow ? 1 : 0.5);
        let hue = water ? HUE.alt : peak ? HUE.white : z < D * 0.35 ? HUE.main : HUE.alt;
        // connect to the previous column so steep slopes stay continuous
        const ya = Math.round(Math.min(sy, py)), yb = Math.round(Math.max(sy, py));
        const run = x > 0 && yb - ya > 1 ? [ya, yb] : [yi, yi];
        const lim = Math.min(rows - 1, Math.floor(ybuf[x]) - 1, run[1]);
        for (let y = Math.max(0, run[0]); y <= lim; y++) {
          const i = y * cols + x;
          if (f.v[i] < v || depth[i] > z) {
            f.v[i] = v * intro;
            f.h[i] = hue;
            f.g[i] = run[0] === run[1] ? g : G(Math.abs(dy) > 3 ? "|" : dy < 0 ? "/" : "\\");
            depth[i] = z;
          }
        }
        // fill the occluded gap below a ridge with darkness so sky/clouds don't show through
        for (let y = yi + 1; y < Math.min(rows, ybuf[x]); y++) {
          const i = y * cols + x;
          if (depth[i] > z) {
            f.v[i] = 0;
            depth[i] = z;
          }
        }
        // grid posts: faint vertical marks where world x crosses the grid
        if (gridRow && Math.floor(wx / (SP * 4)) !== Math.floor((wx - 2 * half * z / cols) / (SP * 4)) && yi + 1 < rows) {
          const i = (yi + 1) * cols + x;
          if (f.v[i] < 0.1) {
            f.v[i] = 0.3 * fog * intro;
            f.h[i] = HUE.alt;
            f.g[i] = G("·");
          }
        }
        ybuf[x] = sy;
      }
    }

    // HUD
    const hv = 0.85 * intro;
    const cx = Math.round(cols / 2);
    const hy = Math.round(horizon);
    const wing = Math.max(4, Math.round(cols * 0.07));
    for (let k = 1; k <= wing; k++) {
      f.set(cx - 2 - k, hy, hv * 0.75, HUE.main, G("─"));
      f.set(cx + 2 + k, hy, hv * 0.75, HUE.main, G("─"));
    }
    f.set(cx - 1, hy, 0);
    f.set(cx + 1, hy, 0);
    f.set(cx, hy, hv, HUE.white, G("◇"));
    f.set(cx - 2, hy, hv, HUE.main, G("<"));
    f.set(cx + 2, hy, hv, HUE.main, G(">"));
    for (const p of [-10, 10]) {
      const y = Math.round(hy - (p / 10) * rows * 0.13);
      if (y < 4 || y > rows - 3) continue;
      const w = Math.max(2, Math.round(wing * 0.7));
      for (let k = 0; k < w; k += 2) {
        f.set(cx - 4 - k, y, hv * 0.5, HUE.alt, G("─"));
        f.set(cx + 4 + k, y, hv * 0.5, HUE.alt, G("─"));
      }
      hud(f, cx + 5 + w, y, String(Math.abs(p)), HUE.alt, hv * 0.55);
    }
    // heading tape
    const hdg = (((274 + heading * 57.3) % 360) + 360) % 360;
    const tapeW = Math.min(cols - 8, 41);
    const tx0 = Math.round(cx - tapeW / 2);
    for (let k = 0; k < tapeW; k++) {
      const deg = hdg + (k - tapeW / 2) * 1.5;
      if (Math.abs(deg - Math.round(deg / 10) * 10) < 0.75) f.set(tx0 + k, 1, hv * 0.7, HUE.fg, G("|"));
      else if (k % 2 === 0) f.set(tx0 + k, 1, hv * 0.3, HUE.fg, G("·"));
    }
    hud(f, cx - 1, 2, String(Math.round(hdg)).padStart(3, "0"), HUE.main, hv);
    f.set(cx, 0, hv, HUE.main, G("▼"));
    const alt = Math.round(ph * 22 + 2400);
    const my = Math.round(rows * 0.55);
    hud(f, 2, my - 1, "ALT", HUE.fg, hv * 0.55);
    hud(f, 2, my, String(alt).padStart(5, "0"), HUE.main, hv);
    if (cols > 46) {
      hud(f, cols - 9, 1, "LED→CDG", HUE.white, hv);
      hud(f, cols - 7, my - 1, "GS", HUE.fg, hv * 0.55);
      hud(f, cols - 7, my, `${Math.round(speed * 14.2)}KT`, HUE.main, hv);
    }
    hud(f, 2, rows - 2, `FL${String(Math.round(alt / 100)).padStart(3, "0")} · AP ON`, HUE.alt, hv * 0.65);
  },
};
