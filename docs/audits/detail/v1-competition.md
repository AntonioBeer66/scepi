# Vague 1 — Soutien du partenaire et enchères compétitives

Rapport détaillé du sous-agent « compétition » (Opus), moteur au commit `b548853`. Zone : `decideBid` hors première ouverture (`engine.js` l. 503-868). Synthèse : [`../2026-10-bots-coinche.md`](../2026-10-bots-coinche.md).

**Méthode**

- Horloge figée (`tuning.now = () => 0`), graine de `Math.random` variable.
- Appareil lent imité en avançant l'horloge de k ms à chaque appel.
- Dans les scénarios, le siège 0 parle ; son partenaire est le siège 2.
- Sur le conteneur d'audit, une décision de l'étape 3 prend environ 143 ms.

## ENC-1 — La même situation donne des enchères différentes d'une partie à l'autre

- Lignes :
  - 784-806 (étape 3) ;
  - 683-687 et 735 (capot) ;
  - 568-570 ;
  - 2095-2120 (`makeProbability`, avec `Math.random` dans `dealUnknown` et la chaîne de Metropolis).
- Catégorie : non-prédictible. Gravité : haute.
- Scénarios :
  - Main `7H AD 10D 9D AC KC 8S 7S`, séquence partenaire 80♥ puis adversaire 90♠ : 100♥ 26 fois sur 40, passe 14 fois.
  - Le partenaire ouvre 120♥, main `8H AS 8S 7S AD 8D AC 9C` : capot 250♥ 4 fois sur 20, 140♥ 16 fois.
  - 40 donnes complètes entre 4 bots, rejouées avec 5 graines : le contrat final change dans 24 donnes sur 40, le camp preneur dans 13.
- Problème : un partenaire humain ne peut pas apprendre ce que fait le bot dans une situation donnée. Avec la même main et les mêmes enchères, le bot passe ou enchérit, annonce le capot ou non.
- Pistes :
  - tirer les mondes avec une graine dérivée de la main et de l'historique d'enchères ;
  - ajouter une hystérésis autour des seuils (`COMPETE_MARGIN`, `CAPOT_MIN`) ;
  - employer la simulation comme veto oui/non sur une enchère choisie au barème, plutôt que pour choisir l'enchère.
- Preuve : vérifié par exécution.

## ENC-2 — Les décisions dépendent de la vitesse de l'appareil

- Lignes : 558 (`BID_DECISION_MS`), 570 (`CAPOT_WORLDS`), 574, 798, 785-786, 829-833, 2096-2113.
- Catégorie : non-prédictible. Gravité : haute.
- Cause :
  - Le temps de réflexion passe d'abord dans les simulations de capot (étape 1 bis), puis dans `pOpp`, puis dans le palier minimum. Le palier du barème, évalué en dernier, est celui qui saute.
  - Si `pOpp` devient `null`, on retombe au barème, avec forçage et sans veto (l. 832 accepte `pm === null`).
- Scénario : main `JH AH 8H 7H AS 9S 8D 7C` (barème 100♥) sur 80♠ adverse.

| Horloge | Décision (20 tirages) |
|---|---|
| figée | 90♥ 14 fois, 100♥ 6 fois |
| 2 ms par monde | 90♥ 20 fois |
| 25 ms par monde | passe 20 fois |

- Autres cas :
  - Le capot du scénario ENC-1 disparaît dès 10 ms par monde.
  - La main à singleton d'ENC-1 passe toujours en mode lent.
  - En donnes complètes, le mode lent donne aussi des lignes plus agressives. Exemple : `2:110C` en rapide, qui passe partout ; `3:120S … 1:140S` en lent.
- Problème : le même bot joue autrement sur téléphone et sur PC. Un appareil environ 3 fois plus lent que le conteneur dépasse déjà le budget de 400 ms.
- Piste : fixer un nombre de mondes plutôt qu'un temps, ou réduire N uniformément *avant* d'évaluer les options. Un `null` ne doit jamais faire changer de branche.
- Preuve : vérifié par exécution.

## ENC-3 — Au-dessus de l'adversaire, une relance dans la couleur du partenaire ne dit plus rien

- Lignes : 658-665 et 765-768 (forçage), 790-791 (couleur du partenaire candidate « dès un atout »).
- Catégorie : les deux. Gravité : moyenne.
- Scénario : partenaire 80♥, adversaire 90♠. Le bot dit 100♥ :
  - avec un Valet sec, Valet + As, deux As ou une belote sèche : 16 fois sur 16 ;
  - avec un 7♥ singleton + AD 10D AC : 10 fois sur 16 ;
  - avec un seul As : 2 fois sur 16.
- En donnes complètes : un 10♣ singleton + un As pousse le 110♣ du partenaire à 130♣, par la simulation.
- Problème :
  - L'humain lit un soutien (Valet ou As) et relance, voire part au capot, alors que le bot peut n'avoir qu'un 7 sec.
  - Aucun joueur de club ne relance à 100 la couleur du partenaire avec un singleton sans honneur.
- Piste :
  - pour la couleur du partenaire à l'étape 3, exiger deux atouts ou un honneur (V, 9 ou A), ou `supportPoints ≥ 10` ;
  - réserver le forçage aux mains qui ont au moins le Valet ou un As.
- Preuve : vérifié par exécution.

## ENC-4 — Le palier d'intervention est tiré au sort entre le minimum et la valeur du barème

- Lignes : 793-801.
- Catégorie : les deux. Gravité : moyenne.
- Cause : l'espérance vaut pm × palier. Avec 90 à 0,98 et 100 à 0,96, les deux paliers sont presque à égalité, et le bruit tranche.
- Scénario : même main `JH AH 8H 7H AS 9S 8D 7C` sur 80♠ (barème 100). Sur les quatre permutations de couleurs : 90♥ 70 % du temps, 100♥ 30 %.
- Sur 200 enchères complètes : 30 interventions à 90 sans Valet + 9.
- Problème :
  - Le système annonce « 90 = Valet + 9 troisième » (l. 322). L'humain qui lit 90 croit que le bot a le 9.
  - Il ne peut pas non plus savoir si la main vaut 90 ou 100.
- Piste : si le palier du barème passe le veto de la simulation, l'annoncer toujours ; garder le minimum pour les mains hors barème.
- Preuve : vérifié par exécution.

## ENC-5 — Les « clefs » ne se lisent pas comme elles s'émettent

- Lignes : 503-521, 708-716, 752-753.
- Catégorie : non-prédictible. Gravité : moyenne.
- Émission :
  - À cause du palier de prudence, sur une ouverture de 100 ou plus, le partenaire relance de (As − 1) × 10, plus 20 pour la belote.
  - Sur 80, une relance de +10 peut signifier le Valet, deux As, la belote, ou 9 + As (vérifié, déterministe).
- Lecture par l'ouvreur :
  - Il compte relance/10 > fausses cartes, soit un As de moins que la règle du répondant (As > fausses).
  - La belote y compte pour deux clefs.
- Scénario : l'ouvreur dit 120♥ (`JH 9H AH 7H 10H AS 8S 9D`, 2 fausses cartes) et le partenaire 140♥, soit trois As selon son propre barème. L'ouvreur passe 10 fois sur 10.
- Problème :
  - Un humain qui suit la convention courante (+10 par As) se trompe dans les deux sens.
  - Le code l'admet lui-même : « les relances de compétition se lisaient comme des As » (l. 563).
- Piste : sur une ouverture de 100 ou plus, relancer de +10 par As sans palier de prudence, ou ajouter 1 à la lecture. Annoncer la belote à part.
- Preuve : vérifié par exécution.

## ENC-6 — La Générale est préférée au capot de même valeur en cas d'égalité

- Lignes : 617-632 (comparaison stricte `pc > best.pm`).
- Catégorie : les deux. Gravité : basse.
- Scénario : main `JS 9S QS 8S 7S AH AD AC` en réponse au 80♥ du partenaire. Générale 1 fois sur 12 (pm = pc = 0,979), 250♠ sinon.
- Rejoué en vrai : le capot réussit 56 fois sur 60, la Générale 54 fois sur 60.
- Problème :
  - Les deux valent 250 et la Générale est plus difficile : un humain ne l'annoncerait pas.
  - En plus, le choix change selon la graine.
- Piste : `>=`, ou réserver la Générale au cas où il faut passer au-dessus d'un capot adverse.
- Preuve : vérifié par exécution.

## ENC-7 — Escalades par paliers de 10, avec changement de couleur en route

- Lignes : 784-806 et 658-665.
- Catégorie : non-humain. Gravité : basse.
- Cause : l'étape 3 compare chaque enchère à la passe, sans anticiper la reprise de l'adversaire.
- Scénario :
  - Sur 200 donnes, 18 ont au moins 6 enchères.
  - Exemple : `2:100C 3:110S 0:120C 1:130D 2:140C 3:150D`.
  - Le camp 1 abandonne les piques de son partenaire pour les carreaux à 130, et les deux camps montent jusqu'à 150 au lieu de coincher.
  - Avec une autre graine, la même donne s'arrête à 130♦.
- Piste : au-dessus de 120, exiger le palier du barème ou un fit montré, et privilégier la coinche.
- Preuve : vérifié par exécution.

## ENC-8 — Le changement de couleur à l'étape 2 contourne la simulation

- Lignes : 754-758.
- Catégorie : non-prédictible. Gravité : basse.
- Cause : `offer(own.montant)` ne passe ni par `capotOk` pour un 250/270, ni par `OPEN_VETO`, contrairement à l'étape 4. Cela contredit les l. 331-332 (« toujours validé »).
- Impact faible : les capots du barème testés sont réellement solides (93 % de réussite mesurée).
- Preuve : lecture du code.

## Note sur `aggr`

La personnalité n'a aucun effet sur les enchères : elle ne sert qu'à la surcoinche (l. 947). Le commentaire des l. 225-226 (« relève les enchères plus tôt ») est faux.

## Ce qui fonctionne bien

- Sans adversaire, le soutien est déterministe et suit exactement le barème documenté (8 mains testées, 12 fois sur 12 chacune).
- `memo.supported` et le plafond `G.forced` empêchent les boucles d'enchères. Le bot ne se bat jamais contre le contrat de son partenaire, au-delà d'un changement de couleur raisonnable.
- Le bot n'enchérit jamais dans l'atout adverse (0 cas sur 200 enchères).
- Les bots relisent les enchères de leurs partenaires bots (`bidFits`) avec le même système que celui qui les émet.
