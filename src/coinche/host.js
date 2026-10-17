// Hôte d'une table : fait jouer les bots et envoie TIMEOUT quand une
// fenêtre de temps expire (tour de 20 s, surcoinche de 10 s, résultat
// affiché 4 s). Tourne dans le navigateur du joueur hôte (voir game.js,
// G.hote), ou dans le simulateur des tests avec une horloge virtuelle :
// c'est le même code, donc les bots testés sont ceux qu'on joue.
// Les délais des bots imitent un joueur vif (voir thinkMs : une carte
// forcée part en 0,15 à 0,3 s, un vrai choix demande 0,35 à 1,9 s) ; après
// un pli complet, tout attend que l'écran l'ait montré puis ramassé.
import { DURATION_MS, bots, computeLegal, teamOf } from "./engine.js";

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

// Temps que prend un bot pour parler ou jouer, hors pause de pli et fenêtre
// de coinche. u : tirage uniforme dans [0, 1[.
//   - carte forcée (une seule carte légale) : 150 à 300 ms, rien à réfléchir ;
//   - sinon 350 ms plus une part en u² : la plupart des coups partent vite,
//     quelques-uns hésitent longtemps. La part croît avec le choix (2 cartes
//     légales : jusqu'à 950 ms en tout, 8 cartes : 1 670 ms) ; une enchère va
//     jusqu'à 1 850 ms.
// Mesuré sur 3 parties de bots (1 081 décisions, 29 % de coups forcés) : 542 ms
// en moyenne, contre 575 ms avant (350 + 450 u, quel que soit le coup).
// Un humain joue vite quand il n'a pas le choix et plus lentement quand il
// en a un ; une loi uniforme unique ne le faisait pas.
const BID_SPAN_MS = 1500;
export function thinkMs(G, seat, u) {
  let span = BID_SPAN_MS;
  const hand = G.hands[seat];
  if (G.phase === "JEU" && hand && !hand.includes(null)) {
    const n = computeLegal(hand, G.pliCourant, G.contract.atout, seat).length;
    if (n === 1) return 150 + 150 * u;
    span = 600 + 120 * Math.min(n - 2, 6);
  }
  return 350 + span * u * u;
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
}) {
  let G = null;
  let tour = null;
  // Pour chaque siège, le tour dont la décision du bot est déjà programmée.
  // Clé = tour ET siège bot : un humain qui part en plein tour (devenirBot ne
  // touche pas à G.tour) rend le siège bot sans nouveau tour ; sans cela le
  // bot restait muet jusqu'au TIMEOUT (passe, ou carte au hasard).
  const decided = [null, null, null, null];
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
  function botSend(seat, decision) {
    if (!playable(seat)) return;
    const g = seatView(G, seat);
    const action = decision(g, seat);
    if (!action) return;
    send(seat, {
      ...action,
      memo: { bidMemo: g.bidMemo[seat], forced: g.forced },
    });
  }

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

  // Tour d'un bot en phase d'enchères ou de jeu. Défenseur d'un contrat pas
  // encore coinché, il décide d'abord s'il coinche : à son tour de parole,
  // comme un joueur (qui coinche au lieu de passer, jamais après avoir passé),
  // avant la clôture des enchères (les trois passes qui la ferment refusent
  // toute coinche) et après son partenaire s'il le précède. Les délais de
  // parole (thinkMs, plus la fenêtre de coinche d'un humain) s'appliquent donc
  // à la coinche aussi.
  function botTurn(seat) {
    const c = G.contract;
    if (
      G.phase === "ENCHERES" &&
      c &&
      !c.coinche &&
      teamOf(seat) !== c.equipePreneur &&
      playable(seat) &&
      decide.wantsToCoinche(seatView(G, seat), seat)
    ) {
      send(seat, { type: "COINCHER" });
      return;
    }
    botSend(seat, decide.turnAction);
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

    if (G.phase === "ENCHERES" || G.phase === "JEU") {
      const seat = G.joueurActif;
      if (playable(seat) && decided[seat] !== t) {
        decided[seat] = t;
        later(pause + coincheWindow() + thinkMs(G, seat, random()), () => {
          if (G.tour === t) botTurn(seat);
        });
      }
    } else if (G.phase === "SURCOINCHE") {
      const id = G.contract.id;
      for (const s of [0, 1, 2, 3]) {
        if (teamOf(s) !== G.contract.equipePreneur || !isBot(s) || decided[s] === t)
          continue;
        decided[s] = t;
        later(300 + random() * 1500, () => {
          if (
            G.phase === "SURCOINCHE" &&
            G.contract.id === id &&
            !G.contract.surcoinche &&
            playable(s) &&
            decide.wantsToSurcoinche(seatView(G, s), s)
          )
            send(s, { type: "SURCOINCHER" });
        });
      }
    }
  }

  function stop() {
    for (const id of pending) timers.clearTimeout(id);
    pending.clear();
    G = null;
    tour = null;
    decided.fill(null);
  }

  return { update, stop };
}
