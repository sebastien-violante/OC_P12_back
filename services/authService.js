const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function hashPassword(password, salt = null) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts[0] !== 'scrypt' || parts.length !== 3) return false;
  const salt = parts[1];
  const expected = parts[2];
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
}

function signToken(user) {
  const payload = { id: user.id, role: user.role, name: user.name, email: user.email || null };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function register(db, { name, email, password, picture = null, role = 'client' }) {
  if (!name) {
    const err = new Error('name is required'); err.status = 400; throw err;
  }
  if (!email) {
    const err = new Error('email is required'); err.status = 400; throw err;
  }
  if (!password || String(password).length < 6) {
    const err = new Error('password must be at least 6 characters'); err.status = 400; throw err;
  }
  if (!['owner','client'].includes(role)) role = 'client';
  const password_hash = hashPassword(String(password));
  try {
    const r = await db.runAsync('INSERT INTO users(name, email, password_hash, picture, role) VALUES (?,?,?,?,?)', [name, email, password_hash, picture, role]);
    const user = await db.getAsync('SELECT id, name, email, picture, role FROM users WHERE id = ?', [r.lastID]);
    const token = signToken(user);
    return { token, user };
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) { const err = new Error('email already registered'); err.status = 409; throw err; }
    throw e;
  }
}

async function login(db, { email, password }) {
  if (!email || !password) { const err = new Error('email and password are required'); err.status = 400; throw err; }
  const user = await db.getAsync('SELECT id, name, email, picture, role, password_hash FROM users WHERE email = ?', [email]);
  if (!user || !user.password_hash || !verifyPassword(String(password), user.password_hash)) {
    const err = new Error('invalid credentials'); err.status = 401; throw err;
  }
  const { password_hash, ...publicUser } = user;
  const token = signToken(publicUser);
  return { token, user: publicUser };
}

async function requestPasswordReset(db, { email }) {
  if (!email) { const err = new Error('email is required'); err.status = 400; throw err; }
  const user = await db.getAsync('SELECT id, email FROM users WHERE email = ?', [email]);
  // Always respond with success to avoid user enumeration
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 60 * 60 * 1000; // 1 hour
  if (user) {
    await db.runAsync('UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?', [token, expires, user.id]);
  }
  const resp = { ok: true, message: 'If the email exists, a reset link has been sent.' };
  if (process.env.NODE_ENV !== 'production') resp.token = token;
  return resp;
}

async function resetPassword(db, { token, password }) {
  if (!token || !password) { const err = new Error('token and password are required'); err.status = 400; throw err; }
  if (String(password).length < 6) { const err = new Error('password must be at least 6 characters'); err.status = 400; throw err; }
  const now = Date.now();
  const user = await db.getAsync('SELECT id FROM users WHERE reset_token = ? AND IFNULL(reset_expires, 0) > ?', [token, now]);
  if (!user) { const err = new Error('invalid or expired token'); err.status = 400; throw err; }
  const password_hash = hashPassword(String(password));
  await db.runAsync('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?', [password_hash, user.id]);
  return { ok: true };
}

module.exports = {
  register,
  login,
  requestPasswordReset,
  resetPassword,
  hashPassword,
  verifyPassword,
  signToken,
};
