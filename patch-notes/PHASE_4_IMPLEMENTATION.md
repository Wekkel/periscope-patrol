# Phase 4 — Career history, Captain's Log and debrief data

Phase 4 adds persistent patrol history without changing combat physics from Phases 1–3.

## Persistent career schema

`ss2_career` now normalizes to schema version 2:

- `version`
- `totalScore`
- `totalTonnage`
- `totalShips`
- `patrolHistory[]`
- `commendations[]`
- `legacyPatrols` (migration-only preservation of the old aggregate patrol count)

The old `tonnage` field migrates to `totalTonnage`; the old `patrols` count is retained as `legacyPatrols`. The old schema contains no ship count and no per-patrol details, so Phase 4 deliberately does not invent old patrol records or old ship totals.

## Patrol records

A completed or lost patrol is finalized through one idempotent code path and written once to `patrolHistory`. Each record contains the requested debrief facts, including dates, duration, outcome, sunk/damaged ships, tonnage, torpedo statistics, deck-gun statistics, aircraft kills, optional objectives, hull condition and curated important events.

New patrols receive a unique history id. Pre-Phase-4 saves receive a deterministic fallback id so reloading and finalizing the same legacy patrol cannot append the same patrol twice.

The persistent layer is append-only for patrol history: an existing record id is returned rather than replaced. The stored record is a JSON clone of the finalized snapshot, so later mutations of the active patrol do not mutate history.

## Real counters, not debrief-only counters

The debrief reads existing gameplay state:

- torpedoes fired: `weapons.nextTorpedoId - 1`, i.e. the real launch sequence;
- torpedo hits: real non-deck-gun entries in `weapons.hits`;
- duds: `weapons.duds`;
- deck-gun rounds: existing `weapons.deckGun.shots` incremented by `fireDeckGun()`;
- deck-gun hits: existing `weapons.deckGun.hits` incremented by `damageShipByDeckGun()`;
- aircraft kills: existing `world.aaKills`;
- sunk ships/tonnage: actual world contacts and campaign tonnage state.

No parallel fictitious statistics counters were introduced.

## Captain's Log

The ordinary patrol log remains unchanged and verbose. `campaign.importantEvents[]` is a separate curated log. Phase 4 currently records major events at the real gameplay hooks for:

- convoy sighted;
- ship sunk (torpedo or deck gun);
- heavy unit identified at Truk;
- mine struck;
- depth-charge attack survived after contact is finally lost;
- returned to port;
- boat lost.

Event keys prevent one-off events such as convoy sighting, heavy-unit identification and return-to-port from duplicating themselves.

The active Captain's Log is visible in Status on touch layouts and above the full patrol log on desktop.

## Lost patrols

`SimEngineCore.update()` checks for `missionStatus === 'LOST'` both before integration and after the simulation step. This is intentional: a loaded/paused lost state is finalized, and a boat destroyed during the current simulation step is also finalized immediately. `finalizePatrol()` is idempotent, so repeated updates while sunk cannot duplicate the record.

A lost patrol is historical data; Phase 4 does not award/bank its unbanked patrol score into the career score unless existing game rules already did so. Its debrief nevertheless retains the patrol score achieved before loss.

## Commendations

Commendations are persistent historical badges only. They do not modify state, physics or combat:

- First War Patrol
- 50,000 tons sunk
- Successful Truk penetration
- Returned with critical hull damage

## UI

The scenario/menu overlay now has a `Career` tab showing:

- war-record totals;
- commendations;
- reverse-chronological completed/lost patrol cards;
- torpedo/deck-gun/aircraft statistics;
- optional-objective results;
- the patrol's Captain's Log.

This is deliberately a compact history/debrief view rather than a new progression system.
