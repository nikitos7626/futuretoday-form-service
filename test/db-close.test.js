const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { initDatabase, getDatabase, closeDatabase } = require('../src/db');

const testDbPath = path.join(__dirname, 'test-close.db');

describe('Database close and cleanup tests', () => {
  afterEach(() => {
    if (typeof closeDatabase === 'function') {
      closeDatabase();
    }
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  });

  test('closeDatabase should close open connection and reset instance', () => {
    assert.equal(typeof closeDatabase, 'function', 'closeDatabase must be exported as a function');

    const db = initDatabase(testDbPath);
    assert.equal(db.open, true, 'Database should be open initially');

    closeDatabase();
    assert.equal(db.open, false, 'Database connection should be closed');

    // getDatabase() should now return null or reinitialize cleanly without errors
    const newDb = getDatabase();
    assert.equal(newDb.open, true, 'Subsequent getDatabase should reinitialize if needed');
    closeDatabase();
    assert.equal(newDb.open, false, 'New connection should close cleanly');
  });

  test('closeDatabase should be idempotent and not throw if called multiple times or when not initialized', () => {
    assert.doesNotThrow(() => {
      closeDatabase();
      closeDatabase();
    });
  });
});
