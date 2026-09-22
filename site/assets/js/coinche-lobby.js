// Maquette d'UX pour le choix de table de coinche.
// État stocké en localStorage : simulation locale au navigateur, pas encore un
// vrai multijoueur partagé. Quand le serveur temps réel décrit dans
// TECHNIQUE.md (section 6, WebSocket) existera, remplacer les fonctions
// loadState/saveState par des messages serveur et garder le même rendu.

const STORAGE_KEY = 'scepi-coinche-lobbies-v1';
const CLIENT_ID_KEY = 'scepi-coinche-client-id';
const SEAT_LABELS = ['Nord', 'Est', 'Sud', 'Ouest'];
const SEAT_TEAM = ['Équipe A', 'Équipe B', 'Équipe A', 'Équipe B'];
const PERMANENT_COUNT = 4;

function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = 'p-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function defaultState() {
  const lobbies = {};
  for (let i = 1; i <= PERMANENT_COUNT; i++) {
    lobbies['table-' + i] = { number: i, ephemeral: false, seats: [null, null, null, null] };
  }
  return lobbies;
}

// Un salon créé via « Nouveau lobby » ne vit que le temps d'une partie : une
// fois qu'un premier joueur humain l'a rejoint puis que tout le monde est
// reparti, il est retiré à la prochaine lecture de l'état. Un salon tout
// juste créé (encore vide) n'est jamais supprimé avant d'avoir eu sa chance
// d'être rejoint.
function cleanupEphemeralLobbies(state) {
  let changed = false;
  for (const [id, lobby] of Object.entries(state)) {
    if (!lobby.ephemeral) continue;
    const hasHuman = lobby.seats.some((s) => s && s.type === 'human');
    if (hasHuman) { lobby.hadHuman = true; continue; }
    if (lobby.hadHuman) { delete state[id]; changed = true; }
  }
  return changed;
}

// D'anciennes données locales (enregistrées avant l'ajout des salons
// temporaires) peuvent ne pas avoir de champ `number`/`ephemeral` : on les
// répare plutôt que d'afficher « Table undefined ».
function normalizeLobbies(state) {
  let changed = false;
  let nextNumber = PERMANENT_COUNT;
  for (let i = 1; i <= PERMANENT_COUNT; i++) {
    const lobby = state['table-' + i];
    if (lobby && (lobby.number !== i || lobby.ephemeral !== false)) {
      lobby.number = i;
      lobby.ephemeral = false;
      changed = true;
    }
  }
  for (const [id, lobby] of Object.entries(state)) {
    if (id.startsWith('table-') && Number(id.slice(6)) <= PERMANENT_COUNT) continue;
    if (typeof lobby.number !== 'number') {
      nextNumber = Math.max(nextNumber, ...Object.values(state).map((l) => l.number || 0)) + 1;
      lobby.number = nextNumber;
      changed = true;
    }
    if (lobby.ephemeral === undefined) { lobby.ephemeral = true; changed = true; }
  }
  return changed;
}

function loadState() {
  let state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
  } catch {
    state = defaultState();
  }
  const normalized = normalizeLobbies(state);
  const cleaned = cleanupEphemeralLobbies(state);
  if (normalized || cleaned) saveState(state);
  return state;
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function nextLobbyNumber(state) {
  const numbers = Object.values(state).map((l) => l.number || 0);
  return Math.max(PERMANENT_COUNT, ...numbers) + 1;
}

function createEphemeralLobby(state) {
  const number = nextLobbyNumber(state);
  const id = 'lobby-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  state[id] = { number, ephemeral: true, seats: [null, null, null, null] };
  return id;
}

// Le « maître » d'un salon est le premier joueur humain à s'y être assis, ou
// à défaut le suivant dans l'ordre des sièges s'il est parti entre-temps.
// Lui seul peut virer un bot d'une place pour la rendre libre.
function lobbyMasterClientId(lobby) {
  const humans = lobby.seats.filter((s) => s && s.type === 'human');
  return humans.length ? humans[0].clientId : null;
}

function findMySeat(state, clientId) {
  for (const [lobbyId, lobby] of Object.entries(state)) {
    const seatIndex = lobby.seats.findIndex((s) => s && s.clientId === clientId);
    if (seatIndex !== -1) return { lobbyId, seatIndex };
  }
  return null;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function seatMarkup(lobbyId, seat, index, clientId, mySeat, lobby) {
  const label = SEAT_LABELS[index];
  const team = SEAT_TEAM[index];
  const busyElsewhere = mySeat && (mySeat.lobbyId !== lobbyId || mySeat.seatIndex !== index);
  const isMaster = lobbyMasterClientId(lobby) === clientId;

  if (!seat) {
    if (busyElsewhere) {
      return `<li class="seat-row" data-lobby="${lobbyId}" data-seat="${index}">
        <span class="seat-tag"><b>${label}</b><small>${team}</small></span>
        <span class="seat-empty-note">Libre — quittez votre table actuelle pour rejoindre</span>
      </li>`;
    }
    return `<li class="seat-row" data-lobby="${lobbyId}" data-seat="${index}">
      <span class="seat-tag"><b>${label}</b><small>${team}</small></span>
      <form class="seat-join-form" data-action="join">
        <input type="text" name="pseudo" maxlength="18" placeholder="Votre pseudo" aria-label="Pseudo pour ${label}" required>
        <button type="submit" class="button primary seat-btn">Rejoindre</button>
      </form>
      <button type="button" class="button outline seat-btn" data-action="bot">Laisser jouer l'ordinateur</button>
    </li>`;
  }

  if (seat.type === 'bot') {
    return `<li class="seat-row is-taken" data-lobby="${lobbyId}" data-seat="${index}">
      <span class="seat-tag"><b>${label}</b><small>${team}</small></span>
      <span class="seat-occupant cpu">Ordinateur <span class="cpu-badge">CPU</span></span>
      ${busyElsewhere ? '' : '<button type="button" class="button outline seat-btn" data-action="take-over">Prendre cette place</button>'}
      ${isMaster ? '<button type="button" class="button outline seat-btn seat-kick" data-action="kick" title="Le maître du salon peut libérer cette place">Kick le bot</button>' : ''}
    </li>`;
  }

  const isMe = seat.clientId === clientId;
  return `<li class="seat-row is-taken" data-lobby="${lobbyId}" data-seat="${index}">
    <span class="seat-tag"><b>${label}</b><small>${team}</small></span>
    <span class="seat-occupant">${escapeHtml(seat.name)}${isMe ? ' <em>(vous)</em>' : ''}</span>
    ${isMe ? '<button type="button" class="button outline seat-btn" data-action="leave">Quitter</button>' : ''}
  </li>`;
}

function render(grid, state, clientId) {
  const mySeat = findMySeat(state, clientId);
  const ordered = Object.entries(state).sort((a, b) => (a[1].number || 0) - (b[1].number || 0));

  grid.innerHTML = ordered.map(([lobbyId, lobby]) => {
    const filled = lobby.seats.filter(Boolean).length;
    const canStart = mySeat && mySeat.lobbyId === lobbyId;
    const number = String(lobby.number).padStart(2, '0');
    return `<article class="lobby ${lobby.ephemeral ? 'is-ephemeral' : ''}" data-lobby="${lobbyId}">
      <span class="eyebrow">SALON ${number}${lobby.ephemeral ? ' <span class="lobby-temp-tag">TEMPORAIRE</span>' : ''}</span>
      <h3>Table ${lobby.number}</h3>
      <ul class="seat-list">
        ${lobby.seats.map((seat, i) => seatMarkup(lobbyId, seat, i, clientId, mySeat, lobby)).join('')}
      </ul>
      <p class="caption">${filled}/4 places occupées · 2 équipes</p>
      ${canStart ? `<button type="button" class="button primary seat-btn" data-action="start" data-lobby="${lobbyId}">Lancer la partie</button>` : ''}
    </article>`;
  }).join('');
}

function init() {
  const grid = document.querySelector('#lobby-grid');
  const newLobbyBtn = document.querySelector('#new-lobby-btn');
  if (!grid) return;

  const clientId = getClientId();
  let state = loadState();
  render(grid, state, clientId);

  function refresh() {
    state = loadState();
    render(grid, state, clientId);
  }

  grid.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-action="join"]');
    if (!form) return;
    event.preventDefault();
    const seatRow = form.closest('.seat-row');
    const lobbyId = seatRow.dataset.lobby;
    const seatIndex = Number(seatRow.dataset.seat);
    const pseudo = new FormData(form).get('pseudo').toString().trim();
    if (!pseudo) return;

    state = loadState();
    if (findMySeat(state, clientId)) return; // déjà installé ailleurs
    if (!state[lobbyId] || state[lobbyId].seats[seatIndex]) return; // salon disparu ou siège pris entre-temps
    state[lobbyId].seats[seatIndex] = { name: pseudo.slice(0, 18), type: 'human', clientId };
    saveState(state);
    render(grid, state, clientId);
  });

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    if (button.dataset.action === 'start') {
      startTable(button.dataset.lobby);
      return;
    }

    const seatRow = button.closest('.seat-row');
    const lobbyId = seatRow.dataset.lobby;
    const seatIndex = Number(seatRow.dataset.seat);
    const action = button.dataset.action;

    state = loadState();
    if (!state[lobbyId]) { render(grid, state, clientId); return; }
    const seat = state[lobbyId].seats[seatIndex];

    if (action === 'bot' && !seat) {
      state[lobbyId].seats[seatIndex] = { type: 'bot' };
    } else if (action === 'kick' && seat && seat.type === 'bot') {
      if (lobbyMasterClientId(state[lobbyId]) !== clientId) return;
      state[lobbyId].seats[seatIndex] = null;
    } else if (action === 'take-over' && seat && seat.type === 'bot') {
      if (findMySeat(state, clientId)) return;
      const pseudo = window.prompt('Votre pseudo pour prendre cette place ?');
      if (!pseudo || !pseudo.trim()) return;
      state[lobbyId].seats[seatIndex] = { name: pseudo.trim().slice(0, 18), type: 'human', clientId };
    } else if (action === 'leave' && seat && seat.clientId === clientId) {
      state[lobbyId].seats[seatIndex] = null;
    } else {
      return;
    }

    saveState(state);
    state = loadState(); // purge immédiate si le salon quitté vient de se vider
    render(grid, state, clientId);
  });

  if (newLobbyBtn) {
    newLobbyBtn.addEventListener('click', () => {
      state = loadState();
      if (findMySeat(state, clientId)) {
        window.alert('Quittez votre table actuelle avant d’en ouvrir une nouvelle.');
        return;
      }
      const id = createEphemeralLobby(state);
      saveState(state);
      render(grid, state, clientId);
      document.querySelector(`[data-lobby="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) refresh();
  });

  function startTable(lobbyId) {
    if (!window.SCEPICoincheGame) return;
    state = loadState();
    const mySeat = findMySeat(state, clientId);
    if (!mySeat || mySeat.lobbyId !== lobbyId) return;

    const lobby = state[lobbyId];
    lobby.seats = lobby.seats.map((seat) => seat || { type: 'bot' });
    saveState(state);
    render(grid, state, clientId);

    const lobbySection = document.querySelector('#lobby-section');
    if (lobbySection) lobbySection.hidden = true;

    const seatsForGame = lobby.seats.map((seat) => ({
      name: seat.type === 'bot' ? 'Ordinateur' : seat.name,
      type: seat.type,
    }));

    window.SCEPICoincheGame.start(seatsForGame, mySeat.seatIndex, () => {
      if (lobbySection) lobbySection.hidden = false;
      refresh();
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
