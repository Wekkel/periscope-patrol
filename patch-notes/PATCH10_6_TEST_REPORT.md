# Patch 10.6 — Playtest Refinement

Baseline: Patch 10.5 Integration & Pacing Hardening.

## Changes

1. Transit/event safety
   - Every event-driven transit interruption closes transit and forces time to 1x.
   - Applies to open-ended and finite transit/skip modes because they share the same interrupt path.
   - An aircraft changing into ATTACKING/STRAFING breaks transit even if that aircraft was already known.
   - Transit cannot be restarted while an aircraft attack is already in progress.

2. MAP readability
   - Hydrophone/SOUND uncertainty strokes are thinner and substantially less opaque.
   - Only the selected confirmed ship gets a full course vector/turn cue.
   - Dense plots use compact one-line labels for unselected contacts.
   - Labels use simple collision avoidance and hairline leader lines, no black text boxes.
   - Tapping/clicking the already-selected MAP contact clears selection and the automatic TDC target.

3. VISUAL versus periscope truth
   - Surface lookout visual detection remains intentionally arcade-wide.
   - From 8–65 ft, VISUAL is only refreshed when PERISCOPE is active and the physical target is inside the current optic FOV.
   - Selecting a plot then entering PERISCOPE trains the glass to its estimated bearing; an inaccurate plot can still reveal empty water.

4. Day/night
   - Removed hard sky palette changes around the former daylight thresholds.
   - Night, twilight and day colours now interpolate continuously.
   - Sun and moon cross-fade through twilight instead of switching at one daylight value.

5. Aircraft alert wording
   - Surface/awash: CLEAR THE BRIDGE.
   - Already submerged: REMAIN SUBMERGED.

6. Charging preset
   - Added CHARGE at 35 RPM to both quick speed menus.
   - In the current propulsion model STOP remains absolute maximum generator share; CHARGE retains ~99.3% of that generator share while making modest way.

7. Touch HUD clearance
   - Touch control clusters are raised out of the lower message/instrument lane.
   - PERISCOPE gets extra bottom clearance.
   - MAP keeps the useful left navigation stack low, while the scale bar reserves a right-side gutter for FIRE.

8. Turning at STOP
   - Arcade turn-in-place remains.
   - A near-stationary commanded turn now generates a small differential-screw/maneuvering acoustic signature (max 0.055) without inventing displayed forward speed.

9. Merchant variation
   - Added lightweight visual-only merchant silhouettes: standard cargo, raised-forecastle cargo, island-bridge/transport and coastal freighter.
   - No new simulation type, AI object or collision model is introduced.

10. Damage/sinking rendering
   - A damaged but not-yet-sinking hull now settles as a whole as flotation is lost.
   - Crippled trim is limited to a modest attitude; dramatic stern/bow rise is reserved for actual sinking.
   - Bow/stern sinking pitch is eased non-linearly and the hull settles before large angles develop.
   - Broken-amidships rendering inserts an exact midships hull section and delays separation until late sinking progress, removing the visible sea gap between independently rendered halves.

## Acceptance evidence

New Patch 10.6 contract:
- known aircraft SEARCHING -> ATTACKING returns `aircraft attack` transit interrupt;
- an in-progress aircraft attack refuses a new transit and leaves timeScale=1;
- periscope-depth target outside 6x FOV remains HYDROPHONE, then becomes VISUAL after the glass is trained onto bearing;
- entering PERISCOPE with selected plot auto-trains to that plot bearing;
- deselect clears both map selection and automatic TDC target;
- STOP turn: speed remains 0, maneuvering thrust/noise = 0.055 in the test case;
- freighter test produces at least three visual silhouettes plus explicit coastal/transport variants;
- CHARGE generator share = 0.993043... in the current model;
- old sky threshold samples differ by at most one RGB channel value across 0.219/0.221 and 0.549/0.551;
- sinking source contract confirms whole-hull settlement, eased pitch, late separation and an inserted z=0 hull section.

Full regression result after changes: 21/21 test files PASS, including Phase 0–4, Patch 1–10.5 and all earlier refinements. Runtime JavaScript syntax: 63/63 PASS.
