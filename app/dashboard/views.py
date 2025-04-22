from flask import (
    Blueprint, session, redirect, url_for,
    render_template, request, jsonify, g
)
from flask_login import current_user, login_required
from app.dashboard.models import ConnectionLog, RaceLog
from app.utils import permission_required
import os, time
from ping3 import ping
from datetime import datetime, timedelta
from sqlalchemy import and_, or_

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

@dashboard_bp.before_request
def load_theme():
    g.theme = request.cookies.get("theme", "dark")

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


historique_bp = Blueprint("historique", __name__, url_prefix="/dashboard/historique")


@historique_bp.route("/")
@login_required
@permission_required("dashboard")
def home():
    """Page principale de l'historique des courses."""
    return render_template("dashboard/historique.html")

@historique_bp.route("/api/courses")
@login_required
@permission_required("dashboard")
def api_courses():
    """API pour récupérer l'historique des courses avec pagination et filtres."""
    # Récupération des paramètres de pagination
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    
    # Récupération des filtres
    q = request.args.get('q', '')
    date_debut = request.args.get('date_debut')
    date_fin = request.args.get('date_fin')
    type_course = request.args.get('type_course')
    statut = request.args.get('statut')
    role_utilisateur = request.args.get('role_utilisateur')
    
    # Construction de la requête de base
    query = RaceLog.query
    
    # Application des filtres
    if q:
        query = query.filter(
            or_(
                RaceLog.race_name.ilike(f'%{q}%'),
                RaceLog.user_name.ilike(f'%{q}%')
            )
        )
    
    if date_debut:
        try:
            date_debut = datetime.strptime(date_debut, '%Y-%m-%d')
            query = query.filter(RaceLog.start_time >= date_debut)
        except ValueError:
            pass
    
    if date_fin:
        try:
            date_fin = datetime.strptime(date_fin, '%Y-%m-%d')
            query = query.filter(RaceLog.start_time <= date_fin)
        except ValueError:
            pass
    
    if type_course:
        query = query.filter(RaceLog.race_name.ilike(f'%{type_course}%'))
    
    if statut:
        if statut == 'termine':
            query = query.filter(RaceLog.end_time.isnot(None))
        elif statut == 'en_cours':
            query = query.filter(RaceLog.end_time.is_(None))
    
    # Pagination
    pagination = query.order_by(RaceLog.start_time.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    # Formatage des résultats
    courses = []
    for course in pagination.items:
        courses.append({
            'id': course.id,
            'race_name': course.race_name,
            'start_time': course.start_time.isoformat(),
            'end_time': course.end_time.isoformat() if course.end_time else None,
            'duration': str(course.duration) if course.duration else None,
            'user_name': course.user_name,
            'average_speed': course.average_speed,
            'max_speed': course.max_speed,
            'distance': course.distance,
            'weather_conditions': course.weather_conditions,
            'track_conditions': course.track_conditions
        })
    
    return jsonify({
        'courses': courses,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })

@historique_bp.route("/api/connexions")
@login_required
@permission_required("dashboard")
def api_connexions():
    """API pour récupérer l'historique des connexions avec pagination et filtres."""
    # Récupération des paramètres de pagination
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    
    # Récupération des filtres
    q = request.args.get('q', '')
    date_debut = request.args.get('date_debut')
    date_fin = request.args.get('date_fin')
    type_connexion = request.args.get('type_connexion')
    
    # Construction de la requête de base
    query = ConnectionLog.query
    
    # Application des filtres
    if q:
        query = query.filter(ConnectionLog.user_name.ilike(f'%{q}%'))
    
    if date_debut:
        try:
            date_debut = datetime.strptime(date_debut, '%Y-%m-%d')
            query = query.filter(ConnectionLog.connection_date >= date_debut)
        except ValueError:
            pass
    
    if date_fin:
        try:
            date_fin = datetime.strptime(date_fin, '%Y-%m-%d')
            query = query.filter(ConnectionLog.connection_date <= date_fin)
        except ValueError:
            pass
    
    if type_connexion:
        query = query.filter(ConnectionLog.type == type_connexion)
    
    # Pagination
    pagination = query.order_by(ConnectionLog.connection_date.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    # Formatage des résultats
    connexions = []
    for connexion in pagination.items:
        connexions.append({
            'id': connexion.id,
            'user_name': connexion.user_name,
            'fonction': connexion.fonction,
            'type': connexion.type,
            'connection_date': connexion.connection_date.isoformat()
        })
    
    return jsonify({
        'connexions': connexions,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })
