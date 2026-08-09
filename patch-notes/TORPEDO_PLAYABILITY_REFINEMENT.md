# Torpedo playability refinement — before Patch 7

## Why this exists
A playtest reported six torpedoes visibly passing their targets. Investigation found two gameplay bugs rather than merely historical difficulty:

1. A selected TDC contact looked like a live track in the UI, but bearing/range/course/speed could remain frozen at the original observation. A steady 10-knot merchant could therefore walk out of an apparently good solution before FIRE was pressed.
2. Individual tubes carried permanent hidden spread biases (including -2°, +2° and +4°). Those offsets made separately fired tubes deliberately miss the centre solution.

## Changes
- Live selected PLOT/BRIDGE/SCOPE targets now keep the TDC solution updated until firing. Manual TDC remains deliberately manual/frozen.
- Solution quality now respects positional knowledge: VISUAL is strong, SJ useful, hydrophone-only substantially weaker.
- Permanent per-tube spread offsets are removed. A single tube aims at the centre solution.
- A multi-tube spread still brackets the solution, but uses a compact 0.8° total step pattern rather than hidden tube bias.
- Launch angular error scales with displayed solution quality. Green solutions have small error; weak plots remain risky.
- A very small collision/fuze tolerance is allowed only for a good intended-target solution to avoid one-integration-step near misses.
- New patrol default dud mode is Reduced (10%); Historical (25%) and None remain selectable. Existing saved settings are preserved.
- Selected MAP contact labels no longer have the opaque black backing card; chart-yellow text remains.
- MAP FIRE is now fire-only. With no READY/flooded tube it warns the player to open ATTACK and flood at least one tube. It never auto-floods.
- Multiple pre-flooded tubes remain available one at a time to repeated FIRE presses.
- `Flood All Fwd Tubes` now truly floods only tubes 1–4; aft tubes remain dry unless separately flooded.
- Tutorial wording now matches the live TDC/flooding behavior.

## Acceptance evidence
- 57 runtime JavaScript files pass syntax checks.
- All existing Phase 0–4, Patch 1–6, visual refinement, MAP stability and pre-Patch-7 refinement contracts pass.
- A reproduced 60-second stale-track shot changes gyro from ~12.56° to ~18.82° with the live track and hits the moving target.
- Tubes 1–6 all have zero permanent spread bias.
- With all tubes dry, MAP FIRE dispatches no command and creates the ATTACK/flood warning.
- With tubes 1 and 2 READY, two FIRE presses dispatch tube 1 then tube 2.
- Forward bulk flood gives READY/READY/READY/READY forward and leaves both aft tubes LOADED_DRY.
- In 200 deterministic good visual 1.5-nm shots with Reduced duds, 182 detonated and 18 were duds (91% detonation rate). This is intentionally a favorable setup; poorer sensor solutions and longer-range estimates retain meaningful miss risk.
