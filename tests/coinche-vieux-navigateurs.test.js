// Téléphones anciens (Safari < 15.4, Chrome < 98) : sans structuredClone,
// .at() ni Object.hasOwn, le moteur et l'hôte plantaient et les bots ne
// faisaient plus que passer au bout du délai. On retire ces API avant de
// charger le moteur, puis des bots jouent des parties entières.
//   node tests/coinche-vieux-navigateurs.test.js
import assert from "assert";

delete Object.hasOwn;
delete globalThis.structuredClone;
delete Array.prototype.at;
delete String.prototype.at;

const engine = await import("../src/coinche/engine.js");
const { play } = await import("./coinche-sim.js");

// Peu de mondes : seuls les chemins du code comptent ici, pas le niveau.
engine.tuning.mcSamples = engine.tuning.bidWorlds = engine.tuning.bidSamples = 8;
for (const regles of [undefined, "essec"]) {
  const G = play(engine, { dealSeed: 1, botSeed: 11, regles });
  assert.equal(G.phase, "TERMINEE", `partie ${regles ?? "classique"} inachevée`);
}
console.log("Vieux navigateurs : 2 parties de bots sans structuredClone, .at() ni Object.hasOwn.");
