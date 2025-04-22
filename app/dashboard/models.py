# -*- coding: utf-8 -*-
"""Dashboard models."""
import datetime as dt
from app.extensions import db
import pytz

class ConnectionLog(db.Model):
    __tablename__ = "connection_logs"
    id = db.Column(db.Integer, primary_key=True)

    fonction = db.Column(db.String(50), nullable=False)  # dashboard, pilotage, etc.
    type = db.Column(db.String(20), nullable=False)  # connexion ou déconnexion
    connection_date = db.Column(db.DateTime, default=dt.datetime.utcnow, nullable=False)

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    user_name = db.Column(db.String(80), nullable=False)  # snapshot du nom d'utilisateur

    def __repr__(self):
        return f"<ConnectionLog({self.type} - {self.fonction} - {self.connection_date.strftime('%d/%m/%Y %H:%M')} - {self.user_name})>"

    @classmethod
    def get_last_connectionlog(cls, fonction):
        """
        Retourne le dernier log (tous utilisateurs confondus) pour une fonction donnée,
        formaté à l'heure française.
        """
        log = (
            cls.query
            .filter_by(fonction=fonction)
            .order_by(cls.connection_date.desc())
            .first()
        )
        if log:
            paris = pytz.timezone("Europe/Paris")
            local_dt = log.connection_date.replace(tzinfo=pytz.utc).astimezone(paris)
            return local_dt.strftime("Le %d/%m/%Y à %H:%M:%S par ") + log.user_name
        return "Aucune"

class RaceLog(db.Model):
    __tablename__ = "race_logs"
    id = db.Column(db.Integer, primary_key=True)
    
    # Informations sur la course
    race_name = db.Column(db.String(100), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=True)
    race_duration = db.Column(db.Interval, nullable=True)  # Durée de la course
    
    # Informations sur le pilote
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    user_name = db.Column(db.String(80), nullable=False)
    
    # Statistiques de la course
    average_speed = db.Column(db.Float, nullable=True)  # Vitesse moyenne en km/h
    max_speed = db.Column(db.Float, nullable=True)  # Vitesse maximale en km/h
    distance = db.Column(db.Float, nullable=True)  # Distance parcourue en km
    
    # Conditions de la course
    weather_conditions = db.Column(db.String(50), nullable=True)
    track_conditions = db.Column(db.String(50), nullable=True)
    
    created_at = db.Column(db.DateTime, default=dt.datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<RaceLog({self.race_name} - {self.start_time.strftime('%d/%m/%Y %H:%M')} - {self.user_name})>"

    @property
    def duration(self):
        if self.end_time and self.start_time:
            return self.end_time - self.start_time
        return None
