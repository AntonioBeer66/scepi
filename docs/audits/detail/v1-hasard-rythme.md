# Vague 1 — Hasard, personnalité et rythme des bots

Rapport détaillé du sous-agent « hasard et rythme » (Haiku), moteur au commit `b548853`. Périmètre : `engine.js`, `host.js`, `game.js`, `client/host-worker.js`, `client/hud.js`. Vérifications :

- 8 donnes simulées avec 4 bots, graines fixes, trois horloges ;
- `host.js` exécuté avec des minuteurs factices.

Synthèse : [`../2026-10-bots-coinche.md`](../2026-10-bots-coinche.md).

## Sources de hasard qui touchent une décision de bot

| Ligne | Source | Effet visible | Verdict |
|---|---|---|---|
| engine.js:61, 94 | `rand = Math.random` ; `shuffle(…, r = Math.random)` | Le mélange des mondes passe par `Math.random`, pas par le `rand` des règles | Infrastructure |
| engine.js:226-227 | `aggr: 0.75 + rand()*0.6` | Une personnalité par siège et par partie | Inopérant (HAS-3) |
| engine.js:947 | `Math.random() < 0.8*aggr` | Surcoinche du preneur bot : la même main surcoinche avec une probabilité de 0,6 à 1 | Plausible mais rare |
| engine.js:1521, 1736-1753 | `Math.random()` dans `dealUnknown` et `mcWorlds` (6 appels) | Même position, choix différents d'une partie à l'autre | Bruit illisible |
| engine.js:2261 | `legal[Math.floor(rand()*legal.length)]` | Carte tirée au hasard au TIMEOUT (humain en retard, ou bot bloqué, voir HAS-1) | Plausible pour un humain, bruit pour un bot |
| engine.js:2067-2074, 2096-2113 | `tuning.now()` ; budgets de 250 et 150 ms, date limite de 400 ms (l. 558) | Le nombre de mondes, et les « je ne sais pas », varient avec la vitesse de l'appareil (HAS-2) | Bruit illisible |
| host.js:102 | `350 + random()*450` (+ pause, + fenêtre) | Délai de jeu | Amplitude plausible, loi uniforme (HAS-4) |
| host.js:110 | `300 + random()*1500` | Délai de surcoinche d'un bot preneur | Plausible |
| host.js:130 | `500 + random()*1200` | Délai de coinche d'un bot défenseur, sans lien avec la main | Plausible (voir HAS-6) |

Hors périmètre : `client/session.js:103` (`Math.random()*4`) tire le siège initial du spectateur, et engine.js:215 tire le donneur. Ni l'un ni l'autre n'est une décision de bot.

## HAS-1 — Bot repris en cours de tour : silence de 20 s, puis carte au hasard

- Lignes :
  - host.js:85-104 (le minuteur du bot ne se lance que si `G.tour` change, l. 101-104) ;
  - game.js:121-129 (`devenirBot` ne change pas `G.tour`) ;
  - session.js:143-144 ;
  - engine.js:2253-2263.
- Catégorie : non humain et non prédictible. Gravité : moyenne.
- Scénario : un humain quitte la table pendant son propre tour. Son siège devient bot, mais aucun nouveau minuteur n'est lancé. Le bot attend l'expiration du tour (jusqu'à 20 s), puis TIMEOUT joue une carte au hasard (phase JEU) ou passe (phase ENCHERES). En ligne, le repli du serveur (fiche.js:18-25) fait de même.
- Piste : inclure le siège et son type dans la clé de tour de host.js, pour relancer la décision du bot.
- Preuve : host.js exécuté avec des minuteurs factices.
  - Humain au tour 5 : minuteurs `[20000]`.
  - Passage en bot au même tour : aucun minuteur.
  - Expiration : envoi `[null, "TIMEOUT"]`.
  - Tour suivant : minuteurs `[20000, 575]`.
  Seul l'hôte a été testé ; le parcours dans le navigateur n'a pas été exécuté.

## HAS-2 — Décisions qui dépendent de la vitesse de l'appareil

- Lignes : engine.js:558, 574, 1490-1492, 2067-2074, 2096-2113.
- Catégorie : non prédictible et non humain. Gravité : moyenne.
- Scénario : sur un appareil lent ou chargé, le bot évalue moins de mondes, et une enchère peut tomber sur « je ne sais pas » (repli sur le barème). Même main et même graine : la partie diverge.
- Mesures :
  - horloge à 100 ms par lecture (cas extrême, non mesuré sur un vrai téléphone) : 8 donnes sur 8 divergent dès la première enchère (`E2:ENCHERIR:90` contre `110`) ;
  - horloge réelle de la machine d'audit : 0 donne sur 8 diverge ;
  - pic mesuré en phase JEU : 269 ms, au-dessus du budget de 250 ms.
- Piste : un budget fixe en nombre de mondes (déterministe) et un repli explicite plutôt que silencieux.
- Preuve : vérifié par exécution.

## HAS-3 — Personnalité quasi inexistante, et commentaire faux

- Lignes : engine.js:224-227 (commentaire « relève les enchères plus tôt », et tirage), 354-355, 947.
- Catégorie : non humain. Gravité : moyenne.
- Constat :
  - `personality(` et `.aggr` n'apparaissent qu'à la l. 947, pour la surcoinche. Les enchères ne lisent jamais `aggr`, contrairement à ce que dit le commentaire.
  - Le tirage a lieu une seule fois, dans `newGame` (l. 226) : un siège garde le même coefficient toute la partie.
  - Les quatre bots suivent la même logique d'enchère.
  - Rien n'est affiché côté client.
- Piste : appliquer `aggr` aux seuils d'enchère (par exemple `COMPETE_MARGIN` ou `force`), ou retirer le mécanisme et corriger le commentaire.
- Preuve : recherche exhaustive par grep.

## HAS-4 — Rythme uniforme, indépendant de la difficulté

- Lignes : host.js:101-102, 110, 130 ; session.js:158 (la dernière carte humaine, forcée, est jouée à 150 ms).
- Catégorie : non humain. Gravité : moyenne.
- Constat :
  - Le délai ne dépend jamais du nombre de cartes légales.
  - En simulation, 90 coups sur 256 en phase JEU (35 %) sont forcés et ne demandent aucun calcul.
  - Un coup avec choix prend environ 70 ms de calcul en moyenne (90e centile : environ 150 ms), une enchère 70 à 80 ms. Ce temps se perd dans 450 ms de bruit.
  - Une carte forcée attend donc au moins 350 ms, comme un coup réfléchi.
  - Les bornes fixes et la loi uniforme forment une signature repérable.
- Piste : un délai court (150 à 300 ms) pour les coups forcés, un délai plus long et asymétrique (log-normal) pour les enchères et les coups difficiles.
- Preuve : mesures sous Node sur la machine d'audit (pas dans un navigateur) ; loi uniforme lue dans le code.

## HAS-5 — Bruit d'échantillonnage non contrôlé

- Lignes : engine.js:60, 94, 1521, 1736-1753.
- Catégorie : non prédictible. Gravité : basse.
- Constat : le hasard des mondes vient de `Math.random`, hors du `rand` des règles. Le bot place ses tirages au hasard : c'est du bruit, pas une personnalité.
- Piste : une graine dédiée par coup, et du hasard réservé aux choix quasi équivalents.
- Preuve : lecture du code.

## HAS-6 — Fenêtre de coinche : les bots défenseurs ne l'attendent pas

- Lignes : host.js:21 (`COINCHE_WINDOW_MS = 1800`), 95-102, 128-141 ; hud.js:24 (`COINCHE_ARM_MS = 600`).
- Catégorie : non humain. Gravité : basse.
- Constat :
  - La pause de 1,8 s ne s'applique qu'au bot qui suit une annonce chiffrée, et seulement si un humain est en défense.
  - Les bots défenseurs décident en 0,5 à 1,7 s sans l'attendre : un bot peut coincher avant que l'humain ait pu réagir.
  - Pas de fuite d'information : ce délai ne dépend pas de la main.
  - Cas rare : 0 coinche avec l'horloge rapide, 3 avec l'horloge lente, sur 8 donnes.
- Piste : quand un humain défend, retarder les minuteurs des bots défenseurs d'au moins `COINCHE_WINDOW_MS`.
- Preuve : lecture du code.

## HAS-7 — L'état public expose la personnalité et la mémoire d'enchère

- Lignes : game.js:145-155 (`playerView` renvoie `...G`) ; host.js:33-35 (`seatView` masque la mémoire des autres sièges).
- Catégorie : rend le bot prévisible pour qui lit l'état (fuite d'information). Gravité : basse.
- Constat : chaque client reçoit `G.personalities` et `G.bidMemo` (champ `supported`, engine.js:697-750). C'est le contraire du masquage prévu dans host.js.
- Piste : filtrer ces champs dans `playerView` pour tous les sièges sauf l'hôte.
- Preuve : lecture du code, non vérifié dans un navigateur.

## HAS-8 — Commentaires de rythme périmés

- host.js:2 dit « résultat affiché 5 s » : c'est 4 s en réalité (engine.js:54).
- host.js:11 dit « 0,6 s » : la constante vaut 900 ms.
- Catégorie : aucune. Gravité : basse.
- Piste : corriger les commentaires.

## Réponses aux questions du cahier des charges

- **Délais.** Jeu : 350 à 800 ms. Surcoinche : 300 à 1 800 ms. Coinche : 500 à 1 700 ms. S'y ajoutent 900 ms après un pli (host.js:15-20). Aucun ne dépend de la difficulté du coup (HAS-4).
- **Personnalité.** Elle est fixée par siège pour toute la partie, et invisible (HAS-3).
- **Calcul plus long que le délai.** Les deux s'additionnent : le calcul est synchrone et ne démarre qu'à l'échéance du minuteur (host.js:103). Rien ne plafonne le total ; les budgets ne bornent que le calcul (HAS-2).
- **TIMEOUT.** La carte jouée d'office est tirée au hasard (`rand()`). Un bot n'y est exposé que dans le cas HAS-1 : son délai normal (800 ms au plus, calcul compris) reste très inférieur à 20 s.
- **Silence de `botSend`.** Le cas existe en lecture du code (host.js:64 et 67), mais il n'a jamais été observé en simulation (aucune décision nulle) ; il n'est donc pas retenu comme constat.
