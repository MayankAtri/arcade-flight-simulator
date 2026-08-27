import type { FlightLesson, LessonStep, TrainingGate } from "./types";

const DUBAI_RUNWAY = {
  latitudeDegrees: 25.252836227416992,
  longitudeDegrees: 55.364376068115234,
  elevationMeters: 3.35,
  headingDegrees: 121,
} as const;

const runwaySpawn = {
  ...DUBAI_RUNWAY,
  mode: "runway" as const,
  airborneAltitudeMeters: undefined,
};

const airborneSpawn = (overrides: Partial<typeof DUBAI_RUNWAY & { airborneAltitudeMeters: number }> = {}) => ({
  ...DUBAI_RUNWAY,
  ...overrides,
  mode: "air" as const,
  airborneAltitudeMeters: overrides.airborneAltitudeMeters ?? 304.8,
});

const step = (
  id: string,
  title: string,
  instruction: string,
  control: string,
  target: string,
  sustainSeconds = 0.5,
  gateId?: string,
): LessonStep => ({ id, title, instruction, control, target, sustainSeconds, gateId });

const firstFlightGates: readonly TrainingGate[] = [
  { id: "departure-1", latitudeDegrees: 25.244498, longitudeDegrees: 55.379717, altitudeAglMeters: 75, headingDegrees: 121, flightPathAngleDegrees: 5, radiusMeters: 42 },
  { id: "departure-2", latitudeDegrees: 25.241255, longitudeDegrees: 55.385682, altitudeAglMeters: 115, headingDegrees: 121, flightPathAngleDegrees: 4, radiusMeters: 42 },
  { id: "departure-3", latitudeDegrees: 25.237548, longitudeDegrees: 55.392499, altitudeAglMeters: 150, headingDegrees: 121, flightPathAngleDegrees: 3, radiusMeters: 44 },
  { id: "departure-4", latitudeDegrees: 25.233378, longitudeDegrees: 55.400168, altitudeAglMeters: 175, headingDegrees: 121, flightPathAngleDegrees: 1, radiusMeters: 46 },
  { id: "approach-1", latitudeDegrees: 25.2621, longitudeDegrees: 55.3487, altitudeAglMeters: 125, headingDegrees: 121, flightPathAngleDegrees: -4, radiusMeters: 70 },
  { id: "approach-2", latitudeDegrees: 25.2585, longitudeDegrees: 55.3548, altitudeAglMeters: 82, headingDegrees: 121, flightPathAngleDegrees: -4, radiusMeters: 80 },
  { id: "approach-3", latitudeDegrees: 25.2552, longitudeDegrees: 55.3602, altitudeAglMeters: 42, headingDegrees: 121, flightPathAngleDegrees: -4, radiusMeters: 100 },
] as const;

const approachGates: readonly TrainingGate[] = firstFlightGates.filter((gate) => gate.id.startsWith("approach"));

const approachSpawn = {
  latitudeDegrees: 25.2652,
  longitudeDegrees: 55.3434,
  elevationMeters: 3.35,
  headingDegrees: 121,
  mode: "air" as const,
  airborneAltitudeMeters: 165,
};

export const FLIGHT_LESSONS: readonly FlightLesson[] = [
  {
    id: "first-flight",
    number: 1,
    title: "First Flight",
    summary: "Take the Cessna from runway start to a complete stop, with guided departure and approach gates.",
    difficulty: "Beginner",
    estimatedMinutes: 12,
    spawn: runwaySpawn,
    initialThrottle: 0,
    localHour: 9,
    objectives: ["Take off from Dubai", "Fly the training circuit", "Land and stop safely"],
    controls: ["Shift / Control", "S / W", "Q / E", "A / D", "F", "B"],
    gates: firstFlightGates,
    landingCheckpointStepId: "approach-1",
    landingCheckpointSpawn: approachSpawn,
    steps: [
      step("brake-check", "Check the brakes", "Hold B briefly to confirm the wheel brakes are working before departure.", "Hold B", "Brakes on", 0.6),
      step("release-brakes", "Release the brakes", "Release the wheel brakes before adding power.", "Release B", "Brakes off", 0.8),
      step("full-throttle", "Set takeoff power", "Hold Shift until the throttle passes 90%.", "Shift", "Throttle above 90%", 0.8),
      step("rotation-speed", "Build speed", "Keep straight and accelerate through 55 knots.", "A / D to steer", "At least 55 kt", 0.5),
      step("rotate", "Rotate", "Pull back smoothly and lift away from the runway.", "S / Arrow Down", "Airborne", 0.4),
      step("climb-150", "Positive climb", "Climb through 150 feet above the ground.", "S, then ease off", "Above 150 ft AGL", 0.8),
      ...firstFlightGates.slice(0, 4).map((gate, index) => step(
        gate.id,
        `Departure gate ${index + 1}`,
        "Fly through the center of the bright training gate.",
        "Pitch and roll",
        `Gate ${index + 1} of 4`,
        0.2,
        gate.id,
      )),
      step("gentle-left", "Gentle left turn", "Bank left between 20° and 35°, use gentle left yaw, and correct pitch as you turn at least 45°.", "Q + A, then W / S", "20–35° left bank", 0.6),
      step("gentle-right", "Gentle right turn", "Bank right between 20° and 35°, use gentle right yaw, and correct pitch as you turn at least 45°.", "E + D, then W / S", "20–35° right bank", 0.6),
      step("return-to-airport", "Turn back to Dubai", "Continue the right turn toward heading 303°, then level the wings with the bright approach gate ahead.", "D + E, then level", "Heading 303° ±15°", 1),
      step(
        approachGates[0].id,
        "Outbound approach gate",
        "Fly through the bright gate northwest of the airport before turning inbound.",
        "Pitch and roll",
        "Reach the turn-in gate",
        0.2,
        approachGates[0].id,
      ),
      step("turn-final", "Turn inbound", "Turn around to heading 121°, level the wings, and point toward the remaining descending gates.", "D / E, then level", "Heading 121° ±15°", 1),
      ...approachGates.slice(1).map((gate, index) => step(
        gate.id,
        `Final approach gate ${index + 1}`,
        "Follow the descending gate path toward the runway.",
        "Pitch, roll and Control",
        `Final gate ${index + 1} of ${approachGates.length - 1}`,
        0.2,
        gate.id,
      )),
      step("touchdown", "Touch down", "Land on the runway. Smooth and hard landings pass; severe impacts restart the approach.", "F for flaps", "Smooth or hard landing", 0.2),
      step("full-stop", "Stop the aircraft", "Hold the brakes until the aircraft is below 5 knots.", "Hold B", "Below 5 kt with brakes", 0.8),
    ],
  },
  {
    id: "straight-and-level",
    number: 2,
    title: "Straight and Level",
    summary: "Build the scan that keeps altitude, heading and airspeed stable while power changes.",
    difficulty: "Beginner",
    estimatedMinutes: 7,
    spawn: airborneSpawn(),
    initialThrottle: 1,
    localHour: 10,
    objectives: ["Hold altitude", "Hold heading", "Manage airspeed and power"],
    controls: ["W / S", "Q / E", "Shift / Control"],
    gates: [],
    steps: [
      step("hold-altitude", "Hold altitude", "Keep altitude within 100 feet of the lesson target for five seconds.", "W / S", "±100 ft for 5 seconds", 5),
      step("hold-heading", "Hold heading", "Keep the nose within 10° of the target heading.", "Q / E and A / D", "±10° for 5 seconds", 5),
      step("hold-speed", "Set cruise speed", "Maintain between 80 and 110 knots.", "Shift / Control", "80–110 kt for 5 seconds", 5),
      step("reduce-power", "Change the power", "Reduce the throttle below 70% and observe the aircraft response.", "Control", "Throttle below 70%", 0.8),
      step("restore-flight", "Restore stable flight", "Return power above 85% and stabilize altitude, heading and speed.", "Shift, W / S, Q / E", "Stable for 5 seconds", 5),
    ],
  },
  {
    id: "controlled-turns",
    number: 3,
    title: "Controlled Turns",
    summary: "Coordinate medium-bank turns while protecting altitude and airspeed.",
    difficulty: "Intermediate",
    estimatedMinutes: 8,
    spawn: airborneSpawn({ airborneAltitudeMeters: 365.8 }),
    initialThrottle: 1,
    localHour: 12,
    objectives: ["Complete a 90° left turn", "Recover wings level", "Repeat to the right"],
    controls: ["Q / E", "A / D", "W / S", "Shift"],
    gates: [],
    steps: [
      step("left-turn", "Left turn", "Set 20–35° left bank, use gentle left yaw, and correct pitch while changing heading by about 90°.", "Q + A, then W / S", "70°+ heading change", 0.8),
      step("level-left", "Recover wings level", "Ease out of the turn and hold less than 5° bank.", "E briefly, then release", "Wings level for 2 seconds", 2),
      step("right-turn", "Right turn", "Set 20–35° right bank, use gentle right yaw, and correct pitch while changing heading by about 90°.", "E + D, then W / S", "70°+ heading change", 0.8),
      step("level-right", "Finish wings level", "Recover to straight flight without sacrificing airspeed.", "Q briefly, then release", "Level and above 65 kt", 2),
    ],
  },
  {
    id: "stall-and-recovery",
    number: 4,
    title: "Stall and Recovery",
    summary: "Recognize the low-speed break, lower the nose, add power and recover to a climb.",
    difficulty: "Advanced",
    estimatedMinutes: 8,
    spawn: airborneSpawn({ airborneAltitudeMeters: 610 }),
    initialThrottle: 1,
    localHour: 14,
    objectives: ["Enter the stall region", "Lower the nose and add power", "Recover above 65 knots"],
    controls: ["S / W", "Shift", "Q / E"],
    gates: [],
    steps: [
      step("enter-stall", "Approach the stall", "Raise the nose and let the airspeed decay into the stall region.", "S, then Control", "Below 48 kt", 0.8),
      step("recognize-stall", "Recognize loss of lift", "Hold long enough to confirm the low-speed stall condition.", "Release S", "Stall detected", 0.8),
      step("lower-nose", "Lower the nose", "Push forward to reduce angle of attack.", "W / Arrow Up", "Nose at least 5° down", 0.7),
      step("apply-power", "Apply full power", "Advance the throttle fully while keeping the wings near level.", "Hold Shift", "Throttle above 95%", 0.8),
      step("recover-speed", "Recover airspeed", "Stay controlled until airspeed is above 65 knots.", "Ease W as speed returns", "Above 65 kt for 2 seconds", 2),
      step("positive-climb", "Establish a climb", "Raise the nose gently and establish a positive climb without excessive altitude loss.", "S gently", "Positive climb for 3 seconds", 3),
    ],
  },
  {
    id: "approach-and-landing",
    number: 5,
    title: "Approach and Landing",
    summary: "Configure on final, manage the descent and bring the Cessna to a controlled stop.",
    difficulty: "Intermediate",
    estimatedMinutes: 9,
    spawn: approachSpawn,
    initialThrottle: 1,
    localHour: 17,
    objectives: ["Fly a stabilized approach", "Use flaps and control speed", "Land and stop"],
    controls: ["Control / Shift", "F", "W / S", "B"],
    gates: approachGates,
    landingCheckpointStepId: "approach-1",
    landingCheckpointSpawn: approachSpawn,
    steps: [
      ...approachGates.map((gate, index) => step(gate.id, `Approach gate ${index + 1}`, "Fly through the center while maintaining a shallow descent.", "Pitch, roll and Control", `Approach ${index + 1} of ${approachGates.length}`, 0.2, gate.id)),
      step("landing-speed", "Set landing speed", "Reduce airspeed into the 55–80 knot landing range.", "Control", "55–80 kt", 1.5),
      step("set-flaps", "Extend flaps", "Cycle the flaps to at least the half setting.", "F", "Flaps 50% or more", 0.8),
      step("controlled-descent", "Control the descent", "Hold a shallow descent while aligned with the runway.", "W / S", "100–700 ft/min descent", 2),
      step("touchdown", "Touch down", "Flare gently. Smooth and hard landings pass.", "S gently", "Smooth or hard landing", 0.2),
      step("full-stop", "Brake to a stop", "Hold the brakes until below 5 knots.", "Hold B", "Below 5 kt", 0.8),
    ],
  },
] as const;

export const getFlightLesson = (lessonId: string): FlightLesson | null => (
  FLIGHT_LESSONS.find((lesson) => lesson.id === lessonId) ?? null
);
