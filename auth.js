// Authentification FuelLog — alignée sur le socle (botpanel).
// La protection est ACTIVÉE uniquement si un mot de passe admin est défini.
// Sinon le panel reste ouvert (Cloudflare Access / LAN s'en chargent).
// Auth par cookie signé uniquement — aucun en-tête de confiance.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, 'config.json');
const USERS_PATH = process.env.USERS_PATH || path.join(__dirname, 'users.json');
const SESSION_COOKIE = 'fuellog_session';
const SESSION_MAX_AGE = 30 * 24 * 3600 * 1000; // 30 jours
const MIN_LEN = 6;

// ---- Hachage (scrypt) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function verifyHash(password, stored) {
  try {
    const [algo, saltHex, keyHex] = String(stored).split('$');
    if (algo !== 'scrypt' || !saltHex || !keyHex) return false;
    const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
    const expected = Buffer.from(keyHex, 'hex');
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch (e) { return false; }
}

// ---- Config : secret de session (toujours présent, aucun mot de passe par défaut) ----
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { return null; }
}
function ensureConfig() {
  let cfg = loadConfig();
  if (!cfg || !cfg.secret) {
    cfg = { secret: crypto.randomBytes(32).toString('hex') };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  }
  return cfg;
}

// ---- Mot de passe admin (fichier users.json ; absent/vide = protection désactivée) ----
function loadHash() {
  try { const u = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8')); return (u && u.admin) || ''; }
  catch (e) { return ''; }
}
function isEnabled() { return !!loadHash(); }
function checkPassword(password) { return verifyHash(password, loadHash()); }
function setPassword(password) {
  if (!password || password.length < MIN_LEN) throw new Error(`Le mot de passe doit faire au moins ${MIN_LEN} caractères.`);
  fs.writeFileSync(USERS_PATH, JSON.stringify({ admin: hashPassword(password) }, null, 2));
  return true;
}
function clearPassword() {
  try { fs.unlinkSync(USERS_PATH); } catch (e) {}
  return true;
}

// ---- Session signée (cookie HMAC) ----
function sign(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
}
function createSession() {
  const secret = ensureConfig().secret;
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}
function verifySession(token) {
  if (!token || token.indexOf('.') < 0) return false;
  const secret = ensureConfig().secret;
  const [payload, sig] = token.split('.');
  const expected = sign(payload, secret);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp && data.exp > Date.now();
  } catch (e) { return false; }
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

// ---- Middlewares ----
function attachUser(req, res, next) {
  // Protection désactivée → tout le monde passe (panel ouvert).
  req.authed = !isEnabled() || verifySession(parseCookies(req)[SESSION_COOKIE]);
  next();
}
function requireAuth(req, res, next) {
  if (req.authed) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non authentifié' });
  return res.redirect('/login');
}
function setSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${createSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

module.exports = {
  ensureConfig, isEnabled, checkPassword, setPassword, clearPassword,
  attachUser, requireAuth, setSessionCookie, clearSessionCookie
};
