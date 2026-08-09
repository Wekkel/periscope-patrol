# Patch 5 test report

All pre-existing contract suites (Phase 0–4, Patch 1–4, visual refinement and MAP-track stability) were rerun on the final Patch-5 build and passed. Patch 5 has its own `tests/patch5-ship-damage.cjs` contract.

Concrete Patch-5 results from the final deterministic test run:

- 56 runtime JavaScript files passed `node --check`.
- Engine-room Mk 14-class 292 kg torpedo hit on a 10 kn merchant: propulsion damage 0.801, fire 0.349; after 60 s speed was 2.584 kn; ship remained afloat and was `CRIPPLED`.
- Bow hit: flotation damage rose from 0.536 to 0.567 over 90 s; trim was +0.714 (down by bow); speed capability fell from 7.216 to 7.122 kn; ship remained afloat.
- Stern hit on a smaller merchant: steering damage 0.985, rudder bias -12.865°, jam -0.925; while ordered to hold 090°, heading was 078.007° after 120 s.
- Deterministic heavy midships hit: no score or tonnage at impact; flotation opened to 0.91 and foundering was scheduled; the ship began sinking 99 s later, at which point 1,400 points and 4,200 tons were credited exactly once.
- Ten actual deck-gun damage calls against a tanker drove FIRE to 1.0 without instantly sinking it. The crew abandoned ship after 227 s and speed order became zero; no kill score was awarded merely for abandonment.
- Damaged-convoy split test: a propulsion-crippled lead merchant ran at 2.955 kn while a healthy merchant ran at 10.397 kn. Over 30 min their separation grew from 1.442 nm to 2.373 nm. Escort E-02 held `DAMAGED_GUARD` on M-01 and remained 0.965 nm from the casualty.
- Visual player knowledge recorded `BURNING` with damage severity 0.670 for a damaged tanker; career debrief recorded the real flotation/propulsion/steering/fire subsystem snapshot and `DECK_GUN` as damage source.
- MAP render harness actually rendered the `BURNING` label.
- Shared 3D render harness produced three bounded black casualty-smoke puffs on the low-spec path.
- CSS/picker checks confirm fixed time-picker widths and stable compact labels.
- Static kill-path check confirms torpedo/deck-gun code calls the subsystem damage functions and no longer tests `gunDamage` against a sink threshold.
- Patch-5 module contains no WebGL, OffscreenCanvas, extra canvas creation or requestAnimationFrame loop.

See `PATCH_5_TEST_OUTPUT.txt` for raw output from every contract suite.
