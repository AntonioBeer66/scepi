# Vague 1 — Évaluation et choix de la carte (Monte-Carlo)

Rapport détaillé du sous-agent « choix Monte-Carlo » (Opus), moteur au commit `b548853`. Zone : `simPlay`, `playOut`, `donneValue`, `exactEnd`, `mcValue`, `mcChooseCard`, `botChooseCard`, `declareBeloteIfNeeded` (`engine.js` l. 1785-2160), `tuning`, `MC_BUDGET_MS`.

**Méthode.**

- Copie instrumentée du moteur : trace du nombre de mondes `n`, des totaux et des valeurs monde par monde.
- 774 positions réelles avec au moins 2 cartes légales, tirées de 3 parties entre bots (graines 11 à 13).
- Chaque position est rejouée avec 8 graines `Math.random`, ou avec une horloge ralentie.

Synthèse : [`../2026-10-bots-coinche.md`](../2026-10-bots-coinche.md).

## MCD-1 — Même situation, carte différente d'une fois à l'autre (bruit Monte-Carlo)

- Lignes : 2062-2089 (`mcChooseCard`), 1486-1489 (`mcSamples: 96`).
- Catégorie : les deux. Gravité : haute.
- Mesures (387 positions × 8 graines) :
  - la carte jouée change selon la graine dans **35,9 %** des décisions (**37,8 %** sur un second échantillon de 193) ;
  - aux plis 1 à 3, **65,9 %** ; aux plis 6 et 7, 9 % puis 2 % ;
  - 1,51 carte distincte en moyenne ; la carte la plus fréquente sort 88 % du temps.
- Le bruit dépasse l'écart entre les deux meilleures cartes. En début de donne :
  - l'écart-type, d'une graine à l'autre, de la différence entre ces deux cartes vaut 4,1 pts par monde (médiane) ;
  - l'écart moyen entre elles n'est que de 1,9 pt ;
  - le bruit l'emporte dans **68 % des décisions des plis 1 à 3** (56 sur 82).
- Scénarios observés :
  - Entame en défense avec 10♠ 10♣ V♦ 10♥ D♥ D♣ 8♣ R♦ (atout ♦) : 8 graines donnent **6 entames différentes** (D♣, D♥, V♦, 10♠, 10♥, 10♣). L'une d'elles entame le Valet d'atout.
  - Preneur en second sur un 7♠, avec A♠ R♠ V♠ : As 2 fois, Roi 3 fois, Valet 3 fois.
  - Défense avec A♠ et 7♥ : A♠ 3 fois, 7♥ 3 fois, 9♣ 2 fois.
- Problème : un partenaire humain ne peut rien déduire d'une entame, ni du choix de prendre ou de laisser passer, quand ils se jouent à pile ou face entre deux ou trois cartes.
- Piste : ne quitter le réflexe que si le gain est **significatif** sur les mêmes mondes (test apparié : gain moyen > z × erreur-type + 0,5). Mesuré :

| Règle | Décisions instables | Instables plis 1-3 | Écarts au réflexe |
|---|---|---|---|
| Actuelle | 37,8 % | 65,9 % | 32,1 % |
| z = 1 | 28,5 % | 51,2 % | 11,9 % |
| z = 2 | 16,6 % | 28 % | 6,7 % |

  L'effet sur la force reste à mesurer en duel (`tests/coinche-ab.js`). Compléments possibles : une graine dérivée de la position (main + historique public), pour qu'un même coup se rejoue à l'identique, et plus de mondes aux plis 1 à 3.
- Preuve : vérifié par exécution.

## MCD-2 — Force et choix des bots qui dépendent de l'appareil hôte

- Lignes :
  - engine.js 1490 (`now: () => Date.now()`), 1492 (`MC_BUDGET_MS`), 2067-2075 ;
  - `src/coinche/client/host-worker.js` : les bots tournent dans un Web Worker, chez le joueur qui héberge la table ;
  - `tests/coinche-sim.js` fige l'horloge (`tuning.now = () => 0`).
- Catégorie : non-prédictible. Gravité : **moyenne**, haute sur appareil d'entrée de gamme.
- Temps de décision mesurés sur ce conteneur, à 96 mondes : 41 ms en médiane, 120 ms au 90e centile, 561 ms au pire (pic ponctuel, probablement le ramasse-miettes).
- Mesures sur 194 positions, mêmes mondes, horloge réelle multipliée par k :

| Appareil (par rapport au conteneur) | Décisions coupées avant 96 mondes | Carte différente de celle à 96 mondes | Dont plis 1-3 | Mondes évalués |
|---|---|---|---|---|
| 4× plus lent | 15 % | 4,1 % | 9,9 % | minimum 16 |
| 10× plus lent | 41 % | 9,3 % | 21 % | minimum 6 |
| 30× plus lent | 71 % | 15,5 % | 33 % | médiane 41, minimum **1** |

- Problème :
  - Le même bot joue autrement selon le téléphone de l'hôte, et même selon sa charge du moment (ramasse-miettes, mode économie).
  - Un choix fait sur 1 à 6 mondes est un coup « clairvoyant » pour une seule répartition imaginée.
  - Les gains annoncés dans les commentaires (+2,6 pts…) ont tous été mesurés avec 96 mondes garantis : le cas lent n'est jamais testé.
- D'après le code, les enchères ont la même dépendance : `BID_DECISION_MS`, `BID_BUDGET_MS`, `makeProbability` qui renvoie `null`. Le temps de `mcWorlds` n'est pas compté dans le budget.
- Piste :
  - un budget exprimé en nombre de mondes plutôt qu'en millisecondes, avec si besoin un étalonnage unique au démarrage ;
  - un plancher d'au moins 32 mondes avant de consulter l'horloge ;
  - un scénario « horloge lente » dans les duels.
- Preuve : vérifié par exécution.

## MCD-3 — Le réflexe abandonné pour quelques points de carte

En cause : l'égalité stricte et le départage par les points de plis.

- Lignes : 2076-2079 (`t > totals[best] + 1e-9`), 1864-1873 (`donneValue`, terme `* 0.01`).
- Catégorie : les deux. Gravité : **moyenne**.
- Mécanisme :
  - La valeur de la donne monte par marches d'escalier : contrat fait ou chuté.
  - Les points de plis départagent les cartes, pondérés par 0,01.
  - Le réflexe ne garde donc la main qu'en cas d'égalité exacte des points de plis dans tous les mondes, ce qui n'arrive presque jamais.
- Mesures : 29 des 125 écarts au réflexe (**23 %**) se jouent à moins de 0,1 pt par monde. L'issue du contrat est alors la même partout, et le bot change de carte pour 1 à 10 points de plis en moyenne.
- Exemples :
  - couper du 9♠ plutôt que du 7♠ (−80,61 contre −80,63) ;
  - D♥ plutôt que V♥ (0,01 d'écart) ;
  - 9♣ plutôt que 10♣ pour monter sur l'atout du partenaire (0,02) ;
  - entamer le V♠ au lieu du 8♥ (6 graines sur 8, 0,01) ;
  - une graine coupe au 7♥ le 8♠ maître du partenaire, alors que toutes les cartes se valent à 0,01 près.
- Problème : dans ce barème, les points au-delà du contrat ne rapportent rien à la partie. Le bot sacrifie pourtant la lisibilité du réflexe (conventions, petite carte, ne pas couper le partenaire maître) pour un gain sans effet sur le score.
- Piste :
  - une marge de 0,5 pt par monde, soit moins qu'un seul monde basculé sur 96 (environ 2,5 pts). Mesuré : les écarts au réflexe passent de 32,1 % à 23,3 %, l'instabilité reste à 36 % ;
  - autre option : départager d'abord sur l'issue du contrat, puis exiger au moins X points de carte.
  La marge de 5 pts, mesurée à −1,5 pt par donne d'après le commentaire, est dix fois plus forte que celle-ci.
- Preuve : vérifié par exécution.

## MCD-4 — Le modèle suppose un partenaire bot, qui voit tout en fin de donne

- Lignes : 1849-1855 (`heuristicCard(next)` pour les 4 sièges, humains compris), 1919-2029 (`exactEnd` : minimax à information complète pour les deux camps).
- Catégorie : non-prédictible. Gravité : **moyenne**.
- Scénario : avec un partenaire humain, le bot retient une carte dont la valeur suppose que ce partenaire réagit comme le réflexe bot (7/8/9 lu comme un appel, retour dans la couleur appelée). Sur les 3 derniers plis, il suppose aussi que le partenaire connaît sa main et devine toujours juste : c'est le biais classique du Monte-Carlo à information parfaite. `mcWorlds` distingue humains et bots (`MISFIT`), mais pas `playOut`.
- Problème : le coup est optimal contre un partenaire télépathe qui applique les conventions du bot. Il n'est pas forcément lisible pour un humain.
- Constat : les écarts au réflexe restent de 18 % au 6e pli et de 9 % au 7e. Les fins de donne examinées étaient plausibles : aucun coup franchement absurde dû à `exactEnd` n'a été isolé.
- Piste : pour un siège humain, jouer la suite avec du bruit ou un modèle plus simple, et réserver l'information complète aux adversaires bots.
- Preuve : lecture du code (risque structurel, non démontré par un exemple).

## Ce qui fonctionne bien

- Toutes les cartes sont évaluées sur les mêmes mondes.
- La marge de 8 pts sur l'entame atout ou non (`TRUMP_LEAD_MARGIN`) suit le nombre de mondes réellement vus.
- `exactEnd` stabilise la fin de donne : 2 à 9 % d'instabilité aux plis 6 et 7.
- `donneValue` colle au vrai barème (`computeScore`), et `worldBelote` est cohérent avec `contratReussi`.
- `declareBeloteIfNeeded` se comporte comme un humain : « belote » à la première carte du Roi ou de la Dame d'atout, « rebelote » à la seconde, automatiquement et de la même façon pour humains et bots. `mcWorlds` replace bien la carte restante chez son détenteur.
