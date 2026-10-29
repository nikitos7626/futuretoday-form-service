const crypto = require('node:crypto');
const surveyModel = require('../models/surveyModel');
const responseModel = require('../models/responseModel');
const { calculateProgress } = require('../utils/hash');

class ResponseController {
  initSession(req, res) {
    try {
      const survey = surveyModel.findBySlug(req.params.slug);
      if (!survey) {
        return res.status(404).json({ success: false, error: `Опрос "${req.params.slug}" не найден` });
      }

      const { sessionUuid, sessionId, currentStep = 1 } = req.body || {};
      const cleanUuid = sessionUuid || sessionId || crypto.randomUUID();

      const existing = responseModel.findByUuid(cleanUuid);
      if (existing) {
        return res.json({ success: true, session: existing });
      }

      const now = new Date().toISOString();
      const session = responseModel.createSession({
        surveyId: survey.id,
        sessionUuid: cleanUuid,
        currentStep,
        createdAt: now
      });

      return res.json({ success: true, session });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  recordTelemetry(req, res) {
    try {
      const survey = surveyModel.findBySlug(req.params.slug);
      if (!survey) {
        return res.status(404).json({ success: false, error: `Опрос "${req.params.slug}" не найден` });
      }

      const {
        sessionUuid,
        sessionId,
        currentStep,
        fieldId,
        value,
        answers = {},
        progress,
        eventType = 'field_change',
        clientTime
      } = req.body || {};

      const targetUuid = sessionUuid || sessionId;
      if (!targetUuid) {
        return res.status(400).json({ success: false, error: 'session_uuid обязателен' });
      }

      let existing = responseModel.findByUuid(targetUuid);
      const now = new Date().toISOString();

      if (!existing) {
        responseModel.createSession({
          surveyId: survey.id,
          sessionUuid: targetUuid,
          currentStep: currentStep || 1,
          createdAt: now
        });
        existing = responseModel.findByUuid(targetUuid);
      }

      const currentAnswers = {
        ...(existing.answers || {}),
        ...answers
      };

      if (fieldId && value !== undefined) {
        currentAnswers[fieldId] = value;
      }

      const calculatedProgress = progress !== undefined
        ? progress
        : calculateProgress(survey.questions, currentAnswers);

      const stepToSet = currentStep !== undefined ? Number(currentStep) : existing.current_step;

      responseModel.updateTelemetry({
        sessionUuid: targetUuid,
        answers: currentAnswers,
        currentStep: stepToSet,
        progress: calculatedProgress,
        updatedAt: now
      });

      responseModel.logTelemetryEvent({
        sessionUuid: targetUuid,
        fieldId: fieldId || null,
        fieldValue: value,
        eventType,
        clientTime: clientTime || null,
        serverTime: now
      });

      const updated = responseModel.findByUuid(targetUuid);
      return res.json({ success: true, card: updated });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  getSessionTelemetry(req, res) {
    try {
      const survey = surveyModel.findBySlug(req.params.slug);
      if (!survey) {
        return res.status(404).json({ success: false, error: 'Опрос не найден' });
      }

      const card = responseModel.findSession(survey.id, req.params.sessionUuid);
      if (!card) {
        return res.status(404).json({ success: false, error: 'Карточка сессии не найдена' });
      }

      return res.json({
        ...card,
        survey_id: survey.id,
        survey_slug: survey.slug,
        survey_title: survey.title,
        survey_questions: survey.questions
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  getResponses(req, res) {
    try {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

      const survey = surveyModel.findBySlug(req.params.slug);
      if (!survey) {
        return res.status(400).json({ success: false, error: `Опрос "${req.params.slug}" не найден` });
      }

      const responses = responseModel.findBySurveyId(survey.id, survey.slug, survey.title);
      const host = req.get('host');
      const protocol = req.protocol;
      const surveyUrl = `${protocol}://${host}/s/${survey.slug}`;

      return res.json({
        success: true,
        survey: {
          ...survey,
          url: surveyUrl
        },
        responses
      });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }

  submitSurvey(req, res) {
    try {
      const survey = surveyModel.findBySlug(req.params.slug);
      if (!survey) {
        return res.status(404).json({ success: false, error: `Опрос "${req.params.slug}" не найден` });
      }

      const { sessionUuid, sessionId, answers = {} } = req.body || {};
      const targetUuid = sessionUuid || sessionId;
      if (!targetUuid) {
        return res.status(400).json({ success: false, error: 'session_uuid обязателен' });
      }

      const existing = responseModel.findByUuid(targetUuid);
      if (!existing) {
        return res.status(400).json({ success: false, error: 'Сессия не найдена' });
      }

      const currentAnswers = {
        ...(existing.answers || {}),
        ...answers
      };

      const now = new Date().toISOString();
      const response = responseModel.submit({
        sessionUuid: targetUuid,
        answers: currentAnswers,
        totalQuestions: survey.questions.length,
        now
      });

      return res.json({ success: true, response });
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
  }
}

const controller = new ResponseController();
module.exports = {
  initSession: controller.initSession.bind(controller),
  recordTelemetry: controller.recordTelemetry.bind(controller),
  getSessionTelemetry: controller.getSessionTelemetry.bind(controller),
  getResponses: controller.getResponses.bind(controller),
  submitSurvey: controller.submitSurvey.bind(controller),
  ResponseController
};
