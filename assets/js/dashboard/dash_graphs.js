// assets/js/dashboard/dash_graphs.js
import { setText } from "./dash_common.js";

//
// ─── CONST ────────────────────────────────────────────────────────────────────
//
const MAX_TAIL_POINTS   = 500;
const INTERP_MS         = 100;   // interpolation duration
const SIM_STEP_MS       = 50;    // simulation step interval
const WORLD_MAX         = 1000;  // 1 km × 1 km
const JITTER_MAX        = 0.3;   // 30 cm max de dérive
const LINE_MIN_X        = WORLD_MAX/2 - 5;
const LINE_MAX_X        = WORLD_MAX/2 + 5;
const MIN_LAP_MS        = 30000;
const MAX_LAP_MS        = 60000;

//
// ─── ÉTAT GLOBAL ──────────────────────────────────────────────────────────────
//
let trackData      = [];
let incomingPoints = [];

let interpPrev     = { x:0,   y:0 };
let interpNext     = null;
let interpStartTs  = 0;
let currentPos     = { x:0,   y:0 };
let lastAngleRad   = 0;

let lastSimTs      = 0;
let simPhase       = "wander";    // wander → follow
let lapCount       = 0;
let lastCrossTs    = 0;

let wanderOutline  = [];
let followIndex    = 0;
let trackOutline   = []; // ← Contour du circuit généré


// pour wander paramétré
let wanderT        = 0;
const lapDuration  = MIN_LAP_MS + Math.random()*(MAX_LAP_MS-MIN_LAP_MS);
const wanderSpeed  = 2*Math.PI / lapDuration; // rad/ms

// zoom fluide
let zoom = { scale:1, offX:0, offY:0 };
let targetZoom = { scale:1, offX:0, offY:0 };

//
// ─── BOUCLE 60 FPS ─────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("vehicleTrackCanvas");
  const ctx    = canvas.getContext("2d");
  const dpr    = window.devicePixelRatio||1;
  const rect   = canvas.getBoundingClientRect();
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr,dpr);

  // init au centre
  currentPos = { x: WORLD_MAX/2, y: WORLD_MAX/2 };

  let lastTs = performance.now();
  function frame(ts) {
    const dt = ts - lastTs;
    lastTs = ts;

    // ── interpolation ──────────────────────────────────────────────────────────
    if (!interpNext && incomingPoints.length) {
      interpPrev    = { ...currentPos };
      interpNext    = incomingPoints.shift();
      interpStartTs = ts;
    }
    if (interpNext) {
      const t = Math.min(1, (ts - interpStartTs)/INTERP_MS);
      currentPos = {
        x: interpPrev.x + (interpNext.x - interpPrev.x)*t,
        y: interpPrev.y + (interpNext.y - interpPrev.y)*t
      };
      if (t === 1) interpNext = null;
    }

    // ── simu vs réel ──────────────────────────────────────────────────────────
    const mode = document.getElementById("mode-selector")?.value||"simu";
    if (mode==="simu" && ts - lastSimTs > SIM_STEP_MS) {
      lastSimTs = ts;
      simulateStep(dt);
    }
    if (mode!=="simu" && Math.floor(ts/1000)!==Math.floor((ts-dt)/1000)) {
      fetchRealData();
    }

    // ── tours ──────────────────────────────────────────────────────────────────
    checkLapCross(currentPos.x, currentPos.y, ts);

    // ── calcul zoom cible ──────────────────────────────────────────────────────
    updateTargetZoom(rect.width, rect.height);

    // ── interpolate zoom ──────────────────────────────────────────────────────
    zoom.scale += (targetZoom.scale - zoom.scale)*0.1;
    zoom.offX  += (targetZoom.offX  - zoom.offX )*0.1;
    zoom.offY  += (targetZoom.offY  - zoom.offY )*0.1;

    // ── dessin ─────────────────────────────────────────────────────────────────
    drawAll(ctx, rect.width, rect.height);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});

//
// ─── SIMULATION ────────────────────────────────────────────────────────────────
function simulateStep(dt) {
  if (simPhase==="wander") {
    wanderT += wanderSpeed * dt;
    // position sur un cercle virtuel de R=200 m + bruit
    const R = 200;
    const x = WORLD_MAX/2 + Math.cos(wanderT)*R + (Math.random()*2-1)*JITTER_MAX;
    const y = WORLD_MAX/2 + Math.sin(wanderT)*R + (Math.random()*2-1)*JITTER_MAX;
    const pt = { x,y };
    incomingPoints.push(pt);
    wanderOutline.push(pt);
    trackData.push(pt);
    if (trackData.length>MAX_TAIL_POINTS) trackData.shift();

    lastAngleRad = wanderT + Math.PI/2;

    // dès qu'on dépasse 2π → on a un tour complet
    if (wanderT >= 2*Math.PI) {
      simPhase    = "follow";
      trackOutline = [...wanderOutline];
      wanderOutline = [];
      followIndex = 0;
      wanderT = 0;
    }
    updateMetrics({
      speed:     ((2*Math.PI*200)/(lapDuration/1000)).toFixed(1),
      distance:  ((wanderT/(2*Math.PI))*2*Math.PI*200).toFixed(1),
      direction: `${Math.round((wanderT*180/Math.PI)+90)}°`
    });
  }
  else {
    // follow l'outline en bouclant
    if (trackOutline.length<2) return;
    followIndex = (followIndex + 1) % trackOutline.length;
    const pt = trackOutline[followIndex];
    incomingPoints.push(pt);
    trackData.push(pt);
    if (trackData.length>MAX_TAIL_POINTS) trackData.shift();
    // angle entre pt et suivant
    const nxt = trackOutline[(followIndex+1)%trackOutline.length];
    lastAngleRad = Math.atan2(nxt.y-pt.y, nxt.x-pt.x);
    updateMetrics({
      speed:     "—",
      distance:  trackData.length.toFixed(1),
      direction: `${Math.round(lastAngleRad*180/Math.PI)}°`
    });
  }
}

//
// ─── PULL RÉEL ─────────────────────────────────────────────────────────────────
function fetchRealData() {
  fetch("/dashboard/vehicle/data")
    .then(r=>r.ok ? r.json() : Promise.reject(r.status))
    .then(d => {
      if (Array.isArray(d.track)) {
        const arr = d.track.slice(-MAX_TAIL_POINTS).map(([x,y])=>({x,y}));
        trackData      = arr;
        incomingPoints = [arr[arr.length-1]];
      }
      if (d.direction) lastAngleRad = parseFloat(d.direction)*Math.PI/180;
      updateMetrics(d);
    })
    .catch(console.error);
}

//
// ─── ZOOM DYNAMIQUE ────────────────────────────────────────────────────────────
function updateTargetZoom(w,h) {
  const xs = trackData.map(p=>p.x).concat(currentPos.x);
  const ys = trackData.map(p=>p.y).concat(currentPos.y);
  let minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  // on limite au WORLD_MAX
  minX = clamp(minX, 0, WORLD_MAX);
  minY = clamp(minY, 0, WORLD_MAX);
  maxX = clamp(maxX, 0, WORLD_MAX);
  maxY = clamp(maxY, 0, WORLD_MAX);
  // marge 10 %
  const padX = (maxX-minX)*0.1||1;
  const padY = (maxY-minY)*0.1||1;
  minX -= padX; maxX += padX;
  minY -= padY; maxY += padY;
  const rangeX = maxX-minX;
  const rangeY = maxY-minY;
  const scale  = Math.min(w/rangeX, h/rangeY);
  const offX   = (w - rangeX*scale)/2 - minX*scale;
  const offY   = (h - rangeY*scale)/2 - minY*scale;
  targetZoom = { scale, offX, offY };
}

//
// ─── DESSIN ────────────────────────────────────────────────────────────────────
function drawAll(ctx, w, h) {
  ctx.clearRect(0,0,w,h);

  // applique zoom courant
  ctx.save();
    ctx.translate(zoom.offX, zoom.offY);
    ctx.scale(zoom.scale, zoom.scale);

    // circuit (outline)
    if (trackOutline.length>1) {
      ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.setLineDash([5,5]);
        ctx.lineWidth = 2/zoom.scale; // 2px constant
        ctx.beginPath();
        const T = trackOutline;
        ctx.moveTo(T[0].x,T[0].y);
        for (let i=1; i<T.length; i++) ctx.lineTo(T[i].x,T[i].y);
        ctx.closePath();
        ctx.stroke();
      ctx.restore();
    }

    // trajectoire lissée
    if (trackData.length>2) {
      ctx.save();
        ctx.strokeStyle = "#6C63FF";
        ctx.lineWidth   = 3/zoom.scale; // 3px constant
        ctx.beginPath();
        const D = trackData;
        ctx.moveTo(D[0].x, D[0].y);
        for (let i=1; i<D.length-1; i++) {
          const xc = (D[i].x+D[i+1].x)/2;
          const yc = (D[i].y+D[i+1].y)/2;
          ctx.quadraticCurveTo(D[i].x, D[i].y, xc, yc);
        }
        ctx.lineTo(D[D.length-1].x, D[D.length-1].y);
        ctx.stroke();
      ctx.restore();
    }

    // voiture (triangle) en 15px
    ctx.save();
      ctx.translate(currentPos.x, currentPos.y);
      ctx.rotate(lastAngleRad);
      ctx.fillStyle = "#6C63FF";
      ctx.beginPath();
      ctx.moveTo(0, -7/zoom.scale);
      ctx.lineTo(12/zoom.scale, 0);
      ctx.lineTo(0, 7/zoom.scale);
      ctx.closePath();
      ctx.fill();
    ctx.restore();

  ctx.restore();
}

//
// ─── TOURS ─────────────────────────────────────────────────────────────────────
function checkLapCross(x,y, ts) {
  if (x>LINE_MIN_X && x<LINE_MAX_X && ts - lastCrossTs>1000) {
    lapCount++;
    setText("lap-count", lapCount);
    lastCrossTs = ts;
  }
}

//
// ─── UTILS ─────────────────────────────────────────────────────────────────────
function clamp(v,min,max){ return v<min?min:v>max?max:v; }

function updateMetrics(d) {
  setText("current-speed",     d.speed);
  setText("distance-traveled", d.distance);
  setText("vehicle-direction", d.direction);
  setText("lap-count",         lapCount);
}
