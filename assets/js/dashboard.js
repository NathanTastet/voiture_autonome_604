// assets/js/dashboard.js

// Fonction qui vérifie la connexion et met à jour l'affichage (pour connect.html et graphs.html)
function checkConnection() {
    fetch(window.location.origin + "/dashboard/vehicle/ping")
      .then(response => response.json())
      .then(data => {
        // Pour la page de connexion
        const pingValueEl = document.getElementById("ping-value");
        if (pingValueEl) {
          pingValueEl.textContent = data.ping ? data.ping : "--";
        }
        const connectionStatusEl = document.getElementById("connection-status");
        if (connectionStatusEl) {
          connectionStatusEl.textContent = data.connected ? "Statut de la connexion : Connecté" : "Statut de la connexion : Moyen";
        }
        // Pour la carte flottante sur graphs.html
        const floatingPingEl = document.getElementById("floating-ping");
        const vehicleIpInfoEl = document.getElementById("vehicle-ip-info");
        const connectionModeEl = document.getElementById("connection-mode");
        if (floatingPingEl && vehicleIpInfoEl && connectionModeEl) {
          floatingPingEl.textContent = data.ping ? data.ping : "--";
          vehicleIpInfoEl.textContent = data.ip;
          connectionModeEl.textContent = data.connected ? "Connecté" : "Moyen";
        }
      })
      .catch(error => console.error("Erreur de ping:", error));
  }
  setInterval(checkConnection, 3000);
  checkConnection();
  
  // Gestion du formulaire de modification de l'IP (accessible sur la page connect.html)
  document.addEventListener("DOMContentLoaded", function() {
    const ipForm = document.getElementById("ip-form");
    if (ipForm) {
      ipForm.addEventListener("submit", function(e) {
        e.preventDefault();
        let newIP = document.getElementById("vehicle-ip").value;
        fetch(window.location.origin + "/dashboard/vehicle/ip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: newIP })
        })
          .then(response => response.json())
          .then(data => {
            if (data.status === "success") {
              alert("Adresse IP mise à jour : " + data.new_ip);
            } else {
              alert("Erreur : " + data.message);
            }
          })
          .catch(error => console.error("Erreur lors de la mise à jour de l'IP :", error));
      });
    }
  
    // Gestion du bouton "Retrouver IP"
    const retrieveIpBtn = document.getElementById("retrieve-ip-btn");
    if (retrieveIpBtn) {
      retrieveIpBtn.addEventListener("click", function() {
        fetch(window.location.origin + "/dashboard/vehicle/retrieve_ip")
          .then(response => response.json())
          .then(data => {
            if (data.status === "success") {
              document.getElementById("vehicle-ip").value = data.ip;
              alert("Adresse IP retrouvée : " + data.ip);
            } else {
              alert("Erreur lors de la récupération de l'IP");
            }
          })
          .catch(error => console.error("Erreur lors de la récupération de l'IP :", error));
      });
    }
  
    // Gestion des boutons de redirection sur la page de connexion
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
  
    // Gestion du bouton Start/Stop sur graphs.html
    const startStopBtn = document.getElementById("start-stop-btn");
    let vehicleRunning = false;
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
    function updateStartStopButton() {
      if (vehicleRunning) {
        startStopBtn.innerHTML = '<i class="bi bi-stop-fill"></i> Arrêter';
        startStopBtn.classList.remove('btn-primary');
        startStopBtn.classList.add('btn-danger');
      } else {
        startStopBtn.innerHTML = '<i class="bi bi-play-fill"></i> Démarrer';
        startStopBtn.classList.remove('btn-danger');
        startStopBtn.classList.add('btn-primary');
      }
    }
  
    // Simulation : injection de données statiques pour le tracé et les statistiques
    function simulateData() {
      // Simulation pour le graphique de trajectoire
      const simulatedCoord = { x: Math.random() * 100, y: Math.random() * 100 };
      if (window.vehicleTrackChart && window.vehicleTrackChart.data) {
        window.vehicleTrackChart.data.datasets[0].data.push(simulatedCoord);
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
        const speedCounterEl = document.getElementById("speed-counter");
        if(speedCounterEl) speedCounterEl.textContent = simSpeed + " km/h";
      }
      if(telemetryEl) telemetryEl.textContent = Math.floor(Math.random() * 200);
      if(encoderEl) encoderEl.textContent = Math.floor(Math.random() * 3000);
    }
    // Appel de simulation toutes les 4 secondes
    setInterval(simulateData, 4000);
  });
  