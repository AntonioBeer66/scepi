// Belote et rebelote, tous les cas, donnes imposées jouées jusqu'au bout :
// une fois par le moteur, une fois par les coups boardgame.io (game.js, le
// chemin des parties en ligne). Règle : Roi et Dame d'atout dans la main
// d'un joueur de l'équipe preneuse (preneur OU partenaire, y compris quand
// le partenaire a remonté l'enchère) → Belote puis Rebelote, +20 au
// décompte de la donne s'ils font au moins 81 points de plis.
//   node tests/coinche-belote.test.js
import assert from "assert";
import { BELOTE_BONUS, actOn, computeLegal, createGame } from "../src/coinche/engine.js";
import { Coinche } from "../src/coinche/game.js";
import { rng } from "./coinche-sim.js";

const card = (id) => ({ id, rank: id.slice(0, -1), suit: id.slice(-1) });
const hand = (s) => s.split(" ").map(card);
// Atout cœur ; Roi et Dame de cœur chez le siège 0.
const BASE = [
  "KH QH AH 10H AS AD AC 7C",
  "JH 9H 7S 8S 7D 8D 8C 9C",
  "8H 7H 10S KS 10D KD 10C KC",
  "QS JS 9S QD JD 9D QC JC",
];
const humans = [0, 1, 2, 3].map((s) => ({ type: "human", name: `J${s}` }));

// Deux chemins pour la même action : le moteur, ou les coups boardgame.io.
const VIAS = {
  moteur: (g, seat, a, r) => actOn(g, seat, a, r),
  "en ligne": (g, seat, a, r) => {
    const ctx = { G: g, playerID: String(a.type === "TIMEOUT" ? g.hote : seat), random: { Number: r } };
    const res =
      a.type === "TIMEOUT"
        ? Coinche.moves.pourSiege.move(ctx, null, a)
        : Coinche.moves.agir.move(ctx, a.type === "JOUER" ? { type: "JOUER", carte: { id: a.carte.id } } : a);
    return res === "INVALID_MOVE" ? res : undefined;
  },
};

// mains : 4 chaînes ; encheres : "80H", "P", ou [siège, "COINCHER"|"SURCOINCHER"]
// (le siège 0 parle en premier) ; ordre[siège] : cartes à jouer en priorité,
// sinon l'ordre de la main ; timeout : sièges dont les cartes partent au délai.
function donne(via, { mains = BASE, encheres, ordre = {}, timeout = [] }) {
  const r = rng(7);
  const g = createGame(humans, r, () => mains.map(hand));
  g.hote = 0;
  g.donneur = 3;
  g.joueurActif = 0;
  const act = (seat, a) => assert.strictEqual(VIAS[via](g, seat, a, r), undefined, `${JSON.stringify(a)} refusé`);
  for (const e of encheres) {
    if (Array.isArray(e)) act(e[0], { type: e[1] });
    else if (e === "P") act(g.joueurActif, { type: "PASSER" });
    else act(g.joueurActif, { type: "ENCHERIR", montant: parseInt(e), atout: e.slice(-1) });
  }
  assert.strictEqual(g.phase, "JEU", "contrat verrouillé");
  const annonces = [];
  const views = [];
  while (g.phase === "JEU") {
    const s = g.joueurActif;
    const before = { ...g.belote };
    if (timeout.includes(s)) act(null, { type: "TIMEOUT", tour: g.tour });
    else {
      const legal = computeLegal(g.hands[s], g.pliCourant, g.contract.atout, s);
      const pref = (ordre[s] || "").split(" ").map((id) => legal.find((c) => c.id === id)).find(Boolean);
      act(s, { type: "JOUER", carte: pref || legal[0] });
    }
    const joue = g.phase === "JEU" && g.pliCourant.length ? g.pliCourant.at(-1).carte.id : g.lastTrick.cards.find((e) => e.siege === s).carte.id;
    if (g.belote.beloteDeclared && !before.beloteDeclared) annonces.push(`Belote ${s} ${joue}`);
    if (g.belote.rebeloteDeclared && !before.rebeloteDeclared) annonces.push(`Rebelote ${s} ${joue}`);
    views.push(Coinche.playerView({ G: g, playerID: "1" }).belote.holder);
  }
  return { g, r: g.dernierResultat, annonces, views };
}

let n = 0;
function cas(label, opts, want) {
  for (const via of Object.keys(VIAS)) {
    const { g, r, annonces, views } = donne(via, opts);
    const where = `${label} (${via})`;
    const pre = g.contract.equipePreneur;
    assert.strictEqual(g.contract.preneur, want.preneur, `${where} : preneur`);
    if (want.annonces) assert.deepStrictEqual(annonces, want.annonces, `${where} : annonces`);
    assert.strictEqual(r.belote, want.belote, `${where} : belote valide`);
    assert.strictEqual(g.belote.holder, want.belote ? want.holder : null, `${where} : détenteur`);
    // Décompte : +20 aux preneurs dès 81 points de plis, jamais au score ;
    // déjà compris dans le capot beloté.
    const bonus = want.belote && g.contract.montant !== 270 && r.points[pre] >= 81 ? BELOTE_BONUS : 0;
    assert.strictEqual(r.beloteBonus, bonus, `${where} : bonus`);
    if (want.reussi !== undefined) assert.strictEqual(r.reussi, want.reussi, `${where} : réussite (${r.points[pre]} points)`);
    if (want.points !== undefined) assert.strictEqual(r.points[pre], want.points, `${where} : points des preneurs`);
    // En ligne, la belote reste secrète jusqu'à l'annonce : un adversaire
    // ne voit le détenteur qu'une fois la belote dite.
    const firstSeen = views.findIndex((h) => h !== null);
    if (want.belote) assert.ok(firstSeen >= 0 && views.slice(firstSeen).every((h) => h === want.holder), `${where} : détenteur révélé à l'annonce`);
    else assert.ok(views.every((h) => h === null), `${where} : rien de révélé`);
    n++;
  }
}

const P3 = ["P", "P", "P"];
// Preneur : Roi puis Dame (le Roi part au premier tour d'atout).
cas("preneur, Roi puis Dame", { encheres: ["100H", ...P3], ordre: { 0: "KH QH" } },
  { preneur: 0, holder: 0, belote: true, annonces: ["Belote 0 KH", "Rebelote 0 QH"] });
// Preneur : Dame puis Roi.
cas("preneur, Dame puis Roi", { encheres: ["100H", ...P3], ordre: { 0: "QH KH" } },
  { preneur: 0, holder: 0, belote: true, annonces: ["Belote 0 QH", "Rebelote 0 KH"] });
// Le partenaire remonte l'ouverture du détenteur : 80 → 100, la belote
// reste à l'équipe.
cas("partenaire qui remonte", { encheres: ["80H", "P", "100H", ...P3], ordre: { 0: "KH QH" } },
  { preneur: 2, holder: 0, belote: true, annonces: ["Belote 0 KH", "Rebelote 0 QH"] });
// Le détenteur n'a jamais parlé : son partenaire prend seul.
cas("partenaire du preneur, muet", { mains: [BASE[2], BASE[1], BASE[0], BASE[3]], encheres: ["80H", ...P3], ordre: { 2: "QH KH" } },
  { preneur: 0, holder: 2, belote: true, annonces: ["Belote 2 QH", "Rebelote 2 KH"] });
// Le détenteur remonte au-dessus de l'adversaire (80, 90♠, 100♥).
cas("détenteur qui remonte sur l'adversaire", { encheres: ["80H", "90S", "P", "P", "100H", ...P3] },
  { preneur: 0, holder: 0, belote: true });
// Le partenaire remonte encore par-dessus le détenteur qui avait remonté.
cas("remontées croisées", { encheres: ["80H", "P", "90H", "P", "100H", "P", "110H", ...P3] },
  { preneur: 2, holder: 0, belote: true });
// La défense tient Roi et Dame d'atout : rien.
cas("belote en défense", { mains: [BASE[1], BASE[0], BASE[3], BASE[2]], encheres: ["80H", ...P3] },
  { preneur: 0, belote: false, annonces: [] });
// Roi chez le preneur, Dame chez le partenaire : pas une belote.
cas("Roi et Dame séparés", {
  mains: ["KH JH AH 10H AS AD AC 7C", "QH 9H 7S 8S 7D 8D 8C 9C", "8H 7H 10S KS 10D KD 10C KC", "QS JS 9S QD JD 9D QC JC"],
  encheres: ["100H", ...P3],
}, { preneur: 0, belote: false, annonces: [] });
// Le détenteur change d'atout : Roi et Dame de cœur ne valent rien à pique.
cas("atout changé", { encheres: ["80H", "90C", "P", "P", "100S", ...P3] },
  { preneur: 0, belote: false, annonces: [] });
// Coinchée puis surcoinchée : la belote compte toujours.
cas("coinche et surcoinche", { encheres: ["100H", [1, "COINCHER"], [2, "SURCOINCHER"]] },
  { preneur: 0, holder: 0, belote: true });
// Rebelote sur le dernier pli : annoncée avant la résolution, comptée.
cas("rebelote au dernier pli", { encheres: ["100H", ...P3], ordre: { 0: "KH AH 10H AS AD AC 7C QH" } },
  { preneur: 0, holder: 0, belote: true });
// Cartes jouées d'office au délai : l'annonce reste automatique.
cas("cartes jouées au délai", { encheres: ["80H", "P", "100H", ...P3], timeout: [0] },
  { preneur: 2, holder: 0, belote: true });
// Capot beloté annoncé par le partenaire du détenteur : réussi avec la
// belote du détenteur ; le même capot sans belote (Dame chez la défense) chute.
const CAPOT = ["JH 9H AH KH QH AS AD AC", "7S 8S 9S 7D 8D 9D 7C 8C", "10H 8H 7H 10S KS 10D KD 10C", "QS JS QD JD 9C JC QC KC"];
cas("270 du partenaire", { mains: CAPOT, encheres: ["80H", "P", "270H", ...P3] },
  { preneur: 2, holder: 0, belote: true, reussi: true, points: 162 });
cas("270 sans belote", {
  mains: ["JH 9H AH KH 7H AS AD AC", "7S 8S 9S 7D 8D 9D 7C 8C", "10H 8H QC 10S KS 10D KD 10C", "QS JS QD JD 9C JC QH KC"],
  encheres: ["80H", "P", "270H", ...P3],
}, { preneur: 2, belote: false, reussi: false });

// Le cas du bug : 80 remonté à 130 par le partenaire, 116 points de plis.
// 116 + 20 de belote ≥ 130 : réussi ; à 140 (seuil 120) : chuté.
cas("le bug : 130 remonté", { encheres: ["80H", "P", "130H", ...P3] },
  { preneur: 2, holder: 0, belote: true, points: 116, reussi: true });
cas("140 remonté, 116 points", { encheres: ["80H", "P", "140H", ...P3] },
  { preneur: 2, holder: 0, belote: true, points: 116, reussi: false });

console.log(`Belote et rebelote : ${n} cas vérifiés (moteur et coups en ligne).`);
