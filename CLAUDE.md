# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Goethe B1/B2 exam trainer — a pure static SPA (vanilla HTML/CSS/JS, no build step, no frameworks). Hosted on GitHub Pages with PWA offline support via service worker. Also covers Fachsprachprüfung Medizin (FSP) content.

## Development

No build, no tests, no linter. Open `index.html` in a browser or use any static server:

```bash
python3 -m http.server 8000   # then visit localhost:8000
```

**Deployment:** push to `main` — GitHub Pages serves from the root. Bump `CACHE_VERSION` in `sw.js` when changing any cached asset. The `ASSETS_TO_CACHE` array in `sw.js` must list every file the app needs offline.

## Architecture

### Routing
Hash-based SPA routing (`#vocabulary`, `#grammar/articles`, `#drill/10`). `App._parseHash()` splits the hash into `{ module, subRoute }`. Each page has a `<section id="page-{module}">` in `index.html`; routing shows/hides them.

### Module Lifecycle
Modules are singleton objects that register via `App.registerModule(name, moduleObj)` at the bottom of their file. The App controller manages their lifecycle:

1. **`init(container, data)`** — called once on first activation. `container` is `#${name}-content`, `data` is `App.data` (all loaded JSON).
2. **`render(subRoute)`** — called on every navigation to this module.
3. **`destroy()`** — called when navigating away (cleanup listeners, timers).

### Data Loading
Six JSON files loaded in parallel via `Promise.allSettled` at startup (graceful per-file fallback). After loading, `App.data.vocabulary` is built by concatenating nouns + verbs + other. Modules receive `App.data` on init.

**Data files and shapes:**
- `nouns.json` — `[{ word, article, noun, plural, translation, declension: {nom/gen/dat/akk: {singular, plural}}, examples, sentence }]`
- `verbs.json` — `[{ word, translation, conjugation: {ich, du, er, wir, ihr, Sie} }]`
- `other.json` — `[{ word, translation, type, examples }]`
- `grammar.json` — `[{ id, topic, subtopic, type, difficulty, sentence, answer, options, explanation, hint, sentence_en }]`
- `reading.json` — 12 passages covering all 5 Goethe Lesen parts
- `medical.json` — FSP content (body systems, symptoms, clinical scenarios)

### Timed Drill System
Built directly into `app.js` (not a separate module). Routes: `#drill/5`, `#drill/10`, `#drill/15`, `#drill/25`. Pulls random exercises from vocabulary + grammar data, runs a countdown timer, tracks score. Has its own `_startDrill()`/`_endDrill()`/`_destroyDrill()` lifecycle separate from registered modules.

### Persistence
`Storage` object in `utils.js` wraps localStorage with prefix `b1trainer_`. Provides:
- Module progress (`Storage.getProgress/saveProgress`)
- Weak words tracking (`Storage.addWeakWord/getWeakWords`)
- Missed items tracker with priority sorting (`Storage.recordMiss/getMissedItems`)
- SRS (SM-2 algorithm): intervals 1→3→7→14→30→60 days, items auto-removed when mastered (`Storage.srsRecordMiss/srsRecordCorrect/getDueItems`)
- Bookmarks (`Storage.toggleBookmark/getBookmarks`)

### Shared Utilities (`utils.js`)
- `speak(text, lang)` — Web Speech API TTS, auto-selects best German voice
- `showToast(message, type, duration)` — auto-dismissing notifications
- `showModal(title, content, onClose)` — modal dialogs, returns `{ close }`
- `shuffleArray`, `pickRandom`, `escapeHtml`, `createElement`

## Key Conventions

- All German text must use proper umlauts (ä, ö, ü, ß) — never digraphs (ae, oe, ue, ss)
- UI text should be in eloquent, polished German
- BEM-like CSS naming: `block__element--modifier`
- No server calls — everything runs client-side
- Each module file is self-contained: state, rendering, event handling, then `App.registerModule()` at the end
