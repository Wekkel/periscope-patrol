# Patch 3 — Test report

All tests below were actually executed against the final Patch 3 build.

## Static/runtime contract

- 54 JavaScript runtime files passed `node --check`.
- All prior contracts passed: Phase 0, Phase 1 collision, Phase 2 Truk, Phase 3 subsystem damage, Phase 4 career history, Patch 1 ASW Brain and Patch 2 Surface Watch.
- Patch 3 dedicated state/simulation/render/UI contract passed.

## Patch 3 concrete results

- Automatic sound report while player remained on MAP: one log entry, zero toast entries. Example: `SOUND — screws bearing 317° · High-speed screws — probable escort.`
- Passive directional signal, same contact at 4 nm: centred strength `0.2843`; 20° off `0.0178`; 60° off `0.00995`.
- Own-speed masking, same contact: listen factor at 2 kn `0.8621`; at 17 kn `0.0796`. Centred contact strength fell from `0.2843` to `0.02625`.
- Three manually marked bearings over four minutes changed a deliberately poor map fix from `13.0 nm` error to `2.854 nm` error and source `SOUND TRIANGULATION`.
- Active QC on a true `3.400 nm` target returned `3.4036 nm` (`0.105%` range error), source `QC ECHO`; enemy state became `ATTACKING`; exactly one QC audio transmission and one warning toast were produced.
- Historical-fit test: 15 Jun 1942 = SD available, SJ absent; 15 Mar 1943 = SD + SJ; late 1944 SJ radar-depth limit = 48 ft versus 12 ft for the earlier fit.
- Bad-weather SJ test: at 4.8 nm with only 1.5 nm visual visibility and rain, 1943 SJ generated one radar track with source `SJ RADAR`; the contact remained only `SURFACE SHIP`.
- SOUND station command test: training moved 90° → 110°; passive monitor ran only on PASSIVE page and stopped on RADAR page.
- Low-spec canvas test at reported 4 GB / 4 cores / DPR 3: classified low-spec, effective DPR `1.5`, backing store `740,610` pixels, below the existing 2.2 MP ceiling.
- Source inspection confirmed there is a `SOUND` station but no separate `RADAR` station, and the new modules allocate no WebGL/offscreen/texture render stack.

## Regression result

`PHASE 0 CONTRACT: PASS`  
`PHASE 1 COLLISION CONTRACT: PASS`  
`PHASE 2 TRUK OPTIONAL RAID CONTRACT: PASS`  
`PHASE 3 SUBSYSTEM DAMAGE CONTRACT: PASS`  
`PHASE 4 CAREER HISTORY CONTRACT: PASS`  
`PATCH 1 ASW BRAIN CONTRACT: PASS`  
`PATCH 2 SURFACE WATCH CONTRACT: PASS`  
`PATCH 3 SOUND/RADAR CONTRACT: PASS`

Raw output: `PATCH_3_FULL_TEST_OUTPUT.txt`.

## Hardware caveat

No physical Helio G88 device was available in the execution environment. The low-spec assertions above verify the actual renderer limits and work throttles selected for a browser reporting 4 GB RAM / 4 CPU cores; they are not a claim of measured FPS on that chipset.
