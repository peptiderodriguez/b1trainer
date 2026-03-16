// =============================================================================
// grammar.js — Grammar training module for B1 Goethe Trainer
// =============================================================================

'use strict';

const GrammarModule = {

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Currently active category: 'cases' | 'conjugation' | 'tenses' | 'sentence' | null */
  _category: null,

  /** Current exercise list for the active session */
  _exercises: [],

  /** Index into _exercises for the current question */
  _currentIndex: 0,

  /** Running score for the current session */
  _score: 0,

  /** Whether the current question has been answered */
  _answered: false,

  /** Stored answers for back-navigation review mode */
  _answers: [],

  /** Reorder exercise state: selected word tiles */
  _reorderSelected: [],

  /** Number of exercises per session */
  _sessionSize: 10,

  /** Reference to the content container */
  _container: null,

  // ---------------------------------------------------------------------------
  // Article / case lookup tables
  // ---------------------------------------------------------------------------

  /** Definite articles by gender and case */
  _definiteArticles: {
    der: { nominativ: 'der', genitiv: 'des', dativ: 'dem', akkusativ: 'den' },
    die: { nominativ: 'die', genitiv: 'der', dativ: 'der', akkusativ: 'die' },
    das: { nominativ: 'das', genitiv: 'des', dativ: 'dem', akkusativ: 'das' },
    plural: { nominativ: 'die', genitiv: 'der', dativ: 'den', akkusativ: 'die' },
  },

  /** Indefinite articles by gender and case */
  _indefiniteArticles: {
    der: { nominativ: 'ein', genitiv: 'eines', dativ: 'einem', akkusativ: 'einen' },
    die: { nominativ: 'eine', genitiv: 'einer', dativ: 'einer', akkusativ: 'eine' },
    das: { nominativ: 'ein', genitiv: 'eines', dativ: 'einem', akkusativ: 'ein' },
  },

  /** Case names in German for display */
  _caseNames: {
    nominativ: 'Nominativ',
    genitiv: 'Genitiv',
    dativ: 'Dativ',
    akkusativ: 'Akkusativ',
  },

  /** Pronoun labels in German */
  _pronounLabels: {
    ich: 'ich',
    du: 'du',
    er: 'er',
    sie: 'sie',
    es: 'es',
    wir: 'wir',
    ihr: 'ihr',
    Sie: 'Sie',
  },

  /** Map display pronoun to conjugation data key (verbs.json uses 'es' for 3rd person singular) */
  _conjKey(pronoun) {
    return (pronoun === 'er' || pronoun === 'sie') ? 'es' : pronoun;
  },

  /** Prepositions that govern specific cases */
  _prepositionsByCase: {
    dativ: ['aus', 'bei', 'mit', 'nach', 'seit', 'von', 'zu', 'gegenüber', 'außer'],
    akkusativ: ['durch', 'für', 'gegen', 'ohne', 'um', 'bis', 'entlang'],
    wechsel: ['an', 'auf', 'hinter', 'in', 'neben', 'über', 'unter', 'vor', 'zwischen'],
    genitiv: ['wegen', 'trotz', 'während', 'anstatt', 'innerhalb', 'außerhalb'],
  },

  /** Positive feedback phrases */
  _correctPhrases: [
    'Hervorragend! Genau richtig.',
    'Wunderbar, das stimmt!',
    'Sehr gut! Weiter so.',
    'Perfekt! Das ist korrekt.',
    'Ausgezeichnet! Richtige Antwort.',
    'Bravo! Das hast du gut gemacht.',
    'Fantastisch! Genau so ist es.',
    'Prima! Das ist die richtige Antwort.',
  ],

  /** Negative feedback prefix phrases */
  _wrongPhrases: [
    'Leider nicht ganz richtig.',
    'Das war leider falsch.',
    'Nicht ganz, aber ein guter Versuch.',
    'Leider daneben.',
    'Das stimmt leider nicht.',
  ],

  // ---------------------------------------------------------------------------
  // Module interface
  // ---------------------------------------------------------------------------

  init() {
    // Nothing to do — data is loaded by App
  },

  /**
   * Render the grammar module into the given container.
   * @param {HTMLElement} container
   * @param {string}      subRoute
   */
  render(container, subRoute) {
    this._container = container;

    // Show module page
    this._showPage('grammar');

    // Attach toolbar handlers
    this._attachToolbar();

    // If subRoute specifies a category, jump to it
    if (subRoute) {
      const catMap = { cases: 'cases', conjugation: 'conjugation', tenses: 'tenses', sentence: 'sentence' };
      if (catMap[subRoute]) {
        this._startCategory(catMap[subRoute]);
        return;
      }
    }

    // Default: show category picker
    this._renderCategoryPicker();
  },

  destroy() {
    this._category = null;
    this._exercises = [];
    this._currentIndex = 0;
    this._score = 0;
    this._answered = false;
    this._answers = [];
    this._reorderSelected = [];
  },

  // ---------------------------------------------------------------------------
  // Page visibility
  // ---------------------------------------------------------------------------

  /**
   * Show the specified module page and hide all others.
   * @param {string} name
   */
  _showPage(name) {
    document.querySelectorAll('.module-page').forEach(p => p.hidden = true);
    const page = document.getElementById('page-' + name);
    if (page) page.hidden = false;
  },

  // ---------------------------------------------------------------------------
  // Toolbar
  // ---------------------------------------------------------------------------

  _attachToolbar() {
    const toolbar = document.querySelector('#page-grammar .module-page__toolbar');
    if (!toolbar) return;

    // Clone-replace buttons to remove any previous listeners
    toolbar.querySelectorAll('button[data-action]').forEach(btn => {
      const fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
      fresh.addEventListener('click', () => {
        const action = fresh.dataset.action;
        const catMap = {
          'grammar-cases': 'cases',
          'grammar-conjugation': 'conjugation',
          'grammar-tenses': 'tenses',
          'grammar-sentence': 'sentence',
        };
        if (catMap[action]) {
          this._startCategory(catMap[action]);
          this._updateToolbarActive(fresh);
        }
      });
    });
  },

  /**
   * Highlight the active toolbar button.
   * @param {HTMLElement} activeBtn
   */
  _updateToolbarActive(activeBtn) {
    const toolbar = document.querySelector('#page-grammar .module-page__toolbar');
    if (!toolbar) return;
    toolbar.querySelectorAll('button[data-action]').forEach(btn => {
      btn.classList.toggle('btn--accent', btn === activeBtn);
      btn.classList.toggle('btn--outline', btn !== activeBtn);
    });
  },

  // ---------------------------------------------------------------------------
  // Category picker (landing view)
  // ---------------------------------------------------------------------------

  _renderCategoryPicker() {
    const content = document.getElementById('grammar-content');
    if (!content) return;

    const categories = [
      { key: 'cases', title: 'Fälle', icon: '📋', desc: 'Nominativ, Akkusativ, Dativ, Genitiv — Artikel und Präpositionen' },
      { key: 'conjugation', title: 'Konjugation', icon: '🔄', desc: 'Verben in verschiedenen Personen konjugieren' },
      { key: 'tenses', title: 'Zeiten', icon: '⏰', desc: 'Präsens, Perfekt, Präteritum, Konjunktiv II' },
      { key: 'sentence', title: 'Satzbau', icon: '🏗️', desc: 'Wortstellung, Nebensätze und Konnektoren' },
    ];

    let html = '<div class="grammar-categories">';
    categories.forEach(cat => {
      const progress = this._getCategoryProgress(cat.key);
      const pct = progress.total > 0 ? Math.round((progress.correct / progress.total) * 100) : 0;
      html += `
        <div class="grammar-category-card" data-category="${cat.key}">
          <div class="grammar-category-card__icon">${cat.icon}</div>
          <h3 class="grammar-category-card__title">${escapeHtml(cat.title)}</h3>
          <p class="grammar-category-card__desc">${escapeHtml(cat.desc)}</p>
          <div class="progress-bar progress-bar--small">
            <div class="progress-bar__fill" style="width: ${pct}%"></div>
          </div>
          <span class="grammar-category-card__stat">${progress.correct}/${progress.total} richtig (${pct}%)</span>
          <button class="btn btn--accent grammar-category-card__btn">Üben</button>
        </div>
      `;
    });
    html += '</div>';

    content.innerHTML = html;

    // Bind clicks
    content.querySelectorAll('.grammar-category-card').forEach(card => {
      card.querySelector('.grammar-category-card__btn').addEventListener('click', () => {
        const key = card.dataset.category;
        this._startCategory(key);
        // Also update toolbar highlight
        const actionMap = { cases: 'grammar-cases', conjugation: 'grammar-conjugation', tenses: 'grammar-tenses', sentence: 'grammar-sentence' };
        const btn = document.querySelector(`button[data-action="${actionMap[key]}"]`);
        if (btn) this._updateToolbarActive(btn);
      });
    });
  },

  // ---------------------------------------------------------------------------
  // Start a category
  // ---------------------------------------------------------------------------

  /**
   * Start a new exercise session for the given category.
   * @param {string} category
   */
  _startCategory(category) {
    this._category = category;
    this._currentIndex = 0;
    this._score = 0;
    this._answered = false;
    this._answers = [];
    this._reorderSelected = [];

    // Build the topic picker for this category
    this._renderTopicPicker(category);
  },

  // ---------------------------------------------------------------------------
  // Topic picker
  // ---------------------------------------------------------------------------

  /**
   * Render topic selection cards for a given category.
   * @param {string} category
   */
  _renderTopicPicker(category) {
    const content = document.getElementById('grammar-content');
    if (!content) return;

    const topics = this._getTopicsForCategory(category);

    let html = `
      <div class="grammar-topic-header">
        <button class="btn btn--outline grammar-back-btn">&larr; Zurück</button>
        <h2>${escapeHtml(this._categoryTitle(category))}</h2>
        <p>Wähle ein Thema oder starte eine gemischte Übung.</p>
      </div>
      <div class="grammar-topic-actions">
        <button class="btn btn--accent grammar-start-mixed">Gemischte Übung (${this._sessionSize} Fragen)</button>
      </div>
      <div class="grammar-topics-grid">
    `;

    topics.forEach(topic => {
      const progress = this._getTopicProgress(category, topic.key);
      const pct = progress.total > 0 ? Math.round((progress.correct / progress.total) * 100) : 0;
      html += `
        <div class="grammar-topic-card" data-topic="${escapeHtml(topic.key)}">
          <h4 class="grammar-topic-card__title">${escapeHtml(topic.title)}</h4>
          <p class="grammar-topic-card__count">${topic.count} Übungen</p>
          <div class="progress-bar progress-bar--small">
            <div class="progress-bar__fill" style="width: ${pct}%"></div>
          </div>
          <span class="grammar-topic-card__stat">${pct}%</span>
        </div>
      `;
    });

    html += '</div>';
    content.innerHTML = html;

    // Back button
    content.querySelector('.grammar-back-btn').addEventListener('click', () => {
      this._renderCategoryPicker();
    });

    // Mixed exercise button
    content.querySelector('.grammar-start-mixed').addEventListener('click', () => {
      this._exercises = this._buildExercises(category, null, this._sessionSize);
      this._currentIndex = 0;
      this._score = 0;
      this._answers = [];
      this._renderExercise();
    });

    // Topic cards
    content.querySelectorAll('.grammar-topic-card').forEach(card => {
      card.addEventListener('click', () => {
        const topicKey = card.dataset.topic;
        this._exercises = this._buildExercises(category, topicKey, this._sessionSize);
        this._currentIndex = 0;
        this._score = 0;
        this._answers = [];
        this._renderExercise();
      });
    });
  },

  /**
   * Return a human-readable title for a category.
   * @param {string} category
   * @returns {string}
   */
  _categoryTitle(category) {
    const titles = {
      cases: 'Fälle — Kasus',
      conjugation: 'Konjugation — Verben beugen',
      tenses: 'Zeiten — Tempus',
      sentence: 'Satzbau — Satzstruktur',
    };
    return titles[category] || category;
  },

  // ---------------------------------------------------------------------------
  // Topic definitions per category
  // ---------------------------------------------------------------------------

  /**
   * Return available topics for a category, each with a title, key, and exercise count.
   * @param {string} category
   * @returns {Array<{key: string, title: string, count: number}>}
   */
  _getTopicsForCategory(category) {
    switch (category) {
      case 'cases': return this._getCasesTopics();
      case 'conjugation': return this._getConjugationTopics();
      case 'tenses': return this._getTensesTopics();
      case 'sentence': return this._getSentenceTopics();
      default: return [];
    }
  },

  _getCasesTopics() {
    const grammarExercises = this._getGrammarExercises();
    const topics = [
      { key: 'prepositions_dativ', title: 'Präpositionen + Dativ', filter: e => this._topicMatches(e, ['prepositions_dativ']) },
      { key: 'prepositions_akkusativ', title: 'Präpositionen + Akkusativ', filter: e => this._topicMatches(e, ['prepositions_akkusativ']) },
      { key: 'prepositions_wechsel', title: 'Wechselpräpositionen', filter: e => this._topicMatches(e, ['prepositions_wechsel']) },
      { key: 'prepositions_genitiv', title: 'Präpositionen + Genitiv', filter: e => this._topicMatches(e, ['prepositions_genitiv']) },
      { key: 'adjective_declension', title: 'Adjektivdeklination', filter: e => this._topicMatches(e, ['adjective_declension']) },
      { key: 'relative_clauses', title: 'Relativsätze', filter: e => this._topicMatches(e, ['relative_clauses']) },
      { key: 'dynamic_cases', title: 'Nomen deklinieren', filter: null },
    ];

    return topics.map(t => {
      let count;
      if (t.key === 'dynamic_cases') {
        count = this._getNounsWithDeclension().length;
      } else {
        count = grammarExercises.filter(t.filter).length;
      }
      return { key: t.key, title: t.title, count: Math.min(count, 50) };
    });
  },

  _getConjugationTopics() {
    const verbs = this._getVerbsWithConjugation();
    const separable = verbs.filter(v => v.conjugation && v.conjugation.separable);
    const modal = verbs.filter(v => v.conjugation && v.conjugation.modal);
    const reflexive = verbs.filter(v => v.word && v.word.startsWith('sich '));
    const regular = verbs.filter(v => v.conjugation && !v.conjugation.separable && !v.conjugation.modal && !v.word.startsWith('sich '));

    return [
      { key: 'regular', title: 'Regelmäßige Verben', count: Math.min(regular.length, 50) },
      { key: 'separable', title: 'Trennbare Verben', count: Math.min(separable.length, 50) },
      { key: 'modal', title: 'Modalverben', count: Math.min(modal.length, 50) },
      { key: 'reflexive', title: 'Reflexive Verben', count: Math.min(reflexive.length, 50) },
      { key: 'all_verbs', title: 'Alle Verben', count: Math.min(verbs.length, 50) },
    ];
  },

  _getTensesTopics() {
    const grammarExercises = this._getGrammarExercises();
    const verbs = this._getVerbsWithConjugation();

    return [
      { key: 'präsens', title: 'Präsens', count: Math.min(verbs.length, 50) },
      { key: 'perfekt', title: 'Perfekt', count: Math.min(verbs.filter(v => v.conjugation && v.conjugation.perfekt).length, 50) },
      { key: 'präteritum', title: 'Präteritum', count: Math.min(verbs.filter(v => v.conjugation && v.conjugation.präteritum).length, 50) },
      { key: 'konjunktiv', title: 'Konjunktiv II', count: Math.max(10, grammarExercises.filter(e => this._topicMatches(e, ['konjunktiv'])).length) },
      { key: 'passiv', title: 'Passiv', count: grammarExercises.filter(e => this._topicMatches(e, ['passiv'])).length || 10 },
    ];
  },

  _getSentenceTopics() {
    const grammarExercises = this._getGrammarExercises();

    return [
      { key: 'nebensätze', title: 'Nebensätze', count: Math.max(10, grammarExercises.filter(e => this._topicMatches(e, ['nebensätz', 'nebensatz'])).length) },
      { key: 'connectors', title: 'Konnektoren', count: Math.max(10, grammarExercises.filter(e => this._topicMatches(e, ['connector', 'konnektor'])).length) },
      { key: 'word_order', title: 'Wortstellung', count: 10 },
      { key: 'verb_position', title: 'Verbposition im Nebensatz', count: 10 },
      { key: 'haupt_neben', title: 'Hauptsatz vs. Nebensatz', count: 10 },
    ];
  },

  // ---------------------------------------------------------------------------
  // Exercise builders
  // ---------------------------------------------------------------------------

  /**
   * Build a list of exercises for a category/topic combination.
   * @param {string}      category
   * @param {string|null} topicKey - null for mixed
   * @param {number}      count
   * @returns {Array}
   */
  _buildExercises(category, topicKey, count) {
    let pool = [];

    switch (category) {
      case 'cases':
        pool = this._buildCasesExercises(topicKey);
        break;
      case 'conjugation':
        pool = this._buildConjugationExercises(topicKey);
        break;
      case 'tenses':
        pool = this._buildTensesExercises(topicKey);
        break;
      case 'sentence':
        pool = this._buildSentenceExercises(topicKey);
        break;
    }

    if (pool.length === 0) {
      // Fallback: generate a few from data
      pool = this._generateFallbackExercises(category, count);
    }

    shuffleArray(pool);
    return pool.slice(0, count);
  },

  // ---- Cases exercises ----

  _buildCasesExercises(topicKey) {
    const grammarExercises = this._getGrammarExercises();

    if (topicKey === 'dynamic_cases') {
      return this._generateDynamicCaseExercises();
    }

    if (topicKey === null) {
      // Mixed: combine grammar.json exercises + dynamic
      const fromJson = grammarExercises.filter(e =>
        this._topicMatches(e, ['prepositions_dativ', 'prepositions_akkusativ', 'prepositions_wechsel',
          'prepositions_genitiv', 'adjective_declension', 'relative_clauses'])
      );
      const dynamic = this._generateDynamicCaseExercises();
      return [...fromJson, ...dynamic];
    }

    // Specific topic from grammar.json
    if (topicKey === 'adjective_declension') {
      return grammarExercises.filter(e => this._topicMatches(e, ['adjective_declension']));
    }
    if (topicKey === 'relative_clauses') {
      return grammarExercises.filter(e => this._topicMatches(e, ['relative_clauses']));
    }

    // Preposition topics
    const filtered = grammarExercises.filter(e => this._topicMatches(e, [topicKey]));
    // Supplement with generated preposition exercises if few in JSON
    if (filtered.length < 5) {
      return [...filtered, ...this._generatePrepositionExercises(topicKey)];
    }
    return filtered;
  },

  /**
   * Generate dynamic case exercises from noun declension data.
   * @returns {Array}
   */
  _generateDynamicCaseExercises() {
    const nouns = this._getNounsWithDeclension();
    const exercises = [];
    const cases = ['nominativ', 'genitiv', 'dativ', 'akkusativ'];
    const selected = pickRandom(nouns, 20);

    selected.forEach(noun => {
      const article = noun.article;
      const randomCase = cases[Math.floor(Math.random() * cases.length)];
      const caseForm = noun.declension[randomCase];
      if (!caseForm) return;

      const articleInCase = this._definiteArticles[article]
        ? this._definiteArticles[article][randomCase]
        : article;

      // Type 1: "What is the [case] of [noun]?"
      exercises.push({
        type: 'multiple_choice',
        topic: 'dynamic_cases',
        subtopic: randomCase,
        difficulty: 'B1',
        instruction: `Wie lautet der bestimmte Artikel im ${this._caseNames[randomCase]}?`,
        sentence: `${noun.word} → ${this._caseNames[randomCase]}`,
        answer: articleInCase,
        options: this._shuffledCaseArticles(article, randomCase),
        explanation: `Im ${this._caseNames[randomCase]} wird "${noun.word}" zu "${articleInCase} ${caseForm.singular}".`,
        hint: `Denke an den Artikel: ${article} → ${this._caseNames[randomCase]}`,
      });

      // Type 2: Fill in the blank with article
      const prepositions = { dativ: 'mit', akkusativ: 'für', genitiv: 'wegen', nominativ: '' };
      const prep = prepositions[randomCase];
      if (prep) {
        exercises.push({
          type: 'fill_blank',
          topic: 'dynamic_cases',
          subtopic: randomCase,
          difficulty: 'B1',
          instruction: `Setze den richtigen Artikel ein (${this._caseNames[randomCase]}).`,
          sentence: `${prep} ___ ${caseForm.singular}`,
          answer: articleInCase,
          options: [],
          explanation: `Nach "${prep}" steht der ${this._caseNames[randomCase]}: "${articleInCase}".`,
          hint: `"${prep}" verlangt den ${this._caseNames[randomCase]}.`,
        });
      }

      // Type 3: Multiple choice with all 4 case forms
      if (Math.random() > 0.5) {
        const allForms = cases.map(c => {
          const art = this._definiteArticles[article] ? this._definiteArticles[article][c] : article;
          const form = noun.declension[c];
          return form ? `${art} ${form.singular}` : null;
        }).filter(Boolean);

        if (allForms.length === 4) {
          const correctForm = `${articleInCase} ${caseForm.singular}`;
          exercises.push({
            type: 'multiple_choice',
            topic: 'dynamic_cases',
            subtopic: randomCase,
            difficulty: 'B1',
            instruction: `Welche Form steht im ${this._caseNames[randomCase]}?`,
            sentence: noun.word,
            answer: correctForm,
            options: shuffleArray([...allForms]),
            explanation: `Im ${this._caseNames[randomCase]}: "${correctForm}".`,
            hint: `Der Artikel "${article}" ändert sich je nach Fall.`,
          });
        }
      }
    });

    return exercises;
  },

  /**
   * Generate preposition exercises when grammar.json has few entries.
   * @param {string} topicKey
   * @returns {Array}
   */
  _generatePrepositionExercises(topicKey) {
    const exercises = [];
    const nouns = this._getNounsWithDeclension();
    if (nouns.length === 0) return exercises;

    let preps = [];
    let caseKey = 'dativ';

    if (topicKey === 'prepositions_dativ') {
      preps = this._prepositionsByCase.dativ;
      caseKey = 'dativ';
    } else if (topicKey === 'prepositions_akkusativ') {
      preps = this._prepositionsByCase.akkusativ;
      caseKey = 'akkusativ';
    } else if (topicKey === 'prepositions_genitiv') {
      preps = this._prepositionsByCase.genitiv;
      caseKey = 'genitiv';
    } else if (topicKey === 'prepositions_wechsel') {
      preps = this._prepositionsByCase.wechsel;
      // Wechselpräpositionen can be dativ or akkusativ
      caseKey = Math.random() > 0.5 ? 'dativ' : 'akkusativ';
    }

    const selected = pickRandom(nouns, 15);

    selected.forEach(noun => {
      const prep = preps[Math.floor(Math.random() * preps.length)];
      const article = noun.article;
      const artMap = this._definiteArticles[article];
      if (!artMap) return;

      const correctArticle = artMap[caseKey];
      const form = noun.declension[caseKey];
      if (!form) return;

      const wrongArticles = Object.values(artMap).filter(a => a !== correctArticle);
      // Add some articles from other genders for variety
      const allWrong = [...new Set([...wrongArticles, 'dem', 'den', 'der', 'des', 'die', 'das'].filter(a => a !== correctArticle))];
      const options = shuffleArray([correctArticle, ...pickRandom(allWrong, 3)]);

      exercises.push({
        type: 'multiple_choice',
        topic: topicKey,
        subtopic: caseKey,
        difficulty: 'B1',
        instruction: `Welcher Artikel passt nach "${prep}"? (${this._caseNames[caseKey]})`,
        sentence: `${prep} ___ ${form.singular}`,
        answer: correctArticle,
        options: options.slice(0, 4),
        explanation: `"${prep}" verlangt den ${this._caseNames[caseKey]}. Also: "${prep} ${correctArticle} ${form.singular}".`,
        hint: `"${prep}" + ${this._caseNames[caseKey]}`,
      });
    });

    return exercises;
  },

  /**
   * Return shuffled article options for a multiple-choice case question.
   * @param {string} gender - 'der', 'die', 'das'
   * @param {string} correctCase
   * @returns {string[]}
   */
  _shuffledCaseArticles(gender, correctCase) {
    const artMap = this._definiteArticles[gender];
    if (!artMap) return ['der', 'die', 'das', 'den'];

    const correct = artMap[correctCase];
    const others = ['der', 'die', 'das', 'dem', 'den', 'des'].filter(a => a !== correct);
    const options = [correct, ...pickRandom(others, 3)];
    return shuffleArray(options);
  },

  // ---- Conjugation exercises ----

  _buildConjugationExercises(topicKey) {
    const verbs = this._getVerbsWithConjugation();
    let pool;

    switch (topicKey) {
      case 'separable':
        pool = verbs.filter(v => v.conjugation && v.conjugation.separable);
        break;
      case 'modal':
        pool = verbs.filter(v => v.conjugation && v.conjugation.modal);
        break;
      case 'reflexive':
        pool = verbs.filter(v => v.word && v.word.startsWith('sich '));
        break;
      case 'regular':
        pool = verbs.filter(v => v.conjugation && !v.conjugation.separable && !v.conjugation.modal && !v.word.startsWith('sich '));
        break;
      default:
        pool = verbs;
    }

    const selected = pickRandom(pool, 20);
    const exercises = [];
    const pronouns = ['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'Sie'];

    selected.forEach(verb => {
      const conj = verb.conjugation;
      if (!conj || !conj.präsens) return;

      const pronoun = pronouns[Math.floor(Math.random() * pronouns.length)];
      const conjKey = this._conjKey(pronoun);
      const correctForm = conj.präsens[conjKey];
      if (!correctForm) return;

      // Build wrong options from other pronouns of the same verb
      const wrongForms = pronouns
        .map(p => this._conjKey(p))
        .filter(p => p !== conjKey)
        .map(p => conj.präsens[p])
        .filter(f => f && f !== correctForm);

      // Add forms from other verbs for more variety
      const otherVerbs = pickRandom(verbs.filter(v => v !== verb && v.conjugation && v.conjugation.präsens), 3);
      otherVerbs.forEach(ov => {
        const f = ov.conjugation.präsens[conjKey];
        if (f && f !== correctForm) wrongForms.push(f);
      });

      const uniqueWrong = [...new Set(wrongForms)].slice(0, 3);
      const options = shuffleArray([correctForm, ...uniqueWrong]);

      const pronounDisplay = this._pronounLabels[pronoun] || pronoun;
      const isReflexive = verb.word.startsWith('sich ');
      const reflexiveNote = isReflexive ? ' (reflexiv)' : '';
      const separableNote = conj.separable ? ' (trennbar)' : '';
      const modalNote = conj.modal ? ' (Modalverb)' : '';

      exercises.push({
        type: 'fill_blank',
        topic: 'conjugation',
        subtopic: topicKey || 'all',
        difficulty: 'B1',
        instruction: `Konjugiere "${verb.word}" für "${pronounDisplay}" im Präsens.${reflexiveNote}${separableNote}${modalNote}`,
        sentence: `${pronounDisplay} ___`,
        answer: correctForm,
        options: options,
        explanation: this._buildConjugationTable(verb),
        hint: `Infinitiv: ${verb.word}`,
        _verb: verb,
        _translation: verb.translation || '',
      });

      // Also add a multiple-choice variant
      if (options.length >= 4) {
        exercises.push({
          type: 'multiple_choice',
          topic: 'conjugation',
          subtopic: topicKey || 'all',
          difficulty: 'B1',
          instruction: `Welche Form von "${verb.word}" passt zu "${pronounDisplay}" (Präsens)?`,
          sentence: `${pronounDisplay} ___`,
          answer: correctForm,
          options: options.slice(0, 4),
          explanation: this._buildConjugationTable(verb),
          hint: `Infinitiv: ${verb.word}`,
          _translation: verb.translation || '',
          _verb: verb,
        });
      }
    });

    return exercises;
  },

  /**
   * Build an HTML conjugation table for feedback display.
   * @param {object} verb
   * @returns {string}
   */
  _buildConjugationTable(verb) {
    const conj = verb.conjugation;
    if (!conj || !conj.präsens) return `Infinitiv: ${verb.word}`;

    const pronounOrder = ['ich', 'du', 'es', 'wir', 'ihr', 'Sie'];
    const tableLabels = { ich: 'ich', du: 'du', es: 'er/sie/es', wir: 'wir', ihr: 'ihr', Sie: 'Sie' };
    let table = `<strong>${escapeHtml(verb.word)}</strong> — Präsens:<br>`;
    table += '<table class="grammar-conj-table">';
    pronounOrder.forEach(p => {
      const label = tableLabels[p] || p;
      const form = conj.präsens[p] || '—';
      table += `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(form)}</td></tr>`;
    });
    table += '</table>';

    if (conj.perfekt) {
      const aux = conj.withSein ? 'ist' : 'hat';
      table += `<br>Perfekt: ${aux} ${escapeHtml(conj.perfekt)}`;
    }

    return table;
  },

  // ---- Tenses exercises ----

  _buildTensesExercises(topicKey) {
    const grammarExercises = this._getGrammarExercises();
    const verbs = this._getVerbsWithConjugation();
    const exercises = [];

    if (topicKey === 'konjunktiv' || topicKey === 'passiv') {
      // Use grammar.json exercises
      const fromJson = grammarExercises.filter(e => this._topicMatches(e, [topicKey]));
      if (fromJson.length > 0) return fromJson;
      // Generate fallback konjunktiv exercises
      return this._generateKonjunktivExercises();
    }

    if (topicKey === null) {
      // Mixed tenses
      const präsens = this._generatePräsensExercises(pickRandom(verbs, 5));
      const perfekt = this._generatePerfektExercises(pickRandom(verbs.filter(v => v.conjugation && v.conjugation.perfekt), 5));
      const präteritum = this._generatePräteritumExercises(pickRandom(verbs.filter(v => v.conjugation && v.conjugation.präteritum), 5));
      const konj = this._generateKonjunktivExercises();
      const fromJson = grammarExercises.filter(e => this._topicMatches(e, ['konjunktiv', 'passiv']));
      return [...präsens, ...perfekt, ...präteritum, ...konj.slice(0, 3), ...fromJson.slice(0, 3)];
    }

    const selected = pickRandom(
      verbs.filter(v => {
        if (topicKey === 'perfekt') return v.conjugation && v.conjugation.perfekt;
        if (topicKey === 'präteritum') return v.conjugation && v.conjugation.präteritum;
        return v.conjugation && v.conjugation.präsens;
      }),
      15
    );

    switch (topicKey) {
      case 'präsens':
        return this._generatePräsensExercises(selected);
      case 'perfekt':
        return this._generatePerfektExercises(selected);
      case 'präteritum':
        return this._generatePräteritumExercises(selected);
      default:
        return exercises;
    }
  },

  _generatePräsensExercises(verbs) {
    const exercises = [];
    const pronouns = ['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'Sie'];

    verbs.forEach(verb => {
      const conj = verb.conjugation;
      if (!conj || !conj.präsens) return;

      const pronoun = pronouns[Math.floor(Math.random() * pronouns.length)];
      const conjKey = this._conjKey(pronoun);
      const correctForm = conj.präsens[conjKey];
      if (!correctForm) return;

      const pronounDisplay = this._pronounLabels[pronoun] || pronoun;

      exercises.push({
        type: 'fill_blank',
        topic: 'tenses',
        subtopic: 'präsens',
        difficulty: 'B1',
        instruction: `Setze das Verb "${verb.word}" im Präsens ein.`,
        sentence: `${pronounDisplay} ___ (${verb.word})`,
        answer: correctForm,
        options: [],
        explanation: `Präsens: ${pronounDisplay} ${correctForm}.<br>${this._buildConjugationTable(verb)}`,
        hint: `Konjugiere "${verb.word}" für "${pronounDisplay}".`,
        _translation: verb.translation || '',
      });
    });

    return exercises;
  },

  _generatePerfektExercises(verbs) {
    const exercises = [];

    verbs.forEach(verb => {
      const conj = verb.conjugation;
      if (!conj || !conj.perfekt) return;

      const aux = conj.withSein ? 'ist' : 'hat';
      const partizip = conj.perfekt;

      // Format: "Er/sie ___ gestern ___." for sein verbs or hat verbs
      exercises.push({
        type: 'fill_blank',
        topic: 'tenses',
        subtopic: 'perfekt',
        difficulty: 'B1',
        instruction: `Bilde das Perfekt von "${verb.word}".`,
        sentence: `Er/sie ___ ... ___ (${verb.word})`,
        answer: `${aux} ... ${partizip}`,
        options: [],
        explanation: `Perfekt von "${verb.word}": ${aux} ${partizip}.${conj.withSein ? ' Dieses Verb bildet das Perfekt mit "sein".' : ' Dieses Verb bildet das Perfekt mit "haben".'}`,
        hint: `Hilfsverb: ${aux}`,
        _acceptAlternatives: [
          `${aux} ${partizip}`,
          `${aux}...${partizip}`,
          `${aux} ... ${partizip}`,
          partizip,
        ],
      });

      // Multiple choice: which auxiliary?
      exercises.push({
        type: 'multiple_choice',
        topic: 'tenses',
        subtopic: 'perfekt',
        difficulty: 'B1',
        instruction: `Welches Hilfsverb verwendet man im Perfekt von "${verb.word}"?`,
        sentence: `Er/sie ___ ${partizip}.`,
        answer: aux,
        options: shuffleArray(['hat', 'ist', 'wird', 'hatte']),
        explanation: `"${verb.word}" bildet das Perfekt mit "${aux}": ${aux} ${partizip}.${conj.withSein ? ' (Bewegungsverb/Zustandsänderung → sein)' : ' (→ haben)'}`,
        hint: conj.withSein ? 'Denke an Bewegungsverben.' : 'Die meisten Verben nutzen "haben".',
      });
    });

    return exercises;
  },

  _generatePräteritumExercises(verbs) {
    const exercises = [];
    const pronouns = ['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'Sie'];

    verbs.forEach(verb => {
      const conj = verb.conjugation;
      if (!conj || !conj.präteritum) return;

      const pronoun = pronouns[Math.floor(Math.random() * pronouns.length)];
      const conjKey = this._conjKey(pronoun);
      const correctForm = conj.präteritum[conjKey];
      if (!correctForm) return;

      const pronounDisplay = this._pronounLabels[pronoun] || pronoun;

      // Build wrong options
      const wrongForms = pronouns
        .map(p => this._conjKey(p))
        .filter(p => p !== conjKey)
        .map(p => conj.präteritum[p])
        .filter(f => f && f !== correctForm);
      const uniqueWrong = [...new Set(wrongForms)].slice(0, 3);
      const options = shuffleArray([correctForm, ...uniqueWrong]);

      exercises.push({
        type: options.length >= 3 ? 'multiple_choice' : 'fill_blank',
        topic: 'tenses',
        subtopic: 'präteritum',
        difficulty: 'B1',
        instruction: `Setze "${verb.word}" im Präteritum ein.`,
        sentence: `${pronounDisplay} ___ (${verb.word})`,
        answer: correctForm,
        options: options.slice(0, 4),
        explanation: `Präteritum: ${pronounDisplay} ${correctForm}.`,
        hint: `Wie heißt die Vergangenheitsform von "${verb.word}"?`,
        _translation: verb.translation || '',
      });
    });

    return exercises;
  },

  _generateKonjunktivExercises() {
    // Generate some common Konjunktiv II exercises
    const konjunktivForms = [
      { verb: 'sein', forms: { ich: 'wäre', du: 'wärst', es: 'wäre', wir: 'wären', ihr: 'wärt', Sie: 'wären' } },
      { verb: 'haben', forms: { ich: 'hätte', du: 'hättest', es: 'hätte', wir: 'hätten', ihr: 'hättet', Sie: 'hätten' } },
      { verb: 'können', forms: { ich: 'könnte', du: 'könntest', es: 'könnte', wir: 'könnten', ihr: 'könntet', Sie: 'könnten' } },
      { verb: 'müssen', forms: { ich: 'müsste', du: 'müsstest', es: 'müsste', wir: 'müssten', ihr: 'müsstet', Sie: 'müssten' } },
      { verb: 'sollen', forms: { ich: 'sollte', du: 'solltest', es: 'sollte', wir: 'sollten', ihr: 'solltet', Sie: 'sollten' } },
      { verb: 'wollen', forms: { ich: 'wollte', du: 'wolltest', es: 'wollte', wir: 'wollten', ihr: 'wolltet', Sie: 'wollten' } },
      { verb: 'werden', forms: { ich: 'würde', du: 'würdest', es: 'würde', wir: 'würden', ihr: 'würdet', Sie: 'würden' } },
      { verb: 'geben', forms: { ich: 'gäbe', du: 'gäbst', es: 'gäbe', wir: 'gäben', ihr: 'gäbt', Sie: 'gäben' } },
      { verb: 'kommen', forms: { ich: 'käme', du: 'kämst', es: 'käme', wir: 'kämen', ihr: 'kämt', Sie: 'kämen' } },
      { verb: 'gehen', forms: { ich: 'ginge', du: 'gingst', es: 'ginge', wir: 'gingen', ihr: 'gingt', Sie: 'gingen' } },
    ];

    const exercises = [];
    const pronouns = ['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'Sie'];

    konjunktivForms.forEach(entry => {
      const pronoun = pronouns[Math.floor(Math.random() * pronouns.length)];
      const conjKey = this._conjKey(pronoun);
      const correct = entry.forms[conjKey];
      if (!correct) return;

      const pronounDisplay = this._pronounLabels[pronoun] || pronoun;

      // Gather wrong options
      const wrong = Object.entries(entry.forms)
        .filter(([p, f]) => p !== conjKey && f !== correct)
        .map(([, f]) => f);
      const options = shuffleArray([correct, ...pickRandom(wrong, 3)]);

      exercises.push({
        type: 'multiple_choice',
        topic: 'tenses',
        subtopic: 'konjunktiv',
        difficulty: 'B1',
        instruction: `Wie lautet der Konjunktiv II von "${entry.verb}" für "${pronounDisplay}"?`,
        sentence: `Wenn ${pronounDisplay} ___ ... (${entry.verb})`,
        answer: correct,
        options: options.slice(0, 4),
        explanation: `Konjunktiv II von "${entry.verb}": ${pronounDisplay} ${correct}.`,
        hint: `Konjunktiv II von "${entry.verb}"`,
      });
    });

    return exercises;
  },

  // ---- Sentence structure exercises ----

  _buildSentenceExercises(topicKey) {
    const grammarExercises = this._getGrammarExercises();

    if (topicKey === null) {
      // Mixed
      const fromJson = grammarExercises.filter(e =>
        this._topicMatches(e, ['nebensätz', 'nebensatz', 'connector', 'konnektor', 'wortstellung', 'satzbau'])
      );
      const reorder = this._generateReorderExercises();
      const verbPos = this._generateVerbPositionExercises();
      const hauptNeben = this._generateHauptNebenExercises();
      return [...fromJson, ...reorder, ...verbPos, ...hauptNeben];
    }

    switch (topicKey) {
      case 'nebensätze': {
        const fromJson = grammarExercises.filter(e => this._topicMatches(e, ['nebensätz', 'nebensatz']));
        return fromJson.length > 0 ? fromJson : this._generateVerbPositionExercises();
      }
      case 'connectors': {
        const fromJson = grammarExercises.filter(e => this._topicMatches(e, ['connector', 'konnektor']));
        return fromJson.length > 0 ? fromJson : this._generateConnectorExercises();
      }
      case 'word_order':
        return this._generateReorderExercises();
      case 'verb_position':
        return this._generateVerbPositionExercises();
      case 'haupt_neben':
        return this._generateHauptNebenExercises();
      default:
        return [];
    }
  },

  _generateReorderExercises() {
    const sentences = [
      { correct: 'Ich gehe morgen zum Arzt.', hint: 'Subjekt + Verb + Zeit + Ort' },
      { correct: 'Der Patient muss die Tabletten nehmen.', hint: 'Modalverb an Position 2, Infinitiv am Ende' },
      { correct: 'Gestern hat sie ihren Freund besucht.', hint: 'Zeitangabe an Position 1, Verb an Position 2' },
      { correct: 'Wir fahren am Wochenende nach Berlin.', hint: 'Subjekt + Verb + Zeit + Ort' },
      { correct: 'Er hat sich gestern ein neues Buch gekauft.', hint: 'Perfekt: Hilfsverb an Position 2, Partizip am Ende' },
      { correct: 'Die Kinder spielen jeden Tag im Garten.', hint: 'Subjekt + Verb + Zeit + Ort' },
      { correct: 'Am Montag beginnt der neue Deutschkurs.', hint: 'Zeitangabe an Position 1, Verb an Position 2' },
      { correct: 'Sie möchte im Sommer nach Spanien reisen.', hint: 'Modalverb an Position 2, Infinitiv am Ende' },
      { correct: 'Der Arzt untersucht den Patienten gründlich.', hint: 'Subjekt + Verb + Objekt + Adverb' },
      { correct: 'Nach dem Essen gehen wir spazieren.', hint: 'Präpositionalphrase an Position 1, Verb an Position 2' },
      { correct: 'Ich habe gestern den ganzen Tag gearbeitet.', hint: 'Perfekt: Hilfsverb an Position 2, Partizip am Ende' },
      { correct: 'Kannst du mir bitte das Salz geben?', hint: 'Fragesatz: Verb an Position 1' },
    ];

    return sentences.map(s => {
      const words = s.correct.replace(/[.!?]$/, '').split(/\s+/);
      const jumbled = shuffleArray([...words]);
      // Make sure jumbled is different from original
      if (jumbled.join(' ') === words.join(' ')) {
        const temp = jumbled[0];
        jumbled[0] = jumbled[jumbled.length - 1];
        jumbled[jumbled.length - 1] = temp;
      }

      return {
        type: 'reorder',
        topic: 'sentence',
        subtopic: 'word_order',
        difficulty: 'B1',
        instruction: 'Bringe die Wörter in die richtige Reihenfolge.',
        sentence: jumbled.join(' '),
        answer: s.correct.replace(/[.!?]$/, ''),
        options: jumbled,
        explanation: `Richtige Reihenfolge: "${s.correct}" — ${s.hint}`,
        hint: s.hint,
        _words: jumbled,
      };
    });
  },

  _generateVerbPositionExercises() {
    const exercises = [
      {
        main: 'Ich weiß,',
        clause: 'dass er morgen kommt',
        verb: 'kommt',
        wrong: ['kommt er morgen', 'er morgen kommt', 'er kommt morgen'],
        explanation: 'Im Nebensatz mit "dass" steht das Verb am Ende.',
      },
      {
        main: 'Sie fragt,',
        clause: 'ob wir morgen Zeit haben',
        verb: 'haben',
        wrong: ['haben wir morgen Zeit', 'wir haben morgen Zeit', 'wir morgen haben Zeit'],
        explanation: 'Im Nebensatz mit "ob" steht das Verb am Ende.',
      },
      {
        main: 'Er bleibt zu Hause,',
        clause: 'weil er krank ist',
        verb: 'ist',
        wrong: ['weil ist er krank', 'weil er ist krank', 'er weil krank ist'],
        explanation: 'Im Nebensatz mit "weil" steht das Verb am Ende.',
      },
      {
        main: 'Das ist die Frau,',
        clause: 'die gestern angerufen hat',
        verb: 'hat',
        wrong: ['die hat gestern angerufen', 'die gestern hat angerufen', 'hat die gestern angerufen'],
        explanation: 'Im Relativsatz steht das konjugierte Verb am Ende.',
      },
      {
        main: 'Ich bin müde,',
        clause: 'obwohl ich gut geschlafen habe',
        verb: 'habe',
        wrong: ['obwohl ich habe gut geschlafen', 'obwohl habe ich gut geschlafen', 'ich obwohl gut geschlafen habe'],
        explanation: 'Im Nebensatz mit "obwohl" steht das Verb am Ende.',
      },
      {
        main: 'Er lernt Deutsch,',
        clause: 'damit er in Deutschland arbeiten kann',
        verb: 'kann',
        wrong: ['damit er kann in Deutschland arbeiten', 'damit kann er in Deutschland arbeiten', 'er damit in Deutschland arbeiten kann'],
        explanation: 'Im Nebensatz mit "damit" steht das Verb am Ende.',
      },
      {
        main: 'Ich rufe dich an,',
        clause: 'wenn ich zu Hause bin',
        verb: 'bin',
        wrong: ['wenn ich bin zu Hause', 'wenn bin ich zu Hause', 'ich wenn zu Hause bin'],
        explanation: 'Im Nebensatz mit "wenn" steht das Verb am Ende.',
      },
      {
        main: 'Sie hat erzählt,',
        clause: 'dass sie einen neuen Job gefunden hat',
        verb: 'hat',
        wrong: ['dass sie hat einen neuen Job gefunden', 'dass hat sie einen neuen Job gefunden', 'sie dass einen neuen Job gefunden hat'],
        explanation: 'Im Nebensatz mit "dass" steht das Hilfsverb am Ende.',
      },
      {
        main: 'Das Kind weint,',
        clause: 'weil es hingefallen ist',
        verb: 'ist',
        wrong: ['weil es ist hingefallen', 'weil ist es hingefallen', 'es weil hingefallen ist'],
        explanation: 'Im Nebensatz mit "weil" steht das Hilfsverb am Ende.',
      },
      {
        main: 'Ich weiß nicht,',
        clause: 'wo die Apotheke ist',
        verb: 'ist',
        wrong: ['wo ist die Apotheke', 'die Apotheke wo ist', 'ist wo die Apotheke'],
        explanation: 'Im indirekten Fragesatz steht das Verb am Ende.',
      },
    ];

    return exercises.map(ex => ({
      type: 'multiple_choice',
      topic: 'sentence',
      subtopic: 'verb_position',
      difficulty: 'B1',
      instruction: 'Welcher Nebensatz ist korrekt?',
      sentence: ex.main + ' ...',
      answer: ex.clause,
      options: shuffleArray([ex.clause, ...pickRandom(ex.wrong.filter(w => w !== ex.clause), 3)]).slice(0, 4),
      explanation: `${ex.main} ${ex.clause}. — ${ex.explanation}`,
      hint: 'Im Nebensatz steht das konjugierte Verb am Ende.',
    }));
  },

  _generateHauptNebenExercises() {
    const sentences = [
      { text: 'Ich gehe morgen zum Arzt.', type: 'Hauptsatz', reason: 'Das Verb steht an Position 2.' },
      { text: 'weil ich krank bin', type: 'Nebensatz', reason: '"weil" leitet einen Nebensatz ein, das Verb steht am Ende.' },
      { text: 'Sie hat gestern eingekauft.', type: 'Hauptsatz', reason: 'Das Hilfsverb steht an Position 2.' },
      { text: 'obwohl es geregnet hat', type: 'Nebensatz', reason: '"obwohl" leitet einen Nebensatz ein, das Verb steht am Ende.' },
      { text: 'Der Arzt untersucht den Patienten.', type: 'Hauptsatz', reason: 'Das Verb steht an Position 2.' },
      { text: 'dass er morgen kommen wird', type: 'Nebensatz', reason: '"dass" leitet einen Nebensatz ein, das Verb steht am Ende.' },
      { text: 'Wir fahren nächste Woche in den Urlaub.', type: 'Hauptsatz', reason: 'Das Verb steht an Position 2.' },
      { text: 'wenn das Wetter schön ist', type: 'Nebensatz', reason: '"wenn" leitet einen Nebensatz ein, das Verb steht am Ende.' },
      { text: 'Er muss jeden Tag zur Arbeit fahren.', type: 'Hauptsatz', reason: 'Das Modalverb steht an Position 2.' },
      { text: 'damit wir genug Zeit haben', type: 'Nebensatz', reason: '"damit" leitet einen Nebensatz ein, das Verb steht am Ende.' },
      { text: 'Gestern hat es den ganzen Tag geschneit.', type: 'Hauptsatz', reason: 'Das Verb steht an Position 2 (Inversion).' },
      { text: 'der gestern im Krankenhaus war', type: 'Nebensatz', reason: 'Relativsatz: das Verb steht am Ende.' },
    ];

    return sentences.map(s => ({
      type: 'multiple_choice',
      topic: 'sentence',
      subtopic: 'haupt_neben',
      difficulty: 'B1',
      instruction: 'Ist das ein Hauptsatz oder ein Nebensatz?',
      sentence: s.text,
      answer: s.type,
      options: ['Hauptsatz', 'Nebensatz'],
      explanation: `"${s.text}" ist ein ${s.type}. ${s.reason}`,
      hint: 'Achte auf die Position des Verbs und auf einleitende Konjunktionen.',
    }));
  },

  _generateConnectorExercises() {
    const connectors = [
      { connector: 'weil', type: 'kausal', example: 'Er bleibt zu Hause, weil er krank ist.', position: 'Nebensatz (Verb am Ende)' },
      { connector: 'obwohl', type: 'konzessiv', example: 'Sie geht spazieren, obwohl es regnet.', position: 'Nebensatz (Verb am Ende)' },
      { connector: 'dass', type: 'deklarativ', example: 'Ich weiß, dass du recht hast.', position: 'Nebensatz (Verb am Ende)' },
      { connector: 'wenn', type: 'konditional/temporal', example: 'Wenn es regnet, bleibe ich zu Hause.', position: 'Nebensatz (Verb am Ende)' },
      { connector: 'damit', type: 'final', example: 'Er lernt Deutsch, damit er in Deutschland arbeiten kann.', position: 'Nebensatz (Verb am Ende)' },
      { connector: 'deshalb', type: 'kausal', example: 'Es regnet, deshalb bleibe ich zu Hause.', position: 'Hauptsatz (Inversion: Verb nach Konnektor)' },
      { connector: 'trotzdem', type: 'konzessiv', example: 'Es regnet, trotzdem gehe ich spazieren.', position: 'Hauptsatz (Inversion: Verb nach Konnektor)' },
      { connector: 'aber', type: 'adversativ', example: 'Ich möchte kommen, aber ich habe keine Zeit.', position: 'Hauptsatz (Position 0, kein Einfluss auf Wortstellung)' },
      { connector: 'und', type: 'kopulativ', example: 'Er kocht und sie deckt den Tisch.', position: 'Hauptsatz (Position 0, kein Einfluss auf Wortstellung)' },
      { connector: 'oder', type: 'alternativ', example: 'Möchtest du Tee oder trinkst du lieber Kaffee?', position: 'Hauptsatz (Position 0)' },
    ];

    return connectors.map(c => ({
      type: 'fill_blank',
      topic: 'sentence',
      subtopic: 'connectors',
      difficulty: 'B1',
      instruction: `Welcher Konnektor passt? (${c.type})`,
      sentence: c.example.replace(c.connector, '___'),
      answer: c.connector,
      options: [],
      explanation: `"${c.connector}" (${c.type}) — ${c.position}. Beispiel: ${c.example}`,
      hint: `Gesucht: ein ${c.type}er Konnektor.`,
    }));
  },

  // ---- Fallback exercises ----

  _generateFallbackExercises(category, count) {
    switch (category) {
      case 'cases':
        return this._generateDynamicCaseExercises().slice(0, count);
      case 'conjugation':
        return this._buildConjugationExercises('all_verbs').slice(0, count);
      case 'tenses':
        return this._generatePräsensExercises(pickRandom(this._getVerbsWithConjugation(), count));
      case 'sentence':
        return this._generateReorderExercises().slice(0, count);
      default:
        return [];
    }
  },

  // ---------------------------------------------------------------------------
  // Exercise rendering
  // ---------------------------------------------------------------------------

  /**
   * Render the current exercise.
   */
  _renderExercise() {
    const content = document.getElementById('grammar-content');
    if (!content) return;

    this._answered = false;
    this._reorderSelected = [];

    if (this._currentIndex >= this._exercises.length) {
      this._renderResults();
      return;
    }

    const exercise = this._exercises[this._currentIndex];
    const progress = `Frage ${this._currentIndex + 1} von ${this._exercises.length}`;
    const pct = Math.round(((this._currentIndex) / this._exercises.length) * 100);

    // Bookmark state
    const bookmarkId = exercise.id || `${exercise.topic}_${this._currentIndex}`;
    const isMarked = Storage.isBookmarked('grammar', bookmarkId);

    // Check if this exercise was already answered (review mode via back-navigation)
    const previousAnswer = this._answers[this._currentIndex];
    const isReview = !!previousAnswer;

    let html = `
      <div class="grammar-exercise">
        <div class="grammar-exercise__header">
          <button class="btn btn--outline grammar-back-btn">&larr; Zurück</button>
          <span class="grammar-exercise__progress">${escapeHtml(progress)}</span>
          <button class="bookmark-btn${isMarked ? ' bookmark-btn--active' : ''}" data-bookmark-id="${escapeHtml(bookmarkId)}" title="Lesezeichen">${isMarked ? '\u2605' : '\u2606'}</button>
          <span class="grammar-exercise__score">Punkte: ${this._score}/${this._currentIndex}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar__fill" style="width: ${pct}%"></div>
        </div>
        <div class="grammar-exercise__instruction">${escapeHtml(exercise.instruction || '')}</div>
        <div class="grammar-exercise__sentence">${this._renderSentenceHtml(exercise)}</div>
        <div class="grammar-exercise__body" id="grammar-exercise-body"></div>
        <div class="grammar-exercise__feedback" id="grammar-feedback" ${isReview ? '' : 'hidden'}></div>
        <div class="grammar-exercise__actions" id="grammar-actions"></div>
      </div>
    `;

    content.innerHTML = html;

    // Back button (navigate to topic picker)
    content.querySelector('.grammar-back-btn').addEventListener('click', () => {
      this._renderTopicPicker(this._category);
    });

    // Bookmark button
    content.querySelector('.bookmark-btn').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      const added = Storage.toggleBookmark({
        module: 'grammar',
        id: bookmarkId,
        label: exercise.sentence || exercise.instruction || '',
        detail: exercise.topic || ''
      });
      btn.classList.toggle('bookmark-btn--active', added);
      btn.textContent = added ? '\u2605' : '\u2606';
    });

    const body = document.getElementById('grammar-exercise-body');
    const actions = document.getElementById('grammar-actions');

    // Review mode: show already-answered exercise read-only with feedback
    if (isReview) {
      this._answered = true;
      this._renderReviewMode(body, actions, exercise, previousAnswer);
      return;
    }

    // Render the specific exercise type
    switch (exercise.type) {
      case 'multiple_choice':
        this._renderMultipleChoice(body, actions, exercise);
        break;
      case 'fill_blank':
        this._renderFillBlank(body, actions, exercise);
        break;
      case 'reorder':
        this._renderReorder(body, actions, exercise);
        break;
      case 'transform':
        this._renderTransform(body, actions, exercise);
        break;
      default:
        // Default to fill_blank
        this._renderFillBlank(body, actions, exercise);
    }
  },

  /**
   * Render an already-answered exercise in read-only review mode.
   * Shows the user's given answer, the correct answer, and feedback.
   * @param {HTMLElement} body
   * @param {HTMLElement} actions
   * @param {object} exercise
   * @param {object} previousAnswer - { answered, correct, given }
   */
  _renderReviewMode(body, actions, exercise, previousAnswer) {
    const isCorrect = previousAnswer.correct;
    const given = previousAnswer.given;

    // Show the user's answer and the correct answer
    let html = '<div class="grammar-review">';
    html += `<div class="grammar-review__given">
      <strong>Deine Antwort:</strong>
      <span class="${isCorrect ? 'grammar-input--correct' : 'grammar-input--wrong'}">${escapeHtml(given || '(keine Eingabe)')}</span>
    </div>`;

    if (!isCorrect) {
      html += `<div class="grammar-review__correct">
        <strong>Korrekte Antwort:</strong>
        <span class="grammar-input--correct">${escapeHtml(exercise.answer)}</span>
      </div>`;
    }
    html += '</div>';
    body.innerHTML = html;

    // Show feedback
    const feedbackEl = document.getElementById('grammar-feedback');
    if (feedbackEl) {
      let fbHtml = `<div class="grammar-feedback ${isCorrect ? 'grammar-feedback--correct' : 'grammar-feedback--wrong'}">`;
      fbHtml += `<div class="grammar-feedback__verdict">${isCorrect ? '\u2713 Richtig' : '\u2717 Falsch'}</div>`;
      if (!isCorrect) {
        fbHtml += `<div class="grammar-feedback__answer">Die korrekte Antwort lautet: <strong>${escapeHtml(exercise.answer)}</strong></div>`;
      }
      if (exercise.explanation) {
        fbHtml += `<div class="grammar-feedback__explanation">${exercise.explanation}</div>`;
      }
      fbHtml += '</div>';
      feedbackEl.innerHTML = fbHtml;
      feedbackEl.hidden = false;
    }

    // Show navigation buttons (Zurück + Weiter)
    this._showNextButton(actions);
  },

  /**
   * Render the sentence with ___ highlighted.
   * @param {object} exercise
   * @returns {string}
   */
  _renderSentenceHtml(exercise) {
    if (!exercise.sentence) return '';
    const escaped = escapeHtml(exercise.sentence);
    return escaped.replace(/___/g, '<span class="grammar-blank">___</span>');
  },

  // ---- Multiple choice ----

  _renderMultipleChoice(body, actions, exercise) {
    const opts = exercise.options && exercise.options.length >= 2
      ? exercise.options
      : this._generateFallbackOptions(exercise.answer);

    // Ensure correct answer is in options
    const optionSet = new Set(opts);
    optionSet.add(exercise.answer);
    const finalOptions = shuffleArray([...optionSet]).slice(0, 4);

    let html = '<div class="grammar-options">';
    finalOptions.forEach((opt, i) => {
      html += `<button class="btn grammar-option-btn" data-option="${escapeHtml(opt)}" data-index="${i}">${escapeHtml(opt)}</button>`;
    });
    html += '</div>';
    body.innerHTML = html;

    // Bind option clicks
    body.querySelectorAll('.grammar-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this._answered) return;
        this._answered = true;

        const selected = btn.dataset.option;
        const isCorrect = this._checkAnswer(selected, exercise);

        // Highlight buttons
        body.querySelectorAll('.grammar-option-btn').forEach(b => {
          const val = b.dataset.option;
          if (this._checkAnswer(val, exercise)) {
            b.classList.add('grammar-option-btn--correct');
          } else if (val === selected && !isCorrect) {
            b.classList.add('grammar-option-btn--wrong');
          }
          b.disabled = true;
        });

        this._showFeedback(isCorrect, exercise, selected);
        this._showNextButton(actions);
      });
    });
  },

  // ---- Fill blank ----

  _renderFillBlank(body, actions, exercise) {
    let html = `
      <div class="grammar-fill-blank">
        <input type="text" class="grammar-input" id="grammar-answer-input"
               placeholder="Deine Antwort..." autocomplete="off" autofocus>
        <button class="btn btn--accent grammar-check-btn" id="grammar-check-btn">Prüfen</button>
      </div>
    `;

    if (exercise.hint || exercise._translation) {
      html += `<div class="grammar-hint">`;
      if (exercise.hint) {
        html += `<button class="btn btn--outline grammar-hint-btn">Tipp anzeigen</button>`;
      }
      if (exercise._translation) {
        html += `<button class="btn btn--outline grammar-translation-btn">Bedeutung</button>`;
      }
      html += `</div>`;
    }

    body.innerHTML = html;

    const input = document.getElementById('grammar-answer-input');
    const checkBtn = document.getElementById('grammar-check-btn');

    const doCheck = () => {
      if (this._answered) return;
      this._answered = true;

      const userAnswer = input.value.trim();
      const isCorrect = this._checkAnswer(userAnswer, exercise);

      input.disabled = true;
      checkBtn.disabled = true;

      if (isCorrect) {
        input.classList.add('grammar-input--correct');
      } else {
        input.classList.add('grammar-input--wrong');
      }

      this._showFeedback(isCorrect, exercise, userAnswer);
      this._showNextButton(actions);
    };

    checkBtn.addEventListener('click', doCheck);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doCheck();
    });

    // Hint button
    const hintBtn = body.querySelector('.grammar-hint-btn');
    if (hintBtn) {
      hintBtn.addEventListener('click', () => {
        hintBtn.textContent = exercise.hint;
        hintBtn.disabled = true;
        hintBtn.classList.add('grammar-hint--revealed');
      });
    }
    const transBtn = body.querySelector('.grammar-translation-btn');
    if (transBtn) {
      transBtn.addEventListener('click', () => {
        transBtn.textContent = exercise._translation;
        transBtn.disabled = true;
        transBtn.classList.add('grammar-hint--revealed');
      });
    }

    // Focus input
    requestAnimationFrame(() => input.focus());
  },

  // ---- Reorder ----

  _renderReorder(body, actions, exercise) {
    const words = exercise._words || exercise.options || exercise.sentence.split(/\s+/);
    this._reorderSelected = [];

    let html = `
      <div class="grammar-reorder">
        <div class="grammar-reorder__source" id="grammar-reorder-source"></div>
        <div class="grammar-reorder__divider">&#8595; Klicke auf die Wörter in der richtigen Reihenfolge &#8595;</div>
        <div class="grammar-reorder__target" id="grammar-reorder-target"></div>
        <button class="btn btn--accent grammar-check-btn" id="grammar-reorder-check" disabled>Prüfen</button>
        <button class="btn btn--outline grammar-reorder-reset" id="grammar-reorder-reset">Zurücksetzen</button>
      </div>
    `;

    body.innerHTML = html;

    const sourceEl = document.getElementById('grammar-reorder-source');
    const targetEl = document.getElementById('grammar-reorder-target');
    const checkBtn = document.getElementById('grammar-reorder-check');
    const resetBtn = document.getElementById('grammar-reorder-reset');

    const renderTiles = () => {
      // Source tiles
      sourceEl.innerHTML = '';
      words.forEach((word, i) => {
        const isSelected = this._reorderSelected.some(s => s.index === i);
        const tile = createElement('button', `grammar-tile${isSelected ? ' grammar-tile--used' : ''}`, escapeHtml(word));
        tile.dataset.index = i;
        tile.disabled = isSelected;
        if (!isSelected) {
          tile.addEventListener('click', () => {
            this._reorderSelected.push({ word, index: i });
            renderTiles();
          });
        }
        sourceEl.appendChild(tile);
      });

      // Target tiles
      targetEl.innerHTML = '';
      this._reorderSelected.forEach((s, i) => {
        const tile = createElement('button', 'grammar-tile grammar-tile--selected', escapeHtml(s.word));
        tile.addEventListener('click', () => {
          this._reorderSelected.splice(i, 1);
          renderTiles();
        });
        targetEl.appendChild(tile);
      });

      checkBtn.disabled = this._reorderSelected.length !== words.length;
    };

    renderTiles();

    checkBtn.addEventListener('click', () => {
      if (this._answered) return;
      this._answered = true;

      const userAnswer = this._reorderSelected.map(s => s.word).join(' ');
      const isCorrect = this._checkAnswer(userAnswer, exercise);

      // Disable all tiles
      sourceEl.querySelectorAll('.grammar-tile').forEach(t => t.disabled = true);
      targetEl.querySelectorAll('.grammar-tile').forEach(t => {
        t.disabled = true;
        t.classList.add(isCorrect ? 'grammar-tile--correct' : 'grammar-tile--wrong');
      });

      checkBtn.disabled = true;
      resetBtn.disabled = true;

      this._showFeedback(isCorrect, exercise, userAnswer);
      this._showNextButton(actions);
    });

    resetBtn.addEventListener('click', () => {
      if (this._answered) return;
      this._reorderSelected = [];
      renderTiles();
    });
  },

  // ---- Transform ----

  _renderTransform(body, actions, exercise) {
    let html = `
      <div class="grammar-transform">
        <div class="grammar-transform__source">
          <strong>Originalsatz:</strong> ${escapeHtml(exercise.sentence)}
        </div>
        <textarea class="grammar-textarea" id="grammar-transform-input"
                  placeholder="Schreibe den umgeformten Satz..." rows="3"></textarea>
        <button class="btn btn--accent grammar-check-btn" id="grammar-transform-check">Prüfen</button>
      </div>
    `;

    if (exercise.hint || exercise._translation) {
      html += `<div class="grammar-hint">`;
      if (exercise.hint) {
        html += `<button class="btn btn--outline grammar-hint-btn">Tipp anzeigen</button>`;
      }
      if (exercise._translation) {
        html += `<button class="btn btn--outline grammar-translation-btn">Bedeutung</button>`;
      }
      html += `</div>`;
    }

    body.innerHTML = html;

    const textarea = document.getElementById('grammar-transform-input');
    const checkBtn = document.getElementById('grammar-transform-check');

    checkBtn.addEventListener('click', () => {
      if (this._answered) return;
      this._answered = true;

      const userAnswer = textarea.value.trim();
      const isCorrect = this._checkAnswer(userAnswer, exercise);

      textarea.disabled = true;
      checkBtn.disabled = true;

      if (isCorrect) {
        textarea.classList.add('grammar-input--correct');
      } else {
        textarea.classList.add('grammar-input--wrong');
      }

      this._showFeedback(isCorrect, exercise, userAnswer);
      this._showNextButton(actions);
    });

    // Hint
    const hintBtn = body.querySelector('.grammar-hint-btn');
    if (hintBtn) {
      hintBtn.addEventListener('click', () => {
        hintBtn.textContent = exercise.hint;
        hintBtn.disabled = true;
        hintBtn.classList.add('grammar-hint--revealed');
      });
    }
    const transBtn = body.querySelector('.grammar-translation-btn');
    if (transBtn) {
      transBtn.addEventListener('click', () => {
        transBtn.textContent = exercise._translation;
        transBtn.disabled = true;
        transBtn.classList.add('grammar-hint--revealed');
      });
    }

    requestAnimationFrame(() => textarea.focus());
  },

  // ---------------------------------------------------------------------------
  // Answer checking
  // ---------------------------------------------------------------------------

  /**
   * Check whether the user's answer matches the correct answer.
   * Normalizes whitespace, punctuation, and case for comparison.
   * @param {string} userAnswer
   * @param {object} exercise
   * @returns {boolean}
   */
  _checkAnswer(userAnswer, exercise) {
    const normalize = (s) => s.toLowerCase().trim()
      .replace(/[.!?,;:]+$/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\.\.\./g, '')
      .trim();

    const userNorm = normalize(userAnswer);
    const correctNorm = normalize(exercise.answer);

    if (userNorm === correctNorm) return true;

    // Check alternative answers (internal or from grammar.json)
    const alts = exercise._acceptAlternatives || exercise.also_accept;
    if (alts) {
      return alts.some(alt => normalize(alt) === userNorm);
    }

    return false;
  },

  // ---------------------------------------------------------------------------
  // Feedback
  // ---------------------------------------------------------------------------

  /**
   * Show feedback after answering.
   * @param {boolean} isCorrect
   * @param {object}  exercise
   * @param {string}  [userAnswer]
   */
  _showFeedback(isCorrect, exercise, userAnswer) {
    const feedbackEl = document.getElementById('grammar-feedback');
    if (!feedbackEl) return;

    if (isCorrect) {
      this._score++;
    }

    // Store the answer for back-navigation review
    this._answers[this._currentIndex] = {
      answered: true,
      correct: isCorrect,
      given: userAnswer || ''
    };

    const phrase = isCorrect
      ? this._correctPhrases[Math.floor(Math.random() * this._correctPhrases.length)]
      : this._wrongPhrases[Math.floor(Math.random() * this._wrongPhrases.length)];

    let html = `<div class="grammar-feedback ${isCorrect ? 'grammar-feedback--correct' : 'grammar-feedback--wrong'}">`;
    html += `<div class="grammar-feedback__verdict">${isCorrect ? '✓' : '✗'} ${escapeHtml(phrase)}</div>`;

    if (!isCorrect) {
      html += `<div class="grammar-feedback__answer">Die korrekte Antwort lautet: <strong>${escapeHtml(exercise.answer)}</strong></div>`;
    }

    if (exercise.explanation) {
      html += `<div class="grammar-feedback__explanation">${exercise.explanation}</div>`;
    }

    html += '</div>';

    feedbackEl.innerHTML = html;
    feedbackEl.hidden = false;

    // Record progress
    this._recordExerciseResult(isCorrect, exercise);
  },

  /**
   * Show the "Zurück" and "Weiter" buttons after feedback.
   * @param {HTMLElement} actionsEl
   */
  _showNextButton(actionsEl) {
    let btnsHtml = '';

    // Back button (to previous question) when not on the first exercise
    if (this._currentIndex > 0) {
      btnsHtml += '<button class="btn btn--outline grammar-prev-btn">&larr; Zurück</button>';
    }

    btnsHtml += '<button class="btn btn--accent grammar-next-btn">Weiter &rarr;</button>';
    actionsEl.innerHTML = btnsHtml;

    // Previous question handler
    const prevBtn = actionsEl.querySelector('.grammar-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this._currentIndex--;
        this._renderExercise();
      });
    }

    // Next question handler
    const nextBtn = actionsEl.querySelector('.grammar-next-btn');
    nextBtn.addEventListener('click', () => {
      this._currentIndex++;
      this._renderExercise();
    });
    nextBtn.focus();
  },

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------

  /**
   * Render the end-of-session results screen.
   */
  _renderResults() {
    const content = document.getElementById('grammar-content');
    if (!content) return;

    const total = this._exercises.length;
    const score = this._score;
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;

    let verdict;
    if (pct >= 90) verdict = 'Ausgezeichnet! Du beherrschst dieses Thema sehr gut.';
    else if (pct >= 70) verdict = 'Gut gemacht! Mit etwas Übung wirst du noch besser.';
    else if (pct >= 50) verdict = 'Nicht schlecht, aber es gibt noch Verbesserungspotenzial.';
    else verdict = 'Das war schwierig. Übe dieses Thema am besten noch einmal.';

    const html = `
      <div class="grammar-results">
        <h2>Ergebnis</h2>
        <div class="grammar-results__score">
          <span class="grammar-results__number">${score}/${total}</span>
          <span class="grammar-results__pct">${pct}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-bar__fill ${pct >= 70 ? 'progress-bar__fill--success' : pct >= 50 ? 'progress-bar__fill--warning' : 'progress-bar__fill--danger'}" style="width: ${pct}%"></div>
        </div>
        <p class="grammar-results__verdict">${escapeHtml(verdict)}</p>
        <div class="grammar-results__actions">
          <button class="btn btn--accent grammar-retry-btn">Nochmal üben</button>
          <button class="btn btn--outline grammar-topics-btn">Themenauswahl</button>
          <button class="btn btn--outline grammar-home-btn">Zurück zur Übersicht</button>
        </div>
      </div>
    `;

    content.innerHTML = html;

    // Save session progress
    this._saveCategoryProgress();

    // Record practice for streak
    App.recordPractice();

    // Button handlers
    content.querySelector('.grammar-retry-btn').addEventListener('click', () => {
      this._startCategory(this._category);
    });
    content.querySelector('.grammar-topics-btn').addEventListener('click', () => {
      this._renderTopicPicker(this._category);
    });
    content.querySelector('.grammar-home-btn').addEventListener('click', () => {
      this._renderCategoryPicker();
    });
  },

  // ---------------------------------------------------------------------------
  // Progress tracking
  // ---------------------------------------------------------------------------

  /**
   * Get overall progress for a grammar category.
   * @param {string} category
   * @returns {{correct: number, total: number}}
   */
  _getCategoryProgress(category) {
    return Storage.get(`grammar_${category}_progress`, { correct: 0, total: 0 });
  },

  /**
   * Get progress for a specific topic within a category.
   * @param {string} category
   * @param {string} topicKey
   * @returns {{correct: number, total: number}}
   */
  _getTopicProgress(category, topicKey) {
    return Storage.get(`grammar_${category}_${topicKey}_progress`, { correct: 0, total: 0 });
  },

  /**
   * Record the result of a single exercise.
   * @param {boolean} isCorrect
   * @param {object}  exercise
   */
  _recordExerciseResult(isCorrect, exercise) {
    // Update topic progress
    const topicKey = exercise.subtopic || exercise.topic || 'general';
    const topicProgress = this._getTopicProgress(this._category, topicKey);
    topicProgress.total++;
    if (isCorrect) topicProgress.correct++;
    Storage.set(`grammar_${this._category}_${topicKey}_progress`, topicProgress);

    // Update category progress
    const catProgress = this._getCategoryProgress(this._category);
    catProgress.total++;
    if (isCorrect) catProgress.correct++;
    Storage.set(`grammar_${this._category}_progress`, catProgress);

    // Add to weak words if wrong (for grammar-related words)
    if (!isCorrect && exercise.answer) {
      Storage.addWeakWord({
        word: exercise.answer,
        translation: exercise.explanation || '',
        type: 'grammar',
      });
    }
  },

  /**
   * Save overall category/module progress after a session.
   */
  _saveCategoryProgress() {
    // Aggregate all category progress
    const categories = ['cases', 'conjugation', 'tenses', 'sentence'];
    let totalCorrect = 0;
    let totalAll = 0;

    categories.forEach(cat => {
      const p = this._getCategoryProgress(cat);
      totalCorrect += p.correct;
      totalAll += p.total;
    });

    const avgScore = totalAll > 0 ? Math.round((totalCorrect / totalAll) * 100) : 0;

    Storage.saveProgress('grammar', {
      completed: totalCorrect,
      total: totalAll,
      score: avgScore,
    });
  },

  // ---------------------------------------------------------------------------
  // Data helpers
  // ---------------------------------------------------------------------------

  /**
   * Get grammar exercises from App.data.grammar, falling back to an empty array.
   * @returns {Array}
   */
  _getGrammarExercises() {
    const data = App.data.grammar;
    return Array.isArray(data) ? data : [];
  },

  /**
   * Get nouns that have declension data.
   * @returns {Array}
   */
  _getNounsWithDeclension() {
    const nouns = App.data.nouns || [];
    return nouns.filter(n => n.declension && n.article && n.noun);
  },

  /**
   * Get verbs that have conjugation data.
   * @returns {Array}
   */
  _getVerbsWithConjugation() {
    const verbs = App.data.verbs || [];
    return verbs.filter(v => v.conjugation && v.conjugation.präsens);
  },

  /**
   * Check if an exercise's topic matches any of the given topic fragments.
   * @param {object}   exercise
   * @param {string[]} fragments
   * @returns {boolean}
   */
  _topicMatches(exercise, fragments) {
    const topic = ((exercise.topic || '') + ' ' + (exercise.subtopic || '')).toLowerCase();
    return fragments.some(f => topic.includes(f.toLowerCase()));
  },

  /**
   * Generate fallback options when the exercise has too few.
   * @param {string} correctAnswer
   * @returns {string[]}
   */
  _generateFallbackOptions(correctAnswer) {
    // Generic grammatical distractors
    const distractors = [
      'der', 'die', 'das', 'dem', 'den', 'des',
      'ein', 'eine', 'einem', 'einen', 'eines',
      'hat', 'ist', 'wird', 'wurde', 'hatte', 'war',
    ].filter(d => d !== correctAnswer);

    return shuffleArray([correctAnswer, ...pickRandom(distractors, 3)]);
  },
};

// =============================================================================
// Register module
// =============================================================================

App.registerModule('grammar', GrammarModule);
