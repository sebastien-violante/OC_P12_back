const path = require("path");
const fs = require("fs");
const { createClient } = require("@libsql/client");

const DB_PATH = path.join(__dirname, "data", "kasa.sqlite3");
const PROPS_JSON_PATH = path.join(__dirname, "data", "properties.json");

function normalizeRow(row) {
  if (!row) return row;

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value?.value ?? value,
    ])
  );
}

function normalizeRows(rows) {
  return rows.map(normalizeRow);
}

function openDb() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "TURSO_DATABASE_URL et TURSO_AUTH_TOKEN doivent être définis dans .env"
    );
  }

  const client = createClient({
    url,
    authToken,
  });

  // Compatibilité avec l'ancien code basé sur sqlite3
  client.runAsync = async function (sql, params = []) {
    const result = await this.execute({
      sql,
      args: params,
    });

    return {
      lastID:
        result.lastInsertRowid != null
          ? Number(result.lastInsertRowid)
          : result.meta?.last_insert_rowid != null
            ? Number(result.meta.last_insert_rowid)
            : undefined,

      changes:
        result.rowsAffected != null
          ? Number(result.rowsAffected)
          : result.meta?.changes != null
            ? Number(result.meta.changes)
            : 0,
    };
  };

  client.getAsync = async function (sql, params = []) {
    const result = await this.execute({
      sql,
      args: params,
    });

    if (!result.rows.length) {
      return undefined;
    }

    return normalizeRow(result.rows[0]);
  };

  client.allAsync = async function (sql, params = []) {
    const result = await this.execute({
      sql,
      args: params,
    });

    return normalizeRows(result.rows);
  };

  client.execAsync = async function (sql) {
    return this.executeMultiple(sql);
  };

  return client;
}

async function initSchema(db) {
  const schema = `
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      picture TEXT,
      role TEXT NOT NULL CHECK (role IN ('owner','client','admin')),
      email TEXT,
      password_hash TEXT,
      reset_token TEXT,
      reset_expires INTEGER,
      UNIQUE(name, picture),
      UNIQUE(email)
    );

    CREATE TABLE IF NOT EXISTS properties (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      cover TEXT,
      location TEXT,
      host_id INTEGER NOT NULL,
      rating_avg REAL DEFAULT 0,
      ratings_count INTEGER DEFAULT 0,
      price_per_night INTEGER NOT NULL,
      FOREIGN KEY(host_id) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS property_pictures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      url TEXT NOT NULL,
      UNIQUE(property_id, url),
      FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS property_equipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      name TEXT NOT NULL,
      UNIQUE(property_id, name),
      FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS property_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      name TEXT NOT NULL,
      UNIQUE(property_id, name),
      FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL,
      property_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, property_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT NOT NULL,
      client_id INTEGER NOT NULL,
      host_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY(property_id) REFERENCES properties(id) ON DELETE CASCADE,
      FOREIGN KEY(client_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(host_id) REFERENCES users(id) ON DELETE CASCADE,

      UNIQUE(property_id, client_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME,

      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_properties_host
      ON properties(host_id);

    CREATE INDEX IF NOT EXISTS idx_ratings_property
      ON ratings(property_id);

    CREATE INDEX IF NOT EXISTS idx_ratings_user
      ON ratings(user_id);

    CREATE INDEX IF NOT EXISTS idx_conversations_client
      ON conversations(client_id);

    CREATE INDEX IF NOT EXISTS idx_conversations_host
      ON conversations(host_id);

    CREATE INDEX IF NOT EXISTS idx_conversations_property
      ON conversations(property_id);

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id);

    CREATE INDEX IF NOT EXISTS idx_messages_sender
      ON messages(sender_id);
  `;

  await db.execAsync(schema);

  /*
   * Migrations pour les anciennes bases.
   */

  // Vérification de la table users
  try {
    const userCols = await db.allAsync("PRAGMA table_info('users')");
    const userNames = new Set(userCols.map((c) => c.name));

    if (!userNames.has("email")) {
      await db.runAsync("ALTER TABLE users ADD COLUMN email TEXT");

      await db.runAsync(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)"
      );
    }

    if (!userNames.has("password_hash")) {
      await db.runAsync(
        "ALTER TABLE users ADD COLUMN password_hash TEXT"
      );
    }

    if (!userNames.has("reset_token")) {
      await db.runAsync(
        "ALTER TABLE users ADD COLUMN reset_token TEXT"
      );

      await db.runAsync(
        "CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token)"
      );
    }

    if (!userNames.has("reset_expires")) {
      await db.runAsync(
        "ALTER TABLE users ADD COLUMN reset_expires INTEGER"
      );
    }
  } catch (e) {
    console.warn("Users migration warning:", e.message);
  }

  // Vérification de la table messages
  try {
    const messageCols = await db.allAsync(
      "PRAGMA table_info('messages')"
    );

    const messageNames = new Set(
      messageCols.map((c) => c.name)
    );

    if (!messageNames.has("read_at")) {
      await db.runAsync(
        "ALTER TABLE messages ADD COLUMN read_at DATETIME"
      );
    }
  } catch (e) {
    console.warn("Messages migration warning:", e.message);
  }

  // Vérification de la colonne slug
  try {
    const propertyCols = await db.allAsync(
      "PRAGMA table_info('properties')"
    );

    const propertyNames = new Set(
      propertyCols.map((c) => c.name)
    );

    if (!propertyNames.has("slug")) {
      await db.runAsync(
        "ALTER TABLE properties ADD COLUMN slug TEXT"
      );

      const rows = await db.allAsync(
        "SELECT id, title FROM properties"
      );

      const used = new Set();

      for (const row of rows) {
        const base = slugify(
          row.title || row.id || "property"
        );

        let slug = base;
        let n = 2;

        while (used.has(slug)) {
          slug = `${base}-${n++}`;
        }

        used.add(slug);

        await db.runAsync(
          "UPDATE properties SET slug = ? WHERE id = ?",
          [slug, row.id]
        );
      }

      await db.runAsync(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_slug ON properties(slug)"
      );
    }
  } catch (e) {
    console.warn("Properties migration warning:", e.message);
  }
}

function deterministicPrice(idOrTitle) {
  const s = String(idOrTitle);

  let h = 0;

  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }

  return 45 + (h % 256);
}

function slugify(input) {
  const s = String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "property";
}

async function seedIfEmpty(db) {
  const row = await db.getAsync(
    "SELECT COUNT(*) AS c FROM properties"
  );

  if (row && Number(row.c) > 0) {
    console.log("Database already contains properties.");
    return;
  }

  if (!fs.existsSync(PROPS_JSON_PATH)) {
    console.warn(
      "properties.json introuvable :",
      PROPS_JSON_PATH
    );

    return;
  }

  const raw = fs.readFileSync(
    PROPS_JSON_PATH,
    "utf-8"
  );

  let data;

  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(
      "Failed to parse properties.json:",
      e.message
    );

    return;
  }

  if (!Array.isArray(data)) {
    console.error(
      "properties.json ne contient pas un tableau."
    );

    return;
  }

  console.log(
    `Seeding ${data.length} properties into Turso...`
  );

  const usedSlugs = new Set();

  for (const p of data) {
    const hostName =
      p.host && p.host.name
        ? p.host.name
        : "Unknown";

    const hostPic =
      p.host && p.host.picture
        ? p.host.picture
        : null;

    /*
     * Recherche du propriétaire existant.
     *
     * IMPORTANT :
     * utiliser des quotes simples pour les chaînes SQL.
     * Avec Turso/libSQL, "" est interprété comme un identifiant
     * et non comme une chaîne vide.
     */
    let user = await db.getAsync(
      "SELECT id FROM users WHERE name = ? AND IFNULL(picture, '') = IFNULL(?, '')",
      [hostName, hostPic]
    );

    if (!user) {
      const ins = await db.runAsync(
        "INSERT INTO users(name, picture, role) VALUES (?,?,?)",
        [
          hostName,
          hostPic,
          "owner",
        ]
      );

      user = {
        id: ins.lastID,
      };
    }

    /*
     * Sécurité supplémentaire :
     * on s'assure que l'ID du propriétaire est bien exploitable
     * avant de l'envoyer à Turso.
     */
    const hostId = Number(user.id);

    if (!Number.isFinite(hostId)) {
      throw new Error(
        `Impossible de déterminer l'ID du propriétaire "${hostName}".`
      );
    }

    // Préparation du slug
    const base = slugify(
      p.title || p.id || hostName
    );

    let slug = base;
    let n = 2;

    while (usedSlugs.has(slug)) {
      slug = `${base}-${n++}`;
    }

    usedSlugs.add(slug);

    // Prix
    const price = deterministicPrice(
      p.id || p.title || hostName
    );

    // Note moyenne
    const ratingAvg =
      p.rating != null
        ? Number(p.rating)
        : 0;

    await db.runAsync(
      `INSERT OR IGNORE INTO properties
      (
        id,
        title,
        slug,
        description,
        cover,
        location,
        host_id,
        rating_avg,
        price_per_night
      )
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        p.id,
        p.title,
        slug,
        p.description || null,
        p.cover || null,
        p.location || null,
        hostId,
        ratingAvg,
        price,
      ]
    );

    // Pictures
    const pics = new Set();

    if (p.cover) {
      pics.add(p.cover);
    }

    if (Array.isArray(p.pictures)) {
      p.pictures.forEach((url) => {
        if (url) {
          pics.add(url);
        }
      });
    }

    for (const url of pics) {
      await db.runAsync(
        `INSERT OR IGNORE INTO property_pictures
        (property_id, url)
        VALUES (?,?)`,
        [
          p.id,
          url,
        ]
      );
    }

    // Equipments
    if (Array.isArray(p.equipments)) {
      for (const name of p.equipments) {
        if (!name) continue;

        await db.runAsync(
          `INSERT OR IGNORE INTO property_equipments
          (property_id, name)
          VALUES (?,?)`,
          [
            p.id,
            name,
          ]
        );
      }
    }

    // Tags
    if (Array.isArray(p.tags)) {
      for (const name of p.tags) {
        if (!name) continue;

        await db.runAsync(
          `INSERT OR IGNORE INTO property_tags
          (property_id, name)
          VALUES (?,?)`,
          [
            p.id,
            name,
          ]
        );
      }
    }
  }

  console.log("Database seed completed successfully.");
}


async function initialize() {
  const db = openDb();

  await initSchema(db);

  await seedIfEmpty(db);

  return db;
}


module.exports = {
  initialize,
  openDb,
  DB_PATH,
}