// Une partie à l'écran : le client de jeu (en ligne : WebSocket vers le
// serveur du site, voir online-client.js ; en solo : boardgame.io avec son
// serveur local dans l'onglet), la table Phaser, les commandes HTML et, si
// ce navigateur est l'hôte, les bots et les délais.
import { Client } from "boardgame.io/client";
import { Local } from "boardgame.io/multiplayer";
import { Coinche } from "../game.js";
import { trickPause } from "../host.js";
import { createHud } from "./hud.js";
import { OnlineClient } from "./online-client.js";
import { createTable } from "./table-scene.js";

const SOLO_SEATS = [
  { type: "human", name: "Vous" },
  { type: "bot" },
  { type: "bot" },
  { type: "bot" },
];

const SOLO_STORAGE = "scepi-coinche-solo";

export function startSession({
  online,
  launch,
  api,
  session,
  soloID,
  watch, // matchID d'une partie à regarder en spectateur
  seatsFromTable,
  onExit,
}) {
  // Spectateur : ni place ni identifiants ; le serveur n'envoie aucune main.
  const playerID = watch ? undefined : online ? session.playerID : "0";
  const me = watch ? -1 : Number(playerID);
  const client = online
    ? OnlineClient({
        api,
        matchID: watch || session.matchID,
        playerID,
        credentials: watch ? undefined : session.credentials,
      })
    : // Solo : état gardé dans ce navigateur (reprise après rechargement),
      // effacé en quittant ; soloID est propre à chaque partie.
      Client({
        game: Coinche,
        numPlayers: 4,
        playerID,
        debug: false,
        multiplayer: Local({ persist: true, storageKey: SOLO_STORAGE }),
        matchID: soloID,
      });

  const view = document.querySelector("#game-view");
  view.hidden = false;
  document.body.classList.add("is-playing");

  // Bots et délais tournent dans un worker (voir host-worker.js), créé
  // seulement si ce navigateur devient hôte ; « stop » n'est envoyé qu'en
  // perdant ce rôle, pas à chaque coup.
  let hostWorker = null;
  let hosting = false;
  const host = {
    update(G) {
      if (!hostWorker) {
        hostWorker = new Worker(new URL("./host-worker.js", import.meta.url), {
          type: "module",
        });
        hostWorker.onmessage = ({ data }) => {
          // Décision prise sur un état déjà dépassé (le jeu a avancé pendant
          // l'aller-retour) : le serveur la refuserait, inutile de l'envoyer.
          if (stopped || data.tour !== client.getState()?.G.tour) return;
          client.moves.pourSiege(data.seat, data.action);
        };
      }
      hosting = true;
      hostWorker.postMessage({ type: "update", G });
    },
    stop() {
      if (!hosting) return;
      hosting = false;
      hostWorker.postMessage({ type: "stop" });
    },
  };
  // Spectateur : il suit d'abord un joueur au hasard ; toucher un autre
  // joueur montre sa main (le serveur l'envoie).
  const peek = watch ? Math.floor(Math.random() * 4) : null;
  if (watch) client.peek(peek);
  const table = createTable(view.querySelector("#coinche-stage"), {
    me,
    peek,
    onPlay: (id) => client.moves.agir({ type: "JOUER", carte: { id } }),
    onPeek: watch ? (seat) => client.peek(seat) : null,
  });
  const hud = createHud(view, {
    me,
    onAction: (action) => client.moves.agir(action),
    onRelaunch: (seats) => client.moves.lancer(seats),
    onQuit: stop,
    onFocusCard: (id) => table.focusCard(id),
    // En ligne, le serveur renvoie l'émoticône à toute la table (vous compris).
    onEmote: online ? (e) => client.sendEmote(e) : (e) => table.showEmote(me, e),
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

  // Dernière carte en main, à son tour : aucun choix, elle part toute seule
  // presque aussitôt (le pli précédent ramassé d'abord).
  let autoTour = null;
  function autoLastCard(G) {
    if (G.phase !== "JEU" || G.joueurActif !== me || G.hands[me]?.length !== 1) return;
    if (autoTour === G.tour) return;
    const t = (autoTour = G.tour);
    const id = G.hands[me][0].id;
    setTimeout(() => {
      if (!stopped && client.getState()?.G.tour === t)
        client.moves.agir({ type: "JOUER", carte: { id } });
    }, 150 + trickPause(G));
  }

  let stopped = false;
  const unsubscribe = client.subscribe((state) => {
    if (!state || stopped) return;
    const G = state.G;
    if (G.phase === "ATTENTE") {
      // L'attente s'affiche avant le lancement : en solo, le transport local
      // renvoie la partie lancée pendant l'appel à lancer() lui-même.
      hud.waiting();
      if (!launched && !watch && (launch || !online)) {
        const seats = online ? seatsFromTable() : SOLO_SEATS;
        if (seats) {
          launched = true;
          client.moves.lancer(seats);
        }
      }
      return;
    }
    if (!G.seats || G === prev) return; // même état notifié deux fois
    if (G.hote === me) {
      if (prev && G.donneNumero < prev.donneNumero) host.stop(); // partie relancée
      host.update(G);
    } else host.stop();
    if (!watch) watchSeats(G);
    autoLastCard(G);
    hud.update(G, prev);
    table.update(G, prev);
    prev = G;
  });
  if (online) {
    client.onEmote((seat, e) => table.showEmote(seat, e));
    client.onGone(stop); // partie arrêtée : retour au salon
  }
  client.start();

  // Tout est coupé avant la déconnexion, qui prévient encore les abonnés :
  // sinon l'hôte repartirait et les bots joueraient sans personne.
  function stop() {
    if (stopped) return;
    stopped = true;
    unsubscribe();
    hostWorker?.terminate();
    // Partie solo abandonnée : rien ne reste dans le navigateur.
    // (wipe() de boardgame.io oublie le journal et l'état initial.)
    const db = !online && client.transport.master?.storageAPI;
    if (db) for (const m of [db.state, db.initial, db.metadata, db.log]) m?.delete(soloID);
    client.stop();
    table.destroy();
    hud.destroy();
    view.hidden = true;
    document.body.classList.remove("is-playing");
    onExit();
  }

  return { stop };
}
