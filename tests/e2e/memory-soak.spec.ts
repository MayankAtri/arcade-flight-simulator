import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { SpawnRequest } from "../../src/flight/types";
import type { RuntimeMemoryDiagnostics } from "../../src/systems/SimulationEngine";

type MemoryDebugApi = {
  snapshot: () => RuntimeMemoryDiagnostics | null;
  transitionTo: (request: SpawnRequest) => Promise<RuntimeMemoryDiagnostics | null>;
  respawn: () => RuntimeMemoryDiagnostics | null;
};

declare global {
  interface Window {
    __flightSimulatorMemory?: MemoryDebugApi;
  }
}

const DESTINATIONS: Array<{ label: string; spawn: SpawnRequest }> = [
  { label: "Dubai", spawn: { latitudeDegrees: 25.2528, longitudeDegrees: 55.3644, elevationMeters: 3, headingDegrees: 121, mode: "air", airborneAltitudeMeters: 304.8 } },
  { label: "New York", spawn: { latitudeDegrees: 40.6413, longitudeDegrees: -73.7781, elevationMeters: 4, headingDegrees: 31, mode: "air", airborneAltitudeMeters: 304.8 } },
  { label: "London", spawn: { latitudeDegrees: 51.47, longitudeDegrees: -0.4543, elevationMeters: 25, headingDegrees: 90, mode: "air", airborneAltitudeMeters: 304.8 } },
  { label: "Mumbai", spawn: { latitudeDegrees: 19.0896, longitudeDegrees: 72.8656, elevationMeters: 11, headingDegrees: 270, mode: "air", airborneAltitudeMeters: 304.8 } },
  { label: "Madeira", spawn: { latitudeDegrees: 32.6979, longitudeDegrees: -16.7745, elevationMeters: 59, headingDegrees: 50, mode: "air", airborneAltitudeMeters: 304.8 } },
  { label: "Monterey", spawn: { latitudeDegrees: 36.587, longitudeDegrees: -121.843, elevationMeters: 78, headingDegrees: 100, mode: "air", airborneAltitudeMeters: 304.8 } },
  { label: "Dubai return", spawn: { latitudeDegrees: 25.2528, longitudeDegrees: 55.3644, elevationMeters: 3, headingDegrees: 121, mode: "air", airborneAltitudeMeters: 304.8 } },
];

test("records two deterministic world-transition laps without unbounded retained memory", async ({ page }, testInfo) => {
  test.skip(process.env.RUN_MEMORY_SOAK !== "1", "Run explicitly with npm run test:memory.");
  test.setTimeout(8 * 60_000);

  await page.goto("/?debugMemory=1");
  await expect(page.getByRole("heading", { name: "Choose the world" })).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.__flightSimulatorMemory))).toBe(true);

  const samples: Array<RuntimeMemoryDiagnostics & { label: string; lap: number }> = [];
  for (let lap = 1; lap <= 2; lap += 1) {
    for (const destination of DESTINATIONS) {
      const sample = await page.evaluate(
        async (spawn) => window.__flightSimulatorMemory?.transitionTo(spawn) ?? null,
        destination.spawn,
      );
      expect(sample, `${destination.label} lap ${lap} should produce diagnostics`).not.toBeNull();
      samples.push({ ...sample!, label: destination.label, lap });
    }
  }

  for (let index = 0; index < 10; index += 1) {
    await page.evaluate(() => window.__flightSimulatorMemory?.respawn());
  }
  const finalSample = await page.evaluate(() => window.__flightSimulatorMemory?.snapshot() ?? null);
  expect(finalSample?.transitions).toBe(DESTINATIONS.length * 2);
  expect(finalSample?.respawns).toBe(10);

  await testInfo.attach("memory-soak-samples", {
    body: JSON.stringify({ samples, finalSample }, null, 2),
    contentType: "application/json",
  });

  const mode = process.env.MEMORY_SOAK_MODE ?? "optimized";
  const outputPath = resolve(
    process.env.MEMORY_SOAK_OUTPUT ?? `output/playwright/memory-${mode}/memory-soak.json`,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify({ mode, samples, finalSample }, null, 2), "utf8");
  console.table(samples.map((sample) => ({
    lap: sample.lap,
    location: sample.label,
    quality: sample.quality,
    fps: Math.round(sample.fps),
    tileMb: sample.world.tileMemoryBytes === null ? null : Math.round(sample.world.tileMemoryBytes / 1_024 / 1_024),
    heapMb: sample.javascriptHeap === null ? null : Math.round(sample.javascriptHeap.usedBytes / 1_024 / 1_024),
    terrainSamples: sample.terrain.cachedSamples,
  })));
  if (mode === "baseline") return;

  expect(finalSample?.resourceReleases).toBeGreaterThanOrEqual(10);

  const tileSamples = samples.filter((sample) => sample.world.tileMemoryBytes !== null);
  expect(tileSamples.length).toBeGreaterThan(0);
  for (const sample of tileSamples) {
    const allowed = (sample.world.tileCacheBytes ?? 0) + (sample.world.tileCacheOverflowBytes ?? 0);
    expect(sample.world.tileMemoryBytes!, `${sample.label} lap ${sample.lap} tile memory`).toBeLessThanOrEqual(allowed);
  }

  const firstLapHeapPeak = Math.max(...samples.filter((sample) => sample.lap === 1).map((sample) => sample.javascriptHeap?.usedBytes ?? 0));
  const secondLapHeapPeak = Math.max(...samples.filter((sample) => sample.lap === 2).map((sample) => sample.javascriptHeap?.usedBytes ?? 0));
  expect(secondLapHeapPeak).toBeLessThanOrEqual(firstLapHeapPeak + 128 * 1_024 * 1_024);
});
