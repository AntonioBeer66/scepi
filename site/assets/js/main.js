document.documentElement.classList.add("js");

const toggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#navigation");

function closeMenu(returnFocus = false) {
  navigation.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
  if (returnFocus) toggle.focus();
}

toggle.addEventListener("click", () => {
  const open = toggle.getAttribute("aria-expanded") !== "true";
  toggle.setAttribute("aria-expanded", String(open));
  navigation.classList.toggle("is-open", open);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true")
    closeMenu(true);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".header")) closeMenu();
});

matchMedia("(min-width: 761px)").addEventListener("change", () => closeMenu());

// Révélation au scroll : les sections apparaissent en douceur à leur entrée
// dans le champ de vision plutôt que d'être toutes visibles d'un bloc au
// chargement. Le CSS ne cache ces éléments (opacity:0) que sous .js — sans
// JavaScript ou sans IntersectionObserver, tout reste visible d'emblée.
const revealTargets = document.querySelectorAll(".reveal, .reveal-stagger");
if (revealTargets.length && "IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );
  revealTargets.forEach((el) => revealObserver.observe(el));
}

// Cartes « projecteur » : un halo suit le pointeur (voir .spot dans le CSS).
// Souris seulement ; sur écran tactile, rien ne change.
if (matchMedia("(hover: hover)").matches) {
  const cards = document.querySelectorAll(
    ".home-pillar, .home-game, .home-event, .pillar, .crew-card, .board-grid li, .asso-wei, .ev-stats div, .lx-game, .lx-steps li, .ct-door, .ct-grid article, .ct-net",
  );
  for (const card of cards) {
    card.classList.add("spot");
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  }
}

// Bouton « Copier » (adresse e-mail de la page Contact).
for (const btn of document.querySelectorAll("[data-copy]")) {
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = "Copié !";
      btn.classList.add("is-done");
    } catch {
      btn.textContent = "Sélectionnez l’adresse";
    }
    setTimeout(() => {
      btn.textContent = "Copier";
      btn.classList.remove("is-done");
    }, 2000);
  });
}
