// L'hôte et le moteur face aux sièges qui changent de main et aux parties
// en ligne : minuteurs factices (horloge virtuelle), bots remplacés par des
// décisions fixes pour ne tester que le mécanisme.
//   - HAS-1 / ZON-1 : un siège repris par l'ordinateur en plein tour joue.
//   - ZON-2 : un siège repris après une annonce peut encore coincher.
//   - COI-4 / COI-5 / HAS-6 : un bot coinche à son tour de parole, jamais
//     après avoir passé, jamais après la clôture, jamais avant la fenêtre
//     laissée à un humain ni avant son partenaire humain.
//   - HAS-4 : une carte forcée part vite, un vrai choix prend plus de temps.
//   - ZON-3 / ZON-4 : carte et passe jouées d'office ne disent rien.
//   - MON-4 : on relit un joueur selon ce qu'il était quand il a parlé.
//   - HAS-7 : les clients ne reçoivent ni personnalités ni mémoire des bots.
//   node tests/coinche-hote-bots.test.js
import assert from "assert";
import { actOn, bots, createGame } from "../src/coinche/engine.js";
import { Coinche } from "../src/coinche/game.js";
import { createHost, thinkMs } from "../src/coinche/host.js";
import { rng } from "./coinche-sim.js";

const card = (id) => ({ id, rank: id.slice(0, -1), suit: id.slice(-1) });
const seatsOf = (...types) => types.map((type) => ({ type, name: type }));
let n = 0;
const ok = (cond, label) => {
  assert.ok(cond, label);
  n++;
};

// Table à horloge virtuelle. Le siège 0 (bot) ouvre à 100 ♠ ; les autres
// bots passent, sauf ceux de `coinchent`, qui coinchent si on le leur demande.
// humains : [[ms, siège, action]] coups des humains. Rend { G, log, host,
// schedule(ms, fn), run(ms) } ; log : chaque action envoyée, avec son instant.
function table({ types, coinchent = [], seed = 1, random = rng(seed + 100), first = 0, humains = [] }) {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  const log = [];
  const clock = {
    setTimeout: (fn, ms = 0) => (timers.set(++seq, { id: seq, at: now + ms, fn }), seq),
    clearTimeout: (id) => timers.delete(id),
  };
  const G = createGame(seatsOf(...types), rng(seed));
  G.hote = 0;
  G.donneur = (first + 3) % 4;
  G.joueurActif = first;
  const deal = rng(seed + 200);
  function apply(seat, action) {
    const error = actOn(G, seat, action, deal);
    log.push({ at: now, seat, type: action.type, error });
    if (!error) host.update(G);
  }
  const decide = {
    turnAction: (g, s) =>
      g.contract ? { type: "PASSER" } : s === first ? { type: "ENCHERIR", montant: 100, atout: "S" } : { type: "PASSER" },
    wantsToCoinche: (g, s) => coinchent.includes(s),
    wantsToSurcoinche: () => false,
  };
  const host = createHost({ timers: clock, random, decide, send: apply });
  for (const [ms, seat, action] of humains) clock.setTimeout(() => apply(seat, action), ms);
  host.update(G);
  return {
    G,
    log,
    host,
    at: () => now,
    schedule: (ms, fn) => clock.setTimeout(fn, ms),
    run(until) {
      for (;;) {
        let next = null;
        for (const t of timers.values()) if (!next || t.at < next.at) next = t;
        if (!next || next.at > until) return;
        timers.delete(next.id);
        now = next.at;
        next.fn();
      }
    },
  };
}
const sent = (t) => t.log.filter((e) => !e.error);
const bid = (t) => sent(t).find((e) => e.type === "ENCHERIR");

// ---- HAS-1 / ZON-1 : le siège repris en plein tour joue --------------------
// Siège 1 humain à parler (tour N), repris par l'ordinateur 0,3 s plus tard
// (devenirBot ne change pas G.tour) : il ouvre à 100 ♠ en moins de 3 s.
// Avant : aucun minuteur, TIMEOUT (passe) à 20 s.
{
  const t = table({ types: ["human", "human", "bot", "bot"], first: 1 });
  const tour = t.G.tour;
  t.schedule(300, () => {
    Coinche.moves.devenirBot.move({ G: t.G, playerID: "0" }, 1);
    t.host.update(t.G);
  });
  t.run(19000);
  const e = sent(t).find((x) => x.seat === 1);
  ok(e && e.at < 3000, "HAS-1 : le siège repris décide aussitôt (pas à l'expiration)");
  ok(!t.log.some((x) => x.type === "TIMEOUT"), "HAS-1 : aucun TIMEOUT nécessaire");
  ok(t.G.tour > tour, "HAS-1 : la partie a avancé");
}
// Un même état notifié deux fois ne programme pas deux décisions.
{
  const t = table({ types: ["bot", "bot", "bot", "bot"] });
  const before = sent(t).length;
  t.host.update(t.G);
  t.host.update(t.G);
  t.run(1e5);
  ok(sent(t).filter((x) => x.seat === 0 && x.type === "ENCHERIR").length === 1, "une seule enchère du siège 0");
  ok(before === 0, "rien n'est parti avant le premier minuteur");
}

// ---- ZON-2 : siège repris après l'annonce, il peut coincher ----------------
// Siège 0 (humain) annonce, siège 1 (humain, défenseur) est repris 0,6 s plus
// tard : à son tour il coinche. Avant : ni coinche, ni parole avant TIMEOUT.
{
  const t = table({
    types: ["human", "human", "bot", "bot"],
    coinchent: [1],
    humains: [[100, 0, { type: "ENCHERIR", montant: 100, atout: "S" }]],
  });
  t.schedule(700, () => {
    Coinche.moves.devenirBot.move({ G: t.G, playerID: "0" }, 1);
    t.host.update(t.G);
  });
  t.run(19000);
  const c = sent(t).find((x) => x.type === "COINCHER");
  ok(c && c.seat === 1 && c.at < 5000, "ZON-2 : le siège repris coinche");
  ok(t.G.contract.coincheur === 1, "ZON-2 : la coinche est enregistrée");
}

// ---- COI-4 / COI-5 : coinche à son tour, jamais « passe puis coinche » -------
// 40 graines de hasard pour les délais. Siège 1 veut coincher (il parle juste
// après l'annonce) ; siège 3 veut coincher (il parle en dernier, juste avant
// la clôture des enchères).
{
  const pbs = { passeEtCoinche: [], perdue: [] };
  for (const seat of [1, 3])
    for (let seed = 1; seed <= 40; seed++) {
      const t = table({ types: ["bot", "bot", "bot", "bot"], coinchent: [seat], seed });
      t.run(30000);
      const c = sent(t).find((x) => x.type === "COINCHER");
      if (!c) pbs.perdue.push(`${seat}/${seed}`);
      else if (sent(t).some((x) => x.seat === seat && x.type === "PASSER" && x.at < c.at))
        pbs.passeEtCoinche.push(`${seat}/${seed}`);
    }
  assert.ok(
    !pbs.perdue.length && !pbs.passeEtCoinche.length,
    `COI-5 : coinche perdue (siège/graine) [${pbs.perdue}] ; COI-4 : passe puis coinche [${pbs.passeEtCoinche}]`,
  );
  n++;
}

// ---- COI-5 (2) : pas de coinche avant que le partenaire humain ait parlé ------
// Siège 1 humain à parler après l'annonce (il passe à 5 s) ; le bot du siège 3,
// son partenaire, veut coincher. Avant : coinche vers 1 s, le partenaire n'a
// plus la parole.
{
  const bad = [];
  for (let seed = 1; seed <= 20; seed++) {
    const t = table({
      types: ["bot", "human", "bot", "bot"],
      coinchent: [3],
      seed,
      humains: [[5000, 1, { type: "PASSER" }]],
    });
    t.run(30000);
    const c = sent(t).find((x) => x.type === "COINCHER");
    const humain = sent(t).find((x) => x.seat === 1);
    if (!c || c.seat !== 3 || !humain || c.at < humain.at) bad.push(seed);
  }
  assert.deepStrictEqual(bad, [], `COI-5 : le bot coinche avant son partenaire humain (graines ${bad})`);
  n++;
}

// ---- HAS-6 : fenêtre laissée à un humain en défense -----------------------------
// Le bot du siège 1 veut coincher, le siège 3 est humain et ne dit rien : la
// coinche attend au moins COINCHE_WINDOW_MS (1,8 s) après l'annonce.
{
  const bad = [];
  for (let seed = 1; seed <= 20; seed++) {
    const t = table({ types: ["bot", "bot", "bot", "human"], coinchent: [1], seed });
    t.run(30000);
    const c = sent(t).find((x) => x.type === "COINCHER");
    if (!c || c.at - bid(t).at < 1800) bad.push(seed);
  }
  assert.deepStrictEqual(bad, [], `HAS-6 : coinche avant la fenêtre de l'humain (graines ${bad})`);
  n++;
}

// ---- HAS-4 : délai selon la difficulté ---------------------------------------
{
  const G = createGame(seatsOf("bot", "bot", "bot", "bot"), rng(3));
  G.phase = "JEU";
  G.contract = { id: 1, type: "NUMERIQUE", montant: 80, atout: "H", preneur: 0, equipePreneur: 0 };
  G.pliCourant = [{ siege: 1, carte: card("AS") }];
  G.joueurActif = 2;
  G.hands[2] = [card("8S"), card("7H"), card("9D")]; // une seule pique : coup forcé
  for (const u of [0, 0.5, 0.999]) {
    const ms = thinkMs(G, 2, u);
    ok(ms >= 450 && ms < 600, `HAS-4 : carte forcée entre 450 et 600 ms (${Math.round(ms)})`);
  }
  G.hands[2] = [card("8S"), card("9S"), card("7H")]; // deux piques : un choix
  ok(thinkMs(G, 2, 0) === 800 && thinkMs(G, 2, 0.999) < 1200, "HAS-4 : un choix demande 0,8 à 1,2 s");
  G.phase = "ENCHERES";
  ok(thinkMs(G, 2, 0) >= 900 && thinkMs(G, 2, 0.999) < 1400, "HAS-4 : une enchère, 0,9 à 1,4 s (rythme régulier)");
  G.phase = "JEU";
  // Dans l'hôte : le minuteur du bot dépend du nombre de cartes légales.
  const delays = [];
  const h = createHost({
    send() {},
    random: () => 0.5,
    timers: { setTimeout: (fn, ms) => delays.push(ms), clearTimeout() {} },
    decide: { turnAction: () => null, wantsToCoinche: () => false, wantsToSurcoinche: () => false },
  });
  G.hands[2] = [card("8S"), card("7H"), card("9D")];
  h.update({ ...G, tour: 50 });
  G.hands[2] = [card("8S"), card("9S"), card("7H")];
  h.update({ ...G, tour: 51 });
  const [forced, choix] = delays.filter((ms) => ms < 20000);
  ok(forced <= 600 && choix >= 800, `HAS-4 : minuteur ${forced} ms (forcé) contre ${Math.round(choix)} ms (choix)`);
}

// ---- ZON-3 : carte jouée d'office, aucun signal ------------------------------------
// Siège 2 sans pique et sans atout défausse le 8♣ (« appel » s'il le joue
// volontairement : il pouvait aussi jeter le 7♦). Témoin : le même coup joué
// par le joueur.
{
  const jeu = () => {
    const G = createGame(seatsOf("human", "human", "human", "human"), rng(5));
    const s0 = G.joueurActif;
    actOn(G, s0, { type: "ENCHERIR", montant: 80, atout: "H" }, rng(1));
    for (let i = 0; i < 3; i++) actOn(G, G.joueurActif, { type: "PASSER" }, rng(1));
    assert.strictEqual(G.phase, "JEU");
    G.pliCourant = [{ siege: 1, carte: card("AS") }];
    G.joueurActif = 2;
    G.hands[2] = [card("8C"), card("7D")];
    return G;
  };
  const voulu = jeu();
  assert.strictEqual(actOn(voulu, 2, { type: "JOUER", carte: card("8C") }, rng(1)), undefined);
  ok(voulu.appel[2].C === true, "témoin : la défausse voulue est un appel");
  const office = jeu();
  assert.strictEqual(actOn(office, null, { type: "TIMEOUT", tour: office.tour }, rng(1)), undefined);
  ok(office.playedBy[2].length === 1 && office.void[2].S === true, "ZON-3 : la carte est jouée et le manque noté");
  ok(Object.keys(office.appel[2]).length === 0 && Object.keys(office.refus[2]).length === 0, "ZON-3 : carte d'office, pas de signal");
}

// ---- ZON-4 + MON-4 : relire un joueur selon ce qu'il était quand il a parlé ---
{
  const sansCoeur = [card("7S"), card("8S"), card("9S"), card("7D"), card("8D"), card("9D"), card("7C"), card("8C")];
  const forte = ["JH", "9H", "AH", "10H", "KH", "AS", "7D", "8C"].map(card);
  const donne = () => {
    const G = createGame(seatsOf("human", "human", "human", "human"), rng(9));
    return G;
  };
  // MON-4 : un humain ouvre 80 ♥ sans cœur (main qui ne colle pas), puis part.
  const G = donne();
  const s = G.joueurActif;
  actOn(G, s, { type: "ENCHERIR", montant: 80, atout: "H" }, rng(1));
  ok(G.bidLog[0].type === "human", "MON-4 : le type est enregistré avec l'enchère");
  const avant = bots.seatWeight(G, s, sansCoeur);
  G.seats[s] = { type: "bot", name: "Bob (bot)" }; // devenirBot
  ok(bots.seatWeight(G, s, sansCoeur) === avant && avant === 0.15, "MON-4 : un humain devenu bot reste lu comme un humain");
  delete G.bidLog[0].type; // partie sauvegardée avant ce champ
  ok(bots.seatWeight(G, s, sansCoeur) === 0.0001, "MON-4 : sans type enregistré, on retombe sur le type actuel");
  // ZON-4 : un siège qui passe à l'ouverture avec une main d'ouverture.
  const P = donne();
  const p = P.joueurActif;
  actOn(P, p, { type: "PASSER" }, rng(1));
  ok(bots.seatWeight(P, p, forte) < 1, "témoin : passe voulue avec une main d'ouverture = peu plausible");
  const Q = donne();
  const q = Q.joueurActif;
  actOn(Q, null, { type: "TIMEOUT", tour: Q.tour }, rng(1));
  ok(Q.bidLog[0].auto === true && Q.bidLog[0].seat === q, "ZON-4 : la passe d'office est marquée");
  ok(bots.seatWeight(Q, q, forte) === 1, "ZON-4 : la passe d'office ne pèse rien");
}

// ---- HAS-7 : les clients ne reçoivent ni personnalités ni mémoire des bots ----------
{
  const G = { ...createGame(seatsOf("human", "human", "bot", "bot"), rng(2)), hote: 0 };
  G.bidMemo[2] = { supported: true };
  G.bidMemo[1] = {};
  const vue = (playerID) => Coinche.playerView({ G, playerID });
  const hote = vue("0");
  ok((hote.personalities || !G.personalities) && hote.bidMemo[2].supported, "l'hôte garde personnalités (s'il y en a) et mémoire des bots");
  for (const id of ["1", undefined]) {
    const v = vue(id);
    ok(!("personalities" in v), "HAS-7 : pas de personnalités");
    ok(v.bidMemo.every((m, s) => (s === Number(id) ? m !== null : m === null)), "HAS-7 : seule la mémoire de son propre siège");
  }
  ok(G.bidMemo[2].supported && G.bidMemo[1] !== null, "l'état du serveur n'est pas modifié");
}

console.log(`Hôte et bots : ${n} vérifications passées.`);
