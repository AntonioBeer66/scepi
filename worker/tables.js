// Serveur de coinche en ligne : un Durable Object Cloudflare (une seule
// instance, « salon ») garde toutes les tables, sert l'API du lobby et les
// WebSocket des parties. La logique est dans src/coinche/online/tables.js.
// Les WebSocket sont « hibernables » : l'objet peut s'endormir entre deux
// messages sans couper les joueurs ; les parties sont donc enregistrées
// dans son stockage (une clé par partie) et rechargées au réveil.
//
// API (sous /api, derrière le mot de passe du site) :
//   GET  /api/tables?code=             salons + la table privée de ce code (lance l'entretien)
//   POST /api/tables                   nouveau salon temporaire ; { code } : table privée
//   POST /api/tables/:id/join          { playerID, playerName } → { playerCredentials }
//   POST /api/tables/:id/leave         { playerID, credentials }
//   GET  /api/tables/:id/ws            WebSocket de la partie
//   GET  /api/historique.csv           parties terminées de la semaine
// WebSocket : le client envoie d'abord { type: "hello", playerID?,
// credentials? } (sans playerID : spectateur), puis { type: "move", name,
// args } ; il reçoit { type: "state", G, stateID, players } à chaque
// changement, G filtré pour ce qu'il a le droit de voir. Émoticônes :
// { type: "emote", emote } → { type: "emote", seat, emote } à toute la table.
// Spectateur : { type: "peek", seat } (null : aucune) choisit la main montrée.
import { DurableObject } from "cloudflare:workers";
import {
  createTables,
  EMOTES,
  historyCSV,
  historyRow,
  weekOf,
} from "../src/coinche/online/tables.js";

const MAX_MESSAGE = 8 * 1024; // un coup tient en quelques centaines d'octets
const KEY = (id) => `m:${id}`;
const HISTORY = "historique"; // { week, rows } : la semaine en cours seulement
const ARTICLE_PREFIX = "article:";
// Une valeur du stockage d'un Durable Object (SQLite) tient en 2 Mo : un
// article, photos comprises (réduites par actus.js), doit rester en dessous.
const MAX_ARTICLE = 1900 * 1024;

// Comparaison à temps constant (empreintes de même longueur). Le client
// envoie le mot de passe encodé (encodeURIComponent : accents admis en en-tête).
async function articlesPasswordOk(expected, given) {
  if (!expected || !given) return false;
  const hash = async (s) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return crypto.subtle.timingSafeEqual(await hash(encodeURIComponent(expected)), await hash(given));
}

// Qui ouvre une table : empreinte de son adresse IP (jamais l'adresse
// elle-même), pour le plafond par personne (MAX_PER_OWNER).
async function ownerOf(request) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`scepi:${ip}`));
  return [...new Uint8Array(hash).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Mot de passe des actus : après MAX_FAILS erreurs, l'adresse attend
// FAIL_WINDOW_MS. Gardé en mémoire seulement (remis à zéro au réveil du
// salon) : assez pour rendre l'essai en masse inutile.
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export class Tables extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.tables = createTables();
    this.fails = new Map(); // adresse → { n, since } : mots de passe des actus refusés
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
      ws.send(JSON.stringify({ type: "state", ...this.tables.view(id, att.seat, att.peek), players }));
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
    const { removed, created } = this.tables.maintain((id, s) => this.connected(id, s));
    for (const id of removed) {
      await this.save(id);
      for (const ws of this.ctx.getWebSockets(id)) ws.close(4404, "Table fermée");
    }
    for (const m of created) await this.save(m.id);
  }

  // Ligne d'historique d'une partie qui vient de se terminer ; la semaine
  // précédente est oubliée à la première partie de la nouvelle.
  async record(id) {
    const t = Date.now();
    const saved = await this.ctx.storage.get(HISTORY);
    const rows = saved?.week === weekOf(t) ? saved.rows : [];
    rows.push(historyRow(this.tables.get(id), t));
    await this.ctx.storage.put(HISTORY, { week: weekOf(t), rows });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean); // api, tables, id, action
    if (parts[0] === "api" && parts[1] === "articles") {
      const articleId = parts[2];
      if (request.method === "GET") {
        if (articleId) {
          const article = await this.ctx.storage.get(`${ARTICLE_PREFIX}${articleId}`);
          return article ? json(article) : json({ error: "ARTICLE_INTROUVABLE" }, 404);
        }
        const saved = await this.ctx.storage.list({ prefix: ARTICLE_PREFIX });
        // Liste : de quoi faire les cartes ; texte et photos via /api/articles/:id.
        const articles = [...saved.values()]
          .map(({ id, title, summary, image, date }) => ({ id, title, summary, image, date }))
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        return json(articles);
      }
      // Publier, modifier, supprimer : mot de passe des articles (secret
      // Cloudflare ARTICLES_PASSWORD, jamais dans le dépôt) ; sans secret, rien ne passe.
      const writes = request.method === "POST" || (articleId && (request.method === "PUT" || request.method === "DELETE"));
      if (writes) {
        const ip = request.headers.get("cf-connecting-ip") || "local";
        const now = Date.now();
        let f = this.fails.get(ip);
        if (f && now - f.since > FAIL_WINDOW_MS) f = null;
        if (f?.n >= MAX_FAILS) return json({ error: "TROP_D_ESSAIS" }, 429);
        if (!(await articlesPasswordOk(this.env.ARTICLES_PASSWORD, request.headers.get("x-articles-password")))) {
          this.fails.set(ip, { n: (f?.n || 0) + 1, since: f?.since ?? now });
          return json({ error: "MOT_DE_PASSE_REFUSE" }, 403);
        }
        this.fails.delete(ip);
      }
      if (request.method === "DELETE" && articleId) {
        const key = `${ARTICLE_PREFIX}${articleId}`;
        if (!(await this.ctx.storage.get(key))) return json({ error: "ARTICLE_INTROUVABLE" }, 404);
        await this.ctx.storage.delete(key);
        return json({ ok: true });
      }
      if (request.method === "POST" || (request.method === "PUT" && articleId)) {
        // Taille lue sur le corps lui-même : content-length peut manquer.
        const raw = await request.text();
        if (raw.length > MAX_ARTICLE) return json({ error: "ARTICLE_TROP_VOLUMINEUX" }, 413);
        let body;
        try { body = JSON.parse(raw); } catch { return json({ error: "JSON_INVALIDE" }, 400); }
        if (!body?.title || !body?.summary || !body?.body || !body?.image) return json({ error: "CHAMPS_MANQUANTS" }, 400);
        const id = articleId || crypto.randomUUID();
        // Date illisible : celle du jour (sinon la liste des actus ne s'affiche plus).
        const date = Number.isNaN(Date.parse(body.date)) ? new Date().toISOString() : String(body.date);
        const article = { id, title: String(body.title).slice(0, 120), summary: String(body.summary).slice(0, 280), body: String(body.body), image: String(body.image), gallery: Array.isArray(body.gallery) ? body.gallery.map(String).slice(0, 20) : [], date };
        try {
          await this.ctx.storage.put(`${ARTICLE_PREFIX}${id}`, article);
        } catch {
          return json({ error: "ARTICLE_TROP_VOLUMINEUX" }, 413);
        }
        return json(article, request.method === "POST" ? 201 : 200);
      }
      return json({ error: "METHODE_REFUSEE" }, 405);
    }
    if (url.pathname === "/api/historique.csv" && request.method === "GET") {
      const saved = await this.ctx.storage.get(HISTORY);
      const rows = saved?.week === weekOf(Date.now()) ? saved.rows : [];
      return new Response(historyCSV(rows), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="historique-coinche.csv"',
          "cache-control": "no-store",
        },
      });
    }
    if (parts[0] !== "api" || parts[1] !== "tables") return json({ error: "INTROUVABLE" }, 404);
    const id = parts[2];
    const action = parts[3];

    if (!id) {
      if (request.method === "GET") {
        await this.maintain();
        return json(this.tables.list((m, s) => this.connected(m, s), url.searchParams.get("code")));
      }
      if (request.method === "POST") {
        const code = (await request.json().catch(() => null))?.code;
        let m;
        if (code != null) {
          const r = this.tables.createPrivate(code, await ownerOf(request));
          if (r.error && r.error !== "PLEIN") return json({ error: r.error }, r.error === "CODE_PRIS" ? 409 : 400);
          m = r.match;
        } else m = this.tables.create(await ownerOf(request));
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
      await this.maintain(); // dernier humain parti : la partie s'arrête
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
    // Spectateur : regarde la main d'un joueur (il peut en changer).
    if (msg?.type === "peek" && att.ready && att.seat == null) {
      ws.serializeAttachment({ ...att, peek: msg.seat });
      this.send(ws, id);
      return;
    }
    // Émoticône d'un joueur assis : relayée à toute la table, une par
    // seconde au plus (rien n'est enregistré).
    if (msg?.type === "emote" && att.ready && att.seat != null && EMOTES.has(msg.emote)) {
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
      const was = this.tables.get(id).G.phase;
      if (this.tables.move(id, att.seat, msg.name, msg.args)) {
        await this.save(id);
        if (was !== "TERMINEE" && this.tables.get(id).G.phase === "TERMINEE") await this.record(id);
        this.broadcast(id);
        // Le lobby ne l'appelle que s'il est ouvert : ici, une partie où
        // plus personne ne joue (bots seuls) se ferme aussi à temps.
        await this.maintain();
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
