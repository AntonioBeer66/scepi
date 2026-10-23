---
name: SCEP Invaders
description: Le club de jeux de l'ESCP, vu comme une borne d'arcade dans l'espace.
colors:
  night: "#0c0914"
  surface: "#181127"
  card: "#120d1d"
  brand-violet: "#281747"
  gold: "#f4c600"
  gold-hover: "#ffdc40"
  text: "#f7f4fc"
  muted: "#bdb5cd"
  line: "#ffffff19"
  coinche-green: "#39ff14"
  lilac: "#a98bff"
  suit-red: "#ff6b6b"
  on-accent: "#181127"
typography:
  display:
    fontFamily: "Oxanium, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(3rem, 5.4vw, 4.7rem)"
    fontWeight: 750
    lineHeight: 1.07
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Oxanium, system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 3.2vw, 2.8rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Oxanium, system-ui, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "Consolas, Courier New, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.1em"
rounded:
  button: "6px"
  card: "12px"
  panel: "20px"
  pill: "999px"
spacing:
  unit: "8px"
  gutter-mobile: "20px"
  gutter-desktop: "40px"
  section-mobile: "48px"
  section: "76px"
  container: "1200px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.button}"
    padding: "15px 21px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.gold-hover}"
  pill:
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "7px 12px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
---

# Design System: SCEP Invaders

`DIRECTION_ARTISTIQUE.md` reste la référence détaillée (en français, page par page) ; ce fichier en est la version outillée. En cas d'écart, `site/assets/css/styles.css` a raison.

## Overview

**Creative North Star: "La borne d'arcade dans l'espace"**

Le club de jeux de l'ESCP sur fond de nuit violette, avec l'or des lauriers de l'emblème et des envahisseurs en pixels, mais une interface d'aujourd'hui, aérée, qui se lit avant de se regarder. Le jeu se voit dans les emblèmes, les envahisseurs pixelisés, la lumière dorée et les cartes ; jamais dans des effets qui gênent la lecture.

Le site sert surtout sur téléphone, souvent ancien, et dans l'appli Android (WebView). La densité est faible sur les pages vitrines, forte et précise dans les parties (coinche, échecs). Le décor spatial n'existe que sur le premier écran de chaque page.

Rejets confirmés : texte en police pixel, néons partout, faux terminal, visuels de banque d'images.

**Key Characteristics:**
- Fond sombre partout, or pour l'action, vert réservé à la coinche.
- Titres en Oxanium, texte en police système, repères courts en monospace.
- Sur téléphone, les cartes s'effacent au profit de filets horizontaux.
- Le mouvement explique ou confirme, sinon il n'existe pas.

## Colors

Une nuit violette presque noire, un or franc pour agir, un vert néon qui n'appartient qu'à la coinche.

### Primary
- **Or des lauriers** (`gold`) : bouton principal, page active, repères, dates, focus clavier. Texte sombre (`on-accent`) dessus.

### Secondary
- **Vert du tapis** (`coinche-green`) : coinche uniquement (accent, « à toi », score de ton équipe, deuxième ligne du titre de la page coinche).

### Tertiary
- **Lilas** (`lilac`) : troisième ton des pictogrammes, avec l'or et le vert, avec parcimonie.

### Neutral
- **Nuit violette** (`night`) : fond de page, `theme-color` de chaque page.
- **Surface** (`surface`) : panneaux (règles, échecs, partie).
- **Carte** (`card`) : cartes de contenu et blocs de l'accueil.
- **Violet de l'emblème** (`brand-violet`) : grands aplats, fond d'image en attente.
- **Texte** (`text`) : titres et texte important.
- **Atténué** (`muted`) : paragraphes, légendes.
- **Filet** (`line`) : bordures et séparateurs.
- **Rouge des cartes** (`suit-red`) : cœur et carreau sur fond sombre, actions risquées (abandonner, quitter).

### Named Rules
**The One Gold Rule.** Une seule action en or par zone ; les actions secondaires sont des boutons à contour.

**The Green Table Rule.** Le vert n'apparaît que sur la coinche, et jamais au même niveau que l'or sur une même page.

## Typography

**Display Font:** Oxanium 500–800 (hébergée dans `assets/fonts/`, SIL OFL), repli police système
**Body Font:** pile système (`system-ui`, `-apple-system`, Segoe UI, Roboto)
**Label/Mono Font:** Consolas, Courier New, monospace

**Character:** Oxanium donne la touche arcade aux titres sans tomber dans le pixel ; la police système garde le texte rapide à charger et lisible sur les vieux téléphones.

### Hierarchy
- **Display** (750, `clamp(3rem, 5.4vw, 4.7rem)`, 1.07) : le `h1` de chaque page. La deuxième ligne peut passer en or (vert sur la coinche), une seule fois par page.
- **Headline** (700, `clamp(1.8rem, 3.2vw, 2.8rem)`, 1.15) : titres de section.
- **Title** (700, 1.15–1.6rem, 1.2) : titres de cartes et de blocs.
- **Body** (400, 1rem à 1.125rem, 1.6–1.75) : paragraphes en couleur atténuée, 72ch au plus dans les articles.
- **Label** (600, 0.75rem, +0.1em, capitales) : eyebrows, dates, pied de page.

### Named Rules
**The Short Mono Rule.** Le monospace et les capitales ne servent qu'à des repères courts, jamais à un paragraphe.

**The Rem Rule.** Tailles en `rem` sur les pages du site pour suivre le réglage du téléphone ; seuls le HUD de la coinche et l'échiquier restent en `px`.

## Layout

Conteneur de 1200px au plus, marges de 40px par côté sur ordinateur et 20px sur téléphone. Espacements en multiples de 8 ; sections séparées de 76px (48px sur téléphone). En-tête collant sur fond flouté. Points de rupture : 1100, 1000, 900, 760 (téléphone), 640, 560px, plus 500px de haut pour un téléphone en paysage. Hauteurs plein écran en `svh` (premier écran) ou `dvh` (visionneuse, partie), jamais `vh` seul. La coinche en plein écran respecte `env(safe-area-inset-*)`.

**The Flat Phone Rule.** Sur téléphone, les cartes s'effacent : filets horizontaux et contenu à plat, pas de boîtes empilées.

## Elevation & Depth

Système plat par défaut : la profondeur vient des tons (nuit, carte, surface) et des filets. Les ombres ne servent qu'à ce qui flotte au-dessus de la partie ou de la page (panneaux, fenêtres, visionneuse), toujours en noir diffus.

### Shadow Vocabulary
- **Panneau flottant** (`box-shadow: 0 16px 40px #000a`) : fenêtres et panneaux ouverts par-dessus le contenu.
- **Bulle** (`box-shadow: 0 10px 30px #000a`) : bulles et menus courts.

**The No-Glow Rule.** Pas de halo ni de bande de couleur sur les cartes ; le seul halo doré est celui des cartes « projecteur », qui suit la souris et disparaît au toucher.

## Shapes

Coins doucement arrondis : 6px pour les boutons, 12 à 20px pour les cartes et panneaux, 999px pour les pastilles. L'emblème garde toujours sa silhouette entière, jamais recadrée.

## Components

### Buttons
- **Shape:** coins discrets (6px), 48px de haut au moins (44px dans la partie de coinche).
- **Primary:** or, texte sombre 13px gras, `15px 21px`.
- **Hover / Focus:** survol sous `@media (hover: hover)` seulement (or plus clair, montée de 2px) ; à l'appui, `scale(0.97)` en 80ms ; focus clavier en contour or de 2 à 3px.
- **Outline:** fond transparent, contour fin, pour toute action secondaire.

### Chips
- **Style:** pastille à contour fin (`#ffffff24`), texte atténué 12px, rayon complet.

### Cards / Containers
- **Corner Style:** 12px (cartes), 20px (panneaux).
- **Background:** `card` pour le contenu, `surface` pour les panneaux.
- **Border:** filet `line`.
- **Behavior:** les panneaux sortent de l'élément qui les ouvre (`transform-origin` du côté du bouton), en 200ms avec `cubic-bezier(0.23, 1, 0.32, 1)`.

### Inputs / Fields
- **Style:** fond `#ffffff0a`, contour `#ffffff2b`, 16px au moins sur écran tactile (sinon iOS zoome).
- **Focus:** contour or.

### Navigation
- **Style:** liens 14px atténués, la page courante en texte clair soulignée d'un trait or de 3px. Emblème couleur entier à gauche (48–56px) avec le nom en texte. Sur téléphone, menu repliable.

### Table de coinche
Tapis vert, logo vert en filigrane, cartes dessinées sur canevas. Rien n'est flouté par-dessus le canevas (il est redessiné à chaque image).

## Do's and Don'ts

### Do:
- **Do** garder une seule action en or par zone, les autres en contour.
- **Do** mettre tous les survols sous `@media (hover: hover)` et donner le retour tactile par `:active`.
- **Do** animer `transform` et `opacity` avec `--ease-out` pour ce qui apparaît et `--ease-in-out` pour ce qui se déplace ; rendre les mouvements instantanés sous `prefers-reduced-motion` en gardant les temps de lecture.
- **Do** utiliser uniquement les photos de l'asso, avec un `alt` qui les décrit (`alt=""` pour le décoratif).
- **Do** mettre `touch-action: manipulation` sur ce qui se touche.

### Don't:
- **Don't** recadrer, recolorer ou déformer l'emblème ni Invadachan.
- **Don't** mettre l'or et le vert au même niveau sur une page.
- **Don't** écrire un paragraphe en monospace ou en capitales.
- **Don't** utiliser `ease-in` sur l'interface ni faire apparaître depuis `scale(0)`.
- **Don't** animer `left`/`top`/`width`/`height` quand `transform` suffit.
- **Don't** répéter le décor spatial au-delà du premier écran.
