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
    const url = isEdit ? `/api/surveys/edit/${encodeURIComponent(editingSlug)}` : '/api/surveys';
    const method = 'POST';

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
        activeTelemetrySlug = updatedSlug;
        telemetrySurveyTitle.textContent = data.survey.title;
        pollResponses();
      }
    } else {
      alert(`Анкета успешно создана!\nСсылка для соискателей:\n${data.survey.url}`);
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
let activeSurveyMeta = null;
let pollTimeout = null;
let isPolling = false;

window.openTelemetry = function(slug, title) {
  activeTelemetrySlug = slug;
  activeSurveyMeta = null;
  telemetrySurveyTitle.textContent = title || slug;
  telemetrySection.style.display = 'block';
  telemetrySection.scrollIntoView({ behavior: 'smooth' });

  // Single immediate poll
  pollResponses().then(() => {
    scheduleNextPoll();
  });
};

window.closeTelemetry = function() {
  activeTelemetrySlug = null;
  activeSurveyMeta = null;
  telemetrySection.style.display = 'none';
  stopTelemetryPolling();
};

function stopTelemetryPolling() {
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
}

function getPollInterval() {
  const sel = document.getElementById('pollIntervalSelect');
  return sel ? Math.max(2000, Number(sel.value) || 5000) : 5000;
}

function scheduleNextPoll() {
  stopTelemetryPolling();
  if (autoPollToggle && autoPollToggle.checked && activeTelemetrySlug && !document.hidden) {
    pollTimeout = setTimeout(async () => {
      await pollResponses();
      scheduleNextPoll();
    }, getPollInterval());
  }
}

// Pause polling when browser tab is inactive / hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopTelemetryPolling();
  } else if (autoPollToggle && autoPollToggle.checked && activeTelemetrySlug) {
    scheduleNextPoll();
  }
});

autoPollToggle.addEventListener('change', () => {
  if (autoPollToggle.checked) {
    pollResponses().then(scheduleNextPoll);
  } else {
    stopTelemetryPolling();
  }
});

const pollIntervalSelect = document.getElementById('pollIntervalSelect');
if (pollIntervalSelect) {
  pollIntervalSelect.addEventListener('change', () => {
    if (autoPollToggle && autoPollToggle.checked) {
      scheduleNextPoll();
    }
  });
}

btnPollNow.addEventListener('click', () => {
  pollResponses();
});

async function pollResponses() {
  if (!activeTelemetrySlug || isPolling) return;
  if (document.hidden && autoPollToggle && autoPollToggle.checked) return;

  isPolling = true;
  const indicator = document.getElementById('pollingIndicator');
  if (indicator) indicator.style.opacity = '1';

  try {
    const res = await fetch(`/api/surveys/${activeTelemetrySlug}/responses`);
    if (!res.ok) throw new Error('Ошибка запроса телеметрии');
    const data = await res.json();
    if (data.survey) {
      activeSurveyMeta = data.survey;
      if (data.survey.title) {
        telemetrySurveyTitle.textContent = data.survey.title;
      }
    }
    renderTelemetryCards(data.responses || [], activeSurveyMeta);
  } catch (err) {
    console.error('Ошибка телеметрии:', err);
  } finally {
    isPolling = false;
    setTimeout(() => {
      if (indicator) indicator.style.opacity = '0.4';
    }, 400);
  }
}

function hasAnswers(r) {
  if (!r.answers || typeof r.answers !== 'object') return false;
  return Object.values(r.answers).some(val => {
    if (val === undefined || val === null || val === '') return false;
    if (Array.isArray(val)) return val.length > 0;
    return true;
  });
}

function renderTelemetryCharts(responses, stats) {
  const container = document.getElementById('telemetryChartsContainer');
  if (!container) return;

  const total = stats.totalCount;
  if (total === 0) {
    container.innerHTML = '';
    return;
  }

  const submitted = stats.submittedCount;
  const inProgress = stats.inProgressActiveCount;
  const empty = stats.emptyCount;

  const submittedPct = Math.round((submitted / total) * 100);
  const inProgressPct = Math.round((inProgress / total) * 100);
  const emptyPct = Math.max(0, 100 - submittedPct - inProgressPct);

  // Progress histogram buckets (0% empty, 1-25%, 26-50%, 51-75%, 76-99%, 100%)
  const buckets = [
    { label: '0% (Пустые)', count: responses.filter(r => r.progress === 0 && !hasAnswers(r)).length, color: 'var(--color-rule-2)' },
    { label: '1–25%', count: responses.filter(r => r.progress > 0 && r.progress <= 25).length, color: 'var(--color-warning)' },
    { label: '26–50%', count: responses.filter(r => r.progress > 25 && r.progress <= 50).length, color: 'var(--color-warning)' },
    { label: '51–75%', count: responses.filter(r => r.progress > 50 && r.progress <= 75).length, color: 'var(--color-accent)' },
    { label: '76–99%', count: responses.filter(r => r.progress > 75 && r.progress < 100).length, color: 'var(--color-accent)' },
    { label: '100%', count: responses.filter(r => r.progress === 100).length, color: 'var(--color-success)' }
  ];

  const maxBucketCount = Math.max(1, ...buckets.map(b => b.count));

  container.innerHTML = `
    <!-- Funnel Status Breakdown -->
    <div class="chart-box">
      <div class="chart-header">
        <span class="chart-title">Воронка активности участников</span>
        <span class="chart-meta">Всего: <strong class="num">${total}</strong></span>
      </div>
      <div class="segmented-bar">
        ${submitted > 0 ? `<div class="segment segment-submitted" style="flex: ${submitted};" title="Завершено: ${submitted} (${submittedPct}%)"></div>` : ''}
        ${inProgress > 0 ? `<div class="segment segment-active" style="flex: ${inProgress};" title="Заполняют: ${inProgress} (${inProgressPct}%)"></div>` : ''}
        ${empty > 0 ? `<div class="segment segment-empty" style="flex: ${empty};" title="Пустые (только открыли): ${empty} (${emptyPct}%)"></div>` : ''}
      </div>
      <div class="segmented-legend">
        <div class="legend-item">
          <span class="legend-dot dot-submitted"></span>
          <span>Завершено: <strong class="num">${submitted}</strong> <span class="u">(${submittedPct}%)</span></span>
        </div>
        <div class="legend-item">
          <span class="legend-dot dot-active"></span>
          <span>Заполняют ответы: <strong class="num">${inProgress}</strong> <span class="u">(${inProgressPct}%)</span></span>
        </div>
        <div class="legend-item">
          <span class="legend-dot dot-empty"></span>
          <span>Пустые (только открыли): <strong class="num">${empty}</strong> <span class="u">(${emptyPct}%)</span></span>
        </div>
      </div>
    </div>

    <!-- Progress Distribution Histogram -->
    <div class="chart-box">
      <div class="chart-header">
        <span class="chart-title">Распределение по проценту прогресса</span>
        <span class="chart-meta">Сессий: <strong class="num">${total}</strong></span>
      </div>
      <div class="histogram-container">
        ${buckets.map(b => {
          const heightRatio = b.count / maxBucketCount;
          return `
            <div class="histogram-col" title="${b.label}: ${b.count} участников">
              <span class="histogram-count num">${b.count}</span>
              <div class="histogram-bar-track">
                <div class="histogram-fill" style="transform: scaleY(${heightRatio}); background-color: ${b.color};"></div>
              </div>
              <span class="histogram-label">${b.label}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderTelemetryCards(responses, surveyMeta) {
  const total = responses.length;

  // Filter completely empty questionnaires: only show active responses in the cards list
  const activeResponses = responses.filter(r => (r.progress > 0) || hasAnswers(r));
  const emptyResponses = responses.filter(r => !((r.progress > 0) || hasAnswers(r)));

  const totalCount = total;
  const emptyCount = emptyResponses.length;
  const activeCount = activeResponses.length;
  const submittedCount = responses.filter(r => r.status === 'submitted').length;
  const inProgressActiveCount = activeResponses.filter(r => r.status !== 'submitted').length;

  // Update KPI counters
  const elTotal = document.getElementById('statTotalCount');
  const elInProgress = document.getElementById('statInProgressCount');
  const elSubmitted = document.getElementById('statSubmittedCount');
  const elEmpty = document.getElementById('statEmptyCount');
  const elActiveCount = document.getElementById('activeCardsCount');

  if (elTotal) elTotal.textContent = totalCount;
  if (elInProgress) elInProgress.textContent = inProgressActiveCount;
  if (elSubmitted) elSubmitted.textContent = submittedCount;
  if (elEmpty) elEmpty.textContent = emptyCount;
  if (elActiveCount) elActiveCount.textContent = activeCount;

  // Render Graphical Charts including empty sessions
  renderTelemetryCharts(responses, { totalCount, emptyCount, activeCount, submittedCount, inProgressActiveCount });

  // Remember which cards are currently open/expanded to preserve state during polling
  const openUuids = new Set(
    Array.from(cardsContainer.querySelectorAll('details[open]')).map(el => el.getAttribute('data-uuid')).filter(Boolean)
  );

  if (activeResponses.length === 0) {
    if (total === 0) {
      cardsContainer.innerHTML = `
        <div style="padding: 32px; text-align: center; color: var(--color-muted); background: var(--color-paper-2); border-radius: var(--radius-card); border: 1px dashed var(--color-rule-2);">
          Пока нет участников. Откройте ссылку на анкету в другой вкладке, чтобы протестировать телеметрию.
        </div>
      `;
    } else {
      cardsContainer.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--color-muted); background: var(--color-paper-2); border-radius: var(--radius-card); border: 1px dashed var(--color-rule-2);">
          Все текущие сессии (<strong>${emptyCount}</strong>) пока пустые — кандидаты только открыли ссылку и ещё не ввели ответы. Статистика отражена в графиках выше. Как только кандидат заполнит поле, его анкета появится здесь.
        </div>
      `;
    }
    return;
  }

  const surveyQuestions = (surveyMeta?.questions && Array.isArray(surveyMeta.questions)) ? surveyMeta.questions : [];

  cardsContainer.innerHTML = activeResponses.map(r => {
    const answers = r.answers || {};
    const lastUpdateFormatted = new Date(r.updated_at).toLocaleTimeString();
    const uuidStr = r.session_uuid || r.session_id || '';
    const surveySlug = r.survey_slug || surveyMeta?.slug || activeTelemetrySlug || '';
    const surveyTitle = r.survey_title || surveyMeta?.title || surveySlug;
    const surveyUrl = surveyMeta?.url || `/s/${encodeURIComponent(surveySlug)}`;
    const isOpen = openUuids.has(uuidStr);

    // Resolve candidate name dynamically
    let candidateName = 'Соискатель';
    if (surveyQuestions.length > 0) {
      const nameQ = surveyQuestions.find(q => /фио|имя|имени|name|fio/i.test(q.title || q.label || '')) || surveyQuestions[0];
      if (nameQ && answers[nameQ.id]) {
        candidateName = String(answers[nameQ.id]);
      }
    } else if (answers.q1) {
      candidateName = String(answers.q1);
    }

    // Build question-and-answers rows
    const handledQuestionIds = new Set();
    let questionsHtml = '';

    if (surveyQuestions.length > 0) {
      questionsHtml = surveyQuestions.map((q, idx) => {
        handledQuestionIds.add(q.id);
        const qTitle = q.title || q.label || `Вопрос ${idx + 1}`;
        const rawVal = answers[q.id];
        const hasAnswer = rawVal !== undefined && rawVal !== null && rawVal !== '' && (!Array.isArray(rawVal) || rawVal.length > 0);
        const displayVal = hasAnswer
          ? (Array.isArray(rawVal) ? rawVal.join(', ') : String(rawVal))
          : '';
        const isCurrentStep = Number(r.current_step) === (idx + 1);

        return `
          <div class="answer-item">
            <div class="answer-q-header">
              <span class="answer-q-num">№${idx + 1}</span>
              <span class="answer-q-title">${escapeHtml(qTitle)}</span>
              ${q.required ? '<span class="answer-q-req" title="Обязательный вопрос">*</span>' : ''}
            </div>
            <div class="answer-v-row">
              ${hasAnswer ? `
                <span class="answer-v-text">${escapeHtml(displayVal)}</span>
              ` : `
                <span class="answer-v-empty">${isCurrentStep && r.status === 'in_progress' ? 'Заполняется сейчас…' : '— ожидает ответа'}</span>
              `}
            </div>
          </div>
        `;
      }).join('');
    }

    // Any answers not in survey.questions
    const extraAnswers = Object.entries(answers).filter(([k]) => !handledQuestionIds.has(k));
    if (extraAnswers.length > 0) {
      questionsHtml += extraAnswers.map(([qId, val]) => `
        <div class="answer-item">
          <div class="answer-q-header">
            <span class="answer-q-title">${escapeHtml(qId)}</span>
          </div>
          <div class="answer-v-row">
            <span class="answer-v-text">${escapeHtml(Array.isArray(val) ? val.join(', ') : String(val))}</span>
          </div>
        </div>
      `).join('');
    }

    if (!questionsHtml) {
      questionsHtml = `<div class="answer-v-empty" style="padding: 4px 0;">Пока нет ответов</div>`;
    }

    const answeredCount = surveyQuestions.length > 0
      ? surveyQuestions.filter(q => {
          const v = answers[q.id];
          return v !== undefined && v !== null && v !== '' && (!Array.isArray(v) || v.length > 0);
        }).length
      : Object.keys(answers).length;
    
    return `
      <details class="respondent-card collapsible" data-uuid="${escapeHtml(uuidStr)}" ${isOpen ? 'open' : ''} style="border-left: 3px solid ${r.status === 'submitted' ? 'var(--color-success)' : 'var(--color-accent)'}">
        <summary class="respondent-header-summary">
          <div class="summary-left">
            <span class="chevron-indicator" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </span>
            <span class="summary-fio">${escapeHtml(candidateName)}</span>
          </div>

          <div class="summary-middle">
            <a href="${escapeHtml(surveyUrl)}" target="_blank" rel="noopener noreferrer" class="survey-ref-link" onclick="event.stopPropagation()" title="Открыть исходный опрос">
              <span class="survey-ref-title">${escapeHtml(surveyTitle)}</span>
              <span class="survey-ref-badge">/s/${escapeHtml(surveySlug)}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>

          <div class="summary-right">
            <span class="summary-progress-badge">
              <span class="num">${r.progress}<span class="u">%</span></span>
            </span>
            <span class="badge ${r.status === 'submitted' ? 'badge-success' : 'badge-warning'}">
              ${r.status === 'submitted' ? 'Отправлен' : 'В процессе'}
            </span>
          </div>
        </summary>

        <div class="respondent-body">
          <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
            <span>Прогресс</span>
            <span class="num">${r.progress}<span class="u">%</span></span>
          </div>
          <div class="progress-bar-container" style="margin-bottom: 12px;">
            <div class="progress-bar" style="transform: scaleX(${r.progress / 100}); background-color: ${r.status === 'submitted' ? 'var(--color-success)' : 'var(--color-accent)'}"></div>
          </div>

          <div class="respondent-meta">
            UUID: <code>${escapeHtml(uuidStr.slice(0, 18))}…</code><br>
            Текущий шаг: <strong class="num">${r.current_step || 1}</strong> из <strong class="num">${surveyQuestions.length || '?'}</strong> · Активность: <strong class="num">${lastUpdateFormatted}</strong>
          </div>

          <div class="answers-summary">
            <div class="answers-summary-title">
              <span>Вопросы и ответы соискателя:</span>
              <span class="num">${answeredCount} / ${surveyQuestions.length || Object.keys(answers).length}</span>
            </div>
            ${questionsHtml}
          </div>

          ${r.telemetry_events && r.telemetry_events.length > 0 ? `
            <div style="margin-top: 12px; font-size: 11px; color: var(--color-muted);">
              Событие: <code>${escapeHtml(r.telemetry_events[0].field_id || r.telemetry_events[0].event_type)}</code> (${new Date(r.telemetry_events[0].server_time).toLocaleTimeString()})
            </div>
          ` : ''}
        </div>
      </details>
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
