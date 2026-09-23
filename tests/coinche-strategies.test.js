// Scénarios de stratégie des bots : une situation, la décision qu'un bon
// joueur prendrait. Échoue si un réflexe classique se perd en modifiant
// l'IA. Le jeu de la carte est testé sur les réflexes (heuristicCard), que
// la simulation Monte-Carlo ne fait qu'affiner.
//   node tests/coinche-strategies.test.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../site/assets/js/coinche-game.js'), 'utf8')
  .replace('window.SCEPICoincheGame =', 'window.__api = { setG: (g) => { G = g; }, getG: () => G, botDecideBid, heuristicCard, botWantsToCoinche, botWantsToSurcoinche, contractIsGenerale, noteTrumpObligations, mcWorlds, exactEnd }; window.SCEPICoincheGame =');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);
// Hasard reproductible : les enchères jouent la donne sur des mondes tirés
// au hasard, un hasard constant n'en fabriquerait qu'un seul. Pas de bluff
// (bluff à 0 dans les personnalités).
vm.runInContext('Math.random = (() => { let s = 42; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();', ctx);
const api = ctx.window.__api;

const card = (id) => ({ suit: id.slice(-1), rank: id.slice(0, -1), id });
const cards = (s) => s.split(/\s+/).filter(Boolean).map(card);
const hands = (...h) => [0, 1, 2, 3].map((i) => cards(h[i] || ''));
const contract = (preneur, montant, atout, extra = {}) => ({ id: 1, type: montant === 270 ? 'CAPOT_BELOTE' : montant === 250 ? 'CAPOT' : 'NUMERIQUE', montant, atout, preneur, equipePreneur: preneur % 2, coinche: false, surcoinche: false, ...extra });
const bid = (b) => (b.type === 'PASSER' ? 'passe' : `${b.montant}${b.atout}`);

// État minimal ; `pli` = [[siège, carte], ...] déjà joués dans le pli en cours.
function setup(over = {}) {
  const g = {
    hands: [[], [], [], []], contract: null, donneAnnonces: [], bidMemo: [{}, {}, {}, {}], forced: [0, 0],
    scores: [0, 0], passesConsecutives: 0, personalities: [0, 1, 2, 3].map(() => ({ aggr: 1, bluff: 0, coincheAppetite: 1 })),
    seen: new Set(), void: [{}, {}, {}, {}], trumpMax: [8, 8, 8, 8], appel: [{}, {}, {}, {}], refus: [{}, {}, {}, {}], pliCourant: [], plisJoues: 0,
    pointsPlis: [0, 0], plisGagnes: [0, 0], playedBy: [[], [], [], []], seats: [0, 1, 2, 3].map(() => ({ type: 'bot' })), donneur: 3,
    belote: { beloteDeclared: false, rebeloteDeclared: false, kingPlayed: false, queenPlayed: false }, ...over,
  };
  g.bidLog = over.bidLog || g.donneAnnonces.map((a) => ({ ...a, cur: null, passes: 0 }));
  if (over.pli) {
    g.pliCourant = over.pli.map(([siege, id]) => ({ siege, carte: card(id) }));
    const lead = g.pliCourant[0].carte.suit;
    for (const e of g.pliCourant) { g.seen.add(e.carte.id); if (e.carte.suit !== lead) g.void[e.siege][lead] = true; }
  }
  (over.seenIds || []).forEach((id) => g.seen.add(id));
  api.setG(g);
}

const failures = [];
let total = 0;
function check(name, got, expected) {
  total++;
  const ok = Array.isArray(expected) ? expected.includes(got) : got === expected;
  if (!ok) failures.push(`${name} → obtenu ${got}, attendu ${expected}`);
}

// ---- Enchères (le siège 0 parle, son partenaire est le 2)
setup({ hands: hands('JH 9H 7H 8S 7S KD QC 7C') });
check('Ouverture « 90 fort » : Valet + 9 troisième', bid(api.botDecideBid(0)), '90H');
setup({ hands: hands('JH 8H 7H AS 9S 8D 7D 8C') });
check('Ouverture 80 : Valet troisième + un As', bid(api.botDecideBid(0)), '80H');
setup({ hands: hands('7H 8H KS QS 9D 8D 7C 10C') });
check('Main faible : passe', bid(api.botDecideBid(0)), 'passe');
setup({ hands: hands('9H KH QH 7S 8S 7D 8D 7C') });
check('Jamais de 80 sur 9 + belote sans As', bid(api.botDecideBid(0)), 'passe');
setup({ hands: hands('JH 7H AS 8S 7D 8D 9C 7C'), contract: contract(2, 80, 'H'), donneAnnonces: [{ seat: 2, montant: 80, atout: 'H' }], passesConsecutives: 1 });
check('Soutien Valet + As sur 80, moins le palier de prudence', bid(api.botDecideBid(0)), '100H');
setup({ hands: hands('AS 8S 7S AD 8D 7D 9C 7C'), contract: contract(2, 80, 'H'), donneAnnonces: [{ seat: 2, montant: 80, atout: 'H' }], passesConsecutives: 1 });
check('Sec à l’atout du partenaire : pas de soutien', bid(api.botDecideBid(0)), 'passe');
setup({ hands: hands('JH 9H AH 7H AD 10D AC 8C'), contract: contract(1, 80, 'S'), donneAnnonces: [{ seat: 1, montant: 80, atout: 'S' }] });
check('Intervention Valet-9-As avec une fausse carte : 130', bid(api.botDecideBid(0)), '130H');
setup({ hands: hands('KH QH 7H AS 8S 7D 8D 7C'), contract: contract(2, 110, 'H'), bidMemo: [{ supported: true }, {}, {}, {}],
  donneAnnonces: [{ seat: 2, montant: 80, atout: 'H' }, { seat: 0, montant: 100, atout: 'H' }, { seat: 2, montant: 110, atout: 'H' }] });
check('Reprendre de 10 pour marquer sa belote', bid(api.botDecideBid(0)), '120H');
setup({ hands: hands('JH 9H 8H 7H AS 7S 8D 7C'), contract: contract(2, 110, 'H'), passesConsecutives: 1,
  donneAnnonces: [{ seat: 0, montant: 100, atout: 'H' }, { seat: 2, montant: 110, atout: 'H' }] });
check('Ne pas soutenir sa propre couleur relancée par le partenaire', bid(api.botDecideBid(0)), 'passe');

// ---- Coinche
setup({ hands: hands('JS 9S 7S AH 8H AD 8D 7C'), contract: contract(1, 130, 'S'), donneAnnonces: [{ seat: 1, montant: 130, atout: 'S' }] });
check('Coincher 130 avec Valet-9 d’atout et deux As', api.botWantsToCoinche(0), true);
setup({ hands: hands('7S AH 8H 7H 9D 8D 7C 8C'), contract: contract(1, 80, 'S'), donneAnnonces: [{ seat: 1, montant: 80, atout: 'S' }] });
check('Pas de coinche sans tenir l’atout', api.botWantsToCoinche(0), false);
setup({ hands: hands('JS 7H 8H 9H 7D 8D 7C 8C'), contract: contract(1, 250, 'S'), donneAnnonces: [{ seat: 1, montant: 250, atout: 'S' }] });
check('Coincher un capot avec le Valet d’atout', api.botWantsToCoinche(0), true);
setup({ hands: hands('7H 8H 9H 7S 8S 7D 8D 7C'), contract: contract(0, 90, 'H', { coinche: true }), scores: [300, 400] });
check('Pas de surcoinche d’une main vide', api.botWantsToSurcoinche(0), false);
setup({ hands: hands('AH 10H KS 7S AD 8D 7C 8C'), contract: contract(1, 80, 'S'), scores: [600, 950], donneAnnonces: [{ seat: 1, montant: 80, atout: 'S' }] });
check('Coinche gratuite : le preneur sort de toute façon s’il réussit', api.botWantsToCoinche(0), true);
setup({ hands: hands('JS 9S AH 10H AD 8D 7C 8C'), contract: contract(1, 80, 'S'), scores: [900, 300], donneAnnonces: [{ seat: 1, montant: 80, atout: 'S' }] });
check('Pas de coinche quand une simple chute nous fait gagner', api.botWantsToCoinche(0), false);

// ---- Générale : les 8 cartes de l'atout en main initiale
const huitPiques = 'JS 9S AS 10S KS QS 8S 7S';
setup({ hands: hands(huitPiques) });
check('Générale : ouvrir directement en capot beloté', bid(api.botDecideBid(0)), '270S');
setup({ hands: hands('AH AD AC 10H 10D 10C KH KD', huitPiques), mainsInitiales: hands('', huitPiques), contract: contract(1, 270, 'S'),
  donneAnnonces: [{ seat: 1, montant: 270, atout: 'S' }], personalities: [0, 1, 2, 3].map(() => ({ aggr: 1, bluff: 0, coincheAppetite: 2.5 })) });
check('Générale : la défense ne coinche jamais, même bourrée d’As', api.botWantsToCoinche(0), false);
setup({ hands: hands(huitPiques), mainsInitiales: hands(huitPiques), contract: contract(0, 270, 'S', { coinche: true }) });
check('Générale coinchée : surcoincher d’office', api.botWantsToSurcoinche(0), true);
check('8 atouts annoncés à 270 : Générale', api.contractIsGenerale(contract(0, 270, 'S')), true);
check('8 atouts annoncés à 80 : un simple 80, pas une Générale', api.contractIsGenerale(contract(0, 80, 'S')), false);

// ---- Jeu de la carte : atout Cœur, 100 par le siège 0
const JEU = { contract: contract(0, 100, 'H'), donneAnnonces: [{ seat: 0, montant: 100, atout: 'H' }] };
const play = (seat) => api.heuristicCard(seat).id;
setup({ ...JEU, hands: hands('JH 9H 7H AS 8S KD 7D 8C') });
check('Preneur : tirer l’atout maître', play(0), 'JH');
setup({ ...JEU, hands: hands('9H 8H 7H AS 8S KD 7D 8C') });
check('Preneur sans Valet : petit atout pour faire tomber le Valet', play(0), '7H');
setup({ ...JEU, hands: hands('', 'JH 8H AD 9D 7S 8S KC 8C') });
check('Défense : jamais d’atout en entame', play(1).endsWith('H'), false);
setup({ ...JEU, hands: hands('', '10S 7D 8D 9D KC 7C QD 8C') });
check('Défense : ne pas entamer un 10 sec', play(1) === '10S', false);
setup({ ...JEU, hands: hands('', 'AS 7S 8D 7D 9C 8C 7C 8H') });
check('Défense : encaisser l’As court', play(1), 'AS');
setup({ ...JEU, hands: hands('10D 9D 7S 8S 8C 7C JH 7H'), pli: [[1, '7D'], [2, 'AD'], [3, '8D']] });
check('Charger : le 10 sous l’As du partenaire', play(0), '10D');
setup({ ...JEU, hands: hands('10D 8D 7S 8S 8C 7C JH 7H'), pli: [[2, 'AD'], [3, '7D']], void: [{}, { D: true }, {}, {}] });
check('Pli du partenaire menacé de coupe : garder son 10', play(0), '8D');
setup({ ...JEU, hands: hands('AS 8S 9D 7D 8C 7C JH 7H'), pli: [[3, '7S']] });
check('Petit en second, le partenaire joue encore', play(0), '8S');
setup({ ...JEU, hands: hands('AC 7C KS 8S QC 10S 9S 7S'), contract: contract(1, 100, 'H'), pli: [[1, 'AD'], [2, '9D'], [3, 'QD']] });
check('Défausse : appel sous l’As', play(0), '7C');
setup({ ...JEU, hands: hands('', '', '8C 9C KS QD 7D 8S 7S QS'), appel: [{ C: true }, {}, {}, {}] });
check('Rejouer la couleur appelée par le partenaire', play(2), '8C');
setup({ ...JEU, hands: hands('JH 7D'), plisJoues: 6, seenIds: ['9H', 'AH', '10H', 'KH', 'QH', '8H', '7H'] });
check('Garder l’atout maître pour le dix de der', play(0), '7D');
setup({ ...JEU, hands: hands('7H JH KD 8C 9C 7C 10C QC'), pli: [[1, 'AS'], [2, '7S'], [3, '8S']] });
check('Couper petit', play(0), '7H');
setup({ ...JEU, hands: hands('7H JH KD 8C 9C 7C 10C QC'), pli: [[1, '7S'], [2, 'AS'], [3, '8S']] });
check('Ne pas couper le pli sûr du partenaire', play(0).endsWith('H'), false);
setup({ ...JEU, contract: contract(1, 80, 'H'), hands: hands('AS 9S AD 8D 7C 8C QD 7D'), pli: [[1, '7S'], [2, '10S'], [3, '8S']] });
check('Jamais l’As par-dessus le 10 maître du partenaire', play(0), '9S');

// ---- Déductions : obligation de couper et de monter (le siège 2 mène, adversaire du 3)
setup({ ...JEU, pli: [[2, 'AS']] });
api.noteTrumpObligations(3, card('7D'));
check('Défausse au lieu de couper le pli adverse : plus d’atout', api.getG().trumpMax[3], 0);
setup({ ...JEU, pli: [[2, 'AS'], [3, '9H']] });
api.noteTrumpObligations(0, card('8H'));
check('Sous-coupe obligée : aucun atout plus fort que le 9', api.getG().trumpMax[0], 6);
setup({ ...JEU, pli: [[2, 'AS']] });
api.noteTrumpObligations(0, card('7D'));
check('Partenaire maître : défausser ne dit rien sur l’atout', api.getG().trumpMax[0], 8);

// ---- Mondes imaginés : le preneur a ouvert « 90 fort » (Valet + 9 promis), les autres ont passé
{
  vm.runInContext('Math.random = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();', ctx);
  setup({
    hands: hands('AS 7S AH 10H KD 8D 7C 8C'), contract: contract(1, 90, 'S'),
    bidLog: [{ seat: 0, cur: null, passes: 0 }, { seat: 1, montant: 90, atout: 'S', cur: null, passes: 1 },
      { seat: 2, cur: contract(1, 90, 'S'), passes: 0 }, { seat: 3, cur: contract(1, 90, 'S'), passes: 1 }],
  });
  const worlds = api.mcWorlds(0, 48);
  const both = worlds.filter((w) => ['JS', '9S'].every((id) => w[1].some((c) => c.id === id))).length;
  check('Mondes compatibles avec un 90 fort (Valet + 9 chez le preneur, ≥ 80 %)', both >= 0.8 * worlds.length, true);
  vm.runInContext('Math.random = () => 0.99;', ctx);
}

// ---- Fin de donne exacte : 80 Cœur du siège 0, deux plis à jouer, 60 à 57.
// Tirer le Valet d'atout (le réflexe) ne fait que 80 ; jouer le 7 de Pique
// d'abord laisse l'As adverse passer, puis le Valet coupe le Trèfle et prend
// le dix de der : 90, contrat réussi.
{
  const sim = {
    contract: contract(0, 80, 'H'), multiplicateur: 1, pliCourant: [], plisJoues: 6, pointsPlis: [60, 57], plisGagnes: [3, 3],
    hands: [cards('JH 7S'), cards('AS 8C'), cards('7C 8D'), cards('KS 9D')],
  };
  check('Fin de donne exacte : le preneur trouve la ligne gagnante', api.exactEnd(sim, 0, false, 0) > 0, true);
  check('Fin de donne exacte : vue de la défense, le contrat passe', api.exactEnd(sim, 0, false, 1) < 0, true);
}

if (failures.length) {
  console.error(failures.map((f) => `ÉCHEC ${f}`).join('\n'));
  process.exit(1);
}
console.log(`${total} scénarios de stratégie conformes.`);
