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
  dbInstance.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  // Retain statement references so V8 GC does not finalize them during Isolate::Dispose (Node 24 bug)
  global.__sqlite_statements = global.__sqlite_statements || new Set();
  const origPrepare = dbInstance.prepare.bind(dbInstance);
  dbInstance.prepare = function(sql) {
    const stmt = origPrepare(sql);
    global.__sqlite_statements.add(stmt);
    return stmt;
  };

  // Automatic schema migration if upgrading from legacy schema
  const surveyCols = dbInstance.prepare("PRAGMA table_info(surveys)").all().map(c => c.name);
  if (surveyCols.length > 0 && !surveyCols.includes('content_hash')) {
    dbInstance.exec("ALTER TABLE surveys ADD COLUMN content_hash TEXT DEFAULT NULL;");
  }

  const responseCols = dbInstance.prepare("PRAGMA table_info(responses)").all().map(c => c.name);
  if (responseCols.length > 0 && !responseCols.includes('session_uuid')) {
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
      created_at TEXT NOT NULL,
      content_hash TEXT DEFAULT NULL
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
    CREATE INDEX IF NOT EXISTS idx_surveys_content_hash ON surveys(content_hash);
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
