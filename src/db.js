const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');
const { DB_PATH } = require('./config');

let dbInstance = null;

function initDatabase(customPath) {
  const targetPath = customPath || DB_PATH;

  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  dbInstance = new Database(targetPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  // Automatic schema migration if upgrading from legacy schema
  const existingCols = dbInstance.pragma("table_info(responses)").map(c => c.name);
  if (existingCols.length > 0 && !existingCols.includes('session_uuid')) {
    dbInstance.exec(`
      DROP TABLE IF EXISTS telemetry_events;
      DROP TABLE IF EXISTS responses;
    `);
  }

  // Schema creation matching user specification
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS surveys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      questions TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
      session_uuid TEXT UNIQUE NOT NULL,
      current_step INTEGER NOT NULL DEFAULT 1,
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'in_progress',
      answers TEXT NOT NULL DEFAULT '{}',
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS telemetry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_uuid TEXT NOT NULL REFERENCES responses(session_uuid) ON DELETE CASCADE,
      field_id TEXT DEFAULT NULL,
      field_value TEXT DEFAULT NULL,
      event_type TEXT NOT NULL,
      client_time TEXT DEFAULT NULL,
      server_time TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_surveys_slug ON surveys(slug);
    CREATE INDEX IF NOT EXISTS idx_responses_survey_id ON responses(survey_id);
    CREATE INDEX IF NOT EXISTS idx_responses_session_uuid ON responses(session_uuid);
    CREATE INDEX IF NOT EXISTS idx_telemetry_session_uuid ON telemetry_events(session_uuid);
  `);

  return dbInstance;
}

function getDatabase() {
  if (!dbInstance) {
    return initDatabase();
  }
  return dbInstance;
}

function closeDatabase() {
  if (dbInstance) {
    if (dbInstance.open) {
      dbInstance.close();
    }
    dbInstance = null;
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  closeDatabase
};
