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

console.log("Hôte : chaque bot ne voit que sa main.");
