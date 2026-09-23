async function getOrCreateConversation(db, clientId, propertyId) {
  const property = await db.getAsync(
    `
    SELECT id, title, host_id
    FROM properties
    WHERE id = ?
    `,
    [propertyId]
  );

  if (!property) {
    const error = new Error('Property not found');
    error.status = 404;
    throw error;
  }

  const host = await db.getAsync(
    `
    SELECT id, name, picture, role
    FROM users
    WHERE id = ?
    `,
    [property.host_id]
  );

  if (!host) {
    const error = new Error('Host not found');
    error.status = 404;
    throw error;
  }

  if (Number(clientId) === Number(property.host_id)) {
    const error = new Error('You cannot start a conversation with yourself');
    error.status = 400;
    throw error;
  }

  let conversation = await db.getAsync(
    `
    SELECT id, property_id, client_id, host_id, created_at, updated_at
    FROM conversations
    WHERE property_id = ?
      AND client_id = ?
    `,
    [propertyId, clientId]
  );

  if (!conversation) {
    const result = await db.runAsync(
      `
      INSERT INTO conversations (
        property_id,
        client_id,
        host_id
      )
      VALUES (?, ?, ?)
      `,
      [propertyId, clientId, property.host_id]
    );

    conversation = await db.getAsync(
      `
      SELECT id, property_id, client_id, host_id, created_at, updated_at
      FROM conversations
      WHERE id = ?
      `,
      [result.lastID]
    );
  }

  return {
    id: conversation.id,

    property: {
      id: conversation.property_id,
      title: property.title
    },

    clientId: conversation.client_id,

    host: {
      id: host.id,
      name: host.name,
      picture: host.picture
    },

    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at
  };
}


async function listConversations(db, userId) {
  const rows = await db.allAsync(
    `
    SELECT
      c.id,
      c.property_id,
      c.client_id,
      c.host_id,
      c.created_at,
      c.updated_at,

      p.title AS property_title,

      h.name AS host_name,
      h.picture AS host_picture,

      cl.name AS client_name,
      cl.picture AS client_picture,

      m.content AS last_message_content,
      m.created_at AS last_message_created_at,

      (
        SELECT COUNT(*)
        FROM messages um
        WHERE um.conversation_id = c.id
          AND um.sender_id != ?
          AND um.read_at IS NULL
      ) AS unread_count

    FROM conversations c

    JOIN properties p
      ON p.id = c.property_id

    JOIN users h
      ON h.id = c.host_id

    JOIN users cl
      ON cl.id = c.client_id

    LEFT JOIN messages m
      ON m.id = (
        SELECT m2.id
        FROM messages m2
        WHERE m2.conversation_id = c.id
        ORDER BY m2.id DESC
        LIMIT 1
      )

    WHERE c.client_id = ?
       OR c.host_id = ?

    ORDER BY c.updated_at DESC
    `,
    [userId, userId, userId]
  );

  return rows.map(row => {
    const isClient = Number(row.client_id) === Number(userId);

    return {
      id: row.id,

      property: {
        id: row.property_id,
        title: row.property_title
      },

      otherUser: isClient
        ? {
            id: row.host_id,
            name: row.host_name,
            picture: row.host_picture,
            role: 'owner'
          }
        : {
            id: row.client_id,
            name: row.client_name,
            picture: row.client_picture,
            role: 'client'
          },

      lastMessage: row.last_message_content
        ? {
            content: row.last_message_content,
            createdAt: row.last_message_created_at
          }
        : null,

      unreadCount: Number(row.unread_count || 0),

      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
}


async function getConversationForUser(db, conversationId, userId) {
  const conversation = await db.getAsync(
    `
    SELECT
      c.id,
      c.property_id,
      c.client_id,
      c.host_id,
      c.created_at,
      c.updated_at,

      p.title AS property_title

    FROM conversations c

    JOIN properties p
      ON p.id = c.property_id

    WHERE c.id = ?
      AND (
        c.client_id = ?
        OR c.host_id = ?
      )
    `,
    [conversationId, userId, userId]
  );

  if (!conversation) {
    const error = new Error('Conversation not found');
    error.status = 404;
    throw error;
  }

  return conversation;
}


async function listMessages(db, conversationId, userId) {
  await getConversationForUser(
    db,
    conversationId,
    userId
  );

  const rows = await db.allAsync(
    `
    SELECT
      m.id,
      m.conversation_id,
      m.sender_id,
      m.content,
      m.created_at,
      m.read_at,

      u.name AS sender_name,
      u.picture AS sender_picture

    FROM messages m

    JOIN users u
      ON u.id = m.sender_id

    WHERE m.conversation_id = ?

    ORDER BY m.id ASC
    `,
    [conversationId]
  );

  return rows.map(row => ({
    id: row.id,

    conversationId: row.conversation_id,

    sender: {
      id: row.sender_id,
      name: row.sender_name,
      picture: row.sender_picture
    },

    content: row.content,

    createdAt: row.created_at,

    readAt: row.read_at
  }));
}


async function sendMessage(db, conversationId, userId, content) {
  const conversation = await getConversationForUser(
    db,
    conversationId,
    userId
  );

  const messageContent = String(content || '').trim();

  if (!messageContent) {
    const error = new Error('Message content is required');
    error.status = 400;
    throw error;
  }

  if (messageContent.length > 5000) {
    const error = new Error('Message is too long');
    error.status = 400;
    throw error;
  }

  const result = await db.runAsync(
    `
    INSERT INTO messages (
      conversation_id,
      sender_id,
      content
    )
    VALUES (?, ?, ?)
    `,
    [
      conversation.id,
      userId,
      messageContent
    ]
  );

  await db.runAsync(
    `
    UPDATE conversations
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [conversation.id]
  );

  const message = await db.getAsync(
    `
    SELECT
      m.id,
      m.conversation_id,
      m.sender_id,
      m.content,
      m.created_at,
      m.read_at,

      u.name AS sender_name,
      u.picture AS sender_picture

    FROM messages m

    JOIN users u
      ON u.id = m.sender_id

    WHERE m.id = ?
    `,
    [result.lastID]
  );

  return {
    id: message.id,

    conversationId: message.conversation_id,

    sender: {
      id: message.sender_id,
      name: message.sender_name,
      picture: message.sender_picture
    },

    content: message.content,

    createdAt: message.created_at,

    readAt: message.read_at
  };
}


async function markConversationAsRead(db, conversationId, userId) {
  // Vérifie que l'utilisateur appartient à la conversation
  const conversation = await getConversationForUser(
    db,
    conversationId,
    userId
  );

  // Marque comme lus uniquement les messages
  // envoyés par l'autre personne.
  await db.runAsync(
    `
    UPDATE messages
    SET read_at = CURRENT_TIMESTAMP
    WHERE conversation_id = ?
      AND sender_id != ?
      AND read_at IS NULL
    `,
    [
      conversation.id,
      userId
    ]
  );

  return {
    success: true
  };
}


module.exports = {
  getOrCreateConversation,
  listConversations,
  getConversationForUser,
  listMessages,
  sendMessage,
  markConversationAsRead
};