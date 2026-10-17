# Vague 2 : les bots vus par le joueur humain (lisibilité)

Octobre 2026, branche `claude/audit-bots-coinche-detail`, moteur `src/coinche/engine.js` au commit `b548853`. Audit en lecture seule : aucun fichier de `src/` modifié.

Question posée : **un humain peut-il lire son partenaire bot ?** Il le peut si trois choses sont vraies : il connaît les conventions du bot, le bot les applique, et l'interface montre ce qu'il faut pour les lire. Ce rapport mesure l'écart sur les trois points.

Étiquettes de preuve :

- **[exéc.]** vérifié en exécutant du code (partie Playwright, calcul sur donnes aléatoires).
- **[code]** lecture du code, non exécuté.
- **[v1]** repris du rapport de la vague 1 (`docs/audits/2026-10-bots-coinche.md`), non refait.

## En bref

1. **Aucune convention de bot n'est expliquée au joueur** (LIS-1). La page de règles, `REGLES_COINCHE.md` et le lobby parlent du jeu, jamais des bots. Le seul endroit où le système est écrit, ce sont les commentaires de `engine.js`.
2. **Les chiffres d'enchère sont des codes, pas des promesses de points** (LIS-2). Mesuré sur 400 000 mains : un bot qui ouvre **90 a toujours Valet + 9** (43 669 sur 43 669). Un bot qui ouvre **100 n'a jamais Valet + 9** (0 sur 31 564). Un humain qui lit 100 > 90 comme « plus fort » se trompe.
3. **La relance de soutien n'est pas « +10 par As »** (LIS-3). Elle dit surtout « Valet » et « longueur ». Un +10 ne contient pas plus d'As qu'une absence de relance.
4. **Les bots lisent un humain avec leur propre grammaire** (LIS-4) : un 90 ou un 110+ d'un humain est lu « j'ai le Valet ». **Sa première défausse 7/8/9 est lue comme un appel** (LIS-5), alors qu'il ne le sait pas.
5. **L'interface cache l'essentiel.**
   - Les enchères ne laissent qu'un mot par siège, et il disparaît une fois le jeu lancé (LIS-6).
   - Aucune carte tombée ni pli précédent n'est consultable, sauf le dernier pli (LIS-7).
   - Aucun signal d'appel ou de refus n'est affiché (LIS-5).
6. **Le rythme est confortable pour lire, mais uniforme** (LIS-11). Un bot joue en 0,39 à 0,79 s. Le bouton « Coincher » ignore sans prévenir les clics des 600 premières ms (LIS-9).

Ce qui est bien visible : contrat, preneur, coinche, surcoinche, multiplicateur, belote, décompte en direct, récapitulatif de donne (voir § 2).

## Méthode

- **Partie réelle** [exéc.]. Le site compilé est déjà dans le dépôt (`site/assets/js/coinche/`, git propre). Je l'ai servi par `python3 -m http.server`, sans `npm install`. Playwright 1.56 avec le Chromium de `/opt/pw-browsers` joue une donne solo : le joueur annonce 80♥ au premier tour, passe ensuite, puis joue la première carte légale.
  - Le journal horodaté vient de la zone `aria-live` (`#game-announce`) et d'observateurs DOM.
  - Fichiers : `00-lobby.png`, `01-encheres.png`, `02-jeu.png`, `03-dernier-pli.png`, `04-historique-donnes.png`, `log.json`, `pw.mjs` (dossier `scratchpad/audit/vague2/lisibilite/`, non versionné).
  - Échantillon : **une donne**, 66 événements horodatés. Les durées sont donc des ordres de grandeur, avec un joueur scripté qui répond en moins de 0,2 s. L'ordinateur de test n'est pas un téléphone.
  - Réserve : je n'ai pas reconstruit le bundle depuis `src/`. Le dépôt est propre, donc il est très probablement à jour, mais ce n'est pas vérifié.
- **Ce que veut dire une annonce** [exéc.] : copie de `engine.js` avec `openingBid`, `bestOpening`, `supportPoints` exportés (`engine-copy.js`, `measure.mjs`). 100 000 donnes aléatoires (graine fixe), soit 400 000 mains, ouverture en 1re position (`light = false`). Cela mesure le **barème seul**. Le veto de la simulation (`OPEN_VETO`) et les cas de compétition ne sont pas inclus. Le bot réel passe parfois à la place, mais quand il annonce un palier du barème, c'est bien cette main.

## 1. Conventions documentées contre conventions réelles

Pour la colonne « dit au joueur », j'ai cherché dans :

- `site/jeux/coinche/index.html` (panneau « La coinche, en clair », l. 60-146) ;
- `site/assets/js/coinche-rules.js` (ne fait qu'ouvrir et fermer le panneau) ;
- `src/coinche/client/hud.js`, `lobby.js`, `table-scene.js`, `session.js` (aucun texte d'aide sur les bots) ;
- `REGLES_COINCHE.md` (spécification serveur : mécanique, pas de convention de jeu des bots).

**Résultat : « rien » partout, sauf la belote et les délais.**

| # | Convention (source) | Ce que le bot fait réellement | Dit au joueur | Écart |
|---|---|---|---|---|
| 1 | **80** à l'ouverture (`engine.js:316-317`, 467-482) | [exéc.] Valet dans 74 % des cas, 9 dans 30 %, Valet + 9 dans 8 %, aucun des deux dans 4 %. Un As hors atout dans 71 % (n = 99 454 ouvertures). | « On va faire au moins 80 points » (index.html:83-84), 82 requis (l. 136). Rien sur la tenue. | Moyen. Le 80 est une tenue d'atout de longueur 3 en moyenne, pas une promesse de points. |
| 2 | **90 « fort »** (`engine.js:318-319`, 463) | [exéc.] **Toujours Valet + 9** (100 % de 43 669), longueur moyenne 3,3, un As à côté seulement dans 29 %. | Rien. | **Fort**. Le 90 est plus riche en honneurs que le 100 (ligne suivante). |
| 3 | **100** (`engine.js:320-321`, 465-466) | [exéc.] **Jamais Valet + 9** (0 % de 31 564). Valet dans 50 % des cas, 9 dans 49 %, ni l'un ni l'autre dans 1 %. 5 atouts ou plus dans 30 %, un As à côté dans 81 %. C'est une annonce de **longueur**. | Rien. | **Fort**. Lecture naturelle fausse : « 100 > 90, donc plus d'honneurs ». |
| 4 | **110 / 120 / 130** (`engine.js:322`, 463) | [exéc.] Toujours Valet + 9. Le chiffre baisse avec le nombre de fausses cartes (3, 2, 1). | Rien. | Moyen. Cohérent avec « plus haut = plus fort », mais pas avec le 100. |
| 5 | **160, capot** (`engine.js:462`, 468) | [exéc.] 50 mains sur 400 000 donnent 160, 35 donnent 250, 15 donnent 270. [v1 OUV-6] Avec trois atouts seulement, un 160 ou un capot est possible, car les atouts perdants ne comptent pas comme fausses. | « Capot : l'équipe fait les huit plis » (index.html:97-99). | Moyen. Annonce rare, mais « inexplicable » pour un partenaire (v1). |
| 6 | **Ouverture légère en 4e position** (`engine.js:476-481`) | [exéc.] Parmi les mains qui n'ont rien au barème, 31 % ouvrent 80. Valet 50 %, 9 50 %, Valet + 9 4 %, longueur moyenne 2,6. [v1 OUV-4] Valet sec : 80♥ dans 17 cas sur 20. | Rien. | Fort. Un 80 de 4e position n'est pas un 80 de 1re. |
| 7 | **Relance de soutien** « +10 par As » (`engine.js:325-329`, 503-520, 752-755) | [exéc., 60 000 mains aléatoires, partenaire à 80♥, avant plafonds et simulation] La relance vaut `supportPoints − 10`. Pour **+10** : Valet 37 %, 9 35 %, As à côté 0,7 en moyenne, soit **autant qu'avec aucune relance** (0,7). Pour **+20** : Valet 71 %, As 0,9. Pour **+30** : Valet 80 %, As 1,3. | Rien. | **Fort**. Une relance dit « Valet / 9 / longueur », pas « un As ». À partir de 100, chaque As compte +10 (l. 517). |
| 8 | **Clefs** : capot par les As (`engine.js:330-332`, 695-720) | [v1 ENC-5] Émission et lecture décalées d'un As. 120♥ puis 140♥ « trois As » : l'ouvreur passe 10 fois sur 10. | Rien. | Fort. Aucun humain ne peut deviner le bon décompte. |
| 9 | **Relance dans la couleur du partenaire** au-dessus de l'adversaire (`engine.js:790-791`) | [v1 ENC-3] Possible dès un atout. 100♥ avec un 7♥ sec dans 10 cas sur 16. | Rien. | Fort. Contredit l'idée « on soutient avec de la tenue ». |
| 10 | **Coinche** (`engine.js:340-342`, 883-921) | [v1 COI] Elle coince quand la simulation donne une réussite très inférieure à 160/(160+M). Elle ne promet aucune tenue d'atout : 3 As + 3 dix sans atout coinchent 140♠ à 100 %. | « Un adversaire peut coincher : les points doublent » (index.html:108-114). | Moyen. La mécanique est dite, le sens non. Voir LIS-8. |
| 11 | **Surcoinche** (`engine.js:947`) | [v1 COI-1] `Math.random() < 0.8 × aggr` : même main, 69 à 100 % selon la personnalité. | « 10 secondes pour surcoincher » (index.html:111-113). | Moyen. Une surcoinche de bot ne signifie rien de stable. |
| 12 | **Entame du preneur** : atout maître, puis petit atout vers le partenaire « qui a montré le Valet » (`engine.js:953-956`, 1143-1147, 1198-1210) | [v1 EMP-3] Avec Valet-9 et 3 atouts ou plus, il n'entame atout qu'au premier pli dans 33 % des cas. Le Monte-Carlo refuse le réflexe dans 39 % des cas. | Rien. | Fort. Le commentaire, écrit comme une règle, ne décrit pas le jeu. |
| 13 | **Entame de la défense** : « jamais d'atout », encaisser ses maîtres, répondre à l'appel (`engine.js:959-966`) | [v1 EMP-2/4] La défense entame atout dans 15 % des premières entames. Sur 90 entames avec un As hors atout, elle entame un As 30 fois (le réflexe 74). | Rien. | Fort. Même remarque. |
| 14 | **Appel** : petite carte jetée sous un As (`engine.js:967-971`, 1163-1172) | [v1 SUI-2] Émis seulement avec As et au moins deux cartes dans la couleur, une fois par donne. Le Monte-Carlo détruit 114 appels sur 195. [v1 SUI-1] **73 % des appels lus sont faux** (84 % avec le Monte-Carlo). | Rien. | **Fort**. Voir LIS-5. |
| 15 | **Refus** : R/D d'une couleur faible (`engine.js:970-971`) | [v1 SUI-8] Émis seulement avec R ou D. Lu aussi sur un Valet (`engine.js:1186`). | Rien. | Moyen. |
| 16 | **Charge** : donner un 10 sous l'As du partenaire (`engine.js:964-966`) | [v1 SUI-4/5] Pas de charge au-dessus d'une carte plus faible du partenaire, même pli acquis. 10 donné dans la couleur appelée. | Rien. | Moyen. |
| 17 | **Belote** (`REGLES_COINCHE.md` § 8) | [code] Annoncée automatiquement, pour les bots comme pour l'humain. | Dite (index.html:125-132), visible (bulle « Belote ! », bandeau, « +20 » dans le décompte : `table-scene.js:325-326`, `hud.js:217`). | **Aucun**. C'est l'exemple à suivre. |
| 18 | **Délai de 20 s**, carte au hasard à expiration (`engine.js:50-55`) | [code] Conforme. | Dit (index.html:141-148). | Aucun. Mais l'anneau-chrono n'existe qu'aux phases ENCHERES et JEU (LIS-8). |
| 19 | **Remplacement d'un joueur par un bot** (`REGLES_COINCHE.md:41`) | [code] La spec dit « ne pas remplacer un joueur pendant une partie ». Le site, lui, le fait. | « Une place quittée est reprise par l'ordinateur » (index.html:145-148) et bandeau (`hud.js:647-652`). | Faible. Spec et site se contredisent (LIS-12). |

Lecture d'ensemble : **le système d'enchères suit « Valet / 9 / fausses cartes », alors que le joueur lit des points**. Sans légende, le chiffre le plus parlant d'un tour d'enchères est le plus trompeur.

## 2. Ce que l'interface montre pendant la partie

### Tableau des informations

| Information | Visible ? | Code |
|---|---|---|
| Contrat, atout, preneur | **Oui** : barre du haut (« ♣ 110 / Bot Est prend ») et bulle près du preneur, pendant toute la donne. | `hud.js:191-200`, `table-scene.js:327-330` |
| Coinche, surcoinche | **Oui** : bulle rouge chez qui l'a dit, « · coinché » dans la barre, « ×2 / ×4 », vidéo plein écran (1,1 s / 1,7 s). | `table-scene.js:319-321`, `hud.js:26-29`, 196-197 |
| Belote, rebelote | **Oui** : bulle dorée chez le détenteur, bandeau, « +20 » dans le décompte, annonce lecteur d'écran. | `table-scene.js:325-326`, `hud.js:123-126`, 212-217 |
| Décompte en direct (points de plis) | **Oui** | `hud.js:212-217` |
| Récapitulatif de la donne (points, plis, belote, marqué) | **Oui** | `hud.js:339-376` |
| **Historique des enchères** (qui a dit quoi, passes) | **Non** (voir LIS-6) | `table-scene.js:317-334` |
| Historique des donnes (contrat, preneur, réussi/chuté) | Oui, dans « Historique ». Ce n'est pas un historique d'enchères. | `hud.js:237-256` |
| Dernier pli | **Oui, un seul**, tant qu'un pli a été joué | `hud.js:230`, 258-272 |
| Plis précédents, cartes tombées, atouts restants | **Non** | voir LIS-7 |
| Appel, refus (signal) | **Non** | voir LIS-5 |
| Ce que le bot a compris de mes annonces ou défausses | **Non** | LIS-4, LIS-5 |
| Chrono du tour (anneau doré autour de l'avatar) | Oui aux phases ENCHERES et JEU seulement | `table-scene.js:473-481` |
| Chrono de la surcoinche (10 s) | **Non** | `table-scene.js:476`, `hud.js:300-302` |
| Remplacement par un bot | Oui, bandeau 2,4 s | `hud.js:647-652`, 186 |

### LIS-6 — Historique des enchères absent (gravité **haute**)

- **Constat** [exéc. + code].
  - `bubbleText` ne garde que **le dernier mot de chaque siège** : `G.bidLog.filter(x => x.seat === seat).pop()` (`table-scene.js:332-333`).
  - Dès que les enchères sont closes, les bulles des sièges autres que le preneur sont supprimées (`if (!bidding) return null`, `table-scene.js:331`).
  - La capture `02-jeu.png` (pli 3/8) le montre : il ne reste que « 110♣ » près de Bot Est. Les passes et les annonces de Bot Nord (mon partenaire) et de Bot Ouest ont disparu.
  - Le bouton « Historique » (`hud.js:229`) n'ouvre que la liste des donnes jouées (`04-historique-donnes.png` : « #1 110♣ Bot Est chuté · 93 pts »). Le nom est trompeur : l'utilisateur qui cherche l'historique des enchères y va, ne le trouve pas.
  - Pendant les enchères, une relance du même joueur écrase son annonce précédente. Exemple : 80♥ puis 90♥ du partenaire, seul « 90♥ » reste visible.
  - La séquence complète existe : `G.bidLog` (`{seat, montant, atout}`) est dans l'état client. Elle n'est utilisée que pour le lecteur d'écran (`hud.js:108-114`).
- **Pourquoi c'est grave.** Toute la lecture des bots repose sur la séquence : qui a ouvert, qui a relancé de combien, qui a changé de couleur. Les bots la relisent exactement ainsi (`openingOf`, `raiseBy`, `engine.js:523-556`). Un humain qui ne revoit pas la séquence joue à l'aveugle sur un système dont il n'a pas la légende.
- **Proposition.** Voir P2.

### LIS-7 — Pas de cartes tombées, un seul pli consultable (gravité **moyenne**)

- **Constat** [exéc. + code].
  - Les cartes d'un pli complet partent vers l'avatar du gagnant et disparaissent (`table-scene.js:815-822`).
  - « Dernier pli » ne montre que le pli précédent (`hud.js:258-272`). Il disparaît à la fin du pli suivant. Le bouton n'existe qu'une fois un pli joué (`hud.js:230`).
  - Il n'y a ni tableau d'atouts restants, ni marque des couleurs coupées.
  - Les bots, eux, comptent parfaitement (`G.seen`, `G.void`). Pour un humain qui doit juger « le bot a-t-il bien joué ? », l'asymétrie rend le coup illisible : il ne peut pas vérifier si l'atout était épuisé.
  - Les données existent côté client : `G.playedBy[s]` (`engine.js:287`, utilisé `hud.js:121`).
- **Proposition.** Voir P5.

### LIS-5 — Signaux invisibles, et lus sur la première défausse d'un humain (gravité **haute**)

- **Constat** [code, lecture confirmée par la v1].
  - `readDiscardSignal` lit la **première défausse hors atout** de **tout siège**, humain compris : 7, 8 ou 9 = appel ; R, D ou V = refus ; un seul signal par donne (`engine.js:1178-1188`).
  - Le bot partenaire rejoue ensuite la couleur appelée dès qu'il a la main (`calledSuit`, `engine.js:1150-1160`). Le modèle de monde en tire aussi des cartes (SIGNAL_MISFIT, v1).
  - Un humain qui défausse « sa plus petite carte » parce qu'il n'a rien d'autre déclenche donc un **appel** sans le savoir. Dans la capture `02-jeu.png`, Bot Nord, mon partenaire, défausse la Dame de carreau sur un trèfle : le bot adverse la lit « refus ♦ ». Moi, je vois seulement une carte.
  - Rien dans l'état affiché ne traduit ces signaux. `G.appel` et `G.refus` sont pourtant dans l'état client (`engine.js:277-278`, `game.js:145-150`).
  - Côté émission : le bot n'appelle qu'avec As + deux cartes dans la couleur et une carte à 0 point (`engine.js:1163-1172`). Une défausse neutre de bot ne dit rien, alors qu'elle sera lue comme un appel (73 à 84 % de faux, v1).
- **Proposition.** Voir P3 (explication) et P4 (bulle d'appel).

### Ce qui est bien fait

Preneur, contrat, coinche, surcoinche, belote, décompte et récapitulatif sont visibles sans effort, y compris pour un lecteur d'écran (`hud.js:103-148` annonce chaque enchère et chaque carte). Les noms des bots sont explicites (« Bot Nord »). L'humain remplacé est signalé.

## 3. Rythme vu par l'humain

### Mesures [exéc., une donne, joueur scripté réactif en moins de 0,2 s]

| Événement | Durée observée | Code |
|---|---|---|
| Bot qui joue ou parle après un autre bot | **0,39 à 0,79 s**, médiane 0,61 s (n = 13, hors fenêtre de coinche) | `host.js:102` (350 + 450 × alea) |
| Bot qui entame après un pli ramassé | **1,30 à 1,73 s**, moyenne 1,50 s (n = 6) | `host.js:11` (900 ms) + 350-800 |
| Bot qui parle après une annonce quand l'humain est en défense | 2,55 s (n = 1) | `host.js:21`, 96-100 : 1,8 s + 0,35-0,8 |
| Premier bot qui répond à ma première annonce | 2,26 s (n = 1) | cause non isolée : animation de la donne ou hôte, à vérifier |
| Huit plis, de la première carte au récapitulatif | 22,6 s, soit 2,8 s par pli en bots seuls | |
| Récapitulatif avant la donne suivante | 6,5 s (4 s de `DURATION_MS.SCORE` plus pli final 2,5 s) | `engine.js:54`, `host.js:12` |

### Jugement

- **Lecture des cartes : confortable.** Les cartes restent au centre 0,9 s après le dernier pli et le dernier pli se rouvre en un clic. Trois bots qui jouent à la suite en 1,2 à 1,8 s, c'est rapide, mais la position suffit à savoir qui a joué quoi.
- **Naturel : trop uniforme** (v1 HAS-4). Un coup forcé met autant de temps qu'un coup difficile. Les bots ne « réfléchissent » jamais plus ni moins : le rythme ne dit rien du coup.
- **Coinche : fenêtre étroite et peu lisible** (LIS-9).

### LIS-9 — La fenêtre de coinche est plus courte qu'elle n'en a l'air (gravité **moyenne**)

- **Bouton ignoré sans signal.** `COINCHE_ARM_MS = 600` (`hud.js:24`) : un clic sur « Coincher » dans les 600 ms qui suivent l'apparition est **ignoré sans aucun retour** (`hud.js:473`). Le bouton n'est ni grisé ni désactivé (`hud.js:291-293`). Un humain rapide croit que le bouton ne marche pas.
- **Fenêtre utile réelle.** `COINCHE_WINDOW_MS = 1800` (`host.js:21`) retarde le **prochain bot** à parler, pas la coinche des autres bots. Après armement, il reste donc 1,2 s clicables.
- **Le défenseur humain a toujours son tour** : il parle avant la clôture des enchères (20 s). Donc la fenêtre ne protège que la coinche **hors tour**.
- **Les bots défenseurs coinchent sur un minuteur indépendant** : 0,5 à 1,7 s après l'annonce (`host.js:130`), même si c'est au tour de l'humain de parler. Un partenaire bot peut donc coincher avant que l'humain ait fini de lire le contrat. Le bouton « Coincher » disparaît alors sous ses yeux (v1 COI-4/5).
- **Proposition.** Voir P6.

### LIS-8 — Coinche et surcoinche : sens non dit, pas de chrono de surcoinche (gravité **moyenne**)

- **Rien ne dit quand ni pourquoi un bot coinche.** La bulle « Coinche » (`table-scene.js:321`) dit seulement qui l'a fait. Sa raison est une réussite simulée sous un seuil (`engine.js:883-921`), sans promesse d'atout (v1).
- **Surcoinche au hasard** (`engine.js:947`, v1 COI-1) : aucun humain ne peut en tirer de signal.
- **Le décompte de 10 s de la surcoinche n'est pas affiché.** L'anneau-chrono ne se dessine qu'en ENCHERES et JEU (`table-scene.js:476`). L'humain qui doit surcoincher voit « Vous êtes coinchés » et un bouton (`hud.js:300-302`), sans durée. À expiration, la partie démarre sans surcoinche (`REGLES_COINCHE.md` § 5).

## 4. Autres constats

### LIS-1 — Aucune convention de bot n'est expliquée (gravité **haute**)

- **Constat** [exéc. + code].
  - Le panneau « La coinche, en clair » (`index.html:60-146`) ne dit rien sur les bots, sinon ligne 145-148 (reprise d'un siège).
  - Le lobby annonce seulement « l'ordinateur complète » et « trois bots » (`index.html:189-190`, 218).
  - Le seul endroit qui décrit le système : les commentaires de `engine.js:312-350` et 951-973.
  - Un humain a trois choix : deviner, lire le code, ou ne pas lire son partenaire.
- **Proposition.** Voir P1, après correction des écarts qui rendraient le texte faux (LIS-10).

### LIS-2 — Les chiffres d'enchère sont des codes (gravité **haute**)

- **Constat** [exéc.]. Voir le tableau, lignes 1 à 6. Résumé mesuré sur 400 000 mains, barème seul :

  | Annonce | Valet | 9 | Valet + 9 | Ni l'un ni l'autre | 5 atouts ou plus | n |
  |---|---|---|---|---|---|---|
  | 80 | 74 % | 30 % | 8 % | 4 % | 1 % | 99 454 |
  | 90 | 100 % | 100 % | 100 % | 0 % | 0 % | 43 669 |
  | 100 | 50 % | 49 % | **0 %** | 1 % | 30 % | 31 564 |
  | 110 | 100 % | 100 % | 100 % | 0 % | 23 % | 17 035 |
  | 120 | 100 % | 100 % | 100 % | 0 % | 36 % | 5 959 |
  | 130 | 100 % | 100 % | 100 % | 0 % | 43 % | 1 115 |

  Les lignes « 80 en 4e position » (n = 124 201) : Valet 50 %, 9 50 %, Valet + 9 4 %.
- **Où le joueur est trompé.**
  - Les pastilles de montant n'affichent que des nombres (`hud.js:314-319`).
  - La page de règles parle de points : « on va faire au moins 100 points » (`index.html:83-84`).
  - La v1 ajoute que le palier 90 ou 100 est tiré au sort pour une même main (ENC-4, 70 % / 30 %).
- **Proposition.** Voir P1 et P3.

### LIS-3 — « +10 par As » est faux (gravité **haute**)

- **Constat** [exéc., 60 000 mains aléatoires, partenaire à 80♥, valeurs avant plafonds, simulation et compétition].
  - La relance de soutien vaut `partnerBid + supportPoints − 10` (`engine.js:752-755`).
  - `supportPoints` : Valet +20, 9 second +10, As à côté +10 chacun seulement si on a au moins deux cartes du partenaire à 80 (`engine.js:510-511`), puis +20 pour la belote.
  - Distribution observée :

    | Relance | Part des mains | Valet | 9 | As à côté (moyenne) | Longueur ♥ moyenne |
    |---|---|---|---|---|---|
    | +0 | 62 % | 5 % | 16 % | 0,7 | 1,5 |
    | +10 | 18 % | 37 % | 35 % | 0,7 | 2,6 |
    | +20 | 13 % | 71 % | 38 % | 0,9 | 2,8 |
    | +30 | 6 % | 80 % | 49 % | 1,3 | 3,0 |

  - Donc un +10 ne contient pas plus d'As qu'une absence de relance (0,7 dans les deux cas). La relance mesure **le Valet et la longueur d'atout**.
- **Où le joueur est trompé.** Aucun texte ne parle de relance. La convention « une relance de 10 = un As » est répandue en club.
- **Proposition.** Voir P1 et P3.

### LIS-4 — Les bots lisent les annonces d'un humain avec la grammaire des bots (gravité **haute**, [code])

- `partnerShowsJack` : si le partenaire a ouvert **90**, ou **110 et plus**, ou relancé de **20 et plus**, le bot suppose qu'il a le Valet et lui joue un **petit atout** (`engine.js:1143-1147`, 1198-1205). La fonction ne regarde pas le type de siège.
- `FAUSSES_PROMISES` (`engine.js:352`, 695-710) lit un 110, 120 ou 130 comme « Valet + 9 avec 3, 2 ou 1 fausses » pour décider du capot par les clefs.
- Un humain qui ouvre 110♥ avec Roi-Dame-10 cinquième (un 110 « de club ») reçoit donc un petit atout qu'il ne peut pas bien jouer. Rien ne l'avait prévenu et rien ne dit au bot que l'humain ne suit pas ce code.
- À rapprocher de la v1 : les annonces d'un humain sont aussi pondérées différemment dans les mondes (C5).
- **Proposition.** Voir P1 (dire que les bots lisent 90 et 110+ comme « j'ai le Valet »), et côté bot : réserver cette lecture aux partenaires bots, ou en faire un poids.

### LIS-10 — Les conventions écrites en commentaire ne sont pas celles jouées (gravité **moyenne**, [v1])

Documenter aujourd'hui le « jamais d'atout en entame » (`engine.js:959`) ou le « tirer les atouts » (`engine.js:953`) serait faux : la défense entame atout dans 15 % des cas, le preneur ne tire pas avec Valet-9 dans 67 % des cas (v1 EMP-3/4). **Corriger avant de documenter**, sinon le joueur apprend une règle que le bot enfreint et conclut que le bot est incohérent.

### LIS-11 — Rythme uniforme, sans réglage (gravité **basse**)

Voir § 3. Aucune option de vitesse, aucun indicateur « le bot réfléchit », même délai pour un coup forcé et un coup difficile (v1 HAS-4). Les commentaires de `host.js:11` (« 0,6 s ») et 6-8 sont périmés (v1 HAS-8).

### LIS-12 — Cohérence des documents (gravité **basse**)

- `REGLES_COINCHE.md:232` dit « le moteur n'est pas encore implémenté ». C'est périmé.
- `REGLES_COINCHE.md:9-10` demande un profil `scepi-online-v1` « présenté aux joueurs dans les règles du site » et des adaptations marquées comme « choix », pas comme règles de l'Amicale. La page de règles donne ces conventions comme des faits (80 = 82 points requis, `index.html:136-137` ; montée à l'atout, l. 118-119), sans le dire.
- `REGLES_COINCHE.md:41` interdit de remplacer un joueur en cours de partie, mais le site le fait (`index.html:145-148`, `hud.js:647-652`).
- `PRODUCT.md:21` promet « exactement les règles de l'Amicale ».

### LIS-13 — Bots opaques (gravité **basse**)

Tous les bots sont des « IA » ou « Bot Nord », sans indication de système, de niveau ou de style. Les « personnalités » (`G.personalities`) ne sont pas affichées, et d'ailleurs presque inopérantes (v1 HAS-3). Le joueur ne peut pas apprendre « ce bot fait ceci », puisque rien ne l'identifie d'une partie à l'autre et que son jeu varie à chaque graine (v1 C1).

## 5. Propositions, par ordre rapport effort / gain

Les efforts sont des estimations de lecture du code, pas des mesures.

| # | Proposition | Effort | Gain | Traite |
|---|---|---|---|---|
| **P1** | **Section « Conventions des bots »** dans le panneau Règles : un tableau court (une ligne par annonce 80 / 90 / 100 / 110-130 / relance / coinche / appel / refus), générée depuis une constante exportée par `engine.js` pour ne pas diverger. **À faire après** la correction des écarts de LIS-10 et la réalignement 90 / 100 (v1 ENC-4). | 1 à 2 h | Très élevé | LIS-1, 2, 3, 4, 10, 13 |
| **P2** | **Historique des enchères** : dans « Historique », deux onglets « Donnes » et « Enchères ». Ce dernier est un tableau 4 colonnes (Sud, Est, Nord, Ouest) avec une ligne par tour, passes comprises, lisible aussi pendant le jeu. Données : `G.bidLog`, déjà côté client. Renommer au besoin le bouton actuel (« Donnes »). | 2 h | Très élevé | LIS-6 |
| **P3** | **« Ce que veut dire cette annonce »** : toucher ou survoler une bulle ou une pastille de montant donne la traduction, par exemple « Bot Nord, 90♥ : Valet et 9 d'atout garantis ». Pendant son tour, l'humain voit aussi, sous la pastille, ce que son annonce signifiera pour un bot (« 100 : longueur, Valet ou 9 »). Une fonction `describeBid` partagée avec le moteur. | 3 à 4 h | Élevé | LIS-2, 3, 4 |
| **P4** | **Bulle « Appel ♠ » / « Refus ♦ »** à côté du siège dont la première défausse vient d'être lue (`G.appel` / `G.refus` sont déjà dans l'état). Pour une défausse de l'humain : bandeau « Bot Nord lit ton 8♠ comme un appel ». Pour un bot : texte distinct si la défausse est neutre. | 1 à 2 h | Élevé | LIS-5 |
| **P5** | **Cartes tombées** : panneau repliable de 4 lignes (atout en premier) avec les 32 cartes, grisées quand elles sont tombées, depuis `G.playedBy`. Option : « Dernier pli » devient « Plis joués » (liste des plis de la donne). | 2 h | Moyen à élevé | LIS-7 |
| **P6** | **Coinche lisible** : bouton grisé avec anneau pendant les 600 ms d'armement (`hud.js:24`, 291-293, 473) ; décompte visible de 10 s à la surcoinche ; aligner les bots défenseurs sur la fenêtre de 1,8 s (`host.js:130`). | 1 h | Moyen | LIS-8, 9 |
| **P7** | **Rythme** : délai court pour un coup forcé, plus long et variable pour un coup difficile (v1 C7). Réglage « Vitesse des bots » (lente / normale / vive) mémorisé dans `localStorage`. Option : un indicateur discret « réfléchit… » pendant la fenêtre de coinche. | 2 h | Moyen | LIS-11 |
| **P8** | **Cohérence des documents** : retirer « pas encore implémenté » de `REGLES_COINCHE.md`, marquer les adaptations V1 comme telles sur le site, trancher la règle de remplacement. | 30 min | Faible | LIS-12 |
| **P9** | **Identité des bots** : afficher un nom propre stable par place (« Bot Nord · prudent »), seulement si la personnalité devient réelle (v1 C7). | variable | Faible | LIS-13 |

**Dépendances.**

- P1 et P3 ne valent que si les bots tiennent leurs conventions : sinon, on documente un système qu'ils enfreignent (LIS-10).
- P2, P4, P5 et P6 ne demandent aucun changement de moteur. Ils lisent des champs de l'état déjà envoyés au client.
- Un lot P2 + P4 + P5 + P6 donne le plus de lisibilité pour le moins de code. P1 et P3 sont les plus utiles, mais passent par les corrections de la v1.

## Limites

- **Partie réelle** : une seule donne, joueur scripté. Les durées donnent un ordre de grandeur. Le rythme à plusieurs humains en ligne n'est pas testé.
- **Bundle compilé** : servi tel quel depuis `site/assets/js/coinche/`, pas reconstruit depuis `src/`.
- **Mesures de sens des annonces** : barème seul (`bestOpening`, `supportPoints`), sans veto de simulation, sans compétition, sur des mains aléatoires. Les fréquences d'un bot réel (qui ne passe pas toujours) diffèrent, mais le contenu d'une annonce donnée, lui, est celui mesuré.
- **LIS-4, LIS-8 (chrono de surcoinche), LIS-9 (silence du clic) et LIS-12** : lecture du code, non exécutées.
- **Délai de 2,26 s** après ma première annonce : cause non isolée (animation de la donne, ou hôte).
- Les pourcentages de la v1 (73 à 84 % de faux appels, 15 % d'entames atout, etc.) sont repris tels quels.
