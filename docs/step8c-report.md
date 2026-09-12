# STEP 8c — hot-path runtime initialization

The schema initializers now run at lifecycle boundaries (`createState`, load,
and `NEW_PATROL`) instead of at the top of every simulation tick. The gameplay
call-order check compares the active post-8c baseline directly; the immutable
pre-STEP-7 baseline is preserved separately for audit.

Renamed validators:

- `ensureWaterRoute` → `resolveWaterRoute`
- `ensureHarborApproachWater` → `validateHarborApproachWater`

The current harness reports 34 `updateSub` calls, zero runtime-load
differences for fresh, mid-patrol, and completed saves, and all 71 command
paths execute successfully.

All four accessor groups are now complete. Group 1 (`campaign._*`), group 2
(`playerSub._*` and contact `_collisionPrev`), group 3 (environment weather
baselines), and group 4 (TDC, watch, sound/radar ticks, and deck-gun AAR
clock) now use explicit `state.runtime.*` paths. The harness reports an empty
`runtime.legacyFields` list.

For group 2, all three save variants compare with zero persistent-field
differences: fresh 3654 fields, mid-patrol 3677, completed 3694. No field in
these groups required a behavior-changing exception.

Groups 3 and 4 produce the same zero-difference result for fresh, mid-patrol,
and completed saves. The strict quality gate now rejects underscore-prefixed
state writes outside `state.runtime`.

The six removed tick initializers are `ensureTacticalExtensions`,
`ensureWorldExtensions`, `ensurePatrolRuntimeContext`,
`ensureCareerPatrolState`, `ensureHistoricalCampaignProfile`, and
`ensureMissionFramework`. The old order is preserved in
`tests/call-graph-baseline-pre-step8.json`; the active baseline now records the
post-8c order without filtering.
