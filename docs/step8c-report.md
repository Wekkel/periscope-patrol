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

Accessor progress is delivered in groups. Group 1 (`campaign._*`) and group 2
(`playerSub._*` and contact `_collisionPrev`) now move values into
`state.runtime.campaign`, `state.runtime.playerSub`, and
`state.runtime.collisionPrev`; their readers no longer use compatibility
accessors. The remaining groups are environment, TDC/time, and deck-gun/AAR
runtime fields.

For group 2, all three save variants compare with zero persistent-field
differences: fresh 3654 fields, mid-patrol 3677, completed 3694. No field in
these groups required a behavior-changing exception.

The six removed tick initializers are `ensureTacticalExtensions`,
`ensureWorldExtensions`, `ensurePatrolRuntimeContext`,
`ensureCareerPatrolState`, `ensureHistoricalCampaignProfile`, and
`ensureMissionFramework`. The old order is preserved in
`tests/call-graph-baseline-pre-step8.json`; the active baseline now records the
post-8c order without filtering.
