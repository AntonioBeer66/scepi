// Test de bout en bout dans un vrai navigateur (Playwright) : le site
// compilé (site/, `npm run build` d'abord) servi par un petit serveur
// statique, une partie solo jouée jusqu'au 2e pli, reprise après
// rechargement, puis quittée : plus aucun bot ne doit tourner et rien ne
// doit rester dans le navigateur. Sans serveur de jeu : seul le solo compte.
//   node tests/coinche-e2e.js        (HEADED=1 pour voir le navigateur)
// Navigateur : le Chromium de Playwright s'il est installé
// (npx playwright install chromium), sinon Edge ou Chrome du poste.
import assert from "assert";
import fs from "fs";
import http from "http";
import path from "path";
import { chromium } from "playwright";

const ROOT = path.resolve("site");
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  // Pas de serveur de jeu ici : le salon le trouve indisponible (503).
  if (req.url.startsWith("/api/")) return res.writeHead(503).end();
  let file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/jeux/coinche/`;

async function launch() {
  const headless = !process.env.HEADED;
  for (const channel of [undefined, "msedge", "chrome"]) {
    try {
      return await chromium.launch({ headless, channel });
    } catch {
      // navigateur absent : on essaie le suivant
    }
  }
  throw new Error("Aucun navigateur : npx playwright install chromium");
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  // Le salon interroge le serveur de jeu, absent ici : erreurs attendues.
  if (m.type() === "error" && !/status of 503|ERR_CONNECTION_REFUSED|Failed to fetch/.test(m.text()))
    errors.push(m.text());
});

// Les bots tournent dans un Web Worker (host-worker.js) : on les recense
// pour vérifier qu'ils sont arrêtés en quittant.
await page.addInitScript(() => {
  const W = window.Worker;
  window.__workers = [];
  window.Worker = class extends W {
    constructor(...args) {
      super(...args);
      this.alive = true;
      window.__workers.push(this);
    }
    terminate() {
      this.alive = false;
      super.terminate();
    }
  };
});

const phase = () => page.locator(".cg-phase").textContent();

// Joue (passe aux enchères, première carte jouable) jusqu'à ce que test() soit vrai.
async function playUntil(test, ms = 90000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test()) return;
    const pass = page.locator(".cg-bidbar button", { hasText: "Passer" });
    if (await pass.count()) await pass.click().catch(() => {});
    const card = page.locator(".hand-buttons button").first();
    if (await card.count()) await card.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
  throw new Error(`délai dépassé (phase : ${await phase()})`);
}

try {
  await page.goto(url);
  await page.click("#solo-btn");
  await page.waitForSelector(".cg-phase");
  assert.match(await phase(), /Donne 1/);
  const canvas = page.locator("#coinche-stage canvas");
  assert.strictEqual(await canvas.count(), 1, "table Phaser affichée");

  // Deux plis joués : enchères, cartes, ramassage.
  await playUntil(async () => /Pli [3-8]\/8|Donne [2-9]/.test(await phase()));

  // Rechargement : la partie solo reprend là où elle en était.
  const before = await phase();
  await page.reload();
  await page.waitForSelector(".cg-phase");
  assert.ok(await page.locator("#game-view").isVisible(), "partie reprise");
  assert.strictEqual(await phase(), before, "même donne, même pli");

  // Quitter : plus aucun minuteur de bot, stockage solo vidé.
  await page.evaluate(() => {
    window.__timers = [];
    const st = window.setTimeout;
    window.setTimeout = (fn, ms, ...a) => {
      window.__timers.push(ms);
      return st(fn, ms, ...a);
    };
  });
  await page.locator(".cg-icon", { hasText: "Quitter" }).click();
  await page.waitForTimeout(4000);
  const after = await page.evaluate(() => ({
    hidden: document.querySelector("#game-view").hidden,
    timers: window.__timers.filter((ms) => ms >= 400 && ms !== 3000), // 3000 : salon
    workers: window.__workers.filter((w) => w.alive).length,
    stored: Object.keys(localStorage).filter((k) => k.startsWith("scepi-coinche-solo")),
    kept: ["state", "log"].map((k) =>
      JSON.parse(localStorage.getItem(`scepi-coinche-solo_${k}`) || "[]").length,
    ),
  }));
  assert.ok(after.hidden, "retour au salon");
  assert.deepStrictEqual(after.timers, [], "aucun bot ne joue après avoir quitté");
  assert.strictEqual(after.workers, 0, "hôte des bots arrêté");
  assert.deepStrictEqual(after.kept, [0, 0], "partie solo effacée du navigateur");
  assert.ok(!after.stored.includes("scepi-coinche-solo-match"), "plus de reprise en attente");

  // Nouvelle partie solo : repart de la donne 1.
  await page.click("#solo-btn");
  await page.waitForSelector(".cg-phase");
  assert.match(await phase(), /Donne 1 · Enchères/);

  assert.deepStrictEqual(errors, [], "aucune erreur dans la page");
  console.log("Navigateur : solo joué, repris après rechargement, quitté proprement.");
} catch (e) {
  // Diagnostic : ce que montrait la page au moment de l'échec.
  console.error("Erreurs de la page :", errors);
  console.error("HUD :", await page.locator("#game-hud").innerText().catch(() => "?"));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  throw e;
} finally {
  await browser.close();
  server.close();
}
