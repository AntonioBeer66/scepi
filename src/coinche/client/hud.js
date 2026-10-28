// Commandes et informations HTML posées sur la table Phaser : barre de jeu
// (contrat, donne, scores, historique, dernier pli, règles, quitter), barre
// d'enchères en pastilles au-dessus de la main, résultat de la donne.
// Du HTML plutôt que du canevas : vrais boutons (clavier, lecteur d'écran,
// cibles tactiles) et texte net. Les cartes jouables ont aussi chacune un
// bouton, masqué à l'écran mais atteignable au clavier ; la carte qui a le
// focus s'éclaire sur la table.
import {
  ALLOWED_BIDS,
  BELOTE_BONUS,
  DURATION_MS,
  GENERALE,
  GENERALE_BELOTE,
  SUITS,
  SUIT_NAME,
  SUIT_SYMBOL,
  cardLabel,
  computeLegal,
  teamOf,
} from "../engine.js";
import { CHAT_GAP_MS, EMOTES, MAX_CHAT } from "../../online/tables.js";
import { t } from "./i18n.js";

const CHAT_OFF_KEY = "scepi-coinche-chat-off"; // "1" : messages des autres masqués
const COINCHE_ARM_MS = 600; // « Coincher » inactif juste après son apparition
const RANK_SHORT = { J: "V", Q: "D", K: "R" }; // Valet, Dame, Roi (les autres : tels quels)
const COMPASS = [t("Sud", "South"), t("Est", "East"), t("Nord", "North"), t("Ouest", "West")]; // position vue du joueur
const FLASH = {
  coinche: { src: "/assets/images/coinche/coinched.mp4", ms: 1100 },
  surcoinche: { src: "/assets/images/coinche/surcoinched.mp4", ms: 1700 },
};
const ICONS = {
  history:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v4l3 2M3.05 11a9 9 0 1 1 .5 4M3 4v5h5"/></svg>',
  trick:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="10" height="14" rx="2"/><path d="M17 7l3 1-3 11-3-1"/></svg>',
  rules:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/></svg>',
  quit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;

function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function bidReadout(value) {
  if (value === 250) return "Capot";
  if (value === 270) return t("Capot beloté", "Capot + belote");
  if (value === GENERALE) return "Générale";
  if (value === GENERALE_BELOTE) return t("Générale belotée", "Générale + belote");
  return String(value);
}

function suitSpan(s) {
  return `<span class="cg-suit s-${s}">${SUIT_SYMBOL[s]}</span>`;
}

export function createHud(view, { me, onAction, onRelaunch, onQuit, onFocusCard, onEmote, onChat }) {
  const root = view.querySelector("#game-hud");
  // Barre de jeu, panneau, résultat, enchères, boutons des cartes (voir paint).
  const painted = [];
  const slots = [0, 1, 2, 3, 4].map(() => {
    const el = document.createElement("div");
    el.className = "cg-slot";
    return root.appendChild(el);
  });
  const announcer = view.querySelector("#game-announce");
  const ui = {
    suit: null,
    amount: null,
    bidMin: undefined,
    hint: "",
    panel: null, // "history" | "trick" | null
    tab: null, // onglet de l'historique : "bids" | "donnes" (null : enchères)
  };
  let G = null;
  const flashBlobs = {};

  // Spectateur (me = -1) : vue depuis le siège 0, équipes nommées.
  const spectator = me < 0;
  const anchor = spectator ? 0 : me;
  const ours = spectator ? 0 : teamOf(me);
  const [US, THEM] = spectator ? [t("Nord-Sud", "North-South"), t("Est-Ouest", "East-West")] : [t("Nous", "Us"), t("Eux", "Them")];
  const compass = (s) => COMPASS[(s - anchor + 4) % 4];
  const seatName = (s) =>
    s === me
      ? t("Toi", "You")
      : G.seats[s].type === "bot" && G.seats[s].name === "Ordinateur"
        ? `Bot ${compass(s)}`
        : G.seats[s].name; // joueur, ou bot qui l'a remplacé : « Bob (bot) »
  const who = (s) =>
    s === me || G.seats[s].type === "bot"
      ? seatName(s)
      : `${G.seats[s].name} (${compass(s)})`;


  // ---- Annonces pour lecteur d'écran --------------------------------------

  function announce(prev) {
    const out = [];
    if (prev && prev.donneNumero !== G.donneNumero)
      out.push(t(`Nouvelle donne. ${who(G.donneur)} donne.`, `New deal. ${who(G.donneur)} deals.`));
    const same = prev && prev.donneNumero === G.donneNumero;
    if (same && G.bidLog.length > prev.bidLog.length) {
      for (const e of G.bidLog.slice(prev.bidLog.length))
        out.push(
          e.montant
            ? t(`${who(e.seat)} : ${bidReadout(e.montant)} ${SUIT_NAME[e.atout]}`, `${who(e.seat)}: ${bidReadout(e.montant)} ${SUIT_NAME[e.atout]}`)
            : t(`${who(e.seat)} : passe`, `${who(e.seat)}: pass`),
        );
    }
    if (G.contract?.coinche && !prev?.contract?.coinche)
      out.push(
        !spectator && teamOf(me) === G.contract.equipePreneur
          ? t(`Coinché ! Tu as ${DURATION_MS.SURCOINCHE / 1000} secondes pour surcoincher.`, `Coinched! You have ${DURATION_MS.SURCOINCHE / 1000} seconds to surcoinche.`)
          : t("Coinché !", "Coinched!"),
      );
    if (G.contract?.surcoinche && !prev?.contract?.surcoinche)
      out.push(t("Surcoinché !", "Surcoinched!"));
    if (same)
      for (const s of [0, 1, 2, 3])
        for (const c of G.playedBy[s].slice(prev.playedBy[s].length))
          out.push(t(`${who(s)} : ${cardLabel(c)}`, `${who(s)}: ${cardLabel(c)}`));
    if (G.belote.beloteDeclared && !(same && prev.belote.beloteDeclared))
      out.push(t("Belote !", "Belote!"));
    if (G.belote.rebeloteDeclared && !(same && prev.belote.rebeloteDeclared))
      out.push(t("Rebelote !", "Rebelote!"));
    if (same && G.plisJoues > prev.plisJoues)
      out.push(
        G.lastTrick.winnerSeat === me
          ? t(`Tu remportes le pli (${G.lastTrick.points} points).`, `You win the trick (${G.lastTrick.points} points).`)
          : t(`${who(G.lastTrick.winnerSeat)} remporte le pli (${G.lastTrick.points} points).`, `${who(G.lastTrick.winnerSeat)} wins the trick (${G.lastTrick.points} points).`),
      );
    if (G.phase === "SCORE" && prev?.phase !== "SCORE" && G.dernierResultat) {
      const r = G.dernierResultat;
      out.push(
        t(
          `${r.reussi ? "Contrat réussi" : "Contrat chuté"} : ${r.gain} points. ${US} ${G.scores[ours]}, ${THEM} ${G.scores[1 - ours]}.`,
          `${r.reussi ? "Contract made" : "Contract failed"}: ${r.gain} points. ${US} ${G.scores[ours]}, ${THEM} ${G.scores[1 - ours]}.`,
        ),
      );
    }
    if (G.phase === "TERMINEE" && prev?.phase !== "TERMINEE")
      out.push(
        t(
          `Partie terminée. ${US} ${G.scores[ours]}, ${THEM} ${G.scores[1 - ours]}.`,
          `Game over. ${US} ${G.scores[ours]}, ${THEM} ${G.scores[1 - ours]}.`,
        ),
      );
    if (
      (G.phase === "ENCHERES" || G.phase === "JEU") &&
      G.joueurActif === me &&
      G.tour !== prev?.tour
    )
      out.push(t("À toi de jouer.", "Your turn."));
    if (out.length) announcer.textContent = out.join(" ");
  }

  // ---- Animation plein écran de la coinche ----------------------------------

  function preloadFlash() {
    for (const [kind, { src }] of Object.entries(FLASH))
      flashBlobs[kind] ??= fetch(src)
        .then((r) => r.blob())
        .catch(() => null);
  }
  function flash(kind) {
    if (reducedMotion()) return;
    preloadFlash();
    flashBlobs[kind].then((blob) => {
      if (!blob || !G) return;
      document.querySelector(".coinche-flash")?.remove();
      const url = URL.createObjectURL(blob);
      const overlay = document.createElement("div");
      overlay.className = "coinche-flash";
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = `<video src="${url}" autoplay muted playsinline></video>`;
      document.body.append(overlay);
      setTimeout(() => overlay.classList.add("is-out"), FLASH[kind].ms);
      setTimeout(() => {
        overlay.remove();
        URL.revokeObjectURL(url);
      }, FLASH[kind].ms + 300);
    });
  }

  // Bandeau bref en haut de la table (belote, rebelote) ; le lecteur d'écran
  // a déjà l'annonce (announce).
  function toast(text) {
    const el = document.createElement("div");
    el.className = "cg-toast";
    el.setAttribute("aria-hidden", "true");
    el.textContent = text;
    root.append(el);
    setTimeout(() => el.remove(), 2400);
  }

  // ---- Barre de jeu ------------------------------------------------------------

  function renderContract() {
    const c = G.contract;
    if (!c)
      return `<span class="cg-contract is-empty">${t("Enchères", "Bidding")}</span>`;
    const label = bidReadout(c.montant);
    const mult = G.multiplicateur > 1 ? ` ×${G.multiplicateur}` : "";
    const state = c.surcoinche ? t(" · surcoinché", " · surcoinched") : c.coinche ? t(" · coinché", " · coinched") : "";
    return `<span class="cg-contract">${suitSpan(c.atout)} ${label}${mult}</span>
      <span class="cg-sub">${c.preneur === me ? t("Tu prends", "You take") : t(`${esc(seatName(c.preneur))} prend`, `${esc(seatName(c.preneur))} takes`)}${state}</span>`;
  }

  function renderTopbar() {
    const us = ours;
    const phase = {
      ENCHERES: t("Enchères", "Bidding"),
      SURCOINCHE: t("Surcoinche possible", "Surcoinche open"),
      JEU: t(`Pli ${Math.min(G.plisJoues + 1, 8)}/8`, `Trick ${Math.min(G.plisJoues + 1, 8)}/8`),
      SCORE: t("Résultat", "Result"),
      TERMINEE: t("Partie terminée", "Game over"),
    }[G.phase];
    const live = G.phase === "JEU" && G.contract;
    const belote =
      live && G.belote.rebeloteDeclared ? G.contract.equipePreneur : -1;
    // Décompte de la donne en cours : la belote des preneurs y compte (+20),
    // pas au score de la partie.
    const score = (tm, label) =>
      `<span class="cg-score${tm === us ? " is-us" : ""}"><small>${label}</small><b>${G.scores[tm]}</b>${live ? `<em${tm === belote ? ` title="${t(`Dont ${BELOTE_BONUS} de belote`, `Includes ${BELOTE_BONUS} for belote`)}"` : ""}>+${G.pointsPlis[tm] + (tm === belote ? BELOTE_BONUS : 0)}${tm === belote ? " <i>♛</i>" : ""}</em>` : ""}</span>`;
    const iconBtn = (action, icon, label, pressed) =>
      `<button type="button" class="cg-icon" data-action="${action}" data-focus-key="${action}" aria-label="${label}"${pressed === undefined ? "" : ` aria-expanded="${pressed}"`}>${ICONS[icon]}<span>${label}</span></button>`;
    return `<div class="cg-topbar">
      <div class="cg-top-left">${renderContract()}</div>
      <div class="cg-top-mid">${spectator ? `<span class="cg-watch" title="${t("Touche un joueur pour voir ses cartes", "Tap a player to see their cards")}">${t("Spectateur · touche un joueur", "Spectator · tap a player")}</span>` : ""}<span class="cg-phase">${t(`Donne ${G.donneNumero - 1}`, `Deal ${G.donneNumero - 1}`)} · ${esc(phase)}</span>${
        (G.phase === "ENCHERES" || G.phase === "JEU") && G.joueurActif === me
          ? `<span class="cg-yourturn">${t("À toi", "Your turn")}</span>`
          : ""
      }</div>
      <div class="cg-top-right">
        ${score(us, US)}${score(1 - us, THEM)}
        ${iconBtn("toggle-history", "history", t("Historique", "History"), ui.panel === "history")}
        ${G.lastTrick ? iconBtn("toggle-trick", "trick", t("Dernier pli", "Last trick"), ui.panel === "trick") : ""}
        ${iconBtn("rules", "rules", t("Règles", "Rules"))}
        ${iconBtn("quit", "quit", t("Quitter", "Quit"))}
      </div>
    </div>`;
  }

  // Historique à deux onglets : les enchères de la donne (G.bidLog) et les
  // donnes terminées (G.history).
  const TABS = [
    ["bids", t("Enchères", "Bids")],
    ["donnes", t("Donnes", "Deals")],
  ];

  // Une colonne par siège (toi en premier), une ligne par tour de table,
  // passes comprises ; la dernière annonce, celle du contrat, est en or.
  // Le coinche et la surcoinche ne sont pas dans bidLog : ils suivent en note.
  function renderBids() {
    const cols = [0, 1, 2, 3].map((p) => (anchor + p) % 4);
    const waiting = G.phase === "ENCHERES" ? { seat: G.joueurActif, wait: true } : null;
    if (!G.bidLog.length && !waiting) return `<p class="cg-empty">${t("Personne n’a encore parlé.", "No one has bid yet.")}</p>`;
    let lead = null;
    for (const e of G.bidLog) if (e.montant) lead = e;
    const rows = [];
    let prevCol = 4;
    for (const e of waiting ? [...G.bidLog, waiting] : G.bidLog) {
      const c = cols.indexOf(e.seat);
      if (c <= prevCol) rows.push([null, null, null, null]);
      rows[rows.length - 1][c] = e;
      prevCol = c;
    }
    const cell = (e) =>
      !e
        ? "<td></td>"
        : e.wait
          ? '<td class="is-wait" aria-hidden="true">…</td>'
          : !e.montant
            ? `<td class="is-pass">${t("Passe", "Pass")}</td>`
            : `<td${e === lead ? ' class="is-lead"' : ""}>${bidReadout(e.montant)} ${suitSpan(e.atout)}</td>`;
    const head = cols
      .map((s) => {
        const note = [
          s === me
            ? t("toi", "you")
            : !spectator && s === (me + 2) % 4
              ? t("partenaire", "partner")
              : G.seats[s].type === "human"
                ? G.seats[s].name
                : "",
          s === G.donneur ? t("donneur", "dealer") : "",
        ]
          .filter(Boolean)
          .join(" · ");
        return `<th scope="col"${teamOf(s) === ours ? ' class="is-us"' : ""}>${compass(s)}${note ? `<small>${esc(note)}</small>` : ""}</th>`;
      })
      .join("");
    const c = G.contract;
    const verb = (s, v) =>
      s === me ? t(`Tu ${v}s`, `You ${v}`) : t(`${esc(seatName(s))} ${v}`, `${esc(seatName(s))} ${v}s`);
    const calls = [];
    if (c?.coinche && c.coincheur != null) calls.push(verb(c.coincheur, "coinche"));
    if (c?.surcoinche && c.surcoincheur != null) calls.push(verb(c.surcoincheur, "surcoinche"));
    return `<table class="cg-bids" aria-label="${t("Enchères de la donne", "Bids this deal")}">
      <thead><tr>${head}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map(cell).join("")}</tr>`).join("")}</tbody>
    </table>${calls.length ? `<p class="cg-bids-note">${calls.join(" · ")}</p>` : ""}`;
  }

  function renderDonnes() {
    return `<div class="cg-panel-scores"><span>${US} <b>${G.scores[ours]}</b></span><span>${THEM} <b>${G.scores[1 - ours]}</b></span></div>
      ${
        G.history.length
          ? `<ol class="cg-history">${G.history
              .map(
                (h) => `<li class="${h.reussi ? "ok" : "ko"}">
          <span>#${h.donne}</span>
          <span>${bidReadout(h.montant)} ${suitSpan(h.atout)}${h.multiplicateur > 1 ? ` ×${h.multiplicateur}` : ""}</span>
          <span>${esc(seatName(h.preneur))}</span>
          <span>${h.reussi ? t("réussi", "made") : t("chuté", "failed")} · ${h.pointsFaits} pts</span>
        </li>`,
              )
              .join("")}</ol>`
          : `<p class="cg-empty">${t("Aucune donne terminée pour l’instant.", "No deals finished yet.")}</p>`
      }`;
  }

  function renderPanel() {
    if (ui.panel === "history") {
      const tab = ui.tab ?? "bids";
      const name = {
        bids: t("Historique des enchères", "Bid history"),
        donnes: t("Historique des donnes", "Deal history"),
      }[tab];
      const body = { bids: renderBids, donnes: renderDonnes }[tab]();
      return `<div class="cg-panel" role="region" aria-label="${name}">
        <div class="cg-tabs" role="group" aria-label="${t("Contenu de l’historique", "History contents")}">${TABS.map(
          ([k, label]) =>
            `<button type="button" class="cg-tab" data-tab="${k}" data-focus-key="tab-${k}" aria-pressed="${k === tab}">${label}</button>`,
        ).join("")}</div>
        ${body}
      </div>`;
    }
    if (ui.panel === "trick" && G.lastTrick) {
      const bySeat = {};
      G.lastTrick.cards.forEach((e) => {
        bySeat[e.siege] = e.carte;
      });
      return `<div class="cg-panel" role="region" aria-label="${t("Dernier pli", "Last trick")}">
        <div class="cg-lasttrick">${[0, 1, 2, 3]
          .map((p) => (anchor + p) % 4)
          .map(
            (s) => `<figure class="${s === G.lastTrick.winnerSeat ? "is-winner" : ""}">
            <img src="/assets/images/coinche/cards/${bySeat[s].id}.webp" alt="${esc(cardLabel(bySeat[s]))}">
            <figcaption>${esc(seatName(s))}</figcaption></figure>`,
          )
          .join("")}</div>
      </div>`;
    }
    return "";
  }

  // ---- Barre d'enchères ----------------------------------------------------------

  function renderBidbar() {
    const canCoinche =
      !spectator &&
      G.phase === "ENCHERES" &&
      G.contract &&
      !G.contract.coinche &&
      teamOf(me) !== G.contract.equipePreneur;
    const canSurcoinche =
      !spectator &&
      G.phase === "SURCOINCHE" &&
      !G.contract.surcoinche &&
      teamOf(me) === G.contract.equipePreneur;
    // Apparition du bouton pour ce contrat : un clic trop rapide après (doigt
    // encore sur « Annoncer » ou « Passer ») ne coinche pas par erreur.
    if (canCoinche && ui.coincheFor !== G.contract.id) {
      ui.coincheFor = G.contract.id;
      ui.coincheShownAt = Date.now();
    }
    // Pendant l'armement, le bouton est grisé et une jauge se remplit (reprise
    // là où elle en est si la barre est redessinée) ; un clic trop tôt secoue le
    // bouton (voir nope) au lieu d'être ignoré en silence.
    const armLeft = canCoinche ? COINCHE_ARM_MS - (Date.now() - ui.coincheShownAt) : 0;
    clearTimeout(ui.armTimer);
    if (armLeft > 0) ui.armTimer = setTimeout(() => G && render(), armLeft + 30);
    const coinche = canCoinche
      ? `<button type="button" class="cg-btn is-danger${armLeft > 0 ? " is-arming" : ""}" data-action="coincher" data-focus-key="coincher"${armLeft > 0 ? ` aria-disabled="true" style="--arm-ms:${COINCHE_ARM_MS}ms;--arm-at:${armLeft - COINCHE_ARM_MS}ms"` : ""}>${t("Coincher", "Coinche")}</button>`
      : "";
    if (canSurcoinche) {
      // La fenêtre dure DURATION_MS.SURCOINCHE ; comptée ici dès qu'elle
      // s'ouvre (une fenêtre par G.tour), affichée par tickCount.
      if (ui.countTour !== G.tour) {
        ui.countTour = G.tour;
        ui.countAt = Date.now();
      }
      return `<div class="cg-bidbar"><span class="cg-prompt">${t("Vous êtes coinchés", "You've been coinched")}</span>
        <button type="button" class="cg-btn is-primary" data-action="surcoincher" data-focus-key="surcoincher">${t("Surcoincher", "Surcoinche")}</button>
        ${countHtml()}</div>`;
    }
    if (G.phase !== "ENCHERES" || G.joueurActif !== me)
      // Seul, sur le côté : jamais à la place d'« Annoncer » ou « Passer ».
      return coinche ? `<div class="cg-bidbar is-coinche">${coinche}</div>` : "";

    const min = G.contract ? G.contract.montant : 0;
    const options = ALLOWED_BIDS.filter((b) => b > min);
    if (ui.bidMin !== min) {
      ui.bidMin = min;
      ui.amount = options[0] ?? null;
      ui.hint = "";
    }
    // Montant au − / + (capot et générale au bout), puis l'atout en tuiles.
    const i = options.indexOf(ui.amount);
    const step = (v, sign, label) =>
      `<button type="button" class="cg-step" ${v == null ? "disabled" : `data-amount="${v}"`} data-focus-key="step${sign}" aria-label="${label}">${sign}</button>`;
    const stepper = `<div class="cg-stepper" role="group" aria-label="${t("Montant", "Amount")}">
        ${step(options[i - 1], "−", t("Montant inférieur", "Lower amount"))}
        <output class="cg-amount" aria-live="polite">${bidReadout(ui.amount)}</output>
        ${step(options[i + 1], "+", t("Montant supérieur", "Higher amount"))}
      </div>`;
    const suits = SUITS.map(
      (s) =>
        `<button type="button" class="cg-suitchip s-${s}" data-suit="${s}" data-focus-key="suit-${s}" aria-pressed="${s === ui.suit}" aria-label="${SUIT_NAME[s]}">${SUIT_SYMBOL[s]}</button>`,
    ).join("");
    // Temps de parole : jauge comme pour la surcoinche (voir tickCount).
    if (ui.countTour !== G.tour) {
      ui.countTour = G.tour;
      ui.countAt = Date.now();
    }
    // Panneau en colonne (montant, atout, puis Passer / Annoncer / Coincher et
    // le temps) ; « Annoncer » reste grisé tant que l'atout n'est pas choisi,
    // « Coincher » toujours au même endroit, grisé quand on ne peut pas.
    return `<div class="cg-bidbar is-open" role="group" aria-label="${t("Ton enchère", "Your bid")}">
      <span class="cg-prompt">${t("À toi d’annoncer", "Your turn to bid")}</span>
      ${options.length ? `<div class="cg-bidrow">${stepper}
      <div class="cg-suits" role="group" aria-label="${t("Atout", "Trump")}">${suits}</div></div>` : ""}
      <div class="cg-actions">
        <button type="button" class="cg-btn" data-action="passer" data-focus-key="passer">${t("Passer", "Pass")}</button>
        ${options.length ? `<button type="button" class="cg-btn is-primary cg-take" data-action="encherir" data-focus-key="encherir"${ui.suit ? "" : ' aria-disabled="true"'}>${t("Annoncer", "Bid")}</button>` : ""}
        ${coinche || `<button type="button" class="cg-btn is-danger" disabled>${t("Coincher", "Coinche")}</button>`}
      </div>
      ${countHtml()}
      ${ui.hint ? `<p class="cg-hint" role="alert">${esc(ui.hint)}</p>` : ""}
    </div>`;
  }

  // Jauge dessinée là où le décompte en est : un clic qui redessine la barre
  // (− / +, atout) ne la remet pas à plein.
  function countHtml() {
    const total = DURATION_MS[G.phase];
    const left = Math.max(0, total - (Date.now() - ui.countAt));
    return `<div class="cg-count${left < 3000 ? " is-low" : ""}" aria-hidden="true"><span class="cg-count-bar"><i style="transform:scaleX(${left / total})"></i></span><b>${Math.ceil(left / 1000)} s</b></div>`;
  }

  // Décompte (surcoinche, ou ton tour d'enchère) : texte et jauge retouchés en
  // place (cinq fois par seconde), sans redessiner la barre.
  function tickCount() {
    const total = DURATION_MS[G?.phase];
    const el = total && root.querySelector(".cg-count");
    if (!el) return;
    const left = Math.max(0, total - (Date.now() - ui.countAt));
    el.querySelector("b").textContent = `${Math.ceil(left / 1000)} s`;
    el.querySelector("i").style.transform = `scaleX(${left / total})`;
    el.classList.toggle("is-low", left < 3000);
  }

  // Clic sur « Coincher » pendant l'armement : le bouton le dit (secousse, ou
  // simple éclair en mouvement réduit), et le lecteur d'écran aussi.
  function nope(btn) {
    btn.classList.remove("is-nope");
    void btn.offsetWidth; // relance l'animation
    btn.classList.add("is-nope");
    setTimeout(() => btn.classList.remove("is-nope"), 400);
    announcer.textContent = t("Coincher : un instant, le bouton s’arme.", "Coinche: one moment, the button is arming.");
  }

  // ---- Résultat ------------------------------------------------------------------

  function renderBanner() {
    const us = ours;
    if (G.phase === "SCORE" && G.dernierResultat) {
      const r = G.dernierResultat;
      const won = (r.reussi ? r.preneurs : 1 - r.preneurs) === us;
      const them = 1 - us;
      const row = (label, a, b) =>
        `<tr><th scope="row">${label}</th><td>${a}</td><td>${b}</td></tr>`;
      // Belote des preneurs : +20 dès 81 points de plis ; déjà comprise
      // dans un capot beloté.
      const beloteCell = (res, tm) =>
        teamOf(res.preneur) !== tm
          ? ""
          : res.beloteBonus
            ? `+${res.beloteBonus}`
            : res.montant === 270
              ? t("comprise", "included")
              : t("non comptée (moins de 81)", "not counted (under 81)");
      return `<div class="cg-banner cg-recap ${won ? "is-win" : "is-loss"}">
        <b>${r.reussi ? t("Contrat réussi", "Contract made") : t("Contrat chuté", "Contract failed")}</b>
        <span>${bidReadout(r.montant)} ${suitSpan(r.atout)}${r.multiplicateur > 1 ? ` ×${r.multiplicateur}` : ""} · ${r.preneur === me ? t("tu prenais", "you took") : t(`${esc(seatName(r.preneur))} prenait`, `${esc(seatName(r.preneur))} took`)}</span>
        ${
          r.points
            ? `<table class="cg-recap-table">
          <thead><tr><td></td><th scope="col">${US}</th><th scope="col">${THEM}</th></tr></thead>
          <tbody>
            ${row(t("Points des plis", "Trick points"), r.points[us], r.points[them])}
            ${row(t("Plis", "Tricks"), r.plis[us], r.plis[them])}
            ${r.belote ? row("Belote", beloteCell(r, us), beloteCell(r, them)) : ""}
            ${r.beloteBonus ? row(t("Décompte", "Count"), r.points[us] + (teamOf(r.preneur) === us ? r.beloteBonus : 0), r.points[them] + (teamOf(r.preneur) === them ? r.beloteBonus : 0)) : ""}
            ${row(t("Marqué", "Scored"), `+${r.gains[us]}`, `+${r.gains[them]}`)}
          </tbody>
          <tfoot>${row("Total", G.scores[us], G.scores[them])}</tfoot>
        </table>`
            : ""
        }
      </div>`;
    }
    if (G.phase === "TERMINEE") {
      const win = G.scores[us] > G.scores[1 - us];
      return `<div class="cg-banner ${win ? "is-win" : "is-loss"}">
        <b>${spectator ? t(`Victoire ${win ? US : THEM}`, `${win ? US : THEM} win`) : win ? t("Victoire !", "Victory!") : t("Défaite", "Defeat")}</b>
        <span>${US} ${G.scores[us]} · ${THEM} ${G.scores[1 - us]}</span>
        ${spectator ? "" : `<button type="button" class="cg-btn is-primary" data-action="restart" data-focus-key="restart">${t("Nouvelle partie", "New game")}</button>`}
      </div>`;
    }
    return "";
  }

  // Boutons (masqués à l'écran) des cartes jouables, pour le clavier.
  function renderHandButtons() {
    if (G.phase !== "JEU" || G.joueurActif !== me) return "";
    const legal = computeLegal(G.hands[me], G.pliCourant, G.contract.atout, me);
    return `<div class="hand-buttons" role="group" aria-label="${t("Cartes jouables", "Playable cards")}">${legal
      .map(
        (c) =>
          `<button type="button" data-card="${c.id}" data-focus-key="card-${c.id}">${t(`Jouer ${esc(cardLabel(c))}`, `Play ${esc(cardLabel(c))}`)}</button>`,
      )
      .join("")}</div>`;
  }

  // Une zone par partie du HUD, remplacée seulement si son contenu change :
  // un coup de bot ne rejoue pas l'apparition de la barre d'enchères ni
  // ne fait perdre le focus clavier.
  function paint(parts) {
    const focusKey = root.contains(document.activeElement)
      ? document.activeElement.dataset.focusKey
      : null;
    parts.forEach((html, i) => {
      if (painted[i] === html) return;
      // Même barre, contenu retouché (montant choisi) : pas de nouvelle
      // apparition, elle ne sautille pas à chaque toucher.
      // Idem pour un panneau dont le contenu change (enchère ajoutée à
      // l'historique, onglet changé), qui garde en plus son défilement.
      // (Le résultat de la donne, lui, garde son délai d'apparition.)
      const same =
        (html.includes("cg-bidbar") || html.includes("cg-panel")) &&
        painted[i] &&
        painted[i].slice(0, 40) === html.slice(0, 40);
      const scroll = same ? slots[i].firstElementChild?.scrollTop : 0;
      slots[i].innerHTML = html;
      if (same && slots[i].firstElementChild) {
        slots[i].firstElementChild.style.animation = "none";
        slots[i].firstElementChild.scrollTop = scroll;
      }
      painted[i] = html;
    });
    if (focusKey && !root.contains(document.activeElement))
      root.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
  }

  function render() {
    paint([
      renderTopbar(),
      renderPanel(),
      renderBanner(),
      renderBidbar(),
      renderHandButtons(),
    ]);
    tickCount();
  }

  // ---- Événements ----------------------------------------------------------------

  root.addEventListener("focusin", (event) => {
    onFocusCard(event.target.dataset?.card || null);
  });
  root.addEventListener("focusout", () => onFocusCard(null));

  root.addEventListener("click", (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    if (btn.dataset.card) {
      onAction({ type: "JOUER", carte: { id: btn.dataset.card } });
      return;
    }
    if (btn.dataset.amount) {
      ui.amount = Number(btn.dataset.amount);
      render();
      return;
    }
    if (btn.dataset.tab) {
      ui.tab = btn.dataset.tab;
      render();
      return;
    }
    if (btn.dataset.suit) {
      ui.suit = btn.dataset.suit;
      ui.hint = "";
      render();
      return;
    }
    const action = btn.dataset.action;
    if (action === "encherir") {
      if (!ui.suit) {
        ui.hint = t("Choisis d’abord une couleur d’atout.", "First pick a trump suit.");
        render();
        return;
      }
      onAction({ type: "ENCHERIR", montant: ui.amount, atout: ui.suit });
      ui.suit = null;
      ui.bidMin = undefined;
    } else if (action === "passer") onAction({ type: "PASSER" });
    else if (action === "coincher") {
      if (Date.now() - (ui.coincheShownAt || 0) >= COINCHE_ARM_MS) onAction({ type: "COINCHER" });
      else nope(btn);
    }
    else if (action === "surcoincher") onAction({ type: "SURCOINCHER" });
    else if (action === "toggle-history" || action === "toggle-trick") {
      const p = action === "toggle-history" ? "history" : "trick";
      ui.panel = ui.panel === p ? null : p;
      render();
    } else if (action === "rules") document.querySelector("#rules-btn")?.click();
    else if (action === "restart")
      onRelaunch(G.seats.map((s) => ({ type: s.type, name: s.name })));
    else if (action === "quit") onQuit();
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ui.panel) {
      const opener = `toggle-${ui.panel}`;
      ui.panel = null;
      render();
      // Focus resté dans le panneau fermé (onglets) : retour au bouton qui l'ouvre.
      if (!root.contains(document.activeElement))
        root.querySelector(`[data-focus-key="${opener}"]`)?.focus();
    }
  });

  const countTimer = setInterval(tickCount, 200);

  preloadFlash();

  // Bouton en bas à droite : il ouvre la palette ; une émoticône ou un
  // message par seconde au plus. Émoticônes : joueurs assis seulement. En
  // ligne, la palette a aussi les messages de la table (spectateurs compris),
  // une ligne pour écrire et une case pour masquer ceux des autres (retenue
  // dans ce navigateur) ; une pastille compte les messages pas encore vus.
  let chatOff = false;
  try {
    chatOff = localStorage.getItem(CHAT_OFF_KEY) === "1";
  } catch {
    // stockage bloqué : messages affichés
  }
  let addChat = () => {};
  let setWatchers = () => {};
  if (!spectator || onChat) {
    const label = spectator ? "Messages" : t("Émoticônes et messages", "Emotes and messages");
    const box = document.createElement("div");
    box.className = "cg-emotes";
    box.innerHTML = `<div class="cg-emote-list${spectator ? " is-chat-only" : ""}" hidden>${
      spectator
        ? ""
        : [...EMOTES]
            .map(
              ([e, taunt]) =>
                `<button type="button" class="cg-emote" data-emote="${e}" aria-label="${t(`Envoyer ${e} ${taunt}`, `Send ${e} ${taunt}`)}"><span aria-hidden="true">${e}</span><b>${taunt}</b></button>`,
            )
            .join("")
    }${
      onChat
        ? `<p class="cg-chat-watchers">${t("👀 Aucun spectateur", "👀 No spectators")}</p>
      <ol class="cg-chat-log" aria-label="${t("Messages de la table", "Table messages")}" aria-live="polite" hidden></ol>
      <form class="cg-chat"><input name="text" maxlength="${MAX_CHAT}" autocomplete="off" enterkeyhint="send" placeholder="${t("Message à la table", "Message the table")}" aria-label="${t("Message à la table", "Message the table")}"><button type="submit" aria-label="${t("Envoyer le message", "Send message")}">➤</button></form>
      <label class="cg-chat-off"><input type="checkbox"${chatOff ? " checked" : ""}> ${t("Masquer les messages des autres", "Hide other players’ messages")}</label>`
        : ""
    }</div>
      <button type="button" class="cg-emote-toggle" aria-expanded="false" aria-label="${label}">${spectator ? "💬" : "😈"}<span class="cg-badge" hidden></span></button>`;
    root.append(box);
    const list = box.querySelector(".cg-emote-list");
    const toggle = box.querySelector(".cg-emote-toggle");
    const badge = box.querySelector(".cg-badge");
    const log = box.querySelector(".cg-chat-log");
    let unread = 0;
    const open = (yes) => {
      list.hidden = !yes;
      toggle.setAttribute("aria-expanded", String(yes));
      if (!yes) return;
      unread = 0;
      badge.hidden = true;
      toggle.setAttribute("aria-label", label);
      if (log) log.scrollTop = log.scrollHeight;
    };
    let nextEmote = 0;
    box.addEventListener("click", (event) => {
      const btn = event.target.closest("button");
      if (btn === toggle) return open(list.hidden);
      if (!btn?.dataset.emote || Date.now() < nextEmote) return;
      nextEmote = Date.now() + 1000;
      onEmote(btn.dataset.emote);
      open(false);
    });
    // Palette laissée ouverte après un message ; le bouton d'envoi compte
    // les secondes avant le suivant (anti-spam, le serveur vérifie aussi).
    const send = box.querySelector(".cg-chat button");
    box.querySelector(".cg-chat")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.target.elements.text;
      const text = input.value.trim();
      // Pas parti (reconnexion en cours) : le texte reste, à renvoyer.
      if (!text || send.disabled || onChat(text) === false) return;
      input.value = "";
      send.disabled = true;
      let left = Math.ceil(CHAT_GAP_MS / 1000);
      send.textContent = String(left);
      const tick = setInterval(() => {
        if (--left > 0) return (send.textContent = String(left));
        clearInterval(tick);
        send.disabled = false;
        send.textContent = "➤";
      }, 1000);
    });
    box.querySelector(".cg-chat-off input")?.addEventListener("change", (event) => {
      chatOff = event.target.checked;
      try {
        localStorage.setItem(CHAT_OFF_KEY, chatOff ? "1" : "0");
      } catch {
        // stockage bloqué : réglage pour cette partie seulement
      }
    });
    // Texte posé en textContent : jamais interprété comme du HTML.
    // Message du serveur (name null : bannissement…) : en italique, sans pseudo.
    addChat = (name, text, mine, watcher) => {
      if (!log) return;
      const li = document.createElement("li");
      if (mine) li.className = "is-mine";
      if (name == null) {
        li.className = "is-system";
        li.textContent = text;
      } else {
        const who = document.createElement("b");
        who.textContent = watcher ? `${name} 👀` : name;
        li.append(who, " ", text);
      }
      log.append(li);
      while (log.children.length > 50) log.firstChild.remove();
      log.hidden = false;
      log.scrollTop = log.scrollHeight;
      if (!list.hidden || mine) return;
      unread++;
      badge.textContent = unread > 9 ? "9+" : String(unread);
      badge.hidden = false;
      toggle.setAttribute("aria-label", t(`${label}, ${unread} non lu${unread > 1 ? "s" : ""}`, `${label}, ${unread} unread`));
    };
    const watchersLine = box.querySelector(".cg-chat-watchers");
    setWatchers = (names) => {
      if (watchersLine)
        watchersLine.textContent = names.length
          ? t(`👀 Spectateurs : ${names.join(", ")}`, `👀 Spectators: ${names.join(", ")}`)
          : t("👀 Aucun spectateur", "👀 No spectators");
    };
  }

  return {
    // Message reçu : ajouté à la liste ; false s'il est masqué (pas de bulle).
    chat(name, text, { mine = false, watcher = false, system = false } = {}) {
      if (chatOff && !mine && !system) return false;
      addChat(name, text, mine, watcher);
      return true;
    },
    watchers: (names) => setWatchers(names),
    waiting() {
      paint([
        `<div class="cg-topbar"><div class="cg-top-left"><span class="cg-contract is-empty">${t("Table en préparation", "Setting up the table")}</span></div>
        <div class="cg-top-right"><button type="button" class="cg-icon" data-action="quit" aria-label="${t("Quitter", "Quit")}">${ICONS.quit}<span>${t("Quitter", "Quit")}</span></button></div></div>`,
        "",
        "",
        "",
        "",
      ]);
    },
    update(next, prev) {
      G = next;
      // L'hôte de la partie peut bannir du chat (worker/tables.js).
      const chatInput = root.querySelector(".cg-chat input");
      if (chatInput)
        chatInput.placeholder = G.hote === me
          ? t("Message, /ban, /deban ou /kick pseudo", "Message, /ban, /deban or /kick nickname")
          : t("Message à la table", "Message the table");
      if (prev && prev.donneNumero !== G.donneNumero && ui.panel === "trick")
        ui.panel = null;
      if (prev && G.contract?.coinche && !prev.contract?.coinche) flash("coinche");
      if (prev && G.contract?.surcoinche && !prev.contract?.surcoinche)
        flash("surcoinche");
      if (prev && prev.donneNumero === G.donneNumero) {
        if (G.belote.beloteDeclared && !prev.belote.beloteDeclared) toast(t("Belote !", "Belote!"));
        if (G.belote.rebeloteDeclared && !prev.belote.rebeloteDeclared)
          toast(t(`Rebelote ! +${BELOTE_BONUS}`, `Rebelote! +${BELOTE_BONUS}`));
      }
      // Joueur parti en cours de partie : un bot prend sa place.
      for (const s of [0, 1, 2, 3])
        if (prev?.seats?.[s].type === "human" && G.seats[s].type === "bot")
          toast(t(`${prev.seats[s].name} a quitté : un bot le remplace`, `${prev.seats[s].name} left: a bot takes over`));
        else if (prev?.seats?.[s].type === "bot" && G.seats[s].type === "human")
          toast(t(`${G.seats[s].name} prend la place du bot`, `${G.seats[s].name} takes the bot's place`));
      announce(prev);
      render();
    },
    destroy() {
      clearInterval(countTimer);
      clearTimeout(ui.armTimer);
      // Copie vide à la place : ses écouteurs (G null) ne survivent pas à la
      // partie suivante, qui relit #game-hud.
      root.replaceWith(root.cloneNode(false));
      announcer.textContent = "";
      G = null;
    },
  };
}
