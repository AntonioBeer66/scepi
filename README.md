Projet de site web de SCEPI

## Aperçu de l'interface

Une première ébauche statique des six pages se trouve dans `site/`. Elle applique la direction artistique SCEP Invaders : violet/or, logos existants, mascotte et accents verts pour la coinche. Les illustrations complémentaires sont réalisées en CSS et en SVG, sans images tierces.

La page d'accueil s'ouvre sur un diaporama plein écran inspiré du style Tesla : une image par thème (gaming, jeux de société/coinche, événements, communauté), un texte minimal centré, un seul bouton d'action et des points de pagination en bas d'écran. Les visuels de ce diaporama (`site/assets/images/*-hero.svg`) sont des illustrations vectorielles génériques tenant lieu de placeholders, à remplacer par de vraies photos/illustrations de l'association.

Les textes du site s'appuient sur le rapport d'activité S2 2025-2026 remis à l'ESCP et sur le dossier de financement Switch 2 : mission officielle centrée sur les jeux vidéo, les jeux de société/cartes et les nouvelles technologies (pas d'axe animé), tournoi de poker avec l'Autorité Nationale des Jeux, tournois internes (Mario Kart, Smash Bros), partenariat Nintendo au Career Fair, prêt de la Switch au BDE pour l'ACA.

Depuis la racine du dépôt, lancer un serveur local avec Python :

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory site
```

Ouvrir ensuite `http://127.0.0.1:8000/`. Aucun téléchargement de dépendances ni compilation n'est nécessaire. Le dossier `site/` est autonome pour l'hébergement statique.

Cette version est uniquement visuelle : navigation et menu mobile opérationnels, mais pas de partie de coinche, formulaire, inscription ou connexion Instagram. Les textes sont une proposition de présentation et les informations non fournies restent signalées comme à venir. Les originaux des logos restent dans `Logos/`, avec des copies de diffusion dans `site/assets/images/`.

Voir le [cadrage technique](TECHNIQUE.md) pour l'architecture envisagée, l'hébergement OVH, l'intégration Instagram et la coinche en ligne.

Voir la [direction artistique](DIRECTION_ARTISTIQUE.md) pour l'univers SCEP Invaders, la mise en valeur des logos et les principes visuels du site.

## Objectifs du site

- Faire découvrir l'association, ses membres et ses activités.
- Mettre en avant nos événements et faciliter la prise de contact.
- Partager nos découvertes de jeux vidéo et de jeux de société (ou autre, peut vite fait remplacer le guide de l'invaders, permet aussi de remplir l'espace vide)
- Proposer un jeu de coinche en ligne suivant les règles de l'Amicale.
- Donner accès à nos réseaux : LinkedIn et Instagram.

## Les six onglets

### Accueil

- Présentation rapide de SCEPI.
- Actualités de l'association.
- Rubrique « Jeu du moment » : une image, une courte présentation et le mot de l'asso pour chaque sélection.
- Mise en avant du prochain événement.

### L'asso

- Histoire et identité de SCEPI.
- Présentation du bureau.
- Les jeux auxquels on joue.

### Coinche

Voir la [spécification du moteur de coinche en ligne](REGLES_COINCHE.md) : adaptation du manuel, actions autorisées, cartes jouables, délais et calcul des scores. Les conventions propres à la version en ligne y sont indiquées explicitement.

- Retrouver les règles de l'Amicale avant de programmer le jeu.
- Publier les règles et un tutoriel pour apprendre à jouer.
- Développer un jeu de coinche en ligne.
- avoir 4-5 lobbys de 4 qu'on peut rejoindre librement, on doit juste choisir un nom quand on rentre
- chaque joueur a 30s pour jouer une carte (ou enchérir), s'il ne le fait pas une carte jouable est jouée au hasard

### Échecs

- Partie locale contre des profils de bots aux styles différents.
- Échiquier interactif avec sélection ou glisser-déposer des pièces blanches.
- Choix du profil adverse et de la couleur jouée.
- Historique des coups, indications de partie et possibilité de recommencer.

### Nos événements

- Présentation du prochain événement : informations pratiques, date et modalités d'inscription.
- Photos, souvenirs et récapitulatifs des éditions précédentes.
- Le rythme actuel est d'environ un événement par an ; une page dédiée suffit, sans agenda complexe.

### Contact

- Informations pour contacter l'association.
- Propositions de partenariat.
- Liens vers LinkedIn et Instagram, également accessibles dans le pied de page du site.
