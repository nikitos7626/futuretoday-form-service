const { getDatabase } = require('../db');

class SurveyModel {
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
        findSurveySlug: currentDb.prepare('SELECT id FROM surveys WHERE slug = ?'),
        findSurveyBySlug: currentDb.prepare('SELECT * FROM surveys WHERE slug = ?'),
        findSurveyById: currentDb.prepare('SELECT * FROM surveys WHERE id = ?'),
        findSurveyByHash: currentDb.prepare('SELECT slug, title FROM surveys WHERE content_hash = ?'),
        findSurveyByHashExcludingId: currentDb.prepare('SELECT slug, title FROM surveys WHERE content_hash = ? AND id != ?'),
        findSurveyByIdAndSlug: currentDb.prepare('SELECT id FROM surveys WHERE slug = ? AND id != ?'),
        insertSurvey: currentDb.prepare(`
          INSERT INTO surveys (slug, title, description, questions, created_at, content_hash)
          VALUES (?, ?, ?, ?, ?, ?)
        `),
        updateSurvey: currentDb.prepare(`
          UPDATE surveys
          SET title = ?, description = ?, questions = ?, content_hash = ?, slug = ?
          WHERE id = ?
        `),
        deleteSurvey: currentDb.prepare('DELETE FROM surveys WHERE id = ?'),
        listSurveys: currentDb.prepare(`
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
        `)
      };
    }
    return this._stmts;
  }

  findSlug(slug) {
    return this.stmts.findSurveySlug.get(slug);
  }

  findBySlug(slug) {
    const row = this.stmts.findSurveyBySlug.get(slug);
    if (!row) return null;
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

  findById(id) {
    const row = this.stmts.findSurveyById.get(id);
    if (!row) return null;
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

  findByHash(contentHash) {
    return this.stmts.findSurveyByHash.get(contentHash);
  }

  findByHashExcludingId(contentHash, excludeId) {
    return this.stmts.findSurveyByHashExcludingId.get(contentHash, excludeId);
  }

  checkSlugClash(slug, excludeId) {
    return this.stmts.findSurveyByIdAndSlug.get(slug, excludeId);
  }

  create({ slug, title, description = '', questions = [], createdAt, contentHash }) {
    const result = this.stmts.insertSurvey.run(
      slug,
      title.trim(),
      (description || '').trim(),
      JSON.stringify(questions),
      createdAt,
      contentHash
    );

    return {
      id: result.lastInsertRowid,
      slug,
      title: title.trim(),
      description: (description || '').trim(),
      questions,
      created_at: createdAt,
      content_hash: contentHash
    };
  }

  update(id, { title, description = '', questions, contentHash, slug }) {
    this.stmts.updateSurvey.run(
      title.trim(),
      (description || '').trim(),
      JSON.stringify(questions),
      contentHash,
      slug,
      id
    );

    return this.findById(id);
  }

  delete(id) {
    const result = this.stmts.deleteSurvey.run(id);
    return result.changes > 0;
  }

  list() {
    const rows = this.stmts.listSurveys.all();
    return rows.map((r) => ({
      ...r,
      total_responses: Number(r.total_responses || 0),
      submitted_count: Number(r.submitted_count || 0),
      in_progress_count: Number(r.in_progress_count || 0)
    }));
  }
}

module.exports = new SurveyModel();
module.exports.SurveyModel = SurveyModel;
