const {
  listProperties,
  listTags,
  listEquipments,
  getPropertyDetails,
  createProperty,
  updateProperty,
  deleteProperty,
} = require('../services/propertiesService');

function statusFromError(e) {
  if (e && e.status) return e.status;
  if (e && e.message && /(UNIQUE|PRIMARY KEY)/i.test(e.message)) return 409;
  return 500;
}

async function list(req, res) {
  const db = req.app.locals.db;
  try {
    const rows = await listProperties(db);
    res.json(rows);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function taglist(req, res) {
  const db = req.app.locals.db;
  try {
    const rows = await listTags(db);
    res.json(rows);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function equipmentlist(req, res) {
  const db = req.app.locals.db;
  try {
    const rows = await listEquipments(db);
    res.json(rows);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function getById(req, res) {
  const db = req.app.locals.db;
  try {
    const prop = await getPropertyDetails(db, req.params.id);
    if (!prop) return res.status(404).json({ error: 'Property not found' });
    res.json(prop);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function create(req, res) {
  const db = req.app.locals.db;
  try {
    const created = await createProperty(db, req.body || {});
    res.status(201).json(created);
  } catch (e) {
    const code = statusFromError(e);
    // Map message for validation consistency
    let msg = e.message;
    if (code === 409) msg = 'Property with same id already exists';
    if (msg === 'title is required') return res.status(400).json({ error: msg });
    if (msg.startsWith('host_id')) return res.status(400).json({ error: msg });
    res.status(code).json({ error: msg });
  }
}

async function update(req, res) {
  const db = req.app.locals.db;
  try {
    const updated = await updateProperty(db, req.params.id, req.body || {});
    res.json(updated);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function remove(req, res) {
  const db = req.app.locals.db;
  try {
    await deleteProperty(db, req.params.id);
    res.status(204).end();
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

module.exports = {
  list,
  taglist,
  equipmentlist,
  getById,
  create,
  update,
  remove,
};
