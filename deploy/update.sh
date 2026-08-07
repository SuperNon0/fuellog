#!/usr/bin/env bash
#
# Met à jour FuelLog depuis GitHub et redémarre le service (déploiement systemd).
#
# Lancé EN ROOT par le panel via sudo (bouton « Mettre à jour »), ou à la main :
#   sudo /usr/local/sbin/fuellog-update
#
# Le corps est encapsulé dans main() : bash parse toute la fonction en mémoire
# avant de l'exécuter, ce qui permet au script de se remplacer sans corruption.
set -euo pipefail

main() {
    local APP_DIR="${APP_DIR:-/opt/fuellog}"
    local APP_USER="${APP_USER:-fuellog}"
    local SERVICE="${SERVICE:-fuellog}"

    [[ -d "$APP_DIR/.git" ]] || { echo "[update] dépôt introuvable dans $APP_DIR" >&2; exit 1; }

    git config --global --add safe.directory "$APP_DIR" 2>/dev/null || true
    local BRANCH
    BRANCH="$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)"
    echo "[update] branche : $BRANCH"

    # Alignement forcé sur le dépôt (évite l'échec si un fichier a bougé côté serveur)
    git -C "$APP_DIR" fetch origin "$BRANCH"
    git -C "$APP_DIR" reset --hard "origin/$BRANCH"

    echo "[update] dépendances npm…"
    ( cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund )

    # Les fichiers appartiennent à l'utilisateur non-root qui fait tourner le service
    chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

    # Rafraîchir ce script root depuis le dépôt (self-update de l'updater)
    install -m 755 -o root -g root "$APP_DIR/deploy/update.sh" /usr/local/sbin/fuellog-update 2>/dev/null || true

    echo "[update] redémarrage détaché du service $SERVICE…"
    # Redémarrage détaché : sinon systemd tuerait ce script au moment d'arrêter le service.
    if command -v systemd-run >/dev/null; then
        systemd-run --quiet --on-active=2 systemctl restart "$SERVICE.service"
    else
        systemctl restart "$SERVICE.service"
    fi
    echo "[update] terminé."
}

main "$@"
