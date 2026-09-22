// Moteur de coinche jouable en local, conforme au profil scepi-online-v1
// décrit dans REGLES_COINCHE.md. Tout tourne dans le navigateur : un seul
// siège est piloté par la personne devant l'écran, les autres par une IA
// qui applique les stratégies classiques de la coinche : un vrai système
// d'enchères (90 fort, soutien +20 Valet / +10 par As, capot par les
// clefs, coinche sur tenue d'atout) et les réflexes de jeu de la carte
// (tirer les atouts, encaisser ses maîtres, appels et refus, charger son
// partenaire, jeu d'usure, dix de der). Chaque robot a une « personnalité »
// tirée au hasard en début de partie (agressivité, goût du bluff, appétit
// à coincher) pour éviter un comportement parfaitement prévisible d'une
// partie à l'autre. Le jour où le vrai serveur WebSocket de TECHNIQUE.md
// §6 existera, cette IA sera remplacée par de vrais joueurs et
// applyAction() par des messages serveur, mais l'état et les règles
// ci-dessous resteront valables tels quels.

(function () {
  const SUITS = ['H', 'D', 'C', 'S'];
  const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUIT_SYMBOL = { H: '♥', D: '♦', C: '♣', S: '♠' };
  const SUIT_NAME = { H: 'Cœur', D: 'Carreau', C: 'Trèfle', S: 'Pique' };
  const RANK_NAME = { 7: '7', 8: '8', 9: '9', 10: '10', J: 'Valet', Q: 'Dame', K: 'Roi', A: 'As' };
  const RED_SUITS = new Set(['H', 'D']);

  const TRUMP_POINTS = { J: 20, 9: 14, A: 11, 10: 10, K: 4, Q: 3, 8: 0, 7: 0 };
  const PLAIN_POINTS = { A: 11, 10: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 };
  const TRUMP_FORCE = { J: 8, 9: 7, A: 6, 10: 5, K: 4, Q: 3, 8: 2, 7: 1 };
  const PLAIN_FORCE = { A: 8, 10: 7, K: 6, Q: 5, J: 4, 9: 3, 8: 2, 7: 1 };
  const ALLOWED_BIDS = [80, 90, 100, 110, 120, 130, 140, 150, 160, 250, 270];

  const TURN_DURATION_MS = 30000; // temps pour enchérir ou jouer une carte
  const SURCOINCHE_DURATION_MS = 10000;
  const TRICK_PAUSE_MS = 1100; // le pli reste affiché, carte gagnante en évidence
  const TRICK_COLLECT_MS = 550; // puis il est « ramassé » en animation

  const SEAT_POS = ['Sud', 'Ouest', 'Nord', 'Est']; // position visuelle : 0=vous(bas),1=droite,2=partenaire(haut),3=gauche

  function bidType(montant) {
    if (montant === 250) return 'CAPOT';
    if (montant === 270) return 'CAPOT_BELOTE';
    return 'NUMERIQUE';
  }

  function suivant(s) { return (s + 1) % 4; }
  function teamOf(s) { return s % 2; }

  function buildDeck() {
    const deck = [];
    for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank, id: rank + suit });
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
    const order = [suivant(donneur), suivant(suivant(donneur)), suivant(suivant(suivant(donneur))), donneur];
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
      if (winValue(entry.carte, atout, couleurDemandee) > winValue(best.carte, atout, couleurDemandee)) best = entry;
    }
    return best.siege;
  }

  function trickPoints(pli, atout) {
    return pli.reduce((sum, e) => sum + (e.carte.suit === atout ? TRUMP_POINTS[e.carte.rank] : PLAIN_POINTS[e.carte.rank]), 0);
  }

  function cardPoints(card, atout) {
    return card.suit === atout ? TRUMP_POINTS[card.rank] : PLAIN_POINTS[card.rank];
  }

  function forceOf(card, atout) {
    return card.suit === atout ? TRUMP_FORCE[card.rank] : PLAIN_FORCE[card.rank];
  }

  // cartesLegales(main, pli, atout, siège) — section 6 de REGLES_COINCHE.md.
  function computeLegal(main, pli, atout, siege) {
    if (!pli.length) return main.slice();
    const couleurDemandee = pli[0].carte.suit;
    const maitreSeat = trickWinnerSeat(pli, atout);
    const fournissables = main.filter((c) => c.suit === couleurDemandee);

    if (fournissables.length) {
      if (couleurDemandee === atout) {
        const maitreForce = TRUMP_FORCE[pli.find((e) => e.siege === maitreSeat).carte.rank];
        const superieures = fournissables.filter((c) => TRUMP_FORCE[c.rank] > maitreForce);
        if (superieures.length) return superieures;
      }
      return fournissables;
    }

    if (teamOf(maitreSeat) === teamOf(siege)) return main.slice();

    const atouts = main.filter((c) => c.suit === atout);
    if (!atouts.length) return main.slice();

    const maitreCarte = pli.find((e) => e.siege === maitreSeat).carte;
    if (maitreCarte.suit === atout) {
      const superieurs = atouts.filter((c) => TRUMP_FORCE[c.rank] > TRUMP_FORCE[maitreCarte.rank]);
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
    if (seat === G.you) return 'Vous';
    return G.seats[seat].name || (G.seats[seat].type === 'bot' ? 'Ordinateur' : `Siège ${seat}`);
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
    G.belote = { holder: null, kingPlayed: false, queenPlayed: false, beloteDeclared: false, rebeloteDeclared: false };
    G.resolvingTrick = null;
    G.lastTrick = null;
    // Mémoire de l'IA pour cette donne : cartes déjà vues (les siennes
    // exclues, pour compter ce qu'il reste ailleurs) et « manques » déduits
    // — un siège qui ne fournit pas une couleur demandée n'en a plus, ce qui
    // permet ensuite de ne pas mener un as dans une couleur où un adversaire
    // pourra couper, ou au contraire de savoir qu'une couleur est sûre.
    G.seen = new Set();
    G.void = [{}, {}, {}, {}];
    // Signaux de défausse : appel (petite carte sous un As, « rejoue-moi
    // cette couleur ») et refus (Roi/Dame d'une couleur faible, « n'y va
    // pas »). Lus depuis les cartes jouées, jamais depuis une main.
    G.appel = [{}, {}, {}, {}];
    G.refus = [{}, {}, {}, {}];
    // Historique des annonces de la donne (qui a annoncé quoi, à quel
    // palier) : la seule fenêtre qu'un bot a sur les mains des autres,
    // relue avec le système d'enchères des bots (voir botDecideBid).
    G.donneAnnonces = [];
    // Ce que chaque bot a déjà dit (soutien, second tour, reprise pour la
    // belote) et si chaque ligne a déjà « forcé » une enchère.
    G.bidMemo = [{}, {}, {}, {}];
    G.forced = [false, false];
    els.showLastTrick = false;
    clearTimer('collect');
    clearTimer('sweep');
    G.phase = 'ENCHERES';
    G.joueurActif = suivant(G.donneur);
    log(`Nouvelle donne (#${G.donneNumero - 1}). ${seatName(G.donneur)} donne.`);
    startTurn();
  }

  function clearTurnTimers() {
    ['turn', 'bot', 'timerWarn', 'timerDanger'].forEach(clearTimer);
  }

  function startTurn() {
    clearTurnTimers();
    const seat = G.joueurActif;
    G.turnTotalDuration = TURN_DURATION_MS;
    G.echeance = Date.now() + G.turnTotalDuration;
    G.timers.turn = setTimeout(() => onTurnTimeout(seat), TURN_DURATION_MS);
    if (G.seats[seat].type === 'bot') {
      G.timers.bot = setTimeout(() => botAct(seat), 600 + Math.random() * 900);
    }
    render();
  }

  function onTurnTimeout(seat) {
    if (G.joueurActif !== seat) return;
    if (G.phase === 'ENCHERES') {
      applyAction(seat, { type: 'PASSER' });
    } else if (G.phase === 'JEU') {
      const legal = computeLegal(G.hands[seat], G.pliCourant, G.contract.atout, seat);
      const carte = legal[Math.floor(Math.random() * legal.length)];
      applyAction(seat, { type: 'JOUER', carte });
    }
  }

  function botAct(seat) {
    if (G.joueurActif !== seat) return;
    if (G.phase === 'ENCHERES') {
      const decision = botDecideBid(seat);
      applyAction(seat, decision);
    } else if (G.phase === 'JEU') {
      const carte = botChooseCard(seat);
      applyAction(seat, { type: 'JOUER', carte });
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
  //   Soutien du partenaire : +20 Valet, +10 9 second, +10 par As hors atout
  //     (+10 si l'As est suivi du 10, dès 100), −10 si court à l'atout, +20
  //     belote (seul le preneur la marque, on relance donc pour le devenir),
  //     puis on retire un palier de prudence : un contrat chuté donne 160 à
  //     l'adversaire, 10 points de plus ne valent jamais ce risque.
  //   Capot quand les As annoncés (« clefs ») couvrent les fausses cartes
  //     de l'ouvreur.
  //   Compétition : intervenir si la main ou la ligne le vaut, « forcer » de
  //     10 une seule fois par ligne.
  //   Ces barèmes ont été calibrés en simulation (parties bots contre bots
  //     sur les mêmes donnes) : le système d'origine surenchérissait.
  //   Coinche : tenir l'atout (Valet ou 9 second) et un As, et compter plus
  //     de points de défense que le contrat n'en laisse ; contre un capot, un
  //     seul pli sûr suffit.
  //   Score : prudence quand on mène largement, risques quand l'adversaire
  //     est sur le point de sortir.

  const FAUSSES_PROMISES = { 90: 4, 110: 3, 120: 2, 130: 1 };

  function personality(seat) {
    return G.personalities[seat];
  }

  function partnerOf(seat) { return (seat + 2) % 4; }
  function suitCards(hand, suit) { return hand.filter((c) => c.suit === suit); }
  function holds(hand, suit, rank) { return hand.some((c) => c.suit === suit && c.rank === rank); }
  function hasBelote(hand, suit) { return holds(hand, suit, 'K') && holds(hand, suit, 'Q'); }
  function sideSuits(atout) { return SUITS.filter((s) => s !== atout); }
  function sideAces(hand, atout) { return sideSuits(atout).filter((s) => holds(hand, s, 'A')).length; }
  function sideAceTens(hand, atout) { return sideSuits(atout).filter((s) => holds(hand, s, 'A') && holds(hand, s, '10')).length; }
  function round10(n) { return Math.floor(n / 10) * 10; }

  // Fausses cartes : les cartes hors atout qui ne feront pas de pli
  // d'elles-mêmes, tout ce qui n'est pas en tête de séquence As-10-Roi.
  function fausses(hand, atout) {
    let f = 0;
    for (const s of sideSuits(atout)) {
      let maitres = 0;
      for (const r of ['A', '10', 'K']) {
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
    const V = holds(hand, suit, 'J');
    const N = holds(hand, suit, '9');
    const A = holds(hand, suit, 'A');
    const X = holds(hand, suit, '10');
    const bel = hasBelote(hand, suit);
    const aces = sideAces(hand, suit);
    if (V && N && n >= 3) {
      const f = fausses(hand, suit);
      if (f === 0) return n >= 5 ? (bel ? 270 : 250) : 160;
      return [0, 130, 120, 110][f] || 90;
    }
    if ((V || N) && (A || X) && n >= 4 && (aces >= 1 || n >= 5)) return 100;
    if (!V && !N && n >= 5 && bel && aces >= 1) return 100;
    const tenue = (V && n >= 3) || (N && A && n >= 3) || (A && X && n >= 4) || (V && bel) || (V && N);
    if (tenue && (aces >= 1 || n >= 4 || bel || light)) return 80;
    if (light && (V || (N && n >= 2)) && aces >= 1) return 80;
    return 0;
  }

  function bestOpening(hand, light) {
    let best = null;
    for (const atout of SUITS) {
      const montant = openingBid(hand, atout, light);
      const len = suitCards(hand, atout).length;
      if (montant && (!best || montant > best.montant || (montant === best.montant && len > best.len))) best = { montant, atout, len };
    }
    return best;
  }

  // Points de soutien que j'apporte à l'atout de mon partenaire.
  function supportPoints(hand, suit, partnerBid) {
    const n = suitCards(hand, suit).length;
    const V = holds(hand, suit, 'J');
    const N = holds(hand, suit, '9');
    const aces = sideAces(hand, suit);
    let pts = (V ? 20 : 0) + (N && n >= 2 ? 10 : 0);
    if (partnerBid <= 90) {
      if (n >= (partnerBid === 80 ? 2 : 1)) pts += 10 * aces;
      if (n === 0 || (partnerBid === 80 && n === 1)) pts -= 10;
      // 4 atouts sans maître + un As : l'atout adverse tombera au premier tour.
      if (partnerBid === 80 && n >= 4 && !V && !N && aces >= 1) pts = Math.max(pts, 20);
    } else if (V || N || partnerBid >= 110) {
      pts += 10 * (aces + sideAceTens(hand, suit));
    } else {
      pts += 10 * aces; // sur un 100 sans Valet ni 9 chez moi : les As, pas les 10
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
    return first && first.seat === seat && first.atout === suit ? first.montant : 0;
  }

  // Plus forte relance de ce siège sur une annonce de son partenaire.
  function raiseBy(seat, suit) {
    let best = 0;
    G.donneAnnonces.forEach((a, i) => {
      if (a.seat !== seat || a.atout !== suit) return;
      const prev = G.donneAnnonces.slice(0, i).reverse().find((b) => b.seat === partnerOf(seat) && b.atout === suit);
      if (prev) best = Math.max(best, a.montant - prev.montant);
    });
    return best;
  }

  // +1 : l'adversaire est sur le point de sortir, il faut prendre des
  // risques ; −1 : on mène de 200 points, aucun pari inutile.
  function scoreRisk(seat) {
    const mine = G.scores[teamOf(seat)];
    const theirs = G.scores[1 - teamOf(seat)];
    if (theirs >= 850 && theirs > mine) return 1;
    if (mine - theirs >= 200) return -1;
    return 0;
  }

  function botDecideBid(seat) {
    const PASS = { type: 'PASSER' };
    const hand = G.hands[seat];
    const p = personality(seat);
    const cur = G.contract;
    const team = teamOf(seat);
    const partner = partnerOf(seat);
    const memo = G.bidMemo[seat];
    const risk = scoreRisk(seat);
    const min = cur ? cur.montant + 10 : 80;
    if (cur && cur.montant >= 270) return PASS;
    const ours = !!cur && teamOf(cur.preneur) === team;
    const capotOnTable = !!cur && cur.montant >= 250;

    // Enchère valable à partir d'une valeur de main, null si trop basse.
    function offer(montant, atout) {
      if (montant >= 250) return !cur || montant > cur.montant ? { type: 'ENCHERIR', montant, atout } : null;
      const m = Math.min(160, round10(montant));
      return m >= min ? { type: 'ENCHERIR', montant: m, atout } : null;
    }
    // Forcer : 10 de plus que ce que la main vaut, une fois par ligne.
    function force(atout) {
      if (G.forced[team] || risk < 0 || !(risk > 0 || Math.random() < 0.3 * p.aggr)) return null;
      const o = offer(min, atout);
      if (o) G.forced[team] = true;
      return o;
    }

    const partnerBid = lastBidOf(partner);
    const myBid = lastBidOf(seat);

    // 1. Capot par les clefs : il faut une clef (un As) de plus que de
    // fausses cartes, les plis de l'un devant couvrir les défausses de
    // l'autre.
    if (partnerBid && risk >= 0) {
      const suit = partnerBid.atout;
      const capot = hasBelote(hand, suit) ? 270 : 250;
      const partnerFausses = FAUSSES_PROMISES[openingOf(partner, suit)];
      if (!memo.supported && partnerFausses && suitCards(hand, suit).length && sideAces(hand, suit) > partnerFausses) {
        const o = offer(capot, suit);
        if (o) { memo.supported = true; return o; }
      }
      const mine = myBid && myBid.atout === suit ? openingOf(seat, suit) : 0;
      if (FAUSSES_PROMISES[mine] && partnerBid.montant > mine && (partnerBid.montant - mine) / 10 > fausses(hand, suit)) {
        const o = offer(capot, suit);
        if (o) return o;
      }
    }

    // 2. Soutenir la couleur du partenaire (pas la mienne qu'il vient de
    // soutenir), ou lui proposer ma couleur si elle vaut plus.
    const mySuits = new Set(G.donneAnnonces.filter((a) => a.seat === seat).map((a) => a.atout));
    if (partnerBid && !memo.supported && !capotOnTable && !mySuits.has(partnerBid.atout)) {
      memo.supported = true;
      const suit = partnerBid.atout;
      const target = partnerBid.montant + supportPoints(hand, suit, partnerBid.montant) - 10; // palier de prudence
      const own = bestOpening(hand, false);
      if (own && own.atout !== suit && own.montant > target) {
        const o = offer(own.montant, own.atout);
        if (o) return o;
      }
      // Sur le point de sortir et l'adversaire se tait : annoncer le nécessaire.
      const opponentsSpoke = G.donneAnnonces.some((a) => teamOf(a.seat) !== team);
      const nearExit = !opponentsSpoke && G.scores[team] + partnerBid.montant >= 1010;
      if (target > partnerBid.montant && !nearExit) {
        const o = offer(target, suit) || (!ours && target + 10 >= min ? force(suit) : null);
        if (o) return o;
      }
    }

    // 3. L'adversaire est passé au-dessus de notre couleur : tenir tête une
    // fois en forçant de 10. (Redemander sa belote ou ses 10 seconds faisait
    // chuter plus de contrats qu'il n'en gagnait.)
    if (myBid && !memo.rebid && !ours && !capotOnTable) {
      memo.rebid = true;
      const teamBest = Math.max(...G.donneAnnonces.filter((a) => teamOf(a.seat) === team && a.atout === myBid.atout).map((a) => a.montant));
      const o = teamBest + 10 >= min ? force(myBid.atout) : null;
      if (o) return o;
    }

    // 4. Ma belote dans l'atout de mon partenaire preneur : elle ne compte
    // que pour le preneur, je reprends de 10 pour 20 points de belote.
    if (ours && cur.preneur === partner && cur.type === 'NUMERIQUE' && hasBelote(hand, cur.atout) && !memo.beloteRetake) {
      memo.beloteRetake = true;
      const o = offer(cur.montant + 10, cur.atout);
      if (o) return o;
    }

    // 5. Ouvrir, ou intervenir au-dessus de l'adversaire.
    if (!ours && !capotOnTable) {
      const light = (!cur && G.passesConsecutives === 3) || (risk > 0 && Math.random() < 0.5) || Math.random() < p.bluff;
      const own = bestOpening(hand, light);
      if (own) {
        const o = offer(own.montant, own.atout) || (cur && own.montant + 10 >= min ? force(own.atout) : null);
        if (o) return o;
      }
    }
    return PASS;
  }

  // Plis de défense quasi sûrs : Valet d'atout, 9 second, une longueur de
  // 4 atouts que le preneur ne pourra pas tout faire tomber, les As (et le
  // 10 derrière l'As), une coupe tant qu'on garde de l'atout. L'As
  // troisième d'atout ne compte pas : il tombe souvent sous le Valet ou le 9.
  function defenseTricks(hand, atout) {
    const n = suitCards(hand, atout).length;
    let t = (holds(hand, atout, 'J') ? 1 : 0) + (holds(hand, atout, '9') && n >= 2 ? 1 : 0) + (n >= 4 ? 1 : 0);
    for (const s of sideSuits(atout)) {
      const k = suitCards(hand, s).length;
      if (holds(hand, s, 'A')) t += holds(hand, s, '10') ? 1.6 : 1;
      else if (holds(hand, s, '10') && k >= 3) t += 0.3;
      if (k === 0 && n >= 2) t += 0.5;
    }
    return t;
  }

  function botWantsToCoinche(seat) {
    const contract = G.contract;
    if (!contract || teamOf(seat) === contract.equipePreneur) return false;
    const p = personality(seat);
    const hand = G.hands[seat];
    const atout = contract.atout;
    const tenue = holds(hand, atout, 'J') || (holds(hand, atout, '9') && suitCards(hand, atout).length >= 2);
    if (contract.type !== 'NUMERIQUE') {
      // Contre un capot, il suffit d'être sûr de prendre la main une fois.
      return tenue || (sideAces(hand, atout) >= 2 && Math.random() < 0.5 * p.coincheAppetite);
    }
    // Jusqu'à 130, pas de coinche sans tenir l'atout et un As à côté.
    if (contract.montant <= 130 && !(tenue && sideAces(hand, atout) >= 1)) return false;
    // Une belote peut traîner chez le preneur, sauf si on en tient une carte.
    const beloteRisk = holds(hand, atout, 'K') || holds(hand, atout, 'Q') ? 0 : 10;
    const needed = 162 - (contract.montant === 80 ? 82 : contract.montant) + 1 + beloteRisk;
    const partnerPts = lastBidOf(partnerOf(seat)) ? 30 : 12;
    const expected = 22 * defenseTricks(hand, atout) + partnerPts;
    const margin = (18 - 8 * scoreRisk(seat)) / p.coincheAppetite + (Math.random() - 0.5) * 10;
    return expected >= needed + margin;
  }

  function botWantsToSurcoinche(seat) {
    const contract = G.contract;
    if (!contract || teamOf(seat) !== contract.equipePreneur) return false;
    // Une chute coinchée les ferait sortir de toute façon : on surcoinche par principe.
    if (G.scores[1 - teamOf(seat)] + 320 >= 1010) return true;
    if (contract.type !== 'NUMERIQUE') return false;
    const hand = G.hands[seat];
    const atout = contract.atout;
    return holds(hand, atout, 'J') && holds(hand, atout, '9') && suitCards(hand, atout).length >= 4
      && sideAces(hand, atout) >= 2 && Math.random() < 0.8 * personality(seat).aggr;
  }

  function maybeBotsConsiderCoinche() {
    if (G.phase !== 'ENCHERES' || !G.contract || G.contract.coinche) return;
    const contractId = G.contract.id;
    [0, 1, 2, 3].forEach((seat) => {
      if (teamOf(seat) === G.contract.equipePreneur || G.seats[seat].type !== 'bot') return;
      setTimeout(() => {
        if (!G || G.phase !== 'ENCHERES' || !G.contract || G.contract.id !== contractId || G.contract.coinche) return;
        if (botWantsToCoinche(seat)) applyAction(seat, { type: 'COINCHER' });
      }, 700 + Math.random() * 2200);
    });
  }

  function maybeBotsConsiderSurcoinche() {
    if (G.phase !== 'SURCOINCHE' || !G.contract) return;
    const contractId = G.contract.id;
    [0, 1, 2, 3].forEach((seat) => {
      if (teamOf(seat) !== G.contract.equipePreneur || G.seats[seat].type !== 'bot') return;
      setTimeout(() => {
        if (!G || G.phase !== 'SURCOINCHE' || !G.contract || G.contract.id !== contractId || G.contract.surcoinche) return;
        if (botWantsToSurcoinche(seat)) applyAction(seat, { type: 'SURCOINCHER' });
      }, 400 + Math.random() * 3200);
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
  //   - belote : la Dame d'abord avec un nombre impair d'atouts, le Roi sinon
  // Défense :
  //   - jamais d'atout en entame
  //   - répondre à l'appel du partenaire, jouer la couleur qu'il a annoncée
  //   - le faire couper, encaisser ses As avant qu'ils ne soient coupés
  //   - avec 4 atouts, faire couper le preneur (jeu d'usure)
  //   - entamer un singleton pour couper ensuite
  // Pendant le pli :
  //   - partenaire maître pour de bon : charger (le 10 sous son As, un 10
  //     menacé) ; pli incertain : ne rien donner, ou l'assurer d'un maître
  //   - petit en second, gagner au plus juste en dernier, couper petit
  //   - défausse : appel (petite carte sous un As), refus (Roi/Dame d'une
  //     couleur faible), garder la garde du 10, se raccourcir pour couper
  //   - garder l'atout maître pour le dix de der
  //   - capot : tout gagner ; contre un capot (ou un 150+), prendre un pli

  // Sièges qui n'ont pas encore joué dans le pli en cours, hors nous-même.
  function seatsStillToAct(pli, seat) {
    const played = new Set(pli.map((e) => e.siege));
    return [0, 1, 2, 3].filter((s) => s !== seat && !played.has(s));
  }

  // Cartes de cette couleur encore cachées : ni jouées, ni dans ma main.
  function outCards(hand, suit) {
    return RANKS.map((r) => r + suit).filter((id) => !G.seen.has(id) && !hand.some((c) => c.id === id));
  }

  // Reste-t-il dehors une carte plus forte dans la couleur ? Sinon la
  // carte est maîtresse : un vrai décompte, pas une supposition.
  function higherOut(hand, card, atout) {
    const table = card.suit === atout ? TRUMP_FORCE : PLAIN_FORCE;
    return outCards(hand, card.suit).some((id) => table[id.slice(0, -1)] > table[card.rank]);
  }

  // L'issue du contrat est-elle déjà jouée (réussi quoi qu'il arrive, ou
  // irrattrapable) ? Les points restants ne changent alors plus rien.
  function contractOutcomeLocked() {
    const preneurTeam = G.contract.equipePreneur;
    if (G.contract.type !== 'NUMERIQUE') return G.plisGagnes[1 - preneurTeam] > 0;
    const seuil = G.contract.montant === 80 ? 82 : G.contract.montant;
    const pointsRestants = 162 - G.pointsPlis[0] - G.pointsPlis[1];
    return G.pointsPlis[preneurTeam] >= seuil || G.pointsPlis[preneurTeam] + pointsRestants < seuil;
  }

  function byValue(atout) {
    return (a, b) => cardPoints(a, atout) - cardPoints(b, atout) || forceOf(a, atout) - forceOf(b, atout);
  }
  function lowest(cards, atout) { return cards.slice().sort(byValue(atout))[0]; }
  function highest(cards, atout) { return cards.slice().sort(byValue(atout)).pop(); }
  function weakest(cards, atout) { return cards.slice().sort((a, b) => forceOf(a, atout) - forceOf(b, atout))[0]; }
  function strongest(cards, atout) { return cards.slice().sort((a, b) => forceOf(a, atout) - forceOf(b, atout)).pop(); }

  function playContext(seat) {
    const hand = G.hands[seat];
    const atout = G.contract.atout;
    const team = teamOf(seat);
    const opponents = [0, 1, 2, 3].filter((s) => teamOf(s) !== team);
    return {
      seat, hand, atout, team, opponents,
      partner: partnerOf(seat),
      legal: computeLegal(hand, G.pliCourant, atout, seat),
      attack: team === G.contract.equipePreneur,
      amPreneur: seat === G.contract.preneur,
      capot: G.contract.type !== 'NUMERIQUE',
      oppTrumps: outCards(hand, atout).length > 0 && opponents.some((o) => !G.void[o][atout]),
      tricksLeft: 8 - G.plisJoues,
    };
  }

  // Un adversaire peut-il couper cette couleur ? Manque constaté, ou au
  // plus une carte de la couleur encore dehors.
  function oppCanRuff(ctx, suit) {
    if (suit === ctx.atout || !ctx.oppTrumps) return false;
    const fewLeft = outCards(ctx.hand, suit).length <= 1;
    return ctx.opponents.some((o) => !G.void[o][ctx.atout] && (G.void[o][suit] || fewLeft));
  }

  function safeMaster(ctx, card) {
    return !higherOut(ctx.hand, card, ctx.atout) && !oppCanRuff(ctx, card.suit);
  }

  // Cet adversaire, qui joue après moi, peut-il battre cette carte ?
  function canBeat(ctx, opp, card, lead) {
    const { hand, atout } = ctx;
    const trumpsLeft = !G.void[opp][atout] && outCards(hand, atout).length > 0;
    if (card.suit === atout) return trumpsLeft && higherOut(hand, card, atout);
    if (!G.void[opp][lead] && outCards(hand, lead).length > 0) return higherOut(hand, card, atout);
    return trumpsLeft;
  }

  // Le partenaire a-t-il montré le Valet d'atout, encore dehors ?
  // Ouverture 90 ou 110+ (Valet + 9), ou relance d'au moins 20.
  function partnerShowsJack(ctx) {
    const jack = 'J' + ctx.atout;
    if (G.seen.has(jack) || ctx.hand.some((c) => c.id === jack)) return false;
    const o = openingOf(ctx.partner, ctx.atout);
    return o === 90 || o >= 110 || raiseBy(ctx.partner, ctx.atout) >= 20;
  }

  // Couleur appelée par le partenaire, tant que son As n'est pas tombé.
  function calledSuit(ctx) {
    return sideSuits(ctx.atout).find((s) => G.appel[ctx.partner][s] && !G.seen.has('A' + s) && ctx.legal.some((c) => c.suit === s)) || null;
  }

  // Appel : une petite carte d'une couleur dont on tient l'As, une fois par donne.
  function appelCard(ctx, cards) {
    if (Object.keys(G.appel[ctx.seat]).length) return null;
    const card = cards.find((c) => cardPoints(c, ctx.atout) === 0 && holds(ctx.hand, c.suit, 'A') && suitCards(ctx.hand, c.suit).length >= 2);
    if (card) G.appel[ctx.seat][card.suit] = true;
    return card || null;
  }

  // Les bots lisent les défausses d'un humain avec la même convention :
  // première défausse petite = appel, Roi/Dame/Valet = refus.
  function readDiscardSignal(seat, carte) {
    if (carte.suit === G.contract.atout || Object.keys(G.appel[seat]).length || Object.keys(G.refus[seat]).length) return;
    if (['7', '8', '9'].includes(carte.rank)) G.appel[seat][carte.suit] = true;
    else if (['K', 'Q', 'J'].includes(carte.rank)) G.refus[seat][carte.suit] = true;
  }

  function leadCard(ctx) {
    const { hand, atout, legal } = ctx;
    const trumps = legal.filter((c) => c.suit === atout);
    const side = legal.filter((c) => c.suit !== atout);

    // Dix de der : garder l'atout maître pour le dernier pli.
    if (legal.length === 2) {
      const sure = trumps.filter((c) => !higherOut(hand, c, atout));
      if (sure.length === 1) return legal.find((c) => c !== sure[0]);
    }

    if (ctx.attack) {
      if (ctx.oppTrumps && trumps.length) {
        const top = strongest(trumps, atout);
        if (!higherOut(hand, top, atout)) return top;
        const low = weakest(trumps, atout);
        if (partnerShowsJack(ctx)) return low;
        if (ctx.amPreneur && trumps.length >= 2) return low;
        if (!ctx.amPreneur && G.contract.preneur === ctx.partner && G.plisJoues < 2 && ['7', '8', 'Q'].includes(low.rank)) return low;
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
      if (called) return lowest(side.filter((c) => c.suit === called), atout);
      if (trumps.length >= 2 && G.plisJoues <= 4) {
        const single = side.find((c) => suitCards(hand, c.suit).length === 1 && cardPoints(c, atout) < 10);
        if (single) return single;
      }
      return defaultLead(ctx);
    }

    const called = calledSuit(ctx);
    if (called) return lowest(side.filter((c) => c.suit === called), atout);
    // Couleur annoncée par le partenaire aux enchères, pas encore jouée.
    const partnerSuit = G.donneAnnonces.filter((a) => a.seat === ctx.partner && a.atout !== atout).map((a) => a.atout).pop();
    if (partnerSuit && side.some((c) => c.suit === partnerSuit) && ![...G.seen].some((id) => id.endsWith(partnerSuit)) && !oppCanRuff(ctx, partnerSuit)) {
      const cards = side.filter((c) => c.suit === partnerSuit);
      return cards.find((c) => c.rank === 'A') || lowest(cards, atout);
    }
    const ruff = side.find((c) => G.void[ctx.partner][c.suit] && !G.void[ctx.partner][atout] && outCards(hand, atout).length > 0);
    if (ruff) return lowest(side.filter((c) => c.suit === ruff.suit), atout);
    const masters = side.filter((c) => safeMaster(ctx, c));
    if (masters.length) return highest(masters, atout);
    const nTrumps = suitCards(hand, atout).length;
    if (nTrumps >= 4) {
      const forcing = side.find((c) => G.void[G.contract.preneur][c.suit]);
      if (forcing) return lowest(side.filter((c) => c.suit === forcing.suit), atout);
    }
    if (nTrumps >= 1 && nTrumps <= 2 && G.plisJoues <= 2) {
      const single = side.find((c) => suitCards(hand, c.suit).length === 1 && cardPoints(c, atout) < 10);
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
      if (G.void[ctx.partner][suit] && !G.void[ctx.partner][atout]) score += ctx.attack ? -10 : 20;
      if (holds(hand, suit, 'A')) score -= 15; // ne pas jouer sous l'As
      if (n === 2 && holds(hand, suit, '10') && higherOut(hand, { suit, rank: '10' }, atout)) score -= 12; // garde du 10
      const low = lowest(suitCards(hand, suit), atout);
      if (higherOut(hand, low, atout)) score -= cardPoints(low, atout) * 2; // ne pas entamer un 10 (ou un Roi) qui tombera
      if (!best || score > best.score) best = { suit, score };
    }
    return lowest(side.filter((c) => c.suit === best.suit), atout);
  }

  function followCard(ctx) {
    const { atout, legal, seat } = ctx;
    const pli = G.pliCourant;
    const lead = pli[0].carte.suit;
    const winCard = pli.find((e) => e.siege === trickWinnerSeat(pli, atout)).carte;
    const partnerWins = teamOf(trickWinnerSeat(pli, atout)) === ctx.team;
    const pts = trickPoints(pli, atout);
    const after = seatsStillToAct(pli, seat);
    const oppAfter = after.filter((s) => teamOf(s) !== ctx.team);
    const beats = (c) => winValue(c, atout, lead) > winValue(winCard, atout, lead);
    const holdsUp = (c) => oppAfter.every((o) => !canBeat(ctx, o, c, lead));
    const winners = legal.filter(beats);
    const others = legal.filter((c) => !beats(c));
    const grab = ctx.capot || (!ctx.attack && G.contract.montant >= 150);

    if (partnerWins) {
      if (holdsUp(winCard)) return charge(ctx, lead, winCard);
      const secure = winners.filter(holdsUp);
      if (secure.length && (pts >= 10 || grab)) return weakest(secure, atout);
      return others.length ? discard(ctx, lead, others) : weakest(winners, atout);
    }
    if (!winners.length) return discard(ctx, lead, legal);
    if (!oppAfter.length) {
      const cheap = weakest(winners, atout);
      // Garder un As pour un pli qui vaudra davantage.
      if (!grab && others.length && cheap.rank === 'A' && cheap.suit !== atout && pts < 8 && ctx.tricksLeft > 2
        && !oppCanRuff(ctx, cheap.suit) && !contractOutcomeLocked()) return discard(ctx, lead, others);
      return cheap;
    }
    // Couper petit : garder ses gros atouts, même au risque d'une surcoupe.
    if (!grab && lead !== atout && winners.every((c) => c.suit === atout)) return weakest(winners, atout);
    const secure = winners.filter(holdsUp);
    if (secure.length) {
      const cheap = weakest(secure, atout);
      const low = legal.filter((c) => !secure.includes(c));
      // Petit en second : pli sans valeur, le partenaire joue encore.
      if (!grab && low.length && after.includes(ctx.partner) && pts < 10 && cheap.rank === 'A' && cheap.suit !== atout) return discard(ctx, lead, low);
      return cheap;
    }
    if (grab) return strongest(winners, atout);
    if (others.length && (after.includes(ctx.partner) || pts < 10)) return discard(ctx, lead, others);
    return weakest(winners, atout);
  }

  // Le partenaire tient le pli pour de bon : lui donner des points.
  function charge(ctx, lead, winCard) {
    const { hand, atout, legal } = ctx;
    if (legal.every((c) => c.suit === lead)) {
      if (lead !== atout) return highest(legal, atout); // le 10 sous l'As du partenaire
      const spare = legal.filter((c) => higherOut(hand, c, atout)); // jamais un atout maître
      return spare.length ? highest(spare, atout) : weakest(legal, atout);
    }
    const side = legal.filter((c) => c.suit !== atout);
    if (!side.length) return weakest(legal, atout);
    const tenAtRisk = side.find((c) => c.rank === '10' && higherOut(hand, c, atout));
    if (tenAtRisk) return tenAtRisk;
    const appel = appelCard(ctx, side);
    if (appel) return appel;
    const refus = side.filter((c) => (c.rank === 'K' || c.rank === 'Q') && !holds(hand, c.suit, 'A') && !holds(hand, c.suit, '10'));
    if (refus.length) {
      const card = highest(refus, atout);
      G.refus[ctx.seat][card.suit] = true;
      return card;
    }
    if (ctx.tricksLeft <= 2 || winCard.suit === atout && lead !== atout && ctx.tricksLeft <= 3) return highest(side, atout);
    return discard(ctx, lead, legal);
  }

  // Carte perdante : fournir ou sous-couper au plus bas ; défausse libre :
  // appel sinon la carte qui coûte le moins.
  function discard(ctx, lead, cards) {
    const { hand, atout } = ctx;
    if (cards.every((c) => c.suit === lead) || cards.every((c) => c.suit === atout)) return lowest(cards, atout);
    const side = cards.filter((c) => c.suit !== atout);
    if (!side.length) return lowest(cards, atout);
    const appel = appelCard(ctx, side);
    if (appel) return appel;
    const cost = (c) => {
      const n = suitCards(hand, c.suit).length;
      let v = cardPoints(c, atout) * 10 + n * 2;
      if (!higherOut(hand, c, atout)) v += 60; // un maître
      if (n === 2 && c.rank !== '10' && holds(hand, c.suit, '10') && higherOut(hand, { suit: c.suit, rank: '10' }, atout)) v += 40; // garde du 10
      return v;
    };
    return side.slice().sort((a, b) => cost(a) - cost(b))[0];
  }

  // Belote : Dame d'abord avec un nombre impair d'atouts, Roi sinon — le
  // partenaire en déduit la parité. Seulement si l'ordre ne change pas le pli.
  function beloteOrder(ctx, card) {
    if (!ctx.amPreneur || card.suit !== ctx.atout || (card.rank !== 'K' && card.rank !== 'Q')) return card;
    const other = ctx.legal.find((c) => c.suit === ctx.atout && c.rank === (card.rank === 'K' ? 'Q' : 'K'));
    if (!other) return card;
    const pli = G.pliCourant;
    if (pli.length) {
      const lead = pli[0].carte.suit;
      const w = pli.find((e) => e.siege === trickWinnerSeat(pli, ctx.atout)).carte;
      const wins = (c) => winValue(c, ctx.atout, lead) > winValue(w, ctx.atout, lead);
      if (wins(card) !== wins(other)) return card;
    }
    const first = suitCards(ctx.hand, ctx.atout).length % 2 ? 'Q' : 'K';
    return card.rank === first ? card : other;
  }

  function botChooseCard(seat) {
    const ctx = playContext(seat);
    if (ctx.legal.length === 1) return ctx.legal[0];
    const card = G.pliCourant.length ? followCard(ctx) : leadCard(ctx);
    return beloteOrder(ctx, card);
  }

  // Belote et rebelote sont annoncées automatiquement dès que le Roi et la
  // Dame d'atout du preneur sont joués — aucun bouton, aucune fenêtre à
  // guetter. Le bonus ne dépend que des cartes réellement en main, donc
  // l'automatiser ne triche pas : humain et bots sont logés à la même
  // enseigne, et un bot ne pouvait de toute façon jamais déclarer lui-même
  // avant ce changement.
  function declareBeloteIfNeeded(seat, carte) {
    if (!G.contract || seat !== G.contract.preneur || carte.suit !== G.contract.atout) return;
    if (carte.rank !== 'K' && carte.rank !== 'Q') return;
    if (G.belote.holder !== seat) return;
    if (carte.rank === 'K') G.belote.kingPlayed = true;
    if (carte.rank === 'Q') G.belote.queenPlayed = true;
    const count = (G.belote.kingPlayed ? 1 : 0) + (G.belote.queenPlayed ? 1 : 0);
    if (count === 1 && !G.belote.beloteDeclared) {
      G.belote.beloteDeclared = true;
      log(`${seatName(seat)} annonce Belote.`);
    } else if (count === 2 && G.belote.beloteDeclared && !G.belote.rebeloteDeclared) {
      G.belote.rebeloteDeclared = true;
      log(`${seatName(seat)} annonce Rebelote.`);
    }
  }

  function computeScore() {
    const preneurs = G.contract.equipePreneur;
    const defense = 1 - preneurs;
    const beloteValide = G.belote.beloteDeclared && G.belote.rebeloteDeclared;
    let reussi;
    if (G.contract.type === 'NUMERIQUE') {
      let seuil = G.contract.montant === 80 ? 82 : G.contract.montant;
      if (beloteValide) seuil = Math.max(81, seuil - 20);
      reussi = G.pointsPlis[preneurs] >= seuil;
    } else if (G.contract.type === 'CAPOT') {
      reussi = G.plisGagnes[preneurs] === 8;
    } else {
      reussi = G.plisGagnes[preneurs] === 8 && beloteValide;
    }

    let gainPreneurs = 0;
    let gainDefense = 0;
    if (reussi) gainPreneurs = G.contract.montant * G.multiplicateur;
    else gainDefense = 160 * G.multiplicateur;

    G.scores[preneurs] += gainPreneurs;
    G.scores[defense] += gainDefense;

    G.dernierResultat = {
      reussi, preneurs, gain: reussi ? gainPreneurs : gainDefense,
      montant: G.contract.montant, atout: G.contract.atout, multiplicateur: G.multiplicateur,
    };
    G.history.unshift({
      donne: G.donneNumero - 1, preneur: G.contract.preneur, reussi,
      gain: reussi ? gainPreneurs : gainDefense, pointsFaits: G.pointsPlis[preneurs],
      montant: G.contract.montant, atout: G.contract.atout, multiplicateur: G.multiplicateur,
    });
    log(reussi
      ? `Contrat de ${G.contract.montant} ${SUIT_NAME[G.contract.atout]} réussi (${SEAT_POS[visualPos(G.contract.preneur)]}) : +${gainPreneurs} pour ${preneurs === teamOf(G.you) ? 'votre équipe' : "l'adversaire"}.`
      : `Contrat de ${G.contract.montant} ${SUIT_NAME[G.contract.atout]} chuté : +${gainDefense} pour la défense.`);

    G.phase = 'SCORE';
    render();

    if (G.scores[0] >= 1010 || G.scores[1] >= 1010) {
      G.timers.scoreDisplay = setTimeout(() => { G.phase = 'TERMINEE'; render(); }, 5000);
    } else {
      G.timers.scoreDisplay = setTimeout(startNewDonne, 5000);
    }
  }

  function applyAction(seat, action) {
    if (!G || G.phase === 'TERMINEE') return;

    if (action.type === 'PASSER') {
      if (G.phase !== 'ENCHERES' || seat !== G.joueurActif) return;
      log(`${seatName(seat)} passe.`);
      G.passesConsecutives++;
      if (!G.contract) {
        if (G.passesConsecutives === 4) { log('Quatre passes : nouvelle donne.'); startNewDonne(); return; }
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

    if (action.type === 'ENCHERIR') {
      if (G.phase !== 'ENCHERES' || seat !== G.joueurActif) return;
      const montant = action.montant;
      if (!ALLOWED_BIDS.includes(montant)) return;
      if (G.contract && montant <= G.contract.montant) return;
      G.contractCounter = (G.contractCounter || 0) + 1;
      G.donneAnnonces.push({ seat, montant, atout: action.atout });
      G.contract = { id: G.contractCounter, type: bidType(montant), montant, atout: action.atout, preneur: seat, equipePreneur: teamOf(seat), coinche: false, surcoinche: false };
      G.passesConsecutives = 0;
      log(`${seatName(seat)} enchérit ${montant} ${SUIT_NAME[action.atout]}.`);
      G.joueurActif = suivant(seat);
      startTurn();
      render();
      maybeBotsConsiderCoinche();
      return;
    }

    if (action.type === 'COINCHER') {
      if (G.phase !== 'ENCHERES' || !G.contract || G.contract.coinche) return;
      if (teamOf(seat) === G.contract.equipePreneur) return;
      G.contract.coinche = true;
      G.multiplicateur = 2;
      clearTurnTimers();
      G.phase = 'SURCOINCHE';
      G.turnTotalDuration = SURCOINCHE_DURATION_MS;
      G.echeance = Date.now() + G.turnTotalDuration;
      log(`${seatName(seat)} coinche !`);
      G.timers.turn = setTimeout(() => {
        if (G.phase === 'SURCOINCHE') { log('Surcoinche non utilisée.'); startPlayPhase(); }
      }, SURCOINCHE_DURATION_MS);
      render();
      maybeBotsConsiderSurcoinche();
      return;
    }

    if (action.type === 'SURCOINCHER') {
      if (G.phase !== 'SURCOINCHE' || G.contract.surcoinche) return;
      if (teamOf(seat) !== G.contract.equipePreneur) return;
      G.contract.surcoinche = true;
      G.multiplicateur = 4;
      clearTurnTimers();
      log(`${seatName(seat)} surcoinche !`);
      startPlayPhase();
      return;
    }

    if (action.type === 'JOUER') {
      if (G.phase !== 'JEU' || seat !== G.joueurActif) return;
      const hand = G.hands[seat];
      const idx = hand.findIndex((c) => c.id === action.carte.id);
      if (idx === -1) return;
      const legal = computeLegal(hand, G.pliCourant, G.contract.atout, seat);
      if (!legal.some((c) => c.id === action.carte.id)) return;

      const fromRect = captureOrigin(seat, action.carte);
      const couleurDemandeeAvant = G.pliCourant.length ? G.pliCourant[0].carte.suit : null;
      clearTurnTimers();
      const carte = hand.splice(idx, 1)[0];
      G.pliCourant.push({ siege: seat, carte });
      G.seen.add(carte.id);
      if (couleurDemandeeAvant && carte.suit !== couleurDemandeeAvant) {
        G.void[seat][couleurDemandeeAvant] = true;
        if (G.seats[seat].type !== 'bot') readDiscardSignal(seat, carte);
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
    log(`Contrat verrouillé : ${G.contract.montant} ${SUIT_NAME[G.contract.atout]} par ${seatName(G.contract.preneur)}.`);
    const preneurHand = G.mainsInitiales[G.contract.preneur];
    const hasKing = preneurHand.some((c) => c.suit === G.contract.atout && c.rank === 'K');
    const hasQueen = preneurHand.some((c) => c.suit === G.contract.atout && c.rank === 'Q');
    G.belote.holder = hasKing && hasQueen ? G.contract.preneur : null;
    startPlayPhase();
  }

  function startPlayPhase() {
    G.phase = 'JEU';
    G.joueurActif = suivant(G.donneur);
    startTurn();
    render();
  }

  function visualPos(seat) {
    return (seat - G.you + 4) % 4;
  }

  // ---- Rendu ---------------------------------------------------------

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function cardImg(card, extraClass, extraStyle) {
    return `<img class="card-img ${extraClass || ''}" style="${extraStyle || ''}" src="../assets/images/cards/${card.id}.png" alt="${esc(cardLabel(card))}" data-card="${card.id}">`;
  }

  function phaseLabel() {
    return {
      ENCHERES: 'Enchères', SURCOINCHE: 'Surcoinche possible', JEU: 'En jeu',
      SCORE: 'Résultat de la donne', TERMINEE: 'Partie terminée',
    }[G.phase] || G.phase;
  }

  // La table ovale (#live-table, déjà présente dans la page comme aperçu
  // statique) devient la vraie table de jeu : sièges, jeton donneur, pli
  // central et contrat s'affichent directement dessus.

  const COMPASS_LABEL = { north: 'Nord', south: 'Sud', east: 'Est', west: 'Ouest' };

  function seatCardBacks(seat) {
    const remaining = G.hands[seat].length;
    let imgs = '';
    for (let i = 0; i < remaining; i++) {
      imgs += `<img class="seat-card-back" src="../assets/images/cards/back.svg" alt="" style="z-index:${i}">`;
    }
    return `<span class="seat-cardrow" title="${remaining} carte${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}">${imgs}</span>`;
  }

  function renderLiveSeat(compass, seat) {
    const active = !G.resolvingTrick && G.joueurActif === seat && (G.phase === 'ENCHERES' || G.phase === 'JEU');
    const isPreneur = G.contract && G.contract.preneur === seat;
    const isDealer = G.donneur === seat;
    const showsBid = isPreneur && (G.phase === 'ENCHERES' || G.phase === 'SURCOINCHE' || G.phase === 'JEU');
    return `<span class="seat ${compass}${active ? ' is-active' : ''}${isPreneur ? ' is-preneur' : ''}">
      ${isDealer ? '<span class="dealer-chip" title="Donneur">D</span>' : ''}
      <span class="seat-name">${esc(seatName(seat))} <span class="seat-compass">(${COMPASS_LABEL[compass]})</span></span>
      ${showsBid ? `<span class="seat-bid">${SUIT_SYMBOL[G.contract.atout]} ${G.contract.montant}${G.multiplicateur > 1 ? ` ×${G.multiplicateur}` : ''}</span>` : ''}
      ${seat === G.you ? '' : seatCardBacks(seat)}
    </span>`;
  }

  function renderLiveTrick() {
    // Le contrat s'affiche déjà sous le siège du dernier qui a annoncé
    // (badge .seat-bid) : pas besoin d'un doublon flottant au centre, qui
    // ne fait que grignoter la place du pli lui-même.
    let slots = '';
    for (let pos = 0; pos < 4; pos++) {
      const seat = (G.you + pos) % 4;
      const entry = G.pliCourant.find((e) => e.siege === seat);
      const collecting = G.resolvingTrick && G.resolvingTrick.collecting ? ' is-collecting' : '';
      const winner = G.resolvingTrick && G.resolvingTrick.winnerSeat === seat ? ' is-winner' : '';
      slots += `<div class="trick-slot pos-${pos}${collecting}${winner}" data-seat="${seat}">${entry ? cardImg(entry.carte) : ''}</div>`;
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
      const el = els.root?.querySelector(`.game-hand .card-img[data-card="${carte.id}"]`);
      return el ? el.getBoundingClientRect() : null;
    }
    const compass = ['south', 'east', 'north', 'west'][(seat - G.you + 4) % 4];
    const el = els.table?.querySelector(`.seat.${compass}`);
    return el ? el.getBoundingClientRect() : null;
  }

  function flyPlayedCard(seat, carte, fromRect) {
    if (!fromRect || !els.table) return;
    const slot = els.table.querySelector(`.trick-slot[data-seat="${seat}"]`);
    const img = slot?.querySelector('img');
    if (!img || !img.animate) return;
    const toRect = img.getBoundingClientRect();
    const dx = (fromRect.left + fromRect.width / 2) - (toRect.left + toRect.width / 2);
    const dy = (fromRect.top + fromRect.height / 2) - (toRect.top + toRect.height / 2);
    const scale = Math.max(0.35, Math.min(1.8, fromRect.width / (toRect.width || 1)));
    img.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(-10deg)`, opacity: 0.85 },
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: 380, easing: 'cubic-bezier(.22,.8,.3,1)' });
  }

  function renderLiveTable() {
    if (!els.table) return;
    els.table.innerHTML = `
      ${renderLiveSeat('north', (G.you + 2) % 4)}
      ${renderLiveSeat('west', (G.you + 3) % 4)}
      ${renderLiveSeat('east', (G.you + 1) % 4)}
      <div class="table-center is-live">${renderLiveTrick()}</div>
      ${renderLiveSeat('south', G.you)}
    `;
  }

  function renderTimerWrap() {
    if (G.resolvingTrick) return '';
    if (G.phase === 'ENCHERES' || G.phase === 'JEU') {
      const who = G.joueurActif === G.you ? 'à vous de jouer' : `au tour de <b>${esc(seatName(G.joueurActif))}</b>`;
      return `<div class="turn-timer-wrap"><span class="turn-dot"></span><span>${who}</span><div class="turn-timer"><div class="turn-timer-fill" id="turn-timer-fill"></div></div></div>`;
    }
    if (G.phase === 'SURCOINCHE') {
      return `<div class="turn-timer-wrap"><span class="turn-dot"></span><span>Surcoinche possible</span><div class="turn-timer"><div class="turn-timer-fill" id="turn-timer-fill"></div></div></div>`;
    }
    return '';
  }

  function activateTimerBar() {
    if (G.resolvingTrick || !G.echeance) return;
    if (G.phase !== 'ENCHERES' && G.phase !== 'JEU' && G.phase !== 'SURCOINCHE') return;
    const fill = document.getElementById('turn-timer-fill');
    if (!fill) return;
    const total = G.turnTotalDuration || 15000;
    const remaining = Math.max(0, G.echeance - Date.now());
    const fraction = total ? remaining / total : 0;
    fill.style.transition = 'none';
    fill.style.width = `${fraction * 100}%`;
    fill.classList.toggle('is-warning', fraction < 0.45 && fraction >= 0.2);
    fill.classList.toggle('is-danger', fraction < 0.2);
    // Forcer un reflow pour que le navigateur reparte bien de cette largeur avant d'animer.
    void fill.offsetWidth;
    fill.style.transition = `width ${remaining}ms linear`;
    requestAnimationFrame(() => { fill.style.width = '0%'; });

    clearTimer('timerWarn');
    clearTimer('timerDanger');
    const toWarning = Math.max(0, remaining - total * 0.45);
    const toDanger = Math.max(0, remaining - total * 0.2);
    G.timers.timerWarn = setTimeout(() => document.getElementById('turn-timer-fill')?.classList.add('is-warning'), toWarning);
    G.timers.timerDanger = setTimeout(() => {
      const f = document.getElementById('turn-timer-fill');
      if (f) { f.classList.remove('is-warning'); f.classList.add('is-danger'); }
    }, toDanger);
  }

  function bidReadout(value) {
    return value === 250 ? 'Capot' : value === 270 ? 'Capot Beloté' : String(value);
  }

  function renderBiddingPanel() {
    if (G.phase !== 'ENCHERES' || G.joueurActif !== G.you) return '';
    const min = G.contract ? G.contract.montant : 0;
    const options = ALLOWED_BIDS.filter((b) => b > min);

    // Nouvelle fenêtre d'enchère (le plancher a changé) : on repart du bas du slider.
    if (els.bidPanelMin !== min) {
      els.bidPanelMin = min;
      els.selectedBidIndex = 0;
    }
    if (!els.selectedSuit) els.selectedSuit = SUITS[0];
    const index = Math.min(els.selectedBidIndex || 0, options.length - 1);
    const value = options[index];
    const fill = options.length > 1 ? (index / (options.length - 1)) * 100 : 100;

    return `<div class="bidding-panel">
      <div class="bid-suits">
        ${SUITS.map((s) => `<button type="button" class="bid-suit-swatch ${RED_SUITS.has(s) ? 'red' : ''} ${s === els.selectedSuit ? 'is-selected' : ''}" data-suit="${s}">${SUIT_SYMBOL[s]}</button>`).join('')}
      </div>
      <div class="bid-slider-wrap">
        <div class="bid-slider-readout"><b>${bidReadout(value)}</b></div>
        <input type="range" class="bid-amount-slider" style="--fill:${fill}%" min="0" max="${options.length - 1}" step="1" value="${index}" data-options="${options.join(',')}">
        <div class="bid-slider-scale"><span>${bidReadout(options[0])}</span><span>${bidReadout(options[options.length - 1])}</span></div>
      </div>
      <div class="bid-actions">
        <button type="button" class="button primary" data-action="encherir">Enchérir</button>
        <button type="button" class="button outline" data-action="passer">Passer</button>
      </div>
    </div>`;
  }

  function renderCoincheButton() {
    if (G.phase === 'ENCHERES' && G.contract && !G.contract.coinche && teamOf(G.you) !== G.contract.equipePreneur) {
      return `<button type="button" class="button outline" data-action="coincher">Coincher</button>`;
    }
    if (G.phase === 'SURCOINCHE' && !G.contract.surcoinche && teamOf(G.you) === G.contract.equipePreneur) {
      return `<button type="button" class="button primary" data-action="surcoincher">Surcoincher</button>`;
    }
    return '';
  }

  function renderLastTrickButton() {
    if (!G.lastTrick) return '';
    // Bouton ancré à gauche de l'écran, à l'écart des contrôles centraux —
    // symétrique du bouton « Règles » qui vit lui à droite.
    return `<button type="button" class="last-trick-btn" data-action="toggle-last-trick" aria-expanded="${els.showLastTrick ? 'true' : 'false'}">${els.showLastTrick ? 'Masquer' : 'Voir'} le pli précédent</button>`;
  }

  function renderLastTrickPanel() {
    if (!els.showLastTrick || !G.lastTrick) return '';
    const bySeat = {};
    G.lastTrick.cards.forEach((e) => { bySeat[e.siege] = e.carte; });
    const order = [G.you, (G.you + 1) % 4, (G.you + 2) % 4, (G.you + 3) % 4];
    return `<div class="last-trick-panel">
      <span class="eyebrow">PLI PRÉCÉDENT</span>
      <div class="last-trick-cards">
        ${order.map((seat) => `<div class="last-trick-card${seat === G.lastTrick.winnerSeat ? ' is-winner' : ''}">
          ${cardImg(bySeat[seat])}
          <span>${esc(seatName(seat))}</span>
        </div>`).join('')}
      </div>
    </div>`;
  }

  function renderHistoryButton() {
    // Ancré en haut à gauche de la table (position:absolute sur
    // #live-table, cf. styles.css) — pendant du bouton « pli précédent »
    // qui vit en bas à gauche de l'écran.
    return `<button type="button" class="history-btn" data-action="toggle-history" aria-expanded="${els.showHistory ? 'true' : 'false'}">Score & historique</button>`;
  }

  function renderHistoryPanel() {
    if (!els.showHistory) return '';
    return `<div class="history-panel">
      <span class="eyebrow">SCORE ET HISTORIQUE</span>
      <div class="history-score">
        <div class="history-score-tile"><b>${G.scores[0]}</b><span>Équipe A</span></div>
        <div class="history-score-tile"><b>${G.scores[1]}</b><span>Équipe B</span></div>
      </div>
      ${G.history.length ? `<ul class="history-list">${G.history.map((h) => `<li class="${h.reussi ? 'ok' : 'ko'}">
        <span class="history-donne">#${h.donne}</span>
        <span class="history-points">${h.pointsFaits} pts</span>
        <span class="history-contract">${bidReadout(h.montant)} ${SUIT_NAME[h.atout]}${h.multiplicateur > 1 ? ` ×${h.multiplicateur}` : ''} · ${esc(seatName(h.preneur))}</span>
      </li>`).join('')}</ul>` : `<p class="history-empty">Aucune donne terminée pour l'instant.</p>`}
    </div>`;
  }

  function renderHand() {
    const hand = G.hands[G.you].slice().sort((a, b) => {
      if (a.suit !== b.suit) return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
      return RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
    });
    const yourTurnToPlay = G.phase === 'JEU' && G.joueurActif === G.you && !G.resolvingTrick;
    const legal = yourTurnToPlay && G.contract
      ? computeLegal(hand, G.pliCourant, G.contract.atout, G.you).map((c) => c.id)
      : [];
    // L'animation d'apparition ne doit jouer qu'une fois, à la distribution
    // de la donne — pas à chaque re-rendu (annonce d'un adversaire, etc.),
    // sinon les cartes semblent « clignoter » à tout bout de champ.
    const freshDeal = els.dealtDonneNumber !== G.donneNumero;
    els.dealtDonneNumber = G.donneNumero;
    return `<div class="game-hand">${hand.map((c, i) => {
      const isLegal = legal.includes(c.id);
      const clickable = yourTurnToPlay && isLegal;
      const cls = [clickable ? 'is-legal' : (yourTurnToPlay ? 'is-illegal' : ''), freshDeal ? 'is-dealt' : ''].filter(Boolean).join(' ');
      const style = freshDeal ? `animation-delay:${i * 35}ms` : '';
      return cardImg(c, cls, style);
    }).join('')}${yourTurnToPlay ? '<span class="game-hand-prompt">À vous de jouer — choisissez une carte</span>' : ''}</div>`;
  }

  function renderScoreBanner() {
    if (G.phase !== 'SCORE' || !G.dernierResultat) return '';
    const r = G.dernierResultat;
    return `<div class="score-banner ${r.reussi ? 'ok' : 'ko'}">
      <b>${r.reussi ? 'Contrat réussi' : 'Contrat chuté'}</b>
      <span>${r.montant} ${SUIT_NAME[r.atout]}${r.multiplicateur > 1 ? ` ×${r.multiplicateur}` : ''} — +${r.gain} points</span>
    </div>`;
  }

  function renderEndBanner() {
    if (G.phase !== 'TERMINEE') return '';
    const youWin = (teamOf(G.you) === 0 ? G.scores[0] : G.scores[1]) >= 1010 && G.scores[teamOf(G.you)] > G.scores[1 - teamOf(G.you)];
    return `<div class="score-banner ${youWin ? 'ok' : 'ko'}">
      <b>Partie terminée</b>
      <span>Équipe A ${G.scores[0]} — Équipe B ${G.scores[1]}</span>
      <button type="button" class="button primary" data-action="restart">Nouvelle partie</button>
    </div>`;
  }

  function render() {
    if (!els.root || !G) return;
    renderLiveTable();

    const yourTeam = teamOf(G.you);
    const tallyLive = G.contract && (G.phase === 'JEU' || G.resolvingTrick);
    els.root.innerHTML = `
      <div class="game-panel-header">
        <div><span class="eyebrow green">DONNE #${G.donneNumero - 1} · ${esc(phaseLabel())}</span>
        <div class="scoreboard">
          <div class="score-tile ${yourTeam === 0 ? 'you' : ''}"><b>${G.scores[0]}</b><span>Équipe A</span>${tallyLive ? `<small class="live-tally">+${G.pointsPlis[0]} cette donne</small>` : ''}</div>
          <div class="score-tile ${yourTeam === 1 ? 'you' : ''}"><b>${G.scores[1]}</b><span>Équipe B</span>${tallyLive ? `<small class="live-tally">+${G.pointsPlis[1]} cette donne</small>` : ''}</div>
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
    els.root.addEventListener('input', (event) => {
      const slider = event.target.closest('.bid-amount-slider');
      if (!slider) return;
      const options = slider.dataset.options.split(',').map(Number);
      const index = Number(slider.value);
      els.selectedBidIndex = index;
      const fill = options.length > 1 ? (index / (options.length - 1)) * 100 : 100;
      slider.style.setProperty('--fill', `${fill}%`);
      const readout = els.root.querySelector('.bid-slider-readout b');
      if (readout) readout.textContent = bidReadout(options[index]);
    });

    els.root.addEventListener('click', (event) => {
      const cardEl = event.target.closest('.card-img.is-legal');
      if (cardEl && G.phase === 'JEU' && G.joueurActif === G.you) {
        const card = G.hands[G.you].find((c) => c.id === cardEl.dataset.card);
        if (card) applyAction(G.you, { type: 'JOUER', carte: card });
        return;
      }

      const suitBtn = event.target.closest('.bid-suit-swatch');
      if (suitBtn) {
        els.selectedSuit = suitBtn.dataset.suit;
        render();
        return;
      }

      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const action = button.dataset.action;

      if (action === 'encherir') {
        const slider = els.root.querySelector('.bid-amount-slider');
        const options = slider.dataset.options.split(',').map(Number);
        const montant = options[Number(slider.value)];
        const suit = els.selectedSuit || SUITS[0];
        applyAction(G.you, { type: 'ENCHERIR', montant, atout: suit });
        els.selectedSuit = null;
        els.bidPanelMin = undefined;
      } else if (action === 'passer') {
        applyAction(G.you, { type: 'PASSER' });
      } else if (action === 'coincher') {
        applyAction(G.you, { type: 'COINCHER' });
      } else if (action === 'surcoincher') {
        applyAction(G.you, { type: 'SURCOINCHER' });
      } else if (action === 'toggle-last-trick') {
        els.showLastTrick = !els.showLastTrick;
        render();
      } else if (action === 'toggle-history') {
        els.showHistory = !els.showHistory;
        render();
      } else if (action === 'restart') {
        G.scores = [0, 0];
        G.donneNumero = 1;
        G.history = [];
        startNewDonne();
      } else if (action === 'quit') {
        stop();
      }
    });
  }

  function stop() {
    if (!G) return;
    ['turn', 'bot', 'timerWarn', 'timerDanger', 'scoreDisplay', 'collect', 'sweep'].forEach(clearTimer);
    els.root.innerHTML = '';
    els.root.hidden = true;
    if (els.table) { els.table.innerHTML = els.tableDefaultHTML; els.table.classList.remove('is-live'); }
    document.body.classList.remove('is-playing');
    G = null;
    if (onExit) onExit();
  }

  function start(seats, yourSeatIndex, exitCallback) {
    const root = document.querySelector('#game-view');
    const table = document.querySelector('#live-table');
    if (!root) return;
    els.root = root;
    els.table = table;
    if (table && els.tableDefaultHTML === undefined) els.tableDefaultHTML = table.innerHTML;
    els.selectedSuit = null;
    els.selectedBidIndex = 0;
    els.bidPanelMin = undefined;
    els.showLastTrick = false;
    els.showHistory = false;
    els.dealtDonneNumber = undefined;
    onExit = exitCallback;
    root.hidden = false;
    if (table) table.classList.add('is-live');
    document.body.classList.add('is-playing');

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
    bindEvents();
    startNewDonne();
    (table || root).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  window.SCEPICoincheGame = { start, isRunning: () => !!G };
})();
