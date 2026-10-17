# Vague 2 : chiffrer les corrections de conventions et de signaux (C2, C4)

Rapport du sous-agent « conventions » (Sonnet), versé dans le dépôt par l'orchestrateur, qui l'a reçu sous forme de texte. Les prototypes sont faits dans une copie du moteur (`engine.js` au commit `b548853`), jamais dans `src/`.

Tout ce qui suit est **vérifié par exécution**, sauf mention « lecture du code ». Le diff du prototype est en annexe : [`v2-conventions-prototype.diff`](v2-conventions-prototype.diff). Synthèse : [`../2026-10-bots-coinche.md`](../2026-10-bots-coinche.md).

## En bref

- **Partie A, hypothèse infirmée.** On a fait entamer atout à la défense imaginée. Le preneur avec Valet + 9 ne tire pas plus atout pour autant : 45,0 % → 42,1 %. La cause d'ENT-3 / EMP-3 est ailleurs. Le Monte-Carlo garde Valet-9 quand il n'a que 3 atouts (il tire atout dans 27 % des cas) et le tire avec 4 atouts ou plus (63 %).
- **Partie B, marges de convention dans `mcChooseCard`** (32 / 32 / 16 / 32 pts/monde). Violations avant → après :

  | Règle | Avant | Après |
  |---|---|---|
  | Couleur annoncée par le partenaire abandonnée | 63 % | 10 % |
  | Couleur appelée abandonnée | 45 % | 12 % |
  | Preneur V+9+3 atouts qui ne tire pas atout | 57 % | 26 % |
  | Défense qui n'entame pas son As | 55 % | 27 % |
  | Défense qui entame atout | 8 % | 3 % |

- **Partie C, signaux.**

  | Mesure | Avant | Après |
  |---|---|---|
  | Appels lus qui sont faux | 85 % | 23 % (17,3 → 0,8 par partie) |
  | Vrais appels lus par partie | 3,0 | 2,7 |
  | Vrais appels gardés par le Monte-Carlo | 36 % | 86 % |
  | Réflexe qui dépend de l'ordre des cartes en main | 6,0 % | 0 % |

  `SIGNAL_MISFIT` est recalibré à 0,10.
- **Force.** Aucun coût mesurable : +0,21 ± 4,60 pts/donne (2σ) pour la combinaison complète, −0,60 ± 4,59 pour signaux + tri seuls. La précision ne permet pas de voir un effet de 1 à 3 pts/donne.

## Méthode

- **Prototype.** `engine.proto.js` reprend `engine.js` et lui ajoute un objet de drapeaux exporté `V`. Tous les drapeaux à leur valeur d'origine redonnent le comportement actuel. Des crochets de capture (`V.onDecision`, `V.onSignal`) ne changent rien au jeu.
- **Protocole avant / après.**
  - Parties de quatre bots, 96 mondes, `tuning.now = () => 0`. Le hasard vient de `rng(seed)`, réinitialisé à chaque donne (`reseed`) : donnes `7000+g`, bots `9000+g`. Les deux séries jouent les **mêmes donnes de départ**.
  - Avant : 52 parties (g = 0-17, 20-35, 40-55), 674 donnes, 14 051 décisions de carte.
  - Après : 48 parties (g = 0-15, 20-35, 40-55), 625 donnes, 12 907 décisions de carte.
  - Les parties divergent dès que le jeu change : ce sont deux échantillons, pas deux rejeux de la même partie.
- **Règles rejouées hors ligne.** Pour B et C4, chaque décision Monte-Carlo est capturée avec ses totaux par carte, calculés sur les mêmes mondes pour toutes les cartes. La règle « garder le réflexe si le Monte-Carlo ne lui préfère pas une autre carte de plus de M pts/monde » se rejoue donc **exactement** sur ces totaux. Les tableaux « marge M » viennent de la série avant.
- **Coût proxy.** Somme des écarts simulés abandonnés, divisée par le nombre de donnes. Il mesure ce que le Monte-Carlo **croit** perdre. Il est biaisé (c'est justement le sujet de l'audit) : c'est une borne haute, pas un coût réel.
- **Force.** Duels `tests/coinche-ab.js` à 32 mondes, donnes jumelles, équipes échangées.
- **Vocabulaire.** Une entame est la première carte d'un pli. La « 1re entame » d'un siège est sa première entame de la donne. Un défenseur est un joueur du camp non preneur.

## Partie A : cause d'ENT-3 / EMP-3, hypothèse infirmée

**Hypothèse.** Le preneur ne tire pas atout parce que, dans les mondes imaginés, la défense n'entame jamais atout.

**Prototype** (`simCard` dans `playOut`, drapeau `V.simDefTrump`). Un défenseur imaginé entame atout (le maître s'il l'a, sinon le plus petit) quand il a la main avant le pli 5 et au moins 2 atouts, en contrat numérique. Trois variantes :
- avec une probabilité fixe p (tirage par hachage de la main, identique pour toutes les cartes candidates) ;
- quand le preneur du monde a une coupe à préserver (un atout et une couleur à 0 ou 1 carte) ;
- toujours.

**Mesure.** 170 premières entames de preneurs avec Valet + 9 + au moins 3 atouts, issues de 140 parties jouées par les réflexes. Chacune est rejouée avec 2 graines à 96 mondes, soit 340 rejeux par ligne. Le réflexe tire atout dans 99,4 % des cas.

| Défense imaginée | Choix final = atout | Meilleur choix brut = atout (avant la marge de 8) | Écart moyen, meilleur atout − meilleur non-atout (pts/monde) |
|---|---|---|---|
| Actuelle (jamais atout) | **45,0 %** | 25,0 % | −14,55 |
| p = 0,35 | 42,9 % | 23,8 % | −14,53 |
| p = 0,7 | 43,2 % | 22,1 % | −14,19 |
| Coupe du preneur | 42,1 % | 19,1 % | −14,31 |
| Toujours | 42,1 % | 19,1 % | −14,31 |

« Toujours » donne le même résultat que « coupe du preneur » : ici, le preneur a toujours une couleur à 0 ou 1 carte.

**Lecture.** Si l'hypothèse était juste, la part d'atout monterait vers les 99 % du réflexe quand la défense imaginée rejoue atout. Elle **baisse** (45,0 → 42,1 %) et l'écart simulé ne bouge pas. Faire rejouer atout à la défense imaginée ne corrige donc rien : **ne pas l'implémenter pour cette raison**.

**Ce que disent les données (série avant).**
- Sur 96 premières entames de preneurs avec V+9 et 3 atouts ou plus, le réflexe tire atout 95 fois (99,0 %), le choix final 38 fois (**39,6 %**). La vague 1 trouvait 33 %.
- Sur 108 entames de ce type, le meilleur atout est **moins bon** que le meilleur non-atout de 11,7 pts/monde en médiane. Il n'est meilleur que dans 25,9 % des cas. La marge actuelle (8) garde l'atout dans 43,5 % des cas.
- Le meilleur non-atout est :
  - une petite carte (7, 8, 9 ou Valet) dans 65 cas sur 108, avec un avantage moyen de 22,7 pts/monde ;
  - une Dame ou un Roi dans 25 cas (11,8) ;
  - un 10 dans 12 cas (18,5) ;
  - un As dans 6 cas (−1,5).
- Le choix dépend du **nombre d'atouts**, pas de la présence d'un As à côté :
  - 3 atouts : atout choisi dans **27,0 %** des cas (17/63) ;
  - 4 atouts ou plus : **63,3 %** (31/49) ;
  - avec un As hors atout : 45,7 % ; sans : 40,9 %.

Le Monte-Carlo juge que Valet-9 avec seulement 3 atouts ne doit pas se dépenser tout de suite. Cette préférence ne vient pas de la défense imaginée. Elle peut être juste, ou venir d'un autre biais : les réflexes des joueurs imaginés après la première carte, ou l'évaluation de la fin de donne. Piste non testée ; le duel dira ce qu'elle vaut (voir B2).

## Partie B : protections de conventions dans `mcChooseCard`

### Diff (base : `engine.js:2050-2089`)

Dans `leadCard` (engine.js:1190-1318), les `return` « maître » (défense), « couleur appelée » (attaque et défense) et « couleur annoncée » remplissent `reflexWhy` avec `master`, `called` ou `partner`. `botChooseCard` (l. 2122) le lit juste après `heuristicCard` et le passe à `mcChooseCard(seat, legal, reflex, why)`. Celle-ci ajoute le bloc suivant, après le choix de la meilleure carte et après la marge `TRUMP_LEAD_MARGIN`, en entame seulement :

```js
if (best && !following) {
  const c = G.contract;
  const keep = (m) => m !== null && adj[0] >= adj[best] - m * n;   // garder le réflexe ? (adj[0] = réflexe)
  const def = teamOf(seat) !== c.equipePreneur;
  const choice = cards[best];
  // B1 : la défense n'entame pas atout (sauf capot / Générale)
  if (def && c.type === "NUMERIQUE" && choice.suit === atout && reflex.suit !== atout && keep(V.mcTrumpDef)) best = 0;
  // B2 : le preneur avec Valet-9 et 3 atouts tire atout quand le réflexe le fait
  else if (seat === c.preneur && reflex.suit === atout && choice.suit !== atout &&
           holds(hand, atout, "J") && holds(hand, atout, "9") && suitCards(hand, atout).length >= 3 && keep(V.mcTakerDraw)) best = 0;
  // B3 : la défense entame son As quand le réflexe le fait
  else if (def && reflex.rank === "A" && reflex.suit !== atout && choice.rank !== "A" && keep(V.mcDefAce)) best = 0;
  // B4 : la couleur appelée / annoncée par le partenaire revient
  else if ((why === "called" || why === "partner") && choice.suit !== reflex.suit && keep(V.mcCalled)) best = 0;
}
```

Chaque drapeau `V.mc*` vaut `null` (règle absente), un nombre M en pts/monde (marge) ou `Infinity` (règle dure). Pour B1, le « cas précis » où la défense peut entamer atout est le contrat capot ou Générale. Une autre exception possible n'a pas été chiffrée : le défenseur qui tient le Valet d'atout.

### Taux de violation et coût, série avant (52 parties, 96 mondes)

Échantillons :
- B1 : 1 604 entames de défenseur dont le réflexe n'est pas atout (970 premières entames) ;
- B2 : 111 entames de preneur (95 premières) ;
- B3 : 408 entames de défenseur dont le réflexe est un As (295 premières) ;
- B4a : 110 entames (34 premières) ;
- B4b : 133 entames (118 premières).

Chaque cellule donne le taux de violations, puis le coût proxy entre parenthèses (pts/donne).

| Règle | Actuel | M = 16 | M = 32 | M = 64 | Dure |
|---|---|---|---|---|---|
| **B1** défense entame atout | 8,4 % (135/1 604) | 5,5 % (0,81) | 2,6 % (2,42) | 0,8 % (4,25) | 0 % (6,99) |
| **B2** preneur V+9+3 atouts : le réflexe tire atout, le choix final non | **56,8 %** (63/111) | 45,0 % (0,25) | 24,3 % (1,07) | 9,9 % (2,07) | 0 % (3,66) |
| **B3** défense : le réflexe joue l'As, le choix final non | **54,7 %** (223/408) | 31,6 % (0,98) | 17,2 % (2,95) | 6,1 % (5,91) | 0 % (9,89) |
| **B4a** le réflexe joue la couleur appelée, le choix final une autre | **44,5 %** (49/110) | 15,5 % (0,14) | 4,5 % (0,53) | 1,8 % (0,75) | 0 % (0,97) |
| **B4b** le réflexe joue la couleur annoncée aux enchères, le choix final une autre | **63,2 %** (84/133) | 25,6 % (0,59) | 9,8 % (1,33) | 0,8 % (2,10) | 0 % (2,21) |
| Somme B1 à B4, coût proxy | 0 | 2,77 | 8,30 | 15,08 | 23,72 |

Autres chiffres de la série avant :
- Premières entames de défense avec un As hors atout (422) : le réflexe entame un As dans **69,9 %** des cas, le choix final dans **38,9 %**.
- Entames de défense : atout dans 8,8 % des cas pour le choix final (141/1 610), dans 0,4 % pour le réflexe.

### Résultat en jeu, série après

Combinaison : B1 = 32, B2 = 32, B3 = 16, B4 = 32.

| Convention | Avant | Après (parties jouées) | Prévu hors ligne |
|---|---|---|---|
| B1 défense entame atout | 8,4 % (135/1 604) | **3,0 %** (44/1 462) | 2,6 % |
| B2 preneur V+9+3 atouts ne tire pas atout | 56,8 % (63/111) | **26,0 %** (27/104) | 24,3 % |
| Première entame du preneur V+9+3 atouts = atout | 39,6 % (38/96) | **72,9 %** (70/96) | |
| B3 défense : l'As du réflexe n'est pas entamé | 54,7 % (223/408) | **27,0 %** (93/344) | 31,6 % |
| Première entame de défense avec un As hors atout : As entamé | 38,9 % | **58,2 %** (224/385) | |
| B4a couleur appelée abandonnée | 44,5 % (49/110) | **12,0 %** (6/50) | 4,5 % |
| B4b couleur annoncée abandonnée | 63,2 % (84/133) | **10,3 %** (12/117) | 9,8 % |

- Les prévisions hors ligne tombent à quelques points près, sauf B4a (n = 50 après, trop petit).
- Les deux séries ne portent pas sur les mêmes mains : ce sont des taux, pas des différences appariées.
- Pour tomber à 0 %, il faut la règle dure, au coût proxy du tableau précédent.

### Exemples (série avant)

Chaque exemple donne la valeur simulée par monde du réflexe, puis du choix du Monte-Carlo.

**B2 : le preneur avec V+9 ne tire pas atout.**
1. Partie g0, donne 9, 2e pli, 110♣, preneur siège 0. Main `D♣ 8♦ V♦ V♣ 8♥ 9♣ 7♣`.
   - Réflexe : V♣ (82,9). Monte-Carlo : 8♥ (91,4). Écart : 8,5.
   - **Corrigé** par M = 16 ou 32.
2. Partie g1, donne 3, 1er pli, 110♦, preneur siège 1. Main `D♣ A♣ 9♣ V♦ 9♥ 9♦ 10♣ 8♦` (atouts : V♦, 9♦, 8♦).
   - Réflexe : V♦ (54,8). Monte-Carlo : 9♥ (68,9). Écart : 14,1.
   - **Corrigé** par M = 16 ou 32.
3. Partie g1, donne 14, 3e pli, 120♦ **coinché**, preneur siège 3. Main `9♦ R♣ 10♣ 7♥ A♦ V♦`.
   - Réflexe : V♦ (−10,0). Monte-Carlo : R♣ (+171,0). Écart : 181.
   - **Seule la règle dure** le corrige. Hypothèse non vérifiée : un écart de cette taille correspond à un contrat coinché (×2) qui bascule dans une bonne part des mondes.

**B1 : le défenseur entame atout.**
1. Partie g0, donne 5, 1er pli, 140♠ (preneur siège 2), défenseur siège 3. Main `D♠ 7♣ 9♦ 7♦ V♦ 10♥ D♦ 8♠`.
   - Réflexe : 7♦, couleur annoncée par le partenaire (−0,5). Monte-Carlo : 8♠, atout (+9,0). Écart : 9,5.
   - **Corrigé** par M = 16.
2. Partie g0, donne 10, 4e pli, 80♦, défenseur siège 0. Main `8♣ 10♣ R♦ V♠ R♣`.
   - Réflexe : V♠ (−53,0). Monte-Carlo : R♦, atout (−40,4). Écart : 12,6.
   - **Corrigé** par M = 16.
3. Partie g1, donne 14, 4e pli, 120♦ coinché, défenseur siège 0. Main `10♥ 9♠ 9♥ D♦ 7♦`.
   - Réflexe : 10♥, maître (−147,7). Monte-Carlo : D♦ (−66,0). Écart : 82.
   - **Seule la règle dure** le corrige.

**B3 : le défenseur n'entame pas son As.**
1. Partie g0, donne 11, 3e pli, 130♥ (preneur siège 1), défenseur siège 0. Main `D♠ R♣ V♠ V♦ A♣ 7♣`.
   - Réflexe : A♣ (29,6). Monte-Carlo : D♠ (41,7). Écart : 12,1.
   - **Corrigé** par M = 16.
2. Partie g2, donne 5, 4e pli, 110♠ (preneur siège 0), défenseur siège 3. Main `7♣ 10♣ A♦ 7♥ 9♦`.
   - Réflexe : A♦ (38,5). Monte-Carlo : 7♥ (134,7). Écart : 96.
   - **Seule la règle dure** le corrige.

**B4 : la couleur appelée ou annoncée ne revient pas.**
1. Partie g29, donne 5, 3e pli, 90♠ (preneur siège 1), défenseur siège 2. Le partenaire a appelé ♥ en tenant l'As (vrai appel). Main `V♣ 8♠ 10♠ V♥ D♠ 9♣`.
   - Réflexe : V♥ (−27,9). Monte-Carlo : 8♠, atout (+45,3). Écart : 73. Le coup viole aussi B1.
   - **Seule la règle dure** le corrige.
2. Partie g2, donne 10, 4e pli, 110♦ (preneur siège 3), défenseur siège 2. Le partenaire a « appelé » ♠ **sans** l'As (faux appel). Main `V♥ 9♥ 8♠ V♠ D♣`.
   - Réflexe : 8♠ (−96,9). Monte-Carlo : V♥ (−80,0). Écart : 16,9.
   - **Corrigé** par M = 32. Tant que les appels sont faux, revenir dans la couleur appelée est une mauvaise convention : B4 ne vaut qu'avec la partie C.
3. Partie g51, donne 4, 4e pli, 90♣ (preneur siège 3), défenseur siège 2. Couleur annoncée par le partenaire : ♦. Main `D♠ 8♣ 9♣ 7♠ 7♦`.
   - Réflexe : 7♦ (−15,0). Monte-Carlo : 7♠ (+58,3). Écart : 73.
   - **Seule la règle dure** le corrige.

## Partie C : signaux

### Diffs (base : `engine.js`)

**C1. Lecture** (`readDiscardSignal`, l. 1178-1188). Une nouvelle fonction pure, `sigReading(carte, legalBefore)`, lit la défausse :
- rien si la carte est un atout, ou à partir du pli 4 (`G.plisJoues >= 3`) ;
- rien si la défausse n'est pas volontaire, c'est-à-dire si les cartes légales avant de jouer couvrent moins de 2 couleurs hors atout ;
- un appel si la carte est un 7 ou un 8 et que l'As de la couleur n'est pas tombé ;
- un refus si la carte est un Roi ou une Dame ;
- rien dans les autres cas (9, 10, Valet, As).

`readDiscardSignal` retient le dernier signal valable :
- un nouvel appel efface l'appel précédent et le refus de la même couleur ;
- un nouveau refus remplace le précédent et efface l'appel de la même couleur.

Dans les mondes, `simPlay` (l. 1785-1795) calcule les cartes légales avant de retirer la carte jouée, pour savoir si la défausse est volontaire.

**C2. Émission** (`appelCard` l. 1163-1174, `discard` l. 1431-1458).
- `appelCard` n'émet un appel qu'avec un 7 ou un 8, avant le pli 4, sur une défausse volontaire.
- `discard` : si la carte la moins chère serait lue comme un faux signal (appel sans l'As, refus avec l'As ou le 10), il prend la moins chère des cartes neutres, à condition que l'écart de coût ne dépasse pas `V.discardNeutral`. Ce seuil vaut 10 : il couvre l'écart d'un 9 sur un 7, pas celui d'un Valet, qui coûte 20.

```js
const pick = firstMin(side, cost);
if (V.sigNew && V.discardNeutral > 0 && sigFalse(ctx.seat, pick, ctx.legal)) {
  const neutral = side.filter((c) => c !== pick && sigReading(c, ctx.legal) === null);
  if (neutral.length) { const alt = firstMin(neutral, cost); if (cost(alt) - cost(pick) <= V.discardNeutral) return alt; }
}
return pick;
```

**C3. Tri canonique (SUI-3).** `canonSort` trie la main en place (♥ ♦ ♣ ♠, rangs croissants), dans `playContext` et au début de `botChooseCard`.

**C4. Monte-Carlo** (`mcChooseCard`, défausses quand on ne fournit pas) :
- une carte dont le signal lu serait faux est pénalisée de `V.mcSigPenalty` pts/monde, tant qu'il reste un choix honnête (`Infinity` l'exclut) ;
- un vrai appel du réflexe est gardé tant que le Monte-Carlo ne lui préfère pas une autre carte de plus de `V.mcKeepAppel` pts/monde.

**C5.** `SIGNAL_MISFIT` devient `V.misfit` dans `seatWeight` (l. 1678-1690).

### Mesures (série avant : 52 parties ; série après : 48 parties ; 96 mondes)

Combinaison testée :
- lecture C1 (plis 1 à 3) ;
- `discardNeutral` = 10 ;
- tri ;
- `mcSigPenalty` = 5, `mcKeepAppel` = 16 ;
- marges B.

Les mesures de signaux ne dépendent pas des marges B.

| Mesure | Avant | Après |
|---|---|---|
| Défausses hors atout observées | 6 210 | 5 721 |
| Appels lus (par partie) | 1 056 (20,3) | 167 (3,5) |
| …dont faux (pas d'As en main) | **85,0 %** (898) | **22,8 %** (38) |
| Faux appels lus par partie | 17,3 | 0,8 |
| Vrais appels lus par partie | 3,04 (158) | 2,69 (129) |
| Appels lus sur une couleur dont l'As est tombé | 47,3 % (499) | 0 % |
| Refus lus | 837 | 93 |
| …dont faux (As ou 10 en main) | 21,5 % (180) | **11,8 %** (11) |
| Défausses où le réflexe émet un faux signal (selon la nouvelle lecture) | 4,0 % (170/4 234) | 2,5 % (96/3 826) |
| …où le choix final émet un faux signal | 4,9 % (207/4 234) | **1,3 %** (49/3 826) |
| Vrais appels du réflexe (nouvelle lecture) gardés par le Monte-Carlo | **35,7 %** (60/168) | **85,9 %** (128/149) |
| Vrais appels selon l'ancienne lecture (7/8/9 avec l'As, au moins 2 cartes) gardés | 48,7 % (232/476) | 73,4 % (218/297) |
| Refus Roi/Dame émis avec l'As de la couleur : réflexe / choix final | 96 / 153 | 73 / 83 |
| Réflexe qui change selon l'ordre des cartes en main (4 000 positions, 6 permutations) | **6,0 %** (238) | **0,0 %** |

**Volume de lecture.** Seules 35,8 % des défausses hors atout sont volontaires, et 11,7 % l'étaient avant le pli 4 (série avant). La nouvelle lecture divise donc le volume d'appels par 6, tout en gardant presque autant de vrais appels (2,7 contre 3,0 par partie).

**Faux appels restants (22,8 %).** Dans ces défausses, toutes les autres cartes coûtent plus de 10 de plus, ou il n'y en a pas (main faite seulement de 7 et de 8). Un `discardNeutral` plus grand (24 admettrait le Valet) n'a pas été mesuré.

**Tri (SUI-3).** 4 000 positions réelles tirées des 16 362 captures de la vague 1, avec 6 permutations de la main chacune. Le réflexe change dans 238 positions (67 entames sur 1 344, 171 suites sur 2 656), et dans aucune avec le tri. Exemples :
- main `8♦ R♠ 10♦ 9♦ 7♠ D♠` à l'entame, atout ♣ : 8♦ ou 7♠ selon l'ordre ;
- main `9♣ R♣ 8♣ D♣`, atout ♦, pli `9♦ A♦ D♦` : 9♣ ou 8♣ ;
- main `10♦ 7♥ A♦ D♥ A♠ R♠`, atout ♥ : A♠ ou A♦.

**Pénalité C4 seule**, rejouée hors ligne sur les totaux de la série avant (4 234 décisions) :

| Pénalité | Faux signaux émis | Décisions changées | Coût proxy (pt/donne) | Vrais appels conservés |
|---|---|---|---|---|
| 0 (actuel) | 4,9 % | 0 | 0,00 | 35,7 % |
| 2 pts/monde | 2,1 % | 116 | 0,00 | 38,7 % |
| 5 pts/monde | 1,4 % | 146 | 0,12 | 41,7 % |
| exclusion | 0 % | 207 | 0,98 | 47,0 % |

- La pénalité seule protège mal les vrais appels : 36 % conservés au départ, 47 % au mieux.
- C'est la marge `mcKeepAppel` = 16 qui les porte à 86 % (série après).
- Ce même calcul n'est pas exploitable sur la série après, où la pénalité est déjà appliquée en jeu.

### Exemples (série avant)

**Faux appel émis par le réflexe.**
1. Partie g0, donne 2, 3e pli, 110♣ (preneur siège 3), défenseur siège 2. Main `7♦ D♦ R♥ D♥ A♥ 9♦`, pli `3:9♣ 0:R♣ 1:8♥`. Le partenaire (siège 0) tient le pli et la défausse est libre.
   - Le réflexe défausse le **7♦**, lu comme « j'ai l'As de carreau ». Il n'en a pas, et il tient A♥ R♥ D♥.
   - Le Monte-Carlo, à égalité de valeur (−99,9 des deux côtés), joue la D♥ : un refus de cœur alors qu'il tient l'As et le Roi de cœur. Les deux signaux sont faux.
   - **Après :** 7♦ et 9♦ coûtent tous deux 6. `discard` prend le 9♦, neutre, et la pénalité écarte la D♥. Aucun signal n'est émis.
2. Partie g0, donne 8, 2e pli, 110♥ (preneur siège 0), défenseur siège 1. Main `9♥ 10♠ R♠ 8♣ 9♠ 8♥ 7♣`, pli `3:A♦ 0:7♦` (son partenaire tient le pli).
   - Le réflexe défausse le **7♣ ou le 8♣** : un appel à trèfle sans l'As.
   - **Après :** il défausse le 9♠ (coût 6 contre 4, écart de 2 ≤ 10).

**Vrai appel écarté par le Monte-Carlo.** Partie g2, donne 3, 3e pli, 80♠ (preneur siège 1), siège 3, partenaire du preneur. Main `10♦ A♣ 7♣ 9♣ R♦ 8♦`, pli `2:8♠`.
- Le réflexe défausse le **7♣**, un vrai appel : il tient l'As et le 9 de trèfle.
- Le Monte-Carlo préfère le 8♦ (+22,8 contre +15,3, écart de 7,5).
- **Après :** le 7♣ est gardé grâce à la marge de 16.

### C5. Recalibrage de `SIGNAL_MISFIT`

Sur la série après, 167 appels sont lus, dont 38 faux (22,8 %). Pour chacun, on calcule la probabilité a priori `p0` que le siège tienne l'As dans les mondes de son partenaire, **sans** pénalité de signal (moyenne : 0,367). Une pénalité `m` donne la probabilité `p0 / (p0 + (1 − p0)·m)`, que l'on compare au fait (As en main ou non).

| Pénalité `m` | Log-perte | Brier |
|---|---|---|
| 0,3 (actuelle) | 0,489 | 0,164 |
| **0,10** | **0,405** | **0,129** |
| 1 (aucune pénalité) | 0,833 | – |

- La calibration moyenne (prédit = observé) tombe à **m = 0,10**.
- Avec la nouvelle lecture, un appel est vrai dans 77 % des cas : il faut le croire davantage que ne le fait 0,3.
- Valeur recommandée : **0,1**, à confirmer sur un plus grand échantillon (n = 167 ; ordre de grandeur 0,07 à 0,15, sans intervalle calculé).
- Avec l'ancienne lecture (85 % de faux appels), le signal ne valait presque rien. Elle n'a pas été calibrée, faute de `p0` dans la série avant. **Ne pas changer 0,3 sans la nouvelle lecture.**

## Force : duels `tests/coinche-ab.js`

Réglages :
- 32 mondes, horloge figée ;
- 176 parties par duel : 88 donnes jumelles de départ, équipes échangées, environ 1 000 paires de donnes ;
- `nice -n 10`, machine à charge 17-19.

A est le moteur actuel (`engine.base.js`), B le prototype.

| B | B − A (pts/donne) | Erreur-type | Parties gagnées par B |
|---|---|---|---|
| **Combinaison complète** : signaux (C1, C2, C4) + tri + `misfit` 0,1 + marges B (32/32/16/32) | **+0,21 ± 4,60** (2σ, 1 035 paires) | 2,3 | 47,7 % ± 7,5 |
| **Signaux + tri + `misfit` 0,1**, sans marges B | **−0,60 ± 4,59** (2σ, 1 002 paires) | 2,3 | 46,0 % ± 7,5 |

Pour la combinaison complète : A prend 1 083 contrats (montant moyen 108, 73 % réussis), B en prend 1 106 (moyenne 108, 72 %).

**Effet de bord : la coinche.** Dans les deux duels, B coinche moins les contrats de A (118 et 116 fois) que A ne coinche ceux de B (145 et 143). Le changement de `misfit` agit sur tous les mondes, donc aussi sur la décision de coincher. Aucun effet mesurable sur les points, mais ce changement est à valider seul avant fusion.

**Précision.** Aucun des deux duels ne montre de coût. Avec une erreur-type de 2,3 pts/donne, un effet inférieur à environ 4,6 (2σ) reste invisible. Pour descendre à ±1 (2σ), il faudrait environ 20 fois plus de paires, soit plus de 3 000 parties à 32 mondes. Le coût proxy de la combinaison complète est de 6,3 pts/donne (2,42 + 1,07 + 0,98 + 0,53 + 1,33). Le point estimé du duel (+0,2) ne le confirme pas, mais ne l'exclut pas non plus à ±4,6.

## Recommandations chiffrées

1. **Tri canonique (C3) : à faire.**
   - Décisions du réflexe qui dépendent de l'ordre des cartes : 6,0 % → 0 %.
   - Coût attendu : nul, car le tri ne départage que des cartes équivalentes pour le réflexe.
2. **Lecture et émission des signaux (C1 + C2), avec les garde-fous Monte-Carlo (C4) : à faire.**
   - Faux appels lus : 85 → 23 % (17,3 → 0,8 par partie).
   - Appels sur une couleur dont l'As est tombé : 47 → 0 %.
   - Vrais appels gardés par le Monte-Carlo : 36 → 86 %.
   - Vrais appels lus par partie : 3,0 → 2,7.
   - Coût en duel (avec tri et `misfit`) : −0,60 ± 4,59 pts/donne (2σ), non détecté. Coût proxy hors ligne de la pénalité de 5 : 0,12 pt/donne.
3. **Marges B : à faire, à 32 pour B1, B2 et B4, et à 16 pour B3.**
   - Violations : B4b 63 → 10 %, B4a 45 → 12 %, B2 57 → 26 % (première entame d'atout du preneur 40 → 73 %), B3 55 → 27 %, B1 8 → 3 %.
   - Coût en duel (combinaison complète) : +0,21 ± 4,60 pts/donne (2σ), non détecté. Le proxy de 6,3 pts/donne est une borne haute que le duel ne confirme pas.
   - B4 est la plus rentable : 1,9 pt/donne de proxy à M = 32, pour plus de 50 points de violations en moins. C'est aussi la seule dont la règle dure coûte moins de 3,2 pts de proxy. La passer en règle dure une fois la partie C en place.
4. **Règles dures (M = ∞) : pas encore.**
   - B1 : 7,0 pts/donne de proxy.
   - B2 : 3,7 pts/donne de proxy.
   - B3 : 9,9 pts/donne de proxy. Entamer l'As relève plus de la force du jeu que d'une convention lisible : rester à 16.
   - Ces coûts ne se tranchent qu'avec un duel d'environ 3 000 parties, ou en acceptant une incertitude de ±5 pts/donne.
5. **`SIGNAL_MISFIT` à 0,1 : seulement avec la nouvelle lecture.** Calibré sur 167 appels. À valider seul, à cause du recul de 19 % des coinches.
6. **Partie A : à abandonner.** La défense imaginée n'explique pas l'écart d'ENT-3. Piste suivante : comprendre pourquoi, avec 3 atouts, le Monte-Carlo préfère garder Valet-9 (27 % de tirage d'atout, contre 63 % avec 4 atouts). Hypothèse non testée : une question de tempo, ou l'évaluation de la fin de donne.

## Limites

- **Échantillons.** B2 repose sur 111 entames avant et 104 après, B4a sur 110 et 50. Sur ces lignes, des écarts de quelques points restent dans le bruit.
- **Coût proxy.** C'est la valeur que le Monte-Carlo croit gagner en quittant le réflexe, pas le coût réel. Seul le duel mesure le coût réel, et sa précision (±4,6 en 2σ) ne permet pas de voir un coût inférieur à 2-3 pts/donne.
- **Séries non appariées.** Les séries avant et après partent des mêmes donnes, mais les parties divergent ensuite.
- **Partie A.** La défense imaginée testée est simpliste (elle entame atout selon p, ou quand le preneur a une coupe) ; ce n'est pas un vrai modèle de défenseur. L'infirmation vaut pour cette famille de corrections.
- **Exception B1.** Le cas du défenseur qui tient le Valet d'atout n'a pas été évalué.
- **Hors périmètre.** Les signaux d'un humain ne suivent pas forcément la convention des bots, et la lecture des humains (C5 de l'audit) n'est pas modifiée.
- **Réglages non testés en jeu.** Un `discardNeutral` au-dessus de 10, une fenêtre de lecture autre que les plis 1 à 3, une pénalité C4 autre que 5. Seule la pénalité a été balayée, et seulement hors ligne.

## Annexe : diff

Le diff complet du prototype par rapport à `src/coinche/engine.js` (354 lignes) est dans [`v2-conventions-prototype.diff`](v2-conventions-prototype.diff). Les drapeaux `V` y sont tous à leur valeur d'origine.

Les fichiers testés en duel (`engine.best.js`, `engine.csig.js`) ne diffèrent que par la ligne `export const V = ...` :
- combinaison complète : `{"sigNew":true,"discardNeutral":10,"sortHand":true,"mcSigPenalty":5,"mcKeepAppel":16,"misfit":0.1,"mcTrumpDef":32,"mcTakerDraw":32,"mcDefAce":16,"mcCalled":32}` ;
- signaux et tri seuls : la même ligne, sans les quatre drapeaux `mcTrumpDef`, `mcTakerDraw`, `mcDefAce` et `mcCalled`.
