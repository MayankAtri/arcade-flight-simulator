import { Cartesian3, Math as CesiumMath, PerspectiveFrustum, type Camera } from "cesium";
import { ecefToGeodetic, enuBasisAt } from "../flight/coordinates";
import {
  add,
  clamp,
  dot,
  lerpVec3,
  magnitude,
  normalize,
  rotateVec3,
  scale,
  subtract,
  type Quat,
  type Vec3,
} from "../flight/math";
import { FLIGHT_TUNING as T } from "../flight/tuning";

export const CAMERA_MODES = ["chase", "chase-far", "flyby", "top-down", "cockpit"] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];

const CAMERA_MODE_LABELS: Record<CameraMode, string> = {
  chase: "External",
  "chase-far": "External far",
  flyby: "Flyby",
  "top-down": "Top down",
  cockpit: "Cockpit",
};

export const cameraModeLabel = (mode: CameraMode): string => CAMERA_MODE_LABELS[mode];

export const nextCameraMode = (mode: CameraMode): CameraMode => {
  const index = CAMERA_MODES.indexOf(mode);
  return CAMERA_MODES[(index + 1) % CAMERA_MODES.length];
};

export class CameraSystem {
  mode: CameraMode = "chase";
  private chasePosition: Vec3 | null = null;
  private chaseTarget: Vec3 | null = null;
  private flybyAnchor: Vec3 | null = null;

  reset(): void {
    this.chasePosition = null;
    this.chaseTarget = null;
    this.flybyAnchor = null;
  }

  cycle(): CameraMode {
    this.mode = nextCameraMode(this.mode);
    this.reset();
    return this.mode;
  }

  update(camera: Camera, position: Vec3, orientation: Quat, airspeed: number, dt: number): void {
    const forward = rotateVec3(orientation, { x: 1, y: 0, z: 0 });
    const aircraftRight = rotateVec3(orientation, { x: 0, y: 1, z: 0 });
    const aircraftUp = rotateVec3(orientation, { x: 0, y: 0, z: -1 });
    const localBasis = enuBasisAt(ecefToGeodetic(position));
    const localUp = localBasis.up;

    if (this.mode === "cockpit") {
      const cockpitPosition = add(
        position,
        add(
          scale(forward, T.cockpitForwardOffsetMeters),
          add(scale(aircraftRight, T.cockpitRightOffsetMeters), scale(aircraftUp, T.cockpitUpOffsetMeters)),
        ),
      );
      const lookDownRadians = CesiumMath.toRadians(T.cockpitLookDownDegrees);
      const cockpitDirection = add(
        scale(forward, Math.cos(lookDownRadians)),
        scale(aircraftUp, -Math.sin(lookDownRadians)),
      );
      const cockpitUp = add(
        scale(forward, Math.sin(lookDownRadians)),
        scale(aircraftUp, Math.cos(lookDownRadians)),
      );
      camera.setView({
        destination: new Cartesian3(cockpitPosition.x, cockpitPosition.y, cockpitPosition.z),
        orientation: {
          direction: new Cartesian3(cockpitDirection.x, cockpitDirection.y, cockpitDirection.z),
          up: new Cartesian3(cockpitUp.x, cockpitUp.y, cockpitUp.z),
        },
      });
      this.setFov(camera, T.cockpitFovDegrees, 0.12);
      return;
    }

    if (this.mode === "top-down") {
      const topDownPosition = add(position, scale(localUp, T.topDownHeightMeters));
      const horizontalForward = normalize(
        subtract(forward, scale(localUp, dot(forward, localUp))),
        localBasis.north,
      );
      camera.setView({
        destination: new Cartesian3(topDownPosition.x, topDownPosition.y, topDownPosition.z),
        orientation: {
          direction: new Cartesian3(-localUp.x, -localUp.y, -localUp.z),
          up: new Cartesian3(horizontalForward.x, horizontalForward.y, horizontalForward.z),
        },
      });
      this.setFov(camera, T.topDownFovDegrees, 0.45);
      return;
    }

    if (this.mode === "flyby") {
      if (!this.flybyAnchor || magnitude(subtract(position, this.flybyAnchor)) > T.flybyResetDistanceMeters) {
        this.flybyAnchor = add(
          position,
          add(
            scale(forward, T.flybyForwardOffsetMeters),
            add(scale(aircraftRight, T.flybyRightOffsetMeters), scale(localUp, T.flybyHeightMeters)),
          ),
        );
      }
      const flybyTarget = add(position, scale(localUp, 1.4));
      const flybyDirection = normalize(subtract(flybyTarget, this.flybyAnchor));
      camera.setView({
        destination: new Cartesian3(this.flybyAnchor.x, this.flybyAnchor.y, this.flybyAnchor.z),
        orientation: {
          direction: new Cartesian3(flybyDirection.x, flybyDirection.y, flybyDirection.z),
          up: new Cartesian3(localUp.x, localUp.y, localUp.z),
        },
      });
      this.setFov(camera, T.flybyFovDegrees, 0.45);
      return;
    }

    const far = this.mode === "chase-far";
    const baseDistance = far ? T.chaseFarDistanceMeters : T.chaseDistanceMeters;
    const height = far ? T.chaseFarHeightMeters : T.chaseHeightMeters;
    const speedDistance = baseDistance + (far ? 0 : clamp(airspeed - 35, 0, 55) * 0.12);
    const desired = add(position, add(scale(forward, -speedDistance), scale(localUp, height)));
    const safeDt = Math.min(dt, 0.05);
    const positionSmoothing = 1 - Math.exp(-T.chasePositionResponsePerSecond * safeDt);
    const desiredTarget = add(position, scale(localUp, 1.4));
    const targetSmoothing = 1 - Math.exp(-T.chaseTargetResponsePerSecond * safeDt);
    this.chasePosition = this.chasePosition ? lerpVec3(this.chasePosition, desired, positionSmoothing) : desired;
    this.chaseTarget = this.chaseTarget ? lerpVec3(this.chaseTarget, desiredTarget, targetSmoothing) : desiredTarget;
    const direction = normalize(subtract(this.chaseTarget, this.chasePosition));
    const rollBlend = far ? 0.04 : T.chaseRollCoupling;
    const cameraUp = normalize(lerpVec3(localUp, aircraftUp, rollBlend), localUp);
    camera.setView({
      destination: new Cartesian3(this.chasePosition.x, this.chasePosition.y, this.chasePosition.z),
      orientation: {
        direction: new Cartesian3(direction.x, direction.y, direction.z),
        up: new Cartesian3(cameraUp.x, cameraUp.y, cameraUp.z),
      },
    });
    const chaseFov = far
      ? T.chaseFarFovDegrees
      : T.chaseBaseFovDegrees + clamp((airspeed - 30) * 0.16, 0, T.chaseMaximumFovBonusDegrees);
    this.setFov(camera, chaseFov, 0.45);
  }

  private setFov(camera: Camera, degrees: number, nearMeters: number): void {
    if (camera.frustum instanceof PerspectiveFrustum) {
      camera.frustum.fov = CesiumMath.toRadians(degrees);
      camera.frustum.near = nearMeters;
    }
  }
}
