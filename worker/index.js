// Bêta du site sur Cloudflare Workers, derrière un mot de passe.
// Toute requête passe ici d'abord (run_worker_first) : sans le cookie
// d'accès, on sert la page de connexion ; avec, les fichiers de site/.
// Le mot de passe est un secret Cloudflare (wrangler secret put
// SITE_PASSWORD), jamais dans le dépôt ; le cookie contient son empreinte
// (changer le mot de passe déconnecte tout le monde).

const COOKIE = "scepi_acces";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 jours

async function digest(text) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`scepi-beta:${text}`),
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cookieOf(request) {
  const raw = request.headers.get("cookie") || "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]+)`));
  return m ? m[1] : null;
}

// Ne renvoie que vers une page du site (pas de redirection ouverte).
function safeNext(value) {
  // « //x » et « /\x » mènent hors du site dans un navigateur.
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : "/";
}

const esc = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function loginPage(next, error) {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Accès — SCEP Invaders</title>
<link rel="icon" href="/assets/images/favicon.ico">
<style>
  :root { color-scheme: dark; --bg: #0c0914; --surface: #181127; --line: #2b2145; --text: #f7f4fc; --muted: #bdb5cd; --gold: #f4c600; --danger: #ff8a8a; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
    background: radial-gradient(ellipse at 50% 40%, #1c1233 0%, var(--bg) 70%); color: var(--text);
    font: 16px/1.5 system-ui, "Segoe UI", sans-serif; }
  main { width: min(380px, 100%); padding: 32px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); text-align: center; }
  img { width: 72px; height: 72px; }
  .eyebrow { display: block; margin: 12px 0 4px; color: var(--gold); font: 700 11px/1 Consolas, monospace; letter-spacing: .12em; }
  h1 { margin: 0 0 20px; font-size: 24px; }
  label { display: block; margin-bottom: 8px; color: var(--muted); font-size: 14px; text-align: left; }
  input { width: 100%; min-height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg); color: var(--text); font-size: 16px; }
  input:focus-visible, button:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
  button { width: 100%; min-height: 44px; margin-top: 14px; border: 0; border-radius: 10px; background: var(--gold); color: #241a00; font-size: 15px; font-weight: 800; cursor: pointer; }
  .error { margin: 12px 0 0; color: var(--danger); font-size: 14px; }
</style>
</head>
<body>
<main>
  <img src="/assets/images/logo-white.png" alt="">
  <span class="eyebrow">SCEP INVADERS · BÊTA</span>
  <h1>Accès réservé</h1>
  <form method="post" action="/__acces">
    <input type="hidden" name="next" value="${esc(next)}">
    <label for="mdp">Mot de passe</label>
    <input id="mdp" name="mdp" type="password" autocomplete="current-password" required autofocus
      ${error ? 'aria-invalid="true" aria-describedby="erreur"' : ""}>
    <button type="submit">Entrer</button>
    ${error ? '<p class="error" id="erreur" role="alert">Mot de passe incorrect.</p>' : ""}
  </form>
</main>
</body>
</html>`;
  return new Response(html, {
    status: error ? 401 : 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const password = env.SITE_PASSWORD;
    // Sans mot de passe : ouvert seulement en local (wrangler dev, clone
    // frais) ; en ligne, tout est refusé plutôt qu'exposé.
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!password && !local) return new Response("Mot de passe non configuré.", { status: 503 });
    if (!password) return serve(request, env, url);
    const expected = await digest(password);

    // La page de connexion a besoin du logo et de l'icône.
    const isPublic =
      url.pathname === "/assets/images/logo-white.png" ||
      url.pathname === "/assets/images/favicon.ico";

    if (url.pathname === "/__acces" && request.method === "POST") {
      const form = await request.formData();
      const next = safeNext(form.get("next"));
      if ((await digest(String(form.get("mdp") || ""))) !== expected)
        return loginPage(next, true);
      return new Response(null, {
        status: 303,
        headers: {
          location: next,
          "set-cookie": `${COOKIE}=${expected}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
        },
      });
    }

    if (!isPublic && cookieOf(request) !== expected) {
      // Pages : formulaire ; autres fichiers (scripts, images…) : refus.
      const wantsPage = (request.headers.get("accept") || "").includes("text/html");
      return wantsPage
        ? loginPage(url.pathname + url.search, false)
        : new Response("Accès réservé.", { status: 401 });
    }

    return serve(request, env, url);
  },
};

// Après le contrôle d'accès : API de la coinche en ligne, ou fichiers du site.
async function serve(request, env, url) {
  if (url.pathname.startsWith("/api/")) {
    // Seules les pages du site appellent l'API (pas un autre site qui
    // profiterait du cookie d'un joueur).
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return new Response("Origine refusée.", { status: 403 });
    return env.TABLES.get(env.TABLES.idFromName("salon")).fetch(request);
  }
  // Static pages live under /site, while the chess engine and profiles have
  // one canonical copy under /src/echecs. Keep both URLs backed by those
  // source locations instead of duplicating chess assets into site/assets.
  const assetUrl = new URL(request.url);
  if (assetUrl.pathname.startsWith("/src/echecs/")) {
    // Keep the canonical chess source path unchanged.
  } else if (assetUrl.pathname.startsWith("/site/")) {
    // Keep already-prefixed site paths unchanged; the asset handler resolves
    // /site/ to its index document.
  } else {
    assetUrl.pathname = `/site${assetUrl.pathname === "/" ? "/index.html" : assetUrl.pathname}`;
  }
  const res = await env.ASSETS.fetch(new Request(assetUrl, request));
  // Rien de la bêta ne doit être indexé ni partagé par un cache public.
  const out = new Response(res.body, res);
  out.headers.set("x-robots-tag", "noindex");
  out.headers.set("cache-control", "private, no-cache");
  return out;
}

export { Tables } from "./tables.js";
