# FuelLog — Cahier des Charges Complet

## 1. Présentation du projet

**FuelLog** est une application web progressive (PWA) de suivi de carburant personnel, hébergée sur un serveur Proxmox via un container LXC Debian. Elle est accessible depuis n'importe quel appareil (iPhone, ordinateur) via l'URL `fuel.super-nono.cc`, sécurisée par Cloudflare Access (authentification par email).

L'application permet de suivre tous ses pleins d'essence, analyser ses dépenses, surveiller la précision de l'ordinateur de bord de sa voiture, et trouver les stations les moins chères à proximité.

---

## 2. Infrastructure technique

| Élément | Détail |
|---|---|
| Serveur | Proxmox VE 8.4.17 — Intel Core i5, 32 Go RAM, 1 To |
| Container | LXC Debian 13, 512 Mo RAM, 34 Go disque |
| IP locale | 192.168.0.77 port 3000 |
| URL publique | fuel.super-nono.cc |
| Tunnel | Cloudflare Tunnel (cloudflared service) |
| Auth | Cloudflare Access — email noe.fougeray30@gmail.com |
| Process manager | PM2 (démarrage automatique au boot) |
| Éditeur distant | VSCode + extension Remote SSH |

### Stack technique

- **Back-end** : Node.js 20 + Express
- **Base de données** : SQLite via `better-sqlite3`
- **Front-end** : HTML/CSS/JS vanilla (pas de framework)
- **Carte** : Leaflet.js + OpenStreetMap
- **Graphiques** : Chart.js 4.4.1
- **Fonts** : DM Serif Display + DM Mono (Google Fonts)

### Structure des fichiers

```
/opt/fuellog/
├── server.js              — point d'entrée, lance Express sur port 3000
├── package.json
├── fuellog.db             — base de données SQLite
├── routes/
│   ├── pleins.js          — CRUD des pleins (GET/POST/PUT/PATCH/DELETE)
│   ├── stations.js        — proxy API gouvernementale prix carburants
│   └── favoris.js         — CRUD des stations favorites
├── db/
│   └── database.js        — connexion SQLite + initialisation tables
└── public/
    ├── index.html         — structure HTML
    ├── css/
    │   └── style.css      — tout le CSS
    └── js/
        ├── api.js         — toutes les fonctions fetch vers le serveur
        ├── app.js         — logique principale (pleins, historique, modals)
        ├── charts.js      — graphiques Chart.js
        ├── precision.js   — onglet précision ODB
        └── stations.js    — onglet stations carburant
```

---

## 3. Charte graphique

### Palette de couleurs (thème sombre)

| Variable | Valeur | Usage |
|---|---|---|
| `--bg` | `#0e0f11` | Fond général |
| `--surface` | `#16181c` | Header, nav |
| `--card` | `#1c1f25` | Cartes, modals |
| `--border` | `#2a2d35` | Bordures |
| `--accent` | `#e8c547` | Jaune — couleur principale, boutons, titres |
| `--accent2` | `#4fc3a1` | Vert — bonne précision (≥95%), SP98 |
| `--accent3` | `#e87c47` | Orange — précision moyenne (85-94%), Diesel |
| `--text` | `#f0ede6` | Texte principal |
| `--muted` | `#6b6f7a` | Texte secondaire, labels |
| `--danger` | `#e85c47` | Rouge — suppression, erreurs, E85 |
| `--pending` | `#a78bfa` | Violet — Phase 1 en attente, bouton FAB |

### Typographie

- **Titres/logos** : `DM Serif Display` (serif élégant)
- **Corps/UI** : `DM Mono` (monospace, 400 et 500)
- Jamais d'Inter, Roboto ou Arial

### Composants UI

- Boutons primaires : fond `--accent` (jaune), texte noir, `border-radius: 8px`
- Bouton FAB : fond `--pending` (violet), `border-radius: 20px`, `64x64px`, fixe en bas à droite
- Cards : fond `--card`, bordure `1px solid --border`, `border-radius: 12px`
- Tags carburant : SP95=jaune, SP98=vert, Diesel=orange, E85=rouge
- Badge précision ODB : vert ≥95%, jaune ≥85%, orange <85%
- Modals : s'ouvrent depuis le bas (style sheet iOS), poignée en haut

---

## 4. Base de données SQLite

### Table `pleins`

| Colonne | Type | Description |
|---|---|---|
| id | INTEGER PK | Timestamp en millisecondes |
| date | TEXT | Format YYYY-MM-DD |
| type | TEXT | SP95, SP98, Diesel, E85 |
| kmDepart | INTEGER | Kilométrage au moment du plein (repris auto du plein précédent) |
| kmTotal | INTEGER | Kilométrage renseigné au plein SUIVANT (Phase 2) — NULL si Phase 1 |
| estimPlein | REAL | Ce que l'ODB affiche après le plein (km restants annoncés) |
| estimRestante | REAL | Ce que l'ODB affiche au plein SUIVANT (km restants) — NULL si Phase 1 |
| total | REAL | Prix total payé en € |
| litres | REAL | Nombre de litres (optionnel) |
| prixL | REAL | Prix au litre en € (optionnel) |
| station | TEXT | Nom de la station (optionnel) |

### Table `favoris`

| Colonne | Type | Description |
|---|---|---|
| id | TEXT PK | ID de la station (depuis l'API gouvernementale) |
| nom | TEXT | Nom/adresse de la station |
| adresse | TEXT | Adresse complète |
| lat | REAL | Latitude GPS |
| lng | REAL | Longitude GPS |
| ville | TEXT | Ville |

---

## 5. Logique métier — Les Pleins en 2 phases

C'est le cœur de l'application. Chaque plein se fait en **deux étapes** :

### Phase 1 — Au moment du plein

L'utilisateur vient de faire le plein. Il saisit :
- La date
- Le type de carburant
- La station (menu déroulant : favoris → stations proches → saisie manuelle)
- L'estimation ODB annoncée (ce que la voiture affiche après le plein)
- Le prix total payé
- Les litres et prix/L (optionnels)

**Le kilométrage de départ est automatiquement repris** du `kmTotal` du plein précédent (ou du `kmDepart` si le précédent est encore en Phase 1).

Le plein est créé avec `kmTotal = NULL` et `estimRestante = NULL`.

### Phase 2 — Au plein suivant

Quand l'utilisateur arrive à la station pour son plein suivant, **avant de faire le plein**, il complète le plein précédent :
- Le kilométrage total atteint (le compteur de la voiture)
- L'estimation ODB restante (ce que la voiture affiche à ce moment)

### Calculs automatiques

```
kmParcourus = kmTotal - kmDepart
précision ODB = (kmParcourus + estimRestante) / estimPlein × 100%
```

**Exemple :**
- Plein du 02/01 : kmDepart=146716, estimPlein=866
- Au plein suivant (10/01) : kmTotal=147394, estimRestante=95
- kmParcourus = 147394 - 146716 = 678 km
- Précision = (678 + 95) / 866 = 89.3%

---

## 6. Fonctionnalités — État actuel

### ✅ Fonctionnel

| Fonctionnalité | Description |
|---|---|
| Historique (page d'accueil) | Liste des pleins du plus récent au plus ancien |
| Banner Phase 1 | Le plein en attente est mis en avant en violet en haut de l'historique |
| Voir plus / Voir moins | Chaque ligne se déplie pour afficher tous les détails |
| Modifier un plein | Modal avec tous les champs modifiables |
| Repasser en Phase 1 | Remet kmTotal et estimRestante à NULL |
| Supprimer avec confirmation | "Voulez-vous vraiment supprimer ?" |
| Bouton FAB violet | Bouton + fixe en bas à droite, ouvre la saisie |
| Menu station déroulant | Favoris → Stations proches → Saisie manuelle |
| Confirmation prix API | Propose le prix de l'API avec avertissement "prix peut avoir changé" |
| Onglet Stats | Graphiques dépenses, prix/L, km parcourus |
| Onglet Précision ODB | Jauge circulaire + graphique + tableau détaillé |
| Badge précision coloré | Vert/jaune/orange selon le % sur chaque ligne historique |
| Onglet Stations — Carte | Carte Leaflet avec marqueurs |
| Onglet Stations — Favoris | Sauvegardés en SQLite (persistants) |
| Bouton Waze | Ouvre Waze avec coordonnées GPS (`waze://ul?ll=lat,lng&navigate=yes`) |
| Bouton Copier adresse | Copie l'adresse dans le presse-papier |
| Géolocalisation auto | Se déclenche automatiquement à l'ouverture de l'onglet Stations |
| Voir plus stations | 5 par défaut, +2 à chaque clic |
| PWA | Ajout à l'écran d'accueil iPhone (via Safari → Partager → Sur l'écran d'accueil) |

### ❌ Bugs connus / Non fonctionnel

| Problème | Description | Cause probable |
|---|---|---|
| **Stations — aucune station affichée** | La carte se charge et la position est détectée mais aucune station n'apparaît dans la liste | Le parsing des prix de l'API gouvernementale est incorrect. L'API renvoie les prix dans un tableau `prix` avec des clés préfixées `@` (ex: `@nom`, `@valeur`). Le filtre `Object.keys(s.prix).length > 0` supprime toutes les stations dont les prix ne sont pas parsés. À débugger avec `curl` sur le serveur. |
| **Noms des stations** | Affiche l'adresse au lieu du nom de l'enseigne (Total, BP, etc.) | L'API gouvernementale `prix-des-carburants-en-france-flux-instantane-v2` ne fournit pas le champ enseigne dans tous les enregistrements. Chercher le champ `enseignes` ou `brand` dans la réponse API. |
| **Popup carte** | Les popups sur les marqueurs de la carte sont stylisées mais peuvent avoir des bugs d'affichage | CSS Leaflet popup à vérifier |

---

## 7. API gouvernementale prix carburants

**URL** : `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records`

**Paramètres** :
- `limit=50` — nombre de résultats
- `where=within_distance(geom,GEOM'POINT(lng lat)',25km)` — filtre géographique

**Format de réponse observé dans les logs** :
```json
{
  "id": 34170004,
  "latitude": 4363100,
  "longitude": 390600,
  "cp": "34170",
  "adresse": "1001 avenue de l'europe",
  "ville": "Castelnau-le-Lez",
  "services": [...],
  "prix": [
    {"@nom": "Gazole", "@id": "1", "@maj": "2026-04-03 11:54:48", "@valeur": "2.419"},
    {"@nom": "E85",    "@id": "3", "@maj": "2026-04-03 11:54:49", "@valeur": "0.758"},
    {"@nom": "E10",    "@id": "5", "@maj": "2026-04-03 11:54:49", "@valeur": "1.xxx"}
  ]
}
```

**Points importants** :
- `latitude` et `longitude` sont divisés par **100000** pour obtenir les coordonnées réelles
- Les prix dans `@valeur` sont **déjà en €/L** (pas besoin de diviser)
- Les noms de carburants : `Gazole`=Diesel, `E10`=SP95, `SP95`=SP95, `SP98`=SP98, `E85`=E85
- Le champ `@nom` utilise des **accents** et des **majuscules** variables

**Code de parsing à utiliser** :
```javascript
if (Array.isArray(s.prix)) {
  s.prix.forEach(p => {
    const nom = (p['@nom'] || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const val = parseFloat(p['@valeur']);
    if (isNaN(val) || val < 0.5 || val > 5) return;
    if (nom === 'gazole') prix['Diesel'] = val;
    else if (nom === 'e10' || nom === 'sp95') prix['SP95'] = val;
    else if (nom === 'sp98') prix['SP98'] = val;
    else if (nom === 'e85') prix['E85'] = val;
  });
}
```

---

## 8. Routes API back-end

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/pleins` | Récupère tous les pleins triés par date ASC |
| POST | `/api/pleins` | Crée un nouveau plein (Phase 1) |
| PATCH | `/api/pleins/:id` | Complète la Phase 2 (kmTotal + estimRestante) |
| PUT | `/api/pleins/:id` | Modifie tous les champs d'un plein |
| DELETE | `/api/pleins/:id` | Supprime un plein |
| DELETE | `/api/pleins` | Supprime tous les pleins |
| GET | `/api/stations?lat=&lng=` | Stations proches via API gouvernementale |
| GET | `/api/favoris` | Liste des stations favorites |
| POST | `/api/favoris` | Ajoute une station favorite |
| DELETE | `/api/favoris/:id` | Supprime une station favorite |

---

## 9. Données de départ (import Excel)

L'application a été initialisée avec 9 pleins importés depuis un fichier Excel :

| Date | Km départ | Km total | ODB annoncé | ODB restant | Total € |
|---|---|---|---|---|---|
| 02/01/2026 | 146716 | 147394 | 866 | 95 | 75.06 |
| 10/01/2026 | 147394 | 148163 | 849 | 75 | 78.00 |
| 16/01/2026 | 148163 | 148841 | 854 | 68 | 76.00 |
| 08/02/2026 | 148841 | 149431 | 848 | 120 | 73.69 |
| 14/02/2026 | 149431 | 150174 | 841 | 89 | 76.60 |
| 25/02/2026 | 150174 | 150935 | 859 | 120 | 82.76 |
| 07/03/2026 | 150935 | 151673 | 877 | 40 | 75.00 |
| 18/03/2026 | 151673 | 152351 | 873 | 84 | 81.00 |
| 27/03/2026 | 152351 | NULL | 878 | NULL | 92.70 |

Le plein du 27/03 est en Phase 1 (kmTotal=NULL), en attente de complétion.

---

## 10. Accès et déploiement

### Se connecter au serveur

```bash
# Via VSCode Remote SSH
ssh root@192.168.0.77
# Mot de passe : défini par l'utilisateur

# Ou via la console Proxmox (pve2 → CT 100 → Console)
```

### Déployer une modification

1. Éditer les fichiers dans VSCode (Remote SSH connecté à 192.168.0.77)
2. Sauvegarder → les fichiers sont envoyés automatiquement
3. Redémarrer : `pm2 restart fuellog`
4. Vérifier : `pm2 logs fuellog --lines 20`

### Accéder à la base de données

```bash
sqlite3 /opt/fuellog/fuellog.db
.tables          # lister les tables
SELECT * FROM pleins;
SELECT * FROM favoris;
.quit
```

### URL de production

`https://fuel.super-nono.cc` — protégé par Cloudflare Access (email requis)

---

## 11. Priorités de développement

### 🔴 Critique (à corriger en premier)

1. **Parsing API stations** — corriger le parsing des prix dans `routes/stations.js`. Le bug est dans la normalisation des accents du champ `@nom` (ex: "Gazole" avec ou sans accent). Tester avec `curl` depuis le container pour voir le vrai format.

### 🟡 Amélioration souhaitée

2. **Noms des stations** — trouver le champ enseigne dans l'API ou utiliser une API complémentaire
3. **Tests sur mobile** — vérifier le rendu sur iPhone Safari (safe areas, scroll)

### 🟢 Fonctionnel, ne pas toucher

- Toute la logique des pleins (Phase 1/2)
- Les calculs de précision ODB
- Les graphiques
- L'authentification Cloudflare
- PM2 et le démarrage automatique

