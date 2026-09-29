// Commandes et informations HTML posées sur la table Phaser : barre de jeu
// (contrat, donne, scores, historique, dernier pli, règles, quitter), barre
// d'enchères en pastilles au-dessus de la main, résultat de la donne.
// Du HTML plutôt que du canevas : vrais boutons (clavier, lecteur d'écran,
// cibles tactiles) et texte net. Les cartes jouables ont aussi chacune un
// bouton, masqué à l'écran mais atteignable au clavier ; la carte qui a le
// focus s'éclaire sur la table.
import {
  ALLOWED_BIDS,
  SUITS,
  SUIT_NAME,
  SUIT_SYMBOL,
  cardLabel,
  computeLegal,
  teamOf,
} from "../engine.js";

const RED_SUITS = new Set(["H", "D"]);
const COMPASS = ["Sud", "Est", "Nord", "Ouest"]; // position vue du joueur
const FLASH = {
  coinche: { src: "../assets/images/coinche/coinched.mp4", ms: 1600 },
  surcoinche: { src: "../assets/images/coinche/surcoinched.mp4", ms: 2900 },
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
  return String(value);
}

function suitSpan(s) {
  return `<span class="cg-suit${RED_SUITS.has(s) ? " is-red" : ""}">${SUIT_SYMBOL[s]}</span>`;
}

export function createHud(view, { me, onAction, onRelaunch, onQuit, onFocusCard }) {
  const root = view.querySelector("#game-hud");
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
      ? "Vous"
      : G.seats[s].type === "bot"
        ? `Bot ${compass(s)}`
        : G.seats[s].name;
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
        `${who(G.lastTrick.winnerSeat)} ${G.lastTrick.winnerSeat === me ? "remportez" : "remporte"} le pli (${G.lastTrick.points} points).`,
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
      out.push("À vous de jouer.");
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

  // ---- Barre de jeu ------------------------------------------------------------

  function renderContract() {
    const c = G.contract;
    if (!c)
      return `<span class="cg-contract is-empty">Enchères</span>`;
    const label = c.generale ? "Générale" : bidReadout(c.montant);
    const mult = G.multiplicateur > 1 ? ` ×${G.multiplicateur}` : "";
    const state = c.surcoinche ? " · surcoinché" : c.coinche ? " · coinché" : "";
    return `<span class="cg-contract">${suitSpan(c.atout)} ${label}${mult}</span>
      <span class="cg-sub">${esc(seatName(c.preneur))} ${c.preneur === me ? "prenez" : "prend"}${state}</span>`;
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
    const score = (t, label) =>
      `<span class="cg-score${t === us ? " is-us" : ""}"><small>${label}</small><b>${G.scores[t]}</b>${live ? `<em>+${G.pointsPlis[t]}</em>` : ""}</span>`;
    const iconBtn = (action, icon, label, pressed) =>
      `<button type="button" class="cg-icon" data-action="${action}" data-focus-key="${action}" aria-label="${label}"${pressed === undefined ? "" : ` aria-expanded="${pressed}"`}>${ICONS[icon]}<span>${label}</span></button>`;
    return `<div class="cg-topbar">
      <div class="cg-top-left">${renderContract()}</div>
      <div class="cg-top-mid">${spectator ? '<span class="cg-watch">Spectateur</span>' : ""}<span class="cg-phase">Donne ${G.donneNumero - 1} · ${esc(phase)}</span>${
        (G.phase === "ENCHERES" || G.phase === "JEU") && G.joueurActif === me
          ? '<span class="cg-yourturn">À vous</span>'
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
            <span>${h.generale ? "Générale" : bidReadout(h.montant)} ${suitSpan(h.atout)}${h.multiplicateur > 1 ? ` ×${h.multiplicateur}` : ""}</span>
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
            <img src="../assets/images/cards/${bySeat[s].id}.png" alt="${esc(cardLabel(bySeat[s]))}">
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
    if (canSurcoinche)
      return `<div class="cg-bidbar"><span class="cg-prompt">Vous êtes coinchés</span>
        <button type="button" class="cg-btn is-primary" data-action="surcoincher" data-focus-key="surcoincher">Surcoincher</button></div>`;
    if (G.phase !== "ENCHERES" || G.joueurActif !== me)
      return coinche ? `<div class="cg-bidbar">${coinche}</div>` : "";

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
    return `<div class="cg-bidbar is-open" role="group" aria-label="Votre enchère">
      <span class="cg-prompt">À vous d’annoncer</span>
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
      const beloteBy = r.belote ? teamOf(r.preneur) : -1;
      return `<div class="cg-banner cg-recap ${won ? "is-win" : "is-loss"}">
        <b>${r.reussi ? "Contrat réussi" : "Contrat chuté"}</b>
        <span>${r.generale ? "Générale" : bidReadout(r.montant)} ${suitSpan(r.atout)}${r.multiplicateur > 1 ? ` ×${r.multiplicateur}` : ""} · ${esc(seatName(r.preneur))} ${r.preneur === me ? "preniez" : "prenait"}</span>
        ${
          r.points
            ? `<table class="cg-recap-table">
          <thead><tr><td></td><th scope="col">${US}</th><th scope="col">${THEM}</th></tr></thead>
          <tbody>
            ${row("Points des plis", r.points[us], r.points[them])}
            ${row("Plis", r.plis[us], r.plis[them])}
            ${r.belote ? row("Belote", beloteBy === us ? "✓" : "", beloteBy === them ? "✓" : "") : ""}
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

  function render() {
    const focusKey = root.contains(document.activeElement)
      ? document.activeElement.dataset.focusKey
      : null;
    root.innerHTML = `${renderTopbar()}${renderPanel()}${renderBanner()}${renderBidbar()}${renderHandButtons()}`;
    if (focusKey)
      root.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
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
        ui.hint = "Choisissez d’abord une couleur d’atout.";
        render();
        return;
      }
      onAction({ type: "ENCHERIR", montant: ui.amount, atout: ui.suit });
      ui.suit = null;
      ui.bidMin = undefined;
    } else if (action === "passer") onAction({ type: "PASSER" });
    else if (action === "coincher") onAction({ type: "COINCHER" });
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

  return {
    waiting() {
      root.innerHTML = `<div class="cg-topbar"><div class="cg-top-left"><span class="cg-contract is-empty">Table en préparation</span></div>
        <div class="cg-top-right"><button type="button" class="cg-icon" data-action="quit" aria-label="Quitter">${ICONS.quit}<span>Quitter</span></button></div></div>`;
    },
    update(next, prev) {
      G = next;
      if (prev && prev.donneNumero !== G.donneNumero && ui.panel === "trick")
        ui.panel = null;
      if (prev && G.contract?.coinche && !prev.contract?.coinche) flash("coinche");
      if (prev && G.contract?.surcoinche && !prev.contract?.surcoinche)
        flash("surcoinche");
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
