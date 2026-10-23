// « La coinche en chiffres » (page coinche) : totaux du journal anonyme des
// donnes, servis par /api/stats (worker/journal.js). Bloc laissé caché tant
// qu'il y a trop peu de donnes pour que les pourcentages veuillent dire
// quelque chose, ou si le serveur ne répond pas.
// Sans « ?. » ni « ?? » : vieilles WebView Android (voir main.js).
(function () {
  var box = document.getElementById("coinche-stats");
  if (!box || !window.fetch) return;
  var MIN_DONNES = 50;
  var SUITS = { H: "Cœur", D: "Carreau", C: "Trèfle", S: "Pique" };
  var PALIERS = { 80: "80-90", 100: "100-110", 120: "120-130", 140: "140-160", capot: "Capot", generale: "Générale" };
  var nf = function (n) {
    return Number(n).toLocaleString("fr-FR");
  };
  var pct = function (a, b) {
    return b ? Math.round((100 * a) / b) + "\u00a0%" : "—";
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
        [nf(s.donnes), "donnes jouées"],
        [pct(s.reussies, s.jouees), "des contrats réussis"],
        [pct(s.passees, s.donnes), "des donnes passées (quatre passes)"],
        [pct(s.coinchees, s.jouees), "des contrats coinchés"],
        [pct(s.coinchesGagnantes, s.coinchees), "des coinches gagnantes"],
        [SUITS[atout], "l’atout le plus pris (" + pct(s.atouts[atout], s.jouees) + ")"],
        [
          PALIERS[palier],
          "les annonces les plus courantes, réussies à " + pct(s.paliers[palier].reussies, s.paliers[palier].n),
        ],
      ];
      box.querySelector("[data-stats-grid]").innerHTML = items
        .map(function (i) {
          return "<div><dt>" + i[1] + "</dt><dd>" + i[0] + "</dd></div>";
        })
        .join("");
      box.querySelector("[data-stats-intro]").textContent =
        "Ce que donnent " + nf(s.donnes) + " donnes jouées sur le site, " + pct(s.modes.ligne, s.donnes) + " en ligne.";
      box.hidden = false;
    })
    .catch(function () {});
})();
