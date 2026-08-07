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
| Front-end | HTML / CSS / JS vanilla |
| Carte / graphiques | Leaflet.js + Chart.js |
| Process manager | PM2 |

## Installation dans un conteneur LXC (Proxmox) dédié

### 1. Créer le conteneur

Sur l'hôte Proxmox (ou via l'interface web), crée un LXC **Debian 12** :
- 1 vCPU, 512 Mo de RAM, 4 Go de disque suffisent largement
- Réseau avec accès Internet

### 2. Installation automatique

Dans la console du conteneur, en **root**, une seule commande :

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/SuperNon0/fuellog/claude/review-project-structure-BvFkQ/install.sh)
```

Le script installe Node.js, PM2, clone le dépôt, installe les dépendances, démarre le service et l'active au démarrage du conteneur.

FuelLog est ensuite disponible sur `http://<ip-du-conteneur>:3000`.

> ⚠️ **Sécurité** — FuelLog n'a pas de système de connexion intégré. Place-le **derrière un accès protégé** (Cloudflare Access, reverse-proxy authentifié ou VPN) avant de l'exposer. C'est aussi ce qui protège le bouton de mise à jour (qui exécute des commandes shell).

### Installation manuelle (alternative)

```bash
git clone -b claude/review-project-structure-BvFkQ https://github.com/SuperNon0/fuellog.git /opt/fuellog
cd /opt/fuellog
npm install --omit=dev
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

## Migrer les données d'une installation à une autre

1. Sur l'**ancienne** installation : onglet **⚙️ Paramètres → « ⬇️ Télécharger la sauvegarde »** (fichier `.json` contenant tout, factures comprises)
2. Sur la **nouvelle** installation : **Paramètres → « ⬆️ Restaurer une sauvegarde »** et sélectionne ce fichier

La restauration remplace toutes les données actuelles par celles de la sauvegarde.

## Mises à jour

Une fois installé, les mises à jour se font en un clic depuis **Paramètres → « ⬆️ Mettre à jour »** (nécessite `ALLOW_SELF_UPDATE=1`, activé par défaut dans `ecosystem.config.js`). En cas de souci, **« 📋 Voir le journal de mise à jour »** affiche le détail.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute |
| `DB_PATH` | `<projet>/fuellog.db` | Emplacement de la base SQLite |
| `UPLOAD_DIR` | `<projet>/uploads` | Dossier des pièces jointes |
| `ALLOW_SELF_UPDATE` | `1` (via ecosystem) | Autorise le bouton de mise à jour |
| `PM2_NAME` | `fuellog` | Nom du process PM2 à redémarrer |

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
