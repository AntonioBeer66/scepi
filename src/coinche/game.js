// La coinche pour boardgame.io : le serveur (ou, en solo, le navigateur)
// garde l'état et n'applique que les coups que engine.js accepte. Tous les
// sièges sont actifs en permanence : c'est le moteur qui refuse un coup
// hors tour, ce qui laisse passer la coinche hors tour.
// Les coups ne s'exécutent jamais côté client (client: false) : un client
// ne voit pas les autres mains, il ne pourrait pas les rejouer.
// L'hôte (G.hote, premier humain assis) fait jouer les bots et signale les
// délais écoulés depuis son navigateur (host.js) ; il voit donc aussi les
// mains des bots. Si l'hôte se déconnecte, un autre humain reprend le rôle.
import { createGame, actOn } from "./engine.js";
import { MAX_NAME } from "../online/tables.js";

// Valeurs de boardgame.io/core, recopiées : ce sous-chemin ne se charge pas
// en module ES sous Node (serveur, tests).
const INVALID_MOVE = "INVALID_MOVE";
const ALL_ACTIVE = { all: null }; // ActivePlayers.ALL

const HUMAN_ACTIONS = new Set([
  "PASSER",
  "ENCHERIR",
  "COINCHER",
  "SURCOINCHER",
  "JOUER",
]);

const isSeat = (s) => Number.isInteger(s) && s >= 0 && s < 4;
const seatOf = (playerID) => Number(playerID);
const isHuman = (G, s) => G.seats?.[s]?.type === "human";

// Un coup n'emporte que les champs utiles : rien d'autre ne passe au moteur.
function clean(action) {
  if (!action || typeof action !== "object") return null;
  const out = { type: action.type };
  if (action.type === "ENCHERIR") {
    out.montant = action.montant;
    out.atout = action.atout;
  }
  if (action.type === "JOUER") out.carte = { id: action.carte?.id };
  if (action.type === "TIMEOUT") out.tour = action.tour;
  if (action.memo)
    out.memo = { bidMemo: action.memo.bidMemo, forced: action.memo.forced };
  return out;
}

function apply(G, seat, action, random) {
  // JOUER ne porte que l'identifiant : la carte vient de la main du siège.
  if (action.type === "JOUER") {
    const carte = G.hands[seat].find((c) => c.id === action.carte.id);
    if (!carte) return INVALID_MOVE;
    action.carte = carte;
  }
  return actOn(G, seat, action, () => random.Number()) ? INVALID_MOVE : undefined;
}

export const Coinche = {
  name: "coinche",
  minPlayers: 4,
  maxPlayers: 4,

  setup: ({ ctx }, setupData) => ({
    phase: "ATTENTE",
    table: setupData?.table ?? null,
  }),

  turn: { activePlayers: ALL_ACTIVE },

  moves: {
    // Lancer (ou relancer après la fin) : seats = [{ type, name }], les
    // humains étant les places occupées de la table ; l'expéditeur devient hôte.
    lancer: {
      client: false,
      move: ({ G, playerID, random }, seats) => {
        if (G.phase !== "ATTENTE" && G.phase !== "TERMINEE") return INVALID_MOVE;
        if (!Array.isArray(seats) || seats.length !== 4) return INVALID_MOVE;
        const list = seats.map((s) => ({
          type: s?.type === "human" ? "human" : "bot",
          name:
            s?.type === "human"
              ? String(s.name || "").trim().slice(0, MAX_NAME) || "Joueur"
              : "Ordinateur",
        }));
        const me = seatOf(playerID);
        if (list[me]?.type !== "human") return INVALID_MOVE;
        const game = createGame(list, () => random.Number());
        return { ...game, hote: me, table: G.table };
      },
    },

    // Coup d'un humain, pour son propre siège.
    agir: {
      client: false,
      move: ({ G, playerID, random }, action) => {
        const seat = seatOf(playerID);
        const a = clean(action);
        if (!G.seats || !isHuman(G, seat) || !a || !HUMAN_ACTIONS.has(a.type))
          return INVALID_MOVE;
        delete a.memo;
        return apply(G, seat, a, random);
      },
    },

    // Coup de l'hôte pour un bot, ou délai écoulé (seat ignoré).
    pourSiege: {
      client: false,
      move: ({ G, playerID, random }, seat, action) => {
        const a = clean(action);
        if (!G.seats || seatOf(playerID) !== G.hote || !a) return INVALID_MOVE;
        if (a.type === "TIMEOUT") return apply(G, G.joueurActif ?? 0, a, random);
        if (!isSeat(seat) || G.seats[seat].type !== "bot") return INVALID_MOVE;
        return apply(G, seat, a, random);
      },
    },

    // Un humain a quitté la table (sa place est libérée dans le salon) :
    // l'hôte la confie à l'ordinateur plutôt que d'attendre 30 s par tour.
    devenirBot: {
      client: false,
      move: ({ G, playerID }, seat) => {
        if (!G.seats || seatOf(playerID) !== G.hote || seat === G.hote)
          return INVALID_MOVE;
        if (!isSeat(seat) || !isHuman(G, seat)) return INVALID_MOVE;
        // Le pseudo reste affiché, marqué « (bot) » : on sait qui a quitté.
        G.seats[seat] = { type: "bot", name: `${G.seats[seat].name} (bot)` };
      },
    },

    // L'hôte a disparu (le client le voit déconnecté) : un humain reprend.
    reprendreHote: {
      client: false,
      move: ({ G, playerID }) => {
        const seat = seatOf(playerID);
        if (!G.seats || !isHuman(G, seat) || G.hote === seat) return INVALID_MOVE;
        G.hote = seat;
      },
    },
  },

  // Chacun ne reçoit que sa main (l'hôte : aussi celles des bots) ; une
  // belote pas encore annoncée reste secrète (REGLES_COINCHE.md §3).
  playerView: ({ G, playerID }) => {
    if (!G.hands) return G;
    const me = playerID == null ? -1 : seatOf(playerID);
    const sees = (s) => s === me || (me === G.hote && G.seats[s].type === "bot");
    return {
      ...G,
      hands: G.hands.map((h, s) => (sees(s) ? h : h.map(() => null))),
      mainsInitiales: G.mainsInitiales.map((h, s) => (sees(s) ? h : [])),
      belote: G.belote.beloteDeclared ? G.belote : { ...G.belote, holder: null },
    };
  },
};
