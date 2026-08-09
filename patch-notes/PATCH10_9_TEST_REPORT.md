# Patch 10.9 — Playtest Hardening test report

Baseline: complete Patch 10.8 build.

## New acceptance contract

`tests/patch10_9-playtest-hardening.cjs` passes the following checks:

- all 63 runtime JavaScript files pass `node --check`;
- a 6× periscope visual at 4.3 nm produces a strong VISUAL chart fix immediately (contact confidence 0.86, position confidence ~0.951, hull confirmed, observed course/speed pinned);
- an already-known convoy does not repeatedly stop accelerated transit for each additional merchant becoming visual;
- a known escort crossing the 6 nm estimated-range band does stop transit;
- an escort becoming visual does stop transit;
- the map optical visibility display is a bounded 18-ray surface lookout footprint / 9-ray scope wedge rather than square exploration cells;
- successful FIRE reports exact tube and torpedo type;
- programmatic event-stop to 1× refreshes the custom time-picker labels;
- the persistent aircraft banner does not say CLEAR THE BRIDGE when submerged or already diving;
- periscope rendering and periscope visual acquisition share the same local weather-limited visual range;
- torpedo hits and burning ships use bounded, low-cost screen-blended illumination in darkness/gloom;
- quick speed UI explicitly shows SILENT when silent running caps speed;
- quick status includes battery percentage and FULL / CHG / DRAIN / HOLD state;
- legacy square explored-cell shading is no longer rendered as literal eyesight;
- the B5N/Kate icon is no longer a swept-wing dart silhouette;
- touch controls remain low while the periscope bottom information owns a protected centre gutter.

## Regression result

The complete current regression set was executed in batches because a single combined command can exceed the container execution window. All 24 test files passed:

- Phase 0–4
- Patch 1–10
- Patch 10.5–10.9 hardening/refinement contracts
- MAP track stability
- visual polish
- pre-Patch-7 ownship/dive refinement
- torpedo playability refinement

Runtime source verification: 63/63 JavaScript files syntax-clean; 63/63 `index.html` script paths present.
