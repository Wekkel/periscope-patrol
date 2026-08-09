# Pre-Patch-7 refinement — stable tracks, continuous ownship, bridge dive sequence

This is a refinement overlay for the current Patch-6 build. It is intentionally not Patch 7.

## MAP track semantics

- A real visual hull is now a kinematic map object: while the hull is genuinely visible, its plotted position, heading and speed follow the observed vessel rather than dragging an older acoustic/radar solution sideways.
- Acquiring visual contact does not animate an old uncertain plot into the new fix. The old uncertainty solution is retained only as a short fading acquisition ghost while the sharp visual hull appears at the visual fix.
- High confidence no longer automatically means a crisp ship silhouette. Passive HYDROPHONE / SOUND BEARING / SOUND TRIANGULATION remain uncertainty objects. SJ/QC may show a compact faint ghost within an uncertainty capsule. Only a fresh visual hull becomes a solid ship icon.
- Pure hydrophone contacts use an elongated bearing-oriented uncertainty presentation, so small shifts read as a changing plot rather than impossible lateral vessel motion.
- A fresh visual track directly follows the observed vessel's heading and speed for arcade readability.

## BRIDGE / GUN ownship geometry

- The old 82–98 degree abeam suppression has been removed.
- The submarine is now a single lightweight low-poly surface mesh spanning stern, fairwater and bow.
- Ownship polygons are clipped against a 0.55 m camera near plane rather than discarding vertices behind the ordinary distant-world 3 m plane.
- Deck, hull sides, fairwater, rails and centre seam therefore remain continuous while looking through a full 360 degrees.
- BRIDGE and GUN reuse the same mesh; no new renderer, canvas, WebGL context or texture system is added.

## Surface motion

- BRIDGE gains restrained deterministic heave/pitch/roll cues based on sea state and speed.
- The horizon/world moves while ownship remains stable relative to the observer, avoiding a deck that visibly slides under the camera.
- Motion is intentionally subtle in calm water and larger in rough fast surface running.

## Dive transition from BRIDGE

- A normal dive from BRIDGE no longer switches instantly to MAP.
- The bridge watch gets a 9 s clear-deck sequence (5.5 s for crash dive).
- During the sequence the view remains on BRIDGE and simple low-cost silhouettes move to the hatch; the last man descends and the hatch closes.
- `diveDelay` holds actual depth at 0 ft until the sequence is complete. Only then does the view hand off to MAP and the boat begin descending.
- Existing longer AA/deck-gun clear-deck delays still take precedence where applicable.

## Acceptance evidence

- Visual acquisition test starts with a 0.35 nm lateral hydrophone error. The sharp visual hull appears at the observed position; it is not animated sideways from the acoustic plot.
- Visible 10 kn merchant: maximum MAP step over 0.1 s = 0.514 m; measured lateral component = 0 m.
- Full 360 degree ownship test at 5 degree intervals: minimum 21 valid clipped faces; exact cardinal views 0/90/180/270 all remain populated.
- High-confidence hydrophone test: 0 crisp hulls, 1 uncertainty object. Fresh visual test: 1 crisp hull, 0 uncertainty objects.
- Normal BRIDGE dive: maximum depth before bridge-clear completion = 0 ft. After hatch closure and handoff, depth begins increasing.
- Surface motion amplitude in the deterministic test is materially larger in rough/fast conditions than calm/slow conditions.

The full Phase 0–4, Patch 1–6, prior visual refinement, MAP stability and this new refinement contract all pass on the final build. Patch 2's old immediate BRIDGE→MAP dive expectation is deliberately superseded by the new bridge-clear animation and its regression test has been updated accordingly.
