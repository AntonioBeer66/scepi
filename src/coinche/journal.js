// Journal anonyme des donnes jouées par des humains : pour comprendre comment
// on joue vraiment (enchères, entames, temps de réflexion) et en tirer des
// idées pour les bots — une observation, pas une vérité (un humain se trompe
// aussi). Ni pseudo, ni identifiant, ni adresse : seulement les cartes, les
// annonces et, pour le joueur de ce navigateur, le temps mis à décider.
// Le navigateur hôte (seul à voir les mains des bots) envoie chaque donne
// finie à /api/journal (worker/journal.js), qui la vérifie avec checkRecord.

const CARD = /^(7|8|9|10|J|Q|K|A)[HDCS]$/;
const SUITS = ["H", "D", "C", "S"];
export const JOURNAL_MAX_BYTES = 8 * 1024;

// Une donne finie (phase SCORE) ou passée (quatre passes : G est alors
// l'état d'avant la dernière passe, `lastPass` son siège). `times` : temps
// de décision en ms du joueur `me`, dans l'ordre de ses actions.
export function buildRecord(G, { mode, me, times = [], lastPass = null }) {
  const played = lastPass == null;
  const bids = G.bidLog.map((e) => [e.seat, e.montant || 0, e.atout || ""]);
  if (!played) bids.push([lastPass, 0, ""]);
  // Mains de départ : toutes jouées en fin de donne ; sinon celles que ce
  // navigateur voit (la sienne, celles des bots s'il est l'hôte).
  const hands = [0, 1, 2, 3].map((s) =>
    (played && G.playedBy[s].length === 8 ? G.playedBy[s] : G.mainsInitiales[s] || []).map((c) => c.id),
  );
  const rec = {
    v: 1,
    mode,
    donneur: G.donneur,
    humains: G.seats.map((s) => (s.type === "human" ? 1 : 0)),
    mains: hands,
    encheres: bids,
    moi: me,
    temps: times.map((t) => Math.round(t)),
  };
  if (played) {
    const c = G.contract;
    const r = G.dernierResultat;
    Object.assign(rec, {
      contrat: [c.preneur, c.montant, c.atout, c.coincheur ?? -1, c.surcoincheur ?? -1, c.generale ? 1 : 0],
      jeu: G.playedBy.map((cards) => cards.map((x) => x.id)),
      points: G.pointsPlis.slice(),
      reussi: r.reussi ? 1 : 0,
      scores: G.scores.slice(),
    });
  }
  return rec;
}

const isSeat = (s) => Number.isInteger(s) && s >= 0 && s <= 3;
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const cards = (a) => Array.isArray(a) && a.length <= 8 && a.every((id) => typeof id === "string" && CARD.test(id));

// Motif du refus, ou null si l'enregistrement est bien formé.
export function checkRecord(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return "FORME";
  const keys = ["v", "mode", "donneur", "humains", "mains", "encheres", "moi", "temps", "contrat", "jeu", "points", "reussi", "scores"];
  if (Object.keys(r).some((k) => !keys.includes(k))) return "CHAMP";
  if (r.v !== 1 || (r.mode !== "solo" && r.mode !== "ligne")) return "VERSION";
  if (!isSeat(r.donneur) || !isSeat(r.moi)) return "SIEGE";
  if (!Array.isArray(r.humains) || r.humains.length !== 4 || !r.humains.every((h) => h === 0 || h === 1) || !r.humains[r.moi])
    return "HUMAINS";
  if (!Array.isArray(r.mains) || r.mains.length !== 4 || !r.mains.every(cards)) return "MAINS";
  if (!Array.isArray(r.encheres) || r.encheres.length > 64) return "ENCHERES";
  for (const e of r.encheres)
    if (!Array.isArray(e) || e.length !== 3 || !isSeat(e[0]) || !isInt(e[1], 0, 520) || !(e[2] === "" || SUITS.includes(e[2])))
      return "ENCHERES";
  if (!Array.isArray(r.temps) || r.temps.length > 64 || !r.temps.every((t) => isInt(t, 0, 3_600_000))) return "TEMPS";
  if ("contrat" in r) {
    const c = r.contrat;
    if (!Array.isArray(c) || c.length !== 6 || !isSeat(c[0]) || !isInt(c[1], 80, 520) || !SUITS.includes(c[2]) ||
      !isInt(c[3], -1, 3) || !isInt(c[4], -1, 3) || !isInt(c[5], 0, 1))
      return "CONTRAT";
    if (!Array.isArray(r.jeu) || r.jeu.length !== 4 || !r.jeu.every(cards)) return "JEU";
    if (!Array.isArray(r.points) || r.points.length !== 2 || !r.points.every((p) => isInt(p, 0, 182))) return "POINTS";
    if (!isInt(r.reussi, 0, 1)) return "REUSSI";
    if (!Array.isArray(r.scores) || r.scores.length !== 2 || !r.scores.every((s) => isInt(s, -100000, 100000))) return "SCORES";
  }
  return null;
}
