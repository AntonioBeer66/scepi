// L'hôte connaît les mains de tous les bots, mais chaque bot ne décide que
// sur sa propre vue : sa main, rien de celles des autres (partenaire compris).
//   node tests/coinche-host.test.js
import assert from "assert";
import { createGame } from "../src/coinche/engine.js";
import { createHost, seatView } from "../src/coinche/host.js";

const seats = [0, 1, 2, 3].map(() => ({ type: "bot", name: "Bot" }));
const G = createGame(seats, Math.random);
G.belote.holder = 3; // belote pas encore annoncée

const v = seatView(G, 1);
assert.deepStrictEqual(v.hands[1], G.hands[1], "sa main");
for (const s of [0, 2, 3]) {
  assert.ok(v.hands[s].every((c) => c === null), `main ${s} masquée`);
  assert.strictEqual(v.hands[s].length, G.hands[s].length, "nombre de cartes visible");
  assert.deepStrictEqual(v.mainsInitiales[s], [], `main initiale ${s} masquée`);
  assert.strictEqual(v.bidMemo[s], null, `mémoire d'enchère ${s} masquée`);
}
assert.strictEqual(v.belote.holder, null, "belote secrète");
assert.notStrictEqual(G.hands[0][0], null, "l'état de l'hôte reste intact");

// Le bot actif reçoit bien cette vue.
let seen = null;
const queue = [];
const host = createHost({
  send() {},
  timers: { setTimeout: (fn, ms) => queue.push([ms, fn]), clearTimeout() {} },
  decide: { turnAction: (g, s) => ((seen ??= { g, s }), null), wantsToCoinche: () => false, wantsToSurcoinche: () => false },
});
host.update({ ...G, hote: 0 });
queue.sort((a, b) => a[0] - b[0]).forEach(([, fn]) => fn());
assert.ok(seen, "le bot actif a décidé");
for (const s of [0, 1, 2, 3])
  if (s !== seen.s) assert.ok(seen.g.hands[s].every((c) => c === null), `le bot ${seen.s} ne voit pas la main ${s}`);

// Joueur actif parti en plein tour (devenirBot, même tour) : son bot joue.
const human = createGame([0, 1, 2, 3].map((s) => ({ type: s === 0 ? "human" : "bot", name: "X" })), Math.random);
human.seats[human.joueurActif] = { type: "human", name: "Bob" };
human.seats[0] = { type: "human", name: "Alice" };
const q2 = [];
let played = null;
const h2 = createHost({
  send(seat, action) { if (action.type !== "TIMEOUT") played = seat; },
  timers: { setTimeout: (fn, ms) => q2.push([ms, fn]), clearTimeout() {} },
  decide: { turnAction: () => ({ type: "PASSER" }), wantsToCoinche: () => false, wantsToSurcoinche: () => false },
});
const active = human.joueurActif;
h2.update({ ...human, hote: 0 });
const left = { ...human, hote: 0, seats: human.seats.map((s, i) => (i === active && i !== 0 ? { type: "bot", name: "Bob (bot)" } : s)) };
h2.update(left);
// Minuteurs courts (calcul puis envoi au bout du délai), dans l'ordre où ils naissent.
for (let i = 0; i < q2.length; i++) if (q2[i][0] < 5000) q2[i][1]();
if (active !== 0) assert.strictEqual(played, active, "le bot qui remplace le joueur actif joue tout de suite");

console.log("Hôte : chaque bot ne voit que sa main ; un siège repris en plein tour joue.");
