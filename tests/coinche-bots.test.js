// Parties 100 % bots en accéléré (moteur headless : coinche-sim.js). Échoue
// si un bot joue une carte illégale, fait une enchère invalide ou reste
// bloqué (le moteur ignore alors l'action et le délai de 30 s expire), si
// une partie ne se termine pas, ou si une donne est mal arbitrée. Chaque donne
// est recomptée ici indépendamment du moteur : gagnant et points des plis,
// belote/rebelote (le preneur seul, Roi et Dame d'atout en main initiale),
// Générale (8 atouts en main initiale : capot beloté gagné d'office, jamais
// coinché par un bot) et score. Une partie sur quatre commence par une
// Générale imposée, qu'une donne au hasard ne produit presque jamais.
// Le Monte-Carlo du jeu de la carte coûte cher : réflexes seuls pour la
// plupart des parties, Monte-Carlo réduit à 2 mondes pour les dernières.
//   node tests/coinche-bots.test.js
const assert = require('assert');
const { createSim, rng, shuffle } = require('./coinche-sim');

const GAMES = 200;
const MC_GAMES = 10;
const ORDER = { atout: ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'], plain: ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'] };
const POINTS = { atout: { J: 20, 9: 14, A: 11, 10: 10, K: 4, Q: 3 }, plain: { A: 11, 10: 10, K: 4, Q: 3, J: 2 } };
const team = (seat) => seat % 2;

// La coinche simulée joue aussi des mondes : 4 suffisent pour vérifier les règles.
const mondes = (n) => [['const MC_SAMPLES = ', `const MC_SAMPLES = ${n}; const __mc = `], ['const BID_SAMPLES = 24;', 'const BID_SAMPLES = 4;']];
const reflexes = createSim(mondes(0));
const mc = createSim(mondes(2));
const stats = { donnes: 0, belotes: 0, generales: 0, imposees: 0, capots: 0, coinches: 0 };
const t0 = Date.now();

for (let game = 0; game < GAMES + MC_GAMES; game++) {
  const { play } = game < GAMES ? reflexes : mc;
  let pts = [0, 0];
  let plis = [0, 0];
  let prev = [0, 0];
  const where = () => `partie ${game}, donne ${stats.donnes}`;

  // Le premier à parler reçoit les 8 cartes d'une couleur.
  const generale = (G, deck) => {
    if (game % 4 || G.history.length) return null;
    stats.imposees++;
    const seat = (G.donneur + 1) % 4;
    const suit = deck[game % deck.length].suit;
    const rest = shuffle(deck.filter((c) => c.suit !== suit), rng(game));
    return [0, 1, 2, 3].map((s) => (s === seat ? deck.filter((c) => c.suit === suit) : rest.splice(0, 8)));
  };

  const on = {
    timeout(G, seat) { throw new Error(`${where()} : bot bloqué (siège ${seat}, ${G.phase})`); },
    trick(G, winner) {
      const { atout } = G.contract;
      const lead = G.pliCourant[0].carte.suit;
      const force = (c) => (c.suit === atout ? 100 + ORDER.atout.indexOf(c.rank) : c.suit === lead ? ORDER.plain.indexOf(c.rank) : -1);
      const best = G.pliCourant.reduce((a, b) => (force(b.carte) > force(a.carte) ? b : a));
      assert.strictEqual(winner, best.siege, `${where()} : mauvais gagnant de pli`);
      plis[team(winner)]++;
      pts[team(winner)] += G.pliCourant.reduce((s, e) => s + ((e.carte.suit === atout ? POINTS.atout : POINTS.plain)[e.carte.rank] || 0), 0)
        + (plis[0] + plis[1] === 8 ? 10 : 0);
    },
    score(G) {
      const c = G.contract;
      const pre = c.equipePreneur;
      const main = G.mainsInitiales[c.preneur];
      const belote = ['K', 'Q'].every((r) => main.some((x) => x.suit === c.atout && x.rank === r));
      const huitAtouts = main.every((x) => x.suit === c.atout);
      assert.deepStrictEqual([...G.pointsPlis], pts, `${where()} : points des plis`);
      assert.deepStrictEqual([...G.plisGagnes], plis, `${where()} : nombre de plis`);
      assert.strictEqual(G.belote.holder, belote ? c.preneur : null, `${where()} : détenteur de la belote`);
      assert.strictEqual(G.belote.beloteDeclared && G.belote.rebeloteDeclared, belote, `${where()} : belote/rebelote`);
      assert.strictEqual(!!c.generale, huitAtouts && c.montant === 270, `${where()} : marqueur Générale (270 seulement)`);

      const base = c.montant === 80 ? 82 : c.montant;
      const reussi = c.montant === 250 ? plis[pre] === 8
        : c.montant === 270 ? plis[pre] === 8 && belote
          : pts[pre] >= (belote ? Math.max(81, base - 20) : base);
      const gain = [0, 0];
      gain[reussi ? pre : 1 - pre] = (reussi ? c.montant : 160) * G.multiplicateur;
      assert.strictEqual(G.history[0].reussi, reussi, `${where()} : réussite du contrat`);
      assert.deepStrictEqual([G.scores[0] - prev[0], G.scores[1] - prev[1]], gain, `${where()} : score`);
      if (huitAtouts) {
        assert(c.montant === 270 && reussi && G.multiplicateur === 1, `${where()} : Générale annoncée 270, gagnée, jamais coinchée`);
        stats.generales++;
      }

      stats.donnes++;
      if (belote) stats.belotes++;
      if (c.montant >= 250) stats.capots++;
      if (G.multiplicateur > 1) stats.coinches++;
      prev = [...G.scores];
      pts = [0, 0];
      plis = [0, 0];
    },
  };

  const G = play({ dealSeed: 1000 + game, botSeed: 5000 + game, deal: generale, on });
  assert.strictEqual(G.phase, 'TERMINEE', `partie ${game} non terminée`);
  assert(Math.max(...G.scores) >= 1010, `partie ${game} : aucun camp à 1010`);
}
assert.strictEqual(stats.generales, stats.imposees, 'chaque Générale imposée doit être annoncée et gagnée');
console.log(`${GAMES} + ${MC_GAMES} (Monte-Carlo) parties de bots sans erreur en ${Date.now() - t0} ms : ${stats.donnes} donnes arbitrées (${stats.belotes} belotes, ${stats.generales} Générales, ${stats.capots} capots, ${stats.coinches} coinches).`);
