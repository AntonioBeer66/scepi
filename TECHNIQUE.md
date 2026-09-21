# SCEPI — Cadrage technique

Statut : première proposition, à faire évoluer lors du développement.

## 1. Périmètre

Créer le site de l'association de jeux vidéo de l'ESCP avec cinq onglets :

| Onglet | Contenu prévu |
| --- | --- |
| Accueil | Présentation courte, actualités, jeu du moment, prochain événement, aperçu Instagram |
| L'asso | Histoire, bureau, jeux pratiqués et modalités pour rejoindre l'association |
| Coinche | Règles de l'Amicale, tutoriel, puis accès au jeu multijoueur |
| Nos événements | Prochain événement, inscriptions et archives des éditions précédentes |
| Contact | Coordonnées, partenariats, liens LinkedIn et Instagram |

Environ un événement est organisé par an : une page de présentation et des archives suffisent au départ. Les réseaux utilisés sont LinkedIn et Instagram.

## 2. Base technique retenue pour démarrer

- HTML pour la structure des pages et leur contenu.
- CSS pour l'identité visuelle, les mises en page et l'adaptation aux téléphones.
- JavaScript pour le menu mobile, les interactions et les futurs composants du jeu.
- Site de présentation statique, sans base de données ni serveur applicatif obligatoire pour cette première version.
- Aucun framework nécessaire à ce stade. Réévaluer ce choix si l'interface de la coinche le justifie.

Les informations essentielles restent lisibles sans JavaScript. Le jeu multijoueur constituera une fonctionnalité distincte, accessible depuis le même site.

## 3. Organisation proposée des fichiers

Les cinq pages HTML, les styles communs, le menu mobile et les copies des logos sont créés dans `site/` pour une première ébauche visuelle. Le module Instagram reste une cible ultérieure ; il n'est pas encore créé et aucun service externe n'est chargé.

```text
README.md
TECHNIQUE.md
DIRECTION_ARTISTIQUE.md
Logos/
site/
  index.html
  asso/index.html
  coinche/index.html
  evenements/index.html
  contact/index.html
  assets/
    css/styles.css
    js/main.js
    js/instagram.js
    images/
```

Au départ, les contenus sont modifiés directement dans les pages HTML. Les styles et scripts sont partagés. Une solution de gestion de contenu pourra être étudiée si le bureau doit publier sans modifier de fichiers.

Pour le jeu du moment, prévoir un titre, un visuel autorisé facultatif, un court résumé, le commentaire de l'asso et une date de mise à jour. Sans visuel autorisé, utiliser une composition typographique et un décor original. Pour les événements : titre, date, lieu, description, visuel et lien d'inscription lorsqu'il existe.

### Direction artistique intégrée à l'implémentation

Le site adopte un univers **SCEP Invaders spatial et arcade, dans une esthétique moderne**. La [direction artistique détaillée](DIRECTION_ARTISTIQUE.md) complète les exigences techniques ci-dessous : composition aérée, grands titres, logos visibles et effets discrets.

#### Logos et identité

- Utiliser les fichiers existants de `Logos/`, récupérés depuis `main`, et préserver les originaux. L'utilisateur indique que leur utilisation, ainsi que celle de la mascotte, est normalement autorisée ; cette indication constitue la base de travail, pas une vérification juridique indépendante.
- Sur l'accueil, mettre en évidence `Logos/0.logo_scepi_revisité_qualitatif.png` dès le premier écran : largeur indicative de 300 à 420 px sur ordinateur et de 180 à 240 px sur mobile.
- Dans la navigation, prévoir un emblème de 48 à 64 px de haut et le nom SCEP Invaders en texte. Vérifier le rendu de `Logos/scepi_logo_blanc_v2.png` sur fond sombre avant de retenir cette variante.
- Réserver `Logos/scepi_logo_vert_v2.png` aux accents arcade, notamment la coinche. Utiliser `Logos/invadachan.png` comme mascotte secondaire près des contenus jeux de société / conviviaux.
- Conserver les proportions et les couleurs des logos : `object-fit: contain`, dimensions explicites et espace libre autour de l'emblème. Ne pas rogner les lauriers ou appliquer de filtre de recoloration.
- Préparer les exports optimisés dans `site/assets/images/`, vérifier leur transparence et conserver les sources dans `Logos/`.

#### Variables CSS et typographie

Centraliser dans `site/assets/css/styles.css` les couleurs proposées, à ajuster après vérification du rendu et des contrastes :

```css
:root {
  --color-bg: #0c0914;
  --color-surface: #181127;
  --color-brand: #281747;
  --color-accent: #f4c600;
  --color-amber: #d87924;
  --color-text: #f7f4fc;
  --color-muted: #bdb5cd;
  --color-arcade: #39ff14;
  --content-max: 75rem;
  --radius-card: 0.875rem;
  --font-body: system-ui, "Segoe UI", sans-serif;
}
```

Le violet et l'or structurent le site ; le vert reste un accent local. Utiliser un texte sombre sur les boutons or ou vert. Ces valeurs sont des propositions d'interface inspirées des logos, pas des couleurs officielles mesurées.

Prévoir des titres géométriques, un corps de texte de 16 à 18 px avec un interligne d'environ 1,6 et, si utile, des labels de scores monospace. Limiter les familles principales à deux ; toute police ajoutée doit disposer d'une licence adaptée et être de préférence hébergée localement.

#### Mise en page et interactions

- Concevoir d'abord pour le mobile : marges de 20 à 24 px, largeur maximale de 1 200 px et absence de débordement horizontal.
- Utiliser Grid ou Flexbox pour placer le logo et le texte côte à côte sur grand écran, puis les empiler sur petit écran.
- Sur l'accueil : présentation et grand logo, deux cartes « Jeu du moment » (jeux vidéo / jeux de société), actualités et prochain événement, coinche, puis Instagram.
- Conserver les cinq onglets et l'identité commune sur toutes les pages. Présenter le bureau avec des portraits, les événements avec une mise en avant et des archives, et le contact dans une composition sobre.
- Pour la coinche, garder les cartes, annonces, atout et scores prioritaires sur la décoration ; conserver les symboles et couleurs usuels des cartes.
- Prévoir des cibles interactives d'au moins 44 px, des états de focus visibles et un menu mobile utilisable au clavier.
- Créer les décors spatiaux avec des formes originales CSS/SVG : étoiles, grille légère et halo discret, sans gêner les textes.
- Limiter les transitions à environ 150–250 ms et respecter `prefers-reduced-motion`. Aucun son automatique ni clignotement.
- Réserver l'espace des images pour stabiliser la mise en page ; charger les médias secondaires à la demande, sans retarder le logo principal visible au chargement.
- Prévoir un état Instagram cohérent avec la palette avant chargement et en cas d'échec, en conservant le lien vers le compte.

#### Visuels pour un site public

- Employer les ressources de l'association, des créations originales ou des ressources disposant d'une autorisation ou d'une licence adaptée à la publication prévue.
- Ne pas ajouter d'affiches, captures de jeux ou personnages trouvés en ligne sans autorisation identifiée. Les cartes de recommandation doivent fonctionner sans ces images.
- Pour chaque ressource externe retenue, consigner sa source, son auteur, sa licence ou autorisation et l'attribution éventuelle dans un futur fichier `CREDITS.md`. Afficher les crédits sur le site lorsque les conditions l'exigent.
- Pour les publications Instagram, privilégier l'intégration officielle prévue en section 5 plutôt que la copie des images dans le dépôt.

## 4. Domaine et hébergement à choisir

Le domaine `scepinvaders.com` est enregistré chez OVH. Les services présentés comprennent la zone DNS et les services e-mail Zimbra / MX Plan. L'association confirme qu'aucun hébergement web n'est encore souscrit.

Le développement peut commencer localement. L'hébergement sera choisi avant la publication, selon les besoins du site et du futur serveur de coinche. Le domaine peut rester chez OVH même si l'hébergement retenu est ailleurs.

La première version sera livrée sous forme de fichiers statiques. Avant publication, vérifier le domaine, le dossier public, l'accès de transfert disponible et la configuration HTTPS. Ne pas supposer que le dossier public porte un nom particulier.

Critères pour choisir l'hébergement et préparer la publication :

| Besoin | Option envisagée | Condition à vérifier |
| --- | --- | --- |
| Pages de présentation | Fichiers HTML/CSS/JavaScript | Accès au dossier public de l'hébergement |
| Contact initial | Adresse e-mail et liens sociaux | Coordonnées de l'association |
| Formulaire de contact ultérieur | Traitement PHP côté serveur | Version PHP, service d'envoi, protection contre les abus |
| Coinche multijoueur | Serveur JavaScript avec Node.js et WebSocket | Processus persistant et connexions WebSocket autorisés |
| Serveur de jeu séparé si nécessaire | Hébergement compatible, éventuellement VPS | Choix du service, budget et maintenance à définir |

Ne pas choisir de version de serveur ou souscrire de service avant ces vérifications. Aucun secret ni identifiant de connexion ne doit être enregistré dans Git.

## 5. Intégration Instagram

### Première version proposée

- Prévoir une rubrique « Sur Instagram » sur l'accueil.
- Afficher un lien permanent vers le compte de SCEPI.
- Étudier l'intégration officielle de quelques publications sélectionnées, à partir des liens fournis par l'association.
- Vérifier que le compte et les publications permettent effectivement l'intégration ; ne pas promettre un fil automatique à ce stade.
- Charger le contenu externe uniquement après une action explicite « Afficher les publications Instagram », avec une courte explication indiquant que le contenu provient de Meta.
- Garder un lien « Voir sur Instagram » si l'intégration est indisponible ou bloquée.
- Réserver l'espace du composant pour limiter les déplacements de mise en page, et vérifier son rendu mobile.

Ce choix de chargement différé vise à maîtriser les requêtes externes et les performances. Les exigences applicables en matière de consentement et d'information devront être vérifiées avant publication.

### Évolution éventuelle : fil automatique

Un fil qui récupère automatiquement les dernières publications nécessite une étude distincte : éligibilité du compte, API et autorisations Meta actuelles, éventuel fournisseur tiers, coût et maintenance. Si une API nécessite un secret, celui-ci reste côté serveur ; prévoir alors un cache et un comportement de repli en cas d'erreur. Ne pas utiliser de scraping.

La documentation officielle Meta n'a pas pu être consultée lors de ce cadrage (erreur HTTP 429). Les conditions techniques exactes restent donc à vérifier avant implémentation.

## 6. Coinche en ligne

### Prérequis fonctionnel

Le manuel de l'Amicale est adapté en spécification serveur dans [REGLES_COINCHE.md](REGLES_COINCHE.md) : états, actions, cartes légales, délais, reconnexion et scores. Ce fichier est la référence fonctionnelle du moteur. Sa section 1 distingue les conventions V1 des règles explicitement issues du manuel, notamment le mélange automatique à chaque donne, le score du contrat « 80 » et la montée à l'atout. Centraliser ces choix dans un profil de règles versionné, fixé pour toute la partie. La section 11 décrit les cas de validation du moteur.

### Architecture envisagée

- Interface dans le navigateur en JavaScript.
- Serveur Node.js, sous réserve de compatibilité de l'hébergement retenu.
- Échanges en temps réel via WebSocket sécurisé en production.
- Le serveur distribue les cartes, contrôle les actions et calcule les scores.
- Chaque joueur ne reçoit que les informations auxquelles il a droit, notamment sa propre main.

### Première version jouable proposée

- Quatre à cinq salons ouverts de quatre places, accessibles librement en choisissant un pseudonyme, conformément au README.
- Quatre joueurs, deux équipes et pseudonymes, sans comptes obligatoires au départ.
- Annonces, tours de jeu et tableau des scores conformes aux règles validées.
- Chaque joueur dispose de 15 secondes pour jouer une carte ; à expiration, le serveur choisit au hasard une carte autorisée. Le serveur contrôle le délai et empêche qu'une action tardive joue une seconde carte.
- Reconnexion avec identité de session ; un pseudonyme seul ne permet pas de reprendre une place.
- Gestion explicite d'un joueur absent ou déconnecté.

La conservation des parties après redémarrage du serveur reste à définir. Les classements, comptes et tournois sont des évolutions possibles, hors première version. Tester les règles, les scores, les coups invalides et la reconnexion avant ouverture du jeu.

## 7. Qualité attendue

- Affichage adapté au téléphone et à l'ordinateur, navigation clavier, focus visible et textes alternatifs pertinents.
- Images optimisées et chargement différé des médias secondaires.
- Titres de pages et descriptions adaptés à chaque rubrique.
- Aucun lien d'inscription ou de contact fictif présenté comme fonctionnel.
- Site utilisable lorsque le composant Instagram est indisponible.
- Vérification des liens, des cinq pages et du rendu mobile avant publication.
- Vérification des droits sur les visuels et préparation des informations légales et de confidentialité selon les fonctions réellement déployées.

## 8. Ordre de réalisation

1. Créer les cinq pages et la navigation commune.
2. Appliquer la direction artistique intégrée en section 3 et intégrer les contenus disponibles, dont le jeu du moment.
3. Ajouter les liens sociaux et essayer l'intégration Instagram avec le vrai compte.
4. Choisir l'hébergement, préparer le déploiement et le raccordement de `scepinvaders.com`, puis vérifier le site sur cet environnement en préservant les réglages de messagerie existants.
5. Formaliser les règles de coinche, puis développer et tester le multijoueur.

Le développement se déroule sur `antonio`, actuellement liée à `origin/Antonio`. Un push vers `main` attend une demande explicite.

## 9. Informations à récupérer au fil du projet

- Budget et choix de l'hébergement, puis modalités de déploiement pour `scepinvaders.com`.
- Photos et présentation du bureau ; les logos sont disponibles dans `Logos/` et la palette proposée est documentée en section 3.
- Liens LinkedIn et Instagram, publications à mettre en avant.
- Coordonnées de contact, prochain événement et éventuel lien d'inscription.
- Première sélection de jeu du moment.
- Règles de coinche de l'Amicale.

Ces informations ne bloquent pas la création de la structure statique.

## Références à consulter lors de l'implémentation

- [OVH — Versions disponibles des langages](https://docs.ovhcloud.com/fr/guides/web-cloud/web-hosting/web-hosting-main-info)
- [OVH — Gestion des moteurs d'exécution Cloud Web](https://docs.ovhcloud.com/fr/guides/web-cloud/web-hosting/manage-runtime-software-applications)
- [Meta — Instagram oEmbed](https://developers.facebook.com/docs/instagram-platform/oembed/)
