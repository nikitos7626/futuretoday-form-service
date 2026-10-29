const crypto = require('node:crypto');
const { getDatabase } = require('./db');

function generateSlug(length = 8) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function normalizeSlug(slug) {
  if (!slug) return generateSlug();
  return slug
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || generateSlug();
}

function calculateProgress(questions, answers) {
  if (!Array.isArray(questions) || questions.length === 0) return 0;
  let answeredCount = 0;
  for (const q of questions) {
    const val = answers[q.id];
    if (val !== undefined && val !== null && val !== '') {
      if (Array.isArray(val) ? val.length > 0 : true) {
        answeredCount++;
      }
    }
  }
  return Math.min(100, Math.round((answeredCount / questions.length) * 100));
}

class SurveyService {
  constructor(db) {
    this._db = db;
  }

  get db() {
    return this._db || getDatabase();
  }

  createSurvey({ title, description = '', slug, questions = [] }) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new Error('Название анкеты обязательно');
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Анкета должна содержать хотя бы один вопрос');
    }

    const cleanSlug = normalizeSlug(slug);
    const existing = this.db.prepare('SELECT id FROM surveys WHERE slug = ?').get(cleanSlug);
    if (existing) {
      throw new Error(`Ссылка со slug "${cleanSlug}" уже существует. Пожалуйста, выберите другой slug.`);
    }

    // Format questions array: [{ id: "q1", title: "ФИО", type: "text" }, ...]
    const formattedQuestions = questions.map((q, idx) => ({
      id: q.id || `q_${idx + 1}`,
      title: q.title || q.label || `Вопрос ${idx + 1}`,
      type: q.type || 'text', // text, textarea, number, rating, single, multiple
      options: Array.isArray(q.options) ? q.options : [],
      required: Boolean(q.required),
      min: q.min ?? (q.type === 'rating' ? 1 : undefined),
      max: q.max ?? (q.type === 'rating' ? 5 : undefined)
    }));

    const createdAt = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT INTO surveys (slug, title, description, questions, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      cleanSlug,
      title.trim(),
      (description || '').trim(),
      JSON.stringify(formattedQuestions),
      createdAt
    );

    return {
      id: result.lastInsertRowid,
      slug: cleanSlug,
      title: title.trim(),
      description: (description || '').trim(),
      questions: formattedQuestions,
      created_at: createdAt
    };
  }

  getSurveyBySlug(slug) {
    const row = this.db.prepare('SELECT * FROM surveys WHERE slug = ?').get(slug);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      questions: JSON.parse(row.questions),
      created_at: row.created_at
    };
  }

  listSurveys() {
    const rows = this.db.prepare(`
      SELECT 
        s.id,
        s.slug,
        s.title,
        s.description,
        s.created_at,
        COUNT(r.id) as total_responses,
        SUM(CASE WHEN r.status = 'submitted' THEN 1 ELSE 0 END) as submitted_count,
        SUM(CASE WHEN r.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
        MAX(r.updated_at) as last_activity
      FROM surveys s
      LEFT JOIN responses r ON r.survey_id = s.id
      GROUP BY s.id
      ORDER BY s.id DESC
    `).all();

    return rows.map((r) => ({
      ...r,
      total_responses: Number(r.total_responses || 0),
      submitted_count: Number(r.submitted_count || 0),
      in_progress_count: Number(r.in_progress_count || 0)
    }));
  }

  deleteSurvey(slug) {
    const survey = this.getSurveyBySlug(slug);
    if (!survey) return false;
    this.db.prepare('DELETE FROM surveys WHERE id = ?').run(survey.id);
    return true;
  }

  getOrCreateSession(slug, { sessionUuid, sessionId, currentStep = 1 }) {
    const survey = this.getSurveyBySlug(slug);
    if (!survey) {
      throw new Error(`Опрос "${slug}" не найден`);
    }

    const cleanUuid = sessionUuid || sessionId || crypto.randomUUID();
    const existing = this.db.prepare('SELECT * FROM responses WHERE session_uuid = ?').get(cleanUuid);

    if (existing) {
      return {
        ...existing,
        answers: JSON.parse(existing.answers)
      };
    }

    const now = new Date().toISOString();
    const insert = this.db.prepare(`
      INSERT INTO responses (
        survey_id, session_uuid, current_step, progress, status,
        answers, started_at, updated_at
      ) VALUES (?, ?, ?, 0, 'in_progress', '{}', ?, ?)
    `);

    insert.run(survey.id, cleanUuid, Number(currentStep) || 1, now, now);

    return {
      survey_id: survey.id,
      session_uuid: cleanUuid,
      current_step: Number(currentStep) || 1,
      progress: 0,
      status: 'in_progress',
      answers: {},
      started_at: now,
      updated_at: now,
      submitted_at: null
    };
  }

  recordTelemetry(slug, { sessionUuid, sessionId, currentStep, fieldId, value, answers = {}, progress, eventType = 'field_change', clientTime }) {
    const survey = this.getSurveyBySlug(slug);
    if (!survey) {
      throw new Error(`Опрос "${slug}" не найден`);
    }

    const cleanUuid = sessionUuid || sessionId;
    if (!cleanUuid) {
      throw new Error('session_uuid обязателен');
    }

    let existing = this.db.prepare('SELECT * FROM responses WHERE session_uuid = ?').get(cleanUuid);
    const now = new Date().toISOString();

    if (!existing) {
      this.getOrCreateSession(slug, { sessionUuid: cleanUuid, currentStep });
      existing = this.db.prepare('SELECT * FROM responses WHERE session_uuid = ?').get(cleanUuid);
    }

    const currentAnswers = {
      ...JSON.parse(existing.answers || '{}'),
      ...answers
    };

    if (fieldId && value !== undefined) {
      currentAnswers[fieldId] = value;
    }

    const calculatedProgress = progress !== undefined
      ? progress
      : calculateProgress(survey.questions, currentAnswers);

    const stepToSet = currentStep !== undefined ? Number(currentStep) : existing.current_step;

    const updateResponse = this.db.prepare(`
      UPDATE responses
      SET 
        answers = ?,
        current_step = ?,
        progress = ?,
        updated_at = ?
      WHERE session_uuid = ?
    `);

    updateResponse.run(
      JSON.stringify(currentAnswers),
      stepToSet,
      calculatedProgress,
      now,
      cleanUuid
    );

    // Save event to telemetry_events log
    const insertEvent = this.db.prepare(`
      INSERT INTO telemetry_events (session_uuid, field_id, field_value, event_type, client_time, server_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertEvent.run(
      cleanUuid,
      fieldId || null,
      value !== undefined ? (typeof value === 'object' ? JSON.stringify(value) : String(value)) : null,
      eventType,
      clientTime || null,
      now
    );

    const updated = this.db.prepare('SELECT * FROM responses WHERE session_uuid = ?').get(cleanUuid);
    return {
      ...updated,
      answers: JSON.parse(updated.answers)
    };
  }

  getResponseSession(slug, sessionUuid) {
    const row = this.db.prepare(`
      SELECT r.* 
      FROM responses r
      JOIN surveys s ON s.id = r.survey_id
      WHERE s.slug = ? AND r.session_uuid = ?
    `).get(slug, sessionUuid);

    if (!row) return null;

    const events = this.db.prepare(`
      SELECT * FROM telemetry_events WHERE session_uuid = ? ORDER BY id DESC LIMIT 20
    `).all(sessionUuid);

    return {
      ...row,
      answers: JSON.parse(row.answers),
      telemetry_events: events
    };
  }

  getSurveyResponses(slug) {
    const survey = this.getSurveyBySlug(slug);
    if (!survey) {
      throw new Error(`Опрос "${slug}" не найден`);
    }

    const responses = this.db.prepare(`
      SELECT * FROM responses WHERE survey_id = ? ORDER BY updated_at DESC
    `).all(survey.id);

    return responses.map((r) => {
      const events = this.db.prepare(`
        SELECT * FROM telemetry_events WHERE session_uuid = ? ORDER BY id DESC LIMIT 10
      `).all(r.session_uuid);

      return {
        ...r,
        answers: JSON.parse(r.answers),
        telemetry_events: events
      };
    });
  }

  submitSurvey(slug, { sessionUuid, sessionId, answers = {} }) {
    const survey = this.getSurveyBySlug(slug);
    if (!survey) {
      throw new Error(`Опрос "${slug}" не найден`);
    }

    const cleanUuid = sessionUuid || sessionId;
    if (!cleanUuid) {
      throw new Error('session_uuid обязателен');
    }

    const existing = this.db.prepare('SELECT * FROM responses WHERE session_uuid = ?').get(cleanUuid);
    if (!existing) {
      throw new Error('Сессия не найдена');
    }

    const currentAnswers = {
      ...JSON.parse(existing.answers || '{}'),
      ...answers
    };

    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE responses
      SET 
        answers = ?,
        current_step = ?,
        progress = 100,
        status = 'submitted',
        updated_at = ?,
        submitted_at = ?
      WHERE session_uuid = ?
    `).run(JSON.stringify(currentAnswers), survey.questions.length, now, now, cleanUuid);

    this.db.prepare(`
      INSERT INTO telemetry_events (session_uuid, field_id, field_value, event_type, server_time)
      VALUES (?, ?, ?, 'submit', ?)
    `).run(cleanUuid, null, 'SUBMITTED', now);

    const updated = this.db.prepare('SELECT * FROM responses WHERE session_uuid = ?').get(cleanUuid);
    return {
      ...updated,
      answers: JSON.parse(updated.answers)
    };
  }
}

module.exports = {
  SurveyService,
  normalizeSlug,
  calculateProgress
};
