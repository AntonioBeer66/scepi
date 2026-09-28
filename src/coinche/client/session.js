// Une partie à l'écran : le client boardgame.io (en ligne par WebSocket, ou
// en solo avec le serveur local dans l'onglet), la table Phaser, les
// commandes HTML et, si ce navigateur est l'hôte, les bots et les délais.
import { Client } from "boardgame.io/client";
import { Local, SocketIO } from "boardgame.io/multiplayer";
import { Coinche } from "../game.js";
import { createHost } from "../host.js";
import { createHud } from "./hud.js";
import { createTable } from "./table-scene.js";

const SOLO_SEATS = [
  { type: "human", name: "Vous" },
  { type: "bot" },
  { type: "bot" },
  { type: "bot" },
];

export function startSession({ online, launch, server, session, seatsFromTable, onExit }) {
  const playerID = online ? session.playerID : "0";
  const me = Number(playerID);
  const client = Client({
    game: Coinche,
    numPlayers: 4,
    playerID,
    debug: false,
    ...(online
      ? {
          multiplayer: SocketIO({ server }),
          matchID: session.matchID,
          credentials: session.credentials,
        }
      : { multiplayer: Local() }),
  });

  const view = document.querySelector("#game-view");
  view.hidden = false;
  document.body.classList.add("is-playing");

  const host = createHost({
    send: (seat, action) => client.moves.pourSiege(seat, action),
  });
  const table = createTable(view.querySelector("#coinche-stage"), {
    me,
    onPlay: (id) => client.moves.agir({ type: "JOUER", carte: { id } }),
  });
  const hud = createHud(view, {
    me,
    onAction: (action) => client.moves.agir(action),
    onRelaunch: (seats) => client.moves.lancer(seats),
    onQuit: stop,
    onFocusCard: (id) => table.focusCard(id),
  });

  let launched = false;
  let prev = null;
  let hostTried = null;

  // Hôte absent : le premier humain connecté reprend le rôle. Humain parti
  // pour de bon (place libérée) : l'hôte le remplace par l'ordinateur.
  function watchSeats(G) {
    const data = client.matchData;
    if (!online || !data) return;
    const connected = (s) => data[s]?.isConnected;
    if (G.hote !== me && !connected(G.hote) && hostTried !== G.hote) {
      const first = [0, 1, 2, 3].find(
        (s) => G.seats[s].type === "human" && connected(s),
      );
      if (first === me) {
        hostTried = G.hote;
        client.moves.reprendreHote();
      }
    }
    if (G.hote === me)
      for (const s of [0, 1, 2, 3])
        if (s !== me && G.seats[s].type === "human" && data[s] && !data[s].name)
          client.moves.devenirBot(s);
  }

  client.subscribe((state) => {
    if (!state) return;
    const G = state.G;
    if (G.phase === "ATTENTE") {
      if (!launched && (launch || !online)) {
        const seats = online ? seatsFromTable() : SOLO_SEATS;
        if (seats) {
          launched = true;
          client.moves.lancer(seats);
        }
      }
      hud.waiting();
      return;
    }
    if (!G.seats) return;
    if (G.hote === me) {
      if (prev && G.donneNumero < prev.donneNumero) host.stop(); // partie relancée
      host.update(G);
    } else host.stop();
    watchSeats(G);
    hud.update(G, prev);
    table.update(G, prev);
    prev = G;
  });
  client.start();

  function stop() {
    host.stop();
    client.stop();
    table.destroy();
    hud.destroy();
    view.hidden = true;
    document.body.classList.remove("is-playing");
    onExit();
  }

  return { stop };
}
