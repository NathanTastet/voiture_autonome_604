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

// --- GÉNÉRATION DU TERRAIN VALLONNÉ DOUX PARTAGÉ ---
const TERRAIN_SIZE = 500;
const TERRAIN_SEGMENTS = 50;
let terrainHeights = null;

function generateTerrainHeights() {
  // Terrain vallonné doux, adapté à la conduite
  const heights = [];
  for (let i = 0; i <= TERRAIN_SEGMENTS; i++) {
    heights[i] = [];
    for (let j = 0; j <= TERRAIN_SEGMENTS; j++) {
      const x = (i / TERRAIN_SEGMENTS) * TERRAIN_SIZE;
      const z = (j / TERRAIN_SEGMENTS) * TERRAIN_SIZE;
      // Relief doux, pas trop chaotique
      let y =
        1.5 * Math.sin(x * 0.015 + 10) * Math.cos(z * 0.013 + 5) +
        1.0 * Math.sin(x * 0.04 + z * 0.025) +
        0.7 * Math.cos(z * 0.05 - x * 0.02);
      // Un peu de bruit doux
      const noise =
        0.4 * (Math.sin(x * 0.07 + z * 0.09) + Math.cos(x * 0.06 - z * 0.08));
      y += noise;
      // Clamp pour éviter les extrêmes
      y = Math.max(-2.5, Math.min(2.5, y));
      heights[i][j] = y;
    }
  }
  return heights;
}

function getTerrainHeightAt(x, z) {
  // x, z en coordonnées monde, terrain centré en (0,0)
  // Retourne la hauteur du terrain à ce point (interpolation bilinéaire)
  const fx = ((x + TERRAIN_SIZE/2) / TERRAIN_SIZE) * TERRAIN_SEGMENTS;
  const fz = ((z + TERRAIN_SIZE/2) / TERRAIN_SIZE) * TERRAIN_SEGMENTS;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  if (!terrainHeights || i < 0 || j < 0 || i >= TERRAIN_SEGMENTS || j >= TERRAIN_SEGMENTS) return 0;
  const h00 = terrainHeights[i][j];
  const h10 = terrainHeights[i+1][j];
  const h01 = terrainHeights[i][j+1];
  const h11 = terrainHeights[i+1][j+1];
  const dx = fx - i;
  const dz = fz - j;
  // Interpolation bilinéaire
  return h00 * (1-dx) * (1-dz) + h10 * dx * (1-dz) + h01 * (1-dx) * dz + h11 * dx * dz;
}

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
  if (keysPressed.has("s")) throttle = -1; // Recul au lieu de frein
  if (keysPressed.has(" ")) brake = 1; // Frein avec espace
  if (keysPressed.has("q") || keysPressed.has("a")) steering = 1; // Inversé
  if (keysPressed.has("d")) steering = -1; // Inversé
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
      // X (bouton 0) pour freiner
      if (gamepad.buttons[0].value > 0.05) {
        brake = gamepad.buttons[0].value;
      }
      // Joystick pour la direction
      if (Math.abs(gamepad.axes[0]) > 0.1) {
        steering = -gamepad.axes[0]; // Inversé
      }
      // Y/Triangle (bouton 3) pour reset
      if (gamepad.buttons[3].pressed) {
        resetCar();
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
    // Accélération (4 roues motrices, puissance sportive)
    if (controls.throttle > 0) {
      // Distribution progressive de la puissance
      const frontForce = controls.throttle * 40; // Réduit pour l'avant
      const rearForce = controls.throttle * 60;  // Plus de puissance à l'arrière
      vehicle.applyEngineForce(-frontForce, 0); // Avant droit
      vehicle.applyEngineForce(-frontForce, 1); // Avant gauche
      vehicle.applyEngineForce(-rearForce, 2);  // Arrière droit
      vehicle.applyEngineForce(-rearForce, 3);  // Arrière gauche
    }
    // Recul (4 roues motrices, puissance sportive)
    if (controls.throttle < 0) {
      // Distribution progressive de la puissance
      const frontForce = controls.throttle * 30; // Réduit pour l'avant
      const rearForce = controls.throttle * 40;  // Plus de puissance à l'arrière
      vehicle.applyEngineForce(-frontForce, 0); // Avant droit
      vehicle.applyEngineForce(-frontForce, 1); // Avant gauche
      vehicle.applyEngineForce(-rearForce, 2);  // Arrière droit
      vehicle.applyEngineForce(-rearForce, 3);  // Arrière gauche
    }
    // Frein (toutes roues, progressif)
    if (controls.brake > 0) {
      for (let i = 0; i < 4; i++) vehicle.setBrake(controls.brake * 12, i);
    }
    // Direction (roues avant, plus réactif)
    vehicle.setSteeringValue(controls.steering * 0.5, 0);
    vehicle.setSteeringValue(controls.steering * 0.5, 1);
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

  // Mise à jour des feux de stop
  if (carMesh && carMesh.brakeLights) {
    const brakeIntensity = brake > 0 ? 1 : 0.3;
    carMesh.brakeLights.forEach(light => {
      light.material.color.setRGB(brakeIntensity, 0, 0);
    });
  }
  
  // Mise à jour des particules d'échappement
  if (carMesh && carMesh.exhaustParticles && carMesh.particlePositions) {
    const positions = carMesh.particlePositions;
    const exhaustPos = new THREE.Vector3(0.5, 0.1, -2.2);
    
    for (let i = 0; i < positions.length; i += 3) {
      // Réinitialiser les particules qui sortent de la zone
      if (positions[i + 1] > 1) {
        positions[i] = exhaustPos.x + (Math.random() - 0.5) * 0.1;
        positions[i + 1] = exhaustPos.y;
        positions[i + 2] = exhaustPos.z;
      } else {
        // Faire monter les particules
        positions[i + 1] += 0.02;
        // Ajouter un peu de mouvement aléatoire
        positions[i] += (Math.random() - 0.5) * 0.01;
        positions[i + 2] += (Math.random() - 0.5) * 0.01;
      }
    }
    
    carMesh.exhaustParticles.geometry.attributes.position.needsUpdate = true;
  }
}

// --- SIMULATION 3D (Three.js) ---
function createPlayground(scene) {
  if (!terrainHeights) terrainHeights = generateTerrainHeights();
  // Mesh Three.js
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geometry.rotateX(-Math.PI / 2); // Met le sol à plat dans le plan XZ
  const vertices = geometry.attributes.position.array;
  let k = 0;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i <= TERRAIN_SEGMENTS; i++) {
    for (let j = 0; j <= TERRAIN_SEGMENTS; j++) {
      vertices[k + 2] = (j / TERRAIN_SEGMENTS - 0.5) * TERRAIN_SIZE; // z
      vertices[k] = (i / TERRAIN_SEGMENTS - 0.5) * TERRAIN_SIZE; // x
      vertices[k + 1] = terrainHeights[i][j]; // y
      if (terrainHeights[i][j] < minY) minY = terrainHeights[i][j];
      if (terrainHeights[i][j] > maxY) maxY = terrainHeights[i][j];
      k += 3;
    }
  }
  geometry.computeVertexNormals();
  // Dégradé de gris accentué selon la hauteur
  const colors = [];
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const y = geometry.attributes.position.getY(i);
    const t = (y - minY) / (maxY - minY);
    const c = 0.35 + 0.6 * t; // gris foncé à gris très clair
    colors.push(c, c, c);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Matériau Phong avec brillance
  const material = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, specular: 0xaaaaaa, shininess: 40 });
  const ground = new THREE.Mesh(geometry, material);
  ground.position.set(0, 0, 0); // Centré à l'origine
  ground.receiveShadow = true;
  scene.add(ground);
  groundMesh = ground;
  // Murs visuels parfaitement alignés
  const wallHeight = 4, wallThickness = 1;
  const wallMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
  const wallGeo = new THREE.BoxGeometry(TERRAIN_SIZE, wallHeight, wallThickness);
  const wallGeoV = new THREE.BoxGeometry(wallThickness, wallHeight, TERRAIN_SIZE);
  // Nord
  let wallN = new THREE.Mesh(wallGeo, wallMat);
  wallN.position.set(0, wallHeight/2, TERRAIN_SIZE/2);
  scene.add(wallN);
  // Sud
  let wallS = new THREE.Mesh(wallGeo, wallMat);
  wallS.position.set(0, wallHeight/2, -TERRAIN_SIZE/2);
  scene.add(wallS);
  // Est
  let wallE = new THREE.Mesh(wallGeoV, wallMat);
  wallE.position.set(TERRAIN_SIZE/2, wallHeight/2, 0);
  scene.add(wallE);
  // Ouest
  let wallW = new THREE.Mesh(wallGeoV, wallMat);
  wallW.position.set(-TERRAIN_SIZE/2, wallHeight/2, 0);
  scene.add(wallW);
}

function addPlaygroundPhysics(world) {
  if (!terrainHeights) terrainHeights = generateTerrainHeights();
  // Transposer le tableau pour le Heightfield Cannon-es (Cannon attend [z][x])
  const heightsTransposed = [];
  for (let j = 0; j <= TERRAIN_SEGMENTS; j++) {
    heightsTransposed[j] = [];
    for (let i = 0; i <= TERRAIN_SEGMENTS; i++) {
      heightsTransposed[j][i] = terrainHeights[i][j];
    }
  }
  // Sol physique
  const elementSize = TERRAIN_SIZE / TERRAIN_SEGMENTS;
  const groundShape = new CANNON.Heightfield(heightsTransposed, { elementSize });
  groundBody = new CANNON.Body({ mass: 0 });
  groundBody.addShape(groundShape);
  groundBody.position.set(0, 0, 0); // Centré à l'origine
  world.addBody(groundBody);
  // Murs physiques parfaitement alignés
  const wallHeight = 4, wallThickness = 1;
  // Nord
  let wallN = new CANNON.Body({ mass: 0 });
  wallN.addShape(new CANNON.Box(new CANNON.Vec3(TERRAIN_SIZE/2, wallHeight/2, wallThickness/2)));
  wallN.position.set(0, wallHeight/2, TERRAIN_SIZE/2);
  world.addBody(wallN);
  // Sud
  let wallS = new CANNON.Body({ mass: 0 });
  wallS.addShape(new CANNON.Box(new CANNON.Vec3(TERRAIN_SIZE/2, wallHeight/2, wallThickness/2)));
  wallS.position.set(0, wallHeight/2, -TERRAIN_SIZE/2);
  world.addBody(wallS);
  // Est
  let wallE = new CANNON.Body({ mass: 0 });
  wallE.addShape(new CANNON.Box(new CANNON.Vec3(wallThickness/2, wallHeight/2, TERRAIN_SIZE/2)));
  wallE.position.set(TERRAIN_SIZE/2, wallHeight/2, 0);
  world.addBody(wallE);
  // Ouest
  let wallW = new CANNON.Body({ mass: 0 });
  wallW.addShape(new CANNON.Box(new CANNON.Vec3(wallThickness/2, wallHeight/2, TERRAIN_SIZE/2)));
  wallW.position.set(-TERRAIN_SIZE/2, wallHeight/2, 0);
  world.addBody(wallW);
}

function addPinsAndBlocks(scene, world, carMaterial) {
  const objectMaterial = new CANNON.Material('object');
  const contactMaterial = new CANNON.ContactMaterial(carMaterial, objectMaterial, {
    friction: 0.2,
    restitution: 0.8
  });
  world.addContactMaterial(contactMaterial);
  // Zones sûres pour placer les objets (surfaces planes)
  const safeZones = [
    { x: -40, z: -40, size: 10 },
    { x: 40, z: -40, size: 10 },
    { x: -40, z: 40, size: 10 },
    { x: 40, z: 40, size: 10 }
  ];
  const pins = [];
  for (let i = 0; i < 15; i++) {
    const zone = safeZones[Math.floor(Math.random() * safeZones.length)];
    const x = zone.x + (Math.random() - 0.5) * zone.size;
    const z = zone.z + (Math.random() - 0.5) * zone.size;
    const y = getTerrainHeightAt(x, z) + 1.05; // quille hauteur 2 -> 1 + 0.05
    const pinMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 2, 16),
      new THREE.MeshPhongMaterial({ color: 0xffffff })
    );
    pinMesh.position.set(x, y, z);
    pinMesh.castShadow = true;
    pinMesh.receiveShadow = true;
    scene.add(pinMesh);
    const pinBody = new CANNON.Body({ 
      mass: 0.1,
      material: objectMaterial,
      linearDamping: 0.2,
      angularDamping: 0.2,
      collisionFilterGroup: 2,
      collisionFilterMask: -1
    });
    pinBody.addShape(new CANNON.Cylinder(0.3, 0.3, 2, 16));
    pinBody.position.set(x, y, z);
    world.addBody(pinBody);
    pins.push({ mesh: pinMesh, body: pinBody });
  }
  for (let i = 0; i < 12; i++) {
    const zone = safeZones[Math.floor(Math.random() * safeZones.length)];
    const x = zone.x + (Math.random() - 0.5) * zone.size;
    const z = zone.z + (Math.random() - 0.5) * zone.size;
    const y = getTerrainHeightAt(x, z) + 0.55; // bloc hauteur 1 -> 0.5 + 0.05
    const blockMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshPhongMaterial({ color: 0xff4444 })
    );
    blockMesh.position.set(x, y, z);
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
    blockBody.position.set(x, y, z);
    world.addBody(blockBody);
    pins.push({ mesh: blockMesh, body: blockBody });
  }
  obstacles = pins;
  return pins;
}

function initSimu3D() {
  const canvas = document.getElementById("simu-canvas");
  if (!canvas || !THREE) return;

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

  // Ajouter les éléments visuels à la voiture
  addCarVisuals();
}

function animateSimu3D() {
  if (!simuAnimating) return;
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

  // Matériaux avec friction optimisée pour les pentes
  const groundMaterial = new CANNON.Material('ground');
  const carMaterial = new CANNON.Material('car');
  const contact = new CANNON.ContactMaterial(groundMaterial, carMaterial, {
    friction: 0.6, // Augmenté pour mieux tenir sur les pentes
    restitution: 0.1
  });
  world.addContactMaterial(contact);

  // Châssis avec centre de masse plus bas pour la stabilité
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
  // Ajout de la forme avec un offset pour abaisser le centre de masse
  carBody.addShape(
    new CANNON.Box(new CANNON.Vec3(1, 0.3, 2)),
    new CANNON.Vec3(0, -0.2, 0)
  );
  world.addBody(carBody);

  // RaycastVehicle avec paramètres optimisés pour les pentes
  vehicle = new CANNON.RaycastVehicle({
    chassisBody: carBody,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2
  });

  const wheelOptions = {
    radius: 0.4,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: 45,
    suspensionRestLength: 0.3,
    frictionSlip: 1.5, // Augmenté pour mieux tenir sur les pentes
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

  // Avant droit
  wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3( 0.9, -0.4,  1.7);
  vehicle.addWheel({ ...wheelOptions });
  // Avant gauche
  wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(-0.9, -0.4,  1.7);
  vehicle.addWheel({ ...wheelOptions });
  // Arrière droit
  wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3( 0.9, -0.4, -1.7);
  vehicle.addWheel({ ...wheelOptions });
  // Arrière gauche
  wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(-0.9, -0.4, -1.7);
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
    world.addBody(body);
    obstacleBodies.push(body);
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

  // Limiteur de vitesse (fun mais raisonnable)
  if (carBody.velocity.length() > 20) {
    carBody.velocity.scale(20 / carBody.velocity.length(), carBody.velocity);
  }

  // Synchroniser la voiture
  carMesh.position.copy(carBody.position);
  carMesh.quaternion.copy(carBody.quaternion);

  // Synchroniser les roues visuelles avec la physique
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

  // Traînée visuelle : ajouter la position actuelle
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

  // Caméra suit la voiture
  simuCamera.position.x = carMesh.position.x;
  simuCamera.position.z = carMesh.position.z + 12;
  simuCamera.lookAt(carMesh.position.x, carMesh.position.y, carMesh.position.z);

  simuRenderer.render(simuScene, simuCamera);
  requestAnimationFrame(animatePhysics);
}

// Ajout des éléments visuels à la voiture
function addCarVisuals() {
  if (!carMesh) return;
  
  // Phares avant
  const headlightGeometry = new THREE.BoxGeometry(0.2, 0.1, 0.05);
  const headlightMaterial = new THREE.MeshPhongMaterial({ color: 0xffffcc });
  
  const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
  leftHeadlight.position.set(-0.8, 0.2, 2.1);
  carMesh.add(leftHeadlight);
  
  const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
  rightHeadlight.position.set(0.8, 0.2, 2.1);
  carMesh.add(rightHeadlight);
  
  // Feux de stop
  const brakeLightGeometry = new THREE.BoxGeometry(0.2, 0.1, 0.05);
  const brakeLightMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
  
  const leftBrakeLight = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial);
  leftBrakeLight.position.set(-0.8, 0.2, -2.1);
  carMesh.add(leftBrakeLight);
  
  const rightBrakeLight = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial);
  rightBrakeLight.position.set(0.8, 0.2, -2.1);
  carMesh.add(rightBrakeLight);
  
  // Pot d'échappement
  const exhaustGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
  const exhaustMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
  const exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.5, 0.1, -2.2);
  carMesh.add(exhaust);
  
  // Système de particules pour l'échappement
  const particleCount = 50;
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  
  const particleMaterial = new THREE.PointsMaterial({
    color: 0x666666,
    size: 0.1,
    transparent: true,
    opacity: 0.6
  });
  
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  carMesh.add(particles);
  
  // Stocker les références pour l'animation
  carMesh.brakeLights = [leftBrakeLight, rightBrakeLight];
  carMesh.exhaustParticles = particles;
  carMesh.particlePositions = particlePositions;
}

// Fonction de reset de la voiture
function resetCar() {
  if (!carBody) {
    console.warn("Tentative de reset avant l'initialisation de la voiture");
    return;
  }
  try {
    const x = 0, z = 0;
    const y = getTerrainHeightAt(x, z) + 0.4; // châssis 0.6 -> 0.3 + 0.1
    carBody.position.set(x, y, z);
    carBody.velocity.set(0, 0, 0);
    carBody.angularVelocity.set(0, 0, 0);
    carBody.torque.set(0, 0, 0);
    carBody.quaternion.set(0, 0, 0, 1);
    if (carMesh) {
      carMesh.position.set(x, y, z);
      carMesh.quaternion.set(0, 0, 0, 1);
    }
  } catch (error) {
    console.error("Erreur lors du reset de la voiture:", error);
  }
}

// Gestion du reset avec la touche R
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r' && isRunning) {
    resetCar();
  }
});

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
