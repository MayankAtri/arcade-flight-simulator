import {
  Cartesian2,
  Cartesian3,
  CloudCollection,
  Color,
  type Scene,
} from "cesium";
import type { WeatherPreset, WorldQuality } from "./types";

export type CloudLayoutDescriptor = {
  latitudeDegrees: number;
  longitudeDegrees: number;
  altitudeMeters: number;
  altitudeAglMeters: number;
  distanceMeters: number;
  scaleX: number;
  scaleY: number;
  maximumSizeX: number;
  maximumSizeY: number;
  maximumSizeZ: number;
  slice: number;
  brightness: number;
  alpha: number;
  family: number;
};

const CLOUD_COUNTS: Record<WeatherPreset, Record<WorldQuality, number>> = {
  clear: { low: 0, medium: 0, high: 0 },
  scattered: { low: 2, medium: 5, high: 8 },
  cloudy: { low: 4, medium: 7, high: 12 },
};

const CLOUD_RANGES_METERS: Record<WeatherPreset, Record<WorldQuality, number>> = {
  clear: { low: 0, medium: 0, high: 0 },
  scattered: { low: 10_000, medium: 16_000, high: 22_000 },
  cloudy: { low: 12_000, medium: 18_000, high: 25_000 },
};

const hashString = (value: string): number => {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
};

const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const coarseCell = (latitudeDegrees: number, longitudeDegrees: number): string => (
  `${Math.floor(latitudeDegrees / 0.2)}:${Math.floor(longitudeDegrees / 0.2)}`
);

export const cloudCountFor = (preset: WeatherPreset, quality: WorldQuality): number => (
  CLOUD_COUNTS[preset][quality]
);

export const generateCloudLayout = (
  preset: WeatherPreset,
  quality: WorldQuality,
  latitudeDegrees: number,
  longitudeDegrees: number,
  groundHeightMeters: number,
): CloudLayoutDescriptor[] => {
  const count = cloudCountFor(preset, quality);
  if (count === 0) return [];
  const cell = coarseCell(latitudeDegrees, longitudeDegrees);
  const random = seededRandom(hashString(`${cell}:${preset}:${quality}`));
  const rangeMeters = CLOUD_RANGES_METERS[preset][quality];
  const latitudeScale = 1 / 111_320;
  const longitudeScale = 1 / (111_320 * Math.max(0.2, Math.cos(latitudeDegrees * Math.PI / 180)));

  return Array.from({ length: count }, (_, index) => {
    const bearing = ((index + (random() - 0.5) * 0.34) / count) * Math.PI * 2;
    const minimumRadius = preset === "scattered" ? rangeMeters * 0.36 : rangeMeters * 0.2;
    const distanceMeters = minimumRadius + Math.sqrt(random()) * (rangeMeters - minimumRadius);
    const northMeters = Math.cos(bearing) * distanceMeters;
    const eastMeters = Math.sin(bearing) * distanceMeters;
    const family = quality === "low" ? 0 : quality === "medium" ? index % 2 : index % 3;

    if (preset === "scattered") {
      const scaleX = 1_700 + random() * 2_900;
      const scaleY = 700 + random() * 1_050;
      const altitudeAglMeters = 1_200 + random() * 420;
      return {
        latitudeDegrees: latitudeDegrees + northMeters * latitudeScale,
        longitudeDegrees: longitudeDegrees + eastMeters * longitudeScale,
        altitudeMeters: groundHeightMeters + altitudeAglMeters,
        altitudeAglMeters,
        distanceMeters,
        scaleX,
        scaleY,
        maximumSizeX: 20 + random() * 16,
        maximumSizeY: 10 + random() * 9,
        maximumSizeZ: 10 + random() * 12,
        slice: 0.34 + random() * 0.24,
        brightness: 0.88 + random() * 0.1,
        alpha: 0.9 + random() * 0.08,
        family,
      };
    }

    const scaleX = 5_500 + random() * 4_000;
    const scaleY = 1_250 + random() * 750;
    const altitudeAglMeters = 1_100 + random() * 320;
    return {
      latitudeDegrees: latitudeDegrees + northMeters * latitudeScale,
      longitudeDegrees: longitudeDegrees + eastMeters * longitudeScale,
      altitudeMeters: groundHeightMeters + altitudeAglMeters,
      altitudeAglMeters,
      distanceMeters,
      scaleX,
      scaleY,
      maximumSizeX: 27 + random() * 20,
      maximumSizeY: 9 + random() * 8,
      maximumSizeZ: 8 + random() * 9,
      slice: 0.38 + random() * 0.2,
      brightness: 0.68 + random() * 0.14,
      alpha: 0.9 + random() * 0.08,
      family,
    };
  });
};

export class WeatherSystem {
  private collections: CloudCollection[] = [];
  private preset: WeatherPreset = "clear";
  private quality: WorldQuality = "medium";
  private visible = false;
  private anchor: { latitudeDegrees: number; longitudeDegrees: number; groundHeightMeters: number } | null = null;
  private layoutKey = "";
  private destroyed = false;

  constructor(private readonly scene: Scene) {}

  private ensureCollections(): void {
    if (this.collections.length > 0) return;
    const offsets = [
      new Cartesian3(0, 0, 0),
      new Cartesian3(11, 23, 7),
      new Cartesian3(29, 5, 17),
    ];
    this.collections = offsets.map((noiseOffset, index) => {
      const collection = new CloudCollection({ show: false, noiseDetail: index === 1 ? 32 : 16 });
      collection.noiseOffset = noiseOffset;
      return this.scene.primitives.add(collection);
    });
  }

  setPreset(preset: WeatherPreset): void {
    if (this.preset === preset) return;
    this.preset = preset;
    this.rebuild(true);
  }

  setQuality(quality: WorldQuality): void {
    if (this.quality === quality) return;
    this.quality = quality;
    this.rebuild(true);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const collection of this.collections) {
      collection.show = visible && this.preset !== "clear" && collection.length > 0;
    }
    this.scene.requestRender();
  }

  updateAnchor(
    latitudeDegrees: number,
    longitudeDegrees: number,
    groundHeightMeters: number,
    force = false,
  ): void {
    const nextCell = coarseCell(latitudeDegrees, longitudeDegrees);
    const currentCell = this.anchor
      ? coarseCell(this.anchor.latitudeDegrees, this.anchor.longitudeDegrees)
      : "";
    this.anchor = { latitudeDegrees, longitudeDegrees, groundHeightMeters };
    if (force || nextCell !== currentCell) this.rebuild(true);
  }

  cloudCount(): number {
    return this.collections.reduce((total, collection) => total + collection.length, 0);
  }

  clear(): void {
    for (const collection of this.collections) {
      collection.removeAll();
      if (!this.scene.isDestroyed() && !collection.isDestroyed()) {
        this.scene.primitives.remove(collection);
      } else if (!collection.isDestroyed()) {
        collection.destroy();
      }
    }
    this.collections = [];
    this.layoutKey = "";
    if (!this.scene.isDestroyed()) this.scene.requestRender();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.clear();
    this.destroyed = true;
  }

  private rebuild(force = false): void {
    if (this.destroyed) return;
    if (!this.anchor || this.preset === "clear") {
      this.clear();
      return;
    }
    const key = `${coarseCell(this.anchor.latitudeDegrees, this.anchor.longitudeDegrees)}:${this.preset}:${this.quality}`;
    if (!force && key === this.layoutKey) return;
    this.ensureCollections();
    for (const collection of this.collections) collection.removeAll();
    const layout = generateCloudLayout(
      this.preset,
      this.quality,
      this.anchor.latitudeDegrees,
      this.anchor.longitudeDegrees,
      this.anchor.groundHeightMeters,
    );
    for (const cloud of layout) {
      this.collections[cloud.family].add({
        position: Cartesian3.fromDegrees(cloud.longitudeDegrees, cloud.latitudeDegrees, cloud.altitudeMeters),
        scale: new Cartesian2(cloud.scaleX, cloud.scaleY),
        maximumSize: new Cartesian3(cloud.maximumSizeX, cloud.maximumSizeY, cloud.maximumSizeZ),
        slice: cloud.slice,
        brightness: cloud.brightness,
        color: new Color(1, 1, 1, cloud.alpha),
      });
    }
    this.layoutKey = key;
    for (const collection of this.collections) collection.show = this.visible && collection.length > 0;
    this.scene.requestRender();
  }
}
