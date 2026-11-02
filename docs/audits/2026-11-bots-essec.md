# Bots du salon ESSEC : Tout Atout et Sans Atout (2026-11-02)

Fichier à donner à Claude pour implémenter la variante sur le site. Tout est
dans ce fichier : contexte, patch, mesures, tests, déploiement.

## Ce que fait la variante

Seulement quand `G.regles === ESSEC` (table 5 et salons privés « règles
ESSEC ») ; les autres salons passent par le code d'avant (`decideBidV1`
inchangé, les chemins à la couleur identiques).

Avant : à TA/SA les bots jouaient des réflexes minimaux (`simpleCard`), ne
les annonçaient jamais, ne les coinchaient jamais, et après une annonce TA/SA
ouvraient seulement au barème.

Après :
- **Jeu de la carte** : le Monte-Carlo marche à TA/SA. Réflexe et joueur
  simulé = `simpleCard` amélioré (`rolloutCard`) : entamer une carte
  maîtresse (`masterIn`), sinon la plus petite ; partenaire maître ou dernier
  à jouer : charger ; gagner au plus juste ; sinon la plus petite. Pas de
  signaux ni de conventions d'entame à TA/SA, pas de fin exacte (elle suppose
  une couleur d'atout).
- **Mondes imaginés à Tout Atout** : qui joue sous le maître de la couleur
  demandée n'a rien de plus fort dans cette couleur (`G.suitMax`, lu par
  `canHold`).
- **Enchères** (`simBid`) : TA et SA jugés par simulation sur les mondes de
  la décision ; palier d'espérance maximale dont la réussite simulée ≥
  `tuning.essecMin` (0,65 ; +0,1 au-dessus de son partenaire). Si TA/SA est
  déjà sur la table, les six atouts passent par la simulation.
- **Coinche / surcoinche** de TA/SA : mêmes règles que pour la couleur.
- Outils : `REGLES=essec node tests/coinche-ab.js A.js B.js [parties/cœur]
  [mondes]` duel au salon ESSEC ; les copies du duel sont faites à côté du
  moteur (l'import relatif `client/i18n.js` cassait depuis `%TEMP%`).

## Mesures (duels duplicate, salon ESSEC, MC 48, `tests/coinche-ab.js`)

| B contre A | pts/donne (2σ) | parties gagnées B |
|---|---|---|
| **variante contre moteur 59c87f4** (540 donnes de départ) | **+7,08 ± 2,07** | 57,2 % |
| SA : entamer petit + ne pas gaspiller As/10 | −6,06 ± 2,88 | 46,1 % → rejeté |
| SA : ne pas prendre un pli ≤ 4 pts avec As/10 | −0,40 ± 1,57 | rejeté |
| `essecMin` 0,55 | −0,54 ± 2,24 | gardé 0,65 |
| `essecMin` 0,75 | +1,57 ± 2,34 | n.s., gardé 0,65 |

Diagnostic (20 parties, réflexes seuls) : TA/SA ≈ 12 % des contrats, palier
moyen 93 ; TA réussi 79 %, SA 60 %.

## Recherche : stratégies conseillées et ce qu'en font les bots

- Annoncer TA avec ≥ 3 Valets ou des séquences V-9-As ; SA avec ≥ 3 As ou
  2 As + longue séquence ; de préférence en entamant (juste après le
  donneur) — GameDuell, belot.bg. La simulation joue la donne depuis la
  vraie position : elle en tient compte sans règle.
- TA : faire tomber Valets et 9, garder As et 10 (maîtres ensuite), charger
  le partenaire maître ; V-As-10 : chasser le 9 avec le 10 — belot.bg. Les
  réflexes suivent les trois premiers ; le Monte-Carlo trouve le reste.
- SA : garder As et 10 pour la fin, entamer petit, laisser l'adversaire
  gaspiller ses honneurs — belot.bg (belote bulgare, As à 11). Testé :
  perdant ici (As à 19 au salon ESSEC), rejeté.
- Coincher un TA/SA annoncé trop vite quand on tient les couleurs —
  belot.bg : c'est la coinche par simulation.

Sources : https://www.gameduell.fr/gd/belote/belote-coinche-strategies.html ·
https://belot.bg/academy/advanced/saveti-pri-igra-na-vsichko-koz/ ·
https://belot.bg/academy/advanced/saveti-pri-igra-na-bez-koz/ ·
https://belot.bg/academy/advanced/poziciata-pod-raka-v-belota/ ·
https://belot.bg/academy/advanced/koga-da-kajesh-kontra/ ·
https://vipbelote.fr/blog/belote-tout-savoir-sur-le-tout-atout-et-le-sans-atout/

## Implémenter

1. Sur `main` à jour (le patch part de 77b3bce), enregistrer le bloc
   ci-dessous dans `essec.patch`, puis `git apply essec.patch`. S'il ne
   s'applique pas (main a bougé), refaire les changements à la main d'après
   la description ci-dessus : ils sont tous dans `src/coinche/engine.js`
   (`simBid`, `decideBid`/`decideBidV1`, `masterIn`, `rolloutCard`,
   `simpleCard`, `noteTrumpObligations`, `canHold`, `playOut`, `mcValue`,
   `mcChooseCard`, `botChooseCard`, coinche/surcoinche, `tuning.essecMin`),
   `tests/coinche-sim.js`, `tests/coinche-ab.js`, `tests/coinche-essec.test.js`.
2. `npm test` (doit sortir 0 ; les lignes « ERROR: invalid move » sont
   attendues, ce sont des refus testés).
3. Facultatif : `REGLES=essec node tests/coinche-ab.js <ancien engine.js> src/coinche/engine.js 30 48`
   (≈ 28 min) — attendu ≈ +7 pts/donne.
4. Commit sur main, push, puis `npm run deploy` (rien ne déploie tout seul).
5. Vérifier en jeu à la table 5 : un bot annonce TA/SA de temps en temps,
   et joue ses cartes sans délai anormal (même budget de mondes qu'à la
   couleur).

## Patch

```diff
diff --git a/src/coinche/engine.js b/src/coinche/engine.js
index 640d1f3..5d450bd 100644
--- a/src/coinche/engine.js
+++ b/src/coinche/engine.js
@@ -267,6 +267,7 @@ function startNewDonne() {
   if (essec()) {
     G.parole = null; // siège qui a dit « parole » (voir act)
     G.misere = null; // siège dont la misère a annulé la donne précédente
+    G.suitMax = [{}, {}, {}, {}]; // Tout Atout : carte la plus forte encore possible, par siège et couleur
   }
   G.passesConsecutives = 0;
   G.multiplicateur = 1;
@@ -751,7 +752,49 @@ function generaleBid(seat, hand, cur, team) {
   return { type: "ENCHERIR", montant: best.montant, atout: best.atout };
 }
 
+// Salon ESSEC : Tout Atout et Sans Atout n'ont pas de barème. La simulation
+// joue chaque contrat (réflexes de simpleCard) sur les mondes de la décision
+// et l'on annonce le palier d'espérance la plus haute dont la réussite
+// dépasse tuning.essecMin ; derrière son propre partenaire, 0,1 de plus.
+function simBid(seat, cur, atouts) {
+  const team = teamOf(seat);
+  const min = cur ? cur.montant + 10 : 80;
+  const own = !!cur && teamOf(cur.preneur) === team;
+  const need = tuning.essecMin + (own ? 0.1 : 0);
+  const saved = G.contract;
+  let best = null;
+  try {
+    for (const atout of atouts) {
+      const base = { id: -1, type: "NUMERIQUE", atout, preneur: seat, equipePreneur: team, coinche: false, surcoinche: false };
+      G.contract = { ...base, montant: 80 };
+      const worlds = bidWorlds || (bidWorlds = mcWorlds(seat, tuning.bidWorlds));
+      if (worlds.length < Math.min(CAPOT_WORLDS, tuning.bidWorlds)) return null;
+      const runs = worlds.map((w) => playOut(seat, w, null));
+      for (let montant = min; montant <= 160; montant += 10) {
+        const c = { ...base, montant };
+        const ok = runs.filter(({ sim, bel }) => contratReussi(c, sim.pointsPlis, sim.plisGagnes, bel, sim.plisSiege)).length;
+        const pm = ok / runs.length;
+        const ev = pm * montant - (1 - pm) * 160;
+        if (pm >= need && ev > 0 && (!best || ev > best.ev)) best = { ev, atout, montant };
+      }
+    }
+  } finally {
+    G.contract = saved;
+  }
+  return best && { type: "ENCHERIR", montant: best.montant, atout: best.atout };
+}
+
 function decideBid(seat) {
+  if (!essec()) return decideBidV1(seat);
+  const cur = G.contract;
+  if (G.donneAnnonces.some((a) => !SUITS.includes(a.atout)))
+    return (!cur || cur.montant < 160 ? simBid(seat, cur, ESSEC_ATOUTS) : null) ?? { type: "PASSER" };
+  const r = decideBidV1(seat);
+  const alt = !cur || cur.montant < 160 ? simBid(seat, cur, ["TA", "SA"]) : null;
+  return alt && (r.type !== "ENCHERIR" || alt.montant > r.montant) ? alt : r;
+}
+
+function decideBidV1(seat) {
   const PASS = { type: "PASSER" };
   const hand = G.hands[seat];
   const cur = G.contract;
@@ -759,15 +802,6 @@ function decideBid(seat) {
   const partner = partnerOf(seat);
   const memo = G.bidMemo[seat];
   const min = cur ? cur.montant + 10 : 80;
-  // ponytail: Tout Atout ou Sans Atout annoncé (salon ESSEC) : le système et
-  // la simulation ne savent pas le lire ; on ouvre au barème au-dessus de
-  // l'adversaire, sinon on passe.
-  if (G.donneAnnonces.some((a) => !SUITS.includes(a.atout))) {
-    const o = bestOpening(hand, false);
-    return o && o.montant >= min && !(cur && teamOf(cur.preneur) === team)
-      ? { type: "ENCHERIR", montant: o.montant, atout: o.atout }
-      : PASS;
-  }
   const gen = generaleBid(seat, hand, cur, team);
   if (gen) return gen;
   if (cur && cur.montant >= 270) return PASS;
@@ -1068,9 +1102,6 @@ function contractHuitAtouts(contract) {
 function botWantsToCoinche(seat) {
   const contract = G.contract;
   if (!contract || teamOf(seat) === contract.equipePreneur) return false;
-  // ponytail: Tout Atout / Sans Atout jamais coinchés par les bots, la
-  // simulation suppose une couleur d'atout.
-  if (!SUITS.includes(contract.atout)) return false;
   const hand = G.hands[seat];
   const atout = contract.atout;
   // Score de la partie. Le preneur sort s'il réussit, coinché ou non : la
@@ -1115,7 +1146,6 @@ const COINCHE_MARGIN = 0.35;
 function botWantsToSurcoinche(seat) {
   const contract = G.contract;
   if (!contract || teamOf(seat) !== contract.equipePreneur) return false;
-  if (!SUITS.includes(contract.atout)) return false;
   const hand = G.hands[seat];
   const atout = contract.atout;
   const pre = G.scores[teamOf(seat)];
@@ -1262,6 +1292,16 @@ function noteTrumpObligations(seat, carte) {
   if (!pli.length) return;
   const { atout } = G.contract;
   const lead = pli[0].carte.suit;
+  if (atout === "TA") {
+    // Chaque couleur est un atout : qui joue sous le maître de la couleur
+    // demandée n'a rien de plus fort dans cette couleur.
+    const top = TRUMP_FORCE[pli.find((e) => e.siege === trickWinnerSeat(pli, atout)).carte.rank];
+    if (carte.suit === lead && TRUMP_FORCE[carte.rank] < top) {
+      const m = (G.suitMax ||= [{}, {}, {}, {}])[seat];
+      m[lead] = Math.min(m[lead] ?? 8, top - 1);
+    }
+    return;
+  }
   if (lead !== atout && carte.suit === lead) return;
   const master = pli.find((e) => e.siege === trickWinnerSeat(pli, atout));
   if (lead !== atout && teamOf(master.siege) === teamOf(seat)) return; // partenaire maître : libre
@@ -1764,6 +1804,9 @@ export const tuning = {
   bidWorlds: 96,
   bidSamples: 96, // coinche et surcoinche (48 : +1,4 pt/donne contre 24 ; 96 : 7 ms par décision sur PC)
   now: () => Date.now(),
+  // Salon ESSEC : réussite simulée exigée pour annoncer TA / SA (voir simBid).
+  // Duels MC 48 contre 0,65 : 0,55 −0,5 ± 2,2 ; 0,75 +1,6 ± 2,3.
+  essecMin: 0.65,
 };
 
 // Hasard des bots : tiré d'une graine qui ne dépend que de ce que le siège
@@ -1819,7 +1862,8 @@ function withSeed(seat, tag, fn) {
 function canHold(s, c) {
   return (
     !G.void[s][c.suit] &&
-    (c.suit !== G.contract.atout || TRUMP_FORCE[c.rank] <= G.trumpMax[s])
+    (c.suit !== G.contract.atout || TRUMP_FORCE[c.rank] <= G.trumpMax[s]) &&
+    (G.contract.atout !== "TA" || TRUMP_FORCE[c.rank] <= (G.suitMax?.[s][c.suit] ?? 8))
   );
 }
 
@@ -2209,6 +2253,7 @@ function playOut(seat, world, card) {
     appel: real.appel.map((v) => ({ ...v })),
     refus: real.refus.map((v) => ({ ...v })),
     trumpMax: real.trumpMax.slice(),
+    suitMax: real.suitMax?.map((v) => ({ ...v })),
     pointsPlis: real.pointsPlis.slice(),
     plisGagnes: real.plisGagnes.slice(),
     plisSiege: (real.plisSiege || [0, 0, 0, 0]).slice(),
@@ -2226,7 +2271,7 @@ function playOut(seat, world, card) {
         sim.exactValue = exactEnd(sim, next, bel, exactTeam);
         break;
       }
-      next = simPlay(sim, next, heuristicCard(next));
+      next = simPlay(sim, next, rolloutCard(next));
     }
   } finally {
     G = real;
@@ -2405,7 +2450,8 @@ function exactEnd(sim, first, bel, team) {
 
 // Score de la donne vu de l'équipe du siège après `card`.
 function mcValue(seat, card, world) {
-  exactTeam = teamOf(seat);
+  // La recherche exacte des derniers plis suppose une couleur d'atout.
+  exactTeam = SUITS.includes(G.contract.atout) ? teamOf(seat) : null;
   let out;
   try {
     out = playOut(seat, world, card);
@@ -2464,7 +2510,8 @@ function mcChooseCard(seat, legal, reflex, why) {
   for (const w of worlds) cards.forEach((c, i) => (totals[i] += mcValue(seat, c, w)));
   const n = worlds.length;
   const hand = G.hands[seat];
-  const bad = cards.map((c) => sigFalse(hand, c, legal));
+  const suitGame = SUITS.includes(G.contract.atout); // ni signaux ni conventions à TA / SA
+  const bad = suitGame ? cards.map((c) => sigFalse(hand, c, legal)) : [];
   if (bad.some(Boolean) && !bad.every(Boolean))
     bad.forEach((b, i) => {
       if (b) totals[i] -= SIG_PENALTY * n;
@@ -2475,6 +2522,7 @@ function mcChooseCard(seat, legal, reflex, why) {
   });
   if (!best) return reflex;
   const choice = cards[best];
+  if (!suitGame) return choice;
   const { atout, preneur, equipePreneur, type } = G.contract;
   let margin = 0;
   if (G.pliCourant.length) {
@@ -2558,26 +2606,53 @@ function botChooseCard(seat) {
     seat,
   );
   if (legal.length === 1) return legal[0];
-  if (!SUITS.includes(G.contract.atout)) return simpleCard(seat, legal);
   return withSeed(seat, "card", () => {
-    const reflex = heuristicCard(seat);
+    const reflex = rolloutCard(seat);
     return mcChooseCard(seat, legal, reflex, reflexWhy);
   });
 }
 
-// ponytail: Tout Atout / Sans Atout (salon ESSEC) en réflexes minimaux, les
-// réflexes de club et la simulation supposant une couleur d'atout. Entamer
-// fort ; partenaire maître : charger en dernier, sinon petit ; gagner au
-// plus juste ; sinon la plus petite.
+// Tout Atout / Sans Atout (salon ESSEC) : les réflexes de club supposent une
+// couleur d'atout, ceux-ci servent de réflexe et de joueur simulé (voir
+// rolloutCard). Entamer une carte maîtresse, sinon la plus petite ;
+// partenaire maître : charger, sinon petit ; gagner au plus juste ; sinon la
+// plus petite.
+// Aucune carte plus forte dehors (ni jouée, ni dans ma main) dans sa couleur.
+function masterIn(hand, card, atout) {
+  const table = atout === "TA" ? TRUMP_FORCE : PLAIN_FORCE;
+  const f = table[card.rank];
+  const ids = IDS[card.suit];
+  for (let j = 0; j < 8; j++)
+    if (table[RANKS[j]] > f && !G.seen[ids[j]] && !hand.some((c) => c.id === ids[j]))
+      return false;
+  return true;
+}
+// Joueur simulé : les réflexes de club à la couleur, ceux de simpleCard sinon.
+function rolloutCard(seat) {
+  const { atout } = G.contract;
+  if (SUITS.includes(atout)) return heuristicCard(seat);
+  const legal = computeLegal(canonSort(G.hands[seat]), G.pliCourant, atout, seat);
+  return legal.length === 1 ? legal[0] : simpleCard(seat, legal);
+}
 function simpleCard(seat, legal) {
   const atout = G.contract.atout;
   const pli = G.pliCourant;
-  if (!pli.length) return strongest(legal, atout);
-  if (teamOf(trickWinnerSeat(pli, atout)) === teamOf(seat))
-    return pli.length === 3 ? highest(legal, atout) : lowest(legal, atout);
+  const hand = G.hands[seat];
+  if (!pli.length) {
+    const masters = legal.filter((c) => masterIn(hand, c, atout));
+    return masters.length ? highest(masters, atout) : lowest(legal, atout);
+  }
+  const winner = trickWinnerSeat(pli, atout);
+  if (teamOf(winner) === teamOf(seat))
+    return pli.length === 3 || masterIn(hand, pli.find((e) => e.siege === winner).carte, atout)
+      ? highest(legal, atout)
+      : lowest(legal, atout);
   const wins = legal.filter(
     (c) => trickWinnerSeat([...pli, { siege: seat, carte: c }], atout) === seat,
   );
+  // Rejetés en duel (MC 48, salon ESSEC) : au Sans Atout, entamer petit et
+  // garder As et 10 pour la fin (−6,1 ± 2,9) ; ne pas prendre un pli de 4
+  // points au plus avec un As ou un 10 (−0,4 ± 1,6).
   return wins.length ? weakest(wins, atout) : lowest(legal, atout);
 }
 
diff --git a/tests/coinche-ab.js b/tests/coinche-ab.js
index 9696f55..53a1891 100644
--- a/tests/coinche-ab.js
+++ b/tests/coinche-ab.js
@@ -5,6 +5,7 @@
 // le hasard des bots repart de la même graine à chaque donne (reseed) : deux
 // moteurs identiques font exactement 0.
 //   node tests/coinche-ab.js <A/engine.js> <B/engine.js> [parties par cœur] [mondes MC, défaut 48] [première donne, défaut 0]
+// REGLES=essec : duel au salon des règles de l'ESSEC.
 // Tous les cœurs travaillent sur une file de parties ; un point d'étape
 // s'affiche toutes les 30 s. Les fichiers sont copiés au lancement : on peut
 // modifier le jeu pendant un duel.
@@ -39,7 +40,7 @@ function duel(A, B, g) {
   for (const teamA of [0, 1]) {
     const byDonne = new Map();
     const G = play(B, {
-      dealSeed: 1000 + g, botSeed: 5000 + g, reseed: true,
+      dealSeed: 1000 + g, botSeed: 5000 + g, reseed: true, regles: process.env.REGLES || undefined,
       decide: (seat) => (seat % 2 === teamA ? A.bots : B.bots),
       on: {
         score(G) {
@@ -94,7 +95,8 @@ if (process.argv[2] === '--worker') {
 } else {
   const [a, b, per = '20', mc = '', first = '0'] = process.argv.slice(2);
   const stamp = Date.now();
-  const snap = (f, tag) => { const p = path.join(os.tmpdir(), `coinche-ab-${stamp}-${tag}.js`); fs.copyFileSync(f, p); return p; };
+  // Copie à côté du moteur : ses imports relatifs (client/i18n.js) y résolvent.
+  const snap = (f, tag) => { const p = path.join(path.dirname(path.resolve(f)), `.coinche-ab-${stamp}-${tag}.js`); fs.copyFileSync(f, p); return p; };
   const fa = snap(a, 'A');
   const fb = snap(b, 'B');
   const t0 = Date.now();
diff --git a/tests/coinche-essec.test.js b/tests/coinche-essec.test.js
index 75c1e24..cc84a5d 100644
--- a/tests/coinche-essec.test.js
+++ b/tests/coinche-essec.test.js
@@ -185,6 +185,21 @@ function hote(types, atout = "SA") {
 tuning.mcSamples = 0;
 tuning.bidWorlds = 4;
 tuning.bidSamples = 4;
+// Les bots annoncent Tout Atout par simulation (voir simBid).
+{
+  const mains = [
+    "JH JD JC JS 9H 9D 9C 9S",
+    "7S 8S 7D 8D 7C 8C 7H 8H",
+    "AS 10S KS QS AD 10D KD QD",
+    "AH 10H KH QH AC 10C KC QC",
+  ].map((m) => m.split(" ").map(card));
+  const robots = [0, 1, 2, 3].map(() => ({ type: "bot", name: "B" }));
+  const g = createGame(robots, rng(5), () => mains.map((h) => h.slice()), ESSEC);
+  g.donneur = 3;
+  g.joueurActif = 0;
+  const a = bots.decideBid(g, 0);
+  eq([a.type, a.atout], ["ENCHERIR", "TA"], "quatre Valets et quatre 9 : Tout Atout");
+}
 const seats = [{ type: "human", name: "H" }, ...[1, 2, 3].map(() => ({ type: "bot", name: "B" }))];
 let donnes = 0;
 const vus = { TA: 0, SA: 0, misere: 0 };
diff --git a/tests/coinche-sim.js b/tests/coinche-sim.js
index 747911f..c6b1761 100644
--- a/tests/coinche-sim.js
+++ b/tests/coinche-sim.js
@@ -34,7 +34,7 @@ export function shuffle(deck, rand) {
 // reseed : hasard des bots repris à chaque donne (graine botSeed et numéro
 // de donne) ; dans un duel, les deux parties jumelles imaginent les mêmes
 // mondes à chaque donne : l'écart ne vient plus que des bots.
-export function play(engine, { dealSeed = 1, botSeed = 2, deal = null, on = {}, decide = null, reseed = false } = {}) {
+export function play(engine, { dealSeed = 1, botSeed = 2, deal = null, on = {}, decide = null, reseed = false, regles } = {}) {
   const { createGame, actOn, bots, tuning } = engine;
   let now = 0;
   let seq = 0;
@@ -51,7 +51,7 @@ export function play(engine, { dealSeed = 1, botSeed = 2, deal = null, on = {},
   Math.random = rand; // anciens moteurs : mondes tirés avec Math.random (les récents tirent leur graine de l'état)
   tuning.now = () => 0; // anciens moteurs : réflexion jamais interrompue (les récents ignorent l'horloge)
   try {
-    const G = createGame([0, 1, 2, 3].map(() => ({ type: 'bot', name: 'Ordinateur' })), dealRand, deal);
+    const G = createGame([0, 1, 2, 3].map(() => ({ type: 'bot', name: 'Ordinateur' })), dealRand, deal, regles);
     const newDonne = () => {
       if (!reseed || G.donneNumero === donne) return;
       donne = G.donneNumero;
```
