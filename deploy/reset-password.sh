#!/usr/bin/env bash
#
# FuelLog — réinitialise le mot de passe admin (secours local LAN).
#
# Le mot de passe est HASHÉ en base (table app_settings), pas dans le .env :
# ce script régénère le hash puis recharge le service. Jamais de reset depuis
# le web (sécurité).
#
# Usage (en root sur le serveur) :
#   sudo bash deploy/reset-password.sh                 # génère un mot de passe et l'affiche
#   sudo bash deploy/reset-password.sh 'MonNouveauMdp' # fixe un mot de passe précis
#
# Réglages (si ton install diffère) :
#   INSTALL_DIR=/opt/fuellog   dossier de l'appli (défaut)
#   SERVICE=fuellog            nom du service systemd (défaut)
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/fuellog}"
SERVICE="${SERVICE:-fuellog}"
PYTHON="${INSTALL_DIR}/.venv/bin/python"
[ -x "${PYTHON}" ] || PYTHON="python3"

cd "${INSTALL_DIR}"
"${PYTHON}" manage.py reset_password "$@"

# Recharge le service s'il existe (le hash est en base : un redémarrage suffit).
if command -v systemctl >/dev/null 2>&1 \
   && systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE}\.service"; then
    systemctl restart "${SERVICE}"
    echo "→ service ${SERVICE} redémarré."
else
    echo "→ redémarre le service manuellement si besoin (ex. systemctl restart ${SERVICE})."
fi
