// assets/js/dashboard/dash_graphs.js
import { setText } from "./dash_common.js";

//
// ─── CONST ────────────────────────────────────────────────────────────────────
//
const MAX_TAIL_POINTS   = 500;
const SIM_STEP_MS       = 50;
const WORLD_MAX         = 1000;
const JITTER_MAX        = 0.3;
const LINE_MIN_X        = WORLD_MAX/2 - 5;
const LINE_MAX_X        = WORLD_MAX/2 + 5;

const MIN_LAP_MS        = 20000;
const MAX_LAP_MS        = 40000;
const NUM_LAPS          = 5;
const OUTLINE_STEPS     = 300;

//
// ─── ÉTAT GLOBAL ──────────────────────────────────────────────────────────────
//
let trackData = [];
let incomingPoints = [];

let interpPrev    = { x:0, y:0 };
let interpNext    = null;
let interpStartTs = 0;
let currentPos    = { x: WORLD_MAX/2, y: WORLD_MAX/2 };
let lastAngleRad  = 0;

let lastSimTs     = 0;
let lapCount      = 0;
let lastCrossTs   = 0;

let lapConfigs    = [];
let currentLap    = 0;
let lapProgress   = 0;

let hoverInfo     = { lap: null, x:0, y:0 };

let zoom = { scale:1, offX:0, offY:0 };
let targetZoom = { scale:1, offX:0, offY:0 };

//
// ─── BOUCLE 60 FPS ─────────────────────────────────────────────────────────────
//
document.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("vehicleTrackCanvas");
  const ctx    = canvas.getContext("2d");
  const dpr    = window.devicePixelRatio||1;
  const rect   = canvas.getBoundingClientRect();
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr,dpr);

  generateLapConfigs();
  canvas.addEventListener("mousemove", e => handleHover(e, canvas));

  let lastTs = performance.now();
  function frame(ts) {
    const dt = ts - lastTs;
    lastTs = ts;

    // ── interpolation ──────────────────────────────────────────────────────────
    if (!interpNext && incomingPoints.length) {
      interpPrev = { ...currentPos };
      interpNext = incomingPoints.shift();
      interpStartTs = ts;
    }
    if (interpNext) {
      const t = Math.min(1, (ts - interpStartTs)/100);
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

    // ── tours ──────────────────────────────────────────────────────────────────
    checkLapCross(currentPos.x, currentPos.y, ts);

    // ── calcul zoom cible ──────────────────────────────────────────────────────
    updateTargetZoom(rect.width, rect.height);

    // ── interpolate zoom ──────────────────────────────────────────────────────
    zoom.scale += (targetZoom.scale - zoom.scale)*0.1;
    zoom.offX  += (targetZoom.offX  - zoom.offX)*0.1;
    zoom.offY  += (targetZoom.offY  - zoom.offY)*0.1;

    // ── dessin ─────────────────────────────────────────────────────────────────
    drawAll(ctx, rect.width, rect.height);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});

//
// ─── GÉNÉRATION DES TOURS ──────────────────────────────────────────────────────
//
function generateLapConfigs() {
  const durations = Array.from({length:NUM_LAPS}, () =>
    MIN_LAP_MS + Math.random()*(MAX_LAP_MS - MIN_LAP_MS)
  );
  const base = [];
  for (let i=0; i<OUTLINE_STEPS; i++) {
    const theta = (i/OUTLINE_STEPS)*2*Math.PI;
    const R = 200 + (Math.random()*2-1)*JITTER_MAX;
    base.push({
      x: WORLD_MAX/2 + Math.cos(theta)*R,
      y: WORLD_MAX/2 + Math.sin(theta)*R
    });
  }
  const baseWithLen = computeLengths(base);

  lapConfigs = durations.map((duration, idx) => {
    let pts = base;
    if (idx > 0) {
      pts = base.map(p => ({
        x: p.x + (Math.random()*2-1)*JITTER_MAX,
        y: p.y + (Math.random()*2-1)*JITTER_MAX
      }));
    }
    return { ...computeLengths(pts), duration };
  });
}

//
// ─── CALCUL DES LONGUEURS CUMULÉES ─────────────────────────────────────────────
//
function computeLengths(points) {
  const lengths = [0];
  let total = 0;
  for (let i=1; i<points.length; i++) {
    const dx = points[i].x - points[i-1].x;
    const dy = points[i].y - points[i-1].y;
    total += Math.hypot(dx, dy);
    lengths.push(total);
  }
  return { points, lengths, totalLength: total };
}

//
// ─── INTERPOLATION LE LONG DU TRACÉ ─────────────────────────────────────────────
//
function getPointOnPath(cfg, t) {
  const { points, lengths, totalLength } = cfg;
  const d = t * totalLength;
  let i = lengths.findIndex(len => len >= d);
  if (i < 0) i = points.length - 1;
  const prevLen = lengths[i-1] || 0;
  const nextLen = lengths[i];
  const frac = (d - prevLen)/(nextLen - prevLen || 1);
  const p0 = points[i-1] || points[0];
  const p1 = points[i];
  return {
    x: p0.x + (p1.x-p0.x)*frac,
    y: p0.y + (p1.y-p0.y)*frac
  };
}

//
// ─── SIMULATION ────────────────────────────────────────────────────────────────
//
function simulateStep(dt) {
  const cfg = lapConfigs[currentLap];
  lapProgress += dt;
  const t = Math.min(1, lapProgress / cfg.duration);
  const pos = getPointOnPath(cfg, t);
  incomingPoints.push(pos);
  trackData.push(pos);
  if (trackData.length > MAX_TAIL_POINTS) trackData.shift();

  const next = getPointOnPath(cfg, Math.min(1, (lapProgress + 10)/cfg.duration));
  lastAngleRad = Math.atan2(next.y - pos.y, next.x - pos.x);

  updateMetrics({
    speed: ((cfg.totalLength/(cfg.duration/1000))*3.6).toFixed(1),
    distance: (lapProgress/1000*cfg.totalLength/(cfg.duration/1000)).toFixed(1),
    direction: `${Math.round(lastAngleRad*180/Math.PI)}°`
  });

  if (lapProgress >= cfg.duration) {
    lapCount++;
    setText("lap-count", lapCount);
    lapProgress = 0;
    currentLap = Math.min(currentLap+1, NUM_LAPS-1);
  }
}

//
// ─── SURVOL POUR COUCHES ANTÉRIEURES ───────────────────────────────────────────
//
function handleHover(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left - zoom.offX)/zoom.scale;
  const my = (e.clientY - rect.top  - zoom.offY)/zoom.scale;
  hoverInfo = { lap: null, x: e.offsetX, y: e.offsetY };
  for (let i=0; i<currentLap; i++) {
    const { points } = lapConfigs[i];
    for (let j=1; j<points.length; j++) {
      const a = points[j-1], b = points[j];
      const d = distanceToSegment(mx,my,a,b);
      if (d < 5/zoom.scale) {
        hoverInfo.lap = i;
        return;
      }
    }
  }
}

//
// ─── CALCUL DE DISTANCE AU SEGMENT ────────────────────────────────────────────
//
function distanceToSegment(x,y,a,b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = ((x - a.x)*dx + (y - a.y)*dy)/(dx*dx + dy*dy);
  const tt = Math.max(0, Math.min(1, t));
  const px = a.x + dx*tt, py = a.y + dy*tt;
  return Math.hypot(x-px, y-py);
}

//
// ─── ZOOM DYNAMIQUE ────────────────────────────────────────────────────────────
//
function updateTargetZoom(w,h) {
  const xs = trackData.map(p=>p.x).concat(currentPos.x);
  const ys = trackData.map(p=>p.y).concat(currentPos.y);
  let minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  minX = clamp(minX,0,WORLD_MAX); maxX = clamp(maxX,0,WORLD_MAX);
  minY = clamp(minY,0,WORLD_MAX); maxY = clamp(maxY,0,WORLD_MAX);
  const padX = (maxX-minX)*0.1||1, padY = (maxY-minY)*0.1||1;
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;
  const scale = Math.min(w/(maxX-minX), h/(maxY-minY));
  const offX  = (w - (maxX-minX)*scale)/2 - minX*scale;
  const offY  = (h - (maxY-minY)*scale)/2 - minY*scale;
  targetZoom = { scale, offX, offY };
}

//
// ─── DESSIN ────────────────────────────────────────────────────────────────────
//
function drawAll(ctx, w, h) {
  ctx.clearRect(0,0,w,h);
  ctx.save();
  ctx.translate(zoom.offX, zoom.offY);
  ctx.scale(zoom.scale, zoom.scale);

  // ── couches des anciens tours ───────────────────────────────────────────────
  lapConfigs.slice(0, currentLap).forEach((cfg, idx) => {
    ctx.save();
      ctx.lineWidth = 2/zoom.scale;
      ctx.strokeStyle = idx === hoverInfo.lap
        ? "rgba(200,100,255,0.9)"
        : `rgba(108,99,255,${0.1 + 0.15*(currentLap - idx)})`;
      ctx.beginPath();
      const pts = cfg.points;
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath(); ctx.stroke();
    ctx.restore();
  });

  // ── trajectoire lissée ──────────────────────────────────────────────────────
  if (trackData.length>2) {
    ctx.save();
      ctx.strokeStyle = "#6C63FF";
      ctx.lineWidth   = 3/zoom.scale;
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

  // ── voiture (triangle) ──────────────────────────────────────────────────────
  ctx.save();
    ctx.translate(currentPos.x, currentPos.y);
    ctx.rotate(lastAngleRad);
    ctx.fillStyle = "#6C63FF";
    ctx.beginPath();
    ctx.moveTo(0,-7/zoom.scale);
    ctx.lineTo(12/zoom.scale,0);
    ctx.lineTo(0,7/zoom.scale);
    ctx.closePath(); ctx.fill();
  ctx.restore();

  ctx.restore();

  // ── label survol ────────────────────────────────────────────────────────────
  if (hoverInfo.lap != null) {
    ctx.save();
      ctx.resetTransform();
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText(`Tour ${hoverInfo.lap+1}`, hoverInfo.x+10, hoverInfo.y+10);
    ctx.restore();
  }
}

//
// ─── TOURS ─────────────────────────────────────────────────────────────────────
//
function checkLapCross(x,y, ts){
  if(x>LINE_MIN_X && x<LINE_MAX_X && ts - lastCrossTs>1000){
    lastCrossTs = ts;
  }
}

//
// ─── UTILS ─────────────────────────────────────────────────────────────────────
//
function clamp(v,min,max){ return v<min?min:v>max?max:v; }
function updateMetrics(d){
  setText("current-speed", d.speed);
  setText("distance-traveled", d.distance);
  setText("vehicle-direction", d.direction);
}