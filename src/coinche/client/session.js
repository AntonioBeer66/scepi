// Une partie à l'écran : le client de jeu (en ligne : WebSocket vers le
// serveur du site, voir online-client.js ; en solo : boardgame.io avec son
// serveur local dans l'onglet), la table Phaser, les commandes HTML et, si
// ce navigateur est l'hôte, les bots et les délais.
import { Client } from "boardgame.io/client";
import { Local } from "boardgame.io/multiplayer";
import { Coinche } from "../game.js";
import { trickPause } from "../host.js";
import { buildRecord, JOURNAL_MAX_BYTES } from "../journal.js";
import { sameName } from "../../online/tables.js";
import { botEmote } from "./bot-emotes.js";
import { createHud } from "./hud.js";
import { OnlineClient } from "./online-client.js";
import { createTable } from "./table-scene.js";

const SOLO_SEATS = [
  { type: "human", name: "Toi" },
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
  watchName, // pseudo du spectateur (ses messages)
  seatsFromTable,
  onExit,
}) {
  // Spectateur : ni place ni identifiants ; le serveur n'envoie aucune main.
  const playerID = watch ? undefined : online ? session.playerID : "0";
  const me = watch ? -1 : Number(playerID);
  // Partie solo enregistrée avant disableUndo (game.js) : sa pile
  // d'annulation, inutile, remplit le stockage ; on la vide pour la reprendre.
  if (!online)
    try {
      const key = `${SOLO_STORAGE}_state`;
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved?.some(([, s]) => s?._undo?.length)) {
        for (const [, s] of saved) s._undo = s._redo = [];
        localStorage.setItem(key, JSON.stringify(saved));
      }
    } catch {}
  const client = online
    ? OnlineClient({
        api,
        matchID: watch || session.matchID,
        playerID,
        credentials: watch ? undefined : session.credentials,
        name: watch ? watchName : undefined,
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
          // En ligne, le serveur tient les délais (worker/tables.js) : l'hôte
          // ne fait plus que jouer les bots.
          if (online && data.action.type === "TIMEOUT") return;
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
    onChat: online ? (text) => client.sendChat(text) : null, // seul contre les bots : pas de messages
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

  // Journal anonyme (voir journal.js) : le navigateur hôte, seul à voir
  // toutes les mains, envoie chaque donne finie ou passée — les coups
  // seulement. Rien si le navigateur demande de ne pas être suivi (Global
  // Privacy Control).
  function journal(G, prevG) {
    if (watch || !prevG || G.hote !== me || navigator.globalPrivacyControl) return;
    const mode = online ? "ligne" : "solo";
    let rec = null;
    if (G.phase === "SCORE" && prevG.phase !== "SCORE") rec = buildRecord(G, { mode, me });
    else if (G.donneNumero > prevG.donneNumero && prevG.phase === "ENCHERES")
      rec = buildRecord(prevG, { mode, me, lastPass: prevG.joueurActif });
    if (!rec) return;
    const body = JSON.stringify(rec);
    if (body.length > JOURNAL_MAX_BYTES) return;
    fetch("/api/journal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
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
    journal(G, prev);
    autoLastCard(G);
    hud.update(G, prev);
    table.update(G, prev);
    // Réaction d'un bot (voir bot-emotes.js), un peu après le coup qui la provoque.
    const reaction = botEmote(G, prev);
    if (reaction) {
      const [seat, emote, wait = 0] = reaction;
      setTimeout(() => !stopped && table.showEmote(seat, emote), 500 + wait + trickPause(G));
    }
    prev = G;
  });
  if (online) {
    client.onEmote((seat, e) => table.showEmote(seat, e));
    // Message d'un joueur : dans la liste et en bulle près de lui ; d'un
    // spectateur (seat null) ou du serveur (name null) : dans la liste seulement.
    client.onChat((seat, name, text) => {
      if (name == null) return hud.chat(null, text, { system: true });
      const mine = watch ? seat == null && sameName(name, watchName) : seat === me;
      if (hud.chat(name, text, { mine, watcher: seat == null }) && seat != null)
        table.showChat(seat, text);
    });
    client.onWatchers((names) => hud.watchers(names));
    // Partie arrêtée, ou pseudo de spectateur déjà pris : retour au salon.
    client.onGone((why) => {
      stop();
      if (why === "PSEUDO_PRIS")
        window.alert("Ce pseudo est déjà pris à cette table : choisis-en un autre.");
      if (why === "EXPULSE") window.alert("L'hôte t'a expulsé de la table.");
    });
  }
  // La partie (et ses délais, et les enchères à l'écran) ne démarre qu'une
  // fois les cartes chargées : sinon on enchérit sans voir sa main. Au bout
  // de 8 s on démarre quand même, plutôt que de rester bloqué.
  Promise.race([table.ready, new Promise((r) => setTimeout(r, 8000))]).then(() => {
    if (!stopped) client.start();
  });

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
