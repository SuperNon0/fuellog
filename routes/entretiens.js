const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const db = require('../db/database');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---- Upload (multer) ----
const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '';
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 Mo par fichier
  fileFilter: (req, file, cb) => cb(null, ALLOWED.includes(file.mimetype))
});

function withFichiers(e) {
  const fichiers = db.prepare('SELECT id, filename, original_name, mimetype FROM entretien_fichiers WHERE entretien_id=?').all(e.id);
  return { ...e, fichiers };
}

// ---- CRUD entretiens ----
router.get('/', (req, res) => {
  const list = db.prepare('SELECT * FROM entretiens ORDER BY date DESC, id DESC').all();
  res.json(list.map(withFichiers));
});

router.post('/', (req, res) => {
  const e = req.body;
  if (!e.date) return res.status(400).json({ error: 'date requise' });
  const id = Date.now();
  db.prepare(`INSERT INTO entretiens (id,date,km,categorie,commentaire,cout,created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(id, e.date, e.km ?? null, e.categorie ?? '', e.commentaire ?? '', e.cout ?? 0, new Date().toISOString());
  res.json({ id });
});

router.put('/:id', (req, res) => {
  const e = req.body;
  db.prepare(`UPDATE entretiens SET date=?,km=?,categorie=?,commentaire=?,cout=? WHERE id=?`)
    .run(e.date, e.km ?? null, e.categorie ?? '', e.commentaire ?? '', e.cout ?? 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  // Supprimer les fichiers du disque avant de supprimer l'entretien
  const fichiers = db.prepare('SELECT filename FROM entretien_fichiers WHERE entretien_id=?').all(req.params.id);
  fichiers.forEach(f => { try { fs.unlinkSync(path.join(UPLOAD_DIR, f.filename)); } catch (e) {} });
  db.prepare('DELETE FROM entretiens WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Pièces jointes ----
router.post('/:id/fichiers', upload.array('fichiers', 10), (req, res) => {
  const ent = db.prepare('SELECT id FROM entretiens WHERE id=?').get(req.params.id);
  if (!ent) return res.status(404).json({ error: 'entretien introuvable' });
  const stmt = db.prepare('INSERT INTO entretien_fichiers (entretien_id,filename,original_name,mimetype) VALUES (?,?,?,?)');
  (req.files || []).forEach(f => stmt.run(req.params.id, f.filename, f.originalname, f.mimetype));
  res.json({ ok: true, count: (req.files || []).length });
});

router.delete('/fichiers/:fid', (req, res) => {
  const f = db.prepare('SELECT filename FROM entretien_fichiers WHERE id=?').get(req.params.fid);
  if (f) { try { fs.unlinkSync(path.join(UPLOAD_DIR, f.filename)); } catch (e) {} }
  db.prepare('DELETE FROM entretien_fichiers WHERE id=?').run(req.params.fid);
  res.json({ ok: true });
});

// ---- Export PDF du carnet complet ----
router.get('/export/pdf', async (req, res) => {
  try {
    const entretiens = db.prepare('SELECT * FROM entretiens ORDER BY date ASC, id ASC').all().map(withFichiers);
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const A4 = [595.28, 841.89];
    const margin = 50;
    const accent = rgb(0.91, 0.77, 0.28);
    const dark = rgb(0.09, 0.09, 0.1);
    const grey = rgb(0.42, 0.44, 0.48);

    // ---- Page de garde + tableau récapitulatif ----
    let page = pdf.addPage(A4);
    let y = A4[1] - margin;

    page.drawText("Carnet d'entretien", { x: margin, y: y - 10, size: 26, font: fontBold, color: dark });
    y -= 44;
    const dateGen = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    page.drawText('Généré le ' + dateGen + ' · FuelLog', { x: margin, y, size: 10, font, color: grey });
    y -= 14;
    const totalCout = entretiens.reduce((s, e) => s + (e.cout || 0), 0);
    page.drawText(`${entretiens.length} intervention(s) · Total ${totalCout.toFixed(2)} €`, { x: margin, y, size: 10, font, color: grey });
    y -= 30;

    page.drawRectangle({ x: margin, y: y - 4, width: A4[0] - margin * 2, height: 22, color: accent });
    const cols = [
      { label: 'Date', x: margin + 6, w: 70 },
      { label: 'Km', x: margin + 78, w: 55 },
      { label: 'Catégorie', x: margin + 138, w: 110 },
      { label: 'Coût', x: margin + 252, w: 55 },
      { label: 'Commentaire', x: margin + 312, w: A4[0] - margin - 312 - 6 }
    ];
    cols.forEach(c => page.drawText(c.label, { x: c.x, y: y + 2, size: 9, font: fontBold, color: dark }));
    y -= 20;

    const wrap = (text, maxChars) => {
      const words = String(text || '').split(/\s+/);
      const lines = [];
      let cur = '';
      words.forEach(w => {
        if ((cur + ' ' + w).trim().length > maxChars) { if (cur) lines.push(cur); cur = w; }
        else cur = (cur + ' ' + w).trim();
      });
      if (cur) lines.push(cur);
      return lines.length ? lines : [''];
    };
    const clean = s => String(s || '').replace(/[^\x00-\xFF]/g, '?'); // Helvetica = latin1

    entretiens.forEach((e, i) => {
      const commentLines = wrap(clean(e.commentaire), 42);
      const rowH = Math.max(18, commentLines.length * 12 + 6);
      if (y - rowH < margin) { page = pdf.addPage(A4); y = A4[1] - margin; }
      if (i % 2 === 1) page.drawRectangle({ x: margin, y: y - rowH + 14, width: A4[0] - margin * 2, height: rowH, color: rgb(0.96, 0.96, 0.97) });
      const dt = e.date.split('-').reverse().join('/');
      page.drawText(dt, { x: cols[0].x, y, size: 9, font, color: dark });
      page.drawText(e.km != null ? String(e.km) : '-', { x: cols[1].x, y, size: 9, font, color: dark });
      page.drawText(clean(e.categorie) || '-', { x: cols[2].x, y, size: 9, font, color: dark });
      page.drawText((e.cout || 0).toFixed(2) + ' E', { x: cols[3].x, y, size: 9, font, color: dark });
      commentLines.forEach((ln, li) => page.drawText(ln, { x: cols[4].x, y: y - li * 12, size: 9, font, color: grey }));
      y -= rowH;
    });

    // ---- Annexes : les pièces jointes ----
    for (const e of entretiens) {
      for (const f of e.fichiers) {
        const filePath = path.join(UPLOAD_DIR, f.filename);
        if (!fs.existsSync(filePath)) continue;
        const bytes = fs.readFileSync(filePath);
        const legende = `${e.date.split('-').reverse().join('/')} · ${clean(e.categorie) || 'Entretien'} — ${clean(f.original_name)}`;

        if (f.mimetype === 'application/pdf') {
          try {
            const src = await PDFDocument.load(bytes);
            const copied = await pdf.copyPages(src, src.getPageIndices());
            copied.forEach((pg, idx) => {
              pdf.addPage(pg);
              if (idx === 0) pg.drawText(legende, { x: 20, y: 15, size: 8, font, color: grey });
            });
          } catch (err) { /* PDF illisible : on ignore */ }
        } else {
          try {
            const img = f.mimetype === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
            const p = pdf.addPage(A4);
            const maxW = A4[0] - margin * 2, maxH = A4[1] - margin * 2 - 30;
            const scale = Math.min(maxW / img.width, maxH / img.height, 1);
            const w = img.width * scale, h = img.height * scale;
            p.drawText(legende, { x: margin, y: A4[1] - margin + 6, size: 9, font: fontBold, color: dark });
            p.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2 - 15, width: w, height: h });
          } catch (err) { /* image webp non supportée par pdf-lib : on ignore */ }
        }
      }
    }

    const out = await pdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="carnet-entretien.pdf"');
    res.send(Buffer.from(out));
  } catch (err) {
    console.error('Export PDF erreur:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
