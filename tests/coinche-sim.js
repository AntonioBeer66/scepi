// Simulateur headless : le vrai moteur (src/coinche/engine.js) et le vrai
// hôte de table (host.js, qui fait jouer les bots et envoie les TIMEOUT)
// tournent sans rendu, avec une horloge virtuelle (délais des bots, pauses
// de pli et affichage du score passent instantanément) et un hasard
// reproductible, séparé pour les donnes et pour les bots.
import { createHost } from '../src/coinche/host.js';

export function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(deck, rand) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// engine : module du moteur (import de engine.js ou d'une copie).
// Une partie de quatre bots jusqu'au bout ; renvoie l'état final (G).
// deal(G, paquet) peut imposer une donne (4 mains de 8 cartes).
// on.trick(G, gagnant) après chaque pli, on.score(G) à chaque résultat,
// on.timeout(G) si une fenêtre expire (un bot n'a pas agi), on.refus(G,
// siège, action, motif) si le moteur refuse l'action d'un bot.
// decide : décisions des bots par siège, (seat) => objet bots (duels A/B).
// reseed : hasard des bots repris à chaque donne (graine botSeed et numéro
// de donne) ; dans un duel, les deux parties jumelles imaginent les mêmes
// mondes à chaque donne : l'écart ne vient plus que des bots.
export function play(engine, { dealSeed = 1, botSeed = 2, deal = null, on = {}, decide = null, reseed = false } = {}) {
  const { createGame, actOn, bots, tuning } = engine;
  let now = 0;
  let seq = 0;
  const timers = new Map();
  const clock = {
    setTimeout: (fn, ms = 0) => { timers.set(++seq, { id: seq, at: now + ms, fn }); return seq; },
    clearTimeout: (id) => timers.delete(id),
  };
  let botRand = rng(botSeed);
  const rand = () => botRand();
  let donne = 0;
  const dealRand = rng(dealSeed);
  const saved = [Math.random, tuning.now];
  Math.random = rand; // les bots tirent leurs mondes avec Math.random
  tuning.now = () => 0; // réflexion jamais interrompue : reproductible
  try {
    const G = createGame([0, 1, 2, 3].map(() => ({ type: 'bot', name: 'Ordinateur' })), dealRand, deal);
    const newDonne = () => {
      if (!reseed || G.donneNumero === donne) return;
      donne = G.donneNumero;
      botRand = rng(botSeed * 1009 + donne);
    };
    newDonne();
    const pick = (seat) => (decide ? decide(seat) : bots);
    const decider = {
      turnAction: (g, s) => pick(s).turnAction(g, s),
      wantsToCoinche: (g, s) => pick(s).wantsToCoinche(g, s),
      wantsToSurcoinche: (g, s) => pick(s).wantsToSurcoinche(g, s),
    };
    const host = createHost({
      timers: clock,
      random: rand,
      decide: decider,
      send(seat, action) {
        if (action.type === 'TIMEOUT' && on.timeout && G.phase !== 'SCORE' && G.phase !== 'SURCOINCHE') on.timeout(G);
        const before = { plis: G.plisJoues, phase: G.phase };
        const error = actOn(G, seat, action, dealRand, deal);
        if (error) { if (on.refus) on.refus(G, seat, action, error); return; }
        newDonne();
        if (G.plisJoues > before.plis && on.trick) on.trick(G, G.lastTrick.winnerSeat);
        if (G.phase === 'SCORE' && before.phase !== 'SCORE' && on.score) on.score(G);
        host.update(G);
      },
    });
    host.update(G);
    for (let steps = 0; timers.size; steps++) {
      if (steps > 1e5) throw new Error('partie sans fin');
      let next = null;
      for (const t of timers.values()) if (!next || t.at < next.at) next = t;
      timers.delete(next.id);
      now = next.at;
      next.fn();
    }
    return G;
  } finally {
    [Math.random, tuning.now] = saved;
  }
}
