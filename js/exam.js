// =============================================================================
// exam.js — Prüfungssimulation module for B1 Goethe Trainer
// =============================================================================

'use strict';

const ExamModule = (() => {

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const SECTIONS = [
    { key: 'lesen',     label: 'Lesen',     minutes: 65, icon: '&#128214;' },
    { key: 'hoeren',    label: 'Hören',      minutes: 40, icon: '&#127911;' },
    { key: 'schreiben', label: 'Schreiben', minutes: 60, icon: '&#9999;'   },
    { key: 'sprechen',  label: 'Sprechen',  minutes: 15, icon: '&#128483;' },
  ];

  const PASS_THRESHOLD = 60;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let container = null;
  let data = null;
  let examActive = false;
  let currentSectionIndex = -1;
  let timerInterval = null;
  let timerRemaining = 0;
  let examData = {};   // assembled exercises for each section
  let examResults = {}; // results per section
  let warningShown = false;
  let _toolbarHandler = null;

  // ---------------------------------------------------------------------------
  // Speaking prompts
  // ---------------------------------------------------------------------------

  const speakingPrompts = [
    {
      title: 'Sich vorstellen',
      instruction: 'Stellen Sie sich Ihrem Prüfungspartner vor. Sprechen Sie über Ihren Namen, Ihr Alter, Ihre Herkunft, Ihren Beruf und Ihre Hobbys.',
      preparation: 30,
      speaking: 90,
      tips: ['Sprechen Sie in ganzen Sätzen.', 'Blickkontakt halten.', 'Verwenden Sie Konnektoren wie „außerdem", „darüber hinaus".'],
    },
    {
      title: 'Ein Bild beschreiben',
      instruction: 'Beschreiben Sie folgende Situation: Eine Familie sitzt am Esstisch und feiert gemeinsam Geburtstag. Was sehen Sie? Was denken die Personen? Wie fühlen sie sich?',
      preparation: 30,
      speaking: 90,
      tips: ['Beschreiben Sie zuerst den allgemeinen Eindruck.', 'Gehen Sie dann auf Einzelheiten ein.', 'Verwenden Sie Vermutungen: „Ich denke, dass...", „Es sieht so aus, als ob..."'],
    },
    {
      title: 'Gemeinsam etwas planen',
      instruction: 'Sie und Ihr Prüfungspartner möchten einen Ausflug am Wochenende planen. Besprechen Sie: Wohin möchten Sie fahren? Wie kommen Sie dorthin? Was nehmen Sie mit? Wann treffen Sie sich?',
      preparation: 30,
      speaking: 120,
      tips: ['Machen Sie Vorschläge: „Ich schlage vor, dass..."', 'Reagieren Sie auf Vorschläge: „Das finde ich gut, aber..."', 'Einigen Sie sich am Ende auf einen Plan.'],
    },
    {
      title: 'Über ein Thema sprechen',
      instruction: 'Sprechen Sie über das Thema „Gesundheit und Sport". Erzählen Sie von Ihren eigenen Erfahrungen, nennen Sie Vor- und Nachteile und geben Sie Ihre persönliche Meinung.',
      preparation: 60,
      speaking: 120,
      tips: ['Gliedern Sie Ihren Beitrag: Einleitung, Hauptteil, Schluss.', 'Nennen Sie konkrete Beispiele.', 'Schließen Sie mit einer klaren Meinung ab.'],
    },
  ];

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  function init(el, appData) {
    container = el;
    data = appData;
  }

  function render(_container, subRoute) {
    _bindToolbar();
    if (examActive) {
      // If returning to exam page while active, re-render current section
      _renderCurrentSection();
    } else {
      _renderStartScreen();
    }
  }

  function destroy() {
    if (examActive) {
      _stopTimer();
    }
    if (typeof ListeningModule !== 'undefined' && ListeningModule.cancelForExam) {
      ListeningModule.cancelForExam();
    }
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
        case 'exam-start':
          _startExam();
          break;
        case 'exam-end':
          _confirmEndExam();
          break;
      }
    };
    document.addEventListener('click', _toolbarHandler);
  }

  // ---------------------------------------------------------------------------
  // Start Screen
  // ---------------------------------------------------------------------------

  function _renderStartScreen() {
    const pastResults = Storage.get('exam_results', []);
    const lastResult = pastResults.length > 0 ? pastResults[pastResults.length - 1] : null;

    let pastResultsHtml = '';
    if (lastResult) {
      pastResultsHtml = `
        <div class="exam-past">
          <h3>Ihre letzte Prüfung</h3>
          <p class="exam-past__date">${_formatDate(lastResult.timestamp)}</p>
          <div class="exam-past__scores">
            ${SECTIONS.map(sec => {
              const secResult = lastResult.sections[sec.key] || {};
              const pct = secResult.percentage || 0;
              return `
                <div class="exam-past__section">
                  <span class="exam-past__label">${sec.label}</span>
                  <div class="progress-bar progress-bar--small">
                    <div class="progress-bar__fill ${pct >= PASS_THRESHOLD ? 'progress-bar__fill--success' : 'progress-bar__fill--danger'}" style="width: ${pct}%"></div>
                  </div>
                  <span class="exam-past__pct">${pct}%</span>
                </div>`;
            }).join('')}
          </div>
          <p class="exam-past__verdict ${lastResult.passed ? 'text-success' : 'text-danger'}">
            ${lastResult.passed ? 'Bestanden' : 'Nicht bestanden'} (Gesamtergebnis: ${lastResult.totalPercentage}%)
          </p>
        </div>`;
    }

    container.innerHTML = `
      <div class="exam-start">
        <div class="exam-start__overview">
          <h2>Goethe-Zertifikat B1 — Probeprüfung</h2>
          <p>Diese Simulation bildet den Ablauf der echten Goethe B1 Prüfung nach. Sie besteht aus vier Abschnitten mit festgelegten Zeitlimits. Jeder Abschnitt muss einzeln bestanden werden (mindestens 60%).</p>

          <div class="exam-sections-overview">
            ${SECTIONS.map((sec, i) => `
              <div class="exam-section-card">
                <span class="exam-section-card__icon" aria-hidden="true">${sec.icon}</span>
                <h3 class="exam-section-card__title">${sec.label}</h3>
                <p class="exam-section-card__time">${sec.minutes} Minuten</p>
                <p class="exam-section-card__desc">${_getSectionDescription(sec.key)}</p>
              </div>`).join('')}
          </div>

          <div class="exam-start__total">
            <p>Gesamtdauer: <strong>${SECTIONS.reduce((sum, s) => sum + s.minutes, 0)} Minuten</strong></p>
          </div>
        </div>

        ${pastResultsHtml}

        <div class="exam-start__actions">
          <button class="btn btn--accent btn--lg" id="exam-begin">Prüfung beginnen</button>
        </div>
      </div>`;

    const beginBtn = container.querySelector('#exam-begin');
    if (beginBtn) {
      beginBtn.addEventListener('click', () => _startExam());
    }
  }

  function _getSectionDescription(key) {
    switch (key) {
      case 'lesen': return '5 Leseübungen mit Verständnisfragen zu verschiedenen Textarten';
      case 'hoeren': return '4 Hörübungen mit Verständnisfragen (Text wird per Sprachsynthese vorgelesen)';
      case 'schreiben': return '1 Schreibaufgabe (E-Mail oder Meinungsäußerung)';
      case 'sprechen': return 'Geführtes Sprechen mit Vorbereitungszeit und Sprechaufgaben';
      default: return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Exam lifecycle
  // ---------------------------------------------------------------------------

  function _startExam() {
    examActive = true;
    currentSectionIndex = -1;
    examResults = {};
    warningShown = false;

    // Assemble exam exercises
    _assembleExam();

    // Show/hide toolbar buttons
    const startBtn = document.querySelector('[data-action="exam-start"]');
    const endBtn = document.querySelector('[data-action="exam-end"]');
    if (startBtn) startBtn.hidden = true;
    if (endBtn) endBtn.hidden = false;

    // Advance to first section
    _advanceSection();
  }

  function _assembleExam() {
    // Lesen: pick up to 5 reading passages
    const passages = (data.reading && data.reading.passages) || [];
    const readingExercises = passages.length >= 5
      ? pickRandom(passages, 5)
      : [...passages];
    examData.lesen = readingExercises;

    // Hören: pick up to 4 passages for listening
    const listeningPassages = passages.length >= 4
      ? pickRandom(passages, 4)
      : pickRandom(passages, Math.min(passages.length, 4));
    examData.hoeren = listeningPassages;

    // Schreiben: pick one writing prompt
    const writingTypes = ['email', 'meinung'];
    const writingType = pickRandom(writingTypes, 1)[0];
    examData.schreiben = typeof WritingModule !== 'undefined'
      ? WritingModule.getRandomPrompt(writingType)
      : null;

    // Sprechen: pick 2 speaking prompts
    examData.sprechen = pickRandom(speakingPrompts, 2);
  }

  function _advanceSection() {
    _stopTimer();
    warningShown = false;
    currentSectionIndex++;

    if (currentSectionIndex >= SECTIONS.length) {
      _finishExam();
      return;
    }

    _renderCurrentSection();
  }

  function _renderCurrentSection() {
    const section = SECTIONS[currentSectionIndex];
    if (!section) return;

    // Start timer
    timerRemaining = section.minutes * 60;
    _startTimer();

    // Render section content
    switch (section.key) {
      case 'lesen':    _renderLesenSection(); break;
      case 'hoeren':   _renderHoerenSection(); break;
      case 'schreiben': _renderSchreibenSection(); break;
      case 'sprechen': _renderSprechenSection(); break;
    }
  }

  function _confirmEndExam() {
    // Build modal content as DOM to avoid setTimeout race condition
    const modalContent = document.createElement('div');
    modalContent.innerHTML = `
      <p>Möchten Sie die Prüfung wirklich vorzeitig beenden? Ihre bisherigen Antworten werden ausgewertet, unbearbeitete Abschnitte werden als nicht bestanden gewertet.</p>
      <div style="margin-top: 1rem; display: flex; gap: 1rem; justify-content: flex-end;">
        <button class="btn btn--outline" id="exam-cancel-end">Abbrechen</button>
        <button class="btn btn--danger" id="exam-confirm-end">Prüfung beenden</button>
      </div>
    `;

    const modal = showModal('Prüfung beenden', modalContent, () => {});

    modalContent.querySelector('#exam-cancel-end').addEventListener('click', () => {
      modal.close();
    });

    modalContent.querySelector('#exam-confirm-end').addEventListener('click', () => {
      modal.close();
      _collectCurrentSectionResults();
      _finishExam();
    });
  }

  // ---------------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------------

  function _startTimer() {
    _stopTimer();
    _updateTimerDisplay();

    timerInterval = setInterval(() => {
      timerRemaining--;
      _updateTimerDisplay();

      // 5 minute warning
      if (timerRemaining === 300 && !warningShown) {
        warningShown = true;
        showToast('Achtung: Noch fünf Minuten in diesem Prüfungsabschnitt!', 'warning', 5000);
      }

      // Time up
      if (timerRemaining <= 0) {
        _stopTimer();
        showToast('Die Zeit für diesen Abschnitt ist abgelaufen. Ihre Antworten werden übernommen.', 'warning', 4000);
        _collectCurrentSectionResults();
        setTimeout(() => _advanceSection(), 2000);
      }
    }, 1000);
  }

  function _stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function _updateTimerDisplay() {
    const display = document.getElementById('exam-timer-value');
    if (display) {
      const m = Math.floor(Math.max(timerRemaining, 0) / 60);
      const s = Math.max(timerRemaining, 0) % 60;
      display.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
  }

  // ---------------------------------------------------------------------------
  // Lesen Section
  // ---------------------------------------------------------------------------

  function _renderLesenSection() {
    const exercises = examData.lesen || [];
    if (exercises.length === 0) {
      container.innerHTML = `
        <div class="exam-section">
          <div class="exam-section__header">
            <h2>Lesen</h2>
            <p class="text-muted">Keine Lesetexte verfügbar. Dieser Abschnitt wird übersprungen.</p>
          </div>
          <button class="btn btn--accent" id="exam-next-section">Weiter zum nächsten Abschnitt</button>
        </div>`;
      container.querySelector('#exam-next-section').addEventListener('click', () => {
        examResults.lesen = { correct: 0, total: 0, percentage: 0 };
        _advanceSection();
      });
      return;
    }

    container.innerHTML = `
      <div class="exam-section">
        <div class="exam-section__header">
          <span class="badge badge--accent">Abschnitt 1 von 4</span>
          <h2>Lesen</h2>
          <p>Lesen Sie die folgenden Texte und beantworten Sie die Verständnisfragen. Sie haben 65 Minuten Zeit.</p>
        </div>
        <div class="exam-section__exercises" id="exam-lesen-exercises">
          ${exercises.map((passage, pi) => `
            <div class="exam-exercise" id="exam-lesen-${pi}">
              <h3 class="exam-exercise__title">Text ${pi + 1}: ${escapeHtml(passage.title)}</h3>
              <div class="exam-exercise__content" id="exam-lesen-content-${pi}"></div>
            </div>`).join('')}
        </div>
        <div class="exam-section__actions">
          <button class="btn btn--accent btn--lg" id="exam-lesen-submit">Abschnitt beenden</button>
        </div>
      </div>`;

    // Render each passage using ReadingModule helper
    exercises.forEach((passage, pi) => {
      const target = container.querySelector(`#exam-lesen-content-${pi}`);
      if (target && typeof ReadingModule !== 'undefined' && ReadingModule.renderPassageForExam) {
        ReadingModule.renderPassageForExam(target, passage);
      } else if (target) {
        target.innerHTML = `
          <div class="reading-passage__text">${passage.text.split(/\n\n+/).map(p => `<p>${escapeHtml(p)}</p>`).join('')}</div>
          <p class="text-muted">Fragen konnten nicht geladen werden.</p>`;
      }
    });

    container.querySelector('#exam-lesen-submit').addEventListener('click', () => {
      _collectLesenResults();
      _advanceSection();
    });
  }

  function _collectLesenResults() {
    const exercises = examData.lesen || [];
    let totalCorrect = 0;
    let totalQuestions = 0;

    exercises.forEach((passage, pi) => {
      const target = container.querySelector(`#exam-lesen-content-${pi}`);
      if (target && typeof ReadingModule !== 'undefined' && ReadingModule.getAnswersFromContainer) {
        const results = ReadingModule.getAnswersFromContainer(target, passage.questions || []);
        totalCorrect += results.filter(r => r.correct).length;
        totalQuestions += results.length;
      }
    });

    const pct = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    examResults.lesen = { correct: totalCorrect, total: totalQuestions, percentage: pct };
  }

  // ---------------------------------------------------------------------------
  // Hören Section
  // ---------------------------------------------------------------------------

  function _renderHoerenSection() {
    const exercises = examData.hoeren || [];
    if (exercises.length === 0) {
      container.innerHTML = `
        <div class="exam-section">
          <div class="exam-section__header">
            <h2>Hören</h2>
            <p class="text-muted">Keine Hörübungen verfügbar. Dieser Abschnitt wird übersprungen.</p>
          </div>
          <button class="btn btn--accent" id="exam-next-section">Weiter zum nächsten Abschnitt</button>
        </div>`;
      container.querySelector('#exam-next-section').addEventListener('click', () => {
        examResults.hoeren = { correct: 0, total: 0, percentage: 0 };
        _advanceSection();
      });
      return;
    }

    let currentExIdx = 0;
    let hoerenResults = { correct: 0, total: 0 };

    function renderHoerenExercise(idx) {
      const passage = exercises[idx];
      const replayLimit = 2;
      let replays = 0;

      container.innerHTML = `
        <div class="exam-section">
          <div class="exam-section__header">
            <span class="badge badge--accent">Abschnitt 2 von 4</span>
            <h2>Hören — Übung ${idx + 1} von ${exercises.length}</h2>
            <p>Hören Sie den Text und beantworten Sie die Fragen. Sie dürfen den Text höchstens zweimal anhören.</p>
          </div>

          <div class="exam-hoeren__controls">
            <button class="btn btn--accent" id="exam-hoeren-play">
              <span aria-hidden="true">&#9654;</span> Text anhören
            </button>
            <span class="badge badge--outline" id="exam-hoeren-replays">Noch nicht abgespielt</span>
          </div>

          <div class="exam-hoeren__questions" id="exam-hoeren-questions">
            ${_renderExamHoerenQuestions(passage.questions || [])}
          </div>

          <div class="exam-section__actions">
            <button class="btn btn--accent" id="exam-hoeren-next">${idx + 1 < exercises.length ? 'Nächste Hörübung' : 'Abschnitt beenden'}</button>
          </div>
        </div>`;

      // Play button
      container.querySelector('#exam-hoeren-play').addEventListener('click', () => {
        if (replays >= replayLimit) {
          showToast('Sie haben den Text bereits zweimal gehört.', 'warning');
          return;
        }
        replays++;
        const counterEl = container.querySelector('#exam-hoeren-replays');
        if (counterEl) counterEl.textContent = `Wiedergabe ${replays} von ${replayLimit}`;

        if (typeof ListeningModule !== 'undefined' && ListeningModule.speakForExam) {
          ListeningModule.speakForExam(passage.text, 0.9);
        } else {
          speak(passage.text);
        }
      });

      // Next/finish
      container.querySelector('#exam-hoeren-next').addEventListener('click', () => {
        if (typeof ListeningModule !== 'undefined' && ListeningModule.cancelForExam) {
          ListeningModule.cancelForExam();
        }
        // Collect answers for this exercise
        const questions = passage.questions || [];
        questions.forEach((q, qi) => {
          const checked = container.querySelector(`input[name="exam_hq_${qi}"]:checked`);
          const userAnswer = checked ? checked.value.toLowerCase().trim() : '';
          const correct = String(q.answer).toLowerCase().trim();
          if (userAnswer === correct) hoerenResults.correct++;
          hoerenResults.total++;
        });

        currentExIdx++;
        if (currentExIdx < exercises.length) {
          renderHoerenExercise(currentExIdx);
        } else {
          const pct = hoerenResults.total > 0 ? Math.round((hoerenResults.correct / hoerenResults.total) * 100) : 0;
          examResults.hoeren = { ...hoerenResults, percentage: pct };
          _advanceSection();
        }
      });
    }

    renderHoerenExercise(0);
  }

  function _renderExamHoerenQuestions(questions) {
    if (questions.length === 0) return '<p class="text-muted">Keine Fragen zu diesem Hörtext.</p>';

    return questions.map((q, idx) => {
      if (q.type === 'true_false') {
        return `
          <div class="question-card" data-question-index="${idx}">
            <p class="question-card__text"><strong>${idx + 1}.</strong> ${escapeHtml(q.question)}</p>
            <div class="question-card__options question-card__options--inline">
              <label class="radio-option"><input type="radio" name="exam_hq_${idx}" value="richtig" class="radio-input"><span class="radio-label">Richtig</span></label>
              <label class="radio-option"><input type="radio" name="exam_hq_${idx}" value="falsch" class="radio-input"><span class="radio-label">Falsch</span></label>
            </div>
          </div>`;
      }

      const opts = (q.options || []).map(opt => `
        <label class="radio-option">
          <input type="radio" name="exam_hq_${idx}" value="${escapeHtml(opt)}" class="radio-input">
          <span class="radio-label">${escapeHtml(opt)}</span>
        </label>`).join('');

      return `
        <div class="question-card" data-question-index="${idx}">
          <p class="question-card__text"><strong>${idx + 1}.</strong> ${escapeHtml(q.question)}</p>
          <div class="question-card__options">${opts}</div>
        </div>`;
    }).join('');
  }

  // ---------------------------------------------------------------------------
  // Schreiben Section
  // ---------------------------------------------------------------------------

  function _renderSchreibenSection() {
    const prompt = examData.schreiben;

    if (!prompt) {
      container.innerHTML = `
        <div class="exam-section">
          <div class="exam-section__header">
            <h2>Schreiben</h2>
            <p class="text-muted">Keine Schreibaufgabe verfügbar. Dieser Abschnitt wird übersprungen.</p>
          </div>
          <button class="btn btn--accent" id="exam-next-section">Weiter zum nächsten Abschnitt</button>
        </div>`;
      container.querySelector('#exam-next-section').addEventListener('click', () => {
        examResults.schreiben = { passed: 0, total: 1, percentage: 0 };
        _advanceSection();
      });
      return;
    }

    const pointsHtml = (prompt.points || []).map(p => `<li>${escapeHtml(p)}</li>`).join('');

    container.innerHTML = `
      <div class="exam-section">
        <div class="exam-section__header">
          <span class="badge badge--accent">Abschnitt 3 von 4</span>
          <h2>Schreiben</h2>
          <p>Sie haben 60 Minuten Zeit, um die folgende Aufgabe zu bearbeiten. Achten Sie auf die Mindestwortzahl.</p>
        </div>

        <div class="exam-schreiben__prompt">
          <h3>${escapeHtml(prompt.title)}</h3>
          <p>${escapeHtml(prompt.situation)}</p>
          ${pointsHtml ? `<div class="writing-exercise__points"><h4>Bearbeiten Sie folgende Punkte:</h4><ol>${pointsHtml}</ol></div>` : ''}
        </div>

        <div class="exam-schreiben__editor">
          <textarea class="textarea writing-textarea" id="exam-writing-text" rows="14" placeholder="Schreiben Sie hier Ihren Text..." aria-label="Prüfungs-Textfeld"></textarea>
          <div class="writing-exercise__meta">
            <span class="writing-word-count" id="exam-writing-word-count">0 Wörter</span>
            <span class="writing-min-words">Mindestens ${prompt.minWords} Wörter</span>
          </div>
        </div>

        <div class="exam-section__actions">
          <button class="btn btn--accent btn--lg" id="exam-schreiben-submit">Abschnitt beenden</button>
        </div>
      </div>`;

    // Word counter
    const textarea = container.querySelector('#exam-writing-text');
    const wordCountEl = container.querySelector('#exam-writing-word-count');
    if (textarea && wordCountEl) {
      textarea.addEventListener('input', () => {
        const count = textarea.value.trim().split(/\s+/).filter(w => w.length > 0).length;
        wordCountEl.textContent = count + ' ' + (count === 1 ? 'Wort' : 'Wörter');
        wordCountEl.classList.toggle('text-success', count >= prompt.minWords);
        wordCountEl.classList.toggle('text-warning', count > 0 && count < prompt.minWords);
      });
    }

    container.querySelector('#exam-schreiben-submit').addEventListener('click', () => {
      _collectSchreibenResults();
      _advanceSection();
    });
  }

  function _collectSchreibenResults() {
    const prompt = examData.schreiben;
    const textarea = container.querySelector('#exam-writing-text');
    const userText = textarea ? textarea.value.trim() : '';

    if (prompt && typeof WritingModule !== 'undefined' && WritingModule.evaluateTextForExam) {
      const result = WritingModule.evaluateTextForExam(prompt, userText);
      examResults.schreiben = {
        passed: result.passed,
        total: result.total,
        percentage: result.percentage,
        wordCount: result.wordCount,
        userText,
      };
    } else {
      const wordCount = userText.split(/\s+/).filter(w => w.length > 0).length;
      const pct = wordCount >= (prompt ? prompt.minWords : 80) ? 70 : 30;
      examResults.schreiben = { passed: 0, total: 1, percentage: pct, wordCount, userText };
    }
  }

  // ---------------------------------------------------------------------------
  // Sprechen Section
  // ---------------------------------------------------------------------------

  function _renderSprechenSection() {
    const prompts = examData.sprechen || [];
    if (prompts.length === 0) {
      container.innerHTML = `
        <div class="exam-section">
          <div class="exam-section__header">
            <h2>Sprechen</h2>
            <p class="text-muted">Keine Sprechaufgaben verfügbar.</p>
          </div>
          <button class="btn btn--accent" id="exam-next-section">Prüfung abschließen</button>
        </div>`;
      container.querySelector('#exam-next-section').addEventListener('click', () => {
        examResults.sprechen = { percentage: 0, selfRating: 0 };
        _advanceSection();
      });
      return;
    }

    let currentPromptIdx = 0;
    let speakingPhase = 'overview'; // 'overview' | 'preparation' | 'speaking' | 'done'
    let selfRatings = [];
    let prepInterval = null;

    function renderSpeakingPrompt(idx) {
      const prompt = prompts[idx];
      speakingPhase = 'overview';

      container.innerHTML = `
        <div class="exam-section">
          <div class="exam-section__header">
            <span class="badge badge--accent">Abschnitt 4 von 4</span>
            <h2>Sprechen — Aufgabe ${idx + 1} von ${prompts.length}</h2>
          </div>

          <div class="exam-sprechen__task">
            <h3>${escapeHtml(prompt.title)}</h3>
            <p class="exam-sprechen__instruction">${escapeHtml(prompt.instruction)}</p>
            <div class="exam-sprechen__tips">
              <h4>Hinweise:</h4>
              <ul>${prompt.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
            </div>
          </div>

          <div class="exam-sprechen__phases" id="exam-sprechen-phases">
            <button class="btn btn--accent btn--lg" id="exam-sprechen-start-prep">Vorbereitung starten (${prompt.preparation} Sekunden)</button>
          </div>

          <div class="exam-sprechen__self-eval" id="exam-sprechen-eval" hidden>
            <h4>Selbsteinschätzung</h4>
            <p>Wie gut ist Ihnen diese Aufgabe gelungen? Bitte bewerten Sie sich ehrlich.</p>
            <div class="exam-sprechen__rating">
              ${[1,2,3,4,5].map(n => `
                <label class="rating-option">
                  <input type="radio" name="exam_speaking_rating_${idx}" value="${n}" class="radio-input">
                  <span class="rating-label">${n} ${n === 1 ? '(schwach)' : n === 5 ? '(sehr gut)' : ''}</span>
                </label>`).join('')}
            </div>
            <button class="btn btn--accent" id="exam-sprechen-next">${idx + 1 < prompts.length ? 'Nächste Aufgabe' : 'Prüfung abschließen'}</button>
          </div>
        </div>`;

      // Start preparation
      container.querySelector('#exam-sprechen-start-prep').addEventListener('click', () => {
        const phasesEl = container.querySelector('#exam-sprechen-phases');
        let prepRemaining = prompt.preparation;

        phasesEl.innerHTML = `
          <div class="exam-sprechen__timer">
            <p>Vorbereitungszeit: <strong id="exam-prep-time">${prepRemaining}</strong> Sekunden</p>
            <div class="progress-bar"><div class="progress-bar__fill progress-bar__fill--accent" id="exam-prep-bar" style="width: 100%"></div></div>
          </div>`;

        prepInterval = setInterval(() => {
          prepRemaining--;
          const timeEl = phasesEl.querySelector('#exam-prep-time');
          const barEl = phasesEl.querySelector('#exam-prep-bar');
          if (timeEl) timeEl.textContent = prepRemaining;
          if (barEl) barEl.style.width = Math.round((prepRemaining / prompt.preparation) * 100) + '%';

          if (prepRemaining <= 0) {
            clearInterval(prepInterval);
            _startSpeakingPhase(prompt, phasesEl, idx);
          }
        }, 1000);
      });

      // Next button in self-eval
      setTimeout(() => {
        const nextBtn = container.querySelector('#exam-sprechen-next');
        if (nextBtn) {
          nextBtn.addEventListener('click', () => {
            const checked = container.querySelector(`input[name="exam_speaking_rating_${idx}"]:checked`);
            selfRatings.push(checked ? parseInt(checked.value, 10) : 3);

            currentPromptIdx++;
            if (currentPromptIdx < prompts.length) {
              renderSpeakingPrompt(currentPromptIdx);
            } else {
              // Calculate speaking result based on self-ratings
              const avg = selfRatings.reduce((s, r) => s + r, 0) / selfRatings.length;
              const pct = Math.round((avg / 5) * 100);
              examResults.sprechen = { percentage: pct, selfRatings };
              _advanceSection();
            }
          });
        }
      }, 100);
    }

    function _startSpeakingPhase(prompt, phasesEl, idx) {
      let speakRemaining = prompt.speaking;

      phasesEl.innerHTML = `
        <div class="exam-sprechen__timer exam-sprechen__timer--speaking">
          <p>Jetzt sprechen! Verbleibende Zeit: <strong id="exam-speak-time">${speakRemaining}</strong> Sekunden</p>
          <div class="progress-bar"><div class="progress-bar__fill progress-bar__fill--success" id="exam-speak-bar" style="width: 100%"></div></div>
        </div>`;

      showToast('Ihre Vorbereitungszeit ist abgelaufen. Bitte beginnen Sie jetzt zu sprechen.', 'info', 3000);

      const speakInterval = setInterval(() => {
        speakRemaining--;
        const timeEl = phasesEl.querySelector('#exam-speak-time');
        const barEl = phasesEl.querySelector('#exam-speak-bar');
        if (timeEl) timeEl.textContent = speakRemaining;
        if (barEl) barEl.style.width = Math.round((speakRemaining / prompt.speaking) * 100) + '%';

        if (speakRemaining <= 0) {
          clearInterval(speakInterval);
          phasesEl.innerHTML = '<p class="text-success">Die Sprechzeit ist beendet. Bitte bewerten Sie sich selbst.</p>';
          const evalEl = container.querySelector('#exam-sprechen-eval');
          if (evalEl) evalEl.hidden = false;
        }
      }, 1000);
    }

    renderSpeakingPrompt(0);
  }

  // ---------------------------------------------------------------------------
  // Collect current section results (for early termination)
  // ---------------------------------------------------------------------------

  function _collectCurrentSectionResults() {
    if (currentSectionIndex < 0 || currentSectionIndex >= SECTIONS.length) return;
    const section = SECTIONS[currentSectionIndex];

    switch (section.key) {
      case 'lesen':
        if (!examResults.lesen) _collectLesenResults();
        break;
      case 'hoeren':
        if (!examResults.hoeren) {
          examResults.hoeren = { correct: 0, total: 1, percentage: 0 };
        }
        break;
      case 'schreiben':
        if (!examResults.schreiben) _collectSchreibenResults();
        break;
      case 'sprechen':
        if (!examResults.sprechen) {
          examResults.sprechen = { percentage: 0, selfRatings: [] };
        }
        break;
    }

    // Fill in any remaining sections
    SECTIONS.forEach(sec => {
      if (!examResults[sec.key]) {
        examResults[sec.key] = { correct: 0, total: 0, percentage: 0 };
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Finish Exam & Results
  // ---------------------------------------------------------------------------

  function _finishExam() {
    _stopTimer();
    examActive = false;

    // Show/hide toolbar buttons
    const startBtn = document.querySelector('[data-action="exam-start"]');
    const endBtn = document.querySelector('[data-action="exam-end"]');
    if (startBtn) startBtn.hidden = false;
    if (endBtn) endBtn.hidden = true;

    // Reset timer display
    const display = document.getElementById('exam-timer-value');
    if (display) display.textContent = '00:00';

    // Ensure all sections have results
    SECTIONS.forEach(sec => {
      if (!examResults[sec.key]) {
        examResults[sec.key] = { correct: 0, total: 0, percentage: 0 };
      }
    });

    // Calculate overall
    const sectionPercentages = SECTIONS.map(sec => examResults[sec.key].percentage || 0);
    const totalPercentage = Math.round(
      sectionPercentages.reduce((sum, p) => sum + p, 0) / SECTIONS.length
    );
    const allPassed = sectionPercentages.every(p => p >= PASS_THRESHOLD);
    const overallPassed = allPassed && totalPercentage >= PASS_THRESHOLD;

    // Render results
    _renderResults(overallPassed, totalPercentage);

    // Save to storage
    _saveExamResults(overallPassed, totalPercentage);
  }

  function _renderResults(passed, totalPercentage) {
    container.innerHTML = `
      <div class="exam-results">
        <div class="exam-results__header ${passed ? 'exam-results__header--passed' : 'exam-results__header--failed'}">
          <h2>${passed ? 'Herzlichen Glückwunsch!' : 'Leider nicht bestanden'}</h2>
          <p class="exam-results__verdict">${passed
            ? 'Sie haben die Probeprüfung erfolgreich bestanden. Ihre Vorbereitung zahlt sich aus.'
            : 'Sie haben die Probeprüfung diesmal nicht bestanden. Lassen Sie sich nicht entmutigen — Übung führt zum Ziel.'}</p>
          <div class="exam-results__total">
            <span class="exam-results__percentage">${totalPercentage}%</span>
            <span class="exam-results__label">Gesamtergebnis</span>
          </div>
        </div>

        <div class="exam-results__sections">
          <h3>Ergebnisse nach Abschnitt</h3>
          <div class="exam-results__grid">
            ${SECTIONS.map(sec => {
              const result = examResults[sec.key] || {};
              const pct = result.percentage || 0;
              const secPassed = pct >= PASS_THRESHOLD;
              return `
                <div class="exam-result-card ${secPassed ? 'exam-result-card--passed' : 'exam-result-card--failed'}">
                  <div class="exam-result-card__header">
                    <span class="exam-result-card__icon" aria-hidden="true">${sec.icon}</span>
                    <h4>${sec.label}</h4>
                  </div>
                  <div class="exam-result-card__score">${pct}%</div>
                  <div class="exam-result-card__status">${secPassed ? 'Bestanden' : 'Nicht bestanden'}</div>
                  ${result.correct !== undefined && result.total ? `<div class="exam-result-card__detail">${result.correct} von ${result.total} richtig</div>` : ''}
                  <div class="progress-bar">
                    <div class="progress-bar__fill ${secPassed ? 'progress-bar__fill--success' : 'progress-bar__fill--danger'}" style="width: ${pct}%"></div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>

        ${_renderDetailedReview()}

        <div class="exam-results__actions">
          <a href="#home" class="btn btn--outline">Zur Startseite</a>
          <button class="btn btn--accent" id="exam-restart">Neue Prüfung ablegen</button>
        </div>
      </div>`;

    // Restart button
    const restartBtn = container.querySelector('#exam-restart');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => _renderStartScreen());
    }
  }

  function _renderDetailedReview() {
    let reviewHtml = '<div class="exam-results__review"><h3>Detaillierte Auswertung</h3>';

    // Lesen review
    const lesenExercises = examData.lesen || [];
    if (lesenExercises.length > 0 && examResults.lesen) {
      reviewHtml += '<div class="exam-review-section"><h4>Lesen</h4>';
      reviewHtml += `<p>Ergebnis: ${examResults.lesen.correct} von ${examResults.lesen.total} Fragen richtig beantwortet (${examResults.lesen.percentage}%).</p>`;
      reviewHtml += '</div>';
    }

    // Hören review
    if (examResults.hoeren) {
      reviewHtml += '<div class="exam-review-section"><h4>Hören</h4>';
      reviewHtml += `<p>Ergebnis: ${examResults.hoeren.correct || 0} von ${examResults.hoeren.total || 0} Fragen richtig beantwortet (${examResults.hoeren.percentage}%).</p>`;
      reviewHtml += '</div>';
    }

    // Schreiben review
    if (examResults.schreiben) {
      reviewHtml += '<div class="exam-review-section"><h4>Schreiben</h4>';
      reviewHtml += `<p>Erfüllte Kriterien: ${examResults.schreiben.passed || 0} von ${examResults.schreiben.total || 0} (${examResults.schreiben.percentage}%).</p>`;
      if (examResults.schreiben.wordCount !== undefined) {
        reviewHtml += `<p>Wortanzahl: ${examResults.schreiben.wordCount}</p>`;
      }
      reviewHtml += '</div>';
    }

    // Sprechen review
    if (examResults.sprechen) {
      reviewHtml += '<div class="exam-review-section"><h4>Sprechen</h4>';
      reviewHtml += `<p>Selbsteinschätzung: ${examResults.sprechen.percentage}%</p>`;
      if (examResults.sprechen.selfRatings && examResults.sprechen.selfRatings.length > 0) {
        reviewHtml += `<p>Einzelbewertungen: ${examResults.sprechen.selfRatings.join(', ')} von 5</p>`;
      }
      reviewHtml += '</div>';
    }

    reviewHtml += '</div>';
    return reviewHtml;
  }

  // ---------------------------------------------------------------------------
  // Save exam results
  // ---------------------------------------------------------------------------

  function _saveExamResults(passed, totalPercentage) {
    const result = {
      timestamp: new Date().toISOString(),
      passed,
      totalPercentage,
      sections: {},
    };

    SECTIONS.forEach(sec => {
      result.sections[sec.key] = examResults[sec.key] || { percentage: 0 };
    });

    const history = Storage.get('exam_results', []);
    history.push(result);
    Storage.set('exam_results', history);

    // Update module progress
    const bestScore = Math.max(
      totalPercentage,
      Storage.getProgress('exam').score || 0
    );
    Storage.saveProgress('exam', {
      completed: history.length,
      total: history.length,
      score: bestScore,
    });

    App.recordPractice();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function _formatDate(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  // ---------------------------------------------------------------------------
  // Module interface
  // ---------------------------------------------------------------------------

  return {
    init,
    render,
    destroy,
  };

})();

App.registerModule('exam', ExamModule);
