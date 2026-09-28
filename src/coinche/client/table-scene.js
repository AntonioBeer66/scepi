// La table de coinche dessinée avec Phaser, dans l'univers arcade SCEPI :
// tapis violet nuit, avatars avec anneau-chrono doré, bulles d'enchère,
// main en éventail, cartes lancées au centre, pli ramassé vers son
// gagnant. Elle ne décide de rien : à chaque état reçu, elle compare avec le
// précédent pour savoir quoi animer. Mouvement réduit : tout est instantané.
// Rendu net sur écran haute densité : le canevas a la taille réelle en
// pixels de l'écran (CSS × devicePixelRatio), la caméra zoome d'autant et
// les textes sont rastérisés à cette résolution ; toute la mise en page
// reste en pixels CSS.
// Éventail : chaque carte pivote autour d'un point sous la main (angle
// fixe entre deux cartes, ouverture bornée par la largeur disponible).
import * as Phaser from "phaser";
import { RANKS, SUITS, SUIT_SYMBOL, computeLegal, DURATION_MS } from "../engine.js";
import { TRICK_SHOW_MS } from "../host.js";

const CARD_RATIO = 491 / 320; // hauteur / largeur des images de cartes
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
  felt: 0x1f1638,
  feltInner: 0x251a44,
  rim: 0x2b2145,
  line: 0x7f77dd,
  avatar: 0x3c3489,
  avatarMe: 0x26215c,
  bubble: 0xf7f4fc,
};
const FONT = 'system-ui, "Segoe UI", sans-serif';

const sortHand = (hand) =>
  hand
    .slice()
    .sort(
      (a, b) =>
        SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) ||
        RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank),
    );

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

export function createTable(parent, { me, onPlay }) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dur = (ms) => (reduced ? 0 : ms);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const posOf = (seat) => (seat - me + 4) % 4;

  let scene = null;
  let G = null;
  let queued = null; // dernier état reçu avant la fin du chargement
  let focusId = null;
  let hoverId = null;
  let blockedUntil = 0;
  let timer = null; // { start, total } : fenêtre de temps en cours
  let L = null; // mise en page courante

  const hand = new Map(); // id → { box, halo, img }
  const trick = new Map(); // id → image posée au centre
  let sweeping = [];
  let staticObjs = []; // tapis, logo
  let seatObjs = [];
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
        // Vous : coin bas gauche, au-dessus de l'éventail.
        { x: left + r + 18, y: Math.min(bottom - r - 14, handTop - r - 8) },
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

  // ---- Tapis ------------------------------------------------------------------

  function drawTable() {
    staticObjs.forEach((o) => o.destroy());
    const g = scene.add.graphics().setDepth(0);
    const w = L.right - L.left;
    const h = L.bottom - L.top;
    const rad = Math.min(h / 2, w / 2, 160);
    g.fillStyle(COLORS.rim, 1).fillRoundedRect(L.left, L.top, w, h, rad);
    g.fillStyle(COLORS.felt, 1).fillRoundedRect(
      L.left + 7,
      L.top + 7,
      w - 14,
      h - 14,
      Math.max(0, rad - 7),
    );
    g.fillStyle(COLORS.feltInner, 1).fillRoundedRect(
      L.left + w * 0.2,
      L.top + h * 0.2,
      w * 0.6,
      h * 0.6,
      Math.min(h * 0.3, rad),
    );
    g.lineStyle(1, COLORS.line, 0.28).strokeRoundedRect(
      L.left + 14,
      L.top + 14,
      w - 28,
      h - 28,
      Math.max(0, rad - 14),
    );
    const size = Math.min(h * 0.42, 190);
    const logo = scene.add
      .image(L.cx, L.cy, "logo")
      .setDisplaySize(size, size)
      .setAlpha(0.09)
      .setDepth(1);
    staticObjs = [g, logo];
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

  function drawSeats() {
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
        const dir = [null, [-1, 0], [0, 1], [1, 0]][pos];
        const off = L.r + bw * 1.1;
        const fan = scene.add
          .container(dir[0] * off, dir[1] * off)
          .setRotation([0, Math.PI / 2, 0, -Math.PI / 2][pos]);
        const bh = bw * CARD_RATIO;
        for (let i = 0; i < n; i++) {
          const a = (i - (n - 1) / 2) * 0.13;
          const bx = Math.sin(a) * bw * 2.2;
          const by = (1 - Math.cos(a)) * bw * 2.2;
          fan.add(
            scene.add
              .image(bx, by, "back")
              .setDisplaySize(bw, bh)
              .setRotation(a),
          );
          // Liseré clair : le dos violet se détache du tapis.
          fan.add(
            scene.add
              .graphics()
              .setPosition(bx, by)
              .setRotation(a)
              .lineStyle(1, 0xffffff, 0.45)
              .strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 3),
          );
        }
        box.add(fan);
      }

      const disc = scene.add.graphics();
      disc
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
        const bw = label.width + 16;
        const bh = label.height + 8;
        // À côté de l'avatar, du côté du centre de la table.
        const side = pos === 1 ? -1 : 1;
        const bx = side * (L.r + 8 + bw / 2);
        const by = pos === 2 ? 0 : -L.r * 0.2;
        const bg = scene.add.graphics();
        bg.fillStyle(b.lead ? COLORS.gold : COLORS.bubble, 1).fillRoundedRect(
          bx - bw / 2,
          by - bh / 2,
          bw,
          bh,
          bh / 2,
        );
        label.setPosition(bx, by);
        box.add([bg, label]);
      }
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

  function placeHand(animateDeal) {
    const cards = sortHand((G.hands[me] || []).filter(Boolean));
    const ids = new Set(cards.map((c) => c.id));
    for (const [id, o] of hand)
      if (!ids.has(id)) {
        o.box.destroy();
        hand.delete(id);
      }
    const legal = myTurnToPlay()
      ? new Set(
          computeLegal(cards, G.pliCourant, G.contract.atout, me).map((c) => c.id),
        )
      : null;
    const n = cards.length;
    cards.forEach((c, i) => {
      let o = hand.get(c.id);
      const fresh = !o;
      if (fresh) {
        const halo = scene.add.graphics();
        const img = scene.add.image(0, 0, c.id);
        const box = scene.add.container(0, 0, [halo, img]);
        img.setInteractive({ useHandCursor: true });
        img.on("pointerover", () => {
          hoverId = c.id;
          placeHand(false);
        });
        img.on("pointerout", () => {
          if (hoverId === c.id) hoverId = null;
          placeHand(false);
        });
        img.on("pointerup", () => {
          if (!G || !myTurnToPlay() || performance.now() < blockedUntil) return;
          const ok = computeLegal(
            G.hands[me],
            G.pliCourant,
            G.contract.atout,
            me,
          ).some((x) => x.id === c.id);
          if (ok) onPlay(c.id);
        });
        o = { box, halo, img };
        hand.set(c.id, o);
      }
      const isLegal = legal ? legal.has(c.id) : false;
      const lifted = isLegal && (hoverId === c.id || focusId === c.id);
      o.img.setDisplaySize(L.cardW, L.cardH);
      o.img.setTint(legal && !isLegal ? 0x8a8499 : 0xffffff);
      o.halo.clear();
      if (isLegal)
        o.halo
          .lineStyle(lifted ? 4 : 3, COLORS.gold, lifted ? 1 : 0.85)
          .strokeRoundedRect(
            -L.cardW / 2 - 3,
            -L.cardH / 2 - 3,
            L.cardW + 6,
            L.cardH + 6,
            10,
          );
      const s = fanSlot(i, n);
      const lift = (isLegal ? L.cardH * 0.14 : 0) + (lifted ? L.cardH * 0.1 : 0);
      const x = s.x + Math.sin(s.a) * lift;
      const y =
        s.y - Math.cos(s.a) * lift + (legal && !isLegal ? L.cardH * 0.05 : 0);
      o.box.setDepth(30 + i + (lifted ? 20 : 0));
      if (fresh && animateDeal) {
        o.box.setPosition(L.cx, L.cy).setScale(0.35).setAlpha(0).setRotation(0);
        scene.tweens.add({
          targets: o.box,
          x,
          y,
          rotation: s.a,
          scale: 1,
          alpha: 1,
          delay: dur(i * 45),
          duration: dur(280),
          ease: "Cubic.easeOut",
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
          scale: 1,
          alpha: 1,
          duration: dur(150),
          ease: "Quad.easeOut",
        });
      }
    });
  }

  // ---- Pli ------------------------------------------------------------------------

  // Carte jouée : lancée depuis votre main (ou le siège) avec un tour sur
  // elle-même, posée de biais à sa place.
  function flyIn(entry) {
    const { siege, carte } = entry;
    const pos = posOf(siege);
    const from = hand.get(carte.id)?.box ?? L.seat[pos];
    const to = L.slot[pos];
    const end = tilt(carte.id);
    const spin = reduced ? 0 : (carte.id.charCodeAt(0) % 2 ? 1 : -1) * Math.PI * 2;
    const img = scene.add
      .image(from.x, from.y, carte.id)
      .setDepth(10 + trick.size)
      .setRotation(end - spin);
    const sx = L.trickW / img.width;
    const sy = L.trickH / img.height;
    img.setScale(siege === me ? (L.cardW / img.width) : sx * 0.5, siege === me ? (L.cardH / img.height) : sy * 0.5);
    scene.tweens.add({
      targets: img,
      x: to.x,
      y: to.y,
      rotation: end,
      scaleX: sx,
      scaleY: sy,
      duration: dur(380),
      ease: "Cubic.easeOut",
    });
    trick.set(carte.id, img);
  }

  // Pli complet : gagnant en évidence, puis ramassé vers son avatar.
  function collect(lastTrick) {
    const ids = lastTrick.cards.map((e) => e.carte.id);
    const imgs = ids.map((id) => trick.get(id)).filter(Boolean);
    ids.forEach((id) => trick.delete(id));
    const halo = scene.add.graphics().setDepth(9);
    sweeping.push(...imgs, halo);
    blockedUntil = performance.now() + dur(TRICK_PAUSE_MS + COLLECT_MS);
    const winner = lastTrick.cards.find((e) => e.siege === lastTrick.winnerSeat);
    const winnerImg = imgs.find((i) => i.texture.key === winner?.carte.id);
    scene.time.delayedCall(dur(400), () => {
      if (!winnerImg?.active) return;
      halo
        .setPosition(winnerImg.x, winnerImg.y)
        .setRotation(winnerImg.rotation)
        .lineStyle(3, COLORS.gold, 1)
        .strokeRoundedRect(
          -L.trickW / 2 - 4,
          -L.trickH / 2 - 4,
          L.trickW + 8,
          L.trickH + 8,
          8,
        );
    });
    scene.time.delayedCall(dur(TRICK_PAUSE_MS), () => {
      halo.destroy();
      const to = L.seat[posOf(lastTrick.winnerSeat)];
      scene.tweens.add({
        targets: imgs,
        x: to.x,
        y: to.y,
        scaleX: 0.02,
        scaleY: 0.02,
        alpha: 0,
        duration: dur(COLLECT_MS),
        ease: "Quad.easeIn",
        onComplete: () => {
          imgs.forEach((i) => i.destroy());
          sweeping = sweeping.filter((o) => !imgs.includes(o) && o !== halo);
        },
      });
    });
  }

  function clearTrick() {
    trick.forEach((i) => i.destroy());
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
      hand.forEach((o) => o.box.destroy());
      hand.clear();
    } else {
      const trickDone = G.plisJoues > prev.plisJoues;
      const shown = [...(trickDone ? G.lastTrick.cards : []), ...G.pliCourant];
      for (const e of shown) if (!trick.has(e.carte.id)) flyIn(e);
      if (trickDone) collect(G.lastTrick);
    }
    placeHand(newDonne);
    drawSeats();
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
    drawSeats();
    placeHand(false);
    for (const [id, img] of trick) {
      const e = G.pliCourant.find((x) => x.carte.id === id);
      if (!e) continue;
      const to = L.slot[posOf(e.siege)];
      img.setPosition(to.x, to.y).setDisplaySize(L.trickW, L.trickH);
    }
  }

  class TableScene extends Phaser.Scene {
    preload() {
      for (const id of CARD_IDS)
        this.load.image(id, `../assets/images/cards/${id}.png`);
      this.load.svg("back", "../assets/images/cards/back.svg", {
        width: 274,
        height: 420,
      });
      this.load.image("logo", "../assets/images/logo-green.png");
    }
    create() {
      scene = this;
      this.cameras.main.setOrigin(0, 0).setZoom(dpr);
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
      scene = null;
    },
  };
}
