import { Renderer } from "./engine/renderer.js";
import { loadScene, SCENE_IDS } from "./scenes/index.js";
import { initTerminal } from "./terminal.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = matchMedia("(max-width: 860px)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

/* ═════════════ settings ═════════════ */
export const THEMES = ["night-city", "neon-noir", "phosphor", "smog"];
export const LAYOUTS = ["split", "window", "bg"];
export const RESES = ["ultra", "hi", "med", "lo"];
const FX = ["crt", "bloom", "glitch", "lens", "motion"];
const defaults = {
  theme: "night-city",
  layout: "split",
  res: mobile ? "med" : "hi",
  crt: true,
  bloom: true,
  glitch: true,
  lens: true,
  motion: !reduced,
};
const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};
const settings = { ...defaults, ...store.get("nd.settings", {}) };
const query = new URLSearchParams(location.search);
for (const k of ["theme", "layout", "res"]) if (query.get(k)) settings[k] = query.get(k);

/* ═════════════ renderer ═════════════ */
const viz = $("#viz");
const hud = $(".viz-hud");
const hudTitle = $("#hud-title");
const hudCaption = $("#hud-caption");
const hudStats = $("#hud-stats");
const vizName = $("#viz-name");
const renderer = new Renderer($("#ascii"), $(".viz-stage"), {
  onStats: (s) => {
    const sc = renderer.scene;
    if (sc && hudTitle.textContent !== "◢ " + sc.title) {
      hudTitle.textContent = "◢ " + sc.title;
      hudCaption.textContent = sc.caption;
      vizName.textContent = sc.title;
    }
    hudStats.textContent = `${s.fps} fps · ${s.cols}×${s.rows} · ${settings.res}${s.degraded ? " · eco" : ""}`;
  },
});

function palette() {
  const cs = getComputedStyle(root);
  const v = (n) => cs.getPropertyValue(n).trim();
  return { bg: v("--bg"), fg: v("--ascii-fg"), main: v("--main"), alt: v("--alt"), hot: v("--hot"), white: v("--white") };
}

let applied = {};
function apply() {
  if (!THEMES.includes(settings.theme)) settings.theme = defaults.theme;
  if (!LAYOUTS.includes(settings.layout)) settings.layout = defaults.layout;
  if (!RESES.includes(settings.res)) settings.res = defaults.res;

  if (applied.layout && applied.layout !== settings.layout) {
    viz.removeAttribute("style");
    viz.classList.remove("min", "max");
    renderer.paused = false;
  }
  root.dataset.theme = settings.theme;
  root.dataset.layout = settings.layout;
  root.classList.toggle("no-crt", !settings.crt);
  root.classList.toggle("fx-glitch", settings.glitch && settings.motion);
  const tc = $('meta[name="theme-color"]');
  if (tc) tc.content = getComputedStyle(root).getPropertyValue("--bg").trim();

  if (applied.theme !== settings.theme) renderer.setPalette(palette());
  if (applied.res !== settings.res) renderer.setRes(settings.res);
  renderer.setOptions({ bloom: settings.bloom, lens: settings.lens, motion: settings.motion });

  $$("[data-set-theme]").forEach((b) => b.classList.toggle("on", b.dataset.setTheme === settings.theme));
  $$("[data-set-layout]").forEach((b) => b.classList.toggle("on", b.dataset.setLayout === settings.layout));
  $$("[data-set-res]").forEach((b) => b.classList.toggle("on", b.dataset.setRes === settings.res));
  $$("[data-set-fx]").forEach((i) => (i.checked = !!settings[i.dataset.setFx]));

  applied = { ...settings };
  store.set("nd.settings", settings);
}

export function setSetting(k, v) {
  settings[k] = v;
  apply();
}

/* ═════════════ experience slider ═════════════ */
// Pinned mode (desktop): the section is n screens tall; scroll position picks the role.
// Flow mode (small screens): buttons, rail, arrow keys and swipes switch roles in place.
function setupExperience() {
  const section = $("#experience");
  const slides = $$(".exp-slides > .job");
  const rail = $$(".exp-rail [data-go]");
  const prev = $('.exp-btn[data-step="-1"]');
  const next = $('.exp-btn[data-step="1"]');
  const counter = $("#exp-i");
  const pinned = matchMedia("(min-width: 900px) and (min-height: 600px)");
  const n = slides.length;
  let idx = -1;

  for (let i = 0; i < n; i++) {
    const m = document.createElement("i");
    m.className = i === 0 || i === n - 1 ? "exp-snap edge" : "exp-snap";
    m.style.setProperty("--i", i);
    section.appendChild(m);
  }

  const set = (i) => {
    i = clamp(i, 0, n - 1);
    if (i === idx) return;
    idx = i;
    slides.forEach((s, k) => {
      s.classList.toggle("on", k === i);
      s.classList.toggle("prev", k < i);
      s.inert = k !== i;
    });
    rail.forEach((b, k) => b.classList.toggle("on", k === i));
    counter.textContent = String(i + 1).padStart(2, "0");
    prev.disabled = i === 0;
    next.disabled = i === n - 1;
  };
  const go = (i) => {
    i = clamp(i, 0, n - 1);
    if (pinned.matches) {
      const top = section.getBoundingClientRect().top + scrollY + i * innerHeight;
      suppress(1200);
      scrollTo({ top, behavior: settings.motion ? "smooth" : "auto" });
    } else {
      set(i);
      spy();
    }
  };
  // Rubber edges: a fast scroll that would carry past the first or last role is caught there,
  // and leftover momentum in that direction is swallowed for a fixed, short moment.
  // Slow scrolls, fresh gestures from an edge and in-page navigation pass through untouched.
  let prevY = scrollY, prevT = performance.now(), vel = 0, quietUntil = 0, startY = scrollY;
  let holdUntil = 0, holdCap = 0, holdDir = 0, holdEdge = 0;
  // the hold lives while momentum keeps arriving, ends 160ms after it stops, never beyond 900ms
  const extendHold = (now) => (holdUntil = Math.min(holdCap, Math.max(holdUntil, now + 160)));
  const suppress = (ms) => (quietUntil = performance.now() + ms);
  const rubber = () => {
    const now = performance.now();
    const y = scrollY;
    const dt = now - prevT;
    if (dt > 160) startY = prevY; // first scroll after a pause: a new movement starts here
    vel = 0.5 * vel + 0.5 * ((y - prevY) / Math.max(1, dt));
    const streaming = dt < 100; // continuous scrolling, not a jump (hash nav, scroll restore)
    const top = section.getBoundingClientRect().top + y;
    if (now < holdUntil && (y - holdEdge) * holdDir > 2) {
      // input that doesn't arrive as wheel events (touch fling) is held at the edge too
      extendHold(now);
      scrollTo({ top: holdEdge, behavior: "instant" });
      prevY = holdEdge;
      prevT = now;
      return;
    }
    if (now > quietUntil) {
      const tol = innerHeight * 0.2;
      for (const edge of [top, top + (n - 1) * innerHeight]) {
        const down = prevY < edge - 4 && y > edge + 4;
        const up = prevY > edge + 4 && y < edge - 4;
        // a movement that began at this edge is a deliberate exit: let it through
        if ((down || up) && streaming && Math.abs(vel) > 0.9 && Math.abs(startY - edge) > tol) {
          scrollTo({ top: edge, behavior: "instant" });
          holdCap = now + 900;
          holdUntil = now + 250;
          holdDir = down ? 1 : -1;
          holdEdge = edge;
          prevY = edge;
          prevT = now;
          vel = 0;
          return;
        }
      }
    }
    prevY = y;
    prevT = now;
  };
  addEventListener(
    "wheel",
    (e) => {
      const now = performance.now();
      if (now < holdUntil && Math.sign(e.deltaY) === holdDir) {
        e.preventDefault();
        extendHold(now);
      }
    },
    { passive: false }
  );
  document.addEventListener("click", (e) => {
    if (e.target.closest('a[href^="#"]')) suppress(1600);
  });
  const sync = () => {
    if (!pinned.matches) return;
    rubber();
    const r = section.getBoundingClientRect();
    set(Math.round(clamp(-r.top / innerHeight, 0, n - 1)));
  };
  const inView = () => {
    const r = section.getBoundingClientRect();
    return r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5;
  };

  rail.forEach((b) => b.addEventListener("click", () => go(+b.dataset.go)));
  $$(".exp-slides [data-go]").forEach((b) => b.addEventListener("click", () => go(+b.dataset.go)));
  $("#exp-n").textContent = String(n).padStart(2, "0");
  prev.addEventListener("click", () => go(idx - 1));
  next.addEventListener("click", () => go(idx + 1));
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea") || !inView()) return;
    if (e.key === "ArrowRight") go(idx + 1);
    else if (e.key === "ArrowLeft") go(idx - 1);
    else return;
    e.preventDefault();
  });
  let sx = null;
  const stage = $(".exp-slides");
  stage.addEventListener("pointerdown", (e) => (sx = e.pointerType === "mouse" ? null : e.clientX));
  stage.addEventListener("pointerup", (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 50) go(idx + (dx < 0 ? 1 : -1));
  });

  set(0);
  return { section, sync, suppress, scene: () => slides[idx].dataset.scene };
}
const exp = setupExperience();

/* ═════════════ scenes: scroll-spy, hover, pin ═════════════ */
let spyScene = "city", hoverScene = null, pinScene = null, currentId = null;

async function show(id) {
  if (!id || id === currentId) return;
  currentId = id;
  const scene = await loadScene(id);
  if (currentId !== id || !scene) return;
  renderer.setScene(scene);
  hudTitle.textContent = "◢ " + scene.title;
  hudCaption.textContent = scene.caption;
  vizName.textContent = scene.title;
  hud.classList.remove("switch");
  void hud.offsetWidth;
  hud.classList.add("switch");
}
const resolveScene = () => show(pinScene || hoverScene || spyScene);

export function pin(id) {
  pinScene = id && SCENE_IDS.includes(id) ? id : null;
  resolveScene();
  return pinScene;
}

const spyEls = $$("[data-scene]").filter((el) => !el.closest(".exp-slides") && (!finePointer || !el.hasAttribute("data-scene-hover")));
const sections = $$("main > section");
const navLinks = new Map($$("[data-nav]").map((a) => [a.dataset.nav, a]));
const progress = $("#progress");
let lastOn = null, lastNav = null;

function spy() {
  exp.sync();
  const fy = innerHeight * 0.42;
  let best = null, bestH = Infinity;
  for (const el of spyEls) {
    const r = el.getBoundingClientRect();
    if (r.top <= fy && r.bottom >= fy && r.height < bestH) {
      best = el;
      bestH = r.height;
    }
  }
  if (best) {
    spyScene = best === exp.section ? exp.scene() : best.dataset.scene;
    if (best !== lastOn) {
      lastOn?.classList.remove("on");
      if (best.matches(".entry, .hobbies li")) best.classList.add("on");
      lastOn = best;
    }
  }
  let sec = sections[0];
  for (const s of sections) if (s.getBoundingClientRect().top <= fy) sec = s;
  const link = navLinks.get(sec.id);
  if (link !== lastNav) {
    lastNav?.classList.remove("on");
    link?.classList.add("on");
    lastNav = link;
  }
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.width = (max > 0 ? (scrollY / max) * 100 : 0) + "%";
  resolveScene();
}
let spyQueued = false;
const queueSpy = () => {
  if (spyQueued) return;
  spyQueued = true;
  requestAnimationFrame(() => {
    spyQueued = false;
    spy();
  });
};
addEventListener("scroll", queueSpy, { passive: true });
addEventListener("resize", queueSpy);

let hoverTimer = 0, hoverEl = null;
// Hover targets can nest (a title inside a hobby row): leaving the inner one falls back to the outer.
function hoverTo(el, delay) {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    hoverEl?.classList.remove("on");
    hoverEl = el;
    el?.classList.add("on");
    hoverScene = el ? el.dataset.scene : null;
    resolveScene();
  }, delay);
}
for (const el of $$("[data-scene-hover]")) {
  const leave = (e) => {
    const outer = e.relatedTarget?.closest?.("[data-scene-hover]");
    hoverTo(outer && outer !== el ? outer : null, outer ? 120 : 380);
  };
  el.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && hoverTo(el, 120));
  el.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && leave(e));
  el.addEventListener("focusin", (e) => e.target === el && hoverTo(el, 120));
  el.addEventListener("focusout", leave);
}

/* ═════════════ settings panel ═════════════ */
const sys = $("#sys");
const sysBtn = $("#btn-sys");
function toggleSys(open = sys.hidden) {
  sys.hidden = !open;
  sysBtn.setAttribute("aria-expanded", String(open));
}
sysBtn.addEventListener("click", () => toggleSys());
$(".sys-x").addEventListener("click", () => toggleSys(false));
document.addEventListener("pointerdown", (e) => {
  if (!sys.hidden && !sys.contains(e.target) && !sysBtn.contains(e.target)) toggleSys(false);
});
sys.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.setTheme) setSetting("theme", b.dataset.setTheme);
  if (b.dataset.setLayout) setSetting("layout", b.dataset.setLayout);
  if (b.dataset.setRes) setSetting("res", b.dataset.setRes);
});
sys.addEventListener("change", (e) => {
  const k = e.target.dataset.setFx;
  if (k) setSetting(k, e.target.checked);
});
$("#btn-reboot").addEventListener("click", () => {
  toggleSys(false);
  boot(true);
});

/* ═════════════ window layout: drag, min, max ═════════════ */
const bar = $(".viz-bar");
bar.addEventListener("pointerdown", (e) => {
  if (root.dataset.layout !== "window" || e.target.closest("button") || viz.classList.contains("max")) return;
  const r = viz.getBoundingClientRect();
  const ox = e.clientX - r.left, oy = e.clientY - r.top;
  bar.setPointerCapture(e.pointerId);
  const move = (ev) => {
    viz.style.left = clamp(ev.clientX - ox, 0, innerWidth - 120) + "px";
    viz.style.top = clamp(ev.clientY - oy, 52, innerHeight - 30) + "px";
    viz.style.right = "auto";
    viz.style.bottom = "auto";
  };
  const up = () => {
    bar.removeEventListener("pointermove", move);
    bar.removeEventListener("pointerup", up);
  };
  bar.addEventListener("pointermove", move);
  bar.addEventListener("pointerup", up);
});
$$("[data-viz]").forEach((b) =>
  b.addEventListener("click", () => {
    const k = b.dataset.viz;
    viz.classList.toggle(k);
    viz.classList.remove(k === "min" ? "max" : "min");
    renderer.paused = viz.classList.contains("min");
    renderer.kick(true);
  })
);

/* ═════════════ boot sequence ═════════════ */
async function boot(force = false) {
  if (!force && (reduced || store.get("nd.booted", false) || query.has("noboot") || query.has("scene"))) return;
  const el = $("#boot");
  const log = $(".boot-log");
  const barEl = $(".boot-bar i");
  log.innerHTML = "";
  barEl.style.width = "0";
  el.classList.remove("off");
  el.classList.add("on");
  let skip = false;
  const onSkip = () => (skip = true);
  addEventListener("keydown", onSkip, { once: true });
  addEventListener("pointerdown", onSkip, { once: true });
  const id = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  const lines = [
    ["DELIRIUM BIOS v8.26 · (c) 2018–2026 delirium", "hl", 220],
    ["CPU0: human.cortex @ calm MHz ............... <span class=ok>[ OK ]</span>", "", 110],
    ["MEM : 8 yrs production frontend .............. <span class=ok>[ OK ]</span>", "", 110],
    ["probing /dev/openreplay ...................... <span class=ok>[ OK ]</span> 13k★ · rank #2", "", 140],
    ["loading tracker.core  (worker · gzip · v19) .. <span class=ok>[ OK ]</span>", "", 120],
    ["loading player.core   (shallow · fast) ....... <span class=ok>[ OK ]</span>", "", 120],
    ["mounting /mnt/side-quests .................... <span class=ok>[ OK ]</span> dolly · notalearn · arctius", "", 120],
    ["building glyph atlas ......................... <span class=ok>[ OK ]</span>", "", 110],
    ["checking coffee levels ....................... <span class=warn>[WARN]</span> low", "", 160],
    [`starting session as visitor_0x${id}`, "", 200],
    ["ACCESS GRANTED", "hl", 360],
  ];
  for (let i = 0; i < lines.length && !skip; i++) {
    const [txt, cls, ms] = lines[i];
    log.insertAdjacentHTML("beforeend", `<div class="${cls}">${txt}</div>`);
    barEl.style.width = ((i + 1) / lines.length) * 100 + "%";
    await sleep(ms);
  }
  removeEventListener("keydown", onSkip);
  removeEventListener("pointerdown", onSkip);
  el.classList.add("off");
  await sleep(480);
  el.classList.remove("on", "off");
  store.set("nd.booted", true);
}

/* ═════════════ text fx ═════════════ */
const SCRAMBLE = "!<>-_\\/[]{}=+*^?#░▒▓";
function scramble(el) {
  const final = el.dataset.text || el.textContent;
  let frame = 0;
  const total = 16;
  const tick = () => {
    const n = (frame / total) * final.length;
    el.textContent = Array.from(final, (c, i) => (c === " " || i < n ? c : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0])).join("");
    if (frame++ < total) requestAnimationFrame(tick);
    else el.textContent = final;
  };
  tick();
}

function typeOut(el) {
  const text = el.dataset.type;
  if (!settings.motion) return;
  el.textContent = "";
  let i = 0;
  const step = () => {
    el.textContent = text.slice(0, ++i);
    if (i < text.length) setTimeout(step, 28 + Math.random() * 50);
  };
  setTimeout(step, 300);
}

// The one authored motion moment outside the ASCII viewport: each section title decodes once,
// the first time it scrolls into view. Content itself is never hidden.
function setupTitleDecode() {
  if (!settings.motion || !settings.glitch) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        scramble(e.target);
      }
    },
    { rootMargin: "0px 0px -15% 0px" }
  );
  $$(".sec-title").forEach((el) => io.observe(el));
}

/* ═════════════ misc ═════════════ */
const toastEl = $("#toast");
let toastTimer = 0;
export function toast(html, ms = 3600) {
  toastEl.innerHTML = html;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
}

function fillDynamic() {
  const now = new Date();
  for (const el of $$("[data-since]")) {
    const [y, m] = el.dataset.since.split("-").map(Number);
    const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) + 1; // inclusive, like LinkedIn
    el.textContent = `${Math.floor(months / 12)} yr ${months % 12} mo`;
  }
  for (const el of $$("[data-years-since]")) {
    const [y, m] = el.dataset.yearsSince.split("-").map(Number);
    const years = Math.floor(((now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m)) / 12);
    el.textContent = years + "+";
  }
  $("#year").textContent = now.getFullYear();
  for (const el of $$(".js-mail")) el.href = `mailto:${el.dataset.u}@${el.dataset.d}`;
  const addr = "nick.delirium" + "@" + "proton.me";
  for (const el of $$(".js-mail-text")) el.textContent = addr;
}

const clockEl = $("#clock");
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const tickClock = () => (clockEl.textContent = fmt.format(new Date()));

function printCV() {
  window.print();
}
// the real name only exists in the printed / saved CV, never in the page text or metadata
const PRINT_NAME = "TmlraXRhIE1lbG5pa292";
addEventListener("beforeprint", () => {
  $$(".js-print-name").forEach((el) => (el.textContent = atob(PRINT_NAME)));
});
addEventListener("afterprint", () => {
  $$(".js-print-name").forEach((el) => (el.textContent = "delirium"));
});
$("#btn-print").addEventListener("click", printCV);

/* ═════════════ terminal + keys ═════════════ */
const term = initTerminal({
  settings,
  navigate: (id) => {
    exp.suppress(1600);
    document.getElementById(id)?.scrollIntoView({ behavior: settings.motion ? "smooth" : "auto" });
  },
  setSetting,
  pin,
  sceneIds: SCENE_IDS,
  toast,
  printCV,
  boot: () => boot(true),
  themes: THEMES,
  layouts: LAYOUTS,
  reses: RESES,
  fx: FX,
});
for (const id of ["#btn-term", "#btn-term2", "#btn-term3"]) $(id)?.addEventListener("click", () => term.toggle(true));

addEventListener("keydown", (e) => {
  const typing = e.target.closest("input, textarea, [contenteditable]");
  if (e.key === "`" || e.key === "~") {
    e.preventDefault();
    term.toggle();
    return;
  }
  if (e.key === "Escape") {
    term.toggle(false);
    toggleSys(false);
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "t") setSetting("theme", THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length]);
  if (e.key === "l") setSetting("layout", LAYOUTS[(LAYOUTS.indexOf(settings.layout) + 1) % LAYOUTS.length]);
});

/* ═════════════ start ═════════════ */
fillDynamic();
tickClock();
setInterval(tickClock, 1000);
apply();
spy();
if (query.get("scene")) pin(query.get("scene"));
const fontsReady = Promise.race([
  Promise.all([document.fonts?.load('12px "JetBrains Mono"'), document.fonts?.load('700 16px "Noto Sans JP"', "ラ")]),
  sleep(2200),
]);
fontsReady.then(() => renderer.setPalette(palette()));
await boot();
setupTitleDecode();
const typed = $(".typed");
if (typed) typeOut(typed);
if (!store.get("nd.seen", false)) {
  store.set("nd.seen", true);
  setTimeout(() => toast("◢ <b>SYS</b> (top right) → 4 themes × 3 layouts &nbsp;·&nbsp; <b>`</b> → terminal", 6000), 900);
}
