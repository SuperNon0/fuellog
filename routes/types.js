const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM types_entretien ORDER BY nom ASC').all());
});

router.post('/', (req, res) => {
  const nom = (req.body.nom || '').trim();
  if (!nom) return res.status(400).json({ error: 'nom requis' });
  try {
    const info = db.prepare('INSERT INTO types_entretien (nom) VALUES (?)').run(nom);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: 'Ce type existe déjà.' });
  }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM types_entretien WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
