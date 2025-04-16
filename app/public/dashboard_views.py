# -*- coding: utf-8 -*-
"""Blueprint Dashboard – version refactorisée et temps‑réel

Nouveautés :
- endpoint /vehicle/data  (POST = push des données, GET = pull)
- stockage en mémoire du dernier paquet reçu
- simplification du ping (gardé)
- rendu de la nouvelle page `graphs.html` (tabs au lieu de carousel)
"""
from __future__ import annotations

import os
import time
from datetime import datetime
from typing import Any, Dict

from flask import Blueprint, jsonify, g, redirect, render_template, request, session, url_for
from flask_login import current_user, login_required
from ping3 import ping

from app.user.models import ConnectionLog
from app.utils import permission_required


dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/dashboard")

# ──────────────────────────────────────────────────────────────────────────────
# Données de configuration & cache en mémoire
# ──────────────────────────────────────────────────────────────────────────────
connection_info: Dict[str, str] = {
    "ip": os.getenv("ROBOT_IP", "192.168.1.100"),
    "mac": os.getenv("ROBOT_MAC", "00:00:00:00:00:00"),
}

# Mémoire partagée (process‑wide) pour la dernière télémétrie reçue
def _default_payload() -> Dict[str, Any]:
    return {
        "timestamp": 0,
        "mode": "simu",  # simu | manuel | auto
        "track": [],  # liste de couples [x, y]
        "speed": 0,
        "distance": 0,
        "battery": 100,
        "energy": 0,
        "motor_power": 0,
        "telemetry": 0,
        "encoders": 0,
        "alerts": [],
    }

LATEST_DATA: Dict[str, Any] = _default_payload()

# ──────────────────────────────────────────────────────────────────────────────
# Hooks & helpers
# ──────────────────────────────────────────────────────────────────────────────
@dashboard_bp.before_request
def load_theme() -> None:
    g.theme = request.cookies.get("theme", "dark")


# ──────────────────────────────────────────────────────────────────────────────
# Routes pages
# ──────────────────────────────────────────────────────────────────────────────
@dashboard_bp.route("/")
@login_required
@permission_required("dashboard")
def index():
    last_log = ConnectionLog.get_last_connectionlog("dashboard")
    return render_template(
        "dashboard/connect.html",
        config_connection=connection_info,
        last_connection=last_log,
    )


@dashboard_bp.route("/graphs")
@login_required
@permission_required("dashboard")
def graphs():
    current_user.log_connection("dashboard", "connexion")
    return render_template(
        "dashboard/graphs.html",
        config_connection=connection_info,
    )


# ──────────────────────────────────────────────────────────────────────────────
# API temps réel
# ──────────────────────────────────────────────────────────────────────────────
@dashboard_bp.route("/vehicle/data", methods=["GET", "POST"])
@login_required
@permission_required("dashboard")
def vehicle_data():
    """GET ⇒ dernier état. POST ⇒ push d’un nouvel état.

    Le POST attend un JSON respectant la structure de `_default_payload()`.
    """
    global LATEST_DATA  # pylint: disable=global-statement

    if request.method == "POST":
        payload: Dict[str, Any] = request.get_json(silent=True) or {}
        payload["timestamp"] = int(time.time())
        # On garde uniquement les clés attendues pour éviter les abus
        clean = _default_payload()
        clean.update({k: payload.get(k, clean[k]) for k in clean.keys()})
        LATEST_DATA = clean
        return jsonify({"status": "ok"})

    # GET
    return jsonify(LATEST_DATA)


@dashboard_bp.route("/vehicle/control", methods=["POST"])
@login_required
@permission_required("dashboard")
def vehicle_control():
    data = request.get_json() or {}
    commande = "démarrer" if data.get("start") else "arrêter"
    # TODO : Implémenter la passerelle vers le vrai robot
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
    except Exception as exc:  # pylint: disable=broad-except
        return jsonify({"connected": False, "ping": None, "ip": ip, "error": str(exc)})


@dashboard_bp.route("/log-disconnect", methods=["POST"])
@login_required
@permission_required("dashboard")
def log_disconnect():
    current_user.log_connection("dashboard", "déconnexion")
    return jsonify({"status": "logged"})