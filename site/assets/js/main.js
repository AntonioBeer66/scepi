// Ce qui est déjà à l'écran au chargement s'affiche sans fondu : mesuré
// avant d'ajouter .js (qui masque le reste), sinon la transition se joue.
// Tout devient de toute façon visible au bout de 2,5 s (vieux téléphones où
// l'observateur se déclenche mal) : jamais de bouton caché.
const revealTargets = document.querySelectorAll(".reveal, .reveal-stagger");
revealTargets.forEach((el) => {
  if (el.getBoundingClientRect().top < window.innerHeight)
    el.classList.add("is-visible");
});
document.documentElement.classList.add("js");

const toggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector("#navigation");
// Racine du site en chemin relatif, tirée du lien du logo (« ../../ » selon
// la profondeur) : juste en ligne comme en ouvrant les fichiers de site/.
// Sans « ?. » : les WebView Android d'avant Chrome 80 refuseraient tout le
// fichier, menu mobile compris.
const brandLink = document.querySelector(".brand");
const siteRoot = (
  (brandLink && brandLink.getAttribute("href")) || "/index.html"
).replace(/index\.html$/, "");

// Lien transversal vers la rubrique Actualités, y compris sur les pages
// historiques qui partagent le même script de navigation.
if (
  navigation &&
  ![...navigation.querySelectorAll("a")].some(
    (link) => link.textContent.trim().toLowerCase() === "actus",
  )
) {
  const actusLink = document.createElement("a");
  actusLink.href = `${siteRoot}actus/index.html`;
  actusLink.textContent = "Actus";
  if (window.location.pathname.includes("/actus/")) {
    actusLink.setAttribute("aria-current", "page");
  }
  navigation.insertBefore(actusLink, navigation.lastElementChild);
}

// Bouton « Appli Android » en bas de chaque page (APK compilé depuis
// android/, voir README) : proposé seulement sur Android, et masqué dans
// l'appli elle-même (WebView : « ; wv) »).
const footerSocial = document.querySelector(".footer-social");
if (
  footerSocial &&
  /Android/i.test(navigator.userAgent) &&
  !navigator.userAgent.includes("; wv)")
) {
  const app = document.createElement("a");
  app.className = "footer-app";
  app.href = `${siteRoot}assets/app/scepinvaders.apk`;
  app.setAttribute("download", "");
  app.innerHTML = '<span aria-hidden="true">↓</span> Appli Android';
  footerSocial.after(app);
}

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
// Le marquage de ce qui est déjà à l'écran se fait tout en haut, avant .js.
setTimeout(() => {
  revealTargets.forEach((el) => el.classList.add("is-visible"));
}, 2500);
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
    ".home-pillar, .home-play, .home-event, .pillar, .crew-card, .board-grid li, .asso-wei, .lx-game, .lx-steps li",
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

// Parties de coinche en cours (accueil, ludothèque), lues sur le serveur de
// jeu ; rien ne s'affiche s'il ne répond pas (fichiers ouverts en local).
const liveTables = document.querySelectorAll("[data-live-tables]");
if (liveTables.length && /^https?:$/.test(location.protocol)) {
  const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;
  fetch("/api/tables?compteur") // mis en cache quelques secondes (worker/index.js)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((tables) => {
      let games = 0;
      let players = 0;
      for (const t of tables) {
        if (t.phase !== "ATTENTE" && t.phase !== "TERMINEE") games++;
        for (const p of t.players) if (p.name && p.isConnected) players++;
      }
      const text = games
        ? `${plural(games, "partie")} de coinche en cours · ${plural(players, "joueur")} en ligne`
        : players
          ? `${plural(players, "joueur")} autour des tables : rejoins-les`
          : "Tables libres : lance la première partie";
      liveTables.forEach((el) => {
        el.textContent = text;
        el.hidden = false;
      });
    })
    .catch(() => {});
}

// Photos des événements en grand : un clic ouvre la visionneuse, flèches ou
// glisser pour passer à la suivante du même album, Échap pour fermer.
const galleryImages = document.querySelectorAll(
  "[data-carousel] img, .extra-mosaic img",
);
if (galleryImages.length && window.HTMLDialogElement) {
  const box = document.createElement("dialog");
  box.className = "lightbox";
  box.setAttribute("aria-label", "Photo en grand");
  box.innerHTML =
    "<figure><figcaption></figcaption></figure>" +
    '<button type="button" class="lightbox-prev" aria-label="Photo précédente">‹</button>' +
    '<button type="button" class="lightbox-next" aria-label="Photo suivante">›</button>' +
    '<button type="button" class="lightbox-close" aria-label="Fermer">✕</button>';
  document.body.append(box);
  const caption = box.querySelector("figcaption");
  const big = new Image(); // source posée à l'ouverture
  caption.before(big);
  let album = [];
  let index = 0;
  const show = (i) => {
    index = (i + album.length) % album.length;
    big.src = album[index].currentSrc || album[index].src;
    big.alt = album[index].alt;
    caption.textContent = `${album[index].alt} · ${index + 1}/${album.length}`;
    box.classList.toggle("is-single", album.length < 2);
  };
  galleryImages.forEach((img) => {
    img.classList.add("is-zoomable");
    // Ouvrable au clavier aussi ; un carrousel n'a qu'un arrêt de tabulation
    // (ses photos sont empilées), qui ouvre la photo affichée.
    const carousel = img.closest("[data-carousel]");
    img.tabIndex = !carousel || img === carousel.querySelector("img") ? 0 : -1;
    img.setAttribute("role", "button");
    img.addEventListener("click", () => {
      album = [...img.parentElement.querySelectorAll("img")];
      show(album.indexOf(img));
      box.showModal();
    });
    img.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      ((carousel && carousel.querySelector("img.is-active")) || img).click();
    });
  });
  box.querySelector(".lightbox-prev").addEventListener("click", () => show(index - 1));
  box.querySelector(".lightbox-next").addEventListener("click", () => show(index + 1));
  box.querySelector(".lightbox-close").addEventListener("click", () => box.close());
  // Clic sur le fond (hors photo et boutons) : fermer.
  box.addEventListener("click", (e) => {
    if (e.target === box) box.close();
  });
  box.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(index - 1);
    else if (e.key === "ArrowRight") show(index + 1);
  });
  // Glisser : la photo suit le doigt, puis part du côté du geste (assez loin
  // ou assez vif) ou revient au centre. Au bout de l'album, elle résiste.
  let swipe = null;
  const ease = "transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s";
  box.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return (swipe = null);
      const { clientX } = e.touches[0];
      swipe = { x0: clientX, x: clientX, t: performance.now(), v: 0 };
      big.style.transition = "none";
    },
    { passive: true },
  );
  box.addEventListener(
    "touchmove",
    (e) => {
      if (!swipe) return;
      const x = e.touches[0].clientX;
      const now = performance.now();
      swipe.v = (x - swipe.x) / Math.max(now - swipe.t, 1);
      Object.assign(swipe, { x, t: now });
      let dx = x - swipe.x0;
      if (album.length < 2) dx = (dx * 0.55 * 300) / (300 + 0.55 * Math.abs(dx));
      big.style.transform = `translateX(${dx}px)`;
    },
    { passive: true },
  );
  box.addEventListener("touchend", () => {
    if (!swipe) return;
    const dx = swipe.x - swipe.x0;
    const v = performance.now() - swipe.t < 80 ? swipe.v : 0;
    swipe = null;
    big.style.transition = ease;
    const dir = Math.abs(dx) > innerWidth * 0.25 || (Math.abs(dx) > 10 && Math.abs(v) > 0.5) ?Math.sign(v || dx) : 0;
    if (!dir || album.length < 2 || Math.sign(dx) !== dir) {
      big.style.transform = "";
      return;
    }
    // Sort du côté du geste, la suivante entre par l'autre.
    big.style.transform = `translateX(${dir * innerWidth}px)`;
    big.style.opacity = "0";
    setTimeout(() => {
      show(index - dir);
      big.style.transition = "none";
      big.style.transform = `translateX(${-dir * innerWidth * 0.3}px)`;
      big.getBoundingClientRect(); // repart de là
      big.style.transition = ease;
      big.style.transform = "";
      big.style.opacity = "";
    }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200);
  });
  box.addEventListener("close", () => {
    big.style.transition = "none";
    big.style.transform = big.style.opacity = "";
  });
}

// Bouton « Copier » (adresse e-mail de la page Contact).
for (const btn of document.querySelectorAll("[data-copy]")) {
  btn.setAttribute("aria-live", "polite");
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

// Hors ligne : la coinche contre l'ordinateur et les pages déjà vues (sw.js).
// En ouvrant les fichiers de site/ directement, l'inscription échoue sans gêne.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
