# -*- coding: utf-8 -*-
"""Imports et helpers partagés pour toutes les views."""
from flask import (
    Blueprint, render_template, request, jsonify, session,
    redirect, url_for, g, current_app, flash
)
from flask_login import current_user, login_required, login_user, logout_user
import os, time
from datetime import datetime, timedelta
from sqlalchemy import and_, or_
from ping3 import ping

# Extensions
from app.extensions import db, bcrypt

# Utilitaires
from app.utils import (
    flash_errors, format_date, permission_required
)

# Forms
from app.public.forms import LoginForm

def _load_theme():
    """Charge le thème (dark/light) depuis les cookies."""
    g.theme = request.cookies.get("theme", "dark")

def _inject_globals():
    """Injecte des variables globales dans tous les templates."""
    return {
        "theme": g.theme,
        "current_user": current_user,
        "form": LoginForm() if not current_user.is_authenticated else None
    }

def register_common(app):
    """À appeler dans votre factory create_app(app)."""
    app.before_request(_load_theme)
    app.context_processor(lambda: _inject_globals())
    app.jinja_env.filters["format_date"] = format_date

def parse_iso_date(s):
    try:
        return datetime.strptime(s, "%Y-%m-%d")
    except Exception:
        return None

def make_json(data=None, status="ok", code=200):
    payload = {"status": status}
    if data is not None:
        payload.update(data)
    return jsonify(payload), code

__all__ = [
    'Blueprint',
    'register_common',
    '_load_theme',
    '_inject_globals',
    'parse_iso_date',
    'make_json',
    'current_user',
    'login_required',
    'login_user',
    'logout_user',
    'permission_required',
    'flash_errors',
    'format_date',
    'render_template',
    'request',
    'jsonify',
    'session',
    'redirect',
    'url_for',
    'g',
    'current_app',
    'ping',
    'db',
    'bcrypt',
    'os',
    'time',
    'flash',
    'LoginForm',
    'datetime',
    'or_'
]
