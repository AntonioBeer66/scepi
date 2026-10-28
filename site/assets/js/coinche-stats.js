// « La coinche en chiffres » (page coinche) : totaux du journal anonyme des
// donnes, servis par /api/stats (worker/journal.js). Bloc laissé caché tant
// qu'il y a trop peu de donnes pour que les pourcentages veuillent dire
// quelque chose, ou si le serveur ne répond pas.
// Sans « ?. » ni « ?? » : vieilles WebView Android (voir main.js).
(function () {
  var box = document.getElementById("coinche-stats");
  if (!box || !window.fetch) return;
  var MIN_DONNES = 50;
  var SUITS = {
    H: i18n.t("Cœur", "Hearts"),
    D: i18n.t("Carreau", "Diamonds"),
    C: i18n.t("Trèfle", "Clubs"),
    S: i18n.t("Pique", "Spades"),
  };
  var PALIERS = { 80: "80-90", 100: "100-110", 120: "120-130", 140: "140-160", capot: "Capot", generale: "Générale" };
  var nf = function (n) {
    return Number(n).toLocaleString(i18n.t("fr-FR", "en-GB"));
  };
  var pct = function (a, b) {
    return b ? Math.round((100 * a) / b) + i18n.t("\u00a0%", "%") : "—";
  };

  fetch("/api/stats", { headers: { accept: "application/json" } })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (s) {
      if (!s || !(s.donnes >= MIN_DONNES) || !s.jouees) return;
      var atout = Object.keys(s.atouts).sort(function (a, b) {
        return s.atouts[b] - s.atouts[a];
      })[0];
      var palier = Object.keys(s.paliers).sort(function (a, b) {
        return s.paliers[b].n - s.paliers[a].n;
      })[0];
      var items = [
        [nf(s.donnes), i18n.t("donnes jouées", "deals played")],
        [pct(s.reussies, s.jouees), i18n.t("des contrats réussis", "of contracts made")],
        [pct(s.passees, s.donnes), i18n.t("des donnes passées (quatre passes)", "of deals passed (four passes)")],
        [pct(s.coinchees, s.jouees), i18n.t("des contrats coinchés", "of contracts coinched")],
        [pct(s.coinchesGagnantes, s.coinchees), i18n.t("des coinches gagnantes", "of coinches that won")],
        [
          SUITS[atout],
          i18n.t(
            "l’atout le plus pris (" + pct(s.atouts[atout], s.jouees) + ")",
            "the most chosen trump (" + pct(s.atouts[atout], s.jouees) + ")",
          ),
        ],
        [
          PALIERS[palier],
          i18n.t(
            "les annonces les plus courantes, réussies à " + pct(s.paliers[palier].reussies, s.paliers[palier].n),
            "the most common bids, made " + pct(s.paliers[palier].reussies, s.paliers[palier].n) + " of the time",
          ),
        ],
      ];
      box.querySelector("[data-stats-grid]").innerHTML = items
        .map(function (i) {
          return "<div><dt>" + i[1] + "</dt><dd>" + i[0] + "</dd></div>";
        })
        .join("");
      box.querySelector("[data-stats-intro]").textContent = i18n.t(
        "Ce que donnent " + nf(s.donnes) + " donnes jouées sur le site, " + pct(s.modes.ligne, s.donnes) + " en ligne.",
        "What " + nf(s.donnes) + " deals played on the site tell us, " + pct(s.modes.ligne, s.donnes) + " of them online.",
      );
      box.hidden = false;
    })
    .catch(function () {});
})();
