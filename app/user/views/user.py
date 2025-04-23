# -*- coding: utf-8 -*-
"""User views."""
from app.common.views import *
from app.user.forms import EditProfileForm
from app.user.models import AccessRequest

user_bp = Blueprint("user", __name__, url_prefix="/user")

@user_bp.route("/profile/")
@login_required
def profile():
    return render_template("users/profile.html")


@user_bp.route("/edit_profile", methods=["GET", "POST"])
@login_required
def edit_profile():
    form = EditProfileForm(obj=current_user)

    if form.validate_on_submit():
        current_user.username = form.username.data
        current_user.email = form.email.data
        if form.password.data:
            current_user.password = form.password.data  # hashé automatiquement

        db.session.commit()
        flash("Profil mis à jour avec succès.", "success")
        return redirect(url_for("user.profile"))

    flash_errors(form)
    return render_template("users/edit_profile.html", form=form)


@user_bp.route("/request_access/<permission>")
@login_required
def request_access(permission):
    valid_permissions = ['dashboard', 'pilotage', 'historique', 'admin']
    if permission not in valid_permissions:
        flash("Permission inconnue.", "danger")
        return redirect(url_for("user.profile"))

    # Vérifier si déjà accordé
    if current_user.has_permission(permission):
        flash(f"Tu as déjà la permission '{permission}'.", "info")
        return redirect(url_for("user.profile"))

    # Vérifie demande existante
    existing = AccessRequest.query.filter_by(
        user_id=current_user.id,
        permission=permission,
        status='pending'
    ).first()

    if existing:
        flash(f"Une demande pour '{permission}' est déjà en attente.", "warning")
    else:
        new_request = AccessRequest(user_id=current_user.id, permission=permission)
        db.session.add(new_request)
        db.session.commit()
        flash(f"Demande pour '{permission}' envoyée.", "success")

    return redirect(url_for("user.profile"))