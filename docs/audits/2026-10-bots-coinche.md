# Audit des bots de coinche : ce qui les rend non humains et non prédictibles

Octobre 2026, moteur `src/coinche/engine.js` au commit `b548853`. Audit en lecture seule : aucun code de jeu modifié.

- **Non humain** : un joueur de club ne jouerait pas ainsi, ou trouverait le coup bizarre.
- **Non prédictible** : le partenaire humain ne peut pas lire la main ou l'intention du bot. Soit le même état donne des décisions différentes, soit une annonce ou un signal ne veut pas dire ce que la convention dit.

## En bref

Les réflexes et le barème sont, pour l'essentiel, ceux d'un joueur de club. Ils sont déterministes et cohérents avec les conventions affichées. Le problème vient presque entièrement de **ce qui se pose par-dessus** :

1. **Le Monte-Carlo a le dernier mot, avec un bruit plus grand que les écarts qu'il tranche.** La carte n'est pas la même d'une fois à l'autre dans 18 à 38 % des décisions de carte, et dans la majorité des entames des premiers plis. Le réflexe ne l'emporte qu'à égalité stricte, au centième de point près.
2. **Le modèle simulé est biaisé, et un signal n'y vaut rien.** Les joueurs imaginés jouent les réflexes des bots (la défense n'y entame jamais atout) et la fin de donne à cartes ouvertes. Le Monte-Carlo en tire des coups « optimaux » contraires aux conventions :
   - le preneur ne tire pas atout avec Valet-9 ;
   - la défense entame atout ;
   - les appels du réflexe sont détruits.
3. **Le budget de réflexion est compté en millisecondes.** Le même bot enchérit et joue autrement selon l'appareil qui héberge la table. Sur un appareil lent, une Générale peut être validée sur un seul monde.
4. **Le langage n'est pas le même à l'émission et à la lecture.**
   - 73 à 84 % des « appels » lus sont faux, car la défausse neutre est lue comme un appel.
   - Les relances de soutien (« clefs ») sont décalées d'un As.
   - Une relance dans la couleur du partenaire peut se faire avec un 7 sec.
   - Le palier 90 ou 100 est tiré au sort.
5. **Le modèle de l'humain est mal calibré.** Les enchères d'un humain sont presque ignorées, avec une inversion : une main proche du système pèse moins qu'une main sans rapport. Ses passes, elles, sont crues à la lettre.
6. **Détails d'hôte et de rythme.**
   - Le délai de jeu est uniforme, quelle que soit la difficulté du coup.
   - Le bot « passe » puis coinche 0,3 s après.
   - La surcoinche est tirée à pile ou face.
   - La « personnalité » ne sert qu'à la surcoinche, et le commentaire qui la décrit est faux.
   - Un siège repris par un bot en plein tour reste muet 20 s, puis joue une carte au hasard.

**Angle mort des tests.** `tests/coinche-strategies.test.js` vérifie les réflexes (`heuristicCard`), pas la carte réellement jouée. Exemple : le scénario « tirer l'atout maître » (`JH 9H 7H AS 8S KD 7D 8C` à 100♥) passe au test. Pourtant, le bot réel n'a joué le Valet sur **aucune** des 20 graines essayées.

## Méthode

Neuf sous-agents, un par fonction des bots. Chacun a lu son code, puis vérifié ses hypothèses en exécutant une copie instrumentée du moteur.

| Fonction | Code | Modèle | Constats |
|---|---|---|---|
| Ouverture et barème | `openingBid`, `bestOpening`, `generaleBid`, étape 4 de `decideBid` | Opus | OUV-1 à 7 |
| Soutien et compétition | `supportPoints`, `raiseBy`, `decideBid` | Opus | ENC-1 à 8 |
| Coinche et surcoinche | `botWantsToCoinche`, `botWantsToSurcoinche`, `makeProbability` | Sonnet | COI-1 à 8 |
| Entame et signaux | `leadCard`, `defaultLead`, `appelCard`, `readDiscardSignal` | Opus | ENT-1 à 7 |
| Jeu en 2e, 3e et 4e position | `followCard`, `charge`, `discard`, `topOfSequence` | Sonnet | SUI-1 à 8 |
| Inférence des mondes | `mcWorlds`, `bidFits`, `seatWeight`, `dealUnknown` | Opus | MON-1 à 7 |
| Évaluation et choix de la carte | `mcChooseCard`, `playOut`, `donneValue`, `exactEnd` | Opus | MCD-1 à 4 |
| Hasard, personnalité, rythme | `host.js`, `Math.random`, `tuning.now` | Haiku | HAS-1 à 8 |
| Audit empirique | `tests/coinche-sim.js` instrumenté | Sonnet | EMP-1 à 8 |

Sauf mention contraire, les mesures sont faites à 96 mondes, horloge figée (`tuning.now = () => 0`), sur des parties entre quatre bots. Exceptions et réserves :

- Les statistiques d'enchères de l'audit empirique sont faites à 32 mondes.
- « Appareil lent » veut dire une horloge accélérée, pas un vrai téléphone.
- Les échantillons vont de quelques dizaines à quelques milliers de décisions, selon l'agent.
- Les points clés ont été relus dans le code au moment de la consolidation :
  - veto d'ouverture sans repli ;
  - surcoinche par `Math.random` ;
  - `readDiscardSignal` ;
  - `MISFIT` et `seatWeight` ;
  - départage de `mcChooseCard` ;
  - `playerView` ;
  - clé de tour dans `host.js`.

## Les causes racines

### C1. Le Monte-Carlo tranche sur du bruit — non prédictible, **haute**

- **Lignes 2062-2089.** `mcChooseCard` garde l'argmax strict (`t > totals[best] + 1e-9`). Le réflexe ne gagne qu'à égalité exacte.
- **Lignes 1864-1873.** `donneValue` départage par les points de plis × 0,01. Le réflexe est donc abandonné pour 1 à 10 points de cartes qui ne changent rien au score : 23 % des écarts au réflexe se jouent à moins de 0,1 pt par monde.
- **Lignes 1733-1766.** Les 96 mondes viennent d'une seule chaîne de Metropolis (`BURN` 400, `THIN` 32). Ils sont corrélés et n'en valent que 25 à 45 indépendants.
- **Hasard.** Tout est tiré par `Math.random`, sans graine liée à la situation.

Mesures, en rejouant la même position avec des graines différentes :

| Décision | Change d'une graine à l'autre | Source |
|---|---|---|
| Carte, toutes positions | 18 % (5 graines), 26-29 % (5 graines), 36-38 % (8 graines) | EMP-1, SUI-7, MON-5, MCD-1 |
| Carte, plis 1 à 3 | 52-66 % | MON-5, MCD-1 |
| Couleur de la première entame en défense | 79 % (3 tirages) | ENT-1 |
| Enchère | 13 % (5 graines), toujours une bascule passe contre annonce | EMP-1 |
| Coinche | 0 sur 44 décisions réelles ; 8 % de mains aléatoires instables, jusqu'à 15 % près du seuil | EMP-1, COI-2 |
| Donne complète entre 4 bots | contrat final différent dans 24 donnes sur 40, camp preneur dans 13 | ENC-1 |

Exemples :

- **Entame en défense** avec `10S AD 8D 7D AC 9C 8C 7H` contre 80♥ : 6 cartes différentes sur 20 graines.
- **Autre entame en défense** (`10♠ 10♣ V♦ 10♥ D♥ D♣ 8♣ R♦`, atout ♦) : 6 entames différentes sur 8 graines, dont une au Valet d'atout.
- **Preneur en second** sur 7♠ avec A♠ R♠ V♠ : As, Roi ou Valet selon la graine.

Ce qu'un test apparié changerait, mesuré par l'agent MCD (même échantillon de positions). La règle : ne quitter le réflexe que si le gain dépasse z erreurs-types.

| Règle | Décisions instables | Plis 1-3 | Écarts au réflexe |
|---|---|---|---|
| Actuelle | 37,8 % | 65,9 % | 32,1 % |
| z = 1 | 28,5 % | 51,2 % | 11,9 % |
| z = 2 | 16,6 % | 28 % | 6,7 % |

L'effet sur la force reste à mesurer en duel (`tests/coinche-ab.js`). Le commentaire des lignes 1476-1478 rapporte qu'une marge fixe de 5 pts coûtait 1,5 pt par donne. Un test d'erreur-type n'est pas une marge fixe, mais un arbitrage force contre lisibilité est probable.

### C2. Le modèle simulé pousse à des coups contraires aux conventions — les deux, **haute**

Dans les mondes imaginés, les quatre joueurs suivent les réflexes des bots (`playOut`, l. 1849-1855), et les 3 derniers plis se jouent à cartes ouvertes (`exactEnd`). Une carte n'y vaut que ses points : un appel ou un refus n'a aucune valeur. D'où :

- **Le preneur ne tire pas atout** (EMP-3, ENT-3).
  - Avec Valet + 9 + au moins 3 atouts, il n'entame atout au premier pli que dans 33 % des cas. Avec le Valet sans le 9, c'est 67 % : la relation est inversée.
  - Quand le réflexe tire atout, le Monte-Carlo le refuse 39 % du temps, malgré `TRUMP_LEAD_MARGIN = 8`.
  - Cause probable : la défense simulée n'entame jamais atout (aucune branche de défense de `leadCard` ne le fait), donc le Monte-Carlo ne craint pas qu'on lui retire ses coupes.
  - Exemple : `7D AH JC 9C QC 10S 9D AD` à 110♣ entame le 7♦ sur les 3 tirages, avec Valet-9-Dame de trèfle.
- **La défense entame atout** (ENT-2, EMP-4).
  - 15 % des premières entames de défense, alors que le réflexe ne le fait jamais.
  - Exemple : `9D AC 7S 10C QD 8C 10D AD` contre 130♠ entame son 7♠ sec au lieu de l'As de carreau.
- **La défense n'entame pas ses As** (EMP-4). Sur 90 premières entames de défense avec un As hors atout, le réflexe entame un As 74 fois, le choix final 30 fois.
- **Les réponses aux conventions sont abandonnées** (ENT-4). Le Monte-Carlo s'écarte de la couleur que le réflexe allait jouer dans 45 % des cas pour la couleur appelée en défense, et dans 60 % des cas pour la couleur annoncée par le partenaire.
- **Les signaux sont détruits** (SUI-2).
  - Sur 195 vrais appels du réflexe, le Monte-Carlo en garde 81.
  - Les refus émis avec l'As de la couleur en main passent de 30 à 67.
- **Le partenaire humain est supposé jouer comme un bot, et voir les cartes en fin de donne** (MCD-4). C'est une lecture du code : aucun coup absurde n'a été isolé.

### C3. Une décision qui dépend de l'appareil — non prédictible, **haute**

`MC_BUDGET_MS` = 250, `BID_BUDGET_MS` = 150 et `BID_DECISION_MS` = 400 sont lus sur `Date.now()`. Les bots tournent dans le navigateur de l'humain qui héberge la table. Quatre défauts :

- **Mondes non comptés.** Dans `makeProbability` (l. 2096-2113), le chronomètre démarre avant `mcWorlds`. Sur un appareil lent, la génération des mondes épuise le budget, et la boucle s'arrête après un seul monde.
- **Pas de plancher.** `minWorlds = 1` par défaut. La Générale (`generaleBid`, l. 605-617), le veto d'ouverture, le 80 hors barème, la coinche et la surcoinche n'exigent pas de minimum. Seul le capot en exige 24.
- **`null` change de branche.** Un `null` (« je ne sais pas ») fait sauter le veto de la simulation, par exemple à la ligne 832.
- **Option sacrifiée.** Dans l'étape 3 de `decideBid`, les capots et `pOpp` consomment le budget en premier, et le palier du barème, évalué en dernier, saute.

Mesures (horloge accélérée) :

- **Générale** (OUV-2). Avec `JH 9H 8H 7H QH AS 10S KS`, premier à parler : 500♥ dans 3 cas sur 16 à vitesse réelle, 12 sur 16 à ×20. Dans 9 cas sur 16, la Générale est jugée sur moins de 10 mondes.
- **Intervention** (ENC-2). Avec `JH AH 8H 7H AS 9S 8D 7C` sur 80♠ :
  - horloge figée : 90♥ 14 fois sur 20 ;
  - 2 ms par monde : 90♥ 20 fois sur 20 ;
  - 25 ms par monde : passe 20 fois sur 20.
- **Cartes** (MCD-2). À 10× plus lent, 41 % des décisions sont coupées avant 96 mondes, et 21 % des décisions des plis 1 à 3 changent.
- **Coinche** (COI-3). Sur appareil lent, elle se décide parfois sur quelques mondes : coinche sans raison dans 3 à 5 % des cas.

### C4. Les signaux et les annonces ne se lisent pas comme ils s'émettent — non prédictible, **haute**

**Défausses** (SUI-1, SUI-8, ENT-5, ENT-6, SUI-3) :

- **Toute première défausse 7/8/9 est lue comme un appel** (`readDiscardSignal`, l. 1178-1188). Or `discard` jette au moindre coût, donc presque toujours une petite carte. Résultat :
  - 73 % des appels lus sur les défausses du réflexe sont faux, 84 % avec le Monte-Carlo ;
  - 76 % des entames faites sur un appel partent sur un faux appel.
  Le modèle de monde suppose, lui, un faux appel bien plus rare (`SIGNAL_MISFIT` = 0,3).
- **Couleur dont l'As est tombé.** 49 % des appels lus portent sur une telle couleur. Ils consomment pourtant le seul signal de la donne.
- **Valet lu comme refus.** Le Valet est lu comme un refus, alors que le bot n'émet un refus qu'avec un Roi ou une Dame.
- **Seul le premier signal compte.** Un humain qui refuse puis appelle n'est pas compris.
- **Défausse forcée.** Elle est lue comme un signal volontaire.
- **Égalités tranchées par l'ordre de la donne** (`G.hands` n'est pas trié). Avec la même main As-7-9, l'appel se fait au 7 ou au 9 selon l'ordre des cartes.

**Enchères** (ENC-3, ENC-4, ENC-5, COI-6, EMP-5) :

- **Le palier 90 ou 100 est tiré au sort** (l. 793-801). Leur espérance est presque égale, donc le bruit tranche. Exemple : 90♥ 70 % du temps et 100♥ 30 % avec la même main. Pourtant, « 90 = Valet + 9 troisième » dans le système affiché.
- **Relance dans la couleur du partenaire au-dessus de l'adversaire.** Elle est possible « dès un atout » (l. 790-791). Exemple : partenaire 80♥, adversaire 90♠, le bot dit 100♥ dans 10 cas sur 16 avec un 7♥ sec et A-10 de carreau + As de trèfle.
- **Clefs décalées d'un As.**
  - Émission : le palier de prudence fait relancer de (As − 1) × 10.
  - Lecture : l'ouvreur lit les As comme relance/10 > fausses.
  - Exemple : ouvreur 120♥ avec 2 fausses cartes, partenaire 140♥ (trois As selon son barème) : l'ouvreur passe dans 10 cas sur 10.
- **Coinche.** Elle ne promet aucune tenue d'atout sur un contrat numérique. Exemple : 3 As + 3 dix sans atout coinchent 140♠ à 100 %, mais 120♠ à 2,5 %.
- **Surenchères sur l'adversaire.** 51 % sont faites sans le Valet, 27 % sans Valet ni 9 (n = 446). Elles ne perdent pas plus souvent, mais le partenaire ne peut plus les lire.

### C5. Les humains sont mal lus — les deux, **haute**

Lignes 1666-1689, `seatWeight` et `MISFIT = { bot: 0.0001, human: 0.15 }` :

- **Enchères d'un humain presque ignorées** (MON-1). Le partenaire humain ouvre 80♥ en respectant le système. Le bot lui prête le Valet de cœur dans 45 % des mondes, contre 66 % pour la même annonce faite par un bot (33 % sans aucune annonce).
  - Même effet contre un preneur humain : réussite estimée à 0,13 au lieu de 0,28. Le bot coinche alors à 100 % au lieu de 73 %.
- **Inversion** (MON-2). `bidFits(r, h) || misfit` garde les petites valeurs non nulles de `bidFits` : 0,07 (`BLUFF`) ou 0,1 (`SIM_FIT`).
  - Elles sont plus faibles que le 0,15 accordé à une main qui ne colle à rien.
  - Après un 80♥ humain, « V♥ 9♥ 7♥ + A♠ » pèse donc 0,1, et « aucun cœur » pèse 0,15.
- **Passes crues à la lettre** (MON-3). Les passes d'un humain sont lues aussi strictement que celles d'un bot : le plancher de 0,002 n'est jamais nul, donc la tolérance humaine ne s'applique pas.
  - Le modèle des passes a été appris sur 36 587 décisions de bots seulement.
- **Type de siège lu au moment de la décision** (MON-4). Si un humain quitte la table, ses enchères passées sont relues comme celles d'un bot, avec une tolérance de 0,0001 : les mondes deviennent sûrs mais faux.
- **Signaux d'un humain lus comme ceux d'un bot** (MON-7). Exemple : un 7♣ jeté sans l'As fait croire à 65 % que l'As♣ est chez lui.
- **La coinche n'est jamais relue** (COI-8). La surcoinche se calcule comme si l'adversaire n'avait pas coinché.

### C6. Barème d'ouverture : décisions au seuil sans repli — les deux, **moyenne à haute**

- **Le veto fait passer au lieu de redescendre** (OUV-1, l. 818-834). Si la simulation refuse le contrat du barème, le bot passe : il n'essaie ni un palier plus bas, ni une autre couleur, ni le 80 hors barème.
  - Exemple : `JH 9H 7H AS 10S KS AD 10D`, premier à parler, barème 160♥ : passe dans 10 donnes sur 30, alors que p(80♥) ≈ 1.
- **Valet sec en 4e** (OUV-4, l. 481). En 4e position après trois passes, l'ouverture légère part avec un Valet sec : 80♥ dans 17 cas sur 20 avec `JH AS 8S 7S AD 8D 7D 7C`. Le commentaire des lignes 815-817 dit pourtant que ce bluff a été supprimé.
- **Couleur choisie au montant, pas à la tenue** (OUV-3). Exemple : 100♥ avec 9-10-8-7 de cœur plutôt que 90♠ avec Valet-9-7 de pique.
- **160, voire capot, avec trois atouts** (OUV-6, l. 460-462). `fausses` ignore les atouts perdants. Un capot annoncé avec V-9-7 face à A-10-R d'atout adverse est inexplicable pour un partenaire.
- **80 hors barème au hasard** (OUV-5). La même main ouvre ou passe selon le tirage : 9 fois sur 16 pour `AH QH 8H 7H AS 8S 7D 8C`.
- **Générale à égalité** (ENC-6, l. 617-632). À probabilité égale, la Générale est préférée au capot de même valeur.
- **Sauts au-dessus de 120** (ENC-7). Escalades de 10 en 10 jusqu'à 150, avec changement de couleur en route : 18 donnes sur 200 ont au moins 6 enchères.

### C7. Hôte, rythme et hasard explicite — non humain, **moyenne**

- **Surcoinche au hasard** (COI-1, l. 947). `Math.random() < 0.8 * aggr` : la même main surcoinche dans 69 % à 100 % des cas selon la personnalité. Les deux bots du camp preneur tirent chacun au sort.
- **Personnalité inopérante** (HAS-3, OUV-7). `aggr` ne sert qu'à la surcoinche. Le commentaire (« relève les enchères plus tôt ») est faux.
- **Passe puis coinche** (COI-4, host.js 101-139). La coinche d'un bot défenseur suit son propre délai, indépendant de son tour de parole. Le défenseur qui parle juste après l'annonceur avait déjà « passé », une fraction de seconde avant, dans 47 de ses 51 coinches.
- **Coinche perdue ou trop tôt** (COI-5, HAS-6).
  - Perdue dans 4 % des cas quand les passes ferment les enchères avant le délai aléatoire.
  - Elle peut tomber avant que le partenaire humain ait pu surenchérir.
  - La fenêtre de 1,8 s laissée aux humains ne s'applique pas aux bots défenseurs.
- **Délai uniforme, indépendant de la difficulté** (HAS-4). 350 à 800 ms pour tout coup : une carte forcée (35 % des coups) attend autant qu'un coup réfléchi.
- **Bot repris en plein tour** (HAS-1). Le minuteur du bot n'est relancé que si `G.tour` change, et `devenirBot` ne le change pas. Le siège reste muet jusqu'à 20 s, puis `TIMEOUT` joue une carte au hasard. Vérifié sur `host.js` avec des minuteurs factices.
- **État public trop large** (HAS-7). `playerView` (game.js) renvoie `...G` : `personalities` et `bidMemo` partent chez chaque client. `seatView` les masque pourtant aux bots.
- **Commentaires périmés** (HAS-8). host.js : « résultat affiché 5 s » (4 s en réalité), « 0,6 s » (900 ms).

### Moins grave (non humain, réflexes)

- **Charge** (SUI-4).
  - Le réflexe refuse de charger au-dessus d'une carte plus faible du partenaire, même quand le pli est acquis (10♣ gardé sous la Dame du partenaire).
  - Il donne parfois un Roi devenu maître.
- **10 « menacé »** (SUI-5). Il est donné même dans la couleur appelée par le partenaire, dont l'As est derrière.
- **10 sec en défense** (ENT-7). Le réflexe peut entamer un 10 sec : le malus « sous l'As » rend le 10 sec plus attractif que l'As.
- **Gaspillages** (EMP-8). Marginaux : As ou 10 donné dans un pli perdu dans 1,1 % des cas, pli gagné par le partenaire coupé dans 4,3 % des cas.
- **Contrats élevés** (EMP-7). 54 % des contrats sont à 110 ou plus, médiane 110. Les taux de chute (27 %) et de capot (0,9 %) sont normaux.

## Ce qui va bien

- **Barème et soutien sans adversaire.** Ils sont déterministes et suivent le système documenté (20 sur 20 sur les mains franches).
- **Coinche dans les cas clairs.** Elle est stable (Valet-9 contre 120 ou 130 : 100 %), et aucune des 44 coinches réelles rejouées n'a changé. Contre un capot, seul un pli d'atout sûr compte.
- **Réflexes d'attaque et `topOfSequence`.**
  - Les réflexes d'attaque sont réalistes : atout maître d'abord, puis petit atout vers le partenaire qui a montré le Valet, avec un vrai décompte des atouts.
  - `topOfSequence` est lisible.
- **Mondes.**
  - Les contraintes dures sont justes et cohérentes avec `computeLegal`.
  - Le générateur ne tombe jamais à vide : 0 ensemble vide sur 1 344 décisions.
  - Entre bots, la calibration est bonne (0,35 prédit, 0,35 réel).
- **Fin de donne.** `exactEnd` la stabilise : 2 à 9 % d'instabilité aux plis 6 et 7.
- **Belote.** Elle est annoncée de façon humaine.

## Plan de correction proposé

Ordre suggéré : gain de lisibilité le plus fort pour le moins de code. Chaque étape doit passer par un duel `tests/coinche-ab.js`, pour connaître son coût en points.

**Le choix à faire.** Plusieurs écarts au réflexe ont été gardés parce qu'ils gagnaient en simulation, entre bots. Rendre les bots lisibles pour un humain coûtera probablement quelques dixièmes de point par donne. C'est une décision de produit : un bot un peu plus faible mais lisible est sans doute un meilleur partenaire pour un humain.

1. **Stabiliser le Monte-Carlo** (C1).
   - Graine dérivée de l'état public et de la main du bot : la même situation donne la même décision. Cela règle à lui seul la reproductibilité, y compris pour les enchères.
   - Ne quitter le réflexe que si le gain apparié dépasse environ 2 erreurs-types.
   - Supprimer le départage aux points de plis × 0,01, ou exiger une marge minimale.
2. **Budget en nombre de mondes, pas en millisecondes** (C3).
   - Plancher de 24 à 32 mondes avant de consulter l'horloge, chronomètre démarré après `mcWorlds`.
   - `minWorlds = CAPOT_WORLDS` pour la Générale, la coinche et la surcoinche.
   - Un `null` ne doit jamais changer de branche.
   - Ajouter un scénario « horloge lente » aux duels.
3. **Protéger les conventions** (C2).
   - Règle dure ou forte marge pour : la défense n'entame pas atout, le preneur tire atout avec Valet-9, la défense entame ses As, la couleur appelée ou annoncée revient.
   - Exclure des candidats du Monte-Carlo les défausses dont le signal lu serait faux (appel sans As, refus avec As ou 10).
   - Dans les mondes, faire parfois rejouer atout à la défense simulée quand le preneur se prépare une coupe.
4. **Un seul langage pour l'émission et la lecture** (C4).
   - Appel : seulement une petite carte volontaire, avant un pli donné, dans une couleur dont l'As n'est pas tombé.
   - Refus : Roi ou Dame uniquement. Retenir le dernier signal valable.
   - Trier la main avant toute sélection.
   - Annoncer le palier du barème s'il passe le veto.
   - Relance dans la couleur du partenaire seulement avec un honneur ou deux atouts.
   - Aligner émission et lecture des clefs.
   - Recalibrer `SIGNAL_MISFIT` sur la fréquence réelle.
5. **Mieux lire les humains** (C5).
   - `Math.max(fit, misfit)` au lieu de `fit || misfit`.
   - Tolérance graduée : au moins 2-3 atouts et un honneur, ±10 sur le montant.
   - Mélange `(1 − ε)·q + ε` pour les passes humaines.
   - Type de joueur enregistré dans `bidLog` au moment où il parle.
   - Étendre `tests/coinche-justesse.js` aux sièges humains.
6. **Barème** (C6).
   - Après un veto, redescendre les paliers, puis essayer les autres couleurs.
   - Au moins 2 ou 3 atouts pour l'ouverture légère en 4e.
   - Compter les atouts maîtres manquants comme perdants dans `fausses`.
   - Préférer le capot à la Générale de même valeur (`>=`).
7. **Hôte et rythme** (C7).
   - Surcoinche déterministe : supprimer `Math.random` et `aggr`, ou donner un vrai rôle à la personnalité sur les seuils d'enchère.
   - Coinche décidée dans le tour de parole du bot ; bots défenseurs alignés sur la fenêtre de coinche.
   - Délai court pour un coup forcé, plus long et asymétrique (log-normal) pour un coup difficile.
   - Relancer la décision quand un siège devient bot (clé de tour incluant le type du siège).
   - Filtrer `personalities` et `bidMemo` dans `playerView`.
   - Corriger les commentaires faux.
8. **Tests.**
   - Faire jouer aussi `botChooseCard`, graine et horloge fixées, dans les scénarios de `tests/coinche-strategies.test.js`.
   - Ajouter un test de reproductibilité : même état, plusieurs graines, même décision.

## Limites

- **Taille des échantillons.** Elle varie selon l'agent, et les pourcentages d'instabilité dépendent de la définition retenue (nombre de graines, positions retenues). Les ordres de grandeur concordent d'un agent à l'autre.
- **Appareil lent.** Il est simulé par une horloge accélérée, pas mesuré sur un téléphone.
- **Statistiques d'enchères empiriques.** Elles sont faites à 32 mondes, pas 96. Les références « club » (80/90 majoritaires, etc.) sont des attentes, pas des données.
- **Sources.** Les scripts et sorties des agents sont restés dans le dossier temporaire de la session d'audit. Ils ne sont pas versionnés.
