// Langue de la page (<html lang>) ; dans le Worker de l'hôte, passée par le nom du Worker
// (new Worker(url, { name: "en" })). Hors navigateur (tests), français.
//   t("Passer", "Pass")
export const EN = globalThis.document ? document.documentElement.lang === "en" : globalThis.name === "en";
export const t = (fr, en) => (EN ? en : fr);
