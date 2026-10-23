// Puzzles du jour des échecs (site/assets/js/echecs/puzzles.json, faits par
// tools/puzzles-echecs.mjs) : chaque solution est jouable avec le chess.js
// du site, finit sur un mat, et dure autant de coups qu'annoncé ; positions
// toutes différentes.
//   node tests/echecs-puzzles.test.js
import assert from 'assert';
import { readFileSync } from 'fs';

const Chess = new Function(`${readFileSync(new URL('../site/assets/js/echecs/chess.min.js', import.meta.url), 'utf8')}; return Chess;`)();
const { version, puzzles } = JSON.parse(readFileSync(new URL('../site/assets/js/echecs/puzzles.json', import.meta.url), 'utf8'));

assert.strictEqual(version, 1);
assert.ok(puzzles.length >= 100, `au moins 100 jours de puzzles (${puzzles.length})`);
const seen = new Set();
for (const [i, p] of puzzles.entries()) {
  const where = `puzzle ${i} (${p.fen})`;
  const key = p.fen.split(' ').slice(0, 4).join(' ');
  assert.ok(!seen.has(key), `${where} : en double`);
  seen.add(key);
  assert.ok(p.mat === 2 || p.mat === 3, `${where} : mat en ${p.mat}`);
  assert.strictEqual(p.solution.length, 2 * p.mat - 1, `${where} : longueur`);
  const g = new Chess(p.fen);
  assert.ok(!g.game_over(), `${where} : partie déjà finie`);
  for (const [k, u] of p.solution.entries()) {
    assert.ok(g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }), `${where} : coup ${u} illégal`);
    if (k < p.solution.length - 1) assert.ok(!g.game_over(), `${where} : fin avant le dernier coup`);
  }
  assert.ok(g.in_checkmate(), `${where} : pas de mat à la fin`);
}
console.log(`puzzles d'échecs : ${puzzles.length} ok`);
