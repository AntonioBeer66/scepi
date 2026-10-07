// Cas de validation de REGLES_COINCHE.md (section 11), un par un, sur le
// moteur : jeu de la carte (fournir, couper, monter), enchères et coinche,
// décompte (seuils, belote, multiplicateurs, capots) et fin de partie.
//   node tests/coinche-cas.test.js
import assert from "assert";
import {
  GENERALE,
  WIN_SCORE,
  actOn,
  bidType,
  computeLegal,
  createGame,
  trickWinnerSeat,
} from "../src/coinche/engine.js";
import { rng } from "./coinche-sim.js";

const card = (id) => ({ id, rank: id.slice(0, -1), suit: id.slice(-1) });
const ids = (cards) => cards.map((c) => c.id).sort().join(" ");
const pli = (...plays) => plays.map(([siege, id]) => ({ siege, carte: card(id) }));
let n = 0;
const ok = (cond, label) => {
  assert.ok(cond, label);
  n++;
};
const eq = (got, want, label) => {
  assert.deepStrictEqual(got, want, label);
  n++;
};

// ---- Jeu de la carte (atout cœur ; on joue le siège 0, partenaire 2) ----
const legal = (main, plays) => ids(computeLegal(main.map(card), pli(...plays), "H", 0));
eq(legal(["KS", "JH", "7C"], [[2, "AS"]]), "KS", "couleur demandée, partenaire maître : fournir");
eq(legal(["JH", "8H", "7C"], [[1, "AS"], [2, "7S"], [3, "9H"]]), "JH", "adversaire maître à l'atout : surcouper");
eq(legal(["8H", "QH", "7C"], [[1, "AS"], [2, "7S"], [3, "9H"]]), "8H QH", "seulement des atouts plus faibles : sous-couper");
eq(legal(["JH", "7C", "8D"], [[1, "7S"], [2, "AS"], [3, "8S"]]), "7C 8D JH", "couleur absente, partenaire maître : tout");
eq(legal(["9H", "KH", "7C"], [[1, "7H"], [2, "AH"], [3, "8H"]]), "9H", "atout demandé, partenaire maître : monter");
eq(legal(["AS", "7C"], []), "7C AS", "entame : tout");
eq(trickWinnerSeat(pli([1, "AS"], [2, "7H"], [3, "10S"], [0, "KS"]), "H"), 2, "le plus petit atout bat l'As");
eq(trickWinnerSeat(pli([1, "9S"], [2, "AD"], [3, "10S"], [0, "7S"]), "H"), 3, "sans atout : la plus forte de la couleur demandée");

// ---- Enchères et coinche ----
const humans = [0, 1, 2, 3].map((s) => ({ type: "human", name: `J${s}` }));
function bidding(seed = 5) {
  const r = rng(seed);
  const g = createGame(humans, r);
  return { g, r, act: (seat, a) => actOn(g, seat, a, r) };
}
{
  const { g, act } = bidding();
  const s = g.joueurActif;
  eq(act(s, { type: "ENCHERIR", montant: 100, atout: "H" }), undefined, "enchère 100");
  eq(act(g.joueurActif, { type: "ENCHERIR", montant: 100, atout: "S" }), "ENCHERE_INVALIDE", "100 sur 100 d'une autre couleur : refus");
  eq(act(g.joueurActif, { type: "ENCHERIR", montant: 95, atout: "S" }), "ENCHERE_INVALIDE", "montant hors liste : refus");
  const partner = (s + 2) % 4;
  eq(act(partner, { type: "COINCHER" }), "COINCHE_INTERDITE", "l'équipe preneuse ne coinche pas");
  const def = (s + 3) % 4; // défenseur, pas à son tour
  ok(def !== g.joueurActif, "le défenseur choisi n'est pas le joueur actif");
  eq(act(def, { type: "COINCHER" }), undefined, "défenseur qui coinche hors tour : accepté");
  eq(g.phase, "SURCOINCHE", "fenêtre de surcoinche");
  eq(g.contract.coincheur, def, "le coincheur est retenu");
  eq(act((s + 1) % 4, { type: "SURCOINCHER" }), "SURCOINCHE_INTERDITE", "la défense ne surcoinche pas");
  eq(act(partner, { type: "SURCOINCHER" }), undefined, "surcoinche de l'équipe preneuse");
  eq(g.phase, "JEU", "surcoinche : le jeu commence");
  eq(g.multiplicateur, 4, "surcoinche ×4");
  eq(act(def, { type: "COINCHER" }), "HORS_PHASE", "coinche après fermeture des enchères : refus");
}
{
  const { g, act } = bidding(8);
  const donneur = g.donneur;
  const donne = g.donneNumero;
  for (let i = 0; i < 4; i++) act(g.joueurActif, { type: "PASSER" });
  eq(g.scores, [0, 0], "quatre passes : aucun score");
  ok(g.donneur !== donneur && g.donneNumero === donne + 1, "quatre passes : nouveau donneur, nouvelle donne");
  eq(new Set(g.hands.flat().map((c) => c.id)).size, 32, "32 cartes uniques");
  ok(g.hands.every((h) => h.length === 8), "quatre mains de huit");
}
{
  const { g, act } = bidding(9);
  const s = g.joueurActif;
  act(s, { type: "ENCHERIR", montant: 80, atout: "C" });
  for (let i = 0; i < 3; i++) act(g.joueurActif, { type: "PASSER" });
  eq(g.phase, "JEU", "trois passes après une annonce : on joue");
  const off = [0, 1, 2, 3].find((x) => x !== g.joueurActif);
  eq(act(off, { type: "JOUER", carte: g.hands[off][0] }), "HORS_TOUR", "jouer hors tour : refus");
  const p = g.joueurActif;
  const c = g.hands[p][0];
  eq(act(p, { type: "JOUER", carte: c }), undefined, "carte jouée");
  eq(act(p, { type: "JOUER", carte: c }), "HORS_TOUR", "même carte envoyée deux fois : un seul jeu");
  eq(g.pliCourant.filter((e) => e.carte.id === c.id).length, 1, "une seule fois dans le pli");
}

// ---- Décompte : le dernier pli est joué par le moteur, qui calcule le score ----
// Preneur au siège 0 (équipe 0), atout cœur. « points » : points des plis des
// preneurs à la fin de la donne ; le dernier pli (trèfles, 12 points avec le
// dix de der) va à la défense, ou aux preneurs si derPreneurs.
function score({ montant, points, belote = false, mult = 1, plis = 4, derPreneurs = false, scores = [0, 0], rebeloteDernier = false }) {
  const r = rng(3);
  const g = createGame(humans, r);
  g.contract = {
    id: 1, type: bidType(montant), montant, atout: "H", preneur: 0, equipePreneur: 0,
    coinche: mult > 1, surcoinche: mult > 2, generale: montant === GENERALE,
  };
  g.multiplicateur = mult;
  g.scores = scores.slice();
  const last = derPreneurs || rebeloteDernier ? 12 + (rebeloteDernier ? 4 : 0) : 12;
  g.pointsPlis = derPreneurs || rebeloteDernier ? [points - last, 162 - points] : [points, 162 - points - last];
  g.plisGagnes = derPreneurs || rebeloteDernier ? [plis - 1, 8 - plis] : [plis, 7 - plis];
  g.belote = { holder: belote ? 0 : null, kingPlayed: belote, queenPlayed: belote, beloteDeclared: belote, rebeloteDeclared: belote && !rebeloteDernier };
  g.phase = "JEU";
  g.plisJoues = 7;
  g.pliCourant = [];
  // Dernier pli, entamé par le preneur.
  g.hands = rebeloteDernier
    ? [[card("KH")], [card("8C")], [card("9C")], [card("JC")]]
    : derPreneurs
      ? [[card("JC")], [card("7C")], [card("8C")], [card("9C")]]
      : [[card("7C")], [card("8C")], [card("9C")], [card("JC")]];
  if (rebeloteDernier) g.belote.queenPlayed = true;
  for (const s of [0, 1, 2, 3]) {
    g.joueurActif = s;
    assert.strictEqual(actOn(g, s, { type: "JOUER", carte: g.hands[s][0] }, r), undefined, "dernier pli joué");
  }
  return g;
}
const gains = (o) => score(o).dernierResultat.gains;
eq(gains({ montant: 80, points: 81 }), [0, 160], "80 sans belote, 81 points : chute");
eq(gains({ montant: 80, points: 82 }), [80, 0], "80 sans belote, 82 points : 80 aux preneurs");
eq(gains({ montant: 100, points: 80, belote: true }), [0, 160], "100 avec belote, 80 points : chute");
eq(gains({ montant: 100, points: 81, belote: true }), [100, 0], "100 avec belote, 81 points : réussite (sans +20 au score)");
eq(gains({ montant: 110, points: 89, belote: true }), [0, 160], "110 avec belote, 89 points : chute");
eq(gains({ montant: 110, points: 90, belote: true }), [110, 0], "110 avec belote, 90 points : réussite");
eq(gains({ montant: 100, points: 100, mult: 2 }), [200, 0], "100 coinché réussi : 200");
eq(gains({ montant: 100, points: 60, mult: 4 }), [0, 640], "100 surcoinché chuté : 640 à la défense");
eq(gains({ montant: 250, points: 162, plis: 8, derPreneurs: true, mult: 2 }), [500, 0], "250 coinché, huit plis : 500");
eq(gains({ montant: 250, points: 150, plis: 7, mult: 2 }), [0, 320], "250 coinché, sept plis : 320 à la défense");
eq(gains({ montant: 270, points: 162, plis: 8, derPreneurs: true }), [0, 160], "270, huit plis sans belote : chute");
{
  const g = score({ montant: 270, points: 162, plis: 8, derPreneurs: true, belote: true, mult: 4, scores: [0, 0] });
  eq(g.dernierResultat.gains, [1080, 0], "270 surcoinché, huit plis avec belote : 1 080");
  eq(g.phase, "SCORE", "résultat affiché");
  eq(actOn(g, 0, { type: "JOUER", carte: card("AS") }, rng(1)), "HORS_PHASE", "rien ne se joue pendant le résultat");
  eq(g.scores, [1080, 0], "score traité une seule fois");
  eq(actOn(g, null, { type: "TIMEOUT", tour: g.tour }, rng(1)), undefined, "fin du résultat");
  eq(g.phase, "TERMINEE", `victoire à ${WIN_SCORE} points ou plus`);
}
{
  // Belote sous 81 points de plis : non comptée pour le seuil.
  const r = score({ montant: 100, points: 80, belote: true }).dernierResultat;
  eq([r.belote, r.beloteBonus], [true, 0], "belote sous 81 : non comptée");
}
{
  // Rebelote sur le dernier pli : annoncée avant la résolution, le score en tient compte.
  const g = score({ montant: 100, points: 81, belote: true, rebeloteDernier: true });
  ok(g.belote.rebeloteDeclared, "rebelote annoncée sur le dernier pli");
  eq(g.dernierResultat.gains, [100, 0], "et comptée pour le contrat");
}
{
  // Sous 1 010, la partie continue avec le donneur suivant.
  const g = score({ montant: 100, points: 100, scores: [500, 500] });
  const donneur = g.donneur;
  actOn(g, null, { type: "TIMEOUT", tour: g.tour }, rng(1));
  ok(g.phase === "ENCHERES" && g.donneur !== donneur, "sous 1 010 : nouvelle donne, donneur suivant");
}

console.log(`Cas de validation des règles : ${n} vérifications passées.`);
