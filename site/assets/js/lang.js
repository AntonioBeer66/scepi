// Langue du site : français par défaut, /en/ pour l'anglais. À la première visite,
// un téléphone (ou navigateur) dont la langue n'est pas le français est envoyé sur
// la version anglaise ; le bouton FR/EN de l'en-tête mémorise ensuite le choix.
// Chargé sans defer dans le <head> de chaque page, pour rediriger avant l'affichage.
(function () {
  var p = location.pathname;
  var en = p === "/en" || p.indexOf("/en/") === 0;
  var saved = "";
  try {
    saved = localStorage.getItem("scepi-lang") || "";
  } catch (e) {}
  var lang = (navigator.language || "fr").toLowerCase();
  var robot = /bot|crawl|spider|slurp|lighthouse/i.test(navigator.userAgent);
  // nouveau.html (publier une actu) n'existe qu'en français.
  if (!en && !saved && !robot && lang.indexOf("fr") !== 0 && p.indexOf("/actus/nouveau") !== 0) {
    location.replace("/en" + p + location.search + location.hash);
    return;
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-lang]");
    if (!a) return;
    try {
      localStorage.setItem("scepi-lang", a.getAttribute("data-lang"));
    } catch (err) {}
  });
  // Pour les scripts classiques : i18n.t("français", "english").
  window.i18n = {
    en: document.documentElement.lang === "en",
    t: function (fr, en) {
      return this.en ? en : fr;
    },
  };
})();
