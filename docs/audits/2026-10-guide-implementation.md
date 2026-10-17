# Guide d'implémentation : comment coder les corrections de l'audit des bots

Ce guide traduit le plan de correction de [`2026-10-bots-coinche.md`](2026-10-bots-coinche.md) en lots de commits. Chaque lot précise ce qu'il faut toucher, avec une esquisse du code de production, les tests à ajouter et la façon de vérifier le résultat.

Les esquisses reprennent les prototypes de la vague 2, sans les drapeaux de mesure : [`detail/v2-stabilite-prototype.diff`](detail/v2-stabilite-prototype.diff) et [`detail/v2-conventions-prototype.diff`](detail/v2-conventions-prototype.diff). Les lots 5 à 8 et 10 proviennent des patchs préparés pour ce guide, rangés dans [`patches/`](patches/).

Numéros de ligne : `src/coinche/engine.js` au commit `b548853`.

## Ordre des lots et dépendances

| Lot | Contenu | Dépend de | Effet attendu (mesuré sur prototype) | Coût en force |
|---|---|---|---|---|
| 1 | Budget en nombre de mondes (S4) | — | 0 % de décisions qui dépendent de l'appareil, contre 15-16 % aujourd'hui à ×10 | nul (horloge figée : décisions identiques) |
| 2 | Graine dérivée de l'état + tri de la main (S1) | 1 | même situation, même décision ; le réflexe ne dépend plus de l'ordre des cartes | nul |
| 3 | Signaux : appel et refus | 2 (tri) | faux appels lus : 85 % → 23 % ; vrais appels gardés : 36 % → 86 % | −0,6 ± 4,6 |
| 4 | Marges de convention dans `mcChooseCard` | 3 (pour B4) | couleur annoncée abandonnée : 63 % → 10 % ; preneur V+9 sans tirer atout : 57 % → 26 % ; défense entame atout : 8 % → 3 % | +0,2 ± 4,6 (avec 3) |
| 5 | Lecture des humains | — | +6 à +10 pts de justesse sur la main du partenaire humain | non détecté |
| 6 | Enchères et coinche | 1 | voir le lot | voir le lot |
| 7 | Hôte, jeu en ligne, rythme | — | voir le lot | — |
| 8 | Remontée du partenaire | 6 | voir le lot | voir le lot |
| 9 | Test apparié (S2), décision de produit | 2 | cartes instables (bruit réel) : 34 % → 11 % | non établi |
| 10 | Interface | 3 (pour la bulle d'appel) | historique des enchères, signaux et cartes tombées visibles | — |
| 11 | Tests et mesure | 2 | les tests vérifient enfin la carte réellement jouée | — |

**Protocole pour chaque lot**

1. `npm test`
2. `node tests/coinche-lisibilite.js src/coinche/engine.js 10 5 96 --json=apres.json`. Comparer à la ligne de base du rapport [corpus](detail/v2-corpus.md), ou lancer l'outil sur la version d'avant (`git stash` ou une copie).
3. Un duel `node tests/coinche-ab.js <avant>/engine.js src/coinche/engine.js 100 48`.
   - Ses barres d'erreur sont optimistes (voir [stabilité](detail/v2-stabilite.md), section 5).
   - Pour les lots 4 et 9, prévoir un duel long (plusieurs heures), ou corriger d'abord l'erreur-type (lot 11).

---

## Lot 1 : budget en nombre de mondes (S4)

**But.** Le même bot joue pareil sur un PC et sur un téléphone lent. Aujourd'hui, à ×10, 16 % des cartes, 15 % des enchères et 16 % des coinches changent ; une Générale peut être validée sur un seul monde.

**À toucher**

- **Lignes 1484-1492.** Retirer `MC_BUDGET_MS`. Garder `tuning.now` seulement pour un garde-fou (voir plus bas), ou le retirer : les outils qui l'affectent (`coinche-ab.js`, `coinche-justesse.js`) ajoutent alors une propriété inutile, sans casser.
- **Lignes 2062-2075, `mcChooseCard`.** Jouer tous les mondes, sans `break` sur l'horloge :

  ```js
  for (const w of worlds) cards.forEach((c, i) => (totals[i] += mcValue(seat, c, w)));
  const n = worlds.length;
  ```

- **Lignes 2093-2119, `makeProbability`.**
  - Retirer `BID_BUDGET_MS`, le `return null` sur `bidDeadline` et le `stop`.
  - Ne garder que le minimum de mondes. `null` ne veut plus dire « temps écoulé », mais seulement « pas assez de mondes » (générateur vide).
- **Lignes 558 et 571-582.** Retirer `BID_DECISION_MS` et `bidDeadline`. Garder `bidWorlds`, qui partage les mondes entre les options d'une même décision.
  - L'indicateur « enchère en cours » s'appuie aujourd'hui sur `bidDeadline === Infinity`, lu l. 2106 pour choisir entre `bidWorlds` et des mondes à part.
  - Le remplacer par un booléen `inBid`, mis à `true` dans `botDecideBid`.
- **`minWorlds = CAPOT_WORLDS`** pour la première simulation de `generaleBid` (l. 614), pour `botWantsToCoinche` (l. 915) et pour `botWantsToSurcoinche` (l. 940).
  - Les tests réduisent les mondes (`tests/coinche-bots.test.js` met `bidWorlds` et `bidSamples` à 4).
  - Il faut donc borner le minimum par le nombre configuré, sinon la coinche ne serait plus jamais tentée dans ces tests :

  ```js
  const minFor = (k) => Math.min(CAPOT_WORLDS, k); // k = tuning.bidSamples ou tuning.bidWorlds
  ```

- **Commentaires à mettre à jour** : l'en-tête Monte-Carlo (l. 1464-1483), celui des enchères (l. 545-557) et `CAPOT_WORLDS` (l. 565-570).

**Garde-fou pour les appareils extrêmes**, recommandé par l'agent stabilité, non prototypé.

- Mesurer une fois, au démarrage de l'hôte (`client/host-worker.js`), le temps d'une décision de référence.
- Si elle dépasse un seuil très large (par exemple 1,5 s), fixer `tuning.mcSamples`, `bidWorlds` et `bidSamples` à 48 **pour toute la session**.
- La décision reste ainsi déterministe pendant une partie, et le cas est rare.

Ne jamais rendre le nombre de mondes dépendant de l'horloge en cours de décision.

**Coût en calcul.** Sur la machine d'audit, à 96 mondes : 26 ms par carte, 24 ms par enchère, 18 ms par coinche. Un appareil 10 fois plus lent prendrait environ 260 ms. Le calcul tourne dans un Web Worker, et le délai des bots est déjà de 350 à 800 ms. *À mesurer sur un vrai téléphone avant fusion.*

**Tests**

- Nouveau test : la même position donne la même décision avec `tuning.now` normal et avec une horloge ×10.
- Les tests actuels figent l'horloge : ils ne devraient pas changer.

**Mesure.** `node tests/coinche-lisibilite.js … --lent=10` doit afficher 0 % de changements.

---

## Lot 2 : graine dérivée de l'état et tri de la main (S1)

**But.** Même situation, même décision : enchère, carte, coinche, surcoinche. La graine dérive de ce que le siège sait, de sorte que deux situations identiques donnent la même décision.

**Le code, repris du prototype :**

```js
// Hasard des bots : tiré d'une graine qui ne dépend que de ce que le siège
// sait (sa main, les enchères, les cartes tombées, en sièges relatifs) — la
// même situation donne toujours la même décision.
let mcRand = Math.random;
function prng(seed) { /* mulberry32 : celui de tests/coinche-sim.js (rng) */ }
function stateSeed(seat, tag) {
  // FNV-1a sur : tag, phase, plis joués, donneur relatif ; main TRIÉE ;
  // bidLog (siège relatif, montant, couleur) ; contrat ; cartes jouées par
  // siège relatif ; pli en cours ; bidMemo du siège. Rien d'autre (ni numéro
  // de donne, ni identifiants, ni ordre de la main).
}
function withSeed(seat, tag, fn) {
  const prev = mcRand;
  mcRand = prng(stateSeed(seat, tag));
  try {
    return fn();
  } finally {
    mcRand = prev;
  }
}
```

**Où brancher `mcRand`**

- **Remplacer `Math.random` par `mcRand`** :
  - dans `dealUnknown` (l. 1509 : `shuffle(unknown, mcRand)` ; l. 1521) ;
  - dans la chaîne de `mcWorlds` (l. 1736-1753, cinq appels) ;
  - dans la surcoinche (l. 947), si elle n'est pas rendue déterministe au lot 6.
- **Envelopper les décisions** :
  - `decideBid` dans `botDecideBid` : `withSeed(seat, "bid", …)` ;
  - `mcChooseCard` dans `botChooseCard` : `withSeed(seat, "card", …)` ;
  - `wantsToCoinche` et `wantsToSurcoinche` dans l'objet `bots` (l. 2479-2480).
- **Le hasard des règles ne change pas.** Le mélange du paquet et la carte jouée d'office au TIMEOUT restent fournis par l'appelant : `rand`, l. 61.

**Trier la main ET `legal`.** Sans tri, l'ordre de `G.hands` tranche les égalités du réflexe et l'ordre des candidats : 6 % des décisions en dépendent.

```js
const SUIT_ORD = { H: 0, D: 1, C: 2, S: 3 };
const canonKey = (c) => SUIT_ORD[c.suit] * 8 + RANKS.indexOf(c.rank);
const canonSort = (cards) => cards.slice().sort((a, b) => canonKey(a) - canonKey(b));
```

- Trier dans `playContext` et au début de `botChooseCard`, `legal` compris : avec la seule main triée, il reste 1,4 % de cas qui changent, parce que `legal` est calculé avant le tri.
- Le prototype trie `G.hands[seat]` en place. En production, préférer une copie triée, pour ne pas toucher l'ordre affiché au joueur. Les bots décident sur `seatView(G)`, une copie de l'état, mais le solo hors ligne passe aussi par `withG`.

**Limite.** S1 rend la même décision à chaque fois, y compris quand elle est mauvaise. La fragilité reste à 34 % : un détail sans importance qui change la graine fait encore basculer un tiers des coups. Seul le lot 9 réduit cette fragilité.

**Tests**

- Test de reproductibilité : pour 50 positions capturées, la décision ne change pas quand on change `Math.random`, ni quand on mélange l'ordre de la main.
- Une fois ce lot en place, les scénarios de `coinche-strategies.test.js` peuvent vérifier `botChooseCard`, la carte réellement jouée, et plus seulement `heuristicCard` (voir le lot 11).

---

## Lot 3 : signaux d'appel et de refus

**But.** Un même langage à l'émission et à la lecture. Aujourd'hui, 85 % des appels lus sont faux.

**Code, repris de [`v2-conventions-prototype.diff`](detail/v2-conventions-prototype.diff)**

```js
// Défausse volontaire : au moins deux couleurs hors atout possibles.
function volontaire(legal, atout) {
  const suits = new Set();
  for (const c of legal) if (c.suit !== atout) suits.add(c.suit);
  return suits.size >= 2;
}
const SIGNAL_TRICKS = 3; // signaux lus aux plis 1 à 3 seulement
// Ce que dit une défausse : appel (7 ou 8, As de la couleur pas tombé),
// refus (Roi ou Dame), ou rien.
function sigReading(carte, legalBefore) {
  const atout = G.contract.atout;
  if (carte.suit === atout || G.plisJoues >= SIGNAL_TRICKS) return null;
  if (legalBefore && !volontaire(legalBefore, atout)) return null;
  if (carte.rank === "7" || carte.rank === "8") return G.seen["A" + carte.suit] ? null : "appel";
  if (carte.rank === "K" || carte.rank === "Q") return "refus";
  return null;
}
```

**Lecture (`readDiscardSignal`, l. 1178-1188)**

- La fonction prend `legalBefore`, les cartes légales avant que la carte soit retirée.
- Le dernier signal valable remplace le précédent :
  - un appel efface les autres appels du siège, et le refus de la même couleur ;
  - un refus efface les autres refus, et l'appel de la même couleur.

**Appelants à adapter**

- `act` (l. ~2375) : calculer `computeLegal(...)` *avant* de retirer la carte, puis passer le résultat à `readDiscardSignal`.
- `simPlay` (l. 1785-1795) : faire de même dans les mondes imaginés. Ce calcul ne sert que pour une défausse aux plis 1 à 3.

**Émission**

- `appelCard` (l. 1163-1174) : n'émettre un appel qu'avec un 7 ou un 8, avant le pli 4, et seulement sur une défausse volontaire.
- `discard` (l. 1431-1458) : si la carte la moins chère serait un faux signal, prendre la moins chère des cartes neutres. Condition : l'écart de coût ne dépasse pas 10, soit un 9 contre un 7, mais pas un Valet, qui coûte 20 (voir `sigFalse` dans le diff).

**Monte-Carlo (`mcChooseCard`)**

- Pénaliser de 5 pts par monde une défausse dont le signal serait faux, tant qu'il reste un choix honnête.
- Garder le vrai appel du réflexe, sauf si la simulation lui préfère une autre carte de plus de 16 pts par monde.

**Calibrage.** `SIGNAL_MISFIT` passe à 0,1, calibré sur la nouvelle lecture.

- Ne le changer *qu'avec* la nouvelle lecture.
- Le valider seul : avec ce réglage, la coinche recule de 19 %.

**Tests**

- `sigReading` :
  - 7 de la couleur dont l'As est tombé : rien ;
  - 9 : rien ;
  - Valet : rien ;
  - défausse forcée : rien ;
  - pli 4 : rien.
- Dernier signal valable : un refus puis un appel donnent un appel.
- `discard` ne jette pas le 7♦ sans l'A♦ quand le 9♦ coûte autant (exemple g0 / donne 2 du rapport [conventions](detail/v2-conventions.md)).
- Mettre à jour les scénarios de stratégie qui supposent « 9 = appel ».

---

## Lot 4 : marges de convention dans `mcChooseCard`

**But.** Le Monte-Carlo ne contredit plus une convention lisible pour un gain qu'il croit petit.

**Principe**

- `leadCard` (l. 1190-1318) note pourquoi le réflexe a choisi sa carte, dans une variable de module `reflexWhy` :
  - `master` sur le `return` des maîtres en défense ;
  - `called` sur les deux `return` « couleur appelée » ;
  - `partner` sur le `return` « couleur annoncée ».
- `botChooseCard` lit `reflexWhy` juste après `heuristicCard`, puis le passe à `mcChooseCard`.
- Après le choix de la meilleure carte et après `TRUMP_LEAD_MARGIN`, en entame seulement :

```js
// Conventions lisibles : le réflexe est gardé tant que la simulation ne lui
// préfère pas une autre carte de plus de la marge (pts par monde).
const CONVENTION_MARGIN = { trumpDef: 32, takerDraw: 32, defAce: 16, called: 32 };
if (best && !G.pliCourant.length) {
  const c = G.contract;
  const keep = (m) => totals[0] >= totals[best] - m * n;
  const def = teamOf(seat) !== c.equipePreneur;
  const choice = cards[best];
  const hand = G.hands[seat];
  if (def && c.type === "NUMERIQUE" && choice.suit === atout && reflex.suit !== atout && keep(CONVENTION_MARGIN.trumpDef)) best = 0;
  else if (seat === c.preneur && reflex.suit === atout && choice.suit !== atout && holds(hand, atout, "J") && holds(hand, atout, "9") && suitCards(hand, atout).length >= 3 && keep(CONVENTION_MARGIN.takerDraw)) best = 0;
  else if (def && reflex.rank === "A" && reflex.suit !== atout && choice.rank !== "A" && keep(CONVENTION_MARGIN.defAce)) best = 0;
  else if ((why === "called" || why === "partner") && choice.suit !== reflex.suit && keep(CONVENTION_MARGIN.called)) best = 0;
}
```

**À faire ensuite**

- Une fois le lot 3 en place, passer `called` en règle dure. C'est la marge la moins chère : 2,2 pts/donne de proxy pour 0 % de violations.
- Exception de B1 à évaluer : le défenseur qui tient le Valet d'atout.

**À ne pas faire.** Corriger la défense imaginée dans `playOut`. Cette hypothèse est infirmée : elle ne change rien au tirage d'atout du preneur.

**Tests**

- Les exemples B1 à B4 du rapport [conventions](detail/v2-conventions.md), sous forme de positions fixes. Avec le lot 2, la graine est fixée, donc ces tests sont déterministes.

---

## Lot 5 : lecture des humains

- **Ligne 1669.** `MISFIT.human` passe de 0,15 à 0,05. Gain : +6 à +10 pts de justesse sur la main de l'humain. Sur les mondes, on compte au plus 3 % de placements « sûrs mais faux ».
- **Ligne 1685.** `Math.max(bidFits(r, h), misfit)` à la place de `bidFits(r, h) || misfit`. Effet presque nul, mais le code devient cohérent.
- **Enregistrer le type de joueur dans `bidLog`** au moment où il parle (MON-4), et le lire dans `seatWeight`. Voir le lot 7, qui ajoute aussi la marque « jouée d'office ».
- **Plus tard** (non prototypé) : lire les enchères humaines avec un barème de club plutôt qu'avec celui des bots, et appliquer aux humains un `SIGNAL_MISFIT` plus élevé. Recommandation de l'agent « partenaire humain ».
- **Test :** étendre `tests/coinche-justesse.js` aux sièges humains. Le pilote H-club de la vague 2 peut servir de base.

---

## Lot 6 : enchères et coinche

*Ce lot sera complété avec le patch préparé par l'agent « enchères », dans `patches/encheres.diff`.*

## Lot 7 : hôte, jeu en ligne et rythme

*Ce lot sera complété avec le patch préparé par l'agent « hôte », dans `patches/hote.diff`.*

## Lot 8 : remontée du partenaire

*Ce lot sera complété avec la table et le prototype de l'agent « remontée », dans [`detail/v2-remontee-partenaire.md`](detail/v2-remontee-partenaire.md).*

---

## Lot 9 : test apparié dans `mcChooseCard` (S2), décision de produit

C'est la seule correction qui réduit le bruit réel des décisions : cartes instables 34 % → 11 %, entames 44 % → 16 %, écart au réflexe 34 % → 7,5 %.

```js
// On ne quitte le réflexe que si la carte préférée gagne nettement sur les
// mêmes mondes : moyenne des écarts > 2 erreurs-types + 0,5 pt.
const PAIRED_Z = 2;
const PAIRED_EXTRA = 0.5;
// pendant la boucle : vals[i][k] = mcValue(seat, cards[i], worlds[k])
if (best) {
  let mu = 0, m2 = 0;
  for (let k = 0; k < n; k++) {
    const d = vals[best][k] - vals[0][k];
    mu += d;
    m2 += d * d;
  }
  mu /= n;
  const sd = n > 1 ? Math.sqrt(Math.max(0, (m2 - n * mu * mu) / (n - 1))) : Infinity;
  if (mu <= (PAIRED_Z * sd) / Math.sqrt(n) + PAIRED_EXTRA) best = 0;
}
```

- **Coût en force non établi.** Deux duels de 13 minutes donnent des résultats de signes opposés : +7,9 ± 6,9 et −6,6 ± 5,6.
- **À trancher** avec un duel environ 10 fois plus long, une fois l'erreur-type corrigée (lot 11).
- **Effets sur les autres lots.**
  - Le départage aux points de plis (`donneValue` × 0,01) n'a plus d'effet ; on peut le laisser.
  - Le lot 4 garde son utilité : avec S2 seul, le preneur V+9 ne tire atout que dans 62 % des cas.

---

## Lot 10 : interface

*Ce lot sera complété avec le patch préparé par l'agent « interface », dans `patches/interface.diff`.*

---

## Lot 11 : tests et mesure

1. **Tester la carte réellement jouée.**
   - Après le lot 2, ajouter à `tests/coinche-strategies.test.js` une variante de chaque scénario clé qui appelle `botChooseCard`, graine fixée, et pas seulement `heuristicCard`.
   - Exemple : la main du scénario « tirer l'atout maître » (`JH 9H 7H AS 8S KD 7D 8C` à 100♥) ne joue aujourd'hui le Valet sur aucune des 20 graines. Le test doit passer après le lot 4.
2. **Reproductibilité** : voir le lot 2.
3. **Erreur-type de `coinche-ab.js`.**
   - Les donnes d'une même partie ne sont pas indépendantes.
   - Calculer l'erreur-type par partie (une valeur par partie jumelle), ou par bootstrap en blocs, plutôt que par donne.
   - Sinon, les duels de 15 à 25 minutes affichent des barres environ 1,5 à 3 fois trop étroites (estimation tirée des deux duels S2 contradictoires).
4. **Garde-fou continu.** Faire tourner `tests/coinche-lisibilite.js --seul=corpus` en CI, avec peu de graines, pour suivre les cas emblématiques. La sortie JSON se compare d'une version à l'autre.
