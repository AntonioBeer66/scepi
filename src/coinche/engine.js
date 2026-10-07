// Moteur de coinche, conforme au profil scepi-online-v1 décrit dans
// REGLES_COINCHE.md : règles, score et IA des bots, sans affichage ni
// minuteur. L'état G ne contient que des données simples (JSON) : le
// serveur boardgame.io le stocke et l'envoie tel quel, mains cachées
// (voir game.js). Le temps vient de l'extérieur : un délai écoulé est une
// action TIMEOUT (tour expiré, fin de la fenêtre de surcoinche, fin de
// l'affichage du score), envoyée par l'hôte de la table (voir host.js).
// Les bots (enchères par un vrai système de coinche, jeu de la carte par
// réflexes de club affinés au Monte-Carlo) ne voient que leur main et ce
// qui est public : ils imaginent les autres mains (mondes compatibles avec
// les cartes tombées, les manques, les obligations de couper, les enchères
// relues avec leur propre système et les appels). Chaque robot a une
// « personnalité » tirée en début de partie (agressivité, bluff, appétit à
// coincher) pour ne pas être parfaitement prévisible.

export const SUITS = ["H", "D", "C", "S"];
export const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUIT_SYMBOL = { H: "♥", D: "♦", C: "♣", S: "♠" };
export const SUIT_NAME = { H: "Cœur", D: "Carreau", C: "Trèfle", S: "Pique" };
const RANK_NAME = {
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  J: "Valet",
  Q: "Dame",
  K: "Roi",
  A: "As",
};
const TRUMP_POINTS = { J: 20, 9: 14, A: 11, 10: 10, K: 4, Q: 3, 8: 0, 7: 0 };
const PLAIN_POINTS = { A: 11, 10: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 };
export const TRUMP_FORCE = { J: 8, 9: 7, A: 6, 10: 5, K: 4, Q: 3, 8: 2, 7: 1 };
export const PLAIN_FORCE = { A: 8, 10: 7, K: 6, Q: 5, J: 4, 9: 3, 8: 2, 7: 1 };
// Générale et Générale belotée : le preneur fait les huit plis à lui seul
// (belotée : avec la belote) et entame. Au-dessus de tous les capots (rangs
// 500 et 520 pour l'ordre des enchères), elles valent 250 et 270 (voir
// contractValue).
export const GENERALE = 500;
export const GENERALE_BELOTE = 520;
export const ALLOWED_BIDS = [
  80, 90, 100, 110, 120, 130, 140, 150, 160, 250, 270, GENERALE, GENERALE_BELOTE,
];
// Belote de l'équipe preneuse (preneur ou partenaire) : +20 au décompte de
// la donne (pas au score de la partie) si elle fait au moins 81 points de plis.
export const BELOTE_BONUS = 20;
const BELOTE_MIN = 81;

// Durée de chaque fenêtre (REGLES_COINCHE.md §1 et §5) : à son terme,
// l'hôte envoie TIMEOUT.
export const DURATION_MS = {
  ENCHERES: 20000,
  JEU: 20000,
  SURCOINCHE: 10000,
  SCORE: 4000, // récapitulatif de la donne
};
export const WIN_SCORE = 1010;

// Hasard des règles (mélange, carte jouée d'office) : fourni par l'appelant
// le temps d'une action, pour que le serveur et les clients boardgame.io
// tirent la même chose. Les bots gardent Math.random.
let rand = Math.random;

export function bidType(montant) {
  if (montant === 250) return "CAPOT";
  if (montant === 270) return "CAPOT_BELOTE";
  if (montant === GENERALE) return "GENERALE";
  if (montant === GENERALE_BELOTE) return "GENERALE_BELOTE";
  return "NUMERIQUE";
}

// Points que vaut un contrat réussi (avant multiplicateur).
export function contractValue(contract) {
  if (contract.type === "GENERALE") return 250;
  if (contract.type === "GENERALE_BELOTE") return 270;
  return contract.montant;
}

const isGenerale = (contract) => contract.type.startsWith("GENERALE");

function suivant(s) {
  return (s + 1) % 4;
}
function teamOf(s) {
  return s % 2;
}

function buildDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS) deck.push({ suit, rank, id: rank + suit });
  return deck;
}

function shuffle(deck, r = Math.random) {
  const a = deck.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deal(deck, donneur) {
  const hands = [[], [], [], []];
  const order = [
    suivant(donneur),
    suivant(suivant(donneur)),
    suivant(suivant(suivant(donneur))),
    donneur,
  ];
  let i = 0;
  for (const count of [3, 3, 2]) {
    for (const seat of order) {
      hands[seat].push(...deck.slice(i, i + count));
      i += count;
    }
  }
  return hands;
}

function cardLabel(card) {
  return `${RANK_NAME[card.rank]} de ${SUIT_NAME[card.suit]}`;
}

// Score d'une carte pour déterminer le maître d'un pli en cours (-1 = ne peut pas être maître)
function winValue(card, atout, couleurDemandee) {
  if (card.suit === atout) return 100 + TRUMP_FORCE[card.rank];
  if (card.suit === couleurDemandee) return PLAIN_FORCE[card.rank];
  return -1;
}

function trickWinnerSeat(pli, atout) {
  if (!pli.length) return null;
  const couleurDemandee = pli[0].carte.suit;
  let best = pli[0];
  for (const entry of pli.slice(1)) {
    if (
      winValue(entry.carte, atout, couleurDemandee) >
      winValue(best.carte, atout, couleurDemandee)
    )
      best = entry;
  }
  return best.siege;
}

function trickPoints(pli, atout) {
  return pli.reduce(
    (sum, e) =>
      sum +
      (e.carte.suit === atout
        ? TRUMP_POINTS[e.carte.rank]
        : PLAIN_POINTS[e.carte.rank]),
    0,
  );
}

function cardPoints(card, atout) {
  return card.suit === atout
    ? TRUMP_POINTS[card.rank]
    : PLAIN_POINTS[card.rank];
}

function forceOf(card, atout) {
  return card.suit === atout
    ? TRUMP_FORCE[card.rank]
    : PLAIN_FORCE[card.rank];
}

// cartesLegales(main, pli, atout, siège) — section 6 de REGLES_COINCHE.md.
function computeLegal(main, pli, atout, siege) {
  if (!pli.length) return main.slice();
  const couleurDemandee = pli[0].carte.suit;
  const maitreSeat = trickWinnerSeat(pli, atout);
  const fournissables = main.filter((c) => c.suit === couleurDemandee);

  if (fournissables.length) {
    if (couleurDemandee === atout) {
      const maitreForce =
        TRUMP_FORCE[pli.find((e) => e.siege === maitreSeat).carte.rank];
      const superieures = fournissables.filter(
        (c) => TRUMP_FORCE[c.rank] > maitreForce,
      );
      if (superieures.length) return superieures;
    }
    return fournissables;
  }

  if (teamOf(maitreSeat) === teamOf(siege)) return main.slice();

  const atouts = main.filter((c) => c.suit === atout);
  if (!atouts.length) return main.slice();

  const maitreCarte = pli.find((e) => e.siege === maitreSeat).carte;
  if (maitreCarte.suit === atout) {
    const superieurs = atouts.filter(
      (c) => TRUMP_FORCE[c.rank] > TRUMP_FORCE[maitreCarte.rank],
    );
    if (superieurs.length) return superieurs;
  }
  return atouts;
}

// ---- État de jeu -------------------------------------------------------

// La partie en cours de traitement : chaque fonction exportée la reçoit en
// paramètre et la pose ici le temps de l'appel (voir withG, en fin de
// fichier). Les simulations des bots la remplacent un instant par un monde
// imaginé (playOut).
let G = null;

// Nouvelle partie. seats : [{ type: "human" | "bot", name }].
function newGame(seats) {
  G = {
    seats,
    donneur: Math.floor(rand() * 4),
    donneNumero: 1,
    scores: [0, 0],
    history: [],
    contractCounter: 0,
    // Identifiant de la fenêtre de temps en cours (tour d'enchère ou de
    // jeu, surcoinche, affichage du score) : un TIMEOUT ne vaut que pour
    // la fenêtre qu'il vise, jamais pour la suivante.
    tour: 0,
    // Personnalité tirée une fois par siège : agressivité (relève les
    // enchères plus tôt), bluff (probabilité d'annoncer au-delà de sa
    // force réelle) et appétit à coincher.
    personalities: [0, 1, 2, 3].map(() => ({
      aggr: 0.75 + rand() * 0.6,
      bluff: rand() * 0.14,
      coincheAppetite: 0.7 + rand() * 0.7,
    })),
  };
  startNewDonne();
  return G;
}

// Imposer la donne (tests) : (G, paquet) => 4 mains, ou null pour mélanger.
let dealOverride = null;

function startNewDonne() {
  G.donneur = G.donneNumero === 1 ? G.donneur : suivant(G.donneur);
  G.donneNumero++;
  G.hands =
    (dealOverride && dealOverride(G, buildDeck())) ||
    deal(shuffle(buildDeck(), rand), G.donneur);
  G.mainsInitiales = G.hands.map((h) => h.slice());
  G.contract = null;
  G.passesConsecutives = 0;
  G.multiplicateur = 1;
  G.pliCourant = [];
  G.plisJoues = 0;
  G.plisGagnes = [0, 0];
  G.plisSiege = [0, 0, 0, 0];
  G.pointsPlis = [0, 0];
  G.belote = {
    holder: null,
    kingPlayed: false,
    queenPlayed: false,
    beloteDeclared: false,
    rebeloteDeclared: false,
  };
  // Dernier pli complet : l'écran l'affiche le temps de le ramasser, puis
  // derrière le bouton « Voir le pli précédent ».
  G.lastTrick = null;
  G.dernierResultat = null;
  // Mémoire de l'IA pour cette donne : cartes déjà vues (les siennes
  // exclues, pour compter ce qu'il reste ailleurs) et « manques » déduits
  // — un siège qui ne fournit pas une couleur demandée n'en a plus, ce qui
  // permet ensuite de ne pas mener un as dans une couleur où un adversaire
  // pourra couper, ou au contraire de savoir qu'une couleur est sûre.
  // Tout cela se déduit des cartes jouées : c'est public.
  G.seen = {};
  G.void = [{}, {}, {}, {}];
  // Atout le plus fort (TRUMP_FORCE) que chacun peut encore tenir, déduit
  // des obligations de couper et de monter : 0 = plus d'atout.
  G.trumpMax = [8, 8, 8, 8];
  // Signaux de défausse : appel (petite carte sous un As, « rejoue-moi
  // cette couleur ») et refus (Roi/Dame d'une couleur faible, « n'y va
  // pas »). Lus depuis les cartes jouées, jamais depuis une main.
  G.appel = [{}, {}, {}, {}];
  G.refus = [{}, {}, {}, {}];
  // Historique des annonces de la donne (qui a annoncé quoi, à quel
  // palier) : la seule fenêtre qu'un bot a sur les mains des autres,
  // relue avec le système d'enchères des bots (voir botDecideBid).
  G.donneAnnonces = [];
  // Journal complet des enchères (passes comprises) et cartes jouées par
  // chacun : de quoi reconstituer la main de départ d'une main imaginée et
  // vérifier qu'elle colle à ce que le siège a annoncé (voir bidFits).
  G.bidLog = [];
  G.playedBy = [[], [], [], []];
  // Ce que chaque bot a déjà dit (soutien, second tour, reprise pour la
  // belote) et combien de fois chaque ligne a « forcé » une enchère. Le
  // bot décide sur une copie de l'état : son action rapporte ces deux
  // champs (action.memo), recopiés ici.
  G.bidMemo = [{}, {}, {}, {}];
  G.forced = [0, 0];
  G.phase = "ENCHERES";
  G.joueurActif = suivant(G.donneur);
  startTurn();
}

// Ouvre une nouvelle fenêtre de temps (voir G.tour et DURATION_MS).
function startTurn() {
  G.tour++;
}

// Ce qu'un bot fait quand c'est à lui : enchère ou carte.
function botTurnAction(seat) {
  if (G.joueurActif !== seat) return null;
  if (G.phase === "ENCHERES") return botDecideBid(seat);
  if (G.phase === "JEU") return { type: "JOUER", carte: botChooseCard(seat) };
  return null;
}

// ---- IA : système d'enchères -------------------------------------------
// Les bots annoncent selon un vrai système de coinche, inspiré de « La
// Coinche : vers un système efficace » (D. Graux, 2016) et des conventions
// de club les plus répandues. Une annonce décrit la main ; les bots
// relisent les annonces des autres avec la même grille, sans jamais voir
// leurs cartes.
//
//   Ouverture à la couleur (tenue de l'atout) :
//     80   Valet troisième, 9 + As troisième, As + 10 quatrième, Valet + belote
//     90   « 90 fort » : Valet + 9 troisième, la tenue est garantie
//     100  4 atouts avec Valet ou 9 et As/10, ou 5 atouts belotés + un As
//     110 / 120 / 130  Valet + 9 et 3 / 2 / 1 fausses cartes ; 0 = capot
//   Soutien du partenaire : +20 Valet, +10 9 second, +10 par As hors atout,
//     −10 si court à l'atout, +20 belote (elle compte pour l'équipe), puis
//     on retire un palier de prudence :
//     un contrat chuté donne 160 à l'adversaire, 10 points de plus ne
//     valent jamais ce risque.
//   Capot quand les As annoncés (« clefs ») couvrent les fausses cartes
//     de l'ouvreur, ou quand la simulation le voit réussir : toujours
//     validé par elle (7 fois sur 10 au moins, sur 24 mondes au moins).
//   Générale seulement si elle réussit plus souvent que le capot de même
//     valeur, ou pour passer au-dessus d'un capot adverse.
//   Compétition : soutenir le partenaire en « forçant » de 10, deux fois au
//     plus par ligne ; au-dessus de l'adversaire, surenchérir seulement si
//     la donne simulée le vaut mieux que le laisser jouer (voir étape 3).
//   Ouverture au barème, sauf contrat que la simulation voit chuter une
//     fois sur deux ; 80 hors barème s'il réussit 7 fois sur 10.
//   Ces barèmes ont été calibrés en simulation (parties bots contre bots
//     sur les mêmes donnes) : le système d'origine surenchérissait.
//   Coinche : jouer la donne sur des mondes compatibles avec les enchères
//     et coincher quand le contrat réussit nettement moins souvent que
//     160/(160+M) ; contre un capot, seul un pli d'atout sûr compte.
//   Score : il ne change pas le style d'enchère (être prudent en tête et
//     risquer quand l'adversaire va sortir coûtait des parties en
//     simulation), mais la coinche en tient compte : gratuite si le preneur
//     sort de toute façon en réussissant, jamais si une simple chute nous
//     fait déjà gagner (et de même pour la surcoinche).

const FAUSSES_PROMISES = { 90: 4, 110: 3, 120: 2, 130: 1 };

function personality(seat) {
  return G.personalities[seat];
}

function partnerOf(seat) {
  return (seat + 2) % 4;
}
function suitCards(hand, suit) {
  return hand.filter((c) => c.suit === suit);
}
function holds(hand, suit, rank) {
  return hand.some((c) => c.suit === suit && c.rank === rank);
}
// Main en masque de 32 bits (carte = couleur × 8 + rang, ordre de SUITS et
// RANKS) : les questions des enchères (« tient-il le Valet ? combien
// d'atouts ? ») deviennent des tests de bits. Elles sont posées des
// milliers de fois par décision quand les mondes imaginés sont relus avec
// les enchères (bidFits). Les fonctions d'enchère prennent une main ou son masque.
const CARD_INDEX = {};
const SHIFT = {};
const RANK_BIT = {};
SUITS.forEach((s, i) => {
  SHIFT[s] = i * 8;
  RANKS.forEach((r, j) => {
    CARD_INDEX[r + s] = i * 8 + j;
    RANK_BIT[r] = 1 << j;
  });
});
const POP8 = Array.from({ length: 256 }, (_, x) => {
  let n = 0;
  for (; x; x &= x - 1) n++;
  return n;
});
function maskOf(cards) {
  let m = 0;
  for (const c of cards) m |= 1 << CARD_INDEX[c.id];
  return m;
}
const asMask = (h) => (typeof h === "number" ? h : maskOf(h));
const suitBits = (m, s) => (m >>> SHIFT[s]) & 0xff;
const has = (m, s, r) => (suitBits(m, s) & RANK_BIT[r]) !== 0;
const countOf = (m, s) => POP8[suitBits(m, s)];

function hasBelote(hand, suit) {
  const m = asMask(hand);
  return has(m, suit, "K") && has(m, suit, "Q");
}
function sideSuits(atout) {
  return SUITS.filter((s) => s !== atout);
}
function sideAces(hand, atout) {
  const m = asMask(hand);
  let n = 0;
  for (const s of SUITS) if (s !== atout && has(m, s, "A")) n++;
  return n;
}
function round10(n) {
  return Math.floor(n / 10) * 10;
}

// Fausses cartes : les cartes hors atout qui ne feront pas de pli
// d'elles-mêmes, tout ce qui n'est pas en tête de séquence As-10-Roi.
function fausses(hand, atout) {
  const m = asMask(hand);
  let f = 0;
  for (const s of SUITS) {
    if (s === atout) continue;
    let maitres = 0;
    for (const r of ["A", "10", "K"]) {
      if (!has(m, s, r)) break;
      maitres++;
    }
    f += countOf(m, s) - maitres;
  }
  return f;
}

// Ouverture que la main justifie à cet atout (0 = pas d'ouverture).
// « light » : dernier à parler après trois passes, ou profil bluffeur ;
// personne n'a de quoi ouvrir, on peut forcer un 80.
function openingBid(hand, suit, light) {
  const m = asMask(hand);
  const n = countOf(m, suit);
  // Main entière dans une seule couleur (8 cartes sur 8, donc Valet, 9 ET
  // belote garantis) : tombe déjà dans le cas V&&N&&f===0 ci-dessous, qui
  // rend 270 — huit atouts ne sont pas un palier à part, juste ce même
  // capot beloté acquis par construction (voir G.contract.huitAtouts, posé
  // au verrouillage du contrat une fois la vraie main initiale connue).
  const V = has(m, suit, "J");
  const N = has(m, suit, "9");
  const A = has(m, suit, "A");
  const X = has(m, suit, "10");
  const bel = hasBelote(m, suit);
  const aces = sideAces(m, suit);
  if (V && N && n >= 3) {
    const f = fausses(m, suit);
    if (f === 0) return n >= 5 ? (bel ? 270 : 250) : 160;
    return [0, 130, 120, 110][f] || 90;
  }
  if ((V || N) && (A || X) && n >= 4 && (aces >= 1 || n >= 5)) return 100;
  if (!V && !N && n >= 5 && bel && aces >= 1) return 100;
  const tenue =
    (V && n >= 3) ||
    (N && A && n >= 3) ||
    (A && X && n >= 4) ||
    (V && bel) ||
    (V && N);
  if (tenue) return 80;
  if (light && (V || (N && n >= 2)) && aces >= 1) return 80;
  return 0;
}

function bestOpening(hand, light) {
  const m = asMask(hand);
  let best = null;
  for (const atout of SUITS) {
    const montant = openingBid(m, atout, light);
    const len = countOf(m, atout);
    if (
      montant &&
      (!best ||
        montant > best.montant ||
        (montant === best.montant && len > best.len))
    )
      best = { montant, atout, len };
  }
  return best;
}

// Points de soutien que j'apporte à l'atout de mon partenaire.
function supportPoints(hand, suit, partnerBid) {
  const m = asMask(hand);
  const n = countOf(m, suit);
  const V = has(m, suit, "J");
  const N = has(m, suit, "9");
  const aces = sideAces(m, suit);
  let pts = (V ? 20 : 0) + (N && n >= 2 ? 10 : 0);
  if (partnerBid <= 90) {
    if (n >= (partnerBid === 80 ? 2 : 1)) pts += 10 * aces;
    if (n === 0 || (partnerBid === 80 && n === 1)) pts -= 10;
    // 4 atouts sans maître + un As : l'atout adverse tombera au premier tour.
    if (partnerBid === 80 && n >= 4 && !V && !N && aces >= 1)
      pts = Math.max(pts, 20);
  } else {
    pts += 10 * aces;
  }
  if (hasBelote(m, suit)) pts += 20;
  return pts;
}

function lastBidOf(seat) {
  const own = G.donneAnnonces.filter((a) => a.seat === seat);
  return own[own.length - 1] || null;
}

// Montant d'ouverture de ce siège dans cette couleur, s'il a été le
// premier de son camp à parler (sinon c'est un soutien, pas une ouverture).
function openingOf(seat, suit) {
  const first = G.donneAnnonces.find((a) => teamOf(a.seat) === teamOf(seat));
  return first && first.seat === seat && first.atout === suit
    ? first.montant
    : 0;
}

// Plus forte relance de ce siège sur une annonce de son partenaire.
function raiseBy(seat, suit) {
  let best = 0;
  G.donneAnnonces.forEach((a, i) => {
    if (a.seat !== seat || a.atout !== suit) return;
    const prev = G.donneAnnonces
      .slice(0, i)
      .reverse()
      .find((b) => b.seat === partnerOf(seat) && b.atout === suit);
    if (prev) best = Math.max(best, a.montant - prev.montant);
  });
  return best;
}

// Une enchère peut enchaîner plusieurs simulations (adversaire, chaque
// couleur, chaque palier) : au-delà de ce temps total, celles qui restent
// répondent « je ne sais pas » et le barème décide.
// Toutes ces simulations se jouent sur les mêmes mondes, tirés une fois
// par décision (bidWorlds) : les options se comparent sur les mêmes donnes,
// et 96 mondes partagés coûtent à peine plus que 24 retirés à chaque
// simulation. En duel : +4,7 pts/donne.
const BID_DECISION_MS = 400;
const COMPETE_MARGIN = 60; // voir l'étape 3
// Capot : seulement si la simulation le réussit assez souvent. Le barème
// seul (clefs, ouverture sans fausse carte) en réussissait moins d'un sur
// trois : les relances de compétition se lisaient comme des As.
// CAPOT_MIN valide un capot du barème, CAPOT_SIM en propose un hors barème
// (duel en réflexes contre le barème seul : +1,3 pt/donne). Sur moins de
// CAPOT_WORLDS mondes (appareil lent, temps écoulé), pas de capot : la
// simulation est trop bruitée pour le valider.
const CAPOT_MIN = 0.7;
const CAPOT_SIM = 0.7;
const CAPOT_WORLDS = 24;
let bidDeadline = Infinity;
let bidWorlds = null;
function botDecideBid(seat) {
  bidDeadline = tuning.now() + BID_DECISION_MS;
  bidWorlds = null;
  try {
    return decideBid(seat);
  } finally {
    bidDeadline = Infinity;
    bidWorlds = null;
  }
}

// Générale (belotée avec la belote en main) : faire les huit plis à soi
// seul, en entamant ; passe au-dessus de tous les capots. On la tente quand
// la simulation la réussit presque toujours, ou pour passer au-dessus d'un
// capot adverse, dès 60 % de réussite. Elle ne vaut pas plus que le capot
// (beloté) de l'équipe : si celui-ci réussit plus souvent, c'est lui qu'on
// annonce. Seulement avec Valet et 9 d'atout et au moins cinq atouts : le
// reste ne vaut pas la simulation.
const GENERALE_SURE = 0.85;
const GENERALE_OVER = 0.6;
function generaleBid(seat, hand, cur, team) {
  const oppCapot = !!cur && teamOf(cur.preneur) !== team && cur.montant >= 250;
  let best = null;
  for (const atout of SUITS) {
    if (
      suitCards(hand, atout).length < 5 ||
      !holds(hand, atout, "J") ||
      !holds(hand, atout, "9")
    )
      continue;
    const montant = hasBelote(hand, atout) ? GENERALE_BELOTE : GENERALE;
    if (cur && montant <= cur.montant) continue;
    const pm = makeProbability(seat, {
      id: -1,
      type: bidType(montant),
      montant,
      atout,
      preneur: seat,
      equipePreneur: team,
      coinche: false,
      surcoinche: false,
    });
    if (pm !== null && (!best || pm > best.pm)) best = { pm, atout, montant };
  }
  if (!best || best.pm < (oppCapot ? GENERALE_OVER : GENERALE_SURE)) return null;
  const capot = best.montant === GENERALE_BELOTE ? 270 : 250;
  if (!cur || capot > cur.montant) {
    const pc = makeProbability(seat, {
      id: -1,
      type: bidType(capot),
      montant: capot,
      atout: best.atout,
      preneur: seat,
      equipePreneur: team,
      coinche: false,
      surcoinche: false,
    }, CAPOT_WORLDS);
    if (pc !== null && pc > best.pm) return { type: "ENCHERIR", montant: capot, atout: best.atout };
  }
  return { type: "ENCHERIR", montant: best.montant, atout: best.atout };
}

function decideBid(seat) {
  const PASS = { type: "PASSER" };
  const hand = G.hands[seat];
  const p = personality(seat);
  const cur = G.contract;
  const team = teamOf(seat);
  const partner = partnerOf(seat);
  const memo = G.bidMemo[seat];
  const min = cur ? cur.montant + 10 : 80;
  const gen = generaleBid(seat, hand, cur, team);
  if (gen) return gen;
  if (cur && cur.montant >= 270) return PASS;
  const ours = !!cur && teamOf(cur.preneur) === team;
  const capotOnTable = !!cur && cur.montant >= 250;

  // Enchère valable à partir d'une valeur de main, null si trop basse.
  function offer(montant, atout) {
    if (montant >= 250)
      return !cur || montant > cur.montant
        ? { type: "ENCHERIR", montant, atout }
        : null;
    const m = Math.min(160, round10(montant));
    return m >= min ? { type: "ENCHERIR", montant: m, atout } : null;
  }
  // Forcer : 10 de plus que ce que la main vaut, deux fois par ligne —
  // systématiquement : laisser l'adversaire jouer tranquille coûte plus.
  function force(atout) {
    if (G.forced[team] >= 2) return null;
    const o = offer(min, atout);
    if (o) G.forced[team]++;
    return o;
  }

  const partnerBid = lastBidOf(partner);
  const myBid = lastBidOf(seat);
  // Réussite simulée d'un contrat que je prendrais (voir makeProbability).
  const pMake = (montant, atout, minWorlds) =>
    makeProbability(seat, {
      id: -1,
      type: bidType(montant),
      montant,
      atout,
      preneur: seat,
      equipePreneur: team,
      coinche: false,
      surcoinche: false,
    }, minWorlds);

  // Capot validé par la simulation (voir CAPOT_MIN), jamais sans elle.
  const capotOk = (o) => {
    if (!o) return false;
    const pm = pMake(o.montant, o.atout, CAPOT_WORLDS);
    return pm !== null && pm >= CAPOT_MIN;
  };

  // 1. Capot par les clefs : il faut une clef (un As) de plus que de
  // fausses cartes, les plis de l'un devant couvrir les défausses de
  // l'autre.
  if (partnerBid) {
    const suit = partnerBid.atout;
    const capot = hasBelote(hand, suit) ? 270 : 250;
    const partnerFausses = FAUSSES_PROMISES[openingOf(partner, suit)];
    if (
      !memo.supported &&
      partnerFausses &&
      suitCards(hand, suit).length &&
      sideAces(hand, suit) > partnerFausses
    ) {
      const o = offer(capot, suit);
      if (capotOk(o)) {
        memo.supported = true;
        return o;
      }
    }
    const mine = myBid && myBid.atout === suit ? openingOf(seat, suit) : 0;
    if (
      FAUSSES_PROMISES[mine] &&
      partnerBid.montant > mine &&
      (partnerBid.montant - mine) / 10 > fausses(hand, suit)
    ) {
      const o = offer(capot, suit);
      if (capotOk(o)) return o;
    }
  }

  // 1 bis. Capot hors barème, quand la simulation le voit presque sûr :
  // dans la couleur du partenaire ou ma meilleure, avec au moins trois
  // atouts dont le Valet ou le 9 (le reste ne vaut pas la simulation).
  if (!capotOnTable) {
    const suits = new Set();
    if (partnerBid) suits.add(partnerBid.atout);
    if (ours) suits.add(cur.atout);
    const mineBest = bestOpening(hand, false);
    if (mineBest) suits.add(mineBest.atout);
    for (const s of suits) {
      if (
        suitCards(hand, s).length < 3 ||
        !(holds(hand, s, "J") || holds(hand, s, "9"))
      )
        continue;
      const o = offer(hasBelote(hand, s) ? 270 : 250, s);
      if (o && pMake(o.montant, s, CAPOT_WORLDS) >= CAPOT_SIM) return o;
    }
  }

  // 2. Soutenir la couleur du partenaire (pas la mienne qu'il vient de
  // soutenir), ou lui proposer ma couleur si elle vaut plus.
  const mySuits = new Set(
    G.donneAnnonces.filter((a) => a.seat === seat).map((a) => a.atout),
  );
  if (
    partnerBid &&
    !memo.supported &&
    !capotOnTable &&
    !mySuits.has(partnerBid.atout)
  ) {
    memo.supported = true;
    const suit = partnerBid.atout;
    const target =
      partnerBid.montant + supportPoints(hand, suit, partnerBid.montant) - 10; // palier de prudence
    const own = bestOpening(hand, false);
    if (own && own.atout !== suit && own.montant > target) {
      const o = offer(own.montant, own.atout);
      if (o) return o;
    }
    // Sur le point de sortir et l'adversaire se tait : annoncer le nécessaire.
    const opponentsSpoke = G.donneAnnonces.some(
      (a) => teamOf(a.seat) !== team,
    );
    const nearExit =
      !opponentsSpoke && G.scores[team] + partnerBid.montant >= 1010;
    if (target > partnerBid.montant && !nearExit) {
      const o =
        offer(target, suit) ||
        (!ours && target + 10 >= min ? force(suit) : null);
      if (o) return o;
    }
  }

  // 3. Intervenir au-dessus de l'adversaire : par espérance simulée, pas
  // au barème. Le laisser jouer vaut −P·M + (1−P)·160 (sa réussite P jouée
  // sur nos mondes, comme pour la coinche) ; surenchérir au minimum dans
  // notre meilleure couleur vaut p·min − (1−p)·160. On ne surenchérit que
  // si l'écart dépasse 60 : les probabilités simulées sont trop tranchées
  // (prédit 7 % → 41 % réels, 93 % → 85 %). Mesuré en duel contre le
  // barème : marge 0 → +3,8 pts/donne, 30 → +9,8, 60 → +14,3, 90 → +10,7 ;
  // les interventions du barème non retenues ici coûtaient des points.
  if (cur && !ours && !capotOnTable && min <= 160) {
    const pOpp = makeProbability(seat, cur);
    if (pOpp !== null) {
      const evPass = -pOpp * cur.montant + (1 - pOpp) * 160;
      let best = null;
      for (const s of SUITS) {
        if (suitCards(hand, s).length < 3) continue;
        // Main forte : le palier du barème est candidat aussi (130 plutôt
        // que 90, +1,9 pt/donne), il renseigne le partenaire.
        const sys = Math.min(160, openingBid(hand, s, false));
        for (const palier of sys > min ? [min, sys] : [min]) {
          const pm = pMake(palier, s);
          if (pm === null) continue; // plus le temps d'y réfléchir
          const ev = pm * palier - (1 - pm) * 160;
          if (!best || ev > best.ev) best = { ev, s, palier };
        }
      }
      if (best && best.ev > evPass + COMPETE_MARGIN)
        return offer(best.palier, best.s);
      return PASS;
    }
  }

  // 4. Ouvrir au barème (il renseigne le partenaire : l'ouverture « à
  // l'espérance » seule perdait 1,7 pt/donne), mais pas un contrat que la
  // simulation voit chuter une fois sur deux (+2,3 pts/donne) ; et ouvrir
  // 80 hors barème quand la simulation le réussit 7 fois sur 10 (+1,5).
  if (!ours && !capotOnTable) {
    const light =
      (!cur && G.passesConsecutives === 3) || Math.random() < p.bluff;
    const own = bestOpening(hand, light);
    if (own) {
      const plain = offer(own.montant, own.atout);
      const o =
        plain || (cur && own.montant + 10 >= min ? force(own.atout) : null);
      if (o && o.montant >= 250) {
        if (capotOk(o)) return o;
        // Capot refusé par la simulation : la main vaut tout de même 160.
        const o160 = offer(160, o.atout);
        const p160 = o160 ? pMake(160, o.atout) : null;
        return o160 && (p160 === null || p160 >= 0.5) ? o160 : PASS;
      }
      const pm = o ? pMake(o.montant, o.atout) : null;
      if (o && (pm === null || pm >= 0.5)) return o;
      if (o && !plain) G.forced[team]--; // veto : ce forçage n'a pas servi
    } else if (!cur) {
      let best = null;
      for (const s of SUITS) {
        if (suitCards(hand, s).length < 3) continue;
        const pm = pMake(80, s);
        if (pm !== null && (!best || pm > best.pm)) best = { pm, s };
      }
      if (best && best.pm >= 0.7) return offer(80, best.s);
    }
  }
  return PASS;
}

// Huit atouts : la main initiale du preneur tient les 8 cartes de l'atout —
// pas un contrat à part, le même capot beloté (270) acquis par
// construction. Se relit sur G.mainsInitiales (fixée dès la distribution,
// jamais modifiée en cours de donne), donc valable aussi bien pendant les
// enchères qu'une fois le contrat verrouillé.
// Un contrat plus bas tenu avec les 8 atouts reste ce contrat-là (§1).
function contractHuitAtouts(contract) {
  if (
    !contract ||
    (contract.type !== "CAPOT_BELOTE" && contract.type !== "GENERALE_BELOTE") ||
    !G.mainsInitiales ||
    !G.mainsInitiales[contract.preneur]
  )
    return false;
  return (
    G.mainsInitiales[contract.preneur].filter(
      (c) => c.suit === contract.atout,
    ).length === 8
  );
}

function botWantsToCoinche(seat) {
  const contract = G.contract;
  if (!contract || teamOf(seat) === contract.equipePreneur) return false;
  const p = personality(seat);
  const hand = G.hands[seat];
  const atout = contract.atout;
  // Score de la partie. Le preneur sort s'il réussit, coinché ou non : la
  // coinche ne coûte rien et double la chute. Une simple chute nous fait
  // déjà gagner : coincher ne pourrait que doubler son gain.
  const pre = G.scores[contract.equipePreneur];
  const def = G.scores[1 - contract.equipePreneur];
  if (pre + contractValue(contract) >= 1010 && pre + contractValue(contract) > def)
    return true;
  if (def + 160 >= 1010 && def + 160 > pre) return false;
  const tenue =
    holds(hand, atout, "J") ||
    (holds(hand, atout, "9") && suitCards(hand, atout).length >= 2);
  // Contre un capot, seul un pli d'atout est sûr : l'annonceur n'a pas de
  // perdante à côté, ses As et ceux de son partenaire couvrent tout, et nos
  // As seraient coupés. (Contre huit atouts, la défense n'en a aucun.)
  // Générale comprise : la lecture des enchères (bidFits) ne sait pas
  // encore ce qu'elle promet, les mondes simulés lui prêteraient des mains
  // trop faibles ; on s'en tient au pli d'atout sûr.
  if (contract.type !== "NUMERIQUE") return tenue;
  // La coinche double tout : rentable dès que le contrat réussit moins
  // souvent que 160/(160+M) (67 % à 80, 57 % à 120). On joue la donne sur
  // des mondes compatibles avec les enchères ; la marge couvre la
  // surcoinche et une estimation encore pessimiste (72 % prédits pour 78 %
  // réels). Calibrée en duel contre l'ancienne formule : 0,1 → −2,7
  // pts/donne, 0,25 → 0, 0,4 → +0,6, 0,5 → +0,9, 0,6 → +0,4.
  const pMake = makeProbability(seat, contract);
  return (
    pMake !== null &&
    pMake <
      160 / (160 + contract.montant) - COINCHE_MARGIN / p.coincheAppetite
  );
}
const COINCHE_MARGIN = 0.5;

function botWantsToSurcoinche(seat) {
  const contract = G.contract;
  if (!contract || teamOf(seat) !== contract.equipePreneur) return false;
  const hand = G.hands[seat];
  const atout = contract.atout;
  const pre = G.scores[teamOf(seat)];
  const def = G.scores[1 - teamOf(seat)];
  // Réussi coinché, on sort déjà : surcoincher ne ferait que doubler la chute.
  if (pre + 2 * contractValue(contract) >= 1010 && pre + 2 * contractValue(contract) > def)
    return false;
  // Une chute coinchée les ferait sortir de toute façon : on surcoinche par principe.
  if (def + 320 >= 1010) return true;
  // Le preneur qui tient les 8 atouts (sa propre main, rien d'autre) gagne à coup sûr.
  if (seat === contract.preneur && suitCards(hand, atout).length === 8)
    return true;
  if (contract.type !== "NUMERIQUE" && !isGenerale(contract)) return false;
  // Réussite simulée quasi certaine (+0,8 pt/donne en duel).
  const pm = makeProbability(seat, contract);
  if (pm !== null && pm >= 0.9) return true;
  return (
    holds(hand, atout, "J") &&
    holds(hand, atout, "9") &&
    suitCards(hand, atout).length >= 4 &&
    sideAces(hand, atout) >= 2 &&
    Math.random() < 0.8 * personality(seat).aggr
  );
}

// ---- IA : jeu de la carte ----------------------------------------------
// Les réflexes classiques, dans l'ordre où un joueur de club y pense.
// Attaque (camp du preneur) :
//   - tirer les atouts : l'atout maître d'abord ; sans lui, un petit atout
//     vers le partenaire qui a montré le Valet, ou faire tomber le Valet
//     sur une petite carte ; s'arrêter dès que la défense n'en a plus
//   - encaisser ses maîtres (comptés), jamais dans une coupe adverse
//   - rejouer la couleur appelée, se créer une coupe avec un singleton
// Défense :
//   - jamais d'atout en entame
//   - encaisser d'abord ses maîtres, avant qu'ils ne soient coupés (mais
//     pas, à la première entame, un As dont le 10 est dehors)
//   - répondre à l'appel du partenaire, jouer la couleur qu'il a annoncée
//   - entamer un singleton pour couper ensuite
// Pendant le pli :
//   - partenaire maître pour de bon : charger (le 10 sous son As, un 10
//     menacé) ; pli incertain : ne rien donner, ou l'assurer d'un maître
//   - petit en second, gagner au plus juste en dernier, couper petit ;
//     pli gagné : la plus chère de cartes équivalentes (topOfSequence)
//   - défausse : appel (petite carte sous un As), refus (Roi/Dame d'une
//     couleur faible), garder la garde du 10, se raccourcir pour couper
//   - capot : tout gagner ; contre un capot, prendre un pli

// Sièges qui n'ont pas encore joué dans le pli en cours, hors nous-même.
function seatsStillToAct(pli, seat) {
  const played = new Set(pli.map((e) => e.siege));
  return [0, 1, 2, 3].filter((s) => s !== seat && !played.has(s));
}

// Identifiants des cartes de chaque couleur, dans l'ordre de RANKS.
const IDS = {};
for (const s of SUITS) IDS[s] = RANKS.map((r) => r + s);

// Cartes de cette couleur encore cachées : ni jouées, ni dans ma main.
function outCards(hand, suit) {
  return IDS[suit].filter(
    (id) => !G.seen[id] && !hand.some((c) => c.id === id),
  );
}

// Reste-t-il dehors une carte plus forte dans la couleur ? Sinon la
// carte est maîtresse : un vrai décompte, pas une supposition.
function higherOut(hand, card, atout) {
  const table = card.suit === atout ? TRUMP_FORCE : PLAIN_FORCE;
  const f = table[card.rank];
  const ids = IDS[card.suit];
  for (let j = 0; j < 8; j++) {
    if (
      table[RANKS[j]] > f &&
      !G.seen[ids[j]] &&
      !hand.some((c) => c.id === ids[j])
    )
      return true;
  }
  return false;
}

// Premier minimum (ou dernier maximum) selon key : ce que donnerait un
// tri stable, sans trier (ces choix se répètent dans chaque simulation).
function firstMin(cards, key) {
  let best = cards[0];
  let k = key(best);
  for (let i = 1; i < cards.length; i++) {
    const v = key(cards[i]);
    if (v < k) {
      best = cards[i];
      k = v;
    }
  }
  return best;
}
function lastMax(cards, key) {
  let best = cards[0];
  let k = key(best);
  for (let i = 1; i < cards.length; i++) {
    const v = key(cards[i]);
    if (v >= k) {
      best = cards[i];
      k = v;
    }
  }
  return best;
}
// Valeur puis force : points × 10 + force (force ≤ 8).
const valueKey = (atout) => (c) => cardPoints(c, atout) * 10 + forceOf(c, atout);
const forceKey = (atout) => (c) => forceOf(c, atout);
function lowest(cards, atout) {
  return firstMin(cards, valueKey(atout));
}
function highest(cards, atout) {
  return lastMax(cards, valueKey(atout));
}
function weakest(cards, atout) {
  return firstMin(cards, forceKey(atout));
}
function strongest(cards, atout) {
  return lastMax(cards, forceKey(atout));
}

// Obligations de couper et de monter (§6) : qui ne coupe pas le pli d'un
// adversaire n'a plus d'atout ; qui joue un atout sous le maître alors
// qu'il devait monter n'en a pas de plus fort. À appeler avant de poser la carte.
function noteTrumpObligations(seat, carte) {
  const pli = G.pliCourant;
  if (!pli.length) return;
  const { atout } = G.contract;
  const lead = pli[0].carte.suit;
  if (lead !== atout && carte.suit === lead) return;
  const master = pli.find((e) => e.siege === trickWinnerSeat(pli, atout));
  if (lead !== atout && teamOf(master.siege) === teamOf(seat)) return; // partenaire maître : libre
  if (carte.suit !== atout) {
    G.trumpMax[seat] = 0;
    return;
  }
  const top =
    master.carte.suit === atout ? TRUMP_FORCE[master.carte.rank] : 0;
  if (TRUMP_FORCE[carte.rank] < top)
    G.trumpMax[seat] = Math.min(G.trumpMax[seat], top - 1);
}

// Ce siège peut-il encore tenir un atout plus fort que `force` (vu depuis `hand`) ?
function mayTrump(s, force, hand) {
  const { atout } = G.contract;
  if (G.void[s][atout]) return false;
  const ids = IDS[atout];
  for (let j = 0; j < 8; j++) {
    const f = TRUMP_FORCE[RANKS[j]];
    if (
      f > force &&
      f <= G.trumpMax[s] &&
      !G.seen[ids[j]] &&
      !hand.some((c) => c.id === ids[j])
    )
      return true;
  }
  return false;
}

function playContext(seat) {
  const hand = G.hands[seat];
  const atout = G.contract.atout;
  const team = teamOf(seat);
  const opponents = [0, 1, 2, 3].filter((s) => teamOf(s) !== team);
  return {
    seat,
    hand,
    atout,
    team,
    opponents,
    partner: partnerOf(seat),
    legal: computeLegal(hand, G.pliCourant, atout, seat),
    attack: team === G.contract.equipePreneur,
    amPreneur: seat === G.contract.preneur,
    capot: G.contract.type !== "NUMERIQUE",
    // Partenaire d'une Générale : le moindre pli pris la fait chuter.
    genPartner:
      isGenerale(G.contract) &&
      team === G.contract.equipePreneur &&
      seat !== G.contract.preneur,
    oppTrumps: opponents.some((o) => mayTrump(o, 0, hand)),
    tricksLeft: 8 - G.plisJoues,
  };
}

// Un adversaire peut-il couper cette couleur ? Manque constaté, ou au
// plus une carte de la couleur encore dehors.
function oppCanRuff(ctx, suit) {
  if (suit === ctx.atout || !ctx.oppTrumps) return false;
  const fewLeft = outCards(ctx.hand, suit).length <= 1;
  return ctx.opponents.some(
    (o) => mayTrump(o, 0, ctx.hand) && (G.void[o][suit] || fewLeft),
  );
}

function safeMaster(ctx, card) {
  return !higherOut(ctx.hand, card, ctx.atout) && !oppCanRuff(ctx, card.suit);
}

// Cet adversaire, qui joue après moi, peut-il battre cette carte ? Tant
// qu'il n'a pas montré de manque, on le suppose fournir : le supposer
// coupeur dès qu'il reste une seule carte dehors faisait renoncer à des
// charges sûres (mesuré : −0,7 pt/donne).
function canBeat(ctx, opp, card, lead) {
  const { hand, atout } = ctx;
  if (card.suit === atout) return mayTrump(opp, TRUMP_FORCE[card.rank], hand);
  if (!G.void[opp][lead] && outCards(hand, lead).length > 0)
    return higherOut(hand, card, atout);
  return mayTrump(opp, 0, hand);
}

// Le partenaire a-t-il montré le Valet d'atout, encore dehors ?
// Ouverture 90 ou 110+ (Valet + 9), ou relance d'au moins 20.
function partnerShowsJack(ctx) {
  const jack = "J" + ctx.atout;
  if (G.seen[jack] || ctx.hand.some((c) => c.id === jack)) return false;
  const o = openingOf(ctx.partner, ctx.atout);
  return o === 90 || o >= 110 || raiseBy(ctx.partner, ctx.atout) >= 20;
}

// Couleur appelée par le partenaire, tant que son As n'est pas tombé.
function calledSuit(ctx) {
  return (
    sideSuits(ctx.atout).find(
      (s) =>
        G.appel[ctx.partner][s] &&
        !G.seen["A" + s] &&
        ctx.legal.some((c) => c.suit === s),
    ) || null
  );
}

// Appel : une petite carte d'une couleur dont on tient l'As, une fois par donne.
function appelCard(ctx, cards) {
  if (Object.keys(G.appel[ctx.seat]).length) return null;
  return (
    cards.find(
      (c) =>
        cardPoints(c, ctx.atout) === 0 &&
        holds(ctx.hand, c.suit, "A") &&
        suitCards(ctx.hand, c.suit).length >= 2,
    ) || null
  );
}

// Les signaux se lisent sur la carte posée, pour tout le monde (bots
// compris : pas de canal privé entre partenaires) : première défausse
// petite = appel, Roi/Dame/Valet = refus.
function readDiscardSignal(seat, carte) {
  if (
    carte.suit === G.contract.atout ||
    Object.keys(G.appel[seat]).length ||
    Object.keys(G.refus[seat]).length
  )
    return;
  if (["7", "8", "9"].includes(carte.rank)) G.appel[seat][carte.suit] = true;
  else if (["K", "Q", "J"].includes(carte.rank))
    G.refus[seat][carte.suit] = true;
}

function leadCard(ctx) {
  const { hand, atout, legal } = ctx;
  const trumps = legal.filter((c) => c.suit === atout);
  const side = legal.filter((c) => c.suit !== atout);

  if (ctx.attack) {
    if (ctx.oppTrumps && trumps.length) {
      const top = strongest(trumps, atout);
      if (!higherOut(hand, top, atout)) return top;
      const low = weakest(trumps, atout);
      if (partnerShowsJack(ctx)) return low;
      if (ctx.amPreneur && trumps.length >= 2) return low;
      if (
        !ctx.amPreneur &&
        G.contract.preneur === ctx.partner &&
        G.plisJoues < 2 &&
        ["7", "8", "Q"].includes(low.rank)
      )
        return low;
    }
    const masters = side.filter((c) => safeMaster(ctx, c));
    if (masters.length) return highest(masters, atout);
    // Capot : le partenaire rend la main au preneur (petit atout, ou dans sa coupe).
    if (ctx.capot && !ctx.amPreneur) {
      const toRuff = side.filter((c) => G.void[G.contract.preneur][c.suit]);
      if (trumps.length) return weakest(trumps, atout);
      if (toRuff.length) return lowest(toRuff, atout);
    }
    const called = calledSuit(ctx);
    if (called)
      return lowest(
        side.filter((c) => c.suit === called),
        atout,
      );
    // (Pas en capot : la petite carte seule donnerait un pli.)
    if (!ctx.capot && trumps.length >= 2 && G.plisJoues <= 4) {
      const single = side.find(
        (c) =>
          suitCards(hand, c.suit).length === 1 && cardPoints(c, atout) < 10,
      );
      if (single) return single;
    }
    return defaultLead(ctx);
  }

  // Première entame : pas d'As dont le 10 est encore dehors, il
  // l'affranchirait pour l'attaque (+1,3 pt/donne en réflexes, +1,6 au
  // Monte-Carlo, qui ne le jouait déjà pas).
  const masters = side.filter(
    (c) =>
      safeMaster(ctx, c) &&
      (G.plisJoues || ctx.capot || c.rank !== "A" || holds(hand, c.suit, "10")),
  );
  if (masters.length) return highest(masters, atout);
  const called = calledSuit(ctx);
  if (called)
    return lowest(
      side.filter((c) => c.suit === called),
      atout,
    );
  // Couleur annoncée par le partenaire aux enchères, pas encore jouée.
  const partnerSuit = G.donneAnnonces
    .filter((a) => a.seat === ctx.partner && a.atout !== atout)
    .map((a) => a.atout)
    .pop();
  if (
    partnerSuit &&
    side.some((c) => c.suit === partnerSuit) &&
    !IDS[partnerSuit].some((id) => G.seen[id]) &&
    !oppCanRuff(ctx, partnerSuit)
  ) {
    const cards = side.filter((c) => c.suit === partnerSuit);
    return cards.find((c) => c.rank === "A") || lowest(cards, atout);
  }
  const nTrumps = suitCards(hand, atout).length;
  if (nTrumps >= 1 && nTrumps <= 2 && G.plisJoues <= 2) {
    const single = side.find(
      (c) =>
        suitCards(hand, c.suit).length === 1 && cardPoints(c, atout) < 10,
    );
    if (single) return single;
  }
  return defaultLead(ctx);
}

// Entame par défaut : la couleur la moins risquée, petite carte.
function defaultLead(ctx) {
  const { hand, atout, legal } = ctx;
  const side = legal.filter((c) => c.suit !== atout);
  if (!side.length) {
    const top = strongest(legal, atout);
    return higherOut(hand, top, atout) ? weakest(legal, atout) : top;
  }
  let best = null;
  for (const suit of new Set(side.map((c) => c.suit))) {
    const n = suitCards(hand, suit).length;
    let score = ctx.attack ? n * 3 : -n * 3; // attaque : travailler la longue ; défense : se raccourcir
    if (G.refus[ctx.partner][suit]) score -= 30;
    if (oppCanRuff(ctx, suit)) score -= 25;
    if (G.void[ctx.partner][suit] && mayTrump(ctx.partner, 0, hand))
      score += ctx.attack ? -10 : 20;
    if (holds(hand, suit, "A")) score -= 15; // ne pas jouer sous l'As
    if (
      n === 2 &&
      holds(hand, suit, "10") &&
      higherOut(hand, { suit, rank: "10" }, atout)
    )
      score -= 12; // garde du 10
    const low = lowest(suitCards(hand, suit), atout);
    if (higherOut(hand, low, atout)) score -= cardPoints(low, atout) * 2; // ne pas entamer un 10 (ou un Roi) qui tombera
    if (!best || score > best.score) best = { suit, score };
  }
  return lowest(
    side.filter((c) => c.suit === best.suit),
    atout,
  );
}

// Ordre des cartes équivalentes. Sur un pli qui nous revient, jouer la
// plus chère des cartes qui se suivent (aucune carte dehors entre elles) :
// ses points sont encaissés et celle qu'on garde est tout aussi maîtresse
// (l'As plutôt que le 10 quand on tient les deux, l'As par-dessus le 10 du
// partenaire quand on garde le Roi). Le Monte-Carlo jouait déjà ainsi ;
// en duel, +1,2 pt/donne en réflexes et +3,0 avec le Monte-Carlo.
const BY_FORCE = {
  trump: RANKS.slice().sort((a, b) => TRUMP_FORCE[a] - TRUMP_FORCE[b]),
  plain: RANKS.slice().sort((a, b) => PLAIN_FORCE[a] - PLAIN_FORCE[b]),
};
function topOfSequence(hand, card, atout) {
  const order = BY_FORCE[card.suit === atout ? "trump" : "plain"];
  let best = card;
  for (const r of order.slice(order.indexOf(card.rank) + 1)) {
    const mine = hand.find((c) => c.suit === card.suit && c.rank === r);
    if (mine) best = mine;
    else if (!G.seen[r + card.suit]) break;
  }
  return best;
}

function followCard(ctx) {
  const { atout, legal, seat } = ctx;
  const pli = G.pliCourant;
  const lead = pli[0].carte.suit;
  const winCard = pli.find(
    (e) => e.siege === trickWinnerSeat(pli, atout),
  ).carte;
  const partnerWins = teamOf(trickWinnerSeat(pli, atout)) === ctx.team;
  const pts = trickPoints(pli, atout);
  const after = seatsStillToAct(pli, seat);
  const oppAfter = after.filter((s) => teamOf(s) !== ctx.team);
  const beats = (c) =>
    winValue(c, atout, lead) > winValue(winCard, atout, lead);
  const holdsUp = (c) => oppAfter.every((o) => !canBeat(ctx, o, c, lead));
  const winners = legal.filter(beats);
  const others = legal.filter((c) => !beats(c));
  const grab = ctx.capot;

  // Générale du partenaire : ne jamais passer devant, ni lui ni la défense
  // (c'est à lui de prendre) ; ne gagner que contraint.
  if (ctx.genPartner)
    return others.length ? discard(ctx, lead, others) : weakest(winners, atout);

  if (partnerWins) {
    if (holdsUp(winCard)) return charge(ctx, lead, winCard);
    const secure = winners.filter(holdsUp); // pli menacé : l'assurer d'un maître
    if (secure.length) return topOfSequence(ctx.hand, weakest(secure, atout), atout);
    return others.length
      ? discard(ctx, lead, others)
      : weakest(winners, atout);
  }
  if (!winners.length) return discard(ctx, lead, legal);
  if (!oppAfter.length) {
    return topOfSequence(ctx.hand, weakest(winners, atout), atout);
  }
  // Couper petit : garder ses gros atouts, même au risque d'une surcoupe.
  if (!grab && lead !== atout && winners.every((c) => c.suit === atout))
    return weakest(winners, atout);
  const secure = winners.filter(holdsUp);
  if (secure.length) {
    const cheap = weakest(secure, atout);
    const low = legal.filter((c) => !secure.includes(c));
    // Petit en second : pli sans valeur, le partenaire joue encore.
    if (
      !grab &&
      low.length &&
      after.includes(ctx.partner) &&
      pts < 10 &&
      cheap.rank === "A" &&
      cheap.suit !== atout
    )
      return discard(ctx, lead, low);
    return topOfSequence(ctx.hand, cheap, atout);
  }
  if (grab) return strongest(winners, atout);
  if (others.length && (after.includes(ctx.partner) || pts < 10))
    return discard(ctx, lead, others);
  return weakest(winners, atout);
}

// Le partenaire tient le pli pour de bon : lui donner des points.
function charge(ctx, lead, winCard) {
  const { hand, atout, legal } = ctx;
  if (legal.every((c) => c.suit === lead)) {
    if (lead !== atout) {
      // Le 10 sous l'As du partenaire, mais jamais un maître par-dessus son
      // pli : As sur son 10, on perdrait un pli.
      const under = legal.filter(
        (c) => winValue(c, atout, lead) < winValue(winCard, atout, lead),
      );
      return under.length
        ? topOfSequence(hand, highest(under, atout), atout)
        : weakest(legal, atout);
    }
    const spare = legal.filter((c) => higherOut(hand, c, atout)); // jamais un atout maître
    return spare.length ? highest(spare, atout) : weakest(legal, atout);
  }
  const side = legal.filter((c) => c.suit !== atout);
  if (!side.length) return weakest(legal, atout);
  const tenAtRisk = side.find(
    (c) => c.rank === "10" && higherOut(hand, c, atout),
  );
  if (tenAtRisk) return tenAtRisk;
  const appel = appelCard(ctx, side);
  if (appel) return appel;
  const refus = side.filter(
    (c) =>
      (c.rank === "K" || c.rank === "Q") &&
      !holds(hand, c.suit, "A") &&
      !holds(hand, c.suit, "10"),
  );
  if (refus.length) return highest(refus, atout);
  if (
    ctx.tricksLeft <= 2 ||
    (winCard.suit === atout && lead !== atout && ctx.tricksLeft <= 3)
  )
    return highest(side, atout);
  return discard(ctx, lead, legal);
}

// Carte perdante : fournir ou sous-couper au plus bas ; défausse libre :
// appel sinon la carte qui coûte le moins.
function discard(ctx, lead, cards) {
  const { hand, atout } = ctx;
  if (
    cards.every((c) => c.suit === lead) ||
    cards.every((c) => c.suit === atout)
  )
    return lowest(cards, atout);
  const side = cards.filter((c) => c.suit !== atout);
  if (!side.length) return lowest(cards, atout);
  const appel = appelCard(ctx, side);
  if (appel) return appel;
  const cost = (c) => {
    const n = suitCards(hand, c.suit).length;
    let v = cardPoints(c, atout) * 10 + n * 2;
    if (!higherOut(hand, c, atout)) v += 60; // un maître
    if (
      n === 2 &&
      c.rank !== "10" &&
      holds(hand, c.suit, "10") &&
      higherOut(hand, { suit: c.suit, rank: "10" }, atout)
    )
      v += 40; // garde du 10
    return v;
  };
  return firstMin(side, cost);
}

function heuristicCard(seat) {
  const ctx = playContext(seat);
  if (ctx.legal.length === 1) return ctx.legal[0];
  return G.pliCourant.length ? followCard(ctx) : leadCard(ctx);
}

// ---- IA : Monte-Carlo --------------------------------------------------
// Le bot ne voit que sa main. Pour choisir sa carte, il imagine plusieurs
// répartitions des cartes qu'il ne voit pas, compatibles avec tout ce qui
// est public (cartes tombées, manques constatés, obligations de couper et
// de monter, belote annoncée, nombre de cartes de chacun) et plausibles au
// vu des enchères et des appels (voir bidFits), joue la fin de la donne
// dans chacune avec les réflexes ci-dessus pour les quatre joueurs, et
// garde la carte qui rapporte le plus en moyenne au score de la donne. À
// égalité, le réflexe l'emporte. Les trois derniers plis de chaque monde
// sont joués parfaitement (voir exactEnd).
// Pistes mesurées sans gain : pondérer les mondes par « le réflexe
// aurait-il joué cette carte ? » (le Monte-Carlo s'écarte du réflexe près
// d'une fois sur deux en début de donne : signal trop bruité, −1,1 pt) ;
// ne quitter le réflexe qu'au-delà d'un écart moyen de 5 pts (−1,5 pt).
// En simulation (bots contre bots, mêmes donnes), 16 mondes gagnaient 64 %
// des parties contre les réflexes seuls, 48 mondes 59 % contre 16, et 96
// mondes +2,6 pts/donne contre 48 (le moteur ayant été rendu 2,6 fois plus
// rapide, 96 mondes coûtent moins que 48 auparavant) ; le temps de
// réflexion reste plafonné pour les appareils lents.
// Nombre de mondes imaginés et horloge du temps de réflexion (réglables
// par les tests et les duels A/B : une horloge figée rend les bots
// reproductibles).
export const tuning = {
  mcSamples: 96,
  bidWorlds: 96,
  bidSamples: 48, // coinche et surcoinche (+1,4 pt/donne contre 24)
  now: () => Date.now(),
};
const MC_BUDGET_MS = 250;

// Ce siège peut-il tenir cette carte ? Manques et obligations de couper.
function canHold(s, c) {
  return (
    !G.void[s][c.suit] &&
    (c.suit !== G.contract.atout || TRUMP_FORCE[c.rank] <= G.trumpMax[s])
  );
}

// Répartit les cartes inconnues entre les trois autres sièges : les cartes
// les plus contraintes d'abord, chacune chez un siège qui peut l'avoir et
// qui a encore de la place (au prorata de la place restante).
function dealUnknown(unknown, others, size, pinned) {
  const room = { ...size };
  const hands = {};
  for (const s of others) hands[s] = [];
  const cards = shuffle(unknown)
    .map((c) => ({
      c,
      e:
        pinned[c.id] !== undefined
          ? [pinned[c.id]]
          : others.filter((s) => canHold(s, c)),
    }))
    .sort((a, b) => a.e.length - b.e.length);
  for (const { c, e } of cards) {
    const open = e.filter((s) => room[s] > 0);
    if (!open.length) return null;
    let r = Math.random() * open.reduce((t, s) => t + room[s], 0);
    const s = open.find((x) => (r -= room[x]) < 0) ?? open[open.length - 1];
    hands[s].push(c);
    room[s]--;
  }
  return hands;
}

// Lecture des enchères : chaque entrée du journal, avec ce qui la précède
// (enchère du partenaire, réponse déjà donnée), ne dépend pas des mains —
// calculée une fois par décision.
function bidReadings() {
  return G.bidLog.map((e, i) => {
    const earlier = G.bidLog.slice(0, i);
    const pIdx = earlier
      .map((x) => x.seat === partnerOf(e.seat) && !!x.montant)
      .lastIndexOf(true);
    const partnerBid = pIdx >= 0 ? earlier[pIdx] : null;
    // A-t-il déjà répondu à cette enchère du partenaire (ou parlé dans cette couleur) ?
    const acted = earlier.some(
      (x, j) =>
        x.seat === e.seat &&
        (j > pIdx ||
          (x.montant && partnerBid && x.atout === partnerBid.atout)),
    );
    return { e, partnerBid, acted };
  });
}

// La main de départ `h` colle-t-elle à cette enchère ou à cette passe ? On
// la relit avec le système des bots lui-même (openingBid, supportPoints),
// si bien qu'émetteur et lecteur parlent la même langue par construction.
// Renvoie la vraisemblance : 1, BLUFF (ouverture « légère » hors quatrième
// position, que seul le bluff produit) ou 0 (il aurait parlé autrement).
function bidFits({ e, partnerBid, acted }, h) {
  if (e.montant) {
    const min = e.cur ? e.cur.montant + 10 : 80;
    const forced = e.montant === min; // forcer ne se fait qu'au minimum
    if (partnerBid && partnerBid.atout === e.atout) {
      if (e.montant >= 250) return 1;
      // Relance = soutien − 10 (palier de prudence), ou soutien au ras si forcée.
      const pts = supportPoints(h, e.atout, partnerBid.montant);
      const r = e.montant - partnerBid.montant;
      return pts >= (forced ? r : r + 10) &&
        (acted || e.montant >= 160 || pts < r + 20)
        ? 1
        : 0;
    }
    const fitsAt = (light) => {
      const v = openingBid(h, e.atout, light);
      if (!v || bestOpening(h, light).montant > v) return false; // il aurait annoncé sa meilleure couleur
      if (v >= 250) return e.montant === v;
      return (
        e.montant === Math.min(v, 160) || (forced && v + 10 >= min && v < min)
      );
    };
    const fourth = !e.cur && e.passes === 3;
    if (fitsAt(fourth)) return 1;
    return !fourth && fitsAt(true) ? BLUFF : 0;
  }
  if (!e.cur) return bestOpening(h, e.passes === 3) ? 0 : 1;
  if (e.cur.montant >= 250) return 1;
  if (teamOf(e.cur.preneur) === teamOf(e.seat))
    return acted || supportPoints(h, e.cur.atout, e.cur.montant) <= 10
      ? 1
      : 0;
  const own = bestOpening(h, false);
  return !own || own.montant < e.cur.montant ? 1 : 0;
}

// Poids d'une main qui aurait parlé autrement : un bot suit exactement
// son système (aucune de ses vraies mains n'est rejetée, mesuré sur 1 728
// annonces), un humain beaucoup moins. Toute tolérance laisse entrer les
// mains faibles, bien plus nombreuses : avec 1 %, la réussite des
// contrats était sous-estimée de 16 points.
const MISFIT = { bot: 0.0001, human: 0.15 };
const BLUFF = 0.07; // probabilité moyenne de bluff d'un bot (personnalité)
const SIGNAL_MISFIT = 0.3; // appel sans l'As

// Plausibilité de la main actuelle d'un siège au vu de ce qu'il a dit.
function seatWeight(s, hand, readings) {
  const h = maskOf(hand) | maskOf(G.playedBy[s]);
  const misfit = MISFIT[G.seats[s].type === "bot" ? "bot" : "human"];
  let w = 1;
  for (const r of readings) if (r.e.seat === s) w *= bidFits(r, h) || misfit;
  for (const suit of Object.keys(G.appel[s])) {
    if (!G.seen["A" + suit] && !hand.some((c) => c.id === "A" + suit))
      w *= SIGNAL_MISFIT;
  }
  return w;
}

function mcWorlds(seat, n) {
  const atout = G.contract.atout;
  const mine = new Set(G.hands[seat].map((c) => c.id));
  const unknown = buildDeck().filter(
    (c) => !mine.has(c.id) && !G.seen[c.id],
  );
  const others = [0, 1, 2, 3].filter((s) => s !== seat);
  const played = new Set(G.pliCourant.map((e) => e.siege));
  const size = {};
  for (const s of others) size[s] = 8 - G.plisJoues - (played.has(s) ? 1 : 0);
  if (others.reduce((t, s) => t + size[s], 0) !== unknown.length) return [];
  // Belote annoncée : la carte de la rebelote est chez son détenteur.
  const pinned = {};
  if (
    G.belote.beloteDeclared &&
    !G.belote.rebeloteDeclared &&
    G.belote.holder !== seat
  ) {
    const id = (G.belote.kingPlayed ? "Q" : "K") + atout;
    if (!G.seen[id] && !mine.has(id)) pinned[id] = G.belote.holder;
  }
  let w = null;
  for (let tries = 0; !w && tries < 20; tries++)
    w = dealUnknown(unknown, others, size, pinned);
  if (!w) return [];
  // Chaîne de Metropolis : on échange une carte entre deux mains (en
  // respectant manques, obligations et belote), l'échange est gardé selon
  // le rapport des plausibilités ; un monde est relevé tous les THIN pas.
  // Un « 90 fort » ne concerne que 2 % des mains au hasard : un simple
  // tirage par rejet ne les trouvait presque jamais.
  const readings = bidReadings();
  const weight = {};
  for (const s of others) weight[s] = seatWeight(s, w[s], readings);
  const seats = others.filter((s) => size[s] > 0);
  const worlds = [];
  const BURN = 200;
  const THIN = 8;
  for (let step = 0; worlds.length < n && seats.length > 1; step++) {
    const a = seats[Math.floor(Math.random() * seats.length)];
    let b = seats[Math.floor(Math.random() * (seats.length - 1))];
    if (b === a) b = seats[seats.length - 1];
    const ia = Math.floor(Math.random() * w[a].length);
    const ib = Math.floor(Math.random() * w[b].length);
    const ca = w[a][ia];
    const cb = w[b][ib];
    if (
      pinned[ca.id] === undefined &&
      pinned[cb.id] === undefined &&
      canHold(b, ca) &&
      canHold(a, cb)
    ) {
      w[a][ia] = cb;
      w[b][ib] = ca;
      const wa = seatWeight(a, w[a], readings);
      const wb = seatWeight(b, w[b], readings);
      if (Math.random() * weight[a] * weight[b] < wa * wb) {
        weight[a] = wa;
        weight[b] = wb;
      } else {
        w[a][ia] = ca;
        w[b][ib] = cb;
      }
    }
    if (step >= BURN && step % THIN === 0) {
      const copy = {};
      for (const s of others) copy[s] = w[s].slice();
      worlds.push(copy);
    }
  }
  if (seats.length <= 1)
    while (worlds.length < n)
      worlds.push(dealUnknown(unknown, others, size, pinned) || w);
  return worlds;
}

// La belote comptera-t-elle dans ce monde ? Annoncée : oui. Roi ou Dame
// tombé sans annonce : non. Sinon, le preneur ou son partenaire (imaginés)
// la tiennent-ils ?
function worldBelote(seat, world) {
  const { atout, preneur } = G.contract;
  if (G.belote.beloteDeclared) return true;
  if (G.seen["K" + atout] || G.seen["Q" + atout]) return false;
  return [preneur, partnerOf(preneur)].some((s) =>
    hasBelote(s === seat ? G.hands[seat] : world[s], atout),
  );
}

function simPlay(sim, seat, carte) {
  const hand = sim.hands[seat];
  hand.splice(
    hand.findIndex((c) => c.id === carte.id),
    1,
  );
  const lead = sim.pliCourant.length ? sim.pliCourant[0].carte.suit : null;
  // G est le monde simulé pendant la simulation.
  if (lead && carte.suit !== lead) {
    sim.void[seat][lead] = true;
    readDiscardSignal(seat, carte);
  }
  noteTrumpObligations(seat, carte);
  sim.pliCourant.push({ siege: seat, carte });
  sim.seen[carte.id] = true;
  if (sim.pliCourant.length < 4) return suivant(seat);
  const winner = trickWinnerSeat(sim.pliCourant, sim.contract.atout);
  sim.plisJoues++;
  sim.pointsPlis[teamOf(winner)] +=
    trickPoints(sim.pliCourant, sim.contract.atout) +
    (sim.plisJoues === 8 ? 10 : 0);
  sim.plisGagnes[teamOf(winner)]++;
  sim.plisSiege[winner]++;
  sim.pliCourant = [];
  return winner;
}

// Copie de G.seen pour une simulation, les 32 cartes présentes d'emblée :
// l'objet garde sa forme quand les cartes tombent (ajouter les clés une à
// une coûtait un dixième du temps de simulation).
function seenCopy(seen) {
  const o = {};
  for (const s of SUITS) for (const id of IDS[s]) o[id] = seen[id] === true;
  return o;
}

// Joue `card` (ou, avant la première carte, laisse entamer le joueur à
// gauche du donneur) puis la fin de la donne dans ce monde, réflexes des
// quatre joueurs ; renvoie l'état final et la validité de la belote.
function playOut(seat, world, card) {
  const real = G;
  const sim = {
    ...real,
    hands: [0, 1, 2, 3].map((s) =>
      s === seat ? real.hands[s].slice() : world[s].slice(),
    ),
    pliCourant: real.pliCourant.slice(),
    seen: seenCopy(real.seen),
    void: real.void.map((v) => ({ ...v })),
    appel: real.appel.map((v) => ({ ...v })),
    refus: real.refus.map((v) => ({ ...v })),
    trumpMax: real.trumpMax.slice(),
    pointsPlis: real.pointsPlis.slice(),
    plisGagnes: real.plisGagnes.slice(),
    plisSiege: (real.plisSiege || [0, 0, 0, 0]).slice(),
  };
  const bel = worldBelote(seat, world);
  G = sim;
  try {
    let next = card
      ? simPlay(sim, seat, card)
      : isGenerale(sim.contract)
        ? sim.contract.preneur
        : suivant(real.donneur);
    while (sim.plisJoues < 8) {
      if (exactTeam !== null && 8 - sim.plisJoues <= EXACT_TRICKS) {
        sim.exactValue = exactEnd(sim, next, bel, exactTeam);
        break;
      }
      next = simPlay(sim, next, heuristicCard(next));
    }
  } finally {
    G = real;
  }
  return { sim, bel };
}

// Score de la donne vu d'une équipe, plus un soupçon de points de plis
// pour départager.
function donneValue(c, pointsPlis, plisGagnes, bel, multiplicateur, team, plisSiege) {
  const reussi = contratReussi(c, pointsPlis, plisGagnes, bel, plisSiege);
  const gain = (reussi ? contractValue(c) : 160) * multiplicateur;
  return (
    ((reussi ? c.equipePreneur : 1 - c.equipePreneur) === team
      ? gain
      : -gain) +
    (pointsPlis[team] - pointsPlis[1 - team]) * 0.01
  );
}

// Dans un monde imaginé les quatre mains sont connues : les derniers plis
// s'y jouent parfaitement (minimax alpha-bêta, chaque camp maximise son
// score de donne) au lieu des réflexes. Trois plis au plus : douze cartes,
// quelques centaines de positions. Mesuré : +2,5 pts/donne ; quatre plis
// coûtaient dix fois plus de temps.
const EXACT_TRICKS = 3;
let exactTeam = null; // équipe qui évalue, le temps d'un mcValue

// La recherche exacte travaille sur des entiers : carte = couleur × 8 + rang
// (ordre de SUITS et RANKS), main = masque de 32 bits. Mêmes règles que
// computeLegal et trickWinnerSeat, dix fois plus vite que sur des objets.
// Cartes d'une couleur plus fortes qu'une force donnée, hors atout.
const PLAIN_ABOVE = [0, 1, 2, 3].map((si) =>
  [0, 1, 2, 3, 4, 5, 6, 7, 8].map((f) => {
    let m = 0;
    for (let j = 0; j < 8; j++) if (PLAIN_FORCE[RANKS[j]] > f) m |= 1 << (si * 8 + j);
    return m;
  }),
);
const SUIT_BITS = [0xff, 0xff00, 0xff0000, 0xff000000 | 0];
// Par atout : points et force de chaque carte, et masques des atouts plus
// forts qu'une force donnée (obligation de monter).
const EXACT_TABLES = SUITS.map((atout, ai) => {
  const pts = [];
  const force = [];
  for (let i = 0; i < 32; i++) {
    const card = { suit: SUITS[i >> 3], rank: RANKS[i & 7] };
    pts.push(cardPoints(card, atout));
    force.push(forceOf(card, atout));
  }
  const above = [];
  for (let f = 0; f <= 8; f++) {
    let m = 0;
    for (let j = 0; j < 8; j++) if (TRUMP_FORCE[RANKS[j]] > f) m |= 1 << (ai * 8 + j);
    above.push(m);
  }
  // 7-8 et 8-9 d'une couleur, 7-8 d'atout : sans points ni carte entre
  // elles, deux cartes d'une même main sont interchangeables ; seule la
  // plus haute est essayée.
  let twin = 0;
  for (let s = 0; s < 4; s++) twin |= (s === ai ? 0b1 : 0b11) << (s * 8);
  return { pts, force, above, twin };
});

function exactEnd(sim, first, bel, team) {
  const ai = SUITS.indexOf(sim.contract.atout);
  const { pts: P, force: F, above, twin } = EXACT_TABLES[ai];
  const trumpBits = SUIT_BITS[ai];
  const h = sim.hands.map(maskOf);
  const pts = sim.pointsPlis.slice();
  const tricks = sim.plisGagnes.slice();
  const seatTricks = (sim.plisSiege || [0, 0, 0, 0]).slice();
  // Cartes posées, en pile : le pli en cours va de ts à sp − 1, win est
  // la position de la carte maîtresse.
  const ps = [];
  const pc = [];
  let sp = 0;
  let ts = 0;
  let win = 0;
  let done = sim.plisJoues;
  const wv = (c) =>
    c >> 3 === ai ? 100 + F[c] : c >> 3 === pc[ts] >> 3 ? F[c] : -1;
  for (const e of sim.pliCourant) {
    ps[sp] = e.siege;
    pc[sp] = CARD_INDEX[e.carte.id];
    if (sp === ts || wv(pc[sp]) > wv(pc[win])) win = sp;
    sp++;
  }
  function rec(seat, alpha, beta) {
    if (done === 8)
      return donneValue(
        sim.contract,
        pts,
        tricks,
        bel,
        sim.multiplicateur,
        team,
        seatTricks,
      );
    const hand = h[seat];
    let legal = hand;
    if (sp > ts) {
      const lead = pc[ts] >> 3;
      const wc = pc[win];
      const follow = hand & SUIT_BITS[lead];
      if (follow) {
        legal = follow;
        if (lead === ai) legal = follow & above[F[wc]] || follow;
      } else if ((ps[win] & 1) !== (seat & 1) && hand & trumpBits) {
        legal = hand & trumpBits;
        if (wc >> 3 === ai) legal = legal & above[F[wc]] || legal;
      }
    }
    const max = (seat & 1) === team;
    let v = max ? -Infinity : Infinity;
    // Ordre d'essai (la valeur n'en dépend pas, seulement les coupures) :
    // sur un pli adverse, les cartes qui le prennent d'abord ; puis les
    // plus petites.
    const moves = legal & ~(twin & (legal >>> 1));
    let m1 = 0;
    if (sp > ts && (ps[win] & 1) !== (seat & 1)) {
      const wc = pc[win];
      m1 =
        moves &
        (wc >> 3 === ai
          ? above[F[wc]]
          : trumpBits | PLAIN_ABOVE[wc >> 3][F[wc]]);
    }
    for (let m2 = moves & ~m1; m1 | m2; ) {
      const b = m1 ? m1 & -m1 : m2 & -m2;
      if (m1) m1 ^= b;
      else m2 ^= b;
      const card = 31 - Math.clz32(b);
      const prevWin = win;
      h[seat] ^= b;
      ps[sp] = seat;
      pc[sp] = card;
      if (sp === ts || wv(card) > wv(pc[win])) win = sp;
      sp++;
      let r;
      if (sp - ts < 4) r = rec((seat + 1) & 3, alpha, beta);
      else {
        const w = ps[win];
        const p =
          P[pc[ts]] + P[pc[ts + 1]] + P[pc[ts + 2]] + P[pc[ts + 3]] +
          (done === 7 ? 10 : 0);
        const prevTs = ts;
        pts[w & 1] += p;
        tricks[w & 1]++;
        seatTricks[w]++;
        done++;
        ts = sp;
        r = rec(w, alpha, beta);
        ts = prevTs;
        done--;
        seatTricks[w]--;
        tricks[w & 1]--;
        pts[w & 1] -= p;
      }
      sp--;
      win = prevWin;
      h[seat] ^= b;
      if (max) {
        v = Math.max(v, r);
        alpha = Math.max(alpha, v);
      } else {
        v = Math.min(v, r);
        beta = Math.min(beta, v);
      }
      if (alpha >= beta) break;
    }
    return v;
  }
  return rec(first, -Infinity, Infinity);
}

// Score de la donne vu de l'équipe du siège après `card`.
function mcValue(seat, card, world) {
  exactTeam = teamOf(seat);
  let out;
  try {
    out = playOut(seat, world, card);
  } finally {
    exactTeam = null;
  }
  const { sim, bel } = out;
  if (sim.exactValue !== undefined) return sim.exactValue;
  return donneValue(
    sim.contract,
    sim.pointsPlis,
    sim.plisGagnes,
    bel,
    sim.multiplicateur,
    teamOf(seat),
    sim.plisSiege,
  );
}

// Monde par monde, toutes les cartes sur les mêmes mondes : au-delà du
// budget de réflexion (téléphone lent), on s'arrête avec les mondes déjà vus.
function mcChooseCard(seat, legal, reflex) {
  const worlds = mcWorlds(seat, tuning.mcSamples);
  if (!worlds.length) return reflex;
  const cards = [reflex, ...legal.filter((c) => c.id !== reflex.id)];
  const totals = cards.map(() => 0);
  const stop = tuning.now() + MC_BUDGET_MS;
  for (const w of worlds) {
    cards.forEach((c, i) => {
      totals[i] += mcValue(seat, c, w);
    });
    if (tuning.now() > stop) break;
  }
  let best = 0;
  totals.forEach((t, i) => {
    if (t > totals[best] + 1e-9) best = i;
  });
  return cards[best];
}

// Chances de réussite d'un contrat avant la première carte : la donne est
// jouée en entier (réflexes) sur des mondes compatibles avec les enchères.
const BID_BUDGET_MS = 150;
// minWorlds : en dessous, la réponse est « je ne sais pas » (null).
function makeProbability(seat, contract, minWorlds = 1) {
  if (tuning.now() >= bidDeadline) return null;
  const saved = G.contract;
  G.contract = contract;
  try {
    const stop = Math.min(tuning.now() + BID_BUDGET_MS, bidDeadline);
    let ok = 0;
    let n = 0;
    // Pendant une enchère, les mondes de la décision (voir bidWorlds) ;
    // pour une coinche ou une surcoinche, des mondes à part.
    const worlds =
      bidDeadline === Infinity
        ? mcWorlds(seat, tuning.bidSamples)
        : bidWorlds || (bidWorlds = mcWorlds(seat, tuning.bidWorlds));
    for (const w of worlds) {
      const { sim, bel } = playOut(seat, w, null);
      n++;
      if (contratReussi(contract, sim.pointsPlis, sim.plisGagnes, bel, sim.plisSiege)) ok++;
      if (tuning.now() > stop) break;
    }
    return n >= minWorlds ? ok / n : null;
  } finally {
    G.contract = saved;
  }
}

// Le réflexe propose, la simulation dispose.
function botChooseCard(seat) {
  const legal = computeLegal(
    G.hands[seat],
    G.pliCourant,
    G.contract.atout,
    seat,
  );
  if (legal.length === 1) return legal[0];
  return mcChooseCard(seat, legal, heuristicCard(seat));
}

// Belote et rebelote sont annoncées automatiquement dès que le Roi et la
// Dame d'atout du détenteur (preneur ou partenaire) sont joués — aucun
// bouton, aucune fenêtre à guetter. Le bonus ne dépend que des cartes
// réellement en main, donc l'automatiser ne triche pas : humain et bots
// sont logés à la même enseigne.
function declareBeloteIfNeeded(seat, carte) {
  if (!G.contract || carte.suit !== G.contract.atout) return;
  if (carte.rank !== "K" && carte.rank !== "Q") return;
  if (G.belote.holder !== seat) return;
  if (carte.rank === "K") G.belote.kingPlayed = true;
  if (carte.rank === "Q") G.belote.queenPlayed = true;
  const count =
    (G.belote.kingPlayed ? 1 : 0) + (G.belote.queenPlayed ? 1 : 0);
  if (count === 1 && !G.belote.beloteDeclared) {
    G.belote.beloteDeclared = true;
  } else if (
    count === 2 &&
    G.belote.beloteDeclared &&
    !G.belote.rebeloteDeclared
  ) {
    G.belote.rebeloteDeclared = true;
  }
}

// Réussite d'un contrat (section 9 de REGLES_COINCHE.md). Générale : le
// preneur fait les huit plis à lui seul (plisSiege) ; belotée, avec la belote.
function contratReussi(contract, pointsPlis, plisGagnes, beloteValide, plisSiege) {
  const preneurs = contract.equipePreneur;
  if (isGenerale(contract)) {
    const seul = plisSiege ? plisSiege[contract.preneur] === 8 : plisGagnes[preneurs] === 8;
    return seul && (contract.type === "GENERALE" || beloteValide);
  }
  if (contract.type === "CAPOT") return plisGagnes[preneurs] === 8;
  if (contract.type === "CAPOT_BELOTE")
    return plisGagnes[preneurs] === 8 && beloteValide;
  let seuil = contract.montant === 80 ? 82 : contract.montant;
  if (beloteValide) seuil = Math.max(81, seuil - 20);
  return pointsPlis[preneurs] >= seuil;
}

function computeScore() {
  const preneurs = G.contract.equipePreneur;
  const defense = 1 - preneurs;
  const beloteValide = G.belote.beloteDeclared && G.belote.rebeloteDeclared;
  const reussi = contratReussi(
    G.contract,
    G.pointsPlis,
    G.plisGagnes,
    beloteValide,
    G.plisSiege,
  );

  let gainPreneurs = 0;
  let gainDefense = 0;
  if (reussi) gainPreneurs = contractValue(G.contract) * G.multiplicateur;
  else gainDefense = 160 * G.multiplicateur;
  // Belote des preneurs : +20 au décompte de la donne (pour faire le contrat,
  // voir contratReussi) s'il a fait au moins 81 points de plis ; rien au
  // score de la partie. Déjà comprise dans le capot beloté (et la Générale belotée).
  const beloteBonus =
    beloteValide &&
    G.contract.type !== "CAPOT_BELOTE" &&
    G.contract.type !== "GENERALE_BELOTE" &&
    G.pointsPlis[preneurs] >= BELOTE_MIN
      ? BELOTE_BONUS
      : 0;

  G.scores[preneurs] += gainPreneurs;
  G.scores[defense] += gainDefense;

  G.dernierResultat = {
    reussi,
    preneurs,
    gain: reussi ? gainPreneurs : gainDefense,
    montant: G.contract.montant,
    atout: G.contract.atout,
    multiplicateur: G.multiplicateur,
    generale: !!G.contract.generale,
    // Détail pour le récapitulatif affiché (par équipe).
    preneur: G.contract.preneur,
    points: G.pointsPlis.slice(),
    plis: G.plisGagnes.slice(),
    belote: beloteValide,
    beloteBonus,
    gains: preneurs === 0 ? [gainPreneurs, gainDefense] : [gainDefense, gainPreneurs],
  };
  G.history.unshift({
    donne: G.donneNumero - 1,
    preneur: G.contract.preneur,
    reussi,
    gain: reussi ? gainPreneurs : gainDefense,
    pointsFaits: G.pointsPlis[preneurs],
    montant: G.contract.montant,
    atout: G.contract.atout,
    multiplicateur: G.multiplicateur,
    generale: !!G.contract.generale,
    coincheur: G.contract.coincheur ?? null,
    surcoincheur: G.contract.surcoincheur ?? null,
  });
  // Le résultat reste affiché DURATION_MS.SCORE, puis TIMEOUT enchaîne.
  G.phase = "SCORE";
  startTurn();
}

// Applique l'action d'un siège. Renvoie undefined si elle est acceptée,
// sinon le motif du refus (REGLES_COINCHE.md §10) sans rien modifier.
// Actions : PASSER, ENCHERIR { montant, atout }, COINCHER, SURCOINCHER,
// JOUER { carte }, TIMEOUT { tour } (fenêtre de temps écoulée, siège
// ignoré). action.memo : mémoire d'enchère d'un bot (voir G.bidMemo).
function applyAction(seat, action) {
  if (!G || G.phase === "TERMINEE") return "PARTIE_TERMINEE";
  const error = act(seat, action);
  if (!error && action.memo && G.seats[seat]?.type === "bot") {
    G.bidMemo[seat] = action.memo.bidMemo;
    G.forced = action.memo.forced;
  }
  return error;
}

function act(seat, action) {
  if (action.type === "TIMEOUT") {
    if (action.tour !== G.tour) return "DELAI_EXPIRE";
    if (G.phase === "ENCHERES") return act(G.joueurActif, { type: "PASSER" });
    if (G.phase === "JEU") {
      const s = G.joueurActif;
      const legal = computeLegal(G.hands[s], G.pliCourant, G.contract.atout, s);
      return act(s, {
        type: "JOUER",
        carte: legal[Math.floor(rand() * legal.length)],
      });
    }
    if (G.phase === "SURCOINCHE") {
      lockContractAndStartPlay();
      return;
    }
    if (G.phase === "SCORE") {
      if (Math.max(...G.scores) >= WIN_SCORE) G.phase = "TERMINEE";
      else startNewDonne();
      return;
    }
    return "HORS_PHASE";
  }

  if (action.type === "PASSER") {
    if (G.phase !== "ENCHERES") return "HORS_PHASE";
    if (seat !== G.joueurActif) return "HORS_TOUR";
    G.bidLog.push({
      seat,
      cur: G.contract && { ...G.contract },
      passes: G.passesConsecutives,
    });
    G.passesConsecutives++;
    if (!G.contract) {
      if (G.passesConsecutives === 4) {
        startNewDonne();
        return;
      }
      G.joueurActif = suivant(seat);
      startTurn();
    } else if (G.passesConsecutives >= 3) {
      lockContractAndStartPlay();
    } else {
      G.joueurActif = suivant(seat);
      startTurn();
    }
    return;
  }

  if (action.type === "ENCHERIR") {
    if (G.phase !== "ENCHERES") return "HORS_PHASE";
    if (seat !== G.joueurActif) return "HORS_TOUR";
    const montant = action.montant;
    if (!ALLOWED_BIDS.includes(montant) || !SUITS.includes(action.atout))
      return "ENCHERE_INVALIDE";
    if (G.contract && montant <= G.contract.montant) return "ENCHERE_INVALIDE";
    G.contractCounter = (G.contractCounter || 0) + 1;
    G.donneAnnonces.push({ seat, montant, atout: action.atout });
    G.bidLog.push({
      seat,
      montant,
      atout: action.atout,
      cur: G.contract && { ...G.contract },
      passes: G.passesConsecutives,
    });
    G.contract = {
      id: G.contractCounter,
      type: bidType(montant),
      montant,
      atout: action.atout,
      preneur: seat,
      equipePreneur: teamOf(seat),
      coinche: false,
      surcoinche: false,
    };
    G.passesConsecutives = 0;
    G.joueurActif = suivant(seat);
    startTurn();
    return;
  }

  if (action.type === "COINCHER") {
    if (G.phase !== "ENCHERES" || !G.contract || G.contract.coinche)
      return "HORS_PHASE";
    if (teamOf(seat) === G.contract.equipePreneur) return "COINCHE_INTERDITE";
    G.contract.coinche = true;
    G.contract.coincheur = seat;
    G.multiplicateur = 2;
    G.phase = "SURCOINCHE";
    startTurn();
    return;
  }

  if (action.type === "SURCOINCHER") {
    if (G.phase !== "SURCOINCHE" || G.contract.surcoinche) return "HORS_PHASE";
    if (teamOf(seat) !== G.contract.equipePreneur)
      return "SURCOINCHE_INTERDITE";
    G.contract.surcoinche = true;
    G.contract.surcoincheur = seat;
    G.multiplicateur = 4;
    lockContractAndStartPlay();
    return;
  }

  if (action.type === "JOUER") {
    if (G.phase !== "JEU") return "HORS_PHASE";
    if (seat !== G.joueurActif) return "HORS_TOUR";
    const hand = G.hands[seat];
    const idx = hand.findIndex((c) => c.id === action.carte?.id);
    if (idx === -1) return "CARTE_INTERDITE";
    const legal = computeLegal(hand, G.pliCourant, G.contract.atout, seat);
    if (!legal.some((c) => c.id === action.carte.id)) return "CARTE_INTERDITE";

    const couleurDemandeeAvant = G.pliCourant.length
      ? G.pliCourant[0].carte.suit
      : null;
    const carte = hand.splice(idx, 1)[0];
    noteTrumpObligations(seat, carte);
    G.pliCourant.push({ siege: seat, carte });
    G.playedBy[seat].push(carte);
    G.seen[carte.id] = true;
    if (couleurDemandeeAvant && carte.suit !== couleurDemandeeAvant) {
      G.void[seat][couleurDemandeeAvant] = true;
      readDiscardSignal(seat, carte);
    }
    declareBeloteIfNeeded(seat, carte);

    if (G.pliCourant.length < 4) {
      G.joueurActif = suivant(seat);
      startTurn();
      return;
    }

    const winnerSeat = trickWinnerSeat(G.pliCourant, G.contract.atout);
    const team = teamOf(winnerSeat);
    let points = trickPoints(G.pliCourant, G.contract.atout);
    G.plisJoues++;
    if (G.plisJoues === 8) points += 10;
    G.pointsPlis[team] += points;
    G.plisGagnes[team]++;
    G.plisSiege[winnerSeat]++;
    // Le pli est résolu tout de suite : l'écran le montre encore un
    // instant (depuis lastTrick) avant de le ramasser, sans bloquer l'état.
    G.lastTrick = { cards: G.pliCourant, winnerSeat, points };
    G.pliCourant = [];
    if (G.plisJoues === 8) {
      // Belote et rebelote sont déjà tranchées (annonce automatique au
      // moment où les cartes sont jouées) : le score se calcule tout de suite.
      computeScore();
    } else {
      G.joueurActif = winnerSeat;
      startTurn();
    }
    return;
  }
  return "ACTION_INCONNUE";
}

function lockContractAndStartPlay() {
  // Belote de l'équipe preneuse : le preneur ou son partenaire (qui a pu
  // ouvrir avant d'être remonté) tient Roi et Dame d'atout.
  const { preneur, atout } = G.contract;
  G.belote.holder =
    [preneur, partnerOf(preneur)].find((s) =>
      hasBelote(G.mainsInitiales[s], atout),
    ) ?? null;
  // Huit atouts : la main initiale du preneur tenait les 8 cartes de
  // l'atout. Ce n'est pas un contrat à part — il se joue et se score
  // exactement comme le capot beloté qu'il est déjà (270) — seulement un
  // marqueur pour l'afficher et pour que la défense (qui n'a alors, par
  // construction, aucune carte de cette couleur) ne perde jamais à
  // coincher une main qu'elle ne peut mathématiquement pas prendre.
  G.contract.huitAtouts = contractHuitAtouts(G.contract);
  G.contract.generale = isGenerale(G.contract);
  G.phase = "JEU";
  // Générale : le preneur prend la main.
  G.joueurActif = G.contract.generale ? G.contract.preneur : suivant(G.donneur);
  startTurn();
}

// ---- API ---------------------------------------------------------------

// Pose g comme partie courante le temps de l'appel, puis rend la main :
// les fonctions internes lisent G.
function withG(fn) {
  return (g, ...args) => {
    const prev = G;
    G = g;
    try {
      return fn(...args);
    } finally {
      G = prev;
    }
  };
}

// Le temps d'un appel des règles : hasard r (sinon Math.random) et donne
// imposée dealFn(G, paquet) → 4 mains (tests), sinon mélange.
function withRules(r, dealFn, fn) {
  const prev = [rand, dealOverride, G];
  rand = r || Math.random;
  dealOverride = dealFn || null;
  try {
    return fn();
  } finally {
    [rand, dealOverride, G] = prev;
  }
}

// Nouvelle partie, première donne distribuée. seats : [{ type, name }].
export function createGame(seats, r, dealFn) {
  return withRules(r, dealFn, () => newGame(seats));
}

// Applique l'action d'un siège à g (voir applyAction) : undefined ou motif.
export function actOn(g, seat, action, r, dealFn) {
  return withRules(r, dealFn, () => {
    G = g;
    return applyAction(seat, action);
  });
}

// Décisions des bots, sur une vue de la partie où seule leur main compte.
export const bots = {
  turnAction: withG(botTurnAction),
  decideBid: withG(botDecideBid),
  chooseCard: withG(botChooseCard),
  wantsToCoinche: withG(botWantsToCoinche),
  wantsToSurcoinche: withG(botWantsToSurcoinche),
  heuristicCard: withG(heuristicCard),
  mcWorlds: withG(mcWorlds),
  noteTrumpObligations: withG(noteTrumpObligations),
  contractHuitAtouts: withG(contractHuitAtouts),
  exactEnd,
};

export {
  teamOf,
  suivant,
  cardLabel,
  computeLegal,
  trickWinnerSeat,
  contratReussi,
};
