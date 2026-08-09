# Patch 4 — Weather is gameplay

Patch 4 turns weather from a mostly global environment label into a compact spatial simulation that affects tactics, sensors, weapons and the existing 3D views.

## Design

- Weather is represented by at most three moving cells, not by repeatedly rerolling the whole map.
- A cell is sampled spatially at ownship, targets and along sight lines. The player can therefore be in clear air while a squall lies between the submarine and a convoy.
- Local progression is expressed as `CLEAR → BUILDING CLOUD → SQUALL → HEAVY RAIN → CLEARING → CLEAR` as a cell approaches, crosses and moves away.
- Weather updates only every 5 simulation seconds. Cells live for hours, move at modest speeds and new cells arrive on an hours-scale schedule.
- Weather transitions go to the log. Weather by itself is not a time-compression/transit interrupt.

## Gameplay effects

The shared weather query now influences:

- bridge and periscope visual range, including weather lying between observer and target;
- the submarine's visual profile;
- aircraft visual detection and the accuracy/viability of attack runs;
- Truk searchlight effectiveness and coastal-fire conditions;
- deck-gun dispersion;
- sea state and the appearance of deck-gun shell splashes;
- hydrophone quality, deliberately as a modest modifier rather than a shutdown;
- moonlight/night visibility through cloud cover;
- local weather/sea-state readout in the existing status UI.

A squall is therefore tactical terrain: it can hide a target, hide the submarine, degrade air/searchlight threats or spoil a gun solution depending on geometry.

## Visuals

The existing shared 2D canvas render path now adds low-cost horizon weather cells, rain, periscope droplets, darker/cloudier sky treatment, white/rougher sea effects inherited from sea state, and weather-sensitive shell splashes. No WebGL, textures, new permanent canvas or particle simulation was introduced.

## Low-end device budget

The existing low-spec path remains in force. Weather simulation is throttled to 5-second simulation updates and capped at three cells. Rain and optic-droplet primitives are bounded; the 4 GB / 4-core rendering profile retains the existing DPR 1.5 and canvas pixel budget. This is an architectural/performance-budget guarantee, not a claim of measured FPS on physical Helio G88 hardware.
