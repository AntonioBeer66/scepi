// Justesse des mondes imaginés : à chaque fois qu'un bot imagine les mains
// cachées (enchère, coinche, carte), on compare ses mondes aux vraies mains
// — après coup, la vérité venant de l'arbitre, dans une copie instrumentée
// du moteur : les bots ne voient rien de plus. Puis on refait les mêmes
// mondes en retirant un indice à la fois (enchères du partenaire, des
// adversaires, passes, appels/refus, cartes posées) pour mesurer ce que
// chacun apporte — ou ce qu'il fausse.
//   node tests/coinche-justesse.js [engine.js, défaut src/coinche/engine.js] [parties, défaut 360] [mondes MC, défaut 48]
// Outil de diagnostic (pas un test) : à lancer avant un duel pour toute
// idée de « lecture » (enchères, signaux, cartes posées) — moins bruité
// qu'un duel, il dit où les mondes se trompent et quel indice y contribue.
// p(vrai) = part des mondes qui mettent la carte chez son vrai détenteur ;
// perte log = −ln p(vrai) (plus bas = meilleur).
import { fork } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJ = path.join(import.meta.dirname, '..');
const { play } = await import(pathToFileURL(PROJ + '/tests/coinche-sim.js').href);

function instrument(src) {
  const rep = [
    ['function mcWorlds(seat, n) {', `function mcWorlds(seat, n) {
  globalThis.__viewer = seat;
  globalThis.__trueFits = (hands) => bidReadings().map((r, i) => ({ i, seat: r.e.seat, type: globalThis.__readingType(r), r, h: maskOf(hands[r.e.seat]) | maskOf(G.playedBy[r.e.seat]), fit: bidFits(r, maskOf(hands[r.e.seat]) | maskOf(G.playedBy[r.e.seat])) }));
  globalThis.__dbg = { supportPoints, openingBid, bestOpening, G };
  const w = mcWorlds0(seat, n);
  const hook = globalThis.__beliefHook;
  if (hook && !hook.busy && w.length) {
    hook.busy = true;
    try {
      hook(G, seat, w, (cue, k) => {
        globalThis.__cue = cue;
        try { return mcWorlds0(seat, k); } finally { globalThis.__cue = null; }
      });
    } finally { hook.busy = false; }
  }
  return w;
}
function mcWorlds0(seat, n) {`],
    ['    if (r.e.seat !== s || r.e.auto) continue;', '    if (r.e.seat !== s || r.e.auto || !globalThis.__cueBid(r, s)) continue;'],
    ['  for (const suit of Object.keys(G.appel[s])) {', '  if (globalThis.__cue?.appel !== false) for (const suit of Object.keys(G.appel[s])) {'],
    ['function canHold(s, c) {\n  return (', 'function canHold(s, c) {\n  if (globalThis.__cue?.voids === false) return true;\n  return ('],
  ];
  for (const [a, b] of rep) {
    if (src.split(a).length !== 2) throw new Error('motif introuvable : ' + a.slice(0, 60));
    src = src.replace(a, () => b);
  }
  return src;
}

const K = 48; // mondes par configuration comparée
const CUES = {
  full: null,
  contraintes: { bids: false, appel: false },
  sansEncheres: { bids: false },
  sansPartenaire: { partner: false },
  sansAdversaires: { opp: false },
  sansPasses: { passes: false },
  sansAppels: { appel: false },
  sansCartes: { voids: false },
};
const VALUE = {
  'enchères': 'sansEncheres',
  'du partenaire': 'sansPartenaire',
  'des adversaires': 'sansAdversaires',
  'passes': 'sansPasses',
  'appels/refus': 'sansAppels',
  'cartes posées': 'sansCartes',
};
// Une enchère (ou passe) r du siège s compte-t-elle dans la configuration en cours ?
globalThis.__cueBid = (r, s) => {
  const cue = globalThis.__cue;
  if (!cue) return true;
  if (cue.bids === false) return false;
  if (cue.passes === false && !r.e.montant) return false;
  const partner = s === (globalThis.__viewer + 2) % 4;
  if (cue.partner === false && partner) return false;
  if (cue.opp === false && !partner) return false;
  return true;
};

const add = (o, k, x = 1) => { o[k] = (o[k] || 0) + x; };
globalThis.__readingType = (r) => {
  const e = r.e;
  const team = e.seat % 2;
  if (e.montant) {
    if (e.montant >= 250) return 'capot/générale';
    if (r.partnerBid && r.partnerBid.atout === e.atout) return 'remontée du partenaire';
    if (!e.cur) return 'ouverture' + (e.passes === 3 ? ' en 4e' : '');
    if (e.cur.preneur % 2 !== team) return "intervention sur l'adversaire";
    return 'changement de couleur';
  }
  if (!e.cur) return "passe d'ouverture";
  if (e.cur.preneur % 2 === team) return r.acted ? 'passe (a déjà parlé)' : 'passe sans remonter le partenaire';
  return "passe sur l'adversaire";
};

function catOf(c, atout) {
  if (c.suit === atout) return c.rank === 'J' ? 'Valet atout' : c.rank === '9' ? '9 atout' : 'autre atout';
  return c.rank === 'A' ? 'As' : c.rank === '10' ? '10' : 'petite/habillée';
}
function bigCat(c, atout) {
  if (c.suit === atout) return c.rank === 'J' || c.rank === '9' ? 'J/9 atout' : 'autre atout';
  return c.rank === 'A' ? 'As' : 'autre';
}
function phaseOf(G) {
  if (G.phase === 'JEU') return G.plisJoues === 0 ? 'jeu, pli 1' : G.plisJoues < 4 ? 'jeu, plis 2-4' : 'jeu, plis 5-8';
  return G.phase === 'ENCHERES' ? 'enchères/coinche' : G.phase.toLowerCase();
}
// Ce que le détenteur s a dit pendant les enchères.
function paroleOf(G, s) {
  const mine = G.bidLog.filter((e) => e.seat === s);
  const team = s % 2;
  const raised = mine.some((e) => e.montant && e.cur && e.cur.preneur % 2 === team && e.cur.atout === e.atout);
  if (raised) return 'a remonté son partenaire';
  if (mine.some((e) => e.montant)) return 'a annoncé sa couleur';
  if (mine.some((e) => e.cur && e.cur.preneur % 2 === team)) return "n'a pas remonté son partenaire";
  if (mine.some((e) => e.cur)) return "a passé sur l'adversaire";
  return 'a passé (rien sur la table)';
}

function makeHook(S) {
  return (G, seat, worlds, again) => {
    const real = globalThis.__realG;
    const truth = {};
    const cards = {};
    for (let s = 0; s < 4; s++) if (s !== seat) for (const c of real.hands[s]) { truth[c.id] = s; cards[c.id] = c; }
    const ids = Object.keys(truth);
    if (!ids.length) return;
    const atout = G.contract?.atout;
    // Lecture de chaque enchère / passe sur la VRAIE main de celui qui a parlé.
    for (const t of globalThis.__trueFits(real.hands)) {
      const key = real.donneNumero + ':' + t.i;
      if (t.seat === seat || S.seen.has(key)) continue;
      S.seen.add(key);
      const o = (S.fits[t.type] ||= {});
      add(o, 'n'); add(o, t.fit === 0 ? 'rejet' : t.fit < 1 ? 'bluff' : 'ok');
    }
    const sets = { full: again({}, K) }; // même nombre de mondes pour toutes les configurations
    for (const [k, cue] of Object.entries(CUES)) if (cue) sets[k] = again(cue, K);
    const pt = {};
    for (const [k, ws] of Object.entries(sets)) {
      if (!ws.length) return;
      const cnt = {};
      const pos = {};
      for (const w of ws) for (const s of Object.keys(w)) for (const c of w[s]) {
        if (+s === truth[c.id]) add(cnt, c.id);
        if (k === 'full') add(pos, c.id + '@' + s);
      }
      pt[k] = Object.fromEntries(ids.map((id) => [id, ((cnt[id] || 0) + 0.1) / (ws.length + 0.3)]));
      if (k === 'full') {
        for (const id of ids) for (let s = 0; s < 4; s++) {
          if (s === seat) continue;
          const p = (pos[id + '@' + s] || 0) / ws.length;
          const o = (S.calib[Math.min(9, Math.floor(p * 10))] ||= {});
          add(o, 'n'); add(o, 'p', p); if (truth[id] === s) add(o, 'hit');
        }
      }
    }
    const phase = phaseOf(G);
    const ph = G.phase === 'JEU' ? 'jeu' : 'enchères';
    for (const id of ids) {
      const s = truth[id];
      const rel = s === (seat + 2) % 4 ? 'partenaire' : 'adversaire';
      const keys = [
        `phase|${phase}`,
        `carte|${catOf(cards[id], atout)} chez ${rel}`,
        `parole|${paroleOf(G, s)} — ${bigCat(cards[id], atout)} (${ph})`,
      ];
      for (const key of keys) {
        const o = (S.t[key] ||= {});
        add(o, 'n');
        for (const k of Object.keys(sets)) { add(o, 'p_' + k, pt[k][id]); add(o, 'll_' + k, -Math.log(pt[k][id])); }
        if (pt.full[id] < 0.05) add(o, 'surFaux');
        if (pt.contraintes[id] < 0.05) add(o, 'surFaux0');
        if (pt.full[id] < pt.contraintes[id] - 0.15) add(o, 'trompe');
        if (pt.full[id] > pt.contraintes[id] + 0.15) add(o, 'aide');
      }
    }
    add(S, 'decisions');
  };
}

function merge(a, b) {
  a.decisions = (a.decisions || 0) + (b.decisions || 0);
  for (const k of ['t', 'calib', 'fits']) for (const [r, o] of Object.entries(b[k])) { const t = (a[k][r] ||= {}); for (const [x, v] of Object.entries(o)) add(t, x, v); }
  return a;
}

function report(S, title) {
  const f = (x, d = 3) => x.toFixed(d);
  const names = Object.keys(VALUE);
  let md = `\n## ${title}\n\n${S.decisions} décisions analysées. p(vrai) = part des mondes qui placent la carte chez son vrai détenteur (1 = lecture parfaite). « gain lecture » = baisse de la perte log apportée par la lecture des enchères et des appels, par rapport aux seules contraintes des cartes posées. Colonnes « valeur » : points de p(vrai) (×100) perdus quand on retire cet indice (négatif : l'indice trompe). « sûr mais faux » : p(vrai) < 0,05 avec la lecture / avec les seules contraintes. « aide / trompe » : la lecture déplace p(vrai) de plus de 0,15 dans le bon / le mauvais sens.\n`;
  for (const group of ['phase', 'carte', 'parole']) {
    md += `\n| ${group} | cartes | p(vrai) lecture | p(vrai) contraintes | gain lecture (perte log) | ${names.map((k) => 'valeur ' + k).join(' | ')} | aide / trompe | sûr mais faux |\n|---|---|---|---|---|${names.map(() => '---|').join('')}---|---|\n`;
    const rows = Object.entries(S.t).filter(([k]) => k.startsWith(group + '|')).sort((a, b) => (group === 'parole' ? a[0].localeCompare(b[0]) : b[1].n - a[1].n));
    for (const [k, o] of rows) {
      const m = (x) => (o[x] || 0) / o.n;
      md += `| ${k.split('|')[1]} | ${o.n} | ${f(m('p_full'))} | ${f(m('p_contraintes'))} | ${f(m('ll_contraintes') - m('ll_full'))} | ${Object.values(VALUE).map((c) => (100 * (m('p_full') - m('p_' + c))).toFixed(1)).join(' | ')} | ${Math.round(100 * m('aide'))} % / ${Math.round(100 * m('trompe'))} % | ${(100 * m('surFaux')).toFixed(1)} % / ${(100 * m('surFaux0')).toFixed(1)} % |\n`;
    }
  }
  md += `\nLecture des enchères sur la vraie main de celui qui a parlé (une fois par annonce) : « rejetée » = la lecture juge cette main impossible (poids 0,0001), « bluff » = jugée bluff (0,07).\n\n| annonce | n | lue juste | bluff | rejetée |\n|---|---|---|---|---|\n`;
  for (const [k, o] of Object.entries(S.fits).sort((a, b) => b[1].n - a[1].n))
    md += `| ${k} | ${o.n} | ${Math.round(100 * (o.ok || 0) / o.n)} % | ${Math.round(100 * (o.bluff || 0) / o.n)} % | ${Math.round(100 * (o.rejet || 0) / o.n)} % |\n`;
  md += `\nCalibration (lecture complète) : prédit → réel\n\n| prédit | paires | réel |\n|---|---|---|\n`;
  for (let b = 0; b < 10; b++) { const o = S.calib[b]; if (o) md += `| ${f(o.p / o.n, 2)} | ${o.n} | ${f((o.hit || 0) / o.n, 2)} |\n`; }
  return md;
}

if (process.argv[2] === '--worker') {
  const [, , , file, from, to, mc] = process.argv;
  const engine = await import(pathToFileURL(file).href);
  engine.tuning.now = () => 0;
  engine.tuning.mcSamples = +mc;
  const S = { t: {}, calib: {}, fits: {}, seen: new Set() };
  globalThis.__beliefHook = makeHook(S);
  // L'arbitre passe le vrai état à chaque distribution (null : mélange normal).
  const deal = (G) => { globalThis.__realG = G; return null; };
  for (let g = +from; g < +to; g++) play(engine, { dealSeed: 500000 + g, botSeed: 900000 + g, reseed: true, deal });
  delete S.seen;
  process.send(S);
} else {
  const [src = path.join(PROJ, 'src/coinche/engine.js'), n = '360', mc = '48'] = process.argv.slice(2);
  const file = path.join(os.tmpdir(), `coinche-justesse-${Date.now()}.js`);
  fs.writeFileSync(file, instrument(fs.readFileSync(src, 'utf8')));
  const W = Math.min(+n, os.availableParallelism?.() ?? os.cpus().length);
  const per = Math.ceil(+n / W);
  const t0 = Date.now();
  const parts = await Promise.all(Array.from({ length: W }, (_, w) => new Promise((res, rej) => {
    const child = fork(import.meta.filename, ['--worker', file, w * per, Math.min(+n, (w + 1) * per), mc], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    let out = null;
    child.on('message', (m) => { out = m; });
    child.on('exit', (code) => (code ? rej(new Error('worker ' + code)) : res(out)));
  })));
  const S = parts.filter(Boolean).reduce(merge, { t: {}, calib: {}, fits: {} });
  fs.unlinkSync(file);
  console.log(report(S, `Justesse des mondes — ${path.basename(path.dirname(src))}, ${n} parties, MC ${mc}, ${((Date.now() - t0) / 60000).toFixed(1)} min`));
}
