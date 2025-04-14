// assets/js/dashboard.js

require("chart.js");

function checkConnection() {
  fetch(window.location.origin + "/dashboard/vehicle/ping")
    .then(response => response.json())
    .then(data => {
      const pingValueEl = document.getElementById("ping-value");
      const indicator = document.getElementById("ping-indicator");
      const label = document.getElementById("connection-label");
      const connectBtn = document.getElementById("connect-btn");

      const ping = data.ping;

      if (pingValueEl) pingValueEl.textContent = ping !== null ? ping : "--";

      if (label && indicator) {
        if (!data.connected || ping === null) {
          label.textContent = "Aucune connexion détectée";
          label.className = "text-danger fw-bold";
          indicator.className = "status-indicator bg-danger";
        } else if (ping < 50) {
          label.textContent = "Connexion excellente";
          label.className = "text-success fw-bold";
          indicator.className = "status-indicator bg-success";
        } else if (ping < 150) {
          label.textContent = "Connexion moyenne";
          label.className = "text-warning fw-bold";
          indicator.className = "status-indicator bg-warning";
        } else {
          label.textContent = "Connexion faible";
          label.className = "text-danger fw-bold";
          indicator.className = "status-indicator bg-danger";
        }
      }

      if (connectBtn) {
        connectBtn.disabled = (!data.connected || ping === null || ping >= 150);
      }

      // Update floating info card if present
      const floatingPingEl = document.getElementById("floating-ping");
      const floatingMode = document.getElementById("connection-mode");
      const floatingIp = document.getElementById("vehicle-ip-info");
      if (floatingPingEl) floatingPingEl.textContent = ping !== null ? ping : "--";
      if (floatingIp) floatingIp.textContent = data.ip;
      if (floatingMode) floatingMode.textContent = data.connected ? "Connecté" : "Déconnecté";
    })
    .catch(error => console.error("Erreur de ping:", error));
}
setInterval(checkConnection, 3000);
checkConnection();

document.addEventListener("DOMContentLoaded", function() {
  
  // Boutons de redirection sur la page de connexion
  const connectBtn = document.getElementById("connect-btn");
  const simulateBtn = document.getElementById("simulate-btn");
  if (connectBtn) {
    connectBtn.addEventListener("click", function(){
      window.location.href = window.location.origin + "/dashboard/graphs";
    });
  }
  if (simulateBtn) {
    simulateBtn.addEventListener("click", function(){
      window.location.href = window.location.origin + "/dashboard/graphs";
    });
  }
  
  // Gestion du bouton Start/Stop sur la page de supervision
  const startStopBtn = document.getElementById("start-stop-btn");
  const startStopFloatingBtn = document.getElementById("start-stop-floating-btn");
  let vehicleRunning = false;
  
  function updateStartStopButton() {
    if (vehicleRunning) {
      if(startStopBtn) {
        startStopBtn.innerHTML = '<i class="bi bi-stop-fill"></i> Arrêter';
        startStopBtn.classList.remove('btn-primary');
        startStopBtn.classList.add('btn-danger');
      }
      if(startStopFloatingBtn) {
        startStopFloatingBtn.innerHTML = '<i class="bi bi-stop-fill"></i>';
        startStopFloatingBtn.classList.remove('btn-primary');
        startStopFloatingBtn.classList.add('btn-danger');
      }
    } else {
      if(startStopBtn) {
        startStopBtn.innerHTML = '<i class="bi bi-play-fill"></i> Démarrer';
        startStopBtn.classList.remove('btn-danger');
        startStopBtn.classList.add('btn-primary');
      }
      if(startStopFloatingBtn) {
        startStopFloatingBtn.innerHTML = '<i class="bi bi-play-fill"></i>';
        startStopFloatingBtn.classList.remove('btn-danger');
        startStopFloatingBtn.classList.add('btn-primary');
      }
    }
  }
  
  if (startStopBtn) {
    startStopBtn.addEventListener("click", function() {
      vehicleRunning = !vehicleRunning;
      updateStartStopButton();
      fetch(window.location.origin + "/dashboard/vehicle/control", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ start: vehicleRunning })
      })
      .then(response => response.json())
      .then(data => console.log("Commande envoyée:", data))
      .catch(error => console.error("Erreur sur commande:", error));
    });
  }
  
  if (startStopFloatingBtn) {
    startStopFloatingBtn.addEventListener("click", function() {
      vehicleRunning = !vehicleRunning;
      updateStartStopButton();
      fetch(window.location.origin + "/dashboard/vehicle/control", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ start: vehicleRunning })
      })
      .then(response => response.json())
      .then(data => console.log("Commande envoyée:", data))
      .catch(error => console.error("Erreur sur commande:", error));
    });
  }
  
  // Simulation : injection de données statiques pour graphiques et statistiques
  function simulateData() {
    // Simulation pour le graphique de trajectoire
    const simulatedCoord = { x: Math.random() * 100, y: Math.random() * 100 };
    if (window.vehicleTrackChart && window.vehicleTrackChart.data) {
      window.vehicleTrackChart.data.labels.push("");
      window.vehicleTrackChart.data.datasets[0].data.push(simulatedCoord.y);
      window.vehicleTrackChart.update();
    }
    // Simulation pour les autres statistiques
    const batteryEl = document.getElementById('battery-level');
    const speedEl = document.getElementById('current-speed');
    const telemetryEl = document.getElementById('telemetry');
    const encoderEl = document.getElementById('encoder');
    if(batteryEl) batteryEl.textContent = Math.floor(Math.random() * 100);
    if(speedEl) {
      let simSpeed = Math.floor(Math.random() * 150);
      speedEl.textContent = simSpeed;
    }
    if(telemetryEl) telemetryEl.textContent = Math.floor(Math.random() * 200);
    if(encoderEl) encoderEl.textContent = Math.floor(Math.random() * 3000);
    
    // Simulation pour la carte Navigation / Perception
    const vehicleDirectionEl = document.getElementById('vehicle-direction');
    if(vehicleDirectionEl) vehicleDirectionEl.textContent = (Math.random() * 360).toFixed(0) + "°";
    const distanceTraveledEl = document.getElementById('distance-traveled');
    if(distanceTraveledEl) distanceTraveledEl.textContent = (Math.random() * 1000).toFixed(1);
    const lastGpsEl = document.getElementById('last-gps');
    if(lastGpsEl) lastGpsEl.textContent = "Lat: " + (Math.random()*180-90).toFixed(5) + ", Lon: " + (Math.random()*360-180).toFixed(5);
    
    // Simulation d'alertes dans la carte État du Véhicule
    const alertsLog = document.getElementById("alerts-log");
    if(alertsLog) {
      if(Math.random() < 0.1) { // 10% de chance
        const li = document.createElement("li");
        li.textContent = new Date().toLocaleTimeString() + " - Alerte: Capteur défaillant.";
        alertsLog.appendChild(li);
      }
    }
    
    // Simulation du journal d'activité dans la carte Contrôle & Actions
    const activityLog = document.getElementById("activity-log");
    if(activityLog) {
      if(Math.random() < 0.1) { // 10% de chance
        const p = document.createElement("p");
        p.textContent = new Date().toLocaleTimeString() + " - Action effectuée.";
        activityLog.appendChild(p);
      }
    }
  }
  setInterval(simulateData, 4000);
});
