# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Joueurs (majorité, confirmé)** : membres de SCEP Invaders et leurs amis qui viennent jouer à la coinche en ligne ou aux échecs, souvent sur téléphone, parfois sur des appareils anciens (voir l'appli Android, une WebView).
- **Étudiants de l'ESCP (confirmé)** : ils découvrent l'asso, ses activités et ses événements, et cherchent comment la rejoindre.
- **Partenaires (occasionnels, confirmé)** : l'ESCP, des sponsors ou partenaires (Nintendo, Autorité Nationale des Jeux…) qui jugent le sérieux de l'asso.

## Product Purpose

Le site de SCEP Invaders, l'association de jeux de l'ESCP (jeux vidéo, jeux de société, nouvelles technologies). Il sert d'abord de salle de jeu en ligne (coinche multijoueur selon les règles de l'Amicale, échecs contre des bots), puis de vitrine de l'asso : présentation, événements, actus, contact. Réussite : on lance une partie en quelques secondes, et un visiteur comprend ce qu'est l'asso et comment la rejoindre.

## Positioning

Une asso étudiante qui a codé ses propres jeux : la coinche en ligne suit exactement les règles de l'Amicale (REGLES_COINCHE.md), avec lobbys libres et bots, jouable dans le navigateur sans rien installer.

## Operating Context

- Parties de coinche entre deux cours, sur téléphone, à quatre, en lobbys qu'on rejoint en choisissant un nom.
- Les infos d'événements sont publiées d'abord sur Instagram (@scepinvaders) ; le site les reprend.
- Environ un événement marquant par an, plus des sorties informelles.

## Capabilities and Constraints

- Site statique (`site/`) + serveur de jeu, servis par un seul Cloudflare Worker (scepinvaders.com) ; build Vite pour les jeux ; appli Android WebView.
- Compatibilité navigateurs anciens requise pour les jeux (cible es2020, pas de `structuredClone`, `.at`, `roundRect`).
- Pas de formulaire, d'inscription ni de compte.
- Pages : Accueil, L'asso, Jeux (coinche, échecs), Nos événements, Actus, Contact, Mentions légales.

## Brand Commitments

- Nom : SCEP Invaders (« scepi » en familier). Ton tutoyant, détendu, humour étudiant.
- Logos dans `Logos/` (copies web dans `site/assets/images/`) et mascotte Invadachan : jamais déformés, recadrés ni recolorés.
- `DIRECTION_ARTISTIQUE.md` est la direction visuelle de travail (violet/or, vert réservé à la coinche).

## Evidence on Hand

- Photos réelles d'événements dans `site/assets/images/events/` (laser tag, Career Fair Nintendo, WEI, sorties).
- Label « Essential Society » trois années de suite (affiché sur l'accueil).
- Pas de témoignages, chiffres d'adhérents ni logos partenaires fournis : ne pas en inventer.

## Product Principles

1. Jouer d'abord : l'accès à une partie est toujours à un clic.
2. Mobile et vieux téléphones sont des cas normaux, pas des exceptions.
3. Le vrai visage de l'asso (photos, ton, mascotte) plutôt que des visuels génériques.
4. Ne rien affirmer que l'asso n'a pas fourni.
