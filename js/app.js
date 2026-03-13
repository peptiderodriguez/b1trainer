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
  _moduleNames: ['vocabulary', 'grammar', 'reading', 'listening', 'writing', 'exam'],

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
    if (this._activeModule && this._modules[this._activeModule]) {
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
