# FuelLog

Application web progressive (PWA) de suivi de carburant et d'entretien pour un ou plusieurs véhicules. Accessible depuis n'importe quel appareil (iPhone, iPad, ordinateur) et installable sur l'écran d'accueil.

## Fonctionnalités

### Multi-véhicule
- Gestion de plusieurs véhicules (nom, marque, modèle, immatriculation, année)
- Chaque plein et entretien est rattaché à un véhicule ; sélecteur dans l'en-tête

### Suivi des pleins — système en 2 phases
- **Phase 1** (au moment du plein) : date, carburant, station, estimation ODB, prix total, litres
- **Phase 2** (au plein suivant) : kilométrage atteint + autonomie ODB restante
- Le kilométrage de départ est repris automatiquement du plein précédent

### Analyse de précision ODB
- Calcul automatique : `(km parcourus + ODB restant) / ODB annoncé × 100%`
- Jauge circulaire + graphique d'évolution, badge coloré par plein

### Statistiques & estimation
- Total dépensé, litres, prix moyen/L, km, conso L/100km, coût/100km, projection annuelle
- **Filtre par année**
- **Onglet Estimation** : consommation, dépense et nombre de pleins estimés pour un trajet, d'après tes moyennes réelles
- Graphiques Chart.js (conso, dépenses mensuelles, prix au litre, km…)

### Carnet d'entretien
- Interventions : date, kilométrage, catégorie personnalisable, coût, commentaire
- Pièces jointes (photos JPG/PNG et PDF de factures)
- **Export « Carnet PDF »** : récapitulatif + toutes les factures scannées assemblées dans un seul PDF, prêt pour la revente

### Stations carburant
- Carte interactive (Leaflet + OpenStreetMap), prix en temps réel (API gouvernementale française)
- Filtres par carburant, tri distance / prix, favoris persistants, bouton Waze
- Bouton GPS pour corriger les coordonnées d'une station via OpenStreetMap

### Données & maintenance
- **Export CSV** des pleins et des entretiens (Excel / Sheets / Numbers)
- **Sauvegarde / restauration complète** en un fichier (véhicules, pleins, entretiens, favoris, factures incluses) — sert aussi à migrer vers une autre installation
- **Bouton de mise à jour** intégré (git + npm + redémarrage), avec journal consultable

## Stack technique

| Élément | Technologie |
|---|---|
| Back-end | Node.js + Express 5 |
| Base de données | SQLite (better-sqlite3) |
| Upload / PDF | multer + pdf-lib |
| Front-end | HTML / CSS / JS vanilla (hors-ligne, sans CDN) |
| Carte / graphiques | Leaflet.js + Chart.js (hébergés localement) |
| Connexion | Mot de passe unique + auto-login Cloudflare Access |
| Process manager | systemd (socle) ou PM2 |

## Installation

### Option A — Proxmox, une seule commande (recommandé)

Sur l'**hôte Proxmox**, colle cette commande : elle crée le conteneur LXC Debian 12, l'installe et le démarre entièrement.

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/SuperNon0/fuellog/claude/review-project-structure-BvFkQ/proxmox/fuellog-lxc.sh)"
```

Personnalisable : `CTID=210 HOSTNAME=fuellog CORES=1 MEMORY=512 DISK=4 bash fuellog-lxc.sh`

### Option B — dans un conteneur/VM Debian existant

En **root**, dans le conteneur :

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/SuperNon0/fuellog/claude/review-project-structure-BvFkQ/install.sh)
```

`install.sh` crée un **utilisateur dédié non-root** (`fuellog`), installe Node.js, un **service systemd**, un **sudoers minimal** (mise à jour en un clic) et démarre le tout. FuelLog est ensuite sur `http://<ip>:3000`.

- **Mot de passe par défaut : `fuellog`** → change-le dans Paramètres → 🔐 Compte, ou `sudo bash /opt/fuellog/reset-admin-password.sh`.
- Service : `systemctl status fuellog` · logs : `journalctl -u fuellog -f`

> ⚠️ **Sécurité** — un login mot de passe est intégré, mais garde aussi FuelLog **derrière un accès protégé** (Cloudflare Access ou VPN). L'auto-login Cloudflare se règle dans Paramètres → Compte.

### Option C — PM2 (alternative)

```bash
git clone -b claude/review-project-structure-BvFkQ https://github.com/SuperNon0/fuellog.git /opt/fuellog
cd /opt/fuellog && npm install --omit=dev
pm2 start ecosystem.config.js && pm2 save && pm2 startup
```

## Migrer les données d'une installation à une autre

1. Sur l'**ancienne** installation : onglet **⚙️ Paramètres → « ⬇️ Télécharger la sauvegarde »** (fichier `.json` contenant tout, factures comprises)
2. Sur la **nouvelle** installation : **Paramètres → « ⬆️ Restaurer une sauvegarde »** et sélectionne ce fichier

La restauration remplace toutes les données actuelles par celles de la sauvegarde.

## Connexion & sécurité

- **Protection optionnelle** : par défaut le panel est **ouvert** (protégé par Cloudflare Access ou le réseau). Tu définis un mot de passe seulement si tu veux une couche en plus, dans Paramètres → 🔐 Compte & sécurité.
- Une fois défini, **login par mot de passe** (compte `admin`), haché en scrypt, session par cookie signé. Changer le mot de passe exige le mot de passe actuel ; on peut aussi désactiver la protection.
- **Mot de passe oublié** : `sudo bash /opt/fuellog/reset-admin-password.sh` (sans argument efface le mot de passe → panel ouvert ; avec argument en définit un nouveau), puis redémarrer le service.
- Secrets (`config.json`, `users.json`) générés au runtime, hors dépôt.

## Mises à jour

En un clic depuis **Paramètres → « ⬆️ Mettre à jour »**. En déploiement systemd, le panel délègue à l'updater root `/usr/local/sbin/fuellog-update` (via un sudoers minimal) qui aligne le dépôt, réinstalle les dépendances et redémarre le service de façon détachée. En cas de souci, **« 📋 Voir le journal de mise à jour »** affiche le détail.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute |
| `DB_PATH` | `<projet>/fuellog.db` | Emplacement de la base SQLite |
| `UPLOAD_DIR` | `<projet>/uploads` | Dossier des pièces jointes |
| `CONFIG_PATH` | `<projet>/config.json` | Secret de session + hash d'origine |
| `USERS_PATH` | `<projet>/users.json` | Compte admin (hash courant) |
| `HOST` | `0.0.0.0` | Interface d'écoute |
| `ALLOW_SELF_UPDATE` | `1` (systemd/ecosystem) | Autorise le bouton de mise à jour |
| `PM2_NAME` | `fuellog` | Nom du process PM2 à redémarrer (déploiement PM2) |

## Structure

```
├── server.js              — point d'entrée Express
├── ecosystem.config.js    — configuration PM2 (prod)
├── install.sh             — installation automatique (LXC/VM)
├── db/database.js         — SQLite + migrations
├── routes/
│   ├── pleins.js          — CRUD des pleins
│   ├── entretiens.js      — entretiens + pièces jointes + export PDF
│   ├── vehicules.js       — CRUD des véhicules
│   ├── types.js           — types d'entretien
│   ├── stations.js        — proxy API prix carburants
│   ├── favoris.js         — stations favorites
│   ├── donnees.js         — export CSV + sauvegarde/restauration
│   └── systeme.js         — version + mise à jour
└── public/
    ├── index.html
    ├── css/style.css
    ├── icons/             — icônes PWA
    └── js/                — api, app, charts, precision, stations,
                             entretien, estimation, settings
```
