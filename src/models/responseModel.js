const { getDatabase } = require('../db');

class ResponseModel {
  constructor(db) {
    this._db = db;
    this._stmts = null;
    this._stmtsDb = null;
  }

  get db() {
    return this._db || getDatabase();
  }

  get stmts() {
    const currentDb = this.db;
    if (!this._stmts || this._stmtsDb !== currentDb) {
      this._stmtsDb = currentDb;
      this._stmts = {
        findByUuid: currentDb.prepare('SELECT * FROM responses WHERE session_uuid = ?'),
        findSession: currentDb.prepare(`
          SELECT r.* 
          FROM responses r
          WHERE r.survey_id = ? AND r.session_uuid = ?
        `),
        insertResponse: currentDb.prepare(`
          INSERT INTO responses (
            survey_id, session_uuid, current_step, progress, status,
            answers, started_at, updated_at
          ) VALUES (?, ?, ?, 0, 'in_progress', '{}', ?, ?)
        `),
        updateResponseTelemetry: currentDb.prepare(`
          UPDATE responses
          SET 
            answers = ?,
            current_step = ?,
            progress = ?,
            updated_at = ?
          WHERE session_uuid = ?
        `),
        insertTelemetryEvent: currentDb.prepare(`
          INSERT INTO telemetry_events (session_uuid, field_id, field_value, event_type, client_time, server_time)
          VALUES (?, ?, ?, ?, ?, ?)
        `),
        getEventsRecent20: currentDb.prepare(`
          SELECT * FROM telemetry_events WHERE session_uuid = ? ORDER BY id DESC LIMIT 20
        `),
        getEventsRecent10: currentDb.prepare(`
          SELECT * FROM telemetry_events WHERE session_uuid = ? ORDER BY id DESC LIMIT 10
        `),
        getResponsesBySurveyId: currentDb.prepare(`
          SELECT * FROM responses WHERE survey_id = ? ORDER BY updated_at DESC
        `),
        submitResponse: currentDb.prepare(`
          UPDATE responses
          SET 
            answers = ?,
            current_step = ?,
            progress = 100,
            status = 'submitted',
            updated_at = ?,
            submitted_at = ?
          WHERE session_uuid = ?
        `),
        insertSubmitEvent: currentDb.prepare(`
          INSERT INTO telemetry_events (session_uuid, field_id, field_value, event_type, server_time)
          VALUES (?, ?, ?, 'submit', ?)
        `)
      };
    }
    return this._stmts;
  }

  findByUuid(sessionUuid) {
    const row = this.stmts.findByUuid.get(sessionUuid);
    if (!row) return null;
    return {
      ...row,
      answers: JSON.parse(row.answers || '{}')
    };
  }

  findSession(surveyId, sessionUuid) {
    const row = this.stmts.findSession.get(surveyId, sessionUuid);
    if (!row) return null;

    const events = this.stmts.getEventsRecent20.all(sessionUuid);
    return {
      ...row,
      answers: JSON.parse(row.answers || '{}'),
      telemetry_events: events
    };
  }

  createSession({ surveyId, sessionUuid, currentStep = 1, createdAt }) {
    this.stmts.insertResponse.run(
      surveyId,
      sessionUuid,
      Number(currentStep) || 1,
      createdAt,
      createdAt
    );

    return {
      survey_id: surveyId,
      session_uuid: sessionUuid,
      current_step: Number(currentStep) || 1,
      progress: 0,
      status: 'in_progress',
      answers: {},
      started_at: createdAt,
      updated_at: createdAt,
      submitted_at: null
    };
  }

  updateTelemetry({ sessionUuid, answers, currentStep, progress, updatedAt }) {
    this.stmts.updateResponseTelemetry.run(
      JSON.stringify(answers),
      currentStep,
      progress,
      updatedAt,
      sessionUuid
    );
  }

  logTelemetryEvent({ sessionUuid, fieldId, fieldValue, eventType = 'field_change', clientTime, serverTime }) {
    const valStr = fieldValue !== undefined && fieldValue !== null
      ? (typeof fieldValue === 'object' ? JSON.stringify(fieldValue) : String(fieldValue))
      : null;

    this.stmts.insertTelemetryEvent.run(
      sessionUuid,
      fieldId || null,
      valStr,
      eventType,
      clientTime || null,
      serverTime
    );
  }

  findBySurveyId(surveyId, surveySlug = '', surveyTitle = '') {
    const rows = this.stmts.getResponsesBySurveyId.all(surveyId);
    return rows.map((r) => {
      const events = this.stmts.getEventsRecent10.all(r.session_uuid);
      return {
        ...r,
        survey_id: surveyId,
        survey_slug: surveySlug,
        survey_title: surveyTitle,
        answers: JSON.parse(r.answers || '{}'),
        telemetry_events: events
      };
    });
  }

  submit({ sessionUuid, answers, totalQuestions, now }) {
    this.stmts.submitResponse.run(
      JSON.stringify(answers),
      totalQuestions,
      now,
      now,
      sessionUuid
    );

    this.stmts.insertSubmitEvent.run(sessionUuid, null, 'SUBMITTED', now);
    return this.findByUuid(sessionUuid);
  }

  getAnalyticsBySurveyId(surveyId) {
    const responses = this.stmts.getResponsesBySurveyId.all(surveyId);
    const total = responses.length;
    let submitted = 0;
    let withAnswers = 0;
    let empty = 0;

    for (const r of responses) {
      if (r.status === 'submitted') {
        submitted++;
      } else {
        const answers = JSON.parse(r.answers || '{}');
        const hasAns = Object.values(answers).some(v => v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0));
        if (hasAns || r.progress > 0) {
          withAnswers++;
        } else {
          empty++;
        }
      }
    }

    return {
      total,
      submitted,
      withAnswers,
      empty,
      responsesCount: total
    };
  }
}

module.exports = new ResponseModel();
module.exports.ResponseModel = ResponseModel;
