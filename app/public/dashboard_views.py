# app/public/dashboard_views.py
# -*- coding: utf-8 -*-
from flask import Blueprint, current_app, flash, redirect, render_template, request, url_for, g, jsonify
from flask_login import login_required, current_user
import subprocess
import re
from app.utils import permission_required
from ping3 import ping
import os

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")

# Objet global pour stocker les informations de connexion du véhicule
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
    # Page de connexion/configuration du dashboard
    return render_template('dashboard/connect.html', config_connection=connection_info)

@dashboard_bp.route('/graphs')
@login_required
@permission_required('dashboard')
def graphs():
    # Page de supervision (affichage des cartes)
    return render_template('dashboard/graphs.html')

@dashboard_bp.route('/vehicle/control', methods=['POST'])
@login_required
@permission_required('dashboard')
def vehicle_control():
    data = request.get_json()
    # Commande "démarrer" si data.get('start') est True, sinon "arrêter"
    commande = "démarrer" if data.get('start') else "arrêter"
    # Ici, on ajoutera la logique pour commander le véhicule réel ou pour la simulation
    return jsonify({ "status": "success", "commande": commande })

@dashboard_bp.route('/vehicle/ping')
@login_required
@permission_required('dashboard')
def vehicle_ping():
    ip = connection_info["ip"]
    try:
        result = ping(ip, timeout=1)  # ✅ ping3 renvoie un float (en secondes)
        if result is not None:
            latency_ms = round(result * 1000, 2)  # ms
            return jsonify({"connected": True, "ping": latency_ms, "ip": ip})
        else:
            return jsonify({"connected": False, "ping": None, "ip": ip})
    except Exception as e:
        return jsonify({"connected": False, "ping": None, "ip": ip, "error": str(e)})

@dashboard_bp.route('/vehicle/ip', methods=['POST'])
@login_required
@permission_required('dashboard')
def update_vehicle_ip():
    # Pour l'instant, tout le monde peut modifier l'IP pour tester.
    data = request.get_json()
    new_ip = data.get("ip")
    if new_ip:
        connection_info["ip"] = new_ip
        # Optionnel : ici, on peut déclencher une détection pour récupérer l'adresse MAC depuis l'IP (commande ARP par exemple)
        # Pour simplifier, on laisse la MAC inchangée ou on simule une récupération.
        return jsonify({"status": "success", "new_ip": connection_info["ip"], "mac": connection_info["mac"]})
    else:
        flash("Adresse IP invalide.", "danger")

@dashboard_bp.route('/vehicle/retrieve_ip', methods=['GET'])
@login_required
@permission_required('dashboard')
def retrieve_vehicle_ip():
    # Exemple d'endpoint pour "retrouver" l'IP à partir de la MAC via ARP ou autre méthode.
    # Ici, on simule la récupération en renvoyant la valeur stockée.
    # En pratique, vous pourriez exécuter une commande comme "arp -a" et filtrer par MAC.
    return jsonify({"status": "success", "ip": connection_info["ip"], "mac": connection_info["mac"]})
