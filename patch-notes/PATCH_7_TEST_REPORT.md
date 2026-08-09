# Patch 7 — test report

The final Patch 7 build was tested after the MAIN-convoy level-of-detail extension, not only the earlier ambient-traffic implementation.

## Patch 7 acceptance results

- 58 runtime JavaScript files passed `node --check`.
- `index.html` references 58 JavaScript files and all 58 paths exist.
- A Solomon patrol generated 9 ambient traffic groups; all 9 began abstract and added 0 ambient full-AI hulls at spawn.
- The MAIN convoy initially existed as normal contacts for compatibility, then at 88.77 nm abstracted after the traffic tick. `mainContacts` became 0 while the primary mission stayed `ACTIVE` and `primaryConvoyExists()` remained true.
- Moving the submarine to that abstract MAIN group rematerialized all 6 MAIN contacts with exactly the same IDs; the mission remained `ACTIVE`.
- A far abstract traffic group at about 89.87 nm moved about 79.60 m during a 20-second abstract update while creating 0 real contacts.
- A small ambient convoy materialized into normal ship contacts when the submarine entered its tactical radius and dematerialized again when moved well clear with no observations; no orphan contact tracks remained.
- With an artificially huge activation radius, no more than 3 ambient groups entered full tactical simulation.
- Across 60 deterministic Java-Sea test patrols, the generated set covered lone freighter, coastal merchant, small tanker, fishing craft, patrol craft, small convoy and occasional task-group traffic. Friendly traffic also appeared in the tested population.
- Routine ULTRA selected an actual ambient traffic group (`T01`) in the controlled test, while forced anti-frustration intel selected `MAIN` and remained mission-critical.
- A two-hour traffic run remained within the ambient tactical-group cap.
- Sinking a neutral fishing sampan changed enemy tonnage by exactly 0 and applied a -1000 score penalty.
- A materialized patrol craft entered the ordinary visual-contact system and only then exposed its ENEMY affiliation.
- Source inspection confirmed no new render loop, WebGL, OffscreenCanvas or new canvas creation in the traffic director.

## Full regression

After the final Patch 7 code, all existing contracts were rerun and passed:

- Phase 0 baseline
- Phase 1 vessel collision
- Phase 2 Truk optional raid / fog of war
- Phase 3 subsystem damage
- Phase 4 career history
- Patch 1 ASW Brain
- Patch 2 Surface Watch
- Patch 3 SOUND / radar
- Patch 4 weather gameplay
- visual refinement
- MAP-track stability
- Patch 5 ship subsystem damage
- Patch 6 mission framework
- pre-Patch-7 MAP / ownship / dive refinement
- torpedo playability / FIRE refinement
- Patch 7 Pacific traffic

The raw Patch 7 output is in `PATCH_7_TEST_OUTPUT.txt`; the complete regression output is in `PATCH_7_FULL_TEST_OUTPUT.txt`.

## Patch overlay verification

A clean copy of the latest pre-Patch-7 baseline was made, then only the delivered Patch 7 ZIP contents were overlaid, exactly as a user update would be applied. All 16 delivered runtime files matched the tested build SHA-256 hashes (`0` mismatches), all 58 script references existed, and the complete regression suite above passed again on that overlay.
