# Refactor verification report

## Source and structural checks

- Source analyzed: supplied `index(9).html` only (11,116 lines; one large inline stylesheet and one large inline JavaScript block).
- Generated references audited: 45 JavaScript files and 1 CSS file; every generated path referenced by `index.html` exists.
- No main inline `<script>` remains in the generated index and no inline `<style>` remains.
- `node --check`: PASS for all 45 generated JavaScript files.
- `node --check`: PASS for the original extracted inline JavaScript.
- CSS source comparison: PASS; the original stylesheet content and `css/app.css` are byte-equivalent modulo surrounding tag/newline extraction.
- SaveSystem object comparison: PASS; original and modular SaveSystem source are byte-equivalent (the new file only adds its section-heading comment outside the object).

Machine-readable details: `path-audit.json`, `refactor-manifest.json`, `equivalence-results.json`.

## Browser runtime smoke tests actually executed

Browser engine: headless Chromium through Playwright.

Viewports tested for both the original source and the modular refactor:

- Desktop: 1280 × 800.
- Mobile portrait: 390 × 844.
- Mobile landscape: 844 × 390.

All six runs completed without uncaught page errors or browser-console warnings/errors in the harness.

Feature paths exercised and compared original ↔ modular:

- Initial game boot/state.
- Start new patrol (`Java Sea`) and objective/contact generation.
- TAC rendering.
- MAP station selection/rendering.
- Periscope station selection/rendering.
- Helm orders: heading, RPM, depth.
- Time compression: 8×.
- Manual save and load.
- Torpedo tube flood → READY → fire → active torpedo.
- AA gun manning.
- 3D deck gun: man gun, enter `DECK_GUN`, alter train/elevation and fire one shell; ammunition decreased by one.

The complete data from this smoke pass is in `test-results.json`.

## Function and rendering equivalence checks

A second deterministic Chromium comparison was run with animation scheduling frozen and RNG seeded so canvas frames could be compared exactly.

- 83 discovered original top-level declarations were reachable in both builds with equal `typeof` inventories.
- Runtime DOM IDs: 276 original vs 276 modular; exact match.
- `SimEngine`: 95 callable methods in both builds; method-name sets match and every `Function.prototype.toString()` method body matches.
- `CanvasView`: 69 callable methods in both builds; method-name sets match and every method body matches.
- Deterministic canvas PNG SHA-256 hashes are identical original ↔ modular for TAC, MAP, PERISCOPE and DECK_GUN.
- No uncaught page errors or console warnings/errors in either deterministic run.

Machine-readable results: `equivalence-results.json`.

## Save backward-compatibility checks

A current-format save was created by the original monolithic build in Chromium, copied as raw localStorage JSON into the modular build, and loaded there. The modular build retained the chosen patrol area (`Truk Approaches`), ordered heading (217°), ordered RPM (175), deck-gun state and harbor initialization.

A legacy-field migration smoke test also removed the newer `weapons.deckGun` and `world.harborInitialized` fields before invoking the existing world-extension migration. Both were recreated successfully. See `save-compatibility-results.json`.

## Important PWA/network limitation

The supplied source references `manifest.webmanifest`, `sw.js` and three icon assets, but those files were not part of the supplied source. They were therefore neither changed nor fabricated. The generated multi-file app shell requires the current real service worker to cache the new file paths listed in `PWA_CACHE_FILES.txt`.

The execution environment blocked direct `file://`/localhost browser navigation. Runtime equivalence was therefore tested in actual Chromium by loading the page in a controlled browser document and preserving each generated JavaScript file as its own classic script boundary. This validates JavaScript/DOM/canvas behavior and load order, but it does not validate the unseen service worker, real HTTP caching headers, installability, or offline reload. Those require the project's actual current `sw.js`, manifest and icons (or a deployed GitHub Pages build).
