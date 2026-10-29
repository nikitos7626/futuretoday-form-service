const express = require('express');
const path = require('node:path');
const { SurveyService } = require('./surveyService');

function createApp(surveyServiceInstance) {
  const app = express();
  const service = surveyServiceInstance || new SurveyService();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  // Redirect root to /admin
  app.get('/', (req, res) => {
    res.redirect('/admin');
  });

  // Admin page
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  });

  // Participant survey pages (custom URL)
  app.get(['/s/:slug', '/survey/:slug'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'survey.html'));
  });

  // API Endpoints
  // Create survey
  app.post('/api/surveys', (req, res) => {
    try {
      const { title, description, slug, questions } = req.body;
      const created = service.createSurvey({ title, description, slug, questions });
      const host = req.get('host');
      const protocol = req.protocol;
      const shareUrl = `${protocol}://${host}/s/${created.slug}`;

      res.status(201).json({
        success: true,
        survey: {
          ...created,
          url: shareUrl
        }
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // List surveys with telemetry summary
  app.get('/api/surveys', (req, res) => {
    try {
      const list = service.listSurveys();
      const host = req.get('host');
      const protocol = req.protocol;
      const enriched = list.map((s) => ({
        ...s,
        url: `${protocol}://${host}/s/${s.slug}`
      }));
      res.json({ success: true, surveys: enriched });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get specific survey configuration
  app.get('/api/surveys/:slug', (req, res) => {
    try {
      const survey = service.getSurveyBySlug(req.params.slug);
      if (!survey) {
        return res.status(404).json({ success: false, error: 'Опрос не найден' });
      }
      const host = req.get('host');
      const protocol = req.protocol;
      res.json({
        success: true,
        survey: {
          ...survey,
          url: `${protocol}://${host}/s/${survey.slug}`
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Delete survey
  app.delete('/api/surveys/:slug', (req, res) => {
    try {
      const deleted = service.deleteSurvey(req.params.slug);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Опрос не найден' });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Initialize or resume respondent session
  app.post('/api/surveys/:slug/session', (req, res) => {
    try {
      const { sessionId, participantName } = req.body || {};
      const session = service.getOrCreateSession(req.params.slug, { sessionId, participantName });
      res.json({ success: true, session });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Telemetry endpoint - saves current answers and status after each field change
  app.post('/api/surveys/:slug/telemetry', (req, res) => {
    try {
      const { sessionId, fieldId, value, answers, progress, eventType, clientTime, participantName } = req.body;
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId обязателен' });
      }

      const card = service.recordTelemetry(req.params.slug, {
        sessionId,
        fieldId,
        value,
        answers,
        progress,
        eventType,
        clientTime,
        participantName
      });

      res.json({ success: true, card });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Telemetry polling for a single card/session
  app.get('/api/surveys/:slug/telemetry/:sessionId', (req, res) => {
    try {
      const card = service.getResponseSession(req.params.slug, req.params.sessionId);
      if (!card) {
        return res.status(404).json({ success: false, error: 'Карточка сессии не найдена' });
      }
      res.json(card);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Poll all response cards & live telemetry for admin
  app.get('/api/surveys/:slug/responses', (req, res) => {
    try {
      const responses = service.getSurveyResponses(req.params.slug);
      res.json({ success: true, responses });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Submit survey
  app.post('/api/surveys/:slug/submit', (req, res) => {
    try {
      const { sessionId, answers } = req.body;
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'sessionId обязателен' });
      }

      const response = service.submitSurvey(req.params.slug, { sessionId, answers });
      res.json({ success: true, response });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return app;
}

module.exports = createApp;
