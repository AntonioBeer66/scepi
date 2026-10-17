// Journal anonyme des donnes jouées par des humains (voir
// src/coinche/journal.js) : un Durable Object à part, stockage SQLite.
//   POST /api/journal : une donne (JSON vérifié par checkRecord) ;
//   GET /api/journal?depuis=<id> : export JSON lignes (5 000 au plus),
//     réservé à l'association (en-tête x-articles-password, le secret des actus).
// Ni adresse IP, ni pseudo : seulement le jour d'arrivée. Conservé deux ans.
import { DurableObject } from "cloudflare:workers";
import { checkRecord, JOURNAL_MAX_BYTES } from "../src/coinche/journal.js";

const PER_DAY = 20000; // au-delà, plus rien ce jour-là (le stockage reste borné)
const KEEP_DAYS = 730;
const day = (t) => new Date(t).toISOString().slice(0, 10);

export class Journal extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS donnes (id INTEGER PRIMARY KEY AUTOINCREMENT, jour TEXT NOT NULL, data TEXT NOT NULL)",
    );
    ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS donnes_jour ON donnes (jour)");
  }

  async fetch(request) {
    const sql = this.ctx.storage.sql;
    if (request.method === "POST") {
      const text = await request.text();
      if (text.length > JOURNAL_MAX_BYTES) return new Response(null, { status: 413 });
      let rec;
      try {
        rec = JSON.parse(text);
      } catch {
        return new Response(null, { status: 400 });
      }
      if (checkRecord(rec)) return new Response(null, { status: 400 });
      const today = day(Date.now());
      if (sql.exec("SELECT COUNT(*) AS n FROM donnes WHERE jour = ?", today).one().n >= PER_DAY)
        return new Response(null, { status: 429 });
      sql.exec("INSERT INTO donnes (jour, data) VALUES (?, ?)", today, JSON.stringify(rec));
      sql.exec("DELETE FROM donnes WHERE jour < ?", day(Date.now() - KEEP_DAYS * 86400000));
      return new Response(null, { status: 204 });
    }
    if (request.method === "GET") {
      const secret = this.env.ARTICLES_PASSWORD;
      const given = request.headers.get("x-articles-password") || "";
      if (!secret || !(await same(secret, given))) return new Response("Mot de passe refusé.", { status: 403 });
      const since = Number(new URL(request.url).searchParams.get("depuis")) || 0;
      const rows = sql.exec("SELECT id, jour, data FROM donnes WHERE id > ? ORDER BY id LIMIT 5000", since).toArray();
      const body = rows.map((r) => `{"id":${r.id},"jour":"${r.jour}","donne":${r.data}}`).join("\n");
      return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
    }
    return new Response(null, { status: 405 });
  }
}

// Comparaison à temps constant (empreintes SHA-256).
async function same(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const u = new Uint8Array(x);
  const v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}
