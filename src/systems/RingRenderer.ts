import { Cartesian3, Color, Material, PolylineCollection, type Scene } from "cesium";
import { add, scale, type Vec3 } from "../flight/math";
import { ringGatePositions, type ResolvedRingGate } from "../ring-runs/geometry";

type RenderedRing = {
  inner: ReturnType<PolylineCollection["add"]>;
  halo: ReturnType<PolylineCollection["add"]>;
  marker: ReturnType<PolylineCollection["add"]>;
};

const ACTIVE_COLOR = Color.fromCssColorString("#72e7ff");
const FUTURE_COLOR = Color.fromCssColorString("#8fb8c6");

const asCartesian = (point: Vec3): Cartesian3 => new Cartesian3(point.x, point.y, point.z);

const glowMaterial = (color: Color, glowPower: number): Material => Material.fromType("PolylineGlow", {
  color,
  glowPower,
  taperPower: 1,
});

const directionMarkerPositions = (resolved: ResolvedRingGate): Cartesian3[] => {
  const radius = resolved.gate.radiusMeters;
  const lower = add(resolved.centerECEF, scale(resolved.verticalECEF, -radius * 0.72));
  return [
    add(lower, scale(resolved.rightECEF, -radius * 0.24)),
    add(resolved.centerECEF, scale(resolved.verticalECEF, -radius * 0.94)),
    add(lower, scale(resolved.rightECEF, radius * 0.24)),
  ].map(asCartesian);
};

export class RingRenderer {
  private collection: PolylineCollection | null = null;
  private rendered: RenderedRing[] = [];

  show(scene: Scene, gates: readonly ResolvedRingGate[]): void {
    this.clear(scene);
    if (!gates.length) return;
    const collection = scene.primitives.add(new PolylineCollection());
    this.collection = collection;
    this.rendered = gates.map((gate) => {
      const positions = ringGatePositions(gate).map(asCartesian);
      const halo = collection.add({
        positions,
        width: 18,
        material: glowMaterial(FUTURE_COLOR.withAlpha(0.18), 0.36),
      });
      const inner = collection.add({
        positions,
        width: 3,
        material: Material.fromType("Color", { color: FUTURE_COLOR.withAlpha(0.5) }),
      });
      const marker = collection.add({
        positions: directionMarkerPositions(gate),
        width: 5,
        material: Material.fromType("Color", { color: ACTIVE_COLOR }),
        show: false,
      });
      return { inner, halo, marker };
    });
    this.update(0);
  }

  update(activeGateIndex: number): void {
    for (let index = 0; index < this.rendered.length; index += 1) {
      const rendered = this.rendered[index];
      const active = index === activeGateIndex;
      const visible = index >= activeGateIndex && index <= activeGateIndex + 3;
      rendered.inner.show = visible;
      rendered.halo.show = visible;
      rendered.marker.show = active;
      if (!visible) continue;
      rendered.inner.width = active ? 6 : 2.5;
      rendered.halo.width = active ? 22 : 12;
      rendered.inner.material = Material.fromType("Color", {
        color: (active ? ACTIVE_COLOR : FUTURE_COLOR).withAlpha(active ? 1 : 0.45),
      });
      rendered.halo.material = glowMaterial(
        (active ? ACTIVE_COLOR : FUTURE_COLOR).withAlpha(active ? 0.82 : 0.16),
        active ? 0.48 : 0.28,
      );
    }
  }

  clear(scene: Scene | null): void {
    if (this.collection && scene && !scene.isDestroyed()) scene.primitives.remove(this.collection);
    this.collection = null;
    this.rendered = [];
  }
}
