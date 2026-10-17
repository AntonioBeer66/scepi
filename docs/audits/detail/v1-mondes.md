# Vague 1 — Génération et pondération des mondes (inférence)

Rapport détaillé du sous-agent « mondes » (Opus), moteur au commit `b548853`. Zone : `canHold`, `dealUnknown`, `bidReadings`, `interventionP`, `bidFits`, `baremeFits`, `seatWeight`, `mcWorlds`, `worldBelote` (`engine.js` l. 1495-1785). Outils : une copie du moteur qui exporte les fonctions internes, et `tests/coinche-justesse.js` sur 16 parties. Synthèse : [`../2026-10-bots-coinche.md`](../2026-10-bots-coinche.md).

## MON-1 — Les enchères d'un humain sont presque ignorées

- Lignes : 1669 et 1683-1685 (`MISFIT.human = 0.15`, valeur fixe quelle que soit la main).
- Catégorie : les deux. Gravité : haute.
- Scénario : le partenaire humain ouvre 80♥ en respectant le système (Valet troisième + As♠). Ce que le bot imagine sur sa main :

| Ce que le bot imagine | sans enchère (a priori) | partenaire humain | partenaire bot |
|---|---|---|---|
| au moins 3 cœurs | 30 % | 42 % | 77 % |
| le Valet de cœur | 33 % | 45 % | 66 % |
| nombre moyen de cœurs | 2,0 | 2,25 | 2,9 |

- Même effet contre un preneur humain. Même donne, 80♠ au barème, même défenseur :

| Preneur | réussite estimée par le bot | coinche |
|---|---|---|
| humain | 0,128 | 100 % des fois |
| bot | 0,284 | 73 % des fois |

  Sur une autre main de défense : 0,515 contre 0,735.
- Problème :
  - Les mains faibles sont bien plus nombreuses que celles qui collent à l'enchère. Avec un poids de 0,15, elles noient la lecture. Le code le dit lui-même (l. 1666-1668) : une tolérance de 1 % suffisait déjà à fausser la lecture.
  - Le bot joue donc comme si l'atout annoncé par l'humain était presque tiré au hasard.
  - Il coinche les humains bien plus souvent que les bots.
- Piste :
  - une tolérance graduée selon l'écart au système : au moins 2 ou 3 atouts, un honneur, une marge de ±10 sur le montant ;
  - ou un poids d'erreur d'environ 0,01, avec des « mains humaines typiques » acceptées à 1 ;
  - étendre `tests/coinche-justesse.js` aux sièges humains : il ne mesure aujourd'hui que des bots, donc ce chemin n'est jamais testé.
- Preuve : vérifié par exécution.

## MON-2 — Chez un humain, une main proche du système pèse moins qu'une main qui n'a rien à voir

- Lignes : 1685 (`bidFits(r,h) || misfit`), 1670 (`BLUFF` 0,07), 1677 (`SIM_FIT` 0,1), 1579 et 1611 (planchers de 0,002).
- Catégorie : non-humain. Gravité : haute.
- Scénario : après un 80♥ humain, les poids mesurés sont :
  - Valet sec + 2 As : 0,07 ;
  - V♥ 9♥ 7♥ + A♠ : 0,1 ;
  - aucun cœur : 0,15.
- Une intervention humaine avec 3 cartes faibles pèse environ 0,01, alors qu'une main à 2 cartes, lue comme impossible, pèse 0,15.
- Problème : la lecture est inversée. Le bot juge « pas de cœur » plus plausible que « Valet-9 de cœur ».
- Piste : `Math.max(fit, misfit)`, ou ramener les valeurs de bluff et de « hors barème » à une échelle relative au poids d'erreur.
- Preuve : vérifié par exécution.

## MON-3 — Les passes d'un humain sont lues aussi strictement que celles d'un bot

- Lignes : 1609-1611, 1557-1580.
- Catégorie : les deux. Gravité : moyenne.
- Scénario : sur un 80♠ adverse, le partenaire humain passe par prudence avec V♥ 9♥ 8♥ 7♥ + A♣.
  - Sa vraie main pèse 0,071 ; le bot ne croit qu'à 2 % qu'il a au moins 4 cœurs.
  - Le résultat est identique selon que ce partenaire est humain ou bot : la tolérance humaine ne s'applique jamais, car le plancher de 0,002 n'est jamais nul.
  - Le modèle des passes a été appris sur 36 587 décisions de bots seulement.
- Problème : c'est incohérent avec MON-1. L'humain qui parle est à peine écouté, l'humain qui se tait est cru à la lettre.
- Piste : un mélange `(1−ε)·q + ε` pour les humains.
- Preuve : vérifié par exécution.

## MON-4 — Le type de siège est lu au moment de la décision, pas au moment de l'enchère

- Lignes : 1683 ; `src/coinche/game.js:128` (`devenirBot`).
- Catégorie : non-prédictible. Gravité : moyenne (cas rare, mais grave).
- Scénario : un humain ouvre 80♥ avec un Valet sec, puis quitte la table en cours de donne. Son siège devient « bot », et ses enchères passées sont relues avec la tolérance des bots (0,0001). Le bot ne croit plus qu'à 1,5 % que ce joueur a au plus un cœur, alors qu'il en a un.
- Problème : les mondes deviennent sûrs mais faux, et le jeu change d'un coup quand quelqu'un se déconnecte.
- Piste : enregistrer le type du joueur dans chaque entrée de `bidLog` au moment où il parle.
- Preuve : vérifié par exécution (cas « bot ») et lecture de game.js.

## MON-5 — Mondes corrélés, donc décisions instables d'une fois à l'autre

- Lignes : 1733-1766 (`BURN` 400, `THIN` 32, une seule chaîne).
- Catégorie : non-prédictible. Gravité : haute.
- Scénario :
  - On relance 40 fois le tirage des mondes sur une même position. La part de mondes où le partenaire a le 9♥ varie de 0,27 à 0,69.
  - L'écart-type vaut 0,100, contre 0,051 attendu si les 96 mondes étaient indépendants : ils en valent en réalité 25 à 45.
  - Décision de carte rejouée 5 fois sur 560 positions (bots, horloge figée) : la carte n'est pas toujours la même dans 29,3 % des cas, et la couleur change dans 18,4 %. Aux plis 1 et 2 : 51,8 %.
  - La coinche du scénario MON-1 se décide à 73/27 pour une situation identique.
- Problème : un partenaire humain ne peut pas anticiper le bot, puisque la même situation donne des jeux différents.
- Piste :
  - plusieurs chaînes indépendantes (par exemple 4 × 24 mondes), ou un `THIN` plus grand en début de donne ;
  - un hasard fixé d'après l'état public et la main ;
  - ne quitter le réflexe que si l'écart dépasse l'erreur-type (partie évaluation).
- Preuve : vérifié par exécution.

## MON-6 — Erreurs de lecture sur le Valet et le 9 d'atout, entre bots

- Lignes : 1619-1663.
- Catégorie : non-humain. Gravité : basse à moyenne (petits échantillons).
- Scénario : `coinche-justesse` sur 16 parties, bots seulement.
  - « Sûr mais faux » : le bot place la carte ailleurs dans plus de 95 % de ses mondes, alors qu'elle est bien là.
  - « Trompe » : la lecture des enchères pousse l'estimation d'au moins 15 points dans le mauvais sens.

| Cas | sûr mais faux, ou trompe | échantillon |
|---|---|---|
| Valet d'atout chez le partenaire | sûr mais faux : 5,2 % (0,0 % sans la lecture des enchères) | 459 |
| « a remonté son partenaire », V ou 9 d'atout | sûr mais faux : 10,7 % | 56 |
| « n'a pas remonté », V ou 9 d'atout (jeu de la carte) | trompe : 31 % | 55 |
| « a passé sur l'adversaire », V ou 9 d'atout | trompe : 20-22 % | 147 et 364 |

- Problème : même entre bots, la relecture des remontées et des passes fait parfois perdre de vue le Valet du partenaire.
- Piste : confirmer sur 360 parties, puis assouplir ces lectures.
- Preuve : vérifié par exécution, sur des échantillons faibles.

## MON-7 — Signaux de défausse : même lecture pour tous, apport nul, refus ignoré

- Lignes : 1178-1188 et 1686-1689 (`SIGNAL_MISFIT` 0,3, même valeur pour humains et bots). Le refus (`G.refus`) n'est pas utilisé dans les mondes.
- Catégorie : non-prédictible. Gravité : basse.
- Scénario :
  - Un humain jette un 7♣ inutile sans avoir l'As : le bot croit à 65 % que l'As♣ est chez lui, contre environ 33 % sans ce signal.
  - Entre bots, la lecture des appels et des refus n'apporte presque rien : de −0,1 à +0,4 point de justesse.
- Problème : les conventions de défausse varient d'un joueur à l'autre, et le bot suppose que tout le monde suit la sienne.
- Piste : atténuer la lecture pour les humains, ou la supprimer.
- Preuve : vérifié par exécution.

## Ce qui fonctionne bien

- La chaîne n'a pas de biais : sa moyenne colle à la cible calculée par échantillonnage d'importance (150 000 à 200 000 tirages, écart ≤ 0,03 partout).
- Le générateur ne tombe jamais à vide : aucun ensemble de mondes vide sur 1 344 décisions.
- `noteTrumpObligations` est cohérent avec `computeLegal`.
- Entre bots, les probabilités sont bien calibrées (0,35 prédit pour 0,35 observé ; 0,99 pour 0,96).
