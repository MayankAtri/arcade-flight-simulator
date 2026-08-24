# Arcade Flight Simulator — Project Overview, Current State, and Continuation Plan

Last updated: **2026-08-24 (Asia/Kolkata)**  
Repository: `/Users/mayankatri/Projects/Flight SImulator `  
GitHub remote: `https://github.com/MayankAtri/arcade-flight-simulator.git`

> **Read this file first in a new chat.** It is the main project handoff and explains the product goal, technical architecture, completed work, current behavior, remaining validation, and working constraints. `CURRENT_WORK.md` contains the narrower history of the most recent lighting work. The original planning document in Downloads is historical; where it disagrees with this file, this file describes the current project.

---

## 1. Project in one paragraph

Arcade Flight Simulator is a desktop-browser flight game built with React, TypeScript, Vite, and CesiumJS. It places a flyable Cessna-style aircraft anywhere on a continuous 3D globe, supports runway and airborne starts, and provides deliberately arcade-oriented but physically coherent takeoff, flight, maneuver, landing, crash, and respawn behavior. The production direction is **Cesium-first**: Cesium World Terrain, aerial imagery, and Cesium OSM Buildings are the normal world. Google Photorealistic 3D Tiles are an optional, guarded evaluation mode and are not required for development, presentation, or future deployment.

The intended feel is:

> Believable takeoff, skill-based arcade handling, forgiving but coherent landing, and recognizable worldwide scenery.

This is not a study-level aviation simulator. It uses simplified custom physics, prioritizes fun and clarity, and does not attempt CFD, detailed engine simulation, or certified aircraft behavior.

---

## 2. Product goals

The simulator should let a user:

1. Open the project in desktop Chrome.
2. Search for an airport by name, ICAO, or IATA, or submit a city search.
3. Spawn aligned to a selected runway or airborne at 1,000 ft AGL.
4. Throttle up, steer, rotate, and take off.
5. Fly with responsive handling that still requires speed and energy management.
6. Perform rolls, loops, inverted flight, steep turns, dives, and recovery.
7. Lose climb performance during excessively steep, low-energy climbs.
8. Cycle between four exterior camera modes.
9. Land with smooth, hard, severe, and crash outcomes.
10. Brake to a stop, deliberately crash, and respawn quickly.
11. Fly anywhere on the globe without a fixed regional coordinate origin.
12. Adjust a fixed local daylight time from dawn through sunset.
13. Choose Clear, Scattered, or Cloudy visual weather before a free flight.

### Performance targets

- Required: at least 30 FPS in dense cities on a 13-inch M2 MacBook Pro with 8 GB RAM.
- Preferred: 45–60 FPS during normal flight.
- Quality should adapt after sustained performance changes rather than oscillating every frame.

### Current platform commitment

- Desktop Chrome.
- Keyboard input.
- Online Cesium assets for the full world.
- No deployment is currently requested.

---

## 3. Non-goals and deferred work

These features are intentionally outside the present commitment unless the user explicitly expands scope:

- Mobile and touch controls.
- Gamepad support.
- Multiplayer.
- Air traffic control.
- Dynamic or physical weather beyond the three visual presets.
- Multiple aircraft.
- Detailed engine, fuel, damage, tire, suspension, or propwash simulation.
- Detailed airport/runway meshes and airport infrastructure.
- Realistic building interiors.
- Real-time circumnavigation as an acceptance requirement.
- Production Google Maps dependency.
- Automatic time cycling or night flight.
- Deployment to Vercel or another host.

Free flight now includes deliberate Clear, Scattered, and Cloudy visual presets. They use Cesium's native procedural noise clouds rather than the removed repeated raster-billboard experiment. The presets do not add wind, turbulence, rain, wet surfaces, collision, or cloud shadows.

---

## 4. Important product decisions

### Cesium is the default world

The normal simulator uses:

- CesiumJS.
- Cesium World Terrain with vertex normals and water masks.
- Cesium world/aerial imagery.
- Cesium OSM Buildings.

Google Photorealistic 3D Tiles were evaluated and are still implemented behind a strict opt-in. They are not the default and should not be loaded casually because the account has a limited monthly root-tile quota.

### Google mode is evaluation-only

Google mode loads only when both conditions are true:

```env
VITE_ENABLE_PHOTOREALISTIC_EVALUATION=true
```

and the URL contains:

```text
?world=photorealistic
```

With the normal environment value of `false`, even a URL containing `world=photorealistic` resolves to the standard Cesium world. Do not turn this flag on or browse Google mode unless the user explicitly requests it.

Google mode uses Google location search through Cesium ion, keeps Cesium World Terrain separately for terrain collision, disables tileset collision, and shows required attribution. The lighting system affects Google tiles through Cesium scene light and image-based/environment lighting, but shadows and illumination baked into photographed Google textures cannot be removed completely.

### Global coordinates are ECEF, not a fixed city origin

Aircraft position, velocity, and orientation use Earth-centered Earth-fixed coordinates. The flight model derives a local east-north-up basis at the aircraft's current position for every physics step. There is no single Dubai ENU origin and no regional coordinate boundary.

### Physics stays outside React

The fixed-step simulation, aircraft transform, camera, terrain, audio, and collision systems run outside React state. React receives a compact telemetry snapshot roughly every 100 ms for the HUD.

### Building collision now exists

The original Cesium-first plan excluded building collision. The user later requested it, so the current implementation includes limited collision against loaded Cesium OSM/Google scene geometry. This is an intentional change from the original plan.

---

## 5. Technology stack

| Area | Technology |
| --- | --- |
| App | React 19, TypeScript, Vite |
| Globe/rendering | CesiumJS 1.144 |
| Physics | Custom TypeScript arcade flight model |
| Unit tests | Vitest |
| Browser tests | Playwright |
| Audio | Browser Web Audio API; procedurally generated |
| Airport data | OurAirports-derived bundled JSON |
| Standard city search | OpenStreetMap Nominatim |
| Optional photo world | Google Photorealistic 3D Tiles through Cesium ion |
| Intended host | Vercel, but deployment is not currently authorized |

---

## 6. Repository map

```text
src/
├── app/
│   └── App.tsx                    React UI, HUD, world search, daylight control
├── config/
│   └── env.ts                    Public environment configuration
├── data/
│   ├── airports.json             Compact generated airport/runway dataset
│   └── types.ts
├── flight/
│   ├── FlightModel.ts            Aerodynamics, arcade assists, ground/contact states
│   ├── tuning.ts                 All important handling and contact constants
│   ├── coordinates.ts            Geodetic, ECEF, and ENU conversions
│   ├── math.ts                   Vector and quaternion math
│   └── types.ts                  Aircraft, controls, environment, telemetry, spawn types
├── services/
│   ├── AirportService.ts         Ranked local airport search
│   ├── GeocodingService.ts       Throttled/cached Nominatim city search
│   ├── PhotorealisticGeocodingService.ts
│   └── SpawnUrlService.ts        Shareable URL parsing and serialization
├── systems/
│   ├── SimulationEngine.ts       Cesium viewer and fixed-step runtime orchestration
│   ├── InputManager.ts           Keyboard state and one-shot actions
│   ├── AircraftRenderer.ts       Direct GLB model matrix and aircraft lighting
│   ├── CameraSystem.ts           Four exterior flight cameras
│   ├── AudioSystem.ts            Engine, wind, ground roll, touchdown, crash audio
│   └── SceneCollisionSystem.ts   Loaded building/photogrammetry collision probes
└── world/
    ├── CesiumWorldProvider.ts    Primary world
    ├── BasicWorldProvider.ts     Failure fallback
    ├── GoogleWorldProvider.ts    Guarded photorealistic evaluation
    ├── TerrainSamplingSystem.ts  Cache, network sampling, path prefetch
    ├── AdaptiveQualityController.ts
    ├── DaylightSystem.ts         Fixed dawn-to-sunset solar lighting
    ├── WeatherSystem.ts          Deterministic native procedural cloud fields
    └── types.ts                  Provider, daylight, and weather contracts

public/assets/aircraft/
├── cessna-172sp.glb
└── LICENSE.txt

scripts/
├── build-airports.mjs            Generates compact airport JSON
└── verify-release.mjs            Secret/config and built-output checks

tests/e2e/
├── day-four.spec.ts
└── release-hardening.spec.ts
```

---

## 7. Core runtime architecture

### Aircraft state

The authoritative state is:

```ts
type AircraftState = {
  positionECEF: Vec3;
  velocityECEF: Vec3;
  bodyToECEF: Quat;
  angularVelocityBody: Vec3;
  throttle: number;
  brakes: number;
  flaps: number;
  grounded: boolean;
  crashed: boolean;
};
```

SI units are used internally. The HUD converts speed to knots, altitude to feet, and vertical speed to feet per minute.

### Fixed-step loop

- Physics runs at 60 Hz using an accumulator.
- Render frames interpolate position and quaternion orientation between physics states.
- A maximum of eight physics steps are processed per render frame.
- Large timing gaps from tab switches or pauses are clamped/reset.
- Per-frame Cesium and math objects are reused where practical.
- Telemetry is published to React at approximately 10 Hz.

### Coordinate flow

```text
Aircraft ECEF position
        ↓
Geodetic latitude / longitude / height
        ↓
Local ENU basis at the current aircraft position
        ↓
Local aerodynamic forces and control response
        ↓
Transform forces back into ECEF
```

Quaternion orientation is unrestricted, so continuous rolls, inverted flight, and loops do not hit Euler pitch limits.

---

## 8. Flight model and handling philosophy

The model applies simplified versions of:

- Gravity.
- Propeller thrust.
- Lift based on airspeed and angle of attack.
- Parasite and induced drag.
- Pitch, roll, and yaw response.
- Angular damping.
- Sideslip and vertical-slip damping.
- Rolling resistance and brakes.
- Flap lift/drag effects.

The aircraft is arcade-oriented but not omnidirectional. The user specifically asked that rolls and loops require some skill and that an overly steep climb lose energy. The current tuning therefore includes:

- A low-speed control floor so controls never become completely dead.
- Reduced pitch and roll authority at low speed.
- Neutral trim that carries level flight above the stall instead of imposing a constant sink.
- Angle-of-attack-sensitive lift.
- A forgiving stall rather than an instant loss of control.
- Steep-climb energy bleed.
- Reduced powered-climb assistance near vertical attitudes.
- Deep-stall pitch-down behavior.
- Gravity dominance and nose-drop recovery only after airspeed reaches the stall region.
- Roll/banked-climb damping to prevent free altitude gain during barrel rolls.
- Dive and stall recovery assistance when the player releases the conflicting input.

All important constants live in `src/flight/tuning.ts`. Do not scatter new magic handling numbers through other files.

### Known climb-tuning evidence

A user screen recording showed an unrealistic climb from roughly 1,000 ft to roughly 1,870 ft after pulling up from about 90 knots at full throttle. The steep-climb model was retuned so the equivalent deterministic diagnostic peaks much earlier and gravity takes control once speed is depleted. The current behavior still needs subjective flight testing whenever related constants change.

---

## 9. Ground, takeoff, landing, and crash behavior

### Ground and takeoff

- Runway spawns align the aircraft to the best stored runway heading.
- Terrain/runway height is sampled before spawn when possible.
- The aircraft begins grounded with a configured wheel clearance.
- Thrust accelerates it along the surface.
- Steering authority rises with ground speed.
- Pitch authority on the runway begins only after a configured speed.
- Takeoff requires adequate lift, forward speed, and nose-up rotation.

### Landing outcomes

Touchdown classification uses vertical speed and attitude thresholds:

- Smooth landing.
- Hard landing.
- Severe landing.
- Crash.

Landing is intentionally forgiving and repeatable rather than fully realistic. Brakes can bring the aircraft to a stop after touchdown.

### Terrain collision

Terrain height comes from Cesium terrain sampling rather than rendered building geometry. Samples are cached, updated several times per second, and prefetched along the aircraft's velocity path. During temporary network failure the system retains a recent or spawn/runway value rather than allowing uncontrolled ground clipping.

When grounded or crashed, AGL should read 0 ft rather than the model's visual wheel/center clearance.

### Building collision

`SceneCollisionSystem` periodically probes three points in front of the aircraft and uses Cesium screen picking plus depth position recovery. It only accepts hits belonging to the active building/photorealistic tileset and within a bounded distance.

Limitations:

- Only loaded and pickable streamed geometry can collide.
- A distant building cannot collide before its tiles exist locally.
- The system is an arcade safety layer, not exact mesh-to-mesh collision.
- Sampling is throttled to protect low-altitude FPS.

---

## 10. World providers

All providers implement:

```ts
interface WorldVisualProvider {
  readonly label: string;
  readonly terrainProvider: TerrainProvider | null;
  initialize(viewer: Viewer): Promise<void>;
  setQuality(level: "low" | "medium" | "high"): void;
  setDaylight(state: DaylightState): void;
  isBuildingPick(picked: unknown): boolean;
  destroy(): void;
}
```

### `CesiumWorldProvider` — primary

- Cesium World Terrain.
- Aerial/world imagery.
- Cesium OSM Buildings.
- Tuned imagery brightness, contrast, saturation, and gamma.
- Procedural facade/window material to help OSM extrusions read as buildings.
- Foveated, progressive, and movement-aware tile loading.
- Separate terrain and building detail/cache budgets.
- Receives shared dawn/noon/sunset lighting.

### `BasicWorldProvider` — fallback

- OpenStreetMap imagery.
- Ellipsoid terrain.
- Used only when online Cesium assets fail.
- Keeps the simulator usable but does not match the primary world's terrain/building fidelity.

### `GoogleWorldProvider` — optional evaluation

- Google Photorealistic 3D Tiles through Cesium ion.
- Hidden globe for rendering, separate Cesium terrain for collision.
- Google geocoder.
- Conservative tile detail and memory budgets.
- Shared daylight state.
- Off by default and not needed for the project's definition of done.

---

## 11. Adaptive quality and performance

The simulator starts at medium quality. The controller observes two-second FPS windows:

- Quality is lowered only after sustained sub-30 FPS behavior.
- Quality is raised only after a longer sustained period above roughly 52 FPS.
- A cooldown prevents rapid oscillation.

Provider quality levels adjust:

- Cesium resolution scale.
- Terrain screen-space error and cache size.
- OSM/Google tileset screen-space error and memory.
- Foveated and dynamic screen-space error.
- Fog culling.
- Terrain lighting/water detail where appropriate.
- Native procedural cloud counts and range.

The target is sustained playability, not maximum tile detail at all times. Near-ground building/terrain streaming has previously caused major FPS drops, so performance changes must be tested during takeoff and low-altitude city flight, not only while paused at altitude.

---

## 12. Daylight system

The daylight feature uses three fixed lighting states, not a clock simulation:

- User-facing choices: Sunrise, Noon, Sunset.
- The clock slider and numeric local-time labels are intentionally removed.
- Default: Noon.
- No automatic cycling.
- No night option.
- Selected time remains fixed while flying.

`DaylightSystem` converts selected local solar time into a deterministic Cesium clock time using aircraft longitude and a fixed date anchor. It updates:

- Cesium sun direction and color.
- Scene and sky atmosphere.
- Background color.
- Fog brightness.
- HDR exposure.
- Cesium imagery.
- OSM buildings.
- Google evaluation tiles.
- Aircraft direct and image-based lighting.

The palette is intentionally blue-neutral with restrained warm direct sunlight. Do not restore the earlier pink/magenta atmosphere. The aircraft GLB contains an embedded door animation; it is intentionally not autoplayed, so changing daylight does not open or close the doors.

Flight mode suppresses Cesium's space skybox so stars cannot bleed through the sunrise-to-sunset sky. Explore mode retains the star backdrop around the orbital globe. Sunrise uses a brighter, cooler cyan-blue sky while sunset uses a deeper late-day blue; terrain, sun direction, exposure, and aircraft lighting remain geographically driven by the shared daylight profile. Deterministic internal solar hours still place the sun, but the interface presents only the three named lighting states.

Free-flight weather is selected only before takeoff and remains fixed in flight. Clear adds no clouds and preserves the approved daylight profile. Scattered adds sparse deterministic cumulus groups with a mild environment adjustment. Cloudy adds a broken flattened overcast and softens/cools the shared world, atmosphere, Google-compatible image-based lighting, and exterior-aircraft lighting while retaining readable ambient light. Clouds are hidden in Explore, regenerated only after major geographic movement, quality-scaled, and removed during teardown. Authored Challenges, Flight School lessons, and Ring Runs always reset to Clear.

---

## 13. Aircraft asset and rendering

The active asset is:

```text
public/assets/aircraft/cessna-172sp.glb
```

GLB was selected over the unpacked glTF because it packages mesh, materials, and textures as one reliable deployable file. The model is "FREE Cessna 172SP" by NLM, licensed under CC BY 4.0. Attribution is retained in `LICENSE.txt` and in the Cesium model credit.

`AircraftRenderer` updates the Cesium model through a direct model matrix rather than React. It applies an axis/orientation correction and daylight-responsive lighting. The embedded animation affects the door nodes and must remain disabled unless a deliberate, time-independent door feature is added.

---

## 14. Camera, HUD, UI, and sound

### Cameras

- **External:** smoothed trailing position and target, reduced roll coupling, and speed-based FOV.
- **External far:** higher, more distant trailing view.
- **Flyby:** fixed-offset tracking view that resets after the aircraft passes.
- **Top down:** aircraft-centered overhead view with stable heading alignment.

The Cockpit camera and its interior audio specialization were removed at the user's request. The Cessna GLB remains unchanged.

Cesium's normal mouse navigation controls are disabled during flight.

### HUD

The compact HUD displays:

- Airspeed in knots.
- AGL and MSL altitude in feet.
- Heading.
- Vertical speed in ft/min.
- Throttle.
- Flaps.
- Brakes.
- Airborne/ground/crashed state.
- Camera mode.
- FPS and adaptive quality level.

The old top-left coordinate/status panel was removed from the normal ready state at the user's request.

### UI direction

The interface uses a Swiss editorial style: white surfaces, black hairline rules, Helvetica/Arial, a red project index/accent, square controls, and tabular numeric telemetry. Preserve this language when adding controls.

### Audio

Sound is generated locally with Web Audio and includes:

- Engine fundamental and harmonic tones.
- Airspeed-based wind.
- Ground roll noise.
- Touchdown impact.
- Crash impact.

Browser autoplay rules require the first click or keyboard interaction before audio can start. A header button toggles sound.

---

## 15. Controls

| Input | Action |
| --- | --- |
| `W` or `↑` | Pitch nose down |
| `S` or `↓` | Pull up |
| `Q` or `←` | Roll left |
| `E` or `→` | Roll right |
| `A` / `D` | Ground steering or flight yaw |
| `Shift` | Increase throttle |
| `Control` | Decrease throttle |
| `F` | Cycle flaps: 0%, 50%, 100% |
| `B` | Hold brakes |
| `V` | Cycle four exterior cameras |
| `R` | Respawn at the last selected spawn |
| `M` | Open world search/spawn menu |
| `Escape` | Pause/resume |

Important historical control decision: `W` pitches down and `S` pulls up. Do not "correct" this to a conventional forward/back mapping without a user request.

---

## 16. Worldwide search and spawning

### Airports

- The airport dataset is generated from public-domain OurAirports data.
- It is bundled, compact, and available offline after the app loads.
- Search covers airport name, municipality, ICAO, and IATA.
- Exact codes rank first.
- Paved facilities and longer runways rank ahead when text scores match.
- Search results can spawn on the runway or at 1,000 ft AGL.
- Temporary markers are displayed while reviewing airport results.

### Cities

Standard Cesium mode uses Nominatim:

- Search happens only on form submission.
- There is no live autocomplete.
- Queries are locally cached.
- Requests are throttled slightly beyond one request per second.

Google evaluation mode uses its required Google geocoder path instead.

### Spawn URLs

Shareable URLs support:

- `airport` or `lat`/`lon`.
- `elevation` where applicable.
- `heading`.
- `altitude` for airborne starts, in meters.
- `mode=runway` or `mode=air`.
- Optional guarded `world=photorealistic`.

Example Dubai airborne checkpoint:

```text
http://127.0.0.1:5173/?airport=OMDB&mode=air&heading=121&altitude=304.8
```

---

## 17. Local setup

Requirements:

- Recent Node.js and npm.
- Desktop Chrome.
- Network access for Cesium assets and city search.
- A personal restricted Cesium ion public token for reliable ongoing use.

Setup:

```bash
npm install
cp .env.example .env.local
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open:

```text
http://127.0.0.1:5173/
```

Environment:

```env
VITE_CESIUM_ION_TOKEN=your_restricted_public_token
VITE_ENABLE_PHOTOREALISTIC_EVALUATION=false
VITE_GOOGLE_MAP_TILES_KEY=
```

The bundled Cesium evaluation token can support a local checkpoint, but it should not be treated as a production credential. Never commit `.env.local` or secrets.

---

## 18. Verification commands and current evidence

### Commands

```bash
npm run test
npm run build
npm run test:e2e
npm run verify:release
git diff --check
```

`npm run verify:release` performs environment/secret preflight, unit tests, production build, built-output checks, and E2E tests. It does **not** deploy.

### Latest confirmed state

As of 2026-08-17:

- Unit tests: **11 files, 68 tests passed**.
- TypeScript and Vite production build: **passed**.
- `git diff --check`: **passed**.
- Local development URL: previously confirmed HTTP 200.
- Daylight controls: browser-verified from dawn through the 17:30 sunset limit with no night/cycle control.
- Browser console during daylight verification: no errors.

### E2E nuance

The most recent complete E2E run described in `CURRENT_WORK.md` passed three scenarios and timed out once in the streamed-building recovery scenario while the page reported 1 FPS. That exact scenario passed when rerun alone. Treat this as a likely tile-stream/performance delay, but do not call the release suite fully clean until `npm run test:e2e` passes all four scenarios in one run again.

A focused 2026-08-17 browser rerun was also not clean: the runway scenario still expected the old primary AGL HUD while the current HUD shows MSL as the primary altitude, and the photorealistic-lock scenario remained on Cesium initialization beyond its five-second heading assertion. These failures did not produce flight-model errors, but the browser test expectations/loading waits need a separate hardening pass before a clean E2E claim.

Automated browser scenarios cover:

1. Runway start, ground state, pause, and respawn.
2. Photorealistic lock and repeated control resets.
3. Basic-world fallback when Cesium assets fail.
4. Collision with streamed OSM building geometry and recovery.

---

## 19. Manual acceptance checklist

Run this on the target M2 MacBook Pro in a clean desktop Chrome session.

### World and performance

- [ ] Standard startup uses `Cesium world`, not Google.
- [ ] Dubai, New York, London, Mumbai, a mountain location, and a coastline load recognizably.
- [ ] Sustained city flight remains at or above 30 FPS after tiles settle.
- [ ] Takeoff and near-ground flight do not remain in single-digit FPS.
- [ ] Adaptive quality lowers detail when required and later recovers.

### Flight

- [ ] Complete three consecutive runway takeoffs.
- [ ] Hold a stable climb and descent.
- [x] Perform a complete roll without a large free altitude gain.
- [x] Perform a loop from appropriate entry speed.
- [x] Hold inverted flight for five seconds.
- [ ] Enter an overly steep climb, lose airspeed, and confirm gravity wins.
- [x] Perform a steep dive and recover.
- [ ] Confirm neutral flight holds without an artificial gravity pull above stall and drops after stalling.

### Landing and collision

- [x] Make a smooth landing and brake to a stop.
- [ ] Trigger a hard/severe landing.
- [x] Crash deliberately, stop at the surface, and respawn safely.
- [ ] Crash into a loaded nearby building and respawn safely.
- [ ] Confirm grounded/crashed AGL reads 0 ft.

### Product layer

- [ ] Spawn at airports on multiple continents.
- [ ] Submit at least one city search.
- [ ] Reload a shared airport URL and a coordinate URL.
- [ ] Cycle External, External far, Flyby, and Top down, then return to External.
- [ ] Pause, switch tabs, resume, and verify no simulation jump.
- [ ] Toggle sound and confirm engine/wind/ground/impact behavior.

### Daylight

- [ ] Sunrise, Noon, and Sunset visibly differ.
- [ ] Noon is bright and readable.
- [ ] Sky and ground never gain a pink/magenta cast.
- [ ] The selected lighting state remains fixed while flying.
- [ ] Only Sunrise, Noon, and Sunset are offered; no clock slider or numeric time is shown.
- [ ] Aircraft doors remain closed while changing time.

### Visual weather

- [ ] Clear contains no cloud primitives and matches the approved lighting.
- [ ] Scattered leaves substantial open blue sky.
- [ ] Cloudy forms a readable broken grey overcast without repeated raster shapes.
- [ ] Weather remains fixed through flight and respawn, and authored activities launch Clear.
- [ ] Sunrise and Sunset clouds remain natural with no stars or global orange wash.

---

## 20. Fourteen-day plan: original intent vs current state

The project was organized around the following two-week plan. Most implementation work is complete; remaining items are chiefly clean full-suite validation, tuning, documentation upkeep, and any later explicitly requested deployment.

| Day | Planned scope | Current state |
| --- | --- | --- |
| 1 | React/TS/Vite/Cesium scaffold, assets, environment, initial smoke build | Implemented locally. Public deployment intentionally not done. |
| 2 | OSM Buildings, aircraft GLB, scale/orientation, baseline performance | Implemented. GLB and license included. Door animation intentionally disabled. |
| 3 | Geodetic/ECEF/ENU, quaternions, fixed-step loop, global continuity | Implemented and unit tested. |
| 4 | Keyboard input, thrust, gravity, lift, drag, angular controls | Implemented. |
| 5 | Arcade handling, damping, stalls, maneuvers, centralized tuning | Implemented and repeatedly tuned. Subjective maneuver acceptance remains important. |
| 6 | Terrain, ground contact, rolling, brakes, steering, takeoff | Implemented. Low-altitude performance has been optimized but needs ongoing regression checks. |
| 7 | Landing classification, crashes, fast respawn | Implemented for terrain and loaded buildings. |
| 8 | Four exterior cameras and complete HUD | Implemented; Cockpit was later removed by request. |
| 9 | Global airports, runway selection/spawn, markers | Implemented using bundled OurAirports-derived data. |
| 10 | City search, URLs, boundary/stability tests | Implemented. Long global manual tests remain useful. |
| 11 | Cesium quality, terrain/building polish, adaptive performance | Implemented, including daylight polish and adaptive LOD. |
| 12 | Cesium visual gate and optional Google evaluation | Cesium remains default. Google was evaluated and is guarded/off by default. |
| 13 | Torture testing and bug/performance fixes | Substantial automated/manual work done. One full E2E run still needs a clean 4/4 pass. |
| 14 | Vercel deployment, clean-profile verification, final recording | Deferred because the user explicitly said no deployment. Demo recording not confirmed complete. |

---

## 21. Recommended continuation plan

### Immediate next checkpoint

1. Ask the user to manually approve the current Sunrise, Noon, and Sunset lighting.
2. Run the full E2E suite again and seek a clean four-scenario pass in one run.
3. Recheck takeoff and low-altitude FPS in New York and Dubai after tiles settle.
4. Manually verify the new stall threshold: no artificial gravity pull above stall, then a clear gravity/nose-drop recovery after stall.
5. Fix only reproducible bugs or explicitly requested tuning changes.

### Release checkpoint, only when requested

1. Run `npm run verify:release`.
2. Inspect `git status` and `git diff` carefully because the working tree contains extensive local work.
3. Confirm no secret or `.env.local` content is staged.
4. Commit only with explicit user permission.
5. Push only with explicit user permission.
6. Deploy only with explicit user permission.

### Suggested demo sequence

Use standard Cesium mode:

1. Dubai runway spawn.
2. Throttle-up and takeoff.
3. Roll.
4. Loop.
5. Exterior camera cycle.
6. Approach.
7. Landing.
8. Braking to a stop.
9. Optional deliberate crash and respawn.

---

## 22. Known limitations and risks

- Cesium OSM Buildings are extruded/vector-derived scenery with a procedural facade treatment, not photogrammetry.
- Building collision depends on streamed geometry being loaded and visible/pickable.
- Terrain/network delays can temporarily affect AGL reliability and tile detail.
- Dense-city performance depends on viewport, device state, network, and tile cache; paused screenshots are not sufficient performance evidence.
- Runway spawns do not provide custom runway mesh, airport markings, lights, taxiways, or airport buildings.
- The custom flight model is tuned for fun and is not aerodynamically authoritative.
- City search depends on the public Nominatim service and network availability.
- The Cesium evaluation token is not suitable for production.
- Google imagery contains baked lighting and can never match the live daylight system perfectly.
- No clean final deployment or final demo recording is currently established.

---

## 23. Repository and collaboration safety

Current Git facts at this checkpoint:

- Branch: `main`.
- Remote: `origin` points to `MayankAtri/arcade-flight-simulator`.
- Remote and local committed baseline: `3765439 Build Cesium arcade flight simulator`.
- The current working tree contains many modified and untracked files representing later simulator work.
- Those local changes must not be reset, cleaned, overwritten, or assumed to be disposable.

Rules for future chats:

1. Inspect `git status` and the relevant diff before editing.
2. Preserve unrelated local changes.
3. Do not run destructive Git commands.
4. Do not commit or push unless the user explicitly asks.
5. Do not deploy unless the user explicitly asks.
6. Do not enable Google Photorealistic mode unless the user explicitly asks.
7. Keep Cesium as the normal provider.
8. Keep handling constants centralized in `src/flight/tuning.ts`.
9. Test rendering/performance changes in a real browser, not only unit tests.
10. Clearly separate verified behavior, subjective tuning, and unverified assumptions.

---

## 24. Fresh-chat continuation prompt

The user can paste this into a new chat:

```text
Open PROJECT_OVERVIEW_AND_PLAN.md in the repository first, then inspect CURRENT_WORK.md and git status. Treat PROJECT_OVERVIEW_AND_PLAN.md as the main project handoff. Preserve all existing local changes. Do not commit, push, deploy, or enable Google Photorealistic mode unless I explicitly ask. Continue from the current implementation rather than rebuilding completed features.
```

---

## 25. Source and asset credits

- CesiumJS and Cesium World Terrain: Cesium, with viewer attribution retained.
- Buildings: Cesium OSM Buildings and OpenStreetMap contributors.
- Airport/runway data: OurAirports public-domain data.
- Standard city search: OpenStreetMap Nominatim under its public usage policy.
- Optional photorealistic evaluation: Google Photorealistic 3D Tiles through Cesium ion, with required attribution.
- Aircraft: "FREE Cessna 172SP" by NLM, CC BY 4.0; license retained with the asset.

---

## 26. Restored handoff and current checkout — 2026-08-20 18:36 IST

This document was restored from the latest complete recorded project handoff after the original uncommitted Markdown files were removed during repository cleanup. Sections above this note are the recovered historical overview and may describe repository state at their original timestamp.

### Committed baseline

The current committed branch is `main`, synchronized with `origin/main` at:

- `686323b` — Complete Cesium simulator features and optimization.
- `16dd820` — Fix flight audio playing in menu.
- `6f25fad` — Build World Flight Sim explore interface.

The committed application includes the Cesium-first simulator, four exterior cameras, flight/ground/crash systems, worldwide search, six guided Challenges, fixed daylight, audio, adaptive quality, memory-lifecycle safeguards, and the World Flight Sim-inspired Explore interface. Current uncommitted work also includes the three-state visual weather system documented in `CURRENT_WORK.md`. `design-qa.md` contains the latest source-comparison evidence.

### Additions after the recovered overview snapshot

- Six Challenges are defined in `src/challenges/challenges.ts` and presented by `src/app/ChallengesPanel.tsx`. They use the existing globe transition, bundled airports, ordered geographic checkpoints, and stopped-landing completion.
- Memory safeguards include distant-world eviction, reduced Cesium cache budgets, lifecycle cleanup, an opt-in diagnostics API, and memory-soak checks.
- The ready-state HUD clamps invalid or negative displayed heights to zero without changing flight physics.
- Explore uses the three-column World Flight Sim-inspired layout documented in `design-qa.md`.
- Menu/Explore/loading states fully silence flight audio; actual paused flight retains its quieter audio mix.

### Current uncommitted work

At restoration time, the checkout already contained uncommitted Flight School work in:

- `src/activities/`
- `src/flight-school/`
- `src/app/FlightSchoolPanel.tsx`
- `src/systems/TrainingGateRenderer.ts`
- Modifications to `App.tsx`, `FlightModel.ts`, `flight/types.ts`, `AudioSystem.ts`, and `SimulationEngine.ts`

The implementation plan is preserved separately in `FLIGHT_SCHOOL_AND_RING_RUNS_PLAN.md`. These uncommitted source changes were not created, altered, tested, committed, or pushed as part of restoring the handoff documents. Inspect `git status` and the diffs before continuing.

### Continuation rules

1. Read this overview, then `CURRENT_WORK.md`, then inspect `git status`.
2. Preserve all unrelated modified and untracked files.
3. Keep Cesium as the default world and Google Photorealistic mode explicitly opt-in.
4. Keep daylight fixed to Sunrise/Noon/Sunset, keep weather visual-only and free-flight-selected, do not restore raster billboard clouds, and do not autoplay the GLB door animation.
5. Do not commit, push, deploy, reset, clean, or discard work unless the user explicitly requests it.
6. Treat historical verification counts as snapshots; rerun the current repository commands before making a new release claim.
