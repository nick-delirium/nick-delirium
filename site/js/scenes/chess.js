// notalearn: an orbiting perspective chessboard replaying the Ruy Lopez, move by move.
import { HUE, G, clamp, smooth, lerp } from "../engine/util.js";

const MOVES = [
  ["e4", [["e2", "e4"]]],
  ["e5", [["e7", "e5"]]],
  ["Nf3", [["g1", "f3"]]],
  ["Nc6", [["b8", "c6"]]],
  ["Bb5", [["f1", "b5"]]],
  ["a6", [["a7", "a6"]]],
  ["Ba4", [["b5", "a4"]]],
  ["Nf6", [["g8", "f6"]]],
  ["O-O", [["e1", "g1"], ["h1", "f1"]]],
  ["Be7", [["f8", "e7"]]],
  ["Re1", [["f1", "e1"]]],
  ["b5", [["b7", "b5"]]],
  ["Bb3", [["a4", "b3"]]],
  ["d6", [["d7", "d6"]]],
  ["c3", [["c2", "c3"]]],
  ["O-O", [["e8", "g8"], ["h8", "f8"]]],
];
const MOVE_T = 1.5;
const HOLD = 3.5;
const CYCLE = MOVES.length * MOVE_T + HOLD;
const sqi = (s) => (+s[1] - 1) * 8 + (s.charCodeAt(0) - 97);
const sqw = (i) => [(i % 8) - 3.5, ((i / 8) | 0) - 3.5]; // world x, z of square centre

function initialBoard() {
  const b = new Array(64).fill("");
  const back = "RNBQKBNR";
  for (let x = 0; x < 8; x++) {
    b[x] = back[x];
    b[8 + x] = "P";
    b[48 + x] = "p";
    b[56 + x] = back[x].toLowerCase();
  }
  return b;
}

// tiny bitmap font for the big move readout
const FONT = {
  a: ["...", ".##", "#.#", "#.#", ".##"],
  b: ["#..", "##.", "#.#", "#.#", "##."],
  c: ["...", ".##", "#..", "#..", ".##"],
  d: ["..#", ".##", "#.#", "#.#", ".##"],
  e: ["...", ".#.", "###", "#..", ".##"],
  f: [".##", "#..", "##.", "#..", "#.."],
  g: ["...", ".##", "#.#", ".##", "##."],
  h: ["#..", "##.", "#.#", "#.#", "#.#"],
  1: [".#.", "##.", ".#.", ".#.", "###"],
  2: ["##.", "..#", ".#.", "#..", "###"],
  3: ["##.", "..#", ".#.", "..#", "##."],
  4: ["#.#", "#.#", "###", "..#", "..#"],
  5: ["###", "#..", "##.", "..#", "##."],
  6: [".##", "#..", "###", "#.#", "###"],
  7: ["###", "..#", ".#.", ".#.", ".#."],
  8: ["###", "#.#", "###", "#.#", "###"],
  N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  R: ["##.", "#.#", "##.", "#.#", "#.#"],
  Q: [".##.", "#..#", "#..#", "#.##", ".###"],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  O: ["###", "#.#", "#.#", "#.#", "###"],
  "-": ["...", "...", "###", "...", "..."],
};
const bigWidth = (str) => Array.from(str).reduce((w, ch) => w + ((FONT[ch]?.[0].length ?? 3) * 2 + 2), -2);

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export default {
  id: "chess",
  title: "NOTATION_TRAINER",
  caption: "1. e4 — every square has a name",

  frame(f, t, dt, S) {
    const { cols, rows, ax } = S;
    f.clear();
    const portrait = cols < (rows / ax) * 0.9;
    const wide = !portrait && cols >= 100;

    // camera orbiting the board at a low angle
    const phi = -Math.PI / 2 - 0.55 + t * 0.045;
    const el = (portrait ? 0.74 : 0.5) + 0.05 * Math.sin(t * 0.13);
    const D = 13;
    const C = [D * Math.cos(el) * Math.cos(phi), D * Math.sin(el), D * Math.cos(el) * Math.sin(phi)];
    const fwd = norm([-C[0], -C[1], -C[2]]);
    const right = norm([fwd[2], 0, -fwd[0]]);
    const up = [
      fwd[1] * right[2] - fwd[2] * right[1],
      fwd[2] * right[0] - fwd[0] * right[2],
      fwd[0] * right[1] - fwd[1] * right[0],
    ];
    const F = Math.min(cols * (wide ? 0.78 : 1.0), (rows / ax) * 1.5);
    const cx = wide ? cols * 0.6 : cols * 0.5;
    const cy = portrait ? rows * 0.6 : rows * 0.55;
    const proj = (p) => {
      const r = [p[0] - C[0], p[1] - C[1], p[2] - C[2]];
      const z = dot(r, fwd);
      return [cx + (F * dot(r, right)) / z, cy - ((F * dot(r, up)) / z) * ax, z];
    };
    const fogAt = (dist) => clamp(1.35 - dist / (D * 1.2), 0.15, 1);

    // game state for this cycle
    const ct = t % CYCLE;
    const cur = ct < MOVES.length * MOVE_T ? Math.floor(ct / MOVE_T) : -1;
    const done = cur >= 0 ? cur : MOVES.length;
    const mu = cur >= 0 ? (ct - cur * MOVE_T) / MOVE_T : 1;
    const u = smooth(0.1, 0.7, mu);
    const board = initialBoard();
    const heat = new Float32Array(64), heatHue = new Uint8Array(64);
    for (let k = 0; k < done; k++) {
      const age = ct - (k + 1) * MOVE_T + MOVE_T * 0.3;
      for (const [a, b] of MOVES[k][1]) {
        board[sqi(b)] = board[sqi(a)];
        board[sqi(a)] = "";
        heat[sqi(b)] = Math.max(heat[sqi(b)], 0.16 + 0.84 * Math.exp(-Math.max(0, age) * 0.9));
        heatHue[sqi(b)] = k % 2 ? HUE.alt : HUE.main;
        heat[sqi(a)] = Math.max(heat[sqi(a)], 0.06);
      }
    }
    const moving = cur >= 0 ? MOVES[cur][1] : [];
    if (cur >= 0) {
      for (const [a, b] of moving) {
        heat[sqi(a)] = Math.max(heat[sqi(a)], 0.45 * (1 - u));
        heatHue[sqi(a)] = cur % 2 ? HUE.alt : HUE.main;
        heat[sqi(b)] = Math.max(heat[sqi(b)], 0.25 + 0.55 * smooth(0.5, 0.75, mu));
        heatHue[sqi(b)] = cur % 2 ? HUE.alt : HUE.main;
      }
    }
    const show = smooth(0, 0.8, ct) * (1 - smooth(CYCLE - 0.9, CYCLE, ct));
    const reveal = smooth(0, 1.4, t) * 7;

    // board + synthwave floor, one ray per cell
    for (let y = 0; y < rows; y++) {
      const w = -(y - cy) / ax / F;
      for (let x = 0; x < cols; x++) {
        const uu = (x - cx) / F;
        const d = [fwd[0] + right[0] * uu + up[0] * w, fwd[1] + right[1] * uu + up[1] * w, fwd[2] + right[2] * uu + up[2] * w];
        if (d[1] >= -1e-3) continue;
        const th = -C[1] / d[1];
        const px = C[0] + d[0] * th, pz = C[2] + d[2] * th;
        const dist = th * Math.hypot(d[0], d[1], d[2]);
        const fog = fogAt(dist);
        const i = y * cols + x;
        const ab = Math.max(Math.abs(px), Math.abs(pz));
        if (ab < 4) {
          if (Math.hypot(px, pz) > reveal) continue;
          const fi = Math.floor(px + 4), ri = Math.floor(pz + 4);
          const sq = ri * 8 + fi;
          const light = (fi + ri) % 2 === 1;
          const h = heat[sq] * show;
          if (h > 0.08) {
            f.v[i] = (0.22 + 0.7 * h) * fog;
            f.h[i] = h > 0.85 ? HUE.white : heatHue[sq];
            f.g[i] = G(light ? "▒" : "░");
          } else if (light) {
            f.v[i] = 0.34 * fog;
            f.h[i] = HUE.fg;
            f.g[i] = G("░");
          } else {
            f.v[i] = 0.14 * fog;
            f.h[i] = HUE.fg;
            f.g[i] = G("·");
          }
        } else if (ab < 4.35) {
          if (reveal < 5) continue;
          f.v[i] = 0.5 * fog;
          f.h[i] = HUE.main;
          f.g[i] = G("▓");
        } else if (dist < D * 2.4) {
          // perspective floor grid
          const gx = Math.abs(((px + 1000) % 2) - 1), gz = Math.abs(((pz + 1000) % 2) - 1);
          const thick = 0.012 * dist;
          const on = gx > 1 - thick || gz > 1 - thick;
          if (on) {
            f.v[i] = 0.2 * fog * smooth(D * 2.4, D * 1.2, dist);
            f.h[i] = HUE.alt;
            f.g[i] = G("·");
          }
        }
      }
    }

    // rank / file labels
    if (reveal > 5) {
      for (let k = 0; k < 8; k++) {
        for (const [p, ch] of [
          [[k - 3.5, 0, -4.8], "abcdefgh"[k]],
          [[k - 3.5, 0, 4.8], "abcdefgh"[k]],
          [[-4.8, 0, k - 3.5], String(k + 1)],
          [[4.8, 0, k - 3.5], String(k + 1)],
        ]) {
          const [sx, sy, z] = proj(p);
          f.set(sx, sy, 0.3 + 0.45 * fogAt(z), HUE.fg, G(ch));
        }
      }
    }

    // pieces, far to near
    const pieces = [];
    for (let i = 0; i < 64; i++) {
      if (!board[i]) continue;
      if (moving.some(([a]) => sqi(a) === i)) continue;
      const [wx, wz] = sqw(i);
      pieces.push([proj([wx, 0.45, wz]), board[i]]);
    }
    for (const [a, b] of moving) {
      const pa = sqw(sqi(a)), pb = sqw(sqi(b));
      const knight = board[sqi(a)].toLowerCase() === "n";
      const arc = knight ? 1.9 : 0.9;
      for (let k = 12; k >= 1; k--) {
        const uk = u - k * 0.035;
        if (uk <= 0) continue;
        const q = proj([lerp(pa[0], pb[0], uk), 0.45 + arc * Math.sin(Math.PI * uk), lerp(pa[1], pb[1], uk)]);
        f.plot(q[0], q[1], 0.75 - k * 0.05, cur % 2 ? HUE.alt : HUE.main, G("·"));
      }
      pieces.push([proj([lerp(pa[0], pb[0], u), 0.45 + arc * Math.sin(Math.PI * u), lerp(pa[1], pb[1], u)]), board[sqi(a)], true]);
    }
    pieces.sort((p, q) => q[0][2] - p[0][2]);
    for (const [[sx, sy, z], ch, live] of pieces) {
      const white = ch === ch.toUpperCase();
      const v = (0.55 + 0.45 * fogAt(z)) * Math.max(show, live ? 1 : 0);
      f.set(sx, sy, live ? 1 : v, live ? HUE.white : white ? HUE.main : HUE.alt, G(ch));
    }

    // notation pop-ups
    for (let k = 0; k < MOVES.length; k++) {
      const age = ct - (k + 0.55) * MOVE_T;
      if (age < 0 || age > 1.6) continue;
      const [a, b] = MOVES[k][1][0];
      const [wx, wz] = sqw(sqi(b));
      const [sx, sy] = proj([wx, 0.45, wz]);
      const label = `${(k >> 1) + 1}.${k % 2 ? ".." : ""} ${MOVES[k][0]}`;
      const lx = clamp(Math.round(sx - label.length / 2), 0, cols - label.length);
      const ly = Math.round(sy - 2 - age * 2.5);
      if (ly >= 0) f.text(lx, ly, label, k % 2 ? HUE.alt : HUE.main, 1 - smooth(0.9, 1.6, age));
    }

    const lines = Math.ceil(MOVES.length / 2);

    // big readout of the latest move, in the empty sky above the board
    const shown = cur >= 0 && mu > 0.5 ? cur : done - 1;
    if (shown >= 0) {
      let top = rows;
      for (const [x, z] of [[-4.4, -4.4], [4.4, -4.4], [-4.4, 4.4], [4.4, 4.4]]) top = Math.min(top, proj([x, 0, z])[1]);
      const san = MOVES[shown][0];
      const bw = bigWidth(san);
      const floor = wide ? 1 : 3 + Math.min(lines, Math.ceil((done + 1) / 2)) + 2;
      const space = top - 2 - floor;
      if (space >= 7 && bw < cols - 4) {
        const by = Math.round(floor + (space - 5) / 2);
        let bx = Math.round(cx - bw / 2);
        bx = clamp(bx, wide ? 20 : 1, cols - bw - 1);
        const hue = shown % 2 ? HUE.alt : HUE.main;
        const age = cur >= 0 ? ct - (shown + 0.5) * MOVE_T : 9;
        const tag = `${(shown >> 1) + 1}.${shown % 2 ? ".." : ""}`;
        f.text(bx, by - 2, tag, HUE.fg, 0.45 * show);
        const px = [];
        for (const ch of san) {
          const gl = FONT[ch] || FONT["-"];
          for (let ry = 0; ry < 5; ry++) {
            for (let rx = 0; rx < gl[ry].length; rx++) {
              if (gl[ry][rx] !== "#") continue;
              const glitch = age < 0.25 && (rx * 7 + ry * 3 + Math.floor(t * 30)) % 5 === 0;
              px.push([bx + rx * 2, by + ry, glitch], [bx + rx * 2 + 1, by + ry, glitch]);
            }
          }
          bx += gl[0].length * 2 + 2;
        }
        for (const [x, y] of px) f.set(x + 1, y + 1, 0.22 * show, HUE.alt, G("░"));
        for (const [x, y, glitch] of px) f.set(x + (glitch ? 2 : 0), y, (glitch ? 1 : 0.85) * show, glitch ? HUE.hot : hue, G("▓"));
      }
    }

    // PGN move log
    const lx = 2;
    const ly0 = wide ? Math.max(2, Math.round(rows * 0.5 - lines / 2 - 1)) : 2;
    const room = wide ? rows - ly0 - 1 : Math.max(0, Math.round(cy - (F * 0.42 * ax)) - 4);
    if (room > 3) {
      for (let y = ly0 - 1; y <= ly0 + 2 + Math.min(lines, room); y++) for (let x = 0; x < lx + 16; x++) f.set(x, y, 0);
      f.text(lx, ly0, "PGN · ruy_lopez", HUE.fg, 0.4);
      const playedLines = Math.ceil((done + (cur >= 0 && mu > 0.55 ? 1 : 0)) / 2);
      const first = Math.max(0, playedLines - (room - 2));
      for (let ln = first; ln < playedLines; ln++) {
        const wi = ln * 2, bi = ln * 2 + 1;
        const played = (k) => k < done || (k === cur && mu > 0.55);
        const y = ly0 + 2 + ln - first;
        f.text(lx, y, `${String(ln + 1).padStart(2)}.`, HUE.fg, 0.35 * show);
        if (played(wi)) f.text(lx + 4, y, MOVES[wi][0], wi === cur || wi === done - 1 ? HUE.white : HUE.main, (wi === cur || wi === done - 1 ? 1 : 0.55) * show);
        if (bi < MOVES.length && played(bi)) f.text(lx + 10, y, MOVES[bi][0], bi === cur || bi === done - 1 ? HUE.white : HUE.alt, (bi === cur || bi === done - 1 ? 1 : 0.55) * show);
      }
    }
  },
};
