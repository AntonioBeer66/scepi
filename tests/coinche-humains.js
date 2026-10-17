// Ce que font les humains (journal anonyme, worker/journal.js), à côté des
// bots : une observation, pas une vérité. Télécharge les nouvelles donnes
// puis résume enchères, remontées, entames d'atout et temps de réflexion.
//   SCEPI_PASSWORD=<mot de passe des actus> node tests/coinche-humains.js [fichier, défaut donnes-humaines.jsonl]
// Sans mot de passe : analyse seulement le fichier déjà téléchargé.
import fs from 'fs';
import { trickWinnerSeat } from '../src/coinche/engine.js';

const FILE = process.argv[2] || 'donnes-humaines.jsonl';
const SITE = 'https://www.scepinvaders.com';
const SUITS = ['H', 'D', 'C', 'S'];

const rows = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
if (process.env.SCEPI_PASSWORD) {
  for (;;) {
    const since = rows.length ? rows[rows.length - 1].id : 0;
    const res = await fetch(`${SITE}/api/journal?depuis=${since}`, { headers: { 'x-articles-password': process.env.SCEPI_PASSWORD } });
    if (!res.ok) throw new Error(`export refusé (${res.status})`);
    const got = (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l));
    if (!got.length) break;
    rows.push(...got);
    fs.appendFileSync(FILE, got.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
}
const donnes = rows.map((r) => r.donne);
if (!donnes.length) { console.log('Aucune donne pour l\'instant.'); process.exit(0); }

const add = (o, k, x = 1) => { o[k] = (o[k] || 0) + x; };
const pct = (a, b) => (b ? `${Math.round((100 * (a || 0)) / b)} %` : '—');
const median = (a) => { if (!a.length) return '—'; const s = [...a].sort((x, y) => x - y); return `${(s[s.length >> 1] / 1000).toFixed(1)} s`; };
const who = (d, s) => (d.humains[s] ? 'humain' : 'bot');
const card = (id) => ({ id, rank: id.slice(0, -1), suit: id.slice(-1) });

const bids = {}; const leads = {}; const contracts = {};
const thinkBid = []; const thinkCard = [];
for (const d of donnes) {
  // Annonces : tenue d'atout de celui qui parle, remontée ou non.
  d.encheres.forEach(([s, m, a], i) => {
    if (!m || m >= 250) return;
    const h = d.mains[s];
    if (h.length !== 8) return;
    const earlier = d.encheres.slice(0, i);
    const partner = [...earlier].reverse().find(([x, mm]) => x === (s + 2) % 4 && mm);
    const type = partner && partner[2] === a ? 'remontée' : earlier.some(([, mm]) => mm) ? 'intervention / changement' : 'ouverture';
    const has = (r, su = a) => h.includes(r + su);
    const k = `${who(d, s)} — ${type}`;
    const o = (bids[k] ||= {});
    add(o, 'n');
    add(o, 'atouts', h.filter((id) => id.endsWith(a)).length);
    if (has('J')) add(o, 'valet');
    if (has('9')) add(o, 'neuf');
    if (!has('J') && !has('9') && !has('A')) add(o, 'sansTenue');
  });
  // Partenaire qui pouvait remonter : a-t-il remonté ?
  for (const [s, m, a] of d.encheres) {
    if (!m) continue;
    const p = (s + 2) % 4;
    const after = d.encheres.slice(d.encheres.findIndex((e) => e[0] === s && e[1] === m && e[2] === a) + 1);
    const reply = after.find(([x]) => x === p);
    if (!reply || d.mains[p].length !== 8) continue;
    const k = `${who(d, p)} — répond à son partenaire`;
    const o = (bids[k] ||= {});
    add(o, 'n');
    if (reply[1] && reply[2] === a) add(o, 'remonte');
  }
  // Entames : l'atout tiré par le camp du preneur, entamé par la défense.
  if (d.contrat) {
    const [preneur, montant, atout, , , generale] = d.contrat;
    const tricks = [];
    let leader = generale ? preneur : (d.donneur + 1) % 4;
    for (let t = 0; t < 8; t++) {
      const pli = [0, 1, 2, 3].map((i) => (leader + i) % 4).map((s) => ({ siege: s, carte: card(d.jeu[s][t]) }));
      tricks.push(pli);
      leader = trickWinnerSeat(pli, atout);
    }
    tricks.forEach((pli, t) => {
      const s = pli[0].siege;
      const attack = s % 2 === preneur % 2;
      const k = `${who(d, s)} — ${attack ? 'attaque' : 'défense'} — ${t === 0 ? 'pli 1' : t < 3 ? 'plis 2-3' : 'plis 4-8'}`;
      const o = (leads[k] ||= {});
      add(o, 'n');
      if (pli[0].carte.suit === atout) add(o, 'atout');
    });
    const k = `${who(d, preneur)} preneur`;
    const o = (contracts[k] ||= {});
    add(o, 'n');
    if (d.reussi) add(o, 'ok');
    add(o, 'montant', montant);
  }
  // Temps : les annonces du joueur viennent d'abord, puis ses cartes.
  const nb = d.encheres.filter(([s]) => s === d.moi).length;
  d.temps.forEach((t, i) => (i < nb ? thinkBid : thinkCard).push(t));
}

console.log(`\n${donnes.length} donnes (${donnes.filter((d) => d.mode === 'solo').length} en solo, ${donnes.filter((d) => d.mode === 'ligne').length} en ligne), ${donnes.filter((d) => d.contrat).length} jouées.`);
console.log('\n| annonces | n | atouts moyens | Valet | 9 | sans Valet, 9 ni As | remonte |\n|---|---|---|---|---|---|---|');
for (const [k, o] of Object.entries(bids).sort()) console.log(`| ${k} | ${o.n} | ${o.atouts ? (o.atouts / o.n).toFixed(1) : '—'} | ${pct(o.valet, o.n)} | ${pct(o.neuf, o.n)} | ${pct(o.sansTenue, o.n)} | ${pct(o.remonte, o.n)} |`);
console.log('\n| entames | n | atout |\n|---|---|---|');
for (const [k, o] of Object.entries(leads).sort()) console.log(`| ${k} | ${o.n} | ${pct(o.atout, o.n)} |`);
console.log('\n| contrats | n | réussis | montant moyen |\n|---|---|---|---|');
for (const [k, o] of Object.entries(contracts).sort()) console.log(`| ${k} | ${o.n} | ${pct(o.ok, o.n)} | ${(o.montant / o.n).toFixed(0)} |`);
console.log(`\nTemps de décision médian du joueur : annonce ${median(thinkBid)}, carte ${median(thinkCard)}.`);
