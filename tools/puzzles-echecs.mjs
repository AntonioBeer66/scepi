// Puzzles du jour des échecs (site/assets/js/echecs/puzzles.json) : mats
// forcés en 2 ou 3 coups, tirés de parties que Stockfish joue contre
// lui-même avec un peu de hasard. On garde une position seulement si chaque
// coup du camp qui mate est le seul à forcer le mat aussi vite (dernier coup
// excepté : tout mat est accepté par la page). Créations originales, sans
// base extérieure ni licence à citer.
//   npm i --no-save stockfish@19.0.1
//   STOCKFISH=node_modules/stockfish/bin/stockfish-19-lite-single.js node tools/puzzles-echecs.mjs 200
// Quatre moteurs en parallèle ; l'ordre de sortie dépend de leur vitesse.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const COUNT = Number(process.argv[2]) || 200;
const OUT = new URL("../site/assets/js/echecs/puzzles.json", import.meta.url);
const enginePath = process.env.STOCKFISH;
if (!enginePath) throw new Error("STOCKFISH=chemin/vers/stockfish.js manquant (voir l'en-tête)");

// chess.js du site (version navigateur, variable globale Chess).
const Chess = new Function(`${readFileSync(new URL("../site/assets/js/echecs/chess.min.js", import.meta.url), "utf8")}; return Chess;`)();

// Hasard reproductible : mulberry32, un par moteur.
function prng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Un moteur UCI : une commande, puis les lignes jusqu'à « bestmove ».
function engine() {
  const sf = spawn(process.execPath, [enginePath], { stdio: ["pipe", "pipe", "inherit"] });
  let buffer = "";
  let waiting = null;
  let lines = [];
  sf.stdout.on("data", (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      lines.push(line);
      if (waiting && line.startsWith(waiting.until)) {
        const w = waiting;
        waiting = null;
        w.done(lines);
        lines = [];
      }
    }
  });
  const send = (cmd, until) =>
    new Promise((done) => {
      lines = [];
      waiting = { until, done };
      sf.stdin.write(cmd + "\n");
    });
  // Analyse en multipv : pour chaque ligne, { mate, cp, pv }.
  async function analyse(fen, { depth, multipv = 1 }) {
    await send(`setoption name MultiPV value ${multipv}\nisready`, "readyok");
    const out = await send(`position fen ${fen}\ngo depth ${depth}`, "bestmove");
    const best = {};
    for (const l of out) {
      const m = / depth (\d+) .*multipv (\d+) score (mate|cp) (-?\d+).* pv (.+)$/.exec(l);
      if (m && +m[1] === depth)
        best[m[2]] = { mate: m[3] === "mate" ? +m[4] : null, cp: m[3] === "cp" ? +m[4] : null, pv: m[5].split(" ") };
    }
    return Object.values(best);
  }
  return { send, analyse, kill: () => sf.kill() };
}

const uci = (game, u) => game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

// La position fen (camp au trait) mate-t-elle en 2 ou 3, avec un premier coup
// unique à chaque étape ? Rend { n, line } (coups UCI) ou null.
async function uniqueMate(sf, fen) {
  const [first, second] = await sf.analyse(fen, { depth: 16, multipv: 2 });
  if (!first || !(first.mate >= 2 && first.mate <= 3)) return null;
  const n = first.mate;
  if (second && second.mate != null && second.mate > 0 && second.mate <= n + 1) return null;
  if (second && second.cp != null && second.cp > 250) return null; // l'autre coup gagne aussi largement
  const line = first.pv.slice(0, 2 * n - 1);
  if (line.length !== 2 * n - 1) return null;
  // Étapes intermédiaires : le coup suivant du gagnant doit lui aussi être unique.
  const g = new Chess(fen);
  for (let i = 0; i < line.length - 1; i++) {
    if (!uci(g, line[i])) return null;
    if (i % 2 === 0) continue;
    const [a, b] = await sf.analyse(g.fen(), { depth: 14, multipv: 2 });
    if (!a || a.pv[0] !== line[i + 1] || !(a.mate > 0)) return null;
    if (b && b.mate != null && b.mate > 0 && b.mate <= a.mate) return null;
  }
  if (!uci(g, line[line.length - 1]) || !g.in_checkmate()) return null;
  return { n, line };
}

const puzzles = [];
const seen = new Set();
let games = 0;

// Un moteur joue des parties jusqu'à ce que le compte soit atteint : coups
// d'ouverture au hasard, puis un des trois meilleurs coups à profondeur 8.
// Cette même analyse repère un mat en 2 ou 3, vérifié ensuite en profondeur.
async function run(seed) {
  const rand = prng(seed);
  const sf = engine();
  await sf.send("uci", "uciok");
  while (puzzles.length < COUNT) {
    games++;
    const g = new Chess();
    for (let i = 0; i < 4; i++) {
      const moves = g.moves();
      g.move(moves[Math.floor(rand() * moves.length)]);
    }
    while (!g.game_over() && g.history().length < 160 && puzzles.length < COUNT) {
      const lines = await sf.analyse(g.fen(), { depth: 8, multipv: 3 });
      if (!lines.length) break;
      if (g.history().length >= 16 && lines[0].mate >= 2 && lines[0].mate <= 3) {
        const p = await uniqueMate(sf, g.fen());
        const key = g.fen().split(" ").slice(0, 4).join(" ");
        if (p && !seen.has(key)) {
          seen.add(key);
          puzzles.push({ fen: g.fen(), mat: p.n, solution: p.line });
          process.stderr.write(`\r${puzzles.length}/${COUNT} puzzles (${games} parties)`);
          break; // une seule position par partie : plus de variété
        }
      }
      if (!uci(g, lines[Math.floor(rand() * lines.length)].pv[0])) break;
    }
  }
  sf.kill();
}

const base = Number(process.env.SEED) || 2026;
await Promise.all([0, 1, 2, 3].map((i) => run(base * 10 + i)));
// Ordre mélangé (reproductible) : pas deux puzzles d'une même partie à la suite.
const rand = prng(base);
for (let i = puzzles.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [puzzles[i], puzzles[j]] = [puzzles[j], puzzles[i]];
}
writeFileSync(OUT, JSON.stringify({ version: 1, puzzles: puzzles.slice(0, COUNT) }) + "\n");
console.error(`\n${Math.min(COUNT, puzzles.length)} puzzles écrits dans ${OUT.pathname}`);
