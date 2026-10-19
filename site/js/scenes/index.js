// Scene registry. Scenes load lazily the first time a section asks for them.
const LOADERS = {
  city: () => import("./city.js"),
  blackhole: () => import("./blackhole.js"),
  warehouse: () => import("./warehouse.js"),
  globe: () => import("./globe.js"),
  warp: () => import("./warp.js"),
  terrain: () => import("./terrain.js"),
  builder: () => import("./builder.js"),
  helix: () => import("./helix.js"),
  network: () => import("./network.js"),
  boids: () => import("./boids.js"),
  flow: () => import("./flow.js"),
  chess: () => import("./chess.js"),
  embed: () => import("./embed.js"),
  plasma: () => import("./plasma.js"),
  molecule: () => import("./molecule.js"),
  gears: () => import("./gears.js"),
  scope: () => import("./scope.js"),
  bees: () => import("./bees.js"),
  stargate: () => import("./stargate.js"),
  road: () => import("./road.js"),
  sakura: () => import("./sakura.js"),
  babel: () => import("./babel.js"),
  brain: () => import("./brain.js"),
  flight: () => import("./flight.js"),
  mesh: () => import("./mesh.js"),
  weave: () => import("./weave.js"),
  racing: () => import("./racing.js"),
  escapement: () => import("./escapement.js"),
  dune: () => import("./dune.js"),
  shinjuku: () => import("./shinjuku.js"),
  anime: () => import("./anime.js"),
  neuromancer: () => import("./neuromancer.js"),
  gundam: () => import("./gundam.js"),
  aot: () => import("./aot.js"),
  frieren: () => import("./frieren.js"),
  mushishi: () => import("./mushishi.js"),
  solaris: () => import("./solaris.js"),
  sauron: () => import("./sauron.js"),
  llm: () => import("./llm.js"),
  fleet: () => import("./fleet.js"),
  cosmos: () => import("./cosmos.js"),
  sigils: () => import("./sigils.js"),
};

const cache = new Map();

export const SCENE_IDS = Object.keys(LOADERS);

export async function loadScene(id) {
  if (!LOADERS[id]) return null;
  if (!cache.has(id)) cache.set(id, LOADERS[id]().then((m) => m.default, () => (cache.delete(id), null)));
  return cache.get(id);
}
