// Coinche en ligne de bout en bout, dans de vrais navigateurs (Playwright)
// sur le serveur du site (Worker + Durable Object) : deux joueurs
// s'assoient à une table libre, la lancent et jouent deux plis, s'envoient
// émoticône et message ; un spectateur (pseudo unique) regarde et écrit,
// l'hôte le bannit du chat puis le débannit ; un joueur quitte, un bot le remplace sous son pseudo ; un
// visiteur prend la place d'un bot ; tous partis, la partie s'arrête.
//   npm start  (dans un autre terminal), puis :
//   node tests/coinche-online-e2e.js
// BASE : adresse du site (défaut http://localhost:8000) ; PASSWORD : mot
// de passe du site s'il en a un (sinon SITE_PASSWORD de .dev.vars) ;
// MOBILE=1 : téléphones tactiles (390 × 844) au lieu d'écrans de PC.
import assert from "assert";
import fs from "fs";
import { chromium } from "playwright";
import { CHAT_GAP_MS } from "../src/online/tables.js";

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
      ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
      : { viewport: { width: 1440, height: 900 } },
  );
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${label} : ${e.stack}`));
  // Émoticônes reçues par WebSocket (voir le test d'émoticône plus bas).
  page.emotes = [];
  page.chats = [];
  page.on("websocket", (ws) =>
    ws.on("framereceived", ({ payload }) => {
      if (String(payload).includes('"type":"emote"')) page.emotes.push(JSON.parse(payload));
      if (String(payload).includes('"type":"chat"')) page.chats.push(JSON.parse(payload));
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

// Messages : envoyé palette ouverte ; le bouton d'envoi reste bloqué
// CHAT_GAP_MS (anti-spam), attendu ici ; chatCount attend que la page en ait reçu n.
async function say(page, text) {
  await page.fill(".cg-chat input", text);
  await page.press(".cg-chat input", "Enter");
  assert.ok(await page.locator(".cg-chat button").isDisabled(), "envoi bloqué juste après un message");
  await page.waitForTimeout(CHAT_GAP_MS + 200);
}
async function chatCount(page, n) {
  for (let i = 0; i < 25 && page.chats.length < n; i++) await page.waitForTimeout(200);
  assert.ok(page.chats.length >= n, `${n} messages attendus, ${page.chats.length} reçus`);
}

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

  // Message de Bob (siège 2), une seconde plus tard (une par seconde au plus).
  await bob.waitForTimeout(1100);
  await bob.click(".cg-emote-toggle");
  await bob.fill(".cg-chat input", "  Bien joué\npartenaire ");
  await bob.press(".cg-chat input", "Enter");
  await chatCount(alice, 1);
  assert.deepStrictEqual(
    alice.chats[0],
    { type: "chat", seat: 2, name: "Bob", text: "Bien joué partenaire" },
    "message reçu par Alice",
  );
  // Palette d'Alice fermée : une pastille compte le message ; l'ouvrir l'efface.
  await alice.waitForSelector(".cg-badge:not([hidden])");
  assert.strictEqual(await alice.locator(".cg-badge").textContent(), "1");
  await alice.click(".cg-emote-toggle");
  assert.match(await alice.locator(".cg-chat-log").textContent(), /Bob Bien joué partenaire/);
  assert.ok(await alice.locator(".cg-badge").isHidden(), "pastille effacée à l'ouverture");
  await alice.click(".cg-emote-toggle");
  await bob.click(".cg-emote-toggle"); // palette laissée ouverte après l'envoi

  // Spectateur : donne un pseudo (pas celui d'un joueur de la table : refusé,
  // retour au salon), voit la partie, sans aucune commande de jeu.
  const watcher = await visitor("Spectateur");
  const watchAs = async (name) => {
    const form = watcher.locator(`form[data-action="watch"][data-match="${matchID}"]`);
    await form.locator("input").fill(name);
    await form.locator("button").click();
  };
  const refused = new Promise((ok) => watcher.once("dialog", (d) => { ok(d.message()); d.accept(); }));
  await watchAs("ALICE");
  assert.match(await refused, /déjà pris/, "pseudo d'un joueur refusé au spectateur");
  await watcher.waitForSelector("#game-view", { state: "hidden" });
  await watchAs("Zoé");
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
  await (process.env.MOBILE ? watcher.touchscreen.tap : watcher.mouse.click).call(process.env.MOBILE ? watcher.touchscreen : watcher.mouse, box.x + box.width - 10 - r - 14, box.y + sideY);
  await until(async () => seen(watcher.lastG).join() === String(next), [alice], 20000, "autre main regardée");

  // Le spectateur figure dans la liste des spectateurs ; il écrit aussi (sans
  // émoticônes), et son message arrive signé de son pseudo.
  await alice.click(".cg-emote-toggle");
  assert.match(await alice.locator(".cg-chat-watchers").textContent(), /Spectateurs : Zoé/);
  await watcher.click(".cg-emote-toggle");
  assert.strictEqual(await watcher.locator(".cg-emote").count(), 0, "pas d'émoticônes pour un spectateur");
  await say(watcher, "Allez Nord-Sud");
  await chatCount(alice, 2);
  assert.deepStrictEqual(alice.chats[1], { type: "chat", seat: null, name: "Zoé", text: "Allez Nord-Sud" }, "message du spectateur");

  // /ban : refusé à Bob (pas hôte) ; Alice, hôte, bannit Zoé, dont les
  // messages ne partent plus ; /deban la laisse de nouveau écrire.
  await bob.click(".cg-emote-toggle");
  await say(bob, "/ban Zoé");
  await chatCount(bob, 3); // Bob a déjà reçu le message de Zoé
  assert.match(bob.chats.at(-1).text, /Seul l'hôte/);
  await bob.click(".cg-emote-toggle");
  await say(alice, "/ban zoé");
  await chatCount(alice, 3);
  assert.deepStrictEqual(alice.chats[2], { type: "chat", seat: null, name: null, text: "zoé est banni du chat par l'hôte." });
  await say(watcher, "Je suis encore là ?");
  await chatCount(watcher, 3); // le sien, le bannissement, le refus
  assert.match(watcher.chats.at(-1).text, /banni/);
  assert.strictEqual(alice.chats.length, 3, "message d'une personne bannie non relayé");
  await say(alice, "/deban Zoé");
  await say(watcher, "Merci !");
  await chatCount(alice, 5);
  assert.deepStrictEqual(alice.chats[4], { type: "chat", seat: null, name: "Zoé", text: "Merci !" }, "débannie");
  await alice.click(".cg-emote-toggle");
  await watcher.click(".cg-emote-toggle");

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
  // Pseudo de la spectatrice : refusé aussi pour s'asseoir.
  const daveRefused = new Promise((ok) => dave.once("dialog", (d) => { ok(d.message()); d.accept(); }));
  await daveForm.locator("input").fill("ZOÉ");
  await daveForm.locator("button", { hasText: "Remplacer le bot" }).click();
  assert.match(await daveRefused, /déjà pris/, "pseudo d'un spectateur refusé à une place");
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
