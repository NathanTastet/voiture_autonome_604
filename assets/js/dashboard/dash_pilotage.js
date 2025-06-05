// Pilotage bundle : gestion de la manette, clavier et simulation
import { startPingLoop, setupStartStopControl } from "./dash_common.js";
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// État global
let gamepadIndex = null;
let isManualMode = false;
let cameraStream = null;
let controlType = "manette"; // "manette" ou "clavier"
let keysPressed = new Set();
let simulationInterval = null;
let isRunning = false;

// --- SIMULATION 3D (Three.js) ---
let simuScene, simuCamera, simuRenderer, carMesh;
let simuAnimating = false;
let currentSteering = 0;
let currentThrottle = 0;
let currentBrake = 0;
let obstacles = [];
let groundMesh = null;

// --- PHYSIQUE 3D (CANNON-ES) ---
let world, carBody, groundBody, wheelMeshes = [], obstacleBodies = [];
let vehicle, wheelBodies = [];

// Traînée visuelle
let trailPoints = [], trailLine = null;

// Variables globales pour la caméra
let cameraOffset = new THREE.Vector3(0, 3, -8); // Position derrière la voiture (z négatif pour être derrière)
let cameraLookOffset = new THREE.Vector3(0, 0, 5); // Regarder devant la voiture (z positif pour regarder devant)
let cameraTilt = 0; // Inclinaison de la caméra
let targetCameraTilt = 0; // Inclinaison cible pour l'animation fluide
let baseFOV = 60; // FOV de base
let currentFOV = baseFOV; // FOV actuel pour l'animation fluide

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
      statusElement.textContent = "Manette : " + e.gamepad.id;
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
  if (keysPressed.has("s")) throttle = -1;
  if (keysPressed.has(" ")) brake = 1;
  if (keysPressed.has("q") || keysPressed.has("a")) steering = 1;
  if (keysPressed.has("d")) steering = -1;
  // Manette (prioritaire si appuyée)
  if (gamepadIndex !== null) {
    const gamepad = navigator.getGamepads()[gamepadIndex];
    if (gamepad) {
      // R2 (bouton 7) pour avancer
      if (gamepad.buttons[7].value > 0.05) {
        throttle = gamepad.buttons[7].value;
      }
      // L2 (bouton 6) pour reculer
      if (gamepad.buttons[6].value > 0.05) {
        throttle = -gamepad.buttons[6].value;
      }
      // Carré (bouton 1) pour freiner
      if (gamepad.buttons[1].value > 0.05) {
        brake = gamepad.buttons[1].value;
      }
      // Joystick gauche pour la direction
      if (Math.abs(gamepad.axes[0]) > 0.1) {
        steering = -gamepad.axes[0];
      }
      // Joystick droit pour l'inclinaison de la caméra
      if (Math.abs(gamepad.axes[2]) > 0.1) {
        targetCameraTilt = gamepad.axes[2] * 0.5; // Limite l'inclinaison à 0.5 radians
      } else {
        targetCameraTilt = 0; // Retour à l'inclinaison normale
      }
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

    // Mise à jour de l'interface (avec vérification)
    const simSpeed = document.getElementById("sim-speed");
    if (simSpeed) simSpeed.textContent = `${speed} km/h`;
    const simTelemetry = document.getElementById("sim-telemetry");
    if (simTelemetry) simTelemetry.textContent = `${telemetry} cm`;
    const simBattery = document.getElementById("sim-battery");
    if (simBattery) simBattery.textContent = `${Math.floor(battery)}%`;
    const batteryGauge = document.getElementById("battery-gauge");
    if (batteryGauge) {
      batteryGauge.style.width = `${battery}%`;
      batteryGauge.className = `progress-bar ${battery < 20 ? 'bg-danger' : battery < 50 ? 'bg-warning' : 'bg-success'}`;
    }
  }, 1000);
}

// Envoi des commandes au serveur
function sendControlCommand(controls) {
  if (simuAnimating && vehicle) {
    // Reset commandes
    for (let i = 0; i < 4; i++) {
      vehicle.setBrake(0, i);
      vehicle.applyEngineForce(0, i);
    }
    // Accélération (4 roues motrices, puissance équilibrée)
    if (controls.throttle > 0) {
      // Distribution progressive de la puissance
      const frontForce = controls.throttle * 25;
      const rearForce = controls.throttle * 35;
      vehicle.applyEngineForce(-frontForce, 0); // Avant droit
      vehicle.applyEngineForce(-frontForce, 1); // Avant gauche
      vehicle.applyEngineForce(-rearForce, 2);  // Arrière droit
      vehicle.applyEngineForce(-rearForce, 3);  // Arrière gauche
    }
    // Recul (4 roues motrices, puissance équilibrée)
    if (controls.throttle < 0) {
      // Distribution progressive de la puissance
      const frontForce = controls.throttle * 20;
      const rearForce = controls.throttle * 25;
      vehicle.applyEngineForce(-frontForce, 0); // Avant droit
      vehicle.applyEngineForce(-frontForce, 1); // Avant gauche
      vehicle.applyEngineForce(-rearForce, 2);  // Arrière droit
      vehicle.applyEngineForce(-rearForce, 3);  // Arrière gauche
    }
    // Frein (toutes roues, progressif)
    if (controls.brake > 0) {
      for (let i = 0; i < 4; i++) vehicle.setBrake(controls.brake * 12, i);
    }
    // Direction (roues avant, sensibilité moyenne)
    vehicle.setSteeringValue(controls.steering * 0.8, 0);
    vehicle.setSteeringValue(controls.steering * 0.8, 1);
  }
  // N'envoie la requête au backend QUE si on n'est PAS en simulation
  const modeSelector = document.getElementById("mode-selector");
  if (!modeSelector || modeSelector.value === "simu") {
    // On est en simulation, on ne fait rien côté backend
    return;
  }
  // Sinon, on envoie la requête au backend
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
  const throttleGaugeNegative = document.getElementById("throttle-gauge-negative");
  const brakeGauge = document.getElementById("brake-gauge");
  const steeringValue = document.getElementById("steering-value");
  const throttleValue = document.getElementById("throttle-value");
  const brakeValue = document.getElementById("brake-value");

  // Gestion de l'accélérateur (positif et négatif)
  if (throttle > 0) {
    if (throttleGauge) throttleGauge.style.width = `${throttle * 100}%`;
    if (throttleGaugeNegative) throttleGaugeNegative.style.width = '0%';
  } else if (throttle < 0) {
    if (throttleGauge) throttleGauge.style.width = '0%';
    if (throttleGaugeNegative) throttleGaugeNegative.style.width = `${Math.abs(throttle) * 100}%`;
  } else {
    if (throttleGauge) throttleGauge.style.width = '0%';
    if (throttleGaugeNegative) throttleGaugeNegative.style.width = '0%';
  }

  if (brakeGauge) brakeGauge.style.width = `${brake * 100}%`;
  const steeringDegrees = Math.round(steering * 90);
  if (steeringValue) {
    steeringValue.textContent = `${steeringDegrees}°`;
    steeringValue.className = `h4 mb-0 ${steeringDegrees !== 0 ? 'text-primary' : ''}`;
  }
  if (throttleValue) throttleValue.textContent = `${Math.round(throttle * 100)}%`;
  if (brakeValue) brakeValue.textContent = `${Math.round(brake * 100)}%`;
  // Feedback volant visuel (HTML/CSS)
  updateSteeringVisual(steering);
}

// --- SIMULATION 3D (Three.js) ---
function createPlayground(scene) {
  // Grand sol plat
  const size = 500;
  const groundGeo = new THREE.PlaneGeometry(size, size, 1, 1);
  const groundMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);
  groundMesh = ground;

  // Murs (4 côtés)
  const wallHeight = 4, wallThickness = 1;
  const wallMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
  const wallGeo = new THREE.BoxGeometry(size, wallHeight, wallThickness);
  const wallGeoV = new THREE.BoxGeometry(wallThickness, wallHeight, size);
  // Nord
  let wallN = new THREE.Mesh(wallGeo, wallMat);
  wallN.position.set(0, wallHeight/2, size/2);
  scene.add(wallN);
  // Sud
  let wallS = new THREE.Mesh(wallGeo, wallMat);
  wallS.position.set(0, wallHeight/2, -size/2);
  scene.add(wallS);
  // Est
  let wallE = new THREE.Mesh(wallGeoV, wallMat);
  wallE.position.set(size/2, wallHeight/2, 0);
  scene.add(wallE);
  // Ouest
  let wallW = new THREE.Mesh(wallGeoV, wallMat);
  wallW.position.set(-size/2, wallHeight/2, 0);
  scene.add(wallW);
}

function addPlaygroundPhysics(world) {
  const size = 500;
  // Sol physique
  groundBody = new CANNON.Body({ mass: 0 });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);
  // Murs physiques
  const wallHeight = 4, wallThickness = 1;
  // Nord
  let wallN = new CANNON.Body({ mass: 0 });
  wallN.addShape(new CANNON.Box(new CANNON.Vec3(size/2, wallHeight/2, wallThickness/2)));
  wallN.position.set(0, wallHeight/2, size/2);
  world.addBody(wallN);
  // Sud
  let wallS = new CANNON.Body({ mass: 0 });
  wallS.addShape(new CANNON.Box(new CANNON.Vec3(size/2, wallHeight/2, wallThickness/2)));
  wallS.position.set(0, wallHeight/2, -size/2);
  world.addBody(wallS);
  // Est
  let wallE = new CANNON.Body({ mass: 0 });
  wallE.addShape(new CANNON.Box(new CANNON.Vec3(wallThickness/2, wallHeight/2, size/2)));
  wallE.position.set(size/2, wallHeight/2, 0);
  world.addBody(wallE);
  // Ouest
  let wallW = new CANNON.Body({ mass: 0 });
  wallW.addShape(new CANNON.Box(new CANNON.Vec3(wallThickness/2, wallHeight/2, size/2)));
  wallW.position.set(-size/2, wallHeight/2, 0);
  world.addBody(wallW);
}

function addPinsAndBlocks(scene, world, carMaterial) {
  // Matériaux pour les objets
  const objectMaterial = new CANNON.Material('object');
  const contactMaterial = new CANNON.ContactMaterial(
    carMaterial || new CANNON.Material('car'),
    objectMaterial,
    {
      friction: 0.2,
      restitution: 0.8
    }
  );
  world.addContactMaterial(contactMaterial);

  // Générer des quilles (cylindres fins) et des blocs (cubes) à renverser
  const pins = [];
  for (let i = 0; i < 30; i++) { // Augmentation de 15 à 30 quilles
    const x = Math.random() * 160 - 80; // Zone doublée (-80 à 80 au lieu de -40 à 40)
    const z = Math.random() * 160 - 80;
    // Visuel
    const pinMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 2, 16),
      new THREE.MeshPhongMaterial({ color: 0xffffff })
    );
    pinMesh.position.set(x, 1, z);
    pinMesh.castShadow = true;
    pinMesh.receiveShadow = true;
    scene.add(pinMesh);
    // Physique
    const pinBody = new CANNON.Body({ 
      mass: 0.1,
      material: objectMaterial,
      linearDamping: 0.2,
      angularDamping: 0.2,
      collisionFilterGroup: 2,
      collisionFilterMask: -1
    });
    pinBody.addShape(new CANNON.Cylinder(0.3, 0.3, 2, 16));
    pinBody.position.set(x, 1, z);
    world.addBody(pinBody);
    pins.push({ mesh: pinMesh, body: pinBody });
  }
  // Blocs
  for (let i = 0; i < 25; i++) { // Augmentation de 12 à 25 blocs
    const x = Math.random() * 160 - 80; // Zone doublée (-80 à 80 au lieu de -40 à 40)
    const z = Math.random() * 160 - 80;
    const blockMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshPhongMaterial({ color: 0xff4444 })
    );
    blockMesh.position.set(x, 0.5, z);
    blockMesh.castShadow = true;
    blockMesh.receiveShadow = true;
    scene.add(blockMesh);
    const blockBody = new CANNON.Body({ 
      mass: 0.3,
      material: objectMaterial,
      linearDamping: 0.2,
      angularDamping: 0.2,
      collisionFilterGroup: 2,
      collisionFilterMask: -1
    });
    blockBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
    blockBody.position.set(x, 0.5, z);
    world.addBody(blockBody);
    pins.push({ mesh: blockMesh, body: blockBody });
  }
  obstacles = pins; // Stocker les obstacles globalement
  return pins;
}

function initSimu3D() {
  const canvas = document.getElementById("simu-canvas");
  if (!canvas || !THREE) return;

  // Créer le compteur de vitesse
  const speedometer = document.createElement('div');
  speedometer.id = 'speedometer';
  speedometer.style.cssText = `
    position: absolute;
    bottom: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0);
    color: white;
    padding: 10px 20px;
    border-radius: 10px;
    font-family: Arial, sans-serif;
    font-size: 24px;
    z-index: 1000;
  `;
  speedometer.innerHTML = '0 km/h';
  canvas.parentElement.appendChild(speedometer);

  // Taille du canvas
  const width = canvas.parentElement.offsetWidth;
  const height = canvas.parentElement.offsetHeight;
  canvas.width = width;
  canvas.height = height;

  // Renderer
  simuRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  simuRenderer.setSize(width, height, false);
  simuRenderer.setClearColor(0x222222, 1); // fond bien visible
  // simuRenderer.shadowMap.enabled = false; // désactive les shadows pour éviter les artefacts

  // Scène
  simuScene = new THREE.Scene();

  // Caméra
  simuCamera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  simuCamera.position.set(0, 5, 12);
  simuCamera.lookAt(0, 0, 0);

  // Lumière (pas de shadow pour éviter les bugs)
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 7);
  // light.castShadow = false;
  simuScene.add(light);
  simuScene.add(new THREE.AmbientLight(0xffffff, 0.5));

  // Terrain de jeu et murs
  createPlayground(simuScene);

  // Voiture (simple bloc)
  const carBody = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.6, 4),
    new THREE.MeshPhongMaterial({ color: 0x4b8cff })
  );
  carBody.position.y = 0.8;
  carBody.position.z = 0;
  // carBody.castShadow = false;
  simuScene.add(carBody);
  carMesh = carBody;

  // Animation
  simuAnimating = true;
  animateSimu3D();

  // Ajouter les roues visuelles après la création de carMesh
  addWheelsToCar();

  // Ajout de la physique des murs et du sol
  if (typeof addPlaygroundPhysics === 'function' && typeof world !== 'undefined') {
    addPlaygroundPhysics(world);
  }
  // Ajout des quilles/blocs
  if (typeof addPinsAndBlocks === 'function' && typeof simuScene !== 'undefined' && typeof world !== 'undefined') {
    addPinsAndBlocks(simuScene, world, carMaterial);
  }
}

function animateSimu3D() {
  if (!simuAnimating) return;
  // Animation de la voiture (avance/recul)
  let dz = (currentThrottle - currentBrake) * 0.2;
  let dx = Math.sin(-currentSteering * 0.5) * dz;
  carMesh.position.z += dz * Math.cos(carMesh.rotation.y);
  carMesh.position.x += dz * Math.sin(carMesh.rotation.y);
  // Tourner la voiture avec une sensibilité plus élevée en marche avant
  let steeringFactor = 0.30; // Augmentation significative de la sensibilité
  if (dz < 0) { // En marche arrière
    steeringFactor = 0.12; // Garder la sensibilité actuelle en marche arrière
  }
  carMesh.rotation.y += -currentSteering * steeringFactor;
  // Caméra suit la voiture
  const cameraOffset = new THREE.Vector3(0, 3, -8); // Position relative de la caméra (hauteur, distance arrière)
  const cameraLookOffset = new THREE.Vector3(0, 0, 5); // Point de visée devant la voiture
  
  // Calculer la position de la caméra en fonction de la rotation de la voiture
  const carRotation = carMesh.quaternion;
  const rotatedOffset = cameraOffset.clone().applyQuaternion(carRotation);
  const rotatedLookOffset = cameraLookOffset.clone().applyQuaternion(carRotation);
  
  // Positionner la caméra
  simuCamera.position.copy(carMesh.position).add(rotatedOffset);
  simuCamera.lookAt(carMesh.position.clone().add(rotatedLookOffset));

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
    setupPhysics().then(() => {
      animatePhysics();
    });
  } else {
    canvas.classList.add("d-none");
    img.classList.remove("d-none");
    if (title) title.textContent = "Flux vidéo";
    simuAnimating = false;
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

async function setupPhysics() {
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });

  // Matériaux avec friction optimisée
  const groundMaterial = new CANNON.Material('ground');
  const carMaterial = new CANNON.Material('car');
  const contact = new CANNON.ContactMaterial(groundMaterial, carMaterial, {
    friction: 0.2,
    restitution: 0.1
  });
  world.addContactMaterial(contact);

  // Châssis avec distribution de poids réaliste
  const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.3, 2));
  carBody = new CANNON.Body({
    mass: 3,
    position: new CANNON.Vec3(0, 0.8, 0),
    angularDamping: 0.8,
    linearDamping: 0.1,
    material: carMaterial,
    collisionFilterGroup: 1,
    collisionFilterMask: -1,
    fixedRotation: false,
    allowSleep: false
  });

  // Ajout de formes pour simuler le poids du moteur à l'avant
  const engineShape = new CANNON.Box(new CANNON.Vec3(0.8, 0.2, 0.8));
  carBody.addShape(engineShape, new CANNON.Vec3(0, 0.1, 0.8)); // Moteur à l'avant
  carBody.addShape(chassisShape, new CANNON.Vec3(0, -0.25, 0)); // Châssis principal
  world.addBody(carBody);

  // RaycastVehicle avec paramètres optimisés
  vehicle = new CANNON.RaycastVehicle({
    chassisBody: carBody,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2
  });

  const wheelOptions = {
    radius: 0.4,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: 35, // Plus rigide pour éviter le wheeling
    suspensionRestLength: 0.3,
    frictionSlip: 0.8,
    dampingRelaxation: 4.5,
    dampingCompression: 3.5,
    maxSuspensionForce: 100000,
    rollInfluence: 0.01,
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    chassisConnectionPointLocal: undefined,
    maxSuspensionTravel: 0.3,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true,
    collisionFilterGroup: 1,
    collisionFilterMask: -1
  };

  // Position des roues ajustée pour une meilleure stabilité
  // Avant droit
  wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3( 0.9, -0.3,  1.7);
  vehicle.addWheel({ ...wheelOptions });
  // Avant gauche
  wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(-0.9, -0.3,  1.7);
  vehicle.addWheel({ ...wheelOptions });
  // Arrière droit
  wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3( 0.9, -0.3, -1.7);
  vehicle.addWheel({ ...wheelOptions });
  // Arrière gauche
  wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(-0.9, -0.3, -1.7);
  vehicle.addWheel({ ...wheelOptions });
  vehicle.addToWorld(world);

  // Créer les bodies des roues pour la synchro visuelle
  wheelBodies = [];
  for (let i = 0; i < vehicle.wheelInfos.length; i++) {
    const wheel = vehicle.wheelInfos[i];
    const cylinderShape = new CANNON.Cylinder(wheel.radius, wheel.radius, 0.5, 16);
    const wheelBody = new CANNON.Body({ mass: 0 });
    wheelBody.type = CANNON.Body.KINEMATIC;
    wheelBody.collisionFilterGroup = 0;
    wheelBody.addShape(cylinderShape);
    wheelBodies.push(wheelBody);
    world.addBody(wheelBody);
  }

  // Traînée visuelle : initialisation
  trailPoints = [];
  if (trailLine && simuScene) {
    simuScene.remove(trailLine);
    trailLine = null;
  }

  // Obstacles physiques (cubes, murs, cylindres)
  obstacleBodies = [];
  const obsData = [
    { type: 'cube', x: -3, z: 18, size: 2 },
    { type: 'cube', x: 4, z: 28, size: 1.5 },
    { type: 'wall', x: 0, z: 40, w: 8, h: 1 },
    { type: 'cyl', x: -6, z: 55, r: 1, h: 2 },
    { type: 'cube', x: 5, z: 65, size: 2 },
  ];
  
  // Supprimer tous les obstacles existants
  for (const body of obstacleBodies) {
    world.removeBody(body);
  }
  obstacleBodies = [];

  // Ajouter les nouveaux obstacles
  for (const o of obsData) {
    let body;
    if (o.type === 'cube') {
      body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(o.size/2, o.size/2, o.size/2)));
      body.position.set(o.x, o.size/2, o.z);
    } else if (o.type === 'wall') {
      body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Box(new CANNON.Vec3(o.w/2, o.h/2, 0.25)));
      body.position.set(o.x, o.h/2, o.z);
    } else if (o.type === 'cyl') {
      body = new CANNON.Body({ mass: 0 });
      body.addShape(new CANNON.Cylinder(o.r, o.r, o.h, 24));
      body.position.set(o.x, o.h/2, o.z);
    }
    if (body) {
      world.addBody(body);
      obstacleBodies.push(body);
    }
  }

  // Murs physiques
  addPlaygroundPhysics(world);

  // Générer des quilles (cylindres fins) et des blocs (cubes) à renverser
  addPinsAndBlocks(simuScene, world, carMaterial);

  // Ajout du mesh "toit" pour le look voiture
  if (carMesh) {
    const roofGeom = new THREE.BoxGeometry(1.2, 0.25, 1.2);
    const roofMat = new THREE.MeshPhongMaterial({ color: 0x222266 });
    const roof = new THREE.Mesh(roofGeom, roofMat);
    roof.position.set(0, 0.35, 0);
    carMesh.add(roof);
  }
}

function addWheelsToCar() {
  // Roues visuelles (4 cylindres), placées dans la scène (pas enfants du châssis)
  if (!simuScene) return;
  const wheelGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.5, 16);
  wheelGeom.rotateZ(Math.PI / 2); // Correction orientation : axe Z
  const wheelMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
  wheelMeshes = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(wheelGeom, wheelMat);
    simuScene.add(mesh);
    wheelMeshes.push(mesh);
  }
}

function animatePhysics() {
  if (!simuAnimating) return;
  if (!world) return;
  world.step(1/60);

  // Calculer la vitesse actuelle
  const currentSpeed = carBody.velocity.length();
  
  // Mettre à jour le compteur de vitesse
  const speedometer = document.getElementById('speedometer');
  if (speedometer) {
    const speedKmh = Math.round(currentSpeed * 3.6); // Conversion m/s en km/h
    speedometer.innerHTML = `${speedKmh} km/h`;
    // Changer la couleur en fonction de la vitesse
    if (speedKmh > 60) {
      speedometer.style.color = '#ff4444';
    } else if (speedKmh > 30) {
      speedometer.style.color = '#ffaa00';
    } else {
      speedometer.style.color = '#ffffff';
    }
  }
  
  // Ajuster le FOV en fonction de la vitesse
  const targetFOV = baseFOV + (currentSpeed * 0.8);
  currentFOV += (targetFOV - currentFOV) * 0.1; // Animation fluide
  simuCamera.fov = currentFOV;
  simuCamera.updateProjectionMatrix();


  // Synchroniser la voiture
  carMesh.position.copy(carBody.position);
  carMesh.quaternion.copy(carBody.quaternion);

  // Synchroniser les roues
  if (vehicle && wheelMeshes && wheelBodies) {
    for (let i = 0; i < wheelMeshes.length; i++) {
      vehicle.updateWheelTransform(i);
      const t = vehicle.wheelInfos[i].worldTransform;
      wheelMeshes[i].position.copy(t.position);
      wheelMeshes[i].quaternion.copy(t.quaternion);
    }
  }

  // Synchroniser les obstacles
  if (obstacles) {
    for (const obstacle of obstacles) {
      if (obstacle.mesh && obstacle.body) {
        obstacle.mesh.position.copy(obstacle.body.position);
        obstacle.mesh.quaternion.copy(obstacle.body.quaternion);
      }
    }
  }

  // Animation fluide de l'inclinaison de la caméra
  cameraTilt += (targetCameraTilt - cameraTilt) * 0.1;

  // Mise à jour de la caméra
  if (carMesh && simuCamera) {
    // Calculer la position de la caméra en fonction de la rotation de la voiture
    const carRotation = carMesh.quaternion;
    const rotatedOffset = cameraOffset.clone().applyQuaternion(carRotation);
    const rotatedLookOffset = cameraLookOffset.clone().applyQuaternion(carRotation);
    
    // Appliquer l'inclinaison de la caméra
    const tiltMatrix = new THREE.Matrix4().makeRotationX(cameraTilt);
    rotatedOffset.applyMatrix4(tiltMatrix);
    
    // Positionner la caméra
    simuCamera.position.copy(carMesh.position).add(rotatedOffset);
    simuCamera.lookAt(carMesh.position.clone().add(rotatedLookOffset));
  }

  // Traînée visuelle
  if (carMesh) {
    if (trailPoints.length === 0 || carMesh.position.distanceTo(trailPoints[trailPoints.length-1]) > 0.2) {
      trailPoints.push(carMesh.position.clone());
      if (trailPoints.length > 60) trailPoints.shift();
    }
    if (!trailLine && simuScene) {
      const trailGeometry = new THREE.BufferGeometry().setFromPoints(trailPoints);
      const trailMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
      trailLine = new THREE.Line(trailGeometry, trailMaterial);
      simuScene.add(trailLine);
    } else if (trailLine) {
      trailLine.geometry.setFromPoints(trailPoints);
    }
  }

  simuRenderer.render(simuScene, simuCamera);
  requestAnimationFrame(animatePhysics);
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

// Ajout du reset voiture (touche R)
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r' && carBody) {
    carBody.position.set(0, 2, 0);
    carBody.velocity.set(0, 0, 0);
    carBody.angularVelocity.set(0, 0, 0);
    carBody.torque.set(0, 0, 0);
    carBody.quaternion.set(0, 0, 0, 1);
  }
});
