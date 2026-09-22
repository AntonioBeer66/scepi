// Moteur de test headless : le vrai coinche-game.js tourne dans une VM, sans
// rendu HTML ni animation (plus de la moitié du temps d'une partie), avec une
// horloge virtuelle (délais des bots, pauses de pli et affichage du score
// passent instantanément) et un hasard reproductible, séparé pour les donnes
// et pour les bots. Un seul contexte sert à toutes les parties.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const GAME = path.join(__dirname, '../site/assets/js/coinche-game.js');

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(deck, rand) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// [ancre, remplacement] : chaque ancre doit figurer une seule fois dans le jeu.
const HOOKS = [
  ['function render() {', 'function render() { return;'],
  ['function captureOrigin(seat, carte) {', 'function captureOrigin(seat, carte) { return null;'],
  ['G.hands = deal(shuffle(buildDeck()), G.donneur);', 'G.hands = (__sim.deal && __sim.deal(G, buildDeck())) || deal(__sim.shuffle(buildDeck()), G.donneur);'],
  ['donneur: Math.floor(Math.random() * 4),', 'donneur: Math.floor(__sim.dealRand() * 4),'],
  ['function onTurnTimeout(seat) {', 'function onTurnTimeout(seat) { __sim.on.timeout && __sim.on.timeout(G, seat);'],
  ['const winnerSeat = trickWinnerSeat(G.pliCourant, G.contract.atout);', 'const winnerSeat = trickWinnerSeat(G.pliCourant, G.contract.atout); __sim.on.trick && __sim.on.trick(G, winnerSeat);'],
  ["    G.phase = 'SCORE';", "    G.phase = 'SCORE'; __sim.on.score && __sim.on.score(G);"],
  ['window.SCEPICoincheGame =', 'window.__api = { getG: () => G, setG: (g) => { G = g; }, botDecideBid, botChooseCard, botWantsToCoinche, botWantsToSurcoinche }; window.SCEPICoincheGame ='],
];

function createSim(patches = [], file = GAME) {
  let src = fs.readFileSync(file, 'utf8');
  for (const [a, b] of [...HOOKS, ...patches]) {
    const n = src.split(a).length - 1;
    if (n !== 1) throw new Error(`ancre trouvée ${n} fois : ${a.slice(0, 80)}`);
    src = src.replace(a, () => b);
  }
  let now = 0;
  let seq = 0;
  const timers = new Map(); // ordre d'insertion = ordre des id
  const sim = { on: {}, deal: null, rand: Math.random, dealRand: Math.random };
  sim.shuffle = (deck) => shuffle(deck, sim.dealRand);
  const root = { hidden: false, addEventListener() {}, scrollIntoView() {} };
  const ctx = vm.createContext({
    setTimeout: (fn, ms = 0) => { timers.set(++seq, { id: seq, at: now + ms, fn }); return seq; },
    clearTimeout: (id) => timers.delete(id),
    Date: { now: () => now },
    document: { querySelector: (s) => (s === '#game-view' ? root : null), body: { classList: { add() {}, remove() {} } } },
    window: {},
    console,
    __sim: sim,
  });
  vm.runInContext(`Math.random = () => __sim.rand();\n${src}`, ctx);
  const api = ctx.window.__api;

  // Une partie de quatre bots jusqu'au bout ; renvoie l'état final (G).
  // deal(G, paquet) peut imposer une donne (mains de 8 cartes) ; on.* observe.
  function play({ dealSeed = 1, botSeed = 2, deal = null, on = {} } = {}) {
    timers.clear();
    now = 0;
    Object.assign(sim, { on, deal, rand: rng(botSeed), dealRand: rng(dealSeed) });
    ctx.window.SCEPICoincheGame.start([0, 1, 2, 3].map(() => ({ type: 'bot' })), 0, () => {});
    for (let steps = 0; timers.size; steps++) {
      if (steps > 1e5) throw new Error('partie sans fin');
      let next = null;
      for (const t of timers.values()) if (!next || t.at < next.at) next = t;
      timers.delete(next.id);
      now = next.at;
      next.fn();
    }
    return api.getG();
  }

  return { api, play, sim };
}

module.exports = { createSim, rng, shuffle, GAME };
