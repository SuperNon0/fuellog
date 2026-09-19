"""Réglages éditables depuis l'UI, stockés en base (prioritaires sur .env).

La config Cloudflare Access (équipe, AUD, vérif JWT) se règle dans
« Gestion → Accès & sécurité ». La table app_settings prime ; à défaut, on
retombe sur la config .env (amorce).
"""
from __future__ import annotations

from flask import current_app

from .db import get_db


def get_setting(cle: str, default: str | None = None) -> str | None:
    row = get_db().execute("SELECT valeur FROM app_settings WHERE cle = ?", (cle,)).fetchone()
    return row["valeur"] if row is not None else default


def set_setting(cle: str, valeur: str | None) -> None:
    db = get_db()
    db.execute(
        "INSERT INTO app_settings (cle, valeur) VALUES (?, ?) "
        "ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
        (cle, valeur),
    )
    db.commit()


def normalize_team(team: str) -> str:
    """Garde le NOM SEUL de l'équipe Cloudflare (super-nono), sans URL ni suffixe."""
    t = (team or "").strip().lower()
    t = t.removeprefix("https://").removeprefix("http://")
    t = t.strip("/")
    t = t.removesuffix(".cloudflareaccess.com")
    return t.strip("/")


def cf_config() -> dict:
    """Config Cloudflare effective (base prioritaire, sinon .env)."""
    cfg = current_app.config
    team = get_setting("cf_team")
    if team is None:
        team = cfg.get("CF_ACCESS_TEAM_DOMAIN", "")
    aud = get_setting("cf_aud")
    if aud is None:
        aud = cfg.get("CF_ACCESS_AUD", "")
    verify_s = get_setting("cf_verify")
    if verify_s is None:
        verify = bool(cfg.get("CF_VERIFY_JWT", True))
    else:
        verify = verify_s == "1"
    return {"team": normalize_team(team), "aud": (aud or "").strip(), "verify": verify}
