# Arcade Flight Simulator

The local Cesium-first Days 1–14 scope is implemented: browser foundation, aircraft rendering, globe-safe simulation, arcade handling, runway takeoff, landing, terrain and loaded-building crashes, five camera modes, HUD, worldwide airport and city search, shareable spawn URLs, six challenge routes, adaptive world quality, fallback behavior, and release-hardening tests. The app loads Cesium World Terrain, tuned aerial imagery, and progressively streamed OSM Buildings. Position is stored in ECEF, forces use the aircraft's current local ENU frame, and physics runs at a fixed 60 Hz. A basic OpenStreetMap globe is used if the ion world cannot load.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173` in desktop Chrome.

Create a public token at [Cesium ion](https://ion.cesium.com/tokens), restrict it to the assets and domains used by this project, and set:

```env
VITE_CESIUM_ION_TOKEN=your_public_token
```

Without a personal token, the local app uses Cesium's evaluation access. That access is suitable only for local evaluation.

## Verification

```bash
npm run verify:release
```

This performs the secret/config preflight, unit tests, production build, built-asset checks, and normal browser tests. It does not deploy or contact a hosting provider. The individual commands remain available as `npm run test`, `npm run build`, and `npm run test:e2e`. The longer deterministic city-transition check is deliberately separate and opt-in:

```bash
npm run test:memory
npm run test:memory:chrome
```

`test:memory` runs the fast two-lap streamed-city retention scenario. On macOS with Google Chrome installed, `test:memory:chrome` launches an isolated real-Chrome profile for a 15-minute controlled New York flight and records FPS, JavaScript heap, OSM tile memory, process-tree RSS, aircraft state, and browser errors in `output/playwright/chrome-memory-15m/acceptance.json`. Process-tree RSS is an OS-level approximation and does not replace reading the simulator tab and GPU process in Chrome Task Manager.

## Architecture

- `src/flight`: ECEF/geodetic/ENU math, quaternion transforms, fixed-step aircraft state, aerodynamics, ground interaction, landing and crash classification, and centralized tuning.
- `src/systems`: keyboard state, direct Cesium aircraft rendering, five-mode cameras, procedural Web Audio, scene collision, and the accumulator-driven simulation engine. React receives telemetry at roughly 10 Hz rather than owning per-frame transforms.
- `src/world`: the Cesium production provider, basic fallback provider, locked photorealistic evaluation provider, terrain sampling/cache/prefetch, and adaptive quality control. Terrain and streamed-building surfaces are reconciled separately by the simulation collision layer.
- `src/services` and `src/data`: compact airport/runway search, submitted Nominatim city search with throttling/cache, photorealistic geocoding, and shareable spawn URL parsing.
- `src/challenges`: six route definitions, spawn conversion, route geometry, and progress rules used by the challenge library and in-flight tracker.
- `tests/e2e`: runway/pause/respawn, photorealistic lock, Basic World fallback, streamed-building collision/recovery, and the opt-in two-lap memory soak.

## Flight controls

| Input | Action |
| --- | --- |
| W / S | Pitch down / pull up |
| Up / Down arrows | Pitch down / pull up |
| Q / E | Roll left / right |
| Left / Right arrows | Roll left / right |
| A / D | Steer on the ground / yaw in flight |
| Shift / Control | Increase / decrease throttle |
| B | Hold wheel brakes |
| V | Cycle External / External far / Flyby / Top down / Cockpit |
| R | Respawn at the selected start |
| M | Return to Explore/world search |
| Escape | Pause / resume |

Sound is enabled by default and begins after the first click or keyboard interaction, as required by browser autoplay rules. The header toggle mutes or restores engine, wind, runway-roll, touchdown, and crash audio. Audio is generated locally through Web Audio with no downloaded sound assets or runtime audio requests.

## Worldwide search and links

- Airport search supports airport name, municipality, ICAO, and IATA. Results use a compact OurAirports-derived dataset and expose the best suitable runway in the dataset.
- City search is submitted manually. The standard Cesium world uses Nominatim with local caching and a one-request-per-second throttle; the guarded Google Photorealistic evaluation uses Cesium ion's Google geocoder. There is no live geocoder autocomplete.
- Selecting a result updates the browser URL with the airport or coordinates, spawn mode, heading, and airborne altitude so the location can be shared or reloaded.
- Airport markers are shown in Cesium while reviewing search results and cleared when flight begins.

## Challenges

The Challenges screen contains six curated routes: Tagus River Arrival, Hudson River Commuter, Monaco Coastal Return, Paris Left Bank Visual, Madeira Ridge Arrival, and Big Sur Coastal Checkride. Selecting a card shows its briefing, objectives, route legs, distance, origin, destination, and fixed local start time. Starting a challenge uses its configured runway and daylight time, then displays an in-flight leg tracker.

Takeoff and geographic waypoint progress are automatic. A landing leg completes only after the aircraft is grounded near the destination and slows below 45 knots. Respawning restarts the active route from leg one. The library, filters, representative start, and mobile layout are browser-verified; completing every route remains a manual acceptance item.

## Cesium world quality

- Imagery contrast, saturation, brightness, atmosphere, and fog culling are tuned for clearer low-altitude flight without changing providers.
- OSM building walls receive a lightweight procedural window-and-floor material with lighter roofs, so nearby structures read as buildings instead of uniformly shaded extrusions. It is a visual treatment, not photogrammetry.
- Terrain and OSM Buildings use separate level-of-detail and cache budgets. Terrain contact comes from sampled terrain; limited building collision uses loaded, pickable scene geometry and therefore cannot detect buildings whose tiles have not streamed yet.
- OSM Buildings use progressive, foveated, and movement-aware tile loading so the forward view resolves first during continuous flight.
- Render quality starts at medium, lowers only after four sustained seconds below 30 FPS, and increases only after ten sustained seconds above 52 FPS. An eight-second cooldown prevents rapid quality oscillation. Automatic quality is capped at Medium on browsers reporting 8 GB of device memory or less.
- Terrain samples are prefetched along the velocity path and stored in a bounded cache for smoother AGL and collision behavior during tile loading.
- Distant city transitions release no-longer-selected OSM tiles and briefly reduce the terrain cache after the destination renders; local respawns remain cache-friendly.

## Photorealistic evaluation lock

Google Photorealistic 3D Tiles were evaluated once through Cesium ion at Mumbai and are off by default. Both conditions are required to load them: `VITE_ENABLE_PHOTOREALISTIC_EVALUATION=true` at build time and `?world=photorealistic` in the URL. With the documented default `false`, even a retained test URL resolves to the normal Cesium World Terrain, imagery, and OSM Buildings provider. The evaluation provider keeps Cesium World Terrain separate for flight collision, disables tileset collision, uses the Google geocoder, displays required attribution, and applies conservative memory limits.

## Aircraft asset

The app uses `public/assets/aircraft/cessna-172sp.glb`. GLB was chosen over the unpacked glTF because its geometry, materials, and textures travel as one deployable file. The source asset is “FREE Cessna 172SP” by NLM, licensed under CC BY 4.0; the supplied license is retained beside the model.

## Data and service credits

- World rendering and terrain: CesiumJS and Cesium World Terrain, with the attributions shown by the Cesium viewer.
- Building scenery: Cesium OSM Buildings / OpenStreetMap contributors.
- Airport and runway records: [OurAirports public-domain data](https://ourairports.com/data/), preprocessed into the bundled compact JSON.
- Submitted city search: [OpenStreetMap Nominatim](https://nominatim.org/) under its public usage policy; no live autocomplete is sent.
- Aircraft: “FREE Cessna 172SP” by NLM, CC BY 4.0. Full attribution is retained in `public/assets/aircraft/LICENSE.txt`.

## Known limitations

- OSM Buildings are textured/extruded map geometry rather than full photogrammetry. Collision uses streamed Cesium scene surfaces, so very distant or not-yet-loaded buildings cannot collide until their tile geometry is available.
- Runway starts use dataset headings and elevations but do not include detailed runway mesh or airport ground infrastructure.
- City search needs network access and depends on the public Nominatim service. Airport search works from the bundled dataset.
- Keyboard controls and desktop Chrome are the committed platform. Mobile, gamepads, weather, multiplayer, ATC, and additional aircraft are outside this version.
- The Google photorealistic provider is an evaluation path only, remains off by default, and is not required by the normal simulator.

## Manual acceptance and demo pass

Before presenting, run `npm run verify:release`, then use a clean desktop Chrome profile to check Dubai at the intended window size. Complete three runway takeoffs, a roll, loop, five seconds inverted, a steep-dive recovery, a landing and full stop, a deliberate crash/respawn, one distant airport spawn, one city spawn, and a pause/tab-switch recovery. The automated suite covers the deterministic math and state transitions; final full-screen FPS and subjective handling still require this manual pass on the target Mac.

Suggested recording sequence: Dubai runway takeoff, roll, loop, cockpit/chase switch, approach, touchdown, braking, and stop. Keep the world provider in its default Cesium mode for the recording.

## Feature-freeze checkpoint

The takeoff–flight–landing–stop and crash–respawn loops are active worldwide. Chase and cockpit cameras, complete flight telemetry, airport/city spawning, URL reloads, adaptive Cesium quality, terrain/building collision, terrain fallback, and local release verification are connected. The standard Cesium world remains the frozen default. Photorealistic tiles showed a visual improvement during evaluation but stay locked off to preserve the monthly root-tile quota and are not part of the required path. No deployment is performed by the release command.
