const { listUsers, getUser, createUser, updateUser } = require('../services/usersService');

function statusFromError(e) {
  if (e && e.status) return e.status;
  if (e && e.message && /UNIQUE/i.test(e.message)) return 409;
  return 500;
}

async function list(req, res) {
  const db = req.app.locals.db;
  try {
    const rows = await listUsers(db);
    res.json(rows);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function getById(req, res) {
  const db = req.app.locals.db;
  try {
    const row = await getUser(db, req.params.id);
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json(row);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function create(req, res) {
  const db = req.app.locals.db;
  try {
    const user = await createUser(db, req.body || {});
    res.status(201).json(user);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function update(req, res) {
  const db = req.app.locals.db;
  try {
    const allowAdminRole = req.user && req.user.role === 'admin';
    const updated = await updateUser(db, req.params.id, req.body || {}, { allowAdminRole });
    res.json(updated);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
};
