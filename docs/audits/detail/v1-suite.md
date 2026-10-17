# Vague 1 : jouer en 2e, 3e et 4e position

Rapport détaillé du sous-agent « suite de pli » (Sonnet), moteur au commit `b548853`. Zone : `followCard`, `charge`, `discard`, `topOfSequence` et les fonctions auxiliaires (`engine.js` l. 975-1464). Synthèse : [`../2026-10-bots-coinche.md`](../2026-10-bots-coinche.md).

**Méthode.**

- Copie instrumentée du moteur : compteurs dans `botChooseCard`, étiquettes de branche dans `followCard`.
- 32 parties de 4 bots, à 96 mondes (valeur par défaut) et horloge figée : 407 donnes, 5 635 décisions en 2e, 3e ou 4e position avec au moins 2 cartes légales.
- Échantillons plus petits : 6 parties pour les entames sur appel, 2 parties (69 situations rejouées 5 fois) pour la stabilité.
- Le test d'instabilité à 24 mondes (appareil lent) n'a pas pu aller au bout : la machine était saturée.

**Écart global entre Monte-Carlo et réflexe :** 28 % des décisions (40 % en 2e position, 27 % en 3e, 17 % en 4e).

## SUI-1 : la défausse « neutre » est lue comme un faux appel

- Lignes : `discard` 1432-1458, `readDiscardSignal` 1178-1188, `calledSuit` 1151, `SIGNAL_MISFIT` ~1668.
- Catégorie : les deux. Gravité : haute.
- Scénario : défense, atout cœur, aucun pique, main R♣ 7♣ 8♦ 9♦ 10♦ D♦, sans As. Le réflexe joue le 7♣ (vérifié par exécution).
- Problème :
  - `discard` joue la carte la moins chère, donc presque toujours un 7, un 8 ou un 9.
  - `readDiscardSignal` lit toute première défausse 7/8/9 comme un appel, que le joueur tienne l'As ou non.
  - Aucune défausse n'est donc neutre : un humain lira « appel » sur un 7 jeté faute de mieux.
- Mesure :
  - Réflexe : sur 1 105 premières défausses, 716 sont lues comme appel, dont 521 (73 %) fausses (pas d'As, et au moins 2 cartes dans la couleur).
  - Monte-Carlo : 475 appels faux sur 563 (84 %).
  - Même aux plis 1 à 3 : 60 % de faux appels pour le réflexe, 77 % pour le Monte-Carlo.
- Conséquence : sur 21 entames où `calledSuit` était actif, le partenaire n'avait l'As que 5 fois. 16 appels sur 21 (76 %) étaient faux. Le modèle du Monte-Carlo suppose un faux appel bien plus rare (`SIGNAL_MISFIT` = 0,3).
- Piste : une défausse sans As ne doit pas se lire comme un appel. Par exemple :
  - ne lire comme appel que le 7 ou le 8 (pas le 9), sur une défausse volontaire, avant le pli 4 ;
  - préférer un refus (Valet ou Dame) à un 7 quand l'écart de coût est faible.
  À défaut, recalibrer `SIGNAL_MISFIT` sur la fréquence réelle.

## SUI-2 : le Monte-Carlo détruit les vrais appels et envoie des refus contradictoires

- Lignes : `mcChooseCard` 2062-2090. Le signal n'a aucun poids hors du réflexe.
- Catégorie : les deux. Gravité : haute.
- Mesure, sur 195 vrais appels du réflexe :
  - le Monte-Carlo en garde 81 (42 %) ;
  - il en remplace 38 par un faux appel, 47 par un refus et 29 par une autre carte ;
  - au total, 88 vrais appels côté Monte-Carlo contre 195 côté réflexe.
- Refus émis alors que le bot tient l'As de la couleur : 30 avec le réflexe, 67 avec le Monte-Carlo (18 % de ses refus). Exemple : main D♦ A♠ 9♣ D♠ A♣, il joue la D♠, ce qui dit « ne rejoue pas pique » alors qu'il a l'As de pique.
- Piste : exclure des candidats du Monte-Carlo, ou pénaliser, les défausses dont le signal lu est faux ou contradictoire (appel sans As, refus avec As ou 10).

## SUI-3 : les égalités sont tranchées par l'ordre de distribution des cartes

- Lignes : `firstMin`/`lastMax` 1019-1040, `appelCard` 1163-1175 (`cards.find`), égalités de coût dans `discard`. `G.hands` garde l'ordre de la donne, sans tri.
- Catégorie : non-prédictible. Gravité : moyenne.
- Scénario (vérifié par exécution) :
  - Avec la même main A♣ 7♣ 9♣, l'appel se fait au 7♣ ou au 9♣ selon l'ordre des cartes.
  - Avec deux doubletons de même coût, la défausse est le 7♣ ou le 9♦ selon l'ordre.
  - Avec deux As, la couleur d'appel est arbitraire.
- Mesure : 23 des 195 vrais appels du réflexe (12 %) n'utilisent pas la plus petite carte. Le 9, troisième plus forte carte de la couleur, est pourtant lu comme un appel.
- Piste : trier la main de façon canonique avant toute sélection, avec un départage explicite (rang le plus bas, puis couleur la plus longue, etc.), et ne lire l'appel que sur le 7 ou le 8.

## SUI-4 : le réflexe refuse de charger au-dessus d'une carte plus faible du partenaire

- Lignes : `charge` 1389-1396 (filtre `under`).
- Catégorie : non-humain pour le réflexe ; le Monte-Carlo corrige. Gravité : moyenne.
- Scénario 1 (vérifié par exécution) : 4e à jouer, la Dame de trèfle du partenaire gagne le pli, main 10♣ 7♣. Le réflexe joue le 7♣. Un joueur de club met le 10 : le pli est acquis, la carte au-dessus ne coûte rien.
- Même cause pour le Roi du partenaire avec 10♠ et 9♠ en main (exemple tiré des parties).
- Second défaut au même endroit : `highest(under)` donne une carte maîtresse. As et 10 de carreau tombés, le partenaire gagne de l'As, main R♦ V♦ : le réflexe donne le Roi, devenu maître (+2 points), et perd un pli futur.
- Mesure, sur 1 194 charges :
  - le Monte-Carlo diffère du réflexe dans 30 % des cas ;
  - il charge moins que le réflexe dans 175 cas (15 %), plus dans 110 (9 %) ;
  - sa carte prend le pli du partenaire dans 35 cas.
- Piste : autoriser la carte au-dessus de celle du partenaire quand aucun adversaire ne joue après, ou quand la carte tient. Ne jamais donner une carte maîtresse quand une carte inférieure existe dans la couleur.

## SUI-5 : le 10 « menacé » est défaussé en ignorant l'appel du partenaire

- Lignes : `charge` 1405-1408 (`tenAtRisk`, via `higherOut`).
- Catégorie : non-humain. Gravité : basse à moyenne.
- Scénario (vérifié par exécution) : le partenaire a appelé trèfle, donc il a l'As. Je n'ai plus de pique, avec 10♣ 8♣ en main, et je joue le 10♣. Un humain garde le 10 derrière l'As du partenaire.
- Mesure : le Monte-Carlo contredit cette branche (`ten`) dans 49 % des cas (55 sur 113).
- Piste : ne pas considérer le 10 comme « à risque » dans une couleur appelée par le partenaire, tant que son As n'est pas tombé.

## SUI-6 : les réflexes de pli incertain sont contredits plus d'une fois sur deux

- Lignes : branches « petit en second », « pli incertain » et « couper petit » de `followCard` (~1330-1385).
- Catégorie : les deux. Gravité : moyenne.
- Taux d'écart du Monte-Carlo au réflexe, par branche :

| Branche | Écart |
|---|---|
| petit en second | 62 % (103 sur 167) |
| pli incertain, défausse | 64 % (155 sur 241) |
| pli incertain, gagner au plus juste | 51 % |
| couper petit | 43 % (137 sur 322) |

- Pour « couper petit », le Monte-Carlo ne renonce jamais à couper : dans ses 137 écarts, il coupe plus gros.
- Conséquence : le partenaire ne peut pas déduire « il a mis petit en second, donc pas d'As », ni savoir si le bot coupe petit ou gros.
- Dans l'autre sens, charger un 10 dans un pli incertain, contrairement au réflexe, reste rare : 41 cartes au-dessus du partenaire et 5 charges de 10 ou plus sans prendre le pli, sur 5 635 décisions. Le volume ne pose pas problème.
- Piste : soit corriger ces règles pour les aligner sur ce que le Monte-Carlo retient le plus souvent, soit retirer la règle du commentaire et assumer le Monte-Carlo.

## SUI-7 : la même situation donne des cartes différentes selon le tirage

- Lignes : `mcChooseCard`. `MC_BUDGET_MS` = 250 en horloge réelle ; mondes tirés par `Math.random`, sans graine en production.
- Catégorie : non-prédictible. Gravité : haute.
- Mesure : 69 situations rejouées 5 fois avec des graines différentes, 96 mondes, horloge figée. 18 situations (26 %) donnent plus d'une carte : 12 en donnent 2, 6 en donnent 3. Les défausses sont aussi instables : 11 sur 42 (26 %).
- Sur un appareil lent, le budget de 250 ms coupe les mondes et l'instabilité augmente (lecture du code, non mesuré).
- Piste : départager les écarts faibles par une règle déterministe, et ne quitter le réflexe qu'au-delà d'un seuil d'écart, comme déjà fait pour l'atout à l'entame (`TRUMP_LEAD_MARGIN`). Mesurer ensuite le coût en points.

## SUI-8 : le signal est lu même quand il est inutile ou forcé

- Lignes : `readDiscardSignal` 1178-1188, appelé en 2375 sans condition de pli ni de choix.
- Catégorie : non-prédictible. Gravité : basse.
- Aux plis 4 à 8, 87 % des « appels » du réflexe et 91 % de ceux du Monte-Carlo sont faux. Une défausse forcée, ou celle d'un humain pris au dépourvu, devient quand même un appel que le bot partenaire suivra.
- Piste : ne lire le signal que sur une défausse volontaire (plusieurs cartes hors atout légales) et avant un pli donné.

## Ce qui fonctionne bien

- `topOfSequence` est cohérent et lisible. L'As passe avant le 10, et le 10 avant le Roi quand ils se suivent. Un partenaire qui voit tomber un 10 en déduit que le bot n'a pas l'As, et c'est vrai par construction.
- Mettre l'As sur le 10 du partenaire seulement avec le Roi derrière est une règle de club.
- Les charges classiques fonctionnent : le 10 sous l'As du partenaire, la Dame ou le Roi sans As ni 10 en refus. Le Monte-Carlo les reprend dans 70 % des charges ; les écarts se concentrent dans les cas de SUI-4.
- Quand il doit couper, le Monte-Carlo ne coupe jamais plus petit que le réflexe.
