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

  function hasBelote(hand, suit) {
    return hand.some((c) => c.suit === suit && c.rank === 'K') && hand.some((c) => c.suit === suit && c.rank === 'Q');
  }

  function bestSuitFor(hand) {
    let best = null;
    for (const suit of SUITS) {
      let score = suitStrength(hand, suit) + estimateTricks(hand, suit) * 14;
      // Roi + Dame d'atout, c'est 20 points quasi garantis (belote/rebelote)
      // si cette couleur devient le contrat — un vrai argument pour la
      // choisir comme atout, pas seulement un bonus de score une fois
      // preneur.
      if (hasBelote(hand, suit)) score += 24;
      if (!best || score > best.score) best = { suit, score };
    }
    return best;
  }

  // Estimation du nombre de plis gagnables « seul », sans rien savoir des
  // mains adverses : longueur et honneurs d'atout (affranchissement), les
  // as et rois gardés dans les autres couleurs (contrôle latéral quasi
  // garanti), et la distribution — un vide ou un singleton dans une couleur
  // n'est pas neutre : c'est une coupe (quasi) certaine dès le premier tour
  // de cette couleur, un vrai pli de plus que le simple compte de points ne
  // voit pas. D'autant plus précieux qu'on a de quoi couper à plusieurs
  // reprises (longueur d'atout). Sert à peser les enchères sur autre chose
  // que le simple total de points des cartes.
  function estimateTricks(hand, atout) {
    const trumps = hand.filter((c) => c.suit === atout);
    const trumpHonors = trumps.filter((c) => c.rank === 'J' || c.rank === '9' || c.rank === 'A').length;
    let tricks = Math.min(trumps.length, trumps.length * 0.7 + trumpHonors * 0.3);
    for (const s of SUITS) {
      if (s === atout) continue;
      const cards = hand.filter((c) => c.suit === s);
      if (!cards.length) {
        if (trumps.length >= 3) tricks += 1;
        continue;
      }
      if (cards.length === 1 && trumps.length >= 4) tricks += 0.5;
      if (cards.some((c) => c.rank === 'A')) tricks += 1;
      else if (cards.some((c) => c.rank === 'K') && cards.length >= 2) tricks += 0.5;
    }
    return tricks;
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

  // Un même écart de score ne pèse pas pareil selon qu'on mène ou qu'on est
  // mené : une équipe menée de loin a plus intérêt à tenter sa chance (les
  // points perdus sur un contrat chuté comptent moins que ceux qu'il faut
  // rattraper) — seuils abaissés, donc plus facile à enchérir/monter. À
  // l'inverse, une équipe proche de la victoire (1010 points) n'a rien à
  // gagner à un pari inutile — seuils relevés. Valeur à ajouter directement
  // aux seuils d'enchère (même convention partout : plus haut = plus dur à
  // déclencher).
  function scoreUrgencyAdjustment(seat) {
    const mine = G.scores[teamOf(seat)];
    const theirs = G.scores[1 - teamOf(seat)];
    if (theirs - mine >= 150) return -10;
    if (mine >= 800 && mine - theirs >= 150) return 8;
    return 0;
  }

  function botDecideBid(seat) {
    const hand = G.hands[seat];
    const p = personality(seat);
    const { suit, score } = bestSuitFor(hand);
    const current = G.contract;
    const noise = (Math.random() - 0.5) * 16; // incertitude psychologique
    const bluffing = Math.random() < p.bluff;
    const urgency = scoreUrgencyAdjustment(seat);

    if (!current) {
      // Si les trois autres ont déjà passé, notre propre passe relance la
      // donne pour tout le monde : un peu plus de raisons d'oser une main
      // tout juste limite plutôt que de la gâcher pour rien.
      const lastChance = G.passesConsecutives === 3;
      const openThreshold = 74 / p.aggr - (bluffing ? 14 : 0) + noise - (lastChance ? 10 : 0) + urgency;
      if (score < openThreshold) return { type: 'PASSER' };
      if (lastChance) log(`${seatName(seat)} ouvre en dernier recours pour éviter la redonne…`);
      const trumpCount = hand.filter((c) => c.suit === suit).length;
      if (hasBelote(hand, suit)) log(`${seatName(seat)} sent la belote dans sa main…`);
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

    // Une main qui déborde largement le seuil nécessaire pour monter mérite
    // une relance franche, pas un +10 systématique quel que soit l'écart :
    // plus la marge au-dessus du seuil est grande, plus le bond est net.
    function raiseBump(surplus) {
      if (surplus >= 40) return 30;
      if (surplus >= 22) return 20;
      return 10;
    }

    if (partnerIsPreneur) {
      // Le partenaire a annoncé cette couleur : on additionne sa force
      // supposée (déduite de son enchère) à la nôtre. Mais on connaît une
      // chose qu'il ignore avoir révélée : notre propre nombre d'atouts
      // dans SA couleur. Plus on en tient, moins il peut lui en rester (à
      // deux, huit cartes maximum par couleur) — sa force réelle y est
      // probablement plus faible que l'estimation à plat ne suppose, et
      // inversement si on n'en a aucune.
      const myTrumpsOfContractSuit = hand.filter((c) => c.suit === current.atout).length;
      const partnerEstimate = current.montant - 6 + (2 - myTrumpsOfContractSuit) * 4;
      let combined = score + partnerEstimate * 0.55;

      // Raisonnement psychologique : le bot ne voit jamais les cartes des
      // autres, seulement ses propres cartes et l'historique des enchères.
      // Mais certaines de ses cartes sont des points quasiment garantis une
      // fois que le partenaire s'est déjà engagé haut : un as hors-atout
      // (11 points, la carte la plus forte de sa couleur) se compte presque
      // toujours, surtout si le partenaire vise déjà un contrat costaud
      // (≥90).
      const acesHorsAtout = hand.filter((c) => c.rank === 'A' && c.suit !== suit).length;
      if (current.montant >= 90 && acesHorsAtout >= 1) {
        log(`${seatName(seat)} sent ${acesHorsAtout} as garanti${acesHorsAtout > 1 ? 's' : ''} derrière l'annonce de son partenaire…`);
        combined += acesHorsAtout >= 2 ? 20 : 8;
      }

      const raiseThreshold = current.montant + 18 / p.aggr - noise + urgency;
      if (combined >= raiseThreshold && current.montant < 250 && suit === current.atout) {
        // Une main qui, ajoutée à celle déjà annoncée du partenaire, frôle
        // le capot mérite d'être proposée comme telle plutôt que de monter
        // palier par palier jusqu'à 160 — jusqu'ici possible seulement en
        // ouvrant les enchères, jamais en relançant son partenaire.
        const trumpCount = hand.filter((c) => c.suit === suit).length;
        if (combined >= 205 && trumpCount >= 5 && Math.random() < 0.3 * p.aggr) {
          log(`${seatName(seat)} voit le capot derrière l'annonce de son partenaire…`);
          return { type: 'ENCHERIR', montant: 250, atout: current.atout };
        }
        if (current.montant < 160) {
          const montant = Math.min(160, current.montant + raiseBump(combined - raiseThreshold));
          return { type: 'ENCHERIR', montant, atout: current.atout };
        }
      }
      return { type: 'PASSER' };
    }

    // L'adversaire est preneur : ne reprendre la main que sur une vraie
    // belle couleur, sans quoi mieux vaut garder la carte de la coinche.
    const overcallThreshold = current.montant + 30 / p.aggr - (bluffing ? 10 : 0) - noise + urgency;
    if (score >= overcallThreshold && current.montant < 250) {
      // Même logique de relance directe au capot qu'en soutien du
      // partenaire, côté reprise de la main sur l'adversaire cette fois.
      const trumpCount = hand.filter((c) => c.suit === suit).length;
      if (score >= 205 && trumpCount >= 5 && Math.random() < 0.28 * p.aggr) {
        log(`${seatName(seat)} reprend la main droit sur le capot…`);
        return { type: 'ENCHERIR', montant: 250, atout: suit };
      }
      if (current.montant < 160) {
        const montant = Math.min(160, current.montant + raiseBump(score - overcallThreshold));
        return { type: 'ENCHERIR', montant, atout: suit };
      }
    }
    return { type: 'PASSER' };
  }

  // Le vrai signal d'une chute programmée, ce n'est pas « j'ai des points »
  // mais « je tiens des atouts que le preneur ne peut jamais forcer à
  // sortir » : le Valet et le 9 d'atout sont imprenables, et une belle
  // longueur d'atout use la main adverse au fil des plis.
  function trumpControlScore(hand, atout) {
    const trumps = hand.filter((c) => c.suit === atout);
    if (!trumps.length) return 0;
    let score = trumps.length * 9;
    if (trumps.some((c) => c.rank === 'J')) score += 26;
    if (trumps.some((c) => c.rank === '9')) score += 18;
    if (trumps.length >= 3) score += 12;
    return score;
  }

  function botWantsToCoinche(seat) {
    const contract = G.contract;
    if (!contract || teamOf(seat) === contract.equipePreneur) return false;
    const p = personality(seat);
    const hand = G.hands[seat];
    // Défense = contrôle d'atout imprenable + as latéraux quasi garantis,
    // pas juste un total de points de cartes.
    const sideAces = hand.filter((c) => c.rank === 'A' && c.suit !== contract.atout).length;
    if (contract.type !== 'NUMERIQUE') {
      // Capot / capot beloté : un seul pli suffit à faire chuter tout le
      // contrat, donc un simple honneur d'atout gardé ou un as latéral
      // suffisent déjà à tenter la coinche — le calcul n'a rien à voir
      // avec un contrat au nombre. Le seuil reste plus haut qu'un simple
      // pressentiment : il faut une vraie carte de contrôle, pas juste un
      // atout quelconque.
      const confidence = trumpControlScore(hand, contract.atout) + sideAces * 22;
      if (confidence < 52 / p.coincheAppetite + scoreUrgencyAdjustment(seat)) return false;
      return Math.random() < 0.42 * p.coincheAppetite;
    }
    const confidence = trumpControlScore(hand, contract.atout) + sideAces * 16;
    // Une défense menée au score a plus à gagner à doubler la mise (et
    // moins à perdre si elle se trompe) qu'une défense déjà loin devant —
    // même logique d'urgence que pour les enchères.
    const threshold = (78 + (contract.montant - 80) * 0.5) / p.coincheAppetite + scoreUrgencyAdjustment(seat);
    if (confidence < threshold) return false;
    return Math.random() < 0.4 * p.coincheAppetite;
  }

  function botWantsToSurcoinche(seat) {
    const contract = G.contract;
    if (!contract || teamOf(seat) !== contract.equipePreneur) return false;
    const p = personality(seat);
    const hand = G.hands[seat];
    const sideAces = hand.filter((c) => c.rank === 'A' && c.suit !== contract.atout).length;
    const confidence = trumpControlScore(hand, contract.atout) + sideAces * 14;
    if (confidence < 92 / p.aggr + scoreUrgencyAdjustment(seat)) return false;
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

  // Sièges qui n'ont pas encore joué dans le pli en cours, hors nous-même —
  // sert à savoir si quelqu'un peut encore surenchérir après notre carte.
  function seatsStillToAct(pli, seat) {
    const played = new Set(pli.map((e) => e.siege));
    return [0, 1, 2, 3].filter((s) => s !== seat && !played.has(s));
  }

  // Compte les atouts dont la position est connue (dans notre main, ou déjà
  // joués et donc dans G.seen) pour en déduire combien restent cachés chez
  // les deux autres sièges. Un vrai comptage de cartes, pas une estimation :
  // sert à savoir s'il reste encore des atouts adverses à faire tomber
  // plutôt que de continuer à mener atout par réflexe une fois qu'ils sont
  // tous sortis (il vaut alors mieux garder ses propres atouts pour
  // contrôler les derniers plis et jouer ses couleurs longues).
  function trumpsHiddenCount(hand, atout) {
    const inHand = hand.filter((c) => c.suit === atout).length;
    const seenCount = [...G.seen].filter((id) => id.endsWith(atout)).length;
    return Math.max(0, 8 - inHand - seenCount);
  }

  // Une carte est certainement maîtresse de sa couleur si toutes les cartes
  // plus fortes qu'elle dans cette couleur sont soit déjà vues (jouées),
  // soit encore dans notre propre main (donc personne d'autre ne peut les
  // avoir) — un vrai décompte, pas une supposition. Généralise le cas
  // trivial de l'as (qui n'a par définition rien au-dessus) au cas d'un Roi
  // devenu maître parce que l'As est tombé, etc.
  function isKnownMaster(hand, card, atout) {
    const table = card.suit === atout ? TRUMP_FORCE : PLAIN_FORCE;
    const myForce = table[card.rank];
    return Object.keys(table).every((r) => {
      if (table[r] <= myForce) return true;
      const id = r + card.suit;
      return G.seen.has(id) || hand.some((c) => c.id === id);
    });
  }

  // Une fois l'issue du contrat mathématiquement jouée — déjà réussi quels
  // que soient les plis restants, ou déjà irrattrapable même en gagnant
  // tout ce qu'il reste — les points des tricks à venir ne changent plus
  // rien au score de cette donne (montant fixe si réussi, 160 fixe sinon).
  // Un vrai décompte des points déjà tombés, pas une intuition : inutile de
  // garder un as « pour plus tard » dans une donne qui n'a plus rien à
  // décider.
  function contractOutcomeLocked() {
    const preneurTeam = G.contract.equipePreneur;
    if (G.contract.type !== 'NUMERIQUE') {
      // Capot (et capot beloté) : le contrat tombe dès qu'un seul pli
      // échappe au preneur, quel que soit le nombre de plis encore à jouer.
      return G.plisGagnes[1 - preneurTeam] > 0;
    }
    const seuil = G.contract.montant === 80 ? 82 : G.contract.montant;
    const pointsRestants = 162 - G.pointsPlis[0] - G.pointsPlis[1];
    return G.pointsPlis[preneurTeam] >= seuil || G.pointsPlis[preneurTeam] + pointsRestants < seuil;
  }

  function botChooseCard(seat) {
    const hand = G.hands[seat];
    const atout = G.contract.atout;
    const pli = G.pliCourant;
    const legal = computeLegal(hand, pli, atout, seat);
    if (legal.length === 1) return legal[0];
    const myTeam = teamOf(seat);
    const isPreneurTeam = G.contract && myTeam === G.contract.equipePreneur;

    if (!pli.length) {
      const opponents = [0, 1, 2, 3].filter((s) => teamOf(s) !== myTeam);
      // Vrai comptage de cartes : combien d'atouts restent cachés (ni dans
      // notre main, ni déjà vus), et les deux adversaires sont-ils déjà
      // connus manquants à l'atout (un pli où l'un d'eux a dû fournir une
      // autre couleur l'a révélé). Sert à juger s'il reste encore des
      // atouts adverses à faire tomber.
      const trumpsHidden = trumpsHiddenCount(hand, atout);
      const opponentsVoidOfTrump = opponents.every((o) => G.void[o][atout]);

      // Mener une carte hors-atout n'est vraiment « sûre » que si elle est
      // certainement maîtresse (l'as, ou un Roi devenu maître parce que
      // l'as est déjà tombé, etc. — un vrai décompte) ET qu'aucun
      // adversaire n'est connu manquant dans cette couleur (sinon il coupe
      // à l'atout et la carte est perdue pour rien) — déduit des manques
      // déjà observés dans les plis précédents, jamais des mains adverses.
      const safeMasters = legal.filter((c) => c.suit !== atout
        && isKnownMaster(hand, c, atout)
        && !opponents.some((o) => G.void[o][c.suit]));
      if (safeMasters.length) {
        const best = safeMasters.slice().sort((a, b) => cardPoints(b, atout) - cardPoints(a, atout))[0];
        if (best.rank !== 'A') log(`${seatName(seat)} a compté la couleur : son ${cardLabel(best)} est maître…`);
        return best;
      }

      const trumps = legal.filter((c) => c.suit === atout);
      const trumpHonors = trumps.filter((c) => c.rank === 'J' || c.rank === '9');

      if (isPreneurTeam) {
        // C'est l'annonce qui dit qui est censé tenir les maîtres d'atout
        // (Valet/9), pas « qui a la plus belle carte dans sa propre main » :
        // le preneur a annoncé cette couleur parce qu'IL y est fort, donc
        // lui affranchir avec son meilleur atout est le bon réflexe. Mais
        // son partenaire, lui, n'a rien annoncé sur l'atout — il doit
        // supposer que les maîtres sont plutôt chez le preneur, sauf s'il
        // les tient réellement lui-même. Sinon, « mener sa plus haute
        // carte » revient souvent à sacrifier un Dix ou un As d'atout pour
        // rien face à un Valet ou un 9 qui traîne encore chez l'adversaire.
        const amPreneur = seat === G.contract.preneur;
        const soloTrumpControl = trumpHonors.length >= 1 || trumps.length >= 5;
        // Inutile de continuer à « faire tomber » l'atout une fois qu'on
        // sait — cartes vues plus manques constatés, pas une supposition —
        // qu'il n'en reste plus chez la défense : mieux vaut alors garder
        // ses propres atouts pour contrôler les derniers plis.
        const worthDrawing = trumpsHidden > 0 && !opponentsVoidOfTrump;
        if (worthDrawing && (amPreneur ? (trumps.length >= 4 || (trumps.length >= 2 && trumpHonors.length >= 1)) : soloTrumpControl)) {
          return trumps.slice().sort((a, b) => TRUMP_FORCE[b.rank] - TRUMP_FORCE[a.rank])[0];
        }
        if (!worthDrawing && trumps.length && (amPreneur || soloTrumpControl)) {
          log(`${seatName(seat)} a compté les atouts : plus rien à faire tomber, garde les siens…`);
        }

        // Sans maître sûr ni atout à faire tomber, une couleur longue mais
        // pas encore maîtresse vaut la peine d'être travaillée plutôt que
        // délaissée : mener petit y use la carte adverse qui bloque encore,
        // les cartes restantes de cette couleur deviennent maîtresses pour
        // les derniers plis — un vrai affranchissement, pas juste « jouer
        // ce qui traîne ». Sur une main de 8 cartes en 4 couleurs (2 de
        // moyenne par couleur), 3 cartes ou plus dans une même couleur hors
        // atout est déjà une vraie longueur. Seulement si on garde de quoi
        // se protéger d'une coupe pendant l'opération (un peu d'atout en
        // réserve) et qu'il reste assez de plis pour que ça paie.
        const longSuit = SUITS.filter((s) => s !== atout)
          .map((s) => ({ suit: s, count: hand.filter((c) => c.suit === s).length }))
          .filter((e) => e.count >= 3)
          .sort((a, b) => b.count - a.count)[0];
        if (longSuit && trumps.length >= 2 && 8 - G.plisJoues >= 3) {
          log(`${seatName(seat)} travaille sa longue couleur pour l'affranchir…`);
          return legal.filter((c) => c.suit === longSuit.suit)
            .sort((a, b) => cardPoints(a, atout) - cardPoints(b, atout))[0];
        }
      } else if (trumpHonors.length && trumps.length <= 2) {
        // La défense n'a presque jamais intérêt à entamer l'atout : ça ne
        // fait qu'user gratuitement ses propres atouts au profit du
        // preneur. Exception : encaisser tout de suite un maître sûr
        // (Valet/9) qu'on ne rejouera peut-être jamais si on reperd la main.
        return trumpHonors.sort((a, b) => TRUMP_FORCE[b.rank] - TRUMP_FORCE[a.rank])[0];
      }

      const bySuit = {};
      for (const c of hand) (bySuit[c.suit] = bySuit[c.suit] || []).push(c);
      const suitsPresentInLegal = new Set(legal.map((c) => c.suit));
      const candidateSuits = [...suitsPresentInLegal].filter((s) => s !== atout);
      const partner = (seat + 2) % 4;

      // Forcer un ADVERSAIRE à couper avec un atout est une bonne chose —
      // il n'a que l'embarras du choix minimal, donc c'est souvent son
      // atout le plus faible qui y passe, un vrai pas vers l'épuisement de
      // sa réserve. Forcer son PROPRE partenaire à couper est en revanche
      // en général une mauvaise idée : on lui fait gâcher un atout pour
      // rien, sauf s'il récupère au passage un as adverse resté dans le
      // pli — chose qu'on ne peut pas garantir en entamant à l'aveugle, ce
      // cas n'est donc pas recherché ici. Priorité : une couleur qui pousse
      // l'adversaire à couper sans risque pour le partenaire ; à défaut,
      // n'importe quelle couleur sans risque pour lui ; en dernier recours,
      // ce qu'il reste.
      const safeForPartner = candidateSuits.filter((s) => !G.void[partner][s]);
      const forcesOpponentCut = safeForPartner.filter((s) => opponents.some((o) => G.void[o][s]));
      const suitPool = forcesOpponentCut.length ? forcesOpponentCut
        : safeForPartner.length ? safeForPartner
        : candidateSuits;
      if (forcesOpponentCut.length) {
        log(`${seatName(seat)} pousse l'adversaire à couper pour user son atout…`);
      }

      let shortestSuit = null;
      for (const suit of suitPool) {
        if (!bySuit[suit]) continue;
        if (!shortestSuit || bySuit[suit].length < bySuit[shortestSuit].length) shortestSuit = suit;
      }
      const pool = shortestSuit ? legal.filter((c) => c.suit === shortestSuit) : legal;
      return pool.slice().sort((a, b) => cardPoints(a, atout) - cardPoints(b, atout))[0];
    }

    const couleurDemandee = pli[0].carte.suit;
    const maitreSeat = trickWinnerSeat(pli, atout);
    const partnerWinning = teamOf(maitreSeat) === myTeam && maitreSeat !== seat;
    const stillToAct = seatsStillToAct(pli, seat);
    const opponentStillToAct = stillToAct.some((s) => teamOf(s) !== myTeam);

    if (partnerWinning) {
      const partnerCarte = pli.find((e) => e.siege === maitreSeat).carte;
      const partnerCertain = partnerCarte.suit === atout && (partnerCarte.rank === 'J' || partnerCarte.rank === '9');
      if (opponentStillToAct && !partnerCertain) {
        // Le pli n'est pas encore gagné : un adversaire joue encore après
        // nous et peut surcouper notre partenaire. Fournir sans se délester
        // tout de suite de nos meilleures cartes pour rien.
        return legal.slice().sort((a, b) => cardPoints(a, atout) - cardPoints(b, atout))[0];
      }
      // Plus personne ne peut menacer ce pli (ou notre partenaire tient un
      // maître imprenable) : on peut nourrir sans risque.
      return legal.slice().sort((a, b) => cardPoints(b, atout) - cardPoints(a, atout))[0];
    }

    const maitreCarte = pli.find((e) => e.siege === maitreSeat).carte;
    const winners = legal.filter((c) => winValue(c, atout, couleurDemandee) > winValue(maitreCarte, atout, couleurDemandee));

    if (winners.length && winners.length < legal.length) {
      // Vraie liberté de ne pas prendre (uniquement possible hors-atout,
      // quand une de nos cartes plus faibles fournit déjà la couleur) : si
      // personne d'autre ne peut nous voler ce pli, que son enjeu est
      // faible et qu'on n'est pas en fin de donne, autant garder notre as
      // pour un pli qui en vaudra vraiment la peine.
      const endgame = G.plisJoues >= 6;
      const trickValue = trickPoints(pli, atout);
      const cheapestWinner = winners.slice().sort((a, b) => forceOf(a, atout) - forceOf(b, atout))[0];
      if (!endgame && !opponentStillToAct && trickValue < 8 && cheapestWinner.rank === 'A' && !contractOutcomeLocked()) {
        const decline = legal.filter((c) => !winners.includes(c));
        return decline.sort((a, b) => cardPoints(a, atout) - cardPoints(b, atout))[0];
      }
    }

    if (winners.length) {
      return winners.slice().sort((a, b) => forceOf(a, atout) - forceOf(b, atout))[0];
    }

    // Aucune carte ne peut gagner : défausse. Si le choix s'étend à
    // plusieurs couleurs (vraiment libre, pas juste « la couleur demandée
    // sans pouvoir monter »), autant délester notre couleur déjà la plus
    // courte pour se rapprocher d'un manque utile plus tard, plutôt qu'une
    // défausse purement au hasard des points.
    const legalSuits = new Set(legal.map((c) => c.suit));
    if (legalSuits.size > 1) {
      const bySuit = {};
      for (const c of hand) (bySuit[c.suit] = bySuit[c.suit] || []).push(c);
      const nonTrumpSuits = [...legalSuits].filter((s) => s !== atout);
      const candidates = nonTrumpSuits.length ? nonTrumpSuits : [...legalSuits];
      let shortest = candidates[0];
      for (const s of candidates) if (bySuit[s].length < bySuit[shortest].length) shortest = s;
      const pool = legal.filter((c) => c.suit === shortest);
      return pool.slice().sort((a, b) => cardPoints(a, atout) - cardPoints(b, atout))[0];
    }

    return legal.slice().sort((a, b) => cardPoints(a, atout) - cardPoints(b, atout))[0];
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
