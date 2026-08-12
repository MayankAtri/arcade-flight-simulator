import {
  Cartesian3,
  Credit,
  Matrix3,
  Matrix4,
  Model,
  ModelAnimationLoop,
  Quaternion,
  ShadowMode,
  type Scene,
} from "cesium";
import { multiplyQuat, quatFromRotationVector, type Quat, type Vec3 } from "../flight/math";

export class AircraftRenderer {
  private model: Model | null = null;

  async initialize(scene: Scene): Promise<void> {
    this.model = await Model.fromGltfAsync({
      url: "/assets/aircraft/cessna-172sp.glb",
      modelMatrix: Matrix4.IDENTITY,
      scale: 3,
      minimumPixelSize: 42,
      maximumScale: 3,
      shadows: ShadowMode.ENABLED,
      lightColor: new Cartesian3(1.65, 1.65, 1.65),
      showCreditsOnScreen: false,
      credit: new Credit('"FREE Cessna 172SP" by NLM, CC BY 4.0'),
    });
    scene.primitives.add(this.model);
    const startAnimations = () => {
      if (!this.model || this.model.isDestroyed() || this.model.activeAnimations.length > 0) return;
      this.model.activeAnimations.addAll({
        loop: ModelAnimationLoop.REPEAT,
        multiplier: 1.6,
      });
    };
    if (this.model.ready) startAnimations();
    else this.model.readyEvent.addEventListener(startAnimations);
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

  destroy(scene: Scene): void {
    if (this.model && !this.model.isDestroyed()) scene.primitives.remove(this.model);
    this.model = null;
  }
}
