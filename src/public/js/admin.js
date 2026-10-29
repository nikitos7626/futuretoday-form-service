// Admin Panel Logic (Cobalt Theme)
let activeTelemetrySlug = null;
let telemetryInterval = null;
let questions = [];
let editingSlug = null;

const slugPrefixEl = document.getElementById('slugPrefix');
const surveySlugInput = document.getElementById('surveySlug');
const questionsContainer = document.getElementById('questionsContainer');
const surveysTableBody = document.getElementById('surveysTableBody');
const telemetrySection = document.getElementById('telemetrySection');
const telemetrySurveyTitle = document.getElementById('telemetrySurveyTitle');
const cardsContainer = document.getElementById('cardsContainer');
const autoPollToggle = document.getElementById('autoPollToggle');
const btnPollNow = document.getElementById('btnPollNow');
const formPanelTitle = document.getElementById('formPanelTitle');
const surveyFormPanel = document.getElementById('surveyFormPanel');
const btnCancelEdit = document.getElementById('btnCancelEdit');
const btnSubmitSurvey = document.getElementById('btnSubmitSurvey');

// SVG Icons
const ICON_TRASH = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const ICON_COPY = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_EXTERNAL = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
const ICON_EDIT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

// Initialize URL prefix
if (slugPrefixEl) {
  slugPrefixEl.textContent = `${window.location.origin}/s/`;
}

function getRandomSlug() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'survey-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

document.getElementById('btnGenSlug').addEventListener('click', () => {
  surveySlugInput.value = getRandomSlug();
});

// Dynamic Question Management
function renderQuestions() {
  questionsContainer.innerHTML = '';
  if (questions.length === 0) {
    questionsContainer.innerHTML = `
      <div style="padding: 20px; border: 1px dashed var(--color-rule-2); border-radius: var(--radius-input); text-align: center; color: var(--color-muted); font-size: 14px;">
        Вопросы еще не добавлены. Нажмите "+ Добавить вопрос" выше.
      </div>
    `;
    return;
  }

  questions.forEach((q, index) => {
    const item = document.createElement('div');
    item.className = 'question-item';
    item.innerHTML = `
      <div class="question-header">
        <span class="question-number">Вопрос №${index + 1}</span>
        <button type="button" class="btn btn-danger btn-sm" onclick="removeQuestion(${index})">
          ${ICON_TRASH} Удалить
        </button>
      </div>
      <div class="question-row">
        <div class="form-group" style="margin-bottom: 8px;">
          <label>Текст вопроса <span class="required">*</span></label>
          <input type="text" value="${escapeHtml(q.title || q.label)}" oninput="updateQuestion(${index}, 'title', this.value)" placeholder="Например: ФИО или стек технологий" required>
        </div>
        <div class="form-group" style="margin-bottom: 8px;">
          <label>Тип ответа</label>
          <select onchange="updateQuestion(${index}, 'type', this.value)">
            <option value="text" ${q.type === 'text' ? 'selected' : ''}>Короткий текст</option>
            <option value="textarea" ${q.type === 'textarea' ? 'selected' : ''}>Развернутый ответ</option>
            <option value="rating" ${q.type === 'rating' ? 'selected' : ''}>Оценка (1-5)</option>
            <option value="number" ${q.type === 'number' ? 'selected' : ''}>Число</option>
            <option value="single" ${q.type === 'single' ? 'selected' : ''}>Один из списка (Radio)</option>
            <option value="multiple" ${q.type === 'multiple' ? 'selected' : ''}>Несколько из списка (Checkbox)</option>
          </select>
        </div>
      </div>
      ${(q.type === 'single' || q.type === 'multiple') ? `
        <div class="form-group" style="margin-top: 8px;">
          <label>Варианты ответа (через запятую)</label>
          <input type="text" value="${escapeHtml((q.options || []).join(', '))}" oninput="updateQuestionOptions(${index}, this.value)" placeholder="React, Node, TypeScript">
        </div>
      ` : ''}
      <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
        <label style="margin: 0; font-size: 13px; display: flex; align-items: center; gap: 6px; cursor: pointer;">
          <input type="checkbox" ${q.required ? 'checked' : ''} onchange="updateQuestion(${index}, 'required', this.checked)">
          Обязательный вопрос
        </label>
      </div>
    `;
    questionsContainer.appendChild(item);
  });
}

function addQuestion(defaultType = 'text', defaultTitle = '') {
  questions.push({
    id: `q${questions.length + 1}`,
    title: defaultTitle || `Вопрос ${questions.length + 1}`,
    label: defaultTitle || `Вопрос ${questions.length + 1}`,
    type: defaultType,
    required: true,
    options: defaultType === 'single' || defaultType === 'multiple' ? ['Вариант A', 'Вариант B'] : []
  });
  renderQuestions();
}

window.removeQuestion = function(index) {
  questions.splice(index, 1);
  renderQuestions();
};

window.updateQuestion = function(index, field, value) {
  questions[index][field] = value;
  if (field === 'title') {
    questions[index].label = value;
  }
  if (field === 'type' && (value === 'single' || value === 'multiple') && (!questions[index].options || questions[index].options.length === 0)) {
    questions[index].options = ['Вариант 1', 'Вариант 2'];
    renderQuestions();
  } else if (field === 'type') {
    renderQuestions();
  }
};

window.updateQuestionOptions = function(index, strValue) {
  questions[index].options = strValue.split(',').map(s => s.trim()).filter(Boolean);
};

document.getElementById('btnAddQuestion').addEventListener('click', () => {
  addQuestion('text');
});

function initDefaultQuestions() {
  questions = [];
  addQuestion('text', 'ФИО');
  addQuestion('rating', 'Опыт работы (1-5)');
  addQuestion('textarea', 'Расскажите о ваших проектах');
}

initDefaultQuestions();

function resetSurveyForm() {
  editingSlug = null;
  formPanelTitle.textContent = 'Создать новый опрос';
  btnSubmitSurvey.textContent = 'Создать опрос и сгенерировать ссылку';
  btnCancelEdit.style.display = 'none';
  document.getElementById('surveyTitle').value = '';
  document.getElementById('surveyDesc').value = '';
  surveySlugInput.value = '';
  initDefaultQuestions();
}

btnCancelEdit.addEventListener('click', resetSurveyForm);

// Form submission to create or update survey
document.getElementById('createSurveyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('surveyTitle').value.trim();
  const description = document.getElementById('surveyDesc').value.trim();
  let slug = surveySlugInput.value.trim();

  if (questions.length === 0) {
    alert('Пожалуйста, добавьте хотя бы один вопрос в анкету.');
    return;
  }

  btnSubmitSurvey.disabled = true;
  btnSubmitSurvey.textContent = editingSlug ? 'Сохранение изменений…' : 'Создание…';

  try {
    const isEdit = Boolean(editingSlug);
    const url = isEdit ? `/api/surveys/${editingSlug}` : '/api/surveys';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        slug: slug || undefined,
        questions
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Ошибка при сохранении анкеты');
    }

    if (isEdit) {
      alert(`Анкета успешно обновлена!\nСсылка: ${data.survey.url}`);
      const updatedSlug = data.survey.slug;
      if (activeTelemetrySlug === editingSlug) {
        openTelemetry(updatedSlug, data.survey.title);
      }
    } else {
      alert(`Анкета успешно создана!\nСсылка для соискателей:\n${data.survey.url}`);
      openTelemetry(data.survey.slug, data.survey.title);
    }

    resetSurveyForm();
    await loadSurveys();
  } catch (err) {
    alert(`Ошибка: ${err.message}`);
  } finally {
    btnSubmitSurvey.disabled = false;
    btnSubmitSurvey.textContent = editingSlug ? 'Сохранить изменения' : 'Создать опрос и сгенерировать ссылку';
  }
});

// Edit existing survey
window.editSurvey = async function(slug) {
  try {
    const res = await fetch(`/api/surveys/${slug}`);
    if (!res.ok) throw new Error('Не удалось загрузить данные опроса');
    const data = await res.json();
    const survey = data.survey;

    editingSlug = slug;
    formPanelTitle.textContent = `Редактирование анкеты: ${survey.title}`;
    btnSubmitSurvey.textContent = 'Сохранить изменения';
    btnCancelEdit.style.display = 'inline-flex';

    document.getElementById('surveyTitle').value = survey.title || '';
    document.getElementById('surveyDesc').value = survey.description || '';
    surveySlugInput.value = survey.slug || '';

    questions = (survey.questions || []).map((q, idx) => ({
      id: q.id || `q${idx + 1}`,
      title: q.title || q.label || `Вопрос ${idx + 1}`,
      label: q.title || q.label || `Вопрос ${idx + 1}`,
      type: q.type || 'text',
      required: Boolean(q.required),
      options: Array.isArray(q.options) ? [...q.options] : [],
      min: q.min,
      max: q.max
    }));

    renderQuestions();
    surveyFormPanel.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert(`Ошибка: ${err.message}`);
  }
};

// Load surveys list
async function loadSurveys() {
  try {
    const res = await fetch('/api/surveys');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const surveys = data.surveys;
    if (surveys.length === 0) {
      surveysTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--color-muted); padding: 24px;">
            Анкеты еще не созданы. Создайте первую анкету в форме выше.
          </td>
        </tr>
      `;
      return;
    }

    surveysTableBody.innerHTML = surveys.map(s => `
      <tr>
        <td>
          <strong style="color: var(--color-ink);">${escapeHtml(s.title)}</strong>
          ${s.description ? `<div style="font-size: 12px; color: var(--color-muted);">${escapeHtml(s.description)}</div>` : ''}
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <code>${escapeHtml(s.url)}</code>
            <button class="btn btn-secondary btn-sm" onclick="copyLink('${escapeHtml(s.url)}')">
              ${ICON_COPY} Копировать
            </button>
          </div>
        </td>
        <td>
          <div>Всего: <strong class="num">${s.total_responses}</strong></div>
          <div style="font-size: 12px; color: var(--color-muted);">
            Завершено: <span class="num">${s.submitted_count}</span> · В процессе: <span class="num">${s.in_progress_count}</span>
          </div>
        </td>
        <td>
          <span class="badge ${s.total_responses > 0 ? 'badge-success' : 'badge-info'}">
            ${s.total_responses > 0 ? 'Есть отклики' : 'Ожидает ответов'}
          </span>
        </td>
        <td>
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <a href="${s.url}" target="_blank" class="btn btn-secondary btn-sm">${ICON_EXTERNAL} Открыть</a>
            <button class="btn btn-secondary btn-sm" onclick="editSurvey('${s.slug}')">${ICON_EDIT} Изменить</button>
            <button class="btn btn-primary btn-sm" onclick="openTelemetry('${s.slug}', '${escapeHtml(s.title)}')">Телеметрия</button>
            <button class="btn btn-danger btn-sm" onclick="deleteSurvey('${s.slug}')" aria-label="Удалить">${ICON_TRASH}</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    surveysTableBody.innerHTML = `
      <tr><td colspan="5" style="color: var(--color-danger); text-align: center;">Ошибка загрузки: ${err.message}</td></tr>
    `;
  }
}

document.getElementById('btnRefreshSurveys').addEventListener('click', loadSurveys);

window.copyLink = function(url) {
  navigator.clipboard.writeText(url).then(() => {
    alert(`Ссылка скопирована в буфер обмена:\n${url}`);
  }).catch(() => {
    prompt('Скопируйте ссылку вручную:', url);
  });
};

window.deleteSurvey = async function(slug) {
  if (!confirm(`Удалить анкету "${slug}" и все связанные с ней отклики?`)) return;
  try {
    const res = await fetch(`/api/surveys/${slug}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Ошибка удаления');
    if (activeTelemetrySlug === slug) {
      closeTelemetry();
    }
    if (editingSlug === slug) {
      resetSurveyForm();
    }
    loadSurveys();
  } catch (err) {
    alert(err.message);
  }
};

// Telemetry Real-time Polling
window.openTelemetry = function(slug, title) {
  activeTelemetrySlug = slug;
  telemetrySurveyTitle.textContent = title || slug;
  telemetrySection.style.display = 'block';
  telemetrySection.scrollIntoView({ behavior: 'smooth' });

  pollResponses();
  startTelemetryPolling();
};

function closeTelemetry() {
  activeTelemetrySlug = null;
  telemetrySection.style.display = 'none';
  if (telemetryInterval) {
    clearInterval(telemetryInterval);
    telemetryInterval = null;
  }
}

function startTelemetryPolling() {
  if (telemetryInterval) clearInterval(telemetryInterval);
  if (autoPollToggle.checked) {
    telemetryInterval = setInterval(pollResponses, 2000);
  }
}

autoPollToggle.addEventListener('change', () => {
  if (autoPollToggle.checked) {
    startTelemetryPolling();
  } else if (telemetryInterval) {
    clearInterval(telemetryInterval);
    telemetryInterval = null;
  }
});

btnPollNow.addEventListener('click', () => {
  pollResponses();
});

async function pollResponses() {
  if (!activeTelemetrySlug) return;

  const indicator = document.getElementById('pollingIndicator');
  if (indicator) indicator.style.opacity = '1';

  try {
    const res = await fetch(`/api/surveys/${activeTelemetrySlug}/responses`);
    if (!res.ok) throw new Error('Ошибка запроса телеметрии');
    const data = await res.json();
    renderTelemetryCards(data.responses || []);
  } catch (err) {
    console.error('Ошибка телеметрии:', err);
  } finally {
    setTimeout(() => {
      if (indicator) indicator.style.opacity = '0.4';
    }, 400);
  }
}

function renderTelemetryCards(responses) {
  const total = responses.length;
  const inProgress = responses.filter(r => r.status === 'in_progress').length;
  const submitted = responses.filter(r => r.status === 'submitted').length;

  document.getElementById('statTotalCount').textContent = total;
  document.getElementById('statInProgressCount').textContent = inProgress;
  document.getElementById('statSubmittedCount').textContent = submitted;

  if (total === 0) {
    cardsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 32px; text-align: center; color: var(--color-muted); background: var(--color-paper-2); border-radius: var(--radius-card); border: 1px dashed var(--color-rule-2);">
        Пока нет активных кандидатов. Откройте ссылку на анкету в другой вкладке и начните заполнять поля — телеметрия отобразит изменения здесь в реальном времени.
      </div>
    `;
    return;
  }

  cardsContainer.innerHTML = responses.map(r => {
    const answers = r.answers || {};
    const answerEntries = Object.entries(answers);
    const lastUpdateFormatted = new Date(r.updated_at).toLocaleTimeString();
    const candidateName = answers.q1 ? String(answers.q1) : 'Соискатель';
    const uuidStr = r.session_uuid || r.session_id || '';
    
    return `
      <div class="respondent-card" style="border-left: 3px solid ${r.status === 'submitted' ? 'var(--color-accent)' : 'var(--color-warning)'}">
        <div class="respondent-header">
          <div class="respondent-name">${escapeHtml(candidateName)}</div>
          <span class="badge ${r.status === 'submitted' ? 'badge-success' : 'badge-warning'}">
            ${r.status === 'submitted' ? 'Отправлен' : (r.status === 'abandoned' ? 'Покинут' : 'В процессе')}
          </span>
        </div>

        <div class="respondent-meta">
          UUID: <code>${escapeHtml(uuidStr.slice(0, 18))}…</code><br>
          Текущий вопрос: <strong class="num">${r.current_step || 1}</strong> · Активность: <strong class="num">${lastUpdateFormatted}</strong>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span>Прогресс</span>
          <span class="num">${r.progress}<span class="u">%</span></span>
        </div>
        <div class="progress-bar-container" style="margin-bottom: 12px;">
          <div class="progress-bar" style="transform: scaleX(${r.progress / 100}); background-color: ${r.status === 'submitted' ? 'var(--color-accent)' : 'var(--color-warning)'}"></div>
        </div>

        <div class="answers-summary">
          <div style="font-weight: 400; font-size: 11px; margin-bottom: 6px; color: var(--color-graphite-muted);">
            Ответы кандидата (SQLite):
          </div>
          ${answerEntries.length === 0 ? `
            <div style="color: var(--color-graphite-muted); font-style: italic;">Пока нет ответов</div>
          ` : answerEntries.map(([qId, val]) => `
            <div class="answer-row">
              <span class="answer-q">${escapeHtml(qId)}:</span>
              <span class="answer-v">${escapeHtml(Array.isArray(val) ? val.join(', ') : String(val))}</span>
            </div>
          `).join('')}
        </div>

        ${r.telemetry_events && r.telemetry_events.length > 0 ? `
          <div style="margin-top: 8px; font-size: 11px; color: var(--color-muted);">
            Событие: <code>${escapeHtml(r.telemetry_events[0].field_id || r.telemetry_events[0].event_type)}</code> (${new Date(r.telemetry_events[0].server_time).toLocaleTimeString()})
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initial load
loadSurveys();
