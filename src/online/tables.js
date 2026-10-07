// Salons et parties en ligne, pour n'importe quel jeu au format boardgame.io,
// sans réseau ni stockage : le Durable Object (worker/tables.js) s'en sert,
// les tests aussi. Ce qui dépend du jeu vient de sa fiche (voir
// src/coinche/fiche.js) : nombre de places, début et fin de partie, reprise
// d'une place par un humain, vue d'un spectateur, ligne d'historique.
// Remplace le serveur boardgame.io : mêmes coups, même vue par joueur
// (playerView), mêmes règles d'entretien (4 tables permanentes, salons
// temporaires, parties abandonnées effacées) ; plus des tables privées,
// cachées du lobby sauf pour qui donne leur code (choisi par l'hôte).
// Une partie : { id, table, code, owner, createdAt, updatedAt, activeAt, stateID, G, players } ;
// activeAt : dernier coup d'un humain pour lui-même (fiche.humanMoves).
// deadline : { key, at } de la fenêtre de temps en cours (fiche.deadline) :
// à l'heure at, le serveur joue l'action par défaut (expire).
// players[s] = { name, credentials } (name null : place libre) ; code :
// celui d'une table privée (absent : table ouverte).
export const MAX_NAME = 18; // pseudo

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
  ["🤔", "Hmmmmm"],
  ["🤷", "Bah"],
]);

export const PERMANENT_TABLES = 4;
export const MAX_MATCHES = 40;
// Salons et tables privées ouverts par une même personne (empreinte de son
// adresse IP, voir worker/tables.js) : une seule ne remplit pas le plafond.
export const MAX_PER_OWNER = 3;
export const IDLE_MS = 30 * 60 * 1000; // partie ou salon abandonné
export const EMPTY_MS = 10 * 60 * 1000; // salon temporaire jamais rejoint
export const ABANDON_MS = 2 * 60 * 1000; // partie lancée sans humain connecté
export const AFK_MS = 5 * 60 * 1000; // partie lancée où aucun humain ne joue (bots seuls)
const INVALID_MOVE = "INVALID_MOVE"; // valeur rendue par les coups refusés
const MAX_ARGS = 3;
export const CODE_MIN = 4;
export const CODE_MAX = 20;
// « jeudi soir » et « JEUDI SOIR » : même code.
export const normCode = (c) => String(c ?? "").trim().toUpperCase().slice(0, CODE_MAX);

// Historique des parties terminées, téléchargeable en CSV (Excel), remis à
// zéro chaque semaine (lundi 0 h UTC) pour rester petit.
export const weekOf = (t) => Math.floor((t / 86400000 + 3) / 7); // semaine depuis un lundi

// Ligne d'historique d'une partie terminée à l'instant t : date et table
// communes à tous les jeux, le reste vient de la fiche.
export function historyRow(fiche, m, t) {
  // « 2026-09-30 21:45 », heure de Paris : lu comme date et heure par
  // tous les tableurs, quelle que soit leur langue (pas « 30/09/2026 »).
  const date = new Date(t).toLocaleString("sv-SE", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
  const table = m.table ? `Table ${m.table}` : m.code ? "Salon privé" : "Salon";
  return fiche.historyRow(m, date, table);
}

// « ; » et BOM : ce qu'attend Excel en français. Pseudos entre guillemets,
// et neutralisés s'ils commencent comme une formule (=, +, -, @).
export function historyCSV(head, rows) {
  const cell = (v) => {
    const s = String(v);
    return typeof v === "number" ? s : `"${(/^[=+\-@\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`;
  };
  return "﻿" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

const newID = () => crypto.randomUUID().slice(0, 11);
const newCredentials = () => crypto.randomUUID();

export function createTables(fiche, { now = Date.now, random = Math.random } = {}) {
  const { game, numPlayers } = fiche;
  const moves = new Set(Object.keys(game.moves));
  const seats = [...Array(numPlayers).keys()];
  // Pour le lobby, trois états communs à tous les jeux.
  const phaseOf = (G) => (fiche.finished(G) ? "TERMINEE" : fiche.started(G) ? "EN_COURS" : "ATTENTE");
  const matches = new Map();
  const seen = new Map(); // id → dernière fois qu'un humain assis était connecté

  // Nouvel état : échéance de sa fenêtre de temps, recalculée seulement
  // quand la fenêtre change (un coup dans la même fenêtre ne la repousse pas).
  function changed(m) {
    m.stateID++;
    m.updatedAt = now();
    const d = fiche.deadline?.(m.G);
    if (!d) m.deadline = null;
    else if (d.key !== m.deadline?.key) m.deadline = { key: d.key, at: m.updatedAt + d.ms };
  }

  function create(table = null, code = null, owner = null) {
    if (matches.size >= MAX_MATCHES) return null;
    if (owner && [...matches.values()].filter((m) => m.owner === owner).length >= MAX_PER_OWNER)
      return null;
    const t = now();
    const m = {
      id: newID(),
      table,
      code,
      owner,
      createdAt: t,
      updatedAt: t,
      stateID: 0,
      G: game.setup({ ctx: { numPlayers } }, { table }),
      players: seats.map(() => ({ name: null, credentials: null })),
    };
    matches.set(m.id, m);
    return m;
  }

  const seatOk = (s) => Number.isInteger(s) && s >= 0 && s < numPlayers;

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
        const started = fiche.started(m.G);
        if (m.players.some((p, s) => p.name && connected(m.id, s))) seen.set(m.id, t);
        if (
          (started && empty) ||
          (started && t - (seen.get(m.id) ?? t) > ABANDON_MS) ||
          (started && t - (m.activeAt ?? m.updatedAt) > AFK_MS) ||
          idle > IDLE_MS ||
          (!started && empty && !m.table && idle > EMPTY_MS) ||
          (!started && m.table && waiting.has(m.table))
        ) {
          matches.delete(m.id);
          seen.delete(m.id);
          removed.push(m.id);
        } else if (!started && m.table) waiting.add(m.table);
      }
      for (let n = 1; n <= PERMANENT_TABLES; n++)
        if (!waiting.has(n)) {
          const m = create(n);
          if (m) created.push(m);
        }
      return { removed, created };
    },

    // Salon temporaire (bouton « Nouveau salon ») ; null au-delà du plafond
    // (le sien, ou celui du site).
    create: (owner = null) => create(null, null, owner),

    // Table privée (un salon temporaire) : { match } ou { error }. Code
    // unique parmi les tables ouvertes : il désigne une seule table.
    createPrivate(raw, owner = null) {
      const code = normCode(raw);
      if (code.length < CODE_MIN) return { error: "CODE_INVALIDE" };
      if ([...matches.values()].some((m) => m.code === code)) return { error: "CODE_PRIS" };
      const match = create(null, code, owner);
      return match ? { match } : { error: "PLEIN" };
    },

    // Liste des salons pour le lobby ; connected(id, siège) : un client de
    // ce siège est-il connecté ? Tables privées : seulement celle du code donné.
    list(connected, code = null) {
      const wanted = normCode(code);
      return [...matches.values()].filter((m) => !m.code || m.code === wanted).map((m) => ({
        matchID: m.id,
        table: m.table,
        code: m.code ?? null,
        phase: phaseOf(m.G),
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
      const G = fiche.takeSeat?.(m.G, seat, pseudo);
      if (G) {
        m.G = G;
        changed(m);
      } else m.updatedAt = now();
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
      if (!m || !seatOk(seat) || !moves.has(name)) return false;
      if (!Array.isArray(args) || args.length > MAX_ARGS) return false;
      const draft = structuredClone(m.G);
      const def = game.moves[name];
      const out = (def.move ?? def)(
        { G: draft, playerID: String(seat), random: { Number: random } },
        ...structuredClone(args),
      );
      if (out === INVALID_MOVE) return false;
      m.G = out === undefined ? draft : out;
      changed(m);
      if (fiche.humanMoves.has(name)) m.activeAt = m.updatedAt;
      return true;
    },

    // Prochaine échéance de toutes les tables (null : aucune), pour l'alarme
    // du serveur.
    nextDeadline() {
      let at = null;
      for (const m of matches.values()) if (m.deadline && (at == null || m.deadline.at < at)) at = m.deadline.at;
      return at;
    },

    // Fenêtres échues : action par défaut de la fiche (le serveur tient les
    // délais, même si tous les téléphones sont en veille), sur une copie.
    // Rend les parties modifiées.
    expire() {
      const t = now();
      const ids = [];
      for (const m of matches.values()) {
        if (!m.deadline || m.deadline.at > t) continue;
        const draft = structuredClone(m.G);
        if (fiche.timeout(draft, m.deadline.key, random)) {
          m.G = draft;
          changed(m);
          ids.push(m.id);
        } else m.deadline = null; // fenêtre déjà fermée : plus rien à attendre
      }
      return ids;
    },

    // Ce qu'un siège (null : spectateur) a le droit de voir. Spectateur :
    // la seule main du joueur qu'il regarde (peek), même si c'est l'hôte.
    view(id, seat, peek = null) {
      const m = matches.get(id);
      let G = game.playerView ? game.playerView({ G: m.G, playerID: seat == null ? null : String(seat) }) : m.G;
      if (seat == null && seatOk(peek) && fiche.spectate) G = fiche.spectate(G, m.G, peek);
      return { G, stateID: m.stateID };
    },
  };
}
