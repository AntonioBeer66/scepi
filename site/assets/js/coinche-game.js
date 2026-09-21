// Moteur de coinche jouable en local, conforme au profil scepi-online-v1
// décrit dans REGLES_COINCHE.md. Tout tourne dans le navigateur : un seul
// siège est piloté par la personne devant l'écran, les autres par une IA
// qui vise un niveau correct : elle lit le soutien de son partenaire aux
// enchères, sait coincher/surcoincher, et joue ses cartes selon une vraie
// petite stratégie (entame aux as, affranchit l'atout, nourrit son
// partenaire maître, économise sinon). Chaque robot a une « personnalité »
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

  function suitStrength(hand, suit) {
    let score = 0;
    for (const c of hand) {
      score += c.suit === suit ? TRUMP_POINTS[c.rank] : Math.min(PLAIN_POINTS[c.rank], 4);
    }
    score += hand.filter((c) => c.suit === suit).length * 5;
    return score;
  }

  function bestSuitFor(hand) {
    let best = null;
    for (const suit of SUITS) {
      const score = suitStrength(hand, suit);
      if (!best || score > best.score) best = { suit, score };
    }
    return best;
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
    G.belote = { holder: null, kingPlayed: false, queenPlayed: false, beloteDeclared: false, rebeloteDeclared: false, windowBelote: false, windowRebelote: false };
    G.resolvingTrick = null;
    G.lastTrick = null;
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

  // ---- IA : enchères, coinche, surcoinche --------------------------------
  // Heuristique volontairement simple mais « joueuse » : estimation de la
  // force de main par couleur, prise en compte du soutien du partenaire
  // (sa dernière enchère laisse deviner qu'il tient des atouts), et un
  // grain de hasard par personnalité pour que deux parties ne se
  // ressemblent jamais tout à fait (bluffs occasionnels, enchères sautées
  // chez les profils agressifs, prudence chez les autres).

  function personality(seat) {
    return G.personalities[seat];
  }

  function botDecideBid(seat) {
    const hand = G.hands[seat];
    const p = personality(seat);
    const { suit, score } = bestSuitFor(hand);
    const current = G.contract;
    const noise = (Math.random() - 0.5) * 16; // incertitude psychologique
    const bluffing = Math.random() < p.bluff;

    if (!current) {
      const openThreshold = 74 / p.aggr - (bluffing ? 14 : 0) + noise;
      if (score < openThreshold) return { type: 'PASSER' };
      const trumpCount = hand.filter((c) => c.suit === suit).length;
      if (score >= 132 && trumpCount >= 5 && Math.random() < 0.35 * p.aggr) {
        log(`${seatName(seat)} sent le capot…`);
        return { type: 'ENCHERIR', montant: 250, atout: suit };
      }
      // Une main solide ose parfois sauter directement à 100/110 pour
      // impressionner la table plutôt que de monter palier par palier.
      let montant = 80;
      if (score >= 118 && Math.random() < 0.5 * p.aggr) montant = 100;
      else if (score >= 100 && Math.random() < 0.35 * p.aggr) montant = 90;
      return { type: 'ENCHERIR', montant, atout: suit };
    }

    const partnerIsPreneur = teamOf(current.preneur) === teamOf(seat);
    if (current.montant >= 270) return { type: 'PASSER' };

    if (partnerIsPreneur) {
      // Le partenaire a annoncé : on additionne sa force supposée (déduite
      // de son enchère) à la nôtre pour juger si on peut monter le contrat.
      const partnerEstimate = current.montant - 6;
      const combined = score + partnerEstimate * 0.55;
      const raiseThreshold = current.montant + 18 / p.aggr - noise;
      if (combined >= raiseThreshold && current.montant < 160 && suit === current.atout) {
        return { type: 'ENCHERIR', montant: current.montant + 10, atout: current.atout };
      }
      return { type: 'PASSER' };
    }

    // L'adversaire est preneur : ne reprendre la main que sur une vraie
    // belle couleur, sans quoi mieux vaut garder la carte de la coinche.
    const overcallThreshold = current.montant + 30 / p.aggr - (bluffing ? 10 : 0) - noise;
    if (score >= overcallThreshold && current.montant < 160) {
      return { type: 'ENCHERIR', montant: current.montant + 10, atout: suit };
    }
    return { type: 'PASSER' };
  }

  function botWantsToCoinche(seat) {
    const contract = G.contract;
    if (!contract || teamOf(seat) === contract.equipePreneur) return false;
    const p = personality(seat);
    const defense = suitStrength(G.hands[seat], contract.atout);
    const threshold = (58 + (contract.montant - 80) * 0.35) / p.coincheAppetite;
    if (defense < threshold) return false;
    return Math.random() < 0.55 * p.coincheAppetite;
  }

  function botWantsToSurcoinche(seat) {
    const contract = G.contract;
    if (!contract || teamOf(seat) !== contract.equipePreneur) return false;
    const p = personality(seat);
    const confidence = suitStrength(G.hands[seat], contract.atout);
    if (confidence < 78 / p.aggr) return false;
    return Math.random() < 0.6 * p.aggr;
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

  // ---- IA : choix de la carte jouée --------------------------------------
  // Mène ses as, affranchit son atout quand la main est longue, nourrit son
  // partenaire déjà maître du pli, gagne le moins cher possible sinon jette
  // sa carte la plus faible quand elle ne peut pas l'emporter.

  function botChooseCard(seat) {
    const hand = G.hands[seat];
    const atout = G.contract.atout;
    const pli = G.pliCourant;
    const legal = computeLegal(hand, pli, atout, seat);
    if (legal.length === 1) return legal[0];

    if (!pli.length) {
      const acesHorsAtout = legal.filter((c) => c.rank === 'A' && c.suit !== atout);
      if (acesHorsAtout.length) return acesHorsAtout[Math.floor(Math.random() * acesHorsAtout.length)];

      const trumps = legal.filter((c) => c.suit === atout);
      if (trumps.length >= 4) {
        return trumps.slice().sort((a, b) => TRUMP_FORCE[b.rank] - TRUMP_FORCE[a.rank])[0];
      }

      const bySuit = {};
      for (const c of hand) (bySuit[c.suit] = bySuit[c.suit] || []).push(c);
      const suitsPresentInLegal = new Set(legal.map((c) => c.suit));
      let shortestSuit = null;
      for (const suit of Object.keys(bySuit)) {
        if (suit === atout || !suitsPresentInLegal.has(suit)) continue;
        if (!shortestSuit || bySuit[suit].length < bySuit[shortestSuit].length) shortestSuit = suit;
      }
      const pool = shortestSuit ? legal.filter((c) => c.suit === shortestSuit) : legal;
      return pool.slice().sort((a, b) => cardPoints(a, atout) - cardPoints(b, atout))[0];
    }

    const couleurDemandee = pli[0].carte.suit;
    const maitreSeat = trickWinnerSeat(pli, atout);
    const partnerWinning = teamOf(maitreSeat) === teamOf(seat) && maitreSeat !== seat;

    if (partnerWinning) {
      return legal.slice().sort((a, b) => cardPoints(b, atout) - cardPoints(a, atout))[0];
    }

    const maitreCarte = pli.find((e) => e.siege === maitreSeat).carte;
    const winners = legal.filter((c) => winValue(c, atout, couleurDemandee) > winValue(maitreCarte, atout, couleurDemandee));
    if (winners.length) {
      return winners.slice().sort((a, b) => forceOf(a, atout) - forceOf(b, atout))[0];
    }

    return legal.slice().sort((a, b) => cardPoints(a, atout) - cardPoints(b, atout))[0];
  }

  function openBeloteWindowsIfNeeded(seat, carte) {
    if (!G.contract || seat !== G.contract.preneur || carte.suit !== G.contract.atout) return;
    if (carte.rank !== 'K' && carte.rank !== 'Q') return;
    if (G.belote.holder !== seat) return;
    if (carte.rank === 'K') G.belote.kingPlayed = true;
    if (carte.rank === 'Q') G.belote.queenPlayed = true;
    const count = (G.belote.kingPlayed ? 1 : 0) + (G.belote.queenPlayed ? 1 : 0);
    if (count === 1 && !G.belote.beloteDeclared) {
      G.belote.windowBelote = true;
      clearTimer('beloteWindow');
      G.timers.beloteWindow = setTimeout(() => { G.belote.windowBelote = false; maybeCloseBeloteAndScore(); render(); }, 10000);
    } else if (count === 2 && G.belote.beloteDeclared && !G.belote.rebeloteDeclared) {
      G.belote.windowRebelote = true;
      clearTimer('rebeloteWindow');
      G.timers.rebeloteWindow = setTimeout(() => { G.belote.windowRebelote = false; maybeCloseBeloteAndScore(); render(); }, 10000);
    }
  }

  function maybeCloseBeloteAndScore() {
    if (G.phase !== 'CLOTURE_BELOTE') return;
    if (G.belote.windowBelote || G.belote.windowRebelote) return;
    computeScore();
  }

  function computeScore() {
    clearTimer('beloteWindow');
    clearTimer('rebeloteWindow');
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

    if (action.type === 'DECLARER_BELOTE') {
      if (seat !== G.belote.holder || !G.belote.windowBelote || G.belote.beloteDeclared) return;
      G.belote.beloteDeclared = true;
      G.belote.windowBelote = false;
      clearTimer('beloteWindow');
      log(`${seatName(seat)} annonce Belote.`);
      maybeCloseBeloteAndScore();
      render();
      return;
    }

    if (action.type === 'DECLARER_REBELOTE') {
      if (seat !== G.belote.holder || !G.belote.windowRebelote || !G.belote.beloteDeclared || G.belote.rebeloteDeclared) return;
      G.belote.rebeloteDeclared = true;
      G.belote.windowRebelote = false;
      clearTimer('rebeloteWindow');
      log(`${seatName(seat)} annonce Rebelote.`);
      maybeCloseBeloteAndScore();
      render();
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
      clearTurnTimers();
      const carte = hand.splice(idx, 1)[0];
      G.pliCourant.push({ siege: seat, carte });
      openBeloteWindowsIfNeeded(seat, carte);

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
            G.phase = 'CLOTURE_BELOTE';
            render();
            maybeCloseBeloteAndScore();
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
      CLOTURE_BELOTE: 'Fin de donne…', SCORE: 'Résultat de la donne', TERMINEE: 'Partie terminée',
    }[G.phase] || G.phase;
  }

  // La table ovale (#live-table, déjà présente dans la page comme aperçu
  // statique) devient la vraie table de jeu : sièges, jeton donneur, pli
  // central et contrat s'affichent directement dessus.

  function seatDots(seat) {
    const remaining = G.hands[seat].length;
    let dots = '';
    for (let i = 0; i < 8; i++) dots += `<span class="${i < remaining ? 'is-present' : ''}"></span>`;
    return `<span class="seat-cardcount" title="${remaining} carte${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}">${dots}</span>`;
  }

  function renderLiveSeat(compass, seat) {
    const active = !G.resolvingTrick && G.joueurActif === seat && (G.phase === 'ENCHERES' || G.phase === 'JEU');
    const isPreneur = G.contract && G.contract.preneur === seat;
    const isDealer = G.donneur === seat;
    return `<span class="seat ${compass}${active ? ' is-active' : ''}${isPreneur ? ' is-preneur' : ''}">
      ${isDealer ? '<span class="dealer-chip" title="Donneur">D</span>' : ''}
      <span class="seat-name">${esc(seatName(seat))}${isPreneur ? ' <b class="taker-badge">preneur</b>' : ''}</span>
      ${seat === G.you ? '' : seatDots(seat)}
    </span>`;
  }

  function renderLiveTrick() {
    let slots = '';
    for (let pos = 0; pos < 4; pos++) {
      const seat = (G.you + pos) % 4;
      const entry = G.pliCourant.find((e) => e.siege === seat);
      const collecting = G.resolvingTrick && G.resolvingTrick.collecting ? ' is-collecting' : '';
      const winner = G.resolvingTrick && G.resolvingTrick.winnerSeat === seat ? ' is-winner' : '';
      slots += `<div class="trick-slot pos-${pos}${collecting}${winner}" data-seat="${seat}">${entry ? cardImg(entry.carte) : ''}</div>`;
    }
    const contractChip = G.contract
      ? `<div class="contract-chip">${SUIT_SYMBOL[G.contract.atout]} ${G.contract.montant} par ${esc(seatName(G.contract.preneur))}${G.multiplicateur > 1 ? ` · ×${G.multiplicateur}` : ''}</div>`
      : '';
    return `<div class="center-trick">${slots}</div>${contractChip}`;
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
    return value === 250 ? 'CAPOT' : value === 270 ? 'CAPOT+' : String(value);
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

  function renderBeloteButtons() {
    if (G.belote.holder !== G.you) return '';
    let html = '';
    if (G.belote.windowBelote && !G.belote.beloteDeclared) html += `<button type="button" class="button outline green-pill" data-action="belote">Annoncer Belote</button>`;
    if (G.belote.windowRebelote && G.belote.beloteDeclared && !G.belote.rebeloteDeclared) html += `<button type="button" class="button outline green-pill" data-action="rebelote">Annoncer Rebelote</button>`;
    return html;
  }

  function renderLastTrickButton() {
    if (!G.lastTrick) return '';
    return `<button type="button" class="button outline" data-action="toggle-last-trick">${els.showLastTrick ? 'Masquer' : 'Voir'} le pli précédent</button>`;
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
    const tallyLive = G.contract && (G.phase === 'JEU' || G.phase === 'CLOTURE_BELOTE' || G.resolvingTrick);
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
        ${renderBeloteButtons()}
        ${renderLastTrickButton()}
      </div>
      ${renderLastTrickPanel()}
      ${renderHand()}
      <ul class="game-log">${G.log.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
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
      } else if (action === 'belote') {
        applyAction(G.you, { type: 'DECLARER_BELOTE' });
      } else if (action === 'rebelote') {
        applyAction(G.you, { type: 'DECLARER_REBELOTE' });
      } else if (action === 'toggle-last-trick') {
        els.showLastTrick = !els.showLastTrick;
        render();
      } else if (action === 'restart') {
        G.scores = [0, 0];
        G.donneNumero = 1;
        startNewDonne();
      } else if (action === 'quit') {
        stop();
      }
    });
  }

  function stop() {
    if (!G) return;
    ['turn', 'bot', 'timerWarn', 'timerDanger', 'beloteWindow', 'rebeloteWindow', 'scoreDisplay', 'collect', 'sweep'].forEach(clearTimer);
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
