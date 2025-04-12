# -*- coding: utf-8 -*-
"""Admin views for managing access requests."""
from flask import Blueprint, render_template, redirect, url_for, flash
from flask_login import login_required, current_user
from app.extensions import db
from app.user.models import AccessRequest, User, Permission

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

@admin_bp.before_request
@login_required
def restrict_to_admin():
    if not current_user.has_permission("admin"):
        flash("Accès réservé aux administrateurs.", "danger")
        return redirect(url_for("public.home"))

@admin_bp.route("/", methods=["GET"])
def index():
    # Récupérer toutes les demandes d'accès en attente
    pending_requests = AccessRequest.query.filter_by(status="pending").all()
    # Récupérer tous les utilisateurs
    users = User.query.all()
    # Récupérer toutes les permissions
    permissions = Permission.query.all()
    return render_template("admin/index.html", requests=pending_requests, users=users, permissions=permissions)

@admin_bp.route("/approve_request/<int:req_id>", methods=["GET"])
def approve_request(req_id):
    access_request = AccessRequest.query.get_or_404(req_id)
    if access_request.status != "pending":
        flash("Cette demande a déjà été traitée.", "warning")
    else:
        access_request.status = "approved"
        # Récupérer la permission ou la créer si elle n'existe pas
        permission_obj = Permission.query.filter_by(name=access_request.permission).first()
        if not permission_obj:
            permission_obj = Permission(name=access_request.permission)
            db.session.add(permission_obj)
            db.session.flush()  # pour assurer la création et récupérer l'id
        # Ajouter la permission à l'utilisateur s'il ne la possède pas déjà
        if permission_obj not in access_request.user.permissions:
            access_request.user.permissions.append(permission_obj)
        db.session.commit()
        flash(f"Accès '{access_request.permission}' approuvé pour {access_request.user.username}.", "success")
    return redirect(url_for("admin.index"))

@admin_bp.route("/reject_request/<int:req_id>", methods=["GET"])
def reject_request(req_id):
    access_request = AccessRequest.query.get_or_404(req_id)
    if access_request.status != "pending":
        flash("Cette demande a déjà été traitée.", "warning")
    else:
        access_request.status = "rejected"
        db.session.commit()
        flash(f"Accès '{access_request.permission}' rejeté pour {access_request.user.username}.", "info")
    return redirect(url_for("admin.index"))
