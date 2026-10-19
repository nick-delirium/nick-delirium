// CONTACT: an oscilloscope on an open channel. Lissajous, a keyed carrier, a radar ring.
import { HUE, G, TAU, clamp, smooth } from "../engine/util.js";

// on/off keying of "HI · SAY HELLO" in morse
const MORSE = { H: "....", I: "..", S: "...", A: ".-", Y: "-.--", E: ".", L: ".-..", O: "---" };
const KEY = (() => {
  const bits = [];
  for (const w of ["HI", "SAY", "HELLO"]) {
    for (const ch of w) {
      for (const s of MORSE[ch]) bits.push(...(s === "." ? [1] : [1, 1, 1]), 0);
      bits.push(0, 0);
    }
    bits.push(0, 0, 0, 0);
  }
  return bits;
})();

let wasDown = false;
let pulses = [];

export default {
  id: "scope",
  title: "OPEN_CHANNEL",
  caption: "carrier up. say hello",

  init() {
    pulses = [];
    wasDown = false;
  },

  frame(f, t, dt, S, input) {
    const { cols, rows, ax } = S;
    f.fade(0.8);

    const x0 = 2, x1 = cols - 3, y0 = 3, y1 = rows - 4;
    const w = x1 - x0, h = y1 - y0;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const intro = smooth(0, 0.6, t);

    if (input.down && !wasDown) pulses.push(t);
    wasDown = input.down;
    pulses = pulses.filter((p) => t - p < 2.2);
    const burst = pulses.reduce((m, p) => Math.max(m, 1 - (t - p) / 0.9), 0);

    // graticule (re-plotted each frame under the traces)
    const divX = 10, divY = 8;
    const gridMax = x0 + w * intro;
    for (let gx = 0; gx <= divX; gx++) {
      const x = Math.round(x0 + (gx * w) / divX);
      if (x > gridMax) break;
      for (let y = y0; y <= y1; y++) {
        const sub = Math.round(((y - y0) * divY * 5) / h);
        const major = gx === divX / 2;
        if (major) f.plot(x, y, sub % 5 === 0 ? 0.26 : 0.16, HUE.fg, G(sub % 5 === 0 ? "┼" : "│"));
        else if (sub % 5 === 0) f.plot(x, y, 0.14, HUE.fg, G("·"));
      }
    }
    for (let gy = 0; gy <= divY; gy++) {
      const y = Math.round(y0 + (gy * h) / divY);
      for (let x = x0; x <= Math.min(x1, gridMax); x++) {
        const sub = Math.round(((x - x0) * divX * 5) / w);
        const major = gy === divY / 2;
        if (sub % 5 === 0) f.plot(x, y, major ? 0.24 : 0.14, HUE.fg, G(major ? "┼" : "·"));
        else if (major) f.plot(x, y, 0.16, HUE.fg, G("─"));
      }
    }
    f.box(x0 - 1, y0 - 1, w + 3, h + 3, HUE.fg, 0.32 * intro + 0.01);

    if (t < 0.25) return;

    // radar ring + sweep
    const rMax = Math.min(w / 2, h / ax / 2);
    const ringR = ((t * 0.5) % 1) * rMax;
    const nR = Math.ceil(TAU * ringR * 1.3) + 8;
    for (let k = 0; k < nR; k++) {
      const a = (k / nR) * TAU;
      f.plot(cx + Math.cos(a) * ringR, cy + Math.sin(a) * ringR * ax, 0.42 * (1 - ringR / rMax), HUE.alt);
    }
    const sa = t * 1.4;
    for (let r = 2; r < rMax; r += 0.7) f.plot(cx + Math.cos(sa) * r, cy + Math.sin(sa) * r * ax, 0.3, HUE.alt);

    // lissajous, morphing ratio a:b
    const ratios = [[3, 2], [5, 4], [3, 4], [5, 6], [1, 2], [4, 3]];
    const seg = (t / 6) % ratios.length;
    const i0 = Math.floor(seg), mix = smooth(0.7, 1, seg - i0);
    const [a0, b0] = ratios[i0], [a1, b1] = ratios[(i0 + 1) % ratios.length];
    const A = a0 + (a1 - a0) * mix, B = b0 + (b1 - b0) * mix;
    const delta = t * 0.6;
    const lr = rMax * (0.72 + 0.18 * burst) * smooth(0.25, 1, t);
    const N = Math.ceil(lr * 24);
    let px = null, py = null;
    for (let k = 0; k <= N; k++) {
      const u = (k / N) * TAU;
      const x = cx + Math.sin(A * u + delta) * lr;
      const y = cy + Math.sin(B * u) * lr * ax;
      f.plot(x, y, 0.88, HUE.main);
      px = x;
      py = y;
    }
    // bright beam head
    const hu = (t * 1.1) % TAU;
    f.plot(cx + Math.sin(A * hu + delta) * lr, cy + Math.sin(B * hu) * lr * ax, 1, HUE.white, G("●"));

    // keyed carrier along the lower band (extra decay there keeps it crisp)
    const band = y1 - Math.max(3, Math.round(h * 0.16));
    const amp = Math.max(1.5, h * 0.11);
    for (let y = Math.max(0, Math.floor(band - amp * 2.8)); y <= Math.min(rows - 1, Math.ceil(band + amp * 2.8)); y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * cols + x;
        if (f.h[i] === HUE.alt && f.g[i] < 0) f.v[i] *= 0.35;
      }
    }
    const bitW = Math.max(2.2, w / 46);
    let last = null;
    for (let x = x0; x <= x1; x++) {
      const pos = (x - x0) / bitW + t * 6;
      const bi = Math.floor(pos);
      const on = KEY[((bi % KEY.length) + KEY.length) % KEY.length];
      const nxt = KEY[(((bi + 1) % KEY.length) + KEY.length) % KEY.length];
      const fr = pos - bi;
      const env = on + (nxt - on) * smooth(0.75, 1, fr);
      const y = band - Math.sin(x * 0.85 - t * 7) * amp * (0.12 + 0.88 * env) * (1 + burst * 1.6);
      if (last !== null) f.line(x - 1, last, x, y, 0.75 + 0.25 * env, HUE.alt, undefined, ax);
      last = y;
    }

    // transmission pulses on click
    for (const p of pulses) {
      const age = t - p;
      const r = age * rMax * 1.1;
      const n = Math.ceil(TAU * r * 1.2) + 8;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        f.plot(cx + Math.cos(a) * r, cy + Math.sin(a) * r * ax, clamp(1 - age / 2.2) * 0.95, HUE.hot);
      }
    }

    // readouts
    const ro = smooth(0.3, 0.9, t);
    f.text(x0, 1, "CH1 2.00V", HUE.main, 0.85 * ro);
    f.text(x0 + 11, 1, "CH2 500mV", HUE.alt, 0.75 * ro);
    const fq = "freq 433.92MHz";
    if (cols > 40) f.text(x1 - fq.length + 1, 1, fq, HUE.fg, 0.7 * ro);
    const sent = burst > 0;
    const blink = Math.floor(t * 2) % 2 === 0;
    f.text(x0, rows - 2, sent ? "TX ▶ SENT" : blink ? "TX ▶ READY" : "TX   READY", sent ? HUE.hot : HUE.main, 0.95 * ro);
    const tb = "T 10ms/div";
    if (cols > 34) f.text(x1 - tb.length + 1, rows - 2, tb, HUE.fg, 0.6 * ro);
    if (cols > 60) f.text(Math.round(cx - 7), rows - 2, `${A.toFixed(1)}:${B.toFixed(1)} ph ${((delta % TAU) * 57.3).toFixed(0).padStart(3, "0")}°`, HUE.fg, 0.5 * ro);
  },
};
