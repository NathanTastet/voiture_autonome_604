# app/public/dashboard_views.py
# -*- coding: utf-8 -*-
from flask import Blueprint, render_template, request, jsonify, session, g
from flask_login import login_required
from ping3 import ping
import os
from app.utils import permission_required

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")

# Informations de connexion initiales (lecture seule)
connection_info = {
    "ip": os.getenv("ROBOT_IP", "192.168.1.100"),
    "mac": os.getenv("ROBOT_MAC", "00:00:00:00:00:00")
}

@dashboard_bp.before_request
def load_theme():
    g.theme = request.cookies.get("theme", "dark")

@dashboard_bp.route('/')
@login_required
@permission_required('dashboard')
def index():
    # Page de connexion : on affiche les infos réseau en lecture seule ainsi que le statut
    return render_template(
        'dashboard/connect.html',
        config_connection=connection_info,
        last_connection=session.get("last_connection", "Aucune")
    )

@dashboard_bp.route('/graphs')
@login_required
@permission_required('dashboard')
def graphs():
    # Page de supervision avec trois cartes
    session["last_connection"] = "Dernière connexion : Maintenant"
    return render_template(
    'dashboard/graphs.html',
    config_connection=connection_info)

@dashboard_bp.route('/vehicle/control', methods=['POST'])
@login_required
@permission_required('dashboard')
def vehicle_control():
    data = request.get_json()
    commande = "démarrer" if data.get("start") else "arrêter"
    # Ici, on ajoutera la logique pour commander le véhicule réel ou passer en simulation
    return jsonify({"status": "success", "commande": commande})

@dashboard_bp.route('/vehicle/ping')
@login_required
@permission_required('dashboard')
def vehicle_ping():
    ip = connection_info["ip"]
    try:
        result = ping(ip, timeout=1)
        if result is not None:
            latency_ms = round(result * 1000, 2)
            return jsonify({"connected": True, "ping": latency_ms, "ip": ip})
        else:
            return jsonify({"connected": False, "ping": None, "ip": ip})
    except Exception as e:
        return jsonify({"connected": False, "ping": None, "ip": ip, "error": str(e)})
