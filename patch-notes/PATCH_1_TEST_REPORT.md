# Patch 1 — ASW Brain test report

## Regression contract

All runtime JavaScript files passed syntax checking: **50/50**.
All 50 script paths referenced by `index.html` exist.

The complete earlier regression contracts were re-run on the final Patch 1 code:
- Phase 0: PASS
- Phase 1 vessel collision: PASS
- Phase 2 Truk optional raid/fog of war: PASS
- Phase 3 subsystem damage: PASS
- Phase 4 career history: PASS

## Patch 1 acceptance evidence

### Escort strength
Deterministic spawn checks produced:
- Java Sea, 1942, EASY, 2 merchants: **1 escort**
- Solomon Sea, 1943, 4 merchants: **2 escorts**
- Luzon Strait, 1943, 4 merchants: **3 escorts**
- Truk Approaches, 1944, HARD, 4 merchants: **4 escorts**

### Convoy-relative screen
A four-escort Truk screen used:
- FORWARD_SCREEN
- PORT_FLANK
- STARBOARD_FLANK
- ROAMING_SCOUT

After six simulated minutes with the convoy moving, maximum screen-station error was approximately **0.0844 nm**, with **0 physical collision events**.

### Cooperative contact doctrine
A four-escort contact produced distinct tactical roles in the test:
- E-01 CONTAINMENT
- E-02 CONVOY_GUARD
- E-03 PROSECUTOR
- E-04 SWEEP

Their desired headings were distinct; they did not all charge the same point.

### Anticipation without omniscience
With a noisy enemy estimate at `(8,8)` nm, the prosecutor aimed at a predicted point about **0.456 nm** ahead of the raw datum.

The same enemy plot was then tested twice while the hidden real submarine position was moved from `(-30,40)` to `(80,-90)` nm. Escort desired headings were bit-for-bit identical in both runs:
`264.427431261, 87.736660360, 256.089211446, 262.905844571`.

This demonstrates that tactical helm orders are derived from the enemy estimate rather than hidden truth.

### Sonar cadence and information hierarchy
Measured ping intervals:
- search solution: **10.682 s**
- firm ranging solution: **3.651 s**

A routine search ping generated audio/state evidence but **0 patrol-log entries**.
A firm reacquisition generated the critical event:
`ESCORT HAS CONTACT — Escort Destroyer has a firm sonar solution.`

### Lost contact and reacquisition
After losing contact, search radius expanded from **0.55 nm to 1.36 nm** in the test. The datum was dead-reckoned about **0.1667 nm** along the estimated escape course for the supplied 120-second interval at 5 kn.

A reacquired active-sonar fix shifted the shared datum to the new measured position and promoted the detecting escort to PROSECUTOR.

### Depth charges
Calling the attack routine on a non-prosecutor produced **0 charges**.
Calling it on the prosecutor produced exactly **7 charges**, all owned by that escort, with the critical event:
`DEPTH CHARGES — Escort Destroyer rolling 7, set for 164 ft.`

### Existing collision behaviour
The Phase 1 normal-convoy regression remained clean: **0 phantom collisions**, minimum centre separation approximately **1.442 nm**.

## Browser note
No real Chromium/browser smoke test is claimed for this patch. The results above are from the actual Node/VM syntax, state, simulation, persistence and UI-policy regression harnesses.
