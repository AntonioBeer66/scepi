// La partie boardgame.io de bout en bout, avec de vrais clients reliés par
// le transport local (le même que le mode solo) : l'hôte (siège 0) fait
// jouer les bots 1 et 3 depuis son navigateur, le siège 2 est un humain qui
// joue au réflexe des bots, sur sa seule vue. Horloge virtuelle.
// Vérifie : mains cachées (chacun la sienne, l'hôte aussi celles des bots),
// coups refusés (hors tour, bot joué par un non-hôte, délai d'un tour
// passé), partie menée jusqu'à 1010.
//   node tests/coinche-game.test.js
import assert from 'assert';
import { Client } from 'boardgame.io/dist/cjs/client.js';
import { Local } from 'boardgame.io/dist/cjs/multiplayer.js';
import { Coinche } from '../src/coinche/game.js';
import { bots, tuning } from '../src/coinche/engine.js';
import { createHost } from '../src/coinche/host.js';
import { rng } from './coinche-sim.js';

tuning.mcSamples = 2;
tuning.bidSamples = 4;
Math.random = rng(3);

let now = 0;
let seq = 0;
const timers = new Map();
const clock = {
  setTimeout: (fn, ms = 0) => { timers.set(++seq, { id: seq, at: now + ms, fn }); return seq; },
  clearTimeout: (id) => timers.delete(id),
};
const flush = () => new Promise((r) => setImmediate(r));

const multiplayer = Local();
const clients = ['0', '1', '2', '3'].map((playerID) => {
  const c = Client({ game: Coinche, numPlayers: 4, multiplayer, playerID, debug: false });
  c.start();
  return c;
});
const [host, , human] = clients;
const G = (c) => c.getState().G;
const nulls = (h) => h.every((c) => c === null);

const table = createHost({
  timers: clock,
  send: (seat, action) => host.moves.pourSiege(seat, action),
});
host.subscribe((s) => s && s.G.seats && table.update(s.G));
// L'humain du siège 2 joue ce que jouerait un bot, avec sa seule vue.
let humanTour = null;
human.subscribe((s) => {
  const g = s && s.G;
  if (!g || !g.seats || g.joueurActif !== 2 || g.tour === humanTour) return;
  if (g.phase !== 'ENCHERES' && g.phase !== 'JEU') return;
  humanTour = g.tour;
  clock.setTimeout(() => {
    const action = bots.turnAction(structuredClone(G(human)), 2);
    if (action) human.moves.agir(action);
  }, 500);
});

await flush();
assert.strictEqual(G(host).phase, 'ATTENTE');
host.moves.lancer([
  { type: 'human', name: 'Alice' }, { type: 'bot' }, { type: 'human', name: 'Bob<script>' }, { type: 'bot' },
]);
await flush();

// Mains cachées.
const h = G(host);
assert.strictEqual(h.hote, 0);
assert.strictEqual(h.seats[2].name, 'Bob<script>'.slice(0, 18));
assert(h.hands[0].every(Boolean) && h.hands[1].every(Boolean) && h.hands[3].every(Boolean), "l'hôte voit sa main et celles des bots");
assert(nulls(h.hands[2]) && h.hands[2].length === 8, "l'hôte ne voit pas la main de l'humain du siège 2");
const v2 = G(human);
assert(v2.hands[2].every(Boolean), 'le siège 2 voit sa main');
assert([0, 1, 3].every((s) => nulls(v2.hands[s])), 'le siège 2 ne voit aucune autre main');
assert(nulls(G(clients[1]).hands[0]), 'un siège bot (non connecté comme hôte) ne voit rien');

// Coups refusés : l'état ne bouge pas.
const before = JSON.stringify(G(host));
const offTurn = [0, 1, 2, 3].find((s) => s !== h.joueurActif && s % 2 === 0);
clients[offTurn].moves.agir({ type: 'PASSER' });
human.moves.pourSiege(1, { type: 'PASSER' });
host.moves.pourSiege(null, { type: 'TIMEOUT', tour: h.tour - 1 });
await flush();
assert.strictEqual(JSON.stringify(G(host)), before, 'coups invalides refusés sans rien modifier');

// La partie jusqu'au bout.
for (let steps = 0; G(host).phase !== 'TERMINEE'; steps++) {
  assert(steps < 2e5, 'partie sans fin');
  assert(timers.size, `plus rien à faire en phase ${G(host).phase}`);
  let next = null;
  for (const t of timers.values()) if (!next || t.at < next.at) next = t;
  timers.delete(next.id);
  now = next.at;
  next.fn();
  await flush();
}
const end = G(host);
assert(Math.max(...end.scores) >= 1010, 'un camp atteint 1010');
assert(end.history.length > 0);
table.stop();
clients.forEach((c) => c.stop());
console.log(`Partie boardgame.io complète : ${end.history.length} donnes, score ${end.scores.join(' – ')}, mains cachées et coups invalides vérifiés.`);
