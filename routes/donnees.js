const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db/database');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

// ---- Export CSV (séparateur ; + BOM UTF-8 pour Excel FR) ----
function toCSV(headers, rows) {
  const esc = v => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[";\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(';'), ...rows.map(r => r.map(esc).join(';'))];
  return '﻿' + lines.join('\r\n');
}

function sendCSV(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

router.get('/csv/pleins', (req, res) => {
  const pleins = req.query.vehicule
    ? db.prepare('SELECT * FROM pleins WHERE vehicule_id=? ORDER BY date ASC, id ASC').all(req.query.vehicule)
    : db.prepare('SELECT * FROM pleins ORDER BY date ASC, id ASC').all();
  const headers = ['Date', 'Carburant', 'Km départ', 'Km total', 'Km parcourus', 'ODB annoncé (km)', 'ODB restant (km)', 'Total (€)', 'Litres', 'Prix/L (€)', 'Conso (L/100km)', 'Station'];
  const rows = pleins.map(p => {
    const km = (p.kmTotal != null && p.kmDepart != null) ? p.kmTotal - p.kmDepart : null;
    const conso = (p.litres > 0 && km > 0) ? (p.litres / km * 100).toFixed(2) : '';
    const nb = v => v == null ? '' : String(v).replace('.', ',');
    return [p.date, p.type, p.kmDepart, p.kmTotal, km, p.estimPlein, p.estimRestante, nb(p.total), nb(p.litres), nb(p.prixL), nb(conso).replace('.', ','), p.station];
  });
  sendCSV(res, 'pleins.csv', toCSV(headers, rows));
});

router.get('/csv/entretiens', (req, res) => {
  const ents = req.query.vehicule
    ? db.prepare('SELECT * FROM entretiens WHERE vehicule_id=? ORDER BY date ASC, id ASC').all(req.query.vehicule)
    : db.prepare('SELECT * FROM entretiens ORDER BY date ASC, id ASC').all();
  const headers = ['Date', 'Kilométrage', 'Catégorie', 'Coût (€)', 'Commentaire'];
  const rows = ents.map(e => [e.date, e.km, e.categorie, String(e.cout ?? 0).replace('.', ','), e.commentaire]);
  sendCSV(res, 'entretiens.csv', toCSV(headers, rows));
});

// ---- Sauvegarde complète (JSON auto-suffisant, pièces jointes incluses en base64) ----
router.get('/backup', (req, res) => {
  const fichiers = db.prepare('SELECT * FROM entretien_fichiers').all().map(f => {
    let data = null;
    try { data = fs.readFileSync(path.join(UPLOAD_DIR, f.filename)).toString('base64'); } catch (e) {}
    return { ...f, data };
  });
  const backup = {
    app: 'fuellog',
    version: 1,
    exported_at: new Date().toISOString(),
    vehicules: db.prepare('SELECT * FROM vehicules').all(),
    types_entretien: db.prepare('SELECT * FROM types_entretien').all(),
    pleins: db.prepare('SELECT * FROM pleins').all(),
    entretiens: db.prepare('SELECT * FROM entretiens').all(),
    favoris: db.prepare('SELECT * FROM favoris').all(),
    entretien_fichiers: fichiers
  };
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="fuellog-backup-${stamp}.json"`);
  res.send(JSON.stringify(backup));
});

// ---- Import : remplace TOUTES les données par celles de la sauvegarde ----
router.post('/import', (req, res) => {
  const b = req.body;
  if (!b || b.app !== 'fuellog' || !Array.isArray(b.pleins)) {
    return res.status(400).json({ error: 'Fichier de sauvegarde invalide.' });
  }
  try {
    const restore = db.transaction(() => {
      db.exec('DELETE FROM entretien_fichiers; DELETE FROM entretiens; DELETE FROM pleins; DELETE FROM favoris; DELETE FROM types_entretien; DELETE FROM vehicules;');

      const insV = db.prepare('INSERT INTO vehicules (id,nom,marque,modele,immatriculation,annee,created_at) VALUES (?,?,?,?,?,?,?)');
      (b.vehicules || []).forEach(v => insV.run(v.id, v.nom, v.marque ?? '', v.modele ?? '', v.immatriculation ?? '', v.annee ?? null, v.created_at ?? null));

      const insT = db.prepare('INSERT OR IGNORE INTO types_entretien (id,nom) VALUES (?,?)');
      (b.types_entretien || []).forEach(t => insT.run(t.id, t.nom));

      const insP = db.prepare('INSERT INTO pleins (id,date,type,kmDepart,kmTotal,estimPlein,estimRestante,total,litres,prixL,station,vehicule_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
      b.pleins.forEach(p => insP.run(p.id, p.date, p.type, p.kmDepart ?? null, p.kmTotal ?? null, p.estimPlein ?? null, p.estimRestante ?? null, p.total ?? 0, p.litres ?? 0, p.prixL ?? 0, p.station ?? '', p.vehicule_id ?? null));

      const insE = db.prepare('INSERT INTO entretiens (id,date,km,categorie,commentaire,cout,created_at,vehicule_id) VALUES (?,?,?,?,?,?,?,?)');
      (b.entretiens || []).forEach(e => insE.run(e.id, e.date, e.km ?? null, e.categorie ?? '', e.commentaire ?? '', e.cout ?? 0, e.created_at ?? null, e.vehicule_id ?? null));

      const insF = db.prepare('INSERT INTO entretien_fichiers (id,entretien_id,filename,original_name,mimetype) VALUES (?,?,?,?,?)');
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      (b.entretien_fichiers || []).forEach(f => {
        insF.run(f.id, f.entretien_id, f.filename, f.original_name ?? '', f.mimetype ?? '');
        if (f.data) { try { fs.writeFileSync(path.join(UPLOAD_DIR, f.filename), Buffer.from(f.data, 'base64')); } catch (e) {} }
      });

      const insFav = db.prepare('INSERT OR REPLACE INTO favoris (id,nom,adresse,lat,lng,ville,prix_json) VALUES (?,?,?,?,?,?,?)');
      (b.favoris || []).forEach(f => insFav.run(f.id, f.nom, f.adresse ?? '', f.lat ?? null, f.lng ?? null, f.ville ?? '', f.prix_json ?? '{}'));
    });
    restore();
    res.json({ ok: true, vehicules: (b.vehicules || []).length, pleins: b.pleins.length, entretiens: (b.entretiens || []).length });
  } catch (err) {
    console.error('Import erreur:', err.message);
    res.status(500).json({ error: 'Import échoué : ' + err.message });
  }
});

module.exports = router;
