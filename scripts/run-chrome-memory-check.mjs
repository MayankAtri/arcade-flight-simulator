import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const CHROME_PATH = process.env.CHROME_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = process.env.MEMORY_CHECK_URL ?? "http://127.0.0.1:4173";
const DURATION_MINUTES = Number(process.env.MEMORY_CHECK_MINUTES ?? "15");
const SAMPLE_INTERVAL_MS = Number(process.env.MEMORY_CHECK_INTERVAL_MS ?? "30000");
const CDP_PORT = Number(process.env.MEMORY_CHECK_CDP_PORT ?? "9333");
const OUTPUT_PATH = resolve(
  process.env.MEMORY_CHECK_OUTPUT
    ?? "output/playwright/chrome-memory-15m/acceptance.json",
);

if (!Number.isFinite(DURATION_MINUTES) || DURATION_MINUTES <= 0) {
  throw new Error("MEMORY_CHECK_MINUTES must be a positive number.");
}
if (!Number.isFinite(SAMPLE_INTERVAL_MS) || SAMPLE_INTERVAL_MS < 1000) {
  throw new Error("MEMORY_CHECK_INTERVAL_MS must be at least 1000.");
}

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

const waitForUrl = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : "not ready"}`);
};

const readProcessTreeMemory = (rootPid) => {
  const output = execFileSync("ps", ["-axo", "pid=,ppid=,rss=,command="], { encoding: "utf8" });
  const processes = output
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      rssKilobytes: Number(match[3]),
      command: match[4],
    }));
  const included = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of processes) {
      if (included.has(process.parentPid) && !included.has(process.pid)) {
        included.add(process.pid);
        changed = true;
      }
    }
  }
  const tree = processes.filter((process) => included.has(process.pid));
  const rssBytes = tree.reduce((total, process) => total + process.rssKilobytes * 1024, 0);
  const byType = Object.fromEntries(
    ["browser", "gpu", "renderer", "utility"].map((type) => {
      const bytes = tree
        .filter((process) => {
          if (type === "browser") return process.pid === rootPid;
          return process.command.includes(`--type=${type === "gpu" ? "gpu-process" : type}`);
        })
        .reduce((total, process) => total + process.rssKilobytes * 1024, 0);
      return [type, bytes];
    }),
  );
  return { rssBytes, processCount: tree.length, byType };
};

const bytesToMegabytes = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10;

const numericHudValue = (value) => {
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const terminateProcess = async (childProcess) => {
  if (!childProcess || childProcess.exitCode !== null) return;
  childProcess.kill("SIGTERM");
  await Promise.race([once(childProcess, "exit"), sleep(5_000)]);
  if (childProcess.exitCode === null) {
    childProcess.kill("SIGKILL");
    await Promise.race([once(childProcess, "exit"), sleep(2_000)]);
  }
};

let previewProcess;
let chromeProcess;
let browser;
let profileDirectory;
const consoleErrors = [];
const pageErrors = [];
const samples = [];

try {
  previewProcess = spawn(
    "npm",
    ["run", "preview", "--", "--host", "127.0.0.1", "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  let previewError = "";
  previewProcess.stderr.on("data", (chunk) => { previewError += chunk.toString(); });
  await waitForUrl(BASE_URL, 120_000).catch((error) => {
    throw new Error(`${error.message}\n${previewError}`);
  });

  profileDirectory = await mkdtemp(join(tmpdir(), "arcade-flight-chrome-memory-"));
  chromeProcess = spawn(CHROME_PATH, [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profileDirectory}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-mode",
    "--disable-component-update",
    "--window-size=1440,900",
    "about:blank",
  ], { stdio: "ignore" });

  await waitForUrl(`http://127.0.0.1:${CDP_PORT}/json/version`, 60_000);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const flightUrl = new URL(BASE_URL);
  flightUrl.searchParams.set("lat", "40.6413");
  flightUrl.searchParams.set("lon", "-73.7781");
  flightUrl.searchParams.set("heading", "31");
  flightUrl.searchParams.set("altitude", "305");
  flightUrl.searchParams.set("mode", "air");
  flightUrl.searchParams.set("debugMemory", "1");
  await page.goto(flightUrl.toString(), { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByLabel("Development flight telemetry").waitFor({ timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.__flightSimulatorMemory), null, { timeout: 60_000 });
  await page.keyboard.down("Shift");
  await sleep(900);
  await page.keyboard.up("Shift");

  const readHud = () => page.evaluate(() => {
    const metrics = [...document.querySelectorAll(".hud-metric")];
    const value = (label) => metrics.find((metric) => metric.querySelector("span")?.textContent === label)
      ?.querySelector("strong")?.textContent?.trim() ?? null;
    return {
      state: value("State"),
      speedKnots: value("Speed"),
      altitudeMslFeet: value("Altitude"),
      altitudeAglFeet: value("AGL"),
      verticalSpeedFeetPerMinute: value("V/S"),
      throttlePercent: value("Throttle"),
      renderFps: value("Render"),
    };
  });

  const controlAltitude = async () => {
    const hud = await readHud();
    if (hud.state !== "AIRBORNE") return hud;
    const agl = numericHudValue(hud.altitudeAglFeet);
    const verticalSpeed = numericHudValue(hud.verticalSpeedFeetPerMinute);
    let key = null;
    let durationMs = 0;
    if ((agl !== null && agl < 700) || (verticalSpeed !== null && verticalSpeed < -900)) {
      key = "s";
      durationMs = 600;
    } else if ((agl !== null && agl < 900) || (verticalSpeed !== null && verticalSpeed < -250)) {
      key = "s";
      durationMs = 240;
    } else if ((agl !== null && agl > 1_300) || (verticalSpeed !== null && verticalSpeed > 900)) {
      key = "w";
      durationMs = 450;
    } else if ((agl !== null && agl > 1_100) || (verticalSpeed !== null && verticalSpeed > 250)) {
      key = "w";
      durationMs = 200;
    }
    if (key) {
      await page.keyboard.down(key);
      await sleep(durationMs);
      await page.keyboard.up(key);
    }
    return hud;
  };

  const startedAt = Date.now();
  const deadline = startedAt + DURATION_MINUTES * 60_000;
  while (Date.now() < deadline) {
    const [runtime, hud] = await Promise.all([
      page.evaluate(() => window.__flightSimulatorMemory?.snapshot() ?? null),
      readHud(),
    ]);
    const processMemory = readProcessTreeMemory(chromeProcess.pid);
    const sample = {
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
      runtime,
      hud,
      processMemory,
    };
    samples.push(sample);
    console.log(JSON.stringify({
      minute: Math.round((sample.elapsedSeconds / 60) * 10) / 10,
      state: hud.state,
      fps: runtime?.fps === undefined ? null : Math.round(runtime.fps),
      quality: runtime?.quality ?? null,
      jsHeapMb: runtime?.javascriptHeap ? bytesToMegabytes(runtime.javascriptHeap.usedBytes) : null,
      tileMb: runtime?.world.tileMemoryBytes === null || runtime?.world.tileMemoryBytes === undefined
        ? null
        : bytesToMegabytes(runtime.world.tileMemoryBytes),
      chromeTreeRssMb: bytesToMegabytes(processMemory.rssBytes),
    }));
    const nextSampleAt = Math.min(Date.now() + SAMPLE_INTERVAL_MS, deadline);
    while (Date.now() < nextSampleAt) {
      await sleep(Math.min(2_000, nextSampleAt - Date.now()));
      if (Date.now() < nextSampleAt) await controlAltitude();
    }
  }

  const validProcessSamples = samples.map((sample) => sample.processMemory.rssBytes);
  const settledSamples = samples.filter((sample) => sample.elapsedSeconds >= 30);
  const settledFpsValues = settledSamples.map((sample) => sample.runtime?.fps ?? Number.POSITIVE_INFINITY);
  const summary = {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    requestedDurationMinutes: DURATION_MINUTES,
    actualDurationMinutes: Math.round(((Date.now() - startedAt) / 60_000) * 100) / 100,
    browser: await browser.version(),
    url: flightUrl.toString(),
    sampleCount: samples.length,
    stateValues: [...new Set(samples.map((sample) => sample.hud.state))],
    fps: {
      minimum: Math.min(...samples.map((sample) => sample.runtime?.fps ?? Number.POSITIVE_INFINITY)),
      maximum: Math.max(...samples.map((sample) => sample.runtime?.fps ?? 0)),
      final: samples.at(-1)?.runtime?.fps ?? null,
      settledMinimum: Math.min(...settledFpsValues),
      settledMaximum: Math.max(...settledSamples.map((sample) => sample.runtime?.fps ?? 0)),
    },
    chromeProcessTreeRssMb: {
      initial: bytesToMegabytes(validProcessSamples[0] ?? 0),
      peak: bytesToMegabytes(Math.max(...validProcessSamples)),
      final: bytesToMegabytes(validProcessSamples.at(-1) ?? 0),
    },
    javascriptHeapMb: {
      initial: samples[0]?.runtime?.javascriptHeap
        ? bytesToMegabytes(samples[0].runtime.javascriptHeap.usedBytes)
        : null,
      peak: bytesToMegabytes(Math.max(...samples.map((sample) => sample.runtime?.javascriptHeap?.usedBytes ?? 0))),
      final: samples.at(-1)?.runtime?.javascriptHeap
        ? bytesToMegabytes(samples.at(-1).runtime.javascriptHeap.usedBytes)
        : null,
    },
    tileMemoryMb: {
      peak: bytesToMegabytes(Math.max(...samples.map((sample) => sample.runtime?.world.tileMemoryBytes ?? 0))),
      final: samples.at(-1)?.runtime?.world.tileMemoryBytes === null
        ? null
        : bytesToMegabytes(samples.at(-1)?.runtime?.world.tileMemoryBytes ?? 0),
    },
    consoleErrors,
    pageErrors,
    criteria: {
      airborneForEverySample: samples.every((sample) => sample.hud.state === "AIRBORNE"),
      settledAtOrAbove30Fps: settledFpsValues.every((fps) => fps >= 30),
      noConsoleOrPageErrors: consoleErrors.length === 0 && pageErrors.length === 0,
    },
    interpretation: "Chrome process-tree RSS is a repeatable OS-level approximation. It is not identical to Chrome Task Manager's tab-memory accounting and may double-count shared pages.",
  };

  await mkdir(resolve(OUTPUT_PATH, ".."), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify({ summary, samples }, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));

  if (!Object.values(summary.criteria).every(Boolean)) process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await terminateProcess(chromeProcess);
  await terminateProcess(previewProcess);
  if (profileDirectory) {
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
