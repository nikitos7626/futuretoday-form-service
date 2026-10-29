const surveyModel = require('../models/surveyModel');
const { normalizeSlug, computeSurveyHash } = require('../utils/hash');

function formatQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.map((q, idx) => ({
    id: q.id || `q${idx + 1}`,
    title: q.title || q.label || `Вопрос ${idx + 1}`,
    type: q.type || 'text',
    options: Array.isArray(q.options)
      ? q.options.map(opt => typeof opt === 'string' ? opt.trim() : String(opt)).filter(Boolean)
      : [],
    required: Boolean(q.required),
    min: q.min ?? (q.type === 'rating' ? 1 : undefined),
    max: q.max ?? (q.type === 'rating' ? 5 : undefined)
  }));
}

class SurveyController {
  createSurvey(req, res) {
    try {
      const { title, description = '', slug, questions = [] } = req.body || {};

      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ success: false, error: 'Название анкеты обязательно' });
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ success: false, error: 'Анкета должна содержать хотя бы один вопрос' });
      }

      const cleanSlug = normalizeSlug(slug);
      const existingSlug = surveyModel.findSlug(cleanSlug);
      if (existingSlug) {
        return res.status(400).json({
          success: false,
          error: `Ссылка со slug "${cleanSlug}" уже существует. Пожалуйста, выберите другой slug.`
        });
      }

      const formattedQuestions = formatQuestions(questions);
      const contentHash = computeSurveyHash({
        title,
        description,
        questions: formattedQuestions
      });

      const duplicate = surveyModel.findByHash(contentHash);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          error: `Вакансия с идентичными данными уже существует (URL: /s/${duplicate.slug})`,
          code: 'DUPLICATE_CONTENT'
        });
      }

      const createdAt = new Date().toISOString();
      const created = surveyModel.create({
        slug: cleanSlug,
        title,
        description,
        questions: formattedQuestions,
        createdAt,
        contentHash
      });

      const host = req.get('host');
      const protocol = req.protocol;
      const shareUrl = `${protocol}://${host}/s/${created.slug}`;

      return res.status(201).json({
        success: true,
        survey: {
          ...created,
          url: shareUrl
        }
      });
    } catch (err) {
      const status = err.statusCode || 400;
      return res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  getSurvey(req, res) {
    try {
      const survey = surveyModel.findBySlug(req.params.slug);
      if (!survey) {
        return res.status(404).json({ success: false, error: 'Опрос не найден' });
      }

      const host = req.get('host');
      const protocol = req.protocol;
      return res.json({
        success: true,
        survey: {
          ...survey,
          url: `${protocol}://${host}/s/${survey.slug}`
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  updateSurvey(req, res) {
    try {
      const { slug } = req.params;
      const { title, description, questions, slug: newSlug } = req.body || {};

      const existing = surveyModel.findBySlug(slug);
      if (!existing) {
        return res.status(404).json({ success: false, error: `Опрос "${slug}" не найден` });
      }

      const updatedTitle = title !== undefined ? title : existing.title;
      const updatedDesc = description !== undefined ? description : existing.description;
      const updatedQuestionsRaw = questions !== undefined ? questions : existing.questions;

      if (!updatedTitle || typeof updatedTitle !== 'string' || !updatedTitle.trim()) {
        return res.status(400).json({ success: false, error: 'Название анкеты обязательно' });
      }
      if (!Array.isArray(updatedQuestionsRaw) || updatedQuestionsRaw.length === 0) {
        return res.status(400).json({ success: false, error: 'Анкета должна содержать хотя бы один вопрос' });
      }

      const formattedQuestions = formatQuestions(updatedQuestionsRaw);
      const contentHash = computeSurveyHash({
        title: updatedTitle,
        description: updatedDesc,
        questions: formattedQuestions
      });

      const duplicate = surveyModel.findByHashExcludingId(contentHash, existing.id);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          error: `Вакансия с идентичными данными уже существует (URL: /s/${duplicate.slug})`,
          code: 'DUPLICATE_CONTENT'
        });
      }

      let targetSlug = existing.slug;
      if (newSlug && newSlug.trim() && normalizeSlug(newSlug) !== existing.slug) {
        targetSlug = normalizeSlug(newSlug);
        const slugClash = surveyModel.checkSlugClash(targetSlug, existing.id);
        if (slugClash) {
          return res.status(400).json({
            success: false,
            error: `Ссылка со slug "${targetSlug}" уже существует. Пожалуйста, выберите другой slug.`
          });
        }
      }

      const updated = surveyModel.update(existing.id, {
        title: updatedTitle,
        description: updatedDesc,
        questions: formattedQuestions,
        contentHash,
        slug: targetSlug
      });

      const host = req.get('host');
      const protocol = req.protocol;
      const shareUrl = `${protocol}://${host}/s/${updated.slug}`;

      return res.status(200).json({
        success: true,
        survey: {
          ...updated,
          url: shareUrl
        }
      });
    } catch (err) {
      const status = err.statusCode || (err.message.includes('не найден') ? 404 : 400);
      return res.status(status).json({ success: false, error: err.message, code: err.code });
    }
  }

  listSurveys(req, res) {
    try {
      const list = surveyModel.list();
      const host = req.get('host');
      const protocol = req.protocol;
      const enriched = list.map((s) => ({
        ...s,
        url: `${protocol}://${host}/s/${s.slug}`
      }));
      return res.json({ success: true, surveys: enriched });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  deleteSurvey(req, res) {
    try {
      const survey = surveyModel.findBySlug(req.params.slug);
      if (!survey) {
        return res.status(404).json({ success: false, error: 'Опрос не найден' });
      }

      surveyModel.delete(survey.id);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}

const controller = new SurveyController();
module.exports = {
  createSurvey: controller.createSurvey.bind(controller),
  getSurvey: controller.getSurvey.bind(controller),
  updateSurvey: controller.updateSurvey.bind(controller),
  listSurveys: controller.listSurveys.bind(controller),
  deleteSurvey: controller.deleteSurvey.bind(controller),
  SurveyController
};
