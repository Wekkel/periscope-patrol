# Patch 10 — Battle Atmosphere

Patch 10 is an information-bearing polish pass. Effects are driven by existing simulation state wherever possible rather than being decorative randomness.

## Searchlights and coastal batteries

Harbour searchlights now sweep a real search sector around the enemy datum. A surfaced/awash submarine is only illuminated when the moving beam physically crosses its actual bearing and is within the weather-limited beam range. A true searchlight contact improves the harbour datum and gives the coastal battery a better solution.

Coastal battery fire now has separate muzzle-flash and impact times. A shell is aimed at a predicted future position with an error depending on illumination, sea state and weather. The muzzle flash appears first; the shell lands after a range-dependent delay. Manoeuvring during time of flight can therefore turn a would-be hit into a visible splash. Repeated illuminated fall-of-shot gradually tightens correction; losing illumination lets that correction decay.

## Surface fighting

Escort surface gunfire creates short-lived muzzle flashes, tracers and shell-splash records. The existing combat outcome remains authoritative; Patch 10 adds readable visual evidence and bearing-aware distant gunfire / close shell-pass audio.

## Long-range information cues

A genuinely damaged or burning ship can make black smoke visible beyond the distance at which its hull has useful angular size. At night sufficiently severe fire creates a low horizon glow. Night convoy/escort coordination can produce brief signal-lamp patterns, visible only through the optical world view.

## Weather / sea / optics

The existing stars, moon, moving rain cells and storm lightning remain in place. Patch 10 adds a cool moon reflection path on the sea, speed/sea-state-dependent spray over the bridge, and a periscope broach wash when the scope head is working through a rough surface band.

## Audio

The existing procedural WebAudio system remains asset-free. Added or refined cues include:

- active sonar ping panned from the real escort bearing;
- vessel-type-dependent screw cadence in the SOUND room;
- hydrophone torpedo machinery noise while listening in SOUND;
- rain / sea / wind ambience in exposed optical stations;
- surface diesel/exhaust rumble tied to actual RPM;
- distant gunfire by bearing;
- shell-pass and shell-impact cues;
- deep-hull creaks at substantial depth.

No audio files are added.

## Performance limits

The new battle state contains only short bounded arrays: 28 tracers, 24 splashes, 18 muzzle flashes and 8 signal events maximum. Searchlight rendering uses 6 segments on low-spec devices and 9 otherwise. Long-range damaged-ship cues are capped at 4 low-spec / 7 normal. No new `requestAnimationFrame`, Canvas, WebGL context, OffscreenCanvas, texture system, or persistent particle engine is introduced.
