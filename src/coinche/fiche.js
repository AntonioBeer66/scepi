// Fiche de la coinche pour le serveur de tables (src/online/tables.js) :
// ce qui, dans une partie en ligne, dépend du jeu. Le reste (places,
// codes privés, entretien, vues filtrées, validation des coups) est commun.
import { DURATION_MS, actOn } from "./engine.js";
import { Coinche } from "./game.js";
import { trickPause } from "./host.js";

export const coinche = {
  game: Coinche, // format boardgame.io : setup, moves, playerView
  numPlayers: 4,
  started: (G) => G.phase !== "ATTENTE",
  finished: (G) => G.phase === "TERMINEE",
  // Coups d'un humain pour lui-même : eux seuls comptent comme activité
  // (les bots et les coups joués d'office par l'hôte, non).
  humanMoves: new Set(["agir", "lancer"]),

  // Fenêtre de temps en cours : { key, ms } (ms comptées depuis son
  // ouverture), ou null. L'hôte envoie TIMEOUT à son terme ; s'il ne le fait
  // pas (téléphone en veille), le serveur appelle timeout un peu plus tard.
  deadline: (G) =>
    G.seats && DURATION_MS[G.phase] ? { key: G.tour, ms: trickPause(G) + DURATION_MS[G.phase] } : null,
  // Action par défaut à l'expiration de la fenêtre key : passe, carte
  // autorisée au hasard, fin de la surcoinche ou donne suivante. Modifie G ;
  // rend false si la fenêtre était déjà fermée.
  timeout: (G, key, random) => !actOn(G, G.joueurActif ?? 0, { type: "TIMEOUT", tour: key }, random),

  // Un humain s'assoit pendant la partie : il prend la main du bot qui
  // tenait la place. Rend le nouvel état, ou null si rien ne change.
  takeSeat(G, seat, name) {
    if (G.seats?.[seat]?.type !== "bot") return null;
    return { ...G, seats: G.seats.map((s, i) => (i === seat ? { type: "human", name } : s)) };
  },

  // Spectateur : la seule main du joueur qu'il regarde (peek), même si
  // c'est l'hôte. view : la vue de spectateur, full : l'état complet.
  spectate(view, full, peek) {
    if (!view.hands) return view;
    return {
      ...view,
      hands: view.hands.map((h, s) => (s === peek ? full.hands[s] : h)),
      mainsInitiales: view.mainsInitiales.map((h, s) => (s === peek ? full.mainsInitiales[s] : h)),
    };
  },

  // Historique des parties terminées (CSV, voir historyCSV).
  historyHead: [
    "Date et heure", "Table", "Équipe 1", "Équipe 2", "Score 1", "Score 2", "Gagnant", "Donnes",
    "Coinches", "Surcoinches",
  ],
  // date : « 2026-09-30 21:45 », heure de Paris ; table : « Table 1 »,
  // « Salon » ou « Salon privé » (fournis par le serveur de tables).
  historyRow(m, date, table) {
    const name = (s) => m.players[s].name || "Ordinateur";
    const team = (a, b) => `${name(a)} & ${name(b)}`;
    // « Alice ×2, Ordinateur ×1 » : qui a coinché (ou surcoinché), combien de fois.
    const who = (key) => {
      const count = new Map();
      for (const d of m.G.history)
        if (d[key] != null) count.set(name(d[key]), (count.get(name(d[key])) || 0) + 1);
      return [...count].map(([n, k]) => `${n} ×${k}`).join(", ");
    };
    const [s1, s2] = m.G.scores;
    return [
      date,
      table,
      team(0, 2),
      team(1, 3),
      s1,
      s2,
      s1 === s2 ? "Égalité" : s1 > s2 ? "Équipe 1" : "Équipe 2",
      m.G.history.length,
      who("coincheur"),
      who("surcoincheur"),
    ];
  },
};
