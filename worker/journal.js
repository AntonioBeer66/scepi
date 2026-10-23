// Journal anonyme des donnes jouées par des humains (voir
// src/coinche/journal.js), dans la base D1 scepi-journal (table donnes :
// id, data). Le site ne fait qu'y écrire : POST /api/journal, une donne
// vérifiée par checkRecord. Le site n'en relit que des totaux (GET /api/stats,
// statsDonnes) ; l'association lit les donnes avec son compte Cloudflare
// (tests/coinche-humains.js, wrangler d1 execute).
// Ni date ni adresse : les plus anciennes donnes s'effacent au-delà de MAX.
import { aggregateStats, checkRecord, JOURNAL_MAX_BYTES, STATS_SQL } from "../src/coinche/journal.js";

const MAX = 300000;
// Table créée au premier envoi de chaque instance (sans effet si elle existe).
let ready = null;

export async function saveDonne(request, env) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  // Version de test sans base : rien n'est gardé.
  if (!env.JOURNAL_DB) return new Response(null, { status: 204 });
  const text = await request.text();
  if (text.length > JOURNAL_MAX_BYTES) return new Response(null, { status: 413 });
  let rec;
  try {
    rec = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (checkRecord(rec)) return new Response(null, { status: 400 });
  ready ??= env.JOURNAL_DB.exec(
    "CREATE TABLE IF NOT EXISTS donnes (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL)",
  ).catch((e) => {
    ready = null;
    throw e;
  });
  await ready;
  const { id } = await env.JOURNAL_DB.prepare("INSERT INTO donnes (data) VALUES (?) RETURNING id")
    .bind(JSON.stringify(rec))
    .first();
  if (id > MAX) await env.JOURNAL_DB.prepare("DELETE FROM donnes WHERE id <= ?").bind(id - MAX).run();
  return new Response(null, { status: 204 });
}

// Totaux recalculés au plus toutes les 6 h, gardés dans la base (table
// stats_cache, une ligne) : un calcul parcourt tout le journal, et l'offre
// gratuite de D1 compte chaque ligne lue (300 000 donnes × 4 par jour, loin
// des 5 millions). Devant, le cache de Cloudflare évite même cette lecture.
const STATS_MS = 6 * 3600 * 1000;

export async function statsDonnes(env, now = Date.now()) {
  if (!env.JOURNAL_DB) return json({ donnes: 0 });
  const db = env.JOURNAL_DB;
  await db.exec("CREATE TABLE IF NOT EXISTS stats_cache (id INTEGER PRIMARY KEY, at INTEGER NOT NULL, data TEXT NOT NULL)");
  const cached = await db.prepare("SELECT at, data FROM stats_cache WHERE id = 1").first();
  if (cached && now - cached.at < STATS_MS) return json(JSON.parse(cached.data));
  let stats;
  try {
    stats = aggregateStats((await db.prepare(STATS_SQL).all()).results);
  } catch {
    // Pas encore de table donnes (aucune donne reçue) : tout à zéro.
    stats = aggregateStats([]);
  }
  stats.calcule = new Date(now).toISOString();
  await db
    .prepare("INSERT INTO stats_cache (id, at, data) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET at = excluded.at, data = excluded.data")
    .bind(now, JSON.stringify(stats))
    .run();
  return json(stats);
}

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=900" },
  });
}
