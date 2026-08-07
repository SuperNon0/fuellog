const express = require('express');
const path = require('path');
const fs = require('fs');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const PUBLIC = path.join(__dirname, 'public');

// S'assurer que le dossier des pièces jointes et la config existent
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
auth.ensureConfig();

app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(auth.attachUser);

// ---- Pages et assets publics (accessibles sans être connecté) ----
app.get('/login', (req, res) => {
  if (req.authed) return res.redirect('/');
  res.sendFile(path.join(PUBLIC, 'login.html'));
});
app.post('/login', (req, res) => {
  const stored = auth.loadUsers().admin;
  if (auth.verifyPassword(req.body.password || '', stored)) {
    auth.setSessionCookie(res);
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});
app.get('/mot-de-passe-oublie', (req, res) => res.sendFile(path.join(PUBLIC, 'forgot.html')));
app.get('/logout', (req, res) => { auth.clearSessionCookie(res); res.redirect('/login'); });
app.post('/logout', (req, res) => { auth.clearSessionCookie(res); res.redirect('/login'); });

// Ressources nécessaires aux pages de connexion (non sensibles)
app.use('/css', express.static(path.join(PUBLIC, 'css')));
app.use('/icons', express.static(path.join(PUBLIC, 'icons')));
app.use('/fonts', express.static(path.join(PUBLIC, 'fonts')));
app.use('/vendor', express.static(path.join(PUBLIC, 'vendor')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(PUBLIC, 'manifest.json')));

// ---- À partir d'ici : authentification obligatoire ----
app.use(auth.requireAuth);

app.use(express.static(PUBLIC));
app.use('/uploads', express.static(UPLOAD_DIR));

app.use('/api/pleins', require('./routes/pleins'));
app.use('/api/stations', require('./routes/stations'));
app.use('/api/favoris', require('./routes/favoris'));
app.use('/api/entretiens', require('./routes/entretiens'));
app.use('/api/vehicules', require('./routes/vehicules'));
app.use('/api/types', require('./routes/types'));
app.use('/api/donnees', require('./routes/donnees'));
app.use('/api/systeme', require('./routes/systeme'));

app.listen(PORT, () => console.log('FuelLog running on port ' + PORT));
