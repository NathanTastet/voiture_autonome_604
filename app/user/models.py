# -*- coding: utf-8 -*-
"""User and Permission models."""
import datetime as dt

from flask_login import UserMixin
from sqlalchemy.ext.hybrid import hybrid_property
from app.extensions import bcrypt, db
import pytz
from app.dashboard.models import ConnectionLog

# Table d'association User <-> Permission
user_permissions = db.Table(
    "user_permissions",
    db.Column("user_id", db.Integer, db.ForeignKey("users.id"), primary_key=True),
    db.Column("permission_id", db.Integer, db.ForeignKey("permissions.id"), primary_key=True)
)

class Permission(db.Model):
    __tablename__ = "permissions"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)

    def __repr__(self):
        return f"<Permission({self.name})>"

class AccessRequest(db.Model):
    __tablename__ = "access_requests"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    permission = db.Column(db.String(50), nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending / approved / rejected
    timestamp = db.Column(db.DateTime, default=dt.datetime.utcnow)

    user = db.relationship("User", back_populates="access_requests")

class User(UserMixin, db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(80), unique=True, nullable=False)
    _password = db.Column("password", db.LargeBinary(128), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=dt.datetime.now(dt.timezone.utc))
    first_name = db.Column(db.String(30), nullable=True)
    last_name = db.Column(db.String(30), nullable=True)
    active = db.Column(db.Boolean(), default=False)

    permissions = db.relationship(
        "Permission",
        secondary=user_permissions,
        backref=db.backref("users", lazy="dynamic")
    )

    access_requests = db.relationship("AccessRequest", back_populates="user", cascade="all, delete-orphan")

    @hybrid_property
    def password(self):
        return self._password

    @password.setter
    def password(self, value):
        self._password = bcrypt.generate_password_hash(value)

    def check_password(self, value):
        return bcrypt.check_password_hash(self._password, value)

    def has_permission(self, name):
        return any(p.name == name for p in self.permissions)

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    def __repr__(self):
        return f"<User({self.username!r})>"
    
    @classmethod
    def create(cls, **kwargs):
        user = cls(**kwargs)
        db.session.add(user)
        db.session.commit()
        return user

    @classmethod
    def get_by_id(cls, user_id):
        return db.session.get(cls, int(user_id))
    
    def log_connection(self, fonction, type_):
        log = ConnectionLog(
            fonction=fonction,
            type=type_,
            user_id=self.id,
            user_name=self.username
        )
        db.session.add(log)
        db.session.commit()