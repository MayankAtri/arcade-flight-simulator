# Flight School and Ring Runs Implementation Plan

## Summary

Add two new playable modes to the existing menu:

- **Flight School:** a guided tutorial that teaches the current Cessna controls and flight model.
- **Ring Runs:** timed precision courses made from glowing Cesium rings positioned over real-world scenery.

Following the World Flight Sim reference, **First Flight must be completed once to unlock Ring Runs**. The remaining lessons are optional. Progress and personal-best times will initially be stored locally—no account, backend, deployment, or global leaderboard.

## 1. Shared Activity System

Introduce one activity controller so only one structured mode can run at a time:

```ts
type ActivitySession =
  | { mode: "free-flight" }
  | { mode: "challenge"; activityId: string }
  | { mode: "lesson"; activityId: string }
  | { mode: "ring-run"; activityId: string };
```

The controller will:

- Start, pause, restart, complete, fail, and exit activities.
- Clear the previous activity’s markers, rings, timers, and UI.
- Run objective checks inside the simulation loop.
- Publish a lightweight activity snapshot to React at approximately 10 Hz.
- Keep timers based on simulation time so pausing or switching tabs does not increase the result.
- Preserve the existing Challenges mode by adapting it to the shared controller.

Only the active activity may render an in-flight tracker.

## 2. Flight School

### Flight School screen

Turn the existing disabled navigation label into a button and add:

- Lesson cards.
- Completed/incomplete status.
- Difficulty and estimated duration.
- Selected lesson briefing.
- Objectives and controls used.
- Start, restart, and continue actions.
- Overall progress such as `2 / 5 lessons complete`.

### Lesson 1 — First Flight

Required before Ring Runs unlock.

Location: Dubai runway using the current reliable default spawn.

Steps:

1. Release the brakes.
2. Increase throttle above 90%.
3. Accelerate past approximately 55 knots.
4. Pull up and leave the runway.
5. Climb through 150 feet AGL.
6. Follow four large training rings.
7. Perform one gentle left and right turn.
8. Follow descending approach rings.
9. Land without a crash.
10. Brake below 5 knots and stop.

A hard landing may pass; a severe landing or crash restarts from the landing checkpoint instead of restarting the entire lesson.

### Lesson 2 — Straight and Level

Airborne start at 1,000 feet AGL.

- Hold altitude within ±100 feet for five seconds.
- Hold heading within ±10 degrees.
- Maintain 80–110 knots.
- Change throttle and restore stable flight.
- Complete without crashing or touching the ground.

### Lesson 3 — Controlled Turns

Airborne start with sufficient speed.

- Establish a left bank between 20–35 degrees.
- Turn approximately 90 degrees while protecting airspeed.
- Recover to wings level.
- Repeat to the right.
- Remain within an altitude tolerance of ±200 feet.

### Lesson 4 — Stall and Recovery

- Climb until speed falls into the stall region.
- Detect loss of lift.
- Lower the nose.
- Apply full power.
- Recover above approximately 65 knots.
- Establish a positive climb without losing excessive altitude.

### Lesson 5 — Approach and Landing

Start on a stabilized airborne approach.

- Follow descending approach rings.
- Reduce speed into the landing range.
- Use flaps.
- Maintain a controlled descent.
- Touch down smoothly or moderately hard.
- Brake to a complete stop.

### Lesson feedback

The in-flight tutorial panel will show:

- Current instruction.
- Objective progress.
- Relevant control binding.
- Live speed, altitude, heading, or bank target.
- Success and retry messages.
- Restart step, restart lesson, and exit buttons.

Success conditions must remain valid for a short sustained duration to prevent accidental completion from a single telemetry frame.

Use short synthesized success, failure, and countdown cues through the existing Web Audio system. Do not add voice recordings or downloaded audio assets.

## 3. Ring Rendering

Create a Cesium-owned `RingRenderer` outside React.

```ts
type RingGate = {
  id: string;
  latitudeDegrees: number;
  longitudeDegrees: number;
  altitudeAglMeters: number;
  headingDegrees: number;
  flightPathAngleDegrees: number;
  radiusMeters: number;
};

type RingCourse = {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  spawn: SpawnRequest;
  localHour: number;
  gates: readonly RingGate[];
  medalTimesSeconds: {
    bronze: number;
    silver: number;
    gold: number;
  };
};
```

For each gate:

- Sample terrain height and add `altitudeAglMeters`.
- Create the center and orientation in the local ENU frame.
- Transform the ring geometry into ECEF.
- Batch ring geometry in Cesium primitives instead of React components or individual DOM elements.
- Use an opaque inner line and translucent outer halo.
- Make the active ring bright cyan.
- Show the next three rings with lower brightness.
- Hide passed rings.
- Display a direction marker on the active ring.

Ring geometry must work in Cesium World, Basic World, and the optional Google evaluation mode. It must not require Google tiles.

## 4. Reliable Ring Passage Detection

Simple distance checks are insufficient because the aircraft may pass through a ring between rendered frames.

At every fixed physics step:

1. Record the previous and current aircraft ECEF positions.
2. Test the movement segment against the active ring’s plane.
3. Calculate the intersection point.
4. Confirm it lies inside the ring radius.
5. Confirm movement is in the intended direction.
6. Advance exactly one ordered gate.

Behavior:

- Passing a future ring early does nothing.
- Passing outside the ring does nothing.
- Crossing backward does not count.
- Only the active ring can complete.
- A crash restarts the course.
- A missed ring requires turning back; there is no time penalty in the first version.
- Terrain or building crashes retain their existing handling.

## 5. Ring Runs

### Ring Runs screen

Enable the existing navigation item and add:

- Featured course.
- Course library.
- Location, difficulty, ring count, and medal targets.
- Selected-course briefing.
- Start and personal-best display.
- Locked state until First Flight is completed.

### Initial courses

Use original layouts rather than copying World Flight Sim’s proprietary course coordinates or assets.

1. **Dubai Waterfront Sprint — Easy**
   - 10–12 large rings.
   - Gentle turns over the waterfront.
   - Minimal terrain risk.
   - First course used to validate the system.

2. **Big Sur Coastal Line — Medium**
   - 14–16 rings.
   - Coastal turns, climbs, and descents.
   - Requires energy and terrain management.

3. **Madeira Ridge Run — Hard**
   - 16–20 rings.
   - Tighter gates and larger altitude changes.
   - Demands early turn setup and controlled climbing.

### Course flow

1. Select a course.
2. Load the location and terrain.
3. Spawn airborne before the first gate.
4. Show a three-second countdown.
5. Resume controls and start the simulation timer.
6. Fly the gates in order.
7. Stop the timer after the final gate.
8. Show final time, medal, previous best, and improvement.
9. Offer retry, course selection, or free flight.

### Ring Run HUD

Display:

- Current ring and total rings.
- Running time.
- Current medal pace.
- Personal best.
- Distance to active ring.
- Restart and exit controls.

## 6. Progress Storage

Use versioned local storage:

```ts
type FlightSchoolProgress = {
  version: 1;
  completedLessonIds: string[];
};

type RingRunProgress = {
  version: 1;
  bestTimesSeconds: Record<string, number>;
};
```

Rules:

- First Flight completion unlocks Ring Runs after reload.
- Lessons can be replayed.
- Only faster valid course times replace personal bests.
- Invalid or outdated storage falls back safely to empty progress.
- Add a reset-progress action to settings.
- No online accounts or global leaderboard in this version.

## 7. Implementation Checkpoints

### Checkpoint 1 — Activity foundation

- Shared activity controller.
- Existing Challenges adapted without behavior changes.
- Activity start, restart, exit, and cleanup verified.

### Checkpoint 2 — First Flight

- Flight School screen.
- First Flight lesson.
- Tutorial tracker and checkpoints.
- Local completion and Ring Runs unlock.

Test this checkpoint manually before adding more lessons.

### Checkpoint 3 — Complete Flight School

- Remaining four lessons.
- Sustained objective checks.
- Lesson completion screen and progress display.

### Checkpoint 4 — Ring prototype

- Ring renderer.
- ECEF orientation.
- Terrain-relative placement.
- Reliable plane-crossing detection.
- Dubai course and timer.

Test performance and ring visibility before adding more courses.

### Checkpoint 5 — Ring Runs product layer

- Course library and briefings.
- Big Sur and Madeira courses.
- Medals, personal bests, countdown, results, and restart.

### Checkpoint 6 — Polish and regression testing

- Responsive UI.
- Audio cues.
- Visibility at different daylight settings.
- Performance tuning.
- Existing free-flight and Challenge regression checks.

## Test Plan

### Automated tests

- Activity modes cannot overlap.
- Lesson objectives complete only under valid sustained conditions.
- First Flight unlocks Ring Runs.
- Lesson checkpoints restart correctly after a crash.
- Ring geometry produces valid ECEF coordinates.
- High-speed crossings do not tunnel through rings.
- Backward, outside-radius, skipped, and out-of-order crossings fail.
- Pausing freezes Ring Run time.
- Restart resets the timer and gate sequence.
- Personal best only updates for a faster completed run.
- Invalid stored progress is handled safely.
- Exiting removes all rings and activity state.
- Existing Challenge tests continue passing.

### Manual acceptance

- Complete First Flight from runway start through landing and full stop.
- Confirm Ring Runs remain locked before completion and unlock afterward.
- Complete all five lessons.
- Complete all three Ring Run courses.
- Verify pause, restart, crash, respawn, and exit behavior.
- Verify rings over cities, coastline, water, and mountains.
- Verify chase and cockpit cameras remain usable.
- Maintain at least 30 FPS on the target Mac.
- Confirm no activity markers remain during free flight.
- Confirm existing search, Challenges, sound, daylight, cameras, and flight handling remain unchanged.

## Deferred Work

- Public leaderboards.
- Accounts and cloud synchronization.
- Ghost aircraft and replay racing.
- Aircraft selection.
- Controller/gamepad tutorial prompts.
- Voice instructor.
- User-created courses.
- Multiplayer Ring Runs.
