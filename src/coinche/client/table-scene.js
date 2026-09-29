// La table de coinche dessinée avec Phaser, dans l'univers arcade SCEPI :
// tapis violet nuit, avatars avec anneau-chrono doré, bulles d'enchère,
// main en éventail, cartes lancées au centre, pli ramassé vers son
// gagnant. Elle ne décide de rien : à chaque état reçu, elle compare avec le
// précédent pour savoir quoi animer. Mouvement réduit : tout est instantané.
// Rendu net sur écran haute densité : le canevas a la taille réelle en
// pixels de l'écran (CSS × devicePixelRatio), la caméra zoome d'autant et
// les textes sont rastérisés à cette résolution ; toute la mise en page
// reste en pixels CSS.
// Cartes : les images sont recopiées une fois dans des textures carrées
// (puissance de deux) aux coins arrondis, avec mipmaps : elles restent nettes
// quelle que soit leur réduction. Le tapis est en CSS (.cg-felt).
// Éventail : chaque carte pivote autour d'un point sous la main (angle
// fixe entre deux cartes, ouverture bornée par la largeur disponible).
import * as Phaser from "phaser";
import {
  RANKS,
  SUITS,
  SUIT_SYMBOL,
  PLAIN_FORCE,
  TRUMP_FORCE,
  computeLegal,
  DURATION_MS,
  teamOf,
} from "../engine.js";
import { TRICK_SHOW_MS } from "../host.js";

const CARD_PX = { w: 320, h: 491 }; // taille des images de cartes
const CARD_RATIO = CARD_PX.h / CARD_PX.w;
const POT = 512; // texture carrée puissance de deux : mipmaps possibles
const SHADOW_K = 1.35; // l'ombre floue déborde de la carte
const DRAG_MIN = 8; // px : en deçà, un clic ; au-delà, un glisser
const TRICK_PAUSE_MS = 1100; // pli complet affiché, gagnant en évidence
const COLLECT_MS = 550; // puis ramassé (total : TRICK_SHOW_MS de host.js)
const CARD_IDS = SUITS.flatMap((s) => RANKS.map((r) => r + s));
const FAN_STEP = Phaser.Math.DegToRad(6.5);
const COMPASS = ["Sud", "Est", "Nord", "Ouest"]; // position vue du joueur
const COLORS = {
  text: "#f7f4fc",
  ink: "#181127",
  gold: 0xf4c600,
  goldCss: "#f4c600",
  danger: 0xff5b5b,
  avatar: 0x3c3489,
  avatarMe: 0x26215c,
  bubble: 0xf7f4fc,
};
const FONT = 'system-ui, "Segoe UI", sans-serif';

const isRed = (s) => s === "H" || s === "D";

// Main triée comme on la tient : l'atout à gauche (une fois le contrat
// connu), puis les couleurs en alternant rouge et noir ; dans chaque
// couleur, de la plus forte à la plus faible (ordre de l'atout pour l'atout).
function sortHand(hand, atout) {
  const present = SUITS.filter((s) => hand.some((c) => c.suit === s));
  const order = present.includes(atout) ? [atout] : [];
  const rest = present.filter((s) => s !== atout);
  while (rest.length) {
    const last = order[order.length - 1];
    const i = last ? rest.findIndex((s) => isRed(s) !== isRed(last)) : 0;
    order.push(rest.splice(Math.max(i, 0), 1)[0]);
  }
  const force = (c) => (c.suit === atout ? TRUMP_FORCE : PLAIN_FORCE)[c.rank];
  return hand
    .slice()
    .sort(
      (a, b) =>
        order.indexOf(a.suit) - order.indexOf(b.suit) || force(b) - force(a),
    );
}

// Petit angle stable par carte, pour un pli posé à la main.
function tilt(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Phaser.Math.DegToRad(((h >>> 0) % 15) - 7);
}

function initials(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  const s =
    words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2);
  return s.toUpperCase();
}

function bidLabel(montant, atout) {
  const m = montant === 250 ? "Capot" : montant === 270 ? "Capot beloté" : montant;
  return `${m} ${SUIT_SYMBOL[atout]}`;
}

// Recopie chaque carte (et le dos) dans une texture 512×512, coins arrondis
// et liseré compris ; les images n'utilisent que son cadre « f ». Plus une
// ombre floue partagée, étirée à la taille de chaque carte.
function bakeTextures(scene) {
  const { w, h } = CARD_PX;
  const rad = w * 0.07;
  for (const key of [...CARD_IDS, "back"]) {
    const c = document.createElement("canvas");
    c.width = c.height = POT;
    const ctx = c.getContext("2d");
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(1, 1, w, h, rad);
    ctx.clip();
    ctx.drawImage(scene.textures.get(key).getSourceImage(), 1, 1, w, h);
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = key === "back" ? "#ffffff55" : "#00000026";
    ctx.beginPath();
    ctx.roundRect(2.5, 2.5, w - 3, h - 3, rad - 1.5);
    ctx.stroke();
    scene.textures.addCanvas(`c:${key}`, c).add("f", 0, 0, 0, w + 2, h + 2);
  }
  const s = document.createElement("canvas");
  s.width = s.height = 128;
  const k = 128 / SHADOW_K;
  const ctx = s.getContext("2d");
  ctx.filter = "blur(8px)";
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.roundRect(64 - k / 2, 64 - k / 2, k, k, 10);
  ctx.fill();
  scene.textures.addCanvas("shadow", s);
  // Étincelle des particules : point lumineux dégradé.
  const p = document.createElement("canvas");
  p.width = p.height = 32;
  const pc = p.getContext("2d");
  const grad = pc.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "#fff");
  grad.addColorStop(0.35, "#fff8");
  grad.addColorStop(1, "#fff0");
  pc.fillStyle = grad;
  pc.fillRect(0, 0, 32, 32);
  scene.textures.addCanvas("spark", p);
}

export function createTable(parent, { me, onPlay }) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dur = (ms) => (reduced ? 0 : ms);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  // Spectateur (me = -1) : la table vue depuis le siège 0.
  const anchor = me < 0 ? 0 : me;
  const posOf = (seat) => (seat - anchor + 4) % 4;

  let scene = null;
  let G = null;
  let queued = null; // dernier état reçu avant la fin du chargement
  let focusId = null;
  let hoverId = null;
  let blockedUntil = 0;
  let timer = null; // { start, total } : fenêtre de temps en cours
  let L = null; // mise en page courante

  const hand = new Map(); // id → { box, halo, img, shadow }
  const trick = new Map(); // id → carte posée au centre (conteneur)
  let sweeping = [];
  let seatObjs = [];
  let seatSig = "";
  const lastBubble = [];
  let ring = null; // anneau-chrono, redessiné à chaque image

  const txt = (x, y, str, style) =>
    scene.add.text(x, y, str, { fontFamily: FONT, resolution: dpr, ...style });

  // ---- Mise en page (pixels CSS) ------------------------------------------

  function layout() {
    const W = parent.clientWidth || 800;
    const H = parent.clientHeight || 500;
    const portrait = W < H * 0.9;
    const cardH = Math.round(
      Math.max(84, Math.min(H * 0.26, 210, portrait ? W * 0.24 * CARD_RATIO : 999)),
    );
    const cardW = cardH / CARD_RATIO;
    const r = Math.round(Math.max(20, Math.min(30, Math.min(W, H) * 0.035)));
    const top = 10;
    const bottom = H - cardH * 0.72;
    const left = 10;
    const right = W - 10;
    const cx = W / 2;
    const cy = (top + bottom) / 2;
    const tableH = bottom - top;
    const trickH = Math.round(
      Math.max(64, Math.min(tableH * 0.3, (right - left) * 0.14 * CARD_RATIO, 150)),
    );
    const trickW = trickH / CARD_RATIO;
    const d = trickH * 0.5;
    // Éventail : rayon proportionnel à la carte, ouverture bornée.
    const R = cardH * 4;
    const avail = Math.max(0, W - cardW * 1.7 - 24);
    const maxSpread = 2 * Math.asin(Math.min(1, avail / (2 * R)));
    const sideY = cy - (portrait ? tableH * 0.12 : 0);
    const handY = H - cardH * 0.56 - 10;
    // Haut de la main, cartes jouables soulevées comprises.
    const handTop = handY - cardH * 0.74;
    return {
      W,
      H,
      cx,
      cy,
      top,
      bottom,
      left,
      right,
      r,
      cardH,
      cardW,
      trickH,
      trickW,
      R,
      maxSpread,
      handY,
      seat: [
        // Vous : coin bas gauche, au-dessus de l'éventail (spectateur : le
        // joueur Sud en bas au centre, comme Nord en haut).
        me < 0
          ? { x: cx, y: bottom - r - 10 }
          : { x: left + r + 18, y: Math.min(bottom - r - 14, handTop - r - 8) },
        { x: right - r - 14, y: sideY },
        { x: cx, y: top + r + 10 },
        { x: left + r + 14, y: sideY },
      ],
      slot: [
        { x: cx, y: cy + d },
        { x: cx + d * 1.3, y: cy },
        { x: cx, y: cy - d },
        { x: cx - d * 1.3, y: cy },
      ],
    };
  }

  // ---- Tapis (CSS, sous le canevas) ----------------------------------------

  const felt = document.createElement("div");
  felt.className = "cg-felt";
  parent.prepend(felt);

  function drawTable() {
    const w = L.right - L.left;
    const h = L.bottom - L.top;
    Object.assign(felt.style, {
      left: `${L.left}px`,
      top: `${L.top}px`,
      width: `${w}px`,
      height: `${h}px`,
      borderRadius: `${Math.min(h / 2, w / 2, 160)}px`,
    });
    felt.style.setProperty("--logo", `${Math.round(Math.min(h * 0.42, 190))}px`);
  }

  // ---- Cartes : ombre douce + image (tailles en pixels CSS) -----------------

  function sizeCard(box, w, h) {
    box.img.setDisplaySize(w, h);
    box.shadow.setDisplaySize(w * SHADOW_K, h * SHADOW_K).setPosition(0, h * 0.045);
  }

  function cardBox(id, w, h) {
    const shadow = scene.add.image(0, 0, "shadow").setAlpha(0.55);
    const img = scene.add.image(0, 0, `c:${id}`, "f");
    const box = scene.add.container(0, 0, [shadow, img]);
    box.id = id;
    box.img = img;
    box.shadow = shadow;
    sizeCard(box, w, h);
    return box;
  }

  // ---- Sièges : avatar, nom, bulle, dos des cartes ---------------------------

  function bubbleText(seat) {
    if (G.phase === "ENCHERES" || G.phase === "SURCOINCHE") {
      const e = G.bidLog.filter((x) => x.seat === seat).pop();
      if (!e) return null;
      const lead = G.contract && G.contract.preneur === seat;
      let t = e.montant ? bidLabel(e.montant, e.atout) : "Passe";
      if (lead && G.contract.coinche) t += G.contract.surcoinche ? " ×4" : " ×2";
      return { t, lead };
    }
    if (
      (G.phase === "JEU" || G.phase === "SCORE") &&
      G.contract?.preneur === seat &&
      G.belote.beloteDeclared
    )
      return {
        t: G.belote.rebeloteDeclared ? "Rebelote !" : "Belote !",
        lead: true,
      };
    return null;
  }

  // Redessinés seulement si ce qu'ils montrent a changé : pas de textes
  // recréés (et renvoyés au GPU) pendant les animations.
  function drawSeats(force) {
    const sig = JSON.stringify([
      G.phase,
      G.joueurActif,
      G.donneur,
      G.seats,
      G.hands.map((h) => h.length),
      [0, 1, 2, 3].map(bubbleText),
    ]);
    if (!force && sig === seatSig) return;
    seatSig = sig;
    seatObjs.forEach((o) => o.destroy());
    seatObjs = [];
    for (let seat = 0; seat < 4; seat++) {
      const pos = posOf(seat);
      const { x, y } = L.seat[pos];
      const active =
        (G.phase === "ENCHERES" || G.phase === "JEU") && G.joueurActif === seat;
      const bot = G.seats[seat].type === "bot";
      const name =
        seat === me ? "Vous" : bot ? `Bot ${COMPASS[pos]}` : G.seats[seat].name;
      const box = scene.add.container(x, y).setDepth(8);

      // Dos des cartes restantes, en petit éventail tourné vers le centre.
      if (seat !== me) {
        const n = G.hands[seat].length;
        // Décalé vers le centre de la table, le haut des cartes vers le joueur.
        const bw = L.r * 1.1;
        const dir = [[0, -1], [-1, 0], [0, 1], [1, 0]][pos];
        const off = L.r + bw * 1.1;
        const fan = scene.add
          .container(dir[0] * off, dir[1] * off)
          .setRotation([Math.PI, Math.PI / 2, 0, -Math.PI / 2][pos]);
        const bh = bw * CARD_RATIO;
        for (let i = 0; i < n; i++) {
          const a = (i - (n - 1) / 2) * 0.13;
          fan.add(
            scene.add
              .image(Math.sin(a) * bw * 2.2, (1 - Math.cos(a)) * bw * 2.2, "c:back", "f")
              .setDisplaySize(bw, bh)
              .setRotation(a),
          );
        }
        box.add(fan);
      }

      const disc = scene.add.graphics();
      disc
        .fillStyle(0x000000, 0.35)
        .fillCircle(0, 3, L.r + 1)
        .fillStyle(seat === me ? COLORS.avatarMe : COLORS.avatar, 1)
        .fillCircle(0, 0, L.r)
        .lineStyle(2, active ? COLORS.gold : 0xffffff, active ? 1 : 0.18)
        .strokeCircle(0, 0, L.r);
      box.add(disc);
      box.add(
        txt(0, 0, seat === me ? "Vous" : bot ? "IA" : initials(name), {
          fontSize: `${Math.round(L.r * (seat === me ? 0.5 : 0.62))}px`,
          fontStyle: "bold",
          color: COLORS.text,
        }).setOrigin(0.5),
      );
      if (seat !== me)
        box.add(
          txt(0, L.r + 4, name, {
            fontSize: "12px",
            fontStyle: "bold",
            color: active ? COLORS.goldCss : COLORS.text,
            stroke: "#0c0914",
            strokeThickness: 3,
          }).setOrigin(0.5, 0),
        );

      if (G.donneur === seat) {
        const chip = scene.add.graphics();
        const px = L.r * 0.75;
        const py = -L.r * 0.75;
        chip.fillStyle(COLORS.gold, 1).fillCircle(px, py, 9);
        box.add(chip);
        box.add(
          txt(px, py, "D", {
            fontSize: "11px",
            fontStyle: "bold",
            color: COLORS.ink,
          }).setOrigin(0.5),
        );
      }

      const b = bubbleText(seat);
      if (b) {
        const label = txt(0, 0, b.t, {
          fontSize: "13px",
          fontStyle: "bold",
          color: COLORS.ink,
        }).setOrigin(0.5);
        const bw = label.width + 18;
        const bh = label.height + 10;
        // À côté de l'avatar, du côté du centre de la table.
        const side = pos === 1 ? -1 : 1;
        const bx = side * (L.r + 10 + bw / 2);
        const by = pos === 2 ? 0 : -L.r * 0.2;
        const bg = scene.add.graphics();
        bg.fillStyle(0x000000, 0.3)
          .fillRoundedRect(bx - bw / 2, by - bh / 2 + 3, bw, bh, bh / 2)
          .fillStyle(b.lead ? COLORS.gold : COLORS.bubble, 1)
          .fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, bh / 2);
        label.setPosition(bx, by);
        box.add([bg, label]);
        // Nouvelle bulle : petite apparition.
        if (!reduced && lastBubble[seat] !== b.t) {
          bg.setAlpha(0);
          label.setAlpha(0);
          scene.tweens.add({ targets: [bg, label], alpha: 1, duration: 180 });
        }
      }
      lastBubble[seat] = b?.t;
      seatObjs.push(box);
    }
  }

  // Anneau-chrono autour de l'avatar actif (redessiné à chaque image).
  function drawRing() {
    ring.clear();
    if (!G || !L || !timer || !timer.total) return;
    if (G.phase !== "ENCHERES" && G.phase !== "JEU") return;
    const frac = Math.max(
      0,
      Math.min(1, (timer.start + timer.total - performance.now()) / timer.total),
    );
    const { x, y } = L.seat[posOf(G.joueurActif)];
    ring.lineStyle(4, frac < 0.2 ? COLORS.danger : COLORS.gold, 1);
    ring.beginPath();
    ring.arc(x, y, L.r + 5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ring.strokePath();
  }

  // ---- Main du joueur : éventail --------------------------------------------

  function myTurnToPlay() {
    return G.phase === "JEU" && G.joueurActif === me;
  }

  function fanSlot(i, n) {
    const step = n > 1 ? Math.min(FAN_STEP, L.maxSpread / (n - 1)) : 0;
    const a = (i - (n - 1) / 2) * step;
    return {
      x: L.cx + Math.sin(a) * L.R,
      y: L.handY + (1 - Math.cos(a)) * L.R,
      a,
    };
  }

  const isPlayable = (id) =>
    G &&
    myTurnToPlay() &&
    performance.now() >= blockedUntil &&
    computeLegal(G.hands[me], G.pliCourant, G.contract.atout, me).some(
      (x) => x.id === id,
    );

  // Carte de la main : clic pour la jouer, ou glisser-déposer vers le tapis
  // (lâchée au-dessus de la main : jouée ; sinon elle reprend sa place).
  function handCard(id) {
    const box = cardBox(id, L.cardW, L.cardH);
    const halo = scene.add.graphics();
    box.addAt(halo, 1);
    // Zone de survol fixe, à la place de la carte au repos (étendue vers le
    // haut pour couvrir la carte soulevée) : la carte bouge, pas sa zone.
    // Sinon, soulevée, elle glisserait sous le curseur au profit de sa
    // voisine, qui se soulèverait à son tour, et ainsi de suite.
    const zone = scene.add.zone(0, 0, 1, 1);
    const o = { box, halo, zone, img: box.img, shadow: box.shadow, index: -1 };
    zone.setInteractive({ useHandCursor: true, draggable: true });
    zone.on("pointerover", () => {
      hoverId = id;
      placeHand(false);
    });
    zone.on("pointerout", () => {
      if (hoverId === id) hoverId = null;
      if (!o.drag) placeHand(false);
    });
    zone.on("pointerup", (pointer) => {
      if (pointer.getDistance() > DRAG_MIN) return; // fin de glisser : voir dragend
      if (isPlayable(id)) onPlay(id);
    });
    zone.on("dragstart", (pointer) => {
      if (!isPlayable(id)) return;
      scene.tweens.killTweensOf(box);
      o.drag = { dx: box.x - pointer.worldX, dy: box.y - pointer.worldY };
      box.setDepth(90);
      scene.tweens.add({
        targets: box,
        rotation: 0,
        scale: 1.06,
        duration: dur(120),
      });
    });
    zone.on("drag", (pointer) => {
      if (!o.drag) return;
      box.setPosition(pointer.worldX + o.drag.dx, pointer.worldY + o.drag.dy);
    });
    zone.on("dragend", () => {
      if (!o.drag) return;
      o.drag = null;
      if (box.y < L.handY - L.cardH * 0.75 && isPlayable(id)) {
        onPlay(id);
        // Coup refusé (réseau, délai) : la carte reprend sa place.
        scene.time.delayedCall(800, () => hand.has(id) && placeHand(false));
      } else placeHand(false);
    });
    return o;
  }

  function placeHand(animateDeal) {
    const cards = sortHand((G.hands[me] || []).filter(Boolean), G.contract?.atout);
    const ids = new Set(cards.map((c) => c.id));
    for (const [id, o] of hand)
      if (!ids.has(id)) {
        o.box.destroy();
        o.zone.destroy();
        hand.delete(id);
      }
    const legal = myTurnToPlay()
      ? new Set(
          computeLegal(cards, G.pliCourant, G.contract.atout, me).map((c) => c.id),
        )
      : null;
    const n = cards.length;
    const dealer = L.seat[posOf(G.donneur)];
    cards.forEach((c, i) => {
      let o = hand.get(c.id);
      const fresh = !o;
      if (fresh) {
        o = handCard(c.id);
        hand.set(c.id, o);
      }
      if (o.drag) return;
      const moved = !fresh && o.index !== i; // main retriée (atout connu)
      o.index = i;
      const isLegal = legal ? legal.has(c.id) : false;
      const lifted = isLegal && (hoverId === c.id || focusId === c.id);
      sizeCard(o.box, L.cardW, L.cardH);
      o.img.setTint(legal && !isLegal ? 0x8a8499 : 0xffffff);
      o.shadow.setAlpha(lifted ? 0.75 : 0.55);
      o.halo.clear();
      // Liseré doré des cartes jouables ; la carte survolée rayonne en plus
      // (contours de plus en plus larges et transparents). Dessiné à la main :
      // le filtre Glow de Phaser, sur un objet dans un conteneur, se plaçait
      // ailleurs sur la table.
      const ring = (pad, width, alpha) =>
        o.halo
          .lineStyle(width, COLORS.gold, alpha)
          .strokeRoundedRect(
            -L.cardW / 2 - pad,
            -L.cardH / 2 - pad,
            L.cardW + 2 * pad,
            L.cardH + 2 * pad,
            L.cardW * 0.07 + pad,
          );
      if (isLegal && lifted && !reduced)
        [[12, 6, 0.08], [9, 5, 0.14], [6, 4, 0.24]].forEach((r) => ring(...r));
      if (isLegal) ring(2, lifted ? 4 : 3, lifted ? 1 : 0.8);
      const s = fanSlot(i, n);
      const lift = (isLegal ? L.cardH * 0.14 : 0) + (lifted ? L.cardH * 0.1 : 0);
      const x = s.x + Math.sin(s.a) * lift;
      const y =
        s.y - Math.cos(s.a) * lift + (legal && !isLegal ? L.cardH * 0.05 : 0);
      o.box.setDepth(30 + i + (lifted ? 20 : 0));
      // Zone de survol : place au repos + hauteur du soulèvement maximal ;
      // son ordre ne change jamais (la plus à droite est dessus).
      const up = L.cardH * 0.12;
      o.zone
        .setSize(L.cardW, L.cardH + 2 * up)
        .setPosition(s.x + Math.sin(s.a) * up, s.y - Math.cos(s.a) * up)
        .setRotation(s.a)
        .setDepth(30 + i);
      if (o.dealing) return; // la distribution la posera
      if (fresh && animateDeal && !reduced) {
        // Distribuée face cachée depuis le donneur, puis retournée.
        o.dealing = true;
        o.img.setTexture("c:back", "f");
        sizeCard(o.box, L.cardW, L.cardH);
        o.box.setPosition(dealer.x, dealer.y).setScale(0.3).setAlpha(0).setRotation(0);
        scene.tweens.chain({
          targets: o.box,
          tweens: [
            {
              x,
              y,
              rotation: s.a,
              scale: 1,
              alpha: 1,
              delay: i * 70,
              duration: 380,
              ease: "Cubic.easeOut",
            },
            { scaleX: 0, duration: 110, ease: "Sine.easeIn" },
            {
              scaleX: 1,
              duration: 130,
              ease: "Sine.easeOut",
              onStart: () => {
                o.img.setTexture(`c:${c.id}`, "f");
                sizeCard(o.box, L.cardW, L.cardH);
              },
            },
          ],
          onComplete: () => {
            o.dealing = false;
            if (G) placeHand(false);
          },
        });
      } else if (fresh) {
        o.box.setPosition(x, y).setRotation(s.a);
      } else {
        scene.tweens.killTweensOf(o.box);
        scene.tweens.add({
          targets: o.box,
          x,
          y,
          rotation: s.a,
          scale: lifted ? 1.04 : 1,
          alpha: 1,
          duration: dur(moved ? 520 : 200),
          ease: moved ? "Cubic.easeInOut" : "Cubic.easeOut",
        });
      }
    });
  }


  // ---- Pli ------------------------------------------------------------------------

  // Carte jouée : glisse depuis votre main (ou le siège) en pivotant un peu,
  // et se pose de biais à sa place.
  function flyIn(entry) {
    const { siege, carte } = entry;
    const pos = posOf(siege);
    const from = hand.get(carte.id)?.box;
    const start = from ?? L.seat[pos];
    const to = L.slot[pos];
    const end = tilt(carte.id);
    const turn = reduced ? 0 : (carte.id.charCodeAt(0) % 2 ? 1 : -1) * 0.5;
    const box = cardBox(carte.id, L.trickW, L.trickH)
      .setPosition(start.x, start.y)
      .setDepth(10 + trick.size)
      .setRotation(from ? from.rotation : end - turn)
      .setScale(from ? L.cardW / L.trickW : 0.45);
    scene.tweens.add({
      targets: box,
      x: to.x,
      y: to.y,
      rotation: end,
      scale: 1,
      duration: dur(420),
      ease: "Quart.easeOut",
    });
    trick.set(carte.id, box);
  }

  // Pli complet : gagnant en évidence, puis ramassé vers son avatar.
  function collect(lastTrick) {
    const ids = lastTrick.cards.map((e) => e.carte.id);
    const boxes = ids.map((id) => trick.get(id)).filter(Boolean);
    ids.forEach((id) => trick.delete(id));
    const halo = scene.add.graphics().setDepth(14);
    sweeping.push(...boxes, halo);
    blockedUntil = performance.now() + dur(TRICK_PAUSE_MS + COLLECT_MS);
    const winner = lastTrick.cards.find((e) => e.siege === lastTrick.winnerSeat);
    const top = boxes.find((b) => b.id === winner?.carte.id);
    scene.time.delayedCall(dur(450), () => {
      if (!top?.active) return;
      top.setDepth(15);
      halo
        .setPosition(top.x, top.y)
        .setRotation(top.rotation)
        .lineStyle(3, COLORS.gold, 1)
        .strokeRoundedRect(
          -L.trickW / 2 - 3,
          -L.trickH / 2 - 3,
          L.trickW + 6,
          L.trickH + 6,
          L.trickW * 0.07 + 3,
        );
      scene.tweens.add({
        targets: [top, halo],
        scale: 1.08,
        duration: dur(160),
        yoyo: true,
        ease: "Sine.easeInOut",
      });
      if (teamOf(lastTrick.winnerSeat) === teamOf(me)) burst(top.x, top.y, 16);
    });
    scene.time.delayedCall(dur(TRICK_PAUSE_MS), () => {
      halo.destroy();
      const to = L.seat[posOf(lastTrick.winnerSeat)];
      scene.tweens.add({
        targets: boxes,
        x: to.x,
        y: to.y,
        scale: 0.3,
        alpha: 0,
        duration: dur(COLLECT_MS),
        ease: "Cubic.easeIn",
        onComplete: () => {
          boxes.forEach((b) => b.destroy());
          sweeping = sweeping.filter((o) => !boxes.includes(o) && o !== halo);
        },
      });
    });
  }

  function clearTrick() {
    trick.forEach((b) => b.destroy());
    trick.clear();
    sweeping.forEach((o) => o.destroy());
    sweeping = [];
  }

  // ---- Mise à jour ----------------------------------------------------------------

  // Chaque fenêtre (tour, surcoinche) démarre à sa réception ; après un pli
  // complet, elle attend que la table l'ait ramassé (comme l'hôte).
  function startTimer(prev) {
    if (prev && G.tour === prev.tour && timer) return;
    const pause =
      G.lastTrick && !G.pliCourant.length && G.phase !== "SURCOINCHE"
        ? TRICK_SHOW_MS
        : 0;
    timer = {
      start: performance.now() + pause,
      total: DURATION_MS[G.phase] || 0,
    };
  }

  function apply(next) {
    const prev = G;
    G = next;
    startTimer(prev);
    const newDonne = !prev || prev.donneNumero !== G.donneNumero;
    if (newDonne) {
      clearTrick();
      hand.forEach((o) => {
        o.box.destroy();
        o.zone.destroy();
      });
      hand.clear();
      // Reprise en cours de pli (rechargement, reconnexion).
      if (!prev) G.pliCourant.forEach(flyIn);
    } else {
      const trickDone = G.plisJoues > prev.plisJoues;
      const shown = [...(trickDone ? G.lastTrick.cards : []), ...G.pliCourant];
      for (const e of shown) if (!trick.has(e.carte.id)) flyIn(e);
      if (trickDone) collect(G.lastTrick);
    }
    placeHand(newDonne);
    drawSeats(false);
    if (!prev || reduced) return;
    // Coinche, surcoinche : la table tremble.
    const c = G.contract;
    if (
      (c?.coinche && !prev.contract?.coinche) ||
      (c?.surcoinche && !prev.contract?.surcoinche)
    )
      scene.cameras.main.shake(320, 0.006);
    // Donne gagnée par notre camp : pluie d'étincelles.
    const r = G.dernierResultat;
    if (G.phase === "SCORE" && prev.phase !== "SCORE" && r) {
      const winners = r.reussi ? r.preneurs : 1 - r.preneurs;
      if (winners === teamOf(me)) burst(L.cx, L.cy, 60, 1.6);
    }
  }

  // Gerbe d'étincelles dorées et vertes (système de particules de Phaser).
  function burst(x, y, count, power = 1) {
    if (reduced) return;
    const e = scene.add
      .particles(x, y, "spark", {
        speed: { min: 90 * power, max: 280 * power },
        angle: { min: 0, max: 360 },
        lifespan: { min: 500, max: 900 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 1, end: 0 },
        gravityY: 260,
        tint: [COLORS.gold, COLORS.gold, 0x8be04e, 0xffffff],
        blendMode: "ADD",
        emitting: false,
      })
      .setDepth(80);
    e.explode(count);
    scene.time.delayedCall(1000, () => e.destroy());
  }

  function relayout() {
    if (!scene) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (!w || !h) return;
    scene.scale.resize(w * dpr, h * dpr);
    scene.cameras.main.setSize(w * dpr, h * dpr);
    L = layout();
    // Hauteur occupée par l'éventail : la barre d'enchères se pose au-dessus.
    parent.parentElement?.style.setProperty(
      "--cg-hand",
      `${Math.round(L.cardH * 1.25 + 12)}px`,
    );
    drawTable();
    if (!G) return;
    drawSeats(true);
    placeHand(false);
    for (const [id, box] of trick) {
      const e = G.pliCourant.find((x) => x.carte.id === id);
      if (!e) continue;
      const to = L.slot[posOf(e.siege)];
      sizeCard(box.setPosition(to.x, to.y), L.trickW, L.trickH);
    }
  }

  class TableScene extends Phaser.Scene {
    preload() {
      for (const id of CARD_IDS)
        this.load.image(id, `../../assets/images/coinche/cards/${id}.png`);
      this.load.svg("back", "../../assets/images/coinche/cards/back.svg", {
        width: CARD_PX.w,
        height: CARD_PX.h,
      });
    }
    create() {
      scene = this;
      bakeTextures(this);
      this.cameras.main.setOrigin(0, 0).setZoom(dpr);
      this.input.dragDistanceThreshold = DRAG_MIN;
      ring = this.add.graphics().setDepth(7);
      relayout();
      if (queued) apply(queued);
      queued = null;
    }
    update() {
      drawRing();
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    transparent: true,
    banner: false,
    audio: { noAudio: true },
    width: (parent.clientWidth || 800) * dpr,
    height: (parent.clientHeight || 500) * dpr,
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
    render: {
      mipmapFilter: "LINEAR_MIPMAP_LINEAR",
      powerPreference: "high-performance",
    },
    scene: TableScene,
  });
  const resizer = new ResizeObserver(() => relayout());
  resizer.observe(parent);

  return {
    update(next) {
      // Pas encore chargée : on garde le dernier état, affiché sans animer.
      if (scene) apply(next);
      else queued = next;
    },
    focusCard(id) {
      focusId = id;
      if (scene && G) placeHand(false);
    },
    destroy() {
      resizer.disconnect();
      game.destroy(true);
      felt.remove();
      scene = null;
    },
  };
}
