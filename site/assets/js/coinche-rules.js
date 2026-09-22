// Panneau « Règles » de la coinche : explication simple en français,
// indépendante du moteur de jeu. Un bouton qui déploie/replie un panneau
// ancré à côté de lui — pas un pop-up plein écran — reste accessible avant
// et pendant une partie, sans jamais faire défiler la page principale.

(function () {
  function init() {
    const btn = document.querySelector("#rules-btn");
    const panel = document.querySelector("#rules-panel");
    const closeBtn = document.querySelector("#rules-panel-close");
    if (!btn || !panel) return;

    function isOpen() {
      return !panel.hidden;
    }

    function open() {
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      document.addEventListener("keydown", onKeydown);
      document.addEventListener("click", onOutsideClick, true);
    }

    function close() {
      panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.removeEventListener("keydown", onKeydown);
      document.removeEventListener("click", onOutsideClick, true);
    }

    function onKeydown(event) {
      if (event.key === "Escape") close();
    }

    function onOutsideClick(event) {
      if (
        !panel.contains(event.target) &&
        event.target !== btn &&
        !btn.contains(event.target)
      )
        close();
    }

    btn.addEventListener("click", () => {
      if (isOpen()) close();
      else open();
    });
    if (closeBtn) closeBtn.addEventListener("click", close);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
