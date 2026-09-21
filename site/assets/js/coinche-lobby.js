// Maquette d'UX pour le choix de table de coinche.
// État stocké en localStorage : simulation locale au navigateur, pas encore un
// vrai multijoueur partagé. Quand le serveur temps réel décrit dans
// TECHNIQUE.md (section 6, WebSocket) existera, remplacer les fonctions
// loadState/saveState par des messages serveur et garder le même rendu.

const STORAGE_KEY = 'scepi-coinche-lobbies-v1';
const CLIENT_ID_KEY = 'scepi-coinche-client-id';
const SEAT_LABELS = ['Nord', 'Est', 'Sud', 'Ouest'];
const SEAT_TEAM = ['Équipe A', 'Équipe B', 'Équipe A', 'Équipe B'];

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
  for (let i = 1; i <= 4; i++) {
    lobbies['table-' + i] = { seats: [null, null, null, null] };
  }
  return lobbies;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function seatMarkup(lobbyId, seat, index, clientId, mySeat) {
  const label = SEAT_LABELS[index];
  const team = SEAT_TEAM[index];
  const busyElsewhere = mySeat && (mySeat.lobbyId !== lobbyId || mySeat.seatIndex !== index);

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
  const lobbyNames = { 'table-1': '1', 'table-2': '2', 'table-3': '3', 'table-4': '4' };

  grid.innerHTML = Object.entries(state).map(([lobbyId, lobby]) => {
    const filled = lobby.seats.filter(Boolean).length;
    return `<article class="lobby" data-lobby="${lobbyId}">
      <span class="eyebrow">SALON 0${lobbyNames[lobbyId]}</span>
      <h3>Table ${lobbyNames[lobbyId]}</h3>
      <ul class="seat-list">
        ${lobby.seats.map((seat, i) => seatMarkup(lobbyId, seat, i, clientId, mySeat)).join('')}
      </ul>
      <p class="caption">${filled}/4 places occupées · 2 équipes</p>
    </article>`;
  }).join('');
}

function init() {
  const grid = document.querySelector('#lobby-grid');
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
    if (state[lobbyId].seats[seatIndex]) return; // siège pris entre-temps
    state[lobbyId].seats[seatIndex] = { name: pseudo.slice(0, 18), type: 'human', clientId };
    saveState(state);
    render(grid, state, clientId);
  });

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const seatRow = button.closest('.seat-row');
    const lobbyId = seatRow.dataset.lobby;
    const seatIndex = Number(seatRow.dataset.seat);
    const action = button.dataset.action;

    state = loadState();
    const seat = state[lobbyId].seats[seatIndex];

    if (action === 'bot' && !seat) {
      state[lobbyId].seats[seatIndex] = { type: 'bot' };
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
    render(grid, state, clientId);
  });

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) refresh();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
