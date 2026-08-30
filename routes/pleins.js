const express = require('express');
const router = express.Router();
const db = require('../db/database');

router.get('/', (req, res) => {
  if (req.query.vehicule) {
    return res.json(db.prepare('SELECT * FROM pleins WHERE vehicule_id=? ORDER BY date ASC, id ASC').all(req.query.vehicule));
  }
  res.json(db.prepare('SELECT * FROM pleins ORDER BY date ASC, id ASC').all());
});

router.post('/', (req, res) => {
  const p = req.body;
  const id = Date.now();
  db.prepare(`INSERT INTO pleins (id,date,type,kmDepart,kmTotal,estimPlein,estimRestante,total,litres,prixL,station,vehicule_id,estPlein) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, p.date, p.type, p.kmDepart, p.kmTotal??null, p.estimPlein??null, p.estimRestante??null, p.total??0, p.litres??0, p.prixL??0, p.station??'', p.vehicule_id??null, p.estPlein??1);
  res.json({ id });
});

router.patch('/:id', (req, res) => {
  const { kmTotal, estimRestante } = req.body;
  db.prepare('UPDATE pleins SET kmTotal=?, estimRestante=? WHERE id=?').run(kmTotal, estimRestante, req.params.id);
  res.json({ ok: true });
});

router.put('/:id', (req, res) => {
  const p = req.body;
  db.prepare(`UPDATE pleins SET date=?,type=?,kmDepart=?,kmTotal=?,estimPlein=?,estimRestante=?,total=?,litres=?,prixL=?,station=?,estPlein=? WHERE id=?`)
    .run(p.date, p.type, p.kmDepart, p.kmTotal??null, p.estimPlein??null, p.estimRestante??null, p.total??0, p.litres??0, p.prixL??0, p.station??'', p.estPlein??1, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM pleins WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

router.delete('/', (req, res) => {
  if (req.query.vehicule) {
    db.prepare('DELETE FROM pleins WHERE vehicule_id=?').run(req.query.vehicule);
  } else {
    db.prepare('DELETE FROM pleins').run();
  }
  res.json({ ok: true });
});

module.exports = router;
