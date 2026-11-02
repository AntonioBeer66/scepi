// Diagnostic des bots en parties de 4 bots (moteur et hôte headless :
// coinche-sim.js) : d'où viennent les contrats (raison de chaque enchère,
// voir BID_WHY), interventions au-dessus de l'adversaire selon la tenue
// d'atout, partenaire muet avec deux As, 10 non maîtres posés, tirage
// d'atout de l'attaque. Sert à suivre ces chiffres après un réglage
// (docs/audits/2026-11-bots-encheres-carte.md).
//   node tests/coinche-diag.js [moteur, défaut src/coinche/engine.js] [parties, défaut 20] [mondes MC, défaut 48]
// REGLES=essec : parties au salon des règles de l'ESSEC.
import path from 'path';
import { pathToFileURL } from 'url';
import { play } from './coinche-sim.js';

const [file = 'src/coinche/engine.js', games = '20', mc = '48'] = process.argv.slice(2);
const E = await import(pathToFileURL(path.resolve(file)).href);
E.tuning.mcSamples = +mc;
const SUITS = ['S', 'H', 'D', 'C'];
const TRUMP_ORDER = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];
const donnes = [];
const tens = [];
const leads = [];
const t0 = Date.now();

for (let g = 0; g < +games; g++) {
  let bids = [];
  let pend = [];
  let recs = [];
  const wrapped = {
    ...E.bots,
    turnAction(G, s) {
      if (G.phase === 'ENCHERES') {
        const a = E.bots.turnAction(G, s);
        if (a && (a.type === 'ENCHERIR' || a.type === 'PASSER'))
          bids.push({ seat: s, hand: G.hands[s].map((c) => c.id), montant: a.montant || 0, atout: a.atout || '', why: E.bots.lastBidWhy() });
        return a;
      }
      if (G.phase !== 'JEU') return E.bots.turnAction(G, s);
      const reflex = E.bots.heuristicCard(G, s);
      const a = E.bots.turnAction(G, s);
      if (!a || a.type !== 'JOUER' || !SUITS.includes(G.contract.atout)) return a;
      const hand = G.hands[s];
      const card = a.carte;
      const { atout, equipePreneur, preneur } = G.contract;
      const pli = G.pliCourant;
      const mine = (id) => hand.some((x) => x.id === id);
      const out = (id) => !G.seen[id] && !mine(id);
      const rec = { seat: s, attack: s % 2 === equipePreneur, dev: reflex.id !== card.id };
      if (card.rank === '10' && card.suit !== atout && out('A' + card.suit) && hand.filter((x) => x.suit === card.suit).length >= 2 && pli.length < 3) {
        rec.where = pli.length ? (pli[0].carte.suit === card.suit ? `fournit en ${pli.length + 1}e` : `défausse en ${pli.length + 1}e`) : 'entame';
        pend.push({ ...rec, kind: 'ten' });
      } else if (!pli.length && rec.attack && hand.some((x) => x.suit === atout) && TRUMP_ORDER.some((r) => out(r + atout))) {
        const top = TRUMP_ORDER.find((r) => mine(r + atout));
        const master = !TRUMP_ORDER.slice(0, TRUMP_ORDER.indexOf(top)).some((r) => out(r + atout));
        const n = hand.filter((x) => x.suit === atout).length;
        if (master && n >= 2 && G.plisJoues >= 1)
          pend.push({ ...rec, kind: 'lead', preneur: s === preneur, trump: card.suit === atout, reflexTrump: reflex.suit === atout });
      }
      return a;
    },
  };
  play(E, {
    dealSeed: 1000 + g, botSeed: 5000 + g, reseed: true, regles: process.env.REGLES || undefined,
    decide: () => wrapped,
    on: {
      trick(G, winner) {
        for (const r of pend) r.won = winner % 2 === r.seat % 2;
        recs.push(...pend);
        pend = [];
      },
      score(G) {
        const c = G.contract;
        const r = G.dernierResultat;
        const seuil0 = c.montant === 80 ? 82 : c.montant;
        const bel = G.belote.beloteDeclared && G.belote.rebeloteDeclared;
        donnes.push({
          bids, montant: c.montant, atout: c.atout, preneur: c.preneur, coinche: c.coinche, reussi: r.reussi,
          net: r.reussi ? r.gain : -r.gain, marge: G.pointsPlis[c.equipePreneur] - (bel ? Math.max(81, seuil0 - 20) : seuil0),
          mains: G.mainsInitiales.map((h) => h.map((x) => x.id)),
        });
        for (const x of recs) (x.kind === 'ten' ? tens : leads).push(x);
        bids = [];
        recs = [];
      },
    },
  });
}

const pct = (a, n) => (n ? `${Math.round((100 * a) / n)} %` : '—');
const avg = (a, n) => (n ? `${a / n >= 0 ? '+' : ''}${Math.round(a / n)}` : '—');
function table(title, rows) {
  console.log(`\n${title}`);
  for (const [k, list] of rows) {
    const n = list.length;
    if (!n) continue;
    const ok = list.filter((d) => d.reussi).length;
    const co = list.filter((d) => d.coinche).length;
    console.log(`  ${k.padEnd(44)} n=${String(n).padStart(4)}  réussis ${pct(ok, n).padStart(5)}  coinchés ${pct(co, n).padStart(5)}  net ${avg(list.reduce((s, d) => s + d.net, 0), n).padStart(5)}  marge ${avg(list.reduce((s, d) => s + (d.montant < 250 ? d.marge : 0), 0), n)}`);
  }
}
const group = (list, key) => {
  const m = new Map();
  for (const x of list) {
    const k = key(x);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return [...m].sort((a, b) => b[1].length - a[1].length);
};
const lastBid = (d) => d.bids.filter((b) => b.montant).pop();
const tr = (hand, a) => hand.filter((id) => id.slice(-1) === a).map((id) => id.slice(0, -1));
const sideAces = (hand, a) => hand.filter((id) => id[0] === 'A' && id.slice(-1) !== a).length;

console.log(`${games} parties, ${donnes.length} donnes jouées, MC ${mc}${process.env.REGLES ? `, règles ${process.env.REGLES}` : ''}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
table('Contrats selon la raison de la dernière enchère', group(donnes, (d) => lastBid(d)?.why ?? null));
table('Contrats selon le palier', group(donnes, (d) => String(d.montant)).sort((a, b) => +a[0] - +b[0]));
table(
  'Interventions par la simulation dans sa couleur (pas celle du partenaire), selon la tenue',
  group(donnes, (d) => {
    const b = lastBid(d);
    if (b?.why !== 'intervention-sim' || d.bids.some((x) => x.seat === (b.seat + 2) % 4 && x.montant && x.atout === b.atout)) return null;
    const t = tr(b.hand, b.atout);
    return `${t.includes('J') ? (t.includes('9') ? 'Valet-9' : 'Valet') : t.includes('9') ? '9 sans Valet' : 'ni Valet ni 9'}, ${Math.min(t.length, 5)}${t.length >= 5 ? '+' : ''} atouts`;
  }).sort((a, b) => a[0].localeCompare(b[0])),
);
table(
  'Partenaire du preneur muet, adversaire muet, selon ses atouts et ses As',
  group(donnes, (d) => {
    if (d.montant >= 250 || d.bids.some((x) => x.montant && x.seat % 2 !== d.preneur % 2)) return null;
    const p = (d.preneur + 2) % 4;
    if (d.bids.some((x) => x.seat === p && x.montant)) return null;
    const t = tr(d.mains[p], d.atout);
    const kind = !t.length ? 'aucun atout' : t.length === 1 && !['J', '9', 'A'].includes(t[0]) ? 'un petit atout sec' : null;
    const as = sideAces(d.mains[p], d.atout);
    return kind && as ? `${kind}, ${as} As` : null;
  }).sort((a, b) => a[0].localeCompare(b[0])),
);
console.log('\n10 non maîtres (As dehors) et non secs posés avant le 4e joueur');
console.log(`  ${tens.length} (${(tens.length / donnes.length).toFixed(2)} par donne)`);
for (const [k, list] of group(tens, (x) => `${x.attack ? 'attaque' : 'défense'}, ${x.where}`))
  console.log(`  ${k.padEnd(30)} n=${String(list.length).padStart(4)}  pli fait ${pct(list.filter((x) => x.won).length, list.length).padStart(5)}  contre le réflexe ${pct(list.filter((x) => x.dev).length, list.length)}`);
console.log("\nEntames de l'attaque après le 1er pli, atout maître et au moins deux atouts, atouts dehors");
for (const [k, list] of group(leads, (x) => (x.preneur ? 'preneur' : 'partenaire')))
  console.log(`  ${k.padEnd(12)} n=${String(list.length).padStart(4)}  atout entamé ${pct(list.filter((x) => x.trump).length, list.length).padStart(5)}  le réflexe le tirait ${pct(list.filter((x) => x.reflexTrump).length, list.length)}`);
if (process.env.REGLES === 'essec')
  for (const a of ['TA', 'SA']) {
    const list = donnes.filter((d) => d.atout === a);
    console.log(`${a} : ${list.length} contrats (${pct(list.length, donnes.length)}), réussis ${pct(list.filter((d) => d.reussi).length, list.length)}`);
  }
