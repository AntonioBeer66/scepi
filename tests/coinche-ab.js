// Duel A/B en « duplicate » entre deux versions de l'IA : le moteur de la
// version B arbitre la partie, les sièges d'une équipe délèguent leurs
// décisions (enchère, carte, coinche, surcoinche) au moteur A. Chaque donne
// est jouée deux fois, équipes échangées : la chance des cartes s'annule.
//   node tests/coinche-ab.js <A/engine.js> <B/engine.js> [parties par processus] [mondes MC, défaut 48]
// Les fichiers sont copiés au lancement : on peut modifier le jeu pendant un duel.
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { play } from './coinche-sim.js';

const WORKERS = Math.max(1, os.cpus().length - 2);

async function load(file, mc) {
  const engine = await import(pathToFileURL(file).href);
  if (mc !== undefined) engine.tuning.mcSamples = mc;
  engine.tuning.now = () => 0;
  return engine;
}

async function worker(fileA, fileB, start, n, mc) {
  const A = await load(fileA, mc);
  const B = await load(fileB, mc);
  const res = { games: 0, winsB: 0, pairs: 0, diff: 0, diff2: 0, stats: { A: {}, B: {} } };
  const bump = (v, k, x = 1) => { res.stats[v][k] = (res.stats[v][k] || 0) + x; };
  for (let g = start; g < start + n; g++) {
    const runs = [];
    for (const teamA of [0, 1]) {
      const byDonne = new Map();
      const G = play(B, {
        dealSeed: 1000 + g, botSeed: 5000 + g,
        decide: (seat) => (seat % 2 === teamA ? A.bots : B.bots),
        on: {
          score(G) {
            const c = G.contract;
            const r = G.dernierResultat;
            const gain = [0, 0];
            gain[r.reussi ? c.equipePreneur : 1 - c.equipePreneur] = r.gain;
            byDonne.set(G.donneNumero - 1, gain[1 - teamA] - gain[teamA]); // B − A
            const v = c.equipePreneur === teamA ? 'A' : 'B';
            bump(v, 'contrats'); bump(v, 'montant', c.montant);
            if (r.reussi) bump(v, 'reussis');
            if (c.coinche) { const d = v === 'A' ? 'B' : 'A'; bump(d, 'coinches'); if (!r.reussi) bump(d, 'coinchesGagnees'); }
          },
        },
      });
      res.games++;
      const w = G.scores[0] > G.scores[1] ? 0 : 1;
      if (w !== teamA) res.winsB++;
      runs.push(byDonne);
    }
    for (const [k, d] of runs[0]) {
      if (!runs[1].has(k)) continue;
      const x = (d + runs[1].get(k)) / 2;
      res.pairs++; res.diff += x; res.diff2 += x * x;
    }
  }
  return res;
}

if (process.argv[2] === '--worker') {
  const [, , , a, b, start, n, mc] = process.argv;
  process.stdout.write(JSON.stringify(await worker(a, b, +start, +n, mc === '' ? undefined : +mc)));
} else {
  const [a, b, per = '20', mc = ''] = process.argv.slice(2);
  const stamp = Date.now();
  const snap = (f, tag) => { const p = path.join(os.tmpdir(), `coinche-ab-${stamp}-${tag}.js`); fs.copyFileSync(f, p); return p; };
  const fa = snap(a, 'A');
  const fb = snap(b, 'B');
  const t0 = Date.now();
  const jobs = Array.from({ length: WORKERS }, (_, w) => new Promise((res, rej) => execFile(process.execPath,
    [import.meta.filename, '--worker', fa, fb, String(w * +per), per, mc], { maxBuffer: 1e8 }, (e, out, err) => (e ? rej(new Error(err || e.message)) : res(JSON.parse(out))))));
  Promise.all(jobs).then((parts) => {
    const r = parts.reduce((x, y) => {
      for (const k of ['games', 'winsB', 'pairs', 'diff', 'diff2']) x[k] += y[k];
      for (const v of ['A', 'B']) for (const [k, n] of Object.entries(y.stats[v])) x.stats[v][k] = (x.stats[v][k] || 0) + n;
      return x;
    });
    const mean = r.diff / r.pairs;
    const sd = Math.sqrt(r.diff2 / r.pairs - mean * mean);
    const p = r.winsB / r.games;
    const s = (v) => {
      const t = r.stats[v];
      return `${t.contrats} contrats (moy. ${(t.montant / t.contrats).toFixed(0)}), ${(100 * t.reussis / t.contrats).toFixed(0)} % réussis, ${t.coinches || 0} coinches dont ${t.coinchesGagnees || 0} gagnées`;
    };
    console.log(`${r.games} parties (${r.games / 2} donnes jumelles de départ), ${((Date.now() - t0) / 1000).toFixed(0)} s, MC = ${mc || 'défaut'}`);
    console.log(`B − A : ${mean >= 0 ? '+' : ''}${mean.toFixed(2)} pts/donne ± ${(2 * sd / Math.sqrt(r.pairs)).toFixed(2)} (2σ, ${r.pairs} paires)`);
    console.log(`Parties gagnées par B : ${(100 * p).toFixed(1)} % ± ${(200 * Math.sqrt(p * (1 - p) / r.games)).toFixed(1)}`);
    console.log(`A : ${s('A')}`);
    console.log(`B : ${s('B')}`);
    fs.unlinkSync(fa); fs.unlinkSync(fb);
  }, (e) => { console.error(e.message); process.exit(1); });
}
