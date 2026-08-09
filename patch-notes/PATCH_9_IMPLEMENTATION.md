# Patch 9 — Historical campaign, without grind

Patch 9 makes the patrol calendar the progression system. There is no XP tree and no unlock currency. Patrol date and area select a compact historical profile that the existing simulation systems consume.

## Campaign bands

The game uses broad campaign bands, not a per-boat refit database:

- **EARLY WAR** — before 1 January 1943.
- **MID WAR** — calendar year 1943.
- **LATE WAR** — 1 January 1944 onward.

The exact cut-over dates below are gameplay abstractions chosen to make patrols feel different while remaining broadly historically grounded; they are not claims that every submarine received identical equipment on one fleet-wide date.

### Torpedoes

- Mark 14 reliability improves in steps through 1943 and is markedly better in 1944.
- The player's selected reliability mode still matters; the calendar multiplies it rather than replacing it.
- Mark 18 electric torpedoes become selectable from 1 September 1943. Earlier attempts are refused with an explicit refit/calendar warning.
- A save or scenario rewound to an earlier date cannot retain a future torpedo loadout; it safely falls back to Mark 14 Fast.

### Radar and sound

- SD: available from the existing April 1942 broad campaign fit.
- SJ: available from the existing July 1942 broad campaign fit.
- Early SJ has shorter range and more error; mid-war improves; late-war SJ has a larger tactical envelope, smaller measurement error and a faster sweep.
- Late-war SJ can be used to 48 ft radar depth, preserving the prior game rule.
- Passive sound quality improves modestly late war.

### Japanese opposition

- Existing year-based escort counts remain in force: early convoys are less heavily screened and late convoys more strongly screened.
- Active sonar cycles, solution error and depth-charge placement improve with the calendar.
- Air threat rises from early to late war.
- Surface-running opportunity is deliberately more forgiving early and narrower late. This is a gameplay doctrine modifier to enemy lookout effectiveness, not a claim that human eyesight changed.

### Traffic and merchants

- Early war has denser/slower merchant traffic and more surface opportunities.
- Late war has fewer abstract traffic groups, but surviving enemy merchants are on average larger and slightly faster.
- Area flavour modifies the calendar profile: Truk remains air/ASW-heavy; late Luzon is tougher and richer in larger targets; early Java is relatively favourable to surface running.

## Refit flow

Completing a patrol schedules the next patrol 18–28 deterministic calendar days later. Crossing an equipment threshold produces messages such as:

`REFIT COMPLETE — SJ surface-search radar fitted.`

or

`REFIT COMPLETE — Mark 18 electric torpedoes now available.`

The briefing shows `WAR CALENDAR`, current `EQUIPMENT`, and any `REFIT` messages. Career/AAR records freeze the historical profile and equipment fit used on that patrol.

## Performance

The historical profile is a small immutable object recalculated only when a patrol date changes. It adds no render loop, canvas, WebGL context, offscreen buffer or per-frame allocation system.
