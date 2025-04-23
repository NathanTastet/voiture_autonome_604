// stats bundle : polling des données et affichage des stats
import { setText } from "./dash_common.js";
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';

// Historique des données
const history = {
  battery: [],
  speed: [],
  power: [],
  timestamps: []
};
let historyChart = null;
let batteryGauge = null;
let motorGauge = null;
let currentMetric = 'battery';

// Fonction d'arrondi
function roundValue(value, decimals = 1) {
  return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

// Fonction pour formater les valeurs avec leurs unités
function formatValue(value, unit) {
  return `${roundValue(value)} ${unit}`;
}

document.addEventListener("DOMContentLoaded", () => {
  // Initialiser les jauges
  initGauges();
  
  // Configurer les boutons de sélection de métrique
  document.querySelectorAll('[data-metric]').forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('[data-metric]').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentMetric = button.dataset.metric;
      showSelectedMetric(currentMetric);
    });
  });

  // Interroger dès le chargement, puis toutes les secondes
  fetchData();
  setInterval(fetchData, 1000);
});

function initGauges() {
  // Configuration commune pour les jauges
  const gaugeConfig = {
    type: 'doughnut',
    options: {
      circumference: 180,
      rotation: -90,
      cutout: '75%',
      aspectRatio: 2,
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    }
  };

  // Jauge batterie
  const batteryCtx = document.getElementById("batteryGauge").getContext("2d");
  batteryGauge = new Chart(batteryCtx, {
    ...gaugeConfig,
    data: {
      datasets: [{
        data: [0, 100],
        backgroundColor: ['#4CAF50', '#f5f5f5'],
        borderWidth: 0
      }]
    }
  });

  // Jauge moteur
  const motorCtx = document.getElementById("motorGauge").getContext("2d");
  motorGauge = new Chart(motorCtx, {
    ...gaugeConfig,
    data: {
      datasets: [{
        data: [0, 100],
        backgroundColor: ['#2196F3', '#f5f5f5'],
        borderWidth: 0
      }]
    }
  });

  // Initialiser le graphique d'historique
  initHistoryChart();
}

function initHistoryChart() {
  const ctx = document.getElementById("historyChart");
  if (!ctx) return;

  historyChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Batterie (%)",
          data: [],
          borderColor: '#4CAF50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          fill: true,
          tension: 0.4,
          hidden: false
        },
        {
          label: "Vitesse (tr/min)",
          data: [],
          borderColor: '#2196F3',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          fill: true,
          tension: 0.4,
          hidden: true
        },
        {
          label: "Puissance (W)",
          data: [],
          borderColor: '#FF9800',
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          fill: true,
          tension: 0.4,
          hidden: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        intersect: false,
        mode: 'nearest'
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'second',
            displayFormats: {
              second: 'HH:mm:ss'
            }
          },
          grid: {
            display: false
          },
          ticks: {
            maxRotation: 0
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}

function fetchData() {
  fetch("/dashboard/vehicle/data")
    .then(r => r.json())
    .then(d => {
      // Mettre à jour les champs textuels avec arrondi
      setText("battery-level", roundValue(d.battery));
      setText("battery-voltage", roundValue(d.battery_voltage));
      setText("motor-power", roundValue(d.motor_power));
      setText("motor-speed", roundValue(d.motor_speed));
      setText("energy-consumption", roundValue(d.energy));
      setText("current", roundValue(d.current));
      setText("telemetry", roundValue(d.telemetry));
      setText("distance", roundValue(d.distance));
      setText("motor-temp", roundValue(d.motor_temp));
      setText("battery-temp", roundValue(d.battery_temp));

      // Mettre à jour les jauges
      updateGauge(batteryGauge, d.battery);
      updateGauge(motorGauge, d.motor_power);

      // Mettre à jour l'historique
      updateHistory(d);
    })
    .catch(console.error);
}

function updateGauge(gauge, value) {
  const roundedValue = roundValue(value);
  gauge.data.datasets[0].data = [roundedValue, 100 - roundedValue];
  gauge.update();
}

function updateHistory(data) {
  const timestamp = new Date();
  history.timestamps.push(timestamp);
  history.battery.push(roundValue(data.battery));
  history.speed.push(roundValue(data.motor_speed));
  history.power.push(roundValue(data.motor_power));

  // Garder les 30 dernières valeurs
  if (history.timestamps.length > 30) {
    history.timestamps.shift();
    history.battery.shift();
    history.speed.shift();
    history.power.shift();
  }

  if (historyChart) {
    historyChart.data.labels = history.timestamps;
    historyChart.data.datasets[0].data = history.battery;
    historyChart.data.datasets[1].data = history.speed;
    historyChart.data.datasets[2].data = history.power;
    historyChart.update('none');
  }
}

function showSelectedMetric(metric) {
  if (!historyChart) return;

  const metrics = {
    battery: 0,
    speed: 1,
    power: 2
  };

  historyChart.data.datasets.forEach((dataset, index) => {
    dataset.hidden = index !== metrics[metric];
  });

  historyChart.update('none');
}
