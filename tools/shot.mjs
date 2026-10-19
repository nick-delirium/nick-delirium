// Dev helper: drive headless Chrome over CDP, print console errors, take screenshots.
// usage: node tools/shot.mjs <url> <outDir> '<steps json>' [width] [height] [mobile]
// steps: [{"eval":"js"}, {"wait":1000}, {"shot":"name"}, {"pdf":"name"}, {"wheel":[delta, n, ms]}]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, outDir, stepsJson = "[]", w = "1600", h = "1000", mob = ""] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
mkdirSync(outDir, { recursive: true });
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`, "--hide-scrollbars", `--window-size=${w},${h}`, "about:blank"],
  { stdio: "ignore" }
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list;
for (let i = 0; i < 50; i++) {
  try {
    list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    if (list.some((t) => t.type === "page")) break;
  } catch {}
  await sleep(150);
}
const page = list.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  } else if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    console.log("EXCEPTION:", d.exception?.description || d.text, d.url ?? "", d.lineNumber ?? "");
  } else if (m.method === "Runtime.consoleAPICalled" && ["error", "warning", "log"].includes(m.params.type)) {
    console.log(`console.${m.params.type}:`, m.params.args.map((a) => a.value ?? a.description).join(" "));
  } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    console.log("LOG:", m.params.entry.text, m.params.entry.url ?? "");
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: !!mob });
if (mob) await send("Emulation.setTouchEmulationEnabled", { enabled: true });
await send("Page.navigate", { url });
await sleep(1500);
for (const s of steps) {
  if (s.wait) await sleep(s.wait);
  if (s.eval) {
    const r = await send("Runtime.evaluate", { expression: s.eval, awaitPromise: true, returnByValue: true });
    if (r.result?.result?.value !== undefined) console.log("eval →", JSON.stringify(r.result.result.value));
    if (r.result?.exceptionDetails) console.log("eval error:", r.result.exceptionDetails.exception?.description);
  }
  if (s.wheel) {
    // trackpad-like burst: [startDelta, events, msBetween], decaying
    const [d0, count, gap] = s.wheel;
    for (let k = 0; k < count; k++) {
      const d = d0 * Math.pow(0.9, k);
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 300, y: 400, deltaX: 0, deltaY: d });
      await sleep(gap);
    }
  }
  if (s.gesture) {
    // real scroll gesture: [yDistance (negative = down), speed px/s, "mouse"|"touch"]
    const [yDistance, speed = 3000, src = "mouse"] = s.gesture;
    await send("Input.synthesizeScrollGesture", { x: 400, y: 500, yDistance, speed, gestureSourceType: src });
  }
  if (s.pdf) {
    const r = await send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
    const f = join(outDir, s.pdf + ".pdf");
    writeFileSync(f, Buffer.from(r.result.data, "base64"));
    console.log("pdf", f);
  }
  if (s.shot) {
    const r = await send("Page.captureScreenshot", { format: "png" });
    const f = join(outDir, s.shot + ".png");
    writeFileSync(f, Buffer.from(r.result.data, "base64"));
    console.log("shot", f);
  }
}
ws.close();
chrome.kill();
process.exit(0);
