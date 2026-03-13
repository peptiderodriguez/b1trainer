// =============================================================================
// listening.js — Hörverstehen module for B1 Goethe Trainer
// =============================================================================

'use strict';

const ListeningModule = (() => {

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let container = null;
  let data = null;
  let currentExercise = null;
  let currentMode = null; // 'hoerverstehen' | 'diktat' | 'medizin'
  let replayCount = 0;
  let maxReplays = Infinity;
  let speechRate = 1.0;
  let currentUtterance = null;
  let isPaused = false;
  let examMode = false;
  let score = { correct: 0, total: 0 };
  let _toolbarHandler = null;

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  function init(el, appData) {
    container = el;
    data = appData;
  }

  function render(_container, subRoute) {
    _bindToolbar();
    if (subRoute) {
      switch (subRoute) {
        case 'hoerverstehen': _startHoerverstehen(); return;
        case 'diktat': _startDiktat(); return;
        case 'medizin': _startMedizin(); return;
      }
    }
    _renderExerciseSelector();
  }

  function destroy() {
    _cancelSpeech();
    if (_toolbarHandler) {
      document.removeEventListener('click', _toolbarHandler);
      _toolbarHandler = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Toolbar bindings
  // ---------------------------------------------------------------------------

  function _bindToolbar() {
    if (_toolbarHandler) document.removeEventListener('click', _toolbarHandler);
    _toolbarHandler = (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      switch (btn.getAttribute('data-action')) {
        case 'listening-play':
          _handlePlay();
          break;
        case 'listening-slow':
          _cycleSpeechRate();
          break;
        case 'listening-repeat':
          _handleRepeat();
          break;
      }
    };
    document.addEventListener('click', _toolbarHandler);
  }

  // ---------------------------------------------------------------------------
  // Exercise Selector
  // ---------------------------------------------------------------------------

  function _renderExerciseSelector() {
    const passages = _getPassages();
    const scenarios = _getScenarios();
    const vocabSentences = _getVocabSentences();

    container.innerHTML = `
      <div class="listening-selector">
        <div class="listening-selector__intro">
          <p>Wählen Sie eine Übungsform, um Ihr Hörverstehen gezielt zu schulen. Alle Übungen verwenden die Sprachsynthese Ihres Browsers, um authentische Hörsituationen nachzubilden.</p>
        </div>

        <div class="listening-selector__options">
          <div class="card card--hoverable listening-option" data-mode="hoerverstehen">
            <div class="card__icon" aria-hidden="true">&#127911;</div>
            <h3 class="card__title">Hörverstehen</h3>
            <p class="card__desc">Hören Sie einen Text und beantworten Sie Verständnisfragen, ohne den geschriebenen Text zu sehen. Genau wie in der echten Prüfung.</p>
            <span class="card__meta">${passages.length} Texte verfügbar</span>
          </div>

          <div class="card card--hoverable listening-option" data-mode="diktat">
            <div class="card__icon" aria-hidden="true">&#9997;</div>
            <h3 class="card__title">Diktat</h3>
            <p class="card__desc">Ein Satz wird Ihnen vorgelesen. Schreiben Sie ihn so genau wie möglich auf. Abweichungen werden farblich hervorgehoben.</p>
            <span class="card__meta">${vocabSentences.length} Sätze verfügbar</span>
          </div>

          <div class="card card--hoverable listening-option" data-mode="medizin">
            <div class="card__icon" aria-hidden="true">&#9764;</div>
            <h3 class="card__title">Medizinisches Gespräch</h3>
            <p class="card__desc">Hören Sie ein Arzt-Patienten-Gespräch und beantworten Sie Fragen zu Symptomen, Diagnose und Behandlung.</p>
            <span class="card__meta">${scenarios.length} Szenarien verfügbar</span>
          </div>
        </div>

        <div class="listening-selector__settings">
          <label class="toggle-label">
            <input type="checkbox" id="listening-exam-mode" class="toggle-input">
            <span class="toggle-switch"></span>
            Prüfungsmodus (maximal 2 Wiederholungen)
          </label>
        </div>
      </div>`;

    // Bind mode selection
    container.querySelectorAll('.listening-option').forEach(card => {
      card.addEventListener('click', () => {
        const mode = card.getAttribute('data-mode');
        const examCheckbox = container.querySelector('#listening-exam-mode');
        examMode = examCheckbox ? examCheckbox.checked : false;
        maxReplays = examMode ? 2 : Infinity;
        window.location.hash = '#listening/' + mode;
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Data helpers
  // ---------------------------------------------------------------------------

  function _getPassages() {
    return (data.reading && data.reading.passages) || [];
  }

  function _getScenarios() {
    return (data.medical && data.medical.scenarios) || [];
  }

  function _getVocabSentences() {
    const vocab = data.vocabulary || [];
    return vocab
      .filter(v => v.sentence && v.sentence.length > 10)
      .map(v => ({ text: v.sentence, word: v.word, translation: v.translation }));
  }

  // ---------------------------------------------------------------------------
  // Speech helpers
  // ---------------------------------------------------------------------------

  function _speak(text, rate, onEnd) {
    if (!('speechSynthesis' in window)) {
      showToast('Ihr Browser unterstützt leider keine Sprachausgabe.', 'error');
      return;
    }

    _cancelSpeech();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = rate || speechRate;
    utterance.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const germanVoice = voices.find(v => v.lang.startsWith('de') && v.localService) ||
                        voices.find(v => v.lang.startsWith('de'));
    if (germanVoice) utterance.voice = germanVoice;

    if (typeof onEnd === 'function') {
      utterance.onend = onEnd;
    }

    currentUtterance = utterance;
    isPaused = false;
    window.speechSynthesis.speak(utterance);
  }

  function _cancelSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    currentUtterance = null;
    isPaused = false;
  }

  function _pauseResumeSpeech() {
    if (!('speechSynthesis' in window)) return;
    if (isPaused) {
      window.speechSynthesis.resume();
      isPaused = false;
    } else {
      window.speechSynthesis.pause();
      isPaused = true;
    }
  }

  function _handlePlay() {
    if (currentMode === 'hoerverstehen' && currentExercise) {
      if (isPaused) {
        _pauseResumeSpeech();
        return;
      }
      if (replayCount >= maxReplays) {
        showToast('Die maximale Anzahl an Wiederholungen ist erreicht.', 'warning');
        return;
      }
      replayCount++;
      _speak(currentExercise.text, speechRate, () => {
        _updateReplayCounter();
      });
      _updateReplayCounter();
    } else if (currentMode === 'diktat' && currentExercise) {
      if (replayCount >= maxReplays) {
        showToast('Die maximale Anzahl an Wiederholungen ist erreicht.', 'warning');
        return;
      }
      replayCount++;
      _speak(currentExercise.text, 0.7);
      _updateReplayCounter();
    } else if (currentMode === 'medizin' && currentExercise) {
      if (replayCount >= maxReplays) {
        showToast('Die maximale Anzahl an Wiederholungen ist erreicht.', 'warning');
        return;
      }
      replayCount++;
      _speak(currentExercise.dialogueText, speechRate);
      _updateReplayCounter();
    }
  }

  function _handleRepeat() {
    _handlePlay();
  }

  function _cycleSpeechRate() {
    const rates = [0.7, 0.85, 1.0];
    const labels = ['Langsam (0.7x)', 'Gemäßigt (0.85x)', 'Normal (1.0x)'];
    const currentIdx = rates.indexOf(speechRate);
    const nextIdx = (currentIdx + 1) % rates.length;
    speechRate = rates[nextIdx];

    const slowBtn = document.querySelector('[data-action="listening-slow"]');
    if (slowBtn) {
      slowBtn.textContent = labels[nextIdx];
    }

    showToast(`Sprechgeschwindigkeit: ${labels[nextIdx]}`, 'info', 2000);
  }

  function _updateReplayCounter() {
    const counter = container.querySelector('#replay-counter');
    if (counter) {
      if (maxReplays === Infinity) {
        counter.textContent = `Wiedergabe ${replayCount}`;
      } else {
        counter.textContent = `Wiedergabe ${replayCount} von ${maxReplays}`;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Hörverstehen
  // ---------------------------------------------------------------------------

  function _startHoerverstehen() {
    currentMode = 'hoerverstehen';
    replayCount = 0;
    score = { correct: 0, total: 0 };

    const passages = _getPassages();
    if (passages.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__text">Für das Hörverstehen werden Lesetexte benötigt, die derzeit nicht verfügbar sind.</p>
          <a href="#listening" class="btn btn--outline">Zurück</a>
        </div>`;
      return;
    }

    const passage = pickRandom(passages, 1)[0];
    currentExercise = passage;

    container.innerHTML = `
      <div class="listening-exercise">
        <div class="listening-exercise__nav">
          <a href="#listening" class="btn btn--outline btn--sm">&larr; Zurück zur Auswahl</a>
          <span class="badge badge--info" id="replay-counter">Noch nicht abgespielt</span>
        </div>

        <div class="listening-exercise__instructions">
          <h3>Hörverstehen</h3>
          <p>Sie hören gleich einen Text. Beantworten Sie anschließend die Fragen, ohne den geschriebenen Text zu sehen. Nutzen Sie die Steuerung in der Werkzeugleiste, um den Text abzuspielen.</p>
          ${examMode ? '<p class="text-warning">Prüfungsmodus: Sie dürfen den Text höchstens zweimal anhören.</p>' : ''}
        </div>

        <div class="listening-exercise__controls">
          <button class="btn btn--accent" id="hv-play">
            <span aria-hidden="true">&#9654;</span> Text anhören
          </button>
          <button class="btn btn--outline" id="hv-pause">
            <span aria-hidden="true">&#10074;&#10074;</span> Pause
          </button>
          <div class="speed-selector">
            <label>Tempo:</label>
            <button class="btn btn--sm btn--outline" data-speed="0.7">0.7x</button>
            <button class="btn btn--sm btn--outline" data-speed="0.85">0.85x</button>
            <button class="btn btn--sm btn--accent" data-speed="1.0">1.0x</button>
          </div>
        </div>

        <section class="listening-exercise__questions" id="hv-questions">
          <h3 class="reading-questions__heading">Fragen zum Gehörten</h3>
          ${_renderHVQuestions(passage.questions || [])}
        </section>

        <div class="listening-exercise__actions">
          <button class="btn btn--accent btn--lg" id="hv-check">Antworten prüfen</button>
        </div>

        <div class="listening-exercise__results" id="hv-results" hidden></div>
      </div>`;

    _bindHVEvents(passage);
  }

  function _renderHVQuestions(questions) {
    if (questions.length === 0) {
      return '<p class="text-muted">Zu diesem Hörtext liegen leider keine Fragen vor.</p>';
    }

    return questions.map((q, idx) => {
      if (q.type === 'true_false') {
        return `
          <div class="question-card" data-question-index="${idx}">
            <p class="question-card__text"><strong>${idx + 1}.</strong> ${escapeHtml(q.question)}</p>
            <div class="question-card__options question-card__options--inline">
              <label class="radio-option"><input type="radio" name="hv_q${idx}" value="richtig" class="radio-input"><span class="radio-label">Richtig</span></label>
              <label class="radio-option"><input type="radio" name="hv_q${idx}" value="falsch" class="radio-input"><span class="radio-label">Falsch</span></label>
            </div>
            <div class="question-card__feedback" hidden></div>
          </div>`;
      }

      const opts = (q.options || []).map((opt, i) => `
        <label class="radio-option">
          <input type="radio" name="hv_q${idx}" value="${escapeHtml(opt)}" class="radio-input">
          <span class="radio-label">${escapeHtml(opt)}</span>
        </label>`).join('');

      return `
        <div class="question-card" data-question-index="${idx}">
          <p class="question-card__text"><strong>${idx + 1}.</strong> ${escapeHtml(q.question)}</p>
          <div class="question-card__options">${opts}</div>
          <div class="question-card__feedback" hidden></div>
        </div>`;
    }).join('');
  }

  function _bindHVEvents(passage) {
    // Play
    const playBtn = container.querySelector('#hv-play');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (replayCount >= maxReplays) {
          showToast('Sie haben die maximale Anzahl an Wiederholungen bereits ausgeschöpft.', 'warning');
          return;
        }
        replayCount++;
        _speak(passage.text, speechRate, () => {
          showToast('Der Text wurde vollständig vorgelesen. Beantworten Sie nun die Fragen.', 'info');
        });
        _updateReplayCounter();
      });
    }

    // Pause
    const pauseBtn = container.querySelector('#hv-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', _pauseResumeSpeech);
    }

    // Speed buttons
    container.querySelectorAll('[data-speed]').forEach(btn => {
      btn.addEventListener('click', () => {
        speechRate = parseFloat(btn.getAttribute('data-speed'));
        container.querySelectorAll('[data-speed]').forEach(b => {
          b.classList.toggle('btn--accent', b === btn);
          b.classList.toggle('btn--outline', b !== btn);
        });
      });
    });

    // Check
    const checkBtn = container.querySelector('#hv-check');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => _checkHVAnswers(passage));
    }
  }

  function _checkHVAnswers(passage) {
    const questions = passage.questions || [];
    let correct = 0;

    questions.forEach((q, idx) => {
      const card = container.querySelector(`[data-question-index="${idx}"]`);
      if (!card) return;

      const checked = card.querySelector(`input[name="hv_q${idx}"]:checked`);
      const userAnswer = checked ? checked.value.toLowerCase().trim() : '';
      const correctAnswer = String(q.answer).toLowerCase().trim();
      const isCorrect = userAnswer === correctAnswer;

      if (isCorrect) correct++;

      const feedbackEl = card.querySelector('.question-card__feedback');
      card.classList.add(isCorrect ? 'question-card--correct' : 'question-card--wrong');

      const correctLabel = q.type === 'true_false'
        ? (correctAnswer === 'richtig' ? 'Richtig' : 'Falsch')
        : q.answer;

      feedbackEl.innerHTML = isCorrect
        ? `<span class="feedback feedback--correct">Sehr gut erkannt!</span>
           ${q.explanation ? `<p class="feedback__explanation">${escapeHtml(q.explanation)}</p>` : ''}`
        : `<span class="feedback feedback--wrong">Das war leider nicht korrekt.</span>
           <p class="feedback__correct">Richtige Antwort: <strong>${escapeHtml(String(correctLabel))}</strong></p>
           ${q.explanation ? `<p class="feedback__explanation">${escapeHtml(q.explanation)}</p>` : ''}`;
      feedbackEl.hidden = false;
      card.querySelectorAll('input').forEach(i => i.disabled = true);
    });

    _cancelSpeech();
    _showHVResults(correct, questions.length, passage);
  }

  function _showHVResults(correct, total, passage) {
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = pct >= 60;
    const resultsEl = container.querySelector('#hv-results');
    if (!resultsEl) return;

    resultsEl.innerHTML = `
      <div class="results-card ${passed ? 'results-card--passed' : 'results-card--failed'}">
        <h3 class="results-card__title">Ihr Ergebnis beim Hörverstehen</h3>
        <div class="results-card__score">
          <span class="results-card__number">${correct}</span>
          <span class="results-card__separator">von</span>
          <span class="results-card__total">${total}</span>
        </div>
        <div class="results-card__percentage">${pct}%</div>
        <p class="results-card__verdict">${passed
          ? 'Vorbildlich! Ihr Hörverständnis ist auf einem sehr guten Niveau.'
          : 'Noch nicht ganz sicher. Hören Sie regelmäßig deutsche Texte, um Ihr Verständnis zu vertiefen.'}</p>
        <button class="btn btn--outline" id="hv-show-text">Text einblenden</button>
        <div class="results-card__actions">
          <a href="#listening" class="btn btn--outline">Zur Auswahl</a>
          <button class="btn btn--accent" id="hv-next">Nächste Übung</button>
        </div>
      </div>`;

    resultsEl.hidden = false;

    // Show text toggle
    const showTextBtn = resultsEl.querySelector('#hv-show-text');
    if (showTextBtn) {
      showTextBtn.addEventListener('click', () => {
        showModal('Originaltext: ' + (passage.title || 'Lesetext'), `<div class="reading-passage__text">${passage.text.split(/\n\n+/).map(p => `<p>${escapeHtml(p)}</p>`).join('')}</div>`);
      });
    }

    // Next exercise
    const nextBtn = resultsEl.querySelector('#hv-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => _startHoerverstehen());
    }

    // Hide check button
    const checkBtn = container.querySelector('#hv-check');
    if (checkBtn) checkBtn.hidden = true;

    _saveListeningProgress(correct, total, 'hoerverstehen');
  }

  // ---------------------------------------------------------------------------
  // Diktat
  // ---------------------------------------------------------------------------

  function _startDiktat() {
    currentMode = 'diktat';
    replayCount = 0;

    const sentences = _getVocabSentences();
    if (sentences.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__text">Für das Diktat werden Vokabelsätze benötigt, die derzeit noch nicht geladen sind.</p>
          <a href="#listening" class="btn btn--outline">Zurück</a>
        </div>`;
      return;
    }

    const selected = pickRandom(sentences, 5);
    let currentIndex = 0;

    function renderDiktatSentence(idx) {
      const sentence = selected[idx];
      currentExercise = sentence;

      container.innerHTML = `
        <div class="listening-exercise">
          <div class="listening-exercise__nav">
            <a href="#listening" class="btn btn--outline btn--sm">&larr; Zurück</a>
            <span class="badge badge--info">Satz ${idx + 1} von ${selected.length}</span>
            <span class="badge badge--outline" id="replay-counter">Noch nicht abgespielt</span>
          </div>

          <div class="listening-exercise__instructions">
            <h3>Diktat</h3>
            <p>Hören Sie den Satz aufmerksam an und schreiben Sie ihn so genau wie möglich auf. Achten Sie besonders auf Groß- und Kleinschreibung sowie Umlaute.</p>
          </div>

          <div class="listening-exercise__controls">
            <button class="btn btn--accent" id="diktat-play">
              <span aria-hidden="true">&#9654;</span> Satz anhören
            </button>
            <button class="btn btn--outline" id="diktat-play-slow">
              <span aria-hidden="true">&#128034;</span> Langsam abspielen
            </button>
          </div>

          <div class="diktat-input">
            <textarea class="textarea" id="diktat-text" rows="3" placeholder="Schreiben Sie hier, was Sie gehört haben..." aria-label="Diktat-Eingabe"></textarea>
          </div>

          <div class="listening-exercise__actions">
            <button class="btn btn--accent" id="diktat-check">Überprüfen</button>
          </div>

          <div class="diktat-result" id="diktat-result" hidden></div>
        </div>`;

      replayCount = 0;

      // Play
      container.querySelector('#diktat-play').addEventListener('click', () => {
        replayCount++;
        _speak(sentence.text, 0.85);
        _updateReplayCounter();
      });

      // Slow play
      container.querySelector('#diktat-play-slow').addEventListener('click', () => {
        replayCount++;
        _speak(sentence.text, 0.6);
        _updateReplayCounter();
      });

      // Check
      container.querySelector('#diktat-check').addEventListener('click', () => {
        const userText = container.querySelector('#diktat-text').value.trim();
        _checkDiktat(sentence.text, userText, idx, selected.length, () => {
          currentIndex++;
          if (currentIndex < selected.length) {
            renderDiktatSentence(currentIndex);
          } else {
            _showDiktatFinalResults();
          }
        });
      });
    }

    score = { correct: 0, total: selected.length };
    renderDiktatSentence(0);
  }

  function _checkDiktat(original, userText, idx, total, onNext) {
    _cancelSpeech();
    const resultEl = container.querySelector('#diktat-result');
    if (!resultEl) return;

    const comparison = _compareDiktat(original, userText);
    const isCorrect = comparison.accuracy >= 90;
    if (isCorrect) score.correct++;

    resultEl.innerHTML = `
      <div class="diktat-feedback ${isCorrect ? 'diktat-feedback--correct' : 'diktat-feedback--wrong'}">
        <h4>${isCorrect ? 'Sehr gut getroffen!' : 'Da gibt es noch Verbesserungspotenzial.'}</h4>
        <div class="diktat-feedback__accuracy">
          <span>Übereinstimmung: <strong>${comparison.accuracy}%</strong></span>
        </div>
        <div class="diktat-feedback__comparison">
          <div class="diktat-feedback__row">
            <span class="diktat-feedback__label">Original:</span>
            <span class="diktat-feedback__text">${escapeHtml(original)}</span>
          </div>
          <div class="diktat-feedback__row">
            <span class="diktat-feedback__label">Ihre Eingabe:</span>
            <span class="diktat-feedback__text">${comparison.highlightedHtml}</span>
          </div>
        </div>
        <div class="diktat-feedback__actions">
          <button class="btn btn--accent" id="diktat-next">${idx + 1 < total ? 'Nächster Satz' : 'Ergebnis anzeigen'}</button>
        </div>
      </div>`;

    resultEl.hidden = false;
    container.querySelector('#diktat-check').hidden = true;

    container.querySelector('#diktat-next').addEventListener('click', onNext);
  }

  function _compareDiktat(original, userText) {
    const origWords = original.trim().split(/\s+/);
    const userWords = userText.trim().split(/\s+/);
    let matchCount = 0;

    const highlightedParts = userWords.map((word, i) => {
      if (i < origWords.length && word.toLowerCase() === origWords[i].toLowerCase()) {
        matchCount++;
        return `<span class="diktat-match">${escapeHtml(word)}</span>`;
      } else {
        return `<span class="diktat-mismatch">${escapeHtml(word)}</span>`;
      }
    });

    const accuracy = origWords.length > 0
      ? Math.round((matchCount / origWords.length) * 100)
      : 0;

    return {
      accuracy: Math.min(accuracy, 100),
      highlightedHtml: highlightedParts.join(' ') || '<em>(keine Eingabe)</em>',
    };
  }

  function _showDiktatFinalResults() {
    const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

    container.innerHTML = `
      <div class="results-card ${pct >= 60 ? 'results-card--passed' : 'results-card--failed'}">
        <h3 class="results-card__title">Diktat-Ergebnis</h3>
        <div class="results-card__score">
          <span class="results-card__number">${score.correct}</span>
          <span class="results-card__separator">von</span>
          <span class="results-card__total">${score.total}</span>
        </div>
        <div class="results-card__percentage">${pct}%</div>
        <p class="results-card__verdict">${pct >= 80
          ? 'Beeindruckend! Ihre Hörfähigkeit und Rechtschreibung sind ausgezeichnet.'
          : pct >= 60
            ? 'Gut gemacht. Mit etwas mehr Übung werden Sie noch sicherer.'
            : 'Bleiben Sie dran! Regelmäßiges Üben wird Ihnen helfen, die feinen Unterschiede besser wahrzunehmen.'}</p>
        <div class="results-card__actions">
          <a href="#listening" class="btn btn--outline">Zur Auswahl</a>
          <button class="btn btn--accent" onclick="window.location.hash='#listening/diktat'">Neues Diktat</button>
        </div>
      </div>`;

    _saveListeningProgress(score.correct, score.total, 'diktat');
  }

  // ---------------------------------------------------------------------------
  // Medizinisches Gespräch
  // ---------------------------------------------------------------------------

  function _startMedizin() {
    currentMode = 'medizin';
    replayCount = 0;

    const scenarios = _getScenarios();
    if (scenarios.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__text">Für das medizinische Hörverstehen werden Patientenszenarien benötigt, die derzeit nicht verfügbar sind.</p>
          <a href="#listening" class="btn btn--outline">Zurück</a>
        </div>`;
      return;
    }

    const scenario = pickRandom(scenarios, 1)[0];
    const dialogue = _buildMedicalDialogue(scenario);
    currentExercise = { ...scenario, dialogueText: dialogue.text };

    const questions = _buildMedicalQuestions(scenario);

    container.innerHTML = `
      <div class="listening-exercise">
        <div class="listening-exercise__nav">
          <a href="#listening" class="btn btn--outline btn--sm">&larr; Zurück</a>
          <span class="badge badge--info" id="replay-counter">Noch nicht abgespielt</span>
        </div>

        <div class="listening-exercise__instructions">
          <h3>Medizinisches Gespräch</h3>
          <p>Sie hören ein Gespräch zwischen einem Arzt und einem Patienten. Beantworten Sie anschließend die Fragen zu Symptomen, Diagnose und Behandlung.</p>
        </div>

        <div class="listening-exercise__controls">
          <button class="btn btn--accent" id="med-play">
            <span aria-hidden="true">&#9654;</span> Gespräch anhören
          </button>
          <button class="btn btn--outline" id="med-pause">
            <span aria-hidden="true">&#10074;&#10074;</span> Pause
          </button>
        </div>

        <section class="listening-exercise__questions" id="med-questions">
          <h3>Fragen zum Gespräch</h3>
          ${questions.map((q, idx) => `
            <div class="question-card" data-question-index="${idx}">
              <p class="question-card__text"><strong>${idx + 1}.</strong> ${escapeHtml(q.question)}</p>
              <div class="question-card__options">
                ${q.options.map((opt, oi) => `
                  <label class="radio-option">
                    <input type="radio" name="med_q${idx}" value="${escapeHtml(opt)}" class="radio-input">
                    <span class="radio-label">${escapeHtml(opt)}</span>
                  </label>`).join('')}
              </div>
              <div class="question-card__feedback" hidden></div>
            </div>`).join('')}
        </section>

        <div class="listening-exercise__actions">
          <button class="btn btn--accent btn--lg" id="med-check">Antworten prüfen</button>
        </div>

        <div class="listening-exercise__results" id="med-results" hidden></div>
      </div>`;

    // Play
    container.querySelector('#med-play').addEventListener('click', () => {
      if (replayCount >= maxReplays) {
        showToast('Maximale Wiederholungen erreicht.', 'warning');
        return;
      }
      replayCount++;
      _speak(dialogue.text, speechRate);
      _updateReplayCounter();
    });

    // Pause
    container.querySelector('#med-pause').addEventListener('click', _pauseResumeSpeech);

    // Check
    container.querySelector('#med-check').addEventListener('click', () => {
      _checkMedicalAnswers(questions, scenario);
    });
  }

  function _buildMedicalDialogue(scenario) {
    // Build a dialogue from scenario fields
    const name = scenario.patientName || 'der Patient';
    const symptoms = scenario.symptoms || scenario.complaint || 'unbekannte Beschwerden';
    const diagnosis = scenario.diagnosis || 'keine Diagnose angegeben';
    const treatment = scenario.treatment || scenario.therapy || 'eine entsprechende Behandlung';

    const text = `Arzt: Guten Tag, was führt Sie zu mir? ` +
      `Patient: Guten Tag, Herr Doktor. Ich bin ${name}. Ich habe seit einigen Tagen ${symptoms}. ` +
      `Arzt: Seit wann genau haben Sie diese Beschwerden? ` +
      `Patient: Seit ungefähr einer Woche. Es wird leider nicht besser. ` +
      `Arzt: Ich verstehe. Haben Sie noch weitere Symptome bemerkt? ` +
      `Patient: Ja, außerdem fühle ich mich allgemein sehr erschöpft. ` +
      `Arzt: Nach meiner Untersuchung lautet meine Diagnose: ${diagnosis}. ` +
      `Ich empfehle Ihnen folgende Behandlung: ${treatment}. ` +
      `Bitte kommen Sie in zwei Wochen zur Kontrolle wieder.`;

    return { text };
  }

  function _buildMedicalQuestions(scenario) {
    const name = scenario.patientName || 'der Patient';
    const symptoms = scenario.symptoms || scenario.complaint || 'Beschwerden';
    const diagnosis = scenario.diagnosis || 'keine Diagnose';
    const treatment = scenario.treatment || scenario.therapy || 'Behandlung';

    return [
      {
        question: 'Welche Beschwerden schildert der Patient?',
        options: [symptoms, 'Kopfschmerzen und Fieber', 'Rückenschmerzen seit einem Monat', 'Probleme beim Schlafen'],
        answer: symptoms,
      },
      {
        question: 'Wie lautet die Diagnose des Arztes?',
        options: ['Eine einfache Erkältung', diagnosis, 'Ein gebrochener Arm', 'Chronische Müdigkeit'],
        answer: diagnosis,
      },
      {
        question: 'Was empfiehlt der Arzt als Behandlung?',
        options: ['Sofortige Operation', 'Nur Bettruhe', treatment, 'Keine Behandlung nötig'],
        answer: treatment,
      },
      {
        question: 'Wann soll der Patient zur Kontrolle wiederkommen?',
        options: ['Morgen', 'In einer Woche', 'In zwei Wochen', 'In einem Monat'],
        answer: 'In zwei Wochen',
      },
    ].map(q => {
      // Shuffle options but keep the answer findable
      q.options = shuffleArray([...q.options]);
      return q;
    });
  }

  function _checkMedicalAnswers(questions, scenario) {
    _cancelSpeech();
    let correct = 0;

    questions.forEach((q, idx) => {
      const card = container.querySelector(`[data-question-index="${idx}"]`);
      if (!card) return;

      const checked = card.querySelector(`input[name="med_q${idx}"]:checked`);
      const userAnswer = checked ? checked.value.trim() : '';
      const isCorrect = userAnswer === q.answer;
      if (isCorrect) correct++;

      const feedbackEl = card.querySelector('.question-card__feedback');
      card.classList.add(isCorrect ? 'question-card--correct' : 'question-card--wrong');
      feedbackEl.innerHTML = isCorrect
        ? '<span class="feedback feedback--correct">Richtig verstanden!</span>'
        : `<span class="feedback feedback--wrong">Nicht ganz zutreffend.</span>
           <p class="feedback__correct">Korrekt wäre: <strong>${escapeHtml(q.answer)}</strong></p>`;
      feedbackEl.hidden = false;
      card.querySelectorAll('input').forEach(i => i.disabled = true);
    });

    const resultsEl = container.querySelector('#med-results');
    const pct = Math.round((correct / questions.length) * 100);
    resultsEl.innerHTML = `
      <div class="results-card ${pct >= 60 ? 'results-card--passed' : 'results-card--failed'}">
        <h3 class="results-card__title">Ergebnis: Medizinisches Gespräch</h3>
        <div class="results-card__score">
          <span class="results-card__number">${correct}</span>
          <span class="results-card__separator">von</span>
          <span class="results-card__total">${questions.length}</span>
        </div>
        <div class="results-card__percentage">${pct}%</div>
        <p class="results-card__verdict">${pct >= 60
          ? 'Gut gemacht! Sie können medizinische Gespräche schon recht sicher verfolgen.'
          : 'Medizinische Dialoge erfordern besondere Aufmerksamkeit. Üben Sie weiter mit verschiedenen Szenarien.'}</p>
        <div class="results-card__actions">
          <a href="#listening" class="btn btn--outline">Zur Auswahl</a>
          <button class="btn btn--accent" onclick="window.location.hash='#listening/medizin'">Neues Szenario</button>
        </div>
      </div>`;
    resultsEl.hidden = false;

    container.querySelector('#med-check').hidden = true;
    _saveListeningProgress(correct, questions.length, 'medizin');
  }

  // ---------------------------------------------------------------------------
  // Progress saving
  // ---------------------------------------------------------------------------

  function _saveListeningProgress(correct, total, type) {
    const history = Storage.get('listening_history', []);
    history.push({
      type,
      correct,
      total,
      percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
      timestamp: new Date().toISOString(),
    });
    Storage.set('listening_history', history);

    // Aggregate for module progress
    const totalExercises = history.length;
    const avgScore = Math.round(
      history.reduce((sum, h) => sum + h.percentage, 0) / totalExercises
    );

    Storage.saveProgress('listening', {
      completed: totalExercises,
      total: totalExercises,
      score: avgScore,
    });

    App.recordPractice();
  }

  // ---------------------------------------------------------------------------
  // Public API (for exam module)
  // ---------------------------------------------------------------------------

  function speakForExam(text, rate, onEnd) {
    _speak(text, rate, onEnd);
  }

  function cancelForExam() {
    _cancelSpeech();
  }

  // ---------------------------------------------------------------------------
  // Module interface
  // ---------------------------------------------------------------------------

  return {
    init,
    render,
    destroy,
    speakForExam,
    cancelForExam,
  };

})();

App.registerModule('listening', ListeningModule);
