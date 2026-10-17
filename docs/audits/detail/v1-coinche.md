# Vague 1 — Coinche et surcoinche

Rapport détaillé du sous-agent « coinche » (Sonnet), sur le moteur au commit `b548853`. Zone : `engine.js` l. 868-951, `makeProbability` (l. 2095) et l'hôte (`host.js`). Les essais ont tourné sur une copie d'`engine.js` dont les fonctions internes sont exportées. Synthèse : [`../2026-10-bots-coinche.md`](../2026-10-bots-coinche.md).

## COI-1 — Surcoinche tirée à pile ou face selon la « personnalité »

- Lignes : engine.js 942-948 (tirage au hasard l. 947), 226-228 (`aggr` tiré entre 0,75 et 1,35 par siège) ; host.js 108-120.
- Catégorie : les deux. Gravité : haute.
- Scénario : le preneur tient V, 9, 4 atouts et 2 As. Il a annoncé 130♠ et se fait coincher. La simulation estime sa réussite à environ 0,85, sous le seuil de 0,9. Sur 200 essais, il surcoinche :
  - dans 69 % des cas avec `aggr` = 0,75 ;
  - dans 84 % des cas avec `aggr` = 1,0 ;
  - dans 100 % des cas dès `aggr` = 1,25.
  À 100♠, la même main surcoinche toujours (simulation à 0,99).
- Problème :
  - La décision qui quadruple les enjeux dépend d'un tirage et d'un trait de caractère invisible.
  - Le commentaire de la l. 225 affirme pourtant que « la coinche suit la même règle pour tous ».
  - Les deux bots de l'équipe preneuse tirent chacun au sort (host.js), ce qui augmente encore la probabilité que l'équipe surcoinche (lecture du code).
- Piste : supprimer `Math.random` et `aggr`. Surcoincher si la simulation dépasse un seuil qui dépend du montant M (équilibre 160/(160+M), plus une marge), ou selon une règle de main fixe.
- Preuve : vérifié par exécution.

## COI-2 — Coinche et surcoinche suivent le bruit de la simulation

- Lignes : engine.js 915-919, 940-941, 2095-2119 ; échantillonneur l. 1693-1771.
- Catégorie : les deux. Gravité : haute.
- Scénarios :
  - **Contre 100♠.** Défenseur avec V-9-7 d'atout et A♥ A♦ : il coinche dans 85 % des 40 essais seulement. La probabilité estimée est bimodale (de 0 à 0,8, écart-type 0,21). Les mêmes cartes contre 90 ou 110 donnent une probabilité d'environ 0 et 100 % de coinche.
  - **Contre 120♠.** 3 As + un 10, sans atout : l'estimation est éparpillée de 0,1 à 1.
  - **Surcoinche à 100.** Avec « V-9 + 3 atouts + 2 As », le bot surcoinche dans 66 % des cas seulement, sans aucun tirage explicite : la simulation oscille autour de 0,9.
  - **Mains aléatoires.** Sur 50 mains répétées 20 fois, 4 (8 %) ont une décision instable (coinchée entre 10 et 90 % du temps).
- Cause probable : quand l'annonce contredit la main du bot (par exemple un 100 alors qu'il tient le Valet et le 9), les mondes cohérents avec le système pèsent 1e-4, et la chaîne de Metropolis devient erratique.
- Problème : le partenaire humain voit des coinches évidentes ratées, ou des coinches sans raison, au hasard.
- Pistes :
  - graine déterministe dérivée de la main et des enchères ;
  - plus de mondes indépendants ;
  - règle fixe quand l'annonce est incohérente avec la main (coincher si le bot tient V+9 contre un 100 qu'il ne peut pas lire) ;
  - hystérésis autour du seuil.
- Preuve : vérifié par exécution.

## COI-3 — Sur appareil lent, coinche sur quelques mondes seulement

- Lignes : engine.js 2093-2115 (`BID_BUDGET_MS` = 150, `minWorlds` = 1 par défaut). Les appels des l. 915 et 940 ne fixent aucun minimum, alors que le capot exige `CAPOT_WORLDS` = 24.
- Catégorie : non-prédictible. Gravité : moyenne.
- Scénario : horloge simulée qui avance de 8 ms puis de 30 ms par appel. Main au contrat solide : réussite réelle 0,82, contre un seuil de coinche de 0,265.
  - L'écart-type de l'estimation passe de 0,04 à 0,08 puis à 0,17, et le minimum tombe à 0.
  - Le bot coinche alors dans 3 à 5 % des cas, sans raison.
  - Une décision prend environ 65 ms ici, contre 7 ms d'après le commentaire de la l. 1489 : la troncature est plausible sur mobile.
- Piste : exiger au moins 24 à 48 mondes, sinon basculer sur une règle fixe (tenue d'atout + points). Ne jamais décider sur 1 à 5 mondes.
- Preuve : vérifié par exécution avec une horloge simulée. La fréquence réelle sur mobile n'est pas mesurée.

## COI-4 — Le bot dit « passe » puis « coinche » 0,3 s plus tard

- Lignes : host.js 101-105 (passe après 350 à 800 ms) contre 126-139 (coinche après 500 à 1 700 ms, délai indépendant).
- Catégorie : non-humain. Gravité : moyenne.
- Scénario : vrai hôte avec horloge virtuelle, 3 bots autour d'un 130♠. Le défenseur qui parle juste après l'annonceur avait déjà passé dans 47 de ses 51 coinches (exemple : passe à 650 ms, coinche à 912 ms).
- Problème : un humain décide de coincher avant de passer. Un repentir systématique paraît étrange.
- Piste : évaluer la coinche dans le tour du bot (`botDecideBid`), ou avec un délai fixe plus court que celui de sa parole.
- Preuve : vérifié par exécution.

## COI-5 — La coinche tombe avant ou après la clôture, selon des délais aléatoires

- Lignes : host.js 130 ; engine.js 2333-2343 (une coinche arrête immédiatement les enchères).
- Catégorie : les deux. Gravité : basse à moyenne.
- Scénario 1 : la coinche voulue est perdue quand les trois passes ferment les enchères avant la fin de son délai aléatoire. 6 cas sur 136 (4 %), pour une main qui coinche à 100 %.
- Scénario 2 : un bot défenseur coinche environ 1 s après l'annonce, avant que son partenaire humain, dont c'est le tour, ait pu surenchérir. La coinche lui retire cette possibilité.
- Piste : prendre la décision au même instant que la fin de la fenêtre des enchères, ou au tour du bot.
- Preuve : scénario 1 vérifié par exécution ; scénario 2 en lecture du code.

## COI-6 — La coinche ne promet rien d'identifiable

- Lignes : engine.js 905-919. Aucune tenue d'atout n'est exigée sur un contrat numérique.
- Catégorie : non-prédictible. Gravité : moyenne.
- Scénario : main sans aucun atout, A♥ A♦ A♣ 10♥ 10♦ 10♣ R♥ R♦. Contre 140♠ et 160♠, elle coinche à 100 % (simulation à 0,03 et 0,00). Contre 120♠, à 2,5 % seulement. Seuls les capots et les Générales exigent une tenue (Valet, ou 9 + un autre atout).
- Problème : le partenaire ne peut pas lire « j'ai le Valet d'atout ». La coinche peut venir d'As à côté, d'une annonce que le bot juge impossible, ou du bruit.
- Piste : appliquer et documenter la convention « coinche = au moins une levée d'atout » (tenue minimale) pour les contrats numériques jusqu'à 150, et l'écrire dans l'aide.
- Preuve : vérifié par exécution.

## COI-7 — Coinche et surcoinche « gratuites » selon le score, sans lien avec la main

- Lignes : engine.js 891-895, 930-934.
- Catégorie : non-prédictible. Gravité : basse.
- Scénarios :
  - Main vide contre 80♠, preneur à 950 : le bot coinche.
  - Main vide en surcoinche, défense à 700 (700 + 320 ≥ 1010) : le bot surcoinche, son partenaire aussi. À 680, non.
- Problème : la logique est juste, puisque cela ne coûte rien. Mais elle contredit la lecture « je tiens l'atout », et rien ne la signale au partenaire humain.
- Piste : l'afficher (« coinche libre »), ou garder la règle cohérente avec COI-6.
- Preuve : vérifié par exécution.

## COI-8 — La lecture des enchères ignore la coinche

- Lignes : engine.js 1532 et suivantes (`bidReadings`), l. 940.
- Catégorie : non-humain. Gravité : basse.
- Problème : la surcoinche se calcule comme si l'adversaire n'avait pas coinché. Un humain se méfie du coincheur, qui tient probablement l'atout. Le seuil de 0,9 compense en partie.
- Piste : réviser le poids des mondes après une coinche, pour que la main du coincheur y soit plus forte.
- Preuve : lecture du code (la lecture des annonces ne mentionne jamais la coinche).

## Ce qui fonctionne bien

- Les cas clairs sont cohérents :
  - V-9-x + As contre 120 ou 130 : coinche à 100 % ;
  - A-10-x + 2 As contre 110 : 7,5 % ;
  - 9 second + 2 As contre 100 : 0 %.
- Contre un capot, seul un pli d'atout sûr compte.
- Avec huit atouts, la défense ne coinche pas et le preneur surcoinche d'office.
- Le délai de réflexion (host.js) est tiré au hasard, indépendamment de la décision, prise à son échéance : un bot qui « réfléchit puis passe » ne trahit rien.
