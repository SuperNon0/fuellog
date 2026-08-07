const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const auth = require('../auth');

const APP_DIR = path.join(__dirname, '..');
const PM2_NAME = process.env.PM2_NAME || 'fuellog';
const LOG_PATH = path.join(APP_DIR, 'update.log');
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

// Journal de la dernière mise à jour (pour diagnostiquer)
router.get('/update-log', (req, res) => {
  fs.readFile(LOG_PATH, 'utf8', (err, data) => {
    res.json({ log: err ? '(aucun journal de mise à jour)' : data });
  });
});

// Lancer la mise à jour, en tâche détachée, journalisée.
// On s'aligne de force sur la branche courante (git reset --hard) pour éviter
// l'échec du pull quand npm a modifié package-lock.json sur le serveur.
router.post('/update', (req, res) => {
  if (!ALLOW_UPDATE) {
    return res.status(403).json({ error: "Mise à jour non autorisée. Définis ALLOW_SELF_UPDATE=1 dans l'environnement du serveur." });
  }
  // Déploiement systemd (socle) : déléguer à l'updater root via sudo.
  // Sinon (déploiement pm2) : mise à jour en ligne + redémarrage pm2.
  const SYSTEMD_UPDATER = '/usr/local/sbin/fuellog-update';
  let cmd;
  if (fs.existsSync(SYSTEMD_UPDATER)) {
    cmd = `echo "=== Mise a jour $(date) (systemd) ===" && sudo -n ${SYSTEMD_UPDATER} 2>&1`;
  } else {
    cmd = [
      'echo "=== Mise a jour $(date) (pm2) ==="',
      'BRANCH=$(git rev-parse --abbrev-ref HEAD)',
      'echo "Branche : $BRANCH"',
      'git fetch origin "$BRANCH" 2>&1',
      'git reset --hard "origin/$BRANCH" 2>&1',
      'npm install --omit=dev 2>&1',
      'echo "=== Redemarrage ==="',
      `pm2 restart ${PM2_NAME} 2>&1 || echo "ATTENTION: pm2 introuvable dans le PATH"`,
      'echo "=== Termine ==="'
    ].join(' && ');
  }

  let out;
  try { out = fs.openSync(LOG_PATH, 'w'); } catch (e) { out = 'ignore'; }
  const child = spawn('sh', ['-c', cmd], {
    cwd: APP_DIR,
    detached: true,
    stdio: ['ignore', out, out],
    env: process.env
  });
  child.unref();
  res.json({ ok: true, message: 'Mise à jour lancée. Le serveur va redémarrer dans quelques secondes.' });
});

// État de la protection par mot de passe
router.get('/auth-state', (req, res) => res.json({ enabled: auth.isEnabled() }));

// Définir / changer le mot de passe admin.
// - protection désactivée : définit le 1er mot de passe (l'active).
// - protection activée : exige le mot de passe actuel (session déjà requise par la porte).
router.post('/password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (auth.isEnabled() && !auth.checkPassword(String(currentPassword || ''))) {
    return res.status(403).json({ error: 'Mot de passe actuel incorrect.' });
  }
  try {
    auth.setPassword(String(newPassword || ''));
    auth.setSessionCookie(res);
    res.json({ ok: true, enabled: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Désactiver la protection (panel de nouveau ouvert). Exige le mot de passe actuel.
router.post('/disable', (req, res) => {
  if (!auth.isEnabled()) return res.json({ ok: true, enabled: false });
  if (!auth.checkPassword(String((req.body || {}).currentPassword || ''))) {
    return res.status(403).json({ error: 'Mot de passe incorrect.' });
  }
  auth.clearPassword();
  auth.clearSessionCookie(res);
  res.json({ ok: true, enabled: false });
});

module.exports = router;
