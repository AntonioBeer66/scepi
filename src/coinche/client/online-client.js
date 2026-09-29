// Client d'une partie en ligne (WebSocket vers worker/tables.js), avec la
// même interface que le client boardgame.io qu'utilise session.js :
// moves.<coup>(...args), subscribe(fn), getState(), matchData, start(), stop().
// Reconnexion automatique (délai croissant) si la connexion tombe.
export function OnlineClient({ api, matchID, playerID, credentials }) {
  let ws = null;
  let state = null;
  let stopped = false;
  let retry = 0;
  let timer = null;
  const subs = new Set();
  const notify = () => subs.forEach((fn) => fn(state));

  const client = {
    matchData: null,
    // Coup envoyé tel quel : le serveur le valide (game.js) et renvoie l'état.
    moves: new Proxy(
      {},
      {
        get:
          (_, name) =>
          (...args) => {
            if (ws?.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: "move", name, args }));
          },
      },
    ),
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    getState: () => state,
    start: connect,
    stop() {
      stopped = true;
      clearTimeout(timer);
      ws?.close(1000);
      subs.clear();
    },
  };

  function connect() {
    const base = new URL(`${api}/tables/${encodeURIComponent(matchID)}/ws`, location.href);
    base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(base);
    ws.onopen = () => {
      retry = 0;
      // Identifiants dans le premier message plutôt que dans l'adresse.
      ws.send(JSON.stringify({ type: "hello", playerID, credentials }));
    };
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type !== "state") return;
      client.matchData = msg.players;
      state = { G: msg.G, _stateID: msg.stateID, isConnected: true };
      notify();
    };
    ws.onclose = (event) => {
      if (stopped) return;
      if (state) {
        state = { ...state, isConnected: false };
        notify();
      }
      // Table fermée (abandonnée, effacée) : inutile d'insister.
      if (event.code === 4404) return;
      timer = setTimeout(connect, Math.min(10000, 500 * 2 ** retry++));
    };
  }

  return client;
}
