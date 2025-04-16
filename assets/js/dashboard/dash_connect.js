// dash_connect.js
import { startPingLoop, checkConnection } from "./dash_common";

document.addEventListener("DOMContentLoaded", () => {
  // 1️⃣ Mise à jour immédiate
  checkConnection();
  // 2️⃣ Boucle ping
  startPingLoop();

  // Redirections
  document.getElementById("connect-btn")?.addEventListener("click", () => window.location.href = "/dashboard/graphs");
  document.getElementById("simulate-btn")?.addEventListener("click", () => window.location.href = "/dashboard/graphs");
});
