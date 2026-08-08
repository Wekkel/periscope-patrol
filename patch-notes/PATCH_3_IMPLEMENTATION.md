# Patch 3 — Sound Room + radar

## Intent

Patch 3 adds a skipper-level SOUND station without making sound/radar operation mandatory. The existing automatic sensor/contact system remains the normal path through the game. Visiting SOUND only lets the player extract a better passive bearing, build a bearing plot, or deliberately transmit one active QC ranging ping.

Radar is deliberately not a separate management station. The SOUND station has a PASSIVE page and an SJ RADAR page. SD remains an automatic air-warning set.

## Simulation

- `js/simulation/sound-radar.js` adds passive sound quality, directional listening, automatic operator reports, bearing marks/triangulation, active QC ranging, and SJ sweeps.
- Own screw noise is a first-order limiter. Slow/all-stop listening is materially better than flank-speed listening.
- Automatic operator reports go to the patrol log and transient canvas callout, not the toast queue.
- `MARK BEARING` writes into the existing `world.contactTracks` structure. Multiple recent marks may produce a triangulated plot.
- `ECHO RANGE` emits one active transmission, updates range when an echo is usable, and alerts the enemy via the existing noisy ASW cue path even if no useful echo returns.
- SJ writes into the same contact-track system. It supplies bearing/range but does not magically identify ship class.
- Radar fit is campaign-date based, not an additional player toggle: no radar on very early 1942 dates, SD first, then SD+SJ from the second half of 1942; the late-war fit permits shallow radar-depth operation.

## UI / rendering

- New station: `SOUND` / `SND`.
- PASSIVE page: bearing dial, signal meter/headphone visual, current listen quality and own-speed warning.
- Controls: train left/right, MARK BEARING, ECHO RANGE, and SJ RADAR/PASSIVE toggle.
- RADAR page: simple heading-up circular 8 nm gameplay plot on the same main canvas.
- Radar is a page inside SOUND, not a seventh station.
- Desktop hotkey: `6`.
- Touch drag trains the hydrophone; double-tap marks a bearing.

## Performance budget

Patch 3 creates no second canvas, WebGL context, texture system or permanent offscreen buffer. SOUND uses the existing `mainCanvas`. Passive sensor work is throttled to 0.25 s and SJ sweeps to 2 s. Hydrophone audio exists only while the player is actively on the passive SOUND page and uses two oscillators. The existing 4 GB / 4-core low-spec canvas cap from Patch 2 remains in force.

## Historical abstraction

The equipment dates deliberately model broad fleet availability rather than per-hull refit paperwork. The round SJ display is a gameplay-oriented PPI-like presentation; the goal is quick tactical comprehension rather than reproducing every wartime indicator model.
