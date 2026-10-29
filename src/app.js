const express = require('express');
const path = require('node:path');
const apiRoutes = require('./routes/apiRoutes');

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Page Routes
  app.get('/', (req, res) => {
    res.redirect('/admin');
  });

  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  });

  app.get(['/s/:slug', '/survey/:slug'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'survey.html'));
  });

  // Mount API Routes
  app.use('/api', apiRoutes);

  return app;
}

module.exports = createApp;
