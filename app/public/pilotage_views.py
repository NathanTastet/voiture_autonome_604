# app/public/pilotage_views.py
from flask import Blueprint, render_template, session, g
from flask_login import login_required
from app.utils import permission_required
import os

pilotage_bp = Blueprint("pilotage", __name__, url_prefix="/pilotage")

connection_info = {
    "ip": os.getenv("ROBOT_IP", "192.168.1.100"),
    "mac": os.getenv("ROBOT_MAC", "00:00:00:00:00:00")
}

@pilotage_bp.before_request
def load_theme():
    g.theme = session.get("theme", "dark")

@pilotage_bp.route("/")
@login_required
@permission_required('dashboard')
def index():
    return render_template(
        "pilotage/pilotage.html",
        config_connection=connection_info,
        last_connection=session.get("last_connection", "Aucune")
    )
