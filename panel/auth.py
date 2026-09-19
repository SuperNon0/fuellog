"""Authentification FuelLog (autonome, fondée sur socle-lite).

Deux entrées, un seul statut (`session["auth"]`) : authentifié ou refusé.
  - Cloudflare Access : e-mail vérifié par JWT (RS256 + aud + iss) — le portier.
  - Secours local (LAN) : un mot de passe HASHÉ en base (éditable dans Gestion).

⚠️ La vérification du JWT est reprise À L'IDENTIQUE du socle-lite (testée) :
on ne fait JAMAIS confiance à l'en-tête `Cf-Access-Authenticated-User-Email`
seul. La config (équipe/AUD/vérif) vient du store du site (panel.settings),
donc modifiable au runtime.
"""
from __future__ import annotations

import functools
import time

from flask import (Blueprint, current_app, flash, redirect, render_template,
                   request, session, url_for)
from werkzeug.security import check_password_hash

try:
    import jwt
    from jwt import PyJWKClient
except Exception:  # PyJWT optionnel tant que la vérif n'est pas active
    jwt = None
    PyJWKClient = None

bp = Blueprint("auth", __name__)
_jwk_clients: dict[str, "PyJWKClient"] = {}


# ── Cloudflare Access (repris du socle-lite, config lue en base) ─────────────
def _get_jwk_client(team: str):
    if not team or PyJWKClient is None:
        return None
    client = _jwk_clients.get(team)
    if client is None:
        client = PyJWKClient(f"https://{team}.cloudflareaccess.com/cdn-cgi/access/certs")
        _jwk_clients[team] = client
    return client


def _cf_token() -> str | None:
    return (request.headers.get("Cf-Access-Jwt-Assertion")
            or request.cookies.get("CF_Authorization"))


def cf_access_email() -> str | None:
    """E-mail Cloudflare vérifié pour la requête, sinon None."""
    from .settings import cf_config
    cfg = cf_config()
    header_email = request.headers.get("Cf-Access-Authenticated-User-Email")
    if not cfg["verify"]:
        return header_email.strip().lower() if header_email else None
    token = _cf_token()
    if not token or jwt is None:
        return None
    team, aud = cfg["team"], cfg["aud"]
    client = _get_jwk_client(team)
    if client is None or not aud or not team:
        current_app.logger.warning("Vérif JWT active mais équipe/AUD non renseignés.")
        return None
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token, signing_key.key, algorithms=["RS256"],
            audience=aud, issuer=f"https://{team}.cloudflareaccess.com",
        )
    except Exception as exc:
        current_app.logger.warning("JWT Cloudflare rejeté : %s", exc)
        return None
    email = (claims.get("email") or "").strip().lower()
    return email or None


def cf_diagnostic(team: str | None = None, aud: str | None = None) -> dict:
    """Diagnostic Cloudflare (bouton « Tester »). Sans argument : config enregistrée.
    Avec team/aud : teste ces valeurs en direct, sans les enregistrer."""
    from .settings import cf_config
    cfg = cf_config()
    if team is not None:
        cfg = {"team": team, "aud": (aud if aud is not None else cfg["aud"]), "verify": cfg["verify"]}
    header_email = request.headers.get("Cf-Access-Authenticated-User-Email")
    token = _cf_token()
    d = {
        "team": cfg["team"], "aud": cfg["aud"], "verify": cfg["verify"],
        "header_email": header_email, "has_token": bool(token),
        "jwt_status": "non testé", "jwt_email": None, "jwt_error": None,
    }
    if not token:
        d["jwt_error"] = "Aucun jeton Cloudflare reçu (l'origine n'est peut-être pas derrière Access)."
        return d
    if not cfg["team"] or not cfg["aud"]:
        d["jwt_error"] = "Équipe et/ou AUD non renseignés."
        return d
    if jwt is None:
        d["jwt_error"] = "PyJWT indisponible."
        return d
    try:
        client = _get_jwk_client(cfg["team"])
        signing_key = client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token, signing_key.key, algorithms=["RS256"],
            audience=cfg["aud"], issuer=f"https://{cfg['team']}.cloudflareaccess.com",
        )
        d["jwt_status"] = "OK ✓"
        d["jwt_email"] = (claims.get("email") or "").strip().lower() or None
    except Exception as exc:
        d["jwt_status"] = "échec ✗"
        d["jwt_error"] = str(exc)
    return d


# ── Secours local + décision d'accès ────────────────────────────────────────
def _admin_hash() -> str | None:
    from .settings import get_setting
    return get_setting("admin_mdp_hash")


def _local_login_possible() -> bool:
    return bool(current_app.config["ALLOW_LOCAL_LOGIN"] and _admin_hash())


def _email_autorise(email: str) -> bool:
    allowed = current_app.config["ALLOWED_EMAILS"]
    return (not allowed) or (email in allowed)


def home_url() -> str:
    """URL de l'accueil (la route « / » de la surcouche), sinon /."""
    for rule in current_app.url_map.iter_rules():
        if rule.rule == "/" and "GET" in (rule.methods or set()):
            try:
                return url_for(rule.endpoint)
            except Exception:
                break
    return "/"


# ── Compat mono-utilisateur (pour la surcouche app/) ────────────────────────
def current_compte():
    """FuelLog est mono-utilisateur : un « compte » virtuel unique quand authentifié."""
    if not session.get("auth"):
        return None
    return {"id": 1, "email": session.get("email"), "role": "super_admin",
            "etat": "actif", "mdp_hash": _admin_hash()}


def get_compte(_compte_id=None):
    return current_compte()


def is_super_admin() -> bool:
    return bool(session.get("auth"))


# ── Décorateur ──────────────────────────────────────────────────────────────
def login_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("auth"):
            return redirect(url_for("auth.gateway"))
        return view(*args, **kwargs)
    return wrapped


# ── Parcours de connexion ───────────────────────────────────────────────────
@bp.route("/gateway")
def gateway():
    email = cf_access_email()
    if email is not None:
        if not _email_autorise(email):
            return render_template("bloque.html", email=email), 403
        session["auth"] = True
        session["email"] = email
        return redirect(home_url())
    # Pas d'e-mail Cloudflare → accès local (LAN)
    if not _local_login_possible():
        return render_template("bloque.html", email="—"), 403
    return render_template("login.html")


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return redirect(url_for("auth.gateway"))
    if cf_access_email() is not None:          # déjà authentifié par Cloudflare
        return redirect(url_for("auth.gateway"))
    if not _local_login_possible():            # login local désactivé → refus (même en POST)
        return render_template("bloque.html", email="—"), 403
    time.sleep(1)                               # anti-force brute
    password = request.form.get("password", "")
    if check_password_hash(_admin_hash(), password):
        session["auth"] = True
        session["email"] = "admin (local)"
        return redirect(home_url())
    flash("Mot de passe incorrect.", "error")
    return redirect(url_for("auth.gateway"))


@bp.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("auth.gateway"))


@bp.route("/mot-de-passe-oublie")
def forgot():
    return render_template("oubli.html")
