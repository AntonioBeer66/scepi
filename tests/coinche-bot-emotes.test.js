// Émoticônes des bots (src/coinche/client/bot-emotes.js).
import { strict as assert } from "node:assert";
import { botEmote } from "../src/coinche/client/bot-emotes.js";

const seats = [{ type: "human" }, { type: "bot" }, { type: "bot" }, { type: "bot" }];
const base = { seats, phase: "JEU", plisJoues: 8, scores: [0, 0] };
const N = 2000;
// Part des donnes où le moment fait réagir, et vérifications de chaque réaction.
function rate(make, check) {
  let n = 0;
  for (let d = 1; d <= N; d++) {
    const [G, prev] = make({ ...base, donneNumero: d });
    const out = botEmote(G, prev);
    assert.deepEqual(botEmote(G, prev), out, "même tirage sur tous les écrans");
    if (!out.length) continue;
    n++;
    assert.ok(out.length <= 3, "trois émoticônes au plus");
    assert.ok(out.every(([s]) => s === out[0][0]), "un seul bot à la fois");
    assert.ok(out.every(([, e]) => e === out[0][1]), "il insiste avec la même");
    out.slice(1).forEach(([, , t], i) => assert.ok(t - out[i][2] >= 1000, "une par seconde"));
    check?.(out[0]);
  }
  return n / N;
}
const near = (x, p) => assert.ok(Math.abs(x - p) < 0.05, `${x} ≠ ${p}`);
const score = (r) => (b) => [{ ...b, phase: "SCORE", dernierResultat: r }, b];

// Chute d'un contrat coinché du preneur humain (siège 0).
const chute = { reussi: false, preneurs: 0, preneur: 0, plis: [3, 5], points: [60, 102], montant: 100, multiplicateur: 2 };
near(rate(score(chute), ([s, e]) => assert.ok(
  ([1, 3].includes(s) && e === "🤡") || (s === 2 && e === "❓"), `${s} ${e}`)), 0.6);
// Capot : presque toujours.
const capot = { reussi: true, preneurs: 1, preneur: 1, plis: [0, 8], points: [0, 162], montant: 80, multiplicateur: 1 };
near(rate(score(capot), ([s, e]) => assert.ok([1, 3].includes(s) && e === "🗿")), 0.9);
// Sous-annonce : 80 annoncé, 130 faits ; la défense (bots 1 et 3) le fait remarquer.
const sous = { reussi: true, preneurs: 0, preneur: 0, plis: [6, 2], points: [130, 32], montant: 80, multiplicateur: 1 };
near(rate(score(sous), ([s, e]) => assert.ok([1, 3].includes(s) && e === "🅰️")), 0.5);
// Contrat juste fait : rien.
assert.equal(rate(score({ ...sous, points: [95, 67] })), 0);
// Fin de partie : toujours, dès la dernière donne (avant le récapitulatif).
assert.equal(rate((b) => [{ ...b, phase: "SCORE", scores: [700, 1020], dernierResultat: sous }, b],
  ([s, e]) => assert.ok([1, 3].includes(s) && e === "🎬")), 1);
// Fin de donne : toutes les bulles avant le récapitulatif (2,5 s).
for (let d = 1; d <= N; d++) {
  const b = { ...base, donneNumero: d };
  for (const [, , t] of botEmote(...score(capot)(b))) assert.ok(t < 2300, `${t} ms`);
}
// Coinche d'un bot : parfois.
const contract = { atout: "S", equipePreneur: 0 };
near(rate(
  (b) => [{ ...b, phase: "SURCOINCHE", contract: { ...contract, coinche: true, coincheur: 1 } }, { ...b, phase: "ENCHERES", contract }],
  ([s, e, t]) => assert.ok(s === 1 && e === "💣" && t >= 1100),
), 0.35);
// Même état deux fois : rien.
assert.deepEqual(botEmote({ ...base, donneNumero: 1 }, { ...base, donneNumero: 1 }), []);
console.log("bot-emotes : ok");
