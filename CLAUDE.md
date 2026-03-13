# B1/B2 Goethe Trainer

## Architecture
- **Pure static site** — vanilla HTML/CSS/JS, no build step, no frameworks
- **Hosted on GitHub Pages** with PWA offline support (service worker)
- Single-page app with hash-based routing (`#vocabulary`, `#grammar/articles`, etc.)

## File Structure
```
index.html          — SPA shell (navbar, sidebar, page sections)
css/style.css       — All styles (~2600 lines, CSS custom properties)
js/utils.js         — Shared utilities (TTS, storage, modals, toasts)
js/app.js           — Main controller (routing, data loading, dashboard)
js/vocabulary.js    — Flashcards, fill-in-blank, article quiz
js/grammar.js       — Cases, conjugation, tenses, sentence structure
js/reading.js       — Leseverstehen (5 Goethe B1/B2 exam parts)
js/listening.js     — Hörverstehen, Diktat, medical conversations
js/writing.js       — Email, Meinungsäußerung, Arztbrief
js/exam.js          — Full timed mock exam simulation
sw.js               — Service worker for offline caching
manifest.json       — PWA manifest
data/*.json         — All exercise data (nouns, verbs, grammar, reading, medical)
```

## Module Pattern
Each module registers via `App.registerModule(name, { init, render, destroy })`.
- `init(container, data)` — called once on first activation
- `render(container, subRoute)` — called on every navigation
- `destroy()` — cleanup event listeners when navigating away

## Data
- 6 JSON files loaded via `Promise.allSettled` (graceful fallback)
- `nouns.json` — 1478 B1/B2 nouns with declension tables
- `verbs.json` — 443 verbs with conjugation (6 pronouns incl. wir)
- `other.json` — 884 other words (adverbs, adjectives, etc.)
- `grammar.json` — 161 exercises across 8 topics
- `reading.json` — 12 passages covering all 5 Goethe Lesen parts
- `medical.json` — Fachsprachprüfung content (body, symptoms, scenarios)

## Key Conventions
- All German text must use proper umlauts (ä, ö, ü, ß) — never digraphs
- UI text should be in eloquent, polished German
- BEM-like CSS naming (block__element--modifier)
- localStorage for progress tracking; no server calls
- Service worker cache list in `sw.js` must be updated when adding new files

## Deployment
```bash
git add -A && git commit -m "message"
git push origin main
# GitHub Pages serves from main branch root
```
To update the cached version for offline users, bump `CACHE_VERSION` in `sw.js`.
