// Journal anonyme des donnes jouées par des humains (voir
// src/coinche/journal.js), dans la base D1 scepi-journal (table donnes :
// id, data). Le site ne fait qu'y écrire : POST /api/journal, une donne
// vérifiée par checkRecord. Aucune lecture par le site ; l'association la lit
// avec son compte Cloudflare (tests/coinche-humains.js, wrangler d1 execute).
// Ni date ni adresse : les plus anciennes donnes s'effacent au-delà de MAX.
import { checkRecord, JOURNAL_MAX_BYTES } from "../src/coinche/journal.js";

const MAX = 300000;

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
  const { id } = await env.JOURNAL_DB.prepare("INSERT INTO donnes (data) VALUES (?) RETURNING id")
    .bind(JSON.stringify(rec))
    .first();
  if (id > MAX) await env.JOURNAL_DB.prepare("DELETE FROM donnes WHERE id <= ?").bind(id - MAX).run();
  return new Response(null, { status: 204 });
}
