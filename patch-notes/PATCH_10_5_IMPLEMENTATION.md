# Patch 10.5 — Integration & Pacing Hardening

This is a hardening pass on top of Patch 10. It deliberately adds no new gameplay station, renderer, mission family, canvas or runtime module.

## Campaign lifecycle

- Patrol numbering advances once, when the next patrol actually starts. Completed patrols retain their own number for AAR/career storage.
- A new patrol resets simulation time to T+0 and time compression to 1x.
- Transit, stop reasons, AAR pause state, old log/toasts, AA state, ULTRA, aircraft, battle-atmosphere transients, active weapons, bridge-dive sequence, dive delay, chart transient state and stale tactical targeting are cleared.
- `_careerStartDate` is exactly the new historical/refit patrol date at 06:00, keeping Patch 9 and Patch 8 aligned.
- New AAR recording begins at patrol T+0.

## Mission pacing

### Convoy Interdiction
A patrol no longer requires every MAIN merchant to be physically sunk. Mission success is possible when at least one/two ships (depending on convoy size) are genuinely neutralized and at least 45% of the starting merchant tonnage is neutralized. `ABANDONED`, `FOUNDERING`, propulsion >= 90%, flotation >= 94%, and sunk all qualify through the existing ship-damage model. Sinking everything remains possible, but is no longer mandatory.

### High Value Intercept
The mission deadline is now derived from a physical flank-speed intercept estimate plus a fixed 50-minute tactical margin. This prevents procedural geometry from generating a nominal four-hour mission with only a few minutes left to classify and attack.

### Lifeguard
The carrier-strike/downed-airman event does not start before the submarine reaches lifeguard station. Once on station, the strike occurs after a deterministic 3–8 minute station wait.

## Surface-combatant capabilities

ASW logic now asks what a vessel can do rather than testing only `type === 'ESCORT'`. `ESCORT`, `PATROL_CRAFT` and `WARSHIP` can participate as enemy surface combatants; sonar/prosecution is capability-gated. This makes Patch 7 patrol craft/task-group warships tactically real instead of decorative.

## Traffic LOD

Observed ambient traffic is held in full tactical simulation for 180 seconds rather than 1200 seconds. Once distant/stale, it can return to abstract Traffic Director state and free one of the three ambient tactical slots. The player's existing track is retained and marked abstract instead of being deleted, so knowledge and full simulation are no longer the same thing.

## AAR storage

The newest 10 patrols retain full replay geometry. Older replays are compacted while preserving patrol history, result data and logs. A quota-write retry keeps only the newest 3 full replays and further reduces old replay geometry before sacrificing career history.

## Performance

No new runtime JS path, canvas, WebGL context, OffscreenCanvas, RAF loop or particle system is introduced. The traffic change reduces long-lived full-detail objects and the AAR change bounds persistent replay growth.
