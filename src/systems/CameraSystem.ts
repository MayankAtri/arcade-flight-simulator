import { Cartesian3, Math as CesiumMath, PerspectiveFrustum, type Camera } from "cesium";
import { ecefToGeodetic, enuBasisAt } from "../flight/coordinates";
import { add, clamp, lerpVec3, normalize, rotateVec3, scale, subtract, type Quat, type Vec3 } from "../flight/math";
import { FLIGHT_TUNING as T } from "../flight/tuning";

export type CameraMode = "chase" | "cockpit";

export class CameraSystem {
  mode: CameraMode = "chase";
  private chasePosition: Vec3 | null = null;
  private chaseTarget: Vec3 | null = null;

  reset(): void {
    this.chasePosition = null;
    this.chaseTarget = null;
  }

  cycle(): CameraMode {
    this.mode = this.mode === "chase" ? "cockpit" : "chase";
    this.reset();
    return this.mode;
  }

  update(camera: Camera, position: Vec3, orientation: Quat, airspeed: number, dt: number): void {
    const forward = rotateVec3(orientation, { x: 1, y: 0, z: 0 });
    const aircraftUp = rotateVec3(orientation, { x: 0, y: 0, z: -1 });
    const localUp = enuBasisAt(ecefToGeodetic(position)).up;

    if (this.mode === "cockpit") {
      const cockpitPosition = add(
        position,
        add(scale(forward, T.cockpitForwardOffsetMeters), scale(aircraftUp, T.cockpitUpOffsetMeters)),
      );
      camera.setView({
        destination: new Cartesian3(cockpitPosition.x, cockpitPosition.y, cockpitPosition.z),
        orientation: {
          direction: new Cartesian3(forward.x, forward.y, forward.z),
          up: new Cartesian3(aircraftUp.x, aircraftUp.y, aircraftUp.z),
        },
      });
      this.setFov(camera, T.cockpitFovDegrees, 0.12);
      return;
    }

    const speedDistance = T.chaseDistanceMeters + clamp(airspeed - 35, 0, 55) * 0.12;
    const desired = add(position, add(scale(forward, -speedDistance), scale(localUp, T.chaseHeightMeters)));
    const safeDt = Math.min(dt, 0.05);
    const positionSmoothing = 1 - Math.exp(-T.chasePositionResponsePerSecond * safeDt);
    const desiredTarget = add(position, scale(localUp, 1.4));
    const targetSmoothing = 1 - Math.exp(-T.chaseTargetResponsePerSecond * safeDt);
    this.chasePosition = this.chasePosition ? lerpVec3(this.chasePosition, desired, positionSmoothing) : desired;
    this.chaseTarget = this.chaseTarget ? lerpVec3(this.chaseTarget, desiredTarget, targetSmoothing) : desiredTarget;
    const direction = normalize(subtract(this.chaseTarget, this.chasePosition));
    const rollBlend = T.chaseRollCoupling;
    const cameraUp = normalize(lerpVec3(localUp, aircraftUp, rollBlend), localUp);
    camera.setView({
      destination: new Cartesian3(this.chasePosition.x, this.chasePosition.y, this.chasePosition.z),
      orientation: {
        direction: new Cartesian3(direction.x, direction.y, direction.z),
        up: new Cartesian3(cameraUp.x, cameraUp.y, cameraUp.z),
      },
    });
    this.setFov(
      camera,
      T.chaseBaseFovDegrees + clamp((airspeed - 30) * 0.16, 0, T.chaseMaximumFovBonusDegrees),
      0.45,
    );
  }

  private setFov(camera: Camera, degrees: number, nearMeters: number): void {
    if (camera.frustum instanceof PerspectiveFrustum) {
      camera.frustum.fov = CesiumMath.toRadians(degrees);
      camera.frustum.near = nearMeters;
    }
  }
}
