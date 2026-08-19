import { Cartesian2, Cartesian3, SceneTransforms, type Scene } from "cesium";
import { ecefToGeodetic } from "../flight/coordinates";
import { add, magnitude, rotateVec3, scale, subtract, type Quat, type Vec3 } from "../flight/math";
import { FLIGHT_TUNING as T } from "../flight/tuning";

export type SceneSurface = {
  height: number;
  kind: "building";
};

export const isBuildingProbeHit = (distanceMeters: number, maximumDistanceMeters: number): boolean =>
  Number.isFinite(distanceMeters) && distanceMeters >= 0 && distanceMeters <= maximumDistanceMeters;

export class SceneCollisionSystem {
  private readonly probeCartesian = new Cartesian3();
  private readonly aircraftCartesian = new Cartesian3();
  private readonly windowPosition = new Cartesian2();
  private readonly pickedCartesian = new Cartesian3();
  private lastSampleAt = -Infinity;

  constructor(
    private readonly scene: Scene,
    private readonly isBuildingPick: (picked: unknown) => boolean,
  ) {}

  reset(): void {
    this.lastSampleAt = -Infinity;
  }

  sampleBuilding(position: Vec3, bodyToECEF: Quat, now: number): SceneSurface | null {
    if (now - this.lastSampleAt < T.buildingCollisionSampleIntervalMilliseconds) return null;
    this.lastSampleAt = now;
    if (!this.scene.pickPositionSupported) return null;

    this.aircraftCartesian.x = position.x;
    this.aircraftCartesian.y = position.y;
    this.aircraftCartesian.z = position.z;
    const forward = rotateVec3(bodyToECEF, { x: 1, y: 0, z: 0 });
    const right = rotateVec3(bodyToECEF, { x: 0, y: 1, z: 0 });
    const probes = [
      scale(forward, T.buildingCollisionProbeForwardMeters),
      add(scale(forward, T.buildingCollisionProbeForwardMeters * 0.62), scale(right, T.buildingCollisionProbeSideMeters)),
      add(scale(forward, T.buildingCollisionProbeForwardMeters * 0.62), scale(right, -T.buildingCollisionProbeSideMeters)),
    ];

    for (const offset of probes) {
      const probe = add(position, offset);
      this.probeCartesian.x = probe.x;
      this.probeCartesian.y = probe.y;
      this.probeCartesian.z = probe.z;
      const windowPosition = SceneTransforms.worldToWindowCoordinates(
        this.scene,
        this.probeCartesian,
        this.windowPosition,
      );
      if (!windowPosition) continue;
      if (
        windowPosition.x < 0 ||
        windowPosition.y < 0 ||
        windowPosition.x > this.scene.canvas.clientWidth ||
        windowPosition.y > this.scene.canvas.clientHeight
      ) continue;

      const picked = this.scene.pick(windowPosition, 3, 3);
      if (!this.isBuildingPick(picked)) continue;
      const pickedPosition = this.scene.pickPosition(windowPosition, this.pickedCartesian);
      if (!pickedPosition) continue;
      const hit = { x: pickedPosition.x, y: pickedPosition.y, z: pickedPosition.z };
      const distance = magnitude(subtract(hit, position));
      if (!isBuildingProbeHit(distance, T.buildingCollisionMaximumHitDistanceMeters)) continue;
      return { height: ecefToGeodetic(hit).height, kind: "building" };
    }
    return null;
  }
}
