// Site scepinvaders.com sur Cloudflare Workers. Toute requête passe ici
// d'abord (run_worker_first) : API de la coinche en ligne et des actus
// (Durable Object, worker/tables.js), sinon fichiers de site/.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // www renvoie vers l'adresse principale (une seule adresse pour Google).
    if (url.hostname.startsWith("www.")) {
      url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname.startsWith("/api/")) {
      // Seules les pages du site appellent l'API.
      const origin = request.headers.get("origin");
      if (origin && origin !== url.origin) return new Response("Origine refusée.", { status: 403 });
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
    return res;
  },
};

export { Tables } from "./tables.js";
