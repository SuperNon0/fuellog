// Authentification FuelLog — mot de passe unique « admin », inspiré du socle
// Site-base (login + mot de passe oublié + script de reset). 100 % Node, sans
// dépendance : hachage scrypt et session signée via le module crypto natif.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, 'config.json');
const USERS_PATH = process.env.USERS_PATH || path.join(__dirname, 'users.json');
const CF_ALLOWED_EMAIL = (process.env.CF_ALLOWED_EMAIL || '').trim().toLowerCase();
const SESSION_COOKIE = 'fuellog_session';
const SESSION_MAX_AGE = 30 * 24 * 3600 * 1000; // 30 jours
const DEFAULT_PASSWORD = 'fuellog';

// ---- Hachage (scrypt) ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, saltHex, keyHex] = String(stored).split('$');
    if (algo !== 'scrypt' || !saltHex || !keyHex) return false;
    const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
    const expected = Buffer.from(keyHex, 'hex');
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch (e) { return false; }
}

// ---- Config (secret de session + hash d'origine) ----
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { return null; }
}

function ensureConfig() {
  let cfg = loadConfig();
  let changed = false;
  if (!cfg || !cfg.secret) {
    cfg = {
      secret: crypto.randomBytes(32).toString('hex'),
      password_hash: hashPassword(DEFAULT_PASSWORD)
    };
    changed = true;
    console.log(`[auth] config.json créé. Mot de passe par défaut : "${DEFAULT_PASSWORD}" — change-le dans Paramètres ou via reset-admin-password.sh`);
  }
  // Réglages d'auto-login Cloudflare (modifiables depuis les Paramètres).
  if (cfg.cf_auto_login === undefined) { cfg.cf_auto_login = true; changed = true; }
  if (cfg.cf_allowed_email === undefined) { cfg.cf_allowed_email = CF_ALLOWED_EMAIL; changed = true; }
  if (changed) fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return cfg;
}

function getAuthSettings() {
  const cfg = ensureConfig();
  return { cfAutoLogin: cfg.cf_auto_login !== false, cfAllowedEmail: cfg.cf_allowed_email || '' };
}

function setAuthSettings(s) {
  const cfg = ensureConfig();
  cfg.cf_auto_login = !!(s && s.cfAutoLogin);
  cfg.cf_allowed_email = String((s && s.cfAllowedEmail) || '').trim().toLowerCase();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  return getAuthSettings();
}

// ---- Comptes (fichier réinscriptible ; supprimé => retour au hash d'origine) ----
function loadUsers() {
  try {
    const u = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
    if (u && u.admin) return u;
  } catch (e) {}
  const cfg = ensureConfig();
  const users = { admin: cfg.password_hash };
  try { fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2)); } catch (e) {}
  return users;
}

function setPassword(password) {
  if (!password || password.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.');
  fs.writeFileSync(USERS_PATH, JSON.stringify({ admin: hashPassword(password) }, null, 2));
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
  req.authed = false;
  // 1. Session cookie
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token && verifySession(token)) req.authed = true;
  // 2. Auto-login Cloudflare Access (en-tête ajouté par Cloudflare), si activé
  if (!req.authed) {
    const cfg = loadConfig() || {};
    if (cfg.cf_auto_login !== false) {
      const email = (req.headers['cf-access-authenticated-user-email'] || '').trim().toLowerCase();
      const allowed = (cfg.cf_allowed_email || '').trim().toLowerCase();
      if (email && (!allowed || email === allowed)) req.authed = true;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.authed) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non authentifié' });
  return res.redirect('/login');
}

function setSessionCookie(res) {
  const secure = ''; // origine en HTTP derrière Cloudflare : pas de flag Secure
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${createSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

module.exports = {
  ensureConfig, loadUsers, verifyPassword, setPassword,
  attachUser, requireAuth, setSessionCookie, clearSessionCookie,
  getAuthSettings, setAuthSettings
};
