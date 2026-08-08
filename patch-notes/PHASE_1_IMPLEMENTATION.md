# Phase 1 — Real vessel collision

Baseline: Phase 0 + automatic crew actions. This patch changes collision/navigation only; the known Phase-0 Truk intel disclosure, aggregate damage-control model and limited career persistence remain unchanged.

## Architecture

Two new runtime modules are added:

- `js/simulation/collision/hull-geometry.js` — shared oriented hull geometry. Exposes `shipHull`, `subHull`, `movingHullIntersection` and `closestApproach`, plus the segment/rectangle helper now used by the deck gun.
- `js/simulation/collision/vessel-collision.js` — navigation avoidance, vertical sub/ship clearance, physical collision resolution, impact damage and compressed-time CPA watch.

The simulation inheritance chain becomes `SimEngineASW -> SimEngineCollision -> SimEngine`. No circular dependency is introduced.

## Behaviour

- Merchants and escorts use a short 75-second CPA look-ahead. If physical clearance becomes too small, moving vessels make a modest starboard avoidance correction and return to their pre-avoidance navigation order after the conflict clears.
- Collision damage requires actual oriented-hull overlap or a swept hull crossing during the timestep. A mere range threshold is no longer sufficient.
- The submarine has a physical 311.75 ft x 27.3 ft horizontal hull and an 18 ft vertical envelope. Surface-ship drafts are type-aware. A sufficiently deep submarine therefore passes below a ship without collision.
- Impact damage is based on relative velocity normal to the struck hull, impact angle and an approximate mass/tonnage factor. Glancing low-speed contact is minor; a destroyer hitting broadside at high speed can be catastrophic.
- The old escort rule `range < 0.12 nm => random 32–62 damage` is removed. An attacking escort still steers at a surfaced submarine, but ramming damage is generated only by the general physical collision system.
- Transit/skip now reports `COLLISION RISK · CPA ...` through the existing transit interrupt contract. Manual 8x/16x/32x also drops back to 1x before a predicted collision.
- Collision events are retained in `state.world.collisionEvents` and `state.world.lastCollision`; old saves that lack these fields are migrated lazily by the simulation.

## Deliberately not changed

- Truk map/intel disclosure.
- Aggregate damage-control state.
- Career persistence schema.
- ASW search/attack intelligence beyond replacing the old non-physical ram damage trigger.
- Existing deck-gun hit dimensions: the old XY rectangle was generalized, not retuned.
