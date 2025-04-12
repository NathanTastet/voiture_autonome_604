import os
from app.app import create_app
from app.extensions import db

app = create_app()

# Ne faire le seed que si on est dans un vrai runtime, pas pendant un build
if os.environ.get("FLASK_SKIP_SEED") != "1":
    with app.app_context():
        from app.user.seed_admin import seed_admin
        from app.user.init_permissions import init_permissions
        
        db.create_all()
        init_permissions()
        seed_admin()
