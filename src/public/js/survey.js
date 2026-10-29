// Participant Survey Logic (Vantage Theme)
(async function() {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const slug = pathParts[pathParts.length - 1];

  const loadingState = document.getElementById('loadingState');
  const errorState = document.getElementById('errorState');
  const errorMessage = document.getElementById('errorMessage');
  const surveyContent = document.getElementById('surveyContent');
  const completedScreen = document.getElementById('completedScreen');
  const questionsFormList = document.getElementById('questionsFormList');
  const participantNameInput = document.getElementById('participantName');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const saveStatus = document.getElementById('saveStatus');
  const saveStatusText = document.getElementById('saveStatusText');
  const responseForm = document.getElementById('responseForm');
  const btnSubmit = document.getElementById('btnSubmit');

  if (!slug) {
    showError('Некорректная ссылка на опрос');
    return;
  }

  let surveyData = null;
  let sessionId = localStorage.getItem(`survey_sess_${slug}`);
  let currentAnswers = {};
  let debounceTimer = null;

  try {
    // 1. Fetch survey details
    const res = await fetch(`/api/surveys/${slug}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Опрос не найден');
    }
    const data = await res.json();
    surveyData = data.survey;

    document.title = `${surveyData.title} | Опрос`;
    document.getElementById('surveyTitle').textContent = surveyData.title;
    document.getElementById('surveyDesc').textContent = surveyData.description || '';

    // 2. Initialize or recover session
    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(`survey_sess_${slug}`, sessionId);
    }

    const sessionRes = await fetch(`/api/surveys/${slug}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
    const sessionData = await sessionRes.json();
    if (sessionData.session) {
      currentAnswers = sessionData.session.answers || {};
      if (sessionData.session.participant_name && sessionData.session.participant_name !== 'Аноним') {
        participantNameInput.value = sessionData.session.participant_name;
      }
      if (sessionData.session.status === 'submitted') {
        showCompleted(sessionData.session);
        return;
      }
    }

    // 3. Render questions
    renderQuestions(surveyData.questions);
    updateProgressUI();

    loadingState.style.display = 'none';
    surveyContent.style.display = 'block';

  } catch (err) {
    showError(err.message);
  }

  function showError(msg) {
    loadingState.style.display = 'none';
    surveyContent.style.display = 'none';
    errorState.style.display = 'block';
    errorMessage.textContent = msg;
  }

  function showCompleted(session) {
    loadingState.style.display = 'none';
    surveyContent.style.display = 'none';
    completedScreen.style.display = 'block';
    document.getElementById('summarySessionId').textContent = session.session_id;
    document.getElementById('summarySubmitTime').textContent = new Date(session.submitted_at || Date.now()).toLocaleString();
  }

  function renderQuestions(questions) {
    questionsFormList.innerHTML = '';

    questions.forEach((q, index) => {
      const panel = document.createElement('div');
      panel.className = 'panel ticks';
      panel.id = `card_${q.id}`;

      let inputHtml = '';
      const existingVal = currentAnswers[q.id];

      switch (q.type) {
        case 'textarea':
          inputHtml = `
            <textarea 
              name="${q.id}" 
              placeholder="Введите ваш ответ…"
              oninput="handleFieldChange('${q.id}', this.value)"
            >${escapeHtml(existingVal || '')}</textarea>
          `;
          break;

        case 'rating':
          const min = q.min || 1;
          const max = q.max || 5;
          let buttonsHtml = '';
          for (let i = min; i <= max; i++) {
            const isActive = Number(existingVal) === i;
            buttonsHtml += `
              <button 
                type="button" 
                class="rating-btn ${isActive ? 'active' : ''}" 
                onclick="handleRatingSelect('${q.id}', ${i}, this)"
              >${i}</button>
            `;
          }
          inputHtml = `<div class="rating-group" id="rating_group_${q.id}">${buttonsHtml}</div>`;
          break;

        case 'number':
          inputHtml = `
            <input 
              type="number" 
              name="${q.id}" 
              value="${existingVal !== undefined ? existingVal : ''}"
              placeholder="0"
              oninput="handleFieldChange('${q.id}', this.value)"
            >
          `;
          break;

        case 'single':
          const options = q.options || [];
          inputHtml = `<div class="choice-list">` + options.map((opt) => `
            <label class="choice-item">
              <input 
                type="radio" 
                name="${q.id}" 
                value="${escapeHtml(opt)}" 
                ${existingVal === opt ? 'checked' : ''}
                onchange="handleFieldChange('${q.id}', this.value, true)"
              >
              <span>${escapeHtml(opt)}</span>
            </label>
          `).join('') + `</div>`;
          break;

        case 'multiple':
          const multiOptions = q.options || [];
          const selectedList = Array.isArray(existingVal) ? existingVal : [];
          inputHtml = `<div class="choice-list">` + multiOptions.map((opt) => `
            <label class="choice-item">
              <input 
                type="checkbox" 
                name="${q.id}" 
                value="${escapeHtml(opt)}" 
                ${selectedList.includes(opt) ? 'checked' : ''}
                onchange="handleMultiSelectChange('${q.id}')"
              >
              <span>${escapeHtml(opt)}</span>
            </label>
          `).join('') + `</div>`;
          break;

        case 'text':
        default:
          inputHtml = `
            <input 
              type="text" 
              name="${q.id}" 
              value="${escapeHtml(existingVal || '')}"
              placeholder="Ваш ответ…"
              oninput="handleFieldChange('${q.id}', this.value)"
            >
          `;
          break;
      }

      panel.innerHTML = `
        <div class="form-group" style="margin-bottom: 0;">
          <label>
            ${index + 1}. ${escapeHtml(q.label)}
            ${q.required ? '<span class="required">*</span>' : ''}
          </label>
          ${inputHtml}
        </div>
      `;

      questionsFormList.appendChild(panel);
    });
  }

  // Handle Participant Name Change
  participantNameInput.addEventListener('input', (e) => {
    sendTelemetry('participant_name', e.target.value, false);
  });

  // Handle Rating Button Click
  window.handleRatingSelect = function(fieldId, value, buttonEl) {
    const group = document.getElementById(`rating_group_${fieldId}`);
    if (group) {
      group.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('active'));
      buttonEl.classList.add('active');
    }
    currentAnswers[fieldId] = value;
    sendTelemetry(fieldId, value, true);
    updateProgressUI();
  };

  // Handle Multi-Select (Checkbox) Change
  window.handleMultiSelectChange = function(fieldId) {
    const checkboxes = document.querySelectorAll(`input[name="${fieldId}"]:checked`);
    const values = Array.from(checkboxes).map(c => c.value);
    currentAnswers[fieldId] = values;
    sendTelemetry(fieldId, values, true);
    updateProgressUI();
  };

  // Handle General Field Changes
  window.handleFieldChange = function(fieldId, value, immediate = false) {
    currentAnswers[fieldId] = value;
    updateProgressUI();
    sendTelemetry(fieldId, value, immediate);
  };

  // Telemetry Send Function with Debounce
  function sendTelemetry(fieldId, value, immediate = false) {
    setSavingStatus(true);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const payload = {
      sessionId,
      fieldId,
      value,
      answers: currentAnswers,
      progress: getCalculatedProgress(),
      eventType: 'field_change',
      clientTime: new Date().toISOString()
    };

    if (fieldId === 'participant_name') {
      payload.participantName = value;
    }

    const dispatch = async () => {
      try {
        const res = await fetch(`/api/surveys/${slug}/telemetry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          setSavingStatus(false);
        }
      } catch (err) {
        console.error('Ошибка отправки телеметрии:', err);
      }
    };

    if (immediate) {
      dispatch();
    } else {
      debounceTimer = setTimeout(dispatch, 300);
    }
  }

  function getCalculatedProgress() {
    if (!surveyData || !surveyData.questions) return 0;
    const total = surveyData.questions.length;
    let answered = 0;
    surveyData.questions.forEach(q => {
      const val = currentAnswers[q.id];
      if (val !== undefined && val !== null && val !== '') {
        if (Array.isArray(val) ? val.length > 0 : true) {
          answered++;
        }
      }
    });
    return Math.min(100, Math.round((answered / total) * 100));
  }

  function updateProgressUI() {
    const pct = getCalculatedProgress();
    if (progressBar) {
      progressBar.style.transform = `scaleX(${pct / 100})`;
    }
    if (progressText) {
      progressText.innerHTML = `${pct}<span class="u">%</span>`;
    }
  }

  function setSavingStatus(isSaving) {
    if (isSaving) {
      saveStatus.className = 'telemetry-status telemetry-saving';
      saveStatusText.textContent = 'Сохранение…';
    } else {
      saveStatus.className = 'telemetry-status telemetry-live';
      const timeStr = new Date().toLocaleTimeString();
      saveStatusText.textContent = `Сохранено (${timeStr})`;
    }
  }

  // Final Form Submission
  responseForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Check required fields
    for (const q of surveyData.questions) {
      if (q.required) {
        const val = currentAnswers[q.id];
        const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
        if (isEmpty) {
          const card = document.getElementById(`card_${q.id}`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth' });
            card.style.borderColor = 'var(--color-danger)';
            setTimeout(() => { card.style.borderColor = 'var(--color-rule)'; }, 2000);
          }
          alert(`Пожалуйста, ответьте на обязательный вопрос: "${q.label}"`);
          return;
        }
      }
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Отправка…';

    try {
      const res = await fetch(`/api/surveys/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          answers: currentAnswers
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка отправки формы');
      }

      showCompleted(data.response);
    } catch (err) {
      alert(`Ошибка: ${err.message}`);
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Отправить отклик';
    }
  });

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
