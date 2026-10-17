# Vague 2 — Remonter (ou non) son partenaire : bots contre règles humaines strictes

Question de l'utilisateur : « un gameplay humain suit des règles assez strictes en fonction de la valeur des cartes, avec quelques cas exceptionnels, pour que ça soit prédictible ». On compare la remontée des bots à une table de club, on mesure les écarts, puis on prototype une table stricte.

Moteur étudié : `src/coinche/engine.js` (branche `claude/audit-bots-coinche-detail`, commit b5d04ae). Scripts et données : `scratchpad/audit/vague2/remontee/`.

## En bref

1. **La remontée du bot est un barème déterministe décalé d'un palier.** Sans adversaire, 96 à 100 % des mains donnent la même enchère sur toutes les graines. Mais la relance vaut `points − 10` (palier de prudence, `engine.js:752-753`). Elle annonce donc toujours **un As de moins** que la convention de club « +10 par As ». [exéc.]
2. **Accord avec la référence de club (+10 par As, +20 Valet, +10 9 second, +20 belote) : 15 à 28 % des décisions sans adversaire**, 33 à 54 % avec une intervention adverse (n = 320 mains par ouverture). Le palier de prudence explique à lui seul 32 à 91 % des désaccords selon le cas (plus de la moitié dans 9 cas sur 10). [exéc.]
3. **En compétition, la remontée devient aléatoire et illisible.** 5 à 15 % des mains changent de décision d'une graine à l'autre. La simulation (étape 3) relance la couleur du partenaire avec trois petits atouts et rien d'autre, ou un 10 sec et un As. Le forçage relance de 20 un 110 **sans aucun atout** (deux As secs, 100 % des graines). [exéc.]
4. **Lecture inverse.** Quand un humain remonte « +10 par As », l'ouvreur bot ne va presque jamais au capot : 1 décision sur 800, alors que le capot passe en jeu réel dans 31 donnes sur 400. Il croit le Valet chez un humain qui ne l'a pas dans 16 % des cas (`partnerShowsJack`, relance ≥ 20). Il sous-estime les As d'un humain qui remonte de 30 ou 40 : 0,8 lu pour 1,4 à 2 réels. [exéc.]
5. **Table stricte prototypée** (4 changements d'émission et de lecture, 3 exceptions écrites). Accord avec la référence : 60 à 95 % sans adversaire, 75 à 81 % en compétition. Mains entièrement déterministes en compétition : 95 à 99 %, contre 85 à 95 %. **Duel contre le moteur actuel : B − A = +1,7 ± 3,9 pts/donne** (1 771 paires, 48 mondes) : pas de différence de force mesurable.

« ± » = 2 erreurs-types, sauf mention contraire. [exéc.] = vérifié par exécution ; [code] = lecture du code.

## Méthode

- **Banc d'essai** : `remontee/lib.mjs` reprend `competition/lib.mjs` (vague 1). Il construit l'état d'enchère, appelle `bots.decideBid` sur une copie, avec `Math.random = rng(graine)` et `tuning.now = () => 0`. Réglages du moteur par défaut : 96 mondes d'enchère.
- **Mains du répondant** (`gen.mjs`) : tirage stratifié. Le nombre d'atouts (0 à 4) et le nombre d'As à côté (0 à 3) sont uniformes. La belote est forcée une fois sur quatre (à partir de deux atouts). Les cartes promises par l'ouverture d'un bot vont à l'ouvreur : Valet et 9 pour 90, 110 et 120 ; Valet ou 9, plus le 10 pour 100. Le reste est tiré au hasard. Atout du partenaire : ♥. Adversaire : ♠.
- **Scénarios** (le partenaire, siège 0, ouvre ; le répondant est le siège 2) :
  - **S0** : ouverture X, passe de l'adversaire, le répondant parle (1er tour).
  - **S1** : ouverture X, intervention adverse à X + 10, le répondant parle.
  - **S2** : 2e tour. Le répondant a passé (S0 = passe sur toutes les graines), l'adversaire de gauche intervient à X + 10, l'ouvreur passe.
  - X ∈ {80, 90, 100, 110, 120}. 320 mains par X. Graines : 2 en S0, 4 en S1, 3 en S2.
- **Lecture inverse** (`rev.mjs`) : 400 donnes au hasard. Le siège 0 ouvre au barème des bots, le siège 1 n'a pas d'ouverture. Le partenaire, de type `human`, remonte selon la référence A. Puis l'ouvreur bot parle (2 graines). Sur la même donne, on rejoue avec un partenaire bot. « Capot faisable » : le capot réussit quand on joue la vraie donne aux réflexes (`playOut` sur les vraies mains). C'est une approximation optimiste.
- **Prototype** : `remontee/proto/engine.js` (diff : `remontee/proto/proto.diff`). Duel : copie de `tests/coinche-ab.js` limitée à 2 processus (`WORKERS=2`, `nice -n 10`), 48 mondes, A = prototype, B = moteur actuel.

## 1. La procédure réelle du bot [code]

### Les briques

**`supportPoints(main, atout, X)`** (`engine.js:503-521`), X = dernière annonce du partenaire :

```
pts = 20 si Valet d'atout
    + 10 si 9 d'atout et au moins 2 atouts
si X ≤ 90 :
    + 10 par As à côté, seulement avec ≥ 2 atouts (X = 80) ou ≥ 1 atout (X = 90)
    − 10 sans atout, ou avec un seul atout sur 80
    sur 80 : 4 atouts sans Valet ni 9 + au moins un As → pts = au moins 20
si X ≥ 100 :
    + 10 par As à côté, même sans atout
+ 20 si belote
```

L'As d'atout, le 10 d'atout, les 10 et les coupes ne comptent jamais.

**`raiseBy(siège, atout)`** (`engine.js:538-549`) : la plus forte relance de ce siège au-dessus d'une annonce de son partenaire dans la même couleur. Seule `partnerShowsJack` l'utilise (`engine.js:1143-1148`) : relance ≥ 20 ⇒ « il a le Valet ».

**`offer(v, couleur)`** (`engine.js:650-657`) : arrondit à la dizaine inférieure, plafonne à 160, refuse sous le minimum. **`force(couleur)`** (`engine.js:660-665`) : enchère au minimum, au plus deux fois par camp et par donne (`G.forced`). Le compteur est rendu si la simulation met son veto à l'étape 4 (`engine.js:834`).

### L'arbre de `decideBid` (`engine.js:635-868`), vu du répondant

```
0. Générale (generaleBid, l. 593-633, appelée l. 643) :
   ≥ 5 atouts avec Valet et 9, simulation ≥ 85 %.  → Générale
   Contrat ≥ 270 sur la table → passe.

1. Capot par les clefs (l. 689-706), une seule fois (memo.supported) :
   le partenaire a OUVERT 90 / 110 / 120 / 130 dans cette couleur
   (fausses promises 4 / 3 / 2 / 1, FAUSSES_PROMISES l. 352),
   j'ai au moins un atout et As à côté > fausses promises,
   et la simulation réussit le capot ≥ 70 % sur ≥ 24 mondes.  → capot (250, 270 belote)

1'. Relance de l'OUVREUR après la remontée (l. 708-716) :
   j'ai ouvert 90/110/120/130, le partenaire a relancé de r,
   r/10 > mes fausses cartes, et la simulation valide.  → capot
   (sinon l'ouvreur ne reparle jamais au-dessus de la remontée, voir plus bas)

1 bis. Capot hors barème (l. 719-737) : dans la couleur du partenaire
   (ou la mienne), ≥ 3 atouts avec Valet ou 9, simulation ≥ 70 %.  → capot

2. Soutien (l. 739-771), une seule fois par donne (memo.supported = true,
   même si je passe) :
   cible = X + supportPoints − 10            ← palier de prudence
   si ma meilleure ouverture dans une AUTRE couleur > cible → je l'annonce
   si l'adversaire n'a pas parlé et que mon camp sort à X : je me tais (nearExit)
   si cible > X :
       cible ≥ minimum         → j'annonce min(160, cible)
       sinon, adversaire au contrat et cible + 10 ≥ minimum
                               → je force au minimum (G.forced < 2)
   (sinon, on continue)

3. Compétition (l. 773-807), seulement si l'adversaire tient le contrat :
   P_adv = réussite simulée de son contrat ; laisser jouer = −P·M + (1−P)·160
   candidates : la couleur du partenaire DÈS UN ATOUT (l. 790-791),
                mes couleurs à partir de 3 cartes avec une tenue
   paliers : minimum, et le barème d'ouverture s'il est plus haut
   j'annonce le meilleur si son espérance dépasse « laisser jouer » de 60.
   sinon → passe (l'étape 4 n'est pas atteinte)

4. Ouverture (l. 809-866) : seulement si mon camp ne tient pas le contrat.
   Quand le partenaire tient le contrat, l'étape 4 est sautée → passe.
```

### Ce que l'arbre implique

- **Sans adversaire, la remontée est un barème pur** : relance = `supportPoints − 10`, si elle atteint 10. Exceptions : la Générale et les capots (étapes 0, 1, 1 bis), qui dépendent de la simulation.
- **Un seul soutien par donne.** `memo.supported` passe à vrai à l'étape 2, même si le bot passe. Au 2e tour, plus de barème : seule l'étape 3 (simulation) peut relancer.
- **L'ouvreur ne relance jamais la remontée de son partenaire**, sauf capot. Il a parlé dans la couleur (étape 2 sautée), son camp tient le contrat (étapes 3 et 4 sautées).
- **Au-dessus d'une intervention**, trois mécanismes se suivent : le barème (s'il atteint le minimum), le forçage (s'il manque 10), puis la simulation avec la couleur du partenaire candidate dès un 7 sec.

## 2. Carte du comportement réel [exéc.]

### 2.1 Déterminisme et accord, par scénario

« Déterministes » : part des mains dont toutes les graines donnent la même enchère. « Accord A / B » : part des décisions égales à la référence A ou B (§ 3). « Sens » : passe ou relance, comme A.

| Scénario | X | Mains | Décisions | Déterministes | Accord A | Accord B | Sens (A) |
|---|---|---|---|---|---|---|---|
| S0 sans adversaire | 80 | 320 | 640 | 99 % | 15 % | 33 % | 72 % |
| | 90 | 320 | 640 | 100 % | 28 % | 36 % | 84 % |
| | 100 | 320 | 640 | 96 % | 15 % | 29 % | 78 % |
| | 110 | 320 | 640 | 100 % | 27 % | 38 % | 78 % |
| | 120 | 320 | 640 | 99 % | 21 % | 32 % | 77 % |
| S1 intervention à X+10 | 80 | 320 | 1 280 | 89 % | 33 % | 34 % | 79 % |
| | 90 | 320 | 1 280 | 95 % | 46 % | 29 % | 84 % |
| | 100 | 320 | 1 280 | 90 % | 38 % | 29 % | 81 % |
| | 110 | 320 | 1 280 | 95 % | 46 % | 27 % | 78 % |
| | 120 | 320 | 1 280 | 85 % | 54 % | 24 % | 81 % |
| S2 2e tour, après passe | 80 | 89 | 267 | 81 % | 67 % | 61 % | 67 % |
| | 90 | 125 | 375 | 94 % | 70 % | 70 % | 70 % |
| | 100 | 79 | 237 | 86 % | 75 % | 75 % | 75 % |
| | 110 | 126 | 378 | 91 % | 72 % | 72 % | 72 % |
| | 120 | 100 | 300 | 82 % | 85 % | 85 % | 85 % |

### 2.2 Montant de remontée sur 80♥, sans adversaire (S0)

Décision la plus fréquente, sur toutes les mains du profil et toutes les graines. « autre » = annonce de sa propre couleur. Entre crochets : la référence A.

| Atout du répondant | 0 As | 1 As | 2 As | 3 As |
|---|---|---|---|---|
| 1 petit atout | passe [passe] | passe [+10] | passe [+20] | passe [+30] |
| 2 petits atouts | passe [passe] | passe [+10] | +10 [+20] | +20 [+30] |
| 3 petits atouts | passe [passe] | passe [+10] | · | +20 [+30] |
| 4 petits atouts | · | **+10** (bonus) [+10] | · | · |
| As d'atout second | passe | autre | +10 [+20] | +20 [+30] |
| 9 sec | passe | passe [+10] | autre | passe [+30] |
| 9 second | passe [+10] | +10 [+20] | +20 [+30] | +30 [+40] |
| Valet sec | passe/autre [+20] | passe [+30] | passe [+40] | passe [+50] |
| Valet second | +10 [+20] | +20 [+30] | +30 [+40] | +40 [+50] |
| Valet troisième | +10 [+20] | +20 [+30] | +30 [+40] | +40 [+50] |
| Valet-9 troisième | +20 [+30] | +30 [+40] | · | +50 [+60] |
| Belote seconde | +10 [+20] | +20 [+30] | +30 [+40] | +40 [+50] |
| Valet + belote, 3 atouts | +30 [+40] | +40 [+50] | · | +60 [+70] |

Chaque case : 2 à 10 décisions. 99 % des mains sont déterministes ; les cases mêlées (par exemple « 1 petit atout ») viennent de mains du même profil qui annoncent leur propre couleur, pas du hasard.

À lire :
- **Le Valet sec ne remonte jamais un 80**, même avec trois As : 20 − 10 (un seul atout) − 10 (prudence) = 0, et les As ne comptent pas.
- **+10 sur 80 veut dire au choix** : Valet sans As, belote sans As, 9 second et un As, deux As avec deux atouts, ou quatre petits atouts et un As. C'est le constat LIS-3 : la relance ne dit pas « un As ».
- **Le 9 sec ne vaut rien**, le 9 second vaut un As.

### 2.3 Sur 110♥ (Valet + 9 promis) : sans adversaire, puis avec intervention à 120♠

S0 (110♥, passe) : barème pur, 100 % déterministe. Relance = (As − 1) × 10, +20 avec la belote.

| Atout du répondant | 0 As | 1 As | 2 As | 3 As |
|---|---|---|---|---|
| sans atout | passe | passe | +10 | +20 |
| 1 à 4 petits atouts, ou As d'atout | passe | passe | +10 | +20 |
| belote (2 à 4 atouts) | +10 | +20 | +30 | +40 |

S1 (110♥, 120♠ ; minimum 130) :

| Atout du répondant | 0 As | 1 As | 2 As | 3 As |
|---|---|---|---|---|
| sans atout | passe 94 % | passe 92 % | **130♥ 100 %** (forçage) | 130♥ 93 % |
| 1 petit atout | passe 100 % | passe 57 % / 130♥ 43 % | 130♥ 100 % | 130♥ 100 % |
| 2 petits atouts | passe 84 % | 130♥ 50 % | 130♥ 100 % | 130♥ 100 % |
| 3 petits atouts | **passe 55 % / 130♥ 45 %** | 130♥ 66 % | 130♥ 100 % | 130♥ 100 % |
| As d'atout, 4 atouts et plus | 130♥ 88 % | 130♥ 75 % | 130♥ 100 % | 130♥ 100 % |
| belote | 130♥ 100 % | 130♥ 100 % | 140♥ | 150♥ |

n = 4 à 84 décisions par case (4 graines par main).

### 2.4 Où la simulation contredit le barème

Exemples relevés sur les mains du § 2.1 (4 graines en S1, 3 en S2, 2 en S0) :

| Main du répondant (♥ = atout du partenaire) | Situation | Barème (étape 2) | Décisions du bot |
|---|---|---|---|
| `JH AS AD AC 7S 8C QD 7C` (Valet sec, 3 As) | 80♥ – 90♠ | passe (10 pts) | 100♥ × 4 (étape 3) |
| même main | 2e tour, 80♥ – passe – passe – 90♠ | — | 100♥ × 3 |
| `KH 8H 7H 7S JD 8D 9C KC` (3 petits atouts, rien) | 100♥ – 110♠ | passe | 120♥ × 4 |
| même main | 2e tour sur 110♠ | — | passe × 2, 120♥ × 1 |
| `10H 8H 7H QC QD 9D 8D 7C` (3 petits atouts, aucun As) | 2e tour, 110♥ … 120♠ | — | passe × 2, 130♥ × 1 |
| `10H AC JC 10S 10C JD 8S 9C` (10 sec, 1 As) | 120♥ – 130♠ | passe | 140♥ × 3, passe × 1 |
| `KH QH 8H JH AS AD 7S 8S` | 100♥, sans adversaire | 150♥ | 150♥ × 1, 270♥ × 1 (capot 1 bis) |
| `AH 9H 7H QH AS AD 10D KD` | 80♥, sans adversaire | 110♥ | 250♥ × 2 |

## 3. Référence humaine stricte

Il n'existe pas de norme fédérale des enchères à la coinche. Les clubs français partagent deux familles de conventions. Le code se réclame de D. Graux (2016) ; je n'ai pas pu en vérifier le texte. Une source en ligne a été trouvée : la page stratégie de GameDuell ([gameduell.fr](https://www.gameduell.fr/gd/belote/belote-coinche-strategies.html), extrait de recherche ; la page n'a pas pu être chargée). Le reste vient de l'usage courant.

### Référence A — « +10 par As » (la plus répandue)

| Élément de la main du répondant | Valeur |
|---|---|
| Chaque As à côté | +10 |
| Valet d'atout (si l'ouvreur ne l'a pas promis) | +20 |
| 9 d'atout second ou plus (si non promis) | +10 |
| Belote | +20 (dans certains clubs : rien, elle s'annonce au jeu) |
| Aucun atout | pas de remontée |

- L'annonce vaut X + points, arrondie à la dizaine, plafonnée à 160. Sans point, on passe.
- **Capot** : quand les As du répondant couvrent les fausses cartes promises par l'ouvreur (110 = 3, 120 = 2, 130 = 1), on annonce capot.
- **Après une intervention** : on annonce sa valeur (X + points) si elle atteint le minimum. Sinon on passe, ou on coinche avec des levées dans la couleur adverse.
- Implémentée dans `remontee/ref.mjs` (`refA`).

### Référence B — « l'atout d'abord, les As ensuite » (GameDuell)

- **1er tour : on montre l'atout.**
  - +10 : Valet sec, 9 second, ou As d'atout troisième.
  - +20 : Valet second, ou 9 troisième.
- **2e tour : on montre les As.** Si les enchères continuent, +10 par As à côté. Une main faible à l'atout passe d'abord.
- Implémentée dans `refB`.

### Exceptions classiques (communes aux deux)

1. **Barrage** : au-dessus d'une intervention, monter d'un palier de plus que la main pour gêner l'adversaire. Seulement avec un vrai soutien (Valet ou As).
2. **Capot par les clefs** : compter les As contre les perdantes de l'ouvreur.
3. **Palier maximal en compétition** : beaucoup de clubs ne dépassent pas 100 à 120 sans le Valet.
4. **Défendre par la coinche plutôt que surenchérir** quand on a des levées dans la couleur adverse.
5. **Annoncer sa propre couleur** si elle vaut nettement plus que le soutien.

### Ce qui varie d'un club à l'autre

- La belote : +20 ou rien.
- L'As d'atout compte parfois +10.
- Le Valet sec est souvent compté +10 seulement.
- Le sens de 90 et de 100 (« 90 = Valet + 9 » ou « 90 = 9 + As ») change ce qui est « promis », donc ce que vaut le Valet du répondant.
- Le seuil du capot : As ≥ fausses ou As > fausses.

## 4. Comparaison bot / référence [exéc.]

### 4.1 Désaccords avec A, par cause (moteur actuel)

| Cause | S0 80 | S0 100 | S0 110 | S0 120 | S1 80 | S1 110 | Classe |
|---|---|---|---|---|---|---|---|
| Palier de prudence : un palier de moins | 303 | 443 | 282 | 160 | 434 | 407 | **b** |
| Propre couleur annoncée à la place | 146 | 22 | 6 | 4 | 258 | 22 | a |
| As non comptés avec un atout sec sur 80 | 66 | — | — | — | 35 | — | a |
| Bonus 4 petits atouts + As | 16 | — | — | — | 24 | — | a |
| As comptés sans atout (100 et plus) | — | 60 | 56 | 74 | — | 56 | a (limite) |
| Seuil du capot (As > fausses au lieu de ≥) | — | — | 124 | 267 | — | — | a |
| Capot par la simulation | 9 | 21 | — | — | 22 | — | b (non déterministe) |
| Forçage d'un palier | — | — | — | — | 8 | 56 | a, sauf sans atout : b |
| Simulation (étape 3) | — | — | — | — | 72 | 147 | **b** |
| Décisions | 640 | 640 | 640 | 640 | 1 280 | 1 280 | |

### 4.2 Classe a : exceptions acceptables, chacune en une phrase

- **Propre couleur** : « j'ai mieux à jouer dans ma couleur ». Exemple : `AD AC 10D 7D 8C JS JD QS` sur 80♥ → 100♦, 2 graines sur 2.
- **As avec un atout sec sur 80** : « pas d'As sans deux atouts sur un 80 ». C'est défendable, mais rares sont les clubs qui l'appliquent.
- **4 petits atouts** : « avec quatre atouts, l'atout adverse tombe ».
- **Seuil du capot** : « il me faut un As de plus que tes perdantes ».
- **As sans atout sur 100 et plus** : « tu as promis la longueur ». Limite : un humain ne le fait pas en compétition.
- **Forçage avec un vrai soutien** : c'est le barrage.

### 4.3 Classe b : écarts illisibles, avec exemples

1. **Le palier de prudence (−10).** Il est déterministe, mais il décale tout d'un As : un humain qui lit « +10 = un As » se trompe sur presque chaque relance. Exemple : `KH QH 8H QD KD 8S 7C 10S` (belote seconde, rien d'autre) sur 80♥ → 90♥ (2 sur 2) ; la référence dit 100♥. Le bot lui-même lit la relance autrement pour le capot (ENC-5, § 5).
2. **La simulation relance la couleur du partenaire avec rien.**
   - 3 petits atouts, rien à côté, sur 110♥ – 120♠ : 130♥ dans 45 % des décisions (n = 44).
   - `KH 8H 7H 7S JD 8D 9C KC` sur 100♥ – 110♠ : 120♥ 4 fois sur 4.
   - Le même Valet sec + 3 As (`JH AS AD AC 7S 8C QD 7C`) passe sans adversaire, mais dit 100♥ dès que l'adversaire parle. Ce n'est pas le montant que donnerait une table (130).
3. **Forçage sans atout.** `AS AD QD 10D KS JC KD QS` (aucun ♥) sur 110♥ – 120♠ → 130♥, 4 fois sur 4. Deux As comptés « sans atout », moins 10, puis forcés de 10.
4. **Hasard au 2e tour.** 6 à 19 % des mains changent d'avis d'une graine à l'autre (S2). Exemple : `10H 8H 7H QC QD 9D 8D 7C` : passe, passe, 130♥.

### 4.4 La convention B

Accord : 16 à 38 % en S0, 24 à 34 % en S1. Le bot montre ses As dès le 1er tour : ce n'est pas la convention B. Au 2e tour il ne montre pas ses As (barème coupé par `memo.supported`), il simule. B n'est donc pas une meilleure description du bot que A.

## 5. Lecture inverse : un humain remonte « +10 par As » [exéc.]

400 donnes, partenaire humain selon A (relances de +10 à +40), 2 graines par décision de l'ouvreur. Témoin : la même donne avec un partenaire bot (134 donnes où il relance).

| Indicateur | Humain (A), moteur actuel | Bot, moteur actuel | Humain (A), prototype | Bot, prototype |
|---|---|---|---|---|
| Décisions de l'ouvreur déterministes | 100 % | 100 % | 100 % | 99 % |
| Capots annoncés par l'ouvreur | 1 / 800 | 2 / 268 | 0 / 800 | 4 / 750 |
| Donnes où le capot passe en jeu réel (réflexes) | 31 / 400 | 20 / 134 | 31 / 400 | 30 / 375 |
| « Il a le Valet » (`partnerShowsJack`) sans le Valet | **11 / 70 (16 %)** | 3 / 30 (10 %) | 0 (règle retirée) | 0 |
| P(Valet) dans les mondes, s'il l'a | 0,44 (n = 59) | 0,72 (n = 46) | 0,54 | 0,79 (n = 57) |
| P(Valet) dans les mondes, s'il ne l'a pas | 0,07 | 0,06 | 0,03 | 0,02 |
| As à côté : écart absolu mondes − réel | 0,48 | 0,49 | 0,48 | 0,41 |
| As à côté : biais | −0,14 | −0,13 | −0,25 | −0,15 |

As lus par l'ouvreur (moyenne sur 32 mondes) selon la relance de l'humain, moteur actuel :

| Ouverture + relance humaine | n | As réels | As lus |
|---|---|---|---|
| 80 + 10 | 128 | 0,76 | 0,70 |
| 80 + 20 | 64 | 0,98 | 0,89 |
| 80 + 30 | 20 | 1,35 | **0,83** |
| 80 + 40 | 5 | 1,80 | **0,82** |
| 90 + 20 | 22 | 1,73 | 1,28 |
| 100 + 40 | 4 | 2,00 | **0,73** |
| 110 + 20 | 6 | 1,67 | 0,90 |

Constats :

- **Capot.** L'ouvreur ne relance jamais au capot sur une remontée, humaine ou bot. La clause 1' ne joue que si l'ouvreur a dit 90 ou 110 et plus, et la simulation la refuse presque toujours. Exemple : ouvreur 120♠ `9D JS AH 10H 10D 9S AS 8S` (2 fausses), humain `QS JH JD AD 9H KS 7D 8H` relance à 150♠ (1 As + belote). r/10 = 3 > 2, mais la simulation refuse : passe 2 fois sur 2. Le capot passe en jeu réel.
- **Le Valet au mauvais endroit.** Une relance humaine de 20 sur 80 (deux As, ou 9 + As) fait jouer à l'ouvreur un petit atout « vers le Valet » du partenaire (`engine.js:1198-1205`). L'humain ne l'a pas dans 16 % des cas.
- **Les grosses relances d'un humain sont lues trop petites.** Les mains qui collent au barème bot dominent. Une relance de 30 ou 40 qui contient « Valet + As » ou « belote + As » est relue par des mains bot aux As moins nombreux.
- **Le biais vient aussi des mondes.** Même avec un partenaire bot et une lecture exacte (prototype : +10 sur 90 = exactement un As), les mondes ne donnent que 0,71 As pour 1,00 réel. Ce sous-conditionnement des mondes (chaîne de Metropolis de `mcWorlds`, `engine.js:1718` et suivantes) dépasse ce rapport ; il relève de la justesse des mondes.

## 6. Table de remontée stricte proposée

### 6.1 Les règles (émission et lecture identiques)

**Valeur de la main du répondant**, sur l'annonce du partenaire dans sa couleur :

| Élément | Points |
|---|---|
| Aucun atout | 0, on ne remonte pas |
| Chaque As à côté | +10 |
| Valet d'atout | +20 |
| 9 d'atout avec au moins 2 atouts | +10 |
| Belote | +20 |

**Règle** : j'annonce X + points (plafond 160), une seule fois par donne, si c'est au moins le minimum. Pas de palier de prudence.

**Lecture** :
- une relance de r se lit exactement « r points » ;
- une passe se lit « 0 point » ;
- le Valet ne se lit que sur une ouverture de 90 ou de 110 et plus, pas sur une relance (+20 = Valet ou deux As ou belote).

**Les trois exceptions, écrites** :
1. **Capot par les clefs** : As à côté > fausses promises par l'ouvreur (110 = 3, 120 = 2, 130 = 1), toujours validé par la simulation. Lecture miroir chez l'ouvreur : r/10 > ses fausses. Elle devient exacte, puisque r = 10 × As (hors Valet et belote).
2. **Barrage** : au-dessus d'une intervention, si la main vaut le minimum − 10, j'annonce le minimum (deux fois par camp et par donne). Lu « points ∈ {r − 10, r} ».
3. **Hors table** : sans de quoi soutenir au minimum, la décision de surenchérir reste à la simulation. La couleur du partenaire n'est alors candidate qu'avec **deux atouts ou un honneur** (Valet, 9 ou As), comme le proposait ENC-3.

Les règles existantes « propre couleur meilleure » et « sortie proche » sont gardées sans changement.

### 6.2 Diff du prototype (diff complet et applicable : [`../patches/remontee.diff`](../patches/remontee.diff))

```diff
 function supportPoints(hand, suit, partnerBid) {
-  … (Valet +20, 9 second +10 ; As selon X et la longueur ; −10 court ; bonus 4 atouts ; belote +20)
+  const m = asMask(hand);
+  const n = countOf(m, suit);
+  if (!n) return 0;
+  let pts =
+    (has(m, suit, "J") ? 20 : 0) +
+    (has(m, suit, "9") && n >= 2 ? 10 : 0) +
+    10 * sideAces(m, suit);
+  if (hasBelote(m, suit)) pts += 20;
+  return pts;
 }
+function partnerFit(hand, suit) {   // deux atouts ou un honneur
+  const m = asMask(hand);
+  const n = countOf(m, suit);
+  return n >= 2 || (n >= 1 && (has(m, suit, "J") || has(m, suit, "9") || has(m, suit, "A")));
+}
 // partnerShowsJack
-  return o === 90 || o >= 110 || raiseBy(ctx.partner, ctx.atout) >= 20;
+  return o === 90 || o >= 110;
 // étape 2
-      partnerBid.montant + supportPoints(hand, suit, partnerBid.montant) - 10; // palier de prudence
+      partnerBid.montant + supportPoints(hand, suit, partnerBid.montant);
 // étape 3
-        if (suitCards(hand, s).length < (partnerSuit ? 1 : 3)) continue;
+        if (partnerSuit ? !partnerFit(hand, s) : suitCards(hand, s).length < 3) continue;
 // bidFits (modèle d'intervention)
-    return countOf(h, s) < (ps ? 1 : 3) ? 0 : interventionP(h, s, ps, min);
+    return (ps ? !partnerFit(h, s) : countOf(h, s) < 3) ? 0 : interventionP(h, s, ps, min);
 // baremeFits (lecture de la relance, puis de la passe)
-      if (pts >= (forced ? r : r + 10) && (acted || e.montant >= 160 || pts < r + 20))
+      if (pts >= (forced ? r - 10 : r) && (acted || e.montant >= 160 || pts < r + 10))
-      return overOpp && countOf(h, e.atout) >= 1 ? SIM_FIT : 0;
+      return overOpp && partnerFit(h, e.atout) ? SIM_FIT : 0;
-    return acted || supportPoints(h, e.cur.atout, e.cur.montant) <= 10
+    return acted || supportPoints(h, e.cur.atout, e.cur.montant) <= 0
```

### 6.3 Déterminisme et accord du prototype [exéc.]

160 mains par X (les 160 premières mains de X = 80 sont les mêmes qu'au § 2), graines 2 / 3 / 2.

| Scénario | X | Déterministes (actuel → proto) | Accord A (actuel → proto) |
|---|---|---|---|
| S0 | 80 | 99 % → 99 % | 15 % → 77 % |
| | 90 | 100 % → 100 % | 28 % → 89 % |
| | 100 | 96 % → 98 % | 15 % → 95 % |
| | 110 | 100 % → 100 % | 27 % → 75 % |
| | 120 | 99 % → 97 % | 21 % → 60 % |
| S1 | 80 | 89 % → 95 % | 33 % → 75 % |
| | 90 | 95 % → 96 % | 46 % → 75 % |
| | 100 | 90 % → 96 % | 38 % → 75 % |
| | 110 | 95 % → 99 % | 46 % → 81 % |
| | 120 | 85 % → 96 % | 54 % → 78 % |
| S2 | 80 à 120 | 81-94 % → 93-100 % | 67-85 % → 86-95 % |

L'accord avec A est en partie acquis par construction, puisque la table reprend A. Les désaccords qui restent sont les exceptions écrites :
- **propre couleur** : 68 décisions sur 320 en S0 80, 84 sur 480 en S1 80 ;
- **barrage** : 21 à 87 décisions sur 480 en S1 ;
- **seuil du capot** : As > fausses, contre ≥ dans A ; 125 sur 320 en S0 120 ;
- **simulation hors table** : 3 à 29 décisions sur 480 en S1.

Barrage qui reste discutable : profil « 1 petit atout + 1 As » sur 110♥ – 120♠ → 130♥ dans 18 décisions sur 18. On peut le resserrer en exigeant Valet ou As **et** deux atouts.

Lecture (§ 5) :
- `partnerShowsJack` ne se trompe plus (règle retirée) ;
- P(Valet) dans les mondes passe de 0,72 à 0,79 avec un partenaire bot, et de 0,44 à 0,54 avec un humain ;
- l'écart absolu sur les As d'un bot passe de 0,49 à 0,41.

### 6.4 Force : duel contre le moteur actuel [exéc.]

A = prototype, B = moteur actuel (arbitre). 48 mondes, horloge figée, « duplicate » avec re-semis par donne. 2 processus, `nice -n 10`.

| Série | Donnes de départ | Paires de donnes | B − A (pts/donne) | Erreur-type |
|---|---|---|---|---|
| 1 | 0 à 79 | 899 | +2,98 | 2,67 |
| 2 | 80 à 159 | 872 | +0,17 | 2,84 |
| **Ensemble** (pondéré) | | 1 771 | **+1,7** | 1,9 |

Détail :

| Série | Parties gagnées par B | Contrats proto (moy., réussis) | Contrats actuel (moy., réussis) | Coinches faites proto / actuel (gagnées) |
|---|---|---|---|---|
| 1 | 47,5 % ± 7,9 | 949 (111, 73 %) | 1 033 (108, 74 %) | 116 (51) / 135 (55) |
| 2 | 50,0 % ± 7,9 | 894 (113, 70 %) | 1 010 (111, 72 %) | 136 (75) / 134 (62) |

Lecture :
- **Pas de différence de force mesurable** : B − A = +1,7 ± 3,9 pts/donne (2 erreurs-types, 1 771 paires, 2 × 160 parties, 1 160 s de calcul sur 2 cœurs). La perte possible du prototype est au plus de 5,6 pts/donne ; un gain de 2,2 n'est pas exclu.
- **Le prototype prend environ 10 % de contrats en moins**, plus hauts de 2 à 3 points, et en réussit 1 à 2 points de moins. C'est l'effet attendu : moins de forçages et d'interventions « dès un atout », des remontées d'un palier plus hautes.
- Le palier de prudence avait été calibré (commentaire l. 323-325 : « 10 points de plus ne valent jamais ce risque »). Le duel ne le confirme pas à cette précision. Il faudrait une série d'environ 4 000 paires pour trancher à ± 2.

## Recommandation

1. **Adopter la table stricte en émission ET en lecture**, avec ses trois exceptions écrites. C'est la seule façon de rendre la remontée prévisible pour un humain. Elle supprime le décalage d'un As (ENC-5) et le « Valet lu sur une relance » (LIS-3, LIS-4). Elle réduit de plus de moitié la part des mains non déterministes en compétition (9 % → 4 % en moyenne). Le duel ne montre pas de perte significative à la précision atteinte (voir § 6.4) ; une série plus longue est nécessaire avant de fusionner.
2. **Si l'on garde le palier de prudence** pour la force, il faut le dire et le lire de façon cohérente : « le bot remonte d'un As de moins ». Il faut aussi corriger la lecture de l'ouvreur (clause 1', `engine.js:708-716`) : r/10 + 1 > fausses.
3. **Dans tous les cas** :
   - exiger deux atouts ou un honneur pour la couleur du partenaire à l'étape 3 (`engine.js:790-791`) et dans `bidFits` ;
   - interdire le forçage sans atout ;
   - retirer la lecture « relance ≥ 20 = Valet » (`engine.js:1147`).
4. **Documenter la table** dans l'aide du jeu (P1 et P3 de LIS) : un humain doit pouvoir appliquer exactement la même grille.

## Limites

- **Mains du répondant stratifiées**, pas tirées comme dans une vraie partie : les taux d'accord pèsent autant les profils rares que les courants. Les profils sont publiés case par case pour cette raison.
- **Une seule couleur adverse (♠) et une seule position** : l'intervention vient juste après l'ouvreur (S1), ou à gauche au 2e tour (S2).
- **« Capot faisable »** : vrais jeux, joués aux réflexes. C'est optimiste pour le preneur, mais identique pour les deux moteurs.
- **Références humaines A et B** : des conventions répandues, pas une norme. Le texte de D. Graux n'a pas été vérifié. Une seule source en ligne, consultée par extrait.
- **Duel** : 48 mondes et non 96 (réglage du jeu) ; deux séries seulement.
