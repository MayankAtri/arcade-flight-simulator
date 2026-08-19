import {
  Cartesian3,
  Credit,
  Matrix3,
  Matrix4,
  Model,
  Quaternion,
  ShadowMode,
  type Scene,
} from "cesium";
import { multiplyQuat, quatFromRotationVector, type Quat, type Vec3 } from "../flight/math";
import type { DaylightState } from "../world/types";

export class AircraftRenderer {
  private model: Model | null = null;
  private scene: Scene | null = null;

  async initialize(scene: Scene): Promise<void> {
    const model = await Model.fromGltfAsync({
      url: "/assets/aircraft/cessna-172sp.glb",
      modelMatrix: Matrix4.IDENTITY,
      scale: 3,
      minimumPixelSize: 42,
      maximumScale: 3,
      shadows: ShadowMode.ENABLED,
      showCreditsOnScreen: false,
      credit: new Credit('"FREE Cessna 172SP" by NLM, CC BY 4.0'),
    });
    this.model = model;
    try {
      scene.primitives.add(model);
      this.scene = scene;
    } catch (error) {
      if (!model.isDestroyed()) model.destroy();
      this.model = null;
      throw error;
    }
  }

  update(position: Vec3, bodyOrientation: Quat): void {
    if (!this.model) return;
    const visualCorrection = quatFromRotationVector({ x: Math.PI, y: 0, z: 0 });
    const visualOrientation = multiplyQuat(bodyOrientation, visualCorrection);
    const rotation = Matrix3.fromQuaternion(
      new Quaternion(visualOrientation.x, visualOrientation.y, visualOrientation.z, visualOrientation.w),
    );
    this.model.modelMatrix = Matrix4.fromRotationTranslation(rotation, new Cartesian3(position.x, position.y, position.z));
  }

  setDaylight(state: DaylightState): void {
    if (!this.model) return;
    const daylight = state.daylight;
    const directIntensity = 1.02 + daylight * 0.48;
    const lightColor = this.model.lightColor ?? new Cartesian3();
    lightColor.x = directIntensity * (1 + state.horizon * 0.06);
    lightColor.y = directIntensity * (1 + state.horizon * 0.015);
    lightColor.z = directIntensity * (1 - state.horizon * 0.055);
    this.model.lightColor = lightColor;
    this.model.imageBasedLighting.imageBasedLightingFactor.x = 0.78 + daylight * 0.22;
    this.model.imageBasedLighting.imageBasedLightingFactor.y = 0.62 + daylight * 0.28;
    this.model.environmentMapManager.brightness = 0.88 + daylight * 0.2;
    this.model.environmentMapManager.saturation = 0.92 + daylight * 0.04;
    this.model.environmentMapManager.atmosphereScatteringIntensity = 0.72 + daylight * 0.58;
  }

  setVisible(visible: boolean): void {
    if (this.model) this.model.show = visible;
  }

  collisionExclusions(): object[] {
    return this.model ? [this.model] : [];
  }

  destroy(scene: Scene | null = this.scene): void {
    if (this.model && !this.model.isDestroyed()) {
      if (scene && !scene.isDestroyed()) scene.primitives.remove(this.model);
      else this.model.destroy();
    }
    this.model = null;
    this.scene = null;
  }
}
