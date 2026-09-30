// Salons et parties de coinche en ligne, sans réseau ni stockage : le
// Durable Object (worker/tables.js) s'en sert, les tests aussi.
// Remplace le serveur boardgame.io : mêmes coups (game.js), même vue par
// joueur (playerView), mêmes règles d'entretien (4 tables permanentes,
// salons temporaires, parties abandonnées effacées).
// Une partie : { id, table, createdAt, updatedAt, activeAt, stateID, G, players } ;
// activeAt : dernier coup d'un humain pour lui-même (lancer, agir).
// players[s] = { name, credentials } (name null : place libre).
import { Coinche, MAX_NAME } from "../game.js";

// Émoticônes rapides (bouton en bas à droite de la table) : seules celles-ci
// circulent entre joueurs ; chacune avec sa petite phrase de provocation.
export const EMOTES = new Map([
  ["😂", "Skill issue"],
  ["😭", "Ouin ouin"],
  ["🤡", "L bozo"],
  ["🎬", "Absolutes kino"],
  ["🥱", "GG EZ"],
  ["😳", "Eh beh"],
  ["💪", "Solide"],
  ["🗿", "Built different"],
  ["💣", "Terroriste"],
  ["😔", "Sadge"],
  ["🅰️", "Sous A"],
  ["❓", "???"],
]);

export const PERMANENT_TABLES = 4;
export const MAX_MATCHES = 40;
export const IDLE_MS = 30 * 60 * 1000; // partie ou salon abandonné
export const EMPTY_MS = 10 * 60 * 1000; // salon temporaire jamais rejoint
export const ABANDON_MS = 2 * 60 * 1000; // partie lancée sans humain connecté
export const AFK_MS = 5 * 60 * 1000; // partie lancée où aucun humain ne joue (bots seuls)
const INVALID_MOVE = "INVALID_MOVE"; // valeur rendue par les coups refusés
const MOVES = new Set(Object.keys(Coinche.moves));
const MAX_ARGS = 3;

// Historique des parties terminées, téléchargeable en CSV (Excel), remis à
// zéro chaque semaine (lundi 0 h UTC) pour rester petit.
export const weekOf = (t) => Math.floor((t / 86400000 + 3) / 7); // semaine depuis un lundi
const HISTORY_HEAD = [
  "Date et heure", "Table", "Équipe 1", "Équipe 2", "Score 1", "Score 2", "Gagnant", "Donnes",
  "Coinches", "Surcoinches",
];

export function historyRow(m, t) {
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
    // « 2026-09-30 21:45 », heure de Paris : lu comme date et heure par
    // tous les tableurs, quelle que soit leur langue (pas « 30/09/2026 »).
    new Date(t).toLocaleString("sv-SE", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }),
    m.table ? `Table ${m.table}` : "Salon",
    team(0, 2),
    team(1, 3),
    s1,
    s2,
    s1 === s2 ? "Égalité" : s1 > s2 ? "Équipe 1" : "Équipe 2",
    m.G.history.length,
    who("coincheur"),
    who("surcoincheur"),
  ];
}

// « ; » et BOM : ce qu'attend Excel en français. Pseudos entre guillemets,
// et neutralisés s'ils commencent comme une formule (=, +, -, @).
export function historyCSV(rows) {
  const cell = (v) => {
    const s = String(v);
    return typeof v === "number" ? s : `"${(/^[=+\-@\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`;
  };
  return "﻿" + [HISTORY_HEAD, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

const newID = () => crypto.randomUUID().slice(0, 11);
const newCredentials = () => crypto.randomUUID();

export function createTables({ now = Date.now, random = Math.random } = {}) {
  const matches = new Map();
  const seen = new Map(); // id → dernière fois qu'un humain assis était connecté

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
    // Partie lancée : effacée dès que tous les humains l'ont quittée, ou
    // après ABANDON_MS sans aucun d'eux connecté (onglets fermés) ; personne
    // pour l'héberger, elle ne ferait qu'occuper une table. Aussi après
    // AFK_MS sans qu'aucun humain ne joue lui-même (les bots et les coups
    // joués d'office par l'hôte ne comptent pas) : table rendue au lobby.
    // connected(id, siège) : voir list ; absent, tout le monde l'est.
    maintain(connected = () => true) {
      const t = now();
      const removed = [];
      const created = [];
      const waiting = new Set();
      for (const m of matches.values()) {
        const idle = t - m.updatedAt;
        const empty = m.players.every((p) => !p.name);
        const started = m.G.phase !== "ATTENTE";
        if (m.players.some((p, s) => p.name && connected(m.id, s))) seen.set(m.id, t);
        if (
          (started && empty) ||
          (started && t - (seen.get(m.id) ?? t) > ABANDON_MS) ||
          (started && t - (m.activeAt ?? m.updatedAt) > AFK_MS) ||
          idle > IDLE_MS ||
          (m.G.phase === "ATTENTE" && empty && !m.table && idle > EMPTY_MS) ||
          (m.G.phase === "ATTENTE" && m.table && waiting.has(m.table))
        ) {
          matches.delete(m.id);
          seen.delete(m.id);
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
      // Partie en cours : il prend la main du bot qui tenait la place.
      if (m.G.seats?.[seat]?.type === "bot") {
        m.G = { ...m.G, seats: m.G.seats.map((s, i) => (i === seat ? { type: "human", name: pseudo } : s)) };
        m.stateID++;
      }
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
      if (name === "agir" || name === "lancer") m.activeAt = m.updatedAt;
      return true;
    },

    // Ce qu'un siège (null : spectateur) a le droit de voir. Spectateur :
    // la seule main du joueur qu'il regarde (peek), même si c'est l'hôte.
    view(id, seat, peek = null) {
      const m = matches.get(id);
      const G = Coinche.playerView({ G: m.G, playerID: seat == null ? null : String(seat) });
      if (seat == null && seatOk(peek) && G.hands) {
        G.hands = G.hands.map((h, s) => (s === peek ? m.G.hands[s] : h));
        G.mainsInitiales = G.mainsInitiales.map((h, s) => (s === peek ? m.G.mainsInitiales[s] : h));
      }
      return { G, stateID: m.stateID };
    },
  };
}
