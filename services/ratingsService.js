async function listRatingsForProperty(db, propertyId) {
  const prop = await db.getAsync('SELECT id FROM properties WHERE id = ?', [propertyId]);
  if (!prop) {
    const err = new Error('Property not found');
    err.status = 404;
    throw err;
  }
  const rows = await db.allAsync(`
      SELECT r.id, r.score, r.comment, r.created_at,
             u.id as user_id, u.name as user_name, u.picture as user_picture
      FROM ratings r JOIN users u ON u.id = r.user_id
      WHERE r.property_id = ?
      ORDER BY r.created_at DESC
    `, [propertyId]);
  return rows.map(r => ({
    id: r.id,
    score: r.score,
    comment: r.comment,
    created_at: r.created_at,
    user: { id: r.user_id, name: r.user_name, picture: r.user_picture },
  }));
}

async function addRating(db, propertyId, { user_id, score, comment = null }) {
  const s = Number(score);
  if (!Number.isInteger(s) || s < 1 || s > 5) {
    const err = new Error('score must be integer between 1 and 5');
    err.status = 400;
    throw err;
  }
  if (!user_id) {
    const err = new Error('user_id is required');
    err.status = 400;
    throw err;
  }

  const prop = await db.getAsync('SELECT id FROM properties WHERE id = ?', [propertyId]);
  if (!prop) {
    const err = new Error('Property not found');
    err.status = 404;
    throw err;
  }
  const user = await db.getAsync('SELECT id FROM users WHERE id = ?', [user_id]);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  await db.runAsync('INSERT INTO ratings(property_id, user_id, score, comment) VALUES (?,?,?,?)', [propertyId, user_id, s, comment]);

  const stats = await db.getAsync('SELECT AVG(score) as avg, COUNT(*) as cnt FROM ratings WHERE property_id = ?', [propertyId]);
  const avg = Math.round((stats.avg || 0) * 10) / 10;
  const cnt = stats.cnt || 0;
  await db.runAsync('UPDATE properties SET rating_avg = ?, ratings_count = ? WHERE id = ?', [avg, cnt, propertyId]);

  const ratings = await listRatingsForProperty(db, propertyId);
  return { rating_avg: avg, ratings_count: cnt, ratings };
}

module.exports = {
  listRatingsForProperty,
  addRating,
};
