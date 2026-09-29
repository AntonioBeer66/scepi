// Salons et parties de coinche en ligne, sans réseau ni stockage : le
// Durable Object (worker/tables.js) s'en sert, les tests aussi.
// Remplace le serveur boardgame.io : mêmes coups (game.js), même vue par
// joueur (playerView), mêmes règles d'entretien (4 tables permanentes,
// salons temporaires, parties abandonnées effacées).
// Une partie : { id, table, createdAt, updatedAt, stateID, G, players } ;
// players[s] = { name, credentials } (name null : place libre).
import { Coinche, MAX_NAME } from "../game.js";

// Émoticônes rapides (bouton en bas à droite de la table) : seules celles-ci
// circulent entre joueurs.
export const EMOTES = ["👍", "😂", "😮", "😡", "🔥", "👏"];

export const PERMANENT_TABLES = 4;
export const MAX_MATCHES = 40;
export const IDLE_MS = 30 * 60 * 1000; // partie ou salon abandonné
export const EMPTY_MS = 10 * 60 * 1000; // salon temporaire jamais rejoint
const INVALID_MOVE = "INVALID_MOVE"; // valeur rendue par les coups refusés
const MOVES = new Set(Object.keys(Coinche.moves));
const MAX_ARGS = 3;

const newID = () => crypto.randomUUID().slice(0, 11);
const newCredentials = () => crypto.randomUUID();

export function createTables({ now = Date.now, random = Math.random } = {}) {
  const matches = new Map();

  function create(table = null) {
    if (matches.size >= MAX_MATCHES) return null;
    const t = now();
    const m = {
      id: newID(),
      table,
      createdAt: t,
      updatedAt: t,
      stateID: 0,
      G: Coinche.setup({ ctx: { numPlayers: 4 } }, { table }),
      players: [0, 1, 2, 3].map(() => ({ name: null, credentials: null })),
    };
    matches.set(m.id, m);
    return m;
  }

  const seatOk = (s) => Number.isInteger(s) && s >= 0 && s < 4;

  return {
    // Parties à enregistrer : on les recharge telles quelles (voir load).
    get: (id) => matches.get(id),
    all: () => [...matches.values()],
    load(list) {
      matches.clear();
      for (const m of list) matches.set(m.id, m);
    },

    // Entretien : chaque numéro permanent garde une table en attente ; les
    // parties et salons abandonnés disparaissent. Rend les parties
    // effacées et créées (à répercuter sur le stockage).
    maintain() {
      const t = now();
      const removed = [];
      const created = [];
      const waiting = new Set();
      for (const m of matches.values()) {
        const idle = t - m.updatedAt;
        const empty = m.players.every((p) => !p.name);
        if (
          idle > IDLE_MS ||
          (m.G.phase === "ATTENTE" && empty && !m.table && idle > EMPTY_MS) ||
          (m.G.phase === "ATTENTE" && m.table && waiting.has(m.table))
        ) {
          matches.delete(m.id);
          removed.push(m.id);
        } else if (m.G.phase === "ATTENTE" && m.table) waiting.add(m.table);
      }
      for (let n = 1; n <= PERMANENT_TABLES; n++)
        if (!waiting.has(n)) {
          const m = create(n);
          if (m) created.push(m);
        }
      return { removed, created };
    },

    // Salon temporaire (bouton « Nouveau salon ») ; null au-delà du plafond.
    create: () => create(null),

    // Liste des salons pour le lobby ; connected(id, siège) : un client de
    // ce siège est-il connecté ?
    list(connected) {
      return [...matches.values()].map((m) => ({
        matchID: m.id,
        table: m.table,
        phase: m.G.phase,
        players: m.players.map((p, s) => ({
          id: s,
          name: p.name,
          isConnected: connected(m.id, s),
        })),
        createdAt: m.createdAt,
      }));
    },

    // S'asseoir : rend les identifiants de la place, ou un code d'erreur.
    join(id, seat, name) {
      const m = matches.get(id);
      if (!m) return { error: "INCONNUE" };
      const pseudo = String(name ?? "").trim().slice(0, MAX_NAME);
      if (!seatOk(seat) || !pseudo) return { error: "INVALIDE" };
      if (m.players[seat].name) return { error: "OCCUPEE" };
      m.players[seat] = { name: pseudo, credentials: newCredentials() };
      m.updatedAt = now();
      return { credentials: m.players[seat].credentials };
    },

    leave(id, seat, credentials) {
      const m = matches.get(id);
      if (!m || !seatOk(seat) || !this.auth(id, seat, credentials)) return false;
      m.players[seat] = { name: null, credentials: null };
      m.updatedAt = now();
      return true;
    },

    auth(id, seat, credentials) {
      const m = matches.get(id);
      return (
        !!m &&
        seatOk(seat) &&
        !!m.players[seat].credentials &&
        m.players[seat].credentials === credentials
      );
    },

    // Coup d'un joueur authentifié (seat) : appliqué sur une copie, gardé
    // seulement si game.js l'accepte. Rend true si l'état a changé.
    move(id, seat, name, args) {
      const m = matches.get(id);
      if (!m || !seatOk(seat) || !MOVES.has(name)) return false;
      if (!Array.isArray(args) || args.length > MAX_ARGS) return false;
      const draft = structuredClone(m.G);
      const out = Coinche.moves[name].move(
        { G: draft, playerID: String(seat), random: { Number: random } },
        ...structuredClone(args),
      );
      if (out === INVALID_MOVE) return false;
      m.G = out === undefined ? draft : out;
      m.stateID++;
      m.updatedAt = now();
      return true;
    },

    // Ce qu'un siège (null : spectateur) a le droit de voir.
    view(id, seat) {
      const m = matches.get(id);
      return {
        G: Coinche.playerView({ G: m.G, playerID: seat == null ? null : String(seat) }),
        stateID: m.stateID,
      };
    },
  };
}
