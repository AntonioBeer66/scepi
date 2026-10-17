// L'hôte de la table (host.js : bots et délais) dans un Web Worker : la
// réflexion des bots ne fige plus l'animation, et les minuteurs d'un worker
// ne sont pas ralentis comme ceux d'un onglet en arrière-plan (un hôte qui
// change d'onglet ne bloque plus la table).
// Messages reçus : { type: "update", G } ou { type: "stop" } ;
// envoyés : { seat, action, tour } à transmettre au jeu (pourSiege), tour
// étant le tour de l'état sur lequel le bot a décidé.
import { actOn, bots, createGame, tuning } from "../engine.js";
import { createHost } from "../host.js";

// Garde-fou des appareils extrêmes : une entame de référence (donne fixe,
// 96 mondes) chronométrée une fois au démarrage ; au-delà de 1,5 s, 48
// mondes pour toute la session. Jamais d'horloge pendant une décision : la
// même situation donne la même décision tout au long de la partie.
{
  const g = createGame([0, 1, 2, 3].map(() => ({ type: "bot" })), () => 0.5);
  actOn(g, g.joueurActif, { type: "ENCHERIR", montant: 80, atout: "H" });
  for (let i = 0; i < 3; i++) actOn(g, g.joueurActif, { type: "PASSER" });
  const t = Date.now();
  bots.chooseCard(g, g.joueurActif);
  if (Date.now() - t > 1500)
    tuning.mcSamples = tuning.bidWorlds = tuning.bidSamples = 48;
}

let tour = null;
const host = createHost({
  send: (seat, action) => postMessage({ seat, action, tour }),
});

onmessage = ({ data }) => {
  if (data.type === "update") {
    tour = data.G.tour;
    host.update(data.G);
  } else host.stop();
};
