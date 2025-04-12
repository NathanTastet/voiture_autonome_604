import os
from app.extensions import db
from app.user.models import User, Permission

def seed_admin():
    """Crée un compte superadmin si aucun n'existe, et lui attribue toutes les permissions."""
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
            active=True
        )
        admin.password = admin_password

        # Attribuer toutes les permissions existantes
        permissions = Permission.query.all()
        admin.permissions.extend(permissions)

        db.session.add(admin)
        db.session.commit()
        print(f"✅ Compte superadmin '{admin_username}' créé avec toutes les permissions.")
    else:
        print("ℹ️ Un compte superadmin existe déjà.")
