# Patch 6 test report

All pre-existing contract suites (Phase 0–4, Patch 1–5, visual refinement and MAP-track stability) were rerun on the final Patch-6 build and passed. Patch 6 has its own `tests/patch6-mission-framework.cjs` contract.

Concrete Patch-6 results from the final deterministic contract:

- 57 runtime JavaScript files passed `node --check`, and all 57 script paths referenced by `index.html` exist.
- All six primary mission families configure with exactly one `primaryMission`; each begins with zero framework-created optional objectives.
- A pre-Patch-6 state without mission fields migrates to `CONVOY_INTERDICTION` and retains prior objective progress (`locate/attack/evade/return`).
- AUTO selection exercised across 100 deterministic seeds produced all six primary mission families.
- Truk: zero optional objectives initially; after copied special intelligence exactly one `truk-raid` optional exists; refreshing does not duplicate it and it remains non-failing.
- High Value Intercept: the deterministic run produced a Light Carrier with the reported intel fix 1.579 nm from its real position. Visual ID + a real severe propulsion mission-kill completed the mission. The 1,700-point primary reward was credited once and remained 1,700 after a second mission check.
- Reconnaissance: two assigned targets were visually identified. Firing near the anchorage set `compromised=true`, raised air threat by 0.35 and did not auto-fail the mission. With identification complete, withdrawing beyond 8 nm completed the primary.
- Lifeguard: the airman-down event spawned one raft and stopped 16x time compression. The raft was initially unknown, then an SJ-radar track located it. Twenty seconds in the exact recovery position while submerged produced zero recovery hold; 15 seconds surfaced/slow recovered the airman, removed the raft and completed the mission.
- Special Transport: 90 seconds in the rendezvous during daylight produced zero transfer progress. The same 90 seconds at night, surfaced and <=2 kn completed the transfer. Clearing the 4 nm ring completed the mission. A separate linger test raised air threat by 0.45 and stopped 16x compression when the enemy response clock expired.
- Minelaying: 32 seconds in the mine box while surfaced produced zero mines. Correct depth/heading/speed then automatically laid exactly 12 mines in 96 seconds and completed the primary.
- Classic Convoy Interdiction still records locate/attack and completes into RETURN TO BASE under the new mission framework.
- Save/load preserved `MINELAYING` and the two stored mine records used in the persistence test. Career/debrief preserved the mission type and primary mission result.
- MAP render harness drew `HVT — REPORTED AREA`; it does not receive the hidden exact HVT location from mission truth.
- Static low-end check confirms the mission module adds no WebGL, OffscreenCanvas, canvas creation or independent RAF loop; mine data is capped at 12 and lifeguard uses one raft.

See `PATCH_6_TEST_OUTPUT.txt` for the dedicated Patch-6 output and `PATCH_6_FULL_TEST_OUTPUT.txt` for the complete regression run.
