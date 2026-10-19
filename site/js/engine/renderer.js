// Canvas renderer: turns a Field into glyphs via a pre-tinted atlas, then adds
// cursor gravity-lens, click shockwaves, scene-change decode transitions and bloom.

import { Field, GLYPHS, RAMP_IDX, RAMP_LEN, G, hash1, SLICES, GLYPH_COUNT, CJK_FONT } from "./util.js";

export const RES = { ultra: 4, hi: 5, med: 6, lo: 8 }; // cell width in css px
const LEVELS = 8;
const HUES = 5;
const ATLAS_COLS = 64; // glyphs per atlas block row; each block holds HUES × LEVELS tinted rows
const FONT = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const NOISE_GLYPHS = Array.from("!<>-_\\/[]{}=+*^?#%&$01░▒").map(G);
const TRANSITION = 0.75;

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function parseColor(str) {
  str = str.trim();
  if (str.startsWith("#")) {
    const h = str.length === 4 ? str.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3") : str;
    return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = str.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [255, 255, 255];
}

export class Renderer {
  constructor(canvas, stage, { onStats } = {}) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext("2d");
    this.atlas = document.createElement("canvas");
    this.b1 = document.createElement("canvas");
    this.b2 = document.createElement("canvas");
    this.field = new Field(1, 1);
    this.tmpV = new Float32Array(1);
    this.tmpH = new Uint8Array(1);
    this.tmpG = new Int16Array(1);
    this.onStats = onStats;
    this.scene = null;
    this.sceneT = 0;
    this.res = "hi";
    this.bloom = true;
    this.lens = true;
    this.motion = true;
    this.paused = false;
    this.visible = true;
    this.input = { x: -999, y: -999, inside: false, vx: 0, vy: 0, down: false, shocks: [] };
    this.frames = 0;
    this.statT = 0;
    this.slowFrames = 0;
    this.degraded = false;
    this.palette = null;
    this.raf = 0;
    this.last = 0;
    this.loop = this.loop.bind(this);

    new ResizeObserver(() => this.resize()).observe(stage);
    new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      this.kick();
    }).observe(stage);
    document.addEventListener("visibilitychange", () => this.kick());
    this.bindInput();
  }

  bindInput() {
    const inp = this.input;
    let lx = 0, ly = 0;
    window.addEventListener(
      "pointermove",
      (e) => {
        const r = this.canvas.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * this.field.cols;
        const y = ((e.clientY - r.top) / r.height) * this.field.rows;
        inp.vx = x - lx;
        inp.vy = y - ly;
        lx = inp.x = x;
        ly = inp.y = y;
        inp.inside = x >= 0 && y >= 0 && x < this.field.cols && y < this.field.rows && e.pointerType !== "touch";
      },
      { passive: true }
    );
    document.addEventListener("pointerleave", () => (inp.inside = false));
    window.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("a,button,input,summary,label,select,textarea,[data-noshock]")) return;
      const r = this.canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * this.field.cols;
      const y = ((e.clientY - r.top) / r.height) * this.field.rows;
      if (x < 0 || y < 0 || x >= this.field.cols || y >= this.field.rows) return;
      inp.down = true;
      inp.shocks.push({ x, y, t: performance.now() / 1000 });
      if (inp.shocks.length > 4) inp.shocks.shift();
      this.kick();
    });
    window.addEventListener("pointerup", () => (inp.down = false));
  }

  setPalette(p) {
    this.palette = {
      bg: parseColor(p.bg),
      hues: [p.fg, p.main, p.alt, p.hot, p.white].map(parseColor),
    };
    this.buildAtlas();
    this.kick(true);
  }

  setRes(res) {
    this.res = res in RES ? res : "hi";
    this.resize(true);
  }

  setOptions({ bloom, lens, motion }) {
    if (bloom !== undefined) this.bloom = bloom;
    if (lens !== undefined) this.lens = lens;
    if (motion !== undefined) this.motion = motion;
    this.kick(true);
  }

  setScene(scene) {
    if (!scene || scene === this.scene) return;
    this.scene = scene;
    this.sceneT = 0;
    // the eco fallback is per scene: a heavy scene (or a busy moment) must not degrade the next one
    this.slowFrames = 0;
    this.autoNoBloom = false;
    if (this.degraded) {
      this.degraded = false;
      this.resize(true);
    }
    this.field.clear();
    scene.init?.(this.field, this.S());
    if (!this.motion) this.prewarm();
    this.kick(true);
  }

  S() {
    return { cols: this.field.cols, rows: this.field.rows, ax: this.cw / this.ch, cw: this.cw, ch: this.ch };
  }

  /** run the scene forward without drawing, for still (reduced-motion) mode */
  prewarm() {
    const S = this.S();
    for (let i = 0; i < 90; i++) {
      this.sceneT += 1 / 30;
      this.scene.frame(this.field, this.sceneT, 1 / 30, S, this.input);
    }
    this.sceneT = Math.max(this.sceneT, TRANSITION + 0.01);
  }

  resize(force = false) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = RES[this.res] + (this.degraded ? 1 : 0);
    const ch = Math.round(cw / 0.6);
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    const cols = Math.max(8, Math.floor(w / cw));
    const rows = Math.max(6, Math.floor(h / ch));
    if (!force && cols === this.field.cols && rows === this.field.rows && dpr === this.dpr && cw === this.cw) return;
    const atlasStale = dpr !== this.dpr || cw !== this.cw;
    this.dpr = dpr;
    this.cw = cw;
    this.ch = ch;
    this.tw = Math.round(cw * dpr);
    this.th = Math.round(ch * dpr);
    this.canvas.width = cols * this.tw;
    this.canvas.height = rows * this.th;
    this.canvas.style.width = (cols * this.tw) / dpr + "px";
    this.canvas.style.height = (rows * this.th) / dpr + "px";
    this.field.resize(cols, rows);
    this.tmpV = new Float32Array(this.field.n);
    this.tmpH = new Uint8Array(this.field.n);
    this.tmpG = new Int16Array(this.field.n);
    this.b1.width = Math.max(1, this.canvas.width >> 2);
    this.b1.height = Math.max(1, this.canvas.height >> 2);
    this.b2.width = Math.max(1, this.canvas.width >> 4);
    this.b2.height = Math.max(1, this.canvas.height >> 4);
    if (atlasStale && this.palette) this.buildAtlas();
    this.scene?.init?.(this.field, this.S());
    if (this.scene && !this.motion) this.prewarm();
    this.kick(true);
  }

  /**
   * Atlas = white glyph mask tinted once per (hue, level). Glyph g lives at column g % ATLAS_COLS
   * of block floor(g / ATLAS_COLS); each block stacks HUES × LEVELS tinted copies of its mask row.
   */
  buildAtlas() {
    if (!this.tw || !this.palette) return;
    const { tw, th, atlas } = this;
    const blocks = Math.ceil(GLYPH_COUNT / ATLAS_COLS);
    const W = ATLAS_COLS * tw;

    const mask = document.createElement("canvas");
    mask.width = W;
    mask.height = blocks * th;
    const m = mask.getContext("2d");
    m.fillStyle = "#fff";
    m.textAlign = "center";
    m.textBaseline = "middle";
    m.font = `${(this.cw / 0.6) * this.dpr}px ${FONT}`;
    const at = (g) => [(g % ATLAS_COLS) * tw, ((g / ATLAS_COLS) | 0) * th];
    for (let g = 0; g < GLYPHS.length; g++) {
      const [x, y] = at(g);
      if (GLYPHS[g] === "█") {
        m.fillRect(x, y, tw, th);
        continue;
      }
      m.save();
      m.beginPath();
      m.rect(x, y, tw, th);
      m.clip();
      m.fillText(GLYPHS[g], x + tw / 2, y + th / 2 + th * 0.04);
      m.restore();
    }
    // CJK: render each char once per size, then cut it into cell-sized slices
    const big = document.createElement("canvas");
    const b = big.getContext("2d");
    let lastKey = "";
    SLICES.forEach((s, k) => {
      const bw = s.w * tw, bh = s.h * th;
      const key = s.size + s.ch;
      if (key !== lastKey) {
        lastKey = key;
        big.width = bw;
        big.height = bh;
        b.fillStyle = "#fff";
        b.textAlign = "center";
        b.textBaseline = "middle";
        b.font = `700 ${Math.floor(Math.min(bw, bh * 1.15) * 0.92)}px ${CJK_FONT}`;
        b.fillText(s.ch, bw / 2, bh / 2 + bh * 0.04);
      }
      const [x, y] = at(GLYPHS.length + k);
      m.drawImage(big, s.sx * tw, s.sy * th, tw, th, x, y, tw, th);
    });

    atlas.width = W;
    atlas.height = blocks * HUES * LEVELS * th;
    const a = atlas.getContext("2d");
    a.clearRect(0, 0, atlas.width, atlas.height);
    const tint = document.createElement("canvas");
    tint.width = W;
    tint.height = mask.height;
    const tc = tint.getContext("2d");
    const { bg, hues } = this.palette;
    for (let h = 0; h < HUES; h++) {
      for (let l = 0; l < LEVELS; l++) {
        const c = mix(bg, hues[h], 0.2 + 0.8 * Math.pow(l / (LEVELS - 1), 0.85));
        tc.globalCompositeOperation = "copy";
        tc.drawImage(mask, 0, 0);
        tc.globalCompositeOperation = "source-in";
        tc.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        tc.fillRect(0, 0, W, tint.height);
        for (let blk = 0; blk < blocks; blk++) {
          a.drawImage(tint, 0, blk * th, W, th, 0, ((blk * HUES + h) * LEVELS + l) * th, W, th);
        }
      }
    }
    // per-glyph lookup: source x and block row offset
    this.gx = new Int32Array(GLYPH_COUNT);
    this.gb = new Int32Array(GLYPH_COUNT);
    for (let g = 0; g < GLYPH_COUNT; g++) {
      this.gx[g] = (g % ATLAS_COLS) * tw;
      this.gb[g] = ((g / ATLAS_COLS) | 0) * HUES * LEVELS;
    }
  }

  /** (re)start the loop if it should be running; draw once if forced */
  kick(force = false) {
    const should = this.scene && this.visible && !document.hidden && !this.paused && this.motion;
    if (should && !this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    } else if (!should && force && this.scene && this.palette) {
      this.draw(performance.now() / 1000);
    }
  }

  loop(now) {
    this.raf = 0;
    const should = this.scene && this.visible && !document.hidden && !this.paused && this.motion;
    if (!should) return;
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    this.sceneT += dt;
    const t0 = performance.now();
    this.scene.frame(this.field, this.sceneT, dt, this.S(), this.input);
    if (this.scene.cut) {
      // the scene asked for a hard cut (e.g. a wrapper switching parts): replay the decode transition
      this.scene.cut = false;
      this.sceneT = 0;
    }
    this.draw(now / 1000);
    this.govern(performance.now() - t0, now);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** drop bloom, then resolution, if frames keep running long */
  govern(ms, now) {
    this.frames++;
    this.slowFrames = ms > 20 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 90) {
      this.slowFrames = 0;
      if (this.bloom && !this.autoNoBloom) {
        this.autoNoBloom = true;
      } else if (!this.degraded) {
        this.degraded = true;
        this.resize(true);
      }
    }
    if (now - this.statT > 500) {
      const fps = Math.round((this.frames * 1000) / (now - this.statT || 1));
      this.frames = 0;
      this.statT = now;
      this.onStats?.({ fps, cols: this.field.cols, rows: this.field.rows, degraded: this.degraded || this.autoNoBloom });
    }
  }

  draw(time) {
    if (!this.palette || !this.atlas.width) return;
    const f = this.field;
    const { cols, rows, n } = f;
    let V = f.v, H = f.h, Gs = f.g;

    const post = this.postprocess(time);
    if (post) {
      V = this.tmpV;
      H = this.tmpH;
      Gs = this.tmpG;
    }

    const ctx = this.ctx;
    const { tw, th, atlas, gx, gb } = this;
    if (!gx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const rl = RAMP_LEN - 1;
    for (let y = 0, i = 0; y < rows; y++) {
      const py = y * th;
      for (let x = 0; x < cols; x++, i++) {
        let v = V[i];
        if (v < 0.03) continue;
        if (v > 1) v = 1;
        let g = Gs[i];
        if (g < 0) {
          g = RAMP_IDX[Math.round(v * rl)];
          if (g === RAMP_IDX[0]) continue;
        }
        const l = Math.min(LEVELS - 1, (v * LEVELS) | 0);
        ctx.drawImage(atlas, gx[g], (gb[g] + H[i] * LEVELS + l) * th, tw, th, x * tw, py, tw, th);
      }
    }

    if (this.bloom && !this.autoNoBloom) {
      const { b1, b2 } = this;
      const c1 = b1.getContext("2d"), c2 = b2.getContext("2d");
      c1.clearRect(0, 0, b1.width, b1.height);
      c1.drawImage(this.canvas, 0, 0, b1.width, b1.height);
      c2.clearRect(0, 0, b2.width, b2.height);
      c2.drawImage(b1, 0, 0, b2.width, b2.height);
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.45;
      ctx.drawImage(b1, 0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 0.6;
      ctx.drawImage(b2, 0, 0, this.canvas.width, this.canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
  }

  /** writes lens / shockwave / transition into tmp buffers; returns false if untouched */
  postprocess(time) {
    const f = this.field;
    const { cols, rows, n } = f;
    const inp = this.input;
    inp.shocks = inp.shocks.filter((s) => time - s.t < 1.4);
    const lensOn = this.lens && inp.inside && this.motion;
    const trans = this.motion && this.sceneT < TRANSITION;
    if (!lensOn && !inp.shocks.length && !trans) return false;

    const sV = f.v, sH = f.h, sG = f.g;
    const V = this.tmpV, H = this.tmpH, Gs = this.tmpG;
    V.set(sV);
    H.set(sH);
    Gs.set(sG);
    const ax = this.cw / this.ch;

    const sample = (i, sx, sy) => {
      sx = Math.round(sx);
      sy = Math.round(sy);
      if (sx < 0 || sy < 0 || sx >= cols || sy >= rows) {
        V[i] = 0;
        return;
      }
      const j = sy * cols + sx;
      V[i] = sV[j];
      H[i] = sH[j];
      Gs[i] = sG[j];
    };

    // cursor: tiny black hole with lensing ring
    if (lensOn) {
      const R = 11, rh = 1.3, ring = 2.4;
      const mx = inp.x, my = inp.y;
      const y0 = Math.max(0, Math.floor(my - R * ax)), y1 = Math.min(rows - 1, Math.ceil(my + R * ax));
      const x0 = Math.max(0, Math.floor(mx - R)), x1 = Math.min(cols - 1, Math.ceil(mx + R));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - mx, dy = (y - my) / ax;
          const d = Math.hypot(dx, dy);
          if (d > R) continue;
          const i = y * cols + x;
          if (d < rh) {
            V[i] = 0;
            continue;
          }
          const k = 1 - d / R;
          const pull = 1 + 2.2 * k * k;
          sample(i, mx + dx * pull, my + dy * pull * ax);
          const rd = Math.abs(d - ring);
          if (rd < 0.75) {
            V[i] = Math.max(V[i], 0.95 - rd * 0.6);
            H[i] = 4;
            Gs[i] = -1;
          } else if (d < ring) {
            V[i] *= 0.35;
          }
        }
      }
    }

    // click shockwaves
    for (const s of inp.shocks) {
      const age = time - s.t;
      const r = age * 48;
      const life = 1 - age / 1.4;
      const w = 2.2;
      const y0 = Math.max(0, Math.floor(s.y - (r + w) * ax)), y1 = Math.min(rows - 1, Math.ceil(s.y + (r + w) * ax));
      const x0 = Math.max(0, Math.floor(s.x - r - w)), x1 = Math.min(cols - 1, Math.ceil(s.x + r + w));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - s.x, dy = (y - s.y) / ax;
          const d = Math.hypot(dx, dy) || 1;
          const off = d - r;
          if (Math.abs(off) > w) continue;
          const i = y * cols + x;
          const push = Math.cos((off / w) * Math.PI * 0.5) * 3 * life;
          sample(i, x - (dx / d) * push, y - (dy / d) * push * ax);
          V[i] = Math.max(V[i], life * 0.7 * (1 - Math.abs(off) / w));
          if (Math.abs(off) < 0.8) H[i] = 2;
        }
      }
    }

    // scene-change decode: cells resolve in random order, with a sweeping scanline
    if (trans) {
      const p = this.sceneT / TRANSITION;
      const scan = Math.floor(p * rows * 1.1);
      const tick = Math.floor(time * 24);
      for (let i = 0; i < n; i++) {
        const y = (i / cols) | 0;
        const r = hash1(i * 7 + 13);
        if (y === scan) {
          V[i] = 0.9;
          H[i] = 2;
          Gs[i] = G("─");
          continue;
        }
        if (r > p) {
          const rr = hash1(i + tick * 977);
          if (rr < 0.12 * (1 - p)) {
            V[i] = 0.4 + rr * 4;
            H[i] = rr < 0.03 ? 3 : 1;
            Gs[i] = NOISE_GLYPHS[(rr * 1000) % NOISE_GLYPHS.length | 0];
          } else V[i] *= p * 0.3;
        } else if (p - r < 0.06) {
          V[i] = Math.max(V[i], 0.85);
          H[i] = 4;
        }
      }
    }
    return true;
  }
}
