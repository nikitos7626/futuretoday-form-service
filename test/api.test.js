const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// We will use an in-memory or temp SQLite database for tests
const testDbPath = path.join(__dirname, 'test.db');

describe('Survey Feedback Service API Tests', () => {
  let app;
  let server;
  let baseUrl;
  let testSlug = 'frontend-intern';

  before(async () => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    process.env.DB_PATH = testDbPath;
    process.env.PORT = '0'; // random available port

    const createApp = require('../src/app');
    const { initDatabase, closeDatabase } = require('../src/db');
    initDatabase(testDbPath);
    app = createApp();

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    const { closeDatabase } = require('../src/db');
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  });

  test('Database tables match exact specified schema', () => {
    const { getDatabase } = require('../src/db');
    const db = getDatabase();

    const surveysCols = db.prepare("PRAGMA table_info(surveys)").all().map(c => c.name);
    assert.deepEqual(surveysCols, ['id', 'slug', 'title', 'description', 'questions', 'created_at', 'content_hash']);

    const responsesCols = db.prepare("PRAGMA table_info(responses)").all().map(c => c.name);
    assert.deepEqual(responsesCols, [
      'id',
      'survey_id',
      'session_uuid',
      'current_step',
      'progress',
      'status',
      'answers',
      'started_at',
      'updated_at',
      'submitted_at'
    ]);
  });

  test('POST /api/surveys creates a new survey with custom slug and questions', async () => {
    const payload = {
      title: 'Анкета стажера Frontend',
      description: 'Описание для соискателя позиции Frontend Intern',
      slug: testSlug,
      questions: [
        { id: 'q1', title: 'ФИО', type: 'text', required: true },
        { id: 'q2', title: 'Опыт в стеке от 1 до 5', type: 'rating', min: 1, max: 5, required: true },
        { id: 'q3', title: 'Стек технологий', type: 'multiple', options: ['React', 'Node'], required: false }
      ]
    };

    const res = await fetch(`${baseUrl}/api/surveys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.survey.slug, testSlug);
    assert.equal(data.survey.title, payload.title);
    assert.equal(data.survey.questions.length, 3);
    assert.equal(data.survey.questions[0].title, 'ФИО');
    assert.match(data.survey.url, new RegExp(`/s/${testSlug}`));
  });

  test('GET /api/surveys/:slug retrieves the survey configuration', async () => {
    const res = await fetch(`${baseUrl}/api/surveys/${testSlug}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.survey.slug, testSlug);
    assert.equal(data.survey.questions.length, 3);
    assert.equal(data.survey.questions[0].title, 'ФИО');
  });

  test('POST /api/surveys/:slug/session initializes a candidate session with session_uuid and current_step', async () => {
    const res = await fetch(`${baseUrl}/api/surveys/${testSlug}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionUuid: 'candidate-uuid-12345',
        currentStep: 1
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.session.session_uuid, 'candidate-uuid-12345');
    assert.equal(data.session.current_step, 1);
    assert.equal(data.session.status, 'in_progress');
  });

  test('POST /api/surveys/:slug/telemetry saves current_step, progress and answers after each change', async () => {
    // Step 1: answer question 1
    const telemetryPayload1 = {
      sessionUuid: 'candidate-uuid-12345',
      currentStep: 1,
      fieldId: 'q1',
      value: 'Иван',
      answers: { q1: 'Иван' },
      progress: 33,
      eventType: 'field_change'
    };

    const res1 = await fetch(`${baseUrl}/api/surveys/${testSlug}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telemetryPayload1)
    });

    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.success, true);
    assert.equal(data1.card.session_uuid, 'candidate-uuid-12345');
    assert.equal(data1.card.current_step, 1);
    assert.equal(data1.card.answers.q1, 'Иван');
    assert.equal(data1.card.progress, 33);

    // Step 2: answer question 2
    const telemetryPayload2 = {
      sessionUuid: 'candidate-uuid-12345',
      currentStep: 2,
      fieldId: 'q2',
      value: 5,
      answers: { q1: 'Иван', q2: 5 },
      progress: 67,
      eventType: 'field_change'
    };

    const res2 = await fetch(`${baseUrl}/api/surveys/${testSlug}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telemetryPayload2)
    });

    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.card.session_uuid, 'candidate-uuid-12345');
    assert.equal(data2.card.current_step, 2);
    assert.equal(data2.card.answers.q2, 5);
    assert.equal(data2.card.progress, 67);
  });

  test('GET /api/surveys/:slug/telemetry/:sessionUuid polls the live state of a candidate card', async () => {
    const res = await fetch(`${baseUrl}/api/surveys/${testSlug}/telemetry/candidate-uuid-12345`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.session_uuid, 'candidate-uuid-12345');
    assert.equal(data.current_step, 2);
    assert.equal(data.answers.q1, 'Иван');
    assert.equal(data.answers.q2, 5);
    assert.equal(data.status, 'in_progress');
    assert.equal(data.survey_slug, testSlug);
    assert.equal(data.survey_title, 'Анкета стажера Frontend');
    assert.ok(Array.isArray(data.survey_questions));
    assert.equal(data.survey_questions[0].title, 'ФИО');
  });

  test('GET /api/surveys/:slug/responses returns all response cards with survey metadata and question definitions for admin', async () => {
    const res = await fetch(`${baseUrl}/api/surveys/${testSlug}/responses`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(Array.isArray(data.responses), true);
    assert.equal(data.responses.length, 1);
    assert.equal(data.responses[0].session_uuid, 'candidate-uuid-12345');
    assert.equal(data.responses[0].current_step, 2);
    assert.equal(data.responses[0].survey_slug, testSlug);
    assert.equal(data.responses[0].survey_title, 'Анкета стажера Frontend');
    assert.ok(data.responses[0].telemetry_events.length >= 2);

    // Verify source survey reference & questions for cards
    assert.ok(data.survey);
    assert.equal(data.survey.slug, testSlug);
    assert.equal(data.survey.title, 'Анкета стажера Frontend');
    assert.match(data.survey.url, new RegExp(`/s/${testSlug}`));
    assert.ok(Array.isArray(data.survey.questions));
    assert.equal(data.survey.questions[0].title, 'ФИО');
    assert.equal(data.survey.questions[1].title, 'Опыт в стеке от 1 до 5');
  });

  test('POST /api/surveys prevents creating duplicate vacancy with identical normalized content hash', async () => {
    // Try creating duplicate with different slug but same content with spaces
    const res = await fetch(`${baseUrl}/api/surveys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '  Анкета стажера Frontend  ',
        description: 'Описание для соискателя позиции Frontend Intern   ',
        slug: 'frontend-intern-duplicate',
        questions: [
          { id: 'diff1', title: '  ФИО ', type: 'text', required: true },
          { id: 'diff2', title: 'Опыт в стеке от 1 до 5', type: 'rating', min: 1, max: 5, required: true },
          { id: 'diff3', title: 'Стек технологий', type: 'multiple', options: ['React', 'Node'], required: false }
        ]
      })
    });

    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.error, /уже существует/i);
  });

  test('PUT /api/surveys/:slug updates an existing survey successfully', async () => {
    const res = await fetch(`${baseUrl}/api/surveys/${testSlug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Анкета стажера Frontend (Updated)',
        description: 'Обновленное описание вакансии',
        questions: [
          { id: 'q1', title: 'ФИО', type: 'text', required: true },
          { id: 'q2', title: 'Опыт в стеке от 1 до 5', type: 'rating', min: 1, max: 5, required: true },
          { id: 'q3', title: 'Стек технологий', type: 'multiple', options: ['React', 'Node', 'TypeScript'], required: true }
        ]
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.survey.title, 'Анкета стажера Frontend (Updated)');
    assert.equal(data.survey.questions[2].options.length, 3);
  });

  test('PUT /api/surveys/:slug prevents editing a survey to match another vacancy content hash', async () => {
    // 1. Create a distinct second vacancy
    const resCreate = await fetch(`${baseUrl}/api/surveys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Python Backend Intern',
        slug: 'python-intern',
        questions: [{ id: 'q1', title: 'Опыт в Python', type: 'text', required: true }]
      })
    });
    assert.equal(resCreate.status, 201);

    // 2. Try to edit it to match the Frontend vacancy content hash
    const resUpdate = await fetch(`${baseUrl}/api/surveys/python-intern`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Анкета стажера Frontend (Updated)',
        description: 'Обновленное описание вакансии',
        questions: [
          { id: 'q1', title: 'ФИО', type: 'text', required: true },
          { id: 'q2', title: 'Опыт в стеке от 1 до 5', type: 'rating', min: 1, max: 5, required: true },
          { id: 'q3', title: 'Стек технологий', type: 'multiple', options: ['React', 'Node', 'TypeScript'], required: true }
        ]
      })
    });

    assert.equal(resUpdate.status, 409);
    const data = await resUpdate.json();
    assert.equal(data.success, false);
    assert.match(data.error, /уже существует/i);
  });

  test('POST /api/surveys with duplicate slug fails gracefully', async () => {
    const res = await fetch(`${baseUrl}/api/surveys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Дубликат',
        slug: testSlug,
        questions: [{ id: 'q1', title: 'Тест', type: 'text' }]
      })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.match(data.error, /уже существует/);
  });

  test('GET / redirects to /admin and serves admin HTML', async () => {
    const res = await fetch(`${baseUrl}/`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/admin');

    const adminRes = await fetch(`${baseUrl}/admin`);
    assert.equal(adminRes.status, 200);
    const html = await adminRes.text();
    assert.match(html, /Панель администратора/);
  });

  test('GET /s/:slug serves the participant survey HTML', async () => {
    const res = await fetch(`${baseUrl}/s/${testSlug}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /survey\.js/);
  });

  test('POST /api/surveys/:slug/submit finalizes candidate submission', async () => {
    const res = await fetch(`${baseUrl}/api/surveys/${testSlug}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionUuid: 'candidate-uuid-12345',
        answers: {
          q1: 'Иван',
          q2: 5,
          q3: ['React', 'Node']
        }
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.response.status, 'submitted');
    assert.equal(data.response.session_uuid, 'candidate-uuid-12345');
    assert.equal(data.response.progress, 100);
    assert.deepEqual(data.response.answers.q3, ['React', 'Node']);
    assert.ok(data.response.submitted_at);
  });
});
