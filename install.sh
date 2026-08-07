#!/usr/bin/env bash
#
# FuelLog — installation automatique sur un LXC / VM Debian ou Ubuntu vierge.
#
# À lancer EN ROOT à l'intérieur du conteneur :
#   bash <(curl -fsSL https://raw.githubusercontent.com/SuperNon0/fuellog/BRANCHE/install.sh)
# ou, après avoir cloné le dépôt :
#   bash install.sh
#
set -euo pipefail

# ---- Configuration (modifiable) ----
APP_DIR="${APP_DIR:-/opt/fuellog}"
REPO_URL="${REPO_URL:-https://github.com/SuperNon0/fuellog.git}"
BRANCH="${BRANCH:-claude/review-project-structure-BvFkQ}"
NODE_MAJOR="${NODE_MAJOR:-20}"

log()  { echo -e "\033[1;33m[FuelLog]\033[0m $*"; }
err()  { echo -e "\033[1;31m[Erreur]\033[0m $*" >&2; }

if [ "$(id -u)" -ne 0 ]; then
  err "Ce script doit être lancé en root (dans le conteneur LXC)."
  exit 1
fi

# ---- 1. Dépendances système ----
log "Installation des dépendances système…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates build-essential python3 >/dev/null

# ---- 2. Node.js LTS ----
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt "$NODE_MAJOR" ]; then
  log "Installation de Node.js ${NODE_MAJOR}.x…"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
log "Node $(node -v) / npm $(npm -v)"

# ---- 3. PM2 ----
if ! command -v pm2 >/dev/null 2>&1; then
  log "Installation de PM2…"
  npm install -g pm2 >/dev/null 2>&1
fi

# ---- 4. Récupération du code ----
if [ -d "$APP_DIR/.git" ]; then
  log "Mise à jour du code existant dans $APP_DIR…"
  git -C "$APP_DIR" fetch origin "$BRANCH" --quiet
  git -C "$APP_DIR" checkout "$BRANCH" --quiet
  git -C "$APP_DIR" reset --hard "origin/$BRANCH" --quiet
else
  log "Clonage du dépôt dans $APP_DIR…"
  git clone -b "$BRANCH" --quiet "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# ---- 5. Dépendances de l'application ----
log "Installation des dépendances npm…"
npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1

# ---- 6. Démarrage via PM2 ----
log "Démarrage du service…"
pm2 delete fuellog >/dev/null 2>&1 || true
pm2 start ecosystem.config.js >/dev/null
pm2 save >/dev/null
# Démarrage automatique au boot du conteneur
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
pm2 save >/dev/null

IP=$(hostname -I | awk '{print $1}')
log "✅ Installation terminée !"
echo ""
echo "  FuelLog tourne sur : http://${IP}:3000"
echo "  Dossier            : $APP_DIR"
echo "  Logs               : pm2 logs fuellog"
echo ""
echo "  ➜ Pense à placer l'accès derrière une protection (Cloudflare Access,"
echo "    reverse-proxy authentifié ou VPN) : FuelLog n'a pas de login intégré."
echo ""
echo "  ➜ Migration des données depuis une autre installation :"
echo "    ancienne install → Paramètres → « Télécharger la sauvegarde »"
echo "    nouvelle install → Paramètres → « Restaurer une sauvegarde »"
