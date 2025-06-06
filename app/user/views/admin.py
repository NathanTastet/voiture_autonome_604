# -*- coding: utf-8 -*-
"""Admin views."""
from app.common.views import *
from app.user.models import AccessRequest, User, Permission

admin_bp = Blueprint("admin", __name__, url_prefix="/admin")

@admin_bp.route("/", methods=["GET"])
@login_required
@permission_required("admin")
def index():
    # Récupérer les demandes d'accès en attente pour notification
    pending_requests = AccessRequest.query.filter_by(status="pending").all()
    pending_count = len(pending_requests)
    # Récupérer tous les utilisateurs
    users = User.query.all()
    # Récupérer toutes les permissions
    all_permissions = Permission.query.all()
    return render_template("admin/index.html", pending_count=pending_count, users=users, permissions=all_permissions)

@admin_bp.route("/access_requests", methods=["GET"])
@login_required
@permission_required("admin")
def access_requests():
    pending_requests = AccessRequest.query.filter_by(status="pending").all()
    return render_template("admin/access_requests.html", requests=pending_requests)

@admin_bp.route("/approve_request/<int:req_id>", methods=["GET"])
@login_required
@permission_required("admin")
def approve_request(req_id):
    access_request = AccessRequest.query.get_or_404(req_id)
    
    # Seul un superadmin peut approuver une demande pour la permission "admin"
    if access_request.permission == "admin" and not current_user.has_permission("superadmin"):
        flash("Vous n'êtes pas autorisé à approuver une demande pour la permission admin.", "danger")
        return redirect(url_for("admin.access_requests"))
    
    if access_request.status != "pending":
        flash("Cette demande a déjà été traitée.", "warning")
    else:
        access_request.status = "approved"
        # Récupérer (ou créer) la permission
        permission_obj = Permission.query.filter_by(name=access_request.permission).first()
        if not permission_obj:
            permission_obj = Permission(name=access_request.permission)
            db.session.add(permission_obj)
            db.session.flush()
        if permission_obj not in access_request.user.permissions:
            access_request.user.permissions.append(permission_obj)
        db.session.commit()
        flash(f"Accès '{access_request.permission}' approuvé pour {access_request.user.username}.", "success")
    
    return redirect(url_for("admin.access_requests"))


@admin_bp.route("/reject_request/<int:req_id>", methods=["GET"])
@login_required
@permission_required("admin")
def reject_request(req_id):
    access_request = AccessRequest.query.get_or_404(req_id)
    if access_request.status != "pending":
        flash("Cette demande a déjà été traitée.", "warning")
    else:
        # Seul un superadmin peut refuser une demande pour la permission "admin"
        if access_request.permission == "admin" and not current_user.has_permission("superadmin"):
            flash("Vous n'êtes pas autorisé à refuser une demande pour la permission admin.", "danger")
            return redirect(url_for("admin.access_requests"))
        access_request.status = "rejected"
        db.session.commit()
        flash(f"Accès '{access_request.permission}' rejeté pour {access_request.user.username}.", "info")
    return redirect(url_for("admin.access_requests"))

@admin_bp.route("/delete_user/<int:user_id>", methods=["GET"])
@login_required
@permission_required("admin")
def delete_user(user_id):
    user_to_delete = User.query.get_or_404(user_id)
    if current_user.id == user_to_delete.id:
        flash("Vous ne pouvez pas vous supprimer vous-même.", "danger")
        return redirect(url_for("admin.index"))
    if current_user.has_permission("superadmin"):
        pass  # Superadmin peut supprimer n'importe qui (sauf lui-même)
    elif current_user.has_permission("admin"):
        if user_to_delete.has_permission("admin") or user_to_delete.has_permission("superadmin"):
            flash("Vous n'êtes pas autorisé à supprimer un administrateur.", "danger")
            return redirect(url_for("admin.index"))
    else:
        flash("Accès interdit.", "danger")
        return redirect(url_for("user.profile"))
    db.session.delete(user_to_delete)
    db.session.commit()
    flash(f"L'utilisateur {user_to_delete.username} a été supprimé.", "success")
    return redirect(url_for("admin.index"))

@admin_bp.route("/toggle_permission/<int:user_id>/<string:perm_name>", methods=["GET"])
@login_required
@permission_required("admin")
def toggle_permission(user_id, perm_name):
    # Ne pas permettre de modifier la permission "superadmin" en aucune circonstance
    if perm_name == "superadmin":
        flash("La permission superadmin ne peut être modifiée.", "danger")
        return redirect(url_for("admin.index"))

    target_user = User.query.get_or_404(user_id)
    
    # Si l'utilisateur cible est différent de l'utilisateur courant ET
    # s'il possède la permission "admin" ou "superadmin",
    # alors seul un superadmin peut modifier ses permissions.
    if target_user.id != current_user.id and (target_user.has_permission("admin") or target_user.has_permission("superadmin")):
        if not current_user.has_permission("superadmin"):
            flash("Vous n'êtes pas autorisé à modifier les permissions d'un autre administrateur.", "danger")
            return redirect(url_for("admin.index"))

    # Empêcher un utilisateur de retirer sa propre permission admin
    if target_user.id == current_user.id and perm_name == "admin":
        flash("Vous ne pouvez pas retirer la permission admin à vous-même.", "danger")
        return redirect(url_for("admin.index"))
    
    # Pour la permission "admin", si l'utilisateur cible est différent de l'utilisateur courant,
    # seuls les superadmins peuvent la modifier (cas complémentaire du test ci-dessus).
    if perm_name == "admin" and target_user.id != current_user.id and not current_user.has_permission("superadmin"):
        flash("Vous n'êtes pas autorisé à modifier la permission admin pour un autre utilisateur.", "danger")
        return redirect(url_for("admin.index"))
    
    # Récupérer ou créer l'objet Permission
    permission_obj = Permission.query.filter_by(name=perm_name).first()
    if not permission_obj:
        permission_obj = Permission(name=perm_name)
        db.session.add(permission_obj)
        db.session.flush()
    
    if target_user.has_permission(perm_name):
        target_user.permissions.remove(permission_obj)
        flash(f"Permission '{perm_name}' retirée de {target_user.username}.", "info")
    else:
        target_user.permissions.append(permission_obj)
        flash(f"Permission '{perm_name}' attribuée à {target_user.username}.", "success")
        # Si une demande pour cette permission existait pour cet utilisateur, la supprimer
        req = AccessRequest.query.filter_by(user_id=target_user.id, permission=perm_name, status='pending').first()
        if req:
            db.session.delete(req)
    
    db.session.commit()
    return redirect(url_for("admin.index"))