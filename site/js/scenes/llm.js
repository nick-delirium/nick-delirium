// How an LLM writes, simplified: tokenize → embed → attention over layers → softmax → sample → append, repeat.
import { HUE, clamp, lerp, smooth, hash1, G } from "../engine/util.js";

// each prompt: starting tokens + generation steps ([candidates], chosen index)
const PROMPTS = [
  {
    tokens: ["the", "cat", "sat", "on", "the"],
    steps: [
      [[["mat", 0.62], ["rug", 0.14], ["sofa", 0.08], ["floor", 0.07], ["keyboard", 0.05], ["moon", 0.04]], 0],
      [[[".", 0.48], [",", 0.21], ["and", 0.12], ["while", 0.09], ["again", 0.06], ["today", 0.04]], 0],
      [[["it", 0.41], ["the", 0.22], ["she", 0.12], ["then", 0.1], ["purring", 0.08], ["nothing", 0.07]], 0],
      [[["was", 0.55], ["felt", 0.17], ["purred", 0.11], ["seemed", 0.08], ["smelled", 0.05], ["is", 0.04]], 0],
      [[["warm", 0.38], ["soft", 0.27], ["quiet", 0.14], ["late", 0.09], ["perfect", 0.07], ["sunday", 0.05]], 1],
    ],
  },
  {
    tokens: ["replay", "every", "session", "in"],
    steps: [
      [[["order", 0.44], ["full", 0.21], ["real", 0.12], ["the", 0.1], ["slow", 0.07], ["private", 0.06]], 0],
      [[["to", 0.52], [".", 0.18], ["and", 0.12], ["before", 0.08], ["with", 0.06], ["so", 0.04]], 0],
      [[["find", 0.46], ["catch", 0.2], ["fix", 0.15], ["see", 0.1], ["debug", 0.05], ["explain", 0.04]], 0],
      [[["the", 0.5], ["every", 0.2], ["that", 0.12], ["bugs", 0.09], ["what", 0.05], ["why", 0.04]], 0],
      [[["bug", 0.42], ["regression", 0.23], ["root", 0.14], ["click", 0.1], ["edge", 0.06], ["moment", 0.05]], 0],
    ],
  },
  {
    tokens: ["a", "calm", "engineer", "writes", "fast"],
    steps: [
      [[["code", 0.58], ["tests", 0.14], ["prose", 0.09], ["docs", 0.08], ["notes", 0.06], ["poems", 0.05]], 0],
      [[["and", 0.36], [".", 0.3], ["that", 0.14], ["with", 0.1], ["without", 0.06], ["by", 0.04]], 0],
      [[["ships", 0.33], ["sleeps", 0.24], ["reads", 0.15], ["refactors", 0.12], ["drinks", 0.1], ["races", 0.06]], 1],
      [[["well", 0.45], ["early", 0.2], ["eight", 0.12], ["soundly", 0.1], ["at", 0.08], ["rarely", 0.05]], 0],
      [[[".", 0.62], [",", 0.14], ["again", 0.09], ["tonight", 0.07], ["ever", 0.05], ["too", 0.03]], 0],
    ],
  },
];

// step timeline (seconds)
const T_EMBED = 0.5, T_ATT = 2.7, T_BARS = 3.1, T_SAMPLE = 4.0, T_FLASH = 4.15, T_APPEND = 4.75, STEP = 5.3;
const OUTRO = 2.4;

let lay, promptIdx, promptStart;

function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const tokenId = (tok) => 100 + (strHash(tok) % 49800);
const introLen = (p) => 0.5 + p.tokens.length * 0.14 + 0.6;
const promptLen = (p) => introLen(p) + p.steps.length * STEP + OUTRO;

function layout(S) {
  const { cols, rows } = S;
  const W = Math.max(20, Math.min(cols - 4, 132));
  const x0 = Math.floor((cols - W) / 2);
  const he = rows >= 90 ? 7 : rows >= 60 ? 4 : 2;
  const K = rows >= 60 ? 6 : 4;
  const rowStep = rows >= 90 ? 2 : 1;
  const L = rows >= 80 ? 4 : rows >= 50 ? 3 : 2;
  const predH = 2 + K * rowStep + 2;
  const fixed = 6 + (2 + he + 1) + 1 + predH + 2;
  const hb = clamp(Math.floor((rows - 2 - fixed) / L), 3, 14);
  const H = fixed + L * hb;
  const oy = Math.max(0, Math.floor((rows - H) / 2));
  const labTok = oy + 1, chipY = oy + 2, idY = oy + 5;
  const labEmb = oy + 7, embY = oy + 8;
  const labAtt = embY + he + 1;
  const bandsTop = labAtt + 1;
  const predTop = bandsTop + L * hb + 1;
  const layers = L === 4 ? [1, 8, 16, 32] : L === 3 ? [1, 16, 32] : [1, 32];
  const barsY0 = predTop + 2;
  const sampleY = barsY0 + K * rowStep + (rowStep > 1 ? 0 : 1);
  return { W, x0, he, K, rowStep, L, layers, labTok, chipY, idY, labEmb, embY, labAtt, bandsTop, hb, predTop, barsY0, sampleY, hudY: Math.min(rows - 1, sampleY + 2) };
}

/** chips sit in fixed slots across the width so they don't jump as the sentence grows;
 *  if the slots are too narrow, pack them and slide the window (drop the oldest) */
function chipLayout(tokens, slots) {
  const { W, x0 } = lay;
  const slotW = Math.floor(W / slots);
  if (tokens.every((t) => t.length + 3 <= slotW)) {
    const chips = tokens.map((tok, i) => {
      const w = tok.length + 2;
      const x = x0 + i * slotW + Math.floor((slotW - w) / 2);
      return { tok, i, x, w, cx: x0 + i * slotW + Math.floor(slotW / 2), slotW };
    });
    return { chips, clipped: false, end: x0 + tokens.length * slotW, slotW };
  }
  let start = 0;
  const width = (from) => tokens.slice(from).reduce((a, t) => a + t.length + 3, 0) + (from > 0 ? 3 : 0);
  while (start < tokens.length - 1 && width(start) > W) start++;
  const chips = [];
  let x = x0 + (start > 0 ? 3 : 0);
  for (let i = start; i < tokens.length; i++) {
    const w = tokens[i].length + 2;
    chips.push({ tok: tokens[i], i, x, w, cx: x + Math.floor(w / 2), slotW: w + 1 });
    x += w + 1;
  }
  return { chips, clipped: start > 0, end: x, slotW: 0 };
}

function weights(key, layer, n) {
  const ws = [];
  let sum = 0;
  for (let j = 0; j < n; j++) {
    const dist = n - 1 - j;
    const local = layer === 0 ? -0.75 * dist : layer === 1 ? -0.3 * dist : -0.08 * dist;
    const s = (hash1(key * 131 + layer * 977 + j * 31) - 0.5) * 3.2 + local;
    const w = Math.exp(s);
    ws.push(w);
    sum += w;
  }
  return ws.map((w) => w / sum);
}

export default {
  id: "llm",
  title: "NEXT_TOKEN",
  caption: "how a language model writes: one token at a time",

  init(f, S) {
    lay = layout(S);
    promptIdx = 0;
    promptStart = 0;
  },

  frame(f, t, dt, S) {
    f.clear();
    const { cols, rows } = S;
    let P = PROMPTS[promptIdx];
    if (t - promptStart > promptLen(P)) {
      promptStart = t;
      promptIdx = (promptIdx + 1) % PROMPTS.length;
      P = PROMPTS[promptIdx];
    }
    const tau = t - promptStart;
    const intro = introLen(P);
    const nSteps = P.steps.length;
    const genT = tau - intro;
    const stepIdx = genT < 0 ? -1 : Math.min(nSteps - 1, Math.floor(genT / STEP));
    const st = genT < 0 ? -1 : genT - stepIdx * STEP;
    const outro = genT >= nSteps * STEP;
    const outroT = outro ? genT - nSteps * STEP : 0;
    const fade = outro ? 1 - smooth(OUTRO - 0.6, OUTRO, outroT) : 1;

    // context: base tokens + appended ones
    let appended = 0;
    if (genT >= 0) appended = outro ? nSteps : stepIdx + (st >= T_APPEND ? 1 : 0);
    const tokens = P.tokens.concat(P.steps.slice(0, appended).map(([c, k]) => c[k][0]));
    const shown = genT < 0 ? Math.min(P.tokens.length, Math.floor((tau - 0.4) / 0.14) + 1) : tokens.length;
    const { chips, clipped, end, slotW } = chipLayout(tokens.slice(0, Math.max(0, shown)), P.tokens.length + nSteps);
    const { x0, W, he, K, rowStep, L, layers, hb } = lay;

    const active = genT < 0 ? 0 : outro ? 5 : st < T_EMBED ? 1 : st < T_ATT ? 2 : st < T_SAMPLE ? 3 : 4;
    const label = (y, txt, stage) => {
      if (y < 0 || y >= rows) return;
      const on = stage === active;
      for (let k = -1; k <= txt.length; k++) f.set(x0 + k, y, 0);
      f.text(x0, y, txt, on ? HUE.main : HUE.fg, (on ? 0.9 : 0.46) * fade);
    };

    // ── tokens ──
    const queryChip = chips[chips.length - 1];
    if (clipped) f.text(x0, lay.chipY + 1, "…", HUE.fg, 0.4 * fade);
    for (const c of chips) {
      const isQ = c === queryChip && genT >= 0 && !outro;
      const fresh = genT >= 0 && c.i >= P.tokens.length && c.i === tokens.length - 1 && st >= T_APPEND && st < STEP;
      const glow = outro ? 0.6 + 0.4 * Math.sin(outroT * 6 - c.i * 0.5) : 1;
      f.box(c.x, lay.chipY, c.w, 3, isQ ? HUE.alt : HUE.fg, (isQ ? 0.7 : 0.32) * fade);
      f.text(c.x + 1, lay.chipY + 1, c.tok, fresh ? HUE.white : c.i >= P.tokens.length ? HUE.white : HUE.main, 0.92 * glow * fade);
      const id = "#" + tokenId(c.tok);
      if (slotW >= 8 && id.length < c.slotW) f.text(c.cx - Math.floor(id.length / 2), lay.idY, id, HUE.fg, 0.32 * fade);
    }

    // ── embeddings: one column vector per token ──
    for (const c of chips) {
      const isQ = c === queryChip && genT >= 0 && !outro;
      const grow = isQ && st >= 0 && st < T_EMBED ? st / T_EMBED : 1;
      const h = Math.round(he * grow);
      for (let k = 0; k < h; k++) {
        const v = hash1(strHash(c.tok) + k * 7919);
        const g = v > 0.75 ? "█" : v > 0.5 ? "▓" : v > 0.25 ? "▒" : "░";
        f.set(c.cx, lay.embY + k, (0.3 + v * 0.55) * fade, isQ ? HUE.main : HUE.alt, G(g));
      }
    }

    // ── residual streams + attention bands ──
    const yStreamTop = lay.embY + he;
    const yStreamBot = lay.bandsTop + L * hb - 1;
    for (const c of chips) {
      const isQ = c === queryChip && genT >= 0 && !outro;
      for (let y = yStreamTop; y <= yStreamBot; y++) f.plot(c.cx, y, (isQ ? 0.22 : 0.09) * fade, isQ ? HUE.alt : HUE.fg, G("│"));
    }
    const attT = st - T_EMBED, attLen = T_ATT - T_EMBED, perLayer = attLen / L;
    const key = promptIdx * 101 + Math.max(0, stepIdx) * 7;
    for (let l = 0; l < L; l++) {
      const yTop = lay.bandsTop + l * hb;
      if (cols > 40) {
        const lx = Math.max(0, x0 - 4);
        f.text(lx, yTop + Math.floor(hb / 2), `L${layers[l]}`, HUE.fg, 0.34 * fade);
      }
      for (let x = x0 + 4; x < x0 + W; x += 2) f.plot(x, yTop, 0.07 * fade, HUE.fg, G("·"));
      if (genT < 0 || outro || !queryChip) continue;
      // progress of this layer's sweep
      let p = 0;
      if (st >= T_ATT) p = 1;
      else if (attT > l * perLayer) p = clamp((attT - l * perLayer) / perLayer);
      if (p <= 0) continue;
      const ws = weights(key, l, chips.length);
      const wmax = Math.max(...ws);
      const live = p < 1;
      const dim = st >= T_ATT ? 0.45 : live ? 1 : 0.6;
      const xq = queryChip.cx;
      chips.forEach((c, j) => {
        const w = ws[j] / wmax;
        f.set(c.cx, yTop, (0.25 + 0.7 * w * p) * fade, w > 0.6 ? HUE.white : HUE.alt, G(w > 0.5 ? "●" : "•"));
        if (c === queryChip) return;
        const depth = clamp(Math.abs(xq - c.cx) * 0.3, 2, hb - 2);
        const b = (0.18 + 0.8 * w) * dim * fade;
        const steps = Math.max(6, Math.ceil(Math.abs(xq - c.cx) * 1.2));
        let px = xq, py = yTop;
        for (let s = 1; s <= steps; s++) {
          const u = (s / steps) * p;
          const x = lerp(xq, c.cx, u);
          const y = yTop + Math.sin(Math.PI * u) * depth;
          f.line(px, py, x, y, b, HUE.alt, "auto", S.ax);
          if (w > 0.55) f.plot(x, y + 1, b * 0.45, HUE.alt);
          px = x;
          py = y;
        }
      });
      if (live) {
        // information pulse travelling down the query stream
        f.set(xq, yTop, 1 * fade, HUE.white, G("◆"));
        f.set(xq, Math.round(yTop + p * hb), 0.9 * fade, HUE.main, G("▼"));
      }
    }

    // ── predict: softmax bars + sampling ──
    if (genT >= 0 && !outro) {
      const [cands, chosen] = P.steps[stepIdx];
      const k = Math.min(K, cands.length);
      const maxLen = Math.max(...cands.slice(0, k).map((c) => c[0].length));
      const barX = x0 + 3 + maxLen + 6;
      const barW = Math.max(6, Math.min(40, x0 + W - barX - 1));
      const pmax = cands[0][1];
      const grow = smooth(T_ATT, T_BARS, st);
      let cursor = -1;
      if (st >= T_BARS && st < T_SAMPLE) {
        const u = (st - T_BARS) / (T_SAMPLE - T_BARS);
        const eased = 1 - Math.pow(1 - u, 3);
        cursor = Math.floor(eased * (k * 2 + chosen)) % k;
      } else if (st >= T_SAMPLE) cursor = chosen;
      const flashing = st >= T_SAMPLE && st < T_APPEND;
      for (let r = 0; r < k; r++) {
        const y = lay.barsY0 + r * rowStep;
        if (y >= lay.sampleY) break;
        const [tok, prob] = cands[r];
        const isC = r === chosen && st >= T_SAMPLE;
        const blink = isC && flashing && Math.floor(st * 14) % 2 === 0;
        const hueRow = isC ? HUE.white : HUE.fg;
        const flying = isC && st >= T_FLASH;
        if (!flying || st >= T_APPEND) f.text(x0 + 3, y, tok, hueRow, (isC ? 1 : 0.6) * fade);
        if (grow > 0) f.text(barX - 5, y, prob.toFixed(2), HUE.fg, 0.45 * grow * fade);
        const len = Math.round((prob / pmax) * barW * grow);
        for (let x = 0; x < barW; x++) {
          if (x < len) f.set(barX + x, y, (blink ? 1 : isC ? 0.95 : 0.55 + 0.35 * (prob / pmax)) * fade, isC ? HUE.white : HUE.main, G("█"));
          else f.plot(barX + x, y, 0.08 * fade, HUE.fg, G("·"));
        }
        if (r === cursor) f.set(x0 + 1, y, 0.95 * fade, HUE.hot, G("▶"));
      }
      // sampling / append line
      const choice = cands[chosen][0];
      if (st >= T_BARS) {
        const msg = st < T_SAMPLE ? "05 SAMPLE · rolling…" : `05 SAMPLE → "${choice}" → append`;
        f.text(x0, lay.sampleY, msg, st >= T_SAMPLE ? HUE.main : HUE.fg, (st >= T_SAMPLE ? 0.85 : 0.4) * fade);
      }
      // the chosen token flies up into the context
      if (st >= T_FLASH && st < T_APPEND) {
        const u = smooth(0, 1, (st - T_FLASH) / (T_APPEND - T_FLASH));
        const sx = x0 + 3, sy = lay.barsY0 + chosen * rowStep;
        const tx = slotW ? x0 + tokens.length * slotW + Math.floor((slotW - choice.length) / 2) : Math.min(end + 1, x0 + W - choice.length - 2);
        const ty = lay.chipY + 1;
        const cx = lerp(sx, tx, u), cy = lerp(sy, ty, u) - Math.sin(Math.PI * u) * 3;
        for (let k2 = 1; k2 < 10; k2++) {
          const v = u - k2 * 0.035;
          if (v <= 0) break;
          f.plot(lerp(sx, tx, v), lerp(sy, ty, v) - Math.sin(Math.PI * v) * 3, 0.5 * (1 - k2 / 10), HUE.alt, G("·"));
        }
        f.text(Math.round(cx), Math.round(cy), choice, HUE.white, 1);
      }
    } else if (outro) {
      const done = `✓ ${nSteps} tokens generated`;
      f.text(x0, lay.barsY0, done, HUE.main, 0.85 * fade);
      f.text(x0, lay.barsY0 + 2, "new prompt incoming…", HUE.fg, 0.35 * fade);
    }

    label(lay.labTok, "01 TOKENIZE", 0);
    label(lay.labEmb, "02 EMBED", 1);
    label(lay.labAtt, `03 ATTENTION · ${layers[layers.length - 1]} layers`, 2);
    label(lay.predTop, "04 PREDICT · softmax", 3);

    // ── HUD ──
    const hud = `temperature 0.7 · top-p 0.9 · ctx ${tokens.length}/8192`;
    if (hud.length < cols - 2) f.text(x0, lay.hudY, hud, HUE.fg, 0.3);
    if (genT >= 0 && !outro && cols > 50) {
      const s = `step ${stepIdx + 1}/${nSteps}`;
      f.text(x0 + W - s.length, lay.labTok, s, HUE.fg, 0.35);
    }
  },
};
