// Même situation, même décision : ni l'horloge (plus aucune lecture du
// temps), ni Math.random (graine dérivée de ce que le siège sait), ni l'ordre
// des cartes en main ne changent une enchère, une carte, une coinche ou une
// surcoinche ; et la décision ne réordonne jamais G.hands (la main affichée).
// Positions réelles, capturées dans une partie de bots ; mondes réduits.
//   node tests/coinche-determinisme.test.js
import assert from 'assert';
import * as engine from '../src/coinche/engine.js';
import { play, rng, shuffle } from './coinche-sim.js';

const { bots, tuning, computeLegal } = engine;
const t0 = Date.now();

// Capture (réflexes et 4 mondes : rapide) : la vue du siège avant chaque décision.
const pos = { enchere: [], carte: [], coinche: [], surcoinche: [] };
const snap = (kind, g, s) => pos[kind].push({ kind, s, json: JSON.stringify(g) });
tuning.mcSamples = 0;
tuning.bidWorlds = 4;
tuning.bidSamples = 4;
play(engine, {
  dealSeed: 11,
  botSeed: 12,
  decide: () => ({
    turnAction(g, s) {
      if (g.phase === 'ENCHERES') snap('enchere', g, s);
      else if (computeLegal(g.hands[s], g.pliCourant, g.contract.atout, s).length > 1) snap('carte', g, s);
      return bots.turnAction(g, s);
    },
    wantsToCoinche(g, s) {
      if (g.contract.type === 'NUMERIQUE') snap('coinche', g, s);
      return bots.wantsToCoinche(g, s);
    },
    wantsToSurcoinche(g, s) {
      snap('surcoinche', g, s);
      return bots.wantsToSurcoinche(g, s);
    },
  }),
});
const spread = (a, k) => a.filter((_, i) => i % Math.max(1, Math.floor(a.length / k)) === 0).slice(0, k);
const positions = [...spread(pos.enchere, 15), ...spread(pos.carte, 25), ...spread(pos.coinche, 10), ...spread(pos.surcoinche, 5)];
assert(positions.filter((p) => p.kind === 'enchere').length >= 10, 'trop peu d’enchères capturées');
assert(positions.filter((p) => p.kind === 'carte').length >= 20, 'trop peu de cartes capturées');
assert(positions.filter((p) => p.kind === 'coinche').length >= 5, 'trop peu de coinches capturées');

// Une décision sur une copie fraîche de la position, avec ce hasard et cette horloge.
tuning.mcSamples = 24;
tuning.bidWorlds = 24;
tuning.bidSamples = 24;
function decide(p, { seed = 1, now = () => 0, melange = null } = {}) {
  const g = JSON.parse(p.json);
  if (melange) g.hands[p.s] = shuffle(g.hands[p.s], rng(melange));
  const ordre = g.hands[p.s].map((c) => c.id).join();
  Math.random = rng(seed);
  tuning.now = now;
  let key;
  if (p.kind === 'coinche') key = String(bots.wantsToCoinche(g, p.s));
  else if (p.kind === 'surcoinche') key = String(bots.wantsToSurcoinche(g, p.s));
  else {
    const a = bots.turnAction(g, p.s);
    key = a.type === 'JOUER' ? a.carte.id : a.type === 'PASSER' ? 'P' : a.montant + a.atout;
  }
  assert.strictEqual(g.hands[p.s].map((c) => c.id).join(), ordre, `${p.kind} : la décision a réordonné G.hands`);
  return key;
}

for (const [i, p] of positions.entries()) {
  const ref = decide(p);
  const where = `${p.kind} n° ${i} (référence ${ref})`;
  let t = 0;
  assert.strictEqual(decide(p, { now: () => (t += 50) }), ref, `${where} : l'horloge change la décision`);
  assert.strictEqual(decide(p, { seed: 777 }), ref, `${where} : Math.random change la décision`);
  assert.strictEqual(decide(p, { seed: 5, melange: 3 + i }), ref, `${where} : l'ordre de la main change la décision`);
}
const count = (k) => positions.filter((p) => p.kind === k).length;
console.log(`Déterminisme : ${positions.length} positions (${count('enchere')} enchères, ${count('carte')} cartes, ${count('coinche')} coinches, ${count('surcoinche')} surcoinches), même décision quelle que soit l'horloge, la graine ou l'ordre de la main, en ${Date.now() - t0} ms.`);
