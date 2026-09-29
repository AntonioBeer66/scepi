// Salons et parties en ligne (src/coinche/online/tables.js, le cœur du
// serveur worker/tables.js), sans réseau : horloge virtuelle.
// Vérifie : entretien (4 tables permanentes, abandons, plafond), places
// (pseudo, identifiants, départ), coups refusés sans identifiants valides,
// mains cachées (joueur, hôte, spectateur), partie menée jusqu'à 1010 par
// l'hôte (bots, délais) et un humain qui ne voit que sa main.
//   node tests/coinche-tables.test.js
import assert from "assert";
import { bots, tuning } from "../src/coinche/engine.js";
import { createHost } from "../src/coinche/host.js";
import {
  createTables,
  EMPTY_MS,
  IDLE_MS,
  MAX_MATCHES,
  PERMANENT_TABLES,
} from "../src/coinche/online/tables.js";
import { rng } from "./coinche-sim.js";

tuning.mcSamples = 2;
tuning.bidSamples = 4;
Math.random = rng(7);

let now = 0;
const tables = createTables({ now: () => now, random: rng(11) });
const nulls = (h) => h.every((c) => c === null);

// Entretien : une table en attente par numéro permanent, pas de doublon.
tables.maintain();
tables.maintain();
const list = () => tables.list(() => false);
assert.strictEqual(list().length, PERMANENT_TABLES);
assert.deepStrictEqual(list().map((t) => t.table).sort(), [1, 2, 3, 4]);

// Places : pseudo requis, place occupée, identifiants.
const t1 = list().find((t) => t.table === 1).matchID;
assert.strictEqual(tables.join(t1, 0, "   ").error, "INVALIDE");
assert.strictEqual(tables.join(t1, 7, "Alice").error, "INVALIDE");
const alice = tables.join(t1, 0, "Alice<script>").credentials;
assert.ok(alice);
assert.strictEqual(tables.join(t1, 0, "Intrus").error, "OCCUPEE");
const bob = tables.join(t1, 2, "Bob").credentials;
assert.ok(tables.auth(t1, 0, alice) && !tables.auth(t1, 0, bob) && !tables.auth(t1, 1, undefined));
assert.strictEqual(list().find((t) => t.matchID === t1).players[2].name, "Bob");

// Départ puis retour : les anciens identifiants ne valent plus rien.
const carol = tables.join(t1, 1, "Carol").credentials;
assert.ok(!tables.leave(t1, 1, "faux"));
assert.ok(tables.leave(t1, 1, carol));
assert.ok(!tables.auth(t1, 1, carol));

// Coups : nom inconnu, arguments invalides, lancement par un siège vide.
const seats = [{ type: "human", name: "Alice" }, { type: "bot" }, { type: "human", name: "Bob" }, { type: "bot" }];
assert.ok(!tables.move(t1, 0, "inconnu", []));
assert.ok(!tables.move(t1, 0, "lancer", "pas un tableau"));
assert.ok(!tables.move(t1, 1, "lancer", [seats]), "un siège de bot ne lance pas");
assert.ok(tables.move(t1, 0, "lancer", [seats]));
assert.ok(!tables.move(t1, 0, "lancer", [seats]), "déjà lancée");

// La table 1 jouée, l'entretien en rouvre une en attente.
tables.maintain();
assert.strictEqual(list().filter((t) => t.table === 1).length, 2);

// Mains cachées.
const host = tables.view(t1, 0).G;
assert.strictEqual(host.hote, 0);
assert.strictEqual(host.seats[0].name, "Alice");
assert.ok([0, 1, 3].every((s) => host.hands[s].every(Boolean)), "l'hôte voit sa main et celles des bots");
assert.ok(nulls(host.hands[2]), "l'hôte ne voit pas la main de Bob");
const v2 = tables.view(t1, 2).G;
assert.ok(v2.hands[2].every(Boolean) && [0, 1, 3].every((s) => nulls(v2.hands[s])));
const spectator = tables.view(t1, null).G;
assert.ok([0, 1, 2, 3].every((s) => nulls(spectator.hands[s])), "le spectateur ne voit aucune main");

// Coups refusés sans rien changer : hors tour, bot joué par un non-hôte.
const before = JSON.stringify(tables.get(t1).G);
const offTurn = [0, 2].find((s) => s !== host.joueurActif);
tables.move(t1, offTurn, "agir", [{ type: "PASSER" }]);
tables.move(t1, 2, "pourSiege", [1, { type: "PASSER" }]);
assert.strictEqual(JSON.stringify(tables.get(t1).G), before, "coups invalides sans effet");

// La partie jusqu'au bout : l'hôte (Alice) fait jouer les bots, Bob joue
// ce que jouerait un bot, sur sa seule vue ; horloge virtuelle.
let seq = 0;
const timers = new Map();
const clock = {
  setTimeout: (fn, ms = 0) => {
    timers.set(++seq, { id: seq, at: now + ms, fn });
    return seq;
  },
  clearTimeout: (id) => timers.delete(id),
};
const table = createHost({
  timers: clock,
  send: (seat, action) => tables.move(t1, 0, "pourSiege", [seat, action]) && publish(),
});
let bobTour = null;
function publish() {
  table.update(tables.view(t1, 0).G);
  const g = tables.view(t1, 2).G;
  if (g.joueurActif !== 2 || g.tour === bobTour || (g.phase !== "ENCHERES" && g.phase !== "JEU")) return;
  bobTour = g.tour;
  clock.setTimeout(() => {
    const action = bots.turnAction(structuredClone(tables.view(t1, 2).G), 2);
    if (action && tables.move(t1, 2, "agir", [action])) publish();
  }, 500);
}
publish();
for (let steps = 0; tables.get(t1).G.phase !== "TERMINEE"; steps++) {
  assert.ok(steps < 2e5, "partie sans fin");
  assert.ok(timers.size, `plus rien à faire en phase ${tables.get(t1).G.phase}`);
  let next = null;
  for (const t of timers.values()) if (!next || t.at < next.at) next = t;
  timers.delete(next.id);
  now = next.at;
  next.fn();
}
table.stop();
const end = tables.get(t1).G;
assert.ok(Math.max(...end.scores) >= 1010, "un camp atteint 1010");

// Abandons : partie inactive effacée, salon temporaire jamais rejoint aussi.
const temp = tables.create();
now += EMPTY_MS + 1;
tables.maintain();
assert.ok(!tables.get(temp.id), "salon temporaire vide effacé");
now += IDLE_MS + 1;
tables.maintain();
assert.ok(!tables.get(t1), "partie abandonnée effacée");
assert.strictEqual(list().length, PERMANENT_TABLES);

// Plafond de tables.
while (tables.create());
assert.strictEqual(tables.all().length, MAX_MATCHES);

console.log(
  `Salons en ligne : ${end.history.length} donnes jusqu'à ${end.scores.join(" – ")}, places, mains cachées, coups refusés et entretien vérifiés.`,
);
