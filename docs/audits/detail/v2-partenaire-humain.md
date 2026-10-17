# Vague 2 — Les bots face à un partenaire et des adversaires humains

Octobre 2026, moteur `src/coinche/engine.js` au commit de l'audit. Aucun code de jeu modifié. Toutes les mesures sont **vérifiées par exécution**, sauf mention « lecture du code ».

La vague 1 n'a mesuré que des tables de 4 bots. Ici, un ou deux sièges sont joués par une politique « humaine » simulée. Le moteur les voit comme humains (`type: "human"`), ce qui active `MISFIT.human` (engine.js:1669, 1683).

## En bref

- **Les bots lisent mal la main d'un humain, même quand il suit le système.** Après une ouverture d'un joueur de club, le partenaire bot place le Valet annoncé chez lui dans 46 à 60 % de ses mondes. Pour la même annonce faite par un bot, c'est 77 à 84 %.
- **La cause est la tolérance `MISFIT.human = 0,15`, pas l'inversion `||`.**
  - Lire l'humain comme un bot remonte la justesse (0,60 → 0,79). Mais 11 à 23 % des placements deviennent alors « sûrs mais faux » (p < 0,05), contre 1 à 3 %.
  - `MISFIT.human` à 0,03 ou 0,05 donne un compromis : 0,66 à 0,70, avec 1 à 3 % de « sûrs mais faux ».
  - `Math.max(fit, misfit)` ne change presque rien à 0,15 (0,46 → 0,47). Il ne change rien du tout dès que `misfit` ≤ 0,07.
- **Ce n'est pas ce qui coûte des points.**
  - Remplacer un bot par le joueur de club simulé coûte −25 ± 15 pts par donne à son équipe. Par le débutant simulé : −65 ± 16. Ces pertes viennent des décisions de l'humain simulé.
  - Les réglages de lecture déplacent le résultat de moins que le bruit : de −8 à +7, ± 10 à 13 pts par donne.
- **Coinche.** Les bots coinchent 3 fois plus souvent un contrat pris par le joueur de club que le même siège tenu par un bot : 10 % contre 3 %. Ce n'est pas un effet de `MISFIT` : lu comme un bot, il est coinché 9 % du temps. Ces coinches réussissent 60 % du temps (9 sur 15).
- **Signaux.**
  - 65 % des « appels » que le moteur lit sur les défausses du joueur de club ne sont pas des appels.
  - Le partenaire bot rejoue un vrai appel humain à sa première main dans 53 % des cas (8 sur 15). Pour un appel de bot, c'est 63 % (12 sur 19).
  - Un faux appel du débutant est suivi aussi souvent qu'un faux appel de bot : 54 % contre 55 %. Le pli n'est alors gagné qu'une fois sur trois.
- **Pas d'anomalie propre au partenaire humain dans le jeu de la carte.** Le bot coupe le pli maître de son partenaire, charge, ou surenchérit dans une autre couleur aussi souvent avec un partenaire humain qu'avec un bot.

## Méthode

### Pilote de table

Scripts : `scratchpad/audit/vague2/humain/` (`lib.mjs`, `run.mjs`, `an.mjs`, `scen.mjs`).

- **Hôte réel.** Le vrai hôte (`createHost`, host.js) fait jouer les bots, avec les décisions `bots` du moteur testé. Les sièges humains restent `type: "human"` dans `G.seats` :
  - l'hôte ne joue pas pour eux ;
  - la fenêtre de coinche de 1,8 s s'applique (host.js:96-102) ;
  - `applyAction` ignore leur `memo` (engine.js:2245).
- **Le pilote joue l'humain comme un client.** Il envoie ses actions par `actOn`, sur la vue `seatView` du siège (sa main seule) :
  - enchère : 2,5 s après l'ouverture du tour ;
  - carte : 1,5 s, plus la pause de pli ;
  - coinche ou surcoinche : 0,2 s après le nouveau contrat, donc dans la fenêtre.
- **Reproductibilité.**
  - Donnes imposées par (graine, numéro de donne) : mêmes mains et même donneur dans toutes les conditions.
  - Hasard des bots re-semé à chaque donne (`rng(graine·1009 + donne)`), comme `coinche-ab.js` en mode `reseed`.
  - Horloge figée (`tuning.now = () => 0`).
  - Hasard de l'humain séparé, re-semé par donne et par siège.
- **Réglages.** 32 mondes Monte-Carlo (`tuning.mcSamples = 32`). Parties arrêtées après la 8e donne. 0 refus et 0 timeout sur toutes les parties.
- **Copies du moteur** (`engine-<variante>.mjs`). La seule différence entre elles est `MISFIT.human` et/ou `Math.max`. Un crochet après `mcWorlds` note les mondes imaginés et les compare aux vraies mains.

### Conditions

« T » est le siège étudié (0, ou 0 et 1). « P » est son partenaire, toujours un bot.

| Table | Sièges humains | Graines × 8 donnes |
|---|---|---|
| `bots` | aucun (T = 0 et 1 tenus par des bots) | 72 (495 donnes jouées) |
| `1club` | 0 = H-club, partenaire bot en 2 | 72 (orig, asbot, max05, m03) ; 36 (max) |
| `1deb` | 0 = H-débutant | 72 (orig, asbot, max05) ; 36 (m03) |
| `2club`, `2deb` | 0 et 1 humains, un par camp ; bots en 2 et 3 | 36 |

Variantes de lecture :

| Variante | Réglage |
|---|---|
| `orig` | moteur actuel : `MISFIT.human = 0,15`, `bidFits(r, h) \|\| misfit` |
| `asbot` | `MISFIT.human = 0,0001` : l'humain lu exactement comme un bot |
| `max` | `Math.max(bidFits(r, h), misfit)`, avec 0,15 |
| `max05` | `Math.max`, avec 0,05 ; identique à `\|\| 0,05`, voir plus bas |
| `m03` | `MISFIT.human = 0,03` |

« ± » = 2 erreurs-types.

## Les politiques humaines

Elles sont volontairement différentes des réflexes des bots : barème de club, pas le barème `openingBid`.

### H-club (déterministe)

**Ouverture** (`clubEval`, meilleure couleur, puis la plus longue) :

| Main | Annonce |
|---|---|
| Valet troisième + un As ; ou 9-As troisième ; ou Valet quatrième | 80, +10 par As au-delà du premier, +10 avec 5 atouts |
| Valet-9 troisième | 90, +10 par As à côté, +10 avec l'As d'atout, +10 avec 5 atouts, +10 avec la belote |
| Plafond | 140 |
| Valet-9-As cinquièmes et seulement des As à côté | capot (250) ; jamais sans certitude |

**Soutien** : +10 par As, +20 avec le Valet, +10 avec le 9 second, +20 avec la belote, −10 sans atout. Un seul soutien par donne, arrondi à la dizaine, plafond 160.

**Compétition** :

- soutien de la couleur du partenaire au minimum, si le soutien le permet ;
- sinon intervention au minimum (+10) dans sa couleur, si `clubEval` ≥ contrat + 10 ;
- une seule annonce propre par donne.

**Coinche** : compte des levées de défense.

| Élément | Levées |
|---|---|
| As à côté | 1 |
| As-10 à côté | +0,5 |
| Valet d'atout | 1 |
| 9 d'atout second | 0,5, ou 1 avec le Valet |
| As d'atout troisième | +0,5 |
| 4 atouts | +0,5 |
| le partenaire a annoncé | +0,5 |

- Seuil : 4,5 levées jusqu'à 90, 3,5 jusqu'à 110, 3 jusqu'à 130, 2,5 au-delà.
- Il faut le Valet ou le 9 d'atout, sauf à 140 et plus.
- Contre un capot : Valet d'atout, ou 9 second.

**Surcoinche** : seulement le preneur, si sa main vaut contrat + 30.

**Jeu de la carte** :

- **Entame en attaque.**
  - Atout maître s'il en reste dehors.
  - Le preneur rejoue petit atout s'il en a au moins 2.
  - Puis les cartes maîtresses sûres (aucun adversaire connu sans la couleur).
  - Puis la couleur appelée par le partenaire.
- **Entame en défense.**
  - La couleur appelée par le partenaire (la maîtresse si on l'a, sinon la plus petite).
  - Sinon un As, dans la plus longue couleur.
  - Sinon la couleur annoncée par le partenaire.
  - Sinon la plus petite carte de la plus longue couleur, sans entamer sous un 10 sec ou second.
  - Jamais atout, sauf s'il ne reste que de l'atout.
- **Partenaire maître.**
  - Charger (carte la plus chère) si le pli est sûr, sinon jouer petit.
  - Ne jamais le couper si on peut défausser.
  - Sur atout, le plus petit atout permis.
- **Adversaire maître.**
  - En second, prendre seulement avec une carte maîtresse.
  - Sinon prendre au plus juste (plus petite carte gagnante).
  - Sinon jouer petit.
- **Défausse.**
  - Premier signal : appel (petite carte sous l'As) ou, à défaut, refus (Roi ou Dame d'une couleur sans l'As).
  - Ensuite, plus petite carte non maîtresse.

### H-débutant (faiblement bruité)

- **Ouverture.** Dès 3 cartes avec un honneur (Valet, 9 ou As), ou 4 cartes avec un honneur ou le 10. La plus longue couleur, 85 % du temps. Montant 80, 90 ou 100 au hasard, +10 avec Valet-9.
- **Soutien.** Une fois, +10 par As, 60 % du temps ; le Valet et le 9 sont ignorés.
- **Intervention.** Avec 4 cartes, une fois sur deux, au minimum, jusqu'à 120.
- **Coinche.** As à côté + Valet d'atout ≥ 3, sur un contrat ≥ 100, 70 % du temps. Jamais de surcoinche.
- **Jeu.**
  - 10 % de coups au hasard.
  - Sinon : entame de sa plus forte carte (hors atout en défense).
  - Prendre avec sa plus forte carte quand il peut prendre et que le partenaire n'est pas maître.
  - Sinon sa plus faible carte. Aucun signal voulu : ses défausses de 7 ou 8 deviennent de faux appels.

H-prudent n'a pas été construit.

Enchères observées (`1club:orig`, 72 graines) :

- 538 passes ;
- 80 : 65, 90 : 57, 100 : 50, 110 : 33, 120 : 30, 130 : 9, 140 : 8, 150 : 3 ;
- 2 coinches.

## 1. Justesse des mondes sur la main de l'humain

### 1a. Ouverture isolée (scénario, 48 mondes)

`scen.mjs`. 400 donnes où H-club ouvre en premier (300 pour H-débutant). On mesure la part des mondes qui placent le Valet de la couleur annoncée chez T :

- côté adversaire (siège 1) : juste après l'annonce ;
- côté partenaire (siège 2) : après la passe du siège 1.

Même graine de mondes pour toutes les variantes. La ligne « bot » est la même annonce sur la même main, le siège étant déclaré bot (identique à `asbot`).

| Lecteur : partenaire | p(V chez T), T a le V | p(V chez T), T ne l'a pas | p(9 chez T), T a le 9 |
|---|---|---|---|
| H-club, `orig` (actuel) | 0,46 (n = 311) | 0,29 (89) | 0,40 |
| H-club, `max` | 0,47 | 0,29 | 0,41 |
| H-club, 0,05 (`m05` = `max05`) | 0,58 | 0,36 | 0,49 |
| H-club, 0,03 (`m03` = `max03`) | 0,63 | 0,39 | 0,53 |
| H-club, lu comme un bot | 0,77 | 0,40 | 0,70 |
| H-débutant, `orig` | 0,44 (n = 144) | 0,27 (156) | 0,40 |
| H-débutant, 0,05 | 0,56 | 0,35 | 0,48 |
| H-débutant, 0,03 | 0,60 | 0,35 | 0,52 |
| H-débutant, lu comme un bot | 0,75 | 0,43 | 0,68 |

**Calibration.**

- H-club a le Valet dans 78 % de ses ouvertures (311 sur 400). Probabilité moyenne que lui prête le partenaire :
  - `orig` : 0,42 ;
  - 0,05 : 0,53 ;
  - 0,03 : 0,58 ;
  - lu comme un bot : 0,69.
- H-débutant a le Valet dans 48 % de ses ouvertures (144 sur 300). Probabilité moyenne prêtée :
  - `orig` : 0,35 ;
  - 0,05 : 0,45 ;
  - 0,03 : 0,47 ;
  - lu comme un bot : 0,58.

Lecture : 0,15 sous-estime toujours le Valet, même chez le débutant. Lire l'humain comme un bot surestime le débutant. 0,03 à 0,05 est le seul réglage à peu près juste pour les deux profils.

**Par conformité au barème des bots** (H-club, partenaire, T tient le Valet) :

| Ouverture | `orig` | lu comme un bot | n |
|---|---|---|---|
| Conforme au barème (même montant et même couleur que `openingBid`) | 0,49 | 0,84 | 185 |
| Sous le barème | 0,44 | 0,70 | 68 |
| Au-dessus du barème, ou autre couleur | 0,39 | 0,65 | 58 |

Même une ouverture **conforme au système affiché** n'obtient que 0,49 de son Valet chez un partenaire bot, quand elle est faite par un humain.

**Inversion MON-2.** Elle existe dans le code, mais pèse peu en pratique. `Math.max` ne change que les mains où 0 < `bidFits` < `misfit`, c'est-à-dire `BLUFF` (0,07) et `SIM_FIT` (0,1). Or les ouvertures de H-club sont presque toutes à 1 ou à 0 :

- `max` contre `orig` : 0,47 contre 0,46 ;
- dès que `misfit` ≤ 0,07, `Math.max(fit, misfit)` est égal à `fit || misfit` : runs identiques, vérifié pour 0,05 et 0,03.

Exemples concrets (partenaire, T tient le Valet, `orig` contre la même annonce par un bot) :

- `10H 9D 10D JD 10C KC JS KS` ouvre **90♦**, exactement le barème du bot (Valet-9-10 troisième) : V♦ chez T dans 27 % des mondes, contre 100 % pour un bot.
- `9H JH AH 7D 7C 8S KS AS` ouvre 110♥ (club : Valet-9-As + un As). Le barème du bot dit 90 : V♥ chez T dans 23 % des mondes, contre 100 %.
- `AH JD AD QC 9S JS QS KS` ouvre 120♠, conforme au barème : 31 % contre 100 %.

### 1b. En partie (32 mondes, toutes les décisions de bots)

p = part moyenne des mondes qui placent la carte chez son vrai détenteur. n = cartes × décisions. « faux » = p < 0,05.

**Une table de 1 H-club** (72 graines ; `max`, 36 graines) :

| Indicateur | bot (`bots`) | H-club `orig` | `max` | `max05` | `m03` | `asbot` |
|---|---|---|---|---|---|---|
| Partenaire, enchères : V annoncé chez T | 0,84 (491) | 0,60 (170) | 0,56 | 0,66 | 0,70 | 0,79 |
| Partenaire, enchères : V annoncé ailleurs | 0,20, faux 9 % | 0,31, faux 0 % | 0,33 | 0,25 | 0,24, faux 3 % | 0,22, **faux 14 %** |
| Partenaire, enchères : 9 annoncé chez T | 0,75 | 0,50 | 0,49 | 0,56 | 0,60 | 0,72 |
| Partenaire, plis 1-4 : V/9 annoncés chez T | 0,82 | 0,54 | 0,53 | 0,62 | 0,63 | 0,73 |
| Partenaire, jeu : V/9 d'atout chez T | 0,75 | 0,51 | 0,49 | 0,55 | 0,55 | 0,64 |
| Partenaire, jeu : As chez T | 0,46 | 0,43 | 0,41 | 0,44 | 0,45 | 0,49 |
| Adversaire, enchères : V annoncé chez T | 0,80 | 0,52 | 0,48 | 0,59 | 0,62 | 0,72 |
| Adversaire, enchères : V annoncé ailleurs | 0,52, faux 4 % | 0,59, faux 2 % | 0,53 | 0,58, faux 1 % | 0,58, faux 2 % | 0,52, **faux 12 %** |
| Adversaire, jeu : V/9 d'atout chez T | 0,72 | 0,52 | 0,52 | 0,53 | 0,53 | 0,58 |
| Toutes les cartes de T, plis 1-4 (partenaire) | 0,43 | 0,39 | 0,39 | 0,40 | 0,40 | 0,41 |

**Une table de 1 H-débutant** :

| Indicateur | bot | `orig` | `max05` | `m03` (36 graines) | `asbot` |
|---|---|---|---|---|---|
| Partenaire, enchères : V annoncé chez T | 0,84 | 0,54 | 0,62 | 0,64 | 0,73 |
| Partenaire, enchères : V annoncé ailleurs | 0,20 | 0,27, faux 0 % | 0,25, faux 2 % | 0,26, faux 3 % | 0,19, **faux 23 %** |
| Partenaire, jeu : V/9 d'atout chez T | 0,75 | 0,39 | 0,46 | 0,50 | 0,55, faux 7 % |
| Adversaire, enchères : 9 annoncé ailleurs | 0,44 | 0,40, faux 1 % | 0,38 | 0,35 | 0,34, **faux 17 %** |

**Deux humains, un par camp** (36 graines ; T = 0 et 1) :

| Indicateur | bot | 2 H-club `orig` | `max05` | `asbot` | 2 H-débutants |
|---|---|---|---|---|---|
| Partenaire, enchères : V annoncé chez T | 0,84 | 0,53 | 0,63 | 0,80 | 0,46 |
| Partenaire, jeu : V/9 d'atout chez T | 0,75 | 0,49 | 0,54 | 0,64 | 0,40 |
| Adversaire, enchères : V annoncé chez T | 0,80 | 0,48 | 0,59 | 0,77 | 0,49 |

Constats :

- **L'écart humain/bot est de 20 à 30 points** de p sur les cartes qui font le contrat : Valet et 9 annoncés, Valet et 9 d'atout. Il vaut pour le partenaire comme pour les adversaires, et persiste en jeu.
- **Les As ne sont pas concernés.** L'écart y est de 0 à 3 points : rien ne les annonce.
- **Le moyen global masque le problème.** Sur toutes les cartes de T, on passe de 0,43 à 0,39 seulement.
- **Lire l'humain comme un bot ne règle pas tout.** On récupère l'essentiel de la justesse, mais 12 à 23 % des placements deviennent « sûrs mais faux ». L'humain n'a pas annoncé selon le barème des bots, et ces mains sont exclues.
- **0,05 et 0,03 récupèrent 6 à 10 points**, sans « sûr mais faux » (≤ 3 %).

## 2. Coinches

Contrats sur les mêmes donnes. « Gagnées » = le contrat coinché chute.

| Contrat | bot (`bots`) | H-club `orig` | H-club `asbot` | H-club `max05` | H-club `m03` |
|---|---|---|---|---|---|
| Pris par T : nombre, réussis | 150, 85 % | 152, 80 % | 128, 79 % | 136, 77 % | 133, 80 % |
| Pris par T : coinchés par un bot | **3 % (5/150)** | **10 % (15/152)** | 9 % (11/128) | 9 % (12/136) | 8 % (11/133) |
| … coinches gagnées | 2/5 | 9/15 (60 %) | 5/11 | 6/12 | 8/11 |
| Pris par l'adversaire de T : coinchés par P (bot), après une annonce de T | 6 % (5/85), 4 gagnées | 3 % (2/60), 2 gagnées | 3 % (2/80) | 1 % (1/74) | 5 % (4/77), 1 gagnée |

| Contrat | H-débutant `orig` | `asbot` | `max05` | `m03` (36 graines) |
|---|---|---|---|---|
| Pris par T : nombre, réussis | 160, 50 % | 130, 48 % | 146, 53 % | 78, 50 % |
| Pris par T : coinchés par un bot | **29 % (47/160)** | 15 % (20/130) | 24 % (35/146) | 24 % (19/78) |
| … coinches gagnées | 81 % | 85 % | 80 % | 89 % |

Deux humains, contrats pris par T = 1 : coinchés 4 % (H-club, 3 sur 78) et 21 % (H-débutant, 15 sur 70, 12 gagnées). Pour un bot : 3 %.

Constats :

- **Contre H-club, les bots coinchent 3 fois plus que contre un bot au même siège.** Ces coinches ne gagnent que 60 % du temps : 6 contrats coinchés réussis en 72 graines, soit des coinches coûteuses.
  - Ce n'est **pas** un effet de `MISFIT` : lu comme un bot, H-club est coinché aussi souvent (9 %).
  - La cause probable est que H-club annonce autrement que le barème. Il prend plus souvent à 80-90 avec Valet + As ou 9-As, ce qui donne des contrats plus fragiles (80 % réussis contre 85 %). Le modèle de l'adversaire relit l'annonce avec le barème des bots (`baremeFits`), qui ne connaît pas ces mains.
- **Contre H-débutant, les coinches sont justifiées.** 29 % de ses contrats sont coinchés, avec 81 % de réussite.
  - La tolérance 0,15 aide ici : lu comme un bot, il n'est coinché que 15 % du temps, et ses contrats chutent quand même à 52 %.
  - 0,05 garde l'essentiel (24 %, 80 % gagnées).
- **Le constat C5 de la vague 1 se dilue en partie réelle.** C5 annonçait une coinche à 100 % au lieu de 73 % sur une situation construite. Ici, contre H-club, `orig` et `asbot` coinchent au même taux (10 % et 9 %).
- **Coinche « à travers ».** Le partenaire bot coinche rarement un adversaire qui a surenchéri sur l'humain : 1 à 5 %, 2 sur 2 gagnées en `orig`. Ce n'est pas plus que dans une table de bots (6 %). Aucun cas pathologique.

## 3. Réponse du bot aux signaux de l'humain

Signal = premier appel lu par `readDiscardSignal` sur une défausse de T (engine.js:1178-1188). Réponse = première entame de P après ce signal, quand P a la couleur.

| Condition | Appels lus : vrais / faux / As tombé | P rejoue la couleur : vrai appel | P rejoue : faux appel | Pli gagné après la réponse : vrai / faux |
|---|---|---|---|---|
| bots | 58 / 138 / 191 | 63 % (12/19) | 55 % (24/44) | 75 % / 33 % |
| 1 H-club `orig` | 38 / 22 / 50 | 53 % (8/15) | 44 % (4/9) | 5/8 / 1/4 |
| 1 H-club, cumul des 4 variantes à 72 graines | — | 44 % (28/64) | 57 % (20/35) | — |
| 2 H-club `orig` | 51 / 21 / 46 | 41 % (7/17) | 67 % (6/9) | — |
| 1 H-débutant `orig` | 28 / **119** / 134 | 25 % (2/8) | **54 % (27/50)** | 2/2 / **33 % (9/27)** |
| 2 H-débutants | 32 / 132 / 139 | 56 % (5/9) | 50 % (32/64) | — / 47 % |

Constats :

- **65 % des « appels » lus chez H-club ne sont pas des appels** : 72 sur 110. H-club n'appelle que sous l'As, à sa première défausse. Mais toute défausse ultérieure de 7, 8 ou 9 est lue comme un appel si le premier signal n'a pas été lu. C'est le cas d'une charge au 10, ou d'une défausse dans une couleur dont l'As est tombé. C4 (vague 1) vaut aussi pour un humain discipliné.
- **Un vrai appel humain est rejoué une fois sur deux** (44 à 53 %, n = 15 à 64). Pour un appel de bot, c'est 63 % (19 cas). L'écart n'est pas significatif à cette taille. Mais le partenaire humain voit son appel ignoré une fois sur deux.
  - Exemple : T appelle ♠ (As♠ en main), en défense contre 80♥. P tient `9D QD 10C JC 9S 10S` et entame le 9♦.
  - Exemple : T appelle ♥ (As♥ en main), P preneur à 100♦ avec `10H KH 8D KD AD QC`. P tire atout (K♦) : légitime pour un preneur.
- **Un faux appel du débutant trompe le bot autant qu'un faux appel de bot** : 54 % contre 55 %. Le pli est alors gagné dans 33 % des cas, contre 63 à 100 % après un vrai appel. `SIGNAL_MISFIT` = 0,3 (engine.js:1678) ne distingue pas l'humain du bot.

## 4. Résultat de l'équipe humain + bot (duplicate)

Écart apparié par donne. Net = points de l'équipe de T moins ceux de l'autre équipe. Même donne, même donneur ; donne passée = 0. « Identiques » = part des donnes au résultat identique.

| Comparaison | Écart (pts par donne) | n | Identiques |
|---|---|---|---|
| H-club `orig` − bot au même siège | **−25,4 ± 14,5** | 501 | 37 % |
| H-club lu comme un bot − bot | −31,8 ± 14,5 | 502 | 39 % |
| H-club `orig` − H-club lu comme un bot | +6,0 ± 11,2 | 499 | 76 % |
| H-club `max` − `orig` (36 graines) | +1,4 ± 13,0 | 252 | 79 % |
| H-club `max05` − `orig` | −4,8 ± 10,5 | 500 | 78 % |
| H-club `m03` − `orig` | −8,0 ± 10,0 | 499 | 80 % |
| H-débutant `orig` − bot | **−65,0 ± 16,4** | 496 | 30 % |
| H-débutant `orig` − lu comme un bot | −5,5 ± 12,3 | 494 | 71 % |
| H-débutant `max05` − `orig` | +6,9 ± 11,3 | 496 | 79 % |
| H-débutant `m03` − `orig` (36 graines) | −0,6 ± 16,0 | 247 | 80 % |
| 2 H-club `orig` − bots (équipe 0) | −9,0 ± 19,6 | 252 | 26 % |
| 2 H-club `max05` − `orig` | +0,6 ± 12,7 | 252 | 84 % |
| 2 H-club lus comme bots − `orig` | +1,5 ± 13,0 | 252 | 75 % |

Constats :

- **Remplacer un bot par un humain simulé coûte cher** : 25 pts par donne pour le joueur de club, 65 pour le débutant. Cette perte vient surtout des décisions de l'humain simulé (enchères, coinches subies, jeu), pas de la lecture des bots.
- **La lecture de l'humain par les bots ne bouge pas le résultat de façon mesurable.**
  - `orig`, `max`, 0,05, 0,03, ou lu comme un bot : tous les écarts sont dans ± 10 à 13 pts par donne.
  - Borne prudente : une meilleure lecture vaut moins d'environ 10 pts par donne pour l'équipe.
- **Réserve.** Une variante change aussi la lecture des deux adversaires bots. L'écart mesuré est donc gain du partenaire moins gain des adversaires. Les séparer demanderait un `MISFIT` dépendant du lecteur (non testé).

## 5. Le bot joue-t-il contre son partenaire humain ?

Compteurs sur P, le bot partenaire de T. Mêmes donnes. « Opportunités » entre parenthèses.

| Condition | Coupe le pli maître de T alors qu'il pouvait défausser | … sur un pli sûr (P dernier) | Charge (P dernier, T maître, P a une carte de 10 ou plus) | Relance T / annonce une autre couleur sur T (par tour de parole) |
|---|---|---|---|---|
| bots | 22 % (40/178) | 10 | 80 % (132/164) | 13 % / 5 % (400) |
| 1 H-club `orig` | 14 % (12/83) | 0 | 73 % (44/60) | 12 % / 6 % (190) |
| 1 H-débutant `orig` | 24 % (12/51) | 1 | 80 % (66/82) | 25 % / 5 % (197) |
| 2 H-club `orig` | 16 % (14/86) | 2 | 75 % (40/53) | 12 % / 6 % (192) |

Constats :

- **Rien de propre au partenaire humain.** Les taux sont ceux d'une table de bots.
  - Couper le pli sûr du partenaire est rare (0 à 2 cas par condition).
  - Exemple (H-débutant) : 130♦ pris par P, T maître avec 9♦ sur Q♣ et R♣. P (`AH 7D 10D JD AD`) recoupe du Valet. Le pli était déjà gagné.
- **Ne pas charger le pli du partenaire.** C'est fréquent (20 à 27 % des opportunités), avec ou sans humain. C'est la SUI-4 de la vague 1.
  - Exemple : à ♣ atout, T fait le pli avec l'As♠ (Q♠, A♠, 9♠). P, dernier avec `10H JH QD KD QC 7S 10S JS`, donne le V♠ et garde le 10♠.
- **Surenchérir dans une autre couleur sur l'humain : 6 %**, comme sur un bot (5 %). Les cas vus sont défendables, avec une couleur propre longue et forte.
  - Exemple : T 80♥ avec `7H 8H JH AH 8C JC 9S KS`. P dit 100♦ avec `10H KH 8D 10D JD KD AD QC`.
  - Un joueur de club aurait plutôt soutenu cœur (As♦ + 10-R♥). C'est un choix discutable, pas absurde.

## 6. Effet des corrections de `seatWeight` (engine.js:1681-1692)

| Correction | Justesse du V/9 annoncé chez l'humain (partenaire, enchères) | « Sûr mais faux » | Calibration (scénario) | Résultat humain + bot |
|---|---|---|---|---|
| Actuel (0,15, `\|\|`) | 0,60 (club), 0,54 (débutant) | 0 à 2 % | sous-estime : 0,42 prédit contre 0,78 réel (club) | référence |
| `Math.max`, 0,15 | 0,56 (36 graines) ; 0,47 contre 0,46 en scénario | idem | idem | +1,4 ± 13,0 |
| 0,05 (`\|\|` ou `max`, identiques) | 0,66 / 0,62 | ≤ 2 % | 0,53 / 0,78 (club) ; 0,45 / 0,48 (débutant) | −4,8 ± 10,5 (club), +6,9 ± 11,3 (débutant) |
| 0,03 | 0,70 / 0,64 | ≤ 3 % | 0,58 / 0,78 (club) ; 0,47 / 0,48 (débutant) | −8,0 ± 10,0 (club), −0,6 ± 16,0 (débutant) |
| Lu comme un bot (0,0001) | 0,79 / 0,73 | **11 à 23 %** | 0,69 / 0,78 (club) ; 0,58 / 0,48 (débutant, surestime) | −6,0 ± 11,2 (club), +5,5 ± 12,3 (débutant) |

## Recommandations

1. **Baisser `MISFIT.human` à 0,05** (engine.js:1669).
   - +6 à +8 points de justesse sur les cartes annoncées par un humain, sans placements « sûrs mais faux ».
   - Calibré pour le débutant, encore prudent pour le joueur de club.
   - Effet sur le score non mesurable (± 10 pts par donne), donc sans risque mesuré.
   - Valider ensuite par un duel avec un siège humain, avec plus de graines.
2. **`Math.max(fit, misfit)`** : à faire pour la cohérence du code, mais ce n'est pas un levier. Avec 0,05, le changement n'a aucun effet (`BLUFF` = 0,07 et `SIM_FIT` = 0,1 sont au-dessus).
3. **Ne pas lire l'humain comme un bot.** C'est le meilleur réglage pour un humain discipliné, mais il exclut ses mains hors barème : 12 à 23 % de placements « sûrs mais faux », et deux fois moins de coinches justes contre un débutant.
4. **Lire les annonces humaines avec un barème de club, pas avec `openingBid`.** Même une ouverture conforme au barème des bots ne vaut que 0,49 de Valet. La tolérance uniforme dilue l'information.
   - Une lecture graduée suit déjà la piste C5 de la vague 1 : 3 atouts et un honneur, ±10 sur le montant.
   - Exemple de lecture : 80 = Valet ou 9-As ; 90 = Valet-9 ; +10 par As.
   - Elle placerait le Valet bien mieux que 0,05.
5. **Signaux** (prolonge C4).
   - Ne lire un appel que sur la **première** défausse de l'humain, si elle est petite.
   - Ne pas lire de second « premier signal » après une charge, ni dans une couleur dont l'As est tombé : 65 % de faux appels lus chez un humain discipliné.
   - Donner à l'humain un `SIGNAL_MISFIT` plus élevé : son faux appel trompe le bot une fois sur deux.
6. **Coinche contre un humain.** Les bots coinchent trop les 80 et 90 « de club » : 10 % des contrats, 60 % de réussite. Relire ces paliers avec le barème de club (point 4) devrait réduire les coinches perdues. À mesurer.
7. **Jeu de la carte.** Pas de correction propre à l'humain. La charge manquée (SUI-4) touche aussi le partenaire humain : 27 % des plis sûrs non chargés.

## Limites

- **Politiques simulées.** Elles sont simples : un vrai joueur de club joue mieux que H-club, en particulier au jeu de la carte. Les −25 et −65 pts par donne mesurent ces politiques, pas « l'humain ».
- **Échantillons.**
  - 36 à 72 graines × 8 donnes par condition, à 32 mondes. Les écarts de score ont ± 10 à 16 pts par donne de bruit (2σ).
  - Les signaux ne donnent que 9 à 64 réponses par case.
  - Les coinches contre H-club : 15 cas.
- **Adversaires et partenaire mêlés.** Les variantes de lecture changent à la fois le partenaire et les adversaires de l'humain (voir § 4).
- **Délais du pilote.** Ils sont fixes (2,5 s, 1,5 s, 0,2 s). Un humain réel varie, ce qui change l'ordre coinche/annonce suivante dans la fenêtre de l'hôte.
- **Mesures de justesse.** Elles portent sur les mondes réellement tirés par chaque décision (`mcWorlds`), toutes décisions confondues. n compte des paires carte × décision, pas des donnes indépendantes.
