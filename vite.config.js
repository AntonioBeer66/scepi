// Compile le jeu de coinche (src/coinche/client) vers site/assets/js/coinche/,
// fichiers enregistrés dans Git : le site reste un dossier statique.
//   npm run build   (VITE_COINCHE_SERVER=https://… pour le serveur en ligne)
// Phaser n'est chargé qu'au lancement d'une partie (import dynamique).
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: false,
  build: {
    outDir: "site/assets/js/coinche",
    emptyOutDir: true,
    target: "es2020", // syntaxe récente (??=, champs de classe) transpilée : téléphones anciens
    chunkSizeWarningLimit: 2000,
    manifest: "fichiers.json", // liste des morceaux, mise en cache hors ligne (site/sw.js)
    rollupOptions: {
      input: "src/coinche/client/lobby.js",
      output: {
        entryFileNames: "coinche.js",
        chunkFileNames: "[name]-[hash].js",
      },
    },
  },
});
