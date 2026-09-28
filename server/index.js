// Serveur de coinche : boardgame.io (parties, API des salons et WebSocket
// sur le même port) + l'entretien des tables.
//   PORT=8001 ORIGINS=https://scepinvaders.com node server/index.js
// ORIGINS : pages autorisées à se connecter (séparées par des virgules).
// Sans elle, seules les pages locales de développement sont acceptées.
// Les parties vivent en mémoire : un redémarrage les efface.
import { randomUUID } from "crypto";
import { Server, Origins } from "boardgame.io/dist/cjs/server.js";
import { createMatch } from "boardgame.io/dist/cjs/internal.js";
import { Coinche } from "../src/coinche/game.js";

const PORT = Number(process.env.PORT) || 8001;
const PERMANENT_TABLES = 4;
const MAX_MATCHES = 40;
const IDLE_MS = 30 * 60 * 1000; // partie ou salon abandonné
const EMPTY_MS = 10 * 60 * 1000; // salon temporaire jamais rejoint

const origins = process.env.ORIGINS
  ? process.env.ORIGINS.split(",").map((o) => o.trim())
  : [Origins.LOCALHOST, /127\.0\.0\.1:\d+/];

const server = Server({ games: [Coinche], origins });
const { db } = server;

async function matches() {
  const ids = await db.listMatches({ gameName: Coinche.name });
  const out = [];
  for (const id of ids) {
    const { metadata, state } = await db.fetch(id, {
      metadata: true,
      state: true,
    });
    if (metadata && state) out.push({ id, metadata, G: state.G });
  }
  return out;
}

async function create(setupData) {
  const match = createMatch({ game: Coinche, numPlayers: 4, setupData });
  await db.createMatch(randomUUID().slice(0, 11), match);
}

// Toujours une table libre pour chaque numéro permanent ; les salons
// abandonnés disparaissent.
async function entretien() {
  const now = Date.now();
  const waiting = new Set();
  for (const { id, metadata, G } of await matches()) {
    const idle = now - metadata.updatedAt;
    const empty = Object.values(metadata.players).every((p) => !p.name);
    const table = metadata.setupData?.table;
    if (
      idle > IDLE_MS ||
      (G.phase === "ATTENTE" && empty && !table && idle > EMPTY_MS)
    ) {
      await db.wipe(id);
    } else if (G.phase === "ATTENTE" && table) {
      if (waiting.has(table)) await db.wipe(id);
      else waiting.add(table);
    }
  }
  for (let n = 1; n <= PERMANENT_TABLES; n++)
    if (!waiting.has(n)) await create({ table: n });
}

// Plafond de parties : l'API de création est ouverte à tous.
server.app.use(async (ctx, next) => {
  if (ctx.method === "POST" && ctx.path.endsWith("/create")) {
    const ids = await db.listMatches({ gameName: Coinche.name });
    if (ids.length >= MAX_MATCHES) ctx.throw(429, "Trop de tables ouvertes");
  }
  await next();
});

// Les salons en un appel : places occupées et phase de chaque table.
server.router.get("/tables", async (ctx) => {
  ctx.body = (await matches()).map(({ id, metadata, G }) => ({
    matchID: id,
    table: metadata.setupData?.table ?? null,
    phase: G.phase,
    players: Object.values(metadata.players).map((p) => ({
      id: p.id,
      name: p.name ?? null,
      isConnected: !!p.isConnected,
    })),
    createdAt: metadata.createdAt,
  }));
});

await server.run(PORT);
await entretien();
setInterval(() => entretien().catch(console.error), 5000);
