const { signToken } = require('../services/authService')

async function listUsers(db) {
  return await db.allAsync(
    "SELECT id, name, picture, role FROM users ORDER BY id DESC",
  );
}

async function getUser(db, id) {
  return await db.getAsync(
    "SELECT id, name, picture, role FROM users WHERE id = ?",
    [id],
  );
}

async function createUser(db, { name, picture = null, role = "client" }) {
  if (!name) {
    const err = new Error("name is required");
    err.status = 400;
    throw err;
  }
  if (!["owner", "client", "admin"].includes(role)) {
    const err = new Error("invalid role");
    err.status = 400;
    throw err;
  }
  try {
    const r = await db.runAsync(
      "INSERT INTO users(name, picture, role) VALUES (?,?,?)",
      [name, picture, role],
    );
    return await getUser(db, r.lastID);
  } catch (e) {
    if (/UNIQUE/i.test(e.message)) {
      const err = new Error("User already exists");
      err.status = 409;
      throw err;
    }
    throw e;
  }
}

async function updateUser(db, id, changes, { allowAdminRole = false } = {}) {
  const allowedFields = ["name", "picture", "role"];
  const fields = [];
  const params = [];
  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(changes || {}, key)) {
      if (key === "role") {
        const role = changes.role;
        if (!["owner", "client", "admin"].includes(role)) {
          const err = new Error("invalid role");
          err.status = 400;
          throw err;
        }
        if (role === "admin" && !allowAdminRole) {
          const err = new Error("forbidden to set admin role");
          err.status = 403;
          throw err;
        }
      }
      fields.push(`${key} = ?`);
      params.push(changes[key]);
    }
  }
  if (fields.length === 0) {
    const err = new Error("No fields to update");
    err.status = 400;
    throw err;
  }
  params.push(id);
  const r = await db.runAsync(
    `UPDATE users SET ${fields.join(", ")} WHERE id = ?`,
    params,
  );
  if (r.changes === 0) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  const user = await getUser(db, id);
  const token = signToken(user);

  return {
    user,
    token,
  };
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
};
