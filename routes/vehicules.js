const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM vehicules ORDER BY id ASC').all());
});

router.post('/', (req, res) => {
  const v = req.body;
  if (!v.nom || !v.nom.trim()) return res.status(400).json({ error: 'nom requis' });
  const info = db.prepare('INSERT INTO vehicules (nom,marque,modele,immatriculation,annee,created_at) VALUES (?,?,?,?,?,?)')
    .run(v.nom.trim(), v.marque ?? '', v.modele ?? '', v.immatriculation ?? '', v.annee ?? null, new Date().toISOString());
  res.json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const v = req.body;
  db.prepare('UPDATE vehicules SET nom=?,marque=?,modele=?,immatriculation=?,annee=? WHERE id=?')
    .run(v.nom, v.marque ?? '', v.modele ?? '', v.immatriculation ?? '', v.annee ?? null, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM vehicules').get().n;
  if (n <= 1) return res.status(400).json({ error: 'Impossible de supprimer le dernier véhicule.' });
  const id = req.params.id;
  // Rattacher les données de ce véhicule au premier autre véhicule (on ne perd rien)
  const autre = db.prepare('SELECT id FROM vehicules WHERE id!=? ORDER BY id ASC LIMIT 1').get(id);
  if (autre) {
    db.prepare('UPDATE pleins SET vehicule_id=? WHERE vehicule_id=?').run(autre.id, id);
    db.prepare('UPDATE entretiens SET vehicule_id=? WHERE vehicule_id=?').run(autre.id, id);
  }
  db.prepare('DELETE FROM vehicules WHERE id=?').run(id);
  res.json({ ok: true, reassignedTo: autre ? autre.id : null });
});

module.exports = router;
