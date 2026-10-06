// Hôte d'une table : fait jouer les bots et envoie TIMEOUT quand une
// fenêtre de temps expire (tour de 30 s, surcoinche de 10 s, résultat
// affiché 5 s). Tourne dans le navigateur du joueur hôte (voir game.js,
// G.hote), ou dans le simulateur des tests avec une horloge virtuelle :
// c'est le même code, donc les bots testés sont ceux qu'on joue.
// Les délais des bots imitent un joueur vif (0,35 à 0,8 s pour jouer, 0,5 à 1,7 s
// pour réfléchir à une coinche) ; après un pli complet, tout attend que
// l'écran l'ait montré puis ramassé.
import { DURATION_MS, bots, teamOf } from "./engine.js";

export const TRICK_SHOW_MS = 900; // pli complet affiché (0,6 s) puis ramassé
const COINCHE_WINDOW_MS = 1800; // temps laissé à un humain pour coincher une annonce

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

  // Le bot décide sur une copie (l'état reçu peut être figé) ; sa mémoire
  // d'enchère voyage avec son action.
  function botSend(seat, decision) {
    const g = structuredClone(G);
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
      const pause =
        G.lastTrick && !G.pliCourant.length && G.phase !== "SURCOINCHE"
          ? TRICK_SHOW_MS
          : 0;
      later(pause + DURATION_MS[G.phase], () => {
        if (G.tour === t) send(null, { type: "TIMEOUT", tour: t });
      });
      // Annonce toute fraîche face à un humain en défense : le bot suivant
      // laisse le temps de la coincher avant de la recouvrir.
      const last = G.phase === "ENCHERES" ? G.bidLog.at(-1) : null;
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
              decide.wantsToSurcoinche(structuredClone(G), s)
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
            decide.wantsToCoinche(structuredClone(G), s)
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
