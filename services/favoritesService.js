async function addFavorite(db, userId, propertyId) {
  if (!userId) { const err = new Error('authentication required'); err.status = 401; throw err; }
  if (!propertyId) { const err = new Error('property id is required'); err.status = 400; throw err; }

  const prop = await db.getAsync('SELECT id FROM properties WHERE id = ?', [propertyId]);
  if (!prop) { const err = new Error('Property not found'); err.status = 404; throw err; }

  // Ensure user exists (defensive); if not, will also fail on FK
  const user = await db.getAsync('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) { const err = new Error('User not found'); err.status = 404; throw err; }

  await db.runAsync('INSERT OR IGNORE INTO favorites(user_id, property_id) VALUES (?,?)', [userId, propertyId]);
  return { ok: true };
}

async function removeFavorite(db, userId, propertyId) {
  if (!userId) { const err = new Error('authentication required'); err.status = 401; throw err; }
  if (!propertyId) { const err = new Error('property id is required'); err.status = 400; throw err; }
  await db.runAsync('DELETE FROM favorites WHERE user_id = ? AND property_id = ?', [userId, propertyId]);
  return { ok: true };
}

async function listFavoritesForUser(db, userId) {
  const user = await db.getAsync('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) { const err = new Error('User not found'); err.status = 404; throw err; }
  const rows = await db.allAsync(`
    SELECT p.*, u.name AS host_name, u.picture AS host_picture
    FROM favorites f
    JOIN properties p ON p.id = f.property_id
    JOIN users u ON u.id = p.host_id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `, [userId]);
  return rows.map(row => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    cover: row.cover,
    location: row.location,
    price_per_night: row.price_per_night,
    rating_avg: row.rating_avg,
    ratings_count: row.ratings_count,
    host: row.host_id ? { id: row.host_id, name: row.host_name, picture: row.host_picture } : undefined,
  }));
}

module.exports = {
  addFavorite,
  removeFavorite,
  listFavoritesForUser,
};
