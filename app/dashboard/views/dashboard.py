# -*- coding: utf-8 -*-
"""Dashboard views."""
from app.common.views import *
from app.dashboard.models import ConnectionLog, RaceLog

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
        "energy": 0,
        "motor_power": 0,
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