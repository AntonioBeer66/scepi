# Coinche SCEPI — Instructions pour le moteur en ligne

## 1. Périmètre et conventions V1

Ce document spécifie les données, actions, validations et transitions à programmer côté serveur. Il remplace la synthèse du manuel ESCP / Amicale fourni par l'utilisateur. Les manipulations physiques, arbitres, plaisanteries et sanctions sur table ne font pas partie du moteur.

Les conventions ci-dessous rendent les points incomplets du manuel exécutables. Ce sont des **choix d'adaptation explicites**, pas des règles confirmées de l'Amicale. Les centraliser dans un profil `scepi-online-v1`, figé au début de chaque partie et présenté aux joueurs dans les règles du site.

| Sujet | Convention V1 |
| --- | --- |
| Partie | Un set à 1 010 points. |
| Distribution | Premier donneur aléatoire ; mélange serveur à chaque donne ; distribution automatique 3–3–2. Le mélange systématique remplace volontairement la procédure du manuel. |
| Rotation | Sens antihoraire fixe, sans coupe interactive. |
| Contrat « 80 » | Score de base 80, seuil de réussite 82 sans belote. Interprétation du montant à inscrire. |
| Enchères | 80 à 160 par pas de 10, puis capot 250 et capot beloté 270 ; surenchère strictement supérieure. |
| Atout demandé | Monter si possible, même sur son partenaire ; sinon fournir un atout inférieur. Le manuel ne tranche pas explicitement ce cas. |
| Partenaire maître et couleur demandée absente | Toute carte autorisée, y compris un atout inférieur à celui du partenaire. |
| Capot beloté | Contrat distinct à 270 ; huit plis ET belote valide, sinon chute sans repli à 250. |
| Belote | Déclaration automatique : dès que le Roi puis la Dame d'atout du preneur sont joués, Belote puis Rebelote sont annoncées sans action du joueur (humain ou bot). |
| Délais techniques | 30 s par enchère, 10 s pour surcoincher, 5 s d'affichage du résultat d'une donne. |

Le délai de **30 secondes par carte**, avec carte légale aléatoire à expiration, vient du README du projet. Les règles fondamentales de cartes et de score proviennent des articles 5 à 11 et de l'annexe 1 du manuel. Le mélange et la désignation du donneur sont simplifiés pour le jeu en ligne.

## 2. Salons, joueurs et état serveur

- Prévoir quatre à cinq salons publics configurables de quatre places, accessibles avec un pseudonyme.
- Identifier le joueur par une session serveur, jamais par son pseudonyme seul.
- Numéroter les sièges `0, 1, 2, 3` dans le sens antihoraire. `suivant(s) = (s + 1) % 4`, `partenaire(s) = (s + 2) % 4`.
- Équipes fixes : A = sièges 0 et 2, B = sièges 1 et 3.
- Démarrer quand les quatre places sont occupées, connectées et prêtes. Ne pas remplacer un joueur pendant une partie.

État minimal :

```text
Partie : id, versionRegles, phase, versionEtat
Joueurs[4] : session, pseudonyme, connecte, pret
Scores[2], donneur, numeroDonne, numeroTour, joueurActif, echeance
Mains[4], mainsInitiales[4]
Contrat : type, montant, atout, preneur, equipePreneur | null
PassesConsecutives, multiplicateur (1, 2 ou 4)
PliCourant : liste ordonnee de {siege, carte}
PlisGagnes[2], pointsPlis[2], historiquePlis
Belote : detenteur, declarations, valide
ScoreDonneApplique : booleen
```

Chaque carte possède un identifiant unique `(couleur, rang)`. Ne transmettre que la main du destinataire et les informations publiques : sièges, cartes jouées, contrat, scores, déclarations et délais. Ne pas transmettre le paquet, les mains adverses, les secrets de session ou une belote non déclarée. Le tri visuel des cartes n'affecte pas le moteur.

## 3. États et transitions

| État | Actions acceptées | Sortie |
| --- | --- | --- |
| `ATTENTE` | Rejoindre, quitter, prêt/non prêt | Quatre joueurs prêts → `DISTRIBUTION`. |
| `DISTRIBUTION` | Aucune action de jeu | Distribution terminée → `ENCHERES`. |
| `ENCHERES` | Passer, enchérir ; coincher hors tour si autorisé | Quatre passes sans contrat → nouvelle donne ; trois passes après contrat → `JEU` ; coinche → `SURCOINCHE`. |
| `SURCOINCHE` | Surcoincher, uniquement par les preneurs | Surcoinche ou fin des 5 s → `JEU`. |
| `JEU` | Jouer à son tour ; belote/rebelote s'annoncent automatiquement au fil des cartes jouées | Huitième pli terminé → `SCORE`. |
| `SCORE` | Aucune action de jeu | Score appliqué une fois ; victoire → `TERMINEE`, sinon après 5 s → nouvelle donne. |
| `TERMINEE` | Quitter ou préparer une revanche | Retour à `ATTENTE`, scores remis à zéro pour la prochaine partie. |
| `ABANDONNEE` | Quitter | Aucun vainqueur, libération du salon. |

La reconnexion est traitée indépendamment de la phase.

## 4. Distribuer

1. Choisir le premier donneur uniformément au hasard ; aux donnes suivantes, passer à `suivant(donneur)`, même après quatre passes.
2. Créer les 32 cartes : 7, 8, 9, 10, valet, dame, roi, as pour trèfle, carreau, cœur et pique.
3. Dès le début de la partie, avant la première distribution, mélanger les 32 cartes au hasard côté serveur. Utiliser un mélange uniforme, par exemple Fisher–Yates avec des tirages non biaisés issus d'un générateur cryptographiquement sûr. Ne jamais distribuer le paquet dans son ordre de création ni utiliser une graine fixe en production. Répéter ce mélange à chaque nouvelle donne selon la convention V1 ; un simple tri aléatoire des mains à l'écran ne remplace pas le mélange du paquet.
4. À partir de `suivant(donneur)`, distribuer trois cartes à chacun, puis trois, puis deux. Vérifier huit cartes par main et aucune duplication.
5. Réinitialiser les données de donne, les fenêtres, les passes et le multiplicateur à 1 ; conserver les scores de partie.
6. Démarrer les enchères avec `joueurActif = suivant(donneur)` et 30 secondes pour agir.

Ne pas implémenter la coupe, le tirage physique du donneur, les droits au mélange, l'ordre de ramassage des plis ni les sanctions de fausse donne. Une mauvaise main ne permet pas d'annuler la donne : aucune misère.

## 5. Enchères et coinche

### PASSER et ENCHERIR

- Autoriser ces actions uniquement pour le joueur actif en phase `ENCHERES`.
- `PASSER` incrémente les passes consécutives : quatre sans contrat donnent une nouvelle donne sans score ; trois après un contrat verrouillent celui-ci et démarrent le jeu.
- `ENCHERIR` exige une couleur d'atout et un montant dans `[80, 90, 100, 110, 120, 130, 140, 150, 160, 250, 270]`, strictement supérieur au contrat courant.
- Refuser les enchères égales même avec une autre couleur, sans-atout et tout-atout.
- Autoriser une surenchère sur son partenaire et une enchère à un tour ultérieur après avoir passé.
- La dernière enchère définit le preneur et son équipe ; elle remet les passes à zéro.
- Types : `NUMERIQUE` pour 80 à 160, `CAPOT` pour 250, `CAPOT_BELOTE` pour 270.
- Ne pas contrôler la composition de la main pour permettre une enchère, même à 270 : un contrat peut être irréalisable et chuter.
- Après une action qui ne clôt pas les enchères, avancer au joueur suivant et démarrer ses 30 secondes. À expiration, effectuer `PASSER` automatiquement.

### COINCHER et SURCOINCHER

- Pendant `ENCHERES`, tout défenseur peut `COINCHER` un contrat adverse existant, même hors tour. Un preneur ne peut pas coincher son camp.
- Fixer le multiplicateur à 2, annuler le délai d'enchère et ouvrir `SURCOINCHE` pour 10 secondes. Toute nouvelle enchère ou passe est alors refusée.
- Un des preneurs peut `SURCOINCHER` : fixer le multiplicateur à 4 et démarrer immédiatement le jeu.
- À expiration sans surcoinche, démarrer avec multiplicateur 2. Aucun multiplicateur supérieur à 4.
- Après les trois passes qui ferment normalement les enchères, aucune coinche n'est acceptée.
- L'entame revient toujours à `suivant(donneur)`, indépendamment de l'enchérisseur.

## 6. Cartes légales

Séparer le rang de force des points :

| Force décroissante | Atout | Points | Hors atout | Points |
| --- | --- | ---: | --- | ---: |
| 1 | Valet | 20 | As | 11 |
| 2 | 9 | 14 | 10 | 10 |
| 3 | As | 11 | Roi | 4 |
| 4 | 10 | 10 | Dame | 3 |
| 5 | Roi | 4 | Valet | 2 |
| 6 | Dame | 3 | 9 | 0 |
| 7 | 8 | 0 | 8 | 0 |
| 8 | 7 | 0 | 7 | 0 |

Pour obtenir `cartesLegales(main, pli, atout, joueur)` :

```text
Si pli vide : retourner toute la main
couleurDemandee = couleur de la premiere carte
maitre = gagnant provisoire du pli
fournissables = cartes de la couleur demandee dans la main

Si fournissables non vide :
  Si couleurDemandee == atout :
    superieures = fournissables plus fortes que la carte maitresse
    Si superieures non vide : retourner superieures
  Retourner fournissables

Si le partenaire est maitre : retourner toute la main
atouts = cartes d'atout dans la main
Si atouts vide : retourner toute la main
Si la carte maitresse est un atout :
  superieurs = atouts plus forts que la carte maitresse
  Si superieurs non vide : retourner superieurs
Retourner atouts
```

Fournir reste obligatoire sur son partenaire. Sans couleur demandée, couper sur un adversaire est obligatoire ; surcouper si possible, sinon sous-couper. La montée lorsque l'atout est demandé suit la convention V1.

## 7. Jouer et résoudre un pli

1. Vérifier phase `JEU`, joueur actif, carte présente dans sa main et dans `cartesLegales`.
2. Retirer cette carte et l'ajouter une seule fois au pli courant. Déclencher l'annonce automatique de belote/rebelote si cette carte y donne droit (section 8).
3. À moins de quatre cartes, passer au siège suivant et démarrer ses 30 secondes.
4. À quatre cartes, le plus fort atout gagne ; sans atout, la plus forte carte de la couleur demandée gagne.
5. Ajouter les points des quatre cartes à l'équipe gagnante et incrémenter son nombre de plis. Archiver le pli et vider le pli courant.
6. Au huitième pli, ajouter **10 points** au gagnant de ce pli et passer à `SCORE` : la belote étant déjà tranchée automatiquement, aucune attente supplémentaire n'est nécessaire. Sinon, le gagnant entame avec 30 secondes.

À expiration d'un tour, le serveur choisit uniformément dans `cartesLegales` et applique la même procédure ; l'annonce de belote reste automatique même dans ce cas. Les animations n'ajoutent pas de temps ni de nouvel état de jeu.

## 8. Belote et rebelote

- Au verrouillage du contrat, repérer si un même preneur possède dans sa main initiale le roi ET la dame d'atout. Lui seul est admissible au bonus ; la belote défensive ne rapporte rien.
- Déclaration automatique, sans action du joueur : dès que la première de ces deux cartes est jouée, Belote est annoncée ; dès que la seconde est jouée, Rebelote l'est. L'ordre roi/dame est libre. Ce comportement est identique pour un siège humain ou un bot — aucun bouton, aucune fenêtre à guetter.
- Le bonus devient valide quand les deux cartes ont été jouées (donc les deux annonces faites).
- Le score peut être calculé dès la résolution du dernier pli : la belote est toujours tranchée au plus tard au moment où la dernière carte concernée est posée.

## 9. Calcul du score

Après huit plis, exiger `pointsPlis[A] + pointsPlis[B] = 162` et `plisGagnes[A] + plisGagnes[B] = 8`. Stocker la belote séparément, sans modifier ces totaux.

```text
Si contrat.type == NUMERIQUE :
  seuil = 82 si montant == 80, sinon montant
  Si belote valide des preneurs : seuil = max(81, seuil - 20)
  reussi = pointsPlis[preneurs] >= seuil
Si contrat.type == CAPOT :
  reussi = plisGagnes[preneurs] == 8
Si contrat.type == CAPOT_BELOTE :
  reussi = plisGagnes[preneurs] == 8 ET belote valide des preneurs

Si reussi : gain[preneurs] = montant * multiplicateur ; gain[defense] = 0
Sinon : gain[preneurs] = 0 ; gain[defense] = 160 * multiplicateur
```

Appliquer les gains une seule fois par donne. Ne pas ajouter les points de plis, arrondir le résultat, ajouter 20 au contrat pour la belote, ni attribuer une prime de générale ou de capot non annoncé.

À 1 010 points ou plus, déclarer la victoire après résolution de la donne. Sinon, afficher le résultat 5 secondes et redistribuer avec le donneur suivant. Jouer les huit plis même si un contrat est déjà irréalisable : aucune revendication anticipée en V1.

## 10. Autorité serveur et déconnexions

- Chaque action porte un identifiant unique et les identifiants de partie/donne/tour pertinents ; authentifier le siège depuis la session.
- Sérialiser les actions par salon, dédupliquer les requêtes et appliquer le score de façon atomique. Un doublon reçoit son résultat initial sans modifier l'état.
- L'horloge serveur est la référence. Une action reçue à l'échéance ou après est tardive : appliquer d'abord l'expiration correspondante.
- Une carte manuelle et un timeout concurrents ne doivent jamais jouer deux cartes pour un même tour.
- Un dernier passe traité avant une coinche ferme les enchères ; une coinche traitée d'abord invalide ce passe.
- Refuser une action invalide sans modifier le jeu ni réinitialiser de délai ; renvoyer un motif (`HORS_TOUR`, `CARTE_INTERDITE`, `ENCHERE_INVALIDE`, `DELAI_EXPIRE`, etc.).
- Une déconnexion conserve la place et la main. Les délais continuent : passe automatique, absence de surcoinche, carte légale automatique selon la phase.
- À la reconnexion authentifiée, renvoyer l'état actuel et sa main restante, sans prolonger les délais.
- Si tous les joueurs restent déconnectés 60 s, passer à `ABANDONNEE` et libérer le salon. Le retour d'un joueur annule ce compteur.
- Sans persistance fiable, un redémarrage serveur abandonne les parties interrompues sans vainqueur ; ne pas reconstruire une partie à partir des seules données des navigateurs.

## 11. Cas de validation indispensables

| Cas | Résultat attendu |
| --- | --- |
| Début de partie | Mélange aléatoire du paquet avant toute distribution ; 32 cartes uniques réparties en quatre mains de huit. |
| Quatre passes initiales | Aucun score ; nouveau donneur et nouvelle distribution. |
| 100 sur un contrat 100 d'une autre couleur | Refus. |
| Défenseur qui coinche hors tour pendant les enchères | Accepté, fenêtre de surcoinche. |
| Coinche après fermeture des enchères | Refus. |
| Couleur demandée disponible, partenaire maître | Fournir obligatoirement. |
| Couleur absente, adversaire maître à l'atout, atout supérieur disponible | Surcouper obligatoirement. |
| Même situation, uniquement atouts inférieurs | Sous-couper obligatoirement. |
| Couleur absente, partenaire maître | Toute carte autorisée. |
| Atout demandé, partenaire maître, atout supérieur disponible | Monter, selon convention V1. |
| 80 sans belote, 81 points de plis | Chute. |
| 80 sans belote, 82 points de plis | 80 aux preneurs, selon convention V1. |
| 100 avec belote, 80 / 81 points de plis | Chute / réussite. |
| 110 avec belote, 89 / 90 points de plis | Chute / réussite. |
| 100 coinché réussi / surcoinché chuté | 200 aux preneurs / 640 à la défense. |
| 250 coinché, huit / sept plis | 500 aux preneurs / 320 à la défense. |
| 270, huit plis sans rebelote valide | Chute selon convention V1. |
| 270 surcoinché, huit plis avec belote valide | 1 080 aux preneurs ; victoire. |
| Deuxième carte de belote jouée sur le dernier pli | Rebelote s'annonce avant la résolution du pli ; le score qui suit en tient compte. |
| Même carte envoyée deux fois, ou après timeout | Un seul jeu, aucune modification rétroactive. |
| Reconnexion en cours de tour | Main restante et échéance inchangées. |
| Score traité deux fois | Aucun double ajout. |

## 12. Hors périmètre

Pas de misère, annonces de suites/carrés, sans-atout, tout-atout, choix du sens, coupe manuelle, arbitrage, étoiles de pénalité, tournois en plusieurs sets, remplacement en cours de partie, classement ou chat libre en V1.

Références : [objectifs](README.md), [cadrage technique](TECHNIQUE.md), manuel de la coinche ESCP / Amicale fourni (articles 3 à 11 et 14, annexe 1). Le PDF original n'est pas publié dans le dépôt. Ce fichier est une spécification : le moteur n'est pas encore implémenté.
