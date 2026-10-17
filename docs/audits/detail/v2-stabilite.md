# Vague 2 — Stabilité du Monte-Carlo (C1) et dépendance à l'appareil (C3)

Rapport du sous-agent « stabilité » (Sonnet). L'orchestrateur l'a versé dans le dépôt après l'avoir reçu sous forme de texte.

Le moteur `src/coinche/engine.js` est mesuré au commit `b548853`, sans modification. Cinq corrections ont été prototypées dans une copie, puis mesurées sur les mêmes positions.

- « Vérifié » signifie obtenu par exécution.
- Les numéros de ligne sont ceux du moteur d'origine.
- Diff unifié complet du prototype : [`v2-stabilite-prototype.diff`](v2-stabilite-prototype.diff).
- Synthèse générale : [`../2026-10-bots-coinche.md`](../2026-10-bots-coinche.md).

## En bref

Mesures sur 410 positions réelles, 5 graines, 96 mondes.

- **S1, graine dérivée de l'état.**
  - Aucune décision ne change plus d'une graine à l'autre.
  - S1 masque le bruit sans le réduire : il suffit d'un détail sans importance pour retomber sur une autre décision.
  - L'ordre des cartes en main change encore 6,1 % des cartes, et 1,4 % si la main est triée pendant la décision.
  - En duel, S1 seul est neutre : −1,5 ± 5,0 pts/donne.
- **S2, test apparié.** C'est la seule correction qui réduit vraiment le bruit. Avec z = 2 + 0,5 pt :
  - cartes instables : 33,6 % → 10,9 % ;
  - entames instables : 44,4 % → 15,6 % ;
  - écart au réflexe : 33,9 % → 7,5 % ;
  - preneur Valet-9 qui tire atout : 38,7 % → 62 % ;
  - défense qui entame atout : 11,6 % → 3,1 %.
- **S3 et S5 : à ne pas retenir.**
  - S3 gagne 5 points d'instabilité seul, rien de plus une fois S2 en place.
  - S5 ne réduit pas le bruit et coûte 10 % de calcul en plus.
- **S4, budget en nombre de mondes.** Avec une horloge 10 fois plus lente, voici la part des décisions qui changent :

  | Variante | Cartes | Enchères | Coinches |
  |---|---|---|---|
  | Moteur actuel | 16,1 % | 15,0 % | 15,8 % |
  | Plancher de 32 mondes, puis horloge | 11,8 % | 3,2 % | 0 % |
  | **Aucune lecture d'horloge** | **0 %** | **0 %** | **0 %** |

- **Duels non concluants** (48 mondes, environ 13 min chacun, ±2σ) :
  - combinaison S1 + S2 (z = 2 + 0,5) + S4 : +7,9 ± 6,9 pts/donne ;
  - S2 seul (z = 1,5 + 0,5) : −6,6 ± 5,6.

  Les signes sont opposés alors que z = 2 est le réglage le plus prudent : les barres d'erreur sous-estiment le bruit. **Le coût en force de S2 n'est pas établi.** On sait seulement qu'il est inférieur à environ 10 pts/donne en valeur absolue.

**Recommandation**

1. Tout de suite, car neutres en force : S4 sans horloge avec `minWorlds`, et S1 avec le tri de la main.
2. S2 (z = 2, +0,5) est un choix de produit, à trancher après un duel environ 10 fois plus long.

## 1. Méthode

### Positions mesurées

- **Lot `main`** : 410 décisions tirées des captures de parties de quatre bots de la vague 1 (`empirique/out2/g*.jsonl.caps`, vue du bot), par tirage stratifié et reproductible. Il compte :
  - 110 enchères ;
  - 90 entames ;
  - 130 suites ;
  - 60 coinches ;
  - 20 surcoinches.
- **Lot `conv`** : 280 entames du premier pli, construites avec des bots.
  - Les enchères sont jouées à 48 mondes.
  - Une donne sur deux, le détenteur de Valet-9 + 3 atouts est placé pour parler en premier.
  - 120 positions « P » (preneur avec Valet-9 et au moins 3 atouts) et 160 « D » (défense), dont 120 avec un As hors atout.

### Réglages

- 96 mondes (`mcSamples`, `bidWorlds`, `bidSamples`).
- Horloge figée, `tuning.now = () => 0`, sauf mention contraire.
- `Math.random = rng(1234 + 77k + 1 + 131·id)`, avec k = 0 à 4, soit 5 graines. Les lots à horloge lente ou perturbée n'utilisent que 2 graines, sur les 410 positions `main`.
- Instabilité : part des positions où les graines ne donnent pas toutes la même décision.
- Les catégories se recoupent : cartes (220 positions), entames (90), plis 1 à 3 (98).

### Évaluation de S2 hors ligne

S2 ne change que le choix final, pas les valeurs par monde. Pour chaque configuration, les 5 graines ont donc été enregistrées avec leurs valeurs par monde (`tuning.trace`), puis les règles S2 appliquées sur ces valeurs.

Trois contrôles :
- sans S2, la règle refait exactement le choix du moteur : 2 500 sur 2 500 ;
- S2 (z = 2 + 0,5) implémenté dans le moteur donne la même décision que le calcul hors ligne : 440 sur 440 ;
- tous drapeaux éteints, le prototype décide comme le moteur d'origine : 80 sur 80.

### Valeur hors échantillon

3 graines supplémentaires (288 mondes) donnent la valeur moyenne de chaque carte, indépendamment des mondes qui ont servi au choix.

- **Gain sur le réflexe** : valeur de la carte choisie moins valeur du réflexe.
- **Regret** : meilleure valeur possible moins valeur de la carte choisie.

Ces deux mesures sont des points de donne **dans le modèle du Monte-Carlo**, biaisé comme lui (C2). C'est une borne haute, pas la force réelle.

### Appareil lent, coût et duels

- **Appareil lent** : horloge `base + (performance.now() − base) × 10` (comme `mc/hw.mjs`) ; l'horloge « réelle » est `Date.now()`. On garde la même graine que la référence figée. La machine était très chargée : charge de 13 à 20 sur 4 cœurs, à cause des autres agents.
- **Coût** : temps CPU (`process.cpuUsage`), moyenné sur 60 cartes, 40 enchères et 30 coinches. Les configurations sont entrelacées, avec au moins 2 passes.
- **Duels** : `tests/coinche-ab.js base variante 100 48`, à 48 mondes avec l'horloge figée par le script, interrompu par `timeout` vers 780 s. On retient le dernier point d'étape. A est le moteur actuel, B la variante ; l'écart vaut B − A.

## 2. Tableaux récapitulatifs

### Instabilité et horloge lente

Chaque taux d'instabilité est la part des positions dont la décision change d'une graine à l'autre (5 graines). La **fragilité** est la même mesure quand S1 fige la graine mais qu'un détail sans importance la ferait retirer.

| Variante | Cartes | Entames | Plis 1-3 | Enchères | Coinche | Écart au réflexe | Horloge ×10 : cartes / enchères / coinche |
|---|---|---|---|---|---|---|---|
| Moteur actuel | 33,6 % | 44,4 % | 49,0 % | 7,3 % | 0 % | 33,9 % | 16,1 / 15,0 / 15,8 % |
| Réflexe seul | - | - | - | - | - | 0 % | - |
| S1 graine d'état | 0 % (fragilité 33,6 %) | 0 % | 0 % | 0 % | 0 % | 33,9 % | non traitée |
| S1 + tri de la main | comme S1 ; ordre de la main : 1,4 % (6,1 % sans tri) | comme S1 | comme S1 | comme S1 | comme S1 | comme S1 | comme S1 |
| S2 z = 1 | 30,0 % | 37,8 % | 44,9 % | - | - | 26,4 % | - |
| S2 z = 1,5 | 23,6 % | 26,7 % | 31,6 % | - | - | 19,3 % | - |
| S2 z = 2 | 17,3 % | 20,0 % | 22,4 % | - | - | 15,5 % | - |
| S2 z = 1,5 + 0,5 pt | 17,7 % | 23,3 % | 27,6 % | - | - | 10,7 % | - |
| **S2 z = 2 + 0,5 pt** | **10,9 %** | **15,6 %** | **14,3 %** | - | - | **7,5 %** | - |
| Marge fixe 0,5 ou 2,5 pts | 29,1 % | 40,0 % | 43,9 % | - | - | 22,4 % | - |
| S3 sans départage | 28,6 % | 40,0 % | 42,9 % | 7,3 % | 0 % | 22,4 % | - |
| S3 + S2 z = 2 + 0,5 pt | 10,9 % | 15,6 % | 14,3 % | - | - | 7,5 % | - |
| S4 plancher 32 + horloge | comme l'actuel (horloge figée, 80/80) | comme l'actuel | comme l'actuel | comme l'actuel | comme l'actuel | comme l'actuel | 11,8 / 3,2 / 0 % |
| S4 plancher 24 ; plancher 48 | comme l'actuel | comme l'actuel | comme l'actuel | comme l'actuel | comme l'actuel | comme l'actuel | 9,3 / 4,1 / 0,8 % ; 7,5 / 1,8 / 0 % |
| **S4b aucune lecture d'horloge** | comme l'actuel | comme l'actuel | comme l'actuel | comme l'actuel | comme l'actuel | comme l'actuel | **0 / 0 / 0 %** |
| S5 4 chaînes × 24 | 29,5 % | 41,1 % | 44,9 % | 5,5 % | 0 % | 33,2 % | - |
| S3 + S5 | 25,9 % | 36,7 % | 40,8 % | 5,5 % | 0 % | 21,8 % | - |
| S3 + S5 + S2 z = 2 + 0,5 pt | 10,5 % | 13,3 % | 13,3 % | - | - | 6,7 % | - |
| **Combinaison recommandée** (S1 + tri + S2 z = 2 + 0,5 + S4) | 0 % ; fragilité 10,9 % | 15,6 % | 14,3 % | 0 % | 0 % | 7,5 % | 3,2 / 3,2 / 0 % (plancher 32 + horloge) ; **0 / 0 / 0 % sans horloge** |

« - » : non mesuré. S2 ne touche ni les enchères ni la coinche.

### Conventions et temps de calcul

| Variante | Preneur V-9 tire atout | Défense entame atout | Défense entame un As | CPU cartes / enchères / coinche (ms) |
|---|---|---|---|---|
| Moteur actuel | 38,7 % | 11,6 % | 27,2 % | 27,0 / 24,1 / 17,4 |
| Réflexe seul | 100 % | 0 % | 34,2 % | - |
| S1 graine d'état | inchangé | inchangé | inchangé | 26,3 / 23,7 / 17,4 |
| S2 z = 1 | 43,2 % | 10,1 % | 28,3 % | proche de l'actuel |
| S2 z = 1,5 | 50,2 % | 6,5 % | 31,5 % | proche de l'actuel |
| S2 z = 2 | 61,2 % | 3,4 % | 33,5 % | proche de l'actuel |
| S2 z = 1,5 + 0,5 pt | 51,7 % | 5,6 % | 32,0 % | proche de l'actuel |
| **S2 z = 2 + 0,5 pt** | **62,0 %** | **3,1 %** | **34,0 %** | 25,7 / 23,4 / 17,4 |
| Marge fixe 0,5 ou 2,5 pts | 38,7 % | 11,6 % | 27,2 % | proche de l'actuel |
| S3 sans départage | 38,7 % | 11,5 % | 26,8 % | 24,3 / 23,4 / 17,5 |
| S3 + S2 z = 2 + 0,5 pt | 61,7 % | 3,0 % | 33,8 % | - |
| S4 (toutes variantes) | inchangé | inchangé | inchangé | sans horloge : 26,1 / 23,6 / 18,0 |
| S5 4 chaînes × 24 | 39,8 % | 13,3 % | 28,0 % | 29,7 / 26,0 / 20,8 |
| S3 + S5 | 39,8 % | 13,0 % | 27,3 % | - |
| S3 + S5 + S2 z = 2 + 0,5 pt | 61,7 % | 2,4 % | 33,3 % | - |
| **Combinaison recommandée** | 62,0 % | 3,1 % | 34,0 % | proche de l'actuel |

Effectifs (positions × 5 graines pour les conventions) :
- cartes : 220 positions, dont 90 entames et 98 aux plis 1 à 3 ;
- enchères : 110 ; coinches : 60 ; surcoinches : 20 ;
- conventions : 600 décisions P, 800 D, 600 D avec un As ;
- horloge lente : 440 cartes, 220 enchères, 120 coinches, 40 surcoinches.

### Force

| Variante | Gain sur réflexe (modèle, pts/décision) | Regret (modèle) | Duel à 48 mondes, B − A, ±2σ (paires de donnes ; parties ; durée) |
|---|---|---|---|
| Moteur actuel | +4,58 | 1,03 | - |
| S1 seul | identique (la loi des décisions ne change pas) | identique | **−1,49 ± 5,02** (1 182 ; 210 ; 751 s) |
| S2 z = 1,5 + 0,5 pt, seul | +3,96 | 1,65 | **−6,64 ± 5,58** (836 ; 142 ; 781 s) |
| S2 z = 2 + 0,5 pt, avec S1 et S4 | +3,66 | 1,96 | **+7,93 ± 6,94** (532 ; 92 ; 782 s) |
| S2 z = 1 | +4,37 | 1,24 | - |
| S2 z = 2 | +3,69 | 1,92 | - |
| S3 seul | +4,53 | 1,08 | - |
| S5 seul | +4,59 | 1,02 | - |
| S3 + S5 + S2 z = 2 + 0,5 pt | +3,50 | 2,11 | - |

## 3. Détail par variante

### S1 — graine dérivée de l'état

**Principe.** Tout le hasard d'une décision passe par un générateur local, `mcRand` (mulberry32). Il est initialisé par un hachage FNV-1a de ce que le siège sait. Cela couvre :
- les 5 tirages de `mcWorlds` ;
- ceux de `dealUnknown`, dont `shuffle` ;
- le tirage de surcoinche (l. 947).

Le hachage porte sur :
- la main du bot, **triée** ;
- le type de décision (enchère, carte, coinche, surcoinche), la phase, le nombre de plis joués et la position du donneur par rapport au bot ;
- le journal des enchères (siège, montant, couleur) et le contrat ;
- les cartes jouées par chaque siège, dans l'ordre, et le pli en cours ;
- la mémoire d'enchère du bot.

Les sièges sont comptés par rapport au bot. Le numéro de donne, `tour` et les identifiants de contrat n'entrent pas dans le hachage.

**Mesures (vérifiées).**
- Avec 5 graines différentes sur les 410 positions, aucune décision ne change : cartes 0/220, enchères 0/110, coinche 0/60, surcoinche 0/20.
- Perturbations sans importance (main retournée, `donneNumero` + 7, `tour` + 3), sur 2 graines :

| | Cartes | Enchères | Coinche | Surcoinche |
|---|---|---|---|---|
| Moteur actuel, même graine | 6,1 % (27/440) | 0/220 | 0/120 | 0/40 |
| S1 | 5,9 % (26/440) | 0/220 | 1,7 % (2/120) | 0/40 |
| S1 + main triée pendant la décision | 1,4 % (6/440) | 0/220 | 0/120 | 0/40 |

**Pourquoi le tri est nécessaire** (lecture du code, pas isolé par exécution). L'ordre de `G.hands[seat]` tranche les égalités du réflexe (la vague 1 signale des « égalités tranchées par l'ordre de la donne »). Il fixe aussi l'ordre des candidats quand le Monte-Carlo cherche la meilleure carte.

**Il reste 1,4 %.** `legal` est calculé avant le tri (`botChooseCard`, l. 2121-2127), donc dans l'ordre de la donne. Il faudrait trier aussi `legal` ; ce n'est pas essayé.

**Non testé** : la rotation de la table, c'est-à-dire un changement de siège absolu.

**Limite de fond.** S1 rend la même erreur à chaque fois dans la même situation. Il ne réduit pas la fragilité, qui reste à 33,6 % dès que le hachage change d'un détail. C'est S2 qui la réduit.

**Coût** : 26,3 ms par carte contre 27,0 ms, dans le bruit.

### S2 — test apparié dans `mcChooseCard` (l. 2062-2089)

**Principe.** On prend la carte qui obtient la meilleure valeur totale, si ce n'est pas le réflexe. On calcule, monde par monde, sa différence de valeur avec le réflexe. On ne garde cette carte que si la moyenne de ces différences dépasse `z × écart-type / √n + extra` ; sinon, on joue le réflexe. La règle `TRUMP_LEAD_MARGIN` (8 pts) s'applique ensuite.

**Mesures** (voir la section 2) :
- **Effet de z.** Sans +0,5 pt, l'instabilité vaut 30,0 / 23,6 / 17,3 % pour z = 1 / 1,5 / 2. Avec +0,5 pt : 25,5 / 17,7 / 10,9 %.
- **Rôle du +0,5 pt.** À z = 2, il fait passer les écarts au réflexe de 15,5 % à 7,5 %.
  - Les différences de valeur par monde sont presque binaires : soit zéro (bruit des points de plis), soit de l'ordre d'un contrat quand l'issue bascule.
  - Quelques mondes qui basculent suffisent à dépasser z erreurs-types : d'où l'utilité d'un seuil absolu en plus.
- **Une marge fixe (0,5 ou 2,5 pts) sans test ne suffit pas** : 29,1 % d'instabilité dans les deux cas. Les valeurs étant quantifiées, presque aucune décision ne tombe entre 0,5 et 2,5 pts.
- **Conventions.**
  - Preneur Valet-9 qui tire atout : 38,7 % → 62,0 %.
  - Défense qui entame atout : 11,6 % → 3,1 %.
  - Défense qui entame un As : 27,2 % → 34,0 % (réflexe : 34,2 %).
- **Coût en force dans le modèle.** Le gain sur le réflexe passe de +4,58 à +3,66, soit −0,9 pt par décision.
  - C'est une borne haute : le modèle surestime les coups qu'il aime (C2).
  - Un bot prend environ 7 décisions non forcées par donne.

### S3 — plus de départage aux points de plis (l. 1864-1873)

- Le terme `(pointsPlis[team] − pointsPlis[1 − team]) × 0,01` est supprimé.
- Effets :
  - cartes instables : 33,6 → 28,6 % ;
  - entames instables : 44,4 → 40,0 % ;
  - écarts au réflexe : 33,9 → 22,4 % ;
  - regret : 1,03 → 1,08 ;
  - conventions inchangées.
- **Avec S2 (z = 2 + 0,5 pt), aucun gain supplémentaire** : 10,9 % dans les deux cas. Le +0,5 pt de S2 absorbe déjà le départage.
- CPU : 27,0 → 24,3 ms, plausiblement du bruit.

### S4 — budget en nombre de mondes

Changements (diff à la section 4) :

1. **`mcChooseCard`** : un plancher de mondes (`s4.floor`) doit être atteint avant toute lecture de l'horloge ; `s4.clock = false` supprime la lecture. Le chronomètre y démarre déjà après `mcWorlds` dans le code d'origine.
2. **`makeProbability`** : le chronomètre démarre après `mcWorlds`, il n'y a plus de `return null` sur `bidDeadline`, et le même plancher s'applique.
3. **`minWorlds = CAPOT_WORLDS`** pour la première simulation de `generaleBid`, pour la coinche et pour la surcoinche.
4. **Plus de `null`.** Avec un plancher d'au moins 24 mondes, aucune des 820 décisions ne contient de `null`, contre 15,4 % avec le moteur actuel à ×10. Si le plancher descendait un jour sous 24, ce point serait à revoir.

**Horloge ×10** (410 positions × 2 graines, même graine que la référence figée) :

| Variante | Cartes | Entames | Plis 1-3 | Enchères | Coinche | Surcoinche |
|---|---|---|---|---|---|---|
| Moteur actuel | 16,1 % (71/440) | 24,4 % | 25,5 % | 15,0 % (33/220) | 15,8 % (19/120) | 7,5 % (3/40) |
| Plancher 24 + horloge | 9,3 % | 17,8 % | 14,3 % | 4,1 % | 0,8 % | 2,5 % |
| Plancher 32 + horloge | 11,8 % (52/440) | 20,0 % | 16,8 % | 3,2 % (7/220) | 0 % | 2,5 % |
| Plancher 48 + horloge | 7,5 % | 13,9 % | 11,2 % | 1,8 % | 0 % | 2,5 % |
| **Plancher 32, aucune lecture d'horloge** | **0 % (0/440)** | **0 %** | **0 %** | **0 % (0/220)** | **0 % (0/120)** | **0 % (0/40)** |

- **Mondes évalués à ×10.**
  - Moteur actuel, cartes : médiane 33, 10e centile 4, minimum 1 ; 69 % des décisions passent sous 96 mondes, 42 % sous 24.
  - Moteur actuel, enchères : le minimum de mondes d'une simulation a pour médiane 1, et 15,4 % des décisions contiennent un `null` (126/820).
  - Avec un plancher de 32 : cartes, médiane 39 et minimum 32 ; enchères, 32.
- **Horloge réelle sur cette machine chargée.** Changent 2,3 % des cartes et 1,8 % des enchères avec le moteur actuel, contre 1,8 % et 0,5 % avec un plancher de 32.
- **Combinaison complète (S1 + tri + S2 + S4) à ×10**, comparée à elle-même en horloge figée :
  - plancher 32 + horloge : 3,2 % des cartes (14/440), 3,2 % des enchères (7/220), 0 % des coinches ;
  - sans horloge : 0 % partout.
  S2 absorbe une partie de la différence de mondes.
- **Garder l'horloge, même après un plancher, laisse 7 à 12 % des cartes dépendre de l'appareil.** Seule la version sans lecture d'horloge est exacte.
- **Coût sans horloge** : 26 ms par carte, 24 ms par enchère, 18 ms par coinche (96 mondes, sur cette machine).
  - **Extrapolation non mesurée** : un appareil 10 fois plus lent prendrait environ 260 / 240 / 180 ms, du même ordre que les budgets actuels (250 / 150 / 400 ms).
- **Idée non prototypée** : mesurer la vitesse une seule fois au démarrage, et en tirer un nombre fixe de mondes pour la session.

### S5 — plusieurs chaînes indépendantes dans `mcWorlds`

- **Principe.** 4 chaînes de 24 mondes, chacune démarrée indépendamment avec 400 pas de chauffe ; les mondes des chaînes sont entrelacés. Avec une seule chaîne, le résultat est identique à l'original.
- **Instabilité.** Cartes 33,6 → 29,5 %, enchères 7,3 → 5,5 %, surcoinche 1/20 → 0/20.
- **Calcul en plus.** +10 % pour les cartes, +8 % pour les enchères, +20 % pour la coinche.
- **Bruit de l'écart de valeur entre le réflexe et la meilleure carte** (écart-type entre graines de cette valeur moyenne, sur 220 positions) : médiane de 1,424 pt avec le moteur actuel, 1,428 pt avec S5. Pas de gain.
- L'estimation « 25 à 45 mondes indépendants » de la vague 1 (MON-5) ne se retrouve pas sur cette mesure : avec `THIN` = 32, le bruit est celui d'environ 96 mondes indépendants.
- Avec S2 : 10,5 % contre 10,9 %. À ne pas retenir.

## 4. Diff exact des prototypes

Tout est dans `proto/engine.js`, généré par `patch.py` à partir de `base/engine.js` (moteur au commit `b548853`). Le diff unifié complet est en annexe : [`v2-stabilite-prototype.diff`](v2-stabilite-prototype.diff).

Drapeaux de `tuning`, tous éteints par défaut :
- `s1` : `false`, ou un nombre qui sert de sel ;
- `s1sort` ;
- `s2` : `{ z, extra }` ;
- `s3` ;
- `s4` : `{ floor, clock }` ;
- `s5` : nombre de chaînes ;
- `trace`.

Les repères `engine.js:N` renvoient au moteur d'origine. `-` marque une ligne d'origine, `+` une ligne du prototype. Chaque variante peut être reprise seule.

Pour reprendre la combinaison dans le vrai moteur, sans drapeaux :
- **S1** : `mcRand`, `prng`, `stateSeed`, `withSeed`, les remplacements de `Math.random` et les enveloppes de décision, plus un tri de `legal` dans `botChooseCard` ;
- **S2** : le bloc de `mcChooseCard`, avec `z = 2` et `extra = 0.5` en constantes ;
- **S4** : le bloc de `makeProbability`, avec un plancher de 32 et sans `tuning.now()`.

#### Infrastructure commune (drapeaux `tuning.*`, hasard injecté `mcRand`, traces)

```diff
@@ engine.js:1491 @@
+  // Prototypes de stabilité (audit vague 2). Tout à l'arrêt = moteur d'origine.
+  s1: false, // graine dérivée de l'état (nombre = sel, pour les mesures)
+  s1sort: false, // S1 : main triée pendant la décision
+  s2: null, // test apparié { z, extra } dans mcChooseCard
+  s3: false, // plus de départage aux points de plis dans donneValue
+  s4: null, // budget en mondes { floor, clock }
+  s5: 1, // nombre de chaînes indépendantes dans mcWorlds
+  trace: false,
@@ engine.js:1494 @@
+export const mcTrace = { last: null, nulls: 0, mp: [] };
+let mcRand = () => Math.random();
+function prng(seed) {
+  let s = seed | 0;
+  return () => {
+    s = (s + 0x6d2b79f5) | 0;
+    let t = Math.imul(s ^ (s >>> 15), 1 | s);
+    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
+    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
+  };
+}
+// S1 : graine = hachage (FNV-1a) de ce que le siège sait — sa main TRIÉE,
+// les enchères, les cartes jouées, le contrat, en sièges RELATIFS — et rien
+// d'autre (ni numéro de donne, ni identifiants, ni ordre de la main).
+function stateSeed(seat, tag) {
+  let h = 2166136261;
+  const mix = (str) => {
+    for (let i = 0; i < str.length; i++) {
+      h ^= str.charCodeAt(i);
+      h = Math.imul(h, 16777619);
+    }
+    h ^= 124;
+    h = Math.imul(h, 16777619);
+  };
+  const rel = (s) => (s - seat + 4) % 4;
+  mix(tag + ":" + G.phase + ":" + G.plisJoues + ":" + rel(G.donneur));
+  mix(G.hands[seat].map((c) => c.id).sort().join(","));
+  for (const e of G.bidLog) mix(rel(e.seat) + ":" + (e.montant || "P") + (e.atout || ""));
+  const c = G.contract;
+  if (c) mix([c.montant, c.atout, rel(c.preneur), c.coinche ? 1 : 0, c.surcoinche ? 1 : 0].join(","));
+  for (let r = 0; r < 4; r++) mix(G.playedBy[(seat + r) % 4].map((k) => k.id).join(","));
+  mix(G.pliCourant.map((e) => rel(e.siege) + e.carte.id).join(","));
+  mix(JSON.stringify(G.bidMemo[seat] || null));
+  return h >>> 0;
+}
+function withSeed(seat, tag, fn) {
+  if (tuning.s1 === false) return fn();
+  const prev = mcRand;
+  const hand = G.hands[seat];
+  mcRand = prng(stateSeed(seat, tag) ^ (Number(tuning.s1) | 0));
+  // Main triée une fois pour toutes : égalités de réflexes et ordre des coups
+  // ne dépendent plus de l'ordre de la donne.
+  if (tuning.s1sort) G.hands[seat] = hand.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
+  try {
+    return fn();
+  } finally {
+    mcRand = prev;
+    G.hands[seat] = hand;
+  }
+}
+const nullProb = () => {
+  mcTrace.nulls++;
+  return null;
+};
+
```

#### S1 — graine dérivée de l'état

```diff
@@ engine.js:1509 @@
-  const cards = shuffle(unknown)
+  const cards = shuffle(unknown, mcRand)
```

```diff
@@ engine.js:1521 @@
-    let r = Math.random() * open.reduce((t, s) => t + room[s], 0);
+    let r = mcRand() * open.reduce((t, s) => t + room[s], 0);
```

```diff
@@ engine.js:1736 @@
-    const a = seats[Math.floor(Math.random() * seats.length)];
+    const a = seats[Math.floor(mcRand() * seats.length)];
```

```diff
@@ engine.js:1737 @@
-    let b = seats[Math.floor(Math.random() * (seats.length - 1))];
+    let b = seats[Math.floor(mcRand() * (seats.length - 1))];
```

```diff
@@ engine.js:1739 @@
-    const ia = Math.floor(Math.random() * w[a].length);
+    const ia = Math.floor(mcRand() * w[a].length);
```

```diff
@@ engine.js:1740 @@
-    const ib = Math.floor(Math.random() * w[b].length);
+    const ib = Math.floor(mcRand() * w[b].length);
```

```diff
@@ engine.js:1753 @@
-      if (Math.random() * weight[a] * weight[b] < wa * wb) {
+      if (mcRand() * weight[a] * weight[b] < wa * wb) {
```

```diff
@@ engine.js:947 @@
-    Math.random() < 0.8 * personality(seat).aggr
+    mcRand() < 0.8 * personality(seat).aggr
```

```diff
@@ engine.js:577 @@
-    return decideBid(seat);
+    return withSeed(seat, "bid", () => decideBid(seat));
```

```diff
@@ engine.js:2130 @@
-  return mcChooseCard(seat, legal, heuristicCard(seat));
+  return withSeed(seat, "card", () => mcChooseCard(seat, legal, heuristicCard(seat)));
```

```diff
@@ engine.js:2479 @@
-  wantsToCoinche: withG(botWantsToCoinche),
+  wantsToCoinche: withG((s) => withSeed(s, "coinche", () => botWantsToCoinche(s))),
```

```diff
@@ engine.js:2480 @@
-  wantsToSurcoinche: withG(botWantsToSurcoinche),
+  wantsToSurcoinche: withG((s) => withSeed(s, "surcoinche", () => botWantsToSurcoinche(s))),
```

#### S2 — test apparié dans `mcChooseCard`

```diff
@@ engine.js:2067 @@
+  const vals = tuning.s2 || tuning.trace ? cards.map(() => []) : null;
@@ engine.js:2068 @@
+  const s4 = tuning.s4;
@@ engine.js:2071 @@
-      totals[i] += mcValue(seat, c, w);
+      const v = mcValue(seat, c, w);
+      totals[i] += v;
+      if (vals) vals[i].push(v);
@@ engine.js:2074 @@
-    if (tuning.now() > stop) break;
+    // S4 : plancher de mondes avant toute lecture de l'horloge (ou aucune).
+    if ((!s4 || (n >= s4.floor && s4.clock)) && tuning.now() > stop) break;
@@ engine.js:2080 @@
+  const best0 = best;
+  // S2 : test apparié sur les mêmes mondes. On ne quitte le réflexe que si le
+  // gain moyen dépasse z erreurs-types (+ extra points).
+  if (best && tuning.s2) {
+    let mu = 0;
+    let m2 = 0;
+    for (let k = 0; k < n; k++) {
+      const d = vals[best][k] - vals[0][k];
+      mu += d;
+      m2 += d * d;
+    }
+    mu /= n;
+    const sd = n > 1 ? Math.sqrt(Math.max(0, (m2 - n * mu * mu) / (n - 1))) : Infinity;
+    if (mu <= (tuning.s2.z * sd) / Math.sqrt(n) + (tuning.s2.extra || 0)) best = 0;
+  }
```

```diff
@@ engine.js:2088 @@
+  if (tuning.trace)
+    mcTrace.last = { n, totals: totals.slice(), ids: cards.map((c) => c.id), best, best0, vals };
```

#### S3 — plus de départage aux points de plis

```diff
@@ engine.js:1871 @@
-    (pointsPlis[team] - pointsPlis[1 - team]) * 0.01
+    (pointsPlis[team] - pointsPlis[1 - team]) * (tuning.s3 ? 0 : 0.01)
```

#### S4 — budget en mondes

```diff
@@ engine.js:2096 @@
-  if (tuning.now() >= bidDeadline) return null;
+  const s4 = tuning.s4;
+  if (!s4 && tuning.now() >= bidDeadline) return nullProb();
@@ engine.js:2100 @@
-    const stop = Math.min(tuning.now() + BID_BUDGET_MS, bidDeadline);
+    let stop = s4 ? 0 : Math.min(tuning.now() + BID_BUDGET_MS, bidDeadline);
```

```diff
@@ engine.js:2109 @@
+    // S4 : chronomètre démarré après la génération des mondes.
+    if (s4) stop = Math.min(tuning.now() + BID_BUDGET_MS, bidDeadline);
@@ engine.js:2113 @@
-      if (tuning.now() > stop) break;
+      if ((!s4 || (n >= s4.floor && s4.clock)) && tuning.now() > stop) break;
@@ engine.js:2115 @@
-    return n >= minWorlds ? ok / n : null;
+    if (tuning.trace) mcTrace.mp.push(n);
+    return n >= minWorlds ? ok / n : nullProb();
```

```diff
@@ engine.js:614 @@
-    });
+    }, tuning.s4 ? CAPOT_WORLDS : 1);
```

```diff
@@ engine.js:915 @@
-  const pMake = makeProbability(seat, contract);
+  const pMake = makeProbability(seat, contract, tuning.s4 ? CAPOT_WORLDS : 1);
```

```diff
@@ engine.js:940 @@
-  const pm = makeProbability(seat, contract);
+  const pm = makeProbability(seat, contract, tuning.s4 ? CAPOT_WORLDS : 1);
```

#### S5 — plusieurs chaînes dans `mcWorlds`

```diff
@@ engine.js:1714 @@
+  const readings = bidReadings();
+  const seats = others.filter((s) => size[s] > 0);
+  const chains = seats.length > 1 ? Math.max(1, tuning.s5 | 0) : 1;
+  const perChain = [];
@@ engine.js:1715 @@
+  for (let ch = 0; ch < chains; ch++) {
+  w = null;
@@ engine.js:1717 @@
-  if (!w) return [];
+  if (!w) {
+    if (!ch) return [];
+    break;
+  }
```

```diff
@@ engine.js:1728 @@
-  const readings = bidReadings();
@@ engine.js:1731 @@
-  const seats = others.filter((s) => size[s] > 0);
@@ engine.js:1733 @@
+  const per = Math.ceil(n / chains);
+  const target = Math.min(per, n - ch * per);
@@ engine.js:1735 @@
-  for (let step = 0; worlds.length < n && seats.length > 1; step++) {
+  for (let step = 0; worlds.length < target && seats.length > 1; step++) {
```

```diff
@@ engine.js:1767 @@
+  perChain.push(worlds);
+  }
+  // Mondes des chaînes entrelacés : une coupure d'horloge garde toutes les chaînes.
+  const out = [];
+  for (let k = 0; out.length < n && perChain.some((c) => k < c.length); k++)
+    for (const c of perChain) if (k < c.length && out.length < n) out.push(c[k]);
@@ engine.js:1768 @@
-    while (worlds.length < n)
-      worlds.push(dealUnknown(unknown, others, size, pinned) || w);
-  return worlds;
+    while (out.length < n)
+      out.push(dealUnknown(unknown, others, size, pinned) || w);
+  return out;
```

## 5. Duels : lecture

| Variante | B − A (pts/donne, ±2σ) | Paires de donnes | Parties |
|---|---|---|---|
| S1 seul | −1,49 ± 5,02 | 1 182 | 210 |
| Combinaison (S1 sans tri + S2 z = 2 + 0,5 + S4) | +7,93 ± 6,94 | 532 | 92 |
| S2 z = 1,5 + 0,5 seul | −6,64 ± 5,58 | 836 | 142 |

- **S1 seul est neutre**, comme prévu : la loi des décisions ne change pas.
- **Les deux autres résultats sont contradictoires.** Ils sont de signes opposés, à 14,6 pts d'écart (environ 3 erreurs-types combinées). Or z = 2 est plus prudent que z = 1,5, et S1 et S4 sont neutres en force à horloge figée.
- **Les barres d'erreur de `coinche-ab.js` sous-estiment donc le bruit réel.** Deux causes possibles, non vérifiées : les donnes d'une même partie ne sont pas indépendantes, et la charge de la machine a varié d'un duel à l'autre.

**Conclusion : le coût en force de S2 n'est pas établi.**
- Ces duels montrent seulement que l'effet est inférieur à environ 10 pts/donne en valeur absolue.
- Un coût d'environ 1 pt/donne reste possible. C'est l'ordre de grandeur que le commentaire des l. 1476-1478 attribue à une marge fixe de 5 pts.
- La borne du modèle (−0,9 pt par décision, environ 7 décisions non forcées par bot et par donne) n'est ni confirmée ni exclue.
- Pour départager z = 1,5 et z = 2 à 1,5 pt près, il faudrait environ 10 fois plus de donnes : environ 2 h 30 de calcul sur 4 cœurs à cette charge (estimation).

## 6. Recommandations chiffrées

| Option | Contenu | Cartes instables (5 graines / fragilité) | Horloge ×10 | Écart au réflexe | Coût en force |
|---|---|---|---|---|---|
| A. Reproductibilité | S1 + tri de la main et de `legal` + S4 sans horloge | 0 % / 33,6 % | 0 % | 33,9 % (inchangé) | nul par construction ; duel S1 : −1,5 ± 5,0 |
| **B. Recommandée** | A + S2 z = 2 + 0,5 pt | 0 % / 10,9 % (entames 15,6 %, plis 1-3 14,3 %) | 0 % | 7,5 % | non établi (duel +7,9 ± 6,9) ; borne du modèle −0,9 pt/décision |
| C. Modérée | A + S2 z = 1,5 + 0,5 pt | 0 % / 17,7 % | 0 % | 10,7 % | non établi (duel −6,6 ± 5,6) |

Ordre conseillé :

1. **S4 sans horloge + `minWorlds`.**
   - Supprime la dépendance à l'appareil : aujourd'hui, à ×10, 15 à 16 % des cartes, des enchères et des coinches changent.
   - Prévoir un garde-fou très large pour les appareils extrêmes, et mesurer le coût sur un vrai téléphone.
2. **S1 + tri.**
   - Même situation, même décision, y compris pour les enchères et la surcoinche.
   - Ajouter le test « même état, plusieurs graines, même décision » (plan de correction de l'audit, point 8).
3. **S2.** Décision de produit, à prendre après un duel plus long. C'est la seule correction qui réduit la fragilité (33,6 → 10,9 %).

À ne pas faire :
- **S5** : aucun gain sur le bruit, et 10 % de calcul en plus.
- **S3** : aucun gain une fois S2 en place.

**Ce que ces corrections ne règlent pas : les conventions (C2).** Même avec S2, le preneur Valet-9 ne tire atout que dans 62 % des cas, contre 100 % pour le réflexe. La défense entame encore atout dans 3,1 % des cas, contre 0 % pour le réflexe. Il faut une règle dure ou un modèle de défense simulée : voir [`v2-conventions.md`](v2-conventions.md).

## 7. Limites

- **Puissance des duels.** Environ ±5 à ±7 pts/donne à 2σ, en 13 minutes sur une machine surchargée. Ces barres sont probablement optimistes (section 5).
- **Valeurs du modèle** (gain, regret). Elles sont biaisées comme le Monte-Carlo (C2) : ce sont des ordres de grandeur seulement.
- **Appareil lent.** Il est simulé par une horloge ×10, pas mesuré sur un vrai téléphone.
  - Les coûts sur appareil lent sont extrapolés.
  - La colonne « horloge réelle » mélange la vitesse du processeur et la charge des autres agents.
  - Les ms sont des temps CPU, mais l'écart de S3 (−10 %) relève plausiblement du bruit.
- **Échantillon.** 410 positions de parties de bots, à 96 mondes ; 5 graines pour l'instabilité, 2 pour l'horloge et les perturbations.
  - L'instabilité dépend du nombre de graines : S2 dans le moteur, avec 2 graines, donne 4,1 % ; hors ligne, avec 5 graines, 10,9 %.
  - Ne comparer qu'à nombre de graines égal.
- **Conventions.** Mesurées sur 280 entames construites au premier pli (enchères à 48 mondes).
  - Le réflexe y entame un As dans 34,2 % des cas, contre 82 % relevés par la vague 1 (EMP-4). Les définitions diffèrent : ce lot compte toute main qui a un As hors atout.
  - Seules les comparaisons entre variantes sont valables.
- **S1.** La rotation de la table n'est pas testée. 1,4 % des cartes changent encore à cause de l'ordre de `legal` (lecture du code).
- **Non fait.**
  - Duels pour S3 et S5.
  - Duel en horloge lente.
  - Justesse des mondes de S5 (`tests/coinche-justesse.js`).
  - Enchères sous S2, que S2 ne modifie pas.
- **Reproduction.** Les fichiers suivants sont dans le dossier temporaire de la session d'audit, non versionné :
  - `patch.py` génère `proto/engine.js` ;
  - `meas.mjs` prend une décision par position et par graine ;
  - `agg.mjs` agrège les résultats ;
  - `cost.mjs` mesure le temps de calcul ;
  - `mkvariant.py` fixe les valeurs par défaut des drapeaux ;
  - `variants/{combo,s2mild,s1only}/engine.js` sont les moteurs des duels ;
  - `out/` contient les sorties brutes, dont les duels (`duel_*.err`).
