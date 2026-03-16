// =============================================================================
// fsp.js — Fachsprachprüfung simulation module for B1/B2 Goethe Trainer
// =============================================================================

'use strict';

const FspModule = (() => {

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const PARTS = [
    { key: 'patient', label: 'Teil 1: Arzt-Patienten-Gespräch', minutes: 20, icon: '&#128101;' },
    { key: 'arzt',    label: 'Teil 2: Arzt-Arzt-Gespräch',      minutes: 20, icon: '&#129658;' },
    { key: 'brief',   label: 'Teil 3: Arztbrief',               minutes: 20, icon: '&#128196;' },
  ];

  const ARZT_CHECKLIST = [
    'Einleitung',
    'Anamnese',
    'Befunde',
    'Diagnose',
    'Differentialdiagnosen',
    'Diagnostik',
    'Therapie',
    'Procedere',
  ];

  const BRIEF_SECTIONS = ['Anrede', 'Diagnosen', 'Anamnese', 'Befund', 'Therapie', 'Procedere'];

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let container = null;
  let data = null;
  let _toolbarHandler = null;

  // Timer
  let timerInterval = null;
  let timerRemaining = 0;
  let warningShown = false;

  // Simulation state
  let simActive = false;
  let simPartIndex = -1;
  let simScenario = null;
  let simResults = {};

  // Voice recording state
  let _mediaRecorder = null;
  let _audioChunks = [];
  let _recordings = []; // { partKey, blob, url, timestamp }
  let _isRecording = false;

  // ---------------------------------------------------------------------------
  // Initialization & lifecycle
  // ---------------------------------------------------------------------------

  function init(el, appData) {
    container = el;
    data = appData;
  }

  function render(_container, subRoute) {
    _bindToolbar();

    if (!subRoute) {
      _renderOverview();
    } else if (subRoute === 'patient') {
      simActive = false;
      _renderPatient(_pickScenario());
    } else if (subRoute === 'arzt') {
      simActive = false;
      _renderArzt(_pickScenario());
    } else if (subRoute === 'brief') {
      simActive = false;
      _renderBrief(_pickScenario());
    } else if (subRoute === 'simulation') {
      _startSimulation();
    } else {
      _renderOverview();
    }
  }

  function destroy() {
    _stopTimer();
    _stopRecording();
    _recordings.forEach(r => URL.revokeObjectURL(r.url));
    _recordings = [];
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
      const btn = e.target.closest('[data-fsp-action]');
      if (!btn) return;

      switch (btn.getAttribute('data-fsp-action')) {
        case 'finish-part':
          _onFinishPart();
          break;
        case 'back-overview':
          window.location.hash = '#fsp';
          break;
      }
    };
    document.addEventListener('click', _toolbarHandler);
  }

  // ---------------------------------------------------------------------------
  // Overview Screen
  // ---------------------------------------------------------------------------

  function _renderOverview() {
    _stopTimer();
    simActive = false;

    const pastResults = Storage.get('fsp_results', []);
    const lastResult = pastResults.length > 0 ? pastResults[pastResults.length - 1] : null;

    let pastHtml = '';
    if (lastResult) {
      pastHtml = `
        <div class="fsp-past">
          <h3>Letzte Simulation</h3>
          <p class="fsp-past__date">${_formatDate(lastResult.timestamp)}</p>
          <div class="fsp-past__scores">
            ${PARTS.map(part => {
              const r = (lastResult.parts && lastResult.parts[part.key]) || {};
              const pct = r.percentage || 0;
              return `
                <div class="fsp-past__section">
                  <span class="fsp-past__label">${escapeHtml(part.label)}</span>
                  <div class="progress-bar progress-bar--small">
                    <div class="progress-bar__fill ${pct >= 60 ? 'progress-bar__fill--success' : 'progress-bar__fill--danger'}" style="width: ${pct}%"></div>
                  </div>
                  <span class="fsp-past__pct">${pct}%</span>
                </div>`;
            }).join('')}
          </div>
          <p class="fsp-past__total">Gesamtergebnis: <strong>${lastResult.totalPercentage || 0}%</strong></p>
        </div>`;
    }

    container.innerHTML = `
      <div class="fsp-overview">
        <h2>Fachsprachprüfung Medizin</h2>
        <p>Die Fachsprachprüfung besteht aus drei Teilen. Jeder Teil dauert 20 Minuten. Sie können die Teile einzeln üben oder eine vollständige Simulation durchführen.</p>

        <div class="fsp-overview__cards">
          ${PARTS.map(part => `
            <a href="#fsp/${part.key}" class="fsp-part-card">
              <span class="fsp-part-card__icon" aria-hidden="true">${part.icon}</span>
              <h3 class="fsp-part-card__title">${escapeHtml(part.label)}</h3>
              <p class="fsp-part-card__time">${part.minutes} Minuten</p>
              <p class="fsp-part-card__desc">${_getPartDescription(part.key)}</p>
              <span class="fsp-part-card__action">Einzeln üben</span>
            </a>`).join('')}
        </div>

        <div class="fsp-overview__simulation">
          <a href="#fsp/simulation" class="btn btn--accent btn--lg">Vollständige Simulation starten</a>
          <p class="fsp-overview__sim-note">Alle drei Teile nacheinander mit je 20 Minuten — ein Szenario durchgehend</p>
        </div>

        ${pastHtml}
      </div>`;
  }

  function _getPartDescription(key) {
    switch (key) {
      case 'patient': return 'Führen Sie ein Anamnesegespräch mit einem Patienten. Erfragen Sie systematisch alle relevanten Informationen.';
      case 'arzt':    return 'Präsentieren Sie den Patientenfall strukturiert einem Kollegen. Verwenden Sie Fachsprache und Redewendungen.';
      case 'brief':   return 'Verfassen Sie einen vollständigen Arztbrief mit allen erforderlichen Abschnitten.';
      default: return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Teil 1: Arzt-Patienten-Gespräch
  // ---------------------------------------------------------------------------

  function _renderPatient(scenario) {
    _stopTimer();
    warningShown = false;
    timerRemaining = 20 * 60;

    const med = data.medical || {};
    const anamnese = (med.anamnese && med.anamnese.sections) || [];
    const redewendungen = (med.redewendungen && med.redewendungen.anamnese) || [];

    container.innerHTML = `
      <div class="fsp-exercise">
        <div class="fsp-exercise__header">
          ${simActive ? '<span class="badge badge--accent">Teil 1 von 3 — Simulation</span>' : ''}
          <h2>Arzt-Patienten-Gespräch
            ${_bookmarkBtnHtml('patient-' + (scenario.id || 'fallback'), 'Arzt-Patienten-Gespräch: ' + (scenario.title || scenario.diagnosis), (scenario.patientName || scenario.patient.name) + ' — ' + (scenario.chiefComplaint || scenario.complaint))}
          </h2>
          <div class="fsp-timer" id="fsp-timer">
            <span class="fsp-timer__icon" aria-hidden="true">&#9202;</span>
            <span class="fsp-timer__value" id="fsp-timer-value">20:00</span>
          </div>
        </div>

        <div class="fsp-patient-info">
          <h3>Patientendaten</h3>
          <div class="fsp-patient-info__grid">
            <div class="fsp-patient-info__item"><strong>Name:</strong> ${escapeHtml(scenario.patientName || scenario.patient.name)}</div>
            <div class="fsp-patient-info__item"><strong>Alter:</strong> ${escapeHtml(String(scenario.patient.age))} Jahre</div>
            <div class="fsp-patient-info__item"><strong>Geschlecht:</strong> ${escapeHtml(scenario.patient.gender)}</div>
          </div>
          <div class="fsp-patient-info__complaint">
            <strong>Vorstellungsgrund:</strong> ${escapeHtml(scenario.chiefComplaint || scenario.complaint)}
          </div>
        </div>

        <div class="fsp-columns">
          <div class="fsp-column fsp-column--main">
            <div class="fsp-checklist">
              <h3>Anamnese-Checkliste</h3>
              <p class="text-muted">Haken Sie jeden Bereich ab, den Sie im Gespräch abgedeckt haben.</p>
              ${anamnese.map((section, i) => `
                <div class="fsp-checklist__section" data-section-index="${i}">
                  <div class="fsp-checklist__header">
                    <label class="fsp-checklist__label">
                      <input type="checkbox" class="fsp-checklist__checkbox" data-anamnese-check="${i}">
                      <span>${escapeHtml(section.title)}</span>
                    </label>
                    <button class="btn btn--sm btn--outline fsp-checklist__toggle" data-toggle-phrases="${i}" aria-expanded="false" aria-label="Beispielphrasen anzeigen">
                      <span aria-hidden="true">&#9660;</span>
                    </button>
                  </div>
                  <div class="fsp-checklist__phrases" id="fsp-phrases-${i}" hidden>
                    <ul>
                      ${section.phrases.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
                    </ul>
                  </div>
                </div>`).join('')}
            </div>

            <div class="fsp-notes">
              <h3>Anamnese-Zusammenfassung</h3>
              <textarea class="textarea fsp-textarea" id="fsp-patient-notes" rows="8" placeholder="Fassen Sie hier Ihre Anamnese zusammen..."></textarea>
            </div>

            <div id="fsp-recording-controls"></div>
          </div>

          <div class="fsp-column fsp-column--side">
            <div class="fsp-reference">
              <h3>Redewendungen — Anamnese</h3>
              <ul class="fsp-reference__list">
                ${redewendungen.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>

        <div class="fsp-exercise__actions">
          <button class="btn btn--accent btn--lg" data-fsp-action="finish-part">Teil abschließen</button>
          ${!simActive ? '<a href="#fsp" class="btn btn--outline" data-fsp-action="back-overview">Zurück zur Übersicht</a>' : ''}
        </div>
      </div>`;

    // Wire up phrase toggles
    container.querySelectorAll('[data-toggle-phrases]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.getAttribute('data-toggle-phrases');
        const panel = container.querySelector('#fsp-phrases-' + idx);
        if (panel) {
          const isHidden = panel.hidden;
          panel.hidden = !isHidden;
          btn.setAttribute('aria-expanded', String(isHidden));
        }
      });
    });

    _startTimer();
    _renderRecordingControls();
    _attachBookmarkHandlers();
  }

  function _collectPatientResults() {
    const checkboxes = container.querySelectorAll('[data-anamnese-check]');
    let checked = 0;
    let total = checkboxes.length;
    checkboxes.forEach(cb => { if (cb.checked) checked++; });

    const notes = (container.querySelector('#fsp-patient-notes') || {}).value || '';
    const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;

    return {
      checked,
      total,
      percentage,
      notesLength: notes.trim().length,
    };
  }

  // ---------------------------------------------------------------------------
  // Teil 2: Arzt-Arzt-Gespräch
  // ---------------------------------------------------------------------------

  function _renderArzt(scenario) {
    _stopTimer();
    warningShown = false;
    timerRemaining = 20 * 60;

    const med = data.medical || {};
    const redewendungenBefund = (med.redewendungen && med.redewendungen.befund) || [];
    const redewendungenTherapie = (med.redewendungen && med.redewendungen.therapie) || [];

    const vs = scenario.vitalSigns || {};
    const vitalsHtml = Object.entries(vs).map(([key, val]) =>
      `<div class="fsp-vitals__item"><strong>${escapeHtml(_formatVitalLabel(key))}:</strong> ${escapeHtml(val)}</div>`
    ).join('');

    container.innerHTML = `
      <div class="fsp-exercise">
        <div class="fsp-exercise__header">
          ${simActive ? '<span class="badge badge--accent">Teil 2 von 3 — Simulation</span>' : ''}
          <h2>Arzt-Arzt-Gespräch
            ${_bookmarkBtnHtml('arzt-' + (scenario.id || 'fallback'), 'Arzt-Arzt-Gespräch: ' + (scenario.title || scenario.diagnosis), (scenario.patientName || scenario.patient.name) + ' — ' + scenario.diagnosis)}
          </h2>
          <div class="fsp-timer" id="fsp-timer">
            <span class="fsp-timer__icon" aria-hidden="true">&#9202;</span>
            <span class="fsp-timer__value" id="fsp-timer-value">20:00</span>
          </div>
        </div>

        <div class="fsp-patient-info fsp-patient-info--full">
          <h3>Vollständige Patientendaten</h3>
          <div class="fsp-patient-info__grid">
            <div class="fsp-patient-info__item"><strong>Name:</strong> ${escapeHtml(scenario.patientName || scenario.patient.name)}</div>
            <div class="fsp-patient-info__item"><strong>Alter:</strong> ${escapeHtml(String(scenario.patient.age))} Jahre</div>
            <div class="fsp-patient-info__item"><strong>Geschlecht:</strong> ${escapeHtml(scenario.patient.gender)}</div>
          </div>
          <div class="fsp-patient-info__detail">
            <strong>Vorstellungsgrund:</strong> ${escapeHtml(scenario.chiefComplaint || scenario.complaint)}
          </div>
          <div class="fsp-patient-info__detail">
            <strong>Anamnese:</strong> ${escapeHtml(scenario.history)}
          </div>
          <div class="fsp-patient-info__vitals">
            <strong>Vitalzeichen:</strong>
            <div class="fsp-vitals__grid">${vitalsHtml}</div>
          </div>
          <div class="fsp-patient-info__detail">
            <strong>Diagnose:</strong> ${escapeHtml(scenario.diagnosis)}
          </div>
          <div class="fsp-patient-info__detail">
            <strong>Therapie:</strong> ${escapeHtml(scenario.treatment)}
          </div>
        </div>

        <div class="fsp-columns">
          <div class="fsp-column fsp-column--main">
            <div class="fsp-checklist">
              <h3>Fallvorstellung-Checkliste</h3>
              <p class="text-muted">Bewerten Sie sich selbst für jeden Abschnitt Ihrer Fallvorstellung (1 = unzureichend, 5 = sehr gut).</p>
              ${ARZT_CHECKLIST.map((item, i) => `
                <div class="fsp-checklist__section fsp-checklist__section--rating">
                  <div class="fsp-checklist__header">
                    <span class="fsp-checklist__item-label">${escapeHtml(item)}</span>
                  </div>
                  <div class="fsp-rating" data-arzt-rating="${i}">
                    ${[1,2,3,4,5].map(n => `
                      <label class="fsp-rating__option">
                        <input type="radio" name="arzt_rating_${i}" value="${n}" class="radio-input">
                        <span class="fsp-rating__label">${n}</span>
                      </label>`).join('')}
                  </div>
                </div>`).join('')}
            </div>

            <div class="fsp-notes">
              <h3>Notizen zur Fallvorstellung</h3>
              <textarea class="textarea fsp-textarea" id="fsp-arzt-notes" rows="8" placeholder="Skizzieren Sie hier Ihre Fallvorstellung..."></textarea>
            </div>

            <div id="fsp-recording-controls"></div>
          </div>

          <div class="fsp-column fsp-column--side">
            <div class="fsp-reference">
              <h3>Redewendungen — Befund</h3>
              <ul class="fsp-reference__list">
                ${redewendungenBefund.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
              </ul>
            </div>
            <div class="fsp-reference">
              <h3>Redewendungen — Therapie</h3>
              <ul class="fsp-reference__list">
                ${redewendungenTherapie.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>

        <div class="fsp-exercise__actions">
          <button class="btn btn--accent btn--lg" data-fsp-action="finish-part">Teil abschließen</button>
          ${!simActive ? '<a href="#fsp" class="btn btn--outline" data-fsp-action="back-overview">Zurück zur Übersicht</a>' : ''}
        </div>
      </div>`;

    _startTimer();
    _renderRecordingControls();
    _attachBookmarkHandlers();
  }

  function _collectArztResults() {
    let totalRating = 0;
    let ratedCount = 0;
    const ratings = [];

    ARZT_CHECKLIST.forEach((_, i) => {
      const checked = container.querySelector(`input[name="arzt_rating_${i}"]:checked`);
      const val = checked ? parseInt(checked.value, 10) : 0;
      ratings.push(val);
      if (val > 0) {
        totalRating += val;
        ratedCount++;
      }
    });

    const avg = ratedCount > 0 ? totalRating / ratedCount : 0;
    const percentage = Math.round((avg / 5) * 100);
    const notes = (container.querySelector('#fsp-arzt-notes') || {}).value || '';

    return {
      ratings,
      averageRating: Math.round(avg * 10) / 10,
      percentage,
      ratedCount,
      total: ARZT_CHECKLIST.length,
      notesLength: notes.trim().length,
    };
  }

  // ---------------------------------------------------------------------------
  // Teil 3: Arztbrief
  // ---------------------------------------------------------------------------

  function _renderBrief(scenario) {
    _stopTimer();
    warningShown = false;
    timerRemaining = 20 * 60;

    const med = data.medical || {};
    const arztbrief = med.arztbrief || {};
    const templates = arztbrief.templates || [];
    const phrases = arztbrief.phrases || {};

    const vs = scenario.vitalSigns || {};
    const vitalsHtml = Object.entries(vs).map(([key, val]) =>
      `<div class="fsp-vitals__item"><strong>${escapeHtml(_formatVitalLabel(key))}:</strong> ${escapeHtml(val)}</div>`
    ).join('');

    const phraseSections = [
      { key: 'opening',   label: 'Einleitung' },
      { key: 'diagnoses', label: 'Diagnosen' },
      { key: 'history',   label: 'Anamnese' },
      { key: 'findings',  label: 'Befund' },
      { key: 'therapy',   label: 'Therapie' },
      { key: 'followup',  label: 'Procedere' },
      { key: 'closing',   label: 'Abschluss' },
    ];

    container.innerHTML = `
      <div class="fsp-exercise">
        <div class="fsp-exercise__header">
          ${simActive ? '<span class="badge badge--accent">Teil 3 von 3 — Simulation</span>' : ''}
          <h2>Arztbrief
            ${_bookmarkBtnHtml('brief-' + (scenario.id || 'fallback'), 'Arztbrief: ' + (scenario.title || scenario.diagnosis), (scenario.patientName || scenario.patient.name) + ' — ' + scenario.diagnosis)}
          </h2>
          <div class="fsp-timer" id="fsp-timer">
            <span class="fsp-timer__icon" aria-hidden="true">&#9202;</span>
            <span class="fsp-timer__value" id="fsp-timer-value">20:00</span>
          </div>
        </div>

        <div class="fsp-patient-info fsp-patient-info--full">
          <h3>Patientendaten</h3>
          <div class="fsp-patient-info__grid">
            <div class="fsp-patient-info__item"><strong>Name:</strong> ${escapeHtml(scenario.patientName || scenario.patient.name)}</div>
            <div class="fsp-patient-info__item"><strong>Alter:</strong> ${escapeHtml(String(scenario.patient.age))} Jahre</div>
            <div class="fsp-patient-info__item"><strong>Geschlecht:</strong> ${escapeHtml(scenario.patient.gender)}</div>
          </div>
          <div class="fsp-patient-info__detail">
            <strong>Vorstellungsgrund:</strong> ${escapeHtml(scenario.chiefComplaint || scenario.complaint)}
          </div>
          <div class="fsp-patient-info__detail">
            <strong>Anamnese:</strong> ${escapeHtml(scenario.history)}
          </div>
          <div class="fsp-patient-info__vitals">
            <strong>Vitalzeichen:</strong>
            <div class="fsp-vitals__grid">${vitalsHtml}</div>
          </div>
          <div class="fsp-patient-info__detail">
            <strong>Diagnose:</strong> ${escapeHtml(scenario.diagnosis)}
          </div>
          <div class="fsp-patient-info__detail">
            <strong>Therapie:</strong> ${escapeHtml(scenario.treatment)}
          </div>
        </div>

        <div class="fsp-columns">
          <div class="fsp-column fsp-column--main">
            <div class="fsp-brief-editor">
              <h3>Arztbrief verfassen</h3>

              <div class="fsp-brief-sections" id="fsp-brief-indicators">
                ${BRIEF_SECTIONS.map(sec => `
                  <span class="fsp-brief-sections__indicator" data-brief-section="${sec}" title="Abschnitt: ${escapeHtml(sec)}">
                    ${escapeHtml(sec)}
                  </span>`).join('')}
              </div>

              <textarea class="textarea fsp-textarea fsp-textarea--large" id="fsp-brief-text" rows="18" placeholder="Sehr geehrte Frau Kollegin, sehr geehrter Herr Kollege,\n\nwir berichten über..."></textarea>

              <div class="fsp-brief-meta">
                <span class="fsp-brief-meta__count" id="fsp-brief-word-count">0 Wörter</span>
                <span class="fsp-brief-meta__hint">Empfehlung: mindestens 150 Wörter</span>
              </div>
            </div>

            ${templates.length > 0 ? `
              <div class="fsp-templates">
                <h3>Beispiel-Arztbriefe</h3>
                ${templates.map((tpl, i) => `
                  <details class="fsp-templates__item">
                    <summary>${escapeHtml(tpl.title)}</summary>
                    <pre class="fsp-templates__text">${escapeHtml(tpl.example)}</pre>
                  </details>`).join('')}
              </div>` : ''}
          </div>

          <div class="fsp-column fsp-column--side">
            <div class="fsp-reference">
              <h3>Formulierungshilfen</h3>
              ${phraseSections.map(sec => {
                const items = phrases[sec.key] || [];
                if (items.length === 0) return '';
                return `
                  <div class="fsp-reference__group">
                    <h4>${escapeHtml(sec.label)}</h4>
                    <ul class="fsp-reference__list">
                      ${items.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
                    </ul>
                  </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <div class="fsp-exercise__actions">
          <button class="btn btn--accent btn--lg" data-fsp-action="finish-part">Teil abschließen</button>
          ${!simActive ? '<a href="#fsp" class="btn btn--outline" data-fsp-action="back-overview">Zurück zur Übersicht</a>' : ''}
        </div>
      </div>`;

    // Wire up word counter and section detection
    const textarea = container.querySelector('#fsp-brief-text');
    if (textarea) {
      textarea.addEventListener('input', () => {
        _updateBriefWordCount(textarea);
        _updateBriefSectionIndicators(textarea);
      });
    }

    _startTimer();
    _attachBookmarkHandlers();
  }

  function _updateBriefWordCount(textarea) {
    const text = textarea.value.trim();
    const count = text.length > 0 ? text.split(/\s+/).filter(w => w.length > 0).length : 0;
    const el = container.querySelector('#fsp-brief-word-count');
    if (el) {
      el.textContent = count + ' ' + (count === 1 ? 'Wort' : 'Wörter');
      el.classList.toggle('text-success', count >= 150);
      el.classList.toggle('text-warning', count > 0 && count < 150);
    }
  }

  function _updateBriefSectionIndicators(textarea) {
    const text = textarea.value.toLowerCase();
    const indicators = container.querySelectorAll('[data-brief-section]');

    const sectionPatterns = {
      'Anrede':    /sehr geehrte|kollegin|kollege|berichten über/,
      'Diagnosen': /diagnose|hauptdiagnose|nebendiagnose/,
      'Anamnese':  /anamnese|anamnes|stellte sich vor|berichtet über/,
      'Befund':    /befund|untersuchung|laborchemisch|auskultatorisch|bildgebend|röntgen|ekg|ultraschall/,
      'Therapie':  /therapie|behandlung|medikament|verschrieb|verabreich/,
      'Procedere': /procedere|empfehlung|wiedervorstellung|kontrolle|entlass|nachsorge/,
    };

    indicators.forEach(ind => {
      const section = ind.getAttribute('data-brief-section');
      const pattern = sectionPatterns[section];
      const active = pattern ? pattern.test(text) : false;
      ind.classList.toggle('fsp-brief-sections__indicator--active', active);
    });
  }

  function _collectBriefResults() {
    const textarea = container.querySelector('#fsp-brief-text');
    const text = textarea ? textarea.value.trim() : '';
    const wordCount = text.length > 0 ? text.split(/\s+/).filter(w => w.length > 0).length : 0;

    // Count detected sections
    const textLower = text.toLowerCase();
    const sectionPatterns = {
      'Anrede':    /sehr geehrte|kollegin|kollege|berichten über/,
      'Diagnosen': /diagnose|hauptdiagnose|nebendiagnose/,
      'Anamnese':  /anamnese|anamnes|stellte sich vor|berichtet über/,
      'Befund':    /befund|untersuchung|laborchemisch|auskultatorisch|bildgebend|röntgen|ekg|ultraschall/,
      'Therapie':  /therapie|behandlung|medikament|verschrieb|verabreich/,
      'Procedere': /procedere|empfehlung|wiedervorstellung|kontrolle|entlass|nachsorge/,
    };

    let sectionsDetected = 0;
    const sectionResults = {};
    BRIEF_SECTIONS.forEach(sec => {
      const pattern = sectionPatterns[sec];
      const found = pattern ? pattern.test(textLower) : false;
      sectionResults[sec] = found;
      if (found) sectionsDetected++;
    });

    // Score: 60% section coverage + 40% word count (up to 200 words)
    const sectionScore = BRIEF_SECTIONS.length > 0
      ? (sectionsDetected / BRIEF_SECTIONS.length) * 60
      : 0;
    const wordScore = Math.min(wordCount / 200, 1) * 40;
    const percentage = Math.round(sectionScore + wordScore);

    return {
      wordCount,
      sectionsDetected,
      totalSections: BRIEF_SECTIONS.length,
      sectionResults,
      percentage,
      text,
    };
  }

  // ---------------------------------------------------------------------------
  // Full Simulation
  // ---------------------------------------------------------------------------

  function _startSimulation() {
    simActive = true;
    simPartIndex = -1;
    simScenario = _pickScenario();
    simResults = {};

    _advanceSimPart();
  }

  function _advanceSimPart() {
    _stopTimer();
    warningShown = false;
    simPartIndex++;

    if (simPartIndex >= PARTS.length) {
      _finishSimulation();
      return;
    }

    const part = PARTS[simPartIndex];
    switch (part.key) {
      case 'patient': _renderPatient(simScenario); break;
      case 'arzt':    _renderArzt(simScenario);    break;
      case 'brief':   _renderBrief(simScenario);   break;
    }
  }

  function _onFinishPart() {
    if (simActive) {
      // Collect results for current part
      const part = PARTS[simPartIndex];
      if (part) {
        switch (part.key) {
          case 'patient': simResults.patient = _collectPatientResults(); break;
          case 'arzt':    simResults.arzt    = _collectArztResults();    break;
          case 'brief':   simResults.brief   = _collectBriefResults();   break;
        }
      }
      _advanceSimPart();
    } else {
      // Standalone mode — show individual results
      _showStandaloneResults();
    }
  }

  function _showStandaloneResults() {
    _stopTimer();

    // Determine which part we are in from the hash
    const hash = (window.location.hash || '').replace(/^#\/?/, '');
    const segments = hash.split('/').filter(Boolean);
    const subRoute = segments[1] || '';

    let result;
    let partLabel;
    switch (subRoute) {
      case 'patient':
        result = _collectPatientResults();
        partLabel = 'Arzt-Patienten-Gespräch';
        break;
      case 'arzt':
        result = _collectArztResults();
        partLabel = 'Arzt-Arzt-Gespräch';
        break;
      case 'brief':
        result = _collectBriefResults();
        partLabel = 'Arztbrief';
        break;
      default:
        window.location.hash = '#fsp';
        return;
    }

    const pct = result.percentage;
    const passed = pct >= 60;

    container.innerHTML = `
      <div class="fsp-results">
        <div class="fsp-results__header ${passed ? 'fsp-results__header--passed' : 'fsp-results__header--failed'}">
          <h2>${escapeHtml(partLabel)} — Ergebnis</h2>
          <div class="fsp-results__score">${pct}%</div>
          <p>${passed
            ? 'Gute Leistung! Sie haben die wesentlichen Anforderungen erfüllt.'
            : 'Hier besteht noch Übungsbedarf. Wiederholen Sie diesen Teil und achten Sie auf die Vollständigkeit.'}</p>
        </div>

        ${_renderPartDetail(subRoute, result)}

        <div class="fsp-results__actions">
          <a href="#fsp/${escapeHtml(subRoute)}" class="btn btn--accent">Erneut üben</a>
          <a href="#fsp" class="btn btn--outline">Zurück zur Übersicht</a>
        </div>
      </div>`;

    // Save standalone practice
    App.recordPractice();
  }

  function _finishSimulation() {
    _stopTimer();
    simActive = false;

    // Ensure all parts have results
    PARTS.forEach(part => {
      if (!simResults[part.key]) {
        simResults[part.key] = { percentage: 0 };
      }
    });

    const partPercentages = PARTS.map(p => (simResults[p.key] || {}).percentage || 0);
    const totalPercentage = Math.round(
      partPercentages.reduce((sum, p) => sum + p, 0) / PARTS.length
    );

    // Render aggregate results
    _renderSimulationResults(totalPercentage);

    // Save to storage
    _saveSimulationResults(totalPercentage);
  }

  function _renderSimulationResults(totalPercentage) {
    const passed = totalPercentage >= 60;

    container.innerHTML = `
      <div class="fsp-results">
        <div class="fsp-results__header ${passed ? 'fsp-results__header--passed' : 'fsp-results__header--failed'}">
          <h2>${passed ? 'Herzlichen Glückwunsch!' : 'Simulation abgeschlossen'}</h2>
          <p class="fsp-results__verdict">${passed
            ? 'Sie haben die Fachsprachprüfung-Simulation erfolgreich absolviert. Ihre Vorbereitung zeigt Wirkung.'
            : 'Die Simulation ist beendet. Einige Bereiche erfordern noch gezielte Übung.'}</p>
          <div class="fsp-results__total">
            <span class="fsp-results__percentage">${totalPercentage}%</span>
            <span class="fsp-results__label">Gesamtergebnis</span>
          </div>
        </div>

        <div class="fsp-results__parts">
          <h3>Ergebnisse nach Prüfungsteil</h3>
          <div class="fsp-results__grid">
            ${PARTS.map(part => {
              const r = simResults[part.key] || {};
              const pct = r.percentage || 0;
              const partPassed = pct >= 60;
              return `
                <div class="fsp-result-card ${partPassed ? 'fsp-result-card--passed' : 'fsp-result-card--failed'}">
                  <div class="fsp-result-card__header">
                    <span class="fsp-result-card__icon" aria-hidden="true">${part.icon}</span>
                    <h4>${escapeHtml(part.label)}</h4>
                  </div>
                  <div class="fsp-result-card__score">${pct}%</div>
                  <div class="fsp-result-card__status">${partPassed ? 'Bestanden' : 'Nicht bestanden'}</div>
                  <div class="progress-bar">
                    <div class="progress-bar__fill ${partPassed ? 'progress-bar__fill--success' : 'progress-bar__fill--danger'}" style="width: ${pct}%"></div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>

        <div class="fsp-results__detail">
          <h3>Detaillierte Auswertung</h3>

          ${_renderPartDetail('patient', simResults.patient || {})}
          ${_renderPartDetail('arzt', simResults.arzt || {})}
          ${_renderPartDetail('brief', simResults.brief || {})}
        </div>

        <div class="fsp-results__scenario">
          <h3>Verwendetes Szenario</h3>
          <p><strong>${escapeHtml(simScenario.title)}</strong> — ${escapeHtml(simScenario.patientName || simScenario.patient.name)}, ${escapeHtml(String(simScenario.patient.age))} Jahre</p>
          <p><strong>Diagnose:</strong> ${escapeHtml(simScenario.diagnosis)}</p>
        </div>

        <div class="fsp-results__actions">
          <a href="#fsp/simulation" class="btn btn--accent">Neue Simulation</a>
          <a href="#fsp" class="btn btn--outline">Zurück zur Übersicht</a>
        </div>
      </div>`;
  }

  function _renderPartDetail(partKey, result) {
    if (!result || result.percentage === undefined) return '';

    switch (partKey) {
      case 'patient':
        return `
          <div class="fsp-detail-section">
            <h4>Arzt-Patienten-Gespräch</h4>
            <p>Anamnese-Checkliste: <strong>${result.checked || 0}</strong> von <strong>${result.total || 0}</strong> Bereichen abgedeckt (${result.percentage}%)</p>
            ${result.notesLength > 0
              ? `<p>Zusammenfassung: ${result.notesLength} Zeichen verfasst</p>`
              : '<p class="text-warning">Keine Zusammenfassung verfasst</p>'}
          </div>`;

      case 'arzt':
        return `
          <div class="fsp-detail-section">
            <h4>Arzt-Arzt-Gespräch</h4>
            <p>Selbstbewertung: Durchschnitt <strong>${result.averageRating || 0}</strong> von 5,0 (${result.percentage}%)</p>
            <p>Bewertete Abschnitte: <strong>${result.ratedCount || 0}</strong> von <strong>${result.total || 0}</strong></p>
            ${result.ratings && result.ratings.length > 0
              ? `<div class="fsp-detail-ratings">
                  ${ARZT_CHECKLIST.map((item, i) => {
                    const val = result.ratings[i] || 0;
                    return `<span class="fsp-detail-ratings__item ${val === 0 ? 'fsp-detail-ratings__item--empty' : ''}">${escapeHtml(item)}: ${val > 0 ? val + '/5' : '—'}</span>`;
                  }).join('')}
                </div>`
              : ''}
          </div>`;

      case 'brief':
        return `
          <div class="fsp-detail-section">
            <h4>Arztbrief</h4>
            <p>Wortanzahl: <strong>${result.wordCount || 0}</strong> ${(result.wordCount || 0) >= 150 ? '' : '<span class="text-warning">(unter 150 Wörter)</span>'}</p>
            <p>Erkannte Abschnitte: <strong>${result.sectionsDetected || 0}</strong> von <strong>${result.totalSections || 0}</strong></p>
            ${result.sectionResults
              ? `<div class="fsp-detail-sections">
                  ${BRIEF_SECTIONS.map(sec => {
                    const found = result.sectionResults[sec];
                    return `<span class="fsp-detail-sections__item ${found ? 'fsp-detail-sections__item--found' : 'fsp-detail-sections__item--missing'}">${escapeHtml(sec)} ${found ? '&#10003;' : '&#10007;'}</span>`;
                  }).join('')}
                </div>`
              : ''}
          </div>`;

      default:
        return '';
    }
  }

  // ---------------------------------------------------------------------------
  // Save results
  // ---------------------------------------------------------------------------

  function _saveSimulationResults(totalPercentage) {
    const result = {
      timestamp: new Date().toISOString(),
      totalPercentage,
      scenario: simScenario ? simScenario.id : null,
      parts: {},
    };

    PARTS.forEach(part => {
      result.parts[part.key] = simResults[part.key] || { percentage: 0 };
      // Remove the full text from storage to save space
      if (result.parts[part.key].text) {
        result.parts[part.key].textLength = result.parts[part.key].text.length;
        delete result.parts[part.key].text;
      }
    });

    const history = Storage.get('fsp_results', []);
    history.push(result);
    // Keep only last 20 results
    if (history.length > 20) history.splice(0, history.length - 20);
    Storage.set('fsp_results', history);

    // Update module progress
    const bestScore = Math.max(
      totalPercentage,
      (Storage.getProgress('fsp') || {}).score || 0
    );
    Storage.saveProgress('fsp', {
      completed: history.length,
      total: history.length,
      score: bestScore,
    });

    App.recordPractice();
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
        showToast('Achtung: Noch fünf Minuten in diesem Prüfungsteil!', 'warning', 5000);
      }

      // 1 minute warning
      if (timerRemaining === 60 && warningShown) {
        showToast('Noch eine Minute!', 'warning', 3000);
      }

      // Time up
      if (timerRemaining <= 0) {
        _stopTimer();
        showToast('Die Zeit für diesen Teil ist abgelaufen.', 'warning', 4000);
        setTimeout(() => _onFinishPart(), 1500);
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
    const display = document.getElementById('fsp-timer-value');
    if (display) {
      const m = Math.floor(Math.max(timerRemaining, 0) / 60);
      const s = Math.max(timerRemaining, 0) % 60;
      display.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

      // Add urgency class when under 5 minutes
      const timerEl = document.getElementById('fsp-timer');
      if (timerEl) {
        timerEl.classList.toggle('fsp-timer--urgent', timerRemaining <= 300 && timerRemaining > 0);
        timerEl.classList.toggle('fsp-timer--critical', timerRemaining <= 60 && timerRemaining > 0);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Bookmark helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the HTML for a bookmark toggle button.
   * @param {string} id - unique bookmark identifier
   * @param {string} label - short label for the bookmark
   * @param {string} detail - extra context stored with the bookmark
   * @returns {string} HTML string
   */
  function _bookmarkBtnHtml(id, label, detail) {
    const isMarked = Storage.isBookmarked('fsp', id);
    return `<button class="bookmark-btn${isMarked ? ' bookmark-btn--active' : ''}"
                    data-bookmark-fsp="${escapeHtml(id)}"
                    data-bookmark-label="${escapeHtml(label)}"
                    data-bookmark-detail="${escapeHtml(detail)}"
                    aria-label="Lesezeichen setzen"
                    title="Lesezeichen">${isMarked ? '\u2605' : '\u2606'}</button>`;
  }

  /**
   * Attach click handlers to all bookmark buttons currently in the DOM.
   */
  function _attachBookmarkHandlers() {
    container.querySelectorAll('[data-bookmark-fsp]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-bookmark-fsp');
        const label = btn.getAttribute('data-bookmark-label');
        const detail = btn.getAttribute('data-bookmark-detail');
        const added = Storage.toggleBookmark({
          module: 'fsp',
          id,
          label,
          detail,
        });
        btn.textContent = added ? '\u2605' : '\u2606';
        btn.classList.toggle('bookmark-btn--active', added);
        showToast(added ? 'Lesezeichen gesetzt' : 'Lesezeichen entfernt', added ? 'success' : 'info', 1500);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function _pickScenario() {
    const scenarios = (data.medical && data.medical.scenarios) || [];
    if (scenarios.length === 0) {
      return {
        id: 'fallback',
        title: 'Beispielszenario',
        patient: { name: 'Herr Beispiel', age: 50, gender: 'männlich' },
        patientName: 'Herr Beispiel',
        chiefComplaint: 'Bauchschmerzen seit gestern',
        complaint: 'Bauchschmerzen seit gestern',
        history: 'Keine detaillierte Anamnese verfügbar.',
        vitalSigns: {},
        diagnosis: 'Keine Diagnose verfügbar',
        treatment: 'Keine Therapieempfehlung verfügbar',
      };
    }
    return pickRandom(scenarios, 1)[0];
  }

  function _formatVitalLabel(key) {
    const labels = {
      temperatur: 'Temperatur',
      blutdruck: 'Blutdruck',
      puls: 'Puls',
      atemfrequenz: 'Atemfrequenz',
      SpO2: 'SpO2',
    };
    return labels[key] || key;
  }

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
  // Voice Recording
  // ---------------------------------------------------------------------------

  function _getCurrentPartKey() {
    if (simActive && simPartIndex >= 0 && simPartIndex < PARTS.length) {
      return PARTS[simPartIndex].key;
    }
    const hash = (window.location.hash || '').replace(/^#\/?/, '');
    const segments = hash.split('/').filter(Boolean);
    return segments[1] || '';
  }

  function _startRecording() {
    if (!navigator.mediaDevices) {
      showToast('Mikrofon nicht verfügbar', 'warning');
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        _mediaRecorder = new MediaRecorder(stream);
        _audioChunks = [];
        _mediaRecorder.ondataavailable = e => _audioChunks.push(e.data);
        _mediaRecorder.onstop = () => {
          const blob = new Blob(_audioChunks, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          const partKey = _getCurrentPartKey();
          _recordings.push({ partKey, blob, url, timestamp: Date.now() });
          _renderRecordingControls();
          // Stop all tracks to release microphone
          stream.getTracks().forEach(t => t.stop());
        };
        _mediaRecorder.start();
        _isRecording = true;
        _renderRecordingControls();
      })
      .catch(err => {
        console.warn('Microphone error:', err);
        showToast('Mikrofon-Zugriff verweigert', 'error');
      });
  }

  function _stopRecording() {
    if (_mediaRecorder && _mediaRecorder.state === 'recording') {
      _mediaRecorder.stop();
      _isRecording = false;
    }
  }

  function _renderRecordingControls() {
    const controls = document.getElementById('fsp-recording-controls');
    if (!controls) return;

    const currentPartKey = _getCurrentPartKey();
    const partRecordings = _recordings.filter(r => r.partKey === currentPartKey);

    controls.innerHTML =
      '<div class="fsp-recording">' +
        (_isRecording
          ? '<button class="btn btn--danger fsp-recording__btn" id="fsp-stop-rec">' +
              '&#9209; Aufnahme stoppen</button>' +
            '<span class="fsp-recording__indicator">' +
              '&#9679; Aufnahme läuft\u2026</span>'
          : '<button class="btn btn--accent fsp-recording__btn" id="fsp-start-rec">' +
              '&#127908; Aufnahme starten</button>') +
        (partRecordings.length > 0
          ? '<div class="fsp-recording__list">' +
            '<h4>Aufnahmen</h4>' +
            partRecordings.map((r, i) =>
              '<div class="fsp-recording__item">' +
                '<span>Aufnahme ' + (i + 1) + '</span>' +
                '<audio controls src="' + r.url + '"></audio>' +
              '</div>'
            ).join('') +
            '</div>'
          : '') +
      '</div>';

    // Bind handlers
    const startBtn = document.getElementById('fsp-start-rec');
    const stopBtn = document.getElementById('fsp-stop-rec');
    if (startBtn) startBtn.addEventListener('click', _startRecording);
    if (stopBtn) stopBtn.addEventListener('click', _stopRecording);
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

App.registerModule('fsp', FspModule);
