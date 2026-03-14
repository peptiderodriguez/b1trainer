// =============================================================================
// vocabulary.js — Vocabulary training module for B1 Goethe Trainer
// =============================================================================

'use strict';

const VocabularyModule = (() => {

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  let _mode = null;           // 'flashcards' | 'fillin' | 'articles'
  let _cards = [];            // current deck of word objects
  let _index = 0;             // current position in deck
  let _score = 0;             // correct answers this round
  let _total = 0;             // total questions this round
  let _flipped = false;       // flashcard flip state
  let _answered = false;      // whether current question has been answered
  let _focusWeak = null;      // null = not yet chosen, true/false = user preference
  let _answers = [];           // fill-in & article answer history for back-navigation
  let _fcAnswers = [];         // flashcard answer history for back-navigation
  let _articleStats = { der: { correct: 0, total: 0 },
                        die: { correct: 0, total: 0 },
                        das: { correct: 0, total: 0 } };
  let _container = null;      // the #vocabulary-content element
  let _pageEl = null;         // the #page-vocabulary element
  let _boundKeyHandler = null;

  // ---------------------------------------------------------------------------
  // Helpers — data access
  // ---------------------------------------------------------------------------

  /** All vocabulary items, combined from nouns + verbs + other. */
  function _allWords() {
    return App.data.vocabulary || [];
  }

  /** Only nouns (items with type === 'noun' and an article). */
  function _allNouns() {
    return (App.data.nouns || []).filter(w => w.article && w.noun);
  }

  /** Only verbs. */
  function _allVerbs() {
    return (App.data.verbs || []).filter(w => w.conjugation);
  }

  /** Other words (adjectives, adverbs, prepositions, etc.). */
  function _allOther() {
    return App.data.other || [];
  }

  /**
   * Medical vocabulary, if available.  Falls back to an empty collection
   * so the rest of the code never has to null-check.
   */
  function _medicalData() {
    return App.data.medical || { bodyParts: [], symptoms: [], diseases: [], procedures: [] };
  }

  /** Flat list of all medical German words for tagging. */
  let _medicalWordSetCache = null;
  function _medicalWordSet() {
    if (_medicalWordSetCache) return _medicalWordSetCache;
    const m = _medicalData();
    const words = new Set();
    ['bodyParts', 'symptoms', 'diseases', 'procedures'].forEach(cat => {
      (m[cat] || []).forEach(item => {
        if (item.de)     words.add(item.de.toLowerCase());
        if (item.german) words.add(item.german.toLowerCase());
        if (item.word)   words.add(item.word.toLowerCase());
      });
    });
    return words;
  }

  /** Check whether a word object is medical vocabulary. */
  function _isMedical(wordObj) {
    const medWords = _medicalWordSet();
    if (medWords.size === 0) return false;
    const w = (wordObj.noun || wordObj.word || '').toLowerCase();
    return medWords.has(w);
  }

  /**
   * Build a deck that optionally prioritises weak words.
   * @param {Array}  pool      - full word pool
   * @param {number} size      - desired deck size
   * @param {boolean} weakFirst - pull weak words to front
   * @returns {Array}
   */
  function _buildDeck(pool, size, weakFirst = false) {
    if (pool.length === 0) return [];

    if (weakFirst) {
      const weakWords = Storage.getWeakWords();
      const weakSet = new Set(weakWords.map(w => w.word));
      const weak = pool.filter(w => weakSet.has(w.word));
      const rest = pool.filter(w => !weakSet.has(w.word));
      const combined = [...shuffleArray([...weak]), ...shuffleArray([...rest])];
      return combined.slice(0, Math.min(size, combined.length));
    }

    return pickRandom(pool, size);
  }

  // ---------------------------------------------------------------------------
  // Helpers — Perfekt auxiliary
  // ---------------------------------------------------------------------------

  /** Return "ist" or "hat" based on the verb's withSein flag. */
  function _perfektAux(verbObj) {
    return verbObj.conjugation && verbObj.conjugation.withSein ? 'ist' : 'hat';
  }

  // ---------------------------------------------------------------------------
  // Module interface
  // ---------------------------------------------------------------------------

  function init() {
    // Nothing to do on registration — we wait for render().
  }

  /**
   * Called by App when routing to #/vocabulary.
   * @param {HTMLElement} container - The #app-content element (may be absent
   *   if the HTML uses the pre-built page sections instead).
   * @param {string} subRoute
   */
  function render(container, subRoute) {
    // The HTML already contains #page-vocabulary with toolbar + content area.
    // We show that section and attach to it.
    _showPage();
    _attachToolbar();

    // If a sub-route was given, start that mode directly
    if (subRoute === 'flashcards') {
      _startFlashcards();
    } else if (subRoute === 'fillin') {
      _startFillIn();
    } else if (subRoute === 'articles') {
      _startArticles();
    } else {
      // Default: show a welcoming prompt inside the content area
      _renderWelcome();
    }
  }

  function destroy() {
    _unbindKeys();
    _mode = null;
    _hidePage();
  }

  // ---------------------------------------------------------------------------
  // Page visibility
  // ---------------------------------------------------------------------------

  function _showPage() {
    // Hide all module pages, then show ours
    document.querySelectorAll('.module-page').forEach(p => p.hidden = true);
    _pageEl = document.getElementById('page-vocabulary');
    if (_pageEl) {
      _pageEl.hidden = false;
    }
    _container = document.getElementById('vocabulary-content');

    // Also hide the dashboard if visible
    const dashboard = document.getElementById('page-home');
    if (dashboard) dashboard.hidden = true;
  }

  function _hidePage() {
    if (_pageEl) _pageEl.hidden = true;
    _pageEl = null;
    _container = null;
  }

  // ---------------------------------------------------------------------------
  // Toolbar wiring
  // ---------------------------------------------------------------------------

  function _attachToolbar() {
    if (!_pageEl) return;

    const buttons = _pageEl.querySelectorAll('.module-page__toolbar .btn');
    buttons.forEach(btn => {
      // Clone-replace to remove old listeners
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
    });

    _pageEl.querySelector('[data-action="vocab-flashcards"]')
      ?.addEventListener('click', _startFlashcards);
    _pageEl.querySelector('[data-action="vocab-fillin"]')
      ?.addEventListener('click', _startFillIn);
    _pageEl.querySelector('[data-action="vocab-articles"]')
      ?.addEventListener('click', _startArticles);
  }

  function _highlightToolbarButton(action) {
    if (!_pageEl) return;
    _pageEl.querySelectorAll('.module-page__toolbar .btn').forEach(btn => {
      btn.classList.toggle('btn--accent', btn.dataset.action === action);
      btn.classList.toggle('btn--outline', btn.dataset.action !== action);
    });
  }

  // ---------------------------------------------------------------------------
  // Welcome / landing view
  // ---------------------------------------------------------------------------

  function _renderWelcome() {
    if (!_container) return;
    const progress = Storage.getProgress('vocabulary');
    const weakCount = Storage.getWeakWords().length;
    const totalWords = _allWords().length;

    _container.innerHTML = `
      <div class="vocab-welcome">
        <p class="vocab-welcome__intro">
          Hier kannst du deinen Wortschatz gezielt aufbauen und festigen.
          Wähle oben eine Übungsform, um zu beginnen.
        </p>
        <div class="vocab-welcome__stats">
          <div class="stat-card">
            <span class="stat-card__value">${totalWords}</span>
            <span class="stat-card__label">Vokabeln verfügbar</span>
          </div>
          <div class="stat-card">
            <span class="stat-card__value">${progress.completed || 0}</span>
            <span class="stat-card__label">bereits geübt</span>
          </div>
          <div class="stat-card">
            <span class="stat-card__value">${weakCount}</span>
            <span class="stat-card__label">schwierige Wörter</span>
          </div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Bookmark helper
  // ---------------------------------------------------------------------------

  /**
   * Build the HTML for a bookmark toggle button.
   * @param {object} card - the current word/card object
   * @returns {string} HTML string
   */
  function _bookmarkBtnHtml(card) {
    const wordId = card.word || card.noun || '';
    const isMarked = Storage.isBookmarked('vocabulary', wordId);
    return `<button class="bookmark-btn${isMarked ? ' bookmark-btn--active' : ''}"
                    data-bookmark-word="${escapeHtml(wordId)}"
                    aria-label="Lesezeichen setzen"
                    title="Lesezeichen">${isMarked ? '\u2605' : '\u2606'}</button>`;
  }

  /**
   * Attach click handler to the bookmark button currently in the DOM.
   * @param {object} card - the current word/card object
   */
  function _attachBookmarkHandler(card) {
    const btn = _container.querySelector('[data-bookmark-word]');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wordId = card.word || card.noun || '';
      const added = Storage.toggleBookmark({
        module: 'vocabulary',
        id: wordId,
        label: wordId,
        detail: card.translation || '',
      });
      btn.textContent = added ? '\u2605' : '\u2606';
      btn.classList.toggle('bookmark-btn--active', added);
      showToast(added ? 'Lesezeichen gesetzt' : 'Lesezeichen entfernt', added ? 'success' : 'info', 1500);
    });
  }

  // =========================================================================
  //  MODE 1 — Flashcards
  // =========================================================================

  function _startFlashcards() {
    _mode = 'flashcards';
    _highlightToolbarButton('vocab-flashcards');

    const weakWords = Storage.getWeakWords();
    const hasWeak = weakWords.length > 0;

    // If there are weak words and user hasn't chosen yet, ask
    if (hasWeak && _focusWeak === null) {
      _renderFlashcardOptions(weakWords.length);
      return;
    }

    _resetRound();
    const pool = _allWords();
    _cards = _buildDeck(pool, 20, _focusWeak);
    _total = _cards.length;

    if (_cards.length === 0) {
      _container.innerHTML =
        '<p class="empty-state">Es sind noch keine Vokabeln geladen.</p>';
      return;
    }

    _renderFlashcard();
    _bindFlashcardKeys();
  }

  function _renderFlashcardOptions(weakCount) {
    if (!_container) return;
    _container.innerHTML = `
      <div class="vocab-options">
        <h3 class="vocab-options__title">Wie möchtest du üben?</h3>
        <p class="vocab-options__hint">
          Du hast <strong>${weakCount}</strong> schwierige
          ${weakCount === 1 ? 'Wort' : 'Wörter'} gespeichert.
        </p>
        <div class="vocab-options__buttons">
          <button class="btn btn--accent" id="fc-all">
            Alle Vokabeln durchgehen
          </button>
          <button class="btn btn--outline" id="fc-weak">
            Schwierige Wörter zuerst
          </button>
        </div>
      </div>
    `;

    document.getElementById('fc-all').addEventListener('click', () => {
      _focusWeak = false;
      _startFlashcards();
    });
    document.getElementById('fc-weak').addEventListener('click', () => {
      _focusWeak = true;
      _startFlashcards();
    });
  }

  function _renderFlashcard() {
    if (!_container) return;

    const card = _cards[_index];
    const prevAnswer = _fcAnswers[_index]; // check if already answered (back-navigation)
    const isReview = !!prevAnswer;

    _flipped = isReview;          // show both sides in review mode
    _answered = isReview;

    const progressPct = Math.round(((_index) / _total) * 100);
    const isNoun = card.type === 'noun';
    const isVerb = card.type === 'verb';
    const medical = _isMedical(card);

    // — Front side content
    let frontExtra = '';
    if (medical) {
      frontExtra += '<span class="flashcard__tag flashcard__tag--medical">Medizin</span>';
    }
    if (isNoun) {
      frontExtra += '<span class="flashcard__tag flashcard__tag--noun">Nomen</span>';
    } else if (isVerb) {
      frontExtra += '<span class="flashcard__tag flashcard__tag--verb">Verb</span>';
    }

    // — Back side content
    let backDetails = '';
    if (isNoun) {
      backDetails = `
        <p class="flashcard__detail">
          <span class="flashcard__label">Artikel:</span>
          <span class="flashcard__value">${escapeHtml(card.article)}</span>
        </p>
        <p class="flashcard__detail">
          <span class="flashcard__label">Plural:</span>
          <span class="flashcard__value">die ${escapeHtml(card.plural || '—')}</span>
        </p>
      `;
    }
    if (isVerb && card.conjugation) {
      const aux = _perfektAux(card);
      const perfekt = card.conjugation.perfekt || '—';
      backDetails = `
        <p class="flashcard__detail">
          <span class="flashcard__label">Perfekt:</span>
          <span class="flashcard__value">${escapeHtml(aux)} ${escapeHtml(perfekt)}</span>
        </p>
        <p class="flashcard__detail">
          <span class="flashcard__label">Hilfsverb:</span>
          <span class="flashcard__value">${card.conjugation.withSein ? 'sein' : 'haben'}</span>
        </p>
      `;
    }
    if (medical) {
      backDetails += '<p class="flashcard__detail flashcard__detail--medical">Medizinischer Fachbegriff</p>';
    }

    const example = (card.examples && card.examples.length > 0)
      ? card.examples[Math.floor(Math.random() * card.examples.length)]
      : card.sentence || '';

    // Review-mode label
    const reviewBanner = isReview
      ? `<p class="flashcard__review-label" style="text-align:center;color:var(--color-text-muted);font-size:var(--font-size-sm);margin-bottom:var(--space-xs);">
           ${prevAnswer.knew ? 'Gewusst' : 'Nicht gewusst'} — Rückblick
         </p>`
      : '';

    _container.innerHTML = `
      <div class="flashcard-round">
        <!-- Progress -->
        <div class="flashcard-progress">
          <span class="flashcard-progress__text">Karte ${_index + 1} von ${_total}</span>
          ${_bookmarkBtnHtml(card)}
          <span class="flashcard-progress__score">${_score} richtig</span>
        </div>
        <div class="progress-bar progress-bar--small">
          <div class="progress-bar__fill" style="width: ${progressPct}%"></div>
        </div>

        ${reviewBanner}

        <!-- Card -->
        <div class="flashcard${isReview ? ' flashcard--flipped' : ''}" id="flashcard" tabindex="0" role="button"
             aria-label="Karte umdrehen">
          <div class="flashcard__inner">
            <!-- Front -->
            <div class="flashcard__front">
              <div class="flashcard__tags">${frontExtra}</div>
              <p class="flashcard__word">${escapeHtml(card.word)}</p>
              <button class="btn btn--icon flashcard__speak" data-speak-word
                      aria-label="Wort vorlesen" title="Vorlesen">&#128264;</button>
              <p class="flashcard__hint">Tippe auf die Karte, um die Antwort zu sehen</p>
            </div>
            <!-- Back -->
            <div class="flashcard__back">
              <p class="flashcard__translation">${escapeHtml(card.translation || '')}</p>
              ${backDetails}
              ${example ? `
                <div class="flashcard__example">
                  <p class="flashcard__example-text">${escapeHtml(example)}</p>
                  <button class="btn btn--icon flashcard__speak" data-speak-example
                          aria-label="Beispiel vorlesen" title="Beispiel vorlesen">&#128264;</button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Answer buttons (hidden until flipped; hidden entirely in review mode) -->
        <div class="flashcard-actions" id="flashcard-actions" ${isReview ? '' : 'hidden'}>
          ${isReview ? '' : `
            <button class="btn btn--success" id="fc-knew"
                    title="Ich wusste die Antwort">Gewusst</button>
            <button class="btn btn--danger" id="fc-didnt"
                    title="Ich wusste es nicht">Nicht gewusst</button>
          `}
        </div>

        <!-- Navigation (always visible when relevant) -->
        <div class="exercise-nav-btns" style="margin-top:var(--space-sm);justify-content:center;width:100%;">
          ${_index > 0
            ? '<button class="btn btn--outline" id="fc-back">Zur\u00FCck</button>'
            : ''}
          ${isReview
            ? `<button class="btn btn--accent" id="fc-forward">
                 ${_index < _total - 1 ? 'Weiter' : 'Zum Ergebnis'}
               </button>`
            : ''}
        </div>
      </div>
    `;

    // — Event listeners
    const flashcardEl = document.getElementById('flashcard');
    if (!isReview) {
      flashcardEl.addEventListener('click', _flipCard);
    }

    // Bookmark
    _attachBookmarkHandler(card);

    // Speak buttons
    _container.querySelector('[data-speak-word]')
      ?.addEventListener('click', (e) => {
        e.stopPropagation();
        speak(card.word);
      });
    _container.querySelector('[data-speak-example]')
      ?.addEventListener('click', (e) => {
        e.stopPropagation();
        speak(example);
      });

    // Answer buttons (only in non-review mode)
    if (!isReview) {
      document.getElementById('fc-knew')?.addEventListener('click', () => _flashcardAnswer(true));
      document.getElementById('fc-didnt')?.addEventListener('click', () => _flashcardAnswer(false));
    }

    // Back button
    document.getElementById('fc-back')?.addEventListener('click', () => {
      _index--;
      _renderFlashcard();
    });

    // Forward button (review mode only — step through already-answered cards)
    document.getElementById('fc-forward')?.addEventListener('click', () => {
      _index++;
      if (_index >= _total) {
        _renderFlashcardSummary();
      } else {
        _renderFlashcard();
      }
    });
  }

  function _flipCard() {
    if (_flipped) return;
    _flipped = true;

    const flashcardEl = document.getElementById('flashcard');
    if (flashcardEl) flashcardEl.classList.add('flashcard--flipped');

    const actions = document.getElementById('flashcard-actions');
    if (actions) actions.hidden = false;
  }

  function _flashcardAnswer(knew) {
    if (_answered) return;
    _answered = true;

    const card = _cards[_index];

    if (knew) {
      _score++;
      Storage.removeWeakWord(card.word);
    } else {
      Storage.addWeakWord({
        word: card.word,
        translation: card.translation || '',
        type: card.type || 'unknown',
      });
    }

    // Store answer for back-navigation
    _fcAnswers[_index] = { answered: true, knew };

    _index++;

    if (_index >= _total) {
      _renderFlashcardSummary();
    } else {
      _renderFlashcard();
    }
  }

  function _renderFlashcardSummary() {
    if (!_container) return;

    const pct = _total > 0 ? Math.round((_score / _total) * 100) : 0;

    let verdict;
    if (pct === 100) {
      verdict = 'Hervorragend! Du hast jede einzelne Vokabel gewusst.';
    } else if (pct >= 80) {
      verdict = 'Sehr gut gemacht! Nur wenige Wörter bereiten dir noch Schwierigkeiten.';
    } else if (pct >= 50) {
      verdict = 'Ein solider Durchgang. Wiederhole die schwierigen Wörter, um sicherer zu werden.';
    } else {
      verdict = 'Übung macht den Meister! Geh die schwierigen Wörter noch einmal gezielt durch.';
    }

    _container.innerHTML = `
      <div class="vocab-summary">
        <h3 class="vocab-summary__title">Runde abgeschlossen</h3>
        <p class="vocab-summary__verdict">${escapeHtml(verdict)}</p>
        <div class="vocab-summary__stats">
          <div class="stat-card">
            <span class="stat-card__value">${_score}</span>
            <span class="stat-card__label">gewusst</span>
          </div>
          <div class="stat-card">
            <span class="stat-card__value">${_total - _score}</span>
            <span class="stat-card__label">nicht gewusst</span>
          </div>
          <div class="stat-card">
            <span class="stat-card__value">${pct}%</span>
            <span class="stat-card__label">Trefferquote</span>
          </div>
        </div>
        <div class="vocab-summary__actions">
          <button class="btn btn--accent" id="fc-restart">Noch eine Runde</button>
          <button class="btn btn--outline" id="fc-weak-restart">Schwierige Wörter üben</button>
          <a href="#/vocabulary" class="btn btn--outline">Zurück zur Übersicht</a>
        </div>
      </div>
    `;

    document.getElementById('fc-restart')?.addEventListener('click', () => {
      _focusWeak = false;
      _startFlashcards();
    });
    document.getElementById('fc-weak-restart')?.addEventListener('click', () => {
      _focusWeak = true;
      _startFlashcards();
    });

    // Persist progress
    _saveProgress(pct);
    App.recordPractice();
  }

  // Keyboard shortcuts for flashcards
  function _bindFlashcardKeys() {
    _unbindKeys();
    _boundKeyHandler = (e) => {
      if (_mode !== 'flashcards') return;

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!_flipped) {
          _flipCard();
        }
      } else if (e.key === 'ArrowRight' || e.key === '1') {
        if (_flipped && !_answered) _flashcardAnswer(true);
      } else if (e.key === 'ArrowLeft' || e.key === '2') {
        if (_flipped && !_answered) _flashcardAnswer(false);
      }
    };
    document.addEventListener('keydown', _boundKeyHandler);
  }

  function _unbindKeys() {
    if (_boundKeyHandler) {
      document.removeEventListener('keydown', _boundKeyHandler);
      _boundKeyHandler = null;
    }
  }

  // =========================================================================
  //  MODE 2 — Fill-in-the-Blank
  // =========================================================================

  function _startFillIn() {
    _mode = 'fillin';
    _highlightToolbarButton('vocab-fillin');
    _unbindKeys();
    _resetRound();

    // Build a mixed deck: try for a balance of nouns, verbs, other
    const nouns  = pickRandom(_allNouns(), 4);
    const verbs  = pickRandom(_allVerbs(), 3);
    const other  = pickRandom(_allOther(), 3);

    // Also sprinkle in medical terms if available
    const medicalPool = _buildMedicalFillInItems();
    const medical = pickRandom(medicalPool, 2);

    let pool = [...nouns, ...verbs, ...other, ...medical];

    // Remove duplicates by word
    const seen = new Set();
    pool = pool.filter(w => {
      if (seen.has(w.word)) return false;
      seen.add(w.word);
      return true;
    });

    _cards = shuffleArray(pool).slice(0, 10);
    _total = _cards.length;

    if (_cards.length === 0) {
      _container.innerHTML =
        '<p class="empty-state">Es sind noch keine Vokabeln für Lückentexte geladen.</p>';
      return;
    }

    _renderFillIn();
  }

  /**
   * Build fill-in items from medical vocabulary (body parts, symptoms, etc.).
   * Each item is shaped like a word object with .word and .sentence.
   */
  function _buildMedicalFillInItems() {
    const med = _medicalData();
    const items = [];

    ['bodyParts', 'symptoms', 'diseases', 'procedures'].forEach(cat => {
      (med[cat] || []).forEach(item => {
        const word = item.de || item.german;
        const translation = item.en || item.english || '';
        if (word) {
          items.push({
            word: word,
            sentence: item.description || `${word} — ${translation}`,
            translation: translation,
            type: 'medical',
            examples: item.description ? [item.description] : [],
          });
        }
      });
    });

    return items;
  }

  function _renderFillIn() {
    if (!_container) return;
    if (_index >= _total) {
      _renderFillInSummary();
      return;
    }

    const card = _cards[_index];
    const prevAnswer = _answers[_index]; // check if already answered (back-navigation)
    const isReview = !!prevAnswer;
    _answered = isReview;

    // Determine the blank word: for nouns use the noun (without article),
    // for others use the base word.
    const blankWord = card.noun || card.word;

    // Pick a sentence that contains the word
    const sentences = card.examples && card.examples.length > 0
      ? card.examples
      : (card.sentence ? [card.sentence] : []);
    let sentence = sentences.find(s => s.includes(blankWord)) || sentences[0] || '';

    // Create the blanked sentence — in review mode show the correct answer inline
    let blanked;
    if (isReview) {
      const revealClass = prevAnswer.correct ? 'fillin__blank--correct' : 'fillin__blank--wrong';
      blanked = sentence.replace(
        new RegExp(_escapeRegex(blankWord), 'i'),
        `<span class="fillin__blank ${revealClass}"><strong>${escapeHtml(blankWord)}</strong></span>`
      );
    } else {
      blanked = sentence.replace(
        new RegExp(_escapeRegex(blankWord), 'i'),
        '<span class="fillin__blank">___</span>'
      );
    }

    // Hint: translation
    const hint = card.translation || '';

    // Review-mode feedback (pre-built)
    let reviewFeedback = '';
    if (isReview) {
      if (prevAnswer.correct) {
        reviewFeedback = `
          <div class="fillin-feedback--correct">
            <p class="fillin-feedback__verdict">Ausgezeichnet! Das ist richtig.</p>
          </div>`;
      } else {
        reviewFeedback = `
          <div class="fillin-feedback--wrong">
            <p class="fillin-feedback__verdict">Das war leider nicht ganz richtig.</p>
            <p class="fillin-feedback__correct-answer">
              Die richtige Antwort lautet: <strong>${escapeHtml(blankWord)}</strong>
            </p>
            <p style="color:var(--color-text-muted);font-size:var(--font-size-sm);">
              Deine Antwort: ${escapeHtml(prevAnswer.given || '')}
            </p>
          </div>`;
      }
    }

    _container.innerHTML = `
      <div class="fillin-round">
        <!-- Progress -->
        <div class="fillin-progress">
          <span class="fillin-progress__text">Frage ${_index + 1} von ${_total}</span>
          ${_bookmarkBtnHtml(card)}
          <span class="fillin-progress__score">${_score} richtig</span>
        </div>
        <div class="progress-bar progress-bar--small">
          <div class="progress-bar__fill" style="width: ${Math.round((_index / _total) * 100)}%"></div>
        </div>

        <!-- Question -->
        <div class="fillin-question">
          <p class="fillin-question__sentence">${blanked}</p>
          <p class="fillin-question__hint">
            <em>Hinweis:</em> ${escapeHtml(hint)}
          </p>
        </div>

        <!-- Input (hidden in review mode) -->
        ${isReview ? '' : `
          <div class="fillin-input">
            <input type="text" class="input fillin-input__field" id="fillin-answer"
                   placeholder="Fehlende Vokabel eingeben..." autocomplete="off"
                   autofocus aria-label="Antwort eingeben">
            <button class="btn btn--accent" id="fillin-check">\u00DCberpr\u00FCfen</button>
          </div>
        `}

        <!-- Feedback -->
        <div class="fillin-feedback" id="fillin-feedback" ${isReview ? '' : 'hidden'}>
          ${reviewFeedback}
        </div>

        <!-- Navigation buttons -->
        <div class="exercise-nav-btns" style="margin-top:var(--space-sm);justify-content:center;">
          ${_index > 0
            ? '<button class="btn btn--outline" id="fillin-back">Zur\u00FCck</button>'
            : ''}
          ${isReview
            ? `<button class="btn btn--accent fillin-next" id="fillin-next">
                 ${_index < _total - 1 ? 'Weiter zur n\u00E4chsten Frage' : 'Zum Ergebnis'}
               </button>`
            : '<button class="btn btn--accent fillin-next" id="fillin-next" hidden>Weiter zur n\u00E4chsten Frage</button>'}
        </div>
      </div>
    `;

    // Bookmark handler
    _attachBookmarkHandler(card);

    if (!isReview) {
      const inputEl = document.getElementById('fillin-answer');
      const checkBtn = document.getElementById('fillin-check');

      // Auto-focus
      requestAnimationFrame(() => inputEl?.focus());

      checkBtn?.addEventListener('click', () => _checkFillIn(blankWord));

      inputEl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!_answered) {
            _checkFillIn(blankWord);
          } else {
            _advanceFillIn();
          }
        }
      });
    }

    // Back button
    document.getElementById('fillin-back')?.addEventListener('click', () => {
      _index--;
      _renderFillIn();
    });

    document.getElementById('fillin-next')?.addEventListener('click', _advanceFillIn);
  }

  function _checkFillIn(correctWord) {
    if (_answered) return;
    _answered = true;

    const inputEl = document.getElementById('fillin-answer');
    const feedbackEl = document.getElementById('fillin-feedback');
    const nextBtn = document.getElementById('fillin-next');
    const checkBtn = document.getElementById('fillin-check');

    const userAnswer = (inputEl?.value || '').trim();
    const isCorrect = userAnswer.toLowerCase() === correctWord.toLowerCase();

    const card = _cards[_index];

    // Store answer for back-navigation
    _answers[_index] = { answered: true, correct: isCorrect, given: userAnswer };

    if (isCorrect) {
      _score++;
      feedbackEl.innerHTML = `
        <div class="fillin-feedback--correct">
          <p class="fillin-feedback__verdict">Ausgezeichnet! Das ist richtig.</p>
        </div>
      `;
      inputEl.classList.add('input--correct');
    } else {
      feedbackEl.innerHTML = `
        <div class="fillin-feedback--wrong">
          <p class="fillin-feedback__verdict">Das war leider nicht ganz richtig.</p>
          <p class="fillin-feedback__correct-answer">
            Die richtige Antwort lautet: <strong>${escapeHtml(correctWord)}</strong>
          </p>
          ${card.type === 'noun' && card.article ? `
            <p class="fillin-feedback__extra">
              Vollst\u00E4ndig: <strong>${escapeHtml(card.article)} ${escapeHtml(card.noun)}</strong>
            </p>
          ` : ''}
        </div>
      `;
      inputEl.classList.add('input--wrong');

      // Add to weak words
      Storage.addWeakWord({
        word: card.word,
        translation: card.translation || '',
        type: card.type || 'unknown',
      });
    }

    feedbackEl.hidden = false;
    nextBtn.hidden = false;
    checkBtn.hidden = true;
    inputEl.disabled = true;
  }

  function _advanceFillIn() {
    _index++;
    _renderFillIn();
  }

  function _renderFillInSummary() {
    if (!_container) return;
    const pct = _total > 0 ? Math.round((_score / _total) * 100) : 0;

    let verdict;
    if (pct === 100) {
      verdict = 'Perfekt! Alle Lücken korrekt ausgefüllt. Dein Wortschatz sitzt.';
    } else if (pct >= 70) {
      verdict = 'Gut gemacht! Die meisten Vokabeln hast du sicher beherrscht.';
    } else if (pct >= 40) {
      verdict = 'Ein guter Anfang. Wiederhole die Übung, um die Wörter zu festigen.';
    } else {
      verdict = 'Nicht aufgeben! Schau dir die schwierigen Wörter noch einmal in den Karteikarten an.';
    }

    _container.innerHTML = `
      <div class="vocab-summary">
        <h3 class="vocab-summary__title">Lückentext abgeschlossen</h3>
        <p class="vocab-summary__verdict">${escapeHtml(verdict)}</p>
        <div class="vocab-summary__stats">
          <div class="stat-card">
            <span class="stat-card__value">${_score} / ${_total}</span>
            <span class="stat-card__label">richtige Antworten</span>
          </div>
          <div class="stat-card">
            <span class="stat-card__value">${pct}%</span>
            <span class="stat-card__label">Trefferquote</span>
          </div>
        </div>
        <div class="vocab-summary__actions">
          <button class="btn btn--accent" id="fi-restart">Neue Runde starten</button>
          <a href="#/vocabulary" class="btn btn--outline">Zurück zur Übersicht</a>
        </div>
      </div>
    `;

    document.getElementById('fi-restart')?.addEventListener('click', _startFillIn);

    _saveProgress(pct);
    App.recordPractice();
  }

  // =========================================================================
  //  MODE 3 — Article Quiz
  // =========================================================================

  function _startArticles() {
    _mode = 'articles';
    _highlightToolbarButton('vocab-articles');
    _unbindKeys();
    _resetRound();
    _articleStats = {
      der: { correct: 0, total: 0 },
      die: { correct: 0, total: 0 },
      das: { correct: 0, total: 0 },
    };

    // Pool: all nouns, prioritise medical nouns by mixing them in
    let pool = [..._allNouns()];
    const medNouns = pool.filter(n => _isMedical(n));
    const regularNouns = pool.filter(n => !_isMedical(n));

    // If we have medical nouns, ensure some proportion appear
    if (medNouns.length > 0) {
      const medPick = pickRandom(medNouns, Math.min(6, medNouns.length));
      const regPick = pickRandom(regularNouns, 20 - medPick.length);
      _cards = shuffleArray([...medPick, ...regPick]);
    } else {
      _cards = pickRandom(pool, 20);
    }

    // Deduplicate
    const seen = new Set();
    _cards = _cards.filter(c => {
      if (seen.has(c.noun)) return false;
      seen.add(c.noun);
      return true;
    });

    _total = _cards.length;

    if (_total === 0) {
      _container.innerHTML =
        '<p class="empty-state">Keine Nomen für das Artikel-Quiz verfügbar.</p>';
      return;
    }

    _renderArticleQuestion();
  }

  function _renderArticleQuestion() {
    if (!_container) return;
    if (_index >= _total) {
      _renderArticleSummary();
      return;
    }

    const card = _cards[_index];
    const prevAnswer = _answers[_index]; // check if already answered (back-navigation)
    const isReview = !!prevAnswer;
    _answered = isReview;

    const progressPct = Math.round((_index / _total) * 100);
    const correctArt = card.article.toLowerCase();

    // Build article buttons — in review mode, show correct/wrong styling and disable
    let articleButtonsHtml = '';
    ['der', 'die', 'das'].forEach(art => {
      let extraClass = 'btn--outline';
      let disabled = '';
      if (isReview) {
        disabled = 'disabled';
        if (art === correctArt) {
          extraClass = 'btn--success';
        } else if (art === prevAnswer.chosen && !prevAnswer.correct) {
          extraClass = 'btn--danger';
        }
      }
      articleButtonsHtml += `<button class="btn ${extraClass} btn--large article-btn" data-article="${art}" ${disabled}>${art}</button>`;
    });

    // Review-mode feedback (pre-built)
    let reviewFeedback = '';
    if (isReview) {
      if (prevAnswer.correct) {
        reviewFeedback = `
          <div class="article-feedback--correct">
            <p class="article-feedback__verdict">Ausgezeichnet! Das ist richtig.</p>
            <p class="article-feedback__full">
              <strong>${escapeHtml(card.article)} ${escapeHtml(card.noun)}</strong>
            </p>
          </div>`;
      } else {
        reviewFeedback = `
          <div class="article-feedback--wrong">
            <p class="article-feedback__verdict">Leider nicht richtig.</p>
            <p class="article-feedback__correct-answer">
              Der korrekte Artikel lautet: <strong>${escapeHtml(card.article)}</strong>
            </p>
            <p class="article-feedback__full">
              <strong>${escapeHtml(card.article)} ${escapeHtml(card.noun)}</strong>
            </p>
          </div>`;
      }
    }

    _container.innerHTML = `
      <div class="article-round">
        <!-- Progress -->
        <div class="article-progress">
          <span class="article-progress__text">Frage ${_index + 1} von ${_total}</span>
          ${_bookmarkBtnHtml(card)}
          <span class="article-progress__score">${_score} richtig</span>
        </div>
        <div class="progress-bar progress-bar--small">
          <div class="progress-bar__fill" style="width: ${progressPct}%"></div>
        </div>

        <!-- The noun (without article) -->
        <div class="article-question">
          <p class="article-question__prompt">Welcher Artikel geh\u00F6rt zu diesem Nomen?</p>
          <p class="article-question__noun">${escapeHtml(card.noun)}</p>
          <button class="btn btn--icon article-question__speak"
                  aria-label="Vorlesen" title="Vorlesen">&#128264;</button>
        </div>

        <!-- Article buttons -->
        <div class="article-buttons" id="article-buttons">
          ${articleButtonsHtml}
        </div>

        <!-- Feedback -->
        <div class="article-feedback" id="article-feedback" ${isReview ? '' : 'hidden'}>
          ${reviewFeedback}
        </div>

        <!-- Navigation buttons -->
        <div class="exercise-nav-btns" style="margin-top:var(--space-sm);justify-content:center;">
          ${_index > 0
            ? '<button class="btn btn--outline" id="article-back">Zur\u00FCck</button>'
            : ''}
          ${isReview
            ? `<button class="btn btn--accent article-next" id="article-next">
                 ${_index < _total - 1 ? 'Weiter zur n\u00E4chsten Frage' : 'Zum Ergebnis'}
               </button>`
            : '<button class="btn btn--accent article-next" id="article-next" hidden>Weiter zur n\u00E4chsten Frage</button>'}
        </div>
      </div>
    `;

    // Bookmark handler
    _attachBookmarkHandler(card);

    // Speak button
    _container.querySelector('.article-question__speak')
      ?.addEventListener('click', () => speak(card.word || (card.article + ' ' + card.noun)));

    // Article buttons (only active in non-review mode)
    if (!isReview) {
      _container.querySelectorAll('.article-btn').forEach(btn => {
        btn.addEventListener('click', () => _checkArticle(btn.dataset.article, card));
      });
    }

    // Back button
    document.getElementById('article-back')?.addEventListener('click', () => {
      _index--;
      _renderArticleQuestion();
    });

    document.getElementById('article-next')?.addEventListener('click', () => {
      _index++;
      _renderArticleQuestion();
    });
  }

  function _checkArticle(chosen, card) {
    if (_answered) return;
    _answered = true;

    const correct = card.article.toLowerCase();
    const isCorrect = chosen.toLowerCase() === correct;

    // Store answer for back-navigation
    _answers[_index] = { answered: true, correct: isCorrect, chosen: chosen.toLowerCase() };

    // Update article-specific stats
    if (_articleStats[correct]) {
      _articleStats[correct].total++;
      if (isCorrect) _articleStats[correct].correct++;
    }

    // Visual feedback on buttons
    _container.querySelectorAll('.article-btn').forEach(btn => {
      btn.disabled = true;
      const art = btn.dataset.article.toLowerCase();
      if (art === correct) {
        btn.classList.add('btn--success');
      } else if (art === chosen.toLowerCase() && !isCorrect) {
        btn.classList.add('btn--danger');
      }
    });

    const feedbackEl = document.getElementById('article-feedback');

    if (isCorrect) {
      _score++;
      feedbackEl.innerHTML = `
        <div class="article-feedback--correct">
          <p class="article-feedback__verdict">Ausgezeichnet! Das ist richtig.</p>
          <p class="article-feedback__full">
            <strong>${escapeHtml(card.article)} ${escapeHtml(card.noun)}</strong>
          </p>
        </div>
      `;
    } else {
      feedbackEl.innerHTML = `
        <div class="article-feedback--wrong">
          <p class="article-feedback__verdict">Leider nicht richtig.</p>
          <p class="article-feedback__correct-answer">
            Der korrekte Artikel lautet: <strong>${escapeHtml(card.article)}</strong>
          </p>
          <p class="article-feedback__full">
            <strong>${escapeHtml(card.article)} ${escapeHtml(card.noun)}</strong>
          </p>
          ${card.plural ? `
            <p class="article-feedback__plural">
              Plural: <strong>die ${escapeHtml(card.plural)}</strong>
              — der Plural kann helfen, den Artikel zu merken.
            </p>
          ` : ''}
          ${_buildDeclensionHint(card)}
        </div>
      `;

      // Add to weak words
      Storage.addWeakWord({
        word: card.word,
        translation: card.translation || '',
        type: 'noun',
      });
    }

    feedbackEl.hidden = false;
    document.getElementById('article-next').hidden = false;
  }

  /**
   * Build a short declension snippet for feedback (e.g. "Genitiv: des Arztes").
   */
  function _buildDeclensionHint(card) {
    if (!card.declension) return '';

    const lines = [];
    const caseLabels = {
      nominativ: 'Nominativ',
      genitiv: 'Genitiv',
      dativ: 'Dativ',
      akkusativ: 'Akkusativ',
    };
    const articleForms = {
      der: { nominativ: 'der', genitiv: 'des', dativ: 'dem', akkusativ: 'den' },
      die: { nominativ: 'die', genitiv: 'der', dativ: 'der', akkusativ: 'die' },
      das: { nominativ: 'das', genitiv: 'des', dativ: 'dem', akkusativ: 'das' },
    };

    const artForms = articleForms[card.article.toLowerCase()];
    if (!artForms) return '';

    for (const [cas, label] of Object.entries(caseLabels)) {
      const form = card.declension[cas];
      if (form && form.singular) {
        const art = artForms[cas] || card.article;
        lines.push(`<span class="declension-case">${escapeHtml(label)}:</span> ${escapeHtml(art)} ${escapeHtml(form.singular)}`);
      }
    }

    if (lines.length === 0) return '';

    return `
      <div class="article-feedback__declension">
        <p class="article-feedback__declension-title">Deklination im Singular:</p>
        <p class="article-feedback__declension-list">${lines.join(' &middot; ')}</p>
      </div>
    `;
  }

  function _renderArticleSummary() {
    if (!_container) return;

    const pct = _total > 0 ? Math.round((_score / _total) * 100) : 0;

    let verdict;
    if (pct === 100) {
      verdict = 'Meisterhaft! Du beherrschst die deutschen Artikel im Schlaf.';
    } else if (pct >= 80) {
      verdict = 'Sehr gut! Die Artikel sitzen schon recht sicher.';
    } else if (pct >= 50) {
      verdict = 'Ordentlich. Ein paar Artikel bereiten dir noch Mühe — bleib dran!';
    } else {
      verdict = 'Die Artikel sind für viele eine Herausforderung. Regelmäßiges Üben hilft enorm.';
    }

    // Per-article breakdown
    const artRows = ['der', 'die', 'das'].map(art => {
      const s = _articleStats[art];
      const artPct = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
      return `
        <div class="stat-card">
          <span class="stat-card__value">${s.correct}/${s.total}</span>
          <span class="stat-card__label">${art} (${artPct}%)</span>
        </div>
      `;
    }).join('');

    _container.innerHTML = `
      <div class="vocab-summary">
        <h3 class="vocab-summary__title">Artikel-Quiz abgeschlossen</h3>
        <p class="vocab-summary__verdict">${escapeHtml(verdict)}</p>
        <div class="vocab-summary__stats">
          <div class="stat-card">
            <span class="stat-card__value">${_score} / ${_total}</span>
            <span class="stat-card__label">richtig beantwortet</span>
          </div>
          <div class="stat-card">
            <span class="stat-card__value">${pct}%</span>
            <span class="stat-card__label">Genauigkeit</span>
          </div>
        </div>
        <h4 class="vocab-summary__subtitle">Genauigkeit nach Artikel</h4>
        <div class="vocab-summary__stats">${artRows}</div>
        <div class="vocab-summary__actions">
          <button class="btn btn--accent" id="art-restart">Neue Runde starten</button>
          <a href="#/vocabulary" class="btn btn--outline">Zurück zur Übersicht</a>
        </div>
      </div>
    `;

    document.getElementById('art-restart')?.addEventListener('click', _startArticles);

    _saveProgress(pct);
    App.recordPractice();
  }

  // =========================================================================
  //  Shared helpers
  // =========================================================================

  function _resetRound() {
    _cards = [];
    _index = 0;
    _score = 0;
    _total = 0;
    _flipped = false;
    _answered = false;
    _answers = [];
    _fcAnswers = [];
  }

  function _saveProgress(scorePct) {
    const prev = Storage.getProgress('vocabulary');
    Storage.saveProgress('vocabulary', {
      completed: (prev.completed || 0) + _total,
      total: (prev.total || 0) + _total,
      score: scorePct,
      streak: (prev.streak || 0) + 1,
      lastMode: _mode,
      lastDate: new Date().toISOString().slice(0, 10),
    });
  }

  /**
   * Escape special regex characters so a literal string can be used in
   * a RegExp constructor.
   */
  function _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    init,
    render,
    destroy,
  };

})();

// Register with the application
App.registerModule('vocabulary', VocabularyModule);
