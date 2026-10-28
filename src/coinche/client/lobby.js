// Salons de la coinche : tables permanentes 1 à 4 et salons temporaires,
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
  createPrivate: (code) => api("/tables", { code }),
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

function tableLabel(t, ephemeralIndex) {
  return t.table ? `Table ${t.table}` : tr(`Salon ${ephemeralIndex}`, `Room ${ephemeralIndex}`);
}

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
    .sort(
      (a, b) =>
        (a.table ?? 99) - (b.table ?? 99) || a.createdAt - b.createdAt,
    );
  let ephemeral = 0;
  const html = list
    .map((t) => {
      const n = t.table ? t.table : 4 + ++ephemeral;
      const tag = t.table
        ? ""
        : t.code
          ? ` <span class="lobby-temp-tag">${tr("PRIVÉE", "PRIVATE")} · CODE ${esc(t.code)}</span>`
          : ` <span class="lobby-temp-tag">${tr("TEMPORAIRE", "TEMPORARY")}</span>`;
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
      return `<article class="lobby ${t.table ? "" : "is-ephemeral"}${live ? " is-live" : ""}">
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
// un rechargement ; oubliée en quittant.
function soloID(fresh) {
  try {
    // Nouvelle partie : on repart d'un stockage vide (voir session.js).
    if (fresh)
      for (const k of ["state", "initial", "metadata", "log"])
        localStorage.removeItem(`scepi-coinche-solo_${k}`);
    let id = fresh ? null : localStorage.getItem(SOLO_KEY);
    if (!id) localStorage.setItem(SOLO_KEY, (id = `solo-${Date.now()}`));
    return id;
  } catch {
    return `solo-${Date.now()}`;
  }
}

async function enterGame({ online, launch = false, fresh = false, watch = null, watchName = null }) {
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
    soloID: online ? null : soloID(fresh),
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
        await lobbyClient.createPrivate(c).catch((e) => {
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
