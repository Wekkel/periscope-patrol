# Patch 9 test report

All existing contracts plus the new Patch 9 contract were run on the final build.

Key Patch 9 acceptance results:

- 61 runtime JavaScript files pass Node syntax check; all 61 `index.html` script paths exist.
- Early / mid / late profiles resolve as intended.
- 15 Jun 1942: SD fitted, SJ not fitted, Mark 18 unavailable.
- 15 Aug 1943: SJ fitted at 6.8 nm campaign range, Mark 18 still unavailable.
- 15 Sep 1943: Mark 18 becomes available under the broad gameplay cut-over.
- Late-war SJ: 8.5 nm campaign range. A 520-yard tanker at 7.5 nm is outside the tested mid-war SJ envelope but inside late-war SJ.
- Reduced-mode Mark 14 dud chance: 10.0% in the early-war profile vs 2.6% in the late-war profile.
- Four-merchant Solomon escort count: 1 in 1942 vs 3 in 1944.
- Same-area air-threat baseline in integration test: 0.396 early vs 0.704 late.
- Solomon ambient traffic: 11 groups early vs 7 late in the deterministic integration run.
- Average generated primary merchant tonnage in that run: 4,830 tons early vs 5,985 tons late.
- Crossing Aug→Sep 1943 generated `REFIT COMPLETE — Mark 18 electric torpedoes now available.`
- Crossing Dec 1943→Jan 1944 generated improved-SJ and LATE WAR calendar messages.
- A pre-Patch-9 state without historical fields migrates on `update(0)` without crash.
- Career records persist the date-specific historical profile/equipment.
- Historical module contains no XP/skill-tree logic, RAF loop, WebGL or OffscreenCanvas.

Full regression result:

- Phase 0: PASS
- Phase 1 collision: PASS
- Phase 2 Truk: PASS
- Phase 3 subsystem damage: PASS
- Phase 4 career: PASS
- Patch 1 ASW Brain: PASS
- Patch 2 Surface Watch: PASS
- Patch 3 SOUND/Radar: PASS
- Patch 4 Weather: PASS
- Patch 5 Ship Damage: PASS
- Patch 6 Mission Framework: PASS
- Patch 7 Pacific Traffic: PASS
- Patch 8 After Action Report: PASS
- Patch 9 Historical Campaign: PASS
- MAP Track Stability: PASS
- Visual Polish: PASS
- Pre-Patch-7 Track/Ownship/Dive refinement: PASS
- Torpedo Playability refinement: PASS
