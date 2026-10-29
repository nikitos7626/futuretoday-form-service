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
  let testSlug = 'product-feedback-2026';

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

  test('POST /api/surveys creates a new survey with custom slug and questions', async () => {
    const payload = {
      title: 'Опрос удовлетворенности продуктом',
      description: 'Пожалуйста, поделитесь вашим мнением',
      slug: testSlug,
      questions: [
        { id: 'q1', label: 'Ваше имя', type: 'text', required: true },
        { id: 'q2', label: 'Оцените удобство сервиса от 1 до 5', type: 'rating', min: 1, max: 5, required: true },
        { id: 'q3', label: 'Что нам улучшить?', type: 'textarea', required: false }
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
    assert.match(data.survey.url, new RegExp(`/s/${testSlug}`));
  });

  test('GET /api/surveys/:slug retrieves the survey configuration', async () => {
    const res = await fetch(`${baseUrl}/api/surveys/${testSlug}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.survey.slug, testSlug);
    assert.equal(data.survey.questions.length, 3);
  });

  test('POST /api/surveys/:slug/session initializes a participant card/session', async () => {
    const res = await fetch(`${baseUrl}/api/surveys/${testSlug}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-user-123',
        participantName: 'Алексей'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.session.session_id, 'session-user-123');
    assert.equal(data.session.participant_name, 'Алексей');
    assert.equal(data.session.status, 'in_progress');
  });

  test('POST /api/surveys/:slug/telemetry saves current progress after each change', async () => {
    // Participant changes question 1
    const telemetryPayload1 = {
      sessionId: 'session-user-123',
      fieldId: 'q1',
      value: 'Алексей Смирнов',
      answers: { q1: 'Алексей Смирнов' },
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
    assert.equal(data1.card.answers.q1, 'Алексей Смирнов');
    assert.equal(data1.card.change_count, 1);
    assert.equal(data1.card.last_changed_field, 'q1');

    // Participant changes question 2
    const telemetryPayload2 = {
      sessionId: 'session-user-123',
      fieldId: 'q2',
      value: 5,
      answers: { q1: 'Алексей Смирнов', q2: 5 },
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
    assert.equal(data2.card.answers.q2, 5);
    assert.equal(data2.card.change_count, 2);
    assert.equal(data2.card.progress, 67);
  });

  test('GET /api/surveys/:slug/telemetry/:sessionId polls the live state of a card', async () => {
    const res = await fetch(`${baseUrl}/api/surveys/${testSlug}/telemetry/session-user-123`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.session_id, 'session-user-123');
    assert.equal(data.answers.q1, 'Алексей Смирнов');
    assert.equal(data.answers.q2, 5);
    assert.equal(data.change_count, 2);
    assert.equal(data.status, 'in_progress');
  });

  test('GET /api/surveys/:slug/responses returns all response cards with telemetry for admin', async () => {
    const res = await fetch(`${baseUrl}/api/surveys/${testSlug}/responses`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(Array.isArray(data.responses), true);
    assert.equal(data.responses.length, 1);
    assert.equal(data.responses[0].session_id, 'session-user-123');
    assert.equal(data.responses[0].change_count, 2);
    assert.ok(data.responses[0].telemetry_events.length >= 2);
  });

  test('POST /api/surveys with duplicate slug fails gracefully', async () => {
    const res = await fetch(`${baseUrl}/api/surveys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Дубликат',
        slug: testSlug,
        questions: [{ id: 'q1', label: 'Тест', type: 'text' }]
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

  test('POST /api/surveys/:slug/submit finalizes the submission', async () => {
    const res = await fetch(`${baseUrl}/api/surveys/${testSlug}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-user-123',
        answers: {
          q1: 'Алексей Смирнов',
          q2: 5,
          q3: 'Всё отлично, спасибо!'
        }
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.response.status, 'submitted');
    assert.equal(data.response.progress, 100);
    assert.ok(data.response.submitted_at);
  });
});
