import { EN } from "./i18n.js";

// Messages système du serveur (worker/tables.js, seat et name null) : il ne
// connaît pas la langue de la page, donc il les écrit en français et on les
// traduit ici à la réception ; ce qui ne correspond à aucun modèle (et tout
// en français) passe tel quel. $1 : le pseudo cité par le message.
const SERVER_CHAT = [
  [/^Pas si vite : attends un peu avant d'écrire\.$/, "Not so fast: wait a moment before writing."],
  [/^Tu es banni du chat de cette table\.$/, "You are banned from this table's chat."],
  [
    /^Seul l'hôte de la table peut bannir, débannir ou expulser \(tout joueur peut expulser quelqu'un qui n'a pas joué\)\.$/,
    "Only the table host can ban, unban or kick (any player can kick someone who hasn't played).",
  ],
  [/^Écris \/(ban|deban|kick) suivi du pseudo\.$/, "Type /$1 followed by the name."],
  [/^Tu ne peux pas t'expulser toi-même\.$/, "You can't kick yourself."],
  [/^Tu ne peux pas te bannir toi-même\.$/, "You can't ban yourself."],
  [/^Personne ne s'appelle « (.+) » à cette table\.$/, 'Nobody at this table is called "$1".'],
  [/^(.+) est expulsé par l'hôte\.$/, "$1 was kicked by the host."],
  [/^(.+) est expulsé pour absence\.$/, "$1 was kicked for being absent."],
  [/^« (.+) » n'est pas banni\.$/, '"$1" is not banned.'],
  [/^(.+) peut de nouveau écrire\.$/, "$1 can write again."],
  [/^(.+) est banni du chat par l'hôte\.$/, "$1 was banned from the chat by the host."],
  [/^(.+) n'a pas joué : tout le monde peut l'expulser avec \/kick \1\.$/, "$1 didn't play: anyone can kick them with /kick $1."],
];
const serverChat = (text) => {
  if (!EN || typeof text !== "string") return text;
  const hit = SERVER_CHAT.find(([fr]) => fr.test(text));
  return hit ? text.replace(hit[0], hit[1]) : text;
};

// Client d'une partie en ligne (WebSocket vers worker/tables.js), avec la
// même interface que le client boardgame.io qu'utilise session.js :
// moves.<coup>(...args), subscribe(fn), getState(), matchData, start(), stop().
// En plus : sendEmote(e) et onEmote(fn(seat, e)) pour les émoticônes rapides,
// sendChat(text) et onChat(fn(seat, name, text)) pour les messages (seat
// null : un spectateur, name : son pseudo, donné à la connexion ; seat et
// name null : message du serveur), onWatchers(fn(names)) pour les spectateurs,
// onGone(fn(why)) quand la table est effacée (tous les joueurs partis) ou
// que le pseudo du spectateur est déjà pris (why = "PSEUDO_PRIS"),
// peek(seat) pour qu'un spectateur voie la main d'un joueur.
// Reconnexion automatique (délai croissant) si la connexion tombe.
export function OnlineClient({ api, matchID, playerID, credentials, name }) {
  let ws = null;
  let state = null;
  let stopped = false;
  let retry = 0;
  let timer = null;
  const subs = new Set();
  let emoteFn = null;
  let chatFn = null;
  let watchersFn = null;
  let goneFn = null; // la table n'existe plus (partie arrêtée), ou pseudo pris
  let peekSeat = null; // spectateur : main regardée, redemandée à la reconnexion
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
    sendEmote(emote) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "emote", emote }));
    },
    // false : connexion en cours de reprise, rien n'est parti.
    sendChat(text) {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify({ type: "chat", text }));
      return true;
    },
    peek(seat) {
      peekSeat = seat;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "peek", seat }));
    },
    onEmote(fn) {
      emoteFn = fn;
    },
    onChat(fn) {
      chatFn = fn;
    },
    onWatchers(fn) {
      watchersFn = fn;
    },
    onGone(fn) {
      goneFn = fn;
    },
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
      ws.send(JSON.stringify({ type: "hello", playerID, credentials, name }));
      if (peekSeat != null) ws.send(JSON.stringify({ type: "peek", seat: peekSeat }));
    };
    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === "emote") return emoteFn?.(msg.seat, msg.emote);
      if (msg.type === "chat")
        return chatFn?.(msg.seat, msg.name, msg.seat == null && msg.name == null ? serverChat(msg.text) : msg.text);
      if (msg.type === "watchers") return watchersFn?.(msg.names);
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
      if (event.code === 4404) return goneFn?.();
      // Expulsé par l'hôte (/kick) : sa place n'est plus à lui.
      if (event.code === 4403) return goneFn?.("EXPULSE");
      // Pseudo de spectateur déjà pris à cette table. Déjà entré une fois :
      // c'est sa propre connexion d'avant (réseau changé), pas encore
      // refermée côté serveur ; on réessaie plus tard.
      if (event.code === 4409 && !state) return goneFn?.("PSEUDO_PRIS");
      timer = setTimeout(connect, Math.min(10000, 500 * 2 ** retry++));
    };
  }

  return client;
}
