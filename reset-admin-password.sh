#!/usr/bin/env bash
# Réinitialise le mot de passe du panel FuelLog (compte « admin »).
#
# À lancer SUR LE SERVEUR (console du LXC ou SSH) quand le mot de passe est
# oublié et qu'on ne peut plus se connecter au panel. Écrit un nouveau hash
# scrypt dans le fichier des comptes (users.json), lu par le panel Node.
#
# Usage :
#   sudo bash reset-admin-password.sh                 # demande le mot de passe
#   sudo bash reset-admin-password.sh 'MonNouveauMDP' # mot de passe en argument
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")" && pwd)}"

# Mot de passe : argument, sinon saisie masquée.
PASSWORD="${1:-}"
if [ -z "$PASSWORD" ]; then
    read -rsp "Nouveau mot de passe du panel (8 caractères min.) : " PASSWORD
    echo
fi
if [ "${#PASSWORD}" -lt 8 ]; then
    echo "Erreur : le mot de passe doit faire au moins 8 caractères." >&2
    exit 1
fi

# Le module auth.js gère le hachage scrypt et l'écriture de users.json.
node -e "require('$APP_DIR/auth').setPassword(process.argv[1]); console.log('Fichier des comptes réécrit.')" "$PASSWORD"

# Le panel doit pouvoir réécrire ce fichier ensuite : aligner le propriétaire
# sur celui du dossier de l'application.
USERS_FILE="${USERS_PATH:-$APP_DIR/users.json}"
chown --reference="$APP_DIR" "$USERS_FILE" 2>/dev/null || true
chmod 600 "$USERS_FILE" 2>/dev/null || true

echo "✅ Mot de passe du compte « admin » réinitialisé. Reconnecte-toi sur le panel."
