// assets/js/dashboard/dash_maps.js
import { setText } from "./dash_common.js";

// ─── CONST ────────────────────────────────────────────────────────────────────
const MAX_TAIL_POINTS   = 500;
const SIM_STEP_MS       = 50;
const WORLD_MAX         = 1000;
const LINE_MIN_X        = WORLD_MAX/2 - 5;
const LINE_MAX_X        = WORLD_MAX/2 + 5;
const MIN_LAP_MS        = 20000;
const MAX_LAP_MS        = 40000;
const NUM_LAPS          = 5;
const OUTLINE_STEPS     = 300;
const CTRL_POINT_COUNT  = 8;
const CTRL_JITTER       = 20;

// ─── ÉTAT GLOBAL ──────────────────────────────────────────────────────────────
let trackData      = [];
let incomingPoints = [];
let interpPrev     = { x:0, y:0 };
let interpNext     = null;
let interpStartTs  = 0;
let currentPos     = { x: WORLD_MAX/2, y: WORLD_MAX/2 };
let lastAngleRad   = 0;
let simPos         = { ...currentPos };
let lapConfigs     = [];
let currentLap     = 0;
let lapProgress    = 0;
let lapCount       = 0;
let lastCrossTs    = 0;
let hoverInfo      = { lap: null, x:0, y:0 };
let zoom           = { scale:1, offX:0, offY:0 };
let targetZoom     = { scale:1, offX:0, offY:0 };

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const canvas       = document.getElementById("vehicleTrackCanvas");
  const modeSelector = document.getElementById("mode-selector");
  const startBtn     = document.getElementById("start-stop-btn");
  if (!canvas) {
    console.error("Canvas #vehicleTrackCanvas non trouvé");
    return;
  }
  if (!modeSelector) {
    console.error("Sélecteur #mode-selector non trouvé");
    return;
  }
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  // Redimensionnement
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // Génération des pistes
  generateLapConfigs();

  // État de simulation
  window.isRunning = false;
  function updateStartBtn() {
    if (modeSelector.value === "real") {
      startBtn.disabled = true;
      startBtn.innerHTML = `<i class=\"bi bi-play-fill\"></i> Démarrer`;
      window.isRunning = false;
    } else {
      startBtn.disabled = false;
      startBtn.innerHTML = window.isRunning
        ? `<i class=\"bi bi-stop-fill\"></i> Stop`
        : `<i class=\"bi bi-play-fill\"></i> Démarrer`;
    }
  }

  modeSelector.addEventListener("change", updateStartBtn);
  startBtn.addEventListener("click", () => {
    if (modeSelector.value !== "simu") return;
    window.isRunning = !window.isRunning;
    updateStartBtn();
  });
  updateStartBtn(); // état initial

  // Simulation continue
  setInterval(() => {
    if (modeSelector.value === "simu" && window.isRunning) {
      simulateStep(SIM_STEP_MS);
    }
  }, SIM_STEP_MS);

  // Hover
  canvas.addEventListener("mousemove", e => handleHover(e, canvas));

  // Rendu
  let lastTs = performance.now();
  function frame(ts) {
    const dt = ts - lastTs; lastTs = ts;

    // Lissage
    if (!interpNext && incomingPoints.length) {
      interpPrev    = { ...simPos };
      interpNext    = incomingPoints.shift();
      interpStartTs = ts;
    }
    if (interpNext) {
      const t = Math.min(1, (ts - interpStartTs) / 100);
      currentPos = {
        x: interpPrev.x + (interpNext.x - interpPrev.x) * t,
        y: interpPrev.y + (interpNext.y - interpPrev.y) * t
      };
      if (t === 1) interpNext = null;
    }

    checkLapCross(currentPos.x, currentPos.y, ts);
    updateTargetZoom(canvas.clientWidth, canvas.clientHeight);
    zoom.scale += (targetZoom.scale - zoom.scale) * 0.1;
    zoom.offX  += (targetZoom.offX  - zoom.offX) * 0.1;
    zoom.offY  += (targetZoom.offY  - zoom.offY) * 0.1;
    drawAll(ctx, canvas.clientWidth, canvas.clientHeight);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});

// ─── GÉNÉRATION DES CIRCUITS ───────────────────────────────────────────────────
function generateLapConfigs() {
  const ctrl = [];
  for (let i = 0; i < CTRL_POINT_COUNT; i++) {
    const theta = (i / CTRL_POINT_COUNT) * 2 * Math.PI;
    const R = 200 + (Math.random() * 50 - 25);
    ctrl.push({ x: WORLD_MAX/2 + Math.cos(theta) * R, y: WORLD_MAX/2 + Math.sin(theta) * R });
  }
  const base = catmullRomPath(ctrl, OUTLINE_STEPS);

  lapConfigs = [];
  for (let i = 0; i < NUM_LAPS; i++) {
    const duration = MIN_LAP_MS + Math.random() * (MAX_LAP_MS - MIN_LAP_MS);
    let outline = base;
    if (i > 0) {
      const perturbed = ctrl.map(p => ({
        x: p.x + (Math.random() * 2 - 1) * CTRL_JITTER,
        y: p.y + (Math.random() * 2 - 1) * CTRL_JITTER
      }));
      outline = catmullRomPath(perturbed, OUTLINE_STEPS);
    }
    const { lengths, totalLength } = computeLengths(outline);
    lapConfigs.push({ points: outline, lengths, totalLength, duration });
  }
}

function catmullRomPath(points, samples) {
  const out = [];
  const n = points.length;
  const seg = Math.ceil(samples / n);
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let j = 0; j < seg; j++) {
      const t = j / seg;
      out.push(catmullRom(p0, p1, p2, p3, t));
    }
  }
  return out.slice(0, samples);
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * ((2 * p1.y) + (p2.y - p0.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  };
}

function computeLengths(points) {
  const lengths = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.hypot(dx, dy);
    lengths.push(total);
  }
  return { lengths, totalLength: total };
}

function getPointOnPath(cfg, t) {
  const d = t * cfg.totalLength;
  let i = cfg.lengths.findIndex(len => len >= d);
  if (i < 0) i = cfg.points.length - 1;
  const prev = cfg.lengths[i - 1] || 0;
  const frac = (d - prev) / ((cfg.lengths[i] - prev) || 1);
  const a = cfg.points[i - 1] || cfg.points[0];
  const b = cfg.points[i];
  return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
}

function simulateStep(dt) {
  const cfg = lapConfigs[currentLap];
  lapProgress += dt;
  const t = Math.min(1, lapProgress / cfg.duration);
  const pos = getPointOnPath(cfg, t);

  simPos = { ...pos };
  const next = getPointOnPath(cfg, Math.min(1, (lapProgress + 10) / cfg.duration));
  lastAngleRad = Math.atan2(next.y - pos.y, next.x - pos.x);

  incomingPoints.push(pos);
  trackData.push(pos);

  setText("current-speed", ((cfg.totalLength / (cfg.duration / 1000)) * 3.6).toFixed(1));
  setText("distance-traveled", (lapProgress / 1000 * cfg.totalLength / (cfg.duration / 1000)).toFixed(1));
  setText("vehicle-direction", `${Math.round(lastAngleRad * 180 / Math.PI)}°`);

  if (lapProgress >= cfg.duration) {
    lapCount++;
    setText("lap-count", lapCount);
    lapProgress = 0;
    currentLap = Math.min(currentLap + 1, NUM_LAPS - 1);
    trackData = [];
    incomingPoints = [];
  }
}

function handleHover(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left - zoom.offX) / zoom.scale;
  const my = (e.clientY - rect.top - zoom.offY) / zoom.scale;
  hoverInfo = { lap: null, x: e.offsetX, y: e.offsetY };
  for (let i = 0; i < currentLap; i++) {
    const pts = lapConfigs[i].points;
    for (let j = 1; j < pts.length; j++) {
      if (distanceToSegment(mx, my, pts[j - 1], pts[j]) < 5 / zoom.scale) {
        hoverInfo.lap = i;
        return;
      }
    }
  }
}

function drawAll(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
    ctx.translate(zoom.offX, zoom.offY);
    ctx.scale(zoom.scale, zoom.scale);

    lapConfigs.slice(0, currentLap).forEach((cfg, idx) => {
      ctx.save();
        ctx.lineWidth = 2 / zoom.scale;
        ctx.strokeStyle = idx === hoverInfo.lap
          ? "rgba(200,100,255,0.9)"
          : `rgba(108,99,255,${0.1 + 0.15 * (currentLap - idx)})`;
        ctx.beginPath();
        const P = cfg.points;
        ctx.moveTo(P[0].x, P[0].y);
        P.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath(); ctx.stroke();
      ctx.restore();
    });

    if (trackData.length > 2) {
      ctx.save();
        ctx.strokeStyle = "#6C63FF";
        ctx.lineWidth = 3 / zoom.scale;
        ctx.beginPath();
        const D = trackData;
        ctx.moveTo(D[0].x, D[0].y);
        for (let i = 1; i < D.length - 1; i++) {
          const xc = (D[i].x + D[i + 1].x) / 2; const yc = (D[i].y + D[i + 1].y) / 2;
          ctx.quadraticCurveTo(D[i].x, D[i].y, xc, yc);
        }
        ctx.lineTo(D[D.length - 1].x, D[D.length - 1].y);
        ctx.stroke();
      ctx.restore();
    }

    // Triangle voiture
    ctx.save();
      ctx.translate(simPos.x, simPos.y);
      ctx.rotate(lastAngleRad);
      ctx.fillStyle = "#FF4B4B";
      ctx.beginPath();
      ctx.moveTo(0, -7 / zoom.scale);
      ctx.lineTo(12 / zoom.scale, 0);
      ctx.lineTo(0, 7 / zoom.scale);
      ctx.closePath(); ctx.fill();
    ctx.restore();
  ctx.restore();

  if (hoverInfo.lap != null) {
    ctx.save();
      ctx.resetTransform();
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText(`Tour ${hoverInfo.lap+1}`, hoverInfo.x + 10, hoverInfo.y + 10);
    ctx.restore();
  }
}

function checkLapCross(x, y, ts) {
  if (x > LINE_MIN_X && x < LINE_MAX_X && ts - lastCrossTs > 1000) {
    lastCrossTs = ts;
  }
}

function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

function distanceToSegment(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = ((x - a.x) * dx + (y - a.y) * dy) / (dx*dx + dy*dy);
  const tt = Math.max(0, Math.min(1, t));
  const px = a.x + dx * tt, py = a.y + dy * tt;
  return Math.hypot(x - px, y - py);
}

function updateTargetZoom(w, h) {
  const xs = trackData.map(p => p.x).concat(simPos.x);
  const ys = trackData.map(p => p.y).concat(simPos.y);
  let minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  minX = clamp(minX, 0, WORLD_MAX); maxX = clamp(maxX, 0, WORLD_MAX);
  minY = clamp(minY, 0, WORLD_MAX); maxY = clamp(maxY, 0, WORLD_MAX);
  const padX = (maxX - minX) * 0.1 || 1;
  const padY = (maxY - minY) * 0.1 || 1;
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;
  const scale = Math.min(w/(maxX-minX), h/(maxY-minY));
  const offX = (w - (maxX-minX)*scale)/2 - minX*scale;
  const offY = (h - (maxY-minY)*scale)/2 - minY*scale;
  targetZoom = { scale, offX, offY };
}

function updateMetrics(d) {
  setText("current-speed", d.speed);
  setText("distance-traveled", d.distance);
  setText("vehicle-direction", d.direction);
}