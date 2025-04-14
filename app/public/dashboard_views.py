# app/public/dashboard_views.py
# -*- coding: utf-8 -*-
from flask import Blueprint, current_app, flash, redirect, render_template, request, url_for, g, jsonify
from flask_login import login_required, current_user
import subprocess
import re
from app.utils import permission_required

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")

# Objet global pour stocker les informations de connexion du véhicule
connection_info = {
    "ip": "192.168.1.100",      # Valeur par défaut
    "mac": "2C:CF:67:1C:51:F3"   # Adresse MAC du robot
}

@dashboard_bp.before_request
def load_theme_and_protect():
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
    # Utilise l'IP stockée dans connection_info
    ip = connection_info["ip"]
    try:
        output = subprocess.check_output(["ping", "-c", "1", ip],
                                           stderr=subprocess.STDOUT,
                                           universal_newlines=True)
        match = re.search(r'time=([\d\.]+) ms', output)
        if match:
            ping = float(match.group(1))
            # Pour notre usage, on considère que si ping > 150 ms, l'état est "moyen"
            connected = True
        else:
            ping = None
            connected = False
    except subprocess.CalledProcessError:
        ping = None
        connected = False
    return jsonify({"connected": connected, "ping": ping, "ip": ip})

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
        return jsonify({"status": "error", "message": "IP non valide"}), 400

@dashboard_bp.route('/vehicle/retrieve_ip', methods=['GET'])
@login_required
@permission_required('dashboard')
def retrieve_vehicle_ip():
    # Exemple d'endpoint pour "retrouver" l'IP à partir de la MAC via ARP ou autre méthode.
    # Ici, on simule la récupération en renvoyant la valeur stockée.
    # En pratique, vous pourriez exécuter une commande comme "arp -a" et filtrer par MAC.
    return jsonify({"status": "success", "ip": connection_info["ip"], "mac": connection_info["mac"]})
