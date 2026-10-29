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
      const status = err.statusCode || 400;
      res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  });

  // Update survey
  app.put('/api/surveys/:slug', (req, res) => {
    try {
      const { title, description, questions, slug: newSlug } = req.body;
      const updated = service.updateSurvey(req.params.slug, { title, description, questions, newSlug });
      const host = req.get('host');
      const protocol = req.protocol;
      const shareUrl = `${protocol}://${host}/s/${updated.slug}`;

      res.status(200).json({
        success: true,
        survey: {
          ...updated,
          url: shareUrl
        }
      });
    } catch (err) {
      const status = err.statusCode || (err.message.includes('не найден') ? 404 : 400);
      res.status(status).json({ success: false, error: err.message, code: err.code });
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

  // Initialize or resume candidate session
  app.post('/api/surveys/:slug/session', (req, res) => {
    try {
      const { sessionUuid, sessionId, currentStep } = req.body || {};
      const session = service.getOrCreateSession(req.params.slug, { sessionUuid, sessionId, currentStep });
      res.json({ success: true, session });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Telemetry endpoint - saves current answers, current_step and progress after each change
  app.post('/api/surveys/:slug/telemetry', (req, res) => {
    try {
      const { sessionUuid, sessionId, currentStep, fieldId, value, answers, progress, eventType, clientTime } = req.body;
      const targetUuid = sessionUuid || sessionId;
      if (!targetUuid) {
        return res.status(400).json({ success: false, error: 'session_uuid обязателен' });
      }

      const card = service.recordTelemetry(req.params.slug, {
        sessionUuid: targetUuid,
        currentStep,
        fieldId,
        value,
        answers,
        progress,
        eventType,
        clientTime
      });

      res.json({ success: true, card });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Telemetry polling for a single card/session
  app.get('/api/surveys/:slug/telemetry/:sessionUuid', (req, res) => {
    try {
      const card = service.getResponseSession(req.params.slug, req.params.sessionUuid);
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
      const { sessionUuid, sessionId, answers } = req.body;
      const targetUuid = sessionUuid || sessionId;
      if (!targetUuid) {
        return res.status(400).json({ success: false, error: 'session_uuid обязателен' });
      }

      const response = service.submitSurvey(req.params.slug, { sessionUuid: targetUuid, answers });
      res.json({ success: true, response });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return app;
}

module.exports = createApp;
