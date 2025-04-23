# -*- coding: utf-8 -*-
"""Dashboard views."""
from app.common.views import *
from app.dashboard.models import ConnectionLog, RaceLog
import random

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")

connection_info = {
    "ip": os.getenv("ROBOT_IP", "192.168.1.100"),
    "mac": os.getenv("ROBOT_MAC", "00:00:00:00:00:00"),
}

def _default_payload():
    return {
        "timestamp": 0,
        "mode": "simu",
        "track": [],
        "speed": 0,
        "distance": 0,
        "battery": 100,
        "battery_voltage": 12.6,
        "battery_temp": 25,
        "energy": 0,
        "current": 0,
        "motor_power": 0,
        "motor_speed": 0,
        "motor_temp": 25,
        "telemetry": 0,
        "encoders": 0,
        "alerts": [],
    }

LATEST_DATA = _default_payload()

@dashboard_bp.route("/")
@login_required
@permission_required("dashboard")
def index():
    return redirect(url_for("dashboard.connect"))

@dashboard_bp.route("/connect", methods=["GET", "POST"])
@login_required
@permission_required("dashboard")
def connect():
    last_log = ConnectionLog.get_last_connectionlog("dashboard")
    if request.method == "POST":
        action = request.form.get("action")
        session["dashboard_connected"] = True
        session["dashboard_mode"] = "simu" if action == "simulate" else "real"

        next_page = session.pop("dashboard_next", None)
        if next_page and next_page.startswith("/dashboard"):
            return redirect(next_page)
        return redirect(url_for("dashboard.maps"))

    return render_template(
        "dashboard/connect.html",
        config_connection=connection_info,
        last_connection=last_log,
    )

@dashboard_bp.route("/maps")
@login_required
@permission_required("dashboard")
def maps():
    if not session.get("dashboard_connected"):
        session["dashboard_next"] = request.path
        return redirect(url_for("dashboard.connect"))
    current_user.log_connection("dashboard", "view_maps")
    return render_template(
        "dashboard/maps.html",
        config_connection=connection_info,
    )

@dashboard_bp.route("/stats")
@login_required
@permission_required("dashboard")
def stats():
    if not session.get("dashboard_connected"):
        session["dashboard_next"] = request.path
        return redirect(url_for("dashboard.connect"))
    current_user.log_connection("dashboard", "view_stats")
    return render_template(
        "dashboard/stats.html",
        config_connection=connection_info,
    )

@dashboard_bp.route("/pilotage")
@login_required
@permission_required("pilotage")
def pilotage():
    if not session.get("dashboard_connected"):
        session["dashboard_next"] = request.path
        return redirect(url_for("dashboard.connect"))
    return render_template(
        "dashboard/pilotage.html",
        config_connection=connection_info,
    )

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
    
    # En mode simulation, générer des données réalistes
    if session.get("dashboard_mode") == "simu":
        current_time = time.time()
        if LATEST_DATA["timestamp"] == 0:
            LATEST_DATA["timestamp"] = current_time
        
        # Simuler la décharge de la batterie
        time_diff = current_time - LATEST_DATA["timestamp"]
        if time_diff > 1:  # Mettre à jour toutes les secondes
            # Simuler la consommation en fonction de la puissance moteur
            power_factor = LATEST_DATA["motor_power"] / 100  # 100W max
            battery_drain = 0.1 * power_factor  # 0.1% par seconde à pleine puissance
            
            # Mettre à jour les données
            LATEST_DATA["battery"] = max(0, LATEST_DATA["battery"] - battery_drain)
            LATEST_DATA["battery_voltage"] = 10 + (LATEST_DATA["battery"] / 100) * 2.6  # 10-12.6V
            LATEST_DATA["battery_temp"] = 20 + (LATEST_DATA["battery"] / 100) * 10  # 20-30°C
            
            # Simuler la puissance moteur et la vitesse
            if random.random() < 0.3:  # 30% de chance de changement
                LATEST_DATA["motor_power"] = random.randint(0, 100)
                LATEST_DATA["motor_speed"] = int(LATEST_DATA["motor_power"] * 10)  # 0-1000 tr/min
                LATEST_DATA["motor_temp"] = 25 + (LATEST_DATA["motor_power"] / 100) * 20  # 25-45°C
            
            # Simuler la consommation d'énergie
            LATEST_DATA["current"] = LATEST_DATA["motor_power"] / LATEST_DATA["battery_voltage"]
            LATEST_DATA["energy"] += LATEST_DATA["motor_power"] / 3600  # Wh par seconde
            
            # Simuler la télémétrie
            LATEST_DATA["telemetry"] = random.randint(10, 200)  # 10-200 cm
            LATEST_DATA["distance"] += LATEST_DATA["motor_speed"] * 0.001  # mètres par seconde
            
            LATEST_DATA["timestamp"] = current_time
    
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

@dashboard_bp.route("/mode", methods=["POST"])
@login_required
@permission_required("dashboard")
def mode():
    data = request.get_json(silent=True) or {}
    mode = data.get("mode")
    if mode in ["simu", "real"]:
        session["dashboard_mode"] = mode
        return jsonify({"status": "ok", "mode": mode})
    return jsonify({"status": "error", "message": "Mode invalide"}), 400

@dashboard_bp.route("/disconnect", methods=["POST"])
@login_required
@permission_required("dashboard")
def disconnect():
    session.pop("dashboard_connected", None)
    session.pop("dashboard_mode", None)
    current_user.log_connection("dashboard", "déconnexion")
    return jsonify({"status": "ok"}) 