// =============================================================================
// reading.js — Leseverstehen module for B1 Goethe Trainer
// =============================================================================

'use strict';

const ReadingModule = (() => {

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let container = null;
  let data = null;
  let passages = [];

  // Handle single-letter answers ("b") matched against full option text ("b) ...")
  function _answersMatch(userAnswer, correctAnswer) {
    const u = (userAnswer || '').toLowerCase().trim();
    const c = (correctAnswer || '').toLowerCase().trim();
    if (u === c) return true;
    // Single-letter answer like "b" should match "b) some option text"
    if (/^[a-d]$/.test(c) && u.startsWith(c + ')')) return true;
    return false;
  }
  let currentPassage = null;
  let userAnswers = {};
  let timerInterval = null;
  let timerSeconds = 0;
  let timerRunning = false;
  let examMode = false;
  let _toolbarHandler = null;

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  function init(el, appData) {
    container = el;
    data = appData;
    passages = (data.reading && data.reading.passages) || [];

  }

  function render(_container, subRoute) {
    _bindToolbar();
    if (subRoute && subRoute.startsWith('passage/')) {
      const id = subRoute.replace('passage/', '');
      const passage = passages.find(p => String(p.id) === id);
      if (passage) {
        _renderPassageView(passage);
        return;
      }
    }
    _renderPassageList();
  }

  function destroy() {
    _stopTimer();
    window.speechSynthesis && window.speechSynthesis.cancel();
    if (_toolbarHandler) {
      document.removeEventListener('click', _toolbarHandler);
      _toolbarHandler = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------------------

  function _bindToolbar() {
    if (_toolbarHandler) document.removeEventListener('click', _toolbarHandler);
    _toolbarHandler = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      switch (btn.getAttribute('data-action')) {
        case 'reading-start':
          _startRandomPassage();
          break;
      }
    };
    document.addEventListener('click', _toolbarHandler);
  }

  function _startRandomPassage() {
    if (passages.length === 0) {
      showToast('Noch keine Lesetexte verfügbar. Bitte laden Sie zunächst die Lesedaten.', 'warning');
      return;
    }
    const passage = pickRandom(passages, 1)[0];
    window.location.hash = '#reading/passage/' + passage.id;
  }

  // ---------------------------------------------------------------------------
  // Type badge helpers
  // ---------------------------------------------------------------------------

  const typeBadgeLabels = {
    blog: 'Blog',
    article: 'Artikel',
    everyday: 'Alltag',
    opinion: 'Meinung',
    formal: 'Formell',
  };

  const typeBadgeClasses = {
    blog: 'badge--info',
    article: 'badge--accent',
    everyday: 'badge--success',
    opinion: 'badge--warning',
    formal: 'badge--danger',
  };

  function _getTypeBadge(type) {
    const label = typeBadgeLabels[type] || type;
    const cls = typeBadgeClasses[type] || 'badge--info';
    return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
  }

  // ---------------------------------------------------------------------------
  // Passage List View
  // ---------------------------------------------------------------------------

  function _renderPassageList() {
    if (passages.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__text">Derzeit stehen keine Lesetexte zur Verfügung.</p>
          <p class="empty-state__hint">Sobald die Lesedaten geladen sind, erscheinen hier die verfügbaren Texte.</p>
        </div>`;
      return;
    }

    const completedIds = Storage.get('reading_completed', []);

    const typeFilter = _buildTypeFilter();

    let html = `
      <div class="reading-list">
        <div class="reading-list__filters">
          ${typeFilter}
          <label class="toggle-label">
            <input type="checkbox" id="reading-exam-mode" class="toggle-input">
            <span class="toggle-switch"></span>
            Prüfungsmodus (mit Zeitbegrenzung)
          </label>
        </div>
        <div class="reading-list__grid" id="reading-grid">`;

    passages.forEach(passage => {
      const questionCount = (passage.questions || []).length;
      const isCompleted = completedIds.includes(String(passage.id));
      const completedBadge = isCompleted
        ? '<span class="badge badge--success">Erledigt</span>'
        : '';
      const examPartLabel = passage.examPart
        ? `<span class="badge badge--outline">Teil ${passage.examPart}</span>`
        : '';

      html += `
        <a href="#reading/passage/${passage.id}" class="card card--hoverable reading-card ${isCompleted ? 'reading-card--completed' : ''}">
          <div class="card__header">
            <div class="card__badges">
              ${_getTypeBadge(passage.type)}
              ${examPartLabel}
              ${completedBadge}
            </div>
          </div>
          <h3 class="card__title">${escapeHtml(passage.title)}</h3>
          <div class="card__meta">
            <span>${questionCount} ${questionCount === 1 ? 'Frage' : 'Fragen'}</span>
          </div>
        </a>`;
    });

    html += `
        </div>
      </div>`;

    container.innerHTML = html;

    // Bind filter
    const filterSelect = container.querySelector('#reading-type-filter');
    if (filterSelect) {
      filterSelect.addEventListener('change', () => _filterPassages(filterSelect.value));
    }
  }

  function _buildTypeFilter() {
    const types = [...new Set(passages.map(p => p.type).filter(Boolean))];
    if (types.length <= 1) return '';

    let options = '<option value="all">Alle Textarten</option>';
    types.forEach(type => {
      const label = typeBadgeLabels[type] || type;
      options += `<option value="${type}">${escapeHtml(label)}</option>`;
    });

    return `<select class="select" id="reading-type-filter" aria-label="Textart filtern">${options}</select>`;
  }

  function _filterPassages(type) {
    const cards = container.querySelectorAll('.reading-card');
    cards.forEach(card => {
      if (type === 'all') {
        card.style.display = '';
      } else {
        const badge = card.querySelector('.badge');
        const badgeText = badge ? badge.textContent.trim() : '';
        const typeLabel = typeBadgeLabels[type] || type;
        card.style.display = badgeText === typeLabel ? '' : 'none';
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Passage View
  // ---------------------------------------------------------------------------

  function _renderPassageView(passage) {
    currentPassage = passage;
    userAnswers = {};

    const examModeCheckbox = document.getElementById('reading-exam-mode');
    examMode = examModeCheckbox ? examModeCheckbox.checked : false;

    let html = `
      <div class="reading-view">
        <div class="reading-view__nav">
          <a href="#reading" class="btn btn--outline btn--sm">&larr; Zurück zur Übersicht</a>
          <button class="btn btn--outline btn--sm" id="reading-vorlesen">
            <span aria-hidden="true">&#128264;</span> Vorlesen
          </button>
          ${examMode ? `
          <div class="reading-view__timer">
            <span aria-hidden="true">&#9201;</span>
            <span id="reading-timer-display">00:00</span>
          </div>` : ''}
        </div>

        <article class="reading-passage">
          <header class="reading-passage__header">
            <div class="reading-passage__badges">
              ${_getTypeBadge(passage.type)}
              ${passage.examPart ? `<span class="badge badge--outline">Prüfungsteil ${passage.examPart}</span>` : ''}
            </div>
            <h2 class="reading-passage__title">${escapeHtml(passage.title)}</h2>
          </header>
          <div class="reading-passage__text">
            ${_formatPassageText(passage.text)}
          </div>
        </article>

        <section class="reading-questions" id="reading-questions">
          <h3 class="reading-questions__heading">Verständnisfragen</h3>
          ${_renderQuestions(passage.questions || [])}
        </section>

        <div class="reading-actions">
          <button class="btn btn--accent btn--lg" id="reading-check">Prüfen</button>
        </div>

        <div class="reading-results" id="reading-results" hidden></div>
      </div>`;

    container.innerHTML = html;

    // Bind events
    _bindPassageEvents(passage);

    // Start timer in exam mode
    if (examMode) {
      const timePerQuestion = 3 * 60; // 3 minutes per question
      const totalTime = Math.max(timePerQuestion * (passage.questions || []).length, 10 * 60);
      _startTimer(totalTime);
    }
  }

  function _formatPassageText(text) {
    if (!text) return '';
    return text.split(/\n\n+/).map(para =>
      `<p>${escapeHtml(para)}</p>`
    ).join('');
  }

  // ---------------------------------------------------------------------------
  // Questions rendering
  // ---------------------------------------------------------------------------

  function _renderQuestions(questions) {
    if (questions.length === 0) {
      return '<p class="text-muted">Zu diesem Text liegen keine Fragen vor.</p>';
    }

    return questions.map((q, index) => {
      switch (q.type) {
        case 'true_false':
          return _renderTrueFalseQuestion(q, index);
        case 'matching':
          return _renderMatchingQuestion(q, index);
        case 'multiple_choice':
        default:
          return _renderMultipleChoiceQuestion(q, index);
      }
    }).join('');
  }

  function _renderMultipleChoiceQuestion(q, index) {
    const options = (q.options || []).map((opt, i) => {
      const optId = `q${index}_opt${i}`;
      return `
        <label class="radio-option" for="${optId}">
          <input type="radio" id="${optId}" name="question_${index}" value="${escapeHtml(opt)}" class="radio-input">
          <span class="radio-label">${escapeHtml(opt)}</span>
        </label>`;
    }).join('');

    return `
      <div class="question-card" data-question-index="${index}" data-question-id="${q.id || index}">
        <p class="question-card__text"><strong>${index + 1}.</strong> ${escapeHtml(q.question)}</p>
        <div class="question-card__options">${options}</div>
        <div class="question-card__feedback" hidden></div>
      </div>`;
  }

  function _renderTrueFalseQuestion(q, index) {
    return `
      <div class="question-card" data-question-index="${index}" data-question-id="${q.id || index}">
        <p class="question-card__text"><strong>${index + 1}.</strong> ${escapeHtml(q.question)}</p>
        <div class="question-card__options question-card__options--inline">
          <label class="radio-option" for="q${index}_true">
            <input type="radio" id="q${index}_true" name="question_${index}" value="richtig" class="radio-input">
            <span class="radio-label">Richtig</span>
          </label>
          <label class="radio-option" for="q${index}_false">
            <input type="radio" id="q${index}_false" name="question_${index}" value="falsch" class="radio-input">
            <span class="radio-label">Falsch</span>
          </label>
        </div>
        <div class="question-card__feedback" hidden></div>
      </div>`;
  }

  function _renderMatchingQuestion(q, index) {
    const options = shuffleArray([...(q.options || [])]);
    const optionElements = options.map(opt =>
      `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`
    ).join('');

    return `
      <div class="question-card" data-question-index="${index}" data-question-id="${q.id || index}">
        <p class="question-card__text"><strong>${index + 1}.</strong> ${escapeHtml(q.question)}</p>
        <div class="question-card__options">
          <select class="select" name="question_${index}" aria-label="Zuordnung wählen">
            <option value="">-- Bitte wählen --</option>
            ${optionElements}
          </select>
        </div>
        <div class="question-card__feedback" hidden></div>
      </div>`;
  }

  // ---------------------------------------------------------------------------
  // Event bindings for passage view
  // ---------------------------------------------------------------------------

  function _bindPassageEvents(passage) {
    // Vorlesen button
    const vorlesenBtn = container.querySelector('#reading-vorlesen');
    if (vorlesenBtn) {
      vorlesenBtn.addEventListener('click', () => {
        speak(passage.text);
        showToast('Der Text wird vorgelesen. Hören Sie aufmerksam zu.', 'info');
      });
    }

    // Check answers
    const checkBtn = container.querySelector('#reading-check');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => _checkAnswers(passage));
    }
  }

  // ---------------------------------------------------------------------------
  // Answer checking
  // ---------------------------------------------------------------------------

  function _checkAnswers(passage) {
    const questions = passage.questions || [];
    let correctCount = 0;

    questions.forEach((q, index) => {
      const card = container.querySelector(`[data-question-index="${index}"]`);
      if (!card) return;

      const feedbackEl = card.querySelector('.question-card__feedback');
      let userAnswer = '';

      // Gather user answer based on question type
      if (q.type === 'matching') {
        const select = card.querySelector('select');
        userAnswer = select ? select.value : '';
      } else {
        const checked = card.querySelector(`input[name="question_${index}"]:checked`);
        userAnswer = checked ? checked.value : '';
      }

      userAnswers[index] = userAnswer;

      // Compare answers
      const correctAnswer = String(q.answer).toLowerCase().trim();
      const isCorrect = _answersMatch(userAnswer, correctAnswer);

      if (isCorrect) {
        correctCount++;
        card.classList.add('question-card--correct');
        card.classList.remove('question-card--wrong');
        feedbackEl.innerHTML = `
          <span class="feedback feedback--correct">Ausgezeichnet! Das ist die richtige Antwort.</span>
          ${q.explanation ? `<p class="feedback__explanation">${escapeHtml(q.explanation)}</p>` : ''}`;
      } else {
        card.classList.add('question-card--wrong');
        card.classList.remove('question-card--correct');
        const correctLabel = q.type === 'true_false'
          ? (correctAnswer === 'richtig' ? 'Richtig' : 'Falsch')
          : q.answer;
        feedbackEl.innerHTML = `
          <span class="feedback feedback--wrong">Leider nicht zutreffend.</span>
          <p class="feedback__correct">Die korrekte Antwort lautet: <strong>${escapeHtml(String(correctLabel))}</strong></p>
          ${q.explanation ? `<p class="feedback__explanation">${escapeHtml(q.explanation)}</p>` : ''}`;
      }

      feedbackEl.hidden = false;

      // Disable inputs after checking
      card.querySelectorAll('input, select').forEach(input => {
        input.disabled = true;
      });
    });

    // Stop timer
    _stopTimer();

    // Show results
    _showResults(correctCount, questions.length, passage);
  }

  // ---------------------------------------------------------------------------
  // Results display
  // ---------------------------------------------------------------------------

  function _showResults(correct, total, passage) {
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = percentage >= 60;

    const resultsEl = container.querySelector('#reading-results');
    if (!resultsEl) return;

    const verdictText = passed
      ? 'Herzlichen Glückwunsch! Sie haben diesen Lesetext erfolgreich bearbeitet.'
      : 'Diesmal hat es leider nicht ganz gereicht. Versuchen Sie es erneut und lesen Sie den Text noch einmal aufmerksam durch.';

    const timerText = timerSeconds > 0
      ? `<p class="results__time">Benötigte Zeit: <strong>${_formatTime(timerSeconds)}</strong></p>`
      : '';

    resultsEl.innerHTML = `
      <div class="results-card ${passed ? 'results-card--passed' : 'results-card--failed'}">
        <h3 class="results-card__title">Ergebnis</h3>
        <div class="results-card__score">
          <span class="results-card__number">${correct}</span>
          <span class="results-card__separator">/</span>
          <span class="results-card__total">${total}</span>
        </div>
        <div class="results-card__percentage">${percentage}%</div>
        <p class="results-card__verdict">${verdictText}</p>
        ${timerText}
        <div class="results-card__actions">
          <a href="#reading" class="btn btn--outline">Zur Übersicht</a>
          <button class="btn btn--accent" id="reading-retry">Erneut versuchen</button>
        </div>
      </div>`;

    resultsEl.hidden = false;

    // Bind retry
    const retryBtn = resultsEl.querySelector('#reading-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => _renderPassageView(passage));
    }

    // Hide check button
    const checkBtn = container.querySelector('#reading-check');
    if (checkBtn) checkBtn.hidden = true;

    // Save progress
    _saveProgress(correct, total, passage);

    // Scroll to results
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------------------
  // Progress saving
  // ---------------------------------------------------------------------------

  function _saveProgress(correct, total, passage) {
    // Mark passage as completed
    const completedIds = Storage.get('reading_completed', []);
    const passageId = String(passage.id);
    if (!completedIds.includes(passageId)) {
      completedIds.push(passageId);
      Storage.set('reading_completed', completedIds);
    }

    // Save per-passage score
    const scores = Storage.get('reading_scores', {});
    scores[passageId] = {
      correct,
      total,
      percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
      timestamp: new Date().toISOString(),
    };
    Storage.set('reading_scores', scores);

    // Update module progress
    Storage.saveProgress('reading', {
      completed: completedIds.length,
      total: passages.length,
      score: _computeAverageScore(scores),
    });

    App.recordPractice();
  }

  function _computeAverageScore(scores) {
    const values = Object.values(scores);
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, s) => acc + (s.percentage || 0), 0);
    return Math.round(sum / values.length);
  }

  // ---------------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------------

  function _startTimer(seconds) {
    _stopTimer();
    timerSeconds = 0;
    timerRunning = true;
    const totalAllowed = seconds;

    const display = container.querySelector('#reading-timer-display');

    timerInterval = setInterval(() => {
      timerSeconds++;
      const remaining = totalAllowed - timerSeconds;

      if (display) {
        display.textContent = _formatTime(Math.max(remaining, 0));
      }

      // 5 minute warning
      if (remaining === 300) {
        showToast('Noch fünf Minuten verbleibend. Bitte bringen Sie Ihre Antworten zu Ende.', 'warning', 5000);
      }

      // Time is up
      if (remaining <= 0) {
        _stopTimer();
        showToast('Die Zeit ist abgelaufen. Ihre Antworten werden nun ausgewertet.', 'warning', 4000);
        if (currentPassage) {
          _checkAnswers(currentPassage);
        }
      }
    }, 1000);
  }

  function _stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerRunning = false;
  }

  function _formatTime(seconds) {
    const m = Math.floor(Math.abs(seconds) / 60);
    const s = Math.abs(seconds) % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // ---------------------------------------------------------------------------
  // Public API (for exam module reuse)
  // ---------------------------------------------------------------------------

  function renderPassageForExam(targetEl, passage) {
    const questions = passage.questions || [];

    let html = `
      <article class="reading-passage">
        <header class="reading-passage__header">
          <div class="reading-passage__badges">
            ${_getTypeBadge(passage.type)}
            ${passage.examPart ? `<span class="badge badge--outline">Teil ${passage.examPart}</span>` : ''}
          </div>
          <h2 class="reading-passage__title">${escapeHtml(passage.title)}</h2>
        </header>
        <div class="reading-passage__text">
          ${_formatPassageText(passage.text)}
        </div>
      </article>
      <section class="reading-questions">
        ${_renderQuestions(questions)}
      </section>`;

    targetEl.innerHTML = html;
  }

  function getAnswersFromContainer(targetEl, questions) {
    const results = [];
    (questions || []).forEach((q, index) => {
      const card = targetEl.querySelector(`[data-question-index="${index}"]`);
      if (!card) { results.push({ question: q, userAnswer: '', correct: false }); return; }

      let userAnswer = '';
      if (q.type === 'matching') {
        const select = card.querySelector('select');
        userAnswer = select ? select.value : '';
      } else {
        const checked = card.querySelector(`input[name="question_${index}"]:checked`);
        userAnswer = checked ? checked.value : '';
      }

      const correctAnswer = String(q.answer).toLowerCase().trim();
      const isCorrect = _answersMatch(userAnswer, correctAnswer);
      results.push({ question: q, userAnswer, correct: isCorrect });
    });
    return results;
  }

  // ---------------------------------------------------------------------------
  // Module interface
  // ---------------------------------------------------------------------------

  return {
    init,
    render,
    destroy,
    // Exposed for exam module
    renderPassageForExam,
    getAnswersFromContainer,
  };

})();

App.registerModule('reading', ReadingModule);
