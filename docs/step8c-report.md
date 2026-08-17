# STEP 8c — hot-path runtime initialization

The schema initializers now run at lifecycle boundaries (`createState`, load,
and `NEW_PATROL`) instead of at the top of every simulation tick. The gameplay
call-order check intentionally filters only the six schema-initializer calls
that were removed from `update()`; the immutable pre-STEP-7 baseline remains
unchanged.

Renamed validators:

- `ensureWaterRoute` → `resolveWaterRoute`
- `ensureHarborApproachWater` → `validateHarborApproachWater`

The current harness reports 34 `updateSub` calls, zero runtime-load
differences for fresh, mid-patrol, and completed saves, and all 71 command
paths execute successfully.

Known open item: the legacy underscore compatibility accessors are still
present for the 23 named legacy fields (plus per-contact collision snapshots).
They remain behavior-preserving until every reader is moved to explicit
`state.runtime` paths. This is intentionally reported rather than silently
claiming that accessor removal is complete.
