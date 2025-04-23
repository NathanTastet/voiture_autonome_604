# -*- coding: utf-8 -*-
"""Public views."""
from app.common.views import *

from app.extensions import login_manager
from app.user.forms import RegisterForm
from app.user.models import User

public_bp = Blueprint("public", __name__)

@public_bp.before_request
def load_theme():
    _load_theme()

@public_bp.app_context_processor
def inject_globals():
    return _inject_globals()

@login_manager.user_loader
def load_user(user_id):
    return User.get_by_id(user_id)

@public_bp.route("/", methods=["GET", "POST"])
def home():
    """Page d'accueil / login."""
    form = LoginForm(request.form)
    current_app.logger.info("Bienvenue sur la page d'accueil !")

    # On récupère `next` soit en GET (query string), soit en POST (champ caché)
    next_page = request.args.get("next") or request.form.get("next")

    if request.method == "POST":
        if form.validate_on_submit():
            login_user(form.user)
            flash("Connexion réussie.", "success")

            # On vide les anciens indicateurs du dashboard
            session.pop("dashboard_connected", None)
            session.pop("dashboard_next", None)

            # Redirection sécurisée vers la route interne, ou vers /dashboard/connect
            if next_page and next_page.startswith("/dashboard"):
                return redirect(next_page)
            return redirect(url_for("dashboard.connect"))
        else:
            flash_errors(form)

    # On transmet `next` au template pour le form caché
    return render_template("public/home.html", next=next_page)


@public_bp.route("/logout/")
@login_required
def logout():
    """Déconnexion."""
    logout_user()
    flash("Déconnexion effectuée.", "info")

    # On vide aussi les indicateurs dashboard
    session.pop("dashboard_connected", None)
    session.pop("dashboard_next", None)

    return redirect(url_for("public.home"))


@public_bp.route("/register/", methods=["GET", "POST"])
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

@public_bp.route("/about/")
def about():
    """Page À propos."""
    return render_template("public/about.html")

@public_bp.route("/reglement")
def reglement_pdf():
    return render_template("public/reglement.html")
