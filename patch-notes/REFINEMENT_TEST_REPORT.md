# Refinement test report

Baseline: Patch 4 — Weather is gameplay, including Fase 0–4 and Patch 1–4.

## Toast readability

Before this refinement normal toasts were fixed at 2.3 s and `bad` toasts at 3.5 s regardless of text length.
The new lifetime is reading-time based (with severity floors and caps); explicit durations act as minimums.

Measured examples:

- `Map centred on ownship`: 2.800 s
- `Deck gun crew topside automatically — 120 rounds ready. Any dive order will clear the deck first.`: 5.369 s
- long dive/deck-clear message: 6.609 s
- lost-boat instruction: 6.455 s
- concise collision transit-stop example: 4.200 s

Transit-stop messages now reserve the toast lane for their calculated lifetime instead of a hard-coded four seconds.

## Bridge perspective / zoom / ownship

- The old foredeck was a 2-D trapezoid whose bow screen position directly depended on focal length.
- Ownship foredeck and afterdeck are now projected from metre coordinates fixed to the submarine's simulated heading.
- Wide view remains 82° and full binocular view 24°, but pinch and desktop wheel can select intermediate optical zoom.
- Test at a 20° look offset recovered the same -20.000000° hull bearing at 82° and 24° FOV, despite the very different screen magnification.
- Bridge and gun views share the lightweight projected ownship deck helper; no new canvas, WebGL context or texture engine is used.

## Aircraft on bridge

An attacking aircraft at 2.0 nm inside the active bridge field was forced through the real lookout knowledge path (`seenBySub=true`) rather than being drawn from hidden world truth. The bridge renderer then produced vector aircraft geometry for it.

## Deck-gun fall of shot

A splash at 1.25 nm directly behind a 1.0 nm merchant is classified behind the hull. A 0.75 nm splash is not. Far/overshoot splashes are painted before the nearer ship; near splashes after it. Therefore an overshoot water column can no longer appear pasted over the target.

The gun view also renders projected ownship deck beneath the mount.

## Ship motion and MAP

Angular velocity now has acceleration/inertia rather than jumping instantly to maximum rudder rate.

10-second 90° turn test at 10 kn:

- merchant: heading changed 11.10°, turn rate ramped from 0.075°/s to 1.20°/s, max 0.120° per 0.1 s simulation step;
- escort: heading changed 32.104°, first turn rate 0.28°/s, max limited to 3.40°/s;
- merchant ordered from 5 to 10 kn reached 6.0 kn after 10 s rather than jumping to 10 kn.

A visually held merchant turn produced actual heading 6.30°, plotted course 5.958° and observed MAP turn estimate +1.20°/s. The ship icon continues to rotate on its observed course and now gets a small turn cue when the observed rate is meaningful.

3-D ships receive a small turn heel from the same actual turn-rate state; collision geometry is unchanged.

## Regression

All passed on the final build:

- Phase 0 baseline contract
- Phase 1 vessel collision contract
- Phase 2 Truk optional raid contract
- Phase 3 subsystem damage contract
- Phase 4 career history contract
- Patch 1 ASW Brain contract
- Patch 2 Surface Watch contract
- Patch 3 Sound/Radar contract
- Patch 4 Weather contract
- Refinement polish contract
- all 55 runtime JavaScript files: syntax PASS

A headless Chromium smoke was attempted in this environment but the process did not complete, so it is deliberately **not** counted as a successful test.
