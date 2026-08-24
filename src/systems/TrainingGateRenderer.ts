import {
  Cartesian3,
  Color,
  Material,
  Matrix4,
  PolylineCollection,
  Transforms,
  type Scene,
} from "cesium";
import type { TrainingGate } from "../flight-school/types";

type RenderedGate = {
  id: string;
  inner: ReturnType<PolylineCollection["add"]>;
  halo: ReturnType<PolylineCollection["add"]>;
};

const ACTIVE_COLOR = Color.fromCssColorString("#18d9ff");
const FUTURE_COLOR = Color.fromCssColorString("#79adbd");

export const trainingGateRingPositions = (gate: TrainingGate, groundElevationMeters: number): Cartesian3[] => {
  const center = Cartesian3.fromDegrees(
    gate.longitudeDegrees,
    gate.latitudeDegrees,
    groundElevationMeters + gate.altitudeAglMeters,
  );
  const enuToEcef = Transforms.eastNorthUpToFixedFrame(center);
  const heading = gate.headingDegrees * Math.PI / 180;
  const flightPathAngle = gate.flightPathAngleDegrees * Math.PI / 180;
  const right = new Cartesian3(Math.cos(heading), -Math.sin(heading), 0);
  const direction = new Cartesian3(Math.sin(heading), Math.cos(heading), 0);
  const vertical = new Cartesian3(
    -direction.x * Math.sin(flightPathAngle),
    -direction.y * Math.sin(flightPathAngle),
    Math.cos(flightPathAngle),
  );
  const positions: Cartesian3[] = [];
  const segments = 72;
  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const local = Cartesian3.add(
      Cartesian3.multiplyByScalar(right, Math.cos(angle) * gate.radiusMeters, new Cartesian3()),
      Cartesian3.multiplyByScalar(vertical, Math.sin(angle) * gate.radiusMeters, new Cartesian3()),
      new Cartesian3(),
    );
    positions.push(Matrix4.multiplyByPoint(enuToEcef, local, new Cartesian3()));
  }
  return positions;
};

const glowMaterial = (color: Color, glowPower: number): Material => Material.fromType("PolylineGlow", {
  color,
  glowPower,
  taperPower: 1,
});

export class TrainingGateRenderer {
  private collection: PolylineCollection | null = null;
  private rendered: RenderedGate[] = [];

  show(scene: Scene, gates: readonly TrainingGate[], groundElevationMeters: number): void {
    this.clear(scene);
    if (!gates.length) return;
    const collection = scene.primitives.add(new PolylineCollection());
    this.collection = collection;
    this.rendered = gates.map((gate) => {
      const positions = trainingGateRingPositions(gate, groundElevationMeters);
      const halo = collection.add({
        positions,
        width: 12,
        material: glowMaterial(FUTURE_COLOR.withAlpha(0.22), 0.32),
      });
      const inner = collection.add({
        positions,
        width: 3,
        material: Material.fromType("Color", { color: FUTURE_COLOR.withAlpha(0.55) }),
      });
      return { id: gate.id, inner, halo };
    });
  }

  update(activeGateId: string | null, passedGateIds: ReadonlySet<string>): void {
    for (const gate of this.rendered) {
      const passed = passedGateIds.has(gate.id);
      const active = gate.id === activeGateId;
      gate.inner.show = !passed;
      gate.halo.show = !passed;
      if (passed) continue;
      gate.inner.material = Material.fromType("Color", {
        color: (active ? ACTIVE_COLOR : FUTURE_COLOR).withAlpha(active ? 1 : 0.45),
      });
      gate.halo.material = glowMaterial(
        (active ? ACTIVE_COLOR : FUTURE_COLOR).withAlpha(active ? 0.78 : 0.16),
        active ? 0.42 : 0.25,
      );
      gate.inner.width = active ? 5 : 2;
      gate.halo.width = active ? 16 : 9;
    }
  }

  clear(scene: Scene | null): void {
    if (this.collection && scene && !scene.isDestroyed()) scene.primitives.remove(this.collection);
    this.collection = null;
    this.rendered = [];
  }
}
