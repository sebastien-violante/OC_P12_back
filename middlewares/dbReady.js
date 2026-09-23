module.exports = async function dbReady(req, res, next) {
  try {
    const db = await req.app.locals.dbPromise;

    if (!db) {
      return res.status(503).json({ error: "Database not ready" });
    }

    next();
  } catch (err) {
    console.error("Database initialization error:", err);
    res.status(500).json({ error: "Database initialization failed" });
  }
};