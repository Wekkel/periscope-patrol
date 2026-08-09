# Patch 10.5 Test Report

Final tested build: Patch 10 plus Patch 10.5 runtime overlay.

## New integration/pacing contract

`tests/patch10_5-integration-pacing.cjs` passed all checks:

- campaign lifecycle advances patrols exactly 1 -> 2 -> 3;
- each new patrol starts at elapsed time 0 and time scale 1;
- transit/stop/AAR-pause and stale tactical state are cleared;
- career timestamp equals the actual Patch 9 refit/start date;
- new AAR timeline starts at T+0 and save/load preserves new patrol identity;
- Lifeguard strike waits for station arrival and then 3–8 minutes;
- HVI retains at least 3000 seconds (50 min) tactical margin after estimated physical intercept;
- Convoy Interdiction can succeed after meaningful neutralization while surviving ships still float;
- ambient patrol craft alerts and prosecutes as a real ASW combatant;
- stale distant ambient traffic returns to ABSTRACT state while its player track remains;
- newest 10 career AARs remain full, older replay geometry is compacted.

Concrete contract values from the final run include:

- patrol sequence/history: 1 -> 2 -> 3, completed history [1, 2];
- patrol 2 start: 1943-09-02 06:00, T+0, 1x;
- Lifeguard arrival: t=1800 s; strike: t=2067.232 s; wait 267.232 s;
- HVI minimum tactical margin over tested seeds: 3000 s;
- Convoy neutralization test: 2 ships / 13,000 tons neutralized against 2 ships / 9,450 tons required, with 4 ships still afloat;
- stale traffic: full contact removed, knowledge track retained, group ABSTRACT;
- 12-patrol storage test: oldest 2 compact, newest 10 full; old route 120 samples versus newest 600.

## Full regression

20/20 test files completed successfully, with zero FAIL/Error tokens in the captured run:

- Phase 0–4
- Patch 1–10
- MAP track stability
- visual polish
- pre-Patch-7 track/ownship/dive refinement
- torpedo playability refinement
- Patch 10.5 integration/pacing

Runtime verification:

- 63 runtime JavaScript files syntax PASS;
- 63/63 `index.html` script references resolve;
- Patch 10.5 adds no new runtime path.

See `PATCH_10_5_FULL_TEST_OUTPUT.txt` for the complete captured regression output.

## Final ZIP overlay verification

The final runtime payload was applied as an overlay to a clean Patch 10 baseline before release:

- runtime manifest/hash mismatches: 0;
- runtime JavaScript: 63/63 syntax PASS;
- `index.html` script references: 63/63 present;
- test files executed on overlay: 20/20;
- FAIL/Error tokens in captured overlay run: 0;
- 20/20 contract/refinement completion lines: PASS.

See `PATCH_10_5_OVERLAY_TEST_OUTPUT.txt` for the captured overlay run.
