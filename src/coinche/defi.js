// Donne du jour : la même donne pour tout le monde ce jour-là, jouée seul
// contre trois bots, puis un résultat à partager. Les mains et le donneur
// viennent d'un hasard tiré de la date (defiRandom) ; les bots décident
// déjà de façon déterministe (voir stateSeed dans engine.js). Ce qu'on a
// fait les jours précédents reste dans ce navigateur (localStorage).

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const DEFI_URL = "https://www.scepinvaders.com/jeux/coinche/?defi=";
export const DEFI_STORAGE = "scepi-coinche-defi";
const KEEP_DAYS = 120;

const pad = (n) => String(n).padStart(2, "0");

// Date du jour chez le joueur (fuseau de l'appareil), AAAA-MM-JJ.
export function today(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Vraie date du calendrier, pas après aujourd'hui (une donne future n'existe pas).
export function isDefiDate(s, now = today()) {
  const m = typeof s === "string" && DATE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && s >= "2026-01-01" && s <= now;
}

// La veille de AAAA-MM-JJ.
function dayBefore(s) {
  const m = DATE.exec(s);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] - 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// Hasard de la donne : mulberry32 (comme prng dans engine.js), graine FNV-1a de la date.
export function defiRandom(date) {
  let h = 0x811c9dc5;
  for (const c of `scepi-defi-${date}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  let s = h | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Résultat de la donne pour le siège me : G en phase SCORE, ou null si les
// quatre ont passé.
export function defiResult(G, me) {
  const r = G?.phase === "SCORE" ? G.dernierResultat : null;
  if (!r) return { passee: true, gagne: false };
  const us = me % 2;
  const preneur = r.preneur === me ? "toi" : r.preneur % 2 === us ? "ton partenaire" : "l’adversaire";
  return {
    passee: false,
    gagne: (r.reussi ? r.preneurs : 1 - r.preneurs) === us,
    reussi: !!r.reussi,
    montant: r.montant,
    atout: r.atout,
    multiplicateur: r.multiplicateur || 1,
    preneur,
    nous: r.gains[us],
    eux: r.gains[1 - us],
  };
}

// Garde le premier résultat de chaque jour (rejouer ne l'efface pas) ;
// rend { results, first } où first dit si celui-ci compte.
export function recordResult(results, date, result) {
  const out = { ...(results || {}) };
  const first = !out[date];
  if (first) out[date] = result;
  const days = Object.keys(out).sort();
  for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete out[d];
  return { results: out, first };
}

// Jours gagnés d'affilée, jusqu'à date incluse.
export function streak(results, date) {
  let n = 0;
  for (let d = date; results?.[d]?.gagne; d = dayBefore(d)) n++;
  return n;
}

const SUIT = { H: "♥", D: "♦", C: "♣", S: "♠" };
const AMOUNT = { 250: "Capot", 270: "Capot beloté", 500: "Générale", 520: "Générale belotée" };

export function contractLabel(r) {
  return `${AMOUNT[r.montant] || r.montant} ${SUIT[r.atout] || ""}${r.multiplicateur > 1 ? ` ×${r.multiplicateur}` : ""}`;
}

// Texte à partager : court, sans rien dévoiler des mains.
export function shareText(date, result, days) {
  const [y, m, d] = date.split("-");
  const lines = [`SCEP Invaders · Donne du jour du ${d}/${m}/${y}`];
  if (result.passee) lines.push("🤝 Donne passée : personne n’a pris");
  else {
    lines.push(
      `${result.reussi ? "✅" : "❌"} ${contractLabel(result)} ${result.reussi ? "réussi" : "chuté"} (pris par ${result.preneur})`,
      `Nous +${result.nous} · Eux +${result.eux}`,
    );
  }
  if (days > 1) lines.push(`🔥 ${days} jours gagnés de suite`);
  lines.push(DEFI_URL + date);
  return lines.join("\n");
}
