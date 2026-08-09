# Patch 6 — Mission Framework

Patch 6 introduces one small mission framework over the existing simulation systems. It does not add a separate mission engine, second world model or per-mission minigame loop.

## Primary-mission rule

Each patrol has exactly one `campaign.primaryMission` and one `campaign.missionType`. Supported primary families are:

- `CONVOY_INTERDICTION`
- `HIGH_VALUE_INTERCEPT`
- `RECONNAISSANCE`
- `LIFEGUARD`
- `SPECIAL_TRANSPORT`
- `MINELAYING`

Ordinary patrols may use `AUTO` or a player-selected family. Historical scenarios remain `CONVOY_INTERDICTION` unless a historical scenario explicitly specifies another mission type.

Truk's existing Harbor Raid remains an intelligence-driven optional opportunity rather than a seventh primary mission. The mission framework itself creates no optional objective. The existing Truk logic still creates at most one `truk-raid` optional after the special-intelligence message is actually copied.

## Mission behavior

### Convoy Interdiction
Preserves the classic locate / attack / evade / return flow and the existing convoy, ASW, weather and damage systems.

### High Value Intercept
Promotes one real convoy ship to a Fleet Oiler, Troop Transport or Light Carrier. The map receives an approximate intelligence area/course, not the target's world-truth position. Visual identification is required. A sunk or mission-killed target (including severe propulsion/flotation casualty or abandonment) satisfies neutralization.

### Reconnaissance
Uses real anchorage contacts at Truk and bounded stationary recon contacts elsewhere. Targets must be visually identified. Weapons remain optional; firing near the reconnaissance area compromises the mission tactically by alerting the enemy and raising air threat, but does not automatically fail the primary mission.

### Lifeguard
Creates one small `RAFT` contact only after the carrier-strike event. The downed airman is not magically plotted. Bridge visual watch or short-range SJ radar can locate him. Recovery requires the submarine surfaced, at <=2.5 knots, within 0.08 nm for 15 seconds. The airman-down event stops compressed time.

### Special Transport / Coastwatchers
Creates a coastal rendezvous. Transfer occurs automatically after 90 seconds surfaced, <=2 knots, inside the rendezvous radius and at night. If the submarine lingers, the response clock raises air threat and stops compressed time. Clearing the area completes the primary mission.

### Minelaying
Creates one mine box and lay heading. No per-mine controls are added. At the correct position, heading, depth (35–90 ft) and speed (2–5 kn), one mine is released every eight seconds until a fixed 12-mine pattern is complete.

## Knowledge and rendering

Mission map overlays contain only information the mission orders/player knowledge justify: reported HVT uncertainty area, recon area, lifeguard station/search area, coastwatcher rendezvous, or mine box/pattern. The HVT's exact world position is not exposed by the mission overlay.

A minimal raft vector model is added to the existing shared 3D ship renderer. Rafts have restricted bridge/periscope/SJ detection and are excluded from vessel collision/avoidance so they cannot physically damage or stop the submarine.

## Persistence / debrief

`buildPatrolRecord()` now records `missionType` and an immutable clone of `primaryMission`, allowing the existing career/AAR data to preserve the mission family, mission result and mission-specific data.

Pre-Patch-6 saves without mission fields migrate in place to `CONVOY_INTERDICTION`; existing legacy objective progress is retained.

## Performance

The framework adds no WebGL, OffscreenCanvas, new canvas, requestAnimationFrame loop or particle engine. Mission update logic consists of bounded scalar/state checks in the existing simulation tick. Mission-specific bounded data is at most one raft contact and a 12-position mine pattern.
