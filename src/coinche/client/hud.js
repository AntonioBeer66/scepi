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

const RED_SUITS = new Set(["H", "D"]);
const CHAT_OFF_KEY = "scepi-coinche-chat-off"; // "1" : messages des autres masqués
const COINCHE_ARM_MS = 600; // « Coincher » inactif juste après son apparition
const COMPASS = ["Sud", "Est", "Nord", "Ouest"]; // position vue du joueur
const FLASH = {
  coinche: { src: "../../assets/images/coinche/coinched.mp4", ms: 1100 },
  surcoinche: { src: "../../assets/images/coinche/surcoinched.mp4", ms: 1700 },
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
  if (value === 270) return "Capot beloté";
  if (value === GENERALE) return "Générale";
  if (value === GENERALE_BELOTE) return "Générale belotée";
  return String(value);
}

function suitSpan(s) {
  return `<span class="cg-suit${RED_SUITS.has(s) ? " is-red" : ""}">${SUIT_SYMBOL[s]}</span>`;
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
  };
  let G = null;
  const flashBlobs = {};

  // Spectateur (me = -1) : vue depuis le siège 0, équipes nommées.
  const spectator = me < 0;
  const anchor = spectator ? 0 : me;
  const ours = spectator ? 0 : teamOf(me);
  const [US, THEM] = spectator ? ["Nord-Sud", "Est-Ouest"] : ["Nous", "Eux"];
  const compass = (s) => COMPASS[(s - anchor + 4) % 4];
  const seatName = (s) =>
    s === me
      ? "Toi"
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
      out.push(`Nouvelle donne. ${who(G.donneur)} donne.`);
    const same = prev && prev.donneNumero === G.donneNumero;
    if (same && G.bidLog.length > prev.bidLog.length) {
      for (const e of G.bidLog.slice(prev.bidLog.length))
        out.push(
          e.montant
            ? `${who(e.seat)} : ${bidReadout(e.montant)} ${SUIT_NAME[e.atout]}`
            : `${who(e.seat)} : passe`,
        );
    }
    if (G.contract?.coinche && !prev?.contract?.coinche) out.push("Coinché !");
    if (G.contract?.surcoinche && !prev?.contract?.surcoinche)
      out.push("Surcoinché !");
    if (same)
      for (const s of [0, 1, 2, 3])
        for (const c of G.playedBy[s].slice(prev.playedBy[s].length))
          out.push(`${who(s)} : ${cardLabel(c)}`);
    if (G.belote.beloteDeclared && !(same && prev.belote.beloteDeclared))
      out.push("Belote !");
    if (G.belote.rebeloteDeclared && !(same && prev.belote.rebeloteDeclared))
      out.push("Rebelote !");
    if (same && G.plisJoues > prev.plisJoues)
      out.push(
        `${G.lastTrick.winnerSeat === me ? "Tu remportes" : `${who(G.lastTrick.winnerSeat)} remporte`} le pli (${G.lastTrick.points} points).`,
      );
    if (G.phase === "SCORE" && prev?.phase !== "SCORE" && G.dernierResultat) {
      const r = G.dernierResultat;
      out.push(
        `${r.reussi ? "Contrat réussi" : "Contrat chuté"} : ${r.gain} points. ${US} ${G.scores[ours]}, ${THEM} ${G.scores[1 - ours]}.`,
      );
    }
    if (G.phase === "TERMINEE" && prev?.phase !== "TERMINEE")
      out.push(
        `Partie terminée. ${US} ${G.scores[ours]}, ${THEM} ${G.scores[1 - ours]}.`,
      );
    if (
      (G.phase === "ENCHERES" || G.phase === "JEU") &&
      G.joueurActif === me &&
      G.tour !== prev?.tour
    )
      out.push("À toi de jouer.");
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
      return `<span class="cg-contract is-empty">Enchères</span>`;
    const label = bidReadout(c.montant);
    const mult = G.multiplicateur > 1 ? ` ×${G.multiplicateur}` : "";
    const state = c.surcoinche ? " · surcoinché" : c.coinche ? " · coinché" : "";
    return `<span class="cg-contract">${suitSpan(c.atout)} ${label}${mult}</span>
      <span class="cg-sub">${c.preneur === me ? "Tu prends" : `${esc(seatName(c.preneur))} prend`}${state}</span>`;
  }

  function renderTopbar() {
    const us = ours;
    const phase = {
      ENCHERES: "Enchères",
      SURCOINCHE: "Surcoinche possible",
      JEU: `Pli ${Math.min(G.plisJoues + 1, 8)}/8`,
      SCORE: "Résultat",
      TERMINEE: "Partie terminée",
    }[G.phase];
    const live = G.phase === "JEU" && G.contract;
    const belote =
      live && G.belote.rebeloteDeclared ? G.contract.equipePreneur : -1;
    // Décompte de la donne en cours : la belote des preneurs y compte (+20),
    // pas au score de la partie.
    const score = (t, label) =>
      `<span class="cg-score${t === us ? " is-us" : ""}"><small>${label}</small><b>${G.scores[t]}</b>${live ? `<em${t === belote ? ` title="Dont ${BELOTE_BONUS} de belote"` : ""}>+${G.pointsPlis[t] + (t === belote ? BELOTE_BONUS : 0)}${t === belote ? " <i>♛</i>" : ""}</em>` : ""}</span>`;
    const iconBtn = (action, icon, label, pressed) =>
      `<button type="button" class="cg-icon" data-action="${action}" data-focus-key="${action}" aria-label="${label}"${pressed === undefined ? "" : ` aria-expanded="${pressed}"`}>${ICONS[icon]}<span>${label}</span></button>`;
    return `<div class="cg-topbar">
      <div class="cg-top-left">${renderContract()}</div>
      <div class="cg-top-mid">${spectator ? '<span class="cg-watch" title="Touche un joueur pour voir ses cartes">Spectateur · touche un joueur</span>' : ""}<span class="cg-phase">Donne ${G.donneNumero - 1} · ${esc(phase)}</span>${
        (G.phase === "ENCHERES" || G.phase === "JEU") && G.joueurActif === me
          ? '<span class="cg-yourturn">À toi</span>'
          : ""
      }</div>
      <div class="cg-top-right">
        ${score(us, US)}${score(1 - us, THEM)}
        ${iconBtn("toggle-history", "history", "Historique", ui.panel === "history")}
        ${G.lastTrick ? iconBtn("toggle-trick", "trick", "Dernier pli", ui.panel === "trick") : ""}
        ${iconBtn("rules", "rules", "Règles")}
        ${iconBtn("quit", "quit", "Quitter")}
      </div>
    </div>`;
  }

  function renderPanel() {
    if (ui.panel === "history") {
      const us = ours;
      return `<div class="cg-panel" role="region" aria-label="Historique des donnes">
        <div class="cg-panel-scores"><span>${US} <b>${G.scores[us]}</b></span><span>${THEM} <b>${G.scores[1 - us]}</b></span></div>
        ${
          G.history.length
            ? `<ol class="cg-history">${G.history
                .map(
                  (h) => `<li class="${h.reussi ? "ok" : "ko"}">
            <span>#${h.donne}</span>
            <span>${bidReadout(h.montant)} ${suitSpan(h.atout)}${h.multiplicateur > 1 ? ` ×${h.multiplicateur}` : ""}</span>
            <span>${esc(seatName(h.preneur))}</span>
            <span>${h.reussi ? "réussi" : "chuté"} · ${h.pointsFaits} pts</span>
          </li>`,
                )
                .join("")}</ol>`
            : `<p class="cg-empty">Aucune donne terminée pour l’instant.</p>`
        }
      </div>`;
    }
    if (ui.panel === "trick" && G.lastTrick) {
      const bySeat = {};
      G.lastTrick.cards.forEach((e) => {
        bySeat[e.siege] = e.carte;
      });
      return `<div class="cg-panel" role="region" aria-label="Dernier pli">
        <div class="cg-lasttrick">${[0, 1, 2, 3]
          .map((p) => (anchor + p) % 4)
          .map(
            (s) => `<figure class="${s === G.lastTrick.winnerSeat ? "is-winner" : ""}">
            <img src="../../assets/images/coinche/cards/${bySeat[s].id}.png" alt="${esc(cardLabel(bySeat[s]))}">
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
    const coinche = canCoinche
      ? '<button type="button" class="cg-btn is-danger" data-action="coincher" data-focus-key="coincher">Coincher</button>'
      : "";
    // Apparition du bouton pour ce contrat : un clic trop rapide après (doigt
    // encore sur « Annoncer » ou « Passer ») ne coinche pas par erreur.
    if (canCoinche && ui.coincheFor !== G.contract.id) {
      ui.coincheFor = G.contract.id;
      ui.coincheShownAt = Date.now();
    }
    if (canSurcoinche)
      return `<div class="cg-bidbar"><span class="cg-prompt">Vous êtes coinchés</span>
        <button type="button" class="cg-btn is-primary" data-action="surcoincher" data-focus-key="surcoincher">Surcoincher</button></div>`;
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
    const amounts = options
      .map(
        (v) =>
          `<button type="button" class="cg-chip" data-amount="${v}" data-focus-key="amount-${v}" aria-pressed="${v === ui.amount}">${bidReadout(v)}</button>`,
      )
      .join("");
    const suits = SUITS.map(
      (s) =>
        `<button type="button" class="cg-chip cg-suitchip${RED_SUITS.has(s) ? " is-red" : ""}" data-suit="${s}" data-focus-key="suit-${s}" aria-pressed="${s === ui.suit}" aria-label="${SUIT_NAME[s]}">${SUIT_SYMBOL[s]}</button>`,
    ).join("");
    return `<div class="cg-bidbar is-open" role="group" aria-label="Ton enchère">
      <span class="cg-prompt">À toi d’annoncer</span>
      ${options.length ? `<div class="cg-chips" role="group" aria-label="Montant">${amounts}</div>
      <div class="cg-chips" role="group" aria-label="Atout">${suits}</div>` : ""}
      <div class="cg-actions">
        ${options.length ? '<button type="button" class="cg-btn is-primary" data-action="encherir" data-focus-key="encherir">Annoncer</button>' : ""}
        <button type="button" class="cg-btn" data-action="passer" data-focus-key="passer">Passer</button>
        ${coinche}
      </div>
      ${ui.hint ? `<p class="cg-hint" role="alert">${esc(ui.hint)}</p>` : ""}
    </div>`;
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
      const beloteCell = (res, t) =>
        teamOf(res.preneur) !== t
          ? ""
          : res.beloteBonus
            ? `+${res.beloteBonus}`
            : res.montant === 270
              ? "comprise"
              : "non comptée (moins de 81)";
      return `<div class="cg-banner cg-recap ${won ? "is-win" : "is-loss"}">
        <b>${r.reussi ? "Contrat réussi" : "Contrat chuté"}</b>
        <span>${bidReadout(r.montant)} ${suitSpan(r.atout)}${r.multiplicateur > 1 ? ` ×${r.multiplicateur}` : ""} · ${r.preneur === me ? "tu prenais" : `${esc(seatName(r.preneur))} prenait`}</span>
        ${
          r.points
            ? `<table class="cg-recap-table">
          <thead><tr><td></td><th scope="col">${US}</th><th scope="col">${THEM}</th></tr></thead>
          <tbody>
            ${row("Points des plis", r.points[us], r.points[them])}
            ${row("Plis", r.plis[us], r.plis[them])}
            ${r.belote ? row("Belote", beloteCell(r, us), beloteCell(r, them)) : ""}
            ${r.beloteBonus ? row("Décompte", r.points[us] + (teamOf(r.preneur) === us ? r.beloteBonus : 0), r.points[them] + (teamOf(r.preneur) === them ? r.beloteBonus : 0)) : ""}
            ${row("Marqué", `+${r.gains[us]}`, `+${r.gains[them]}`)}
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
        <b>${spectator ? `Victoire ${win ? US : THEM}` : win ? "Victoire !" : "Défaite"}</b>
        <span>${US} ${G.scores[us]} · ${THEM} ${G.scores[1 - us]}</span>
        ${spectator ? "" : '<button type="button" class="cg-btn is-primary" data-action="restart" data-focus-key="restart">Nouvelle partie</button>'}
      </div>`;
    }
    return "";
  }

  // Boutons (masqués à l'écran) des cartes jouables, pour le clavier.
  function renderHandButtons() {
    if (G.phase !== "JEU" || G.joueurActif !== me) return "";
    const legal = computeLegal(G.hands[me], G.pliCourant, G.contract.atout, me);
    return `<div class="hand-buttons" role="group" aria-label="Cartes jouables">${legal
      .map(
        (c) =>
          `<button type="button" data-card="${c.id}" data-focus-key="card-${c.id}">Jouer ${esc(cardLabel(c))}</button>`,
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
      // (Barre d'enchères seulement : le résultat de la donne, lui, garde son
      // délai d'apparition.)
      const same =
        html.includes("cg-bidbar") &&
        painted[i] &&
        painted[i].slice(0, 40) === html.slice(0, 40);
      slots[i].innerHTML = html;
      if (same && slots[i].firstElementChild)
        slots[i].firstElementChild.style.animation = "none";
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
    if (btn.dataset.suit) {
      ui.suit = btn.dataset.suit;
      ui.hint = "";
      render();
      return;
    }
    const action = btn.dataset.action;
    if (action === "encherir") {
      if (!ui.suit) {
        ui.hint = "Choisis d’abord une couleur d’atout.";
        render();
        return;
      }
      onAction({ type: "ENCHERIR", montant: ui.amount, atout: ui.suit });
      ui.suit = null;
      ui.bidMin = undefined;
    } else if (action === "passer") onAction({ type: "PASSER" });
    else if (action === "coincher") {
      if (Date.now() - (ui.coincheShownAt || 0) >= COINCHE_ARM_MS) onAction({ type: "COINCHER" });
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
      ui.panel = null;
      render();
    }
  });

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
    const label = spectator ? "Messages" : "Émoticônes et messages";
    const box = document.createElement("div");
    box.className = "cg-emotes";
    box.innerHTML = `<div class="cg-emote-list${spectator ? " is-chat-only" : ""}" hidden>${
      spectator
        ? ""
        : [...EMOTES]
            .map(
              ([e, taunt]) =>
                `<button type="button" class="cg-emote" data-emote="${e}" aria-label="Envoyer ${e} ${taunt}"><span aria-hidden="true">${e}</span><b>${taunt}</b></button>`,
            )
            .join("")
    }${
      onChat
        ? `<p class="cg-chat-watchers">👀 Aucun spectateur</p>
      <ol class="cg-chat-log" aria-label="Messages de la table" aria-live="polite" hidden></ol>
      <form class="cg-chat"><input name="text" maxlength="${MAX_CHAT}" autocomplete="off" enterkeyhint="send" placeholder="Message à la table" aria-label="Message à la table"><button type="submit" aria-label="Envoyer le message">➤</button></form>
      <label class="cg-chat-off"><input type="checkbox"${chatOff ? " checked" : ""}> Masquer les messages des autres</label>`
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
      if (!text || send.disabled) return;
      onChat(text);
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
      toggle.setAttribute("aria-label", `${label}, ${unread} non lu${unread > 1 ? "s" : ""}`);
    };
    const watchersLine = box.querySelector(".cg-chat-watchers");
    setWatchers = (names) => {
      if (watchersLine)
        watchersLine.textContent = names.length ? `👀 Spectateurs : ${names.join(", ")}` : "👀 Aucun spectateur";
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
        `<div class="cg-topbar"><div class="cg-top-left"><span class="cg-contract is-empty">Table en préparation</span></div>
        <div class="cg-top-right"><button type="button" class="cg-icon" data-action="quit" aria-label="Quitter">${ICONS.quit}<span>Quitter</span></button></div></div>`,
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
        chatInput.placeholder = G.hote === me ? "Message, /ban ou /deban pseudo" : "Message à la table";
      if (prev && prev.donneNumero !== G.donneNumero && ui.panel === "trick")
        ui.panel = null;
      if (prev && G.contract?.coinche && !prev.contract?.coinche) flash("coinche");
      if (prev && G.contract?.surcoinche && !prev.contract?.surcoinche)
        flash("surcoinche");
      if (prev && prev.donneNumero === G.donneNumero) {
        if (G.belote.beloteDeclared && !prev.belote.beloteDeclared) toast("Belote !");
        if (G.belote.rebeloteDeclared && !prev.belote.rebeloteDeclared)
          toast(`Rebelote ! +${BELOTE_BONUS}`);
      }
      // Joueur parti en cours de partie : un bot prend sa place.
      for (const s of [0, 1, 2, 3])
        if (prev?.seats?.[s].type === "human" && G.seats[s].type === "bot")
          toast(`${prev.seats[s].name} a quitté : un bot le remplace`);
        else if (prev?.seats?.[s].type === "bot" && G.seats[s].type === "human")
          toast(`${G.seats[s].name} prend la place du bot`);
      announce(prev);
      render();
    },
    destroy() {
      root.innerHTML = "";
      announcer.textContent = "";
      G = null;
    },
  };
}
