# Guide d'implémentation : comment coder les corrections de l'audit des bots

Ce guide traduit le plan de correction de [`2026-10-bots-coinche.md`](2026-10-bots-coinche.md) en lots de commits. Chaque lot précise ce qu'il faut toucher, avec une esquisse du code de production, les tests à ajouter et la façon de vérifier le résultat.

Les esquisses reprennent les prototypes de la vague 2, sans les drapeaux de mesure : [`detail/v2-stabilite-prototype.diff`](detail/v2-stabilite-prototype.diff) et [`detail/v2-conventions-prototype.diff`](detail/v2-conventions-prototype.diff). Les lots 6, 7, 8 et 10 ont un patch prêt à appliquer, vérifié par `npm test`, rangé dans [`patches/`](patches/) ; voir « Patchs prêts à appliquer ».

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

## Patchs prêts à appliquer

Les patchs de [`patches/`](patches/) se superposent dans cet ordre, depuis la racine du dépôt :

```sh
git apply docs/audits/patches/encheres.diff docs/audits/patches/encheres-tests.diff   # lot 6
git apply docs/audits/patches/remontee-apres-encheres.diff                            # lot 8 (après le lot 6)
git apply docs/audits/patches/hote.diff                                               # lot 7
git apply docs/audits/patches/interface.diff                                          # lot 10
npm ci && npm test && npm run build                                                   # bundle à commiter à part
```

Ce qui a été vérifié lors de la consolidation :
- Les cinq patchs s'appliquent ensemble, dans cet ordre, et `npm test` passe en entier : 50 scénarios de stratégie, 200 + 10 parties de bots, partie boardgame.io, salons en ligne, règles, hôte, et les 31 vérifications du nouveau test d'hôte.
- Chacun s'applique aussi seul.
  - `remontee.diff` est la version autonome du lot 8, sans le lot 6.
  - `remontee-apres-encheres.diff` est la version à appliquer après `encheres.diff`. Les deux patchs ajoutent la même règle « deux atouts ou un honneur » (ENC-3) : `peutAppuyer` côté enchères, `partnerFit` côté remontée, retiré dans cette version.
- Les lots 1 à 5 et 9 n'ont pas de patch prêt : ils se codent à partir des esquisses de ce guide et des diffs de prototype.
- Chaque patch est un seul bloc. Pour en faire des commits séparés, suivre l'ordre conseillé dans chaque lot, avec `git add -p`.

## Lot 6 : enchères et coinche

Patchs [`patches/encheres.diff`](patches/encheres.diff) (`engine.js`) et [`patches/encheres-tests.diff`](patches/encheres-tests.diff) (scénarios et outil de mesure). Effets mesurés sur le corpus, 20 graines :

| Correction | Ce que fait le patch | Avant → après |
|---|---|---|
| **OUV-1** repli après veto | Après un veto, l'ouverture redescend les paliers du barème dans la même couleur (160 → 80), puis essaie les autres couleurs du barème, puis le 80 hors barème. Seulement pour une ouverture. `baremeFits` lit un palier plus bas comme `SIM_FIT`, sinon le partenaire le croirait impossible. | passe ×2 → 130♥ ×2 |
| **OUV-4** ouverture légère | `LIGHT_MIN_ATOUTS = 2` (3 se change par cette constante, à trancher en duel) | Valet sec + As : 80♥ ×19 → passe ×20 |
| **ENC-3** couleur du partenaire | `peutAppuyer` (honneur V, 9 ou A, ou deux atouts) à l'étape 3 et dans la lecture. `honneurDeForce` pour le forçage, qui exige un honneur à l'atout forcé. | 7♥ sec + A♦ A♣ : 100♥ ×10 → passe ×20 |
| **ENC-4** palier annoncé | Le palier du barème est annoncé s'il passe le veto à 0,6. | 90♥ ×12 / 100♥ ×8 → 100♥ ×20 (à horloge figée ; reste dépendant de l'horloge tant que le lot 1 n'est pas fait) |
| **ENC-6** capot ou Générale | `pc >= best.pm && best.pm < 1` : à égalité, capot ; la Générale sûre (pm = 1) est gardée. | 250♠ ×16 / 500♠ ×4 → 250♠ ×20 |
| **ZON-7** surcoinche d'un capot | Passe par la simulation, sur au moins `CAPOT_WORLDS` mondes. | capot solide : non ×25 → oui 18 fois sur 20 ; capot douteux : non (inchangé) |
| **COI-1** surcoinche déterministe | Plus de `Math.random`. Seuil = 160/(160+M) + 0,35, plafonné à 0,95, soit 0,90 à 130 et 0,74 à 250. Les personnalités sont supprimées. | 130♠ : oui 13 à 20 fois sur 20 → non ×19 |

**Mesures et tests**

- **Surcoinche.** La marge de 0,35 est mesurée, pas choisie. Le coincheur sait ce que les mondes ignorent (COI-8). Sur 152 contrats coinchés, ceux que le preneur voyait à 0,6 ou plus n'ont réussi que 8 fois sur 36. Baisser la marge suppose de traiter COI-8 d'abord.
- **Duel.** +3,6 ± 5,5 pts/donne (2σ, 925 paires, 32 mondes) : pas de différence détectée.
- **Tests.**
  - 5 scénarios de stratégie ajoutés, 50 en tout.
  - `coinche-lisibilite.js` tolère l'absence de `personalities`, avec 6 cas de corpus ajoutés.
- **Risques.**
  - Le modèle des interventions (`INTERVENTION_W`) a été appris sur l'ancien comportement : il est à ré-apprendre.
  - Sans personnalités, `createGame` consomme 4 tirages de moins, donc les donnes tirées d'une même graine changent.
- **Ordre conseillé des commits.**
  1. OUV-4.
  2. ENC-6.
  3. OUV-1, avec la modification de la lecture.
  4. ENC-3, puis ENC-4 : leurs modifications se chevauchent à l'étape 3.
  5. ZON-7, COI-1 et la suppression des personnalités.

## Lot 7 : hôte, jeu en ligne et rythme

Patch [`patches/hote.diff`](patches/hote.diff), qui touche `host.js`, `engine.js` et `game.js`, et ajoute `tests/coinche-hote-bots.test.js` à `npm test`. Le nouveau test compte 31 vérifications : il échoue en 9 sections sur 9 avant le patch et passe après.

| Correction | Ce que fait le patch |
|---|---|
| **HAS-1 / ZON-1** siège repris en plein tour | La décision du bot est programmée une fois par couple (tour, siège bot), dans le tableau `decided`. Un siège qui devient bot pendant son tour décide donc tout de suite : en 0,7 s, au lieu de rester muet 20 s. |
| **ZON-2, COI-4, COI-5, HAS-6** coinche | Les minuteurs de coinche lancés à l'apparition du contrat sont supprimés. Le défenseur bot décide de coincher **à son tour de parole** (`decide.wantsToCoinche` avant `turnAction`) et envoie `COINCHER` à la place de la passe. Conséquences : plus de « passe puis coinche », plus de coinche perdue, plus de coinche avant le partenaire humain, et la fenêtre de 1,8 s face à un humain est respectée. |
| **ZON-3 / ZON-4** coups d'office | `TIMEOUT` joue avec `auto: true`. La carte jouée d'office n'est pas lue comme un signal ; la passe d'office est notée `auto` dans `bidLog` et ignorée par `seatWeight` et `bidReadings`. `game.js` retire ce champ des coups envoyés par les clients. |
| **MON-4** type de joueur | Chaque entrée de `bidLog` porte `type` (`human` ou `bot`) au moment de l'annonce. Une partie sauvegardée sans ce champ retombe sur le type actuel du siège. |
| **HAS-7** fuite d'état | `playerView` n'envoie plus `personalities` aux non-hôtes, et `bidMemo` ne contient que l'entrée de leur propre siège. |
| **HAS-4** rythme | `thinkMs` (exporté) : un coup forcé prend 150 à 300 ms ; sinon 350 ms + largeur × u², avec une largeur qui croît avec le nombre de cartes légales (1 500 ms pour une enchère). Délai moyen 542 ms au lieu de 575 ; maximum 1,85 s au lieu de 0,8 s. |
| **HAS-8** commentaires | Commentaires corrigés : 4 s au lieu de 5 s, 0,9 s au lieu de 0,6 s. |

**Mesures et tests**

- **Compatibilité.** L'état `G` ne gagne que deux champs dans `bidLog`, `type` et `auto`, et ils sont additifs : les parties en cours et sauvegardées continuent sans migration. Un ancien client hôte reste compatible.
- **À mesurer avant fusion.** La coinche est maintenant décidée sur l'état courant, et sa fréquence monte de 26,8 % à 30,1 % des donnes (comparaison indicative). Un duel `coinche-ab.js` est nécessaire avant de fusionner.
- **Ordre conseillé des commits.**
  1. `thinkMs` et HAS-8 (`host.js` seul).
  2. MON-4, ZON-3 et ZON-4, avec les tests.
  3. HAS-7.
  4. HAS-1, ZON-1, ZON-2, COI-4, COI-5 et HAS-6, après le duel.

## Lot 8 : remontée du partenaire

Patchs [`patches/remontee.diff`](patches/remontee.diff) (autonome) et [`patches/remontee-apres-encheres.diff`](patches/remontee-apres-encheres.diff) (après le lot 6). Détails et mesures : [`detail/v2-remontee-partenaire.md`](detail/v2-remontee-partenaire.md).

**La table, identique à l'émission et à la lecture**

- La relance vaut le soutien, **sans palier de prudence** :

  | Élément | Points de soutien |
  |---|---|
  | Chaque As à côté | +10 |
  | Valet d'atout | +20 |
  | 9 d'atout second | +10 |
  | Belote | +20 |
  | Aucun atout | pas de remontée |

- En lecture, `baremeFits` lit une relance de r comme « r points ».
- Le Valet ne se lit plus que sur l'ouverture.

**Les trois exceptions**

1. **Capot par les clefs** : les As du répondant dépassent les fausses cartes de l'ouvreur, et la simulation le valide.
2. **Barrage** : un palier au-dessus d'une intervention adverse.
3. **Hors table** : la simulation décide, et la couleur du partenaire exige deux atouts ou un honneur.

**Mesures et tests**

- **Effets.**
  - Accord avec la référence de club : 15-54 % → 60-95 %.
  - Mains à réponse déterministe en compétition : 85-95 % → 95-99 %.
  - Duel : le moteur actuel fait +1,7 ± 3,9 pts/donne de plus, une différence non significative.
- **Test modifié.** Le scénario « Soutien Valet + As sur 80 » attend maintenant 110♥ et non 100♥ : l'ancien test encodait le palier de prudence.
- **À faire avant fusion** : un duel plus long, d'environ 4 000 paires.
- **À faire dans tous les cas** : interdire le forçage sans atout. C'est déjà fait par `honneurDeForce` dans le lot 6.

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

Patch [`patches/interface.diff`](patches/interface.diff). Il touche `hud.js`, `table-scene.js`, le nouveau `client/signaux.js`, `styles.css` et la page de règles, mais pas le moteur. Build vérifié. Captures : [`patches/captures-interface/`](patches/captures-interface/).

| Amélioration | Ce que fait le patch |
|---|---|
| **P2** historique des enchères | Le bouton « Historique » ouvre trois onglets : Enchères, Cartes, Donnes. L'onglet Enchères affiche le tableau des annonces de la donne à partir de `G.bidLog` : 4 colonnes, passes comprises, contrat en or, coinche et surcoinche en note. |
| **P5** cartes tombées | Onglet Cartes : 32 cartes, atout en premier ; les cartes tombées sont barrées et celles de ta main cerclées. Le nombre d'atouts encore dehors est indiqué. |
| **P4** appel et refus | `signaux.js` lit `G.appel` et `G.refus` quelle que soit leur forme. L'affichage suit donc ce que lit le moteur, avant comme après le lot 3. Une pastille « Appel ♦ » s'affiche près du siège pendant 3 s, avec une annonce au lecteur d'écran. Sur ta propre défausse, une note discrète : « Les bots lisent ton R♠ comme un refus ». |
| **P6** coinche et surcoinche | Le bouton « Coincher » montre son armement : 600 ms, jauge, secousse si on clique trop tôt. La barre de surcoinche affiche un décompte de 10 s. |
| **P1** conventions des bots | Brouillon masqué (`hidden`) dans la page de règles, décrivant les conventions telles qu'elles seront **après** les lots 3, 4, 6 et 8. À rendre visible seulement une fois ces lots fusionnés (LIS-10). |

**Limites et ordre**

- **Données affichées.**
  - L'historique ne couvre que la donne en cours : `G.history` ne garde pas les enchères des donnes passées.
  - L'onglet Cartes ne dit pas qui a joué chaque carte.
- **Bundle.** Le bundle commité dans `site/assets/js/coinche/` n'est pas reproductible à l'identique. Il faut lancer `npm run build` et commiter le bundle à part.
- **Ordre conseillé des commits.**
  1. P6.
  2. P2 et P5.
  3. P4.
  4. P1 (masqué).
  5. Bundle.

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
