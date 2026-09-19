"""Commandes de FuelLog (autonome).

    python manage.py reset_password ["nouveau_mdp"]   # réinitialise le mot de passe admin (hashé en base)
    python manage.py local_login on|off               # (ré)active / désactive l'accès local (secours anti-verrouillage)
"""
from __future__ import annotations

import os
import secrets
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)


def _set(cle: str, valeur: str) -> None:
    from panel import create_app
    from panel.db import get_db
    app = create_app()
    with app.app_context():
        db = get_db()
        db.execute(
            "INSERT INTO app_settings (cle, valeur) VALUES (?, ?) "
            "ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
            (cle, valeur),
        )
        db.commit()


def reset_password(args: list[str]) -> None:
    from werkzeug.security import generate_password_hash

    pwd = args[0] if args else secrets.token_urlsafe(12)
    _set("admin_mdp_hash", generate_password_hash(pwd))
    print("✓ Mot de passe admin mis à jour (hashé en base).")
    if not args:
        print(f"  Nouveau mot de passe : {pwd}   ← note-le !")


def local_login(args: list[str]) -> None:
    """Filet de sécurité : réactiver l'accès local si on s'est bloqué dehors."""
    on = (args[0].lower() if args else "on") in ("on", "1", "true", "yes")
    _set("allow_local", "1" if on else "0")
    print("✓ Accès local " + ("activé" if on else "désactivé") + " (en base).")


_COMMANDS = {"reset_password": reset_password, "local_login": local_login}


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in _COMMANDS:
        print("Commandes : " + ", ".join(_COMMANDS))
        sys.exit(1)
    _COMMANDS[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    main()
