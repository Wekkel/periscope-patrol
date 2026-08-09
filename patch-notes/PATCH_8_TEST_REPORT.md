# Patch 8 test report

Final build: 60 runtime JavaScript files; 60/60 script references from `index.html` exist.

Patch 8 acceptance test passed. In the controlled knowledge-vs-truth case the player plot for one merchant was `(3.5, -1.6)` while the real ship was at `(4.0, -2.0)`; both datasets were preserved independently. The replay recorded FIRST_SIGHTING, CONVOY_SIGHTED, TORPEDO_ATTACK, DEPTH_CHARGE_ATTACK, DAMAGE, AIRCRAFT_ATTACK and AIRCRAFT_EVADED events. A real torpedo launch produced a replay torpedo with start point, end point and HIT result. An attacking aircraft that left alive incremented `aircraftEvaded` to 1.

`completeMission()` persisted the replay in the immutable career record and invoked the AAR controller with `completed:true`. Mutating the active recorder after finalization did not alter stored history.

All earlier contracts were rerun on the final Patch 8 build and passed: Phase 0–4, Patch 1–7, visual refinement, MAP track stability, pre-Patch-7 ownship/dive refinement and torpedo playability refinement.

A Chromium headless smoke attempt was made but timed out in this container with D-Bus/environment errors and produced no DOM. It is therefore not counted as a successful browser smoke test.

Deployment verification also passed: applying only the delivered Patch 8 files over a clean Patch 7 build produced `overlay_runtime_hash_mismatches []`, followed by the complete regression suite passing again.
