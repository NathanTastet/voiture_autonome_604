# -*- coding: utf-8 -*-
"""Helper utilities and decorators."""
from flask import flash
from functools import wraps
from flask import request, g, flash, redirect, url_for
from flask_login import current_user
from datetime import datetime


def flash_errors(form, category="warning"):
    """Flash all errors for a form."""
    for field, errors in form.errors.items():
        for error in errors:
            flash(f"{getattr(form, field).label.text} - {error}", category)


def permission_required(permission):
    """
    Décorateur pour restreindre l'accès à une route en fonction
    d'une permission utilisateur.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.has_permission(permission):
                flash(f"Vous n'avez pas la permission '{permission}'.", "danger")
                return redirect(url_for("public.home"))
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def format_date(date, format="%d/%m/%Y %H:%M"):
    """Format a date object to a string."""
    if not date:
        return ""
    if isinstance(date, str):
        try:
            date = datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            return date
    return date.strftime(format)
