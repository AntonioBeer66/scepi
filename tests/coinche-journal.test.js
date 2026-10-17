// Journal anonyme des donnes (src/coinche/journal.js) : un enregistrement
// construit sur de vraies donnes de bots passe la vérification du serveur,
// contient toute la donne et rien d'identifiant ; un enregistrement abîmé
// ou gonflé est refusé.
import assert from 'node:assert/strict';
import * as engine from '../src/coinche/engine.js';
import { buildRecord, checkRecord, JOURNAL_MAX_BYTES } from '../src/coinche/journal.js';
import { play } from './coinche-sim.js';

engine.tuning.mcSamples = 0; // réflexes : rapide
let played = 0;
let passed = 0;
let prev = null;
const check = (rec) => {
  const err = checkRecord(rec);
  assert.equal(err, null, `refusé : ${err} ${JSON.stringify(rec).slice(0, 200)}`);
  assert.ok(JSON.stringify(rec).length < JOURNAL_MAX_BYTES);
  assert.ok(!JSON.stringify(rec).includes('Ordinateur')); // aucun pseudo
};
play(engine, {
  dealSeed: 77, botSeed: 78,
  on: {
    trick(G) { prev = structuredClone(G); },
    score(G) {
      const rec = buildRecord(G, { mode: 'solo', me: 0, times: [1234.5, 800] });
      // Toutes les cartes, une fois chacune ; les mains sont les cartes jouées.
      assert.equal(new Set(rec.mains.flat()).size, 32);
      assert.deepEqual(rec.mains, rec.jeu);
      assert.equal(rec.contrat[0], G.contract.preneur);
      assert.deepEqual(rec.temps, [1235, 800]);
      check({ ...rec, humains: [1, 0, 0, 0] });
      played++;
    },
  },
});
assert.ok(played > 3, 'des donnes jouées');

// Donne passée : l'état d'avant la dernière passe.
const fake = { bidLog: [{ seat: 1 }, { seat: 2 }, { seat: 3 }], seats: [{ type: 'human' }, { type: 'bot' }, { type: 'bot' }, { type: 'bot' }],
  donneur: 3, mainsInitiales: [[{ id: 'JH' }, { id: '9H' }], [], [], []], playedBy: [[], [], [], []] };
const rp = buildRecord(fake, { mode: 'solo', me: 0, lastPass: 0 });
assert.deepEqual(rp.encheres.at(-1), [0, 0, '']);
assert.equal('contrat' in rp, false);
check(rp);
passed++;

// Refus : champ inconnu, carte inventée, temps absurde, joueur qui n'est pas humain.
const ok = buildRecord(fake, { mode: 'solo', me: 0, lastPass: 0 });
assert.equal(checkRecord({ ...ok, pseudo: 'x' }), 'CHAMP');
assert.equal(checkRecord({ ...ok, mains: [['ZZ'], [], [], []] }), 'MAINS');
assert.equal(checkRecord({ ...ok, temps: [-5] }), 'TEMPS');
assert.equal(checkRecord({ ...ok, moi: 1 }), 'HUMAINS');
assert.equal(checkRecord({ ...ok, mode: 'autre' }), 'VERSION');
assert.equal(checkRecord(null), 'FORME');

console.log(`Journal : ${played} donnes jouées et ${passed} donne passée enregistrées, refus vérifiés.`);
