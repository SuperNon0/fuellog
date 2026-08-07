#!/usr/bin/env bash
#
# FuelLog — installation automatique et idempotente sur un LXC / VM Debian ou
# Ubuntu. Aligne le déploiement sur le socle Site-base : utilisateur dédié
# non-root, service systemd, sudoers minimal, mise à jour en un clic.
#
# À lancer EN ROOT dans le conteneur :
#   bash <(curl -fsSL https://raw.githubusercontent.com/SuperNon0/fuellog/BRANCHE/install.sh)
# ou après avoir cloné le dépôt :
#   sudo bash install.sh
#
set -euo pipefail

# ---- Configuration (variables d'environnement, toutes optionnelles) ----
APP_DIR="${APP_DIR:-/opt/fuellog}"
APP_USER="${APP_USER:-fuellog}"
SERVICE="${SERVICE:-fuellog}"
PORT="${PORT:-3000}"
REPO_URL="${REPO_URL:-https://github.com/SuperNon0/fuellog.git}"
BRANCH="${BRANCH:-claude/review-project-structure-BvFkQ}"
NODE_MAJOR="${NODE_MAJOR:-20}"

log() { echo -e "\033[1;33m[FuelLog]\033[0m $*"; }
err() { echo -e "\033[1;31m[Erreur]\033[0m $*" >&2; }

[ "$(id -u)" -eq 0 ] || { err "À lancer en root (dans le conteneur)."; exit 1; }

# ---- 1. Dépendances système ----
log "Dépendances système…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates build-essential python3 sudo >/dev/null

# ---- 2. Node.js LTS ----
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt "$NODE_MAJOR" ]; then
  log "Installation de Node.js ${NODE_MAJOR}.x…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
log "Node $(node -v) / npm $(npm -v)"

# ---- 3. Utilisateur dédié non-root ----
if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Création de l'utilisateur système $APP_USER…"
  useradd --system --create-home --home-dir "$APP_DIR" --shell /bin/bash "$APP_USER"
fi

# ---- 4. Récupération du code ----
if [ -d "$APP_DIR/.git" ]; then
  log "Mise à jour du code dans $APP_DIR…"
  git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
  git -C "$APP_DIR" fetch origin "$BRANCH" --quiet
  git -C "$APP_DIR" checkout "$BRANCH" --quiet
  git -C "$APP_DIR" reset --hard "origin/$BRANCH" --quiet
else
  log "Clonage du dépôt dans $APP_DIR…"
  rm -rf "$APP_DIR"; mkdir -p "$APP_DIR"
  git clone -b "$BRANCH" --quiet "$REPO_URL" "$APP_DIR"
fi

# ---- 5. Dépendances de l'application ----
log "Dépendances npm…"
( cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 )

# Les données (base, uploads, config, users) sont écrites par l'utilisateur non-root
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# ---- 6. Service systemd ----
log "Service systemd…"
sed "s/PORT=3000/PORT=$PORT/" "$APP_DIR/systemd/fuellog.service" > "/etc/systemd/system/$SERVICE.service"
usermod -aG systemd-journal "$APP_USER" 2>/dev/null || true

# ---- 7. Updater root + sudoers minimal (mise à jour en un clic) ----
install -m 755 -o root -g root "$APP_DIR/deploy/update.sh" /usr/local/sbin/fuellog-update
cat > /etc/sudoers.d/fuellog <<EOF
$APP_USER ALL=(root) NOPASSWD: /usr/local/sbin/fuellog-update
$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart $SERVICE.service
EOF
chmod 440 /etc/sudoers.d/fuellog

# ---- 8. Démarrage ----
systemctl daemon-reload
systemctl enable "$SERVICE.service" >/dev/null 2>&1 || true
systemctl restart "$SERVICE.service"

IP=$(hostname -I | awk '{print $1}')
log "✅ Installation terminée."
echo ""
echo "  FuelLog : http://${IP}:${PORT}"
echo "  Service : systemctl status $SERVICE   ·   journalctl -u $SERVICE -f"
echo "  Mot de passe par défaut : \"fuellog\" → change-le dans Paramètres,"
echo "     ou : sudo bash $APP_DIR/reset-admin-password.sh"
echo ""
echo "  ➜ Place l'accès derrière une protection (Cloudflare Access / VPN)."
echo "  ➜ Migration des données : ancienne install → Paramètres → Télécharger"
echo "    la sauvegarde ; nouvelle install → Paramètres → Restaurer."
