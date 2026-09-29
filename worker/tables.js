// Serveur de coinche en ligne : un Durable Object Cloudflare (une seule
// instance, « salon ») garde toutes les tables, sert l'API du lobby et les
// WebSocket des parties. La logique est dans src/coinche/online/tables.js.
// Les WebSocket sont « hibernables » : l'objet peut s'endormir entre deux
// messages sans couper les joueurs ; les parties sont donc enregistrées
// dans son stockage (une clé par partie) et rechargées au réveil.
//
// API (sous /api, derrière le mot de passe du site) :
//   GET  /api/tables                   salons (lance l'entretien)
//   POST /api/tables                   nouveau salon temporaire
//   POST /api/tables/:id/join          { playerID, playerName } → { playerCredentials }
//   POST /api/tables/:id/leave         { playerID, credentials }
//   GET  /api/tables/:id/ws            WebSocket de la partie
// WebSocket : le client envoie d'abord { type: "hello", playerID?,
// credentials? } (sans playerID : spectateur), puis { type: "move", name,
// args } ; il reçoit { type: "state", G, stateID, players } à chaque
// changement, G filtré pour ce qu'il a le droit de voir. Émoticônes :
// { type: "emote", emote } → { type: "emote", seat, emote } à toute la table.
import { DurableObject } from "cloudflare:workers";
import { createTables, EMOTES } from "../src/coinche/online/tables.js";

const MAX_MESSAGE = 8 * 1024; // un coup tient en quelques centaines d'octets
const KEY = (id) => `m:${id}`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export class Tables extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.tables = createTables();
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.list({ prefix: "m:" });
      this.tables.load([...saved.values()]);
    });
  }

  // Sièges connectés : WebSocket authentifiées de la partie.
  connected(id, seat) {
    return this.ctx
      .getWebSockets(id)
      .some((ws) => ws.deserializeAttachment()?.seat === seat);
  }

  // Places d'une partie, pour ses clients (même forme que dans la liste).
  players(id) {
    const live = new Set(
      this.ctx.getWebSockets(id).map((ws) => ws.deserializeAttachment()?.seat),
    );
    return this.tables.get(id).players.map((p, s) => ({
      id: s,
      name: p.name,
      isConnected: live.has(s),
    }));
  }

  save(id) {
    const m = this.tables.get(id);
    return m ? this.ctx.storage.put(KEY(id), m) : this.ctx.storage.delete(KEY(id));
  }

  // players : calculé une fois par diffusion, pas une fois par client.
  send(ws, id, players = this.players(id)) {
    const att = ws.deserializeAttachment();
    if (!att?.ready) return;
    try {
      ws.send(JSON.stringify({ type: "state", ...this.tables.view(id, att.seat), players }));
    } catch {
      // WebSocket déjà fermée : le nettoyage suivra
    }
  }

  broadcast(id) {
    if (!this.tables.get(id)) return;
    const players = this.players(id);
    for (const ws of this.ctx.getWebSockets(id)) this.send(ws, id, players);
  }

  async maintain() {
    const { removed, created } = this.tables.maintain();
    for (const id of removed) {
      await this.save(id);
      for (const ws of this.ctx.getWebSockets(id)) ws.close(4404, "Table fermée");
    }
    for (const m of created) await this.save(m.id);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // api, tables, id, action
    if (parts[0] !== "api" || parts[1] !== "tables") return json({ error: "INTROUVABLE" }, 404);
    const id = parts[2];
    const action = parts[3];

    if (!id) {
      if (request.method === "GET") {
        await this.maintain();
        return json(this.tables.list((m, s) => this.connected(m, s)));
      }
      if (request.method === "POST") {
        const m = this.tables.create();
        if (!m) return json({ error: "Trop de tables ouvertes" }, 429);
        await this.save(m.id);
        return json({ matchID: m.id });
      }
    }
    if (!this.tables.get(id)) return json({ error: "INCONNUE" }, 404);

    if (action === "ws") {
      if (request.headers.get("upgrade") !== "websocket")
        return json({ error: "WebSocket attendue" }, 426);
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server, [id]);
      server.serializeAttachment({ id, seat: null, ready: false });
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "POST" && (action === "join" || action === "leave")) {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "INVALIDE" }, 400);
      }
      const seat = Number(body?.playerID);
      if (action === "join") {
        const r = this.tables.join(id, seat, body?.playerName);
        if (r.error) return json({ error: r.error }, r.error === "OCCUPEE" ? 409 : 400);
        await this.save(id);
        this.broadcast(id);
        return json({ playerCredentials: r.credentials });
      }
      if (!this.tables.leave(id, seat, body?.credentials)) return json({ error: "REFUSE" }, 403);
      await this.save(id);
      // La place n'est plus à lui : ses connexions deviennent spectatrices.
      for (const ws of this.ctx.getWebSockets(id)) {
        const att = ws.deserializeAttachment();
        if (att?.seat === seat) ws.serializeAttachment({ ...att, seat: null });
      }
      this.broadcast(id);
      return json({ ok: true });
    }
    return json({ error: "INTROUVABLE" }, 404);
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE) return ws.close(1009, "Message trop long");
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const att = ws.deserializeAttachment();
    const { id } = att;
    if (!this.tables.get(id)) return ws.close(4404, "Table fermée");

    if (msg?.type === "hello") {
      const seat = msg.playerID == null ? null : Number(msg.playerID);
      // Mauvais identifiants : spectateur, rien de plus.
      const ok = seat != null && this.tables.auth(id, seat, msg.credentials);
      ws.serializeAttachment({ id, seat: ok ? seat : null, ready: true });
      if (ok) this.broadcast(id); // les autres le voient connecté
      else this.send(ws, id);
      return;
    }
    // Émoticône d'un joueur assis : relayée à toute la table, une par
    // seconde au plus (rien n'est enregistré).
    if (msg?.type === "emote" && att.ready && att.seat != null && EMOTES.includes(msg.emote)) {
      const now = Date.now();
      if (now - (att.lastEmote || 0) < 1000) return;
      ws.serializeAttachment({ ...att, lastEmote: now });
      const out = JSON.stringify({ type: "emote", seat: att.seat, emote: msg.emote });
      for (const other of this.ctx.getWebSockets(id)) {
        try {
          other.send(out);
        } catch {
          // fermée entre-temps
        }
      }
      return;
    }
    if (msg?.type === "move" && att.ready && att.seat != null) {
      // Identifiants revérifiés : la place a pu être libérée entre-temps.
      if (!this.tables.get(id).players[att.seat].credentials) return;
      if (this.tables.move(id, att.seat, msg.name, msg.args)) {
        await this.save(id);
        this.broadcast(id);
      }
    }
  }

  // Les autres voient le siège déconnecté (reprise d'hôte, voir session.js) :
  // la connexion fermée ne compte plus, même avant de quitter la liste.
  webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    try {
      ws.serializeAttachment({ ...att, seat: null, ready: false });
      ws.close(1000, "Fin");
    } catch {
      // déjà fermée
    }
    if (att?.id) this.broadcast(att.id);
  }

  webSocketError(ws) {
    this.webSocketClose(ws);
  }
}
