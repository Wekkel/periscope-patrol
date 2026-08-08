# Phase 2 — Truk optional harbor raid

This patch is based on the reconstructed current build after modular refactor + arcade crew + Phase 0 + Phase 1. It changes knowledge state and mission presentation while leaving the physical Truk harbor defenses in `world.harbor` intact.

## State / mission model

- `campaign.optionalObjectives[]` now exists independently from required patrol objectives.
- `world.harborIntel` contains player knowledge only; `world.harbor` and physical contacts remain world truth.
- A new Truk patrol creates the physical harbor, mines, torpedo net and H-04 heavy unit immediately, but creates no optional objective.
- Fleet special intelligence becomes eligible after 480–900 seconds. Broadcast/pending radio is not mission knowledge.
- Only after the existing 40-second radio-copy process completes is `OPTIONAL — Investigate Truk Anchorage` created.
- Visual classification of H-04 upgrades the objective to Heavy cruiser or Fleet carrier. Hydrophone-only tracking cannot disclose the exact class.
- Raid state records `not_attempted`, `damaged`, `sunk` or `abandoned`; optional objectives are never marked failed.

## Harbor fog of war

Before special intelligence, the map receives no harbor-defense geometry from `drawMapHarbor`; the existing enemy-port marker remains the only harbor chart information.

After copied intelligence, the map shows only deliberately approximate `REPORTED MINEFIELDS` and a broad `REPORTED SWEPT CHANNEL`. The exact torpedo-net gate remains hidden.

Close visual reconnaissance tightens the minefield/channel knowledge to OBSERVED. The physical torpedo net is only added to the chart after visual observation near the net or very close physical contact. Hydrophone ranges are never drawn. Coastal batteries appear only as `POSSIBLE BATTERY` estimates after actual fire. Searchlight geometry is transient and is drawn only while a real sweep is active.

## Physical world remains authoritative

The existing mine points, net segments, harbor detection and weapons logic remain based on `world.harbor`. Tests explicitly confirm that an unknown net can still physically foul a torpedo and an unknown mine can still damage the submarine.

## Small bug fix encountered during physical acceptance testing

Two existing harbor explosion writes used `world.explosions`, although explosions are stored under `state.weapons.explosions`. This only surfaced when a real mine/battery hit was exercised. Those two writes now use `state.weapons.explosions`; mine/battery hit geometry and damage rules were not changed.

## Changed runtime files

- `js/core/state.js`
- `js/simulation/engine-core.js`
- `js/simulation/harbor.js`
- `js/simulation/radio-intel.js`
- `js/simulation/physics-navigation.js`
- `js/simulation/weapons/torpedoes.js`
- `js/simulation/weapons/deck-gun.js`
- `js/rendering/map.js`
- `js/ui/dom-view.js`
- `js/controllers/touch-controller.js`

No new runtime file paths are introduced in Phase 2.
