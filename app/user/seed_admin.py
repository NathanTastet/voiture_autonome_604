import os
from app.extensions import db
from app.user.models import User

def seed_admin():
    """Crée un compte admin si aucun n'existe."""
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.getenv("ADMIN_PASSWORD")

    if not admin_password:
        raise ValueError("❌ ADMIN_PASSWORD n'est pas défini dans les variables d'environnement.")

    existing_admin = User.query.filter_by(username=admin_username).first()

    if not existing_admin:
        admin = User(
            username=admin_username,
            email=admin_email,
            first_name="Admin",
            last_name="User",
            active=True,
            is_admin=True,
            can_access_dashboard=True,
            can_pilot_robot=True,
            can_view_history=True
        )
        admin.password = admin_password
        db.session.add(admin)
        db.session.commit()
        print(f"✅ Compte admin '{admin_username}' créé.")
    else:
        print("ℹ️ Un compte admin existe déjà.")
