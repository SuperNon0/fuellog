const express = require('express');
const router = express.Router();
const db = require('../db/database');

function parseFav(f) {
  return { ...f, prix: f.prix_json ? JSON.parse(f.prix_json) : {} };
}

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM favoris').all().map(parseFav));
});

// Rafraîchir les prix de tous les favoris en 1 appel API
router.get('/refresh-prix', async (req, res) => {
  const favs = db.prepare('SELECT * FROM favoris').all();
  if (!favs.length) return res.json([]);
  try {
    const ids = favs.map(f => String(f.id).replace(/[^0-9]/g, '')).filter(Boolean).join(',');
    const url = `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records?limit=100&where=${encodeURIComponent(`id IN (${ids})`)}`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();

    const stmt = db.prepare('UPDATE favoris SET prix_json=? WHERE id=?');
    const addPrix = (prix, key, val) => {
      const v = parseFloat(val);
      if (!isNaN(v) && v > 0.5 && v < 5) prix[key] = Math.round(v * 1000) / 1000;
    };
    (data.results || []).forEach(s => {
      const prix = {};
      addPrix(prix, 'Diesel', s.gazole_prix);
      addPrix(prix, 'E10', s.e10_prix);
      addPrix(prix, 'SP95', s.sp95_prix);
      addPrix(prix, 'SP98', s.sp98_prix);
      addPrix(prix, 'E85', s.e85_prix);
      stmt.run(JSON.stringify(prix), String(s.id));
    });
  } catch(e) {
    console.error('refresh-prix error:', e.message);
  }
  res.json(db.prepare('SELECT * FROM favoris').all().map(parseFav));
});

router.post('/', (req, res) => {
  const f = req.body;
  db.prepare(`INSERT OR REPLACE INTO favoris (id,nom,adresse,lat,lng,ville,prix_json) VALUES (?,?,?,?,?,?,?)`)
    .run(f.id, f.nom, f.adresse ?? '', f.lat ?? null, f.lng ?? null, f.ville ?? '', JSON.stringify(f.prix || {}));
  res.json({ ok: true });
});

router.patch('/:id', (req, res) => {
  const { nom } = req.body;
  db.prepare('UPDATE favoris SET nom=? WHERE id=?').run(nom, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM favoris WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
