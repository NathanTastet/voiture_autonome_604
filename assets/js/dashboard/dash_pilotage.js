// pilotage bundle : ping & contrôle
import { startPingLoop, setupStartStopControl } from "./dash_common.js";

document.addEventListener("DOMContentLoaded", () => {
  // Lance la boucle de ping (mise à jour connexion)
  startPingLoop();
  // Configure les boutons Démarrer/Arrêter
  setupStartStopControl();
});
