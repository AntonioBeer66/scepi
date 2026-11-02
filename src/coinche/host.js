// Hôte d'une table : fait jouer les bots et envoie TIMEOUT quand une
// fenêtre de temps expire (tour de 20 s, surcoinche de 10 s, résultat
// affiché 4 s). Tourne dans le navigateur du joueur hôte (voir game.js,
// G.hote), ou dans le simulateur des tests avec une horloge virtuelle :
// c'est le même code, donc les bots testés sont ceux qu'on joue.
// Les délais des bots imitent un joueur vif qui pèse ses vrais dilemmes
// (voir thinkMs : une carte forcée part en 0,45 s, un coup à peser en
// 1,6 s) ; après un pli complet, tout attend que l'écran l'ait montré puis
// ramassé.
import { DURATION_MS, bots, computeLegal, miserePossible, teamOf } from "./engine.js";

export const TRICK_SHOW_MS = 900; // pli complet affiché (0,9 s) puis ramassé
export const LAST_TRICK_SHOW_MS = 2500; // dernier pli de la donne : on le regarde
// Attente avant la fenêtre qui s'ouvre : le pli qui vient de se fermer est
// montré puis ramassé (le dernier plus longtemps, avant le résultat).
export const trickPause = (G) =>
  !G.lastTrick || G.pliCourant.length || G.phase === "SURCOINCHE"
    ? 0
    : G.phase === "SCORE"
      ? LAST_TRICK_SHOW_MS
      : TRICK_SHOW_MS;
const COINCHE_WINDOW_MS = 1800; // temps laissé à un humain pour coincher une annonce
export const MISERE_WINDOW_MS = 2500; // temps laissé à un humain pour dire « misère » avant que le bot entame

// Temps que prend un bot pour parler ou jouer, hors pause de pli et fenêtre
// de coinche, selon la vraie difficulté de sa décision (action : ce qu'il a
// décidé). u : tirage uniforme dans [0, 1[, un seul, en loi log-normale
// autour d'une médiane, jamais sous un plancher (la loi en u² d'avant
// faisait partir des coups aussitôt et paraissait au hasard aux joueurs).
//   - carte forcée : 0,45 s (0,35 s au dernier pli) ;
//   - sinon 0,8 s pour un coup évident ou indifférent à 1,6 s pour un coup à
//     peser (action.hesit, voir mcChooseCard), +0,4 s au premier pli ;
//   - passe simple 0,7 s, barème ou soutien 1 s, simulation 1,4 s, capot,
//     Générale ou Tout Atout / Sans Atout 2,2 s ; coinche 1 s (libre) à
//     1,4 s (simulation).
// Avant : seul le nombre de cartes légales comptait (1,04 s pour un choix
// indifférent, 1,20 s pour un vrai dilemme), toutes les enchères partaient
// entre 0,9 et 1,4 s.
const BID_MS = { bareme: 1000, "bareme-sans-sim": 1000, soutien: 1000, force: 1000, "force-soutien": 1000, "relance-ouvreur": 1000, "coinche-libre": 1000, "coinche-tenue": 1000 };
const lognormal = (median, floor, u) => {
  const v = Math.min(0.98, Math.max(0.02, u));
  return Math.max(floor, median * Math.exp((0.3 * Math.log(v / (1 - v))) / 1.7));
};
export function thinkMs(G, seat, u, action = {}) {
  const hand = G.hands[seat];
  if (G.phase === "JEU" && hand && !hand.includes(null)) {
    const n = computeLegal(hand, G.pliCourant, G.contract.atout, seat).length;
    if (n === 1) return lognormal(G.plisJoues === 7 ? 350 : 450, 300, u);
    return lognormal(800 + 800 * (action.hesit || 0) + (G.plisJoues ? 0 : 400), 500, u);
  }
  const why = action.why || "";
  const median =
    BID_MS[why] ??
    (!why && action.type === "PASSER"
      ? 700
      : /capot|generale|TA|SA/.test(why) || action.atout === "TA" || action.atout === "SA"
        ? 2200
        : why
          ? 1400
          : 1000);
  return lognormal(median, 500, u);
}

// G n'est que du JSON. Pas de structuredClone ni de .at() ici : sur un
// navigateur ancien (Safari < 15.4, Chrome < 98), l'hôte plantait et les
// bots ne faisaient plus que « passer » à l'expiration de leur délai.
const clone = (G) => JSON.parse(JSON.stringify(G));

// Ce qu'un bot a le droit de voir : sa main, rien de celles des autres (même
// de son partenaire bot, que l'hôte connaît), ni leur mémoire d'enchère ;
// une belote pas encore annoncée reste secrète. Il devine le reste.
export function seatView(G, seat) {
  // L'historique des donnes ne sert à aucune décision : pas la peine de le copier.
  const g = clone({ ...G, history: [] });
  g.hands = g.hands.map((h, s) => (s === seat ? h : h.map(() => null)));
  g.mainsInitiales = g.mainsInitiales.map((h, s) => (s === seat ? h : []));
  g.bidMemo = g.bidMemo.map((m, s) => (s === seat ? m : null));
  if (!g.belote.beloteDeclared && g.belote.holder !== seat) g.belote.holder = null;
  return g;
}

// send(seat, action) transmet une action (seat null pour TIMEOUT).
// decide : décisions des bots (les duels A/B en branchent d'autres).
export function createHost({
  send,
  timers = globalThis,
  random = Math.random,
  decide = bots,
  now = () => 0, // horloge du calcul (Date.now dans le navigateur)
}) {
  let G = null;
  let tour = null;
  // Pour chaque siège, le tour dont la décision du bot est déjà programmée.
  // Clé = tour ET siège bot : un humain qui part en plein tour (devenirBot ne
  // touche pas à G.tour) rend le siège bot sans nouveau tour ; sans cela le
  // bot restait muet jusqu'au TIMEOUT (passe, ou carte au hasard).
  const decided = [null, null, null, null];
  let misereTour = null; // tour dont les misères de bots sont déjà programmées
  const pending = new Set();

  function later(ms, fn) {
    const id = timers.setTimeout(() => {
      pending.delete(id);
      if (G) fn();
    }, ms);
    pending.add(id);
  }

  // Le bot décide sur sa propre vue (une copie : l'état reçu peut être figé) ;
  // sa mémoire d'enchère voyage avec son action.
  const isBot = (s) => G.seats[s].type === "bot";
  // Décision prévue quand le siège était un bot : entre-temps un humain a
  // pu le reprendre, ou sa main n'est pas encore visible de l'hôte (en
  // ligne, le serveur la cache tant que le siège n'est pas un bot) ; le bot
  // jouerait alors avec des cartes nulles.
  const playable = (s) => isBot(s) && !G.hands[s].includes(null);

  // Annonce toute fraîche face à un humain en défense : le bot suivant
  // laisse le temps de la coincher avant de la recouvrir.
  function coincheWindow() {
    const last = G.phase === "ENCHERES" ? G.bidLog[G.bidLog.length - 1] : null;
    return last?.montant &&
      [0, 1, 2, 3].some((s) => teamOf(s) !== G.contract.equipePreneur && !isBot(s))
      ? COINCHE_WINDOW_MS
      : 0;
  }

  // Misère (salon ESSEC) : possible tant que personne n'a joué. Un bot qui
  // entame laisse sa chance à un humain (l'hôte ne voit pas toujours sa main :
  // dans le doute, il attend).
  const misereWindow = () =>
    [0, 1, 2, 3].some((s) => !isBot(s) && miserePossible(G, s)) ? MISERE_WINDOW_MS : 0;

  // Tour d'un bot en phase d'enchères ou de jeu. Défenseur d'un contrat pas
  // encore coinché, il décide d'abord s'il coinche : à son tour de parole,
  // comme un joueur (qui coinche au lieu de passer, jamais après avoir passé),
  // avant la clôture des enchères (les trois passes qui la ferment refusent
  // toute coinche) et après son partenaire s'il le précède. Les délais de
  // parole (thinkMs, plus la fenêtre de coinche d'un humain) s'appliquent donc
  // à la coinche aussi.
  function botTurn(seat) {
    if (!playable(seat)) return null;
    const c = G.contract;
    if (
      G.phase === "ENCHERES" &&
      c &&
      !c.coinche &&
      teamOf(seat) !== c.equipePreneur &&
      decide.wantsToCoinche(seatView(G, seat), seat)
    )
      return { type: "COINCHER", why: decide.lastCoincheWhy?.() };
    const g = seatView(G, seat);
    const action = decide.turnAction(g, seat);
    return action && { ...action, memo: { bidMemo: g.bidMemo[seat], forced: g.forced } };
  }

  function update(state) {
    G = state;
    if (!G.seats || G.phase === "TERMINEE") return;
    // Un siège repris par un humain oublie sa décision : s'il redevient bot
    // au même tour, elle sera reprogrammée.
    for (const s of [0, 1, 2, 3]) if (!isBot(s)) decided[s] = null;

    const t = G.tour;
    const pause = trickPause(G);
    if (t !== tour) {
      tour = t;
      later(pause + DURATION_MS[G.phase], () => {
        if (G.tour === t) send(null, { type: "TIMEOUT", tour: t });
      });
    }

    // Misère des bots : avant la première carte, avant même que l'un d'eux
    // entame (thinkMs : 0,45 s au moins).
    if (G.phase === "JEU" && misereTour !== t) {
      misereTour = t;
      for (const s of [0, 1, 2, 3]) {
        if (!playable(s) || !miserePossible(G, s)) continue;
        later(100 + 250 * random(), () => {
          if (G.tour === t && playable(s) && decide.wantsMisere?.(seatView(G, s), s))
            send(s, { type: "MISERE" });
        });
      }
    }

    if (G.phase === "ENCHERES" || G.phase === "JEU") {
      const seat = G.joueurActif;
      if (playable(seat) && decided[seat] !== t) {
        decided[seat] = t;
        // Le temps de réflexion sert au calcul : la décision est prise dès que
        // le pli est ramassé, puis envoyée au bout du délai (pas plus tôt),
        // qui dépend de ce qu'elle a coûté à peser.
        const windows = coincheWindow() + misereWindow();
        const u = random();
        later(pause, () => {
          if (G.tour !== t) return;
          const key = [G.phase, G.bidLog.length, !!(G.contract && G.contract.coinche)].join();
          const t0 = now();
          const action = botTurn(seat);
          if (!action) return;
          const wait = windows + thinkMs(G, seat, u, action);
          later(Math.max(0, wait - (now() - t0)), () => {
            const same = [G.phase, G.bidLog.length, !!(G.contract && G.contract.coinche)].join() === key;
            if (G.tour === t && same && playable(seat)) send(seat, action);
          });
        });
      }
    } else if (G.phase === "SURCOINCHE") {
      const id = G.contract.id;
      for (const s of [0, 1, 2, 3]) {
        if (teamOf(s) !== G.contract.equipePreneur || !isBot(s) || decided[s] === t)
          continue;
        decided[s] = t;
        later(800 + random() * 700, () => {
          if (
            G.phase === "SURCOINCHE" &&
            G.contract.id === id &&
            !G.contract.surcoinche &&
            playable(s) &&
            decide.wantsToSurcoinche(seatView(G, s), s)
          )
            send(s, { type: "SURCOINCHER", why: decide.lastCoincheWhy?.() });
        });
      }
    }
  }

  function stop() {
    for (const id of pending) timers.clearTimeout(id);
    pending.clear();
    G = null;
    tour = null;
    misereTour = null;
    decided.fill(null);
  }

  return { update, stop };
}
