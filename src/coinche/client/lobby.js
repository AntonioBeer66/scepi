// Salons de la coinche : tables permanentes 1 à 4, le salon des règles de
// l'ESSEC (table 5, voir fiche.js) et salons temporaires,
// tenus par le serveur du site (/api, worker/tables.js). On s'assoit avec un
// pseudo, puis n'importe quel joueur assis lance la partie : les places
// vides sont jouées par l'ordinateur. Sans serveur, reste le jeu solo
// contre trois bots. Tables privées : cachées du lobby, on les voit en
// donnant leur code (choisi par celui qui la crée).
// La place occupée (identifiants) est gardée dans ce navigateur : recharger
// la page ramène à la table.
import { CODE_MIN, MAX_NAME, cleanName, normCode } from "../../online/tables.js";
// « t » désigne ici une table presque partout : la traduction s'appelle tr.
import { t as tr } from "./i18n.js";

const API = "/api";
const SESSION_KEY = "scepi-coinche-session";
const SOLO_KEY = "scepi-coinche-solo-match";
const SEAT_LABELS = [tr("Nord", "North"), tr("Est", "East"), tr("Sud", "South"), tr("Ouest", "West")];
const SEAT_TEAM = [tr("Équipe A", "Team A"), tr("Équipe B", "Team B"), tr("Équipe A", "Team A"), tr("Équipe B", "Team B")];
const POLL_MS = 3000;

// Appels à l'API des salons ; une erreur porte le code HTTP (429 : trop de tables).
async function api(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(String(res.status));
    const { error } = await res.json().catch(() => ({}));
    if (error === "PSEUDO_PRIS")
      err.alert = tr(
        "Ce pseudo est déjà pris à cette table : choisis-en un autre.",
        "That nickname is already taken at this table: pick another one.",
      );
    throw err;
  }
  return res.json();
}
const lobbyClient = {
  joinMatch: (matchID, playerID, playerName) =>
    api(`/tables/${encodeURIComponent(matchID)}/join`, { playerID, playerName }),
  leaveMatch: (matchID, playerID, credentials) =>
    api(`/tables/${encodeURIComponent(matchID)}/leave`, { playerID, credentials }),
  createMatch: () => api("/tables", {}),
  createPrivate: (code, regles) => api("/tables", { code, regles }),
};

function esc(str) {
  return String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}
function saveSession(s) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // stockage indisponible (navigation privée) : la place tient le temps de l'onglet
  }
}

let session = loadSession();
let tables = null; // null : serveur pas encore joint ; false : injoignable
let playing = null; // session de jeu en cours (voir session.js)
let pollTimer = null;
let busy = false;
let code = session?.code || null; // table privée affichée (code tapé ou créé)

const $ = (sel) => document.querySelector(sel);

// Le salon public aux règles de l'ESSEC : nom propre (non traduit) et décor à part.
const isAffreux = (t) => !!t.table && t.regles === "essec";

function tableLabel(t, ephemeralIndex) {
  if (isAffreux(t)) return "Table des affreux de Cergy-Pontoise";
  return t.table ? `Table ${t.table}` : tr(`Salon ${ephemeralIndex}`, `Room ${ephemeralIndex}`);
}

// Décor de la table des affreux : la gare de Cergy qui brûle, le butin au
// premier plan, la rubalise d'une scène de crime. Teintes du site seulement :
// nuit violette, or (le feu aussi), filets violet clair.
const AFFREUX_SCENE = `<div class="affreux-scene" aria-hidden="true">
  <svg viewBox="0 0 300 96" preserveAspectRatio="xMidYMax slice">
    <defs>
      <linearGradient id="affreux-ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c0914"/><stop offset="1" stop-color="#1d1233"/></linearGradient>
      <radialGradient id="affreux-lueur" cx="0.68" cy="0.75" r="0.55"><stop offset="0" stop-color="#f4c600" stop-opacity="0.22"/><stop offset="1" stop-color="#f4c600" stop-opacity="0"/></radialGradient>
      <linearGradient id="affreux-flamme" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#c79a00"/><stop offset="0.6" stop-color="#f4c600"/><stop offset="1" stop-color="#fff1a8"/></linearGradient>
    </defs>
    <rect width="300" height="96" fill="url(#affreux-ciel)"/>
    <rect width="300" height="96" fill="url(#affreux-lueur)"/>
    <g fill="#3a2d55" opacity="0.7">
      <ellipse cx="176" cy="20" rx="16" ry="9"/><ellipse cx="198" cy="9" rx="18" ry="9"/>
      <ellipse cx="226" cy="15" rx="15" ry="8"/><ellipse cx="250" cy="6" rx="17" ry="8"/>
    </g>
    <path d="M146 52 L205 36 L264 52 Z" fill="#1d1233"/>
    <rect x="152" y="52" width="106" height="34" fill="#281747"/>
    <path d="M190 22 L205 11 L220 22 Z" fill="#1d1233"/>
    <rect x="194" y="22" width="22" height="30" fill="#281747"/>
    <circle cx="205" cy="33" r="6.5" fill="#f7f4fc"/>
    <path d="M205 33 V28.5 M205 33 H208.5" stroke="#181127" stroke-width="1.3" stroke-linecap="round"/>
    <g fill="#f4c600" opacity="0.55">
      <path d="M160 86 v-14 a6 6 0 0 1 12 0 v14z"/><path d="M178 86 v-14 a6 6 0 0 1 12 0 v14z"/>
      <path d="M220 86 v-14 a6 6 0 0 1 12 0 v14z"/><path d="M238 86 v-14 a6 6 0 0 1 12 0 v14z"/>
    </g>
    <path d="M197 86 v-17 a8 8 0 0 1 16 0 v17z" fill="#f4c600"/>
    <rect x="181" y="55" width="48" height="8" rx="1.5" fill="#120d1d"/>
    <text x="205" y="61.2" text-anchor="middle" font-family="Consolas, monospace" font-size="5.6" letter-spacing="0.6" fill="#f4c600">CERGY-PRÉF.</text>
    <g fill="url(#affreux-flamme)">
      <path class="affreux-flamme" d="M158 50 C152 40 161 35 158 24 C167 31 169 38 172 30 C178 40 177 46 172 50 Z"/>
      <path class="affreux-flamme is-b" d="M232 46 C226 36 236 30 233 17 C242 26 244 33 248 25 C254 37 252 43 246 46 Z"/>
      <path class="affreux-flamme is-c" d="M199 22 C195 15 202 11 201 3 C207 9 209 13 211 8 C215 15 213 19 210 22 Z"/>
    </g>
    <rect y="86" width="300" height="10" fill="#120d1d"/>
    <path d="M0 89.5 H300 M0 93.5 H300" stroke="#4a3d5c" stroke-width="1"/>
    <g fill="#f4c600">
      <path d="M34 88 C24 88 22 74 32 68 L36 64 L32 59 L48 59 L44 64 L48 68 C58 74 56 88 46 88 Z"/>
      <ellipse cx="62" cy="87" rx="4" ry="1.6"/><ellipse cx="70" cy="88.5" rx="3.4" ry="1.4"/>
    </g>
    <text x="40" y="81" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="11" fill="#241a00">€</text>
  </svg>
  <span class="affreux-tape">${tr("SCÈNE DE CRIME · VOL EN COURS · NE PAS FRANCHIR · SCÈNE DE CRIME", "CRIME SCENE · THEFT IN PROGRESS · DO NOT CROSS · CRIME SCENE")}</span>
</div>`;

function seatMarkup(t, p, i, joinLabel = tr("Rejoindre", "Join")) {
  const label = SEAT_LABELS[i];
  const head = `<span class="seat-tag"><b>${label}</b><small>${SEAT_TEAM[i]}</small></span>`;
  const isMe = session?.matchID === t.matchID && session.playerID === String(i);
  if (p.name) {
    return `<li class="seat-row is-taken">${head}
      <span class="seat-occupant">${esc(p.name)}${isMe ? ` <em>(${tr("toi", "you")})</em>` : ""}</span>
      ${isMe ? `<button type="button" class="button outline seat-btn" data-action="leave">${tr("Quitter", "Leave")}</button>` : ""}
    </li>`;
  }
  if (session) {
    return `<li class="seat-row">${head}<span class="seat-empty-note">${tr("Libre", "Open")}${
      session.matchID === t.matchID
        ? tr(" — jouée par l’ordinateur si personne ne la prend", " — played by the computer if nobody takes it")
        : ""
    }</span></li>`;
  }
  const id = `pseudo-${t.matchID}-${i}`;
  return `<li class="seat-row">${head}
    <form class="seat-join-form" data-action="join" data-match="${esc(t.matchID)}" data-seat="${i}">
      <label class="visually-hidden" for="${esc(id)}">${tr(`Pseudo pour la place ${label}`, `Nickname for the ${label} seat`)}</label>
      <input id="${esc(id)}" type="text" name="pseudo" maxlength="${MAX_NAME}" placeholder="${tr("Ton pseudo", "Your nickname")}" autocomplete="nickname" required>
      <button type="submit" class="button primary seat-btn">${joinLabel}</button>
    </form>
  </li>`;
}

function render() {
  const grid = $("#lobby-grid");
  const status = $("#lobby-status");
  if (!grid) return;
  if (tables === false) {
    status.textContent = tr(
      "Serveur de jeu injoignable : le jeu en ligne est indisponible pour l’instant. Tu peux jouer seul contre l’ordinateur.",
      "Game server unreachable: online play is unavailable for now. You can play solo against the computer.",
    );
  } else if (tables === null) {
    status.textContent = tr("Connexion au serveur de jeu…", "Connecting to the game server…");
  } else {
    status.textContent = "";
  }
  const list = (tables || [])
    .filter(
      (t) =>
        t.table ||
        t.phase === "ATTENTE" ||
        t.matchID === session?.matchID ||
        (!session && t.phase !== "TERMINEE"),
    )
    // La table des affreux tout à la fin, après les salons temporaires.
    .sort(
      (a, b) =>
        isAffreux(a) - isAffreux(b) ||
        (a.table ?? 99) - (b.table ?? 99) ||
        a.createdAt - b.createdAt,
    );
  let ephemeral = 0;
  const permanent = Math.max(0, ...list.map((t) => (isAffreux(t) ? 0 : t.table ?? 0)));
  const html = list
    .map((t) => {
      const n = isAffreux(t) ? permanent + ephemeral + 1 : t.table ? t.table : permanent + ++ephemeral;
      const essec = t.regles === "essec" ? ` <span class="lobby-temp-tag">${tr("RÈGLES ESSEC", "ESSEC RULES")}</span>` : "";
      const tag =
        essec +
        (t.table
          ? ""
          : t.code
            ? ` <span class="lobby-temp-tag">${tr("PRIVÉE", "PRIVATE")} · CODE ${esc(t.code)}</span>`
            : ` <span class="lobby-temp-tag">${tr("TEMPORAIRE", "TEMPORARY")}</span>`);
      const filled = t.players.filter((p) => p.name).length;
      const mine = session?.matchID === t.matchID;
      // Partie en cours chez d'autres : on peut la regarder.
      const live = t.phase !== "ATTENTE" && !mine;
      // Places tenues par un bot : on peut les reprendre en cours de partie,
      // et même terminée (la table reste ouverte tant qu'un humain y est).
      const seats = live
        ? t.players
            .map((p, i) =>
              p.name || session
                ? `<li class="seat-row is-taken"><span class="seat-tag"><b>${SEAT_LABELS[i]}</b><small>${SEAT_TEAM[i]}</small></span>
            <span class="seat-occupant">${p.name ? esc(p.name) : tr("Ordinateur", "Computer")}</span></li>`
                : seatMarkup(t, p, i, tr("Remplacer le bot", "Replace the bot")),
            )
            .join("")
        : t.players.map((p, i) => seatMarkup(t, p, i)).join("");
      return `<article class="lobby ${t.table ? "" : "is-ephemeral"}${isAffreux(t) ? " is-affreux" : ""}${live ? " is-live" : ""}">
      ${isAffreux(t) ? AFFREUX_SCENE : ""}
      <span class="eyebrow">${tr("SALON", "ROOM")} ${String(n).padStart(2, "0")}${tag}${live ? ` <span class="lobby-live-tag">${tr("EN JEU", "IN PLAY")}</span>` : ""}</span>
      <h3>${esc(tableLabel(t, ephemeral))}</h3>
      <ul class="seat-list">${seats}</ul>
      <p class="caption">${live ? tr("Partie en cours", "Game in progress") : tr(`${filled}/4 places occupées`, `${filled}/4 seats taken`)} · ${tr("2 équipes", "2 teams")}</p>
      ${mine && t.phase === "ATTENTE" ? `<button type="button" class="button primary seat-btn" data-action="start" data-match="${esc(t.matchID)}">${tr("Lancer la partie", "Start the game")}</button>` : ""}
      ${
        live
          ? `<form class="seat-join-form" data-action="watch" data-match="${esc(t.matchID)}">
        <label class="visually-hidden" for="watch-${esc(t.matchID)}">${tr("Pseudo pour regarder et discuter", "Nickname to watch and chat")}</label>
        <input id="watch-${esc(t.matchID)}" type="text" name="pseudo" maxlength="${MAX_NAME}" placeholder="${tr("Ton pseudo", "Your nickname")}" autocomplete="nickname" required>
        <button type="submit" class="button outline seat-btn">${tr("Regarder", "Watch")}</button>
      </form>`
          : ""
      }
    </article>`;
    })
    .join("");
  // Rafraîchi toutes les quelques secondes : on ne reconstruit que si ça a
  // changé, en gardant les pseudos en cours de saisie et le focus.
  if (html !== grid.dataset.html) {
    const typed = [...grid.querySelectorAll("input")].filter((i) => i.value);
    const focus = document.activeElement?.closest("#lobby-grid") && document.activeElement;
    grid.innerHTML = grid.dataset.html = html;
    for (const old of typed) {
      const input = document.getElementById(old.id);
      if (input) input.value = old.value;
    }
    const again = focus?.id && document.getElementById(focus.id);
    if (again) {
      again.focus();
      if (again.setSelectionRange) again.setSelectionRange(focus.selectionStart, focus.selectionEnd);
    }
  }
  const newBtn = $("#new-lobby-btn");
  if (newBtn) newBtn.disabled = !tables || !!session;
  for (const b of document.querySelectorAll("#private-form button")) b.disabled = !tables || !!session;
}

async function refresh() {
  try {
    // Assis à une table privée : son code, sinon elle disparaîtrait de la liste.
    const c = session ? session.code : code;
    const res = await fetch(`${API}/tables${c ? `?code=${encodeURIComponent(c)}` : ""}`);
    if (!res.ok) throw new Error(res.status);
    tables = await res.json();
  } catch {
    tables = false;
  }
  if (session && tables) {
    const t = tables.find((x) => x.matchID === session.matchID);
    if (!t) {
      session = null; // table disparue (serveur redémarré, partie abandonnée)
      saveSession(null);
    } else if (t.phase !== "ATTENTE" && !playing) {
      enterGame({ online: true });
    }
  }
  if (!playing) render();
}

// Onglet caché sans place prise : plus d'appels au serveur, la liste se
// remet à jour au retour. Assis à une table, on continue (la partie peut
// démarrer pendant qu'il est ailleurs).
function poll() {
  clearTimeout(pollTimer);
  refresh().finally(() => {
    if (!playing && (session || !document.hidden)) pollTimer = setTimeout(poll, POLL_MS);
  });
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !playing) poll();
});

async function act(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (e) {
    const msg = e?.message || "";
    window.alert(
      msg.includes("429")
        ? tr("Trop de tables sont ouvertes : rejoignez-en une existante.", "Too many tables are open: join an existing one.")
        : e?.alert ||
            tr(
              "Action impossible (place prise entre-temps ou serveur injoignable).",
              "Action not possible (seat taken in the meantime or server unreachable).",
            ),
    );
  } finally {
    busy = false;
    poll();
  }
}

// Partie solo en cours (identifiant boardgame.io), pour la reprendre après
// un rechargement ; oubliée en quittant. Les règles de l'ESSEC sont dans
// l'identifiant (« solo-essec-… », lu par session.js) : une partie reprise
// garde ses règles.
function soloID(fresh, regles) {
  try {
    // Nouvelle partie : on repart d'un stockage vide (voir session.js).
    if (fresh)
      for (const k of ["state", "initial", "metadata", "log"])
        localStorage.removeItem(`scepi-coinche-solo_${k}`);
    let id = fresh ? null : localStorage.getItem(SOLO_KEY);
    if (!id) localStorage.setItem(SOLO_KEY, (id = `solo-${regles ? `${regles}-` : ""}${Date.now()}`));
    return id;
  } catch {
    return `solo-${regles ? `${regles}-` : ""}${Date.now()}`;
  }
}

async function enterGame({ online, launch = false, fresh = false, watch = null, watchName = null, regles = null }) {
  // Réservé avant l'import : un rafraîchissement du salon qui aboutit
  // pendant le chargement lancerait sinon une seconde session.
  if (playing) return;
  playing = { stop() {} };
  clearTimeout(pollTimer);
  let startSession;
  try {
    ({ startSession } = await import("./session.js"));
  } catch {
    playing = null; // réseau coupé : le salon reste utilisable
    return poll();
  }
  $("#lobby-section").hidden = true;
  playing = startSession({
    online,
    launch,
    api: API,
    session,
    soloID: online ? null : soloID(fresh, regles),
    watch,
    watchName,
    seatsFromTable: () =>
      (tables || [])
        .find((t) => t.matchID === session?.matchID)
        ?.players.map((p) =>
          p.name ? { type: "human", name: p.name } : { type: "bot" },
        ),
    onExit: async () => {
      playing = null;
      if (!online)
        try {
          localStorage.removeItem(SOLO_KEY);
        } catch {
          // stockage indisponible : rien à oublier
        }
      $("#lobby-section").hidden = false;
      if (online && session && !watch) {
        const { matchID, playerID, credentials } = session;
        session = null;
        saveSession(null);
        await lobbyClient
          .leaveMatch(matchID, playerID, credentials)
          .catch(() => {});
      }
      poll();
    },
  });
}

function init() {
  const grid = $("#lobby-grid");
  if (!grid) return;

  grid.addEventListener("submit", (event) => {
    const form = event.target.closest('[data-action="join"], [data-action="watch"]');
    if (!form) return;
    event.preventDefault();
    // Nettoyé comme sur le serveur : un spectateur reconnaît ses messages.
    const name = cleanName(new FormData(form).get("pseudo").toString());
    if (!name || session) return;
    // Spectateur : son pseudo signe ses messages à la table.
    if (form.dataset.action === "watch") {
      if (!playing) enterGame({ online: true, watch: form.dataset.match, watchName: name });
      return;
    }
    const { match: matchID, seat } = form.dataset;
    act(async () => {
      const { playerCredentials } = await lobbyClient.joinMatch(
        matchID,
        Number(seat),
        name,
      );
      session = { matchID, playerID: seat, credentials: playerCredentials, name, code };
      saveSession(session);
    });
  });

  grid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (!session) return;
    if (button.dataset.action === "leave") {
      const { matchID, playerID, credentials } = session;
      act(async () => {
        await lobbyClient.leaveMatch(matchID, playerID, credentials);
        session = null;
        saveSession(null);
      });
    } else if (button.dataset.action === "start" && !busy) {
      // Places relues juste avant : le salon affiché peut dater de quelques
      // secondes, et un joueur tout juste assis serait lancé comme bot.
      busy = true;
      refresh()
        .then(() => !playing && enterGame({ online: true, launch: true }))
        .finally(() => (busy = false));
    }
  });

  $("#new-lobby-btn")?.addEventListener("click", () => {
    if (session) return;
    act(() => lobbyClient.createMatch());
  });

  // Table privée : « Créer » l'ouvre avec ce code, « Rejoindre » (ou
  // Entrée) l'affiche dans la liste, si elle existe.
  const privateForm = $("#private-form");
  const openPrivate = (create) => {
    const c = normCode(privateForm.elements.code.value);
    if (session) return;
    if (c.length < CODE_MIN)
      return window.alert(
        tr(`Le code fait au moins ${CODE_MIN} caractères.`, `The code must be at least ${CODE_MIN} characters long.`),
      );
    act(async () => {
      if (create)
        await lobbyClient.createPrivate(c, privateForm.elements.essec.checked ? "essec" : null).catch((e) => {
          if (e.message === "409")
            e.alert = tr("Ce code est déjà pris : choisissez-en un autre.", "That code is already taken: choose another one.");
          throw e;
        });
      code = c;
      await refresh();
      if (tables && !tables.some((t) => t.code === c)) {
        code = null;
        throw Object.assign(new Error(), {
          alert: tr("Aucune table privée avec ce code.", "No private table with that code."),
        });
      }
    });
  };
  privateForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    openPrivate(false);
  });
  $("#private-create-btn")?.addEventListener("click", () => openPrivate(true));

  const soloBtn = $("#solo-btn");
  soloBtn?.addEventListener("click", () => {
    if (playing) return;
    enterGame({ online: false, fresh: true });
  });
  if (soloBtn) soloBtn.disabled = false;
  const soloEssecBtn = $("#solo-essec-btn");
  soloEssecBtn?.addEventListener("click", () => {
    if (playing) return;
    enterGame({ online: false, fresh: true, regles: "essec" });
  });
  if (soloEssecBtn) soloEssecBtn.disabled = false;

  // Rechargé en pleine partie solo : on y retourne.
  let resume = null;
  try {
    resume = localStorage.getItem(SOLO_KEY);
  } catch {
    // stockage indisponible
  }
  if (resume && !session) enterGame({ online: false });
  else poll();
}

init();
