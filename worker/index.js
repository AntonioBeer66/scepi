// Site scepinvaders.com sur Cloudflare Workers. Toute requête passe ici
// d'abord (run_worker_first) : API de la coinche en ligne et des actus
// (Durable Object, worker/tables.js), sinon fichiers de site/.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Adresse principale : www.scepinvaders.com (celle de la propriété Search
    // Console de l'asso) ; scepinvaders.com y renvoie, une seule adresse pour Google.
    if (url.hostname === "scepinvaders.com") {
      url.hostname = "www.scepinvaders.com";
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith("/api/")) {
      // Seules les pages du site appellent l'API.
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return new Response("Origine refusée.", { status: 403 });
      // Compteur de l'accueil et de la ludothèque : une réponse partagée
      // 10 s plutôt qu'un réveil du salon par visite (le lobby, lui, n'y passe pas).
      if (url.pathname === "/api/tables" && url.search === "?compteur" && request.method === "GET") {
        const cached = await caches.default.match(url.toString());
        if (cached) return cached;
        const res = await env.TABLES.get(env.TABLES.idFromName("salon")).fetch(request);
        if (!res.ok) return res;
        const out = new Response(res.body, res);
        out.headers.set("cache-control", "public, max-age=10");
        ctx.waitUntil(caches.default.put(url.toString(), out.clone()));
        return out;
      }
      return env.TABLES.get(env.TABLES.idFromName("salon")).fetch(request);
    }
    // Static pages live under /site, while the chess engine and profiles have
    // one canonical copy under /src/echecs. Keep both URLs backed by those
    // source locations instead of duplicating chess assets into site/assets.
    const assetUrl = new URL(request.url);
    if (!assetUrl.pathname.startsWith("/src/echecs/") && !assetUrl.pathname.startsWith("/site/")) {
      // « / » → « /site/ » (et non /site/index.html, que le gestionnaire
      // d'assets redirige vers /site/ : l'accueil passait par une redirection).
      assetUrl.pathname = `/site${assetUrl.pathname}`;
    }
    const res = await env.ASSETS.fetch(new Request(assetUrl, request));
    // Redirection du gestionnaire d'assets (…/index.html → …/) : adresse
    // publique sans le préfixe /site, qui ne doit jamais s'afficher.
    const location = res.headers.get("location");
    if (location) {
      const to = new URL(location, assetUrl);
      if (to.origin === url.origin && to.pathname.startsWith("/site/")) {
        const out = new Response(res.body, res);
        out.headers.set("location", to.pathname.slice(5) + to.search);
        return out;
      }
    }
    // Morceaux du jeu de coinche nommés par Vite d'après leur contenu
    // (session-C1qY-raR.js) : jamais modifiés, donc plus revérifiés à chaque visite.
    if (res.ok && /^\/site\/assets\/js\/coinche\/.*-[\w-]{8}\.js$/.test(assetUrl.pathname)) {
      const out = new Response(res.body, res);
      out.headers.set("cache-control", "public, max-age=31536000, immutable");
      return out;
    }
    return res;
  },
};

export { Tables } from "./tables.js";
