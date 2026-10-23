// Émoticônes des bots : réaction d'un bot à ce qui vient de se passer, lue
// dans le passage d'un état public au suivant (prev → G). Rien n'est envoyé :
// chaque écran (solo, joueurs en ligne, spectateurs) la déduit lui-même du
// même état, et le tirage dépend seulement de la donne, donc tout le monde
// voit le même bot réagir. Renvoie [siège, émoticône, attente en ms ?] ou null.
import { teamOf, trickWinnerSeat } from "../engine.js";

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

export function botEmote(G, prev) {
  if (!prev?.seats || !G?.seats || G.phase === "ATTENTE") return null;
  const say = (seats, emote, salt = emote) => {
    const s = pick(G, seats, salt);
    return s == null ? null : [s, emote];
  };
  const c = G.contract;

  // Partie gagnée : les vainqueurs savourent, les autres boudent.
  if (G.phase === "TERMINEE" && prev.phase !== "TERMINEE") {
    const win = G.scores[0] >= G.scores[1] ? 0 : 1;
    return say(team(win), "🎬") || say(team(1 - win), "😔");
  }

  // Fin de donne.
  if (G.phase === "SCORE" && prev.phase !== "SCORE" && G.dernierResultat) {
    const r = G.dernierResultat;
    const pre = team(r.preneurs);
    const def = team(1 - r.preneurs);
    if (r.reussi && r.plis[r.preneurs] === 8) return say(pre, "🗿"); // capot
    if (!r.reussi && r.plis[1 - r.preneurs] === 8) return say(def, "🗿");
    if (!r.reussi)
      // Chute : la défense se moque (plus fort s'il y avait coinche), le preneur pleure.
      return roll(G, "chute") < 0.6
        ? say(def, r.multiplicateur > 1 ? "🤡" : "😂")
        : say([r.preneur], "😭") || say(def, "😂");
    if (r.multiplicateur > 1) return say(pre, "🥱") || say(def, "😔"); // coinche ratée
    return null;
  }

  // Tout le monde a passé : on redonne.
  if (
    G.phase === "ENCHERES" &&
    prev.phase === "ENCHERES" &&
    G.donneNumero > prev.donneNumero &&
    roll(G, "passe") < 0.5
  )
    return say([0, 1, 2, 3], "🤷");

  // Coinche, puis surcoinche.
  // Troisième élément : attente (ms) que la vidéo de l'écran (hud.js, FLASH) passe.
  if (c?.coinche && !prev.contract?.coinche)
    return withWait(say([c.coincheur], "💣") || say(team(c.equipePreneur), "😳"), 1100);
  if (c?.surcoinche && !prev.contract?.surcoinche)
    return withWait(say([c.surcoincheur], "💪") || say(team(1 - c.equipePreneur), "😳"), 1700);

  // Pli où un joueur a coupé son partenaire déjà maître : le partenaire (bot)
  // ne comprend pas.
  const t = G.lastTrick;
  if (t && t !== prev.lastTrick && G.plisJoues > prev.plisJoues && c) {
    const lead = t.cards[0].carte.suit;
    for (let i = 2; i < t.cards.length; i++) {
      const { siege, carte } = t.cards[i];
      const before = t.cards.slice(0, i);
      const master = trickWinnerSeat(before, c.atout);
      const mate = (siege + 2) % 4;
      if (
        lead !== c.atout &&
        carte.suit === c.atout &&
        master === mate &&
        before.every((e) => e.carte.suit !== c.atout)
      )
        return say([mate], "❓");
    }
  }
  return null;
}
