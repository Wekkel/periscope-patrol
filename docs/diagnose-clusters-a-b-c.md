# Cluster diagnosis archive

This document records the findings parked while the P58 Step 7 refactor is
completed. It is diagnostic history, not an implementation specification for
the current refactor. No UI or gameplay change is authorized by this document.

## Cluster A — navigation grid and map interaction

The waypoint problem has two observable rejection paths. A clicked endpoint is
first clamped and checked as a navigable map point. That path reports a land or
unsafe-shoal refusal. If the endpoint itself is valid, the route planner then
tries to connect the current route tail to it. Failure of the bounded endpoint
search reports that no route was found from the current position; at least one
older interaction path returned without a player-facing notification.

The planner converts the click to the chart/grid representation before route
search. The open questions to measure remain:

1. Repeat the same click while holding the chart, speed, depth and heading
   constant, then repeat after controlled movement of a few hundred metres.
2. Record whether the result is endpoint rejection or route-search rejection.
3. Measure grid-cell dimensions against chart scale and the width of the
   physical channel.
4. Measure the coast/collision safety margin at the rejected and accepted
   points.
5. Measure route-search time and success rate with the expanded endpoint
   search radius, including a first-attempt failure followed by the fallback.

The intended later design is to distinguish an invalid point from a valid point
that cannot be reached from the current position, and to move a reported-but-
uncertain corridor click to the nearest reachable point with an explicit
message. Observed corridor geometry must remain exact.

## Cluster B — presentation effects and toast policy

Block B rev2 is installed and accepted. The simulation now routes player
notifications through the PresentationBridge, keeps critical messages visible,
suppresses useful-message summaries during transit, provides a VIEW IMPACT
action for every torpedo hit, uses a green waypoint-reached toast, reports a
missing torpedo target in amber, and uses a lighter red for red toasts.

The fixed test suite and boot harness were green for that delivery.

## Cluster C — cinematic state machine

The parked issues are the impact queue's skip transition, the ordering observed
under 32x time compression, and inconsistent station behaviour. A periscope
view was observed to start the cinematic automatically without first requiring
VIEW; this is the station-specific branch in `engine-core.js` around lines
58–61 (`PERISCOPE`/`BRIDGE` versus other stations).

The desired later behaviour is uniform: the hit is shown first on the station
the player is already viewing, then the cinematic is available through VIEW on
every station. Skipping must advance the queue without a black intermediate
frame, preserve the modal-pause invariant, and keep the ordering independent of
32x simulation speed.

No Cluster C implementation is part of the Step 7 refactor.
