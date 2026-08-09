# MAP contact-track stability fix

Baseline: the refinement build after Patch 4.

## Problem
Automatic HYDROPHONE and SJ observations were treated too directly as map positions. A fresh noisy observation could therefore move `plotPosition` by hundreds of metres even though the physical vessel moved less than a metre in the same simulation step. SJ could also overwrite a fresh VISUAL fix and be pulled back by VISUAL on the next step.

## Fix
- Automatic sensor observations are now separated from the kinematic paper plot.
- The paper plot predicts forward using estimated course/speed and converges toward new observations at bounded, source-specific rates.
- Position-source priority is VISUAL / QC > SJ > SOUND triangulation > passive hydrophone. A lower-grade source cannot immediately kick a fresh better fix sideways.
- `confidence` remains the broad contact/identification confidence, while `positionConfidence` and `positionUncertaintyNm` now describe how well the map position is actually known.
- Pure hydrophone contacts therefore remain playable and visible, but do not masquerade as precise ship positions merely because contact confidence reached 100%.
- Deliberate player fixes such as SOUND triangulation and QC echo remain allowed to make a strong plot correction. Those are intentional observations, not periodic automatic noise.
- Existing world-vessel physics are unchanged.

## Reproduction test
A 9-knot merchant was observed for 42 simulated seconds with passive sound. At the 20-second deterministic hydrophone noise-bucket boundary:

- real vessel movement in 0.1 s: 0.463 m
- raw sensor-position jump: 1,244.8 m
- resulting MAP-track movement: 0.201 m

Across the full run:

- largest raw sensor-position step: 2,356.4 m
- largest MAP-track step: 0.884 m
- largest physical vessel step: 0.463 m

A fresh VISUAL track followed immediately by an SJ sweep moved 0 m and remained sourced as VISUAL.

## Regression
All 55 runtime JavaScript files pass `node --check`.

PASS:
- Phase 0 baseline
- Phase 1 vessel collision
- Phase 2 Truk optional raid
- Phase 3 subsystem damage
- Phase 4 career history
- Patch 1 ASW Brain
- Patch 2 Surface Watch
- Patch 3 SOUND/RADAR
- Patch 4 Weather
- visual refinement contract
- new MAP track stability contract
