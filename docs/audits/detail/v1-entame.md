# Vague 1 : entame et signaux

Rapport détaillé du sous-agent « entame » (Opus), moteur au commit `b548853`. Zone : `leadCard`, `defaultLead`, `appelCard`, `calledSuit`, `readDiscardSignal`, `partnerShowsJack` (`engine.js` l. 1143-1318). Synthèse : [`../2026-10-bots-coinche.md`](../2026-10-bots-coinche.md).

**Méthode**

- Copie instrumentée du moteur.
- 36 parties entre bots, soit 439 donnes et 3 073 entames où le bot avait le choix, à 96 mondes avec horloge figée.
- Chaque entame est rejouée 2 fois de plus avec un autre tirage du hasard.
- Positions construites, jouées chacune sur 20 graines.

## ENT-1 : la carte d'entame change d'un tirage à l'autre

- Lignes : 2062-2089.
- Catégorie : non-prédictible. Gravité : haute.
- Mesure : on rejoue la même position avec 2 nouveaux tirages. La couleur entamée au premier pli change dans :
  - 78,8 % des cas en défense ;
  - 68,8 % des cas pour le partenaire du preneur ;
  - 44,9 % des cas pour le preneur.
- Sur toutes les entames, le choix « atout ou pas atout » bascule dans 12,7 % des cas.
- Scénarios :
  - Défense contre 80♥, main `10S AD 8D 7D AC 9C 8C 7H` : 6 cartes différentes sur 20 graines (10♠ 9 fois, 8♦ 3, 9♣ 3, A♦ 2, A♣ 2, 7♥ 1).
  - Main `QS 8S KD 9D 7D 9C 8C 7H`, partenaire qui a annoncé ♠ : 6 cartes différentes.
- Problème :
  - Le partenaire ne peut rien déduire de l'entame, puisqu'elle dépend du hasard.
  - Le réflexe ne l'emporte qu'à égalité stricte. Parmi les écarts au réflexe, 23 % se décident à moins de 3 pts par monde, ce qui relève du bruit.
- Annexe : sur le PC d'audit, une première entame prend 60 à 90 ms en isolé. Avec 6 parties sur 4 cœurs, 63 % dépassaient le budget de 250 ms : la carte dépend donc aussi de la machine.
- Piste : imposer une marge du type `TRUMP_LEAD_MARGIN` à tout changement de couleur par rapport au réflexe, au moins quand le réflexe applique une convention. Ou utiliser une graine fixe par position.
- Preuve : vérifié par exécution.

## ENT-2 : la défense entame atout malgré la règle « jamais d'atout en entame »

- Lignes : 960, 2081-2087.
- Catégorie : les deux. Gravité : haute.
- Mesure :
  - 97 entames d'atout sur 1 103 (8,8 %) en défense, alors que le bot avait des cartes hors atout ;
  - 36 sur 236 (15,3 %) à la première entame ;
  - dans 55,7 % de ces cas, l'un des 2 nouveaux tirages n'entame pas atout.
- Scénarios :
  - Main `9D AC 7S 10C QD 8C 10D AD` contre 130♠ : le réflexe joue A♦ (l'As accompagné de son 10). Le bot joue le 7♠, son atout sec. Les 2 nouveaux tirages jouent A♣.
  - Main `AH 7D JS QH KD KS 9C KC` contre 100♥ : le bot entame l'As d'atout au premier pli.
- Problème : c'est la convention de défense la plus lisible. Le partenaire humain conclut à tort que le bot a du jeu à l'atout.
- Piste : n'autoriser l'atout en entame de défense que dans des cas précis, par exemple après une coupe adverse constatée. Sinon, relever fortement la marge.
- Preuve : vérifié par exécution.

## ENT-3 : le preneur ne tire pas atout avec Valet-9 troisième

- Lignes : 1196-1209, 1238-1272.
- Catégorie : les deux. Gravité : haute.
- Mesure :
  - quand le réflexe du preneur tire atout au premier pli, le Monte-Carlo le refuse 41 fois sur 104 (39,4 %) ;
  - sur l'ensemble de la donne, 32,8 % pour le preneur et 40 % pour son partenaire.
- Scénarios :
  - Main du test de stratégie « tirer l'atout maître », `JH 9H 7H AS 8S KD 7D 8C` à 100♥. Le Valet n'est joué sur aucune des 20 graines : 8♣ 12 fois, 7♦ 4, 8♠ 2, R♦ 2. Le test passe sur `heuristicCard`, mais le bot réel ne joue jamais ainsi.
  - Main `7D AH JC 9C QC 10S 9D AD` à 110♣ : le bot entame le 7♦, sous son propre As, sur les 3 tirages.
- Cause probable (lecture du code) : dans les parties imaginées, la défense n'entame jamais atout. Aucune branche de défense de `leadCard` ne renvoie un atout, sauf s'il ne reste que des atouts. Le Monte-Carlo ne craint donc pas qu'on lui retire ses coupes, et il exploite une défense irréaliste.
- Piste : faire rejouer atout à la défense simulée quand le preneur prépare une coupe. Appliquer aussi la marge d'ENT-2.
- Preuve : chiffres vérifiés par exécution ; la cause relève de la lecture du code.

## ENT-4 : les réponses aux conventions sont souvent abandonnées

- Lignes : 1218-1223, 1244-1263.
- Catégorie : non-prédictible. Gravité : moyenne.
- Mesure : quand le réflexe joue la couleur concernée, le Monte-Carlo joue ailleurs dans :
  - 25 cas sur 56 (45 %) pour la couleur appelée, en défense ;
  - 14 cas sur 51 (27 %) pour la couleur appelée, en attaque ;
  - 81 cas sur 135 (60 %) pour la couleur annoncée par le partenaire.
- Point positif : un appel humain bien construit (7♠ défaussé avec A♠ en main) est respecté 20 fois sur 20.
- Problème : l'humain qui appelle ne sait pas si sa couleur reviendra.
- Piste : la même marge que pour ENT-1, appliquée à ces branches.
- Preuve : vérifié par exécution.

## ENT-5 : la lecture des signaux ne correspond pas à leur émission

- Lignes : 1178-1188, 1163-1173, 1412-1452.
- Catégorie : non-prédictible. Gravité : haute.
- Mesure :
  - `readDiscardSignal` lit toute première défausse 7, 8 ou 9 comme un appel. Or, sans appel à faire, `discard` jette la carte qui coûte le moins, souvent une petite carte d'une couleur sans As.
  - Sur 691 appels lus, 578 (83,6 %) viennent d'un joueur qui n'a pas l'As.
  - 240 (34,7 %) sont des faux appels lisibles : l'As n'est pas encore tombé. 167 d'entre eux viennent de la défense.
  - 338 (49 %) portent sur une couleur dont l'As est déjà tombé. Ils consomment pourtant le seul signal de la donne (l. 1164, 1181) : le joueur ne peut plus appeler ensuite.
  - Refus : 101 sur 519 (19,5 %) sont lus alors que le joueur tient l'As ou le 10 de la couleur.
  - Le Valet est lu comme un refus, alors que le bot n'émet un refus qu'avec un Roi ou une Dame.
- Problème : un humain lit « petite carte = appel ». Il rejoue la couleur, et le bot n'y a rien.
- Piste :
  - ignorer les petites cartes d'une couleur dont l'As est tombé, sans bloquer les signaux suivants ;
  - dans `discard`, pénaliser les petites cartes d'une couleur sans As quand cet As est encore dehors ;
  - limiter le refus au Roi et à la Dame.
- Preuve : vérifié par exécution.

## ENT-6 : seule la première défausse de l'humain est comprise

- Lignes : 1179-1184, 1244-1249.
- Catégorie : non-prédictible. Gravité : moyenne.
- Scénarios :
  - L'humain défausse d'abord le R♦ (refus), puis le 7♠ avec l'A♠ en main (appel). L'appel est ignoré.
  - À l'inverse, une première défausse faite pour se débarrasser d'un 8♣ est lue comme un appel, et `calledSuit` fait rejouer trèfle.
- Piste : retenir le dernier signal encore valable, ou un appel qui suit un refus.
- Preuve : lecture du code, sans ambiguïté.

## ENT-7 : le réflexe entame un 10 sec en défense

- Lignes : 1238-1243, 1255-1263, 1284-1301.
- Catégorie : non-humain. Gravité : moyenne.
- Scénario 1 : main `10S AD 8D 7D AC 9C 8C 7H` contre 80♥.
  - La règle « pas d'As à la 1re entame si son 10 est dehors » écarte les As.
  - Dans `defaultLead`, le malus de −15 « sous l'As » met carreau et trèfle à −24.
  - Le 10 sec obtient −23 : c'est donc lui que le réflexe entame. Le Monte-Carlo le confirme 9 fois sur 20.
- Scénario 2 : la branche « couleur du partenaire » prend la plus petite carte, même si c'est un 10 sec. Exemple en simulation : main `10H 7D 7S 7C KD QS JD QC`, atout ♠ : le réflexe joue le 10♥.
- Mesure : le réflexe entame un 10 non maître 25 fois ; le Monte-Carlo en ajoute 69 (2,3 % des entames).
- Couverture des tests : le test « ne pas entamer un 10 sec » n'utilise qu'une main sans As.
- Piste : pénaliser davantage le 10 non maître, l'exclure de la branche « couleur du partenaire », et autoriser l'As quand la seule autre option est un 10 ou un Roi sec.
- Preuve : vérifié par exécution.

## Ce qui fonctionne bien

- Les réflexes d'attaque sont réalistes : atout maître d'abord, petit atout pour faire tomber le Valet, retour vers le partenaire qui a montré le Valet (cohérent avec les enchères 90, 110 et plus, et la relance de 20).
- L'arrêt du tirage d'atout repose sur un vrai décompte (`mayTrump`, `trumpMax`).
- Le réflexe de défense n'entame jamais atout et respecte la couleur appelée.
- En attaque, la marge sur l'atout limite à 3 % les entames d'atout ajoutées par le Monte-Carlo.

Le problème principal est que le Monte-Carlo dénature ces réflexes à l'entame.
