// Comparatif de variantes du logo d'en-tête (image pour choisir), rendu par
// Playwright avec les vraies images et la police du site.
//   node tools/header-variants.mjs <sortie.png>
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const data = (f, type) => `data:${type};base64,${fs.readFileSync(path.join(ROOT, f)).toString("base64")}`;
const WHITE = data("site/assets/images/logo-white.png", "image/png");
const COLOR = data("site/assets/images/logo-color.png", "image/png");
const TILE = data("site/assets/images/favicon-192.png", "image/png");
const FONT = data("site/assets/fonts/oxanium-latin.woff2", "font/woff2");

const nav = `<nav><a class="on">Accueil</a><a>L’asso</a><a>Jeux</a><a>Nos événements</a><a>Actus</a><a>Contact</a></nav>`;
const bar = (label, brand) => `<section><p class="label">${label}</p><header>${brand}${nav}</header></section>`;

const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Oxanium; font-weight: 500 800; src: url(${FONT}) format("woff2"); }
body { margin: 0; padding: 24px; background: #1b1626; font-family: system-ui, "Segoe UI", sans-serif; }
section { margin-bottom: 22px; }
.label { margin: 0 0 8px; color: #f4c600; font: 700 15px Oxanium, sans-serif; letter-spacing: .04em; }
header { display: flex; align-items: center; justify-content: space-between; height: 92px; padding: 0 36px;
  background: #0c0914; border: 1px solid #ffffff19; border-radius: 12px; }
nav { display: flex; gap: 28px; } nav a { color: #bdb5cd; font-size: 14px; } nav a.on { color: #f7f4fc; }
.brand { display: flex; align-items: center; gap: 12px; color: #f7f4fc; font-family: Oxanium, sans-serif; }
.two { font-size: 19px; font-weight: 800; letter-spacing: .1em; line-height: 1; }
.two small { display: block; margin-top: 7px; font-size: 10px; letter-spacing: .27em; }
.one { font-size: 23px; font-weight: 800; letter-spacing: .01em; }
.one b { color: #f4c600; font-weight: 800; }
</style>
${bar("ACTUEL — emblème blanc + nom sur deux lignes",
  `<div class="brand"><img src="${WHITE}" height="54"><span class="two">SCEP<small>INVADERS</small></span></div>`)}
${bar("A — emblème couleur + nom sur deux lignes",
  `<div class="brand"><img src="${COLOR}" height="56"><span class="two">SCEP<small>INVADERS</small></span></div>`)}
${bar("B — emblème couleur plus grand + nom sur une ligne",
  `<div class="brand"><img src="${COLOR}" height="64"><span class="one">SCEP <b>Invaders</b></span></div>`)}
${bar("C — pastille de l’appli + nom sur une ligne",
  `<div class="brand"><img src="${TILE}" height="52" style="border-radius:12px"><span class="one">SCEP Invaders</span></div>`)}
${bar("D — emblème couleur seul, sans texte",
  `<div class="brand"><img src="${COLOR}" height="70"></div>`)}`;

let browser;
for (const channel of [undefined, "msedge", "chrome"]) {
  browser = await chromium.launch({ channel }).catch((e) => (console.error(channel, e.message.split("\n")[0]), null));
  if (browser) break;
}
const page = await browser.newPage({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: process.argv[2] || "header-variants.png", fullPage: true });
await browser.close();
