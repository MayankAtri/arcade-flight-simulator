import {
  ecefToGeodetic,
  enuBasisAt,
  geodeticToEcef,
  headingFromForward,
  levelBodyOrientation,
  moveToHeight,
  degreesToRadians,
} from "./coordinates";
import {
  add,
  clamp,
  dot,
  lerpVec3,
  magnitude,
  multiplyQuat,
  normalize,
  normalizeQuat,
  quatFromRotationVector,
  rotateVec3,
  scale,
  smoothstep,
  subtract,
  vec3,
} from "./math";
import { FLIGHT_TUNING as T } from "./tuning";
import type { AircraftState, FlightControls, FlightEnvironment, FlightTelemetry, SpawnRequest } from "./types";

const EMPTY_CONTROLS: FlightControls = {
  pitch: 0,
  roll: 0,
  yaw: 0,
  throttleUp: false,
  throttleDown: false,
  brake: false,
};

export class FlightModel {
  state: AircraftState;
  private landingStatus: FlightTelemetry["landingStatus"] = "";
  private landingStatusAge = 0;

  constructor(spawn: SpawnRequest) {
    this.state = this.createState(spawn);
  }

  spawn(request: SpawnRequest): void {
    this.state = this.createState(request);
    this.landingStatus = "";
    this.landingStatusAge = 0;
  }

  setFlaps(value: number): void {
    this.state.flaps = clamp(value, 0, 1);
  }

  step(controls: FlightControls = EMPTY_CONTROLS, environment: FlightEnvironment, dt: number): void {
    const state = this.state;
    if (state.crashed) return;

    if (this.landingStatus) {
      this.landingStatusAge += dt;
      if (this.landingStatusAge > 2.4) this.landingStatus = "";
    }

    const throttleDirection = Number(controls.throttleUp) - Number(controls.throttleDown);
    state.throttle = clamp(state.throttle + throttleDirection * T.throttleRatePerSecond * dt, 0, 1);
    state.brakes = controls.brake ? 1 : 0;

    const geodetic = ecefToGeodetic(state.positionECEF);
    const basis = enuBasisAt(geodetic);
    const bodyForward = rotateVec3(state.bodyToECEF, { x: 1, y: 0, z: 0 });
    const currentAirspeed = magnitude(state.velocityECEF);
    const controlSpeedBlend = smoothstep(
      T.stallSpeedMetersPerSecond * T.stallLiftStartRatio,
      T.fullControlAuthoritySpeedMetersPerSecond,
      currentAirspeed,
    );
    const authority = T.minimumControlAuthority + (1 - T.minimumControlAuthority) * controlSpeedBlend;
    const forwardVertical = dot(bodyForward, basis.up);
    const stallRecovery = 1 - smoothstep(
      T.stallSpeedMetersPerSecond * T.stallLiftStartRatio,
      T.stallRecoveryStartSpeedMetersPerSecond,
      currentAirspeed,
    );
    const releasedPitch = 1 - Math.abs(controls.pitch);
    const noseHighRecovery =
      -smoothstep(T.stallRecoveryNoseHighStart, 0.82, forwardVertical) *
      stallRecovery *
      releasedPitch *
      T.stallRecoveryPitchRateRadiansPerSecond;
    const diveRecovery =
      smoothstep(T.diveRecoveryStartDownwardForward, T.diveRecoveryFullDownwardForward, -forwardVertical) *
      releasedPitch *
      T.diveRecoveryPitchRateRadiansPerSecond;

    const targetRates = state.grounded
      ? {
          x: 0,
          y:
            controls.pitch *
            T.pitchRateRadiansPerSecond *
            smoothstep(T.groundPitchControlStartSpeedMetersPerSecond, T.rotationSpeedMetersPerSecond, currentAirspeed),
          z:
            (controls.yaw + controls.roll * T.groundRollToYaw) *
            T.yawRateRadiansPerSecond *
            smoothstep(T.groundYawControlStartSpeedMetersPerSecond, T.groundYawControlFullSpeedMetersPerSecond, currentAirspeed),
        }
      : {
          x: controls.roll * T.rollRateRadiansPerSecond * authority,
          y: controls.pitch * T.pitchRateRadiansPerSecond * authority + noseHighRecovery + diveRecovery,
          z: controls.yaw * T.yawRateRadiansPerSecond * authority,
        };

    const hasControlInput = Math.abs(controls.pitch) + Math.abs(controls.roll) + Math.abs(controls.yaw) > 0.01;
    const angularResponse = hasControlInput ? T.activeAngularResponsePerSecond : T.neutralAngularDampingPerSecond;
    const response = 1 - Math.exp(-angularResponse * dt);
    state.angularVelocityBody = lerpVec3(state.angularVelocityBody, targetRates, response);
    const deltaRotation = quatFromRotationVector(scale(state.angularVelocityBody, dt));
    state.bodyToECEF = normalizeQuat(multiplyQuat(state.bodyToECEF, deltaRotation));

    if (state.grounded) {
      this.stepGround(controls, environment, dt);
      return;
    }

    const forward = rotateVec3(state.bodyToECEF, { x: 1, y: 0, z: 0 });
    const aircraftRight = rotateVec3(state.bodyToECEF, { x: 0, y: 1, z: 0 });
    const aircraftUp = rotateVec3(state.bodyToECEF, { x: 0, y: 0, z: -1 });
    const forwardSpeed = Math.max(0, dot(state.velocityECEF, forward));
    const speed = magnitude(state.velocityECEF);
    const stallFactor = smoothstep(
      T.stallSpeedMetersPerSecond * T.stallLiftStartRatio,
      T.stallSpeedMetersPerSecond * T.stallLiftFullRatio,
      forwardSpeed,
    );
    const effectiveLiftFactor = T.lowSpeedLiftFloor + (1 - T.lowSpeedLiftFloor) * stallFactor;
    const dynamicPressure = 0.5 * T.airDensity * forwardSpeed * forwardSpeed;
    const liftCoefficient = T.liftCoefficient + state.flaps * T.flapLiftBonus;
    const liftMagnitude = Math.min(
      dynamicPressure * T.wingAreaSquareMeters * liftCoefficient * effectiveLiftFactor,
      T.massKilograms * T.gravity * T.maximumLiftLoadFactor,
    );
    const dragCoefficient = T.dragCoefficient + state.flaps * T.flapDragBonus;
    const dragMagnitude = 0.5 * T.airDensity * speed * speed * T.wingAreaSquareMeters * dragCoefficient;
    const thrust = scale(forward, state.throttle * T.maxThrustNewtons);
    const energySpeedBlend = smoothstep(
      T.energyAssistFullSpeedMetersPerSecond,
      T.energyAssistStartSpeedMetersPerSecond,
      forwardSpeed,
    );
    const energyThrottleBlend = smoothstep(
      T.energyAssistThrottleThreshold,
      T.energyAssistFullThrottle,
      state.throttle,
    );
    const energyRetention = scale(
      forward,
      (1 - energySpeedBlend) * energyThrottleBlend * T.energyAssistAccelerationMetersPerSecond2 * T.massKilograms,
    );
    const poweredClimbAssist = scale(
      forward,
      smoothstep(T.poweredClimbAssistStartNoseUp, T.poweredClimbAssistFullNoseUp, dot(forward, basis.up)) *
        smoothstep(T.poweredClimbAssistThrottleThreshold, T.poweredClimbAssistFullThrottle, state.throttle) *
        T.poweredClimbAssistAccelerationMetersPerSecond2 *
        T.massKilograms,
    );
    const lift = scale(aircraftUp, liftMagnitude);
    const drag = speed > 0.01 ? scale(normalize(state.velocityECEF), -dragMagnitude) : vec3();
    const sideSlipResistance = scale(
      aircraftRight,
      -dot(state.velocityECEF, aircraftRight) * T.sideSlipDampingPerSecond * T.massKilograms,
    );
    const verticalSlipResistance = scale(
      aircraftUp,
      -dot(state.velocityECEF, aircraftUp) * T.verticalSlipDampingPerSecond * T.massKilograms,
    );
    const gravity = scale(basis.up, -T.massKilograms * T.gravity);
    const acceleration = scale(
      add(
        add(add(add(thrust, energyRetention), poweredClimbAssist), lift),
        add(add(drag, gravity), add(sideSlipResistance, verticalSlipResistance)),
      ),
      1 / T.massKilograms,
    );

    state.velocityECEF = add(state.velocityECEF, scale(acceleration, dt));

    if (speed > T.velocityAlignmentMinimumSpeedMetersPerSecond) {
      const desiredVelocity = scale(forward, Math.max(speed, forwardSpeed));
      const alignment = 1 - Math.exp(-T.velocityAlignmentPerSecond * authority * dt);
      state.velocityECEF = lerpVec3(state.velocityECEF, desiredVelocity, alignment);
    }

    state.positionECEF = add(state.positionECEF, scale(state.velocityECEF, dt));
    this.resolveGroundContact(environment);
  }

  telemetry(environment: FlightEnvironment): FlightTelemetry {
    const state = this.state;
    const geodetic = ecefToGeodetic(state.positionECEF);
    const basis = enuBasisAt(geodetic);
    const forward = rotateVec3(state.bodyToECEF, { x: 1, y: 0, z: 0 });
    return {
      airspeedMetersPerSecond: magnitude(state.velocityECEF),
      altitudeMslMeters: geodetic.height,
      altitudeAglMeters: Math.max(0, geodetic.height - environment.groundHeight),
      headingDegrees: headingFromForward(geodetic, forward),
      verticalSpeedMetersPerSecond: dot(state.velocityECEF, basis.up),
      throttle: state.throttle,
      brakes: state.brakes,
      flaps: state.flaps,
      grounded: state.grounded,
      crashed: state.crashed,
      landingStatus: this.landingStatus,
    };
  }

  private createState(request: SpawnRequest): AircraftState {
    const latitude = degreesToRadians(request.latitudeDegrees);
    const longitude = degreesToRadians(request.longitudeDegrees);
    const isAirborne = request.mode === "air";
    const height = isAirborne
      ? request.elevationMeters + (request.airborneAltitudeMeters ?? T.defaultAirborneSpawnAltitudeMeters)
      : request.elevationMeters + T.groundClearanceMeters;
    const geodetic = { latitude, longitude, height };
    const orientation = levelBodyOrientation(geodetic, degreesToRadians(request.headingDegrees));
    const forward = rotateVec3(orientation, { x: 1, y: 0, z: 0 });
    return {
      positionECEF: geodeticToEcef(geodetic),
      velocityECEF: isAirborne ? scale(forward, T.airborneSpawnSpeedMetersPerSecond) : vec3(),
      bodyToECEF: orientation,
      angularVelocityBody: vec3(),
      throttle: isAirborne ? T.airborneSpawnThrottle : 0,
      brakes: 0,
      flaps: 0,
      grounded: !isAirborne,
      crashed: false,
    };
  }

  private stepGround(controls: FlightControls, environment: FlightEnvironment, dt: number): void {
    const state = this.state;
    let geodetic = ecefToGeodetic(state.positionECEF);
    let basis = enuBasisAt(geodetic);
    const rawForward = rotateVec3(state.bodyToECEF, { x: 1, y: 0, z: 0 });
    const tangentForward = normalize(subtract(rawForward, scale(basis.up, dot(rawForward, basis.up))), basis.north);
    let speed = Math.max(0, dot(state.velocityECEF, tangentForward));
    const drive = (state.throttle * T.maxThrustNewtons) / T.massKilograms;
    const rolling = speed > 0.05 ? T.rollingResistanceMetersPerSecond2 : 0;
    const braking = controls.brake ? T.brakingMetersPerSecond2 : 0;
    const aeroDrag = T.groundAeroDragFactor * speed * speed;
    speed = Math.max(0, speed + (drive - rolling - braking - aeroDrag) * dt);
    state.velocityECEF = scale(tangentForward, speed);
    state.positionECEF = add(state.positionECEF, scale(state.velocityECEF, dt));

    geodetic = ecefToGeodetic(state.positionECEF);
    state.positionECEF = geodeticToEcef({ ...geodetic, height: environment.groundHeight + T.groundClearanceMeters });
    basis = enuBasisAt(geodetic);

    if (speed < T.rotationSpeedMetersPerSecond * 0.7) {
      const heading = headingFromForward(geodetic, tangentForward);
      state.bodyToECEF = levelBodyOrientation(geodetic, degreesToRadians(heading));
      state.angularVelocityBody.x = 0;
      state.angularVelocityBody.y = 0;
    }

    const aircraftUp = rotateVec3(state.bodyToECEF, { x: 0, y: 0, z: -1 });
    const noseUp = dot(rawForward, basis.up);
    const upwardLiftPotential = dot(aircraftUp, basis.up) * 0.5 * T.airDensity * speed * speed * T.wingAreaSquareMeters * T.liftCoefficient;
    if (
      speed >= T.rotationSpeedMetersPerSecond &&
      controls.pitch > 0.1 &&
      (noseUp > T.takeoffNoseUpThreshold || upwardLiftPotential > T.massKilograms * T.gravity * T.takeoffLiftFraction)
    ) {
      state.grounded = false;
      state.velocityECEF = add(state.velocityECEF, scale(basis.up, T.takeoffVerticalImpulseMetersPerSecond));
    }
  }

  private resolveGroundContact(environment: FlightEnvironment): void {
    const state = this.state;
    const geodetic = ecefToGeodetic(state.positionECEF);
    const agl = geodetic.height - environment.groundHeight;
    if (agl > T.groundClearanceMeters) return;

    const basis = enuBasisAt(geodetic);
    const verticalSpeed = dot(state.velocityECEF, basis.up);
    if (verticalSpeed >= 0) return;

    const forward = rotateVec3(state.bodyToECEF, { x: 1, y: 0, z: 0 });
    const impactSpeed = -verticalSpeed;
    const noseVertical = dot(forward, basis.up);
    const horizontalVelocity = subtract(state.velocityECEF, scale(basis.up, verticalSpeed));
    const sideVelocity = Math.abs(dot(horizontalVelocity, rotateVec3(state.bodyToECEF, { x: 0, y: 1, z: 0 })));
    const shouldCrash =
      impactSpeed > T.crashLandingVerticalSpeed ||
      noseVertical < T.crashNoseDownForward ||
      sideVelocity > T.crashSideSpeedMetersPerSecond ||
      magnitude(state.velocityECEF) > T.crashTotalSpeedMetersPerSecond;

    state.positionECEF = moveToHeight(state.positionECEF, environment.groundHeight + T.groundClearanceMeters);
    if (shouldCrash) {
      state.crashed = true;
      state.velocityECEF = vec3();
      state.angularVelocityBody = vec3();
      this.landingStatus = "crashed";
      this.landingStatusAge = 0;
      return;
    }

    state.grounded = true;
    state.velocityECEF = scale(
      horizontalVelocity,
      impactSpeed > T.hardLandingVerticalSpeed
        ? T.hardLandingVelocityRetention
        : T.normalLandingVelocityRetention,
    );
    this.landingStatus = impactSpeed < T.safeLandingVerticalSpeed ? "smooth" : impactSpeed < T.hardLandingVerticalSpeed ? "hard" : "severe";
    this.landingStatusAge = 0;
  }
}
