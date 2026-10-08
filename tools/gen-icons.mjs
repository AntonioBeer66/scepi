// Icônes du site et de l'appli Android, et image d'aperçu des liens (Open
// Graph), générées depuis l'emblème original (Logos/) par un navigateur
// Playwright. L'emblème reste entier, sans recadrage ni recoloration
// (DIRECTION_ARTISTIQUE.md) : il est posé sur un fond violet sombre.
//   node tools/gen-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMG = path.join(ROOT, "site/assets/images");
const RES = path.join(ROOT, "android/src/main/res");
const b64 = (f) => fs.readFileSync(path.join(ROOT, f)).toString("base64");
const LOGO = `data:image/png;base64,${b64("Logos/0.logo_scepi_revisité_qualitatif.png")}`;
const FONT = `data:font/woff2;base64,${b64("site/assets/fonts/oxanium-latin.woff2")}`;
const BG = "linear-gradient(160deg, #2a1850 0%, #140c26 58%, #0c0914 100%)";

const page = (body, css = "") => `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Oxanium; font-weight: 500 800; src: url(${FONT}) format("woff2"); }
html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
body { display: grid; place-items: center; background: transparent; }
${css}</style>${body}`;

// Carré plein (site, Google) ou arrondi (appli) ; logo = part de la largeur.
const icon = ({ radius = 0, logo = 0.82, bg = BG }) =>
  page(
    `<div class="tile"><img src="${LOGO}"></div>`,
    `.tile { width: 100%; height: 100%; display: grid; place-items: center;
       background: ${bg}; border-radius: ${radius}%; }
     img { width: ${logo * 100}%; }`,
  );

const og = page(
  `<div class="og">
    <img src="${LOGO}">
    <div class="copy">
      <h1>SCEP Invaders</h1>
      <p class="tag">L’asso de jeux de l’ESCP</p>
      <p class="sub">Jeux vidéo · jeux de société · coinche en ligne</p>
      <p class="url">www.scepinvaders.com</p>
    </div>
  </div>`,
  `.og { width: 100%; height: 100%; display: flex; align-items: center; gap: 52px;
     padding: 0 60px; box-sizing: border-box; background:
       radial-gradient(1.5px 1.5px at 820px 90px, #fff6, transparent),
       radial-gradient(1px 1px at 1010px 210px, #fff5, transparent),
       radial-gradient(1.5px 1.5px at 1120px 520px, #f4c60088, transparent),
       radial-gradient(1px 1px at 690px 560px, #fff4, transparent),
       radial-gradient(1px 1px at 560px 70px, #fff4, transparent),
       linear-gradient(135deg, #2a1850 0%, #140c26 55%, #0c0914 100%); }
   img { height: 440px; flex: none; }
   .copy { font-family: Oxanium, system-ui, sans-serif; color: #f7f4fc; white-space: nowrap; }
   h1 { margin: 0; font-size: 96px; font-weight: 800; line-height: 1; letter-spacing: -0.01em; white-space: normal; }
   .tag { margin: 22px 0 0; font-size: 37px; font-weight: 700; color: #f4c600; }
   .sub { margin: 26px 0 0; font: 500 22px system-ui, "Segoe UI", sans-serif; color: #bdb5cd; }
   .url { margin: 44px 0 0; font-size: 26px; font-weight: 600; color: #f7f4fc; opacity: 0.75; }`,
);

// Aperçu de la page coinche (le lien qu'on s'envoie pour jouer) : éventail
// sur le tapis vert, accent vert réservé à la coinche.
const CARD = (id) => `data:image/png;base64,${b64(`site/assets/images/coinche/cards/${id}.png`)}`;
const GREEN_LOGO = `data:image/png;base64,${b64("site/assets/images/logo-green.png")}`;
const ogCoinche = page(
  `<div class="og">
    <div class="felt"><div class="fan">${["JH", "9H", "AH", "10H", "KH"]
      .map((c, i) => `<img src="${CARD(c)}" style="transform: rotate(${(i - 2) * 13}deg)">`)
      .join("")}</div></div>
    <div class="copy">
      <p class="eye"><img src="${GREEN_LOGO}">SCEP INVADERS</p>
      <h1>Coinche<br><span>en ligne</span></h1>
      <p class="sub">Gratuit, sans compte · entre amis ou en solo</p>
      <p class="url">scepinvaders.com/jeux/coinche</p>
    </div>
  </div>`,
  `.og { width: 100%; height: 100%; display: flex; align-items: center; gap: 56px;
     padding: 0 64px 0 0; box-sizing: border-box;
     background: linear-gradient(135deg, #1a1033 0%, #0c0914 70%); }
   .felt { position: relative; flex: none; width: 560px; height: 100%;
     background: radial-gradient(ellipse at 50% 62%, #2b6a26, #0f1e0f 72%);
     box-shadow: inset -40px 0 60px -30px #0c0914; }
   .fan { position: absolute; left: 50%; bottom: 175px; }
   .fan img { position: absolute; left: -82px; bottom: 0; width: 164px; border-radius: 12px;
     box-shadow: 0 18px 36px #000a; transform-origin: 50% 165%; }
   .copy { font-family: Oxanium, system-ui, sans-serif; color: #f7f4fc; }
   .eye { display: flex; align-items: center; gap: 12px; margin: 0; font: 700 20px Consolas, monospace;
     letter-spacing: 0.14em; color: #39ff14; }
   .eye img { width: 44px; }
   h1 { margin: 22px 0 0; font-size: 104px; font-weight: 800; line-height: 0.98; letter-spacing: -0.02em; }
   h1 span { color: #39ff14; }
   .sub { margin: 28px 0 0; font: 500 23px system-ui, "Segoe UI", sans-serif; color: #bdb5cd; }
   .url { margin: 36px 0 0; font-size: 24px; font-weight: 600; opacity: 0.75; }`,
);

async function launch() {
  for (const channel of [undefined, "msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // navigateur absent : on essaie le suivant
    }
  }
  throw new Error("Aucun navigateur : npx playwright install chromium");
}

const browser = await launch();
async function shot(html, w, h, out, type = "png") {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await p.screenshot({ path: out, type, omitBackground: type === "png", ...(type === "jpeg" && { quality: 88 }) });
  await p.close();
  return out;
}

// Site : favicons (Google veut un multiple de 48 px) sur fond transparent,
// l'emblème seul ; l'icône iOS garde un fond (iOS mettrait du noir derrière).
const bare = icon({ bg: "transparent", logo: 0.96 });
for (const s of [16, 32, 48, 64, 96, 192]) await shot(bare, s, s, path.join(IMG, `favicon-${s}.png`));
await shot(bare, 512, 512, path.join(IMG, "icon-512.png"));
await shot(icon({}), 180, 180, path.join(IMG, "apple-touch-icon.png"));
await shot(og, 1200, 630, path.join(IMG, "og-scepi.jpg"), "jpeg");
await shot(ogCoinche, 1200, 630, path.join(IMG, "og-coinche.jpg"), "jpeg");
// Vignette carrée des résultats Google (il recadre au centre : le texte de
// l'aperçu large serait coupé), désignée par primaryImageOfPage.
await shot(icon({ logo: 0.78 }), 1200, 1200, path.join(IMG, "og-scepi-carre.jpg"), "jpeg");

// favicon.ico : 16, 32 et 48 px en PNG dans un conteneur ICO.
const pngs = [16, 32, 48].map((s) => fs.readFileSync(path.join(IMG, `favicon-${s}.png`)));
const head = Buffer.alloc(6 + 16 * pngs.length);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(pngs.length, 4);
let offset = head.length;
pngs.forEach((png, i) => {
  const s = [16, 32, 48][i];
  const e = 6 + 16 * i;
  head[e] = s;
  head[e + 1] = s;
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(png.length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += png.length;
});
const ico = Buffer.concat([head, ...pngs]);
fs.writeFileSync(path.join(IMG, "favicon.ico"), ico);
fs.writeFileSync(path.join(ROOT, "site/favicon.ico"), ico); // /favicon.ico, lu par Google

// Appli Android : icône classique arrondie par densité, et icône adaptative
// (Android 8+) : emblème dans la zone sûre (66 % du centre), fond uni.
const rounded = icon({ radius: 22, logo: 0.8 });
const DENSITY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(DENSITY)) {
  await shot(rounded, s, s, path.join(RES, `mipmap-${d}`, "ic_launcher.png"));
  await shot(icon({ bg: "transparent", logo: 0.6 }), s * 2.25, s * 2.25, path.join(RES, `mipmap-${d}`, "ic_launcher_foreground.png"));
}
await browser.close();
console.log("icônes et aperçu générés");
