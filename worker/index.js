// Site scepinvaders.com sur Cloudflare Workers. Les fichiers de site/ sont
// servis directement par Cloudflare, sans passer ici (gratuit et illimité) :
// le Worker ne reçoit que /api/* (run_worker_first) et les adresses sans
// fichier. scepinvaders.com → www : règle de redirection du tableau de bord.

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
    // Anciennes adresses en /site/… (avant que site/ soit la racine).
    if (url.pathname.startsWith("/site/")) {
      url.pathname = url.pathname.slice(5);
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request); // aucun fichier : la 404 habituelle
  },
};

export { Tables } from "./tables.js";
