# Audit des bots de coinche, vague 2 : zones restantes

Branche `claude/audit-bots-coinche-detail`, moteur `src/coinche/engine.js`. Audit en lecture seule : aucun fichier de `src/` modifié. Les mesures tournent sur une copie du dépôt (`scratchpad/audit/vague2/zones/`, non versionnée).

Réglages communs, sauf mention contraire : 96 mondes, `tuning.now = () => 0`, `Math.random` remplacé par `rng(graine)`, donnes tirées avec `rng`, vraies fonctions `bots.chooseCard` / `bots.heuristicCard` sur `seatView` (vue réelle d'un bot). Pour les zones 5 et 6, le vrai `host.js`, le vrai `game.js` (`devenirBot`) et le vrai `fiche.js` tournent avec une horloge virtuelle.

Niveaux de preuve : **E** = vérifié par exécution, **E~** = exécution partielle (scénario construit, peu de cas), **L** = lecture du code.

## En bref

1. **Hôte et robustesse en ligne (zone 5).**
   - Un siège repris par le bot en plein tour passe ou joue une carte au hasard.
   - Un siège repris après une annonce ne coinche jamais : 0 sur 23, contre 12 sur 23 pour un bot présent dès le début.
   - Une carte jouée d'office coûte en moyenne 10 points de donne.
2. **Fin de partie (zone 3).** Les bots ignorent le score, sauf pour coincher et surcoincher.
   - Près de la sortie, ils coinchent 100 % des contrats, y compris sans atout (15 %) ou sans Valet ni 9 (81 %).
   - Ce choix est exact pour gagner la partie, mais illisible pour un partenaire.
3. **Capot coinché (zone 6).** Un capot coinché n'est jamais surcoinché, sauf avec huit atouts. Dans le scénario mesuré, 20 capots sur 25 réussissent.
4. **Ce qui va bien.**
   - Générale réaliste : 40 réussites sur 40, et le partenaire ne prend jamais de pli.
   - Huit atouts : 15 sur 15.
   - Derniers plis : aucune fuite d'information (0 sur 60), aucun coup absurde, aucun optimisme mesuré.

## Constats

| ID | Zone | Catégorie | Gravité | Preuve |
|---|---|---|---|---|
| ZON-1 | 5 | non prédictible | moyenne | E |
| ZON-2 | 5 | non humain | moyenne | E |
| ZON-3 | 5, 6 | non humain, non prédictible | moyenne | E |
| ZON-4 | 6 | non prédictible | faible à moyenne | E~ |
| ZON-5 | 3 | non prédictible | faible | E |
| ZON-6 | 3 | non prédictible | faible | E |
| ZON-7 | 6 | non humain | moyenne | E~ |
| ZON-8 | 1 | non prédictible | faible | E~ |
| ZON-9 | 1 | non humain | faible à moyenne | E~, L |
| ZON-10 | 3 | non humain | faible (absence de fonction) | E, L |

### ZON-1. Siège repris par le bot pendant son propre tour : muet, puis passe ou carte au hasard

- **Catégorie / gravité** : non prédictible, moyenne. Complète HAS-1 (vague 1), qui était établi sur minuteurs factices.
- **Lignes** : `host.js:85` (le bot n'est programmé que si `G.tour !== tour`), `game.js:121-131` (`devenirBot` ne touche pas à `G.tour`), `engine.js:2253-2262` (`TIMEOUT`).
- **Preuve : E.** Le vrai `createHost`, le vrai `Coinche.moves.devenirBot.move`, le vrai moteur, horloge virtuelle.
- **Scénario A, jeu de la carte.** Siège 2 humain à jouer au pli 1, 2 cartes sur la table, tour 7.
  - `devenirBot(2)` est appelé 0,3 s après le début du tour. Le tour reste le même.
  - L'hôte ne programme rien. À t = 40,70 s (fin des 20 s du tour initial), `TIMEOUT` joue une carte tirée au hasard.
  - Le bot ne joue donc jamais sa carte réfléchie pour ce tour : il reste muet jusqu'à 20 s.
- **Scénario B, enchères.** Siège 1 humain à parler avec `JH 9H AH 10H KH AS 7D 8C`, repris par un bot.
  - À t = 20,00 s, `TIMEOUT` donne une **passe**. À t = 20,59 s, le siège 2 annonce 80♦ et prend le contrat.
  - Témoin : le même siège, bot dès le début, annonce 120♥ à t = 0,59 s.
- **Fréquence** : un événement rare (un humain qui part pendant son tour), mais visible. Le partenaire humain voit son bot « mort » 20 s, puis jouer au hasard.
- **Piste** : inclure le type du siège dans la clé de tour de `host.js`, par exemple `G.tour + ":" + G.seats[joueurActif].type`. Ou faire incrémenter `G.tour` par `devenirBot`.

### ZON-2. Siège repris après une annonce : ne coinche jamais

- **Catégorie / gravité** : non humain, moyenne. Nouveau.
- **Lignes** : `host.js:124-141` (les bots défenseurs n'envisagent la coinche que quand `c.id !== contractId`, c'est-à-dire à l'apparition du contrat).
- **Preuve : E.**
  - Protocole : 40 donnes, un bot annonce 100, le défenseur du siège 1 tient Valet + au moins 2 atouts. Le siège 1 est humain quand l'hôte voit le contrat, puis repris par un bot, puis fenêtre de 2,6 s.
  - Résultat : 0 coinche sur 23 contrats, contre 12 sur 23 (52 %) pour le témoin (bot dès le début, mêmes donnes, mêmes graines).
- **Cas voisin, surcoinche.** Preneur humain repris pendant la fenêtre de surcoinche : 0 sur 40, contre 1 sur 40 pour le témoin. L'effet est négligeable, car la surcoinche est rare.
- **Piste** : quand un siège passe d'humain à bot, relancer la logique « nouveau contrat » pour ce siège seul. Même correctif que ZON-1.

### ZON-3. Repli : carte au hasard sans marque « jouée d'office »

- **Catégorie / gravité** : non humain et non prédictible, moyenne.
- **Lignes** : `engine.js:2253-2262` (`TIMEOUT`), `fiche.js:20-25` (`deadline` : 20 s plus la pause de pli ; `timeout` : même action côté serveur), `REGLES_COINCHE.md` l. 23 et 194 (délai décidé par le bureau, la déconnexion conserve la place).
- **Qui est concerné** :
  - un humain qui expire, ou déconnecté (la place reste humaine) ;
  - un siège repris en plein tour (ZON-1) ;
  - un bot dont l'hôte est absent ou en veille.
- **Preuve : E.**
  - **Coût.**
    - Échantillon : 98 décisions réelles (14 donnes, plis 1 à 8, contrats 90).
    - Mesure : valeur du meilleur coup du Monte-Carlo (96 mondes, `exactEnd` sur les 3 derniers plis) moins la valeur moyenne d'une carte tirée uniformément parmi les légales.
    - Résultat : **10,2 points de donne par décision**. Je n'ai pas mesuré le coût d'une donne entière jouée au hasard.
  - **Signal.**
    - Une défausse d'office est enregistrée exactement comme une défausse voulue. Après un `JOUER 8♣` hors couleur du siège 2 humain, on obtient `G.appel[2] = {C: true}`, sans aucun drapeau.
    - Le partenaire bot rejoue donc ♣ en croyant à un appel (`readDiscardSignal`, `engine.js:1178` environ).
    - Je simule l'effet de `TIMEOUT` par un `JOUER` : les deux passent par la même fonction `act`.
- **Piste** : poser dans `G` un drapeau « d'office » (par exemple `G.derniereCarteAuto = seat`) et ignorer les signaux issus d'une carte d'office. Une passe d'office ne devrait pas être lue comme une main faible (`bidLog` : ajouter `auto: true`).

### ZON-4. Passes d'office lues comme des mains faibles

- **Catégorie / gravité** : non prédictible, faible à moyenne.
- **Preuve : L et E~.**
  - L : `TIMEOUT` pendant les enchères appelle `act(G.joueurActif, {type: "PASSER"})` (`engine.js:2255`). Rien ne le distingue d'une passe voulue.
  - E~ : la passe est consignée dans `bidLog` comme n'importe quelle passe. Elle sert ensuite à `bidFits` (MON-3 : les passes humaines sont crues à la lettre).
- **Piste** : même drapeau que ZON-3. Les mondes ne doivent pas apprendre quoi que ce soit d'une passe d'office.

### ZON-5. Fin de partie : coinche systématique près de la sortie, illisible pour le partenaire

- **Catégorie / gravité** : non prédictible, faible (la décision est juste pour gagner la partie).
- **Lignes** : `engine.js:891-896`.
  - Règle : si `pre + contractValue(contract) >= 1010`, coincher toujours. Le preneur sort de toute façon s'il réussit, donc la coinche est gratuite.
  - La clause `> def` est toujours vraie : code inutile.
- **Preuve : E.**
  - Protocole : 300 donnes dont 293 avec contrat, enchères de bots, 586 décisions de défenseur, même graine pour chaque état de score.
  - Résultats :
    - Scores 0-0 : **17 coinches sur 586 (2,9 %)**.
    - Preneurs à 940 ou 1000 : **586 sur 586** (100 %). Parmi les 1 138 coinches nouvelles : 172 (15 %) sans aucun atout, 918 (81 %) sans Valet ni 9 d'atout.
    - Preneurs à 900, défense à 900 : 370 sur 586 (63 %), car seuls les contrats de 110 et plus font sortir.
    - Défense à 940 : 0 sur 586. La règle `engine.js:894` interdit la coinche, ce qui est correct.
- **Jugement** : l'algorithme est exact. Coincher ne peut pas nuire à celui qui défend un camp qui sort s'il réussit. Mais un partenaire humain lit une coinche comme « j'ai l'atout ». Il en a la preuve fausse dans 15 % des cas près de la sortie.
- **Piste** : rien à corriger sur le fond. Si la lisibilité prime, limiter la règle aux mains qui ont une tenue, ou accepter la perte.

### ZON-6. Surcoinche systématique quand la défense est proche de la sortie

- **Catégorie / gravité** : non prédictible, faible.
- **Lignes** : `engine.js:934` (`def + 320 >= 1010` donne `true`, quelle que soit la main).
- **Preuve : E.** 120 contrats de 90 ou plus, coinchés par un défenseur, 240 décisions de preneur.

  | État de score | Surcoinches | Part |
  |---|---|---|
  | 0-0 | 115 / 240 | 48 % |
  | Défense à 700 | 240 / 240 | 100 % (dont 103, soit 43 %, sans Valet ni 9 d'atout) |
  | Preneurs à 800 | 84 / 240 | 35 % |

- **Jugement** : même logique que ZON-5. Une chute coinchée fait déjà sortir la défense, donc la surcoinche est gratuite. Mais un humain n'y voit pas une main.
- **Piste** : idem.

### ZON-7. Capot coinché jamais surcoinché

- **Catégorie / gravité** : non humain, moyenne. Rare.
- **Lignes** : `engine.js:938` (`if (contract.type !== "NUMERIQUE" && !isGenerale(contract)) return false;`). Exceptions : huit atouts (l. 936-937) et sortie de partie (l. 934).
- **Preuve : E~.**
  - Scénario : 25 donnes. Le preneur tient Valet, As, 10, Roi, Dame et un petit atout, plus 2 As. Un défenseur qui tient le 9 d'atout coinche le capot de 250.
  - Résultats : `wantsToSurcoinche` répond non **25 fois sur 25**. Les capots, joués par les bots des deux côtés, réussissent **20 fois sur 25 (80 %)**.
  - Espérance de la surcoinche : (+1 000 contre +500) à 80 %, contre (−640 contre −320) à 20 %, soit environ **+336 points par donne** que le bot s'interdit.
- **Piste** : laisser passer la surcoinche d'un capot quand la probabilité de réussite simulée dépasse un seuil (comme pour la Générale, `makeProbability ≥ 0,9`), ou dès Valet + As d'atout + 2 As.

### ZON-8. Défense contre un capot : l'As d'entame est parfois laissé

- **Catégorie / gravité** : non prédictible, faible.
- **Lignes** : `engine.js:1241` (le réflexe autorise l'As en capot) et `mcChooseCard`.
- **Preuve : E~.** 60 donnes avec capot à 250 (le preneur tient au moins 5 atouts avec le Valet).
  - Parmi 13 premières entames de défense avec un As hors atout, **5 (38 %) ne jouent pas un As**.
  - Pour un contrat de 110 sur les mêmes donnes, c'est 15 sur 18 (83 %). Mais là c'est voulu : le réflexe s'abstient s'il laisse le 10 dehors.
  - Exemple : `AH 10D 8H KS 8S 8D 7H QD` contre un capot à ♣ entame le 8♦ (réflexe : A♥). L'As ne prend le pli qu'au pli 5.
- **Effet sur le résultat : non mesurable.** Mêmes 80 donnes, mêmes graines, capot réussi :

  | Configuration | Capots réussis |
  |---|---|
  | Monte-Carlo partout | 27,5 % ± 5,0 |
  | Réflexes partout | 23,8 % ± 4,8 |
  | Attaque MC, défense réflexe | 26,3 % ± 4,9 |
  | Attaque réflexe, défense MC | 25,0 % ± 4,8 |

  L'écart entre Monte-Carlo et réflexe est de +3,7 ± 6,9 points : rien de significatif.
- **Piste** : si on veut une défense lisible, un joueur de club encaisse son As tôt contre un capot. Ajouter ce cas aux conventions protégées (C2).

### ZON-9. Générale et capot : atouts maîtres non encaissés quand les atouts adverses sont épuisés

- **Catégorie / gravité** : non humain, faible à moyenne. Preuve limitée.
- **Lignes** : `engine.js:1196` (la branche « tirer l'atout » exige `ctx.oppTrumps`), `engine.js:1232` (`defaultLead` ensuite).
- **Preuve : E~ et L.**
  - Donne construite : le preneur (siège 0, Générale 500♥) tient `JH 9H AH 10H KH QH 8H KD`. Son partenaire tient `AD 8D 7D 10S QS KS AS JS`.
  - Résultat : 10 échecs sur 10 en Monte-Carlo, 10 sur 10 en réflexes. Au pli 2, le preneur entame le Roi de carreau, qui tombe sous l'As de son partenaire, alors qu'il garde six atouts maîtres.
  - Ligne manuelle « tirer les atouts d'abord, le partenaire jette son As de carreau » : 4 réussites sur 10. Les 6 échecs viennent du 10♦ adverse qui bat le Roi final, donc la donne est jouable mais pas gagnante à coup sûr. Je ne prétends pas que le bot perd une donne gagnée.
  - Ce qui est certain, par la trace : le mécanisme (pas d'atout adverse, pas de maître de côté, donc `defaultLead`) joue le Roi avant d'avoir encaissé ses atouts. Le partenaire n'a alors pas eu le temps de se défausser de son As.
- **Piste** : en Générale (et en capot), quand la défense n'a plus d'atout, encaisser les atouts maîtres avant une carte de côté non maîtresse.

### ZON-10. Fin de partie : aucune prise en compte du score dans les enchères et le jeu de la carte

- **Catégorie / gravité** : non humain, faible. C'est une absence de fonction, pas un comportement absurde.
- **Lignes** : toutes les lectures de `G.scores` dans la logique de jeu :
  - `engine.js:763` (`nearExit`),
  - `engine.js:891-896` (coinche),
  - `engine.js:928-934` (surcoinche).

  Aucune autre. `donneValue` (`engine.js:1863-1873`) valorise la donne seule, jamais la partie.
- **Preuve : E.** 150 donnes, premier à parler, même graine, six états de score (0-0 ; preneurs à 940 ; défense à 940 ; défense à 1000 ; preneurs à 1000 ; 900-900). **0 différence** sur la décision d'enchère, donc ni ouverture plus mince quand une annonce de 80 fait gagner, ni contre plus ferme quand l'adversaire sort sur tout contrat.
- **Ce qu'un humain ferait** : à 940, ouvrir 80 avec une main plus faible, car tout contrat réussi gagne. Face à un camp à 940, disputer plus tôt. Ni « tout risquer » ni « ne plus enchérir » n'apparaît, car il n'y a simplement pas de réglage.
- **Piste** : ajouter une prime de sortie dans l'ouverture et la compétition (abaisser le seuil d'un palier quand `G.scores[team] + 80 >= 1010`). Le gain en force reste à mesurer en duel.

## Zones sans constat

### Zone 2 : huit atouts et belote

- **Fréquence** : une main de huit atouts se présente 4 fois sur 10 518 300 mains (environ 3,8 × 10⁻⁷). Le cas est pratiquement inexistant en jeu réel.
- **Enchères : E.** Avec `JH 9H AH 10H KH QH 8H 7H`, le bot annonce **520♥ (Générale belotée) 12 fois sur 12** dans trois contextes (premier à parler, partenaire à 80♠, adversaire à 120♠). Il n'annonce jamais 270.
- **Jeu : E.** 15 donnes de huit atouts à 270, atout et siège variés :
  - 15 capots réussis ;
  - `G.contract.huitAtouts` vrai 15 fois ;
  - au plus 2,2 s par donne pour les quatre sièges ;
  - les défenseurs ne coinchent jamais (0 sur 30).
- **Lecture (L)**. Le drapeau `contract.huitAtouts` est calculé sur la main initiale du preneur (`engine.js:866-882`), mais il fait partie de l'état public. `seatView` ne le masque pas, et les bots ne l'utilisent pas. Aucune triche côté bot, mais un humain en défense verrait « huit atouts » dans l'interface.
- **Belote : non conclu.** J'ai voulu comparer `worldBelote` à la réalité : sur 3 cas où le partenaire tient Roi et Dame, aucun des 288 mondes ne les lui prête. Mais le partenaire avait passé après l'annonce du preneur, et la passe est informative (un partenaire avec belote soutiendrait). Ce n'est donc pas un défaut établi.
- **Lecture** : la belote est annoncée automatiquement au premier Roi ou Dame du détenteur (`declareBeloteIfNeeded`, `engine.js:2128-2152`). Il n'y a ni timing à lire, ni risque d'oubli.

### Zone 4 : derniers plis (`exactEnd`, 3 plis)

- **Protocole.** 40 donnes entre bots, contrats 80 à 120 tirés au hasard. 241 décisions aux plis 6 et 7 (3 et 2 cartes en main).
  - Référence : les 300 mondes de `mcWorlds`, valeur moyenne de chaque carte légale par `exactEnd` (jusqu'au pli 8).
  - Le bot décide, lui, sur 96 mondes.
- **Fuite d'information : E, aucune.** On permute les cartes cachées entre les trois autres joueurs (et les mains initiales cachées) : `JSON.stringify(seatView(...))` reste identique 60 fois sur 60.
- **Écart au meilleur coup moyen : E.**

  | Cartes restantes | Décisions | Coup ≠ argmax | Regret moyen total |
  |---|---|---|---|
  | 3 | 120 | 12 (10 %) | 0,22 pt |
  | 2 | 121 | 7 (5,8 %) | 0,008 pt |
  | Ensemble | 241 | 19 (7,9 %) | 0,115 pt, maximum 12,1 pts, aucun au-dessus de 20 |

- **Coups dominés : E.**
  - Sur 241 décisions, 8 (3,3 %) où une autre carte vaut au moins autant dans les 300 mondes et strictement plus dans l'un.
  - Écart maximum de 0,6 point dans tous les cas, c'est-à-dire le départage aux points de plis × 0,01. Aucun coup absurde.
- **Optimisme : E.** L'estimation de la carte jouée à 3 plis de la fin, moins la valeur réellement obtenue en finissant la donne : **+0,18 ± 6,3 points** (n = 120). Aucun biais mesurable : la fin de donne à cartes ouvertes ne produit pas de coup « clairvoyant » détectable dans ce protocole.
- **Limites.**
  - Je n'ai pas isolé la « fusion de stratégies » (le bot suppose qu'il choisira bien plus tard dans chaque monde).
  - Je n'ai pas mesuré l'effet d'une défense simulée parfaite. Les deux restent des hypothèses de lecture (MCD-4).
  - L'écart-type de l'optimisme est trop grand pour voir moins de 12 points.

### Zone 1 : stabilité et conventions en capot et en Générale

- **Générale réaliste : E, impeccable.** 40 donnes, le preneur tient `JH 9H AH 10H` plus 2 atouts plus 2 As, Générale à 500 : **40 réussites sur 40**, et le partenaire n'a gagné aucun pli (ni évitable ni forcé).
- **Instabilité de la carte (4 autres graines sur la même position, position tirée une fois sur deux, 600 positions par mode) : E.**

  | Mode | Instable |
  |---|---|
  | Capot | 150 / 600 = 25,0 % |
  | Générale (filtre large) | 125 / 600 = 20,8 % |
  | Contrat de 110 | 189 / 600 = 31,5 % |

  Pas plus stable ni moins stable que le numérique : même ordre que C1.
- **Entame du preneur avec Valet + 9 + 3 atouts au pli 1 : E.**

  | Mode | Entame hors atout |
  |---|---|
  | Capot | 0 sur 10 |
  | Générale | 5 sur 60 (8 %) |
  | Contrat de 110 | 4 sur 9 (44 %, cohérent avec EMP-3) |

  En capot et en Générale, le bot tire l'atout de façon humaine.
- **Le partenaire qui rend la main (`engine.js:1213-1221`) : L.** Il ne s'est pas déclenché dans mes parties, donc je ne le juge pas.
- **Générale du partenaire (`ctx.genPartner`) : L et E.** Il ne passe jamais devant sans y être forcé. Dans les 40 Générales réalistes, 0 pli pris par lui.

### Zone 5 : ce qui fonctionne

- **Nouvel hôte (reprise d'hôte ou rechargement) : E.**
  - Protocole : 118 contrats posés par des bots, défenseurs bots. Un hôte neuf (`tour = null`, `contractId = null`) réévalue la coinche.
  - Résultat : deux hôtes avec des graines différentes coinchent exactement les mêmes contrats (4 sur 118 chacun, 0 divergence). Pas de seconde chance de coincher en pratique.
- **Reprise d'un siège par un humain (`takeSeat`)** : le minuteur du bot déjà programmé est neutralisé par `playable()` (`host.js:79`). Pas de double coup (L).
- **Rechargement d'une partie solo.** `host.update(G)` re-programme tout, y compris les 20 s complètes de `TIMEOUT` (`host.js:85-93`). La décision d'un bot rechargé n'est pas la même qu'avant le rechargement avec la probabilité de C1 (aucune graine liée à la situation). Je n'ai pas remesuré (L).

### Zone 6 : autres cas limites

- **Donne passée par les 4 : E.**
  - 7 donnes sur 300 (2,3 %) sont passées par quatre bots, avec les réglages par défaut.
  - `startNewDonne` fait tourner le donneur, ne touche pas aux scores et remet `bidMemo` à zéro (L).
  - Le taux faible va avec EMP-7 (54 % des contrats à 110 ou plus). Je n'ai pas de référence « club » mesurée.
- **TIMEOUT dans la fenêtre de surcoinche** : `lockContractAndStartPlay()`, donc pas de surcoinche (L).

## Scripts et sources

Tous dans `/tmp/claude-0/-home-user-scepi/84b3c854-c1ea-574e-b121-3115e8eff18b/scratchpad/audit/vague2/zones/` (non versionnés) :

| Fichier | Contenu |
|---|---|
| `lib.mjs` | Harnais : donne imposée, enchères forcées, jeu avec les bots |
| `e1.mjs`, `e1b.mjs`, `e1c.mjs`, `e1d.mjs` | Zone 1 : stabilité, MC contre réflexe, Générale réaliste, scénario ZON-9 |
| `e2.mjs`, `dbg.mjs` | Zone 2 : huit atouts, belote |
| `e3.mjs`, `e3b.mjs` | Zone 3 : score, coinche, surcoinche |
| `e4.mjs` | Zone 4 : fuite, regret, coups dominés, optimisme |
| `e5.mjs` | Zone 5 : hôte, `devenirBot`, nouvel hôte |
| `e6.mjs` | Zone 6 : signal d'office, coût du repli, capot coinché |

La copie de `engine.js` utilisée par ces scripts a deux ajouts d'instrumentation (un export `X`, une ligne `globalThis.__mcLast`) : aucun changement de logique.

## Limites

- **Échantillons** : de 25 à 586 décisions selon le test. Les écarts du tableau ZON-8 sont dans l'erreur-type.
- **Scénarios construits (E~)** : ZON-7 et ZON-9 reposent sur une donne ou une famille de donnes choisies, pas sur un tirage naturel. Elles prouvent le mécanisme, pas la fréquence.
- **Chronologie ZON-1 à ZON-3** : horloge virtuelle, pas de vrai réseau. Le serveur (`worker/tables.js`) n'a pas été exécuté, seulement `fiche.timeout` et `fiche.deadline`.
- **Rechargement solo** : lu, non rejoué.
