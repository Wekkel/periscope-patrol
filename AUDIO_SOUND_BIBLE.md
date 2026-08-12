# Periscope Patrol — Audio Sound Bible (Phase 3 / Phase 4 foundation)

Status: release-candidate architecture. Procedural, client-side, no external runtime audio assets.

## Identity

The audible identity is STEEL — WATER — MACHINERY. Audio should reveal only what the submarine could physically or procedurally perceive; it must never become an omniscient second HUD. Silence is an authored state, especially under water and during silent running.

## Canonical / accepted Phase 2 palette

- Silent-running ambience: low machinery/pressure bed; dramatically reduced upper noise.
- Submerged cinematic ambience: same physical bed with slightly more pressure/water mass; mix by situation.
- Enemy sonar: Round 10 variant 03 is the provisional canonical carrier: 695 Hz, ~18 ms hard body, then two exponential amplitude decays of the exact same stable tone. No vibrato, detune, pitch bend or separate sea-tail.
- Depth charges: pressure-first WHUMP, broad low-Q water/steel resonance, compact recovery. Near impacts are deliberately much larger than distant charges.
- Tube flood: rapidly opening pressure woosh; no hard leading click.
- Tube ready: restrained heavy metal latch / container-door-lock character.
- TDC solution: one small period-style metal confirmation bell; never electronic rising beeps.
- Station switch: dry electromechanical contact.
- Periscope: short hydraulic/mechanical motion with subtle moving pipe resonance.
- Hydrophone screws: heavy machinery at low cadence; higher cadence adds mechanical whine/cavitation. It must only use the actual passive-contact model.

## Provisional sounds that remain tunable

- Depth-charge water-entry splash. Runtime recipe exists so attack timing can be tested, but it still needs a dedicated listening pass.
- Procedural low-brass title/mission cues. They are intentionally sparse; real brass is the weakest no-sample synthesis category.
- Battle-stations klaxon. Semantic event architecture is final; the exact timbre remains tunable.

## Mixer buses

SYSTEM: controls, tube mechanisms, TDC, station switches.
COMMAND: dive/crash-dive/detection transition cues.
SENSOR: enemy sonar, own QC, hydrophone monitor, torpedo monitor.
WORLD: exposed sea/rain and aircraft fly-by.
MACHINERY: submerged hum, diesel/structure/hull creaks.
WEAPONS: gunfire, torpedoes, mines, bombs, depth charges.
MISSION: non-musical mission/UI events.
MUSIC: rare title/mission brass cues; separate user volume.

The master compressor is a safety rail only. Do not normalize every sound to the same perceived loudness. A near depth charge must retain much more peak impact than a station switch.

## Director states

Base: NORMAL_NAVIGATION, SURFACED_TRANSIT, PERISCOPE_STALK, SILENT_RUNNING, RETURN_HOME.
Threat: NONE, ENEMY_SEARCH, DETECTED_ASW, AIR_ATTACK.
Perspective: EXPOSED_SURFACE, INTERNAL_SURFACE, PERISCOPE_INTERNAL, SUBMERGED, HYDROPHONE_FEED.

Threat mix may only react to a player-perceivable condition. Example: ENEMY_SEARCH is entered after an actual enemy sonar ping has played, not merely because hidden AI state says SEARCHING. No automatic tension soundtrack is tied to hidden detection values.

## Priority / ducking

Near catastrophic impacts > detected/attack transition > own weapons > commands > sensor events > mission/system feedback > ambience. Large combat transients temporarily duck WORLD and MACHINERY, not SENSOR/WEAPONS, so the physical event remains intelligible without flattening dynamics.

## Time compression

Routine SYSTEM/COMMAND/WORLD feedback is reduced above 1x. SENSOR and WEAPONS stay available for events that interrupt transit. Audio is scheduled in wall-clock AudioContext time and never drives simulation timing.

## Mobile lifecycle / performance

- One AudioContext, unlocked/resumed from player gesture.
- Shared reusable noise buffer prevents repeated allocation/Math.random work during combat.
- Continuous loops are a small fixed node set.
- Aircraft fly-by parameter updates are throttled and only one relevant aircraft is rendered acoustically.
- No convolution reverb, HRTF scene, AudioWorklet or large sample bank.
- SFX and Music/Cues have separate persisted device-level volume controls.

## Semantic-event rule

Simulation code should communicate meaning (`RADIO_MESSAGE`, `WAYPOINT_REACHED`, `AIRCRAFT_ATTACK`, `DEPTH_CHARGE_SPLASH`) rather than selecting a reusable sound by accident. Do not reintroduce `playWaypoint()` for saves/radio/tutorials or `playDepthCharge()` for bombs/mines/shells.

## Debug / review

`PeriscopeDebug.audio.list()` lists direct recipes.
`PeriscopeDebug.audio.play('DEPTH_NEAR')` auditions one sound.
`PeriscopeDebug.audio.sonar(1|2|3)` compares the three final close sonar variants; 3 is default.
`PeriscopeDebug.audio.preview('SILENT_RUNNING','ENEMY_SEARCH','HYDROPHONE_FEED')` previews a mix state without mutating simulation state.
`PeriscopeDebug.audio.stats()` returns engine and director state.

Future changes should preserve these reasons, not merely the current numeric values.
