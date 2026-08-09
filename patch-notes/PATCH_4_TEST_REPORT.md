# Patch 4 test report

All tests below were run against the final Patch 4 build.

## Regression contract

- 55 runtime JavaScript files: syntax PASS.
- Phase 0 baseline/regression: PASS.
- Phase 1 vessel collision: PASS.
- Phase 2 Truk optional harbor raid/fog of war: PASS.
- Phase 3 subsystem damage/damage control: PASS.
- Phase 4 career history/debrief: PASS.
- Patch 1 ASW Brain: PASS.
- Patch 2 Surface Watch: PASS.
- Patch 3 Sound/Radar: PASS.
- Patch 4 Weather: PASS.

## Patch 4 acceptance evidence

- Moving cell observed over 95 minutes: `CLEAR`, `BUILDING CLOUD`, `SQUALL`, `HEAVY RAIN`, `CLEARING`, then `CLEAR` again.
- Same bridge sight line: 13.92 nm clear versus 1.67 nm with heavy rain on the line of sight; local weather visibility was 1.44 nm.
- Hydrophone quality: 0.3083 clear versus 0.1993 in heavy rain/rough conditions, a ratio of 0.646 — degraded, not disabled.
- Same deterministic deck-gun shot: 0.0445° bearing deviation clear versus 0.1366° in heavy weather. Weather dispersion factor rose from 1.0924 to 1.8692.
- Same surfaced-sub/aircraft geometry: aircraft acquired and attacked in clear air; remained SEARCHING in heavy rain.
- Same Truk searchlight geometry at 3 nm: active in clear conditions, unable to reach the submarine in heavy rain. Searchlight factor fell from 1.0 to 0.12.
- Clear near-full-moon night visibility: 4.396 nm; same night under heavy cloud/rain: 0.351 nm.
- Weather alone returned no `transitInterrupt()` reason in HEAVY RAIN, so compressed transit/time skip is not stopped merely because bad weather exists.
- Existing UI rendered `Weather: HEAVY RAIN`, `Sea state: 0.76` and 1.4 nm visibility.
- Low-spec rain render produced 70 bounded rain strokes and 4 optic droplets in the test path.
- Rough-sea shell splash render became broader/taller and rain reduced splash opacity in the actual deck-gun rendering function.
- Static architecture test confirms no WEATHER station, WebGL, OffscreenCanvas, new canvas allocation or texture engine was added by the weather module.
- Static simulation test confirms the 5-second update throttle and maximum of three active weather cells.

Raw console output is in `PATCH_4_TEST_OUTPUT.txt`.
