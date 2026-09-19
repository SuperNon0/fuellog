#!/usr/bin/env bash
#
# FuelLog (autonome) — installation dans un conteneur LXC / une VM (Debian/Ubuntu).
# À lancer EN ROOT dans le conteneur :
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/SuperNon0/fuellog/main/install.sh)
#
# Options (variables d'environnement, toutes optionnelles) :
#   BRANCH=main                  branche à installer
#   PORT=8000                    port d'écoute
#   ADMIN_PASSWORD=...           mot de passe admin (sinon généré aléatoirement)
#   REPO_URL=...                 dépôt (défaut : SuperNon0/fuellog)
#
set -euo pipefail

APP_DIR="/opt/fuellog"
APP_USER="fuellog"
SERVICE="fuellog"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-8000}"
REPO_URL="${REPO_URL:-https://github.com/SuperNon0/fuellog.git}"

GN=$'\033[1;92m'; YW=$'\033[33m'; RD=$'\033[01;31m'; CL=$'\033[m'
log()  { echo -e " ${YW}➤${CL} $1"; }
ok()   { echo -e " ${GN}✓${CL} $1"; }
die()  { echo -e " ${RD}✗${CL} $1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "À lancer en root (ou via sudo)."

log "[1/6] Dépendances système"
apt-get update -y -qq
apt-get install -y -qq --no-install-recommends python3 python3-venv python3-pip git ca-certificates curl >/dev/null

log "[2/6] Utilisateur système '${APP_USER}'"
id "${APP_USER}" >/dev/null 2>&1 || useradd --system --shell /usr/sbin/nologin --home "${APP_DIR}" "${APP_USER}"

log "[3/6] Code source (${REPO_URL} @ ${BRANCH})"
if [ -d "${APP_DIR}/.git" ]; then
  git -C "${APP_DIR}" fetch --depth 1 origin "${BRANCH}" -q
  git -C "${APP_DIR}" checkout -q -B "${BRANCH}" "origin/${BRANCH}"
else
  git clone --depth 1 -b "${BRANCH}" "${REPO_URL}" "${APP_DIR}" -q
fi
mkdir -p "${APP_DIR}/data"

log "[4/6] Environnement Python"
python3 -m venv "${APP_DIR}/.venv"
"${APP_DIR}/.venv/bin/pip" install -q --upgrade pip
"${APP_DIR}/.venv/bin/pip" install -q -r "${APP_DIR}/requirements.txt"

log "[5/6] Configuration (.env)"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
# Si un terminal est dispo et rien n'a été fourni, on propose de saisir un mdp.
if [ -z "${ADMIN_PASSWORD}" ] && [ -t 0 ]; then
  read -rsp ">>> Mot de passe admin (Entrée = généré au hasard) : " ADMIN_PASSWORD || true; echo
fi
GENERATED=""
if [ -z "${ADMIN_PASSWORD}" ]; then
  ADMIN_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_urlsafe(12))')"; GENERATED="1"
fi
if [ ! -f "${APP_DIR}/.env" ]; then
  KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  cat > "${APP_DIR}/.env" <<EOF
SECRET_KEY=${KEY}
SESSION_COOKIE_SECURE=false
DATABASE_PATH=${APP_DIR}/data/fuellog.db
BRAND_PREFIX=Fuel
BRAND_SUFFIX=Log
BRAND_BADGE=suivi carburant & entretien
CF_ACCESS_TEAM_DOMAIN=
CF_ACCESS_AUD=
CF_VERIFY_JWT=true
ALLOW_LOCAL_LOGIN=true
ADMIN_PASSWORD=${ADMIN_PASSWORD}
EOF
  ok ".env créé"
fi

chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"
chmod 640 "${APP_DIR}/.env"

# Amorce le mot de passe (hashé) en base dès maintenant.
sudo -u "${APP_USER}" env ADMIN_PASSWORD="${ADMIN_PASSWORD}" \
  "${APP_DIR}/.venv/bin/python" -c "import sys; sys.path.insert(0,'${APP_DIR}'); from panel import create_app; create_app()" >/dev/null 2>&1 || true

log "[6/6] Service systemd"
sed "s|__PORT__|${PORT}|" "${APP_DIR}/deploy/fuellog.service" > "/etc/systemd/system/${SERVICE}.service"
systemctl daemon-reload
systemctl enable "${SERVICE}" >/dev/null 2>&1 || true
systemctl restart "${SERVICE}"

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "════════════════════════════════════════════════════════════════"
ok "FuelLog installé et démarré."
echo "   Adresse       : http://${IP}:${PORT}"
if [ -n "${GENERATED}" ]; then
  echo "   Mot de passe  : ${ADMIN_PASSWORD}   ← généré, note-le !"
else
  echo "   Mot de passe  : (celui que tu as saisi)"
fi
echo "════════════════════════════════════════════════════════════════"
echo " Étapes suivantes :"
echo "  1. Ouvre http://${IP}:${PORT} et connecte-toi avec le mot de passe ci-dessus."
echo "  2. (Prod) Expose derrière Cloudflare Access, puis renseigne Équipe + AUD"
echo "     dans Gestion → Accès & sécurité, clique « Tester », puis « Enregistrer »."
echo "  3. Migre tes données depuis l'ancienne version : Gestion → Sauvegarde,"
echo "     « Restaurer une sauvegarde » (le .json exporté de l'ancien FuelLog)."
echo ""
echo " Utile :  journalctl -u ${SERVICE} -f   ·   mot de passe : sudo bash ${APP_DIR}/deploy/reset-password.sh"
