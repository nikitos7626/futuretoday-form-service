const crypto = require('node:crypto');

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

function computeSurveyHash({ title, description = '', questions = [] }) {
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

module.exports = {
  generateSlug,
  normalizeSlug,
  normalizeString,
  normalizeQuestionsForHash,
  computeSurveyHash,
  calculateSurveyHash: computeSurveyHash,
  calculateProgress
};
