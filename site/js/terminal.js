// Quake-style drop-down terminal: navigation, display settings, scenes and easter eggs.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const MAIL = ["nick.delirium", "proton.me"].join("@");
const SECTIONS = ["whoami", "now", "experience", "projects", "stack", "origin", "offduty", "contact"];
const LINKS = {
  github: "https://github.com/nick-delirium",
  linkedin: "https://www.linkedin.com/in/deliriumnick",
  openreplay: "https://openreplay.com",
  repo: "https://github.com/openreplay/openreplay",
  dolly: "https://github.com/nick-delirium/dolly",
  notalearn: "https://nick-delirium.github.io/notalearn/",
  arctius: "https://github.com/nick-delirium/lemmy-fennec",
  bluejay: "https://github.com/nick-delirium/bluejay",
  hsl: "https://github.com/nick-delirium/hsl",
};
const PROJECTS = {
  dolly: "task memory for AI coding agents · TypeScript · 2026",
  "notation-quest": "learn chess notation by playing · Svelte 5 PWA · 2026",
  arctius: "Lemmy client · React Native / Expo / MobX · 2023–24",
  bluejay: "Reddit client for Android · Flutter · 2023",
  "hansang-lab": "community app for ethnic Koreans in Russia · RN · 2019–20",
  "████.js": "on-device Gemma embeddings for contextual search · classified",
};
const LOGO = [
  "███╗   ██╗███╗   ███╗",
  "████╗  ██║████╗ ████║",
  "██╔██╗ ██║██╔████╔██║",
  "██║╚██╗██║██║╚██╔╝██║",
  "██║ ╚████║██║ ╚═╝ ██║",
  "╚═╝  ╚═══╝╚═╝     ╚═╝",
];
const GITLOG = [
  ["f3a91c2", "HEAD -> main", "feat(player): rewrite core — shallow store, tail-only readers", "2026"],
  ["9be04d1", "", "feat(tracker): binary batch v3, gzip in worker, heuristics on-device", "2026"],
  ["71c0aa8", "", "feat(dolly): give coding agents a memory", "2026"],
  ["5d2e7f0", "", "feat(spot): ship a bug-reporting chrome extension", "2024"],
  ["2a8c913", "", "feat(ios): swift tracker, because the web wasn't enough", "2023"],
  ["c41f6e2", "tag: openreplay", "join: OpenReplay, Paris", "2022"],
  ["8e07b5a", "", "chore: ozon, fortis, studybay, kupibilet — level up", "2019–22"],
  ["0b5f1d9", "", "init: hobby → job (thanks, crypto startup)", "2018"],
  ["0000001", "", "root: chemical engineering degree", "2014"],
];

export function initTerminal(ctx) {
  const el = document.getElementById("term");
  const out = document.getElementById("term-out");
  const form = document.getElementById("term-form");
  const input = document.getElementById("term-input");
  const history = [];
  let hIdx = 0;
  let greeted = false;
  let trapped = false;

  const print = (html = "", cls = "") => {
    const d = document.createElement("div");
    if (cls) d.className = cls;
    d.innerHTML = html;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
  };
  const cmd = (c, label = c) => `<a href="#" data-cmd="${esc(c)}" class="c-alt">${esc(label)}</a>`;
  const pre = (lines) => `<pre>${lines.join("\n")}</pre>`;

  function toggle(open = el.hidden) {
    el.hidden = !open;
    if (open) {
      if (!greeted) {
        greeted = true;
        print(`<span class="c-main">DeliriumOS 26.10</span> tty0 · type ${cmd("help")} · <span class="c-dim">tab completes, ↑↓ history, esc closes</span>`);
      }
      setTimeout(() => input.focus(), 30);
    } else if (document.activeElement === input) input.blur();
  }

  const go = (id) => {
    toggle(false);
    ctx.navigate(id);
  };

  const C = {
    help() {
      const rows = [
        ["whoami", "who is this person"],
        ["ls [dir]", "list sections / projects"],
        ["cd <section>", "jump to a section"],
        ["cat contact", "how to reach me"],
        ["open <name>", "github · dolly · notalearn · repo · …"],
        ["git log", "career, as commits"],
        ["neofetch", "system info"],
        ["theme [name]", "night-city · neon-noir · phosphor · smog"],
        ["layout [name]", "split · window · bg"],
        ["res [level]", "ultra · hi · med · lo"],
        ["fx <name> [on|off]", "crt · bloom · glitch · lens · motion"],
        ["scene [id|off]", "pin an animation (try: scenes)"],
        ["print", "print / save the CV as PDF"],
        ["sudo hire delirium", "you know you want to"],
        ["clear · history · date · reboot · exit", ""],
      ];
      print(rows.map(([c, d]) => `  ${cmd(c.split(" ")[0] === "sudo" ? c : c.split(" ")[0], c.padEnd(22))} <span class="c-dim">${esc(d)}</span>`).join("\n"));
    },
    whoami() {
      print(`<span class="c-main">delirium</span>
Senior Software Engineer · founding engineer @ OpenReplay · Paris, FR
I build the code that records the web and the player that replays it.
Calm, curious, allergic to slow code. Into AI, LLMs and cyberpunk.`);
    },
    ls(args) {
      const a = args.filter((x) => !x.startsWith("-"))[0];
      if (a && a.replace(/\/$/, "") === "projects") {
        print(Object.entries(PROJECTS).map(([k, v]) => `  <span class="c-main">${esc(k.padEnd(16))}</span> <span class="c-dim">${esc(v)}</span>`).join("\n"));
        return;
      }
      if (a) return print(`ls: ${esc(a)}: try ${cmd("ls projects")}`);
      const long = args.includes("-la") || args.includes("-l") || args.includes("-al");
      const items = [...SECTIONS.map((s) => [s + "/", "c-alt", `cd ${s}`]), ["cv.pdf", "c-main", "print"], ["secrets.txt", "c-hot", "cat secrets.txt"]];
      print(
        long
          ? items.map(([n, c, k]) => `<span class="c-dim">${n.endsWith("/") ? "drwxr-xr-x" : "-rw-r--r--"}  visitor  </span><a href="#" data-cmd="${k}" class="${c}">${n}</a>`).join("\n")
          : items.map(([n, c, k]) => `<a href="#" data-cmd="${k}" class="${c}">${n}</a>`).join("   ")
      );
    },
    cd([a = "~"]) {
      a = a.replace(/^\/|\/$/g, "").replace(/^~\/?/, "");
      if (a === "" || a === ".." || a === "home") return go("whoami");
      if (a === "off-duty" || a === "hobbies") a = "offduty";
      if (SECTIONS.includes(a)) return go(a);
      print(`cd: no such section: ${esc(a)} · try ${cmd("ls")}`);
    },
    cat([a]) {
      if (!a) return print("cat: what? try " + cmd("cat contact"));
      if (a.startsWith("contact")) {
        return print(`mail    <a href="mailto:${MAIL}">${MAIL}</a>
github  <a href="${LINKS.github}" target="_blank" rel="noopener">github.com/nick-delirium</a>
linkedin <a href="${LINKS.linkedin}" target="_blank" rel="noopener">linkedin.com/in/deliriumnick</a>
city    Paris, France (CET)`);
      }
      if (a === "secrets.txt") return print(`<span class="c-hot">1.</span> the bee farm is real. someday.
<span class="c-hot">2.</span> my GitHub bio is a plan, not a joke.
<span class="c-hot">3.</span> ${cmd("bees")}`);
      if (a === "cv.pdf") return print(`cat: cv.pdf: binary file · run ${cmd("print")} instead`);
      if (a.startsWith("whoami") || a === "about") return C.whoami();
      print(`cat: ${esc(a)}: no such file`);
    },
    open([a]) {
      const url = LINKS[a];
      if (!url) return print(`open: unknown target · one of: ${Object.keys(LINKS).map((k) => cmd("open " + k, k)).join(" ")}`);
      window.open(url, "_blank", "noopener");
      print(`opening <a href="${url}" target="_blank" rel="noopener">${url}</a>`);
    },
    git([sub]) {
      if (sub !== "log") return print(`git: try ${cmd("git log")}`);
      print(GITLOG.map(([h, ref, msg, when]) => `<span class="c-main">${h}</span>${ref ? ` <span class="c-alt">(${ref})</span>` : ""} ${esc(msg)} <span class="c-dim">· ${when}</span>`).join("\n"));
    },
    neofetch() {
      const s = ctx.settings;
      const info = [
        `<span class="c-main">visitor</span>@<span class="c-main">delirium</span>`,
        `<span class="c-dim">─────────────────────</span>`,
        `<span class="c-alt">OS</span>       DeliriumOS 26.10 (Paris)`,
        `<span class="c-alt">Host</span>     OpenReplay · founding engineer`,
        `<span class="c-alt">Uptime</span>   ${yearsSince(2018, 1)} of production frontend`,
        `<span class="c-alt">Shell</span>    zsh + coffee`,
        `<span class="c-alt">Theme</span>    ${s.theme} · ${s.layout} · ${s.res}`,
        `<span class="c-alt">Langs</span>    en · ru · fr (basic)`,
        `<span class="c-alt">Commits</span>  2,868 @ openreplay (#2 of 73)`,
        `<span class="c-alt">npm</span>      1.2M dl/mo @openreplay/tracker`,
        `<span class="c-alt">Hobbies</span>  EVE · sim racing · watches · anime`,
        `<span class="c-main">███</span><span class="c-alt">███</span><span class="c-hot">███</span><span class="c-dim">███</span>`,
      ];
      const lines = info.map((l, i) => `<span class="c-main">${(LOGO[i] || "").padEnd(24)}</span>${l}`);
      print(pre(lines));
    },
    theme([a]) {
      if (!a) return print(`theme: ${ctx.settings.theme} · options: ${ctx.themes.map((t) => cmd("theme " + t, t)).join(" ")}`);
      if (a === "next") a = ctx.themes[(ctx.themes.indexOf(ctx.settings.theme) + 1) % ctx.themes.length];
      if (!ctx.themes.includes(a)) return print(`theme: unknown '${esc(a)}'`);
      ctx.setSetting("theme", a);
      print(`theme → <span class="c-main">${a}</span>`);
    },
    layout([a]) {
      if (!a) return print(`layout: ${ctx.settings.layout} · options: ${ctx.layouts.map((t) => cmd("layout " + t, t)).join(" ")}`);
      if (a === "background") a = "bg";
      if (!ctx.layouts.includes(a)) return print(`layout: unknown '${esc(a)}'`);
      ctx.setSetting("layout", a);
      print(`layout → <span class="c-main">${a}</span>`);
    },
    res([a]) {
      if (!a) return print(`res: ${ctx.settings.res} · options: ${ctx.reses.map((t) => cmd("res " + t, t)).join(" ")}`);
      if (!ctx.reses.includes(a)) return print(`res: unknown '${esc(a)}'`);
      ctx.setSetting("res", a);
      print(`glyph density → <span class="c-main">${a}</span>`);
    },
    fx([k, v]) {
      if (!k || !ctx.fx.includes(k)) return print(`fx: ${ctx.fx.map((f) => `${f}=${ctx.settings[f] ? "on" : "off"}`).join(" · ")}`);
      const val = v === undefined ? !ctx.settings[k] : v === "on" || v === "1" || v === "true";
      ctx.setSetting(k, val);
      print(`fx ${k} → <span class="c-main">${val ? "on" : "off"}</span>`);
    },
    scene([a]) {
      if (!a || a === "list") return C.scenes();
      if (a === "off" || a === "auto") {
        ctx.pin(null);
        return print("scene → auto (follows scroll)");
      }
      const r = ctx.pin(a);
      print(r ? `scene → <span class="c-main">${r}</span> (pinned · ${cmd("scene off")} to release)` : `scene: unknown '${esc(a)}' · see ${cmd("scenes")}`);
    },
    scenes() {
      print(ctx.sceneIds.map((s) => cmd("scene " + s, s)).join("  "));
    },
    print() {
      toggle(false);
      setTimeout(ctx.printCV, 250);
    },
    clear() {
      out.innerHTML = "";
    },
    history() {
      print(history.map((h, i) => `<span class="c-dim">${String(i + 1).padStart(3)}</span>  ${esc(h)}`).join("\n"));
    },
    date() {
      print(new Date().toLocaleString("en-GB", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "medium" }) + " (Paris)");
    },
    echo(args) {
      print(esc(args.join(" ")));
    },
    pwd() {
      print("/home/visitor");
    },
    uname() {
      print("DeliriumOS 26.10 delirium ascii_64 GNU/Neon");
    },
    ping() {
      print(`PONG from delirium (Paris): time=${(2 + Math.random() * 6).toFixed(1)}ms ttl=64`);
    },
    reboot() {
      toggle(false);
      ctx.boot();
    },
    exit() {
      toggle(false);
    },
    async sudo(args) {
      const line = args.join(" ");
      if (/^hire( nikita| delirium)?\b/.test(line)) return hire();
      if (/^apt(-get)? install bees/.test(line)) return C.bees();
      if (/^rm /.test(line)) return C.rm();
      print(`<span class="c-hot">visitor is not in the sudoers file. This incident will be reported.</span>`);
    },
    hire: () => hire(),
    rm() {
      print("nice try. the filesystem is read-only, and so is my sense of humor about this.");
    },
    npm([sub, pkg]) {
      if ((sub === "i" || sub === "install") && pkg) {
        if (/nikita|delirium/.test(pkg)) {
          return print(`added <span class="c-main">1 senior engineer</span> in ${yearsSince(2018, 1)}
0 vulnerabilities · 2,868 commits audited
run ${cmd("sudo hire delirium")} to finish setup`);
        }
        return print(`npm ERR! 404 '${esc(pkg)}' is not in this registry. try 'delirium'`);
      }
      print("npm: try 'npm i delirium'");
    },
    bees() {
      ctx.pin("bees");
      print(`installing bees… <span class="c-main">bzzz</span> ▓▓▓▓▓▓▓▓▓▓ 100%
one day this profile will be abandoned for a bee farm. ${cmd("scene off", "(release)")}`);
    },
    o7() {
      ctx.pin("stargate");
      print(`<span class="c-alt">o7</span> fly safe, capsuleer. ${cmd("scene off", "(dock)")}`);
    },
    coffee() {
      ctx.pin("molecule");
      print(`brewing C8H10N4O2… <span class="c-main">done</span>. the chemical engineer approves. ${cmd("scene off", "(drink)")}`);
    },
    matrix() {
      ctx.pin("plasma");
      print(`<span class="c-main">wake up, visitor…</span> ${cmd("scene off", "(take the blue pill)")}`);
    },
    replay() {
      ctx.pin("blackhole");
      print(`everything falls in. the record stays. ${cmd("scene off", "(release)")}`);
    },
    tokyo() {
      ctx.pin("shinjuku");
      print(`<span class="c-hot">新宿</span> · 02:47 · the last train left an hour ago. ${cmd("scene off", "(walk home)")}`);
    },
    spice() {
      ctx.pin("dune");
      print(`worm sign. <span class="c-main">deep desert</span> · spice density 0.82 ${cmd("scene off", "(leave arrakis)")}`);
    },
    box() {
      ctx.pin("racing");
      print(`<span class="c-hot">BOX BOX</span> · softs on · push now ${cmd("scene off", "(retire)")}`);
    },
    tick() {
      ctx.pin("escapement");
      print(`lock → unlock → impulse → drop · 28 800 vph ${cmd("scene off", "(stop the watch)")}`);
    },
    fleet() {
      ctx.pin("fleet");
      print(`<span class="c-main">FIRE!</span> · all ships, open fire · range 6.2 ls ${cmd("scene off", "(cease fire)")}`);
    },
    sigil() {
      ctx.pin("sigils");
      print(`drawing a circle… <span class="c-alt">ink only, no wands</span> ${cmd("scene off", "(erase)")}`);
    },
    vim() {
      trapped = true;
      print(`<span class="c-hot">you are now trapped in vim.</span> type :q to escape.`);
    },
    man([a]) {
      print(`No manual entry for ${esc(a || "that")}. This is a CV, not a distro. try ${cmd("help")}`);
    },
    contact: () => C.cat(["contact"]),
  };
  Object.assign(C, {
    cls: C.clear,
    quit: C.exit,
    q: C.exit,
    vi: C.vim,
    nano: C.vim,
    emacs: C.vim,
    about: C.whoami,
    cv: C.print,
    hello: () => print("hi! try " + cmd("whoami") + " or " + cmd("help")),
    hi: () => print("hello! try " + cmd("whoami") + " or " + cmd("help")),
    ssh: () => print("ssh: connection refused. try email instead: " + cmd("cat contact")),
    eve: C.o7,
    "fly": C.o7,
    brew: C.coffee,
    logh: C.fleet,
    titan: () => (ctx.pin("aot"), print(`<span class="c-alt">ODM gear</span> armed · gas 64% · aim for the nape ${cmd("scene off", "(retreat)")}`)),
    frieren: () => (ctx.pin("frieren"), print(`casting: field of flowers · <span class="c-main">favourite spell</span> ${cmd("scene off", "(move on)")}`)),
    mushi: () => (ctx.pin("mushishi"), print(`the light vein is flowing tonight ${cmd("scene off", "(light a cigarette)")}`)),
    solaris: () => (ctx.pin("solaris"), print(`ocean activity rising · symmetriad forming ${cmd("scene off", "(return to station)")}`)),
    eye: () => (ctx.pin("sauron"), print(`<span class="c-hot">the eye is watching.</span> ${cmd("scene off", "(put the ring away)")}`)),
    gundam: () => (ctx.pin("gundam"), print(`<span class="c-hot">launch!</span> mobile suit, sortie ${cmd("scene off", "(return to base)")}`)),
    fire: C.fleet,
    magic: C.sigil,
    atelier: C.sigil,
    anime: () => (ctx.pin("anime"), print(`akira · gundam · logh · frieren · witch hat atelier · aot · mushishi ${cmd("scene off", "(close)")}`)),
    aot: () => C.titan(),
    mordor: () => C.eye(),
    books: () => print("Dune · Neuromancer · The Lord of the Rings · Harry Potter · The Witcher · Fool · War and Peace · Masters of Rome · Eagle of Rome · The Invincible · Solaris · Do Androids Dream of Electric Sheep? · Akira"),
    shinjuku: C.tokyo,
    dune: C.spice,
    jackin: () => (ctx.pin("neuromancer"), print("jacking in… <span class=\"c-alt\">ICE: black</span>. careful, cowboy.")),
    f1: C.box,
    watch: C.tick,
  });

  async function hire() {
    print(`[sudo] password for visitor: ********`);
    await wait(500);
    print(`<span class="c-alt">✓</span> authenticated · checking calendar… <span class="c-main">open to a good conversation</span>`);
    await wait(600);
    print(`opening secure channel → <a href="mailto:${MAIL}">${MAIL}</a>`);
    await wait(500);
    location.href = `mailto:${MAIL}?subject=${encodeURIComponent("Hello from your site")}`;
  }

  function run(raw) {
    const line = raw.trim();
    print(`<span class="c-alt">visitor@delirium:~$</span> <b>${esc(line)}</b>`, "cmd");
    if (!line) return;
    history.push(line);
    hIdx = history.length;
    if (trapped) {
      if (/^:(q|wq|q!|x)$/.test(line)) {
        trapped = false;
        return print("phew. you escaped vim. most people don't.");
      }
      return print(`<span class="c-hot">-- INSERT --</span> (type :q)`);
    }
    if (/^:(q|wq|q!)$/.test(line)) return print("not in vim. but nice reflexes.");
    if (/^fly safe/i.test(line)) return C.o7();
    const [name, ...args] = line.split(/\s+/);
    const fn = C[name.toLowerCase()];
    if (fn) return fn(args);
    print(`zsh: command not found: ${esc(name)} · try ${cmd("help")}`);
  }

  function complete() {
    const v = input.value;
    const parts = v.split(/\s+/);
    let pool;
    if (parts.length <= 1) pool = Object.keys(C);
    else {
      const head = parts[0];
      pool =
        head === "theme" ? ctx.themes
        : head === "layout" ? ctx.layouts
        : head === "res" ? ctx.reses
        : head === "fx" ? ctx.fx
        : head === "scene" ? [...ctx.sceneIds, "off"]
        : head === "cd" ? SECTIONS
        : head === "open" ? Object.keys(LINKS)
        : head === "cat" ? ["contact", "secrets.txt", "cv.pdf"]
        : head === "ls" ? ["projects", "-la"]
        : [];
    }
    const last = parts[parts.length - 1];
    const hits = pool.filter((p) => p.startsWith(last));
    if (hits.length === 1) {
      parts[parts.length - 1] = hits[0];
      input.value = parts.join(" ") + " ";
    } else if (hits.length > 1) print(`<span class="c-dim">${hits.join("  ")}</span>`);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = "";
    run(v);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      complete();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      hIdx = Math.max(0, hIdx - 1);
      input.value = history[hIdx] ?? "";
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      hIdx = Math.min(history.length, hIdx + 1);
      input.value = history[hIdx] ?? "";
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      C.clear();
    } else if (e.key === "`") {
      e.preventDefault();
      e.stopPropagation();
      toggle(false);
    }
  });
  out.addEventListener("click", (e) => {
    const a = e.target.closest("[data-cmd]");
    if (!a) return;
    e.preventDefault();
    run(a.dataset.cmd);
    input.focus();
  });
  el.querySelector(".term-x").addEventListener("click", () => toggle(false));

  return { toggle, run };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function yearsSince(y, m) {
  const now = new Date();
  const months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  return `${Math.floor(months / 12)} yrs ${months % 12} mo`;
}
