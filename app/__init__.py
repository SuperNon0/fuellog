"""Surcouche projet FuelLog — suivi carburant & entretien.

Réutilise la base (auth, thème, DB, réglages) sans jamais la modifier :
- register() branche les écrans (blueprint app) dont l'accueil `/` ;
- app/templates/ prime sur les templates de la base ;
- app/schema.sql crée les tables métier ;
- APP_REGLAGES_TEMPLATE branche le partial de réglages dans la page /reglages.
"""

from __future__ import annotations


def register(flask_app) -> None:
    from .routes import bp
    flask_app.register_blueprint(bp)
    # Pas de page /reglages séparée : tous les réglages de l'app sont regroupés
    # dans l'onglet « Gestion » (la base masque alors son lien « Réglages »).
