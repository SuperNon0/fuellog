"""Accès SQLite pour FuelLog (autonome).

Fournit la connexion par requête, le schéma des réglages (app_settings) et
l'amorce du mot de passe admin depuis .env au tout premier lancement. Les tables
métier (véhicules, pleins, entretiens…) sont créées par app/schema.sql, exécuté
par create_app.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

from flask import current_app, g
from werkzeug.security import generate_password_hash

# Réglages éditables depuis l'UI (config Cloudflare + hash du mot de passe local).
SCHEMA = """
CREATE TABLE IF NOT EXISTS app_settings (
    cle     TEXT PRIMARY KEY,
    valeur  TEXT
);
"""


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        path = current_app.config["DATABASE_PATH"]
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(path)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(exc: BaseException | None = None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    """Crée le schéma des réglages et amorce le mot de passe admin (idempotent)."""
    db = get_db()
    db.executescript(SCHEMA)
    db.commit()
    _seed_admin_password(db)


def _seed_admin_password(db: sqlite3.Connection) -> None:
    """Au 1er lancement : si aucun mot de passe local en base et qu'ADMIN_PASSWORD
    est fourni dans l'.env, on l'enregistre HASHÉ. Ensuite, l'.env n'est plus lu
    (le mot de passe se change via l'écran Accès & sécurité)."""
    row = db.execute("SELECT valeur FROM app_settings WHERE cle = 'admin_mdp_hash'").fetchone()
    if row is not None and row["valeur"]:
        return
    pwd = (current_app.config.get("ADMIN_PASSWORD") or "").strip()
    if not pwd:
        return
    db.execute(
        "INSERT INTO app_settings (cle, valeur) VALUES ('admin_mdp_hash', ?) "
        "ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
        (generate_password_hash(pwd),),
    )
    db.commit()
    current_app.logger.info("Mot de passe admin amorcé depuis .env (hashé en base).")
