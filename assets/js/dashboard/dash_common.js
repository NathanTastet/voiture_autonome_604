// dash_common.js
export function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

export function checkConnection() {
  fetch("/dashboard/vehicle/ping")
    .then(r => r.json())
    .then(d => {
      // Valeur brute
      setText("ping-value", d.ping != null ? d.ping : "--");

      // Label & couleur
      const label = document.getElementById("connection-label");
      const indicator = document.getElementById("ping-indicator");
      if (d.connected && d.ping != null) {
        let txt, dotClass, labelClass;
        if (d.ping < 50) {
          txt = "Connexion excellente";
          dotClass = "status-indicator bg-success";
          labelClass = "text-success fw-bold";
        } else if (d.ping < 150) {
          txt = "Connexion moyenne";
          dotClass = "status-indicator bg-warning";
          labelClass = "text-warning fw-bold";
        } else {
          txt = "Connexion faible";
          dotClass = "status-indicator bg-danger";
          labelClass = "text-danger fw-bold";
        }
        label.textContent = txt;
        indicator.className = dotClass;
        label.className = labelClass;
      } else {
        label.textContent = "Aucune connexion détectée";
        indicator.className = "status-indicator bg-secondary";
        label.className = "text-danger fw-bold";
      }

      // info flottante
      setText("floating-ping", d.ping != null ? d.ping : "--");
      setText("vehicle-ip-info", d.ip);
      setText("connection-mode", d.connected ? "Connecté" : "Déconnecté");

      // bouton “Se connecter”
      const btn = document.getElementById("connect-btn");
      if (btn) btn.disabled = !d.connected;
    })
    .catch(err => console.error("Erreur de ping :", err));
}

export function startPingLoop() {
  checkConnection();
  return setInterval(checkConnection, 3000);
}

/**
 * Configuration des boutons Démarrer/Arrêter
 */
export function setupStartStopControl() {
  const btnMain  = document.getElementById("start-stop-btn");
  const btnFloat = document.getElementById("start-stop-floating-btn");
  let running = false;

  function updateButtons() {
    const label = running ? "Arrêter" : "Démarrer";
    const icon  = running ? "stop-fill" : "play-fill";
    if (btnMain) {
      btnMain.innerHTML = `<i class="bi bi-${icon}"></i> ${label}`;
      btnMain.classList.toggle("btn-danger", running);
      btnMain.classList.toggle("btn-primary", !running);
    }
    if (btnFloat) {
      btnFloat.innerHTML = `<i class="bi bi-${icon}"></i>`;
      btnFloat.classList.toggle("btn-danger", running);
      btnFloat.classList.toggle("btn-primary", !running);
    }
  }

  function toggleVehicle() {
    running = !running;
    updateButtons();
    fetch("/dashboard/vehicle/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: running })
    })
    .then(r => r.json())
    .then(console.log)
    .catch(console.error);
  }

  if (btnMain)  btnMain.addEventListener("click", toggleVehicle);
  if (btnFloat) btnFloat.addEventListener("click", toggleVehicle);

  updateButtons();
}

// beacon de déconnexion
window.addEventListener("beforeunload", () =>
  navigator.sendBeacon("/dashboard/log-disconnect")
);
