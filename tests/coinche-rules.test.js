// Règles SCEPI ajoutées au moteur : Générale et bonus de belote.
//   node tests/coinche-rules.test.js
import assert from "assert";
import {
  ALLOWED_BIDS,
  GENERALE,
  actOn,
  bidType,
  contractValue,
  contratReussi,
  createGame,
} from "../src/coinche/engine.js";
import { rng } from "./coinche-sim.js";

// Générale : l'enchère la plus haute, vaut un capot.
assert.strictEqual(Math.max(...ALLOWED_BIDS), GENERALE);
assert.strictEqual(bidType(GENERALE), "GENERALE");
assert.strictEqual(contractValue({ type: "GENERALE", montant: GENERALE }), 250);

// Réussie seulement si le preneur fait les huit plis lui-même.
const gen = { type: "GENERALE", montant: GENERALE, preneur: 2, equipePreneur: 0 };
assert.ok(contratReussi(gen, [162, 0], [8, 0], false, [0, 0, 8, 0]));
assert.ok(!contratReussi(gen, [162, 0], [8, 0], false, [1, 0, 7, 0]), "un pli du partenaire la fait chuter");
assert.ok(!contratReussi(gen, [150, 12], [7, 1], false, [0, 1, 7, 0]));

// En jeu : annoncée, elle se verrouille et le preneur entame.
const humans = [0, 1, 2, 3].map((s) => ({ type: "human", name: `J${s}` }));
const r = rng(4);
const G = createGame(humans, r);
const taker = G.joueurActif;
assert.strictEqual(actOn(G, taker, { type: "ENCHERIR", montant: GENERALE, atout: "H" }, r), undefined);
const next = G.joueurActif;
assert.strictEqual(
  actOn(G, next, { type: "ENCHERIR", montant: 270, atout: "S" }, r),
  "ENCHERE_INVALIDE",
  "rien au-dessus d'une Générale",
);
for (let i = 0; i < 3; i++) assert.strictEqual(actOn(G, G.joueurActif, { type: "PASSER" }, r), undefined);
assert.strictEqual(G.phase, "JEU");
assert.ok(G.contract.generale);
assert.strictEqual(G.joueurActif, taker, "le preneur d'une Générale prend la main");

// Belote du preneur : +20 au score dès 81 points de plis, même si le
// contrat chute ; rien en dessous de 81 ; déjà comprise dans 270.
function scoreWith({ montant, pointsPreneurs, belote }) {
  const g = createGame(humans, rng(9));
  g.contract = {
    id: 1, type: bidType(montant), montant, atout: "H", preneur: 0, equipePreneur: 0,
    coinche: false, surcoinche: false,
  };
  g.belote = { holder: 0, kingPlayed: belote, queenPlayed: belote, beloteDeclared: belote, rebeloteDeclared: belote };
  g.pointsPlis = [pointsPreneurs, 162 - pointsPreneurs];
  g.plisGagnes = [4, 4];
  g.plisSiege = [2, 2, 2, 2];
  g.phase = "JEU";
  g.plisJoues = 7;
  // Dernier pli joué par le moteur : le score se calcule à sa résolution.
  g.hands = [[{ id: "7C", suit: "C", rank: "7" }], [{ id: "8C", suit: "C", rank: "8" }], [{ id: "9C", suit: "C", rank: "9" }], [{ id: "JC", suit: "C", rank: "J" }]];
  g.pliCourant = [];
  g.joueurActif = 0;
  for (const s of [0, 1, 2, 3]) {
    g.joueurActif = s;
    assert.strictEqual(actOn(g, s, { type: "JOUER", carte: g.hands[s][0] }, rng(1)), undefined);
  }
  return g.dernierResultat;
}
// 100 avec belote, 90 points avant le dernier pli : réussi, 100 + 20.
let res = scoreWith({ montant: 100, pointsPreneurs: 90, belote: true });
assert.ok(res.reussi);
assert.strictEqual(res.beloteBonus, 20);
assert.strictEqual(res.gains[0], 120);
// 140 avec belote, 90 points : chuté, mais la belote (≥ 81) reste au preneur.
res = scoreWith({ montant: 140, pointsPreneurs: 90, belote: true });
assert.ok(!res.reussi);
assert.deepStrictEqual(res.gains, [20, 160]);
// Moins de 81 points : belote non comptée.
res = scoreWith({ montant: 80, pointsPreneurs: 60, belote: true });
assert.strictEqual(res.beloteBonus, 0);

console.log("Règles : Générale (rang, valeur, main, huit plis seul) et belote (+20 dès 81) vérifiées.");
