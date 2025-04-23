// stats bundle : polling des données et affichage des stats
import { setText } from "./dash_common.js";

// Pour historiser les derniers niveaux de batterie
const history = [];
let historyChart = null;

document.addEventListener("DOMContentLoaded", () => {
  // interroger dès le chargement, puis toutes les secondes
  fetchData();
  setInterval(fetchData, 1000);
});

function fetchData() {
  fetch("/dashboard/vehicle/data")
    .then(r => r.json())
    .then(d => {
      // Mettre à jour les champs textuels
      setText("battery-level", d.battery);
      setText("motor-power", d.motor_power);
      setText("energy-consumption", d.energy);
      setText("telemetry", d.telemetry);
      setText("encoder", d.encoders);

      // Mettre à jour l’historique batterie
      updateBatteryHistory(d.battery);
    })
    .catch(console.error);
}

function updateBatteryHistory(value) {
  history.push(value);
  if (history.length > 20) history.shift();

  const ctx = document.getElementById("batteryHistory").getContext("2d");
  if (!historyChart) {
    // Création du chart (Chart.js doit être chargé)
    historyChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: history.map((_, i) => i + 1),
        datasets: [{
          label: "Batterie (%)",
          data: history,
          fill: false,
          tension: 0.1
        }]
      },
      options: {
        animation: false,
        responsive: true,
        scales: {
          x: { display: false },
          y: { beginAtZero: true, max: 100 }
        }
      }
    });
  } else {
    historyChart.data.labels = history.map((_, i) => i + 1);
    historyChart.data.datasets[0].data = history;
    historyChart.update();
  }
}
