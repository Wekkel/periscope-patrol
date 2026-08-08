# Phase 1 test report

All tests were run against the Phase-1 tree after the implementation.

## Phase 0 regression contract

`tests/phase0-regression.cjs`: PASS.

- 47 runtime JavaScript files parsed cleanly with `node --check`.
- Patrol start: Truk Approaches, ownship at 10/30 nm, 10 contacts in that run.
- New-patrol MAP recenter: renderer followed ownship at 10/30 nm.
- MAP render route: PASS.
- Periscope command/render route: PASS, bearing 090°.
- Time compression: 8x command path PASS.
- Manual save/load: heading 137° restored in Truk Approaches.
- Torpedo flood/fire: tube 1 became EMPTY and active torpedoes increased by one.
- Deck gun: auto-manned, fired, ammo 120 -> 119, one shell created, renderer route PASS.
- The three Phase-0 known limitations remain deliberately unchanged and are still detected by the baseline tests.

## Phase 1 acceptance tests

`tests/phase1-collision.cjs`: PASS.

1. Legacy escort ram trigger removed
   - `rng < 0.12` proximity ram trigger: absent.
   - random 32–62 damage expression: absent.

2. Deck-gun hull geometry generalized without changing existing XY hit behaviour
   - 500 deterministic randomized old-vs-new rectangle/segment cases checked.
   - mismatches: 0.
   - `SimEngine.segmentShipGunHit()` and the shared hull helper returned the same intersection in the direct delegation test.

3. Large-timestep swept intersection
   - A fast-moving submarine hull travelled from x=-0.5 nm to x=+0.5 nm through a stationary ship in one timestep.
   - swept intersection detected at normalized timestep t=0.4599456263.

4. Merchant collision avoidance
   - Two 10 kn merchants started head-on with true CPA ~0 and CPA time 72 s.
   - initial avoidance orders: 101° and 281° (11° starboard corrections).
   - minimum centre separation during 100 s simulation: 0.072469 nm.
   - physical collision events: 0.
   - after the conflict cleared, desired/actual courses returned to 090° / 270° rather than accumulating avoidance turns.

5. Vertical submarine clearance
   - Deep submarine at 150 ft crossing a stationary merchant hull: 0 collision events, hull remained 100%.
   - Same horizontal crossing surfaced at 6 kn: 1 physical collision event, 14.1033% hull damage, hull 85.8967%.
   - UI state contained the collision toast: `COLLISION — M-SURF: 6.0 kn relative, 90° impact, 14% hull damage.`

6. Speed and impact-angle damage scaling
   - 2 kn square escort contact: 2.1632% damage.
   - 2.0003 kn / ~9.99° glancing scrape: 0.4701% damage.
   - 23 kn square destroyer/escort side impact: 80.2481% damage.

7. Compressed-time CPA watch
   - Engine transit interrupt returned: `COLLISION RISK · CPA 0.00 NM · M-CPA in 86 s`.
   - Manual 32x watch immediately returned the simulation to 1x and queued a visible warning.
   - The actual existing `GameLoop` transit path was exercised: `transitUntil` became 0 and the stop reason was `COLLISION RISK · CPA 0.00 NM · M-LOOP in 70 s` before contact.

8. No phantom collisions in normal convoy formation
   - 600 seconds of navigation-only convoy simulation.
   - physical collision events: 0.
   - minimum centre separation in the final recorded run: 1.441914 nm.

## Test scope / limitation

These are executable Node/VM runtime tests of state, simulation, renderer routing, toast/UI state and the real `GameLoop` transit contract. A full graphical Chromium/device automation run was not completed in this environment; therefore no claim is made here about device-specific pointer/layout behaviour beyond the unchanged Phase-0 renderer-routing checks.
