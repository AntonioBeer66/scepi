// Émoticônes des bots : réaction d'un bot à ce qui vient de se passer, lue
// dans le passage d'un état public au suivant (prev → G). Règle locale :
// rien ne part au serveur, chaque écran (solo, joueurs en ligne, spectateurs)
// la déduit lui-même du même état, et le tirage dépend seulement de la
// donne, donc tout le monde voit le même bot réagir — ou aucun : la plupart
// des moments n'ont qu'une chance de déclencher une réaction.
// Comme un humain : un seul bot réagit, après un temps de réaction variable,
// et il lui arrive d'insister (même émoticône deux ou trois fois de suite).
// Renvoie la liste des bulles [siège, émoticône, attente en ms], vide sinon.
import { teamOf, WIN_SCORE } from "../engine.js";
import { LAST_TRICK_SHOW_MS, trickPause } from "../host.js";

// Tirage déterministe dans [0, 1) à partir de la donne et du moment.
function roll(G, salt) {
  let h = 2166136261;
  for (const c of `${G.donneNumero}|${G.plisJoues}|${G.phase}|${salt}`)
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 2 ** 32;
}

// Un bot parmi les sièges donnés (tirage partagé), ou null.
function pick(G, seats, salt) {
  const bots = seats.filter((s) => G.seats[s]?.type === "bot");
  return bots.length ? bots[Math.floor(roll(G, salt) * bots.length)] : null;
}

const team = (t) => [0, 1, 2, 3].filter((s) => teamOf(s) === t);
const withWait = (e, ms) => e && [...e, ms];

// Chance qu'un moment provoque une réaction.
const CHANCE = {
  capot: 0.9,
  chute: 0.6,
  sousAnnonce: 0.5,
  coincheRatee: 0.5,
  passe: 0.5,
  coinche: 0.35,
  surcoinche: 0.35,
};
// Contrat réussi avec au moins SOUS_ANNONCE points de plis de plus que
// l'annonce : les preneurs ont sous-annoncé.
const SOUS_ANNONCE = 40;

const SPAM = 0.3; // chance d'insister
const GAP_MS = 1000; // entre deux émoticônes d'un même joueur (comme hud.js)

// Attentes comptées depuis l'arrivée de l'état. Fin de donne : tout part
// pendant que le dernier pli est montré, avant le récapitulatif qui couvre
// la table (.cg-recap, au bout de LAST_TRICK_SHOW_MS) ; sinon après le pli
// en cours (trickPause).
export function botEmote(G, prev) {
  const e = reaction(G, prev);
  if (!e) return [];
  const [seat, emote, wait = 0] = e;
  const score = G.phase === "SCORE";
  const react = score ? 200 + roll(G, "délai") * 500 : 300 + roll(G, "délai") * 1200;
  const at = Math.floor(wait + react + (score ? 0 : trickPause(G))); // temps de réaction
  const out = [[seat, emote, at]];
  if (roll(G, "spam") < SPAM) {
    const n = 1 + Math.floor(roll(G, "combien") * 2);
    let t = at;
    for (let i = 1; i <= n; i++) out.push([seat, emote, (t += GAP_MS + Math.floor(roll(G, `rythme${i}`) * 300))]);
  }
  return score ? out.filter(([, , t]) => t < LAST_TRICK_SHOW_MS - 200) : out;
}

function reaction(G, prev) {
  if (!prev?.seats || !G?.seats || G.phase === "ATTENTE") return null;
  const say = (seats, emote, salt = emote) => {
    const s = pick(G, seats, salt);
    return s == null ? null : [s, emote];
  };
  const lucky = (moment) => roll(G, moment) < CHANCE[moment];
  const c = G.contract;

  // Fin de donne.
  if (G.phase === "SCORE" && prev.phase !== "SCORE" && G.dernierResultat) {
    // Dernière donne de la partie : les vainqueurs savourent, les autres
    // boudent (dès la fin du pli : la bannière finale couvrirait la table).
    if (Math.max(...G.scores) >= WIN_SCORE) {
      const win = G.scores[0] >= G.scores[1] ? 0 : 1;
      return say(team(win), "🎬") || say(team(1 - win), "😔");
    }
    const r = G.dernierResultat;
    const pre = team(r.preneurs);
    const def = team(1 - r.preneurs);
    const capot = r.plis.indexOf(8);
    if (capot >= 0) return lucky("capot") ? say(team(capot), "🗿") : null;
    if (!r.reussi) {
      if (!lucky("chute")) return null;
      // Chute : la défense se moque (plus fort s'il y avait coinche), le
      // preneur pleure, son partenaire ne comprend pas.
      const u = roll(G, "qui");
      const mock = say(def, r.multiplicateur > 1 ? "🤡" : "😂");
      if (u < 0.5) return mock;
      if (u < 0.75) return say([r.preneur], "😭") || mock;
      return say([(r.preneur + 2) % 4], "❓") || mock;
    }
    if (r.multiplicateur > 1) return lucky("coincheRatee") ? say(pre, "🥱") || say(def, "😔") : null;
    if (r.montant <= 160 && r.points[r.preneurs] >= r.montant + SOUS_ANNONCE)
      return lucky("sousAnnonce") ? say(def, "🅰️") : null;
    return null;
  }

  // Tout le monde a passé : on redonne.
  if (
    G.phase === "ENCHERES" &&
    prev.phase === "ENCHERES" &&
    G.donneNumero > prev.donneNumero
  )
    return lucky("passe") ? say([0, 1, 2, 3], "🤷") : null;

  // Coinche, puis surcoinche.
  // Troisième élément : attente (ms) que la vidéo de l'écran (hud.js, FLASH) passe.
  if (c?.coinche && !prev.contract?.coinche)
    return lucky("coinche")
      ? withWait(say([c.coincheur], "💣") || say(team(c.equipePreneur), "😳"), 1100)
      : null;
  if (c?.surcoinche && !prev.contract?.surcoinche)
    return lucky("surcoinche")
      ? withWait(say([c.surcoincheur], "💪") || say(team(1 - c.equipePreneur), "😳"), 1700)
      : null;
  return null;
}
