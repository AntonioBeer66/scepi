// Hôte d'une table : fait jouer les bots et envoie TIMEOUT quand une
// fenêtre de temps expire (tour de 20 s, surcoinche de 10 s, résultat
// affiché 5 s). Tourne dans le navigateur du joueur hôte (voir game.js,
// G.hote), ou dans le simulateur des tests avec une horloge virtuelle :
// c'est le même code, donc les bots testés sont ceux qu'on joue.
// Les délais des bots imitent un joueur vif (0,35 à 0,8 s pour jouer, 0,5 à 1,7 s
// pour réfléchir à une coinche) ; après un pli complet, tout attend que
// l'écran l'ait montré puis ramassé.
import { DURATION_MS, bots, teamOf } from "./engine.js";

export const TRICK_SHOW_MS = 900; // pli complet affiché (0,6 s) puis ramassé
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
  let contractId = null;
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
    const g = seatView(G, seat);
    const action = decision(g, seat);
    if (!action) return;
    send(seat, {
      ...action,
      memo: { bidMemo: g.bidMemo[seat], forced: g.forced },
    });
  }

  const isBot = (s) => G.seats[s].type === "bot";

  function update(state) {
    G = state;
    if (!G.seats || G.phase === "TERMINEE") return;

    if (G.tour !== tour) {
      tour = G.tour;
      const t = tour;
      const seat = G.joueurActif;
      const pause = trickPause(G);
      later(pause + DURATION_MS[G.phase], () => {
        if (G.tour === t) send(null, { type: "TIMEOUT", tour: t });
      });
      // Annonce toute fraîche face à un humain en défense : le bot suivant
      // laisse le temps de la coincher avant de la recouvrir.
      const last = G.phase === "ENCHERES" ? G.bidLog[G.bidLog.length - 1] : null;
      const coincheWindow =
        last?.montant &&
        [0, 1, 2, 3].some((s) => teamOf(s) !== G.contract.equipePreneur && !isBot(s))
          ? COINCHE_WINDOW_MS
          : 0;
      if ((G.phase === "ENCHERES" || G.phase === "JEU") && isBot(seat)) {
        later(pause + coincheWindow + 350 + random() * 450, () => {
          if (G.tour === t) botSend(seat, decide.turnAction);
        });
      }
      if (G.phase === "SURCOINCHE") {
        const id = G.contract.id;
        for (const s of [0, 1, 2, 3]) {
          if (teamOf(s) !== G.contract.equipePreneur || !isBot(s)) continue;
          later(300 + random() * 1500, () => {
            if (
              G.phase === "SURCOINCHE" &&
              G.contract.id === id &&
              !G.contract.surcoinche &&
              decide.wantsToSurcoinche(seatView(G, s), s)
            )
              send(s, { type: "SURCOINCHER" });
          });
        }
      }
    }

    // Nouveau contrat : chaque bot en défense envisage de coincher.
    const c = G.phase === "ENCHERES" ? G.contract : null;
    if (c && c.id !== contractId) {
      const id = c.id;
      for (const s of [0, 1, 2, 3]) {
        if (teamOf(s) === c.equipePreneur || !isBot(s)) continue;
        later(500 + random() * 1200, () => {
          if (
            G.phase === "ENCHERES" &&
            G.contract?.id === id &&
            !G.contract.coinche &&
            decide.wantsToCoinche(seatView(G, s), s)
          )
            send(s, { type: "COINCHER" });
        });
      }
    }
    contractId = G.contract?.id ?? null;
  }

  function stop() {
    for (const id of pending) timers.clearTimeout(id);
    pending.clear();
    G = null;
    tour = null;
    contractId = null;
  }

  return { update, stop };
}
