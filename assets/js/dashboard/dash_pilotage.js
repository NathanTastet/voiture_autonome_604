// Pilotage bundle : gestion de la manette, clavier et simulation
import { startPingLoop, setupStartStopControl } from "./dash_common.js";

// État global
let gamepadIndex = null;
let isManualMode = false;
let cameraStream = null;
let controlType = "manette"; // "manette" ou "clavier"
let keysPressed = new Set();
let simulationInterval = null;
let isRunning = false;

// --- SIMULATION 3D (Three.js) ---
let three = window.THREE;
let simuScene, simuCamera, simuRenderer, carMesh, steeringWheelMesh;
let simuAnimating = false;
let currentSteering = 0;
let currentThrottle = 0;
let currentBrake = 0;
let obstacles = [];
let groundMesh = null;

// Configuration de la caméra
function setupCamera() {
  const cameraElement = document.getElementById("cameraStream");
  if (!cameraElement) return;
  // On ne configure la caméra QUE si on n'est PAS en simulation
  const modeSelector = document.getElementById("mode-selector");
  if (modeSelector && modeSelector.value === "simu") {
    cameraElement.src = "";
    cameraElement.classList.add("d-none");
    cameraElement.onerror = null;
    return;
  }
  // Mode manuel : on configure le flux vidéo
  cameraElement.classList.remove("d-none");
  cameraElement.src = "/dashboard/vehicle/camera/stream";
  cameraElement.onerror = () => {
    console.error("Erreur de connexion à la caméra");
    cameraElement.src = "";
  };
}

// Mise à jour du statut de connexion
function updateConnectionStatus(connected) {
  const statusElement = document.getElementById("connection-status");
  if (!statusElement) return;

  if (connected) {
    statusElement.className = "badge bg-success";
    statusElement.innerHTML = '<i class="bi bi-circle-fill me-1"></i>Connecté';
  } else {
    statusElement.className = "badge bg-danger";
    statusElement.innerHTML = '<i class="bi bi-circle-fill me-1"></i>Déconnecté';
  }
}

// --- INPUTS CLAVIER & MANETTE FUSIONNÉS ---
function setupKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (isRunning) {
      keysPressed.add(e.key.toLowerCase());
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    keysPressed.delete(e.key.toLowerCase());
    e.preventDefault();
  });
}

function setupGamepad() {
  window.addEventListener("gamepadconnected", (e) => {
    gamepadIndex = e.gamepad.index;
    const statusElement = document.getElementById("gamepad-status");
    if (statusElement) {
      statusElement.textContent = "Manette connectée";
      statusElement.className = "text-success";
    }
  });
  window.addEventListener("gamepaddisconnected", () => {
    gamepadIndex = null;
    const statusElement = document.getElementById("gamepad-status");
    if (statusElement) {
      statusElement.textContent = "Aucune manette";
      statusElement.className = "text-danger";
    }
  });
}

function readInputs() {
  if (!isRunning || !isManualMode) {
    requestAnimationFrame(readInputs);
    return;
  }
  // Valeurs par défaut
  let throttle = 0, brake = 0, steering = 0;
  // Clavier
  if (keysPressed.has("z") || keysPressed.has("w")) throttle = 1;
  if (keysPressed.has("s")) brake = 1;
  if (keysPressed.has("q") || keysPressed.has("a")) steering = -1;
  if (keysPressed.has("d")) steering = 1;
  // Manette (prioritaire si appuyée)
  if (gamepadIndex !== null) {
    const gamepad = navigator.getGamepads()[gamepadIndex];
    if (gamepad) {
      // Si une entrée manette est active, elle prend le dessus
      if (gamepad.buttons[7].value > 0.05) throttle = gamepad.buttons[7].value;
      if (gamepad.buttons[6].value > 0.05) brake = gamepad.buttons[6].value;
      if (Math.abs(gamepad.axes[0]) > 0.1) steering = gamepad.axes[0];
    }
  }
  sendControlCommand({ throttle, brake, steering });
  updateControlDisplay(throttle, brake, steering);
  requestAnimationFrame(readInputs);
}

// Simulation du pilotage
function startSimulation() {
  if (simulationInterval) clearInterval(simulationInterval);
  
  simulationInterval = setInterval(() => {
    if (!isRunning || !isManualMode) return;

    // Simuler des données de télémétrie
    const telemetry = Math.floor(Math.random() * 200) + 10; // 10-210 cm
    const speed = Math.floor(Math.random() * 30); // 0-30 km/h
    const battery = Math.max(0, Math.random() * 100); // 0-100%

    // Mise à jour de l'interface
    document.getElementById("sim-speed").textContent = `${speed} km/h`;
    document.getElementById("sim-telemetry").textContent = `${telemetry} cm`;
    document.getElementById("sim-battery").textContent = `${Math.floor(battery)}%`;
    
    // Mise à jour de la jauge de batterie
    const batteryGauge = document.getElementById("battery-gauge");
    if (batteryGauge) {
      batteryGauge.style.width = `${battery}%`;
      batteryGauge.className = `progress-bar ${battery < 20 ? 'bg-danger' : battery < 50 ? 'bg-warning' : 'bg-success'}`;
    }
  }, 1000);
}

// Envoi des commandes au serveur
function sendControlCommand(controls) {
  fetch("/dashboard/vehicle/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(controls)
  })
  .then(response => response.json())
  .then(data => {
    if (data.status === "error") {
      console.error("Erreur d'envoi des commandes:", data.message);
      updateConnectionStatus(false);
    } else {
      updateConnectionStatus(true);
    }
  })
  .catch(error => {
    console.error("Erreur de communication:", error);
    updateConnectionStatus(false);
  });
}

// Mise à jour de l'affichage des contrôles
function updateControlDisplay(throttle, brake, steering) {
  currentThrottle = throttle;
  currentBrake = brake;
  currentSteering = steering;
  // Jauges
  const throttleGauge = document.getElementById("throttle-gauge");
  const brakeGauge = document.getElementById("brake-gauge");
  const steeringValue = document.getElementById("steering-value");
  const throttleValue = document.getElementById("throttle-value");
  const brakeValue = document.getElementById("brake-value");
  if (throttleGauge) throttleGauge.style.width = `${throttle * 100}%`;
  if (brakeGauge) brakeGauge.style.width = `${brake * 100}%`;
  const steeringDegrees = Math.round(steering * 90);
  if (steeringValue) {
    steeringValue.textContent = `${steeringDegrees}°`;
    steeringValue.className = `h4 mb-0 ${steeringDegrees !== 0 ? 'text-primary' : ''}`;
  }
  if (throttleValue) throttleValue.textContent = `${Math.round(throttle * 100)}%`;
  if (brakeValue) brakeValue.textContent = `${Math.round(brake * 100)}%`;
  // Feedback volant visuel
  updateSteeringVisual(steering);
}

// --- SIMULATION 3D (Three.js) ---
function createRaceTrack() {
  // Sol avec relief façon Happy Wheels (sinus/carré)
  const width = 30, length = 80;
  const segments = 80;
  const geometry = new three.PlaneGeometry(width, length, 10, segments);
  // Ajout de bosses et de trous
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const y = geometry.attributes.position.getY(i);
    const x = geometry.attributes.position.getX(i);
    // Relief sinusoïdal + quelques trous/bosses
    let z = Math.sin(y * 0.4) * 0.7 + Math.sin(x * 0.7) * 0.2;
    if (y > 10 && y < 15 && Math.abs(x) < 5) z -= 1.2; // trou
    if (y > 30 && y < 35 && Math.abs(x) < 3) z += 1.5; // bosse
    if (y > 50 && y < 55 && Math.abs(x) < 4) z -= 0.8; // creux
    geometry.attributes.position.setZ(i, z);
  }
  geometry.computeVertexNormals();
  const material = new three.MeshPhongMaterial({ color: 0x3a9c3a, flatShading: true });
  const mesh = new three.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.z = length / 2 - 10;
  mesh.receiveShadow = true;
  return mesh;
}

function addObstacles(scene) {
  obstacles = [];
  // Quelques obstacles fixes (cubes, cylindres, murs)
  const obsData = [
    { type: 'cube', x: -3, z: 18, size: 2, color: 0xff4444 },
    { type: 'cube', x: 4, z: 28, size: 1.5, color: 0x4444ff },
    { type: 'wall', x: 0, z: 40, w: 8, h: 1, color: 0x888888 },
    { type: 'cyl', x: -6, z: 55, r: 1, h: 2, color: 0xffcc00 },
    { type: 'cube', x: 5, z: 65, size: 2, color: 0x00cccc },
  ];
  for (const o of obsData) {
    let mesh;
    if (o.type === 'cube') {
      mesh = new three.Mesh(
        new three.BoxGeometry(o.size, o.size, o.size),
        new three.MeshPhongMaterial({ color: o.color })
      );
      mesh.position.set(o.x, o.size / 2, o.z);
    } else if (o.type === 'wall') {
      mesh = new three.Mesh(
        new three.BoxGeometry(o.w, o.h, 0.5),
        new three.MeshPhongMaterial({ color: o.color })
      );
      mesh.position.set(o.x, o.h / 2, o.z);
    } else if (o.type === 'cyl') {
      mesh = new three.Mesh(
        new three.CylinderGeometry(o.r, o.r, o.h, 24),
        new three.MeshPhongMaterial({ color: o.color })
      );
      mesh.position.set(o.x, o.h / 2, o.z);
    }
    mesh.castShadow = true;
    scene.add(mesh);
    obstacles.push(mesh);
  }
}

function initSimu3D() {
  const canvas = document.getElementById("simu-canvas");
  if (!canvas || !three) return;

  // Taille du canvas
  const width = canvas.parentElement.offsetWidth;
  const height = canvas.parentElement.offsetHeight;
  canvas.width = width;
  canvas.height = height;

  // Renderer
  simuRenderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true });
  simuRenderer.setSize(width, height, false);
  simuRenderer.setClearColor(0x222222, 1);

  // Scène
  simuScene = new three.Scene();

  // Caméra
  simuCamera = new three.PerspectiveCamera(60, width / height, 0.1, 1000);
  simuCamera.position.set(0, 5, 12);
  simuCamera.lookAt(0, 0, 0);

  // Lumière
  const light = new three.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 7);
  simuScene.add(light);
  simuScene.add(new three.AmbientLight(0xffffff, 0.5));

  // Terrain de course
  groundMesh = createRaceTrack();
  simuScene.add(groundMesh);

  // Obstacles
  addObstacles(simuScene);

  // Voiture (simple bloc)
  const carBody = new three.Mesh(
    new three.BoxGeometry(2, 0.6, 4),
    new three.MeshPhongMaterial({ color: 0x4b8cff })
  );
  carBody.position.y = 0.8;
  carBody.position.z = 0;
  simuScene.add(carBody);
  carMesh = carBody;

  // Volant (cercle)
  const steeringGeom = new three.TorusGeometry(0.4, 0.08, 16, 100);
  const steeringMat = new three.MeshPhongMaterial({ color: 0x222222 });
  steeringWheelMesh = new three.Mesh(steeringGeom, steeringMat);
  steeringWheelMesh.position.set(0, 1.3, 1.2);
  steeringWheelMesh.rotation.x = Math.PI / 2;
  simuScene.add(steeringWheelMesh);

  // Animation
  simuAnimating = true;
  animateSimu3D();
}

function animateSimu3D() {
  if (!simuAnimating) return;
  // Animation du volant
  steeringWheelMesh.rotation.z = -currentSteering * 1.2;
  // Animation de la voiture (avance/recul)
  let dz = (currentThrottle - currentBrake) * 0.2;
  let dx = Math.sin(-currentSteering * 0.5) * dz;
  carMesh.position.z += dz * Math.cos(carMesh.rotation.y);
  carMesh.position.x += dz * Math.sin(carMesh.rotation.y);
  // Tourner la voiture
  carMesh.rotation.y += -currentSteering * 0.04;
  // Caméra suit la voiture
  simuCamera.position.x = carMesh.position.x;
  simuCamera.position.z = carMesh.position.z + 12;
  simuCamera.lookAt(carMesh.position.x, carMesh.position.y, carMesh.position.z);
  simuRenderer.render(simuScene, simuCamera);
  requestAnimationFrame(animateSimu3D);
}

function showSimu3D(show) {
  const canvas = document.getElementById("simu-canvas");
  const img = document.getElementById("cameraStream");
  const title = document.getElementById("simu-or-video-title");
  if (show) {
    canvas.classList.remove("d-none");
    img.classList.add("d-none");
    if (title) title.textContent = "Simulation 3D";
    if (!simuScene) initSimu3D();
    simuAnimating = true;
    animateSimu3D();
    // Ne jamais charger d'image de caméra en simulation
    img.src = "";
  } else {
    canvas.classList.add("d-none");
    img.classList.remove("d-none");
    if (title) title.textContent = "Flux vidéo";
    simuAnimating = false;
    // Charger le flux vidéo uniquement en mode manuel
    img.src = "/dashboard/vehicle/camera/stream";
  }
}

// --- Feedback volant (HTML/CSS) ---
function updateSteeringVisual(steering) {
  const steeringDiv = document.getElementById("steering-wheel");
  if (steeringDiv) {
    steeringDiv.style.transform = `rotate(${(-steering * 90)}deg)`;
    steeringDiv.style.transition = "transform 0.1s";
    steeringDiv.innerHTML = `<svg width='40' height='40'><circle cx='20' cy='20' r='16' stroke='#444' stroke-width='4' fill='none'/><rect x='18' y='6' width='4' height='10' rx='2' fill='#888'/></svg>`;
  }
}

// Initialisation
document.addEventListener("DOMContentLoaded", () => {
  // Configuration initiale
  setupCamera();
  setupKeyboard();
  setupGamepad();
  startPingLoop();
  setupStartStopControl();
  startSimulation();

  // Affichage dynamique simulation/vidéo
  const modeSelector = document.getElementById("mode-selector");
  const controlSelector = document.getElementById("control-selector");
  const keyboardControls = document.getElementById("keyboard-controls");
  const gamepadControls = document.getElementById("gamepad-controls");

  function updateControlsDisplay() {
    const isClavier = controlSelector && controlSelector.value === "clavier";
    if (keyboardControls) keyboardControls.classList.toggle("d-none", !isClavier);
    if (gamepadControls) gamepadControls.classList.toggle("d-none", isClavier);
  }

  if (controlSelector) {
    controlSelector.addEventListener("change", updateControlsDisplay);
    updateControlsDisplay();
  }

  if (modeSelector) {
    const updateMode = () => {
      isManualMode = modeSelector.value === "manuel" || modeSelector.value === "simu";
      showSimu3D(modeSelector.value === "simu");
      document.getElementById("manual-controls").classList.remove("d-none");
      setupCamera(); // Appeler setupCamera à chaque changement de mode
      updateControlsDisplay();
    };
    modeSelector.addEventListener("change", updateMode);
    updateMode();
  }

  // Gestion du bouton Démarrer/Arrêter
  const startStopBtn = document.getElementById("start-stop-btn");
  if (startStopBtn) {
    startStopBtn.addEventListener("click", () => {
      isRunning = !isRunning;
      startStopBtn.innerHTML = isRunning 
        ? '<i class="bi bi-stop-fill"></i> Arrêter'
        : '<i class="bi bi-play-fill"></i> Démarrer';
      startStopBtn.className = `btn ${isRunning ? 'btn-danger' : 'btn-primary'} w-100`;
      
      // Réinitialiser les contrôles si arrêt
      if (!isRunning) {
        updateControlDisplay(0, 0, 0);
      }
    });
  }

  requestAnimationFrame(readInputs);
});
