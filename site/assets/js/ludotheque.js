(function () {
  const grid = document.querySelector("#lx-chess-bots");
  if (!grid) return;

  fetch("../../src/echecs/config.json")
    .then((response) => {
      if (!response.ok) throw new Error("Impossible de charger les profils");
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
