// Lisibilité des bots : un partenaire humain peut-il les prévoir et les lire ?
// Pour un engine.js donné, quatre mesures, dans une copie instrumentée du
// moteur (le fichier source n'est jamais modifié ; comme coinche-justesse.js,
// les bots ne voient rien de plus que d'habitude) :
//   1. INSTABILITÉ : on joue N parties de quatre bots, on capture des
//      positions réelles (enchère, entame, suite, coinche, surcoinche) et on
//      rejoue chacune K fois depuis le même état avec des graines différentes
//      (horloge figée). Part des décisions qui changent d'une graine à l'autre.
//   2. APPAREIL : mêmes positions, mêmes graines, avec une horloge lente (×k)
//      contre l'horloge figée. Part des réponses qui changent, et part des
//      décisions coupées avant la fin de leurs mondes.
//   3. CONVENTIONS, sur toutes les décisions des parties jouées (réflexe =
//      heuristicCard, final = la carte réellement jouée) : défense qui entame
//      atout, preneur V+9 (3 atouts ou plus) qui ne tire pas atout, défense
//      qui n'entame pas son As, vrais appels du réflexe écrasés par le
//      Monte-Carlo, appels lus faux (readDiscardSignal), relances dans la
//      couleur du partenaire sans honneur, surenchères sans Valet.
//   4. CORPUS : les cas concrets du rapport 2026-10-bots-coinche.md (mains et
//      séquences), reconstruits dans une vraie partie (createGame + actions),
//      rejoués sur plusieurs graines : distribution des décisions.
//   Plus un volet ENCHÈRES COMPLÈTES : mêmes donnes, graines de bots
//   différentes, le contrat final change-t-il ?
//   node tests/coinche-lisibilite.js [engine.js, défaut src/coinche/engine.js] [parties, défaut 10] [graines, défaut 5] [mondes, défaut 96] [options]
// Options : --json[=fichier] (résultats bruts), --seul=stab,conv,corpus,encheres,
//   --lent=k (horloge ×k, défaut 10), --graines-corpus=n (défaut 20),
//   --donnes=n (enchères complètes, défaut 24), --cas=ID,ID (filtre du corpus).
// Outil de diagnostic (pas un test) : à lancer avant/après une correction de
// lisibilité, sur deux engine.js pour comparer. Les sorties se lisent en
// parts de décisions (plus bas = plus lisible), sauf mention contraire.
// Horloge lente : tuning.now() rend k × le temps CPU du processus (un
// téléphone k fois plus lent que ce PC) ; elle compte aussi la génération des
// mondes, comme sur un vrai appareil, mais n'est reproductible qu'à peu près.
// Les parties, les graines et les mains du corpus sont, elles, exactement
// reproductibles (horloge figée). Défauts : environ 8 minutes de calcul, soit 2 à 3 minutes sur 4 cœurs libres
// (mesuré : 10 minutes avec 16 parties sur une machine partagée, en nice).
import { fork } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { play, rng, shuffle } from './coinche-sim.js';
import { seatView } from '../src/coinche/host.js';

const PROJ = path.join(import.meta.dirname, '..');

// ---- Instrumentation de la copie du moteur ------------------------------
// Un motif absent n'arrête pas l'outil (autre version du moteur) : la mesure
// concernée est simplement signalée comme indisponible.
function instrument(src) {
  const rep = [
    ['appels', 'function readDiscardSignal(seat, carte) {', `function readDiscardSignal(seat, carte) {
  const a0 = Object.keys(G.appel[seat]).length;
  const r0 = Object.keys(G.refus[seat]).length;
  try {
    return readDiscardSignal0(seat, carte);
  } finally {
    globalThis.__onSignal?.(seat, carte, G, !a0 && !!G.appel[seat][carte.suit], !r0 && !!G.refus[seat][carte.suit]);
  }
}
function readDiscardSignal0(seat, carte) {`],
    ['mondes (carte)', '  let best = 0;\n  totals.forEach((t, i) => {', '  globalThis.__mcN = [n, worlds.length];\n  let best = 0;\n  totals.forEach((t, i) => {'],
    ['mondes (enchère, coinche)', '    return n >= minWorlds ? ok / n : null;', '    (globalThis.__pm ||= []).push([n, worlds.length]);\n    return n >= minWorlds ? ok / n : null;'],
  ];
  const manques = [];
  for (const [nom, a, b] of rep) {
    if (src.split(a).length !== 2) { manques.push(nom); continue; }
    src = src.replace(a, () => b);
  }
  return { src, manques };
}

const add = (o, k, x = 1) => { o[k] = (o[k] || 0) + x; };
function merge(a, b) {
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'number') a[k] = (a[k] || 0) + v;
    else a[k] = merge(a[k] || {}, v);
  }
  return a;
}
const hash = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const horloge = (k) => (k ? () => k * cpuMs() : () => 0);
const median = (a) => { const b = a.filter((x) => x !== null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

// ---- Une décision rejouée -----------------------------------------------
// p : { snap (JSON de la vue du siège), seat, kind }. Rend la réponse sous
// forme de texte (P, 90H, 7S, oui, non), le plus petit nombre de mondes
// réellement joués et si la décision a été coupée avant la fin de ses mondes.
function decideKey(engine, p, rand, clock) {
  const { bots, tuning } = engine;
  const g = JSON.parse(p.snap);
  const saved = Math.random;
  Math.random = rand;
  tuning.now = clock;
  globalThis.__mcN = null;
  globalThis.__pm = [];
  let key;
  try {
    if (p.kind === 'coinche') key = bots.wantsToCoinche(g, p.seat) ? 'oui' : 'non';
    else if (p.kind === 'surcoinche') key = bots.wantsToSurcoinche(g, p.seat) ? 'oui' : 'non';
    else {
      const a = bots.turnAction(g, p.seat);
      key = !a ? '?' : a.type === 'JOUER' ? a.carte.id : a.type === 'PASSER' ? 'P' : a.montant + a.atout;
    }
  } finally {
    Math.random = saved;
    tuning.now = () => 0;
  }
  const used = globalThis.__mcN ? [globalThis.__mcN] : globalThis.__pm;
  return {
    key,
    nmin: used.length ? Math.min(...used.map((x) => x[0])) : null,
    short: used.some(([n, t]) => n < t),
    short24: used.some(([n]) => n < 24),
  };
}

// ---- Volet 1-3 : parties jouées, positions, conventions ------------------
const PROB = { enchere: 0.3, entame: 0.35, suite: 0.12, coinche: 0.6, surcoinche: 1 };

function tally(conv, name, bad, refBad) {
  const o = (conv[name] ||= {});
  add(o, 'n');
  if (bad) add(o, 'fin');
  if (refBad) add(o, 'ref');
}

function runGames(engine, from, to, P) {
  const { bots, computeLegal } = engine;
  const S = { games: 0, donnes: 0, donnes6: 0, dec: {}, conv: {}, sig: {}, stab: {} };
  const positions = [];
  let real = null;
  globalThis.__onSignal = (seat, carte, Gs, appel, refus) => {
    if (Gs !== real || (!appel && !refus)) return;
    const hand = real.hands[seat];
    const holdsA = hand.some((c) => c.suit === carte.suit && c.rank === 'A');
    const fallen = Gs.playedBy.some((h) => h.some((c) => c.id === 'A' + carte.suit));
    if (appel) {
      add(S.sig, 'appelsLus');
      if (!holdsA) add(S.sig, 'appelsFaux');
      if (fallen) add(S.sig, 'appelsAsTombe');
      if (!holdsA && fallen) add(S.sig, 'appelsFauxAsTombe');
    } else {
      add(S.sig, 'refusLus');
      if (carte.rank === 'J') add(S.sig, 'refusValet');
      if (holdsA) add(S.sig, 'refusAvecAs');
    }
  };
  for (let g = from; g < to; g++) {
    const sample = rng(555 + g);
    const firstDef = new Set();
    const take = (kind) => sample() < PROB[kind];
    const keep = (kind, seat, snap, classes) => positions.push({ id: g * 10000 + positions.length, kind, seat, snap, classes });
    const turnAction = (gv, s) => {
      const snap = gv.phase === 'ENCHERES' || gv.phase === 'JEU' ? JSON.stringify(gv) : null;
      const r = bots.turnAction(gv, s);
      if (!r) return r;
      if (gv.phase === 'ENCHERES') {
        add(S.dec, 'enchere');
        liveBid(gv, s, r);
        if (take('enchere')) keep('enchere', s, snap, ['enchere']);
      } else if (gv.phase === 'JEU' && r.type === 'JOUER') {
        liveCard(gv, s, r.carte, snap);
      }
      return r;
    };
    function liveBid(gv, s, r) {
      if (r.type !== 'ENCHERIR') return;
      const cur = gv.contract;
      const inSuit = gv.hands[s].filter((c) => c.suit === r.atout);
      const has = (...rk) => inSuit.some((c) => rk.includes(c.rank));
      const partnerSuits = gv.bidLog.filter((e) => e.seat === (s + 2) % 4 && e.montant).map((e) => e.atout);
      if (r.montant < 250 && partnerSuits.includes(r.atout)) {
        tally(S.conv, 'relance-couleur-partenaire-sans-honneur', !has('J', '9', 'A', '10'));
        tally(S.conv, 'relance-couleur-partenaire-sans-honneur-ni-2e-atout', !has('J', '9', 'A', '10') && inSuit.length <= 1);
        if (cur && cur.equipePreneur !== s % 2) tally(S.conv, 'relance-couleur-partenaire-sur-adversaire-sans-honneur', !has('J', '9', 'A', '10'));
      }
      if (cur && cur.equipePreneur !== s % 2 && r.montant < 250) {
        tally(S.conv, 'surenchere-adversaire-sans-valet', !has('J'));
        tally(S.conv, 'surenchere-adversaire-sans-valet-ni-9', !has('J', '9'));
      }
    }
    function liveCard(gv, s, fin, snap) {
      const atout = gv.contract.atout;
      const legal = computeLegal(gv.hands[s], gv.pliCourant, atout, s);
      if (legal.length < 2) { add(S.dec, 'forcees'); return; }
      const ref = bots.heuristicCard(gv, s);
      const lead = !gv.pliCourant.length;
      const isT = (c) => c.suit === atout;
      const early = gv.plisJoues <= 2;
      const def = s % 2 !== gv.contract.equipePreneur;
      add(S.dec, lead ? 'entame' : 'suite');
      tally(S.conv, 'carte-differente-du-reflexe', fin.id !== ref.id);
      let classes;
      if (lead) {
        classes = ['entame', 'cartes'];
        const mixed = legal.some(isT) && legal.some((c) => !isT(c));
        if (def && mixed) {
          tally(S.conv, 'defense-entame-atout', isT(fin), isT(ref));
          if (gv.plisJoues === 0) tally(S.conv, 'defense-entame-atout-pli1', isT(fin), isT(ref));
        }
        const k = g + ':' + gv.donneNumero;
        if (def && !firstDef.has(k)) {
          firstDef.add(k);
          classes.push('entame-defense-1re');
          if (legal.some((c) => c.rank === 'A' && !isT(c))) {
            const isA = (c) => c.rank === 'A' && !isT(c);
            tally(S.conv, 'defense-1re-entame-n-entame-pas-un-As', !isA(fin), !isA(ref));
            if (gv.plisJoues === 0) tally(S.conv, 'defense-1re-entame-n-entame-pas-un-As-pli1', !isA(fin), !isA(ref));
          }
        }
        if (s === gv.contract.preneur && mixed) {
          const mine = gv.hands[s].filter(isT);
          const dehors = 8 - gv.playedBy.flat().filter(isT).length - mine.length;
          if (mine.some((c) => c.rank === 'J') && mine.some((c) => c.rank === '9') && mine.length >= 3 && dehors > 0) {
            tally(S.conv, 'preneur-V9-3-atouts-ne-tire-pas-atout', !isT(fin), !isT(ref));
            if (mine.length === 3) tally(S.conv, 'preneur-V9-exactement-3-atouts-ne-tire-pas-atout', !isT(fin), !isT(ref));
            if (gv.plisJoues === 0) tally(S.conv, 'preneur-V9-3-atouts-ne-tire-pas-atout-pli1', !isT(fin), !isT(ref));
          }
        }
        if (s === gv.contract.preneur && mixed) {
          const mine = gv.hands[s].filter(isT);
          const dehors = 8 - gv.playedBy.flat().filter(isT).length - mine.length;
          if (mine.some((c) => c.rank === 'J') && !mine.some((c) => c.rank === '9') && mine.length >= 3 && dehors > 0)
            tally(S.conv, 'preneur-V-sans-9-3-atouts-ne-tire-pas-atout', !isT(fin), !isT(ref));
        }
        if (!def && mixed && isT(ref)) tally(S.conv, 'attaque-reflexe-atout-refuse-par-MC', !isT(fin));
      } else {
        classes = ['suite', 'cartes'];
        const ls = gv.pliCourant[0].carte.suit;
        const hand = gv.hands[s];
        if (!hand.some((c) => c.suit === ls) && !Object.keys(gv.appel[s]).length && !Object.keys(gv.refus[s]).length
            && ref.suit !== atout && ['7', '8', '9'].includes(ref.rank)
            && hand.some((c) => c.suit === ref.suit && c.rank === 'A') && hand.filter((c) => c.suit === ref.suit).length >= 2) {
          tally(S.conv, 'vrai-appel-du-reflexe-ecrase-par-MC', fin.id !== ref.id);
        }
      }
      if (early) classes.push('cartes-plis1-3');
      if (take(lead ? 'entame' : 'suite')) keep(lead ? 'entame' : 'suite', s, snap, classes);
    }
    const decide = () => ({
      turnAction,
      wantsToCoinche(gv, s) {
        const snap = JSON.stringify(gv);
        const r = bots.wantsToCoinche(gv, s);
        add(S.dec, 'coinche'); if (r) add(S.dec, 'coinches');
        if (take('coinche')) keep('coinche', s, snap, ['coinche']);
        return r;
      },
      wantsToSurcoinche(gv, s) {
        const snap = JSON.stringify(gv);
        const r = bots.wantsToSurcoinche(gv, s);
        add(S.dec, 'surcoinche'); if (r) add(S.dec, 'surcoinches');
        if (take('surcoinche')) keep('surcoinche', s, snap, ['surcoinche']);
        return r;
      },
    });
    play(engine, {
      dealSeed: 700000 + g, botSeed: 800000 + g, reseed: true, decide,
      deal: (G) => { real = G; return null; },
      on: { score(G) { add(S, 'donnes'); if (G.donneAnnonces.length >= 6) add(S, 'donnes6'); } },
    });
    add(S, 'games');
    console.error(`partie ${g} jouée (${positions.length} positions)`);
  }
  globalThis.__onSignal = null;
  S.positions = positions.length;
  return { S, positions };
}

// Rejoue chaque position K fois (graines 4242 + …), horloge figée, et, si
// lentK, avec la même graine et une horloge ×lentK.
function replayAll(engine, positions, K, lentK) {
  const T = {};
  for (const p of positions) {
    const fr = [];
    const sl = [];
    for (let k = 0; k < K; k++) {
      const sd = 4242 + 7919 * k + 31 * p.id;
      fr.push(decideKey(engine, p, rng(sd), () => 0));
      if (lentK) sl.push(decideKey(engine, p, rng(sd), horloge(lentK)));
    }
    const modal = (rs) => {
      const c = {};
      for (const r of rs) add(c, r.key);
      const e = Object.entries(c).sort((a, b) => b[1] - a[1]);
      return { top: e[0][0], topN: e[0][1], distinct: e.length, kinds: new Set(Object.keys(c)) };
    };
    const mf = modal(fr);
    const ms = lentK ? modal(sl) : null;
    for (const cls of p.classes) {
      const o = (T[cls] ||= {});
      add(o, 'n');
      if (mf.distinct > 1) add(o, 'instables');
      add(o, 'horsModale', 1 - mf.topN / K);
      add(o, 'distincts', mf.distinct);
      if (cls === 'enchere' && mf.distinct > 1) {
        const ks = [...mf.kinds];
        const f = ks.includes('P') ? 'passe-ou-annonce' : new Set(ks.map((x) => x.slice(-1))).size > 1 ? 'couleurs-differentes' : 'montants-differents';
        add((o.flips ||= {}), f);
      }
      if (lentK) {
        add(o, 'nLent');
        if (ms.distinct > 1) add(o, 'instablesLent');
        if (ms.top !== mf.top) add(o, 'modaleDiff');
        for (let k = 0; k < K; k++) {
          add(o, 'paires');
          if (fr[k].key !== sl[k].key) add(o, 'diff');
          if (sl[k].short) add(o, 'courts');
          if (sl[k].short24) add(o, 'courts24');
        }
      }
    }
  }
  return T;
}

// ---- Volet 4 : le corpus -------------------------------------------------
// Chaque cas : mains (siège → cartes ; les cartes non citées sont complétées
// au hasard reproductible), donneur (défaut 3 : le siège 0 parle et entame
// en premier), enc (annonces dans l'ordre des tours), jeu (cartes dans
// l'ordre), seat/decision si le décideur n'est pas le siège actif.
// « siège:JETON » force l'acteur ; COINCHE et SURCOINCHE sont des jetons.
// suivi = [libellé, test sur la réponse] : le comportement dont le rapport
// vague 1 parle (part des graines qui le font).
const atoutPli1 = 'JH QH KH 7H';
const CAS = [
  { id: 'OUV-1', ref: 'OUV-1', titre: 'premier, J-9-7 + A-10-K + A-10 (barème 160♥)', annonce: 'passe 10 donnes sur 30, alors que p(80♥) ≈ 1', mains: { 0: 'JH 9H 7H AS 10S KS AD 10D' }, suivi: ['passe', (k) => k === 'P'] },
  { id: 'OUV-2', ref: 'OUV-2 / C3', titre: 'premier, J-9-8-7-Q + A-10-K (Générale ?)', annonce: '500♥ : 3/16 vitesse réelle, 12/16 à ×20', mains: { 0: 'JH 9H 8H 7H QH AS 10S KS' }, lent: true, suivi: ['500♥', (k) => k === '500H'] },
  { id: 'OUV-3', ref: 'OUV-3', titre: 'premier, 9-10-8-7♥ ; J-9-7♠ ; AD', annonce: '100♥ plutôt que 90♠ (couleur au montant)', mains: { 0: '9H 10H 8H 7H JS 9S 7S AD' }, suivi: ['100♥', (k) => k === '100H'] },
  { id: 'OUV-4', ref: 'OUV-4', titre: '4e après 3 passes, Valet sec + As', annonce: '80♥ dans 17 cas sur 20', mains: { 3: 'JH AS 8S 7S AD 8D 7D 7C' }, enc: 'P P P', suivi: ['80♥', (k) => k === '80H'] },
  { id: 'OUV-5', ref: 'OUV-5', titre: 'premier, A-Q-8-7♥ + As (80 hors barème)', annonce: 'ouvre 9 fois sur 16, passe sinon', mains: { 0: 'AH QH 8H 7H AS 8S 7D 8C' }, suivi: ['ouvre', (k) => k !== 'P'] },
  { id: 'OUV-1b', ref: 'OUV-1', titre: 'premier, J-9-7♥ + A-10♠ + A♦ (barème 120♥)', annonce: 'V-9 avec A-10 : passe 2 fois sur 20', mains: { 0: 'JH 9H 7H AS 10S AD 8D 7C' }, suivi: ['passe', (k) => k === 'P'] },
  { id: 'OUV-1c', ref: 'OUV-1', titre: 'premier, J-9-8-7♥ + A-10♠ + A♦ (barème 160/130)', annonce: 'idem', mains: { 0: 'JH 9H 8H 7H AS 10S AD 8C' }, suivi: ['passe', (k) => k === 'P'] },
  { id: 'OUV-4b', ref: 'OUV-4', titre: '4e après 3 passes, Valet second + As', annonce: 'variante : 2 atouts', mains: { 3: 'JH 8H AS 8S 7S AD 8D 7C' }, enc: 'P P P', suivi: ['80♥', (k) => k === '80H'] },
  { id: 'OUV-4c', ref: 'OUV-4', titre: '4e après 3 passes, Valet troisième + As', annonce: 'variante : 3 atouts', mains: { 3: 'JH 8H 7H AS 8S AD 8D 7C' }, enc: 'P P P', suivi: ['80♥', (k) => k === '80H'] },
  { id: 'ZON-7a', ref: 'ZON-7', titre: 'capot 250♠ coinché, preneur V-A-10-R-D-7♠ + 2 As', annonce: 'jamais surcoinché (25/25)', mains: { 0: 'JS AS 10S KS QS 7S AH AD', 1: '9S 8S KH 7H 8H 9D 7D 7C' }, enc: '250S 1:COINCHE', seat: 0, decision: 'surcoinche', suivi: ['surcoinche', (k) => k === 'oui'] },
  { id: 'ZON-7b', ref: 'ZON-7', titre: 'capot 250♠ coinché, preneur V-9-7♠ + 2 As (douteux)', annonce: 'témoin : ne doit pas surcoincher', mains: { 0: 'JS 9S 7S AH AD 8D 7C 8C', 1: 'AS 10S KS 8S KH 7H 8H 9D' }, enc: '250S 1:COINCHE', seat: 0, decision: 'surcoinche', suivi: ['surcoinche', (k) => k === 'oui'] },
  { id: 'ENC-2', ref: 'ENC-2 / ENC-3', titre: 'J-A-8-7♥ + As♠ sur 80♠ adverse (P 80♠ P P)', annonce: '90♥ 14/20 ; 20/20 à 2 ms/monde ; passe 20/20 à 25 ms/monde ; 90 ou 100 tiré au sort (70/30)', mains: { 0: 'JH AH 8H 7H AS 9S 8D 7C' }, enc: 'P 80S P P', lent: true, suivi: ['90♥', (k) => k === '90H'] },
  { id: 'ENC-4', ref: 'ENC-4', titre: 'relance dans ♥ du partenaire, 7♥ sec + A-10♦ + A♣, sur 90♠ adverse', annonce: '100♥ dans 10 cas sur 16', mains: { 0: '7H AD 10D 9D AC KC 8S 7S' }, enc: 'P P 80H 90S', suivi: ['100♥', (k) => k === '100H'] },
  { id: 'ENC-5a', ref: 'ENC-5', titre: 'ouvreur 120♥ (2 fausses), partenaire 140♥ (« 3 As »)', annonce: 'l’ouvreur passe 10 fois sur 10', mains: { 0: 'JH 9H AH 7H 10H AS 8S 9D' }, enc: '120H P 140H P', suivi: ['passe', (k) => k === 'P'] },
  { id: 'ENC-5b', ref: 'ENC-5', titre: 'ouvreur 120♥, partenaire 130♥ (« 2 As »)', annonce: 'témoin : la lecture des clefs est décalée d’un As', mains: { 0: 'JH 9H AH 7H 10H AS 8S 9D' }, enc: '120H P 130H P', suivi: ['passe', (k) => k === 'P'] },
  { id: 'ENC-6a', ref: 'ENC-6', titre: 'ouvreur, J-9-Q-8-7♠ + 3 As (Générale ou capot ?)', annonce: 'Générale préférée au capot à probabilité égale', mains: { 0: 'JS 9S QS 8S 7S AH AD AC' }, suivi: ['500♠', (k) => k === '500S'] },
  { id: 'ENC-6b', ref: 'ENC-6', titre: 'même main, sur 80♥ du partenaire (P P 80♥ P)', annonce: 'idem', mains: { 0: 'JS 9S QS 8S 7S AH AD AC' }, enc: 'P P 80H P', suivi: ['500♠', (k) => k === '500S'] },
  { id: 'COI-6a', ref: 'COI-6', titre: 'défense sans atout, 3 As + 3 dix + 2 Rois, contre 120♠', annonce: '2,5 % de coinches', mains: { 0: 'AH AD AC 10H 10D 10C KH KD' }, enc: 'P 120S', seat: 0, decision: 'coinche', suivi: ['coinche', (k) => k === 'oui'] },
  { id: 'COI-6b', ref: 'COI-6', titre: 'même main contre 140♠', annonce: '100 % de coinches', mains: { 0: 'AH AD AC 10H 10D 10C KH KD' }, enc: 'P 140S', seat: 0, decision: 'coinche', suivi: ['coinche', (k) => k === 'oui'] },
  { id: 'COI-6c', ref: 'COI-6', titre: 'même main contre 160♠', annonce: 'témoin', mains: { 0: 'AH AD AC 10H 10D 10C KH KD' }, enc: 'P 160S', seat: 0, decision: 'coinche', suivi: ['coinche', (k) => k === 'oui'] },
  { id: 'COI-ctl', ref: 'témoin', titre: 'J-9-7♠ + 2 As contre 130♠', annonce: 'coinche stable (100 %)', mains: { 0: 'JS 9S 7S AH 8H AD 8D 7C' }, enc: 'P 130S', seat: 0, decision: 'coinche', suivi: ['coinche', (k) => k === 'oui'] },
  { id: 'COI-3', ref: 'COI-3 / C3', titre: 'J♠ sec + 7 petites cartes contre 100♠ (cas limite)', annonce: 'coinche sans raison sur appareil lent (3 à 5 %)', mains: { 0: 'JS 7H 8H 9H 7D 8D 7C 8C' }, enc: 'P 100S', seat: 0, decision: 'coinche', lent: true, suivi: ['coinche', (k) => k === 'oui'] },
  ...[100, 120, 130].flatMap((m) => [0.75, 1.35].map((aggr) => ({ id: `COI-1/${m}/${aggr}`, ref: 'COI-1', titre: `surcoinche ${m}♠ (coincheur : siège 1), J-9-7-8♠ + 2 As, personnalité aggr ${aggr}`, annonce: 'même main : surcoinche 69 % à 100 % selon la personnalité (Math.random() < 0,8 × aggr)', mains: { 0: 'JS 9S 7S 8S AH AD 7D 7C' }, enc: `${m}S 1:COINCHE`, seat: 0, aggr, suivi: ['surcoinche', (k) => k === 'oui'] }))),
  { id: 'ENT-1', ref: 'ENT-1 / ENT-7', titre: 'défense, 1re entame, 10♠ sec + A-8-7♦ + A-9-8♣ + 7♥ contre 80♥', annonce: '6 cartes différentes sur 20 graines ; le 10 sec peut sortir', mains: { 1: '10S AD 8D 7D AC 9C 8C 7H' }, donneur: 0, enc: 'P P P 80H P P P', suivi: ['atout 7♥', (k) => k === '7H'] },
  { id: 'ENT-1b', ref: 'ENT-1', titre: 'défense, 1re entame, 10♠ 10♣ V♦ 10♥ D♥ D♣ 8♣ R♦, atout ♦ (montant non cité : 80)', annonce: '6 entames sur 8 graines, dont le Valet d’atout', mains: { 1: '10S 10C JD 10H QH QC 8C KD' }, donneur: 0, enc: 'P P P 80D P P P', suivi: ['entame atout ♦', (k) => k.endsWith('D')] },
  { id: 'ENT-2', ref: 'ENT-2', titre: 'défense, 1re entame, A♣ A♦ 10♦ … contre 130♠', annonce: 'entame son 7♠ sec au lieu de l’As de carreau', mains: { 1: '9D AC 7S 10C QD 8C 10D AD' }, donneur: 0, enc: 'P P P 130S P P P', suivi: ['7♠ (atout)', (k) => k === '7S'] },
  { id: 'ENT-3', ref: 'ENT-3', titre: 'preneur 110♣ entame, J-9-D♣ + A♥ + 10♠ + A-9-7♦', annonce: 'entame 7♦ sur les 3 tirages, ne tire pas atout', mains: { 0: '7D AH JC 9C QC 10S 9D AD' }, enc: '110C P P P', suivi: ['tire atout ♣', (k) => k.endsWith('C')] },
  { id: 'EMP-3a', ref: 'EMP-3 / angle mort', titre: 'preneur 100♥, J-9-7♥ + A♠ 8♠ R♦ 7♦ 8♣', annonce: 'le Valet n’est joué sur aucune des 20 graines', mains: { 0: 'JH 9H 7H AS 8S KD 7D 8C' }, enc: '100H P P P', suivi: ['Valet ♥', (k) => k === 'JH'] },
  { id: 'EMP-3b', ref: 'EMP-3', titre: 'idem avec 4 atouts J-9-8-7♥', annonce: 'Valet + 9 + 3 atouts ou plus : atout entamé 33 %', mains: { 0: 'JH 9H 8H 7H AS 8S KD 7D' }, enc: '100H P P P', suivi: ['tire atout', (k) => k.endsWith('H')] },
  { id: 'EMP-3c', ref: 'EMP-3', titre: 'Valet sans le 9 (J-8-7♥), 100♥', annonce: 'Valet sans 9 : atout entamé 67 % (relation inversée)', mains: { 0: 'JH 8H 7H AS 8S KD 7D 8C' }, enc: '100H P P P', suivi: ['tire atout', (k) => k.endsWith('H')] },
  { id: 'EMP-3d', ref: 'EMP-3', titre: 'sans Valet (9-A-8-7♥), 80♥', annonce: 'témoin', mains: { 0: '9H AH 7H 8H AS 10S KD 8C' }, enc: '80H P P P', suivi: ['tire atout', (k) => k.endsWith('H')] },
  { id: 'ENT-4a', ref: 'ENT-4', titre: 'défense, 1re entame, partenaire a annoncé 80♠, adversaire 90♥', annonce: 'le MC s’écarte de la couleur annoncée par le partenaire (60 %)', mains: { 1: 'QS 8S KD 9D 7D 9C 8C 7H' }, donneur: 0, enc: 'P P 80S 90H P P P', suivi: ['♠ du partenaire', (k) => k.endsWith('S')] },
  { id: 'ENT-4b', ref: 'ENT-4 / ENT-5', titre: 'défense, pli 2 : le partenaire (siège 3) a défaussé 7♠ au pli 1 (appel)', annonce: 'le MC s’écarte de la couleur appelée (45 %) — scénario source incohérent, reconstruit', mains: { 0: 'KD 9D 10D JD', 1: 'AD 9S 8S 10C 8C 7C QD 8D', 2: '7D', 3: '7S AS' }, enc: '80H P P P', jeu: 'KD AD 7D 7S', suivi: ['♠ appelé', (k) => k.endsWith('S')] },
  { id: 'ENT-C', ref: 'C1 (exemple « preneur en second »)', titre: 'preneur 80♥, 7♠ entamé par la défense, A-R-V♠ (main reconstruite)', annonce: 'As, Roi ou Valet selon la graine (main non citée dans le rapport)', mains: { 0: 'AS KS JS 9H 8H AD 7C 8C', 3: '7S' }, donneur: 2, enc: 'P 80H P P P', jeu: '7S', suivi: ['As', (k) => k === 'AS'] },
  { id: 'SUI-4a', ref: 'SUI-4', titre: '4e à jouer, Dame du partenaire gagne, 10♣ 7♣ en main (plis 1-2 : atouts)', annonce: 'refuse de charger le 10 sous la Dame du partenaire', mains: { 0: '10C 7C 8D 9D 7S 8S 7H 8H', 1: 'JH 9H 8C', 2: 'QH 10H QC', 3: 'KH AH 9C' }, donneur: 0, enc: '100H P P P', jeu: `${atoutPli1} 9H 10H AH 8H 8C QC 9C`, suivi: ['charge le 10♣', (k) => k === '10C'] },
  { id: 'SUI-4a2', ref: 'SUI-4', titre: 'idem avec 10♣ R♣ 7♣', annonce: 'idem', mains: { 0: '10C KC 7C 8D 9D 8S 7H 8H', 1: 'JH 9H 8C', 2: 'QH 10H QC', 3: 'KH AH 9C' }, donneur: 0, enc: '100H P P P', jeu: `${atoutPli1} 9H 10H AH 8H 8C QC 9C`, suivi: ['charge le 10♣', (k) => k === '10C'] },
  { id: 'SUI-4b', ref: 'SUI-4', titre: 'As et 10♦ tombés, le partenaire gagne de l’As, R♦ V♦ en main', annonce: 'donne parfois un Roi devenu maître', mains: { 0: 'KD JD 7S 8S 9S 7C 7H 8D', 1: 'JH 10D 7D 8H 9H', 2: 'QH 9D AD 10H AH', 3: 'KH QD 8C' }, donneur: 0, enc: '100H P P P', jeu: `${atoutPli1} 10D 9D QD 8D 7D AD 8C`, suivi: ['donne le Roi', (k) => k === 'KD'] },
  { id: 'SUI-5', ref: 'SUI-5', titre: 'défausse libre, le partenaire a appelé ♣ (7♣ au pli 2), 10♣ 8♣ en main', annonce: '10 « menacé » donné dans la couleur appelée', mains: { 0: '10C 8C 7D 9D KD QD 7H 8D', 1: 'JH 9H AH 10D AD 7S QS JC', 2: 'QH 7C AS AC KC 9C 10S JS', 3: 'KH 10H 8H JD 8S 9S KS QC' }, donneur: 0, enc: '100H P P P', jeu: `${atoutPli1} 10D 7C JD 8D 7S AS 8S`, suivi: ['défausse le 10♣', (k) => k === '10C'] },
];

// Les scénarios d'entame de la vague 1 avaient les sièges 2 et 3 humains
// (le modèle de monde lit alors leurs enchères et leurs signaux autrement) :
// variantes « h » de ces cas, à comparer à la version quatre bots.
for (const id of ['ENT-1', 'ENT-1b', 'ENT-2', 'EMP-3a', 'ENT-4a', 'ENT-4b']) {
  const c = CAS.find((x) => x.id === id);
  CAS.push({ ...c, id: id + 'h', humains: [2, 3], titre: c.titre + ' — sièges 2 et 3 humains' });
}

// Construit la situation réelle : donne imposée, enchères et plis joués par
// le vrai moteur. Rend la vue du siège qui décide (ce que le bot verrait).
function situation(engine, c) {
  const { createGame, actOn, SUITS, RANKS } = engine;
  const ids = SUITS.flatMap((s) => RANKS.map((r) => r + s));
  const mk = (id) => ({ suit: id.slice(-1), rank: id.slice(0, -1), id });
  const given = [0, 1, 2, 3].map((s) => (c.mains?.[s] ?? '').split(/\s+/).filter(Boolean));
  const used = new Set();
  for (const h of given) for (const id of h) {
    if (!ids.includes(id) || used.has(id)) throw new Error(`${c.id}: carte invalide ou en double (${id})`);
    used.add(id);
  }
  const rest = shuffle(ids.filter((id) => !used.has(id)), rng(hash(c.id)));
  const hands = given.map((h) => {
    const hh = h.slice();
    if (hh.length > 8) throw new Error(`${c.id}: plus de 8 cartes`);
    while (hh.length < 8) hh.push(rest.pop());
    return hh;
  });
  const dealFn = () => hands.map((h) => h.map(mk));
  let n = 0;
  const r = () => (n++ === 0 ? ((c.donneur ?? 3) + 0.5) / 4 : 0.5);
  const G = createGame([0, 1, 2, 3].map(() => ({ type: 'bot', name: 'Ordinateur' })), r, dealFn);
  if (c.aggr) for (const p of G.personalities ?? []) p.aggr = c.aggr;
  for (const h of c.humains ?? []) G.seats[h].type = 'human';
  for (const t of `${c.enc ?? ''} ${c.jeu ?? ''}`.split(/\s+/).filter(Boolean)) {
    let seat = G.joueurActif;
    let tok = t;
    const m = /^(\d):(.+)$/.exec(t);
    if (m) { seat = +m[1]; tok = m[2]; }
    let action;
    const bid = /^(\d+)([HDCS])$/.exec(tok);
    if (tok === 'P') action = { type: 'PASSER' };
    else if (tok === 'COINCHE') action = { type: 'COINCHER' };
    else if (tok === 'SURCOINCHE') action = { type: 'SURCOINCHER' };
    else if (bid && +bid[1] >= 80) action = { type: 'ENCHERIR', montant: +bid[1], atout: bid[2] };
    else {
      const carte = G.hands[seat].find((x) => x.id === tok);
      if (!carte) throw new Error(`${c.id}: ${tok} n'est pas dans la main du siège ${seat}`);
      action = { type: 'JOUER', carte };
    }
    const err = actOn(G, seat, action, r, dealFn);
    if (err) throw new Error(`${c.id}: refus « ${err} » sur ${t} (siège ${seat})`);
  }
  const seat = c.seat ?? G.joueurActif;
  const kind = c.decision ?? (G.phase === 'ENCHERES' ? 'enchere' : G.phase === 'JEU' ? 'carte' : G.phase === 'SURCOINCHE' ? 'surcoinche' : null);
  if (!kind) throw new Error(`${c.id}: phase ${G.phase}`);
  if ((kind === 'enchere' || kind === 'carte') && G.joueurActif !== seat) throw new Error(`${c.id}: c'est au siège ${G.joueurActif}, pas au ${seat}`);
  return { seat, kind, g: seatView(G, seat) };
}

function runCorpus(engine, idxs, P) {
  const out = [];
  for (const i of idxs) {
    const c = CAS[i];
    const sit = situation(engine, c);
    const p = { snap: JSON.stringify(sit.g), seat: sit.seat, kind: sit.kind };
    const res = { i, id: c.id, kind: sit.kind, dist: {}, lent: {} };
    if (sit.kind === 'carte') res.reflex = engine.bots.heuristicCard(JSON.parse(p.snap), sit.seat).id;
    for (let k = 0; k < P.cg; k++) add(res.dist, decideKey(engine, p, rng(77 + 104729 * k + hash(c.id) % 100003), () => 0).key);
    if (c.lent) {
      for (const f of [P.lent, 3 * P.lent]) {
        const d = {};
        const ns = [];
        let courts = 0;
        for (let k = 0; k < P.cg; k++) {
          const r = decideKey(engine, p, rng(77 + 104729 * k + hash(c.id) % 100003), horloge(f));
          add(d, r.key);
          ns.push(r.nmin);
          if (r.short) courts++;
        }
        res.lent[f] = { dist: d, nmed: median(ns), courts };
      }
    }
    out.push(res);
  }
  return out;
}

// ---- Volet 5 : enchères complètes -----------------------------------------
const lcg = (n) => { let s = n; return () => (s = (s * 48271) % 2147483647) / 2147483647; };
function auction(engine, dealSeed, botSeed) {
  const { createGame, actOn, bots, tuning } = engine;
  const r = lcg(dealSeed);
  const G = createGame([0, 1, 2, 3].map(() => ({ type: 'bot', name: 'b' })), r);
  const saved = Math.random;
  Math.random = rng(botSeed);
  tuning.now = () => 0;
  try {
    const start = G.donneNumero;
    let bids = 0;
    for (let guard = 0; G.phase === 'ENCHERES' && G.donneNumero === start && guard < 40; guard++) {
      const s = G.joueurActif;
      const v = seatView(G, s);
      const a = bots.decideBid(v, s);
      if (a.type === 'ENCHERIR') bids++;
      actOn(G, s, { ...a, memo: { bidMemo: v.bidMemo[s], forced: v.forced } }, r);
    }
    const c = G.donneNumero === start ? G.contract : null;
    return { final: c ? `${c.preneur}:${c.montant}${c.atout}` : 'tous passent', team: c ? c.preneur % 2 : -1, bids };
  } finally {
    Math.random = saved;
  }
}
function runAuctions(engine, from, to, K) {
  const A = { donnes: 0, finalDiff: 0, teamDiff: 0, longues: 0, runs: 0 };
  for (let d = from; d < to; d++) {
    const runs = Array.from({ length: K }, (_, k) => auction(engine, 1000 + d * 31337, 777 + (k + 1) * 99991));
    add(A, 'donnes');
    if (new Set(runs.map((x) => x.final)).size > 1) add(A, 'finalDiff');
    if (new Set(runs.map((x) => x.team)).size > 1) add(A, 'teamDiff');
    for (const x of runs) { add(A, 'runs'); if (x.bids >= 6) add(A, 'longues'); }
  }
  return A;
}

// ---- Rapport --------------------------------------------------------------
const pc = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : 'n/a');
const pc1 = (a, b) => (b ? `${(100 * a / b).toFixed(1)} %` : 'n/a');
const sym = (k) => k.replace(/([HDCS])$/, (m) => ({ H: '♥', D: '♦', C: '♣', S: '♠' })[m]);
const fmtDist2 = (d) => Object.entries(d).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => `${sym(k)}×${n}`).join(' ');

const LABEL = {
  enchere: 'enchères', entame: 'entames', suite: 'suites (2e à 4e)', cartes: 'cartes (entames + suites)',
  'cartes-plis1-3': 'cartes, plis 1 à 3', 'entame-defense-1re': '1re entame de la défense', coinche: 'coinches', surcoinche: 'surcoinches',
};
const CONV = {
  'defense-entame-atout': ['défense qui entame atout (entame avec choix, tous plis)', 'jamais'],
  'defense-entame-atout-pli1': ['défense qui entame atout au pli 1', 'jamais'],
  'preneur-V9-3-atouts-ne-tire-pas-atout': ['preneur V+9, 3 atouts ou plus, atouts adverses encore dehors : n’entame pas atout', 'tire atout'],
  'preneur-V9-exactement-3-atouts-ne-tire-pas-atout': ['idem, avec exactement 3 atouts', 'tire atout'],
  'preneur-V-sans-9-3-atouts-ne-tire-pas-atout': ['témoin : preneur Valet sans le 9, 3 atouts ou plus : n’entame pas atout', 'tire atout'],
  'preneur-V9-3-atouts-ne-tire-pas-atout-pli1': ['idem, au pli 1 seulement', 'tire atout'],
  'attaque-reflexe-atout-refuse-par-MC': ['entame d’atout du réflexe (attaque) refusée par le Monte-Carlo', 'garder le réflexe'],
  'defense-1re-entame-n-entame-pas-un-As': ['défense, 1re entame de la donne avec un As hors atout : n’entame pas un As', 'entame l’As'],
  'defense-1re-entame-n-entame-pas-un-As-pli1': ['idem, au pli 1 seulement', 'entame l’As'],
  'vrai-appel-du-reflexe-ecrase-par-MC': ['vrai appel du réflexe (petite carte sous l’As) écrasé par le Monte-Carlo', 'garder l’appel'],
  'relance-couleur-partenaire-sans-honneur': ['relance dans la couleur du partenaire sans J, 9, A ni 10', 'un honneur ou 2 atouts'],
  'relance-couleur-partenaire-sans-honneur-ni-2e-atout': ['idem, avec au plus 1 atout', 'un honneur ou 2 atouts'],
  'relance-couleur-partenaire-sur-adversaire-sans-honneur': ['idem, au-dessus d’une enchère adverse', 'un honneur ou 2 atouts'],
  'surenchere-adversaire-sans-valet': ['surenchère sur l’adversaire sans le Valet', 'Valet'],
  'surenchere-adversaire-sans-valet-ni-9': ['surenchère sur l’adversaire sans Valet ni 9', 'Valet ou 9'],
  'carte-differente-du-reflexe': ['carte jouée ≠ réflexe (toutes cartes avec choix)', '(information)'],
};

function rapport(R, P, titre) {
  const S = R.S;
  let md = `\n## ${titre}\n\n`;
  md += `${S.games || 0} parties, ${S.donnes || 0} donnes, ${S.positions || 0} positions rejouées ; graines ${P.graines}, mondes ${P.mondes}, horloge lente ×${P.lent}.${R.manques.length ? ' Mesures indisponibles sur cet engine.js : ' + R.manques.join(', ') + '.' : ''}\n`;
  if (P.seul.has('stab')) {
    md += `\n### 1. Instabilité : même état, ${P.graines} graines, horloge figée\n\nUne décision est « instable » si les ${P.graines} graines ne donnent pas toutes la même réponse. « Hors réponse majoritaire » : part moyenne des tirages qui s’écartent de la réponse la plus fréquente.\n\n| décision | positions | instables | hors réponse majoritaire | réponses distinctes (moy.) |\n|---|---|---|---|---|\n`;
    for (const k of Object.keys(LABEL)) {
      const o = R.stab[k];
      if (!o) continue;
      md += `| ${LABEL[k]} | ${o.n} | ${pc(o.instables || 0, o.n)} | ${pc(o.horsModale || 0, o.n)} | ${(o.distincts / o.n).toFixed(2)} |\n`;
    }
    const fl = R.stab.enchere?.flips;
    if (fl) md += `\nEnchères instables, nature du changement : ${Object.entries(fl).map(([k, n]) => `${k} ${n}`).join(', ')}.\n`;
    md += `\n### 2. Sensibilité à l’appareil : horloge ×${P.lent} contre horloge figée, mêmes graines\n\n« Réponse différente » : part des (position, graine) dont la réponse change. « Coupées » : part des tirages arrêtés avant la fin de leurs mondes (< 24 : sous le plancher du capot).\n\n| décision | positions | réponse différente | réponse majoritaire différente | coupées avant la fin | coupées avant 24 mondes | instables en lent |\n|---|---|---|---|---|---|---|\n`;
    for (const k of Object.keys(LABEL)) {
      const o = R.stab[k];
      if (!o || !o.paires) continue;
      md += `| ${LABEL[k]} | ${o.nLent} | ${pc(o.diff || 0, o.paires)} | ${pc(o.modaleDiff || 0, o.nLent)} | ${pc(o.courts || 0, o.paires)} | ${pc(o.courts24 || 0, o.paires)} | ${pc(o.instablesLent || 0, o.nLent)} |\n`;
    }
  }
  if (P.seul.has('conv')) {
    md += `\n### 3. Conventions, sur les décisions des parties jouées\n\n« réflexe » : part où le réflexe (heuristicCard) viole la convention ; « final » : part où la carte réellement jouée la viole. Les décisions forcées (une seule carte légale) sont exclues : ${S.dec.forcees || 0} forcées sur ${(S.dec.entame || 0) + (S.dec.suite || 0) + (S.dec.forcees || 0)} coups de carte. Pour les enchères, seule la colonne « final » existe.\n\n| convention violée | n | réflexe | final | attendu |\n|---|---|---|---|---|\n`;
    for (const [k, [lib, att]] of Object.entries(CONV)) {
      const o = S.conv[k];
      if (!o) { md += `| ${lib} | 0 | – | – | ${att} |\n`; continue; }
      const noRef = k.startsWith('relance') || k.startsWith('surenchere');
      md += `| ${lib} | ${o.n} | ${noRef ? '–' : pc1(o.ref || 0, o.n)} | ${pc1(o.fin || 0, o.n)} | ${att} |\n`;
    }
    const g = S.sig || {};
    md += `\nSignaux de défausse lus (readDiscardSignal), ${g.appelsLus || 0} appels et ${g.refusLus || 0} refus lus :\n\n| lecture | n | part |\n|---|---|---|\n`;
    md += `| appels lus faux (le défausseur n’a pas l’As de la couleur) | ${g.appelsLus || 0} | ${pc1(g.appelsFaux || 0, g.appelsLus)} |\n`;
    md += `| appels lus sur une couleur dont l’As est déjà tombé | ${g.appelsLus || 0} | ${pc1(g.appelsAsTombe || 0, g.appelsLus)} |\n`;
    md += `| refus lus avec l’As en main | ${g.refusLus || 0} | ${pc1(g.refusAvecAs || 0, g.refusLus)} |\n`;
    md += `| refus lus sur un Valet (le bot n’émet un refus qu’avec R ou D) | ${g.refusLus || 0} | ${pc1(g.refusValet || 0, g.refusLus)} |\n`;
    md += `\nDonnes à 6 enchères ou plus (hors passes) : ${S.donnes6 || 0} sur ${S.donnes || 0} (${pc1(S.donnes6 || 0, S.donnes)}). Coinches : ${S.dec.coinches || 0} sur ${S.dec.coinche || 0} décisions ; surcoinches : ${S.dec.surcoinches || 0} sur ${S.dec.surcoinche || 0}.\n`;
  }
  if (P.seul.has('corpus') && R.corpus.length) {
    md += `\n### 4. Corpus : ${P.cg} graines, horloge figée, ${P.mondes} mondes\n\n« suivi » : part des graines qui font le comportement dont parle le rapport vague 1. Horloge lente : ×${P.lent} puis ×${3 * P.lent} (mondes médians joués, tirages coupés).\n\n| cas | situation | annoncé (vague 1) | réponses sur ${P.cg} graines | réflexe | suivi |\n|---|---|---|---|---|---|\n`;
    for (const r of R.corpus) {
      const c = CAS[r.i];
      const suivi = c.suivi ? `${c.suivi[0]} : ${pc(Object.entries(r.dist).filter(([k]) => c.suivi[1](k)).reduce((a, [, n]) => a + n, 0), P.cg)}` : '';
      md += `| ${r.id} | ${c.titre} | ${c.annonce} | ${fmtDist2(r.dist)} | ${r.reflex ? sym(r.reflex) : '–'} | ${suivi} |\n`;
      for (const [f, l] of Object.entries(r.lent)) {
        const sv = c.suivi ? `${pc(Object.entries(l.dist).filter(([k]) => c.suivi[1](k)).reduce((a, [, n]) => a + n, 0), P.cg)}` : '';
        md += `| ↳ ×${f} | | | ${fmtDist2(l.dist)} | mondes médian ${l.nmed ?? '–'}, ${l.courts} coupés | ${sv} |\n`;
      }
    }
  }
  if (P.seul.has('encheres') && R.auc.donnes) {
    const A = R.auc;
    md += `\n### 5. Enchères complètes entre bots : ${A.donnes} donnes × ${P.graines} graines de bots\n\n| mesure | valeur |\n|---|---|\n| donnes dont le contrat final change d’une graine à l’autre | ${A.finalDiff} sur ${A.donnes} (${pc(A.finalDiff, A.donnes)}) |\n| donnes dont le camp preneur change | ${A.teamDiff} sur ${A.donnes} (${pc(A.teamDiff, A.donnes)}) |\n| enchères à 6 annonces ou plus (hors passes) | ${A.longues} sur ${A.runs} (${pc1(A.longues, A.runs)}) |\n`;
  }
  return md;
}

// ---- Programme -------------------------------------------------------------
if (process.argv[2] === '--worker') {
  const job = JSON.parse(process.argv[3]);
  const engine = await import(pathToFileURL(job.file).href);
  const t = engine.tuning;
  t.mcSamples = t.bidWorlds = t.bidSamples = job.P.mondes;
  t.now = () => 0;
  const out = { S: {}, stab: {}, corpus: [], auc: {} };
  if (job.P.seul.includes('stab') || job.P.seul.includes('conv')) {
    const { S, positions } = runGames(engine, job.games[0], job.games[1], job.P);
    out.S = S;
    if (job.P.seul.includes('stab')) out.stab = replayAll(engine, positions, job.P.graines, job.P.lent);
  }
  if (job.P.seul.includes('corpus')) out.corpus = runCorpus(engine, job.cas, job.P);
  if (job.P.seul.includes('encheres')) out.auc = runAuctions(engine, job.donnes[0], job.donnes[1], job.P.graines);
  process.send(out, () => process.exit(0));
} else {
  const opt = {};
  const pos = [];
  for (const a of process.argv.slice(2)) {
    const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
    if (m) opt[m[1]] = m[2] ?? true;
    else pos.push(a);
  }
  const [src = path.join(PROJ, 'src/coinche/engine.js'), n = '10', k = '5', mondes = '96'] = pos;
  const P = {
    mondes: +mondes, graines: +k, lent: +(opt.lent ?? 10), cg: +(opt['graines-corpus'] ?? 20),
    donnes: +(opt.donnes ?? 24),
    seul: new Set((opt.seul ?? 'stab,conv,corpus,encheres').split(',')),
  };
  const only = opt.cas ? new Set(opt.cas.split(',')) : null;
  const idxs = CAS.map((_, i) => i).filter((i) => !only || only.has(CAS[i].id));
  const { src: code, manques } = instrument(fs.readFileSync(src, 'utf8'));
  const file = path.join(os.tmpdir(), `coinche-lisibilite-${Date.now()}.js`);
  fs.writeFileSync(file, code);
  const W = Math.max(1, Math.min(os.availableParallelism?.() ?? os.cpus().length, +n || 1));
  const per = Math.ceil(+n / W);
  const dper = Math.ceil(P.donnes / W);
  const t0 = Date.now();
  const parts = await Promise.all(Array.from({ length: W }, (_, w) => new Promise((res, rej) => {
    const job = {
      file, P: { ...P, seul: [...P.seul] },
      games: [w * per, Math.min(+n, (w + 1) * per)],
      donnes: [w * dper, Math.min(P.donnes, (w + 1) * dper)],
      cas: idxs.filter((_, j) => j % W === w),
    };
    const child = fork(import.meta.filename, ['--worker', JSON.stringify(job)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    let out = null;
    child.on('message', (m) => { out = m; });
    child.on('exit', (code) => (code ? rej(new Error('worker ' + code)) : res(out)));
  })));
  fs.unlinkSync(file);
  const R = { S: {}, stab: {}, corpus: [], auc: {}, manques };
  for (const o of parts.filter(Boolean)) {
    merge(R.S, o.S); merge(R.stab, o.stab); merge(R.auc, o.auc);
    R.corpus.push(...o.corpus);
  }
  R.corpus.sort((a, b) => a.i - b.i);
  const titre = `Lisibilité des bots — ${path.relative(PROJ, path.resolve(src))}, ${n} parties, ${((Date.now() - t0) / 60000).toFixed(1)} min`;
  if (opt.json) {
    const j = JSON.stringify({ titre, params: { ...P, seul: [...P.seul] }, ...R }, null, 1);
    if (opt.json === true) console.log(j); else fs.writeFileSync(opt.json, j);
  }
  if (!(opt.json === true)) console.log(rapport(R, P, titre));
}
