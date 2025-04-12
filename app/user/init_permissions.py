# scripts/init_permissions.py

from app.extensions import db
from .models import Permission

def init_permissions():
    base_perms = ['dashboard', 'pilotage', 'historique', 'admin','superadmin']
    for name in base_perms:
        if not Permission.query.filter_by(name=name).first():
            db.session.add(Permission(name=name))
    db.session.commit()
    print("Permissions créées avec succès.")
