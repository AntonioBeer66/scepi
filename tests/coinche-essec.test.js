// Salon des règles de l'ESSEC (engine.js, ESSEC) : Tout Atout et Sans
// Atout, Générale à 500 sans Générale belotée, parole et misère ; puis des
// donnes entières, un humain qui joue au hasard face à trois bots.
//   node tests/coinche-essec.test.js
import assert from "assert";
import {
  ESSEC,
  GENERALE,
  GENERALE_BELOTE,
  actOn,
  bots,
  computeLegal,
  createGame,
  trickWinnerSeat,
  tuning,
} from "../src/coinche/engine.js";
import { Coinche } from "../src/coinche/game.js";
import { MISERE_WINDOW_MS, createHost } from "../src/coinche/host.js";
import { rng } from "./coinche-sim.js";

const card = (id) => ({ id, rank: id.slice(0, -1), suit: id.slice(-1) });
const ids = (cards) => cards.map((c) => c.id).sort().join(" ");
const pli = (...plays) => plays.map(([siege, id]) => ({ siege, carte: card(id) }));
let n = 0;
const eq = (got, want, label) => {
  assert.deepStrictEqual(got, want, label);
  n++;
};

// ---- Jeu de la carte ----
const legal = (atout, main, plays) => ids(computeLegal(main.map(card), pli(...plays), atout, 0));
eq(legal("TA", ["7S", "JS", "AC"], [[1, "9S"]]), "JS", "Tout Atout : monter dans la couleur demandée");
eq(legal("TA", ["7S", "8S", "AC"], [[1, "9S"]]), "7S 8S", "Tout Atout : sinon fournir");
eq(legal("TA", ["7S", "JS"], [[1, "9S"], [2, "AS"]]), "JS", "Tout Atout : monter même sur son partenaire");
eq(legal("TA", ["JC", "AD"], [[1, "9S"]]), "AD JC", "Tout Atout : couleur absente, tout");
eq(legal("SA", ["7S", "AS", "JC"], [[1, "KS"]]), "7S AS", "Sans Atout : fournir, sans obligation de monter");
eq(legal("SA", ["JC", "AD"], [[1, "9S"]]), "AD JC", "Sans Atout : couleur absente, tout");
eq(trickWinnerSeat(pli([1, "9S"], [2, "JC"], [3, "AS"], [0, "7S"]), "TA"), 1, "Tout Atout : le 9 bat l'As, le Valet d'une autre couleur ne prend pas");
eq(trickWinnerSeat(pli([1, "JS"], [2, "AC"], [3, "10S"], [0, "7S"]), "SA"), 3, "Sans Atout : le 10 bat le Valet");

// ---- Enchères ----
const humans = [0, 1, 2, 3].map((s) => ({ type: "human", name: `J${s}` }));
// Le siège 0 a tous les cœurs, le 1 une main vide (0 point), le 2 des
// piques et carreaux, le 3 le reste. Le siège 0 parle le premier.
const MAINS = [
  "JH 9H AH 10H KH QH 8H 7H",
  "7S 8S 9S 7D 8D 9D 7C 8C",
  "AS 10S KS QS JS AD 10D KD",
  "QD JD 9C 10C JC QC KC AC",
].map((m) => m.split(" ").map(card));
function table(regles = ESSEC, seed = 3) {
  const r = rng(seed);
  const g = createGame(humans, r, () => MAINS.map((h) => h.slice()), regles);
  g.donneur = 3;
  g.joueurActif = 0;
  return { g, act: (seat, a) => actOn(g, seat, a, r, () => MAINS.map((h) => h.slice())) };
}
const PASS = { type: "PASSER" };
const passes = (act, ...seats) => seats.forEach((s) => eq(act(s, PASS), undefined, `passe ${s}`));
{
  const { act } = table(null);
  eq(act(0, { type: "ENCHERIR", montant: 80, atout: "SA" }), "ENCHERE_INVALIDE", "hors salon ESSEC : pas de Sans Atout");
  eq(act(0, { type: "PAROLE" }), "HORS_PHASE", "hors salon ESSEC : pas de parole");
}
{
  const { g, act } = table();
  eq(act(0, { type: "ENCHERIR", montant: GENERALE_BELOTE, atout: "H" }), "ENCHERE_INVALIDE", "pas de Générale belotée");
  eq(act(0, { type: "ENCHERIR", montant: 80, atout: "TA" }), undefined, "80 Tout Atout");
  eq(act(1, { type: "ENCHERIR", montant: 80, atout: "SA" }), "ENCHERE_INVALIDE", "80 Sans Atout sur 80 Tout Atout : refus");
  eq(act(1, { type: "ENCHERIR", montant: 90, atout: "SA" }), undefined, "90 Sans Atout");
  passes(act, 2, 3, 0);
  eq([g.phase, g.contract.atout, g.belote.holder], ["JEU", "SA", null], "Sans Atout joué, sans belote");
}

// ---- Générale à 500 ----
{
  const { g, act } = table();
  eq(act(0, { type: "ENCHERIR", montant: GENERALE, atout: "H" }), undefined, "Générale à cœur");
  passes(act, 1, 2, 3);
  while (g.phase === "JEU") {
    const s = g.joueurActif;
    act(s, { type: "JOUER", carte: computeLegal(g.hands[s], g.pliCourant, "H", s)[0] });
  }
  eq(g.scores, [500, 0], "Générale réussie : 500");
}

// ---- Parole ----
{
  const { g, act } = table();
  eq(act(0, { type: "PAROLE" }), undefined, "le premier à parler dit parole");
  eq(act(1, { type: "PAROLE" }), "PAROLE_INTERDITE", "le deuxième ne peut pas");
  passes(act, 1, 2, 3);
  eq([g.phase, g.joueurActif], ["ENCHERES", 0], "trois passes derrière la parole : pas de redistribution");
  eq(act(0, PASS), "PAROLE_OBLIGE", "parole : obligé d'annoncer");
  eq(act(null, { type: "TIMEOUT", tour: g.tour }), undefined, "délai écoulé");
  eq([g.contract.preneur, g.contract.montant, g.contract.atout], [0, 80, "H"], "annonce imposée : 80 dans sa couleur");
}
{
  const { g, act } = table();
  act(0, { type: "PAROLE" });
  eq(act(1, { type: "ENCHERIR", montant: 80, atout: "S" }), undefined, "un autre annonce");
  passes(act, 2, 3, 0);
  eq(g.phase, "JEU", "parole libérée : elle peut passer");
}

// ---- Misère ----
function contrat(atout) {
  const t = table();
  t.act(0, { type: "ENCHERIR", montant: 80, atout });
  passes(t.act, 1, 2, 3);
  return t;
}
{
  const { g, act } = contrat("H");
  eq(act(2, { type: "MISERE" }), "MISERE_INTERDITE", "55 points en main : pas de misère");
  const donneur = g.donneur;
  eq(act(1, { type: "MISERE" }), undefined, "0 point en main : misère");
  eq([g.phase, g.misere, g.donneur, g.scores], ["ENCHERES", 1, (donneur + 1) % 4, [0, 0]], "donne annulée, sans score");
}
{
  // Au barème Tout Atout, Valet et 9 de carreau valent 23 : plus de misère.
  const { act } = contrat("TA");
  eq(act(3, { type: "MISERE" }), "MISERE_INTERDITE", "barème du contrat");
}
{
  // Avant la première carte de la donne, pas après : même pour qui n'a pas joué.
  const { g, act } = contrat("H");
  act(0, { type: "JOUER", carte: card("JH") });
  eq(act(1, { type: "MISERE" }), "MISERE_INTERDITE", "une carte est tombée : trop tard, même sans avoir joué");
  act(1, { type: "JOUER", carte: g.hands[1][0] });
  eq(act(1, { type: "MISERE" }), "MISERE_INTERDITE", "après sa première carte : trop tard");
}

// L'hôte : les bots disent leur misère avant l'entame (jamais en plein pli) et
// un bot qui entame laisse le temps à un humain d'en dire une.
function hote(types, atout = "SA") {
  const r = rng(11);
  const g = createGame(types.map((type) => ({ type, name: "X" })), r, () => MAINS.map((h) => h.slice()), ESSEC);
  g.donneur = 3;
  g.joueurActif = 0;
  actOn(g, 0, { type: "ENCHERIR", montant: 80, atout }, r);
  passes((s, a) => actOn(g, s, a, r), 1, 2, 3);
  const out = [];
  const queue = [];
  let now = 0;
  const host = createHost({
    timers: { setTimeout: (fn, ms) => queue.push({ at: now + ms, fn }), clearTimeout() {} },
    random: r,
    send(seat, action) {
      out.push({ type: action.type, seat, cartes: g.plisJoues * 4 + g.pliCourant.length, at: now });
      actOn(g, seat, action, r);
      host.update(g);
    },
  });
  host.update(g);
  while (queue.length && !out.some((o) => o.type !== "TIMEOUT")) {
    queue.sort((a, b) => a.at - b.at);
    const t = queue.shift();
    now = t.at;
    t.fn();
  }
  return out[0];
}
{
  const bot = hote(["bot", "bot", "bot", "bot"]);
  eq([bot.type, bot.seat, bot.cartes], ["MISERE", 1, 0], "bot en défense sans point : misère avant l'entame");
  const attendu = hote(["bot", "human", "bot", "bot"]);
  eq([attendu.type, attendu.seat, attendu.at >= MISERE_WINDOW_MS], ["JOUER", 0, true], "humain sans point : le bot attend avant d'entamer");
  const fort = hote(["bot", "bot", "human", "bot"]);
  eq([fort.type, fort.seat, fort.at < MISERE_WINDOW_MS], ["MISERE", 1, true], "humain à la main trop forte : pas d'attente");
}

// ---- Table boardgame.io : les règles du salon passent à la partie ----
{
  const G0 = Coinche.setup({}, { table: 5, regles: ESSEC });
  const G1 = Coinche.moves.lancer.move({ G: G0, playerID: "0", random: { Number: rng(9) } }, humans);
  eq(G1.regles, ESSEC, "salon ESSEC lancé avec ses règles");
  eq(Coinche.moves.agir.move({ G: G1, playerID: String(G1.joueurActif), random: { Number: rng(9) } }, { type: "PAROLE" }), undefined, "parole acceptée en ligne");
  eq(Coinche.setup({}, { table: 1 }).regles, undefined, "autres salons : règles V1");
}

// ---- Donnes entières contre les bots ----
// Le siège 0 joue au hasard (Tout Atout et Sans Atout compris, parole,
// misère) ; les bots ne doivent jamais proposer de coup refusé.
tuning.mcSamples = 0;
tuning.bidWorlds = 4;
tuning.bidSamples = 4;
// Les bots annoncent Tout Atout par simulation (voir simBid).
{
  const mains = [
    "JH JD JC JS 9H 9D 9C 9S",
    "7S 8S 7D 8D 7C 8C 7H 8H",
    "AS 10S KS QS AD 10D KD QD",
    "AH 10H KH QH AC 10C KC QC",
  ].map((m) => m.split(" ").map(card));
  const robots = [0, 1, 2, 3].map(() => ({ type: "bot", name: "B" }));
  const g = createGame(robots, rng(5), () => mains.map((h) => h.slice()), ESSEC);
  g.donneur = 3;
  g.joueurActif = 0;
  const a = bots.decideBid(g, 0);
  eq([a.type, a.atout], ["ENCHERIR", "TA"], "quatre Valets et quatre 9 : Tout Atout");
}
const seats = [{ type: "human", name: "H" }, ...[1, 2, 3].map(() => ({ type: "bot", name: "B" }))];
let donnes = 0;
const vus = { TA: 0, SA: 0, misere: 0 };
for (let seed = 1; seed <= 40; seed++) {
  const r = rng(seed);
  const h = rng(seed + 1000);
  const pick = (list) => list[Math.floor(h() * list.length)];
  const g = createGame(seats, r, null, ESSEC);
  for (let step = 0; step < 400 && g.phase !== "TERMINEE"; step++) {
    const s = g.joueurActif;
    let a;
    if (g.phase === "SCORE") {
      eq(g.dernierResultat.points[0] + g.dernierResultat.points[1], 162, "162 points par donne");
      donnes++;
      if (g.dernierResultat.atout in vus) vus[g.dernierResultat.atout]++;
      a = { type: "TIMEOUT", tour: g.tour };
    } else if (g.phase === "SURCOINCHE") a = { type: "TIMEOUT", tour: g.tour };
    else if (s !== 0) {
      if (g.phase === "ENCHERES" && g.contract && g.contract.equipePreneur === 0 && bots.wantsToCoinche(g, s))
        a = { type: "COINCHER" };
      else a = bots.turnAction(g, s);
    } else if (g.phase === "ENCHERES") {
      const min = g.contract?.montant ?? 0;
      a = pick([
        PASS,
        PASS,
        { type: "PAROLE" },
        { type: "ENCHERIR", montant: min < 160 ? Math.max(80, min + 10) : 250, atout: pick(["TA", "SA", "H", "S"]) },
      ]);
    } else {
      a = h() < 0.1
        ? { type: "MISERE" }
        : { type: "JOUER", carte: pick(computeLegal(g.hands[0], g.pliCourant, g.contract.atout, 0)) };
    }
    const err = actOn(g, s, a, r);
    if (!err && a.type === "MISERE") vus.misere++;
    if (s !== 0 || a.type === "TIMEOUT") eq(err, undefined, `seed ${seed} : ${a.type} accepté`);
    else if (err) actOn(g, 0, { type: "TIMEOUT", tour: g.tour }, r);
  }
}
eq(donnes > 100 && vus.TA > 0 && vus.SA > 0 && vus.misere > 0, true, `assez de donnes jouées : ${JSON.stringify(vus)}`);

console.log(`coinche ESSEC : ${n} vérifications OK (${donnes} donnes contre les bots, ${JSON.stringify(vus)})`);
