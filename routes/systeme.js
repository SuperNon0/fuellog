const express = require('express');
const router = express.Router();
const path = require('path');
const { exec, spawn } = require('child_process');

const APP_DIR = path.join(__dirname, '..');
const PM2_NAME = process.env.PM2_NAME || 'fuellog';
// Sécurité : la mise à jour distante n'est active que si explicitement autorisée.
const ALLOW_UPDATE = process.env.ALLOW_SELF_UPDATE === '1';

// Version courante (branche + dernier commit)
router.get('/version', (req, res) => {
  exec('git rev-parse --short HEAD && git rev-parse --abbrev-ref HEAD && git log -1 --format=%cd --date=format:"%d/%m/%Y %H:%M"', { cwd: APP_DIR, timeout: 5000 }, (err, stdout) => {
    if (err) return res.json({ commit: null, branch: null, date: null, updateEnabled: ALLOW_UPDATE });
    const [commit, branch, date] = stdout.trim().split('\n');
    res.json({ commit, branch, date, updateEnabled: ALLOW_UPDATE });
  });
});

// Vérifier si une mise à jour est disponible sur le dépôt distant
router.get('/check', (req, res) => {
  exec('git fetch --quiet && git rev-list --count HEAD..@{u}', { cwd: APP_DIR, timeout: 20000 }, (err, stdout) => {
    if (err) return res.json({ behind: null, error: 'Vérification impossible.' });
    res.json({ behind: parseInt(stdout.trim()) || 0 });
  });
});

// Lancer la mise à jour (git pull + npm install + redémarrage), en tâche détachée
router.post('/update', (req, res) => {
  if (!ALLOW_UPDATE) {
    return res.status(403).json({ error: "Mise à jour non autorisée. Définis ALLOW_SELF_UPDATE=1 dans l'environnement du serveur." });
  }
  const cmd = `git pull && npm install --omit=dev && pm2 restart ${PM2_NAME}`;
  const child = spawn('sh', ['-c', cmd], { cwd: APP_DIR, detached: true, stdio: 'ignore' });
  child.unref();
  res.json({ ok: true, message: 'Mise à jour lancée. Le serveur va redémarrer dans quelques secondes.' });
});

module.exports = router;
