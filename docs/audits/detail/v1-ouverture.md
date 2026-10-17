# Vague 1 — Ouverture et barème des enchères

Rapport détaillé du sous-agent « ouverture » (Opus), moteur au commit `b548853`. Zone : `engine.js` l. 352-635, étape 4 de `decideBid` (l. 818-858). Les mains ont été jouées sur une copie instrumentée du moteur, qui compte les mondes joués, et par la vraie API (`createGame`, `bots.turnAction`). Les scripts sont restés dans le dossier temporaire de la session et ne sont pas versionnés. Synthèse : [`../2026-10-bots-coinche.md`](../2026-10-bots-coinche.md).

## OUV-1 — Le veto de la simulation fait passer sans essayer d'enchère plus basse

- Lignes : 818-834 (`OPEN_VETO` l. 560).
- Catégorie : les deux. Gravité : haute.
- Scénario : le bot parle en premier avec ♥V-9-7 ♠A-10-R ♦A-10 (`JH 9H 7H AS 10S KS AD 10D`). Le barème donne 160♥. La simulation estime p(160) entre 0,60 et 0,69 selon le tirage, juste au-dessus du seuil de 0,6.
  - Dans une vraie partie, sur 30 donnes : 160♥ 19 fois, 250♥ une fois, **passe 10 fois**.
  - Or p(80♥) vaut entre 0,99 et 1,00.
- Même effet, plus rare : la main du test « 90 fort » passe 1 fois sur 20 ; V-9-x avec A-10 (110 au barème) passe 2 fois sur 20.
- Problème :
  - Quand le contrat du barème est refusé, le bot passe directement. Il n'essaie ni un palier plus bas, ni une autre couleur du barème, ni le 80 hors barème. Cette dernière branche est un `else if`, sautée dès qu'une ouverture existe.
  - Aucun joueur ne passe avec deux As-10 et V-9 d'atout.
  - Le partenaire bot relit cette passe comme `SIM_FIT` (l. 1662) : une passe ne nie donc plus rien.
- Piste : après un refus, redescendre les paliers dans la même couleur jusqu'à 80, puis essayer les autres couleurs du barème, puis le hors barème.
- Preuve : vérifié par exécution.

## OUV-2 — Générale, veto et 80 hors barème décidés sur un seul monde quand l'appareil est lent

- Lignes : 605-617 (aucun `minWorlds`), 832, 853, 2095-2117 (`stop` est calculé avant `mcWorlds`).
- Catégorie : non-prédictible. Gravité : haute.
- Mécanisme :
  - La première simulation d'une décision paie la génération des mondes, environ 30 ms ici.
  - Si cette génération dépasse `BID_BUDGET_MS` (150 ms), la boucle s'arrête après **un seul monde**.
  - Avec `minWorlds = 1`, une Générale (500) est alors validée sur 1 monde sur 1.
  - Le capot, qui exige 24 mondes, répond `null` et n'est jamais préféré.
- Scénario : ♥V-9-8-7-D ♠A-10-R (`JH 9H 8H 7H QH AS 10S KS`), premier à parler.

| Horloge | Résultat |
|---|---|
| réelle (ce serveur) | 250♥ 13 fois sur 16, 500♥ 3 fois |
| ×20 | **500♥ 12 fois sur 16** ; la Générale est jugée sur moins de 10 mondes dans 9 cas sur 16 |
| ×10, en 4e après trois passes | 500♥ 12 fois sur 12, Générale jugée sur 1 monde |

- Le refus de l'étape 4 et le 80 hors barème passent par le même chemin (`pMake` sans minimum).
- Piste :
  - Générale avec `minWorlds = CAPOT_WORLDS` ;
  - démarrer le chronomètre après la génération des mondes ;
  - avec trop peu de mondes, laisser décider le barème, sans Générale.
- Preuve : vérifié par exécution (horloge `tuning.now` accélérée).

## OUV-3 — La couleur est choisie au montant du barème, pas à la qualité de l'atout

- Lignes : 465 et 485-500.
- Catégorie : les deux. Gravité : moyenne.
- Scénarios :
  - ♥9-10-8-7 ♠V-9-7 ♦A : 100♥ 20 fois sur 20, alors que la simulation donne p(100♥) = 0,72 et p(90♠) = 0,85.
  - ♥9-A-8-7 ♠V-9-A ♦7 : 100♥ 20 fois sur 20 (p = 0,76), alors que p(90♠) = 0,93 et p(80♠) = 1,00.
- Problème :
  - Le bot annonce la couleur dont l'adversaire tient le Valet, en laissant de côté V-9 d'atout.
  - Un partenaire qui a le ♥V va soutenir fort une couleur où l'ouvreur n'a pas l'atout maître.
  - La règle « 100 = 9 + 10, 4 atouts, un As » rend le 100 supérieur au « 90 fort », qui garantit pourtant la tenue.
  - Le veto ne teste que la couleur choisie.
- Piste : départager les ouvertures du barème par l'espérance simulée, ou par la tenue (V+9 d'abord).
- Preuve : vérifié par exécution.

## OUV-4 — En 4e position, ouverture avec un Valet sec

- Lignes : 481. Le comportement contredit le commentaire des l. 815-817.
- Catégorie : non-humain. Gravité : moyenne.
- Scénario : trois passes, puis ♥V ♠A-8-7 ♦A-8-7 ♣7 (`JH AS 8S 7S AD 8D 7D 7C`) : **80♥ 17 fois sur 20**, avec un seul atout.
- Le commentaire affirme que retirer le bluff a supprimé « ouvrir 80 avec un Valet sec et un As ». La règle `light` le refait pourtant en 4e position.
- Effet voisin : ♥V-8-7 sans As en 4e ouvre 80 13 fois sur 20 et passe 7 fois. La règle permet l'ouverture, et la simulation, au seuil, tranche à pile ou face.
- Piste : en ouverture légère, exiger au moins deux ou trois atouts.
- Preuve : vérifié par exécution.

## OUV-5 — 80 hors barème : sens flou et décision au hasard

- Lignes : 835-857 (et l. 1659 pour la relecture).
- Catégorie : non-prédictible. Gravité : moyenne.
- Scénario : ♥A-D-8-7 ♠A-8 ♦7 ♣8 (`AH QH 8H 7H AS 8S 7D 8C`), premier à parler : 80♥ 9 fois sur 16, passe 7 fois. Selon les séries, de 8 à 13 ouvertures. À l'inverse, R-D-8-7 avec deux As ouvre toujours.
- Problème :
  - La même main, à la même place, ouvre ou passe selon le tirage des mondes.
  - Pour un partenaire humain, un 80 peut venir du barème (Valet ou 9 + As…) ou de n'importe quelle quatrième avec un ou deux As : il ne sait pas si l'annonce promet le Valet.
  - Une passe ne nie pas non plus une ouverture (OUV-1).
- Piste : remplacer le hors barème par une liste fixe de mains calibrée hors ligne. À défaut, tirer le hasard des enchères depuis une graine dérivée de la main et des annonces.
- Preuve : vérifié par exécution.

## OUV-6 — Saut à 160, voire capot, avec trois atouts

- Lignes : 460-462 et étape 1 bis (722-736).
- Catégorie : les deux. Gravité : moyenne.
- Scénario : ♥V-9-7 ♠A-10-R ♦A-10.
  - `fausses` ignore les atouts perdants : la main ne compte aucune fausse carte et vaut 160 dès trois atouts.
  - Sur 96 mondes, p(250) varie de 0,56 à 0,78 selon le tirage, autour du seuil `CAPOT_SIM` de 0,7.
  - Résultat : 250♥ une fois sur 30 en vraie partie, et jusqu'à 5 fois sur 12 avec l'horloge ×20 (moins de mondes, donc plus de bruit).
- Problème :
  - Un capot annoncé avec V-9-7, face à A-10-R d'atout chez l'adversaire, est inexplicable pour un partenaire.
  - Le 160 lui-même ne passe le veto que de justesse (OUV-1).
- Piste :
  - Pour V-9 avec moins de cinq atouts, compter les atouts maîtres manquants comme perdants (130/140 plutôt que 160).
  - Capot hors barème seulement à partir de cinq atouts, ou avec une marge au-dessus du seuil.
- Preuve : vérifié par exécution.

## OUV-7 — Commentaire faux sur la personnalité

- Lignes : 224-227, 947.
- Catégorie : non-prédictible (documentation). Gravité : basse.
- Le commentaire dit que `aggr` « relève les enchères plus tôt ». En réalité, `aggr` ne sert qu'à la surcoinche (`botWantsToSurcoinche`) et n'a aucun effet sur l'ouverture. Le comportement est sain ; seul le commentaire trompe celui qui lit le code.
- Piste : corriger le commentaire.
- Preuve : lecture du code (grep).

## Ce qui fonctionne bien

- **Barème.** Il est déterministe et proche des usages de club : 80 Valet troisième + As, 90 V-9, paliers selon les fausses cartes.
- **Mains franches.** Les décisions sont stables, 20 fois sur 20 :
  - 80 avec V-8-7 + As ;
  - 100 avec V-A-x-x ;
  - 110 avec V-9 cinquième ;
  - capot avec V-9-x-x-x + A-10-R ;
  - Générale avec V-9-A-10-R + trois As.
- **Même grille des deux côtés.** L'émetteur et le lecteur partagent la même grille (`openingBid` / `bidFits`), et la personnalité ne touche pas à l'ouverture.

Presque toute l'imprévisibilité vient de la simulation, employée comme veto au seuil, sans repli et sans plancher de mondes.
