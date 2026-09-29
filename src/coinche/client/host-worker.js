// L'hôte de la table (host.js : bots et délais) dans un Web Worker : la
// réflexion des bots ne fige plus l'animation, et les minuteurs d'un worker
// ne sont pas ralentis comme ceux d'un onglet en arrière-plan (un hôte qui
// change d'onglet ne bloque plus la table).
// Messages reçus : { type: "update", G } ou { type: "stop" } ;
// envoyés : { seat, action, tour } à transmettre au jeu (pourSiege), tour
// étant le tour de l'état sur lequel le bot a décidé.
import { createHost } from "../host.js";

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
