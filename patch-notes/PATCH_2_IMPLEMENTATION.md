# Patch 2 — Surface Watch: Bridge View

This patch adds a surface-only BRIDGE station without introducing a second rendering engine.

## Runtime design

- BRIDGE is available while surfaced/awash (up to 12 ft) and is automatically left when a dive order is given.
- Wide watch uses an 82° horizontal FOV. BINOCULARS uses 24°.
- Drag rotates the watch bearing. Pinch/double-tap toggles binoculars on touch. Arrow keys continue to work on desktop; hotkey 5 selects BRIDGE.
- MARK writes a deterministic noisy visual bearing/range fix into the existing contact plot. It never stores exact truth in the track.
- TARGET designates a visible bridge contact through the existing selected-track/TDC state.
- GUN enters the existing auto-manned deck-gun station.
- Surface-watch visibility is better than periscope visibility, including early smoke cues, while existing enemy lookout logic makes a surfaced submarine much easier to sight.
- The view reuses the existing sky, sea, terrain, ship, wake, explosion and weather renderer. There is no circular scope mask.
- The bridge adds foredeck/rail, bow spray and distant smoke cues. Existing world sky rendering supplies stars/moon/horizon.

## Low-end device strategy

The target includes Helio G88 / 4 GB-class Android devices. This is a design target, not a claim of a physical-device benchmark.

- No new WebGL engine, texture atlas, OffscreenCanvas or permanent second canvas.
- Existing backing-store cap remains 2.2 MP; 4 GB devices cap DPR at 1.5.
- `deviceMemory <= 4` or `hardwareConcurrency <= 4` marks a low-spec device when those capabilities are actually reported.
- BRIDGE effect quality is capped at 0.58 on low-spec devices, while simulation/contact geometry remains full fidelity. The existing adaptive frame-time quality scaler may reduce effects further.
- Low-spec distant smoke uses two puffs instead of three and bow spray uses three strokes instead of five.

No Fase 0–4 or Patch 1 gameplay systems were intentionally redesigned by this patch.
