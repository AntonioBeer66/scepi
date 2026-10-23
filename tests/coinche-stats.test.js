// Chiffres publics de la coinche (GET /api/stats) : totaux justes, rien
// d'une donne précise, journal relu au plus toutes les 6 h.
//   node tests/coinche-stats.test.js
import assert from 'assert';
import { aggregateStats } from '../src/coinche/journal.js';
import { statsDonnes } from '../worker/journal.js';

const rows = [
  { mode: 'solo', montant: null, atout: null, reussi: null, coinche: null, surcoinche: null, n: 5 },
  { mode: 'solo', montant: 80, atout: 'H', reussi: 1, coinche: 0, surcoinche: 0, n: 10 },
  { mode: 'ligne', montant: 110, atout: 'S', reussi: 0, coinche: 1, surcoinche: 0, n: 3 },
  { mode: 'ligne', montant: 110, atout: 'S', reussi: 1, coinche: 1, surcoinche: 1, n: 1 },
  { mode: 'solo', montant: 250, atout: 'D', reussi: 1, coinche: 0, surcoinche: 0, n: 2 },
  { mode: 'solo', montant: 500, atout: 'C', reussi: 0, coinche: 0, surcoinche: 0, n: 1 },
];
const s = aggregateStats(rows);
assert.strictEqual(s.donnes, 22);
assert.strictEqual(s.passees, 5);
assert.strictEqual(s.jouees, 17);
assert.strictEqual(s.reussies, 13);
assert.deepStrictEqual(s.modes, { solo: 18, ligne: 4 });
assert.deepStrictEqual(s.atouts, { H: 10, D: 2, C: 1, S: 4 });
assert.deepStrictEqual(s.paliers, {
  80: { n: 10, reussies: 10 },
  100: { n: 4, reussies: 1 },
  capot: { n: 2, reussies: 2 },
  generale: { n: 1, reussies: 0 },
});
assert.strictEqual(s.coinchees, 4);
assert.strictEqual(s.coinchesGagnantes, 3);
assert.strictEqual(s.surcoinchees, 1);

// Base D1 factice : compte les parcours du journal.
function fakeDb() {
  const db = { scans: 0, cache: null, hasDonnes: true };
  db.exec = async () => {};
  db.prepare = (sql) => {
    let args = [];
    const st = {
      bind: (...a) => ((args = a), st),
      first: async () => (sql.includes('FROM stats_cache') ? db.cache : null),
      all: async () => {
        if (!db.hasDonnes) throw new Error('no such table: donnes');
        db.scans++;
        return { results: rows };
      },
      run: async () => {
        if (sql.startsWith('INSERT INTO stats_cache')) db.cache = { at: args[0], data: args[1] };
      },
    };
    return st;
  };
  return db;
}

const db = fakeDb();
const env = { JOURNAL_DB: db };
const H = 3600 * 1000;
const t0 = Date.UTC(2026, 9, 23);
let res = await statsDonnes(env, t0);
assert.strictEqual(res.headers.get('content-type'), 'application/json; charset=utf-8');
let body = await res.json();
assert.strictEqual(body.donnes, 22);
assert.strictEqual(body.calcule, new Date(t0).toISOString());
await statsDonnes(env, t0 + 5 * H);
assert.strictEqual(db.scans, 1, 'moins de 6 h : pas de nouveau parcours');
body = await (await statsDonnes(env, t0 + 7 * H)).json();
assert.strictEqual(db.scans, 2);
assert.strictEqual(body.calcule, new Date(t0 + 7 * H).toISOString());

// Aucune donne encore reçue, ou version de test sans base.
const empty = fakeDb();
empty.hasDonnes = false;
assert.strictEqual((await (await statsDonnes({ JOURNAL_DB: empty }, t0)).json()).donnes, 0);
assert.strictEqual((await (await statsDonnes({}, t0)).json()).donnes, 0);

console.log('stats : ok');
