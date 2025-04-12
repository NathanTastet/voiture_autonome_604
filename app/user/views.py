# -*- coding: utf-8 -*-
"""User views."""
from flask import Blueprint, render_template, request, redirect, url_for, flash
from flask_login import login_required, current_user

from app.extensions import db
from app.utils import flash_errors
from app.user.forms import EditProfileForm

blueprint = Blueprint("user", __name__, url_prefix="/users", static_folder="../static")


@blueprint.route("/profile/")
@login_required
def profile():
    return render_template("users/profile.html")


@blueprint.route("/edit_profile", methods=["GET", "POST"])
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
