// Coinche en ligne de bout en bout, dans de vrais navigateurs (Playwright)
// sur le serveur du site (Worker + Durable Object) : deux joueurs
// s'assoient à une table libre, la lancent et jouent deux plis ; un spectateur
// regarde ; un joueur quitte, un bot le remplace sous son pseudo ; un
// visiteur prend la place d'un bot ; tous partis, la partie s'arrête.
//   npm start  (dans un autre terminal), puis :
//   node tests/coinche-online-e2e.js
// BASE : adresse du site (défaut http://localhost:8000) ; PASSWORD : mot
// de passe du site s'il en a un (sinon SITE_PASSWORD de .dev.vars) ;
// MOBILE=1 : téléphones tactiles (390 × 844) au lieu d'écrans de PC.
import assert from "assert";
import fs from "fs";
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:8000";
const PASSWORD =
  process.env.PASSWORD ??
  (fs.existsSync(".dev.vars")
    ? fs.readFileSync(".dev.vars", "utf8").match(/SITE_PASSWORD=(.*)/)?.[1]?.trim()
    : undefined);

async function launch() {
  for (const channel of [undefined, "msedge", "chrome"]) {
    try {
      return await chromium.launch({ headless: !process.env.HEADED, channel });
    } catch {
      // navigateur absent : on essaie le suivant
    }
  }
  throw new Error("Aucun navigateur : npx playwright install chromium");
}

const browser = await launch();
const errors = [];

// Un visiteur : son propre navigateur (cookies, stockage), connecté au site.
async function visitor(label) {
  const ctx = await browser.newContext(
    process.env.MOBILE
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${label} : ${e}`));
  // Émoticônes reçues par WebSocket (voir le test d'émoticône plus bas).
  page.emotes = [];
  page.on("websocket", (ws) =>
    ws.on("framereceived", ({ payload }) => {
      if (String(payload).includes('"type":"emote"')) page.emotes.push(JSON.parse(payload));
      if (String(payload).includes('"type":"state"')) page.lastG = JSON.parse(payload).G;
    }),
  );
  await page.goto(`${BASE}/jeux/coinche/`);
  if (await page.locator('input[name="mdp"]').count()) {
    assert.ok(PASSWORD, "mot de passe du site inconnu (PASSWORD)");
    await page.fill('input[name="mdp"]', PASSWORD);
    await page.click('button[type="submit"]');
  }
  await page.waitForSelector("#lobby-grid article");
  return page;
}

const phase = (page) => page.locator(".cg-phase").textContent();

// Joue ce qui se présente (passe aux enchères, première carte jouable).
async function playStep(page) {
  const pass = page.locator(".cg-bidbar button", { hasText: "Passer" });
  if (await pass.count()) await pass.click().catch(() => {});
  const card = page.locator(".hand-buttons button").first();
  if (await card.count()) await card.evaluate((b) => b.click()).catch(() => {}); // bouton masqué (clavier) : clic direct
}

async function until(test, pages, ms = 120000, what = "") {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await test()) return;
    for (const p of pages) await playStep(p);
    await pages[0].waitForTimeout(300);
  }
  throw new Error(`délai dépassé : ${what}`);
}

try {
  const alice = await visitor("Alice");
  const bob = await visitor("Bob");

  // Première table dont les sièges 0 et 2 sont libres : Alice et Bob.
  const matchID = await alice.evaluate(() =>
    [...document.querySelectorAll('form[data-seat="0"]')]
      .map((f) => f.dataset.match)
      .find((m) => document.querySelector(`form[data-match="${m}"][data-seat="2"]`)),
  );
  assert.ok(matchID, "aucune table libre");
  const sit = async (page, seat, name) => {
    const form = page.locator(`form[data-match="${matchID}"][data-seat="${seat}"]`);
    // Saisie lente : le salon se rafraîchit entre-temps sans l'effacer.
    await form.locator("input").pressSequentially(name);
    await page.waitForTimeout(4500);
    assert.strictEqual(await form.locator("input").inputValue(), name, "pseudo effacé par le rafraîchissement");
    await form.locator("button").click();
    await page.waitForSelector(".seat-occupant em");
  };
  await sit(alice, 0, "Alice");
  await sit(bob, 2, "Bob");

  await alice.click(`[data-action="start"][data-match="${matchID}"]`);
  await alice.waitForSelector(".cg-phase", { timeout: 20000 });
  await bob.waitForSelector(".cg-phase", { timeout: 20000 });
  assert.match(await phase(alice), /Donne 1/);
  assert.match(await phase(bob), /Donne 1/);

  // Deux plis joués à deux humains + deux bots (hôte : Alice).
  await until(async () => /Pli [3-8]\/8|Donne [2-9]/.test(await phase(bob)), [alice, bob], 120000, "deux plis");

  // Émoticône d'Alice (siège 0) relayée par le serveur jusqu'à Bob (en jeu :
  // sur téléphone, le bouton est masqué pendant les enchères).
  await alice.click(".cg-emote-toggle");
  await alice.click('.cg-emote[data-emote="😭"]');
  for (let i = 0; i < 25 && !bob.emotes.length; i++) await bob.waitForTimeout(200);
  assert.deepStrictEqual(bob.emotes[0], { type: "emote", seat: 0, emote: "😭" }, "émoticône reçue par Bob");

  // Spectateur : voit la partie, sans aucune commande de jeu.
  const watcher = await visitor("Spectateur");
  await watcher.click(`[data-action="watch"][data-match="${matchID}"]`);
  await watcher.waitForSelector(".cg-watch", { timeout: 20000 });
  assert.match(await phase(watcher), /Donne/);
  assert.strictEqual(await watcher.locator(".hand-buttons button, .cg-bidbar").count(), 0);
  // Il suit la main d'un seul joueur (tiré au hasard), jamais deux.
  const seen = (G) => [0, 1, 2, 3].filter((s) => G?.hands[s].some(Boolean));
  await until(async () => seen(watcher.lastG).length === 1, [alice], 20000, "main regardée");
  // Toucher le joueur de droite (avatar, placé comme dans table-scene.js) : sa main à lui.
  const next = (seen(watcher.lastG)[0] + 1) % 4;
  await watcher.waitForFunction(() => document.querySelector(".cg-felt")?.offsetWidth > 100); // table chargée
  const box = await watcher.locator("#coinche-stage").boundingBox();
  const cardH = Math.max(84, Math.min(box.height * 0.26, 210, box.width < box.height * 0.9 ? box.width * 0.24 * 1.4 : 999));
  const r = Math.round(Math.max(20, Math.min(30, Math.min(box.width, box.height) * 0.035)));
  const sideY = (10 + box.height - cardH * 0.72) / 2 - (box.width < box.height * 0.9 ? (box.height - cardH * 0.72 - 10) * 0.12 : 0);
  await watcher.mouse.click(box.x + box.width - 10 - r - 14, box.y + sideY);
  await until(async () => seen(watcher.lastG).join() === String(next), [alice], 20000, "autre main regardée");

  // Bob quitte : un bot prend sa place, sous son pseudo marqué « (bot) »,
  // et la partie continue.
  await bob.locator(".cg-icon", { hasText: "Quitter" }).click();
  await until(
    async () => /Bob \(bot\)/.test(await alice.locator("#game-announce").textContent()),
    [alice],
    90000, "Bob (bot)",
  );

  // Dave arrive en cours de partie et prend la place d'un bot (Est).
  const dave = await visitor("Dave");
  const daveForm = dave.locator(`form[data-match="${matchID}"][data-seat="1"]`);
  await daveForm.locator("input").fill("Dave");
  await daveForm.locator("button", { hasText: "Remplacer le bot" }).click();
  await dave.waitForSelector(".cg-phase", { timeout: 20000 });
  // Il joue désormais pour cette place : enchère ou carte à son tour.
  await until(async () => (await dave.locator(".hand-buttons button, .cg-bidbar").count()) > 0, [alice], 60000, "tour de Dave");
  await dave.locator(".cg-icon", { hasText: "Quitter" }).click();

  // Alice quitte à son tour : plus personne, la partie s'arrête (table
  // effacée, le spectateur revient au salon).
  await alice.locator(".cg-icon", { hasText: "Quitter" }).click();
  await watcher.waitForSelector("#game-view", { state: "hidden", timeout: 20000 });
  const tables = await (await alice.request.get(`${BASE}/api/tables`)).json();
  assert.ok(!tables.some((t) => t.matchID === matchID), "partie arrêtée quand tout le monde a quitté");

  assert.deepStrictEqual(errors, [], "aucune erreur dans les pages");
  console.log(`En ligne : partie lancée à deux, jouée, regardée, joueur remplacé par un bot puis bot remplacé par un joueur, arrêtée quand tous sont partis (${BASE}).`);
} finally {
  await browser.close();
}
