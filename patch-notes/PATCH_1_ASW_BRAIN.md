# Patch 1 — ASW Brain

This patch is based on the Phase 4 build and changes escort behaviour without adding later Patch 2–10 features.

## Scope

- Convoys now receive 1–4 escorts using patrol area, patrol date/year, convoy size and scenario difficulty.
- Escorts have convoy-relative screen stations: forward screen, port flank, starboard flank, rear guard and roaming scout.
- The screen rotates and moves with the convoy instead of using fixed world positions.
- On a submarine cue, escorts receive cooperative ASW roles: PROSECUTOR, CONTAINMENT, SWEEP and CONVOY_GUARD.
- Only the PROSECUTOR closes the current datum and may roll a depth-charge pattern.
- CONTAINMENT and SWEEP work around the datum; CONVOY_GUARD stays with the merchants.
- Lost contact expands and dead-reckons the search area. A reacquired firm contact shifts the datum and may reassign the prosecutor.
- Active sonar now has per-escort search/ranging ping cycles. A better solution gives a faster cadence.
- Routine pings remain audio/state events and do not generate toast/log interruptions.
- Major events such as ESCORT HAS CONTACT and DEPTH CHARGES remain critical player-facing events.

## Information boundary

Escort tactical steering uses only the shared noisy enemy contact solution/datum. The hidden true submarine position is not used to choose screen/search/prosecution helm orders. True position remains available only where the simulation must resolve physical sensor probability, weapon explosions and actual hit effects.

## Files

New runtime module:
- `js/simulation/ai/asw-brain.js`

Modified runtime files:
- `index.html`
- `PWA_CACHE_FILES.txt`
- `js/core/game-loop.js`
- `js/simulation/engine-core.js`
- `js/simulation/ai/enemy-ai.js`
- `js/simulation/ai/escort-asw.js`
- `js/simulation/sensors.js`
- `js/ui/scenario-selector.js`
- `js/ui/toast.js`
