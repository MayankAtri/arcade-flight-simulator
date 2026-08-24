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
  private crashReason: FlightTelemetry["crashReason"] = "";
  private landingStatusAge = 0;

  constructor(spawn: SpawnRequest) {
    this.state = this.createState(spawn);
  }

  spawn(request: SpawnRequest): void {
    this.state = this.createState(request);
    this.landingStatus = "";
    this.crashReason = "";
    this.landingStatusAge = 0;
  }

  setFlaps(value: number): void {
    this.state.flaps = clamp(value, 0, 1);
  }

  reconcileSceneSurface(surfaceHeight: number, kind: "terrain" | "building"): void {
    if (this.state.crashed || !Number.isFinite(surfaceHeight)) return;
    if (kind === "building") {
      this.crashAt(this.state.positionECEF, surfaceHeight, "building");
      return;
    }
    const geodetic = ecefToGeodetic(this.state.positionECEF);
    if (geodetic.height <= surfaceHeight + T.groundClearanceMeters) {
      const basis = enuBasisAt(geodetic);
      const verticalSpeed = dot(this.state.velocityECEF, basis.up);
      const penetration = surfaceHeight + T.groundClearanceMeters - geodetic.height;
      if (verticalSpeed >= 0 && penetration > T.groundContactToleranceMeters) {
        this.crashAt(this.state.positionECEF, surfaceHeight, "terrain");
        return;
      }
      this.resolveGroundContact({ groundHeight: surfaceHeight, terrainReliable: true });
    }
  }

  step(controls: FlightControls = EMPTY_CONTROLS, environment: FlightEnvironment, dt: number): void {
    const state = this.state;
    if (state.crashed) return;
    if (this.resolveObstacleContact(environment)) return;

    if (this.landingStatus) {
      this.landingStatusAge += dt;
      if (this.landingStatusAge > 2.4) this.landingStatus = "";
    }

    const throttleDirection = Number(controls.throttleUp) - Number(controls.throttleDown);
    if (throttleDirection !== 0) {
      state.throttle = clamp(state.throttle + throttleDirection * T.throttleRatePerSecond * dt, 0, 1);
    } else if (typeof controls.throttleTarget === "number" && Number.isFinite(controls.throttleTarget)) {
      const target = clamp(controls.throttleTarget, 0, 1);
      const maximumChange = T.throttleRatePerSecond * dt;
      state.throttle += clamp(target - state.throttle, -maximumChange, maximumChange);
    }
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
    const pitchAuthority = T.minimumPitchAuthority + (1 - T.minimumPitchAuthority) * controlSpeedBlend;
    const rollAuthority = T.minimumRollAuthority + (1 - T.minimumRollAuthority) * controlSpeedBlend;
    const forwardVertical = dot(bodyForward, basis.up);
    const currentForwardSpeed = Math.max(0, dot(state.velocityECEF, bodyForward));
    const verticalSpeed = dot(state.velocityECEF, basis.up);
    const flightDirection = currentAirspeed > 0.01 ? normalize(state.velocityECEF) : bodyForward;
    const flightPathVertical = dot(flightDirection, basis.up);
    const upright = dot(rotateVec3(state.bodyToECEF, { x: 0, y: 0, z: -1 }), basis.up);
    const descentBlend = smoothstep(
      T.descentNoseDropStartMetersPerSecond,
      T.descentNoseDropFullMetersPerSecond,
      -verticalSpeed,
    );
    const neutralPitchBlend = 1 - smoothstep(0.02, 0.12, Math.abs(controls.pitch));
    const stalledBlend = 1 - smoothstep(
      T.stallSpeedMetersPerSecond * 0.9,
      T.stallSpeedMetersPerSecond,
      currentForwardSpeed,
    );
    const descentNoseFollow = clamp(
      (flightPathVertical - descentBlend * T.descentNoseDropBiasRadians - forwardVertical) *
        T.descentNoseFollowPerSecond,
      -T.descentNoseFollowMaximumRateRadiansPerSecond,
      T.descentNoseFollowMaximumRateRadiansPerSecond,
    ) *
      smoothstep(T.descentNoseFollowUprightStart, T.descentNoseFollowUprightFull, upright) *
      neutralPitchBlend *
      stalledBlend;
    const stallRecovery = 1 - smoothstep(
      T.stallSpeedMetersPerSecond * T.stallLiftStartRatio,
      T.stallRecoveryStartSpeedMetersPerSecond,
      currentForwardSpeed,
    );
    const steadyPitchGate = 1 - smoothstep(
      T.steepClimbRotationGateStartRadiansPerSecond,
      T.steepClimbRotationGateFullRadiansPerSecond,
      Math.abs(state.angularVelocityBody.y),
    );
    const deepStall =
      smoothstep(T.steepClimbStartNoseUp, T.steepClimbFullNoseUp, forwardVertical) *
      (1 - smoothstep(
        T.stallSpeedMetersPerSecond * T.steepClimbLowSpeedFullRatio,
        T.stallSpeedMetersPerSecond * T.steepClimbLowSpeedStartRatio,
        currentForwardSpeed,
      )) *
      steadyPitchGate *
      stalledBlend;
    const releasedPitch = 1 - Math.abs(controls.pitch);
    const noseHighRecovery =
      -smoothstep(T.stallRecoveryNoseHighStart, 0.82, forwardVertical) *
      stallRecovery *
      releasedPitch *
      T.stallRecoveryPitchRateRadiansPerSecond;
    const deepStallRecovery = -deepStall * T.deepStallPitchDownRateRadiansPerSecond;
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
          x: controls.roll * T.rollRateRadiansPerSecond * rollAuthority,
          y:
            controls.pitch * T.pitchRateRadiansPerSecond * pitchAuthority +
            noseHighRecovery +
            deepStallRecovery +
            diveRecovery +
            descentNoseFollow,
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
    const wingPressure = dynamicPressure * T.wingAreaSquareMeters * effectiveLiftFactor;
    const angleOfAttack = clamp(
      -Math.atan2(dot(state.velocityECEF, aircraftUp), Math.max(1, forwardSpeed)),
      -Math.PI / 4,
      Math.PI / 4,
    );
    const trimLiftCoefficient = wingPressure > 1
      ? Math.min(
          T.maximumLiftCoefficient,
          (T.massKilograms * T.gravity * T.trimLiftLoadFactor) / wingPressure,
        )
      : T.liftCoefficient;
    const liftCoefficient = clamp(
      trimLiftCoefficient +
        angleOfAttack * T.angleOfAttackLiftSlopePerRadian +
        controls.pitch * T.pitchInputLiftCoefficient +
        state.flaps * T.flapLiftBonus,
      T.minimumLiftCoefficient,
      T.maximumLiftCoefficient,
    );
    const liftMagnitude = clamp(
      dynamicPressure * T.wingAreaSquareMeters * liftCoefficient * effectiveLiftFactor,
      -T.massKilograms * T.gravity * T.maximumNegativeLiftLoadFactor,
      T.massKilograms * T.gravity * T.maximumLiftLoadFactor,
    );
    const inducedDrag = T.inducedDragCoefficient * liftCoefficient * liftCoefficient;
    const dragCoefficient = T.dragCoefficient + inducedDrag + state.flaps * T.flapDragBonus;
    const dragMagnitude = 0.5 * T.airDensity * speed * speed * T.wingAreaSquareMeters * dragCoefficient;
    const noseUp = dot(forward, basis.up);
    const steadySteepClimb =
      smoothstep(T.steepClimbStartNoseUp, T.steepClimbFullNoseUp, noseUp) *
      (1 - smoothstep(
        T.stallSpeedMetersPerSecond * T.steepClimbLowSpeedFullRatio,
        T.stallSpeedMetersPerSecond * T.steepClimbLowSpeedStartRatio,
        forwardSpeed,
      )) *
      (1 - smoothstep(
        T.steepClimbRotationGateStartRadiansPerSecond,
        T.steepClimbRotationGateFullRadiansPerSecond,
        Math.abs(state.angularVelocityBody.y),
      ));
    const steepClimbThrustFactor = 1 - steadySteepClimb * (1 - T.steepClimbMinimumThrustFactor);
    const thrust = scale(forward, state.throttle * T.maxThrustNewtons * steepClimbThrustFactor);
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
    const energyClimbFade = 1 - smoothstep(
      T.energyAssistFadeNoseUpStart,
      T.energyAssistFadeNoseUpFull,
      noseUp,
    );
    const energyRetention = scale(
      forward,
      (1 - energySpeedBlend) *
        energyThrottleBlend *
        energyClimbFade *
        T.energyAssistAccelerationMetersPerSecond2 *
        T.massKilograms,
    );
    const climbAngleAssist = smoothstep(
      T.poweredClimbAssistStartNoseUp,
      T.poweredClimbAssistFullNoseUp,
      noseUp,
    ) *
      (1 - smoothstep(
        T.poweredClimbAssistFadeNoseUpStart,
        T.poweredClimbAssistFadeNoseUpFull,
        noseUp,
      ));
    const climbSpeedAssist = smoothstep(
      T.stallSpeedMetersPerSecond * T.poweredClimbAssistMinimumSpeedRatio,
      T.stallSpeedMetersPerSecond * T.poweredClimbAssistFullSpeedRatio,
      forwardSpeed,
    );
    const poweredClimbAssist = scale(
      forward,
      climbAngleAssist *
        climbSpeedAssist *
        smoothstep(T.poweredClimbAssistThrottleThreshold, T.poweredClimbAssistFullThrottle, state.throttle) *
        T.poweredClimbAssistAccelerationMetersPerSecond2 *
        T.massKilograms,
    );
    const velocityDirection = speed > 0.01 ? normalize(state.velocityECEF) : forward;
    const liftDirection = normalize(
      subtract(aircraftUp, scale(velocityDirection, dot(aircraftUp, velocityDirection))),
      aircraftUp,
    );
    const lift = scale(liftDirection, liftMagnitude);
    const drag = speed > 0.01 ? scale(normalize(state.velocityECEF), -dragMagnitude) : vec3();
    const steepClimbEnergyResistance = scale(
      velocityDirection,
      -speed *
        smoothstep(T.steepClimbEnergyBleedStartNoseUp, T.steepClimbEnergyBleedFullNoseUp, noseUp) *
        Math.max(0, controls.pitch) *
        T.steepClimbEnergyBleedPerSecond *
        T.massKilograms,
    );
    const sideSlipResistance = scale(
      aircraftRight,
      -dot(state.velocityECEF, aircraftRight) * T.sideSlipDampingPerSecond * T.massKilograms,
    );
    const verticalSlipResistance = scale(
      aircraftUp,
      -dot(state.velocityECEF, aircraftUp) * T.verticalSlipDampingPerSecond * T.massKilograms,
    );
    const bankedClimbResistance = scale(
      basis.up,
      -Math.max(0, verticalSpeed) *
        Math.abs(controls.roll) *
        T.bankedClimbDampingPerSecond *
        T.massKilograms,
    );
    const gravity = scale(basis.up, -T.massKilograms * T.gravity);
    const acceleration = scale(
      add(
        add(add(add(thrust, energyRetention), poweredClimbAssist), lift),
        add(
          add(add(drag, steepClimbEnergyResistance), gravity),
          add(add(sideSlipResistance, verticalSlipResistance), bankedClimbResistance),
        ),
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
    if (!this.resolveObstacleContact(environment)) this.resolveGroundContact(environment);
  }

  telemetry(environment: FlightEnvironment): FlightTelemetry {
    const state = this.state;
    const geodetic = ecefToGeodetic(state.positionECEF);
    const basis = enuBasisAt(geodetic);
    const forward = rotateVec3(state.bodyToECEF, { x: 1, y: 0, z: 0 });
    const right = rotateVec3(state.bodyToECEF, { x: 0, y: 1, z: 0 });
    const aircraftUp = rotateVec3(state.bodyToECEF, { x: 0, y: 0, z: -1 });
    const airspeedMetersPerSecond = magnitude(state.velocityECEF);
    return {
      airspeedMetersPerSecond,
      altitudeMslMeters: geodetic.height,
      altitudeAglMeters: state.grounded || state.crashed
        ? 0
        : Math.max(0, geodetic.height - environment.groundHeight - T.groundClearanceMeters),
      headingDegrees: headingFromForward(geodetic, forward),
      pitchDegrees: Math.asin(clamp(dot(forward, basis.up), -1, 1)) * 180 / Math.PI,
      bankDegrees: Math.atan2(-dot(right, basis.up), dot(aircraftUp, basis.up)) * 180 / Math.PI,
      verticalSpeedMetersPerSecond: dot(state.velocityECEF, basis.up),
      throttle: state.throttle,
      brakes: state.brakes,
      flaps: state.flaps,
      grounded: state.grounded,
      crashed: state.crashed,
      crashReason: this.crashReason,
      landingStatus: this.landingStatus,
      stalled: !state.grounded && airspeedMetersPerSecond < T.stallSpeedMetersPerSecond,
    };
  }

  private createState(request: SpawnRequest): AircraftState {
    const latitude = degreesToRadians(request.latitudeDegrees);
    const longitude = degreesToRadians(request.longitudeDegrees);
    const isAirborne = request.mode === "air";
    const height = isAirborne
      ? request.elevationMeters + T.groundClearanceMeters + (request.airborneAltitudeMeters ?? T.defaultAirborneSpawnAltitudeMeters)
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
      this.crashAt(state.positionECEF, environment.groundHeight, "terrain");
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

  private resolveObstacleContact(environment: FlightEnvironment): boolean {
    const obstacleHeight = environment.obstacleHeight;
    if (this.state.grounded || obstacleHeight === undefined || !Number.isFinite(obstacleHeight)) return false;
    const geodetic = ecefToGeodetic(this.state.positionECEF);
    if (geodetic.height > obstacleHeight + T.buildingCollisionClearanceMeters) return false;
    this.crashAt(this.state.positionECEF, obstacleHeight, "building");
    return true;
  }

  private crashAt(position: AircraftState["positionECEF"], surfaceHeight: number, reason: FlightTelemetry["crashReason"]): void {
    const state = this.state;
    const geodetic = ecefToGeodetic(position);
    const forward = rotateVec3(state.bodyToECEF, { x: 1, y: 0, z: 0 });
    const heading = headingFromForward(geodetic, forward);
    state.positionECEF = moveToHeight(position, surfaceHeight + T.groundClearanceMeters);
    state.bodyToECEF = levelBodyOrientation(ecefToGeodetic(state.positionECEF), degreesToRadians(heading));
    state.velocityECEF = vec3();
    state.angularVelocityBody = vec3();
    state.grounded = false;
    state.crashed = true;
    this.crashReason = reason;
    this.landingStatus = "crashed";
    this.landingStatusAge = 0;
  }
}
