# app/dashboard/dashboard_views.py
from flask import (
    Blueprint, session, redirect, url_for,
    render_template, request, jsonify, g
)
from flask_login import current_user, login_required
from app.user.models import ConnectionLog
from app.utils import permission_required
import os, time
from ping3 import ping


dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")

# ──────────────────────────────────────────────────────────────────────────────
# Données de configuration & cache en mémoire
# ──────────────────────────────────────────────────────────────────────────────
connection_info = {
    "ip": os.getenv("ROBOT_IP", "192.168.1.100"),
    "mac": os.getenv("ROBOT_MAC", "00:00:00:00:00:00"),
}

def _default_payload():
    return {
        "timestamp": 0,
        "mode": "simu",  # simu | manuel | auto
        "track": [],
        "speed": 0,
        "distance": 0,
        "battery": 100,
        "energy": 0,
        "motor_power": 0,
        "telemetry": 0,
        "encoders": 0,
        "alerts": [],
    }

LATEST_DATA = _default_payload()

# ──────────────────────────────────────────────────────────────────────────────
# Hooks & helpers
# ──────────────────────────────────────────────────────────────────────────────
@dashboard_bp.before_request
def load_theme():
    g.theme = request.cookies.get("theme", "dark")

# ──────────────────────────────────────────────────────────────────────────────
# Redirection racine vers la config/connexion
# ──────────────────────────────────────────────────────────────────────────────
@dashboard_bp.route("/")
@login_required
@permission_required("dashboard")
def index():
    return redirect(url_for("dashboard.connect"))

# ──────────────────────────────────────────────────────────────────────────────
# Page de connexion / configuration réseau
# ──────────────────────────────────────────────────────────────────────────────
@dashboard_bp.route("/connect", methods=["GET", "POST"])
@login_required
@permission_required("dashboard")
def connect():
    last_log = ConnectionLog.get_last_connectionlog("dashboard")
    if request.method == "POST":
        session["dashboard_connected"] = True
        return redirect(url_for("dashboard.maps"))
    return render_template(
        "dashboard/connect.html",
        config_connection=connection_info,
        last_connection=last_log,
    )

# ──────────────────────────────────────────────────────────────────────────────
# Carte interactive (Navigation)
# ──────────────────────────────────────────────────────────────────────────────
@dashboard_bp.route("/maps")
@login_required
@permission_required("dashboard")
def maps():
    if not session.get("dashboard_connected"):
        return redirect(url_for("dashboard.connect"))
    current_user.log_connection("dashboard", "view_maps")
    return render_template(
        "dashboard/maps.html",
        config_connection=connection_info,
    )

# ──────────────────────────────────────────────────────────────────────────────
# Statistiques
# ──────────────────────────────────────────────────────────────────────────────
@dashboard_bp.route("/stats")
@login_required
@permission_required("dashboard")
def stats():
    if not session.get("dashboard_connected"):
        return redirect(url_for("dashboard.connect"))
    current_user.log_connection("dashboard", "view_stats")
    return render_template(
        "dashboard/stats.html",
        config_connection=connection_info,
    )

# ──────────────────────────────────────────────────────────────────────────────
# Pilotage
# ──────────────────────────────────────────────────────────────────────────────
@dashboard_bp.route("/pilotage")
@login_required
@permission_required("pilotage")
def pilotage():
    if not session.get("dashboard_connected"):
        return redirect(url_for("dashboard.connect"))
    return render_template(
        "dashboard/pilotage.html",
        config_connection=connection_info,
    )

# ──────────────────────────────────────────────────────────────────────────────
# API temps réel
# ──────────────────────────────────────────────────────────────────────────────
@dashboard_bp.route("/vehicle/data", methods=["GET", "POST"])
@login_required
@permission_required("dashboard")
def vehicle_data():
    global LATEST_DATA
    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        payload["timestamp"] = int(time.time())
        clean = _default_payload()
        clean.update({k: payload.get(k, clean[k]) for k in clean.keys()})
        LATEST_DATA = clean
        return jsonify({"status": "ok"})
    return jsonify(LATEST_DATA)

@dashboard_bp.route("/vehicle/control", methods=["POST"])
@login_required
@permission_required("dashboard")
def vehicle_control():
    data = request.get_json() or {}
    commande = "démarrer" if data.get("start") else "arrêter"
    return jsonify({"status": "success", "commande": commande})

@dashboard_bp.route("/vehicle/ping")
@login_required
@permission_required("dashboard")
def vehicle_ping():
    ip = connection_info["ip"]
    try:
        result = ping(ip, timeout=1)
        latency_ms = round(result * 1000, 2) if result is not None else None
        return jsonify({"connected": latency_ms is not None, "ping": latency_ms, "ip": ip})
    except Exception as exc:
        return jsonify({"connected": False, "ping": None, "ip": ip, "error": str(exc)})

@dashboard_bp.route("/log-disconnect", methods=["POST"])
@login_required
@permission_required("dashboard")
def log_disconnect():
    current_user.log_connection("dashboard", "déconnexion")
    return jsonify({"status": "logged"})
