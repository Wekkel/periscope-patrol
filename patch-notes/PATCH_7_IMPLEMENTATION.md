# Patch 7 — The Pacific is populated

Patch 7 adds a lightweight traffic director above the existing world simulation. The design goal is a busier patrol area without paying full ship-AI cost for traffic tens of nautical miles away.

## Traffic level of detail

Distant shipping exists as compact abstract groups. An abstract group stores only route position/direction, lane offset, course, speed, type/affiliation and a few bookkeeping scalars. Abstract traffic advances once every 10 simulated seconds.

Ambient groups enter the normal tactical world only inside approximately 23 nm. Once materialized they are ordinary `world.contacts` and therefore use the existing vessel physics, visual/SOUND/radar sensing, collision, weather, ship-damage and rendering systems. Healthy, unobserved ambient groups beyond approximately 34 nm may fold back to an abstract track.

At most three ambient traffic groups may be in full tactical simulation at once. The mission-critical MAIN convoy is managed separately: it can also be abstracted when safely far away and unobserved, then rematerialized with the same ship IDs as the player approaches. Its abstraction does not complete or otherwise alter the primary mission.

## Traffic population

The deterministic area traffic mix can include:

- lone freighters;
- coastal merchants;
- small tankers;
- fishing sampans/junks (neutral);
- patrol craft;
- small convoys;
- occasional naval task groups;
- occasional friendly coastal traffic where generated.

Population density varies modestly by patrol area. Task groups and friendly traffic are not guaranteed on every patrol.

## Knowledge and affiliation

Abstract world truth is not drawn directly on the tactical map. A group must first materialize and then be discovered through the normal sensor/visual systems.

Affiliation is learned by a sufficiently good visual observation. Until then the map does not leak `FRIENDLY`, `NEUTRAL` or `ENEMY` from the underlying contact object.

Patrol craft and warships use the existing escort-like lightweight visual geometry; fishing sampans use a small vector model.

## ULTRA / radio intelligence

Routine `ENEMY SHIPPING REPORTED` messages may now refer to actual ambient enemy traffic rather than automatically describing the mission convoy. The report contains an estimated position/course for the selected traffic group and explicitly does not turn that report into guaranteed primary-target knowledge.

The existing anti-frustration forced/amplifying report remains mission-directed and favors the MAIN convoy. This preserves its purpose: helping a player who has gone too long without finding the primary target rather than diverting them to incidental shipping.

## Combat and scoring safeguards

Attacking incidental traffic does not telepathically alert escorts in a distant MAIN convoy. Escort-alert cues are now local to nearby real escort contacts.

Neutral/friendly losses do not increase enemy tonnage or career ship totals. They instead carry score penalties. Career sunk/damaged lists continue to represent enemy results only.

The MAIN convoy's damaged-ship guard logic is restricted to MAIN convoy casualties, so its escorts do not detach to protect an unrelated ambient vessel.

## Mission compatibility

Patch 6 mission state remains authoritative. `CONVOY_INTERDICTION` now understands that the MAIN convoy may temporarily exist as an abstract mission-critical group and therefore does not falsely complete when no MAIN hulls are currently materialized.

High Value Intercept modifications are made before the MAIN group is adopted by the traffic director, so the high-value target data survives abstraction/rematerialization.

## Performance budget

The new director adds no WebGL, OffscreenCanvas, additional canvas, requestAnimationFrame loop or particle engine. Abstract traffic is scalar route data updated once per 10 simulated seconds. Ambient full-detail groups are hard-capped at three; the primary convoy is materialized separately only when tactically relevant (or when its state requires full simulation).
