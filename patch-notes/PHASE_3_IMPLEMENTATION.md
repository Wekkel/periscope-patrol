# Phase 3 — subsystem damage and real damage-control choices

Phase 3 keeps the existing hull/flooding/ballast/motor/rudder/periscope damage model and adds only four subsystem values: `tdcDamage`, `gyroDamage`, `pumpDamage` and `electricalDamage`. It deliberately does not introduce a detailed engineering simulation.

## Damage architecture

A new simulation layer, `js/simulation/damage-control.js`, sits between vessel collision and final physics/navigation:

`SimEngineCollision -> SimEngineDamage -> SimEngine`

This module owns damage-state migration, deterministic subsystem casualties, persistent instrument calibration errors, pump casualties, drive-bank casualties, field-repair limits and repair priorities. Physics/navigation applies those effects; renderers only visualize them.

The existing hull/basic-system shock law is retained. New subsystem hits are selected deterministically from the patrol scenario seed plus the damage-event sequence. This gives reproducible casualties for the same seed and shock sequence without per-frame random flicker.

## Damage effects

- Periscope: low damage creates stable scratches/haze; moderate damage adds contrast loss, blur and distortion; the bearing/range observation develops a persistent calibration error; at >= 92% damage the optic becomes mostly unusable. The threshold is intentionally much later than the old hard failure.
- Rudder: the existing turn-rate penalty remains active.
- Ballast: the existing dive/rise-rate penalty remains and now also has a small stable trim tendency, rather than random depth hunting.
- TDC and gyro: fixed calibration biases are derived from patrol seed and current damage. Repeating the same calculation at the same damage state produces the same wrong answer.
- Motor/electrical: existing motor speed loss remains. Electrical damage also reduces available propulsion/charging efficiency and increases battery drain. Severe motor/electrical casualty can take one drive bank offline. That state persists until sufficiently repaired.
- Pumps: remain manually controlled because their acoustic cost is a tactical choice. Pump damage reduces dewatering capacity. A heavily damaged pump can trip after sustained work against significant flooding and stays unavailable until repaired/reset.

## Damage control

Repair parties deploy automatically when there is field-repairable work. The player chooses exactly one priority:

- FLOODING
- PROPULSION
- STEERING
- OPTICS / FIRE CONTROL

The selected group receives most of the available repair capacity. Other systems receive only a small stabilization rate. Flooding receives limited shoring even off-priority so a minor leak is not a mandatory micromanagement trap.

Pumps are separate from repair-party priority and remain an explicit ON/OFF tactical choice because they make the boat easier to hear.

Severe equipment damage receives an at-sea repair floor when the casualty occurs. Old saves that already contain severe legacy ballast/motor/rudder/periscope damage receive the corresponding field-repair floor during migration as well. A badly damaged optic or major machinery casualty therefore cannot be restored to factory condition at sea.

## UI

The old generic Damage Control action is not exposed as a button. Desktop and touch Helm views now show the four repair-priority choices plus a status line. The damage report now shows Electrical, TDC, Gyro and Pumps alongside the existing damage fields, and reports the selected priority and persistent casualties such as a tripped pump or offline drive bank.

## Save compatibility

No new save format/version wrapper is introduced. The existing save system continues to serialize the game state. On first simulation update, older saves are migrated in-place with zero damage for new subsystem fields, FLOODING as the default priority, and safe defaults for pump/drive-bank casualties. Existing severe legacy damage is retained and receives the new at-sea repair limit.
