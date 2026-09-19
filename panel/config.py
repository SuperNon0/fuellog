"""Config de FuelLog (autonome, fondé sur socle-lite). Depuis .env.

Contrairement au socle-lite « pur », FuelLog A une base de données : la config
Cloudflare et le mot de passe local y sont stockés (table app_settings) et
éditables depuis l'écran « Accès & sécurité ». Les variables ci-dessous ne
servent que d'amorce au premier lancement (voir panel/db.py).
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
    SESSION_COOKIE_SECURE = _bool("SESSION_COOKIE_SECURE", False)
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # Base de données (SQLite) — données métier + réglages (app_settings).
    DATABASE_PATH = os.getenv("DATABASE_PATH", os.path.join(ROOT, "data", "fuellog.db"))

    # Marque
    BRAND_PREFIX = os.getenv("BRAND_PREFIX", "Fuel")
    BRAND_SUFFIX = os.getenv("BRAND_SUFFIX", "Log")
    BRAND_BADGE = os.getenv("BRAND_BADGE", "suivi carburant & entretien")

    # Cloudflare Access (amorce ; ensuite éditable en base via l'écran Accès & sécurité)
    CF_ACCESS_TEAM_DOMAIN = os.getenv("CF_ACCESS_TEAM_DOMAIN", "")
    CF_ACCESS_AUD = os.getenv("CF_ACCESS_AUD", "")
    CF_VERIFY_JWT = _bool("CF_VERIFY_JWT", True)

    # Secours local (LAN). Le mot de passe réel est HASHÉ en base ; ADMIN_PASSWORD
    # ne sert qu'à amorcer au premier lancement si la base est vide.
    ALLOW_LOCAL_LOGIN = _bool("ALLOW_LOCAL_LOGIN", True)
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

    # Optionnel : restreindre AUSSI côté appli (sinon on fait confiance à Cloudflare).
    ALLOWED_EMAILS = [
        e.strip().lower() for e in os.getenv("ALLOWED_EMAILS", "").split(",") if e.strip()
    ]
