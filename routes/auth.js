const express = require('express');
const router = express.Router();

const dbReady = require('../middlewares/dbReady');
const { doRegister, doLogin, doRequestReset, doResetPassword } = require('../controllers/authController');

// Ensure DB is ready for all auth routes
router.use(dbReady);

// Auth endpoints
router.post('/register', doRegister);
router.post('/login', doLogin);
router.post('/request-reset', doRequestReset);
router.post('/reset-password', doResetPassword);

module.exports = router;
