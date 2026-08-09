# Patch 10.8 test report

New acceptance contract: `tests/patch10_8-harbor-air-ordnance.cjs`.

Verified:
- a stale Tulagi RV cached at an unsafe/shallow location is re-charted;
- the full 0.30 nm green service circle is validated, not only its centre;
- inside the marked green RV, coarse synthetic terrain cannot ground the boat;
- map includes a solid 4-fathom grounding-danger contour and clearer close-zoom coastline edge;
- Type 97 flying-boat attack uses an aerial depth charge with water entry and a delayed detonation;
- the submerged boat receives `AERIAL DEPTH CHARGE IN THE WATER` before detonation;
- a deterministic 100-ft example remained non-catastrophic (100% hull before, 98.37% after the eventual detonation);
- Nakajima B5N ordinary bombs remain immediate bomb bursts and are labelled `AIR BOMB`;
- aircraft spawn cadence/probability constants were not increased.

Full regression after the change: all 23 current `.cjs` test suites PASS. Runtime JS count remains 63; syntax checks PASS.
