const express = require('express');
const surveyController = require('../controllers/surveyController');
const responseController = require('../controllers/responseController');

const router = express.Router();

// Surveys CRUD
router.post('/surveys', surveyController.createSurvey);
router.get('/surveys', surveyController.listSurveys);
router.get('/surveys/:slug', surveyController.getSurvey);
router.delete('/surveys/:slug', surveyController.deleteSurvey);

// Dedicated edit endpoints (supporting both POST & PUT)
router.post('/surveys/edit/:slug', surveyController.updateSurvey);
router.put('/surveys/edit/:slug', surveyController.updateSurvey);
router.post('/surveys/:slug/edit', surveyController.updateSurvey);
router.put('/surveys/:slug/edit', surveyController.updateSurvey);
router.put('/surveys/:slug', surveyController.updateSurvey);
router.post('/surveys/:slug', surveyController.updateSurvey);

// Candidate sessions & Telemetry
router.post('/surveys/:slug/session', responseController.initSession);
router.post('/surveys/:slug/telemetry', responseController.recordTelemetry);
router.get('/surveys/:slug/telemetry/:sessionUuid', responseController.getSessionTelemetry);
router.get('/surveys/:slug/responses', responseController.getResponses);
router.post('/surveys/:slug/submit', responseController.submitSurvey);

module.exports = router;
