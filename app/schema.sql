-- Tables métier FuelLog (surcouche). Exécuté en plus du schéma de la base.
-- Cloisonnement par utilisateur : colonne `compte_id` (compte effectif =
-- current_compte()["id"]). La base sait réattribuer ces lignes (voir set_email).

CREATE TABLE IF NOT EXISTS vehicules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    compte_id       INTEGER NOT NULL,
    nom             TEXT NOT NULL,
    marque          TEXT DEFAULT '',
    modele          TEXT DEFAULT '',
    immatriculation TEXT DEFAULT '',
    annee           INTEGER,
    created_at      TEXT
);

CREATE TABLE IF NOT EXISTS pleins (
    id            INTEGER PRIMARY KEY,
    compte_id     INTEGER NOT NULL,
    vehicule_id   INTEGER,
    date          TEXT NOT NULL,
    type          TEXT NOT NULL,
    kmDepart      INTEGER,
    kmTotal       INTEGER,
    estimPlein    REAL,
    estimRestante REAL,
    total         REAL DEFAULT 0,
    litres        REAL DEFAULT 0,
    prixL         REAL DEFAULT 0,
    station       TEXT DEFAULT '',
    estPlein      INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS entretiens (
    id            INTEGER PRIMARY KEY,
    compte_id     INTEGER NOT NULL,
    vehicule_id   INTEGER,
    date          TEXT NOT NULL,
    km            INTEGER,
    categorie     TEXT,
    commentaire   TEXT DEFAULT '',
    cout          REAL DEFAULT 0,
    created_at    TEXT
);

CREATE TABLE IF NOT EXISTS entretien_fichiers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    entretien_id  INTEGER NOT NULL,
    filename      TEXT NOT NULL,
    original_name TEXT,
    mimetype      TEXT,
    FOREIGN KEY(entretien_id) REFERENCES entretiens(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS types_entretien (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    compte_id INTEGER NOT NULL,
    nom       TEXT NOT NULL,
    UNIQUE(compte_id, nom)
);

CREATE TABLE IF NOT EXISTS favoris (
    id        TEXT NOT NULL,
    compte_id INTEGER NOT NULL,
    nom       TEXT NOT NULL,
    adresse   TEXT,
    lat       REAL,
    lng       REAL,
    ville     TEXT,
    prix_json TEXT DEFAULT '{}',
    PRIMARY KEY (compte_id, id)
);
