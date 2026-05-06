# FuelLog

Application web progressive (PWA) de suivi de carburant personnel. Accessible depuis n'importe quel appareil (iPhone, ordinateur) et installable sur l'écran d'accueil.

## Fonctionnalités

### Suivi des pleins — système en 2 phases
- **Phase 1** (au moment du plein) : date, carburant, station, estimation ODB, prix total, litres
- **Phase 2** (au plein suivant) : kilométrage atteint + autonomie ODB restante
- Le kilométrage de départ est repris automatiquement du plein précédent
- Bannière violette pour le plein en attente de Phase 2

### Analyse de précision ODB
- Calcul automatique : `(km parcourus + ODB restant) / ODB annoncé × 100%`
- Jauge circulaire + graphique d'évolution
- Badge coloré sur chaque plein (vert ≥95%, jaune ≥85%, orange <85%)

### Statistiques
- Total dépensé, litres, prix moyen/L, km totaux
- Graphiques : dépense par plein, prix au litre, km parcourus (Chart.js)

### Stations carburant
- Carte interactive (Leaflet + OpenStreetMap)
- Prix en temps réel via l'API gouvernementale française
- Filtres par carburant (SP95, SP98, Diesel, E85) et tri par distance / prix
- Stations favorites persistantes
- Bouton Waze pour la navigation directe
- Recherche par ville ou code postal

## Stack technique

| Élément | Technologie |
|---|---|
| Back-end | Node.js + Express |
| Base de données | SQLite (better-sqlite3) |
| Front-end | HTML / CSS / JS vanilla |
| Carte | Leaflet.js + OpenStreetMap |
| Graphiques | Chart.js 4.4.1 |
| Typographie | DM Serif Display + DM Mono |

## Installation

```bash
npm install
```

Configurer le chemin de la base de données (optionnel, défaut : `/opt/fuellog/fuellog.db`) :

```bash
export DB_PATH=/chemin/vers/fuellog.db
```

Démarrer le serveur :

```bash
node server.js
# ou avec PM2
pm2 start server.js --name fuellog
```

L'application est disponible sur `http://localhost:3000`.

## Structure

```
├── server.js           — point d'entrée Express (port 3000)
├── db/
│   └── database.js     — connexion SQLite + initialisation des tables
├── routes/
│   ├── pleins.js       — CRUD des pleins
│   ├── stations.js     — proxy API gouvernementale prix carburants
│   └── favoris.js      — CRUD des stations favorites
└── public/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── api.js       — appels fetch vers le serveur
        ├── app.js       — logique principale
        ├── charts.js    — graphiques
        ├── precision.js — onglet précision ODB
        └── stations.js  — onglet stations
```
