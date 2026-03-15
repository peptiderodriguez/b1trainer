// =============================================================================
// app.js — Main application controller for B1/B2 Goethe Trainer
// =============================================================================

'use strict';

const App = {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Loaded JSON data keyed by category */
  data: {
    vocabulary: [],
    grammar: [],
    reading: [],
    medical: [],
  },

  /** Registered module objects keyed by name */
  _modules: {},

  /** Currently active module name (null = home) */
  _activeModule: null,

  /** True once init() has completed */
  _ready: false,

  /** All known module names matching page sections */
  _moduleNames: ['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'exam', 'fsp', 'drill'],

  /** Data files to fetch on startup */
  _dataFiles: [
    { key: 'nouns',    url: 'data/nouns.json' },
    { key: 'verbs',    url: 'data/verbs.json' },
    { key: 'other',    url: 'data/other.json' },
    { key: 'grammar',  url: 'data/grammar.json' },
    { key: 'reading',  url: 'data/reading.json' },
    { key: 'medical',  url: 'data/medical.json' },
  ],

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /**
   * Boot the application: show loading state, fetch data, wire up routing
   * and sidebar, then navigate to the current hash.
   */
  async init() {
    this._showLoading(true);

    await this._loadData();

    this._bindSidebar();
    this._bindRouting();

    // Process the initial hash
    this._onRouteChange();

    this._ready = true;
    this._showLoading(false);

    console.log('B1/B2 Trainer initialized.');
  },

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  /**
   * Show or hide a loading indicator inside #content while data is fetched.
   * @param {boolean} show
   */
  _showLoading(show) {
    const content = document.getElementById('content');
    if (!content) return;

    let loader = document.getElementById('app-loader');

    if (show) {
      if (!loader) {
        loader = createElement('div', 'app-loader');
        loader.id = 'app-loader';
        loader.setAttribute('aria-live', 'polite');
        loader.innerHTML =
          '<div class="app-loader__spinner"></div>' +
          '<p class="app-loader__text">Daten werden geladen&hellip;</p>';
        content.prepend(loader);
      }
      loader.hidden = false;
    } else if (loader) {
      loader.hidden = true;
    }
  },

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  /**
   * Fetch all JSON data files in parallel. Individual failures are logged as
   * warnings but do not prevent the app from starting.
   */
  async _loadData() {
    const results = await Promise.allSettled(
      this._dataFiles.map(async ({ key, url }) => {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(url + ': HTTP ' + resp.status);
        return { key, data: await resp.json() };
      })
    );

    results.forEach((result, i) => {
      const { key, url } = this._dataFiles[i];

      if (result.status === 'fulfilled') {
        this.data[result.value.key] = result.value.data;
        const d = result.value.data;
        console.log(
          'Loaded ' + key + ': ' +
          (Array.isArray(d) ? d.length + ' items' : 'OK')
        );
      } else {
        console.warn('Failed to load ' + url + ':', result.reason.message);
        this.data[key] = [];
      }
    });

    // Build the combined vocabulary list from the three sources
    this.data.vocabulary = [].concat(
      this.data.nouns  || [],
      this.data.verbs  || [],
      this.data.other  || []
    );
  },

  // ---------------------------------------------------------------------------
  // Module registry
  // ---------------------------------------------------------------------------

  /**
   * Register a module so it can be activated via hash routing.
   *
   * A module object must implement:
   *   init(container, data)  - called once on first activation
   *   render(subRoute)       - called on every navigation to this module
   *
   * Optional:
   *   destroy()              - called when navigating away
   *
   * @param {string} name      - Module name matching a hash segment (e.g. 'vocabulary')
   * @param {object} moduleObj - Module object
   */
  registerModule(name, moduleObj) {
    this._modules[name] = {
      obj: moduleObj,
      initialized: false,
    };
    console.log('Module registered: ' + name);

    // If the module matches the current hash and we missed the initial route,
    // trigger a re-route so it renders immediately.
    if (this._ready) {
      const current = this._parseHash();
      if (current.module === name) {
        this._onRouteChange();
      }
    }
  },

  // ---------------------------------------------------------------------------
  // Hash routing
  // ---------------------------------------------------------------------------

  /**
   * Bind the hashchange listener.
   */
  _bindRouting() {
    window.addEventListener('hashchange', () => this._onRouteChange());
  },

  /**
   * Parse window.location.hash into a module name and optional sub-route.
   * Supports formats: "#vocabulary", "#grammar/articles", "#home", "" (empty).
   * @returns {{ module: string, subRoute: string }}
   */
  _parseHash() {
    const raw = (window.location.hash || '').replace(/^#\/?/, '');
    const segments = raw.split('/').filter(Boolean);
    return {
      module: segments[0] || 'home',
      subRoute: segments.slice(1).join('/'),
    };
  },

  /**
   * React to a hash change: show/hide page sections, activate the right
   * module, update nav highlighting, and refresh the dashboard when going home.
   */
  _onRouteChange() {
    const { module: moduleName, subRoute } = this._parseHash();

    // --- Tear down the previous module if it has a destroy method -----------
    if (this._activeModule === 'drill') {
      this._destroyDrill();
    } else if (this._activeModule && this._modules[this._activeModule]) {
      const prev = this._modules[this._activeModule].obj;
      if (typeof prev.destroy === 'function') prev.destroy();
    }

    // --- Show/hide page sections -------------------------------------------
    this._showPage(moduleName);

    // --- Update nav highlighting -------------------------------------------
    this._updateNavHighlight(moduleName);

    // --- Activate the target module or update dashboard --------------------
    if (moduleName === 'home') {
      this._activeModule = null;
      this._updateDashboard();
      this._updateGlobalProgress();
    } else if (moduleName === 'drill') {
      this._activeModule = 'drill';
      const minutes = parseInt(subRoute, 10);
      if ([5, 10, 15, 25].includes(minutes)) {
        this._startDrill(minutes);
      } else {
        // Invalid drill time — go home
        window.location.hash = '#home';
        return;
      }
    } else {
      this._activeModule = moduleName;
      this._activateModule(moduleName, subRoute);
    }

    // Close the sidebar on mobile after navigation
    this._closeSidebar();
  },

  /**
   * Show the page section for the given module, hiding all others.
   * @param {string} moduleName - 'home' or one of the module names
   */
  _showPage(moduleName) {
    // Home is the dashboard section
    const homeEl = document.getElementById('page-home');
    if (homeEl) {
      homeEl.hidden = moduleName !== 'home';
    }

    // Module pages
    this._moduleNames.forEach(name => {
      const pageEl = document.getElementById('page-' + name);
      if (pageEl) {
        pageEl.hidden = name !== moduleName;
      }
    });
  },

  /**
   * Initialize (if needed) and render the target module.
   * @param {string} moduleName
   * @param {string} subRoute
   */
  _activateModule(moduleName, subRoute) {
    const entry = this._modules[moduleName];
    if (!entry) {
      // Module JS not yet loaded; the static HTML page section is already visible
      return;
    }

    const container = document.getElementById(moduleName + '-content');
    if (!container) {
      console.warn('Content container not found: #' + moduleName + '-content');
      return;
    }

    // First-time initialization
    if (!entry.initialized) {
      if (typeof entry.obj.init === 'function') {
        entry.obj.init(container, this.data);
      }
      entry.initialized = true;
    }

    // Render (every navigation)
    if (typeof entry.obj.render === 'function') {
      entry.obj.render(container, subRoute);
    }
  },

  // ---------------------------------------------------------------------------
  // Navigation highlighting
  // ---------------------------------------------------------------------------

  /**
   * Set active classes on navbar and sidebar links for the current module.
   * @param {string} moduleName
   */
  _updateNavHighlight(moduleName) {
    // Navbar links
    document.querySelectorAll('.navbar__link[data-module]').forEach(link => {
      link.classList.toggle(
        'navbar__link--active',
        link.getAttribute('data-module') === moduleName
      );
    });

    // Sidebar links
    document.querySelectorAll('.sidebar__link[data-module]').forEach(link => {
      link.classList.toggle(
        'sidebar__link--active',
        link.getAttribute('data-module') === moduleName
      );
    });
  },

  // ---------------------------------------------------------------------------
  // Sidebar toggle (mobile)
  // ---------------------------------------------------------------------------

  /**
   * Wire up the hamburger button and overlay to open/close the sidebar.
   */
  _bindSidebar() {
    const toggle  = document.getElementById('sidebar-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('sidebar');

    if (toggle && sidebar) {
      toggle.addEventListener('click', () => {
        const isOpen = sidebar.classList.contains('sidebar--open');
        if (isOpen) {
          this._closeSidebar();
        } else {
          sidebar.classList.add('sidebar--open');
          if (overlay) overlay.classList.add('sidebar-overlay--visible');
          toggle.classList.add('navbar__toggle--active');
        }
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => this._closeSidebar());
    }
  },

  /**
   * Close the sidebar (remove the open class, hide overlay, reset hamburger).
   */
  _closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggle  = document.getElementById('sidebar-toggle');
    if (sidebar) sidebar.classList.remove('sidebar--open');
    if (overlay) overlay.classList.remove('sidebar-overlay--visible');
    if (toggle)  toggle.classList.remove('navbar__toggle--active');
  },

  // ---------------------------------------------------------------------------
  // Dashboard updates
  // ---------------------------------------------------------------------------

  /**
   * Refresh all dashboard statistics, module progress bars, weak areas,
   * and the global progress indicator in the sidebar.
   */
  _updateDashboard() {
    const stats = this._computeGlobalStats();

    // Stat cards
    this._setTextById('stat-streak', stats.streak);
    this._setTextById('stat-words', stats.wordsLearned);
    this._setTextById('stat-exercises', stats.exercisesCompleted);
    this._setTextById('stat-accuracy', stats.accuracy + '%');

    // Per-module progress bars on dashboard cards
    this._moduleNames.forEach(name => {
      if (name === 'drill') return; // drill has no persistent progress bar
      const progress = Storage.getProgress(name);
      const pct = progress.total > 0
        ? Math.round((progress.completed / progress.total) * 100)
        : 0;

      const bar = document.querySelector(
        '[data-module-progress="' + name + '"]'
      );
      if (bar) {
        bar.style.width = pct + '%';
      }
    });

    // Render weak areas section
    this._renderWeakAreas();

    // Render exam countdown
    this._renderCountdown();
  },

  /**
   * Render the exam countdown card on the dashboard, showing days left,
   * curriculum phase, progress bar, and weekly practice stats.
   */
  _renderCountdown() {
    const el = document.getElementById('dashboard-countdown');
    if (!el) return;

    const examDate = new Date('2026-06-14');
    const now = new Date();
    const diffMs = examDate - now;
    const daysLeft = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
    const weeksLeft = Math.floor(daysLeft / 7);
    const totalDays = Math.ceil((examDate - new Date('2026-03-14')) / (24 * 60 * 60 * 1000));
    const daysPassed = totalDays - daysLeft;
    const progressPct = Math.min(100, Math.round((daysPassed / totalDays) * 100));

    const curriculum = this._getCurriculum();
    const phaseNames = ['Grundlagen', 'Grundlagen', 'Grundlagen', 'Aufbau B1', 'Aufbau B1', 'Aufbau B1', 'B2 Vertiefung', 'B2 Vertiefung', 'B2 Vertiefung', 'FSP-Vorbereitung', 'FSP-Vorbereitung', 'FSP-Vorbereitung', 'FSP-Vorbereitung'];
    const phase = phaseNames[curriculum.week - 1] || 'FSP-Vorbereitung';

    // Get weekly practice stats
    const weekly = this._trackWeeklyPractice(0); // 0 = don't add, just read

    el.innerHTML =
      '<div class="countdown-card">' +
        '<div class="countdown-card__days">' +
          '<span class="countdown-card__number">' + daysLeft + '</span>' +
          '<span class="countdown-card__label">Tage bis zur Prüfung</span>' +
        '</div>' +
        '<div class="countdown-card__details">' +
          '<div class="countdown-card__phase">' +
            '<span class="countdown-card__phase-label">Phase:</span> ' +
            '<strong>' + phase + '</strong> (Woche ' + curriculum.week + '/13)' +
          '</div>' +
          '<div class="progress-bar">' +
            '<div class="progress-bar__fill" style="width:' + progressPct + '%"></div>' +
          '</div>' +
          '<div class="countdown-card__weekly">' +
            weekly.minutesThisWeek + '/' + weekly.targetMinutes + ' Min. diese Woche' +
            (weekly.minutesThisWeek >= weekly.targetMinutes
              ? ' <span class="text-success">\u2713 Ziel erreicht!</span>'
              : ' — noch ' + (weekly.targetMinutes - weekly.minutesThisWeek) + ' Min.') +
          '</div>' +
        '</div>' +
      '</div>';
  },

  /**
   * Render the "Schwachstellen üben" section on the dashboard.
   * Shows weak categories and a preview of the most-missed items.
   */
  _renderWeakAreas() {
    const categoriesEl = document.getElementById('weak-categories');
    const previewEl = document.getElementById('weak-items-preview');
    const descEl = document.getElementById('review-desc');
    const sectionEl = document.getElementById('dashboard-review');
    if (!categoriesEl || !previewEl) return;

    const weakCats = Storage.getWeakCategories();
    const missedItems = Storage.getMissedItems({ limit: 10 });

    // If no missed items yet, show encouraging message
    if (weakCats.length === 0 && missedItems.length === 0) {
      if (descEl) {
        descEl.textContent = 'Noch keine Schwachstellen erkannt. Beginne mit den Übungen — verfehle Fragen werden hier gesammelt, damit du sie gezielt wiederholen kannst.';
      }
      categoriesEl.innerHTML = '';
      previewEl.innerHTML = '';
      return;
    }

    if (descEl) {
      descEl.textContent = 'Diese Bereiche bereiten dir noch Schwierigkeiten. Wiederhole sie regelmäßig, bis sie sitzen.';
    }

    // Category labels for display
    const categoryLabels = {
      articles: 'Artikel (der/die/das)',
      dativ_prepositions: 'Dativ-Präpositionen',
      akkusativ_prepositions: 'Akkusativ-Präpositionen',
      wechsel_prepositions: 'Wechselpräpositionen',
      genitiv_prepositions: 'Genitiv-Präpositionen',
      konjugation_präsens: 'Konjugation (Präsens)',
      konjugation_perfekt: 'Konjugation (Perfekt)',
      konjugation_präteritum: 'Konjugation (Präteritum)',
      konjunktiv_ii: 'Konjunktiv II',
      passiv: 'Passiv',
      nebensätze: 'Nebensätze',
      relativsätze: 'Relativsätze',
      adjektivdeklination: 'Adjektivdeklination',
      komparativ: 'Komparativ & Superlativ',
      konnektoren: 'Konnektoren',
      flashcards: 'Vokabel-Karteikarten',
      fillin: 'Lückentext',
      reading: 'Leseverstehen',
      listening: 'Hörverstehen',
      diktat: 'Diktat',
    };

    const moduleLabels = {
      vocabulary: 'Vokabeln',
      grammar: 'Grammatik',
      reading: 'Lesen',
      listening: 'Hören',
      writing: 'Schreiben',
      exam: 'Prüfung',
    };

    // Render weak category cards (top 6)
    categoriesEl.innerHTML = weakCats.slice(0, 6).map(cat => {
      const label = categoryLabels[cat.category] || cat.category;
      const modLabel = moduleLabels[cat.module] || cat.module;
      return '<a href="#' + escapeHtml(cat.module) + '/' + escapeHtml(cat.category) + '" class="topic-card topic-card--weak">' +
        '<span class="topic-card__badge">' + escapeHtml(modLabel) + '</span>' +
        '<h3 class="topic-card__title">' + escapeHtml(label) + '</h3>' +
        '<p class="topic-card__count">' + cat.totalMisses + ' Fehler bei ' + cat.itemCount + ' Aufgaben</p>' +
        '<span class="module-card__action">Jetzt wiederholen</span>' +
      '</a>';
    }).join('');

    // Render preview of most-missed items
    if (missedItems.length > 0) {
      previewEl.innerHTML =
        '<h3 class="section-title section-title--small">Häufigste Fehler</h3>' +
        '<div class="weak-items-list">' +
        missedItems.slice(0, 8).map(item => {
          const weight = item.missCount - (item.correctInReview || 0);
          return '<div class="weak-item">' +
            '<div class="weak-item__question">' + escapeHtml(item.question) + '</div>' +
            '<div class="weak-item__answer">' +
              '<span class="weak-item__expected">Richtig: ' + escapeHtml(item.expected) + '</span>' +
              (item.given ? '<span class="weak-item__given">Deine Antwort: ' + escapeHtml(item.given) + '</span>' : '') +
            '</div>' +
            '<div class="weak-item__meta">' +
              '<span class="weak-item__count">' + weight + '× verfehlt</span>' +
              '<span class="weak-item__category">' + escapeHtml(categoryLabels[item.category] || item.category) + '</span>' +
            '</div>' +
          '</div>';
        }).join('') +
        '</div>';
    } else {
      previewEl.innerHTML = '';
    }
  },

  /**
   * Update the global progress bar in the sidebar footer.
   */
  _updateGlobalProgress() {
    const stats = this._computeGlobalStats();
    const pct = stats.globalProgress;

    const bar  = document.getElementById('global-progress');
    const text = document.getElementById('global-progress-text');

    if (bar)  bar.style.width = pct + '%';
    if (text) text.textContent = pct + '%';
  },

  /**
   * Aggregate stats across all modules.
   * @returns {{
   *   wordsLearned: number,
   *   exercisesCompleted: number,
   *   streak: number,
   *   accuracy: number,
   *   globalProgress: number
   * }}
   */
  _computeGlobalStats() {
    let wordsLearned = 0;
    let exercisesCompleted = 0;
    let totalScore = 0;
    let modulesWithScore = 0;
    let totalCompleted = 0;
    let totalItems = 0;

    this._moduleNames.forEach(name => {
      if (name === 'drill') return; // drill is not a persistent module
      const p = Storage.getProgress(name);
      wordsLearned      += p.completed || 0;
      exercisesCompleted += p.total || 0;
      totalCompleted     += p.completed || 0;
      totalItems         += p.total || 0;

      if (p.score > 0) {
        totalScore += p.score;
        modulesWithScore++;
      }
    });

    return {
      wordsLearned: wordsLearned,
      exercisesCompleted: exercisesCompleted,
      streak: this._getGlobalStreak(),
      accuracy: modulesWithScore > 0
        ? Math.round(totalScore / modulesWithScore)
        : 0,
      globalProgress: totalItems > 0
        ? Math.round((totalCompleted / totalItems) * 100)
        : 0,
    };
  },

  /**
   * Calculate the current daily streak based on localStorage timestamps.
   * @returns {number}
   */
  _getGlobalStreak() {
    const lastDate = Storage.get('last_practice_date', null);
    const streak   = Storage.get('global_streak', 0);

    if (!lastDate) return 0;

    const today     = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (lastDate === today || lastDate === yesterday) return streak;
    return 0; // streak broken
  },

  /**
   * Record that the user practiced today. Call this from individual modules
   * after the user completes an exercise.
   */
  recordPractice() {
    const today    = new Date().toISOString().slice(0, 10);
    const lastDate = Storage.get('last_practice_date', null);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    let streak = Storage.get('global_streak', 0);

    if (lastDate === today) {
      return; // already recorded today
    } else if (lastDate === yesterday) {
      streak++;
    } else {
      streak = 1;
    }

    Storage.set('global_streak', streak);
    Storage.set('last_practice_date', today);
  },

  // ---------------------------------------------------------------------------
  // Schnellübung — Timed Mixed Drill
  // ---------------------------------------------------------------------------

  /** Drill state */
  _drill: {
    active: false,
    timer: null,
    totalSeconds: 0,
    remainingSeconds: 0,
    score: 0,
    total: 0,
    currentExercise: null,
    answered: false,
    advanceTimeout: null,
    history: [],    // array of { exercise, given, correct }
    historyIndex: -1, // -1 = on a new question, >= 0 = reviewing old
  },

  /**
   * Stop and clean up any running drill session.
   */
  _destroyDrill() {
    if (this._drill.timer) clearInterval(this._drill.timer);
    if (this._drill.advanceTimeout) clearTimeout(this._drill.advanceTimeout);
    this._drill.active = false;
    this._drill.timer = null;
    this._drill.advanceTimeout = null;
  },

  /**
   * Start a timed mixed drill session.
   * @param {number} minutes — duration in minutes (5, 10, 15, or 25)
   */
  _startDrill(minutes) {
    this._destroyDrill();

    const container = document.getElementById('drill-content');
    if (!container) return;

    const totalSeconds = minutes * 60;
    this._drill.active = true;
    this._drill.totalSeconds = totalSeconds;
    this._drill.remainingSeconds = totalSeconds;
    this._drill.history = [];
    this._drill.historyIndex = -1;
    this._drill.score = 0;
    this._drill.total = 0;
    this._drill.answered = false;

    // Render the drill shell
    container.innerHTML =
      '<div class="drill-header" id="drill-header">' +
        '<div class="drill-header__timer">' +
          '<span class="drill-header__timer-icon" aria-hidden="true">&#9201;</span>' +
          '<span class="drill-header__timer-value" id="drill-timer-value">' + this._formatDrillTime(totalSeconds) + '</span>' +
        '</div>' +
        '<div class="drill-header__score">' +
          '<span class="drill-header__correct" id="drill-score-correct">0</span>' +
          '<span class="drill-header__separator">/</span>' +
          '<span class="drill-header__total" id="drill-score-total">0</span>' +
        '</div>' +
        '<button class="drill-header__quit" id="drill-quit">Beenden</button>' +
      '</div>' +
      '<div class="drill-timer-bar">' +
        '<div class="drill-timer-bar__fill" id="drill-timer-bar" style="width: 100%"></div>' +
      '</div>' +
      '<div id="drill-exercise-area"></div>';

    // Bind quit button
    document.getElementById('drill-quit').addEventListener('click', () => {
      this._endDrill();
    });

    // Start the countdown
    this._drill.timer = setInterval(() => {
      this._drill.remainingSeconds--;
      this._updateDrillTimer();
      if (this._drill.remainingSeconds <= 0) {
        this._endDrill();
      }
    }, 1000);

    // Show first exercise
    this._showNextDrillExercise();
  },

  /**
   * Format seconds as MM:SS.
   * @param {number} seconds
   * @returns {string}
   */
  _formatDrillTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  },

  /**
   * Update the timer display and progress bar.
   */
  _updateDrillTimer() {
    const timerVal = document.getElementById('drill-timer-value');
    const timerBar = document.getElementById('drill-timer-bar');
    const timerEl  = timerVal ? timerVal.parentElement : null;
    const rem = this._drill.remainingSeconds;
    const total = this._drill.totalSeconds;
    const pct = Math.max(0, (rem / total) * 100);

    if (timerVal) timerVal.textContent = this._formatDrillTime(Math.max(0, rem));
    if (timerBar) timerBar.style.width = pct + '%';

    // Color changes at thresholds
    if (timerEl) {
      timerEl.classList.remove('drill-header__timer--warning', 'drill-header__timer--danger');
      if (rem <= 30) {
        timerEl.classList.add('drill-header__timer--danger');
      } else if (rem <= 60) {
        timerEl.classList.add('drill-header__timer--warning');
      }
    }
    if (timerBar) {
      timerBar.classList.remove('drill-timer-bar__fill--warning', 'drill-timer-bar__fill--danger');
      if (rem <= 30) {
        timerBar.classList.add('drill-timer-bar__fill--danger');
      } else if (rem <= 60) {
        timerBar.classList.add('drill-timer-bar__fill--warning');
      }
    }
  },

  /**
   * Generate a random exercise from all available data sources.
   * Returns an exercise object or null if no data is available.
   * @returns {object|null}
   */
  /**
   * Get the current curriculum week (1-13) based on start date 2026-03-14.
   * Returns { week, maxDifficulty, allowedLevels, topics }
   */
  _getCurriculum() {
    const START = new Date('2026-03-14');
    const now = new Date();
    const week = Math.max(1, Math.min(13, Math.ceil((now - START) / (7 * 24 * 60 * 60 * 1000))));
    let maxDiff, levels, topics;
    if (week <= 3) {
      maxDiff = 1; levels = ['A1', 'A2', 'B1'];
      topics = ['prepositions_akkusativ', 'prepositions_dativ', 'adjektivdeklination', 'komparativ_superlativ'];
    } else if (week <= 6) {
      maxDiff = 2; levels = ['A1', 'A2', 'B1'];
      topics = null; // all B1 topics
    } else if (week <= 9) {
      maxDiff = 3; levels = ['A1', 'A2', 'B1', 'B2'];
      topics = null; // all topics including B2
    } else {
      maxDiff = 3; levels = ['B1', 'B2'];
      topics = null; // B2 focus
    }
    return { week, maxDiff, levels, topics };
  },

  _generateDrillExercise() {
    const nouns = this.data.nouns || [];
    const verbs = this.data.verbs || [];
    const grammar = this.data.grammar || [];
    const vocabulary = this.data.vocabulary || [];
    const curriculum = this._getCurriculum();

    // Filter grammar by curriculum difficulty
    const filteredGrammar = grammar.filter(e => {
      const diff = e.difficulty || 1;
      return diff <= curriculum.maxDiff;
    });

    // Filter vocabulary by level when in early/late weeks
    const filterByLevel = (items) => {
      if (!curriculum.levels) return items;
      return items.filter(v => !v.level || curriculum.levels.includes(v.level));
    };
    const filteredNouns = filterByLevel(nouns);
    const filteredVerbs = filterByLevel(verbs);
    const filteredVocab = filterByLevel(vocabulary);

    // SRS priority: if there are due items, serve one (50% of exercises)
    const dueItems = Storage.getDueItems ? Storage.getDueItems() : [];
    if (dueItems.length > 0 && Math.random() < 0.5) {
      const srsItem = dueItems[Math.floor(Math.random() * dueItems.length)];
      const srsExercise = this._generateSrsExercise(srsItem, grammar, nouns, verbs, vocabulary);
      if (srsExercise) return srsExercise;
    }

    // 30% chance: pull from weak areas / bookmarks instead
    const missedItems = Storage.getMissedItems ? Storage.getMissedItems() : [];
    const bookmarks = Storage.getBookmarks ? Storage.getBookmarks() : [];
    const reviewPool = [...missedItems, ...bookmarks];
    if (reviewPool.length > 0 && Math.random() < 0.3) {
      // Try to generate from a missed grammar exercise
      const missed = missedItems.filter(m => m.module === 'grammar' && m.id);
      if (missed.length > 0) {
        const m = missed[Math.floor(Math.random() * missed.length)];
        const ex = grammar.find(e => e.id === m.id);
        if (ex && (ex.type === 'fill_blank' || ex.type === 'multiple_choice')) {
          return {
            type: 'grammar', typeLabel: 'Wiederholung',
            question: ex.sentence, answer: ex.answer,
            options: ex.options?.length ? ex.options : null,
            detail: ex.explanation || '', also_accept: ex.also_accept || null,
          };
        }
      }
    }

    // Build a weighted list of generator functions based on available data
    const generators = [];
    if (filteredNouns.length > 0)  generators.push({ fn: () => this._genArticleEx(filteredNouns), weight: 3 });
    if (filteredVerbs.length > 0)  generators.push({ fn: () => this._genConjugationEx(filteredVerbs), weight: 3 });
    if (filteredGrammar.length > 0) generators.push({ fn: () => this._genGrammarEx(filteredGrammar), weight: 3 });
    if (filteredVocab.length > 0)  generators.push({ fn: () => this._genTranslationEx(filteredVocab), weight: 2 });

    if (generators.length === 0) return null;

    // Weighted random selection — try up to 5 times to get a non-null result
    const totalWeight = generators.reduce((sum, g) => sum + g.weight, 0);
    for (let attempt = 0; attempt < 5; attempt++) {
      let r = Math.random() * totalWeight;
      for (const gen of generators) {
        r -= gen.weight;
        if (r <= 0) {
          const ex = gen.fn();
          if (ex) return ex;
          break;
        }
      }
    }

    // Fallback: try all generators in order
    for (const gen of generators) {
      const ex = gen.fn();
      if (ex) return ex;
    }
    return null;
  },

  /**
   * Generate an article quiz exercise.
   * @param {Array} nouns
   * @returns {object}
   */
  _genArticleEx(nouns) {
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    if (!noun.article || !noun.noun) return null;
    const germanEx = (noun.examples && noun.examples[0]) || noun.sentence || '';
    const plural = noun.plural ? 'Pl: die ' + noun.plural : '';
    const parts = [
      germanEx ? germanEx : '',
      noun.translation ? 'EN: ' + noun.translation : '',
      plural,
    ].filter(Boolean);
    return {
      type: 'article',
      typeLabel: 'Artikel',
      question: 'Welcher Artikel? ___ ' + noun.noun,
      answer: noun.article,
      options: ['der', 'die', 'das'],
      detail: parts.join('\n'),
    };
  },

  /**
   * Generate a conjugation exercise.
   * @param {Array} verbs
   * @returns {object|null}
   */
  _genConjugationEx(verbs) {
    const verb = verbs[Math.floor(Math.random() * verbs.length)];
    if (!verb.conjugation || !verb.conjugation.präsens) return null;

    const pronouns = ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'Sie'];
    const conjKeys = ['ich', 'du', 'es', 'wir', 'ihr', 'Sie'];
    const idx = Math.floor(Math.random() * pronouns.length);
    const pronoun = pronouns[idx];
    const conjKey = conjKeys[idx];
    const form = verb.conjugation.präsens[conjKey];
    if (!form) return null;

    const verbEx = (verb.examples && verb.examples[0]) || '';
    const perfekt = verb.conjugation.perfekt ? 'Perfekt: ' + (verb.conjugation.withSein ? 'ist ' : 'hat ') + verb.conjugation.perfekt : '';
    const parts = [
      verbEx ? verbEx : '',
      verb.translation ? 'EN: ' + verb.translation : '',
      perfekt,
    ].filter(Boolean);
    return {
      type: 'conjugation',
      typeLabel: 'Konjugation',
      question: pronoun + ' ___ (' + verb.word + ')',
      answer: form,
      detail: parts.join('\n'),
    };
  },

  /**
   * Generate a grammar exercise (fill_blank or multiple_choice).
   * @param {Array} exercises
   * @returns {object|null}
   */
  _genGrammarEx(exercises) {
    // Filter to types that work well in the drill
    const suitable = exercises.filter(
      e => e.type === 'fill_blank' || e.type === 'multiple_choice'
    );
    if (suitable.length === 0) return null;
    const ex = suitable[Math.floor(Math.random() * suitable.length)];
    return {
      type: 'grammar',
      typeLabel: 'Grammatik',
      question: ex.sentence,
      answer: ex.answer,
      options: (ex.options && ex.options.length) ? ex.options : null,
      detail: (ex.sentence_en ? 'EN: ' + ex.sentence_en + '\n' : '') + (ex.explanation || ''),
      also_accept: ex.also_accept || null,
    };
  },

  /**
   * Generate a translation fill-in exercise from vocabulary.
   * @param {Array} vocabulary
   * @returns {object|null}
   */
  _genTranslationEx(vocabulary) {
    // Filter to items that have both a word and a translation
    const items = vocabulary.filter(v => v.word && v.translation);
    if (items.length === 0) return null;
    const item = items[Math.floor(Math.random() * items.length)];

    // Build also_accept list: for nouns, accept bare noun without article
    const alsoAccept = [];
    if (item.type === 'noun' && item.noun) {
      alsoAccept.push(item.noun);
      if (item.article) {
        alsoAccept.push(item.article + ' ' + item.noun);
      }
    }

    // Ask for the German word given the English translation
    const transEx = (item.examples && item.examples[0]) || item.sentence || '';
    const parts = [
      transEx ? transEx : '',
      item.translation ? 'EN: ' + item.translation : '',
    ].filter(Boolean);
    return {
      type: 'translation',
      typeLabel: 'Vokabel',
      question: 'Übersetze: ' + item.translation,
      answer: item.word,
      also_accept: alsoAccept.length > 0 ? alsoAccept : null,
      detail: parts.join('\n'),
    };
  },

  /**
   * Generate an exercise from an SRS due item by matching it back to source data.
   * Returns an exercise object or null if the item can't be resolved.
   * @param {object} srsItem - { module, id, label, detail }
   * @param {Array} grammar
   * @param {Array} nouns
   * @param {Array} verbs
   * @param {Array} vocabulary
   * @returns {object|null}
   */
  _generateSrsExercise(srsItem, grammar, nouns, verbs, vocabulary) {
    const mod = srsItem.module;
    const id = srsItem.id;

    if (mod === 'grammar') {
      const ex = grammar.find(e => e.id === id);
      if (ex && (ex.type === 'fill_blank' || ex.type === 'multiple_choice')) {
        return {
          type: 'grammar', typeLabel: 'SRS-Wiederholung',
          question: ex.sentence, answer: ex.answer,
          options: ex.options?.length ? ex.options : null,
          detail: (ex.sentence_en ? 'EN: ' + ex.sentence_en + '\n' : '') + (ex.explanation || ''),
          also_accept: ex.also_accept || null,
          _srs: { module: mod, id: id },
        };
      }
    }

    if (mod === 'article' || mod === 'vocabulary') {
      const noun = nouns.find(n => n.noun === id || n.word === id);
      if (noun && noun.article && noun.noun) {
        const nEx = (noun.examples && noun.examples[0]) || noun.sentence || '';
        const nPlural = noun.plural ? 'Pl: die ' + noun.plural : '';
        return {
          type: 'article', typeLabel: 'SRS-Wiederholung',
          question: 'Welcher Artikel? ___ ' + noun.noun,
          answer: noun.article,
          options: ['der', 'die', 'das'],
          detail: [nEx, noun.translation ? 'EN: ' + noun.translation : '', nPlural].filter(Boolean).join('\n'),
          _srs: { module: mod, id: id },
        };
      }
    }

    if (mod === 'conjugation') {
      const verb = verbs.find(v => v.word === id);
      if (verb && verb.conjugation && verb.conjugation.präsens) {
        const pronouns = ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'Sie'];
        const conjKeys = ['ich', 'du', 'es', 'wir', 'ihr', 'Sie'];
        const idx = Math.floor(Math.random() * pronouns.length);
        const form = verb.conjugation.präsens[conjKeys[idx]];
        if (form) {
          const vEx = (verb.examples && verb.examples[0]) || '';
          const perfekt = verb.conjugation.perfekt ? 'Perfekt: ' + (verb.conjugation.withSein ? 'ist ' : 'hat ') + verb.conjugation.perfekt : '';
          return {
            type: 'conjugation', typeLabel: 'SRS-Wiederholung',
            question: pronouns[idx] + ' ___ (' + verb.word + ')',
            answer: form,
            detail: [vEx, verb.translation ? 'EN: ' + verb.translation : '', perfekt].filter(Boolean).join('\n'),
            _srs: { module: mod, id: id },
          };
        }
      }
    }

    if (mod === 'translation') {
      const item = vocabulary.find(v => v.word === id) ||
                   nouns.find(n => n.word === id) ||
                   verbs.find(v => v.word === id);
      if (item && item.word && item.translation) {
        const tEx = (item.examples && item.examples[0]) || item.sentence || '';
        return {
          type: 'translation', typeLabel: 'SRS-Wiederholung',
          question: 'Übersetze: ' + item.translation,
          answer: item.word,
          detail: [tEx, item.translation ? 'EN: ' + item.translation : ''].filter(Boolean).join('\n'),
          _srs: { module: mod, id: id },
        };
      }
    }

    // Fallback: present the SRS item as a simple recall question using label/detail
    if (srsItem.label && srsItem.detail) {
      return {
        type: 'srs_recall', typeLabel: 'SRS-Wiederholung',
        question: srsItem.label,
        answer: srsItem.detail,
        detail: '',
        _srs: { module: mod, id: id },
      };
    }

    return null;
  },

  /**
   * Show the next exercise in the drill area.
   */
  _showNextDrillExercise() {
    if (!this._drill.active) return;

    const area = document.getElementById('drill-exercise-area');
    if (!area) return;

    this._drill.answered = true; // guard against instant taps from previous question
    if (document.activeElement) document.activeElement.blur(); // clear iOS focus
    const exercise = this._generateDrillExercise();
    if (!exercise) {
      area.innerHTML =
        '<div class="drill-card">' +
          '<p>Keine Übungsdaten verfügbar. Lade die Seite neu.</p>' +
        '</div>';
      return;
    }
    this._drill.currentExercise = exercise;

    // Build question text with blank styling
    const questionHtml = escapeHtml(exercise.question)
      .replace(/___/g, '<span class="drill-card__blank">&nbsp;&nbsp;&nbsp;</span>');

    let inputHtml;
    if (exercise.options && exercise.options.length) {
      // Multiple choice — shuffle options
      const shuffled = [...exercise.options];
      shuffleArray(shuffled);
      inputHtml =
        '<div class="drill-options">' +
        shuffled.map(opt =>
          '<div class="drill-option drill-option--locked" data-value="' + escapeHtml(opt) + '" role="button">' +
            escapeHtml(opt) +
          '</div>'
        ).join('') +
        '</div>';
    } else {
      // Text input
      inputHtml =
        '<form class="drill-input-form" id="drill-input-form">' +
          '<input type="text" class="drill-input" id="drill-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Antwort eingeben&hellip;">' +
          '<button type="submit" class="drill-submit">OK</button>' +
        '</form>';
    }

    area.innerHTML =
      '<div class="drill-card">' +
        '<span class="drill-card__type">' + escapeHtml(exercise.typeLabel) + '</span>' +
        '<div class="drill-card__question">' + questionHtml + '</div>' +
        inputHtml +
        '<div id="drill-feedback"></div>' +
      '</div>';

    // Enable buttons after delay to prevent ghost taps from previous question
    setTimeout(() => {
      this._drill.answered = false;
      area.querySelectorAll('.drill-option--locked').forEach(el => {
        el.classList.remove('drill-option--locked');
      });
      const input = document.getElementById('drill-input');
      if (input) input.focus();
    }, 400);

    // Bind event handlers
    if (exercise.options && exercise.options.length) {
      area.querySelectorAll('.drill-option').forEach(el => {
        el.addEventListener('click', () => {
          if (this._drill.answered || el.classList.contains('drill-option--locked')) return;
          this._handleDrillAnswer(el.getAttribute('data-value'), exercise);
        });
      });
    } else {
      const form = document.getElementById('drill-input-form');
      const input = document.getElementById('drill-input');
      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (this._drill.answered) return;
          const val = input.value.trim();
          if (!val) return;
          this._handleDrillAnswer(val, exercise);
        });
      }
      // Auto-focus the input
      if (input) {
        requestAnimationFrame(() => input.focus());
      }
    }
  },

  /**
   * Handle a drill answer submission.
   * @param {string} given — the user's answer
   * @param {object} exercise — the exercise object
   */
  _handleDrillAnswer(given, exercise) {
    if (this._drill.answered || !this._drill.active) return;
    this._drill.answered = true;
    this._drill.total++;

    // Normalize for comparison
    const normalize = s => s.toLowerCase().trim();
    const correct = normalize(given) === normalize(exercise.answer) ||
      (exercise.also_accept && exercise.also_accept.some(
        alt => normalize(given) === normalize(alt)
      ));

    if (correct) this._drill.score++;

    // Update score display
    const scoreEl = document.getElementById('drill-score-correct');
    const totalEl = document.getElementById('drill-score-total');
    if (scoreEl) scoreEl.textContent = this._drill.score;
    if (totalEl) totalEl.textContent = this._drill.total;

    // Show feedback on options
    const area = document.getElementById('drill-exercise-area');
    if (exercise.options && exercise.options.length) {
      area.querySelectorAll('.drill-option').forEach(el => {
        el.classList.add('drill-option--locked');
        const val = el.getAttribute('data-value');
        if (normalize(val) === normalize(exercise.answer)) {
          el.classList.add('drill-option--correct');
        } else if (normalize(val) === normalize(given) && !correct) {
          el.classList.add('drill-option--wrong');
        }
      });
    } else {
      // Style the text input
      const input = document.getElementById('drill-input');
      const submit = area.querySelector('.drill-submit');
      if (input) {
        input.disabled = true;
        input.classList.add(correct ? 'drill-input--correct' : 'drill-input--wrong');
      }
      if (submit) submit.disabled = true;
    }

    // Render feedback — always show answer + translation
    const feedbackEl = document.getElementById('drill-feedback');
    if (feedbackEl) {
      const cls = correct ? 'drill-feedback--correct' : 'drill-feedback--wrong';

      // Build a rich answer line: for articles show "die Überschrift = heading"
      let answerText;
      if (exercise.type === 'article') {
        const nounMatch = exercise.question.match(/___ (.+)/);
        const noun = nounMatch ? nounMatch[1] : '';
        answerText = exercise.answer + ' ' + noun;
      } else if (exercise.type === 'conjugation') {
        const pronounMatch = exercise.question.match(/^(.+?) ___/);
        const pronoun = pronounMatch ? pronounMatch[1] : '';
        answerText = pronoun + ' ' + exercise.answer;
      } else if (exercise.type === 'grammar') {
        // Show the completed sentence with the answer filled in
        answerText = exercise.question.replace(/___/g, exercise.answer);
      } else {
        answerText = exercise.answer;
      }

      let fbHtml = correct
        ? '<span class="drill-feedback__answer">Richtig!</span>'
        : '<span class="drill-feedback__answer">Falsch — richtig: ' + escapeHtml(exercise.answer) + '</span>';

      // Show the completed sentence for grammar
      if (exercise.type === 'grammar' || exercise.type === 'article' || exercise.type === 'conjugation') {
        fbHtml += '<div class="drill-feedback__sentence">' + escapeHtml(answerText) + '</div>';
      }

      // Always show translation/detail — each line separately
      if (exercise.detail) {
        const lines = exercise.detail.split('\n').filter(Boolean);
        fbHtml += '<div class="drill-feedback__detail">' +
          lines.map(l => escapeHtml(l)).join('<br>') +
          '</div>';
      }
      feedbackEl.innerHTML = '<div class="drill-feedback ' + cls + '">' + fbHtml + '</div>';
    }

    // Record miss for weak-area tracking + SRS scheduling
    if (!correct) {
      let category = 'drill';
      let srsModule = exercise.type; // 'article', 'conjugation', 'grammar', 'translation'
      let srsId = exercise.answer;

      if (exercise.type === 'article') {
        category = 'articles';
        // Extract the noun from the question for a stable SRS id
        const nounMatch = exercise.question.match(/___ (.+)/);
        srsId = nounMatch ? nounMatch[1] : exercise.answer;
        srsModule = 'article';
      } else if (exercise.type === 'conjugation') {
        category = 'konjugation_präsens';
        // Extract the infinitive from the question for a stable SRS id
        const verbMatch = exercise.question.match(/\((.+)\)/);
        srsId = verbMatch ? verbMatch[1] : exercise.answer;
        srsModule = 'conjugation';
      } else if (exercise.type === 'grammar') {
        category = 'grammar';
        srsModule = 'grammar';
        // Use the exercise id if available (from _srs or exercise itself)
        srsId = (exercise._srs && exercise._srs.id) || exercise.answer;
      } else if (exercise.type === 'translation') {
        category = 'flashcards';
        srsModule = 'translation';
        srsId = exercise.answer;
      }

      Storage.recordMiss({
        module: 'vocabulary',
        category: category,
        id: 'drill_' + exercise.answer + '_' + Date.now(),
        question: exercise.question,
        expected: exercise.answer,
        given: given,
      });

      // Add to SRS queue (or reset interval if already tracked)
      Storage.srsRecordMiss({
        module: srsModule,
        id: srsId,
        label: exercise.question,
        detail: exercise.answer,
      });
    } else {
      // Correct answer — if this was an SRS review, record success
      if (exercise._srs) {
        Storage.srsRecordCorrect(exercise._srs.module, exercise._srs.id);
      }
    }

    // Store in history
    this._drill.history.push({ exercise, given, correct });

    // Show navigation buttons
    const fbArea = document.getElementById('drill-feedback');
    if (fbArea) {
      const navDiv = document.createElement('div');
      navDiv.className = 'exercise-nav-btns';
      navDiv.style.marginTop = '0.5rem';

      if (this._drill.history.length > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn--outline';
        prevBtn.textContent = '← Zurück';
        prevBtn.addEventListener('click', () => {
          this._drill.historyIndex = this._drill.history.length - 2;
          this._showDrillHistoryItem();
        });
        navDiv.appendChild(prevBtn);
      }

      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn--accent drill-next-btn';
      nextBtn.textContent = 'Weiter →';
      nextBtn.addEventListener('click', () => {
        this._drill.historyIndex = -1;
        if (this._drill.active) this._showNextDrillExercise();
      });
      navDiv.appendChild(nextBtn);

      fbArea.appendChild(navDiv);
    }
  },

  /**
   * Show a previously answered drill exercise in review mode.
   */
  _showDrillHistoryItem() {
    const idx = this._drill.historyIndex;
    const item = this._drill.history[idx];
    if (!item) return;

    const area = document.getElementById('drill-exercise-area');
    if (!area) return;

    this._drill.answered = true;
    const { exercise, given, correct } = item;

    const questionHtml = escapeHtml(exercise.question)
      .replace(/___/g, '<span class="drill-card__blank">&nbsp;&nbsp;&nbsp;</span>');

    let optionsHtml = '';
    const normalize = s => s.toLowerCase().trim();
    if (exercise.options && exercise.options.length) {
      optionsHtml = '<div class="drill-options">' +
        exercise.options.map(opt => {
          let cls = 'drill-option drill-option--locked';
          if (normalize(opt) === normalize(exercise.answer)) cls += ' drill-option--correct';
          else if (normalize(opt) === normalize(given) && !correct) cls += ' drill-option--wrong';
          return '<div class="' + cls + '">' + escapeHtml(opt) + '</div>';
        }).join('') + '</div>';
    }

    const fbCls = correct ? 'drill-feedback--correct' : 'drill-feedback--wrong';
    const fbText = correct
      ? '<span class="drill-feedback__answer">Richtig!</span>'
      : '<span class="drill-feedback__answer">Falsch — richtig: ' + escapeHtml(exercise.answer) + '</span>';

    // Navigation buttons
    let navHtml = '<div class="exercise-nav-btns" style="margin-top:0.5rem">';
    if (idx > 0) {
      navHtml += '<button class="btn btn--outline" id="drill-hist-prev">← Zurück</button>';
    }
    if (idx < this._drill.history.length - 1) {
      navHtml += '<button class="btn btn--outline" id="drill-hist-fwd">Vorwärts →</button>';
    }
    navHtml += '<button class="btn btn--accent drill-next-btn" id="drill-hist-new">Neue Frage →</button>';
    navHtml += '</div>';

    area.innerHTML =
      '<div class="drill-card">' +
        '<span class="drill-card__type">' + escapeHtml(exercise.typeLabel || '') + ' (Rückblick)</span>' +
        '<div class="drill-card__question">' + questionHtml + '</div>' +
        optionsHtml +
        '<div id="drill-feedback"><div class="drill-feedback ' + fbCls + '">' + fbText + '</div>' + navHtml + '</div>' +
      '</div>';

    const prevBtn = document.getElementById('drill-hist-prev');
    const fwdBtn = document.getElementById('drill-hist-fwd');
    const newBtn = document.getElementById('drill-hist-new');
    if (prevBtn) prevBtn.addEventListener('click', () => { this._drill.historyIndex--; this._showDrillHistoryItem(); });
    if (fwdBtn) fwdBtn.addEventListener('click', () => { this._drill.historyIndex++; this._showDrillHistoryItem(); });
    if (newBtn) newBtn.addEventListener('click', () => { this._drill.historyIndex = -1; this._showNextDrillExercise(); });
  },

  /**
   * End the drill and show results.
   */
  /**
   * Track weekly practice minutes. Returns { minutesThisWeek, targetMinutes, sessionsThisWeek }.
   */
  _trackWeeklyPractice(minutesCompleted) {
    const log = Storage.get('weekly_practice', []);
    if (minutesCompleted > 0) {
      log.push({ date: new Date().toISOString(), minutes: minutesCompleted });
      Storage.set('weekly_practice', log);
    }
    // Count this week's minutes
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Sunday start
    weekStart.setHours(0, 0, 0, 0);
    const thisWeek = log.filter(e => new Date(e.date) >= weekStart);
    const minutesThisWeek = thisWeek.reduce((sum, e) => sum + e.minutes, 0);
    const sessionsThisWeek = thisWeek.length;
    // Target: 60 min/week in early weeks, ramp to 90 min/week later
    const curriculum = this._getCurriculum();
    const targetMinutes = curriculum.week <= 6 ? 60 : 90;
    return { minutesThisWeek, targetMinutes, sessionsThisWeek };
  },

  _endDrill() {
    this._destroyDrill();

    const container = document.getElementById('drill-content');
    if (!container) return;

    // Track practice time
    const elapsed = this._drill.totalSeconds - Math.max(0, this._drill.remainingSeconds);
    const minutesDone = Math.round(elapsed / 60);
    const weekly = this._trackWeeklyPractice(minutesDone);

    const score = this._drill.score;
    const total = this._drill.total;
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    const perMinute = elapsed > 0 ? ((total / elapsed) * 60).toFixed(1) : '0';

    let verdict, verdictClass;
    if (pct >= 90) {
      verdict = 'Ausgezeichnet!';
      verdictClass = 'text-success';
    } else if (pct >= 70) {
      verdict = 'Gut gemacht!';
      verdictClass = 'text-success';
    } else if (pct >= 50) {
      verdict = 'Weiter üben!';
      verdictClass = 'text-warning';
    } else {
      verdict = 'Nicht aufgeben!';
      verdictClass = 'text-danger';
    }

    container.innerHTML =
      '<div class="drill-results">' +
        '<div class="drill-results__title ' + verdictClass + '">' + escapeHtml(verdict) + '</div>' +
        '<div class="drill-results__score">' + pct + '%</div>' +
        '<div class="drill-results__detail">' + score + ' von ' + total + ' Aufgaben richtig</div>' +
        '<div class="drill-results__stats">' +
          '<div class="drill-results__stat">' +
            '<span class="drill-results__stat-value">' + total + '</span>' +
            '<span class="drill-results__stat-label">Aufgaben</span>' +
          '</div>' +
          '<div class="drill-results__stat">' +
            '<span class="drill-results__stat-value">' + score + '</span>' +
            '<span class="drill-results__stat-label">Richtig</span>' +
          '</div>' +
          '<div class="drill-results__stat">' +
            '<span class="drill-results__stat-value">' + perMinute + '</span>' +
            '<span class="drill-results__stat-label">pro Minute</span>' +
          '</div>' +
        '</div>' +
        '<div class="drill-results__weekly">' +
          '<h3>Wochenfortschritt</h3>' +
          '<div class="drill-results__weekly-bar">' +
            '<div class="progress-bar"><div class="progress-bar__fill" style="width:' + Math.min(100, Math.round(weekly.minutesThisWeek / weekly.targetMinutes * 100)) + '%"></div></div>' +
            '<span>' + weekly.minutesThisWeek + ' / ' + weekly.targetMinutes + ' Min. diese Woche' +
            (weekly.minutesThisWeek >= weekly.targetMinutes ? ' ✓' : ' — noch ' + (weekly.targetMinutes - weekly.minutesThisWeek) + ' Min.') +
            '</span>' +
          '</div>' +
          '<p class="drill-results__curriculum">Woche ' + this._getCurriculum().week + ' von 13 — ' +
            (this._getCurriculum().week <= 3 ? 'Grundlagen' : this._getCurriculum().week <= 6 ? 'Aufbau B1' : this._getCurriculum().week <= 9 ? 'B2 Vertiefung' : 'FSP-Vorbereitung') +
          '</p>' +
        '</div>' +
        '<div class="drill-results__actions">' +
          '<a href="#drill/' + Math.round(this._drill.totalSeconds / 60) + '" class="btn btn--accent" onclick="App._restartDrillFromLink(event, ' + Math.round(this._drill.totalSeconds / 60) + ')">Nochmal</a>' +
          '<a href="#home" class="btn btn--outline">Zur Startseite</a>' +
        '</div>' +
      '</div>';

    // Record practice for streak tracking
    this.recordPractice();
  },

  /**
   * Handle clicking "Nochmal" on results — we need to force re-entry
   * since the hash may already be #drill/N.
   * @param {Event} e
   * @param {number} minutes
   */
  _restartDrillFromLink(e, minutes) {
    e.preventDefault();
    // Force a re-route by toggling hash
    window.location.hash = '#drill/' + minutes;
    this._startDrill(minutes);
  },

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

  /**
   * Safely set the text content of an element by id.
   * @param {string} id
   * @param {string|number} text
   */
  _setTextById(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  },
};

// =============================================================================
// Boot on DOM ready
// =============================================================================
document.addEventListener('DOMContentLoaded', () => App.init());
