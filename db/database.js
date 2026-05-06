const Database = require('better-sqlite3');
const db = new Database('/opt/fuellog/fuellog.db');

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
`);

const count = db.prepare('SELECT COUNT(*) as n FROM pleins').get();
if (count.n === 0) {
  const insert = db.prepare(`INSERT INTO pleins VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  [
    [1000000000000,'2026-01-02','SP95',146716,147394,866,95,75.06,0,0,''],
    [1000000000001,'2026-01-10','SP95',147394,148163,849,75,78.00,0,0,''],
    [1000000000002,'2026-01-16','SP95',148163,148841,854,68,76.00,0,0,''],
    [1000000000003,'2026-02-08','SP95',148841,149431,848,120,73.69,0,0,''],
    [1000000000004,'2026-02-14','SP95',149431,150174,841,89,76.60,0,0,''],
    [1000000000005,'2026-02-25','SP95',150174,150935,859,120,82.76,0,0,''],
    [1000000000006,'2026-03-07','SP95',150935,151673,877,40,75.00,0,0,''],
    [1000000000007,'2026-03-18','SP95',151673,152351,873,84,81.00,0,0,''],
    [1000000000008,'2026-03-27','SP95',152351,null,878,null,92.70,48.18,1.924,''],
  ].forEach(r => insert.run(...r));
}

// Migration : ajouter prix_json si absent
try { db.exec('ALTER TABLE favoris ADD COLUMN prix_json TEXT DEFAULT "{}"'); } catch(e) {}

module.exports = db;
