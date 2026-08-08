# Periscope Patrol — modular refactor

Source of truth for this refactor: `index(9).html`, SHA-256 `486c9632303bd4506a0adee03f731fb2ff8bdde116790acebccb33bf8bc7ec50`.

This package is an architecture-only refactor. No Phase 0–4 or Patch 1–10 gameplay plans were intentionally implemented. The HTML shell, CSS rules, state/save format and original JavaScript method bodies were preserved as closely as possible while moving code into domain-oriented files.

## Run/deploy

Deploy `index.html`, `css/` and `js/` at the same relative location on GitHub Pages. Keep the project's current `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png` and `apple-touch-icon.png` alongside them; those files were referenced by the supplied source but were not supplied in this task, so this package does not fabricate replacements.

Because the app shell is now multi-file, the existing service worker's cache/app-shell list must include the paths in `PWA_CACHE_FILES.txt`. Update that list in the real current `sw.js` and bump its existing `VERSION` according to the project's own version policy. The supplied `index.html` itself states that the authoritative version number lives in `sw.js`; changing that unseen file here would have violated the source-of-truth constraint.

See `ARCHITECTURE.md` for the dependency structure and `TEST_REPORT.md` for the exact tests and limitations.
