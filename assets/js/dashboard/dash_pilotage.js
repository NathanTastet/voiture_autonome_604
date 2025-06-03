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
    // Accélération (4 roues motrices, puissance fun)
    if (controls.throttle > 0) {
      for (let i = 0; i < 4; i++) {
        vehicle.applyEngineForce(-controls.throttle * 35, i);
      }
    }
    // Frein (toutes roues, progressif)
    if (controls.brake > 0) {
      for (let i = 0; i < 4; i++) vehicle.setBrake(controls.brake * 12, i);
    }
    // Direction (roues avant, plus réactif)
    vehicle.setSteeringValue(controls.steering * 0.32, 0); // avant droit
    vehicle.setSteeringValue(controls.steering * 0.32, 1); // avant gauche
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
  const contactMaterial = new CANNON.ContactMaterial(carMaterial, objectMaterial, {
    friction: 0.3,
    restitution: 0.7
  });
  world.addContactMaterial(contactMaterial);

  // Générer des quilles (cylindres fins) et des blocs (cubes) à renverser
  const pins = [];
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * 60 - 30;
    const z = Math.random() * 60 - 30;
    // Visuel
    const pinMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 2, 16),
      new THREE.MeshPhongMaterial({ color: 0xffffff })
    );
    pinMesh.position.set(x, 1, z);
    scene.add(pinMesh);
    // Physique
    const pinBody = new CANNON.Body({ 
      mass: 0.5,
      material: objectMaterial,
      linearDamping: 0.4,
      angularDamping: 0.4
    });
    pinBody.addShape(new CANNON.Cylinder(0.3, 0.3, 2, 16));
    pinBody.position.set(x, 1, z);
    world.addBody(pinBody);
    pins.push({ mesh: pinMesh, body: pinBody });
  }
  // Blocs
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * 60 - 30;
    const z = Math.random() * 60 - 30;
    const blockMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshPhongMaterial({ color: 0xff4444 })
    );
    blockMesh.position.set(x, 0.5, z);
    scene.add(blockMesh);
    const blockBody = new CANNON.Body({ 
      mass: 1,
      material: objectMaterial,
      linearDamping: 0.4,
      angularDamping: 0.4
    });
    blockBody.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
    blockBody.position.set(x, 0.5, z);
    world.addBody(blockBody);
    pins.push({ mesh: blockMesh, body: blockBody });
  }
  // Synchronisation dans animatePhysics
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

  // Matériaux avec friction élevée
  const groundMaterial = new CANNON.Material('ground');
  const carMaterial = new CANNON.Material('car');
  const contact = new CANNON.ContactMaterial(groundMaterial, carMaterial, {
    friction: 1.0, // friction maximale
    restitution: 0.1
  });
  world.addContactMaterial(contact);

  // Châssis (box)
  carBody = new CANNON.Body({
    mass: 4,
    shape: new CANNON.Box(new CANNON.Vec3(1, 0.3, 2)),
    position: new CANNON.Vec3(0, 1.2, 0), // centre de masse abaissé
    angularDamping: 0.7,
    linearDamping: 0.3,
    material: carMaterial,
    collisionFilterGroup: 1,
    collisionFilterMask: -1
  });
  world.addBody(carBody);

  // RaycastVehicle
  vehicle = new CANNON.RaycastVehicle({
    chassisBody: carBody,
    indexRightAxis: 0, // x
    indexUpAxis: 1,    // y
    indexForwardAxis: 2 // z
  });
  // Ajout des 4 roues (y = -0.6)
  const wheelOptions = {
    radius: 0.4,
    directionLocal: new CANNON.Vec3(0, -1, 0),
    suspensionStiffness: 90,
    suspensionRestLength: 0.25,
    frictionSlip: 14, // fun mais stable
    dampingRelaxation: 7,
    dampingCompression: 8,
    maxSuspensionForce: 100000,
    rollInfluence: 0.01,
    axleLocal: new CANNON.Vec3(-1, 0, 0),
    chassisConnectionPointLocal: undefined, // à définir pour chaque roue
    maxSuspensionTravel: 0.3,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true,
    collisionFilterGroup: 1,
    collisionFilterMask: -1
  };
  // Avant droit
  wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3( 0.9, -0.6,  1.7);
  vehicle.addWheel({ ...wheelOptions });
  // Avant gauche
  wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(-0.9, -0.6,  1.7);
  vehicle.addWheel({ ...wheelOptions });
  // Arrière droit
  wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3( 0.9, -0.6, -1.7);
  vehicle.addWheel({ ...wheelOptions });
  // Arrière gauche
  wheelOptions.chassisConnectionPointLocal = new CANNON.Vec3(-0.9, -0.6, -1.7);
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
  if (carBody.velocity.length() > 15) {
    carBody.velocity.scale(15 / carBody.velocity.length(), carBody.velocity);
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
