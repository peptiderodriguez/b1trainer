// =============================================================================
// utils.js — Shared utilities for B1 Goethe Trainer
// =============================================================================

'use strict';

// -----------------------------------------------------------------------------
// Array utilities
// -----------------------------------------------------------------------------

/**
 * Fisher-Yates (Knuth) in-place shuffle. Returns the same array, mutated.
 * @param {Array} arr
 * @returns {Array}
 */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Pick n random items from arr (without mutation). Returns a new array.
 * If n >= arr.length, returns a shuffled copy of the full array.
 * @param {Array} arr
 * @param {number} n
 * @returns {Array}
 */
function pickRandom(arr, n) {
  const copy = [...arr];
  shuffleArray(copy);
  return copy.slice(0, Math.min(n, copy.length));
}

// -----------------------------------------------------------------------------
// Speech
// -----------------------------------------------------------------------------

/**
 * Cached German voice reference, populated once voices are loaded.
 * @type {SpeechSynthesisVoice|null}
 */
let _cachedGermanVoice = null;
let _voicesLoaded = false;

function _pickGermanVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  _voicesLoaded = true;
  _cachedGermanVoice = voices.find(v => v.lang.startsWith('de') && v.localService) ||
                       voices.find(v => v.lang.startsWith('de')) || null;
  return _cachedGermanVoice;
}

// Pre-load voices as soon as they become available
if ('speechSynthesis' in window) {
  _pickGermanVoice(); // try immediately (works in Firefox)
  window.speechSynthesis.addEventListener('voiceschanged', _pickGermanVoice);
}

/**
 * Speak text aloud using the Web Speech API.
 * @param {string} text
 * @param {string} lang - BCP-47 language tag (default: 'de-DE')
 */
function speak(text, lang = 'de-DE') {
  if (!('speechSynthesis' in window)) return;

  // Cancel any ongoing speech first
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9;
  utterance.pitch = 1;

  // Use cached voice, or try to pick one now
  const voice = _cachedGermanVoice || _pickGermanVoice();
  if (voice) {
    utterance.voice = voice;
  }

  window.speechSynthesis.speak(utterance);
}

// -----------------------------------------------------------------------------
// HTML helpers
// -----------------------------------------------------------------------------

/**
 * Escape a string so it is safe to embed in HTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/**
 * Convenience wrapper around document.createElement.
 * @param {string}       tag        - Tag name (e.g. 'div')
 * @param {string|Array} classes    - CSS class(es), space-separated string or array
 * @param {string}       [innerHTML] - Optional inner HTML (already safe or intentional)
 * @returns {HTMLElement}
 */
function createElement(tag, classes = '', innerHTML = '') {
  const el = document.createElement(tag);
  if (classes) {
    const list = Array.isArray(classes) ? classes : classes.split(/\s+/).filter(Boolean);
    list.forEach(c => el.classList.add(c));
  }
  if (innerHTML) {
    el.innerHTML = innerHTML;
  }
  return el;
}

// -----------------------------------------------------------------------------
// Storage — localStorage wrapper for progress tracking
// -----------------------------------------------------------------------------

const Storage = {
  _prefix: 'b1trainer_',

  /**
   * Get a value from localStorage, parsed from JSON.
   * @param {string} key
   * @param {*}      defaultValue - Returned when key does not exist
   * @returns {*}
   */
  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(this._prefix + key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch {
      return defaultValue;
    }
  },

  /**
   * Set a value in localStorage as JSON.
   * @param {string} key
   * @param {*}      value
   */
  set(key, value) {
    try {
      localStorage.setItem(this._prefix + key, JSON.stringify(value));
    } catch {
      console.warn('Storage.set failed — localStorage may be full.');
    }
  },

  /**
   * Get progress data for a specific module.
   * @param {string} module - e.g. 'vocabulary', 'grammar'
   * @returns {{completed: number, total: number, score: number, streak: number}}
   */
  getProgress(module) {
    return this.get('progress_' + module, {
      completed: 0,
      total: 0,
      score: 0,
      streak: 0,
    });
  },

  /**
   * Save progress data for a specific module.
   * @param {string} module
   * @param {object} data - Partial or full progress object
   */
  saveProgress(module, data) {
    const current = this.getProgress(module);
    this.set('progress_' + module, { ...current, ...data });
  },

  /**
   * Get the list of words the user struggles with.
   * @returns {Array<{word: string, translation: string, type: string, wrongCount: number}>}
   */
  getWeakWords() {
    return this.get('weak_words', []);
  },

  /**
   * Add a word to the weak-words list. If it already exists, increment wrongCount.
   * @param {{word: string, translation: string, type: string}} wordObj
   */
  addWeakWord(wordObj) {
    const list = this.getWeakWords();
    const existing = list.find(w => w.word === wordObj.word);
    if (existing) {
      existing.wrongCount = (existing.wrongCount || 1) + 1;
    } else {
      list.push({ ...wordObj, wrongCount: 1 });
    }
    this.set('weak_words', list);
  },

  /**
   * Remove a word from the weak-words list (e.g. once mastered).
   * @param {string} word
   */
  removeWeakWord(word) {
    const list = this.getWeakWords().filter(w => w.word !== word);
    this.set('weak_words', list);
  },

  // ---------------------------------------------------------------------------
  // Missed items tracker — tracks errors across all modules for focused review
  // ---------------------------------------------------------------------------

  /**
   * Record a missed item (wrong answer) for later review.
   * Each entry tracks: module, category, the item itself, timestamps, and error count.
   * Items that are answered correctly in review have their count decremented.
   *
   * @param {object} opts
   * @param {string} opts.module    - 'vocabulary'|'grammar'|'reading'|'listening'
   * @param {string} opts.category  - e.g. 'articles', 'dativ_prepositions', 'konjugation_präsens'
   * @param {string} opts.id        - unique identifier for the item
   * @param {string} opts.question  - the question/prompt that was missed
   * @param {string} opts.expected  - the correct answer
   * @param {string} opts.given     - what the user answered
   * @param {object} [opts.meta]    - any extra data (word object, exercise object, etc.)
   */
  recordMiss(opts) {
    const misses = this.get('missed_items', []);
    const existing = misses.find(m => m.id === opts.id && m.module === opts.module);
    if (existing) {
      existing.missCount = (existing.missCount || 1) + 1;
      existing.lastMissed = Date.now();
      existing.given = opts.given;
    } else {
      misses.push({
        module: opts.module,
        category: opts.category,
        id: opts.id,
        question: opts.question,
        expected: opts.expected,
        given: opts.given,
        meta: opts.meta || {},
        missCount: 1,
        correctInReview: 0,
        lastMissed: Date.now(),
        lastReviewed: null,
      });
    }
    this.set('missed_items', misses);
  },

  /**
   * Record a correct answer during review, decrementing the miss weight.
   * Once correctInReview >= missCount, the item is considered mastered and removed.
   * @param {string} module
   * @param {string} id
   */
  recordReviewCorrect(module, id) {
    const misses = this.get('missed_items', []);
    const item = misses.find(m => m.id === id && m.module === module);
    if (!item) return;
    item.correctInReview = (item.correctInReview || 0) + 1;
    item.lastReviewed = Date.now();
    if (item.correctInReview >= item.missCount) {
      // Mastered — remove from missed items
      const filtered = misses.filter(m => !(m.id === id && m.module === module));
      this.set('missed_items', filtered);
    } else {
      this.set('missed_items', misses);
    }
  },

  /**
   * Get all missed items, optionally filtered by module and/or category.
   * Sorted by priority: most-missed and least-recently-reviewed first.
   * @param {object} [filter]
   * @param {string} [filter.module]
   * @param {string} [filter.category]
   * @param {number} [filter.limit] - max items to return
   * @returns {Array}
   */
  getMissedItems(filter = {}) {
    let misses = this.get('missed_items', []);
    if (filter.module) {
      misses = misses.filter(m => m.module === filter.module);
    }
    if (filter.category) {
      misses = misses.filter(m => m.category === filter.category);
    }
    // Sort by priority: higher missCount first, then least recently reviewed
    misses.sort((a, b) => {
      const weightA = a.missCount - (a.correctInReview || 0);
      const weightB = b.missCount - (b.correctInReview || 0);
      if (weightB !== weightA) return weightB - weightA;
      return (a.lastReviewed || 0) - (b.lastReviewed || 0);
    });
    if (filter.limit) {
      misses = misses.slice(0, filter.limit);
    }
    return misses;
  },

  /**
   * Get a summary of weak categories across all modules.
   * Returns categories ranked by total error weight.
   * @returns {Array<{module: string, category: string, totalMisses: number, itemCount: number}>}
   */
  getWeakCategories() {
    const misses = this.get('missed_items', []);
    const categoryMap = {};
    for (const m of misses) {
      const key = `${m.module}::${m.category}`;
      if (!categoryMap[key]) {
        categoryMap[key] = { module: m.module, category: m.category, totalMisses: 0, itemCount: 0 };
      }
      categoryMap[key].totalMisses += m.missCount - (m.correctInReview || 0);
      categoryMap[key].itemCount += 1;
    }
    return Object.values(categoryMap)
      .filter(c => c.totalMisses > 0)
      .sort((a, b) => b.totalMisses - a.totalMisses);
  },

  /**
   * Clear all missed items (e.g. reset progress).
   */
  clearMissedItems() {
    this.set('missed_items', []);
  },
};

// -----------------------------------------------------------------------------
// Toast notifications
// -----------------------------------------------------------------------------

/**
 * Show a small, auto-dismissing toast notification.
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} type
 * @param {number} duration - milliseconds before auto-dismiss (default 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
  // Ensure container exists
  let container = document.getElementById('toast-container');
  if (!container) {
    container = createElement('div', 'toast-container');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = createElement('div', `toast toast-${type}`);
  const iconMap = { info: 'ℹ️', success: '✓', error: '✗', warning: '⚠' };
  toast.innerHTML = `
    <span class="toast-icon">${iconMap[type] || ''}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Schließen">&times;</button>
  `;

  // Allow manual dismiss
  toast.querySelector('.toast-close').addEventListener('click', () => removeToast(toast));

  container.appendChild(toast);

  // Trigger entrance animation on next frame
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  // Auto-dismiss
  setTimeout(() => removeToast(toast), duration);

  function removeToast(el) {
    el.classList.remove('toast-visible');
    el.classList.add('toast-hiding');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    // Fallback removal if transitionend never fires
    setTimeout(() => { if (el.parentNode) el.remove(); }, 500);
  }
}

// -----------------------------------------------------------------------------
// Modal
// -----------------------------------------------------------------------------

/**
 * Show a modal dialog.
 * @param {string}          title
 * @param {string|HTMLElement} content  - HTML string or DOM element
 * @param {Function}        [onClose]  - Called when the modal is dismissed
 * @returns {{close: Function}} - Object with a close() method
 */
function showModal(title, content, onClose) {
  // Overlay
  const overlay = createElement('div', 'modal-overlay');

  // Modal box
  const modal = createElement('div', 'modal');
  modal.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title">${escapeHtml(title)}</h2>
      <button class="modal-close" aria-label="Schließen">&times;</button>
    </div>
    <div class="modal-body"></div>
  `;

  // Insert content
  const body = modal.querySelector('.modal-body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    body.appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Prevent background scroll
  document.body.classList.add('modal-open');

  // Entrance animation
  requestAnimationFrame(() => overlay.classList.add('modal-visible'));

  // Close helpers
  function close() {
    overlay.classList.remove('modal-visible');
    overlay.classList.add('modal-hiding');
    document.body.classList.remove('modal-open');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 500);
    if (typeof onClose === 'function') onClose();
  }

  modal.querySelector('.modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // ESC key
  function onKey(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  }
  document.addEventListener('keydown', onKey);

  return { close };
}
