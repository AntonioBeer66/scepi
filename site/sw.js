// Hors ligne (surtout dans l'appli Android) : chaque fichier est pris sur le
// réseau, sinon dans ce cache. La coinche contre l'ordinateur y est mise en
// entier dès la première visite (page, jeu compilé, cartes) : elle tourne
// toute seule dans le navigateur. Les salons en ligne (/api) restent en ligne,
// et les autres pages ne sont là hors ligne que si on les a déjà ouvertes.
const CACHE = "scepi";
const JEU = "/assets/js/coinche/";
const CARTES = ["7", "8", "9", "10", "J", "Q", "K", "A"].flatMap((r) =>
  ["C", "D", "H", "S"].map((c) => `/assets/images/coinche/cards/${r}${c}.png`),
);
const FICHIERS = [
  "/",
  "/jeux/",
  "/jeux/coinche/",
  "/assets/css/styles.css",
  "/assets/js/main.js",
  "/assets/js/coinche-rules.js",
  "/assets/fonts/oxanium-latin.woff2",
  "/assets/fonts/oxanium-latin-ext.woff2",
  "/assets/images/logo-header.png",
  "/assets/images/logo-green.png",
  "/assets/images/coinche/cards/back.svg",
  ...CARTES,
];

// Met en cache ce qui manque. Les morceaux du jeu sont lus dans la liste de
// Vite (fichiers.json) : leurs noms changent à chaque compilation, ceux d'une
// version précédente sont effacés.
async function garnir() {
  const cache = await caches.open(CACHE);
  const liste = await (await fetch(JEU + "fichiers.json", { cache: "no-cache" })).json();
  const jeu = Object.values(liste).flatMap((m) => [m.file, ...(m.assets || [])].map((f) => JEU + f));
  for (const req of await cache.keys()) {
    const p = new URL(req.url).pathname;
    if (p.startsWith(JEU) && !jeu.includes(p)) await cache.delete(req);
  }
  const manquants = [];
  for (const f of [...FICHIERS, ...jeu]) if (!(await cache.match(f))) manquants.push(f);
  await cache.addAll(manquants);
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(garnir().catch(() => {}));
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Vidéos (lues par morceaux), autres sites et API : sans le cache.
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || req.headers.has("range")) return;
  e.respondWith(
    fetch(req).then(
      (res) => {
        if (res.ok && !res.redirected) {
          const copie = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copie)));
        }
        // En ligne : de quoi jouer hors ligne, à jour après une mise en ligne.
        if (req.mode === "navigate") e.waitUntil(garnir().catch(() => {}));
        return res;
      },
      // Les liens du site visent « jeux/index.html », gardé sous « jeux/ ».
      // Page jamais vue : renvoi vers l'accueil, à sa vraie adresse (ses
      // liens relatifs resteraient faux sous une autre).
      async () =>
        (await caches.match(req, { ignoreSearch: true })) ||
        (await caches.match(url.pathname.replace(/index\.html$/, ""))) ||
        (req.mode === "navigate" && (await caches.match("/"))
          ? Response.redirect("/", 302)
          : Response.error()),
    ),
  );
});
