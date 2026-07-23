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
`);

// Migration : ajouter prix_json aux favoris si absent
try { db.exec('ALTER TABLE favoris ADD COLUMN prix_json TEXT DEFAULT "{}"'); } catch(e) {}

module.exports = db;
