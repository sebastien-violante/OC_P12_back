const {
  getOrCreateConversation,
  listConversations,
  listMessages,
  sendMessage,
  markConversationAsRead
} = require('../services/messagesService');


function statusFromError(e) {
  if (e && e.status) return e.status;
  return 500;
}


// POST /api/conversations
// Créer ou récupérer une conversation pour un logement
async function createConversation(req, res) {
  const db = req.app.locals.db;

  try {
    const clientId = req.user && req.user.id;
    const { propertyId } = req.body;

    if (!propertyId) {
      return res.status(400).json({
        error: 'propertyId is required'
      });
    }

    const conversation = await getOrCreateConversation(
      db,
      clientId,
      propertyId
    );

    res.status(200).json(conversation);

  } catch (e) {
    res.status(statusFromError(e)).json({
      error: e.message
    });
  }
}


// GET /api/conversations
// Récupérer les conversations de l'utilisateur connecté
async function list(req, res) {
  const db = req.app.locals.db;

  try {
    const userId = req.user && req.user.id;

    const conversations = await listConversations(
      db,
      userId
    );

    res.json(conversations);

  } catch (e) {
    res.status(statusFromError(e)).json({
      error: e.message
    });
  }
}


// GET /api/conversations/:id/messages
// Récupérer les messages d'une conversation
async function messages(req, res) {
  const db = req.app.locals.db;

  try {
    const userId = req.user && req.user.id;
    const conversationId = req.params.id;

    const result = await listMessages(
      db,
      conversationId,
      userId
    );

    res.json(result);

  } catch (e) {
    res.status(statusFromError(e)).json({
      error: e.message
    });
  }
}


// POST /api/conversations/:id/messages
// Envoyer un message
async function send(req, res) {
  const db = req.app.locals.db;

  try {
    const userId = req.user && req.user.id;
    const conversationId = req.params.id;

    const { content } = req.body;

    const message = await sendMessage(
      db,
      conversationId,
      userId,
      content
    );

    res.status(201).json(message);

  } catch (e) {
    res.status(statusFromError(e)).json({
      error: e.message
    });
  }
}

// PATCH api/conversations/:id/read
// Marquer les messages d'une conversation commu lus
async function markAsRead(req, res) {
  const db = req.app.locals.db;

  try {
    const userId = req.user && req.user.id;
    const conversationId = req.params.id;

    const result = await markConversationAsRead(
      db,
      conversationId,
      userId
    );

    res.json(result);

  } catch (e) {
    res.status(statusFromError(e)).json({
      error: e.message
    });
  }
}


module.exports = {
  createConversation,
  list,
  messages,
  send,
  markAsRead
};