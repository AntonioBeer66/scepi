// Émoticônes des bots (src/coinche/client/bot-emotes.js).
import { strict as assert } from "node:assert";
import { botEmote } from "../src/coinche/client/bot-emotes.js";

const seats = [{ type: "human" }, { type: "bot" }, { type: "bot" }, { type: "bot" }];
const base = { seats, phase: "JEU", donneNumero: 3, plisJoues: 1, scores: [0, 0] };
// Chute d'un contrat coinché du preneur humain (siège 0) : la défense (1 ou 3) se moque ou rien côté preneur.
const r = { reussi: false, preneurs: 0, preneur: 0, plis: [3, 5], multiplicateur: 2 };
const e = botEmote({ ...base, phase: "SCORE", dernierResultat: r }, base);
assert.ok(e && [1, 3].includes(e[0]) && ["🤡", "😂"].includes(e[1]), String(e));
// Le siège 0 coupe son partenaire 2 (bot) déjà maître à Cœur, atout Pique.
const card = (siege, suit, rank) => ({ siege, carte: { suit, rank, id: rank + suit } });
const lastTrick = { cards: [card(1, "H", "7"), card(2, "H", "A"), card(3, "H", "8"), card(0, "S", "7")], winnerSeat: 0 };
const contract = { atout: "S", equipePreneur: 0 };
assert.deepEqual(botEmote({ ...base, contract, plisJoues: 2, lastTrick }, { ...base, contract }), [2, "❓"]);
// Coinche d'un bot.
assert.deepEqual(
  botEmote({ ...base, phase: "SURCOINCHE", contract: { ...contract, coinche: true, coincheur: 1 } }, { ...base, phase: "ENCHERES", contract }),
  [1, "💣", 1100],
);
// Même état deux fois : rien.
assert.equal(botEmote(base, base), null);
console.log("bot-emotes : ok");
