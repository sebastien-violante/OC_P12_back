const { register, login, requestPasswordReset, resetPassword } = require('../services/authService');

function statusFromError(e) {
  if (e && e.status) return e.status;
  return 500;
}

async function doRegister(req, res) {
  const db = req.app.locals.db;
  try {
    const result = await register(db, req.body || {});
    res.status(201).json(result);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function doLogin(req, res) {
  const db = req.app.locals.db;
  try {
    const result = await login(db, req.body || {});
    res.status(200).json(result);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function doRequestReset(req, res) {
  const db = req.app.locals.db;
  try {
    const result = await requestPasswordReset(db, req.body || {});
    res.status(200).json(result);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function doResetPassword(req, res) {
  const db = req.app.locals.db;
  try {
    const result = await resetPassword(db, req.body || {});
    res.status(200).json(result);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

module.exports = { doRegister, doLogin, doRequestReset, doResetPassword };
