(function () {
  const grid = document.querySelector("#lx-chess-bots");
  if (!grid) return;

  fetch("../../src/echecs/config.json")
    .then((response) => {
      // Les réponses file:///android_asset/... ont un statut 0 dans WebView
      // même lorsque le fichier local a bien été trouvé.
      if (!response.ok && response.status !== 0)
        throw new Error("Impossible de charger les profils");
      return response.json();
    })
    .then(({ profiles = [] }) => {
      grid.innerHTML = profiles
        .map(
          (profile) => `
            <article class="lx-bot-card">
              <img src="..${profile.picture}" alt="" loading="lazy" />
              <strong>${profile.name}</strong>
            </article>`,
        )
        .join("");
    })
    .catch(() => {
      grid.innerHTML =
        '<p class="lx-bot-grid-status">Les profils sont momentanément indisponibles.</p>';
    });
})();
