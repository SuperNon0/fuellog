const Database = require('better-sqlite3');
const path = require('path');

// Chemin de la base : configurable via DB_PATH, sinon à la racine du projet.
// Sur le serveur (/opt/fuellog) le défaut relatif pointe vers /opt/fuellog/fuellog.db.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'fuellog.db');
const db = new Database(DB_PATH);

db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS pleins (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    kmDepart INTEGER,
    kmTotal INTEGER,
    estimPlein REAL,
    estimRestante REAL,
    total REAL DEFAULT 0,
    litres REAL DEFAULT 0,
    prixL REAL DEFAULT 0,
    station TEXT DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS favoris (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    adresse TEXT,
    lat REAL,
    lng REAL,
    ville TEXT
  );
  CREATE TABLE IF NOT EXISTS entretiens (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    km INTEGER,
    categorie TEXT,
    commentaire TEXT DEFAULT '',
    cout REAL DEFAULT 0,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS entretien_fichiers (
    id INTEGER PRIMARY KEY,
    entretien_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT,
    mimetype TEXT,
    FOREIGN KEY(entretien_id) REFERENCES entretiens(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS vehicules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    marque TEXT DEFAULT '',
    modele TEXT DEFAULT '',
    immatriculation TEXT DEFAULT '',
    annee INTEGER,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS types_entretien (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE
  );
`);

// Migration : ajouter prix_json aux favoris si absent
try { db.exec('ALTER TABLE favoris ADD COLUMN prix_json TEXT DEFAULT "{}"'); } catch(e) {}

// Migration multi-véhicule : rattacher chaque plein / entretien à un véhicule
try { db.exec('ALTER TABLE pleins ADD COLUMN vehicule_id INTEGER'); } catch(e) {}
try { db.exec('ALTER TABLE entretiens ADD COLUMN vehicule_id INTEGER'); } catch(e) {}

// Migration : distinguer plein complet (1) et ajout partiel (0). Défaut = plein.
try { db.exec('ALTER TABLE pleins ADD COLUMN estPlein INTEGER DEFAULT 1'); } catch(e) {}

// Créer un véhicule par défaut si aucun, et y rattacher les données existantes
const vcount = db.prepare('SELECT COUNT(*) AS n FROM vehicules').get();
if (vcount.n === 0) {
  const info = db.prepare('INSERT INTO vehicules (nom,marque,modele,immatriculation,annee,created_at) VALUES (?,?,?,?,?,?)')
    .run('Ma voiture', '', '', '', null, new Date().toISOString());
  const vid = info.lastInsertRowid;
  db.prepare('UPDATE pleins SET vehicule_id=? WHERE vehicule_id IS NULL').run(vid);
  db.prepare('UPDATE entretiens SET vehicule_id=? WHERE vehicule_id IS NULL').run(vid);
}

// Types d'entretien par défaut si la table est vide
const tcount = db.prepare('SELECT COUNT(*) AS n FROM types_entretien').get();
if (tcount.n === 0) {
  const ins = db.prepare('INSERT OR IGNORE INTO types_entretien (nom) VALUES (?)');
  ['Entretien', "Changement d'huile", 'Pneus', 'Freins', 'Révision', 'Contrôle technique'].forEach(t => ins.run(t));
}

module.exports = db;
