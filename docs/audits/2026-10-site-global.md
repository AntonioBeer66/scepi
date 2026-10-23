# Audit global du site et nouveautés réalisables en autonomie

État au 23 octobre 2026, commit `c7f1da1`. Cet audit couvre le site hors bots de coinche, déjà traités dans [`2026-10-bots-coinche.md`](2026-10-bots-coinche.md). Il s'adresse à Claude (ou à toute personne qui code) : chaque lot indique les fichiers à toucher, comment vérifier le résultat, et une consigne prête à coller dans une session.

**Contrainte de budget : 30 € de crédits.** Les coûts sont des ordres de grandeur, pas des mesures. Ils supposent une session cloud qui lit seulement les fichiers cités. Un lot « S » coûte environ 1 à 3 €, un lot « M » 3 à 7 €, un lot « L » 8 € ou plus. Le plan conseillé (section 4) tient dans 30 € avec une marge.

« Full auto » veut dire que Claude peut livrer le lot sans rien demander à l'asso : pas de contenu à fournir, pas de compte tiers, pas de réglage dans le tableau de bord Cloudflare. Les lots qui demandent l'un de ces trois points sont marqués **semi-auto**.

---

## 1. Constats

### 1.1 Performance et poids des pages

| Constat | Preuve | Gravité |
|---|---|---|
| Portraits des bots d'échecs en PNG 1400×1400 de 750 Ko à 1 Mo chacun (3,5 Mo pour 4 images affichées en vignette) | `site/assets/images/echecs/{arno,haiming,lea,mathieu}.png` | **haute** : premier écran de `/jeux/echecs/` très lourd sur mobile, alors que les vieux téléphones sont une cible (PRODUCT.md, principe 2) |
| Photos d'événements en JPEG 1200 px, sans WebP ni `srcset` (27 `<img>`, 3,1 Mo au total) | `site/evenements/index.html`, `site/assets/images/events/` | moyenne : `loading="lazy"` est bien présent, mais un téléphone télécharge du 1200 px pour une vignette de ~400 px |
| Pas de `loading="lazy"` hors accueil et événements | `grep -c 'loading="lazy"'` : 0 sur `asso/`, `jeux/` | faible |
| Le cache longue durée ne couvre que les morceaux Vite de la coinche ; CSS (100 Ko), polices et images sont revalidés à chaque visite | `site/_headers` | moyenne : polices et images ne changent presque jamais |
| `styles.css` monolithique de 4 849 lignes (100 Ko), chargé partout | `site/assets/css/styles.css` | faible : un seul fichier mis en cache, acceptable ; à surveiller |

### 1.2 Maintenabilité

| Constat | Preuve | Gravité |
|---|---|---|
| En-tête, navigation et pied de page **recopiés à la main dans 14 pages**, avec des écarts : citation du pied de page différente sur `actus/`, lien « Actus » ajouté en JavaScript faute d'être dans le HTML de toutes les pages | `site/*/index.html` ; `site/assets/js/main.js` (bloc « Lien transversal vers la rubrique Actualités ») | **haute** : chaque nouvelle page ou chaque nouveau lien de menu oblige à modifier 14 fichiers ; sans JS, le lien Actus disparaît |
| Liens légaux (Confidentialité, Cookies, Accessibilité) injectés par `main.js` au lieu d'être dans le HTML | `main.js`, bloc `data-legal-links` | moyenne : liens absents sans JS et pour les robots |
| `sitemap.xml` tenu à la main (dates `lastmod` figées), sans les articles d'actus | `site/sitemap.xml` | moyenne |
| `actus.js` écrit en lignes de 1 000+ caractères, contrairement au reste du code | `site/assets/js/actus.js` | faible, mais rend toute revue difficile |
| `items.at(-1)` dans `actus.js` alors que PRODUCT.md interdit `.at` (vieux navigateurs). Seule la branche locale (`!remoteApi`) est touchée | `site/assets/js/actus.js:23` | faible |

### 1.3 Sécurité

| Constat | Preuve | Gravité |
|---|---|---|
| Aucun en-tête de sécurité : ni `Content-Security-Policy`, ni `X-Content-Type-Options`, ni `Referrer-Policy`, ni `frame-ancestors` | `site/_headers`, `worker/index.js` | **haute** pour un site qui affiche du contenu publié via formulaire (actus) et accepte des pseudos en ligne |
| Points forts déjà en place : mot de passe des actus en secret Cloudflare avec comparaison à temps constant, plafond d'essais (429), contrôle d'origine sur `/api/*`, échappement `esc()` dans le rendu des actus, taille maximale des messages WebSocket | `worker/tables.js`, `worker/index.js`, `site/assets/js/actus.js` | — |

### 1.4 SEO et partage

| Constat | Preuve | Gravité |
|---|---|---|
| Un article d'actus partagé (WhatsApp, Instagram, LinkedIn) affiche l'aperçu générique : la page `article.html?id=…` est remplie côté client, donc sans `og:title` ni `og:image` propres à l'article | `site/actus/article.html` | **haute** : les actus servent surtout à être partagées |
| Pas de flux RSS/Atom des actus | — | faible |
| `accessibilite/`, `confidentialite/`, `cookies/` sans `canonical` ni Open Graph | `grep -c 'rel="canonical"'` : 0 sur ces trois pages | faible |
| JSON-LD présent seulement sur l'accueil et la coinche ; rien sur les événements (`Event`) | `grep application/ld+json` | moyenne : un `Event` bien balisé peut sortir dans Google |
| Pas de page 404 personnalisée : la 404 Cloudflare est brute, sans menu | `worker/index.js` (dernier `return`), pas de `site/404.html` | moyenne |

### 1.5 Qualité et intégration continue

| Constat | Preuve | Gravité |
|---|---|---|
| La CI ne lance que `npm test` (moteur de coinche) : rien sur le HTML, les liens, le poids des pages, ni le parcours navigateur (`test:e2e` existe mais n'est pas en CI) | `.github/workflows/tests.yml` | **haute** : une régression du site (lien cassé, page qui ne charge plus) ne se voit qu'en production |
| La règle « es2020, pas de `structuredClone`, `.at`, `roundRect` » n'est vérifiée par aucun outil | PRODUCT.md, §Capabilities | moyenne |

### 1.6 Accessibilité

Bonne base : lien d'évitement, `aria-expanded` sur le menu, Échap pour fermer, `prefers-reduced-motion` respecté, déclaration d'accessibilité publiée. Manque une vérification outillée (axe-core) ; à brancher dans la même CI que le lot A3.

---

## 2. Améliorations globales (lots)

### A1. En-têtes de sécurité et cache — S, full auto

**Fichiers :** `site/_headers`.

1. Ajouter pour `/*` : `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, et `Content-Security-Policy`.
2. CSP de départ, à affiner en lisant les pages : `default-src 'self'; img-src 'self' data: blob:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' wss://www.scepinvaders.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
   - `data:` pour les images : les actus stockent leurs photos en data URL (`readImage`).
   - `'wasm-unsafe-eval'` : Stockfish (`src/echecs/stockfish.wasm`).
   - Vérifier les scripts en ligne (JSON-LD, petits scripts dans les pages). S'il y en a d'exécutables, les sortir dans un fichier plutôt qu'ajouter `'unsafe-inline'` à `script-src`.
3. Cache : `/assets/fonts/*` et `/assets/images/*` en `public, max-age=2592000` (30 jours, sans `immutable` car les noms ne changent pas).

**Vérifier :** `npm start` puis la console du navigateur sur chaque page, coinche (bots et en ligne) et échecs compris : zéro violation CSP. Les en-têtes doivent apparaître dans `curl -I http://localhost:8000/`.

**Piège :** l'appli Android est une WebView du même site ; `frame-ancestors 'none'` ne la gêne pas (pas d'iframe).

### A2. Gabarit commun en-tête / pied de page — M, full auto

**But :** une seule source pour le menu et le pied de page ; liens Actus et légaux dans le HTML, sans JavaScript.

**Approche conseillée** (aucune dépendance, garde le site statique et les chemins relatifs) :

1. Créer `site/_partials/header.html` et `footer.html` avec un marqueur `{{root}}` pour le préfixe relatif (`./`, `../`, `../../`) et `{{current:actus}}` pour `aria-current`.
2. Écrire `tools/partials.mjs` : pour chaque page, remplacer le contenu situé entre `<!-- header:start -->` et `<!-- header:end -->` (de même pour le pied de page) par le gabarit rendu. Le script **réécrit les fichiers en place** : le HTML servi reste du HTML statique complet, et Git montre le résultat.
3. Brancher le script en tête de `npm run build` et ajouter `node tools/partials.mjs --check` à `npm test` : il échoue si une page n'est pas à jour.
4. Retirer de `main.js` l'injection du lien Actus et des liens légaux, une fois ceux-ci présents dans le gabarit.
5. Exclure `_partials/` des fichiers publiés : déplacer le dossier hors de `site/` (par exemple `tools/partials/`), car `wrangler` publie tout `site/`.

**Vérifier :** `git diff --stat` touche les 14 pages ; ouvrir quelques pages avec le JavaScript désactivé : le menu complet est là. Garder la citation propre à `actus/` si l'asso y tient (variable de gabarit), sinon l'aligner.

### A3. CI du site : liens, HTML, parcours navigateur, accessibilité — M, full auto

**Fichiers :** `.github/workflows/tests.yml`, `tests/site-*.js`, `package.json`.

1. `tests/site-liens.test.js` (Node seul) : parcourir `site/**/*.html`, vérifier que chaque `href`/`src` relatif pointe vers un fichier existant (décoder `%20`, ignorer `mailto:`, `http`, `#`).
2. `tests/site-compat.test.js` : chercher dans `site/assets/js/*.js` (hors `coinche/`, `echecs/chess.min.js`) et `src/**/client/` les motifs interdits (`structuredClone`, `.at(`, `?.` dans `main.js`, `roundRect` non protégé). Corriger au passage le `.at(-1)` d'`actus.js` (`items[items.length - 1]`).
3. `tests/site-e2e.js` avec Playwright (déjà en devDependency ; Chromium présent dans les sessions cloud, `executablePath: '/opt/pw-browsers/chromium'` si besoin) : servir `site/` avec `wrangler dev`, ouvrir chaque page du sitemap, échouer sur toute erreur console, toute requête 4xx/5xx ou toute violation CSP. Injecter `axe-core` (ajouter en devDependency) et échouer sur les violations `serious`/`critical`.
4. Ajouter à la CI un second job `site` : `npm ci && npx playwright install --with-deps chromium && npm run build && node tests/site-e2e.js`. Sur GitHub Actions, `playwright install` est nécessaire.

**Vérifier :** casser volontairement un lien dans une branche locale : le test doit échouer.

### A4. Images allégées — S, full auto

**Fichiers :** `tools/images.mjs` (nouveau), `site/assets/images/echecs/`, `site/assets/images/events/`, pages qui les citent.

1. Ajouter `sharp` en devDependency. Script : portraits d'échecs en WebP 480 px (et 960 px pour les écrans denses), photos d'événements en WebP 480 et 1200 px. Déplacer les originaux hors de `site/` (par exemple `media-sources/`) pour ne pas les publier.
2. Remplacer les `<img>` par `<img srcset="… 480w, … 1200w" sizes="…" width height loading="lazy">`. WebP est lu par toutes les WebView Android ≥ 4.2 ; pas besoin de `<picture>` avec repli JPEG pour la cible du site. S'il faut rester prudent, garder un `<picture>` avec JPEG.
3. Renommer au passage les dossiers avec espaces (`Laser tag`, `Nintendo Career Fair`) en `laser-tag`, `nintendo-career-fair`, etc., pour des URLs plus propres. Mettre à jour les liens (le test de liens A3 les vérifie).
4. Ajouter les nouveaux fichiers au service worker seulement s'ils sont dans la liste préchargée (les portraits ne le sont pas aujourd'hui : rien à changer dans `sw.js`).

**Gain attendu :** portraits de ~3,5 Mo à ~150 Ko ; page événements divisée par 2 à 3 sur mobile. À mesurer avec le test A3 (poids total transféré par page).

### A5. Aperçus de partage et SEO des actus — M, full auto

**Fichiers :** `worker/index.js`, `wrangler.jsonc`, `worker/tables.js` (lecture seule de l'article).

1. Mettre `/actus/article.html` dans `run_worker_first` (`wrangler.jsonc`).
2. Dans le Worker : récupérer la page via `env.ASSETS.fetch`, lire l'article (`/api/articles/:id` du Durable Object), puis réécrire `<title>`, `meta description`, `og:title`, `og:description`, `og:url`, `canonical` avec `HTMLRewriter`. Pour `og:image`, ajouter une route `/api/articles/:id/image.jpg` qui décode la data URL et la sert avec un cache d'une journée. Les robots de partage ne lisent pas les data URL.
3. Ajouter `/actus/flux.xml` (Atom) et compléter `/sitemap.xml` par le Worker avec les articles (le reste du sitemap peut rester le fichier statique, lu via `ASSETS` puis enrichi).
4. Tests : un test Node qui appelle le `fetch` du Worker avec des doublures `ASSETS`/`TABLES`, sur le modèle de `tests/coinche-host.test.js`.

**Vérifier :** `curl -s 'http://localhost:8000/actus/article.html?id=<id>' | grep og:` montre le titre de l'article.

### A6. Page 404 et métadonnées manquantes — S, full auto

1. `site/404.html` dans le style du site : mascotte Invadachan, lien vers une partie de coinche (« Jouer d'abord »). Dans `wrangler.jsonc`, sous `assets` : `"not_found_handling": "404-page"`.
2. Ajouter `canonical` aux trois pages légales ; JSON-LD `Organization` (nom, logo, réseaux) dans le gabarit A2 ; JSON-LD `Event` pour l'événement à venir de `evenements/`, **seulement avec les informations déjà écrites dans la page** (PRODUCT.md, principe 4 : ne rien inventer).
3. `manifest.webmanifest` : ajouter des `shortcuts` « Coinche » et « Échecs » (appui long sur l'icône de l'appli installée).

---

## 3. Nouveautés réalisables en autonomie

Classées par rapport valeur / coût. Toutes respectent les contraintes de PRODUCT.md : pas de compte, pas d'inscription, vieux téléphones, rien d'affirmé que l'asso n'a pas fourni.

### N1. Donne du jour (coinche) — M, full auto ★ conseillée

**Fait** (23 octobre 2026) : `src/coinche/defi.js`, option `defi` du coup `lancer` (`src/coinche/game.js`), fin de donne et partage (`session.js`, `hud.js`), bouton et lien `?defi=AAAA-MM-JJ` ou `?defi=jour` (`lobby.js`), lien depuis l'accueil, tests `tests/coinche-defi.test.js`. Limite : à la marge, un appareil très lent (moins de mondes calculés par les bots, voir `host-worker.js`) ou une carte jouée d'office après 20 s peuvent faire diverger la suite de la donne.

Un défi quotidien façon Wordle : la même donne pour tout le monde ce jour-là, jouée avec trois bots, et un résultat à partager.

- **Pourquoi c'est sûr :** le moteur est déjà déterministe (graine dérivée de l'état, `tests/coinche-determinisme.test.js`) ; la partie tourne entièrement dans le navigateur et hors ligne (`sw.js`). Aucun serveur à ajouter.
- **À faire :**
  1. Dans `src/coinche/` : fonction `donneDuJour(dateISO)` → graine (hachage de `"scepi-" + date`) → mains et donneur. Exposer un mode « défi » dans la session locale (`src/coinche/client/session.js`) : une seule donne, place fixe sud.
  2. Écran de fin : points faits, contrat, réussite ; bouton « Partager » qui copie un texte court avec emojis (♠♥♦♣, ✅/❌) et le lien `https://www.scepinvaders.com/jeux/coinche/?defi=AAAA-MM-JJ`. Utiliser `navigator.share` s'il existe, sinon le presse-papiers.
  3. Série de jours réussis dans `localStorage` (déjà utilisé par la coinche, cf. `cookies/`), sans serveur.
  4. Lien « Donne du jour » sur l'accueil et sur `jeux/coinche/`.
- **Tests :** même date → mêmes mains (test Node) ; dates différentes → mains différentes ; e2e : `?defi=` ouvre la donne.
- **Option plus tard (semi-auto) :** classement du jour via le D1 `JOURNAL_DB`. Demande une décision de l'asso sur l'affichage de pseudos.

### N2. Statistiques publiques de la coinche — S/M, full auto

**Fait**, sous forme d'un bloc « La coinche en chiffres » sur `jeux/coinche/` plutôt que d'une page à part : `GET /api/stats` (`worker/journal.js`, `statsDonnes`), agrégats en une seule requête SQL (`STATS_SQL`, `aggregateStats` dans `src/coinche/journal.js`), recalculés au plus toutes les 6 h et gardés dans la table D1 `stats_cache`, puis 15 min dans le cache de Cloudflare. Le bloc reste caché sous 50 donnes. Page confidentialité mise à jour. Tests `tests/coinche-stats.test.js`.

Une page `jeux/coinche/stats/` : nombre de donnes jouées par des humains, contrats les plus pris, taux de réussite par contrat, part des coinches gagnées. Ce sont des chiffres agrégés et anonymes.

- Source : le journal D1 existe déjà (`worker/journal.js`, table `donnes`). Ajouter une route `GET /api/stats` qui calcule les agrégats en SQL, mise en cache une heure (`caches.default`, comme le compteur de `worker/index.js`).
- **Ne publier que des agrégats**, jamais une ligne du journal ; mettre à jour `confidentialite/` en une phrase.
- Lire d'abord les colonnes réelles de la table dans `worker/journal.js` avant d'écrire le SQL.

### N3. Puzzle d'échecs du jour — M, full auto

**Fait, autrement que prévu** : la base Lichess n'était pas joignable depuis l'environnement de travail. Les puzzles sont donc des mats en 2 ou 3 tirés de parties de Stockfish contre lui-même, avec un coup unique à chaque étape (`tools/puzzles-echecs.mjs`, sortie `site/assets/js/echecs/puzzles.json`). Ce sont des créations originales, sans licence à citer. Widget `site/assets/js/echecs/puzzle.js`, tests `tests/echecs-puzzles.test.js`. Le plan d'origine ci-dessous reste valable pour qui voudrait des puzzles plus variés.

- Prendre un petit lot (≈ 365 positions) de la base de puzzles Lichess, publiée sous **CC0** (`database.lichess.org`), filtrée sur un classement de 1200 à 1800. La stocker en JSON dans `src/echecs/`.
- Puzzle choisi par la date ; l'échiquier et `chess.min.js` existent déjà (`site/assets/js/echecs/echecs.js`). Valider les coups contre la solution, avec un indice affiché sur demande.
- Ajouter la source et la licence CC0 dans un `CREDITS.md` (prévu par TECHNIQUE.md §3).

### N4. Revoir sa donne — M, full auto

En fin de donne (contre les bots), un bouton « Revoir » rejoue les plis un par un, toutes mains visibles. Le journal des coups est déjà en mémoire côté client. C'est un bon outil pour apprendre la coinche, en accord avec l'objectif « tutoriel » du README.

### N5. « Ajouter à mon agenda » pour l'événement — S, semi-auto

Un fichier `.ics` généré au clic à partir des informations affichées sur `evenements/`. C'est full auto techniquement, mais à n'activer que quand la page porte une date et un lieu confirmés par l'asso.

### Écartées pour ce budget

- **Formulaire de contact :** il faut un service d'envoi d'e-mails (compte tiers) et une protection anti-abus. C'est semi-auto, et le `mailto:` actuel suffit.
- **Mesure d'audience** (Cloudflare Web Analytics, sans cookie) : à activer dans le tableau de bord, puis à mentionner sur `cookies/`. Ça prend 5 minutes à la main ; Claude n'a rien à coder.
- **Fil Instagram automatique :** nécessite l'API Meta et un jeton (TECHNIQUE.md §5).
- **Comptes et classement persistant :** contraire à « pas d'inscription ni de compte ».

---

## 4. Plan conseillé dans 30 €

| Ordre | Lot | Taille | Coût estimé | Pourquoi d'abord |
|---|---|---|---|---|
| 1 | A3 (CI du site) | M | 4-6 € | filet de sécurité pour tous les lots suivants |
| 2 | A1 (sécurité, cache) | S | 1-2 € | gros gain pour peu de code, vérifié par A3 |
| 3 | A4 (images) | S | 2-3 € | gain mobile immédiat |
| 4 | A2 (gabarit commun) | M | 4-6 € | rend A6 trivial |
| 5 | A6 (404, métadonnées) | S | 1-2 € | — |
| 6 | N1 (donne du jour) | M | 6-8 € | la nouveauté la plus visible, sans serveur |
| | **Total** | | **18-27 €** | |

Si le budget reste : A5 (aperçus des actus), puis N2. N3 et N4 se prêtent à une session suivante.

**Pour économiser les crédits :**

- un lot par session, avec la consigne ci-dessous, sans demander de relecture globale du dépôt ;
- citer les fichiers précis (Claude lit alors 3 ou 4 fichiers au lieu d'explorer) ;
- ne pas faire lancer `tests/coinche-ab.js` ou les campagnes de bots : elles durent des heures et ne concernent pas ces lots ;
- regrouper A1 et A6 dans une même session s'il reste de la place.

---

## 5. Consignes prêtes à coller

Chaque consigne suppose une session sur ce dépôt. Toutes finissent par la même exigence : `npm test` vert, commit en français dans le style des commits existants (« Site : … », « Coinche : … »), puis push sur la branche de travail.

**A3**

> Lis `docs/audits/2026-10-site-global.md`, lot A3, puis `.github/workflows/tests.yml`, `package.json` et `site/sitemap.xml`. Crée `tests/site-liens.test.js` et `tests/site-compat.test.js` (Node seul, ajoutés à `npm test`), corrige le `.at(-1)` de `site/assets/js/actus.js`, puis crée `tests/site-e2e.js` (Playwright + axe-core) et un job CI `site`. Vérifie que les tests échouent sur un lien cassé volontaire, puis remets le lien.

**A1**

> Lot A1 de `docs/audits/2026-10-site-global.md`. Modifie `site/_headers` (sécurité + cache). Lance `npm start`, ouvre avec Playwright l'accueil, `jeux/coinche/` (partie contre les bots), `jeux/echecs/` (un coup de Stockfish) et `actus/` : zéro violation CSP dans la console. Si un script en ligne bloque, sors-le dans un fichier plutôt que d'assouplir la CSP.

**A4**

> Lot A4 de `docs/audits/2026-10-site-global.md`. Ajoute `sharp`, écris `tools/images.mjs`, génère les WebP des portraits d'échecs et des photos d'événements, déplace les originaux hors de `site/`, mets à jour les `<img>` avec `srcset`/`sizes`/`width`/`height`. Donne le poids avant/après de `jeux/echecs/` et `evenements/`.

**A2**

> Lot A2 de `docs/audits/2026-10-site-global.md`. Gabarit dans `tools/partials/`, script `tools/partials.mjs` (réécriture en place entre marqueurs, option `--check` branchée dans `npm test`), retire de `site/assets/js/main.js` les injections devenues inutiles. Vérifie une page de chaque profondeur avec le JavaScript désactivé.

**A6**

> Lot A6 de `docs/audits/2026-10-site-global.md`. Page `site/404.html` + `not_found_handling` dans `wrangler.jsonc`, `canonical` des pages légales, JSON-LD `Organization` et `Event` (seulement avec les infos déjà présentes sur `evenements/`), `shortcuts` dans le manifeste.

**N1**

> Nouveauté N1 de `docs/audits/2026-10-site-global.md` : la donne du jour. Lis d'abord `src/coinche/client/session.js`, `src/coinche/game.js` et `tests/coinche-determinisme.test.js`. Ajoute le mode défi (`?defi=AAAA-MM-JJ`), l'écran de fin avec partage, la série dans `localStorage`, les liens depuis l'accueil et `jeux/coinche/`. Ajoute les tests Node de déterminisme du défi, lance `npm test`, puis `npm run build` et commite le bundle reconstruit, comme les commits précédents.
