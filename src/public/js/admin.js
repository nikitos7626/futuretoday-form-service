// Admin Panel Logic (Vantage Theme)
let activeTelemetrySlug = null;
let telemetryInterval = null;
let questions = [];

const slugPrefixEl = document.getElementById('slugPrefix');
const surveySlugInput = document.getElementById('surveySlug');
const questionsContainer = document.getElementById('questionsContainer');
const surveysTableBody = document.getElementById('surveysTableBody');
const telemetrySection = document.getElementById('telemetrySection');
const telemetrySurveyTitle = document.getElementById('telemetrySurveyTitle');
const cardsContainer = document.getElementById('cardsContainer');
const autoPollToggle = document.getElementById('autoPollToggle');
const btnPollNow = document.getElementById('btnPollNow');

// SVG Icons
const ICON_TRASH = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const ICON_COPY = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_EXTERNAL = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

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
      <div style="padding: 20px; border: 1px dashed var(--color-rule-2); border-radius: var(--radius-card); text-align: center; color: var(--color-muted); font-size: 14px;">
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
          <input type="text" value="${escapeHtml(q.label)}" oninput="updateQuestion(${index}, 'label', this.value)" placeholder="Например: Как вы оцениваете доклад?" required>
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
          <input type="text" value="${escapeHtml((q.options || []).join(', '))}" oninput="updateQuestionOptions(${index}, this.value)" placeholder="Вариант 1, Вариант 2, Вариант 3">
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

function addQuestion(defaultType = 'text', defaultLabel = '') {
  questions.push({
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: defaultLabel || `Вопрос ${questions.length + 1}`,
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

// Default starter questions
addQuestion('text', 'Ваше имя или никнейм');
addQuestion('rating', 'Оцените качество материалов (1-5)');
addQuestion('textarea', 'Ваши пожелания и предложения');

// Form submission to create survey
document.getElementById('createSurveyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('surveyTitle').value.trim();
  const description = document.getElementById('surveyDesc').value.trim();
  let slug = surveySlugInput.value.trim();

  if (questions.length === 0) {
    alert('Пожалуйста, добавьте хотя бы один вопрос в опрос.');
    return;
  }

  const btn = document.getElementById('btnSubmitSurvey');
  btn.disabled = true;
  btn.textContent = 'Создание…';

  try {
    const res = await fetch('/api/surveys', {
      method: 'POST',
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
      throw new Error(data.error || 'Ошибка при создании опроса');
    }

    alert(`Опрос успешно создан!\nСсылка для участников:\n${data.survey.url}`);
    
    // Clear inputs and regenerate slug
    document.getElementById('surveyTitle').value = '';
    document.getElementById('surveyDesc').value = '';
    surveySlugInput.value = '';
    
    await loadSurveys();
    openTelemetry(data.survey.slug, data.survey.title);
  } catch (err) {
    alert(`Ошибка: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Создать опрос и сгенерировать ссылку';
  }
});

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
            Опросы еще не созданы. Создайте первый опрос в форме выше.
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
          <div style="display: flex; gap: 8px;">
            <a href="${s.url}" target="_blank" class="btn btn-secondary btn-sm">${ICON_EXTERNAL} Открыть</a>
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
  if (!confirm(`Удалить опрос "${slug}" и все связанные с ним ответы?`)) return;
  try {
    const res = await fetch(`/api/surveys/${slug}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Ошибка удаления');
    if (activeTelemetrySlug === slug) {
      closeTelemetry();
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
        Пока нет активных участников. Откройте ссылку на опрос в другой вкладке и начните заполнять поля — телеметрия отобразит изменения здесь в реальном времени.
      </div>
    `;
    return;
  }

  cardsContainer.innerHTML = responses.map(r => {
    const answers = r.answers || {};
    const answerEntries = Object.entries(answers);
    const lastUpdateFormatted = new Date(r.updated_at).toLocaleTimeString();
    
    return `
      <div class="respondent-card" style="border-left: 3px solid ${r.status === 'submitted' ? 'var(--color-accent)' : 'var(--color-warning)'}">
        <div class="respondent-header">
          <div class="respondent-name">${escapeHtml(r.participant_name || 'Аноним')}</div>
          <span class="badge ${r.status === 'submitted' ? 'badge-success' : 'badge-warning'}">
            ${r.status === 'submitted' ? 'Отправлен' : 'В процессе'}
          </span>
        </div>

        <div class="respondent-meta">
          ID: <code>${escapeHtml(r.session_id.slice(0, 14))}…</code> · Изменений: <strong class="num">${r.change_count}</strong><br>
          Активность: <strong class="num">${lastUpdateFormatted}</strong>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span>Прогресс</span>
          <span class="num">${r.progress}<span class="u">%</span></span>
        </div>
        <div class="progress-bar-container" style="margin-bottom: 12px;">
          <div class="progress-bar" style="transform: scaleX(${r.progress / 100}); background-color: ${r.status === 'submitted' ? 'var(--color-accent)' : 'var(--color-warning)'}"></div>
        </div>

        <div class="answers-summary">
          <div style="font-weight: 400; font-size: 11px; margin-bottom: 6px; color: var(--color-muted);">
            Текущие ответы (SQLite):
          </div>
          ${answerEntries.length === 0 ? `
            <div style="color: var(--color-muted); font-style: italic;">Пока нет ответов</div>
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
