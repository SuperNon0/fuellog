"""Commandes de FuelLog (autonome).

    python manage.py reset_password ["nouveau_mdp"]   # réinitialise le mot de passe admin (hashé en base)
"""
from __future__ import annotations

import os
import secrets
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)


def reset_password(args: list[str]) -> None:
    from werkzeug.security import generate_password_hash

    from panel import create_app
    from panel.db import get_db

    pwd = args[0] if args else secrets.token_urlsafe(12)
    app = create_app()
    with app.app_context():
        db = get_db()
        db.execute(
            "INSERT INTO app_settings (cle, valeur) VALUES ('admin_mdp_hash', ?) "
            "ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
            (generate_password_hash(pwd),),
        )
        db.commit()
    print("✓ Mot de passe admin mis à jour (hashé en base).")
    if not args:
        print(f"  Nouveau mot de passe : {pwd}   ← note-le !")


_COMMANDS = {"reset_password": reset_password}


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in _COMMANDS:
        print("Commandes : " + ", ".join(_COMMANDS))
        sys.exit(1)
    _COMMANDS[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    main()
