import { describe, expect, it } from "vitest";
import { ecefToGeodetic, enuBasisAt, moveToHeight, radiansToDegrees } from "./coordinates";
import { FlightModel } from "./FlightModel";
import {
  add,
  dot,
  magnitude,
  multiplyQuat,
  normalizeQuat,
  quatFromRotationVector,
  rotateVec3,
  scale,
  vec3,
} from "./math";
import { FLIGHT_TUNING } from "./tuning";
import type { FlightControls, SpawnRequest } from "./types";

const SPAWN: SpawnRequest = {
  latitudeDegrees: 25.22,
  longitudeDegrees: 55.31,
  elevationMeters: 10,
  headingDegrees: 121,
  mode: "air",
  airborneAltitudeMeters: 1_200,
};

const RUNWAY_SPAWN: SpawnRequest = {
  ...SPAWN,
  elevationMeters: 0,
  mode: "runway",
  airborneAltitudeMeters: undefined,
};

const NEUTRAL: FlightControls = {
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttleUp: false,
  throttleDown: false,
  brake: false,
};

const ENVIRONMENT = { groundHeight: 0, terrainReliable: true };

const runSteps = (model: FlightModel, controls: FlightControls, count: number): void => {
  for (let index = 0; index < count; index += 1) {
    model.step(controls, ENVIRONMENT, FLIGHT_TUNING.fixedStepSeconds);
  }
};

describe("flight model", () => {
  it("integrates the same fixed steps deterministically", () => {
    const first = new FlightModel(SPAWN);
    const second = new FlightModel(SPAWN);
    runSteps(first, NEUTRAL, 600);
    runSteps(second, NEUTRAL, 600);
    expect(first.state.positionECEF.x).toBeCloseTo(second.state.positionECEF.x, 8);
    expect(first.state.positionECEF.y).toBeCloseTo(second.state.positionECEF.y, 8);
    expect(first.state.positionECEF.z).toBeCloseTo(second.state.positionECEF.z, 8);
    expect(first.state.velocityECEF.x).toBeCloseTo(second.state.velocityECEF.x, 8);
  });

  it("increases throttle continuously while Shift is held", () => {
    const model = new FlightModel(SPAWN);
    runSteps(model, { ...NEUTRAL, throttleUp: true }, 120);
    expect(model.state.throttle).toBeGreaterThan(0.99);
  });

  it("pitches the nose upward without clamping orientation", () => {
    const model = new FlightModel(SPAWN);
    const startGeo = ecefToGeodetic(model.state.positionECEF);
    const startForward = rotateVec3(model.state.bodyToECEF, { x: 1, y: 0, z: 0 });
    const startVertical = dot(startForward, enuBasisAt(startGeo).up);
    runSteps(model, { ...NEUTRAL, pitch: 1 }, 45);
    const endGeo = ecefToGeodetic(model.state.positionECEF);
    const endForward = rotateVec3(model.state.bodyToECEF, { x: 1, y: 0, z: 0 });
    expect(dot(endForward, enuBasisAt(endGeo).up)).toBeGreaterThan(startVertical + 0.25);
  });

  it("keeps state finite during combined pitch, roll, and yaw", () => {
    const model = new FlightModel(SPAWN);
    runSteps(model, { ...NEUTRAL, pitch: 0.7, roll: 1, yaw: -0.6, throttleUp: true }, 360);
    const values = [
      ...Object.values(model.state.positionECEF),
      ...Object.values(model.state.velocityECEF),
      ...Object.values(model.state.bodyToECEF),
    ];
    expect(values.every(Number.isFinite)).toBe(true);
    expect(magnitude(model.state.velocityECEF)).toBeGreaterThan(1);
    expect(Math.hypot(
      model.state.bodyToECEF.x,
      model.state.bodyToECEF.y,
      model.state.bodyToECEF.z,
      model.state.bodyToECEF.w,
    )).toBeCloseTo(1, 8);
  });

  it("crosses the international date line without a regional reset", () => {
    const model = new FlightModel({
      ...SPAWN,
      latitudeDegrees: 0,
      longitudeDegrees: 179.999,
      headingDegrees: 90,
    });
    runSteps(model, NEUTRAL, 600);
    const longitude = radiansToDegrees(ecefToGeodetic(model.state.positionECEF).longitude);
    expect(longitude).toBeLessThan(-179.99);
    expect(model.state.crashed).toBe(false);
  });

  it("keeps useful roll authority below stall speed", () => {
    const model = new FlightModel(SPAWN);
    const forward = rotateVec3(model.state.bodyToECEF, { x: 1, y: 0, z: 0 });
    model.state.velocityECEF = scale(forward, 8);

    runSteps(model, { ...NEUTRAL, roll: 1 }, 30);

    expect(model.state.angularVelocityBody.x).toBeGreaterThan(0.22);
    expect(model.state.angularVelocityBody.x).toBeLessThan(0.4);
  });

  it("lowers a stalled nose when pitch is released", () => {
    const model = new FlightModel(SPAWN);
    model.state.bodyToECEF = normalizeQuat(
      multiplyQuat(model.state.bodyToECEF, quatFromRotationVector({ x: 0, y: 0.85, z: 0 })),
    );
    const forward = rotateVec3(model.state.bodyToECEF, { x: 1, y: 0, z: 0 });
    model.state.velocityECEF = scale(forward, 12);
    model.state.angularVelocityBody = vec3();

    model.step(NEUTRAL, ENVIRONMENT, FLIGHT_TUNING.fixedStepSeconds);

    expect(model.state.angularVelocityBody.y).toBeLessThan(0);
  });

  it("lets deliberate pitch input override stall recovery", () => {
    const model = new FlightModel(SPAWN);
    model.state.bodyToECEF = normalizeQuat(
      multiplyQuat(model.state.bodyToECEF, quatFromRotationVector({ x: 0, y: 0.85, z: 0 })),
    );
    const forward = rotateVec3(model.state.bodyToECEF, { x: 1, y: 0, z: 0 });
    model.state.velocityECEF = scale(forward, 12);
    model.state.angularVelocityBody = vec3();

    model.step({ ...NEUTRAL, pitch: 1 }, ENVIRONMENT, FLIGHT_TUNING.fixedStepSeconds);

    expect(model.state.angularVelocityBody.y).toBeGreaterThan(0);
  });

  it("starts recovering when a steep dive is released", () => {
    const model = new FlightModel(SPAWN);
    model.state.bodyToECEF = normalizeQuat(
      multiplyQuat(model.state.bodyToECEF, quatFromRotationVector({ x: 0, y: -1.25, z: 0 })),
    );
    const forward = rotateVec3(model.state.bodyToECEF, { x: 1, y: 0, z: 0 });
    model.state.velocityECEF = scale(forward, 45);
    model.state.angularVelocityBody = vec3();

    model.step(NEUTRAL, ENVIRONMENT, FLIGHT_TUNING.fixedStepSeconds);

    expect(model.state.angularVelocityBody.y).toBeGreaterThan(0);
  });

  it("retains recoverable energy with moderate throttle at low speed", () => {
    const model = new FlightModel(SPAWN);
    const startForward = rotateVec3(model.state.bodyToECEF, { x: 1, y: 0, z: 0 });
    model.state.velocityECEF = scale(startForward, 15);

    runSteps(model, NEUTRAL, 120);

    const currentForward = rotateVec3(model.state.bodyToECEF, { x: 1, y: 0, z: 0 });
    expect(dot(model.state.velocityECEF, currentForward)).toBeGreaterThan(17);
  });

  it("defaults airborne spawns to 1,000 feet AGL", () => {
    const model = new FlightModel({ ...SPAWN, airborneAltitudeMeters: undefined });

    expect(model.telemetry({ ...ENVIRONMENT, groundHeight: SPAWN.elevationMeters }).altitudeAglMeters).toBeCloseTo(
      304.8,
      3,
    );
  });

  it("sustains a powered arcade climb without immediately bleeding below stall speed", () => {
    const model = new FlightModel(SPAWN);
    model.state.throttle = 1;
    const initialAltitude = model.telemetry(ENVIRONMENT).altitudeAglMeters;

    runSteps(model, { ...NEUTRAL, pitch: 1 }, 180);

    const telemetry = model.telemetry(ENVIRONMENT);
    expect(telemetry.altitudeAglMeters - initialAltitude).toBeGreaterThan(20);
    expect(telemetry.verticalSpeedMetersPerSecond).toBeGreaterThan(15);
    expect(telemetry.airspeedMetersPerSecond).toBeGreaterThan(FLIGHT_TUNING.stallSpeedMetersPerSecond);
  });

  it("completes an unrestricted full roll", () => {
    const model = new FlightModel(SPAWN);
    model.state.throttle = 1;
    let phase = 0;

    for (let step = 0; step < 480 && phase < 2; step += 1) {
      model.step({ ...NEUTRAL, roll: 1 }, ENVIRONMENT, FLIGHT_TUNING.fixedStepSeconds);
      const geodetic = ecefToGeodetic(model.state.positionECEF);
      const aircraftUp = rotateVec3(model.state.bodyToECEF, { x: 0, y: 0, z: -1 });
      const upright = dot(aircraftUp, enuBasisAt(geodetic).up);
      if (phase === 0 && upright < -0.85) phase = 1;
      else if (phase === 1 && upright > 0.85) phase = 2;
    }

    expect(phase).toBe(2);
    expect(model.state.crashed).toBe(false);
  });

  it("damps sideways motion through aerodynamic resistance", () => {
    const model = new FlightModel(SPAWN);
    const forward = rotateVec3(model.state.bodyToECEF, { x: 1, y: 0, z: 0 });
    const right = rotateVec3(model.state.bodyToECEF, { x: 0, y: 1, z: 0 });
    model.state.velocityECEF = add(scale(forward, 45), scale(right, 18));

    runSteps(model, NEUTRAL, 120);

    const currentRight = rotateVec3(model.state.bodyToECEF, { x: 0, y: 1, z: 0 });
    expect(Math.abs(dot(model.state.velocityECEF, currentRight))).toBeLessThan(3);
  });

  it("carries enough energy through an unrestricted loop", () => {
    const model = new FlightModel(SPAWN);
    model.state.throttle = 1;
    let phase = 0;

    for (let step = 0; step < 900 && phase < 4; step += 1) {
      model.step({ ...NEUTRAL, pitch: 1 }, ENVIRONMENT, FLIGHT_TUNING.fixedStepSeconds);
      const geodetic = ecefToGeodetic(model.state.positionECEF);
      const basis = enuBasisAt(geodetic);
      const forward = rotateVec3(model.state.bodyToECEF, { x: 1, y: 0, z: 0 });
      const aircraftUp = rotateVec3(model.state.bodyToECEF, { x: 0, y: 0, z: -1 });
      const forwardVertical = dot(forward, basis.up);
      const upright = dot(aircraftUp, basis.up);
      if (phase === 0 && forwardVertical > 0.8) phase = 1;
      else if (phase === 1 && upright < -0.8) phase = 2;
      else if (phase === 2 && forwardVertical < -0.8) phase = 3;
      else if (phase === 3 && Math.abs(forwardVertical) < 0.3 && upright > 0.75) phase = 4;
    }

    expect(phase).toBe(4);
    expect(magnitude(model.state.velocityECEF)).toBeGreaterThan(FLIGHT_TUNING.stallSpeedMetersPerSecond);
    expect(model.state.crashed).toBe(false);
  });

  it("accelerates on the ground and slows under wheel braking", () => {
    const model = new FlightModel(RUNWAY_SPAWN);
    runSteps(model, { ...NEUTRAL, throttleUp: true }, 420);
    const rollingSpeed = magnitude(model.state.velocityECEF);

    expect(model.state.grounded).toBe(true);
    expect(rollingSpeed).toBeGreaterThan(10);

    runSteps(model, { ...NEUTRAL, throttleDown: true, brake: true }, 240);

    expect(magnitude(model.state.velocityECEF)).toBeLessThan(rollingSpeed * 0.25);
    expect(model.state.brakes).toBe(1);
  });

  it("rotates and takes off after building runway speed", () => {
    const model = new FlightModel(RUNWAY_SPAWN);
    let takeoffStep = -1;

    for (let step = 0; step < 1_500; step += 1) {
      model.step(
        { ...NEUTRAL, pitch: 1, throttleUp: true },
        ENVIRONMENT,
        FLIGHT_TUNING.fixedStepSeconds,
      );
      if (!model.state.grounded) {
        takeoffStep = step;
        break;
      }
    }

    expect(takeoffStep).toBeGreaterThan(0);
    expect(takeoffStep).toBeLessThan(1_200);
    expect(model.telemetry(ENVIRONMENT).airspeedMetersPerSecond).toBeGreaterThanOrEqual(
      FLIGHT_TUNING.rotationSpeedMetersPerSecond,
    );
  });

  it("completes three consecutive takeoffs after runway respawns", () => {
    const model = new FlightModel(RUNWAY_SPAWN);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      let tookOff = false;
      for (let step = 0; step < 1_500; step += 1) {
        model.step(
          { ...NEUTRAL, pitch: 1, throttleUp: true },
          ENVIRONMENT,
          FLIGHT_TUNING.fixedStepSeconds,
        );
        if (!model.state.grounded) {
          tookOff = true;
          break;
        }
      }

      expect(tookOff).toBe(true);
      expect(model.state.crashed).toBe(false);
      model.spawn(RUNWAY_SPAWN);
      expect(model.state.grounded).toBe(true);
    }
  });

  it("classifies a controlled touchdown and returns to ground roll", () => {
    const model = new FlightModel({ ...RUNWAY_SPAWN, mode: "air", airborneAltitudeMeters: 2 });
    const geodetic = ecefToGeodetic(model.state.positionECEF);
    const basis = enuBasisAt(geodetic);
    const forward = rotateVec3(model.state.bodyToECEF, { x: 1, y: 0, z: 0 });
    model.state.positionECEF = moveToHeight(model.state.positionECEF, FLIGHT_TUNING.groundClearanceMeters + 0.01);
    model.state.velocityECEF = add(scale(forward, 32), scale(basis.up, -2));

    model.step(NEUTRAL, ENVIRONMENT, FLIGHT_TUNING.fixedStepSeconds);

    expect(model.state.grounded).toBe(true);
    expect(model.state.crashed).toBe(false);
    expect(model.telemetry(ENVIRONMENT).landingStatus).toBe("smooth");
  });

  it("distinguishes a severe landing from a terrain crash", () => {
    const severe = new FlightModel({ ...RUNWAY_SPAWN, mode: "air", airborneAltitudeMeters: 2 });
    const severeGeo = ecefToGeodetic(severe.state.positionECEF);
    const severeBasis = enuBasisAt(severeGeo);
    const severeForward = rotateVec3(severe.state.bodyToECEF, { x: 1, y: 0, z: 0 });
    severe.state.positionECEF = moveToHeight(severe.state.positionECEF, FLIGHT_TUNING.groundClearanceMeters + 0.01);
    severe.state.velocityECEF = add(scale(severeForward, 30), scale(severeBasis.up, -9));
    severe.step(NEUTRAL, ENVIRONMENT, FLIGHT_TUNING.fixedStepSeconds);

    expect(severe.state.crashed).toBe(false);
    expect(severe.telemetry(ENVIRONMENT).landingStatus).toBe("severe");

    const crash = new FlightModel({ ...RUNWAY_SPAWN, mode: "air", airborneAltitudeMeters: 2 });
    const crashGeo = ecefToGeodetic(crash.state.positionECEF);
    const crashBasis = enuBasisAt(crashGeo);
    const crashForward = rotateVec3(crash.state.bodyToECEF, { x: 1, y: 0, z: 0 });
    crash.state.positionECEF = moveToHeight(crash.state.positionECEF, FLIGHT_TUNING.groundClearanceMeters + 0.01);
    crash.state.velocityECEF = add(scale(crashForward, 30), scale(crashBasis.up, -15));
    crash.step(NEUTRAL, ENVIRONMENT, FLIGHT_TUNING.fixedStepSeconds);

    expect(crash.state.crashed).toBe(true);
    expect(crash.telemetry(ENVIRONMENT).landingStatus).toBe("crashed");

    crash.spawn(RUNWAY_SPAWN);
    expect(crash.state.crashed).toBe(false);
    expect(crash.state.grounded).toBe(true);
  });

  it("survives repeated terrain crashes and runway respawns without corrupting state", () => {
    const model = new FlightModel({ ...RUNWAY_SPAWN, mode: "air", airborneAltitudeMeters: 2 });

    for (let cycle = 0; cycle < 25; cycle += 1) {
      model.spawn({ ...RUNWAY_SPAWN, mode: "air", airborneAltitudeMeters: 2 });
      const geodetic = ecefToGeodetic(model.state.positionECEF);
      const basis = enuBasisAt(geodetic);
      const forward = rotateVec3(model.state.bodyToECEF, { x: 1, y: 0, z: 0 });
      model.state.positionECEF = moveToHeight(
        model.state.positionECEF,
        FLIGHT_TUNING.groundClearanceMeters + 0.01,
      );
      model.state.velocityECEF = add(scale(forward, 30), scale(basis.up, -18));
      model.step(NEUTRAL, ENVIRONMENT, FLIGHT_TUNING.fixedStepSeconds);

      expect(model.state.crashed).toBe(true);
      model.spawn(RUNWAY_SPAWN);
      const values = [
        ...Object.values(model.state.positionECEF),
        ...Object.values(model.state.velocityECEF),
        ...Object.values(model.state.bodyToECEF),
      ];
      expect(values.every(Number.isFinite)).toBe(true);
      expect(model.state.crashed).toBe(false);
      expect(model.state.grounded).toBe(true);
    }
  });
});
