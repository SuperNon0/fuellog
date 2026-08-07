#!/usr/bin/env bash
#
# ============================================================================
#  FuelLog — déploiement automatique d'un conteneur LXC sur Proxmox VE
#
#  À COLLER DANS LE SHELL DE L'HÔTE PROXMOX (pas dans un conteneur).
#  Crée un LXC Debian 12, le démarre, y clone le dépôt et lance install.sh
#  (utilisateur non-root + service systemd + mise à jour en un clic).
#
#  Usage (shell Proxmox) :
#    bash -c "$(wget -qLO - https://raw.githubusercontent.com/SuperNon0/fuellog/BRANCHE/proxmox/fuellog-lxc.sh)"
#
#  Personnalisation (variables d'environnement, toutes optionnelles) :
#    CTID=210 HOSTNAME=fuellog CORES=1 MEMORY=512 DISK=4 PANEL_PORT=3000 \
#      bash fuellog-lxc.sh
# ============================================================================
set -euo pipefail

CTID="${CTID:-}"                         # vide = prochain ID libre
HOSTNAME="${HOSTNAME:-fuellog}"
CORES="${CORES:-1}"
MEMORY="${MEMORY:-512}"                   # Mo
SWAP="${SWAP:-512}"
DISK="${DISK:-4}"                         # Go
STORAGE="${STORAGE:-local-lvm}"
BRIDGE="${BRIDGE:-vmbr0}"
PANEL_PORT="${PANEL_PORT:-3000}"
REPO_URL="${REPO_URL:-https://github.com/SuperNon0/fuellog.git}"
BRANCH="${BRANCH:-claude/review-project-structure-BvFkQ}"

YW=$'\033[33m'; GN=$'\033[1;92m'; RD=$'\033[01;31m'; CL=$'\033[m'
info() { echo -e " ${YW}➤${CL} $1"; }
ok()   { echo -e " ${GN}✓${CL} $1"; }
die()  { echo -e " ${RD}✗${CL} $1" >&2; exit 1; }

command -v pct >/dev/null || die "pct introuvable : lance ce script sur l'hôte Proxmox."

[ -n "$CTID" ] || CTID="$(pvesh get /cluster/nextid)"
info "Conteneur LXC #$CTID ($HOSTNAME)"

# Template Debian 12 : le télécharger s'il manque
TEMPLATE="$(pveam available --section system 2>/dev/null | awk '/debian-12-standard/{print $2}' | sort | tail -1)"
[ -n "$TEMPLATE" ] || die "Template Debian 12 introuvable (pveam available)."
if ! pveam list local 2>/dev/null | grep -q "$TEMPLATE"; then
  info "Téléchargement du template $TEMPLATE…"
  pveam download local "$TEMPLATE" >/dev/null
fi

info "Création du conteneur…"
pct create "$CTID" "local:vztmpl/$TEMPLATE" \
  --hostname "$HOSTNAME" --unprivileged 1 --features nesting=1 \
  --cores "$CORES" --memory "$MEMORY" --swap "$SWAP" \
  --rootfs "$STORAGE:$DISK" --net0 "name=eth0,bridge=$BRIDGE,ip=dhcp" \
  --onboot 1 >/dev/null
ok "Conteneur créé"

info "Démarrage…"
pct start "$CTID"
sleep 8   # laisser le réseau (DHCP) s'établir

info "Installation de FuelLog dans le conteneur…"
pct exec "$CTID" -- bash -c "apt-get update -qq && apt-get install -y -qq curl >/dev/null && \
  BRANCH='$BRANCH' PORT='$PANEL_PORT' REPO_URL='$REPO_URL' \
  bash <(curl -fsSL https://raw.githubusercontent.com/SuperNon0/fuellog/$BRANCH/install.sh)"

IP="$(pct exec "$CTID" -- hostname -I | awk '{print $1}')"
ok "FuelLog installé dans le conteneur #$CTID"
echo ""
echo "   Accès : http://${IP}:${PANEL_PORT}"
echo "   Console : pct enter $CTID    ·    Logs : pct exec $CTID -- journalctl -u fuellog -f"
echo "   Pense à placer l'accès derrière une protection (Cloudflare Access / VPN)."
