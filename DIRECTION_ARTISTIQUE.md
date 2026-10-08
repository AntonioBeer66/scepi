# SCEP Invaders — Direction artistique

Ce document décrit le site tel qu'il est et les règles pour le faire évoluer
sans le dénaturer. Les valeurs viennent de `site/assets/css/styles.css` ; en
cas d'écart, c'est le CSS qui a raison et ce document qu'il faut corriger.

## L'idée en une phrase

Le club de jeux de l'ESCP, vu comme une borne d'arcade dans l'espace : fond
nuit violette, or des lauriers de l'emblème, envahisseurs en pixels — mais
une interface d'aujourd'hui, aérée, qui se lit avant de se regarder.

Le jeu se voit dans les **emblèmes, les envahisseurs pixelisés, la lumière
dorée et les cartes** ; jamais dans des effets qui gênent la lecture (texte
en police pixel, néons partout, faux terminal).

## Couleurs

Fond sombre partout. L'or est la couleur de l'action ; le vert n'appartient
qu'à la coinche ; le violet clair sert de troisième ton, avec parcimonie.

| Jeton | Valeur | Rôle |
| --- | --- | --- |
| `--bg` | `#0C0914` | Fond de page, nuit violette presque noire |
| `--surface` | `#181127` | Panneaux (règles, échecs, partie) |
| carte | `#120D1D` | Cartes de contenu et blocs de l'accueil |
| `--brand` | `#281747` | Grands aplats violets, rappel de l'emblème |
| `--gold` | `#F4C600` | Bouton principal, page active, repères, dates |
| `--text` | `#F7F4FC` | Titres et texte important |
| `--muted` | `#BDB5CD` | Paragraphes, légendes |
| `--line` | `#FFFFFF19` | Filets et bordures |
| `--green` | `#39FF14` | Coinche uniquement (accent, « à toi », score de ton équipe) |
| violet clair | `#A98BFF` | Troisième ton des pictogrammes, avec l'or et le vert |

- **Une seule action en or par zone.** Les actions secondaires sont des
  boutons à contour.
- **Texte sombre sur l'or et sur le vert** (`#181127`, `#241A00`).
- **Rouge** réservé aux couleurs des cartes (`#FF6B6B` sur fond sombre) et
  aux actions risquées (abandonner, quitter).
- L'ambre envisagé au départ n'est pas utilisé : ne pas l'introduire sans
  raison.

## Typographie

| Rôle | Police | Réglages |
| --- | --- | --- |
| Titres | **Oxanium** 500–800, hébergée dans `assets/fonts/` (SIL OFL) | approche `-0.02em`, interligne serré |
| Texte | pile système (`system-ui`, `-apple-system`, `Segoe UI`, Roboto) | 16–18 px, interligne 1,6–1,75 |
| Repères | Consolas / monospace | 11–12 px, capitales, approche `+0.1em` : eyebrows, dates, pied de page |

Échelle :

| Élément | Taille |
| --- | --- |
| `h1` | `clamp(3rem, 5.4vw, 4.7rem)`, graisse 750, interligne 1,07 |
| `h2` | `clamp(1.8rem, 3.2vw, 2.8rem)`, interligne 1,15 |
| `h3` | 1,15 à 1,6 rem selon le bloc |
| Texte d'introduction | 17–18 px |

- **Tailles en `rem`** sur les pages du site, pour qu'elles suivent le
  réglage de taille de texte du téléphone. Exception : le HUD de la coinche
  et l'échiquier restent en `px`, leur mise en page est trop serrée.
- La deuxième ligne d'un grand titre peut passer en or (vert sur la
  coinche) : c'est la signature des en-têtes de page. Une seule par page.
- **Le monospace ne sert jamais à un paragraphe**, seulement à des repères
  courts.

## Mise en page

- Conteneur de 1 200 px au plus ; marges de 40 px par côté sur ordinateur,
  20 px sur téléphone.
- Espacements en multiples de 8 ; sections séparées de 76 px (48 px sur
  téléphone).
- En-tête collant sur fond flouté. Le décor spatial (étoiles, grille, halos)
  n'existe que sur le premier écran de chaque page et s'efface en
  descendant.
- Rayons : 6 px pour les boutons, 12 à 20 px pour les cartes et panneaux,
  999 px pour les pastilles.
- **Sur téléphone, les cartes s'effacent** : filets horizontaux et contenu
  à plat, pas de boîtes empilées (accueil, contact, ludothèque).
- Points de rupture : 1100, 1000, 900, 760 (téléphone), 640, 560 px ; et
  500 px de haut pour un téléphone en paysage.

## Logos et images

- L'emblème complet (lauriers, triangle, alien) apparaît dans l'en-tête de
  chaque page (48–56 px de haut, avec le nom en texte) et en grand sur la
  page L'asso. Jamais recadré, recoloré, étiré ni posé sur une photo
  chargée.
- **Invadachan**, la mascotte, porte l'accueil : en orbite au milieu des
  envahisseurs, elle dit « asso de jeux » plus vite que l'emblème.
- Le logo vert est réservé à la coinche (filigrane du tapis).
- Photos : uniquement celles de l'asso. Pas de banque d'images, pas de
  visuels de jeux tiers sans autorisation.
- Toute image décorative a `alt=""` ; toute photo de contenu a un `alt`
  qui la décrit.

## Composants

- **Bouton** : 48 px de haut au moins (44 px dans la partie de coinche),
  texte 13 px gras. Le bouton s'enfonce à l'appui (`scale(0.97)`, 80 ms).
- **Survols** toujours sous `@media (hover: hover)` : au doigt, ils
  restaient collés. Le retour tactile passe par `:active`.
- **Cartes « projecteur »** (accueil, ludothèque) : un halo doré suit la
  souris ; rien sur écran tactile.
- **Panneaux** (règles, historique) : ils sortent de l'élément qui les
  ouvre (`transform-origin` du côté du bouton), pas du centre.
- **Focus clavier** : contour or de 2 à 3 px, toujours visible.

## Mouvement

Le mouvement explique (d'où vient ce panneau, où va ce pli) ou confirme
(le bouton a entendu). S'il ne fait ni l'un ni l'autre, il n'existe pas.

| Jeton | Valeur | Usage |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | Ce qui apparaît : panneaux, bulles, visionneuse |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | Ce qui se déplace à l'écran : pièces d'échecs, cartes |

- Retour d'appui : 80–160 ms. Panneaux et bulles : 200 ms. Fenêtre de fin
  de partie : 300 ms. Révélation des sections au défilement : 700 ms
  (contenu éditorial, vu une fois).
- **Jamais de départ lent (`ease-in`) sur l'interface**, jamais
  d'apparition depuis `scale(0)`.
- Ce qui revient souvent (bulle du bot à chaque coup, barre d'enchères)
  reste bref et ne rejoue pas son apparition quand seul son contenu change.
- Le rebond est réservé aux moments de fête (Belote, coinche, émoticônes).
- Gestes : la carte ou la photo suit le doigt depuis l'endroit saisi ; au
  lâcher, la vitesse compte autant que la distance (un geste vif suffit).
- **Moins d'animations** (`prefers-reduced-motion`) : les mouvements
  deviennent instantanés, mais les temps de lecture restent (le pli posé,
  le résultat de la donne).
- **Moins de transparence / plus de contraste** : en-tête plein, filets et
  textes secondaires plus clairs.

## Téléphone

Le site sert surtout sur téléphone (et dans l'appli Android).

- Champs de saisie à 16 px au moins sur écran tactile (sinon iOS zoome).
- `touch-action: manipulation` sur ce qui se touche : pas de délai.
- Texte des boutons non sélectionnable ; texte de contenu toujours
  sélectionnable.
- Hauteurs plein écran en `svh` (premier écran) ou `dvh` (visionneuse,
  partie), jamais `vh` seul.
- Coinche en plein écran : `viewport-fit=cover` et marges
  `env(safe-area-inset-*)` autour des encoches.
- `theme-color` `#0C0914` sur chaque page.
- Vérifier sur un vrai téléphone, de préférence un ancien : l'émulateur du
  navigateur ne montre ni les survols collés, ni le zoom des champs, ni les
  encoches.

## Les pages

| Page | Ce qu'elle doit faire comprendre |
| --- | --- |
| Accueil | Qui on est (l'asso de jeux de l'ESCP), ce qu'on fait (jeux vidéo, jeux de société, nouvelles technologies), qu'on peut jouer tout de suite, l'année en événements, comment nous rejoindre |
| L'asso | L'emblème en grand, l'esprit, les générations, le bureau, comment entrer |
| Jeux | La ludothèque : chaque jeu a sa grande carte (coinche sur tapis vert, échecs sur plateau violet) |
| Coinche | Choisir une table en trois étapes ; jouer seul en un geste. Accent vert, carte sur tapis |
| Échecs | L'échiquier d'abord, le bot et sa personnalité à côté |
| Nos événements | Le prochain événement en grande affiche, puis les photos et la frise de l'année |
| Actus | Les posts des membres ; un état vide qui invite à écrire |
| Contact | Deux portes : rejoindre (Instagram) et monter un projet (adresse de l'asso) |

Navigation : Accueil, L'asso, Jeux, Nos événements, Actus, Contact. La page
courante est soulignée d'or.

## Le ton

- **On tutoie**, partout : c'est une asso étudiante qui parle à des
  étudiants. Seule exception, la page Contact, qui s'adresse aussi aux
  entreprises et partenaires : là, on vouvoie.
- Phrases courtes, verbes d'action sur les boutons (« Jouer à la coinche »,
  « Rejoindre », « Créer »). Un bouton garde le même nom d'un bout à
  l'autre du parcours.
- Les erreurs disent ce qui se passe et quoi faire, sans s'excuser
  (« Serveur de jeu injoignable : tu peux jouer seul contre
  l'ordinateur. »).
- Un peu d'humour dans les bulles des bots et le pied de page, jamais dans
  les règles ni les erreurs.
- Le site se suffit à lui-même : pas de lien vers GitHub ni vers des
  fichiers `.md` ; les règles du jeu sont écrites dans la page.

## Ne jamais

- Recadrer, recolorer ou déformer l'emblème.
- Mettre l'or et le vert au même niveau sur une page.
- Écrire un paragraphe en monospace ou en capitales.
- Laisser un survol hors de `@media (hover: hover)`.
- Animer `left`/`top`/`width`/`height` quand `transform` suffit (dette
  connue : les pièces d'échecs).
- Ajouter une animation qui empêche de lire ou de jouer.
- Flouter par-dessus le canevas de la partie de coinche (redessiné à chaque
  image : le flou serait recalculé en continu).
