# -*- coding: utf-8 -*-
"""Section publique, incluant la page d'accueil et l'inscription."""
from flask import (
    Blueprint,
    current_app,
    flash,
    redirect,
    render_template,
    request,
    url_for,
    g
)
from flask_login import login_required, login_user, logout_user

from app.extensions import login_manager, db
from app.public.forms import LoginForm
from app.user.forms import RegisterForm
from app.user.models import User
from app.utils import flash_errors


blueprint = Blueprint("public", __name__, static_folder="../static")

@blueprint.before_request
def inject_theme():
    g.theme = request.cookies.get("theme", "dark")

@blueprint.app_context_processor
def inject_globals():
    return {
        "theme": g.get("theme", "dark"),
        "form": LoginForm()
    }

@login_manager.user_loader
def load_user(user_id):
    return User.get_by_id(user_id)

@blueprint.route("/", methods=["GET", "POST"])
def home():
    """Page d'accueil."""
    form = LoginForm(request.form)
    current_app.logger.info("Bienvenue sur la page d'accueil !")
    if request.method == "POST":
        if form.validate_on_submit():
            login_user(form.user)
            flash("Connexion réussie.", "success")
            redirect_url = request.args.get("next") or url_for("public.home")
            return redirect(redirect_url)
        else:
            flash_errors(form)
    return render_template("public/home.html")

@blueprint.route("/logout/")
@login_required
def logout():
    """Déconnexion."""
    logout_user()
    flash("Déconnexion effectuée.", "info")
    return redirect(url_for("public.home"))

@blueprint.route("/register/", methods=["GET", "POST"])
def register():
    """Inscription nouvel utilisateur."""
    form = RegisterForm(request.form)
    if form.validate_on_submit():
        User.create(
            username=form.username.data,
            email=form.email.data,
            password=form.password.data,
            active=True,
        )
        flash("Inscription réussie. Vous pouvez maintenant vous connecter.", "success")
        return redirect(url_for("public.home"))
    else:
        flash_errors(form)
    return render_template("public/register.html", form=form)

@blueprint.route("/about/")
def about():
    """Page À propos."""
    return render_template("public/about.html")

@blueprint.route("/dashboard/")
@login_required
def dashboard():
    return render_template("public/dashboard_embed.html")

@blueprint.route("/pilotage")
@login_required
def pilotage():
    return render_template("public/pilotage.html")

@blueprint.route("/historique")
@login_required
def historique():
    return render_template("public/historique.html")

@blueprint.route("/reglement")
def reglement_pdf():
    return render_template("public/reglement.html")
