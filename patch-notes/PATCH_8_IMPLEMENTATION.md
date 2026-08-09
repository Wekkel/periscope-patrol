# Patch 8 — After Action Report

Patch 8 adds a post-patrol debrief without adding a second simulation. The patrol records compact samples while play is running; the report is a static canvas driven by a timeline slider after completion.

## Completion flow

`PATROL COMPLETE` now finalizes and persists the immutable patrol record, pauses the game and opens the After Action Report overlay. The report shows patrol/area/date, sink/damage/weapon statistics, aircraft attacks evaded, Captain's Log, and a replay map. `CONTINUE TO WAR RECORD` then opens Career. Stored career rows with replay data also expose an `AFTER ACTION REPORT` button.

## Replay data

The recorder stores:
- ownship route every 15 simulated seconds;
- grouped player-known contact tracks every 30 simulated seconds;
- grouped truth tracks separately every 30 simulated seconds for tactically relevant/materialized contacts;
- first sightings, Captain's Log events, torpedo attacks, deck-gun engagements, depth-charge attacks, aircraft attacks/evades, own-boat damage and Truk penetration;
- torpedo start/end positions and outcome.

Player knowledge and world truth remain separate. The default replay uses the player's historical plot. `SHOW INTELLIGENCE PICTURE` switches to the recorded real tracks, allowing post-patrol comparison such as where an escort really was while the sound/plot solution was elsewhere.

## Lightweight storage/rendering

Track metadata is stored once per contact and positional samples are compact numeric arrays. Long tracks are bounded and progressively decimated instead of running an unbounded history. The AAR UI has no requestAnimationFrame loop: it redraws only when opened, when the timeline/intelligence toggle changes, while the optional replay PLAY control ticks, or on resize. No WebGL, OffscreenCanvas or additional patrol-time renderer is introduced.
