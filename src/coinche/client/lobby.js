// Salons de la coinche : tables permanentes 1 à 4 et salons temporaires,
// tenus par le serveur (server/index.js). On s'assoit avec un pseudo, puis
// n'importe quel joueur assis lance la partie : les places vides sont
// jouées par l'ordinateur. Sans serveur, reste le jeu solo contre trois bots.
// La place occupée (identifiants boardgame.io) est gardée dans ce navigateur :
// recharger la page ramène à la table.
import { LobbyClient } from "boardgame.io/client";
import { MAX_NAME } from "../game.js";

const SERVER =
  import.meta.env.VITE_COINCHE_SERVER ||
  `${location.protocol}//${location.hostname}:8001`;
const SESSION_KEY = "scepi-coinche-session";
const SEAT_LABELS = ["Nord", "Est", "Sud", "Ouest"];
const SEAT_TEAM = ["Équipe A", "Équipe B", "Équipe A", "Équipe B"];
const POLL_MS = 3000;

const lobbyClient = new LobbyClient({ server: SERVER });

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

function seatMarkup(t, p, i) {
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
      <button type="submit" class="button primary seat-btn">Rejoindre</button>
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
    status.textContent = "Connexion au serveur de jeu…";
  } else {
    status.textContent = "";
  }
  const list = (tables || [])
    .filter((t) => t.phase === "ATTENTE" || t.matchID === session?.matchID)
    .sort(
      (a, b) =>
        (a.table ?? 99) - (b.table ?? 99) || a.createdAt - b.createdAt,
    );
  let ephemeral = 0;
  grid.innerHTML = list
    .map((t) => {
      const n = t.table ? t.table : 4 + ++ephemeral;
      const filled = t.players.filter((p) => p.name).length;
      const mine = session?.matchID === t.matchID;
      return `<article class="lobby ${t.table ? "" : "is-ephemeral"}">
      <span class="eyebrow">SALON ${String(n).padStart(2, "0")}${t.table ? "" : ' <span class="lobby-temp-tag">TEMPORAIRE</span>'}</span>
      <h3>${esc(tableLabel(t, ephemeral))}</h3>
      <ul class="seat-list">${t.players.map((p, i) => seatMarkup(t, p, i)).join("")}</ul>
      <p class="caption">${filled}/4 places occupées · 2 équipes</p>
      ${mine && t.phase === "ATTENTE" ? `<button type="button" class="button primary seat-btn" data-action="start" data-match="${esc(t.matchID)}">Lancer la partie</button>` : ""}
    </article>`;
    })
    .join("");
  const newBtn = $("#new-lobby-btn");
  if (newBtn) newBtn.disabled = !tables || !!session;
}

async function refresh() {
  try {
    const res = await fetch(`${SERVER}/tables`);
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
    const msg = e?.details?.message || e?.message || "";
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

async function enterGame({ online, launch = false }) {
  clearTimeout(pollTimer);
  const { startSession } = await import("./session.js");
  $("#lobby-section").hidden = true;
  playing = startSession({
    online,
    launch,
    server: SERVER,
    session,
    seatsFromTable: () =>
      (tables || [])
        .find((t) => t.matchID === session?.matchID)
        ?.players.map((p) =>
          p.name ? { type: "human", name: p.name } : { type: "bot" },
        ),
    onExit: async () => {
      playing = null;
      $("#lobby-section").hidden = false;
      if (online && session) {
        const { matchID, playerID, credentials } = session;
        session = null;
        saveSession(null);
        await lobbyClient
          .leaveMatch("coinche", matchID, { playerID, credentials })
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
      const { playerCredentials } = await lobbyClient.joinMatch("coinche", matchID, {
        playerID: seat,
        playerName: name,
      });
      session = { matchID, playerID: seat, credentials: playerCredentials, name };
      saveSession(session);
    });
  });

  grid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || !session) return;
    if (button.dataset.action === "leave") {
      const { matchID, playerID, credentials } = session;
      act(async () => {
        await lobbyClient.leaveMatch("coinche", matchID, { playerID, credentials });
        session = null;
        saveSession(null);
      });
    } else if (button.dataset.action === "start") {
      enterGame({ online: true, launch: true });
    }
  });

  $("#new-lobby-btn")?.addEventListener("click", () => {
    if (session) return;
    act(() => lobbyClient.createMatch("coinche", { numPlayers: 4 }));
  });

  $("#solo-btn")?.addEventListener("click", () => {
    if (playing) return;
    enterGame({ online: false });
  });

  poll();
}

init();
