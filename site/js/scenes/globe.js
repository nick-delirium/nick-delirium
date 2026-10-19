// Fortis: cargo tracking → rotating planet with lifted great-circle routes and packets.
import { HUE, rng, clamp, smooth, lerp, TAU, G, fbm3 } from "../engine/util.js";

// integer hash → [0,1) (local: Math.imul keeps it exact for large inputs)
function hh(n) {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const hh2 = (x, y) => hh(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663));

const TW = 360, TH = 180; // equirect elevation texture
let tex = null;
let cities = [];
let routes = [];
let geo = null;

function buildTexture() {
  tex = new Float32Array(TW * TH);
  for (let j = 0; j < TH; j++) {
    const lat = (0.5 - (j + 0.5) / TH) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < TW; i++) {
      const lon = ((i + 0.5) / TW) * TAU - Math.PI;
      const x = cl * Math.sin(lon), y = sl, z = cl * Math.cos(lon);
      let e = fbm3(x * 1.7 + 3.1, y * 1.7 - 1.3, z * 1.7 + 0.7, 5) - 0.03;
      e -= Math.pow(Math.abs(y), 6) * 0.25; // fewer polar blobs
      tex[j * TW + i] = e;
    }
  }
}

function elev(lat, lon) {
  let i = Math.floor(((lon + Math.PI) / TAU) * TW) % TW;
  if (i < 0) i += TW;
  const j = clamp(Math.floor((0.5 - lat / Math.PI) * TH), 0, TH - 1);
  return tex[j * TW + i];
}

const unit = (lat, lon) => [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];

function slerp(a, b, om, s) {
  const so = Math.sin(om) || 1e-6;
  const ka = Math.sin((1 - s) * om) / so, kb = Math.sin(s * om) / so;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

function buildNetwork() {
  const r = rng(42);
  cities = [];
  let guard = 0;
  while (cities.length < 11 && guard++ < 4000) {
    const lat = (r() * 1.9 - 0.85) * (Math.PI / 2.4);
    const lon = r() * TAU - Math.PI;
    if (elev(lat, lon) < 0.02) continue; // cities on land
    const p = unit(lat, lon);
    if (cities.some((c) => c.p[0] * p[0] + c.p[1] * p[1] + c.p[2] * p[2] > 0.9)) continue;
    cities.push({ p, lat, lon, ph: r() * TAU });
  }
  routes = [];
  const used = new Set();
  for (let k = 0; k < 9 && cities.length > 2; k++) {
    let a, b, key, tries = 0;
    do {
      a = (r() * cities.length) | 0;
      b = (r() * cities.length) | 0;
      key = a < b ? `${a}-${b}` : `${b}-${a}`;
    } while ((a === b || used.has(key)) && tries++ < 50);
    used.add(key);
    const A = cities[a].p, B = cities[b].p;
    const om = Math.acos(clamp(A[0] * B[0] + A[1] * B[1] + A[2] * B[2], -1, 1));
    if (om < 0.3) continue;
    routes.push({ A, B, om, h: 0.04 + om * 0.045, speed: 0.07 + r() * 0.08, off: r(), id: 10 + ((r() * 89) | 0), hue: r() < 0.35 ? HUE.white : HUE.main });
  }
}

export default {
  id: "globe",
  title: "CARGO_NET",
  caption: "every parcel is a satellite // fortis tracking",

  init(f, S) {
    if (!tex) {
      buildTexture();
      buildNetwork();
    }
    const R = Math.min(S.cols * 0.43, (S.rows / S.ax) * 0.4);
    geo = { R, cx: S.cols / 2, cy: S.rows / 2 + (S.cols < S.rows ? S.rows * 0.03 : 0) };
    f.clear();
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    const { R, cx, cy } = geo;
    f.clear();
    const intro = smooth(0, 1.4, t);
    const spin = t * 0.22 + 2.2 + (input.inside ? (input.x / cols - 0.5) * 1.2 : 0);
    const tilt = 0.38;
    const cs = Math.cos(spin), ss = Math.sin(spin), ct = Math.cos(tilt), st = Math.sin(tilt);
    const L = [-0.55, 0.45, 0.7];
    const ll = Math.hypot(...L);
    const lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;

    // world → view: rotY(spin) then rotX(tilt)
    const toView = (p) => {
      const x1 = p[0] * cs + p[2] * ss, z1 = -p[0] * ss + p[2] * cs, y1 = p[1];
      return [x1, y1 * ct - z1 * st, y1 * st + z1 * ct];
    };

    // starfield
    for (let i = 0; i < (cols * rows) / 90; i++) {
      const x = (hh2(i, 3) * cols) | 0, y = (hh2(i, 7) * rows) | 0;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
      f.plot(x, y, (0.08 + hh2(i, 9) * 0.18) * tw, HUE.fg);
    }

    const reveal = intro * (R * 1.15);
    const y0 = Math.max(0, Math.floor(cy - R * 1.12 * ax)), y1 = Math.min(rows - 1, Math.ceil(cy + R * 1.12 * ax));
    const x0 = Math.max(0, Math.floor(cx - R * 1.12)), x1 = Math.min(cols - 1, Math.ceil(cx + R * 1.12));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / R, dy = -(y - cy) / (R * ax);
        const r2 = dx * dx + dy * dy;
        const rr = Math.sqrt(r2);
        if (rr * R > reveal) continue;
        if (r2 > 1) {
          // atmosphere rim
          const a = 1 - (rr - 1) / 0.1;
          if (a > 0) {
            const side = clamp(0.35 + (dx * lx + dy * ly) * 0.9, 0.15, 1);
            f.plot(x, y, a * a * 0.65 * side, HUE.alt);
          }
          continue;
        }
        const nz = Math.sqrt(1 - r2);
        // view → world: rotX(-tilt) then rotY(-spin)
        const vy = dy * ct + nz * st, vz = -dy * st + nz * ct;
        const wx = dx * cs - vz * ss, wz = dx * ss + vz * cs;
        const lat = Math.asin(clamp(vy, -1, 1)), lon = Math.atan2(wx, wz);
        const lit = Math.max(0, dx * lx + dy * ly + nz * lz);
        const e = elev(lat, lon);
        const limb = Math.pow(nz, 0.35);
        let v = 0, hue = HUE.alt, g = -1;
        if (e > 0) {
          // land: denser, brighter peaks, contour lines
          const h = clamp(e * 3, 0, 1);
          v = (0.22 + 0.78 * lit) * (0.55 + 0.45 * h) * limb;
          hue = h > 0.8 && lit > 0.7 ? HUE.white : HUE.main;
          if (Math.abs(((e * 14) % 1) - 0.5) < 0.06 && lit > 0.2) v *= 1.15;
          if (lit < 0.08) {
            // night side: city lights
            v = 0.08;
            hue = HUE.fg;
            if (hh2(Math.floor(lon * 60), Math.floor(lat * 60)) > 0.93) {
              v = 0.55 + 0.3 * Math.sin(t * 3 + x);
              hue = HUE.hot;
              g = G("·");
            }
          }
        } else {
          // ocean: sparse stipple anchored to the surface
          const q = Math.sin(lon * 48) * Math.sin(lat * 48);
          if (q > 0.55) {
            v = (0.1 + 0.35 * lit) * limb;
            g = G("·");
          } else v = 0.04 * lit;
          if (e > -0.04) v = Math.max(v, 0.12 + 0.25 * lit); // shallow coast
        }
        // graticule
        const gl = Math.abs(((lat / (Math.PI / 12)) % 1 + 1) % 1 - 0.5) > 0.47 || Math.abs(((lon / (Math.PI / 12)) % 1 + 1) % 1 - 0.5) > 0.47;
        if (gl && v < 0.3) {
          v = Math.max(v, 0.18 * limb);
          hue = HUE.alt;
          g = -1;
        }
        // terminator glow
        const term = Math.abs(dx * lx + dy * ly + nz * lz);
        if (term < 0.022 && e > 0) {
          v = Math.max(v, 0.34);
          hue = HUE.hot;
        }
        f.set(x, y, v * intro, hue, g);
      }
    }

    // routes: lifted great circles, back side hidden by the planet
    const visible = (q) => q[2] > 0 || q[0] * q[0] + q[1] * q[1] > 1;
    const proj = (q) => [cx + q[0] * R, cy - q[1] * R * ax];
    const routesOn = smooth(0.8, 2, t);
    let hudLines = [];
    for (const rt of routes) {
      const n = Math.max(24, Math.round(rt.om * R * 1.4));
      const head = (t * rt.speed + rt.off) % 1;
      for (let i = 0; i <= n; i++) {
        const s = i / n;
        const lift = 1 + rt.h * Math.sin(Math.PI * s);
        const p = slerp(rt.A, rt.B, rt.om, s);
        const q = toView([p[0] * lift, p[1] * lift, p[2] * lift]);
        if (!visible(q)) continue;
        const [sx, sy] = proj(q);
        const dh = head - s;
        if (dh >= 0 && dh < 0.12) {
          const k = 1 - dh / 0.12;
          f.set(sx, sy, (0.35 + 0.65 * k) * routesOn, k > 0.9 ? rt.hue : HUE.main, k > 0.92 ? G("◆") : -1);
        } else if (i % 2 === 0) {
          f.plot(sx, sy, 0.32 * routesOn * (q[2] > 0 ? 1 : 0.6), HUE.alt, G("·"));
        }
      }
      // packet label on the front side
      const p = slerp(rt.A, rt.B, rt.om, head);
      const lift = 1 + rt.h * Math.sin(Math.PI * head);
      const q = toView([p[0] * lift, p[1] * lift, p[2] * lift]);
      if (q[2] > 0.25) hudLines.push({ rt, q, head });
    }

    // city blips
    for (const c of cities) {
      const q = toView(c.p);
      if (q[2] <= 0.05) continue;
      const [sx, sy] = proj(q);
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + c.ph);
      f.set(sx, sy, (0.75 + 0.25 * pulse) * routesOn, HUE.hot, G(pulse > 0.5 ? "◉" : "●"));
      if (pulse > 0.8) {
        f.plot(sx - 1, sy, 0.4 * routesOn, HUE.hot, G("("));
        f.plot(sx + 1, sy, 0.4 * routesOn, HUE.hot, G(")"));
      }
    }

    // one floating tag on the nearest packet
    hudLines.sort((a, b) => b.q[2] - a.q[2]);
    if (hudLines[0] && cols > 50) {
      const { rt, q, head } = hudLines[0];
      const [sx, sy] = proj(q);
      const label = `TRK#00${rt.id}`;
      const lx2 = Math.round(sx + 2), ly2 = Math.round(sy - 2);
      if (lx2 + label.length < cols - 1 && ly2 > 0) {
        f.line(sx + 1, sy - 1, lx2, ly2 + 0.4, 0.5, HUE.fg, G("/"));
        f.text(lx2 + 1, ly2, label, HUE.white, 0.9 * routesOn);
        f.text(lx2 + 1, ly2 + 1, `${Math.round(head * 100)}%`, HUE.main, 0.7 * routesOn);
      }
    }

    // HUD: tracking table
    const hv = intro * 0.85;
    f.text(2, 1, "FORTIS//CARGO_NET", HUE.alt, hv);
    const maxRows = rows > 40 ? 4 : 2;
    for (let i = 0; i < Math.min(maxRows, routes.length); i++) {
      const rt = routes[i];
      const prog = (t * rt.speed + rt.off) % 1;
      const eta = Math.max(0, Math.round((1 - prog) / rt.speed));
      const mm = String(Math.floor(eta / 60)).padStart(2, "0"), ss2 = String(eta % 60).padStart(2, "0");
      const line = cols > 44 ? `TRK#00${rt.id} ETA ${mm}:${ss2} ${prog > 0.97 ? "DLVR" : "TRNS"}` : `#${rt.id} ${mm}:${ss2}`;
      f.text(2, 2 + i, line, prog > 0.97 ? HUE.main : HUE.fg, hv * 0.8);
    }
    const lat = (Math.sin(t * 0.3) * 59.93).toFixed(2), lon = (((spin * 57.3) % 360) - 180).toFixed(2);
    const coord = `LAT ${lat.padStart(6)} LON ${lon.padStart(7)}`;
    if (cols > coord.length + 4) f.text(cols - coord.length - 2, rows - 2, coord, HUE.fg, hv * 0.6);
    f.text(2, rows - 2, `DOCS SIGNED ${String(120 + ((t * 3) | 0)).padStart(4, "0")}`, HUE.alt, hv * 0.6);
  },
};
