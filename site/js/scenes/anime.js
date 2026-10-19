// Anime hobby: alternates a fleet engagement and an atelier of magic circles,
// with a decode cut between them. Each part keeps its own clock from zero.
import fleet from "./fleet.js";
import sigils from "./sigils.js";

const PARTS = [
  { scene: fleet, span: 24 },
  { scene: sigils, span: 16 },
];

let cur = 0, clock = 0;

export default {
  id: "anime",
  cut: false,
  get title() {
    return PARTS[cur].scene.title;
  },
  get caption() {
    return PARTS[cur].scene.caption;
  },

  init(f, S) {
    PARTS[cur].scene.init?.(f, S);
  },

  frame(f, t, dt, S, input) {
    clock += dt;
    if (clock > PARTS[cur].span) {
      cur = (cur + 1) % PARTS.length;
      clock = 0;
      f.clear();
      PARTS[cur].scene.init?.(f, S);
      this.cut = true;
    }
    PARTS[cur].scene.frame(f, clock, dt, S, input);
  },
};
