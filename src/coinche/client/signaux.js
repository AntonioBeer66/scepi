// Signaux de défausse (appel, refus) tels que le moteur les a lus, pour
// l'affichage (hud.js, table-scene.js). Ce module ne décide de rien : il
// recopie G.appel[siège] et G.refus[siège]. Il ne suppose que deux choses :
// ces champs sont indexés par siège et désignent des couleurs (clés d'un
// objet { S: true }, tableau, chaîne ou { suit }). Si le moteur change ce
// qu'il lit (autre règle, autre forme), l'affichage suit sans y toucher.
import { SUITS } from "../engine.js";

function suitsOf(v) {
  if (!v) return [];
  if (typeof v === "string") return SUITS.includes(v) ? [v] : [];
  if (Array.isArray(v)) return v.flatMap(suitsOf);
  if (typeof v === "object") return v.suit ? suitsOf(v.suit) : SUITS.filter((s) => v[s]);
  return [];
}

// Tous les signaux lus dans la donne : [{ seat, kind, suit }], kind valant
// le nom du champ du moteur ("appel" ou "refus").
export function readSignals(G) {
  const out = [];
  for (const kind of ["appel", "refus"])
    for (let seat = 0; seat < 4; seat++)
      for (const suit of suitsOf(G?.[kind]?.[seat])) out.push({ seat, kind, suit });
  return out;
}

// Ceux que cet état a de plus que le précédent, dans la même donne : un
// signal qui en remplace un autre compte comme nouveau, un signal effacé
// ne se montre pas.
export function newSignals(G, prev) {
  if (!prev || prev.donneNumero !== G.donneNumero) return [];
  const key = (s) => `${s.seat}${s.kind}${s.suit}`;
  const had = new Set(readSignals(prev).map(key));
  return readSignals(G).filter((s) => !had.has(key(s)));
}
