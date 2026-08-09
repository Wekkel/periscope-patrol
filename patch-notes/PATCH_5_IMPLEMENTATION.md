# Patch 5 — Ships don't have hit points

Patch 5 replaces the old surface-ship kill threshold with a compact casualty model. A living ship is described by four primary subsystem states only:

- FLOTATION
- PROPULSION
- STEERING
- FIRE

`c.sunk` remains a terminal state. The legacy `gunDamage` field is retained only for compatibility with pre-Patch-5 saves/tests and as non-authoritative hit evidence; it is not consulted as a sink/kill threshold.

## Damage profiles

Torpedo impacts use the actual hull hit fraction and torpedo warhead to choose and scale a profile:

- ENGINE ROOM: severe propulsion casualty, fire/smoke, moderate flooding.
- BOW: flooding and persistent down-by-bow trim, followed by gradual loss of speed.
- STERN: steering/rudder casualty, persistent bias/jam and course deviation.
- MIDSHIPS: strongest flotation/structural damage and a deterministic chance of rapid foundering after a heavy square hit.

Damage is deterministic for the same ship/hit identity. It does not reroll casualties every frame.

Deck-gun hits feed the same subsystem model. They can progressively cripple, burn, abandon or eventually sink a ship; a hidden cumulative gun-hit threshold is no longer the kill mechanism.

## Consequences

Subsystem state controls real navigation:

- propulsion/flotation/fire cap available speed;
- steering damage limits turn authority and can create persistent rudder bias/jam;
- flooding progresses after impact and then slows as compartments are contained;
- fire can spread into propulsion/flotation damage;
- severe casualties can schedule abandonment or foundering;
- score/tonnage are awarded only when the ship actually begins sinking, not when the weapon hits.

Convoy navigation now excludes crippled stragglers from the healthy convoy frame. The healthy convoy continues at its normal pace. With at least two escorts, one escort can receive `DAMAGED_GUARD` and remain with the casualty while the rest of the screen continues convoy/ASW duties.

## Player knowledge and visuals

A damaged ship does not expose its internal subsystem values magically. A visual observation can add an estimate such as `DAMAGED`, `CRIPPLED`, `BURNING`, `DEAD IN WATER`, `FOUNDERING` or `ABANDONED` to the contact track. MAP can display that observed condition.

The shared ship 3D renderer uses the same state for trim/list, fire and black casualty smoke. Because bridge, periscope and deck-gun views share that renderer, the consequences are visible in all three without a second rendering system.

Career debrief records now use the actual four subsystem values for damaged surviving ships.

## Time selector refinement

The time-scale picker has a stable footprint. The compact top picker uses short selected labels (`16×`, `30 MIN`, `2 H`, `8 H`, `UNTIL EVENT`) while the menu retains the descriptive choices.

## Performance

The new model is scalar arithmetic on the already-existing small surface-contact set. No new canvas, WebGL context, texture stack, offscreen canvas or permanent particle system is added. Damage smoke is bounded and uses the existing low-spec renderer. This is intended to stay suitable for the project's Helio G88 / 4 GB target, although no physical Helio G88 FPS measurement was available in the test environment.
