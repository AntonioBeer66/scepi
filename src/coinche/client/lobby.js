// Salons de la coinche : tables permanentes 1 à 4 et salons temporaires,
// tenus par le serveur du site (/api, worker/tables.js). On s'assoit avec un
// pseudo, puis n'importe quel joueur assis lance la partie : les places
// vides sont jouées par l'ordinateur. Sans serveur, reste le jeu solo
// contre trois bots.
// La place occupée (identifiants) est gardée dans ce navigateur : recharger
// la page ramène à la table.
import { MAX_NAME } from "../game.js";

const API = "/api";
const SESSION_KEY = "scepi-coinche-session";
const SOLO_KEY = "scepi-coinche-solo-match";
const SEAT_LABELS = ["Nord", "Est", "Sud", "Ouest"];
const SEAT_TEAM = ["Équipe A", "Équipe B", "Équipe A", "Équipe B"];
const POLL_MS = 3000;

// Appels à l'API des salons ; une erreur porte le code HTTP (429 : trop de tables).
async function api(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}
const lobbyClient = {
  joinMatch: (matchID, playerID, playerName) =>
    api(`/tables/${encodeURIComponent(matchID)}/join`, { playerID, playerName }),
  leaveMatch: (matchID, playerID, credentials) =>
    api(`/tables/${encodeURIComponent(matchID)}/leave`, { playerID, credentials }),
  createMatch: () => api("/tables", {}),
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

const $ = (sel) => document.querySelector(sel);

function tableLabel(t, ephemeralIndex) {
  return t.table ? `Table ${t.table}` : `Salon ${ephemeralIndex}`;
}

function seatMarkup(t, p, i, joinLabel = "Rejoindre") {
  const label = SEAT_LABELS[i];
  const head = `<span class="seat-tag"><b>${label}</b><small>${SEAT_TEAM[i]}</small></span>`;
  const isMe = session?.matchID === t.matchID && session.playerID === String(i);
  if (p.name) {
    return `<li class="seat-row is-taken">${head}
      <span class="seat-occupant">${esc(p.name)}${isMe ? " <em>(vous)</em>" : ""}</span>
      ${isMe ? '<button type="button" class="button outline seat-btn" data-action="leave">Quitter</button>' : ""}
    </li>`;
  }
  if (session) {
    return `<li class="seat-row">${head}<span class="seat-empty-note">Libre${
      session.matchID === t.matchID ? " — jouée par l’ordinateur si personne ne la prend" : ""
    }</span></li>`;
  }
  const id = `pseudo-${t.matchID}-${i}`;
  return `<li class="seat-row">${head}
    <form class="seat-join-form" data-action="join" data-match="${esc(t.matchID)}" data-seat="${i}">
      <label class="visually-hidden" for="${esc(id)}">Pseudo pour la place ${label}</label>
      <input id="${esc(id)}" type="text" name="pseudo" maxlength="${MAX_NAME}" placeholder="Votre pseudo" autocomplete="nickname" required>
      <button type="submit" class="button primary seat-btn">${joinLabel}</button>
    </form>
  </li>`;
}

function render() {
  const grid = $("#lobby-grid");
  const status = $("#lobby-status");
  if (!grid) return;
  if (tables === false) {
    status.textContent =
      "Serveur de jeu injoignable : le jeu en ligne est indisponible pour l’instant. Vous pouvez jouer seul contre l’ordinateur.";
  } else if (tables === null) {
    status.textContent =
      "Connexion au serveur de jeu…";
  } else {
    status.textContent = "";
  }
  const list = (tables || [])
    .filter(
      (t) =>
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
      const filled = t.players.filter((p) => p.name).length;
      const mine = session?.matchID === t.matchID;
      // Partie en cours chez d'autres : on peut la regarder.
      const live = t.phase !== "ATTENTE" && !mine;
      // Places tenues par un bot : on peut les reprendre en cours de partie.
      const seats = live
        ? t.players
            .map((p, i) =>
              p.name || session || t.phase === "TERMINEE"
                ? `<li class="seat-row is-taken"><span class="seat-tag"><b>${SEAT_LABELS[i]}</b><small>${SEAT_TEAM[i]}</small></span>
            <span class="seat-occupant">${p.name ? esc(p.name) : "Ordinateur"}</span></li>`
                : seatMarkup(t, p, i, "Remplacer le bot"),
            )
            .join("")
        : t.players.map((p, i) => seatMarkup(t, p, i)).join("");
      return `<article class="lobby ${t.table ? "" : "is-ephemeral"}${live ? " is-live" : ""}">
      <span class="eyebrow">SALON ${String(n).padStart(2, "0")}${t.table ? "" : ' <span class="lobby-temp-tag">TEMPORAIRE</span>'}${live ? ' <span class="lobby-live-tag">EN JEU</span>' : ""}</span>
      <h3>${esc(tableLabel(t, ephemeral))}</h3>
      <ul class="seat-list">${seats}</ul>
      <p class="caption">${live ? "Partie en cours" : `${filled}/4 places occupées`} · 2 équipes</p>
      ${mine && t.phase === "ATTENTE" ? `<button type="button" class="button primary seat-btn" data-action="start" data-match="${esc(t.matchID)}">Lancer la partie</button>` : ""}
      ${live ? `<button type="button" class="button outline seat-btn" data-action="watch" data-match="${esc(t.matchID)}">Regarder</button>` : ""}
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
}

async function refresh() {
  try {
    const res = await fetch(`${API}/tables`);
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

function poll() {
  clearTimeout(pollTimer);
  refresh().finally(() => {
    if (!playing) pollTimer = setTimeout(poll, POLL_MS);
  });
}

async function act(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
  } catch (e) {
    const msg = e?.message || "";
    window.alert(
      msg.includes("429")
        ? "Trop de tables sont ouvertes : rejoignez-en une existante."
        : "Action impossible (place prise entre-temps ou serveur injoignable).",
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

async function enterGame({ online, launch = false, fresh = false, watch = null }) {
  clearTimeout(pollTimer);
  const { startSession } = await import("./session.js");
  $("#lobby-section").hidden = true;
  playing = startSession({
    online,
    launch,
    api: API,
    session,
    soloID: online ? null : soloID(fresh),
    watch,
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
    const form = event.target.closest('[data-action="join"]');
    if (!form) return;
    event.preventDefault();
    const name = new FormData(form).get("pseudo").toString().trim().slice(0, MAX_NAME);
    if (!name || session) return;
    const { match: matchID, seat } = form.dataset;
    act(async () => {
      const { playerCredentials } = await lobbyClient.joinMatch(
        matchID,
        Number(seat),
        name,
      );
      session = { matchID, playerID: seat, credentials: playerCredentials, name };
      saveSession(session);
    });
  });

  grid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "watch" && !session && !playing) {
      enterGame({ online: true, watch: button.dataset.match });
      return;
    }
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
