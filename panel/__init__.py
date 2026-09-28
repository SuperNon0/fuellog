"""FuelLog — fabrique Flask autonome (fondée sur socle-lite, sans site-base).

Assemble : la config, la base SQLite (réglages + tables métier), l'auth
(Cloudflare Access + secours local), le thème (templates/static de panel/), et
la surcouche métier `app/` (écrans FuelLog) branchée via app.register().
"""
from __future__ import annotations

import os

from flask import Flask, request, session
from jinja2 import ChoiceLoader, FileSystemLoader

from .config import Config


def _load_overlay():
    """Charge la surcouche métier `app` (dossier app/)."""
    try:
        import app as overlay  # noqa: PLC0415
        return overlay
    except Exception:  # pas de surcouche → thème seul
        return None


def _run_overlay_schema(overlay, db_module) -> None:
    if overlay is None:
        return
    app_dir = os.path.dirname(os.path.abspath(overlay.__file__))
    schema = os.path.join(app_dir, "schema.sql")
    if os.path.isfile(schema):
        with open(schema, encoding="utf-8") as f:
            db_module.get_db().executescript(f.read())
            db_module.get_db().commit()


def create_app(config_object: type = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    overlay = _load_overlay()

    # Templates : thème (panel/templates) + surcouche (app/templates prime).
    if overlay is not None:
        app_dir = os.path.dirname(os.path.abspath(overlay.__file__))
        tpl = os.path.join(app_dir, "templates")
        if os.path.isdir(tpl):
            app.jinja_loader = ChoiceLoader([FileSystemLoader(tpl), app.jinja_loader])

    from . import db as db_module
    app.teardown_appcontext(db_module.close_db)

    with app.app_context():
        db_module.init_db()                 # réglages + amorce mot de passe
        _run_overlay_schema(overlay, db_module)  # tables métier (app/schema.sql)

    # Auth (Cloudflare + secours local).
    from .auth import bp as auth_bp
    app.register_blueprint(auth_bp)

    # Écrans FuelLog.
    if overlay is not None and hasattr(overlay, "register"):
        overlay.register(app)

    @app.context_processor
    def inject_globals():
        from .auth import is_super_admin
        return {
            "brand": {
                "prefix": app.config["BRAND_PREFIX"],
                "suffix": app.config["BRAND_SUFFIX"],
                "badge": app.config["BRAND_BADGE"],
            },
            "current_email": session.get("email"),
            "is_super_admin": is_super_admin,
        }

    @app.after_request
    def cache_headers(resp):
        # /api/* : jamais mis en cache.
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        # Fichiers statiques (JS/CSS/manifest…) : autorisés en cache MAIS revalidés
        # à chaque fois (ETag) → une mise à jour prend effet sans vider le cache.
        elif request.path.startswith("/app-static/") or request.path.startswith("/static/"):
            resp.headers["Cache-Control"] = "no-cache"
        return resp

    # Cache-busting : ?v=<hash> ajouté à toutes les URL statiques (url_for), pour
    # qu'après une mise à jour le navigateur recharge bien les nouveaux JS/CSS.
    import os as _os
    import subprocess as _sub
    import time as _time
    _root = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    try:
        _asset_v = _sub.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=_root,
                                     text=True, timeout=3, stderr=_sub.DEVNULL).strip()
    except Exception:
        _asset_v = str(int(_time.time()))

    @app.url_defaults
    def _add_asset_version(endpoint, values):
        if endpoint in ("static", "app.static") and "v" not in values:
            values["v"] = _asset_v

    return app
