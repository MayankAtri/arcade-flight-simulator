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
import type { EnvironmentVisualState } from "../world/types";
import { calculateEnvironmentVisualProfile } from "../world/DaylightSystem";

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

  setEnvironment(state: EnvironmentVisualState): void {
    if (!this.model) return;
    const profile = calculateEnvironmentVisualProfile(state);
    const daylight = state.daylight;
    const directIntensity = profile.aircraftDirectIntensity;
    const lightColor = this.model.lightColor ?? new Cartesian3();
    lightColor.x = directIntensity * (1 + daylight.horizon * 0.055);
    lightColor.y = directIntensity * (1 + daylight.horizon * 0.012);
    lightColor.z = directIntensity * (1 - daylight.horizon * 0.05);
    this.model.lightColor = lightColor;
    this.model.imageBasedLighting.imageBasedLightingFactor.x = profile.aircraftDiffuseIbl;
    this.model.imageBasedLighting.imageBasedLightingFactor.y = profile.aircraftSpecularIbl;
    this.model.environmentMapManager.brightness = profile.aircraftEnvironmentBrightness;
    this.model.environmentMapManager.saturation = profile.environmentSaturation;
    this.model.environmentMapManager.atmosphereScatteringIntensity = profile.atmosphereScatteringIntensity;
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
