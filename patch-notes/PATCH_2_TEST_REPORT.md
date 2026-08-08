# Patch 2 test report

All tests below were actually executed against the complete Patch-2-applied runtime before the delta patch was packaged.

## Full regression result

- Phase 0 contract: PASS
- Phase 1 collision contract: PASS
- Phase 2 Truk optional raid contract: PASS
- Phase 3 subsystem damage contract: PASS
- Phase 4 career history contract: PASS
- Patch 1 ASW Brain contract: PASS
- Patch 2 Surface Watch contract: PASS
- 52 runtime JavaScript files passed `node --check`.
- All 52 script paths referenced by `index.html` exist.

## Patch 2 concrete results

- BRIDGE request at 55 ft was refused and station remained MAP.
- At the surface, entering BRIDGE initialized the view to heading 123°; a +17° command produced 140° and binocular mode switched on.
- Legacy tactical state without bridge fields migrated without crashing.
- With 10 nm nominal visibility, a moving merchant bridge/smoke limit was 11.6 nm versus 8.6 nm at periscope depth.
- A mark at 11.2 nm produced a VISUAL/BRIDGE track with a 0.419 nm noisy fix error and only `SURFACE SHIP`, not magical exact identity. Repeating the same observation in the same seed/time bucket produced identical error.
- At 4 nm, binocular TARGET created confidence 0.68, selected the contact and fed the same contact ID to the existing TDC.
- A contact 7° off centre was available in wide watch but outside the binocular centre-selection gate.
- GUN from BRIDGE entered DECK_GUN, automatically manned the existing gun and left ammo at 120 until firing.
- DIVE from BRIDGE switched the view to MAP and ordered 100 ft without a manual bridge-crew action.
- Under a deterministic lookout roll at 4 nm, the surfaced submarine was sighted and generated a VISUAL enemy solution; at 55 ft the periscope was not sighted.
- 4 GB / 4-core capability input set low-spec mode. On a 390×844 layout at device DPR 3, backing DPR was capped to 1.5 and the backing store was 585×1266 = 740,610 pixels, below the 2.2 MP ceiling.
- Low-spec BRIDGE rendering capped effect quality at 0.58 and restored the adaptive quality value after the frame.
- Wide FOV measured 82°; binocular FOV 24°.
- At 11.2 nm with 10 nm nominal visibility, the low-spec distant-smoke renderer emitted two tanker smoke puffs.
- Canvas runtime dispatch called the BRIDGE renderer.
- The BRIDGE source contains no circular clip mask and creates no second canvas/WebGL/texture engine.
- Responsive CSS contains a bottom horizontal strip for portrait touch and an 82 px vertical strip in landscape.

## Not claimed

No physical Helio G88 handset benchmark was available in this environment, so no FPS or battery-life claim is made. The patch is deliberately bounded for that device class and the low-end resource gates above were executable-tested.

Raw output: `patch-notes/PATCH_2_FULL_TEST_OUTPUT.txt`.
