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

function normalizeString(str) {
  if (!str) return '';
  return str.toString().trim().replace(/\s+/g, ' ');
}

function normalizeQuestionsForHash(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.map(q => ({
    title: normalizeString(q.title || q.label),
    type: normalizeString(q.type || 'text').toLowerCase(),
    options: Array.isArray(q.options)
      ? q.options.map(opt => normalizeString(opt)).filter(Boolean)
      : [],
    required: Boolean(q.required),
    min: q.min !== undefined && q.min !== null ? Number(q.min) : undefined,
    max: q.max !== undefined && q.max !== null ? Number(q.max) : undefined
  }));
}

function calculateSurveyHash({ title, description = '', questions = [] }) {
  const normalized = {
    title: normalizeString(title),
    description: normalizeString(description),
    questions: normalizeQuestionsForHash(questions)
  };
  const canonicalJson = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(canonicalJson).digest('hex');
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
    this._stmts = null;
    this._stmtsDb = null;
    if (this._db) {
      this._initStatements(this._db);
    }
  }

  get db() {
    return this._db || getDatabase();
  }

  get stmts() {
    const currentDb = this.db;
    if (!this._stmts || this._stmtsDb !== currentDb) {
      this._initStatements(currentDb);
    }
    return this._stmts;
  }

  _initStatements(db) {
    this._stmtsDb = db;
    this._stmts = {
      findSurveySlug: db.prepare('SELECT id FROM surveys WHERE slug = ?'),
      findSurveyByHash: db.prepare('SELECT slug, title FROM surveys WHERE content_hash = ?'),
      findSurveyByHashExcludingId: db.prepare('SELECT slug, title FROM surveys WHERE content_hash = ? AND id != ?'),
      findSurveyByIdAndSlug: db.prepare('SELECT id FROM surveys WHERE slug = ? AND id != ?'),
      insertSurvey: db.prepare(`
        INSERT INTO surveys (slug, title, description, questions, created_at, content_hash)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      getSurveyBySlug: db.prepare('SELECT * FROM surveys WHERE slug = ?'),
      updateSurvey: db.prepare(`
        UPDATE surveys
        SET title = ?, description = ?, questions = ?, content_hash = ?, slug = ?
        WHERE id = ?
      `),
      listSurveys: db.prepare(`
        SELECT 
          s.id,
          s.slug,
          s.title,
          s.description,
          s.created_at,
          s.content_hash,
          COUNT(r.id) as total_responses,
          SUM(CASE WHEN r.status = 'submitted' THEN 1 ELSE 0 END) as submitted_count,
          SUM(CASE WHEN r.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
          MAX(r.updated_at) as last_activity
        FROM surveys s
        LEFT JOIN responses r ON r.survey_id = s.id
        GROUP BY s.id
        ORDER BY s.id DESC
      `),
      deleteSurvey: db.prepare('DELETE FROM surveys WHERE id = ?'),
      findResponseByUuid: db.prepare('SELECT * FROM responses WHERE session_uuid = ?'),
      insertResponse: db.prepare(`
        INSERT INTO responses (
          survey_id, session_uuid, current_step, progress, status,
          answers, started_at, updated_at
        ) VALUES (?, ?, ?, 0, 'in_progress', '{}', ?, ?)
      `),
      updateResponseTelemetry: db.prepare(`
        UPDATE responses
        SET 
          answers = ?,
          current_step = ?,
          progress = ?,
          updated_at = ?
        WHERE session_uuid = ?
      `),
      insertTelemetryEvent: db.prepare(`
        INSERT INTO telemetry_events (session_uuid, field_id, field_value, event_type, client_time, server_time)
        VALUES (?, ?, ?, ?, ?, ?)
      `),
      getResponseSession: db.prepare(`
        SELECT r.* 
        FROM responses r
        WHERE r.survey_id = ? AND r.session_uuid = ?
      `),
      getTelemetryEventsRecent20: db.prepare(`
        SELECT * FROM telemetry_events WHERE session_uuid = ? ORDER BY id DESC LIMIT 20
      `),
      getTelemetryEventsRecent10: db.prepare(`
        SELECT * FROM telemetry_events WHERE session_uuid = ? ORDER BY id DESC LIMIT 10
      `),
      getResponsesBySurveyId: db.prepare(`
        SELECT * FROM responses WHERE survey_id = ? ORDER BY updated_at DESC
      `),
      submitResponse: db.prepare(`
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
      insertSubmitEvent: db.prepare(`
        INSERT INTO telemetry_events (session_uuid, field_id, field_value, event_type, server_time)
        VALUES (?, ?, ?, 'submit', ?)
      `)
    };
    return this._stmts;
  }

  createSurvey({ title, description = '', slug, questions = [] }) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new Error('Название анкеты обязательно');
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Анкета должна содержать хотя бы один вопрос');
    }

    const cleanSlug = normalizeSlug(slug);
    const existingSlug = this.stmts.findSurveySlug.get(cleanSlug);
    if (existingSlug) {
      throw new Error(`Ссылка со slug "${cleanSlug}" уже существует. Пожалуйста, выберите другой slug.`);
    }

    // Hash check for identical vacancy/survey content
    const contentHash = calculateSurveyHash({ title, description, questions });
    const duplicate = this.stmts.findSurveyByHash.get(contentHash);
    if (duplicate) {
      const err = new Error(`Вакансия с идентичными данными уже существует (URL: /s/${duplicate.slug})`);
      err.statusCode = 409;
      err.code = 'DUPLICATE_CONTENT';
      throw err;
    }

    // Format questions array: [{ id: "q1", title: "ФИО", type: "text" }, ...]
    const formattedQuestions = questions.map((q, idx) => ({
      id: q.id || `q${idx + 1}`,
      title: q.title || q.label || `Вопрос ${idx + 1}`,
      type: q.type || 'text',
      options: Array.isArray(q.options) ? q.options.map(opt => typeof opt === 'string' ? opt.trim() : String(opt)).filter(Boolean) : [],
      required: Boolean(q.required),
      min: q.min ?? (q.type === 'rating' ? 1 : undefined),
      max: q.max ?? (q.type === 'rating' ? 5 : undefined)
    }));

    const createdAt = new Date().toISOString();
    const result = this.stmts.insertSurvey.run(
      cleanSlug,
      title.trim(),
      (description || '').trim(),
      JSON.stringify(formattedQuestions),
      createdAt,
      contentHash
    );

    return {
      id: result.lastInsertRowid,
      slug: cleanSlug,
      title: title.trim(),
      description: (description || '').trim(),
      questions: formattedQuestions,
      created_at: createdAt,
      content_hash: contentHash
    };
  }

  updateSurvey(slug, { title, description = '', questions, newSlug }) {
    const existing = this.stmts.getSurveyBySlug.get(slug);
    if (!existing) {
      const err = new Error(`Опрос "${slug}" не найден`);
      err.statusCode = 404;
      throw err;
    }

    const updatedTitle = title !== undefined ? title : existing.title;
    const updatedDesc = description !== undefined ? description : existing.description;
    const updatedQuestionsRaw = questions !== undefined ? questions : JSON.parse(existing.questions);

    if (!updatedTitle || typeof updatedTitle !== 'string' || !updatedTitle.trim()) {
      throw new Error('Название анкеты обязательно');
    }
    if (!Array.isArray(updatedQuestionsRaw) || updatedQuestionsRaw.length === 0) {
      throw new Error('Анкета должна содержать хотя бы один вопрос');
    }

    // Format questions
    const formattedQuestions = updatedQuestionsRaw.map((q, idx) => ({
      id: q.id || `q${idx + 1}`,
      title: q.title || q.label || `Вопрос ${idx + 1}`,
      type: q.type || 'text',
      options: Array.isArray(q.options) ? q.options.map(opt => typeof opt === 'string' ? opt.trim() : String(opt)).filter(Boolean) : [],
      required: Boolean(q.required),
      min: q.min ?? (q.type === 'rating' ? 1 : undefined),
      max: q.max ?? (q.type === 'rating' ? 5 : undefined)
    }));

    // Content hash check (excluding this survey id)
    const contentHash = calculateSurveyHash({
      title: updatedTitle,
      description: updatedDesc,
      questions: formattedQuestions
    });

    const duplicate = this.stmts.findSurveyByHashExcludingId.get(contentHash, existing.id);
    if (duplicate) {
      const err = new Error(`Вакансия с идентичными данными уже существует (URL: /s/${duplicate.slug})`);
      err.statusCode = 409;
      err.code = 'DUPLICATE_CONTENT';
      throw err;
    }

    // Target slug
    let targetSlug = existing.slug;
    if (newSlug && newSlug.trim() && normalizeSlug(newSlug) !== existing.slug) {
      targetSlug = normalizeSlug(newSlug);
      const slugClash = this.stmts.findSurveyByIdAndSlug.get(targetSlug, existing.id);
      if (slugClash) {
        throw new Error(`Ссылка со slug "${targetSlug}" уже существует. Пожалуйста, выберите другой slug.`);
      }
    }

    this.stmts.updateSurvey.run(
      updatedTitle.trim(),
      (updatedDesc || '').trim(),
      JSON.stringify(formattedQuestions),
      contentHash,
      targetSlug,
      existing.id
    );

    return {
      id: existing.id,
      slug: targetSlug,
      title: updatedTitle.trim(),
      description: (updatedDesc || '').trim(),
      questions: formattedQuestions,
      created_at: existing.created_at,
      content_hash: contentHash
    };
  }

  getSurveyBySlug(slug) {
    const row = this.stmts.getSurveyBySlug.get(slug);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      questions: JSON.parse(row.questions),
      created_at: row.created_at,
      content_hash: row.content_hash
    };
  }

  listSurveys() {
    const rows = this.stmts.listSurveys.all();
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
    this.stmts.deleteSurvey.run(survey.id);
    return true;
  }

  getOrCreateSession(slug, { sessionUuid, sessionId, currentStep = 1 }) {
    const survey = this.getSurveyBySlug(slug);
    if (!survey) {
      throw new Error(`Опрос "${slug}" не найден`);
    }

    const cleanUuid = sessionUuid || sessionId || crypto.randomUUID();
    const existing = this.stmts.findResponseByUuid.get(cleanUuid);

    if (existing) {
      return {
        ...existing,
        answers: JSON.parse(existing.answers)
      };
    }

    const now = new Date().toISOString();
    this.stmts.insertResponse.run(survey.id, cleanUuid, Number(currentStep) || 1, now, now);

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

    let existing = this.stmts.findResponseByUuid.get(cleanUuid);
    const now = new Date().toISOString();

    if (!existing) {
      this.getOrCreateSession(slug, { sessionUuid: cleanUuid, currentStep });
      existing = this.stmts.findResponseByUuid.get(cleanUuid);
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

    this.stmts.updateResponseTelemetry.run(
      JSON.stringify(currentAnswers),
      stepToSet,
      calculatedProgress,
      now,
      cleanUuid
    );

    // Save event to telemetry_events log
    this.stmts.insertTelemetryEvent.run(
      cleanUuid,
      fieldId || null,
      value !== undefined ? (typeof value === 'object' ? JSON.stringify(value) : String(value)) : null,
      eventType,
      clientTime || null,
      now
    );

    const updated = this.stmts.findResponseByUuid.get(cleanUuid);
    return {
      ...updated,
      answers: JSON.parse(updated.answers)
    };
  }

  getResponseSession(slug, sessionUuid) {
    const survey = this.getSurveyBySlug(slug);
    if (!survey) return null;

    const row = this.stmts.getResponseSession.get(survey.id, sessionUuid);
    if (!row) return null;

    const events = this.stmts.getTelemetryEventsRecent20.all(sessionUuid);

    return {
      ...row,
      survey_id: survey.id,
      survey_slug: survey.slug,
      survey_title: survey.title,
      survey_questions: survey.questions,
      answers: JSON.parse(row.answers),
      telemetry_events: events
    };
  }

  getSurveyResponses(slug) {
    const survey = this.getSurveyBySlug(slug);
    if (!survey) {
      throw new Error(`Опрос "${slug}" не найден`);
    }

    const rows = this.stmts.getResponsesBySurveyId.all(survey.id);
    const responses = rows.map((r) => {
      const events = this.stmts.getTelemetryEventsRecent10.all(r.session_uuid);
      return {
        ...r,
        survey_id: survey.id,
        survey_slug: survey.slug,
        survey_title: survey.title,
        answers: JSON.parse(r.answers),
        telemetry_events: events
      };
    });

    return {
      survey,
      responses
    };
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

    const existing = this.stmts.findResponseByUuid.get(cleanUuid);
    if (!existing) {
      throw new Error('Сессия не найдена');
    }

    const currentAnswers = {
      ...JSON.parse(existing.answers || '{}'),
      ...answers
    };

    const now = new Date().toISOString();
    this.stmts.submitResponse.run(
      JSON.stringify(currentAnswers),
      survey.questions.length,
      now,
      now,
      cleanUuid
    );

    this.stmts.insertSubmitEvent.run(cleanUuid, null, 'SUBMITTED', now);

    const updated = this.stmts.findResponseByUuid.get(cleanUuid);
    return {
      ...updated,
      answers: JSON.parse(updated.answers)
    };
  }
}

module.exports = {
  SurveyService,
  normalizeSlug,
  normalizeString,
  calculateSurveyHash,
  calculateProgress
};
