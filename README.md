# Periscope Patrol — USS Silversides

Periscope Patrol is an offline-capable browser/PWA submarine game built around a US fleet submarine in the Pacific War. The current codebase is the live modular game, not merely the old architecture refactor: navigation, sensors, missions, enemy ASW, aircraft, weather, damage, ports, career history and the 3-D optical stations are all active gameplay systems.

Current release: **v0.8.7** (version source of truth: `sw.js`).

## What is in the game

The player can move between six stations without loading a new page:

- **TAC** — boat state, fire-control context and tactical information.
- **BRG** — full-screen surface bridge watch with continuous 360° look, binocular zoom, visual marking/target designation, projected ownship deck, fittings and deck gun.
- **SND** — passive hydrophone station with a trainable bearing, bearing marks and active QC echo ranging; the same station can show the fitted SJ surface-search radar page.
- **SCOPE** — periscope observation, visual target acquisition and TDC hand-off.
- **MAP** — navigation chart with bathymetry, terrain, ports, plotted courses, contacts, mission overlays and tactical tracks.
- **GUN** — manually laid 3-inch deck-gun view with ballistic flight, splashes and damage.

The simulation also includes torpedo tube handling and historical torpedo availability, automatic AA defence, aircraft search/attack behaviour, escort ASW, sonar/depth charges, weather and sea state, day/night lighting, harbor defences, collision/grounding, submarine subsystem damage and damage control, radio/intelligence, traffic generation, an after-action report and persistent career/patrol history.

## Missions and friendly ports

A patrol has one primary mission. The framework currently supports:

1. Convoy interdiction
2. High-value intercept
3. Reconnaissance
4. Lifeguard duty
5. Special transport / coastwatchers
6. Minelaying

Historical scenarios can also pin their own date, area and mission setup.

Friendly ports/RVs have two distinct uses:

- During an active patrol, hold inside the green 0.30 nm service ring while surfaced and at 3 kn or less for a short rearm/refuel/repair service.
- Once the primary mission is complete and the campaign status is **RETURN TO BASE**, hold the same safe rendezvous for the final transfer. Completion checks the **Return to friendly port** objective and closes the patrol.

For convoy interdiction, the visible **Neutralize a meaningful share of enemy shipping** objective now uses the same ship/tonnage threshold as primary mission success. The mission status panel shows progress against both thresholds, so a single hit can no longer make the objective appear complete while the campaign is still internally on PATROL.

## Sound room controls

The SND station is deliberately skipper-level rather than a separate sonar minigame.

- **◀ Train / Train ▶** — rotate the hydrophone listening bearing in 5° steps. Sweep through a bearing and watch/listen for the signal to build and centre.
- **✚ Mark Bearing** — record the current passive bearing when the screws are sharp enough. Repeated marks made after ownship has changed position can triangulate and improve the chart plot.
- **◉ Echo Range** — transmit an active QC pulse. A useful echo can give a very good range at short distance, but the transmission also gives nearby enemy escorts an acoustic datum. It has a short recharge time.
- **⌁ SJ Radar** — switch the SND display from passive sound to the SJ surface-search radar page when SJ is fitted for that patrol date. The button changes to **Passive Sound** while the radar page is open.

Passive listening quality is strongly affected by ownship noise. Slowing or stopping the shafts improves listening. An ALL STOP order issued while the simulation is paused now immediately clears the stale stored RPM/speed state, preventing the sound room from remaining stuck at the previous 13+ kn screw-noise warning while the boat is visibly stationary.

## Rendering and low-end-device performance

The game uses the existing Canvas2D renderer; there is no WebGL dependency. Low-memory/low-core devices are detected and receive a reduced 3-D effects budget and a capped backing-store DPR.

For very wide MAP zoom, bathymetry is now rasterised once from the existing depth grid and reused as a single chart layer while individual depth cells are visually tiny; low-spec devices switch to that path somewhat earlier. At closer zoom the original vector bathymetry, contours and soundings are used. Coast/island geometry also uses sub-pixel level-of-detail thinning at extreme wide zoom on every device, with a slightly broader lean range on low-spec hardware; full source geometry returns automatically as the player zooms in. This specifically reduces repeated Canvas2D work without removing visible chart information.

The ownship surface wake is speed-dependent: a narrow propeller wash appears first, the disturbed-water strip lengthens and widens with speed, broken shoulder foam develops at higher speed, and subtle divergent Kelvin-wave arms appear when conditions and rendering quality permit.

## Project layout

The GitHub Pages root is the directory containing `index.html`:

```text
index.html
sw.js
manifest.webmanifest
css/
  app.css
js/
  audio/
  bootstrap/
  controllers/
  core/
  data/
  navigation/
  persistence/
  pwa/
  rendering/
  simulation/
  tutorial/
  ui/
tests/
patch-notes/
icons...
```

`ARCHITECTURE.md` describes the script dependency order and module responsibilities in more detail. The game intentionally keeps classic ordered `<script>` loading rather than converting the codebase to ES modules, so deployment remains a static-file upload.

## Deploying through the GitHub website

Upload the contents of this project root to the GitHub Pages repository while preserving the relative folder structure. You do not need a local Git installation or a build step.

For every release that changes runtime files:

1. Change the single `VERSION` value near the top of `sw.js`.
2. Ensure new runtime files are present in the `SHELL` list in `sw.js`.
3. Upload the changed files with their existing relative paths.
4. Open the deployed PWA online. The service worker will detect the new cache version; installed PWAs can then activate the update through the app's normal update/reload flow.

The service worker is cache-first so the game remains playable offline. A newly installed worker intentionally does not call `skipWaiting()` automatically while a patrol is running.

## Tests

The repository contains Node-based regression/contract tests in `tests/`. They cover the major simulation phases and later patches: collisions, harbor intelligence, sound/radar, surface watch, weather, damage, missions, traffic, historical campaign progression, battle atmosphere, stores/ports, map behaviour, aircraft ordnance, playtest hardening, career history and visual refinements.

No server-side component is required to run the game itself.
