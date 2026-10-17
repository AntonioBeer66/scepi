# Vague 1 — Audit empirique par simulations

Rapport détaillé du sous-agent « empirique » (Sonnet), moteur au commit `b548853`. Le sous-agent a fait jouer des parties entre bots et mesuré des symptômes visibles, sans relire tout le code. Synthèse : [`../2026-10-bots-coinche.md`](../2026-10-bots-coinche.md).

## Réglages et échantillons

- **Parties.** 42 parties complètes jusqu'à 1010 points, soit 544 donnes (531 jouées, 13 passées par les quatre joueurs).
  - La machine était très chargée (charge moyenne ~15 sur 4 cœurs) : **`mcSamples`, `bidWorlds` et `bidSamples` ont été réduits à 32**, contre 96 par défaut.
  - Horloge figée : `tuning.now = () => 0`.
  - Les statistiques d'enchères et de coups suspects viennent de ces parties à 32 mondes. À 96 mondes, les proportions peuvent différer : ce n'est pas mesuré.
- **Rejeu.** 200 décisions capturées dans ces parties (60 enchères, 40 entames, 56 suites, 34 coinches, 10 surcoinches). Chaque décision est rejouée avec 5 graines, depuis la vue réelle du bot, avec quatre réglages :
  - 32 mondes, horloge figée ;
  - 96 mondes, horloge figée ;
  - 96 mondes, horloge « lente » à 3 ms par monde ;
  - 96 mondes, horloge « lente » à 10 ms par monde.

  L'horloge « lente » avance de 3 ou 10 ms à chaque appel de `tuning.now`. C'est un modèle grossier : aucun vrai téléphone n'a été mesuré.
- **Réflexe contre Monte-Carlo.** 390 décisions de carte rejouées à 96 mondes.

## Reproductibilité

96 mondes, horloge figée, 5 graines. Une décision est « instable » si les 5 graines ne donnent pas toutes la même réponse.

| Type | Instables | Réponses distinctes (moyenne) |
|---|---|---|
| Total | 18 % (35/200) | – |
| Entame | 43 % (17/40) | 1,73 |
| Suite | 18 % (10/56) | 1,18 |
| Enchère | 13 % (8/60) | – |
| Coinche | 0 % (0/34) | – |
| Surcoinche | 0 % (0/10) | – |

- Les 8 enchères instables basculent toutes entre une passe et une annonce.
- À 32 mondes, 25 % des décisions sont instables, dont 32 % des enchères et 50 % des entames.
- Sur les 27 cartes instables à 96 mondes, 20 changent de **couleur**, pas seulement de rang.

## Horloge lente

Comparaison à la référence 96 mondes, horloge figée, même graine.

| | dt = 3 ms | dt = 10 ms |
|---|---|---|
| Enchères modifiées | 7 % (20/300) | 13 % (40/300) |
| Entames modifiées | 4 % | 22 % |
| Suites modifiées | 0 % | 6 % |
| Coinches modifiées | 0 % | 1 % (2/170) |
| Réponse majoritaire différente, enchères | 5 % | 12 % |
| Réponse majoritaire différente, entames | 8 % | 18 % |
| Décisions instables, total | 20 % | 28 % |

## Enchères (531 contrats, 32 mondes)

| Contrat | Part | Réussite |
|---|---|---|
| 80 | 17 % | 79 % |
| 90 | 10 % | 75 % |
| 100 | 18 % | 73 % |
| 110 | 19 % | 81 % |
| 120 | 13 % | 70 % |
| 130 | 11,5 % | 69 % |
| 140 | 8,5 % | 62 % |
| 150 | 1,3 % (7 contrats) | 3/7 |
| 160 | 1 contrat | 1/1 |

- Contrats chutés : 26,6 %.
- Coinche : 13,2 % des contrats (70). Le preneur réussit 55,7 % de ses contrats coinchés (39/70).
- Surcoinche : 9 sur 70 coinches, dont 5 contrats réussis.
- Capot : 5 annoncés (0,9 %), 3 réussis. Générale et huit atouts : aucun cas.
- Rythme des enchères :
  - 2,64 annonces chiffrées par donne jouée ;
  - 44 % des donnes ont au moins 3 annonces ;
  - 6,9 décisions d'enchère par donne.
- Donnes passées par les quatre joueurs : 2,4 %.
- Preneur sans le Valet d'atout : 40,5 % des contrats.
- Preneur sans Valet ni 9 : 17,9 % des contrats, réussis à 72,6 % (69/95). Ces contrats ne sont donc pas plus faibles que les autres.

## EMP-1 — Même état, décision différente à chaque tirage

- Catégorie : non prédictible. Gravité : **haute**.
- Chiffres : voir « Reproductibilité ».
- Exemples :
  - Enchère : main `AH KS 8H 7D QH KH JC 9C`, annonces 3:80C puis 0:90S, siège 3. Réponses sur 5 graines : P, P, 100H, 100H, 100H.
  - Enchère : main `7C 10H KH 9D 9H QH 7H AD` face à 130S. Quatre graines passent, une annonce 140H sans le Valet.
  - Entame : main `KD 8H AS KH KC 10H 9C 7D`, atout D à 80. Les graines donnent 8H, 8H, KD, KH, KH.
- Cause probable :
  - `mcChooseCard` (engine.js l. 2062-2092) retient la meilleure carte sur des mondes tirés avec `Math.random`, sans graine dérivée de l'état.
  - Les seuils de `decideBid` et de `makeProbability` (l. 2095) sont des falaises, alors que l'erreur-type d'une proportion sur 96 mondes est d'environ 5 points.
- Les coinches sont stables (0 sur 44).

## EMP-2 — Le résultat dépend de la vitesse de l'appareil

- Catégorie : non prédictible. Gravité : **moyenne à haute**.
- Chiffres : voir « Horloge lente ». À dt = 10 ms, 12 % des enchères et 18 % des entames donnent une réponse majoritaire différente de la référence.
- Pas de biais net dans un sens : à dt = 10 ms, 24 paires « le lent passe, le rapide annonce » contre 15 dans l'autre sens.
- Exemples :
  - Enchère : main `KD QD 9S JS AC QS 8H 7H` face à 130D. À dt = 10 ms, une graine annonce 140S ; à horloge figée, les 5 passent.
  - Coinche : main `QC 7H 8C JS JC JH 10S 7D`, siège 1. Le bot coinche une fois sur 5 à dt = 10 ms, jamais sinon.
- Cause probable :
  - Budgets : `MC_BUDGET_MS` 250, `BID_BUDGET_MS` 150, `BID_DECISION_MS` 400 (l. 558, 1492, 2093).
  - Au-delà de l'échéance, `makeProbability` renvoie `null` et `decideBid` bascule sur le barème, avec moins de mondes.

## EMP-3 — Le preneur ne tire pas atout avec V+9 (le Monte-Carlo écrase le réflexe)

- Catégorie : les deux. Gravité : **haute**.
- À sa première entame de la donne, avec V+9 et au moins 3 atouts, le preneur n'entame atout que dans **33 %** des cas (24/72). Avec le Valet sans le 9, c'est 67 % (63/94) : la relation est inversée.
- Sur toutes ses entames avec V+9 et au moins 3 atouts (n = 70) :
  - le **réflexe** entame atout 68 fois, le **choix final** 33 fois (47 %) ;
  - le Monte-Carlo s'écarte du réflexe dans 54 % des cas.
- Exemples :
  - `10S 10H AC JC 10D AS 9S 9C`, atout C à 110 (Valet, 9 et As d'atout) : il entame le **10D**, un 10 sec que l'As adverse prend.
  - `JD 7S 8H 10D KD 7C KH QD`, atout D à 150 (Valet, 10, Roi et Dame d'atout) : il entame le 7C au pli 1.
- Au pli 1, le preneur qui tient le Valet n'entame pas atout dans 53 % des cas (51/96).
- Cause probable :
  - Dans `mcChooseCard`, le réflexe (`heuristicCard` l. 1458, `leadCard`) ne l'emporte qu'en cas d'égalité (`+1e-9`).
  - `TRUMP_LEAD_MARGIN = 8` (l. 2058, 2080-2086) ne protège que le choix entre entamer atout ou non.
  - La simulation joue les mondes avec les réflexes, mais ses estimations, bruitées, ont le dernier mot.

## EMP-4 — Entame de défense : pas l'As, parfois atout ou un 10 nu

- Catégorie : non humain. Gravité : **moyenne**.
- Première entame d'un défenseur qui a un As hors atout :
  - 54 % des entames hors atout se font dans une couleur sans As (156/287), dont 65 % de singletons ou doubletons ;
  - 15 % sont des entames d'atout (51/338) ;
  - sur 90 de ces entames, le réflexe entame un As 74 fois, le choix final 30 fois (33 %) ;
  - le réflexe n'entame jamais atout, le choix final 14 fois.
- Entame d'atout par un défenseur : 10,5 % de ses entames (142/1356). Dans 87 % des cas, il n'a ni le Valet ni le 9 (soit 9 % de toutes les entames de défense). Rien ne prouve que ces entames sont fausses.
- Entame d'un 10 sans l'As, alors que l'As n'est ni en main ni tombé : 3,6 % des entames hors atout (109/2994).
- Exemples :
  - Partie g202, donne 2 : main `10D 9H QD 10H AC AS 10C` en défense face à 130C. Il entame le 10D avec l'AS en main.
  - Partie g200, donne 3 : atout H à 90, main `AD QS 8C 8H 7D 10S KD 7H`. Il entame le 8C singleton alors qu'il a l'AD.
- Même cause qu'EMP-3.

## EMP-5 — Enchères de compétition illisibles (110-140 sans Valet)

- Catégorie : non prédictible. Gravité : **moyenne**.
- Ouvertures de 110 à 130 : aucune sans le Valet (n = 67). Le système est respecté.
- Surenchères sur l'adversaire (n = 446) :
  - 51 % sans le Valet (41,5 % sans Valet ni belote) ;
  - 27 % sans Valet ni 9 ;
  - 62 % avec 3 atouts ou moins.
- Soutiens ou relances du partenaire (n = 69) : 54 % sans le Valet.
- Exemples :
  - `8C AC AH QC 10H KC AS QH` annonce 120C sur 110S, avec quatre trèfles A, K, Q, 8, sans Valet ni 9.
  - `10H 8C JC QS AC 8D QH QC` annonce 140S sur 130D.
- Ces annonces ne perdent pas plus souvent : les contrats sans Valet ni 9 réussissent à 72,6 %. Le problème est que le partenaire ne peut plus les lire.
- Cause probable : l'étape de compétition de `decideBid` (surenchère validée par simulation) contourne le barème de l'en-tête.

## EMP-6 — Passes avec V+9+A dans une couleur

- Catégorie : non humain. Gravité : **basse à moyenne**.
- 36 passes sur 2329 avec une telle main :
  - aucune avant toute annonce ;
  - 22 face à un contrat de 110 ou plus ;
  - **5 face à un contrat de 100 ou moins** ;
  - 9 face au contrat du partenaire dans une autre couleur.
- Exemples :
  - `JH JS 7D QD 10D AH AD 9H` passe sur 90D, avec Valet, 9 et As de cœur, plus l'AD.
  - `9H KH JC JH KC AH QD JD` passe sur 80C avec quatre cœurs : J, 9, A, K.
- Ouverture à 80 sans le Valet, le 9 ni l'As d'atout : seulement 2 cas sur 273 (exemple : `KH AS 9C 8H QH AD 10H QC` en 80H).

## EMP-7 — Contrats trop hauts pour un club

- Catégorie : non humain. Gravité : **moyenne**.
- Les contrats à 80 et 90 ne font que 28 % du total ; ceux à 110 et plus en font 54 %. Le contrat médian est à 110.
- Les taux de chute (27 %) et de capot (0,9 %) sont normaux.
- Coinche à 13 % : un peu haut, mais proche de l'équilibre (le coincheur gagne 44 % de ses coinches). Ce n'est pas classé comme anomalie.
- Les références « club » viennent des attentes du cahier des charges, pas de données.

## EMP-8 — Charges et gaspillages : marginaux

- Catégorie : non humain. Gravité : **basse**.
- Dernier à jouer, partenaire maître, une charge de 10 points ou plus possible : le bot joue une carte sans point dans 14,3 % des cas (88/617).
  - 40 de ces cas gardent un As, ce qui se défend.
  - Un 10 non maître est gardé dans 13 % des cas (13/98).
- Dernier à jouer, pli perdu quoi qu'il joue, une grosse et une petite carte légales : le bot donne un As ou un 10 dans 1,1 % des cas (7/620).
  - Partie g205, donne 6 : atout S à 140, main `KD 8D 10C JH 9C`, pli `7C QC 8S` coupé par l'adversaire. Il joue le 10C alors que le 9C était légal.
  - Partie g212, donne 4 : atout H à 120, main `KS 8S 9S 8H 9C 8D AH`, pli `JH 7C 10H`. Il joue l'**AH** alors que le 8H était légal.
- Dernier à jouer, pli déjà gagné par le partenaire, défausse possible : le bot coupe dans 4,3 % des cas (10/234), surtout avec un atout de 10 points ou plus, donc en guise de charge.
- Coupe avec le Valet ou le 9 d'atout alors qu'un petit atout suffisait : 8 % (11/135).

## Non mesuré ou sans objet

- **Belote tardive** : sans objet, la belote est annoncée automatiquement (`declareBeloteIfNeeded`). Le détenteur joue son premier Roi ou sa première Dame d'atout entre le pli 1 et le pli 7, sans tendance nette (n = 102).
- **Vrai téléphone** : non mesuré, seule l'horloge a été simulée.
- **Statistiques d'enchères à 96 mondes** : non refaites.
- **Personnalités `aggr`** : leur effet n'a pas été isolé.
- **Faux positifs** : les compteurs de coups suspects sont des heuristiques. Pour les entames de défense (EMP-4), les exemples ne prouvent pas une erreur.
