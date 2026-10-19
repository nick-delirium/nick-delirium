// Dev harness: run a scene headless and print frames as plain ASCII.
// usage: node tools/preview.mjs <scene> [--size 120x70] [--at 1,3,6] [--hue] [--mouse x,y]
import { Field, GLYPHS, RAMP, RAMP_LEN, SLICES } from "../site/js/engine/util.js";

const args = process.argv.slice(2);
const name = args[0];
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const [cols, rows] = opt("--size", "120x70").split("x").map(Number);
const at = opt("--at", "3").split(",").map(Number);
const showHue = args.includes("--hue");
const mouse = opt("--mouse", null);

const scene = (await import(`../site/js/scenes/${name}.js`)).default;
const f = new Field(cols, rows);
const S = { cols, rows, ax: 0.6, cw: 5, ch: 8 };
const input = { x: -999, y: -999, inside: false, vx: 0, vy: 0, down: false, shocks: [] };
if (mouse) {
  const [mx, my] = mouse.split(",").map(Number);
  Object.assign(input, { x: mx, y: my, inside: true });
}
scene.init?.(f, S);

const dt = 1 / 30;
let t = 0, frames = 0, ms = 0;
const hueCh = " FMAHW";
for (const target of at) {
  while (t < target) {
    t += dt;
    const t0 = performance.now();
    scene.frame(f, t, dt, S, input);
    ms += performance.now() - t0;
    frames++;
  }
  let out = "", hues = "", lit = 0;
  for (let y = 0; y < rows; y++) {
    let line = "", hl = "";
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const v = f.v[i];
      if (v < 0.03) {
        line += " ";
        hl += " ";
        continue;
      }
      let ch;
      const gi = f.g[i];
      if (gi >= GLYPHS.length) {
        // CJK slice: the top-left slice prints the (double-width) char, its row neighbour prints nothing
        const sl = SLICES[gi - GLYPHS.length];
        ch = sl.sy === 0 && sl.sx === 0 ? sl.ch : sl.sy === 0 && sl.sx === 1 ? "" : " ";
      } else ch = gi >= 0 ? GLYPHS[gi] : RAMP[Math.round(Math.min(1, v) * (RAMP_LEN - 1))];
      if (ch !== " ") lit++;
      line += ch;
      hl += hueCh[f.h[i] + 1] ?? "?";
    }
    out += line + "\n";
    hues += hl + "\n";
  }
  console.log(`── ${scene.id} t=${target}s ${cols}x${rows} lit=${((lit / (cols * rows)) * 100).toFixed(0)}% ──`);
  console.log(out);
  if (showHue) console.log(`── hue map (F=fg M=main A=alt H=hot W=white) ──\n${hues}`);
}
console.log(`avg frame ${(ms / frames).toFixed(2)}ms over ${frames} frames (${cols * rows} cells)`);
