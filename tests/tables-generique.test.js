// Le serveur de tables (src/online/tables.js) ne connaît aucun jeu : un jeu
// minimal à deux joueurs (le premier à 3 l'emporte) y tourne avec sa seule fiche.
//   node tests/tables-generique.test.js
import assert from "assert";
import { cleanChat, cleanName, createTables, historyCSV, historyRow, MAX_CHAT, sameName } from "../src/online/tables.js";

// Messages : une ligne nette, bornée, rien si vide ou pas du texte.
assert.strictEqual(cleanChat("  Bien\n\tjoué\u0000 ! "), "Bien joué !");
assert.strictEqual(cleanChat(" \n "), "");
assert.strictEqual(cleanChat(42), "");
assert.strictEqual([...cleanChat("😂".repeat(500))].length, MAX_CHAT, "coupé sans casser d'émoji");
assert.strictEqual(cleanChat("👨‍👩‍👧 gg"), "👨‍👩‍👧 gg", "émoji composé entier");
// Pseudos : un seul nettoyage, et les sosies (invisibles, espaces, accents décomposés) sont le même pseudo.
assert.strictEqual(cleanName("abcdefghijklmnopq😀"), "abcdefghijklmnopq😀", "émoji jamais coupé en deux");
assert.strictEqual(cleanName("  Bo  b\n"), "Bo b");
assert.ok(sameName("Alice", "Alice​") && sameName("Zoé", "Zoé") && sameName("Bo  b", "bo b"), "sosies");
assert.ok(!sameName("Alice", "Alicia"));

const Course = {
  setup: () => ({ points: [0, 0], fini: false }),
  moves: {
    avancer: ({ G, playerID }) => {
      if (G.fini) return "INVALID_MOVE";
      G.points[playerID]++;
      G.fini = G.points[playerID] >= 3;
    },
  },
};
const fiche = {
  game: Course,
  numPlayers: 2,
  started: (G) => G.points.some((p) => p > 0),
  finished: (G) => G.fini,
  humanMoves: new Set(["avancer"]),
  historyHead: ["Date", "Table", "Gagnant"],
  historyRow: (m, date, table) => [date, table, m.players[m.G.points[0] >= 3 ? 0 : 1].name],
};

const tables = createTables(fiche);
tables.maintain();
const [id] = tables.list(() => false).map((t) => t.matchID);
assert.strictEqual(tables.get(id).players.length, 2, "deux places, pas quatre");
assert.strictEqual(tables.join(id, 2, "Zoé").error, "INVALIDE", "pas de troisième place");
const cred = tables.join(id, 0, "Ana").credentials;
assert.strictEqual(tables.join(id, 1, " ana ").error, "PSEUDO_PRIS", "même pseudo refusé à la même table");
assert.strictEqual(tables.join(id, 1, "Ana​").error, "PSEUDO_PRIS", "sosie invisible refusé");
assert.ok(tables.auth(id, 0, cred));
assert.ok(!tables.move(id, 0, "inconnu", []), "coup inconnu refusé");
for (let i = 0; i < 3; i++) assert.ok(tables.move(id, 0, "avancer", []));
assert.ok(!tables.move(id, 0, "avancer", []), "partie finie");
assert.strictEqual(tables.list(() => true).find((t) => t.matchID === id).phase, "TERMINEE");
assert.deepStrictEqual(historyRow(fiche, tables.get(id), Date.UTC(2026, 9, 7, 12)), ["2026-10-07 14:00", "Table 1", "Ana"]);
assert.ok(historyCSV(fiche.historyHead, []).includes('"Gagnant"'));
console.log("Serveur de tables générique : un jeu à deux places tourne avec sa seule fiche.");
