// Parties 100 % bots en accéléré, sans navigateur : échoue si un bot joue
// une carte illégale, fait une enchère invalide ou reste bloqué (le moteur
// ignore alors l'action et le délai de 30 s expire), ou si une partie ne
// se termine pas.   node tests/coinche-bots.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAMES = 50;
const src = fs.readFileSync(path.join(__dirname, '../site/assets/js/coinche-game.js'), 'utf8')
  .replace('function onTurnTimeout(seat) {', 'function onTurnTimeout(seat) { throw new Error(`bot bloqué (siège ${seat}, ${G.phase})`);')
  .replace('window.SCEPICoincheGame =', 'window.__G = () => G; window.SCEPICoincheGame =');

const el = () => ({
  innerHTML: '', style: {}, classList: { add() {}, remove() {} },
  scrollIntoView() {}, addEventListener() {}, querySelector() { return null; }, getBoundingClientRect() { return {}; },
});

for (let game = 0; game < GAMES; game++) {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  const ctx = {
    setTimeout: (fn, ms = 0) => { timers.set(++seq, { t: now + ms, id: seq, fn }); return seq; },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame() {},
    Date: { now: () => now },
    document: { querySelector: (s) => (s[0] === '#' ? el() : null), getElementById: () => null, body: el() },
    window: {},
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  ctx.window.SCEPICoincheGame.start([0, 1, 2, 3].map(() => ({ type: 'bot' })), 0, () => {});
  while (timers.size) {
    const next = [...timers.values()].reduce((a, b) => (b.t < a.t || (b.t === a.t && b.id < a.id) ? b : a));
    timers.delete(next.id);
    now = next.t;
    next.fn();
  }
  const G = ctx.window.__G();
  assert.strictEqual(G.phase, 'TERMINEE', `partie ${game} non terminée`);
  assert(Math.max(...G.scores) >= 1010, `partie ${game} : aucun camp à 1010`);
}
console.log(`${GAMES} parties de bots terminées sans erreur.`);
