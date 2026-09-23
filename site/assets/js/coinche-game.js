// Moteur de coinche jouable en local, conforme au profil scepi-online-v1
// décrit dans REGLES_COINCHE.md. Tout tourne dans le navigateur : un seul
// siège est piloté par la personne devant l'écran, les autres par une IA
// qui applique les stratégies classiques de la coinche : un vrai système
// d'enchères (90 fort, soutien +20 Valet / +10 par As, capot par les
// clefs) et les réflexes de jeu de la carte (tirer les atouts, encaisser
// ses maîtres, appels et refus, charger son partenaire). Un bot ne voit que
// sa main : il imagine les autres (mondes compatibles avec les cartes
// tombées, les manques, les obligations de couper, les enchères relues avec
// son propre système et les appels), et y joue la donne pour choisir sa
// carte (Monte-Carlo) ou décider de coincher.
// Chaque robot a une « personnalité » tirée au hasard en début de partie
// (agressivité, goût du bluff, appétit à coincher) pour éviter un
// comportement parfaitement prévisible d'une partie à l'autre. Le jour où
// le vrai serveur WebSocket de TECHNIQUE.md §6 existera, cette IA sera
// remplacée par de vrais joueurs et applyAction() par des messages serveur,
// mais l'état et les règles ci-dessous resteront valables tels quels.

(function () {
  const SUITS = ["H", "D", "C", "S"];
  const RANKS = ["7", "8", "9", "10", "J", "Q", "K", "A"];
  const SUIT_SYMBOL = { H: "♥", D: "♦", C: "♣", S: "♠" };
  const SUIT_NAME = { H: "Cœur", D: "Carreau", C: "Trèfle", S: "Pique" };
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
  const RED_SUITS = new Set(["H", "D"]);

  const TRUMP_POINTS = { J: 20, 9: 14, A: 11, 10: 10, K: 4, Q: 3, 8: 0, 7: 0 };
  const PLAIN_POINTS = { A: 11, 10: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 };
  const TRUMP_FORCE = { J: 8, 9: 7, A: 6, 10: 5, K: 4, Q: 3, 8: 2, 7: 1 };
  const PLAIN_FORCE = { A: 8, 10: 7, K: 6, Q: 5, J: 4, 9: 3, 8: 2, 7: 1 };
  const ALLOWED_BIDS = [80, 90, 100, 110, 120, 130, 140, 150, 160, 250, 270];

  const TURN_DURATION_MS = 30000; // temps pour enchérir ou jouer une carte
  const SURCOINCHE_DURATION_MS = 10000;
  const TRICK_PAUSE_MS = 1100; // le pli reste affiché, carte gagnante en évidence
  const TRICK_COLLECT_MS = 550; // puis il est « ramassé » en animation

  const SEAT_POS = ["Sud", "Ouest", "Nord", "Est"]; // position visuelle : 0=vous(bas),1=droite,2=partenaire(haut),3=gauche

  function bidType(montant) {
    if (montant === 250) return "CAPOT";
    if (montant === 270) return "CAPOT_BELOTE";
    return "NUMERIQUE";
  }

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

  function shuffle(deck) {
    const a = deck.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
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

  let G = null;
  let els = {};
  let onExit = null;

  function clearTimer(name) {
    if (G && G.timers[name]) {
      clearTimeout(G.timers[name]);
      G.timers[name] = null;
    }
  }

  function log(message) {
    G.log.unshift(message);
    G.log = G.log.slice(0, 8);
  }

  function seatName(seat) {
    if (seat === G.you) return "Vous";
    return (
      G.seats[seat].name ||
      (G.seats[seat].type === "bot" ? "Ordinateur" : `Siège ${seat}`)
    );
  }

  function startNewDonne() {
    G.donneur = G.donneNumero === 1 ? G.donneur : suivant(G.donneur);
    G.donneNumero++;
    G.hands = deal(shuffle(buildDeck()), G.donneur);
    G.mainsInitiales = G.hands.map((h) => h.slice());
    G.contract = null;
    G.passesConsecutives = 0;
    G.multiplicateur = 1;
    G.pliCourant = [];
    G.plisJoues = 0;
    G.plisGagnes = [0, 0];
    G.pointsPlis = [0, 0];
    G.belote = {
      holder: null,
      kingPlayed: false,
      queenPlayed: false,
      beloteDeclared: false,
      rebeloteDeclared: false,
    };
    G.resolvingTrick = null;
    G.lastTrick = null;
    // Mémoire de l'IA pour cette donne : cartes déjà vues (les siennes
    // exclues, pour compter ce qu'il reste ailleurs) et « manques » déduits
    // — un siège qui ne fournit pas une couleur demandée n'en a plus, ce qui
    // permet ensuite de ne pas mener un as dans une couleur où un adversaire
    // pourra couper, ou au contraire de savoir qu'une couleur est sûre.
    G.seen = new Set();
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
    // belote) et combien de fois chaque ligne a « forcé » une enchère.
    G.bidMemo = [{}, {}, {}, {}];
    G.forced = [0, 0];
    els.showLastTrick = false;
    clearTimer("collect");
    clearTimer("sweep");
    G.phase = "ENCHERES";
    G.joueurActif = suivant(G.donneur);
    log(
      `Nouvelle donne (#${G.donneNumero - 1}). ${seatName(G.donneur)} donne.`,
    );
    startTurn();
  }

  function clearTurnTimers() {
    ["turn", "bot", "timerWarn", "timerDanger"].forEach(clearTimer);
  }

  function startTurn() {
    clearTurnTimers();
    const seat = G.joueurActif;
    G.turnTotalDuration = TURN_DURATION_MS;
    G.echeance = Date.now() + G.turnTotalDuration;
    G.timers.turn = setTimeout(() => onTurnTimeout(seat), TURN_DURATION_MS);
    if (G.seats[seat].type === "bot") {
      G.timers.bot = setTimeout(() => botAct(seat), 600 + Math.random() * 900);
    }
    render();
  }

  function onTurnTimeout(seat) {
    if (G.joueurActif !== seat) return;
    if (G.phase === "ENCHERES") {
      applyAction(seat, { type: "PASSER" });
    } else if (G.phase === "JEU") {
      const legal = computeLegal(
        G.hands[seat],
        G.pliCourant,
        G.contract.atout,
        seat,
      );
      const carte = legal[Math.floor(Math.random() * legal.length)];
      applyAction(seat, { type: "JOUER", carte });
    }
  }

  function botAct(seat) {
    if (G.joueurActif !== seat) return;
    if (G.phase === "ENCHERES") {
      const decision = botDecideBid(seat);
      applyAction(seat, decision);
    } else if (G.phase === "JEU") {
      const carte = botChooseCard(seat);
      applyAction(seat, { type: "JOUER", carte });
    }
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
  //     −10 si court à l'atout, +20 belote (seul le preneur la marque, on
  //     relance donc pour le devenir), puis on retire un palier de prudence :
  //     un contrat chuté donne 160 à l'adversaire, 10 points de plus ne
  //     valent jamais ce risque.
  //   Capot quand les As annoncés (« clefs ») couvrent les fausses cartes
  //     de l'ouvreur.
  //   Compétition : soutenir le partenaire en « forçant » de 10, deux fois au
  //     plus par ligne ; au-dessus de l'adversaire, surenchérir seulement si
  //     la donne simulée le vaut mieux que le laisser jouer (voir étape 4).
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
  function hasBelote(hand, suit) {
    return holds(hand, suit, "K") && holds(hand, suit, "Q");
  }
  function sideSuits(atout) {
    return SUITS.filter((s) => s !== atout);
  }
  function sideAces(hand, atout) {
    return sideSuits(atout).filter((s) => holds(hand, s, "A")).length;
  }
  function round10(n) {
    return Math.floor(n / 10) * 10;
  }

  // Fausses cartes : les cartes hors atout qui ne feront pas de pli
  // d'elles-mêmes, tout ce qui n'est pas en tête de séquence As-10-Roi.
  function fausses(hand, atout) {
    let f = 0;
    for (const s of sideSuits(atout)) {
      let maitres = 0;
      for (const r of ["A", "10", "K"]) {
        if (!holds(hand, s, r)) break;
        maitres++;
      }
      f += suitCards(hand, s).length - maitres;
    }
    return f;
  }

  // Ouverture que la main justifie à cet atout (0 = pas d'ouverture).
  // « light » : dernier à parler après trois passes, ou profil bluffeur ;
  // personne n'a de quoi ouvrir, on peut forcer un 80.
  function openingBid(hand, suit, light) {
    const n = suitCards(hand, suit).length;
    // Main entière dans une seule couleur (8 cartes sur 8, donc Valet, 9 ET
    // belote garantis) : tombe déjà dans le cas V&&N&&f===0 ci-dessous, qui
    // rend 270 — la Générale n'est pas un palier à part, juste ce même
    // capot beloté acquis par construction (voir G.contract.generale, posé
    // au verrouillage du contrat une fois la vraie main initiale connue).
    const V = holds(hand, suit, "J");
    const N = holds(hand, suit, "9");
    const A = holds(hand, suit, "A");
    const X = holds(hand, suit, "10");
    const bel = hasBelote(hand, suit);
    const aces = sideAces(hand, suit);
    if (V && N && n >= 3) {
      const f = fausses(hand, suit);
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
    let best = null;
    for (const atout of SUITS) {
      const montant = openingBid(hand, atout, light);
      const len = suitCards(hand, atout).length;
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
    const n = suitCards(hand, suit).length;
    const V = holds(hand, suit, "J");
    const N = holds(hand, suit, "9");
    const aces = sideAces(hand, suit);
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
    if (hasBelote(hand, suit)) pts += 20;
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
  const BID_DECISION_MS = 400;
  const COMPETE_MARGIN = 60; // voir l'étape 4
  let bidDeadline = Infinity;
  function botDecideBid(seat) {
    bidDeadline = Date.now() + BID_DECISION_MS;
    try {
      return decideBid(seat);
    } finally {
      bidDeadline = Infinity;
    }
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
    const pMake = (montant, atout) =>
      makeProbability(seat, {
        id: -1,
        type: bidType(montant),
        montant,
        atout,
        preneur: seat,
        equipePreneur: team,
        coinche: false,
        surcoinche: false,
      });

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
        if (o) {
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
        if (o) return o;
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

    // 3. Ma belote dans l'atout de mon partenaire preneur : elle ne compte
    // que pour le preneur, je reprends de 10 pour 20 points de belote.
    if (
      ours &&
      cur.preneur === partner &&
      cur.type === "NUMERIQUE" &&
      hasBelote(hand, cur.atout) &&
      !memo.beloteRetake
    ) {
      memo.beloteRetake = true;
      const o = offer(cur.montant + 10, cur.atout);
      if (o) return o;
    }

    // 4. Intervenir au-dessus de l'adversaire : par espérance simulée, pas
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

    // 5. Ouvrir au barème (il renseigne le partenaire : l'ouverture « à
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
        const pm = o && o.montant < 250 ? pMake(o.montant, o.atout) : null;
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

  // Générale : la main initiale du preneur tient les 8 cartes de l'atout —
  // pas un contrat à part, le même capot beloté (270) acquis par
  // construction. Se relit sur G.mainsInitiales (fixée dès la distribution,
  // jamais modifiée en cours de donne), donc valable aussi bien pendant les
  // enchères qu'une fois le contrat verrouillé.
  // Un contrat plus bas tenu avec les 8 atouts reste ce contrat-là (§1).
  function contractIsGenerale(contract) {
    if (
      !contract ||
      contract.type !== "CAPOT_BELOTE" ||
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
    if (pre + contract.montant >= 1010 && pre + contract.montant > def)
      return true;
    if (def + 160 >= 1010 && def + 160 > pre) return false;
    const tenue =
      holds(hand, atout, "J") ||
      (holds(hand, atout, "9") && suitCards(hand, atout).length >= 2);
    // Contre un capot, seul un pli d'atout est sûr : l'annonceur n'a pas de
    // perdante à côté, ses As et ceux de son partenaire couvrent tout, et nos
    // As seraient coupés. (Contre une Générale, la défense n'a aucun atout.)
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
    if (pre + 2 * contract.montant >= 1010 && pre + 2 * contract.montant > def)
      return false;
    // Une chute coinchée les ferait sortir de toute façon : on surcoinche par principe.
    if (def + 320 >= 1010) return true;
    // Le preneur qui tient les 8 atouts (sa propre main, rien d'autre) gagne à coup sûr.
    if (seat === contract.preneur && suitCards(hand, atout).length === 8)
      return true;
    if (contract.type !== "NUMERIQUE") return false;
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

  function maybeBotsConsiderCoinche() {
    if (G.phase !== "ENCHERES" || !G.contract || G.contract.coinche) return;
    const contractId = G.contract.id;
    [0, 1, 2, 3].forEach((seat) => {
      if (
        teamOf(seat) === G.contract.equipePreneur ||
        G.seats[seat].type !== "bot"
      )
        return;
      setTimeout(
        () => {
          if (
            !G ||
            G.phase !== "ENCHERES" ||
            !G.contract ||
            G.contract.id !== contractId ||
            G.contract.coinche
          )
            return;
          if (botWantsToCoinche(seat)) applyAction(seat, { type: "COINCHER" });
        },
        700 + Math.random() * 2200,
      );
    });
  }

  function maybeBotsConsiderSurcoinche() {
    if (G.phase !== "SURCOINCHE" || !G.contract) return;
    const contractId = G.contract.id;
    [0, 1, 2, 3].forEach((seat) => {
      if (
        teamOf(seat) !== G.contract.equipePreneur ||
        G.seats[seat].type !== "bot"
      )
        return;
      setTimeout(
        () => {
          if (
            !G ||
            G.phase !== "SURCOINCHE" ||
            !G.contract ||
            G.contract.id !== contractId ||
            G.contract.surcoinche
          )
            return;
          if (botWantsToSurcoinche(seat))
            applyAction(seat, { type: "SURCOINCHER" });
        },
        400 + Math.random() * 3200,
      );
    });
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
  //   - encaisser d'abord ses maîtres, avant qu'ils ne soient coupés
  //   - répondre à l'appel du partenaire, jouer la couleur qu'il a annoncée
  //   - entamer un singleton pour couper ensuite
  // Pendant le pli :
  //   - partenaire maître pour de bon : charger (le 10 sous son As, un 10
  //     menacé) ; pli incertain : ne rien donner, ou l'assurer d'un maître
  //   - petit en second, gagner au plus juste en dernier, couper petit
  //   - défausse : appel (petite carte sous un As), refus (Roi/Dame d'une
  //     couleur faible), garder la garde du 10, se raccourcir pour couper
  //   - capot : tout gagner ; contre un capot, prendre un pli

  // Sièges qui n'ont pas encore joué dans le pli en cours, hors nous-même.
  function seatsStillToAct(pli, seat) {
    const played = new Set(pli.map((e) => e.siege));
    return [0, 1, 2, 3].filter((s) => s !== seat && !played.has(s));
  }

  // Cartes de cette couleur encore cachées : ni jouées, ni dans ma main.
  function outCards(hand, suit) {
    return RANKS.map((r) => r + suit).filter(
      (id) => !G.seen.has(id) && !hand.some((c) => c.id === id),
    );
  }

  // Reste-t-il dehors une carte plus forte dans la couleur ? Sinon la
  // carte est maîtresse : un vrai décompte, pas une supposition.
  function higherOut(hand, card, atout) {
    const table = card.suit === atout ? TRUMP_FORCE : PLAIN_FORCE;
    const f = table[card.rank];
    for (const r of RANKS) {
      if (
        table[r] > f &&
        !G.seen.has(r + card.suit) &&
        !hand.some((c) => c.suit === card.suit && c.rank === r)
      )
        return true;
    }
    return false;
  }

  function byValue(atout) {
    return (a, b) =>
      cardPoints(a, atout) - cardPoints(b, atout) ||
      forceOf(a, atout) - forceOf(b, atout);
  }
  function lowest(cards, atout) {
    return cards.slice().sort(byValue(atout))[0];
  }
  function highest(cards, atout) {
    return cards.slice().sort(byValue(atout)).pop();
  }
  function weakest(cards, atout) {
    return cards
      .slice()
      .sort((a, b) => forceOf(a, atout) - forceOf(b, atout))[0];
  }
  function strongest(cards, atout) {
    return cards
      .slice()
      .sort((a, b) => forceOf(a, atout) - forceOf(b, atout))
      .pop();
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
    for (const r of RANKS) {
      const f = TRUMP_FORCE[r];
      if (
        f > force &&
        f <= G.trumpMax[s] &&
        !G.seen.has(r + atout) &&
        !hand.some((c) => c.suit === atout && c.rank === r)
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
    if (G.seen.has(jack) || ctx.hand.some((c) => c.id === jack)) return false;
    const o = openingOf(ctx.partner, ctx.atout);
    return o === 90 || o >= 110 || raiseBy(ctx.partner, ctx.atout) >= 20;
  }

  // Couleur appelée par le partenaire, tant que son As n'est pas tombé.
  function calledSuit(ctx) {
    return (
      sideSuits(ctx.atout).find(
        (s) =>
          G.appel[ctx.partner][s] &&
          !G.seen.has("A" + s) &&
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
      if (trumps.length >= 2 && G.plisJoues <= 4) {
        const single = side.find(
          (c) =>
            suitCards(hand, c.suit).length === 1 && cardPoints(c, atout) < 10,
        );
        if (single) return single;
      }
      return defaultLead(ctx);
    }

    const masters = side.filter((c) => safeMaster(ctx, c));
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
      ![...G.seen].some((id) => id.endsWith(partnerSuit)) &&
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

    if (partnerWins) {
      if (holdsUp(winCard)) return charge(ctx, lead, winCard);
      const secure = winners.filter(holdsUp); // pli menacé : l'assurer d'un maître
      if (secure.length) return weakest(secure, atout);
      return others.length
        ? discard(ctx, lead, others)
        : weakest(winners, atout);
    }
    if (!winners.length) return discard(ctx, lead, legal);
    if (!oppAfter.length) {
      return weakest(winners, atout);
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
      return cheap;
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
        return under.length ? highest(under, atout) : weakest(legal, atout);
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
    return side.slice().sort((a, b) => cost(a) - cost(b))[0];
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
  // des parties contre les réflexes seuls, et 48 mondes 59 % contre 16 ; le
  // temps de réflexion reste plafonné pour les appareils lents.
  const MC_SAMPLES = 48;
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
    const h = hand.concat(G.playedBy[s]);
    const misfit = MISFIT[G.seats[s].type === "bot" ? "bot" : "human"];
    let w = 1;
    for (const r of readings) if (r.e.seat === s) w *= bidFits(r, h) || misfit;
    for (const suit of Object.keys(G.appel[s])) {
      if (!G.seen.has("A" + suit) && !hand.some((c) => c.id === "A" + suit))
        w *= SIGNAL_MISFIT;
    }
    return w;
  }

  function mcWorlds(seat, n) {
    const atout = G.contract.atout;
    const mine = new Set(G.hands[seat].map((c) => c.id));
    const unknown = buildDeck().filter(
      (c) => !mine.has(c.id) && !G.seen.has(c.id),
    );
    const others = [0, 1, 2, 3].filter((s) => s !== seat);
    const played = new Set(G.pliCourant.map((e) => e.siege));
    const size = {};
    for (const s of others) size[s] = 8 - G.plisJoues - (played.has(s) ? 1 : 0);
    if (others.reduce((t, s) => t + size[s], 0) !== unknown.length) return [];
    // Belote annoncée : la carte de la rebelote est chez le preneur.
    const pinned = {};
    if (
      G.belote.beloteDeclared &&
      !G.belote.rebeloteDeclared &&
      G.contract.preneur !== seat
    ) {
      const id = (G.belote.kingPlayed ? "Q" : "K") + atout;
      if (!G.seen.has(id) && !mine.has(id)) pinned[id] = G.contract.preneur;
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
  // tombé sans annonce : non. Sinon, le preneur (imaginé) la tient-il ?
  function worldBelote(seat, world) {
    const { atout, preneur } = G.contract;
    if (G.belote.beloteDeclared) return true;
    if (G.seen.has("K" + atout) || G.seen.has("Q" + atout)) return false;
    return hasBelote(preneur === seat ? G.hands[seat] : world[preneur], atout);
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
    sim.seen.add(carte.id);
    if (sim.pliCourant.length < 4) return suivant(seat);
    const winner = trickWinnerSeat(sim.pliCourant, sim.contract.atout);
    sim.plisJoues++;
    sim.pointsPlis[teamOf(winner)] +=
      trickPoints(sim.pliCourant, sim.contract.atout) +
      (sim.plisJoues === 8 ? 10 : 0);
    sim.plisGagnes[teamOf(winner)]++;
    sim.pliCourant = [];
    return winner;
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
      seen: new Set(real.seen),
      void: real.void.map((v) => ({ ...v })),
      appel: real.appel.map((v) => ({ ...v })),
      refus: real.refus.map((v) => ({ ...v })),
      trumpMax: real.trumpMax.slice(),
      pointsPlis: real.pointsPlis.slice(),
      plisGagnes: real.plisGagnes.slice(),
    };
    const bel = worldBelote(seat, world);
    G = sim;
    try {
      let next = card ? simPlay(sim, seat, card) : suivant(real.donneur);
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
  function donneValue(c, pointsPlis, plisGagnes, bel, multiplicateur, team) {
    const reussi = contratReussi(c, pointsPlis, plisGagnes, bel);
    const gain = (reussi ? c.montant : 160) * multiplicateur;
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
  function exactEnd(sim, first, bel, team) {
    const { atout } = sim.contract;
    const h = sim.hands.map((x) => x.slice());
    const pts = sim.pointsPlis.slice();
    const tricks = sim.plisGagnes.slice();
    const pli = sim.pliCourant.slice();
    let done = sim.plisJoues;
    function rec(seat, alpha, beta) {
      if (done === 8)
        return donneValue(
          sim.contract,
          pts,
          tricks,
          bel,
          sim.multiplicateur,
          team,
        );
      const hand = h[seat];
      const max = teamOf(seat) === team;
      let v = max ? -Infinity : Infinity;
      for (const card of computeLegal(hand, pli, atout, seat)) {
        const i = hand.indexOf(card);
        hand.splice(i, 1);
        pli.push({ siege: seat, carte: card });
        let r;
        if (pli.length < 4) r = rec(suivant(seat), alpha, beta);
        else {
          const full = pli.splice(0, 4);
          const win = trickWinnerSeat(full, atout);
          const p = trickPoints(full, atout) + (done === 7 ? 10 : 0);
          pts[teamOf(win)] += p;
          tricks[teamOf(win)]++;
          done++;
          r = rec(win, alpha, beta);
          done--;
          tricks[teamOf(win)]--;
          pts[teamOf(win)] -= p;
          pli.push(...full);
        }
        pli.pop();
        hand.splice(i, 0, card);
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
    );
  }

  // Monde par monde, toutes les cartes sur les mêmes mondes : au-delà du
  // budget de réflexion (téléphone lent), on s'arrête avec les mondes déjà vus.
  function mcChooseCard(seat, legal, reflex) {
    const worlds = mcWorlds(seat, MC_SAMPLES);
    if (!worlds.length) return reflex;
    const cards = [reflex, ...legal.filter((c) => c.id !== reflex.id)];
    const totals = cards.map(() => 0);
    const stop = Date.now() + MC_BUDGET_MS;
    for (const w of worlds) {
      cards.forEach((c, i) => {
        totals[i] += mcValue(seat, c, w);
      });
      if (Date.now() > stop) break;
    }
    let best = 0;
    totals.forEach((t, i) => {
      if (t > totals[best] + 1e-9) best = i;
    });
    return cards[best];
  }

  // Chances de réussite d'un contrat avant la première carte : la donne est
  // jouée en entier (réflexes) sur des mondes compatibles avec les enchères.
  const BID_SAMPLES = 24;
  const BID_BUDGET_MS = 150;
  function makeProbability(seat, contract) {
    if (Date.now() >= bidDeadline) return null;
    const saved = G.contract;
    G.contract = contract;
    try {
      const stop = Math.min(Date.now() + BID_BUDGET_MS, bidDeadline);
      let ok = 0;
      let n = 0;
      for (const w of mcWorlds(seat, BID_SAMPLES)) {
        const { sim, bel } = playOut(seat, w, null);
        n++;
        if (contratReussi(contract, sim.pointsPlis, sim.plisGagnes, bel)) ok++;
        if (Date.now() > stop) break;
      }
      return n ? ok / n : null;
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
  // Dame d'atout du preneur sont joués — aucun bouton, aucune fenêtre à
  // guetter. Le bonus ne dépend que des cartes réellement en main, donc
  // l'automatiser ne triche pas : humain et bots sont logés à la même
  // enseigne, et un bot ne pouvait de toute façon jamais déclarer lui-même
  // avant ce changement.
  function declareBeloteIfNeeded(seat, carte) {
    if (
      !G.contract ||
      seat !== G.contract.preneur ||
      carte.suit !== G.contract.atout
    )
      return;
    if (carte.rank !== "K" && carte.rank !== "Q") return;
    if (G.belote.holder !== seat) return;
    if (carte.rank === "K") G.belote.kingPlayed = true;
    if (carte.rank === "Q") G.belote.queenPlayed = true;
    const count =
      (G.belote.kingPlayed ? 1 : 0) + (G.belote.queenPlayed ? 1 : 0);
    if (count === 1 && !G.belote.beloteDeclared) {
      G.belote.beloteDeclared = true;
      log(`${seatName(seat)} annonce Belote.`);
    } else if (
      count === 2 &&
      G.belote.beloteDeclared &&
      !G.belote.rebeloteDeclared
    ) {
      G.belote.rebeloteDeclared = true;
      log(`${seatName(seat)} annonce Rebelote.`);
    }
  }

  // Réussite d'un contrat (section 9 de REGLES_COINCHE.md). Générale
  // comprise : c'est un capot beloté, vérifié par le jeu réel.
  function contratReussi(contract, pointsPlis, plisGagnes, beloteValide) {
    const preneurs = contract.equipePreneur;
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
    );

    let gainPreneurs = 0;
    let gainDefense = 0;
    if (reussi) gainPreneurs = G.contract.montant * G.multiplicateur;
    else gainDefense = 160 * G.multiplicateur;

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
    });
    const contratLabel = G.contract.generale ? "Générale" : G.contract.montant;
    log(
      reussi
        ? `Contrat de ${contratLabel} ${SUIT_NAME[G.contract.atout]} réussi (${SEAT_POS[visualPos(G.contract.preneur)]}) : +${gainPreneurs} pour ${preneurs === teamOf(G.you) ? "votre équipe" : "l'adversaire"}.`
        : `Contrat de ${contratLabel} ${SUIT_NAME[G.contract.atout]} chuté : +${gainDefense} pour la défense.`,
    );

    G.phase = "SCORE";
    render();

    if (G.scores[0] >= 1010 || G.scores[1] >= 1010) {
      G.timers.scoreDisplay = setTimeout(() => {
        G.phase = "TERMINEE";
        render();
      }, 5000);
    } else {
      G.timers.scoreDisplay = setTimeout(startNewDonne, 5000);
    }
  }

  function applyAction(seat, action) {
    if (!G || G.phase === "TERMINEE") return;

    if (action.type === "PASSER") {
      if (G.phase !== "ENCHERES" || seat !== G.joueurActif) return;
      G.bidLog.push({
        seat,
        cur: G.contract && { ...G.contract },
        passes: G.passesConsecutives,
      });
      log(`${seatName(seat)} passe.`);
      G.passesConsecutives++;
      if (!G.contract) {
        if (G.passesConsecutives === 4) {
          log("Quatre passes : nouvelle donne.");
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
      render();
      return;
    }

    if (action.type === "ENCHERIR") {
      if (G.phase !== "ENCHERES" || seat !== G.joueurActif) return;
      const montant = action.montant;
      if (!ALLOWED_BIDS.includes(montant)) return;
      if (G.contract && montant <= G.contract.montant) return;
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
      log(`${seatName(seat)} enchérit ${montant} ${SUIT_NAME[action.atout]}.`);
      G.joueurActif = suivant(seat);
      startTurn();
      render();
      maybeBotsConsiderCoinche();
      return;
    }

    if (action.type === "COINCHER") {
      if (G.phase !== "ENCHERES" || !G.contract || G.contract.coinche) return;
      if (teamOf(seat) === G.contract.equipePreneur) return;
      G.contract.coinche = true;
      G.multiplicateur = 2;
      clearTurnTimers();
      G.phase = "SURCOINCHE";
      G.turnTotalDuration = SURCOINCHE_DURATION_MS;
      G.echeance = Date.now() + G.turnTotalDuration;
      log(`${seatName(seat)} coinche !`);
      flashGif("coinche");
      G.timers.turn = setTimeout(() => {
        if (G.phase === "SURCOINCHE") {
          log("Surcoinche non utilisée.");
          lockContractAndStartPlay();
        }
      }, SURCOINCHE_DURATION_MS);
      render();
      maybeBotsConsiderSurcoinche();
      return;
    }

    if (action.type === "SURCOINCHER") {
      if (G.phase !== "SURCOINCHE" || G.contract.surcoinche) return;
      if (teamOf(seat) !== G.contract.equipePreneur) return;
      G.contract.surcoinche = true;
      G.multiplicateur = 4;
      clearTurnTimers();
      log(`${seatName(seat)} surcoinche !`);
      flashGif("surcoinche");
      lockContractAndStartPlay();
      return;
    }

    if (action.type === "JOUER") {
      // Pli complet encore affiché : personne ne joue avant qu'il soit ramassé.
      if (G.phase !== "JEU" || seat !== G.joueurActif || G.resolvingTrick) return;
      const hand = G.hands[seat];
      const idx = hand.findIndex((c) => c.id === action.carte.id);
      if (idx === -1) return;
      const legal = computeLegal(hand, G.pliCourant, G.contract.atout, seat);
      if (!legal.some((c) => c.id === action.carte.id)) return;

      const fromRect = captureOrigin(seat, action.carte);
      const couleurDemandeeAvant = G.pliCourant.length
        ? G.pliCourant[0].carte.suit
        : null;
      clearTurnTimers();
      const carte = hand.splice(idx, 1)[0];
      noteTrumpObligations(seat, carte);
      G.pliCourant.push({ siege: seat, carte });
      G.playedBy[seat].push(carte);
      G.seen.add(carte.id);
      if (couleurDemandeeAvant && carte.suit !== couleurDemandeeAvant) {
        G.void[seat][couleurDemandeeAvant] = true;
        readDiscardSignal(seat, carte);
      }
      declareBeloteIfNeeded(seat, carte);

      if (G.pliCourant.length < 4) {
        G.joueurActif = suivant(seat);
        startTurn();
        flyPlayedCard(seat, carte, fromRect);
        return;
      }

      const winnerSeat = trickWinnerSeat(G.pliCourant, G.contract.atout);
      const team = teamOf(winnerSeat);
      let points = trickPoints(G.pliCourant, G.contract.atout);
      G.plisJoues++;
      const dernierPli = G.plisJoues === 8;
      if (dernierPli) points += 10;
      G.pointsPlis[team] += points;
      G.plisGagnes[team]++;
      log(`${seatName(winnerSeat)} remporte le pli (${points} pts).`);

      // Le pli complet reste affiché, carte gagnante mise en évidence, le
      // temps qu'on ait le temps de le voir, avant d'être « ramassé » avec
      // une petite animation. Il reste ensuite consultable via le bouton
      // « Voir le pli précédent ».
      G.lastTrick = { cards: G.pliCourant.slice(), winnerSeat };
      G.resolvingTrick = { winnerSeat, collecting: false };
      render();
      flyPlayedCard(seat, carte, fromRect);

      G.timers.collect = setTimeout(() => {
        G.resolvingTrick = { winnerSeat, collecting: true };
        render();
        G.timers.sweep = setTimeout(() => {
          G.pliCourant = [];
          G.resolvingTrick = null;
          if (dernierPli) {
            // Belote et rebelote sont déjà tranchées (annonce automatique
            // au moment où les cartes sont jouées) : le score peut être
            // calculé tout de suite, sans fenêtre à attendre.
            computeScore();
          } else {
            G.joueurActif = winnerSeat;
            startTurn();
          }
        }, TRICK_COLLECT_MS);
      }, TRICK_PAUSE_MS);
      return;
    }
  }

  function lockContractAndStartPlay() {
    const preneurHand = G.mainsInitiales[G.contract.preneur];
    const hasKing = preneurHand.some(
      (c) => c.suit === G.contract.atout && c.rank === "K",
    );
    const hasQueen = preneurHand.some(
      (c) => c.suit === G.contract.atout && c.rank === "Q",
    );
    G.belote.holder = hasKing && hasQueen ? G.contract.preneur : null;
    // Générale : la main initiale du preneur tenait les 8 cartes de
    // l'atout. Ce n'est pas un contrat à part — il se joue et se score
    // exactement comme le capot beloté qu'il est déjà (270) — seulement un
    // marqueur pour l'afficher et pour que la défense (qui n'a alors, par
    // construction, aucune carte de cette couleur) ne perde jamais à
    // coincher une main qu'elle ne peut mathématiquement pas prendre.
    G.contract.generale = contractIsGenerale(G.contract);
    log(
      `Contrat verrouillé : ${G.contract.generale ? "Générale" : G.contract.montant} ${SUIT_NAME[G.contract.atout]} par ${seatName(G.contract.preneur)}.`,
    );
    startPlayPhase();
  }

  function startPlayPhase() {
    G.phase = "JEU";
    G.joueurActif = suivant(G.donneur);
    startTurn();
    render();
  }

  function visualPos(seat) {
    return (seat - G.you + 4) % 4;
  }

  // ---- Rendu ---------------------------------------------------------

  function esc(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  function cardImg(card, extraClass, extraStyle) {
    return `<img class="card-img ${extraClass || ""}" style="${extraStyle || ""}" src="../assets/images/cards/${card.id}.png" alt="${esc(cardLabel(card))}" data-card="${card.id}">`;
  }

  function phaseLabel() {
    return (
      {
        ENCHERES: "Enchères",
        SURCOINCHE: "Surcoinche possible",
        JEU: "En jeu",
        SCORE: "Résultat de la donne",
        TERMINEE: "Partie terminée",
      }[G.phase] || G.phase
    );
  }

  // La table ovale (#live-table, déjà présente dans la page comme aperçu
  // statique) devient la vraie table de jeu : sièges, jeton donneur, pli
  // central et contrat s'affichent directement dessus.

  const COMPASS_LABEL = {
    north: "Nord",
    south: "Sud",
    east: "Est",
    west: "Ouest",
  };

  function seatCardBacks(seat) {
    const remaining = G.hands[seat].length;
    let imgs = "";
    for (let i = 0; i < remaining; i++) {
      imgs += `<img class="seat-card-back" src="../assets/images/cards/back.svg" alt="" style="z-index:${i}">`;
    }
    return `<span class="seat-cardrow" title="${remaining} carte${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}">${imgs}</span>`;
  }

  function renderLiveSeat(compass, seat) {
    const active =
      !G.resolvingTrick &&
      G.joueurActif === seat &&
      (G.phase === "ENCHERES" || G.phase === "JEU");
    const isPreneur = G.contract && G.contract.preneur === seat;
    const isDealer = G.donneur === seat;
    const showsBid =
      isPreneur &&
      (G.phase === "ENCHERES" || G.phase === "SURCOINCHE" || G.phase === "JEU");
    // Belote/rebelote s'annoncent automatiquement (déclareBeloteIfNeeded)
    // mais ça ne se voyait nulle part à l'écran, seulement dans le journal
    // interne : un vrai badge sous le siège du preneur, qui reste affiché
    // le temps de la donne, rend l'annonce visible pour tout le monde.
    const showsBelote =
      isPreneur &&
      (G.phase === "JEU" || G.phase === "SCORE") &&
      G.belote.beloteDeclared;
    const beloteLabel = G.belote.rebeloteDeclared
      ? "Belote · Rebelote"
      : "Belote";
    return `<span class="seat ${compass}${active ? " is-active" : ""}${isPreneur ? " is-preneur" : ""}">
      ${isDealer ? '<span class="dealer-chip" title="Donneur">D</span>' : ""}
      <span class="seat-name">${esc(seatName(seat))} <span class="seat-compass">(${COMPASS_LABEL[compass]})</span></span>
      ${showsBid ? `<span class="seat-bid">${SUIT_SYMBOL[G.contract.atout]} ${G.contract.generale ? "Générale" : G.contract.montant}${G.multiplicateur > 1 ? ` ×${G.multiplicateur}` : ""}</span>` : ""}
      ${showsBelote ? `<span class="seat-belote">${beloteLabel}</span>` : ""}
      ${seat === G.you ? "" : seatCardBacks(seat)}
    </span>`;
  }

  function renderLiveTrick() {
    // Le contrat s'affiche déjà sous le siège du dernier qui a annoncé
    // (badge .seat-bid) : pas besoin d'un doublon flottant au centre, qui
    // ne fait que grignoter la place du pli lui-même.
    let slots = "";
    for (let pos = 0; pos < 4; pos++) {
      const seat = (G.you + pos) % 4;
      const entry = G.pliCourant.find((e) => e.siege === seat);
      const collecting =
        G.resolvingTrick && G.resolvingTrick.collecting ? " is-collecting" : "";
      const winner =
        G.resolvingTrick && G.resolvingTrick.winnerSeat === seat
          ? " is-winner"
          : "";
      slots += `<div class="trick-slot pos-${pos}${collecting}${winner}" data-seat="${seat}">${entry ? cardImg(entry.carte) : ""}</div>`;
    }
    return `<div class="center-trick">${slots}</div>`;
  }

  // ---- Vol de carte main → table -----------------------------------------
  // Capture la position d'origine (votre carte cliquée, ou le siège du
  // joueur pour les autres) avant le rendu, puis anime l'image nouvellement
  // posée depuis cette origine jusqu'à sa place dans le pli (Web Animations
  // API, indépendant des animations CSS d'entrée/sortie).

  function captureOrigin(seat, carte) {
    if (seat === G.you) {
      const el = els.root?.querySelector(
        `.game-hand .card-img[data-card="${carte.id}"]`,
      );
      return el ? el.getBoundingClientRect() : null;
    }
    const compass = ["south", "east", "north", "west"][(seat - G.you + 4) % 4];
    const el = els.table?.querySelector(`.seat.${compass}`);
    return el ? el.getBoundingClientRect() : null;
  }

  function flyPlayedCard(seat, carte, fromRect) {
    if (!fromRect || !els.table) return;
    const slot = els.table.querySelector(`.trick-slot[data-seat="${seat}"]`);
    const img = slot?.querySelector("img");
    if (!img || !img.animate) return;
    const toRect = img.getBoundingClientRect();
    const dx =
      fromRect.left + fromRect.width / 2 - (toRect.left + toRect.width / 2);
    const dy =
      fromRect.top + fromRect.height / 2 - (toRect.top + toRect.height / 2);
    const scale = Math.max(
      0.35,
      Math.min(1.8, fromRect.width / (toRect.width || 1)),
    );
    img.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(-10deg)`,
          opacity: 0.85,
        },
        { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
      ],
      { duration: 380, easing: "cubic-bezier(.22,.8,.3,1)" },
    );
  }

  function renderLiveTable() {
    if (!els.table) return;
    els.table.innerHTML = `
      ${renderLiveSeat("north", (G.you + 2) % 4)}
      ${renderLiveSeat("west", (G.you + 3) % 4)}
      ${renderLiveSeat("east", (G.you + 1) % 4)}
      <div class="table-center is-live">${renderLiveTrick()}</div>
      ${renderLiveSeat("south", G.you)}
    `;
  }

  function renderTimerWrap() {
    if (G.resolvingTrick) return "";
    if (G.phase === "ENCHERES" || G.phase === "JEU") {
      const who =
        G.joueurActif === G.you
          ? "à vous de jouer"
          : `au tour de <b>${esc(seatName(G.joueurActif))}</b>`;
      return `<div class="turn-timer-wrap"><span class="turn-dot"></span><span>${who}</span><div class="turn-timer"><div class="turn-timer-fill" id="turn-timer-fill"></div></div></div>`;
    }
    if (G.phase === "SURCOINCHE") {
      return `<div class="turn-timer-wrap"><span class="turn-dot"></span><span>Surcoinche possible</span><div class="turn-timer"><div class="turn-timer-fill" id="turn-timer-fill"></div></div></div>`;
    }
    return "";
  }

  function activateTimerBar() {
    if (G.resolvingTrick || !G.echeance) return;
    if (G.phase !== "ENCHERES" && G.phase !== "JEU" && G.phase !== "SURCOINCHE")
      return;
    const fill = document.getElementById("turn-timer-fill");
    if (!fill) return;
    const total = G.turnTotalDuration || 15000;
    const remaining = Math.max(0, G.echeance - Date.now());
    const fraction = total ? remaining / total : 0;
    // transform plutôt que width : le navigateur anime la barre hors du fil
    // principal, elle ne saccade pas pendant qu'un bot réfléchit.
    fill.style.transition = "none";
    fill.style.transform = `scaleX(${fraction})`;
    fill.classList.toggle("is-warning", fraction < 0.45 && fraction >= 0.2);
    fill.classList.toggle("is-danger", fraction < 0.2);
    // Forcer un reflow pour que le navigateur reparte bien de cette largeur avant d'animer.
    void fill.offsetWidth;
    fill.style.transition = `transform ${remaining}ms linear, background .3s`;
    requestAnimationFrame(() => {
      fill.style.transform = "scaleX(0)";
    });

    clearTimer("timerWarn");
    clearTimer("timerDanger");
    const toWarning = Math.max(0, remaining - total * 0.45);
    const toDanger = Math.max(0, remaining - total * 0.2);
    G.timers.timerWarn = setTimeout(
      () =>
        document.getElementById("turn-timer-fill")?.classList.add("is-warning"),
      toWarning,
    );
    G.timers.timerDanger = setTimeout(() => {
      const f = document.getElementById("turn-timer-fill");
      if (f) {
        f.classList.remove("is-warning");
        f.classList.add("is-danger");
      }
    }, toDanger);
  }

  function bidReadout(value) {
    if (value === 250) return "Capot";
    if (value === 270) return "Capot Beloté";
    return String(value);
  }

  function renderBiddingPanel() {
    if (G.phase !== "ENCHERES" || G.joueurActif !== G.you) return "";
    const min = G.contract ? G.contract.montant : 0;
    const options = ALLOWED_BIDS.filter((b) => b > min);
    // Capot beloté sur la table : plus aucun palier, il ne reste qu'à passer.
    if (!options.length) {
      return `<div class="bidding-panel"><div class="bid-actions">
        <button type="button" class="button outline" data-action="passer">Passer</button>
      </div></div>`;
    }

    // Nouvelle fenêtre d'enchère (le plancher a changé) : on repart du bas du slider.
    if (els.bidPanelMin !== min) {
      els.bidPanelMin = min;
      els.selectedBidIndex = 0;
    }
    if (!els.selectedSuit) els.selectedSuit = SUITS[0];
    const index = Math.min(els.selectedBidIndex || 0, options.length - 1);
    const value = options[index];
    const fill =
      options.length > 1 ? (index / (options.length - 1)) * 100 : 100;

    return `<div class="bidding-panel">
      <div class="bid-suits">
        ${SUITS.map((s) => `<button type="button" class="bid-suit-swatch ${RED_SUITS.has(s) ? "red" : ""} ${s === els.selectedSuit ? "is-selected" : ""}" data-suit="${s}">${SUIT_SYMBOL[s]}</button>`).join("")}
      </div>
      <div class="bid-slider-wrap">
        <div class="bid-slider-readout"><b>${bidReadout(value)}</b></div>
        <input type="range" class="bid-amount-slider" style="--fill:${fill}%" min="0" max="${options.length - 1}" step="1" value="${index}" data-options="${options.join(",")}">
        <div class="bid-slider-scale"><span>${bidReadout(options[0])}</span><span>${bidReadout(options[options.length - 1])}</span></div>
      </div>
      <div class="bid-actions">
        <button type="button" class="button primary" data-action="encherir">Enchérir</button>
        <button type="button" class="button outline" data-action="passer">Passer</button>
      </div>
    </div>`;
  }

  function renderCoincheButton() {
    if (
      G.phase === "ENCHERES" &&
      G.contract &&
      !G.contract.coinche &&
      teamOf(G.you) !== G.contract.equipePreneur
    ) {
      return `<button type="button" class="button outline" data-action="coincher">Coincher</button>`;
    }
    if (
      G.phase === "SURCOINCHE" &&
      !G.contract.surcoinche &&
      teamOf(G.you) === G.contract.equipePreneur
    ) {
      return `<button type="button" class="button primary" data-action="surcoincher">Surcoincher</button>`;
    }
    return "";
  }

  function renderLastTrickButton() {
    if (!G.lastTrick) return "";
    // Bouton ancré à gauche de l'écran, à l'écart des contrôles centraux —
    // symétrique du bouton « Règles » qui vit lui à droite.
    return `<button type="button" class="last-trick-btn" data-action="toggle-last-trick" aria-expanded="${els.showLastTrick ? "true" : "false"}">${els.showLastTrick ? "Masquer" : "Voir"} le pli précédent</button>`;
  }

  function renderLastTrickPanel() {
    if (!els.showLastTrick || !G.lastTrick) return "";
    const bySeat = {};
    G.lastTrick.cards.forEach((e) => {
      bySeat[e.siege] = e.carte;
    });
    const order = [G.you, (G.you + 1) % 4, (G.you + 2) % 4, (G.you + 3) % 4];
    return `<div class="last-trick-panel">
      <span class="eyebrow">PLI PRÉCÉDENT</span>
      <div class="last-trick-cards">
        ${order
          .map(
            (
              seat,
            ) => `<div class="last-trick-card${seat === G.lastTrick.winnerSeat ? " is-winner" : ""}">
          ${cardImg(bySeat[seat])}
          <span>${esc(seatName(seat))}</span>
        </div>`,
          )
          .join("")}
      </div>
    </div>`;
  }

  function renderHistoryButton() {
    // Ancré en haut à gauche de la table (position:absolute sur
    // #live-table, cf. styles.css) — pendant du bouton « pli précédent »
    // qui vit en bas à gauche de l'écran.
    return `<button type="button" class="history-btn" data-action="toggle-history" aria-expanded="${els.showHistory ? "true" : "false"}">Score & historique</button>`;
  }

  function renderHistoryPanel() {
    if (!els.showHistory) return "";
    return `<div class="history-panel">
      <span class="eyebrow">SCORE ET HISTORIQUE</span>
      <div class="history-score">
        <div class="history-score-tile"><b>${G.scores[0]}</b><span>Équipe A</span></div>
        <div class="history-score-tile"><b>${G.scores[1]}</b><span>Équipe B</span></div>
      </div>
      ${
        G.history.length
          ? `<ul class="history-list">${G.history
              .map(
                (h) => `<li class="${h.reussi ? "ok" : "ko"}">
        <span class="history-donne">#${h.donne}</span>
        <span class="history-points">${h.pointsFaits} pts</span>
        <span class="history-contract">${h.generale ? "Générale" : bidReadout(h.montant)} ${SUIT_NAME[h.atout]}${h.multiplicateur > 1 ? ` ×${h.multiplicateur}` : ""} · ${esc(seatName(h.preneur))}</span>
      </li>`,
              )
              .join("")}</ul>`
          : `<p class="history-empty">Aucune donne terminée pour l'instant.</p>`
      }
    </div>`;
  }

  function renderHand() {
    const hand = G.hands[G.you].slice().sort((a, b) => {
      if (a.suit !== b.suit)
        return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
      return RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
    });
    const yourTurnToPlay =
      G.phase === "JEU" && G.joueurActif === G.you && !G.resolvingTrick;
    const legal =
      yourTurnToPlay && G.contract
        ? computeLegal(hand, G.pliCourant, G.contract.atout, G.you).map(
            (c) => c.id,
          )
        : [];
    // L'animation d'apparition ne doit jouer qu'une fois, à la distribution
    // de la donne — pas à chaque re-rendu (annonce d'un adversaire, etc.),
    // sinon les cartes semblent « clignoter » à tout bout de champ.
    const freshDeal = els.dealtDonneNumber !== G.donneNumero;
    els.dealtDonneNumber = G.donneNumero;
    return `<div class="game-hand">${hand
      .map((c, i) => {
        const isLegal = legal.includes(c.id);
        const clickable = yourTurnToPlay && isLegal;
        const cls = [
          clickable ? "is-legal" : yourTurnToPlay ? "is-illegal" : "",
          freshDeal ? "is-dealt" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const style = freshDeal ? `animation-delay:${i * 35}ms` : "";
        return cardImg(c, cls, style);
      })
      .join(
        "",
      )}${yourTurnToPlay ? '<span class="game-hand-prompt">À vous de jouer — choisissez une carte</span>' : ""}</div>`;
  }

  function renderScoreBanner() {
    if (G.phase !== "SCORE" || !G.dernierResultat) return "";
    const r = G.dernierResultat;
    return `<div class="score-banner ${r.reussi ? "ok" : "ko"}">
      <b>${r.reussi ? "Contrat réussi" : "Contrat chuté"}</b>
      <span>${r.generale ? "Générale" : r.montant} ${SUIT_NAME[r.atout]}${r.multiplicateur > 1 ? ` ×${r.multiplicateur}` : ""} — +${r.gain} points</span>
    </div>`;
  }

  function renderEndBanner() {
    if (G.phase !== "TERMINEE") return "";
    const youWin =
      (teamOf(G.you) === 0 ? G.scores[0] : G.scores[1]) >= 1010 &&
      G.scores[teamOf(G.you)] > G.scores[1 - teamOf(G.you)];
    return `<div class="score-banner ${youWin ? "ok" : "ko"}">
      <b>Partie terminée</b>
      <span>Équipe A ${G.scores[0]} — Équipe B ${G.scores[1]}</span>
      <button type="button" class="button primary" data-action="restart">Nouvelle partie</button>
    </div>`;
  }

  // Animation plein écran brève à la coinche et à la surcoinche : de courtes
  // vidéos muettes (dix fois plus légères que les GIF d'origine), chacune
  // téléchargée une seule fois. Rien en headless (pas de fetch) ni en
  // mouvement réduit.
  const FLASH_GIFS = {
    coinche: { src: "../assets/images/coinche/coinched.mp4", ms: 1600 },
    surcoinche: { src: "../assets/images/coinche/surcoinched.mp4", ms: 2900 },
  };
  const flashBlobs = {};
  function preloadFlashGifs() {
    if (typeof fetch !== "function") return; // simulateur headless
    Object.entries(FLASH_GIFS).forEach(([kind, { src }]) => {
      if (flashBlobs[kind]) return;
      flashBlobs[kind] = fetch(src)
        .then((r) => r.blob())
        .catch(() => null);
    });
  }
  function flashGif(kind) {
    preloadFlashGifs();
    if (
      !els.root ||
      !flashBlobs[kind] ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    flashBlobs[kind].then((blob) => {
      if (!blob) return;
      document.querySelector(".coinche-flash")?.remove();
      const url = URL.createObjectURL(blob);
      const overlay = document.createElement("div");
      overlay.className = "coinche-flash";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = `<video src="${url}" autoplay muted playsinline></video>`;
      document.body.append(overlay);
      setTimeout(() => overlay.classList.add("is-out"), FLASH_GIFS[kind].ms);
      setTimeout(() => {
        overlay.remove();
        URL.revokeObjectURL(url);
      }, FLASH_GIFS[kind].ms + 300);
    });
  }

  function render() {
    if (!els.root || !G) return;
    renderLiveTable();

    const yourTeam = teamOf(G.you);
    const tallyLive = G.contract && (G.phase === "JEU" || G.resolvingTrick);
    els.root.innerHTML = `
      <div class="game-panel-header">
        <div><span class="eyebrow green">DONNE #${G.donneNumero - 1} · ${esc(phaseLabel())}</span>
        <div class="scoreboard">
          <div class="score-tile ${yourTeam === 0 ? "you" : ""}"><b>${G.scores[0]}</b><span>Équipe A</span>${tallyLive ? `<small class="live-tally">+${G.pointsPlis[0]} cette donne</small>` : ""}</div>
          <div class="score-tile ${yourTeam === 1 ? "you" : ""}"><b>${G.scores[1]}</b><span>Équipe B</span>${tallyLive ? `<small class="live-tally">+${G.pointsPlis[1]} cette donne</small>` : ""}</div>
        </div></div>
        <button type="button" class="button outline" data-action="quit">Quitter la table</button>
      </div>
      ${renderTimerWrap()}
      ${renderScoreBanner()}
      ${renderEndBanner()}
      <div class="game-controls">
        ${renderBiddingPanel()}
        ${renderCoincheButton()}
      </div>
      ${renderLastTrickButton()}
      ${renderLastTrickPanel()}
      ${renderHistoryButton()}
      ${renderHistoryPanel()}
      ${renderHand()}
    `;
    activateTimerBar();
  }

  function bindEvents() {
    els.root.addEventListener("input", (event) => {
      const slider = event.target.closest(".bid-amount-slider");
      if (!slider) return;
      const options = slider.dataset.options.split(",").map(Number);
      const index = Number(slider.value);
      els.selectedBidIndex = index;
      const fill =
        options.length > 1 ? (index / (options.length - 1)) * 100 : 100;
      slider.style.setProperty("--fill", `${fill}%`);
      const readout = els.root.querySelector(".bid-slider-readout b");
      if (readout) readout.textContent = bidReadout(options[index]);
    });

    els.root.addEventListener("click", (event) => {
      const cardEl = event.target.closest(".card-img.is-legal");
      if (cardEl && G.phase === "JEU" && G.joueurActif === G.you) {
        const card = G.hands[G.you].find((c) => c.id === cardEl.dataset.card);
        if (card) applyAction(G.you, { type: "JOUER", carte: card });
        return;
      }

      const suitBtn = event.target.closest(".bid-suit-swatch");
      if (suitBtn) {
        els.selectedSuit = suitBtn.dataset.suit;
        render();
        return;
      }

      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const action = button.dataset.action;

      if (action === "encherir") {
        const slider = els.root.querySelector(".bid-amount-slider");
        const options = slider.dataset.options.split(",").map(Number);
        const montant = options[Number(slider.value)];
        const suit = els.selectedSuit || SUITS[0];
        applyAction(G.you, { type: "ENCHERIR", montant, atout: suit });
        els.selectedSuit = null;
        els.bidPanelMin = undefined;
      } else if (action === "passer") {
        applyAction(G.you, { type: "PASSER" });
      } else if (action === "coincher") {
        applyAction(G.you, { type: "COINCHER" });
      } else if (action === "surcoincher") {
        applyAction(G.you, { type: "SURCOINCHER" });
      } else if (action === "toggle-last-trick") {
        els.showLastTrick = !els.showLastTrick;
        render();
      } else if (action === "toggle-history") {
        els.showHistory = !els.showHistory;
        render();
      } else if (action === "restart") {
        G.scores = [0, 0];
        G.donneNumero = 1;
        G.history = [];
        startNewDonne();
      } else if (action === "quit") {
        stop();
      }
    });
  }

  function stop() {
    if (!G) return;
    [
      "turn",
      "bot",
      "timerWarn",
      "timerDanger",
      "scoreDisplay",
      "collect",
      "sweep",
    ].forEach(clearTimer);
    els.root.innerHTML = "";
    els.root.hidden = true;
    if (els.table) {
      els.table.innerHTML = els.tableDefaultHTML;
      els.table.classList.remove("is-live");
    }
    document.body.classList.remove("is-playing");
    G = null;
    if (onExit) onExit();
  }

  function start(seats, yourSeatIndex, exitCallback) {
    const root = document.querySelector("#game-view");
    const table = document.querySelector("#live-table");
    if (!root) return;
    els.root = root;
    els.table = table;
    preloadFlashGifs();
    if (table && els.tableDefaultHTML === undefined)
      els.tableDefaultHTML = table.innerHTML;
    els.selectedSuit = null;
    els.selectedBidIndex = 0;
    els.bidPanelMin = undefined;
    els.showLastTrick = false;
    els.showHistory = false;
    els.dealtDonneNumber = undefined;
    onExit = exitCallback;
    root.hidden = false;
    if (table) table.classList.add("is-live");
    document.body.classList.add("is-playing");

    G = {
      seats, // [{name,type}]
      you: yourSeatIndex,
      donneur: Math.floor(Math.random() * 4),
      donneNumero: 1,
      scores: [0, 0],
      history: [],
      timers: {},
      log: [],
      contractCounter: 0,
      // Personnalité tirée une fois par siège : agressivité (relève les
      // enchères plus tôt), bluff (probabilité d'annoncer au-delà de sa
      // force réelle) et appétit à coincher. Rend chaque robot un peu
      // différent et chaque partie moins prévisible.
      personalities: [0, 1, 2, 3].map(() => ({
        aggr: 0.75 + Math.random() * 0.6,
        bluff: Math.random() * 0.14,
        coincheAppetite: 0.7 + Math.random() * 0.7,
      })),
    };
    // Une seule fois : #game-view survit aux parties, des écouteurs
    // rajoutés à chaque partie traitaient chaque clic deux fois.
    if (!els.bound) {
      bindEvents();
      els.bound = true;
    }
    startNewDonne();
    (table || root).scrollIntoView({ behavior: "smooth", block: "start" });
  }

  window.SCEPICoincheGame = { start, isRunning: () => !!G };
})();
