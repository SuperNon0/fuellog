#!/usr/bin/env bash
# Réinitialise le mot de passe du panel FuelLog (secours en cas d'oubli).
#
#   sudo bash reset-admin-password.sh                 -> efface le mot de passe
#                                                        (le panel redevient ouvert)
#   sudo bash reset-admin-password.sh 'NouveauMDP'    -> définit un nouveau mot de passe
#
# À lancer SUR LE SERVEUR (console du conteneur ou SSH), puis redémarrer le service.
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")" && pwd)}"
PASSWORD="${1:-}"

if [ -z "$PASSWORD" ]; then
    node -e "require('$APP_DIR/auth').clearPassword(); console.log('Mot de passe effacé — le panel est de nouveau ouvert.')"
else
    node -e "require('$APP_DIR/auth').setPassword(process.argv[1]); console.log('Nouveau mot de passe défini.')" "$PASSWORD"
fi

# Le panel (utilisateur non-root) doit pouvoir réécrire ce fichier ensuite.
USERS_FILE="${USERS_PATH:-$APP_DIR/users.json}"
[ -f "$USERS_FILE" ] && { chown --reference="$APP_DIR" "$USERS_FILE" 2>/dev/null || true; chmod 600 "$USERS_FILE" 2>/dev/null || true; }

echo "→ Redémarre le service : sudo systemctl restart fuellog   (ou : pm2 restart fuellog)"
