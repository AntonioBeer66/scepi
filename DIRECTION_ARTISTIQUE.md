# SCEP Invaders — Direction artistique

Statut : direction proposée pour guider la conception du site. Les couleurs d'interface et dimensions ci-dessous sont des choix de travail, pas une charte officielle existante.

## Intention

Créer un site moderne, identifiable dès le premier écran comme celui de SCEP Invaders, l'association de jeux vidéo de l'ESCP. Associer l'univers spatial et arcade des logos à une interface contemporaine : composition aérée, grands titres, visuels forts et navigation simple.

Le caractère gaming vient des emblèmes, des touches de pixels et de la lumière. La lisibilité et les contenus de l'association restent prioritaires. Éviter de transformer toute l'interface en écran de jeu rétro.

## Identité existante et logos

Les fichiers de référence proviennent du dossier `Logos/` de `main`, consulté au commit `8139e02` et repris localement sur `antonio`. Conserver les originaux intacts ; préparer séparément les éventuels exports web.

Les visuels examinés présentent un emblème spatial triangulaire, une couronne de lauriers, des étoiles, un alien pixelisé et le nom SCEP Invaders. Ces éléments constituent le vocabulaire graphique du site.

| Fichier | Usage proposé |
| --- | --- |
| `Logos/0.logo_scepi_revisité_qualitatif.png` | Emblème principal violet/or, grand format sur l'accueil et présentation de l'asso |
| `Logos/scepi_logo_vert_v2.png` | Variante arcade, principalement pour la rubrique coinche ou une mise en avant ponctuelle |
| `Logos/scepi_logo_blanc_v2.png` | Variante envisagée pour la navigation sur fond sombre, après vérification du rendu et de la transparence |
| `Logos/invadachan.png` | Mascotte secondaire accompagnant la sélection d'animé ou un message convivial |

Les autres variantes noires, blanches et en dégradé du dossier restent disponibles ; leur rendu doit être vérifié sur le fond final avant utilisation. La prévisualisation du logo blanc sur fond blanc ne permet pas d'évaluer sa lisibilité.

### Mise en évidence des logos

- Sur l'accueil, placer le logo coloré complet dans le premier écran, à côté du titre sur ordinateur et au-dessus ou sous le titre sur mobile.
- Taille indicative : 300 à 420 px de large sur ordinateur, 180 à 240 px sur mobile, dans la limite de l'espace disponible.
- Dans l'en-tête de toutes les pages, afficher un logo de 48 à 64 px de haut accompagné du nom SCEP Invaders en texte lisible. Le lien ramène à l'accueil.
- Réutiliser une version adaptée dans le pied de page, avec LinkedIn et Instagram.
- Conserver les proportions, les couleurs natives et l'intégralité de l'emblème. Ne pas étirer, découper les lauriers, recolorer par filtre CSS ou remplacer le logo par une recréation.
- Laisser autour du logo une marge libre d'au moins 10 % de sa largeur. Ne pas le placer sur une photo chargée.
- Vérifier la transparence réelle des PNG ; si un fond opaque existe, adapter le support ou préparer un export dédié sans modifier l'original.
- Pour les petits formats, privilégier le nom lisible à côté de l'emblème. Une éventuelle icône simplifiée ou un favicon devra faire l'objet d'un export spécifique, pas d'un recadrage improvisé.

## Palette proposée

La palette principale s'inspire visuellement du logo coloré : violet profond, or et ambre. Les codes ci-dessous sont des propositions pour l'interface, et non des valeurs extraites précisément des fichiers.

| Rôle | Couleur proposée | Usage |
| --- | --- | --- |
| Fond principal | `#0C0914` | Fond sombre presque noir |
| Surface | `#181127` | Cartes et blocs de contenu |
| Violet identitaire | `#281747` | Grands aplats, rappels de l'emblème |
| Or | `#F4C600` | Bouton principal, repères et détails importants |
| Ambre | `#D87924` | Accent chaud et halo décoratif discret |
| Texte principal | `#F7F4FC` | Titres et paragraphes |
| Texte secondaire | `#BDB5CD` | Dates, légendes et informations complémentaires |
| Vert arcade | `#39FF14` | Accent local dans la coinche, inspiré de la variante verte |

Privilégier les surfaces sombres et réserver les couleurs vives à quelques éléments. Ne pas donner la même importance à l'or et au vert sur une page. Sur les boutons or ou vert, utiliser un texte sombre. Vérifier les contrastes des associations finales, notamment les textes secondaires et les états interactifs.

## Typographie

- Titres : sans-serif géométrique, avec une présence forte et des formes légèrement techniques.
- Texte courant : sans-serif sobre, confortable pour lire les présentations et les règles de coinche ; démarrer avec une pile système (`system-ui`, `Segoe UI`, sans-serif).
- Petits labels, scores et repères : monospace possible pour évoquer l'arcade.
- Limiter la composition à deux familles principales. Choisir et vérifier la licence d'une éventuelle police de titre avant de l'intégrer ; privilégier un hébergement local des fichiers.
- Réserver les capitales aux titres courts et labels. Pas de paragraphes en police pixel ou en capitales.
- Repères : texte courant 16 à 18 px, interligne autour de 1,6 ; titre d'accueil 48 à 72 px sur ordinateur et 32 à 44 px sur mobile.

## Composition et composants

- Largeur de lecture maximale d'environ 1 200 px, avec des marges latérales de 20 à 24 px sur mobile.
- Espacements généreux, basés sur des multiples de 8 px ; distinguer nettement les sections.
- Navigation commune avec les cinq intitulés : Accueil, L'asso, Coinche, Nos événements, Contact.
- En-tête sombre, éventuellement fixe si sa hauteur reste raisonnable ; menu mobile accessible et facilement refermable.
- Boutons nets, hauteur minimale visée de 44 px, coins légèrement arrondis. Une action principale par zone et des actions secondaires moins marquées.
- Cartes avec visuel, titre, court texte et lien clair ; bordures fines et rayons de 12 à 16 px. Les longs textes restent sur des surfaces simples.
- Fonds spatiaux subtils : quelques étoiles, une grille discrète ou un halo derrière le logo. Utiliser ces motifs surtout dans les zones d'ouverture, sans les répéter derrière chaque paragraphe.
- Éviter les panneaux translucides généralisés, les néons omniprésents et les effets de terminal qui réduisent la lisibilité.

## Déclinaison par page

### Accueil

1. Premier écran : grand logo coloré, nom SCEP Invaders, courte présentation de l'association ESCP. Actions « Découvrir l'asso » et « Voir nos événements ».
2. Jeu & animé du moment : deux grandes cartes de poids équivalent avec visuel, titre et recommandation de l'asso. Invadachan peut accompagner la carte animé sans masquer son contenu.
3. Actualités et prochain événement : une mise en avant claire, avec date et inscription seulement lorsqu'elles sont connues.
4. Coinche : bloc distinct avec accent vert, présentant les règles et, lorsqu'il est disponible, l'accès au jeu. Avant cela, proposer « Découvrir les règles » uniquement lorsque ces règles sont publiées.
5. Instagram : quelques publications sélectionnées, intégrées dans une section cohérente avec le site et accompagnées d'un lien vers le compte.

### L'asso

Mettre en scène l'emblème, une présentation humaine et des photos de l'équipe. Présenter le bureau avec des portraits cohérents et des rôles lisibles. Faire comprendre comment rejoindre l'association.

### Coinche

Conserver la navigation et l'identité globale, avec un accent arcade vert. Pour la table de jeu, privilégier la lisibilité des cartes, de l'atout, des annonces et du score. Les couleurs et symboles des cartes gardent leur sens habituel ; la décoration ne doit pas gêner la partie.

### Nos événements

Donner au prochain événement une grande affiche et des informations pratiques immédiatement visibles. Regrouper ensuite les éditions précédentes en cartes avec année, photo et récapitulatif. Le faible nombre d'événements ne justifie pas un calendrier visuellement vide.

### Contact

Page sobre : contact de l'association, partenariats, LinkedIn et Instagram. Garder le logo bien visible et les liens explicites. Ne pas utiliser automatiquement l'adresse Git personnelle comme adresse publique de l'association.

## Instagram, images et mouvement

- Prévoir un état initial soigné pour Instagram : titre, explication courte, bouton de chargement et lien externe. Suivre les modalités techniques décrites dans `TECHNIQUE.md`.
- Accepter le style natif des publications intégrées ; ne pas compter sur leur personnalisation interne pour assurer la cohérence du site.
- Utiliser les photos de l'asso et les visuels de jeux/animés disponibles avec les droits nécessaires. Garder un traitement cohérent et éviter les banques d'images génériques en remplacement de l'identité réelle.
- L'utilisateur indique que l'utilisation des logos fournis et de la mascotte est normalement autorisée ; ils constituent la base de travail du site.
- Pour ce site public, ne pas ajouter d'affiches, captures ou personnages tiers sans autorisation identifiée. Sans visuel autorisé, présenter le jeu ou l'animé par son titre, le commentaire de l'asso et un décor original CSS/SVG.
- Consigner les sources, licences et attributions des ressources externes retenues dans un futur `CREDITS.md`, avec les crédits publics requis. Les modalités d'implémentation sont intégrées à la section 3 de `TECHNIQUE.md`.
- Animations courtes et discrètes : transition de bouton ou légère apparition, généralement 150 à 250 ms.
- Respecter `prefers-reduced-motion`. Aucun clignotement, curseur personnalisé imposé, son automatique ou animation permanente indispensable à la compréhension.
- Les décorations sont ignorées par les lecteurs d'écran ; les logos-liens et les images de contenu ont des alternatives adaptées.

## Critères de validation visuelle

- Le logo SCEP Invaders est identifiable dès l'arrivée sur le site, sur mobile comme sur ordinateur.
- L'ensemble évoque le spatial et l'arcade tout en restant moderne, aéré et lisible.
- Le violet et l'or structurent l'identité ; le vert reste un accent ciblé.
- Les cinq onglets sont immédiatement compréhensibles et accessibles au clavier.
- Le jeu et l'animé du moment disposent chacun d'une vraie mise en avant.
- Les textes restent lisibles sur tous les fonds et les états de focus sont visibles.
- Aucun logo n'est déformé, tronqué ou noyé dans les effets.
- Le rendu reste cohérent sans chargement Instagram et sans animations.

## Documents associés

- [Objectifs et rubriques](README.md)
- [Cadrage technique](TECHNIQUE.md)
- [Logos sources](Logos/)
