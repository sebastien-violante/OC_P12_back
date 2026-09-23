const express = require('express');
const router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.send({ name: 'Kasa Backend API', version: 'v1', docs: '/docs.html', openapi: '/openapi.json' });
});

// Redirect /docs to the Swagger UI page
router.get('/docs', function(req, res) {
  res.redirect('/docs.html');
});

module.exports = router;
