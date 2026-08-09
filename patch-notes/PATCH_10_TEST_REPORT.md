# Patch 10 — Battle Atmosphere — test report

The dedicated Patch 10 contract and the full existing regression suite were run on the completed working build.

Dedicated acceptance evidence:

- a harbour searchlight did not create a fix before its beam crossed the submarine bearing;
- when the beam crossed the true bearing, `searchlightContactUntil` became active and enemy positional confidence rose to 0.88;
- coastal gunfire produced a muzzle-flash event while hull integrity remained unchanged before shell impact;
- the same shell damaged the submarine only when its scheduled impact time was reached;
- moving the submarine 0.35 nm between firing and impact produced no damage and created a shell splash at the old predicted fall-of-shot;
- escort gunfire created muzzle flash, tracer and splash state;
- night convoy coordination created one bounded signalling event;
- at the same speed the hydrophone cadence for an escort and tanker differed materially (3.16 Hz versus 2.09 Hz in the deterministic test);
- a damaged/burning target beyond useful hull detail still produced smoke / night-glow vector primitives;
- BRIDGE, PERISCOPE and GUN all call the same battle-atmosphere rendering layer;
- no new RAF, WebGL, OffscreenCanvas or canvas engine was introduced.

The complete regression suite finished with `ALL_PASS`, covering Phase 0–4, Patch 1–9, prior MAP/ownship/visual refinements, torpedo playability, and Patch 10.

## Deployment-overlay verification

The final patch payload was then overlaid onto a clean Patch 9 baseline, exactly as an end-user update would be applied.

- runtime manifest SHA-256 mismatches: `0`;
- runtime script tags in `index.html`: `63`;
- missing runtime script paths: `0`;
- Node syntax check for all runtime JS: PASS;
- all `19` available regression/acceptance test files: PASS;
- final overlay regression marker: `ALL_PASS`.
