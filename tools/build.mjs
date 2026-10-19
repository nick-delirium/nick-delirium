// Production build: site/ → dist/
// JS is bundled and minified with code splitting, so every scene stays a lazily loaded chunk.
// CSS is minified, the HTML is minified, and asset names carry content hashes for long-term caching.
import { build } from "esbuild";
import { minify } from "html-minifier-terser";
import { readFile, writeFile, rm, mkdir, copyFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const SRC = "site";
const OUT = "dist";
const STATIC = ["favicon.svg", "og.png"];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const result = await build({
  entryPoints: [join(SRC, "js/main.js"), join(SRC, "css/main.css")],
  outbase: SRC,
  outdir: join(OUT, "assets"),
  entryNames: "[dir]/[name]-[hash]",
  chunkNames: "js/chunks/[name]-[hash]",
  bundle: true,
  splitting: true,
  format: "esm",
  target: ["es2022", "chrome100", "firefox100", "safari15.4"],
  minify: true,
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
});

// map source entry → emitted file
const emitted = {};
for (const [file, info] of Object.entries(result.metafile.outputs)) {
  if (info.entryPoint) emitted[info.entryPoint] = relative(OUT, file);
}
const js = emitted[join(SRC, "js/main.js")];
const css = emitted[join(SRC, "css/main.css")];
if (!js || !css) throw new Error("build: entry outputs not found");

let html = await readFile(join(SRC, "index.html"), "utf8");
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`build: "${from}" not found in index.html`);
  html = html.replace(from, to);
};
swap('href="css/main.css"', `href="${css}"`);
swap('src="js/main.js"', `src="${js}"`);
swap("</head>", `  <link rel="modulepreload" href="${js}" />\n</head>`);
// compact the JSON-LD block (html-minifier leaves non-JS script types alone)
html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (_, a, body, b) => a + JSON.stringify(JSON.parse(body)) + b);

html = await minify(html, {
  collapseWhitespace: true,
  conservativeCollapse: false,
  removeComments: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: false,
  useShortDoctype: true,
  minifyCSS: true,
  minifyJS: true,
  sortAttributes: true,
  sortClassName: true,
});
await writeFile(join(OUT, "index.html"), html);

for (const f of STATIC) await copyFile(join(SRC, f), join(OUT, f));
// GitHub Pages: skip Jekyll processing
await writeFile(join(OUT, ".nojekyll"), "");

/* ── size report: what a visitor downloads (text assets), source vs build ── */
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
async function measure(dir) {
  let raw = 0, gz = 0, n = 0;
  for (const f of await walk(dir)) {
    if (!/\.(html|css|js)$/.test(f)) continue;
    const b = await readFile(f);
    raw += b.length;
    gz += gzipSync(b, { level: 9 }).length;
    n++;
  }
  return { raw, gz, n };
}
const kb = (b) => (b / 1024).toFixed(1).padStart(7) + " KB";
const src = await measure(SRC);
const dst = await measure(OUT);
const first = (await stat(join(OUT, js))).size + (await stat(join(OUT, css))).size + Buffer.byteLength(html);
const firstGz =
  gzipSync(await readFile(join(OUT, js)), { level: 9 }).length +
  gzipSync(await readFile(join(OUT, css)), { level: 9 }).length +
  gzipSync(html, { level: 9 }).length;

console.log(`
  built ${OUT}/  (${dst.n} text files)
                    raw        gzip
  source     ${kb(src.raw)}  ${kb(src.gz)}
  build      ${kb(dst.raw)}  ${kb(dst.gz)}
  first load ${kb(first)}  ${kb(firstGz)}   (html + css + main js; scenes load on demand)
`);
