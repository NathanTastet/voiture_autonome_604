# -*- coding: utf-8 -*-
"""Formulaires utilisateur."""
from flask_wtf import FlaskForm
from flask_login import current_user
from werkzeug.security import check_password_hash
from wtforms import PasswordField, StringField, TextAreaField
from wtforms.validators import DataRequired, Email, EqualTo, Length, Optional

from .models import User


class RegisterForm(FlaskForm):
    """Formulaire d'inscription."""

    username = StringField(
        "Nom d'utilisateur", validators=[DataRequired(), Length(min=3, max=25)]
    )
    email = StringField(
        "Adresse e-mail", validators=[DataRequired(), Email(), Length(min=6, max=40)]
    )
    password = PasswordField(
        "Mot de passe", validators=[DataRequired(), Length(min=6, max=40)]
    )
    confirm = PasswordField(
        "Confirmation du mot de passe",
        [DataRequired(), EqualTo("password", message="Les mots de passe doivent correspondre")],
    )

    def __init__(self, *args, **kwargs):
        """Créer une instance."""
        super(RegisterForm, self).__init__(*args, **kwargs)
        self.user = None

    def validate(self, **kwargs):
        """Valider le formulaire."""
        initial_validation = super(RegisterForm, self).validate()
        if not initial_validation:
            return False
        user = User.query.filter_by(username=self.username.data).first()
        if user:
            self.username.errors.append("Ce nom d'utilisateur est déjà pris.")
            return False
        user = User.query.filter_by(email=self.email.data).first()
        if user:
            self.email.errors.append("Cette adresse e-mail est déjà utilisée.")
            return False
        return True
    
class EditProfileForm(FlaskForm):
    username = StringField("Nom d'utilisateur", validators=[DataRequired()])
    email = StringField("Adresse e-mail", validators=[DataRequired(), Email()])
    password = PasswordField("Nouveau mot de passe", validators=[Optional(), Length(min=6)])
    confirm = PasswordField("Mot de passe actuel", validators=[DataRequired(message="Mot de passe requis pour valider les modifications")])

    def validate_username(self, field):
        if field.data != current_user.username:
            user = User.query.filter_by(username=field.data).first()
            if user:
                field.errors.append("Ce nom d'utilisateur est déjà utilisé.")

    def validate_email(self, field):
        if field.data != current_user.email:
            user = User.query.filter_by(email=field.data).first()
            if user:
                field.errors.append("Cette adresse e-mail est déjà utilisée.")

    def validate(self, **kwargs):
        print("TYPE:", type(current_user.password))
        print("VALUE:", current_user.password)

        """Valider tout le formulaire (incluant la vérification du mot de passe actuel)."""
        is_valid = super().validate(**kwargs)
        if not is_valid:
            return False

        if not current_user.check_password(self.confirm.data):
            self.confirm.errors.append("Mot de passe actuel incorrect.")
            return False


        return True