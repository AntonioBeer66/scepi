// Donne du jour (src/coinche/defi.js) : même date, même donne pour tout le
// monde ; dates fausses ou futures refusées ; premier résultat du jour
// gardé, série de jours gagnés, texte à partager.
//   node tests/coinche-defi.test.js
import assert from 'assert';
import { Coinche } from '../src/coinche/game.js';
import { defiResult, isDefiDate, recordResult, shareText, streak, today } from '../src/coinche/defi.js';

const SEATS = [{ type: 'human', name: 'Toi' }, { type: 'bot' }, { type: 'bot' }, { type: 'bot' }];
const launch = (options, r = Math.random) =>
  Coinche.moves.lancer.move({ G: { phase: 'ATTENTE', table: null }, playerID: '0', random: { Number: r } }, SEATS, options);
const deal = (g) => JSON.stringify([g.donneur, g.hands]);

// Même date : mêmes mains, même donneur, quel que soit le hasard de boardgame.io.
const a = launch({ defi: '2026-10-23' }, () => 0.1);
const b = launch({ defi: '2026-10-23' }, () => 0.9);
assert.strictEqual(a.defi, '2026-10-23');
assert.strictEqual(deal(a), deal(b));
// Dates différentes : donnes différentes, sur un mois.
const deals = new Set();
for (let d = 1; d <= 22; d++) deals.add(deal(launch({ defi: `2026-10-${String(d).padStart(2, '0')}` })));
assert.strictEqual(deals.size, 22);
// Sans défi, ou date invalide : partie ordinaire.
for (const defi of [undefined, '2026-02-30', '23/10/2026', '2999-01-01', 42]) {
  const g = launch(defi === undefined ? undefined : { defi });
  assert.strictEqual(g.defi, null, `défi refusé : ${defi}`);
}

assert.ok(isDefiDate('2026-10-23', '2026-10-23'));
assert.ok(!isDefiDate('2026-10-24', '2026-10-23'));
assert.ok(!isDefiDate('2025-12-31', '2026-10-23'));
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(today()));
assert.strictEqual(today(new Date(2026, 0, 5, 23, 59)), '2026-01-05');

// Résultat vu du siège 0 (équipe 0).
const G = {
  phase: 'SCORE',
  dernierResultat: { reussi: true, preneurs: 0, preneur: 2, montant: 100, atout: 'H', multiplicateur: 2, gains: [362, 0] },
};
const r = defiResult(G, 0);
assert.deepStrictEqual(
  [r.gagne, r.reussi, r.preneur, r.nous, r.eux, r.passee],
  [true, true, 'ton partenaire', 362, 0, false],
);
assert.ok(defiResult({ ...G, dernierResultat: { ...G.dernierResultat, reussi: false, preneurs: 1, preneur: 1, gains: [260, 0] } }, 0).gagne);
assert.deepStrictEqual(defiResult({ phase: 'ENCHERES' }, 0), { passee: true, gagne: false });

// Premier résultat du jour gardé ; série de jours gagnés d'affilée.
let results = {};
({ results } = recordResult(results, '2026-10-21', { gagne: true }));
({ results } = recordResult(results, '2026-10-22', { gagne: true }));
let first;
({ results, first } = recordResult(results, '2026-10-23', { gagne: true }));
assert.ok(first);
({ results, first } = recordResult(results, '2026-10-23', { gagne: false }));
assert.ok(!first);
assert.strictEqual(results['2026-10-23'].gagne, true);
assert.strictEqual(streak(results, '2026-10-23'), 3);
({ results } = recordResult(results, '2026-10-25', { gagne: true }));
assert.strictEqual(streak(results, '2026-10-25'), 1, 'un jour manqué coupe la série');
// Passage de mois et d'année.
assert.strictEqual(streak({ '2026-12-31': { gagne: true }, '2027-01-01': { gagne: true } }, '2027-01-01'), 2);
// Au plus 120 jours gardés.
let many = {};
for (let i = 0; i < 130; i++) ({ results: many } = recordResult(many, `2027-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, { gagne: true }));
assert.strictEqual(Object.keys(many).length, 120);

const text = shareText('2026-10-23', r, 3);
assert.match(text, /Donne du jour du 23\/10\/2026/);
assert.match(text, /✅ 100 ♥ ×2 réussi \(pris par ton partenaire\)/);
assert.match(text, /🔥 3 jours gagnés de suite/);
assert.match(text, /\?defi=2026-10-23$/);
assert.match(shareText('2026-10-23', { passee: true }, 0), /Donne passée/);

console.log('defi : ok');
