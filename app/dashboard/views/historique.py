# -*- coding: utf-8 -*-
"""Historique views."""
from app.common.views import *
# Import des modèles spécifiques
from app.dashboard.models import ConnectionLog, RaceLog
import pytz

historique_bp = Blueprint("historique", __name__, url_prefix="/dashboard/historique")

@historique_bp.route("/")
@login_required
@permission_required("dashboard")
def home():
    """Page principale de l'historique des courses."""
    return render_template("dashboard/historique.html")

@historique_bp.route("/api/courses")
@login_required
@permission_required("dashboard")
def api_courses():
    """API pour récupérer l'historique des courses avec pagination et filtres."""
    # Récupération des paramètres de pagination
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    
    # Récupération des filtres
    q = request.args.get('q', '')
    date_debut = request.args.get('date_debut')
    date_fin = request.args.get('date_fin')
    type_course = request.args.get('type_course')
    statut = request.args.get('statut')
    role_utilisateur = request.args.get('role_utilisateur')
    
    # Construction de la requête de base
    query = RaceLog.query
    
    # Application des filtres
    if q:
        query = query.filter(
            or_(
                RaceLog.race_name.ilike(f'%{q}%'),
                RaceLog.user_name.ilike(f'%{q}%')
            )
        )
    
    if date_debut:
        try:
            date_debut = datetime.strptime(date_debut, '%Y-%m-%d')
            query = query.filter(RaceLog.start_time >= date_debut)
        except ValueError:
            pass
    
    if date_fin:
        try:
            date_fin = datetime.strptime(date_fin, '%Y-%m-%d')
            query = query.filter(RaceLog.start_time <= date_fin)
        except ValueError:
            pass
    
    if type_course:
        query = query.filter(RaceLog.race_name.ilike(f'%{type_course}%'))
    
    if statut:
        if statut == 'termine':
            query = query.filter(RaceLog.end_time.isnot(None))
        elif statut == 'en_cours':
            query = query.filter(RaceLog.end_time.is_(None))
    
    # Pagination
    pagination = query.order_by(RaceLog.start_time.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    # Formatage des résultats
    courses = []
    for course in pagination.items:
        courses.append({
            'id': course.id,
            'race_name': course.race_name,
            'start_time': course.start_time.isoformat(),
            'end_time': course.end_time.isoformat() if course.end_time else None,
            'duration': str(course.duration) if course.duration else None,
            'user_name': course.user_name,
            'average_speed': course.average_speed,
            'max_speed': course.max_speed,
            'distance': course.distance,
            'weather_conditions': course.weather_conditions,
            'track_conditions': course.track_conditions
        })
    
    return jsonify({
        'courses': courses,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })

@historique_bp.route("/api/connexions")
@login_required
@permission_required("dashboard")
def api_connexions():
    """API pour récupérer l'historique des connexions avec pagination et filtres."""
    # Récupération des paramètres de pagination
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    
    # Récupération des filtres
    q = request.args.get('q', '')
    date_debut = request.args.get('date_debut')
    date_fin = request.args.get('date_fin')
    type_connexion = request.args.get('type_connexion')
    
    # Construction de la requête de base
    query = ConnectionLog.query.filter(ConnectionLog.fonction == "site")
    
    # Application des filtres
    if q:
        query = query.filter(ConnectionLog.user_name.ilike(f'%{q}%'))
    
    if date_debut:
        try:
            date_debut = datetime.strptime(date_debut, '%Y-%m-%d')
            query = query.filter(ConnectionLog.connection_date >= date_debut)
        except ValueError:
            pass
    
    if date_fin:
        try:
            date_fin = datetime.strptime(date_fin, '%Y-%m-%d')
            query = query.filter(ConnectionLog.connection_date <= date_fin)
        except ValueError:
            pass
    
    if type_connexion:
        query = query.filter(ConnectionLog.type == type_connexion)
    
    # Pagination
    pagination = query.order_by(ConnectionLog.connection_date.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    # Formatage des résultats
    connexions = []
    for connexion in pagination.items:
        paris = pytz.timezone("Europe/Paris")
        local_dt = connexion.connection_date.replace(tzinfo=pytz.utc).astimezone(paris)
        connexions.append({
            'user_name': connexion.user_name,
            'type': connexion.type,
            'connection_date': local_dt.strftime('%Y-%m-%dT%H:%M:%S')
        })
    
    return jsonify({
        'connexions': connexions,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    }) 