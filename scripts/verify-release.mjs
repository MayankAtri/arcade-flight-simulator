import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const mode = process.argv[2] ?? "preflight";
const failures = [];

const requireFile = (relativePath) => {
  if (!existsSync(join(root, relativePath))) failures.push(`Missing required file: ${relativePath}`);
};

const requireText = (relativePath, expected, message) => {
  const path = join(root, relativePath);
  if (!existsSync(path) || !readFileSync(path, "utf8").includes(expected)) failures.push(message);
};

const sourceFiles = [];
const scan = (directory) => {
  for (const entry of readdirSync(directory)) {
    if (["node_modules", "dist", ".git", ".playwright-cli", "test-results", "playwright-report"].includes(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) scan(path);
    else if ([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".html"].includes(extname(path))) sourceFiles.push(path);
  }
};

if (mode === "preflight") {
  for (const file of [
    ".env.example",
    "README.md",
    "public/assets/aircraft/cessna-172sp.glb",
    "public/assets/aircraft/LICENSE.txt",
    "src/world/BasicWorldProvider.ts",
    "src/world/CesiumWorldProvider.ts",
    "src/world/GoogleWorldProvider.ts",
  ]) requireFile(file);

  requireText(
    ".env.example",
    "VITE_ENABLE_PHOTOREALISTIC_EVALUATION=false",
    "Photorealistic evaluation must remain disabled by default.",
  );
  requireText(
    ".env.example",
    "VITE_GOOGLE_MAP_TILES_KEY=\n",
    "The example Google key must remain blank.",
  );

  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (packageJson.private !== true) failures.push("package.json must stay private to prevent accidental publication.");

  scan(root);
  const secretPatterns = [
    { name: "Google API key", pattern: /AIza[0-9A-Za-z_-]{30,}/ },
    { name: "Cesium-style JWT", pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[0-9A-Za-z_-]+\.[0-9A-Za-z_-]+/ },
  ];
  for (const file of sourceFiles) {
    const content = readFileSync(file, "utf8");
    for (const secret of secretPatterns) {
      if (secret.pattern.test(content)) failures.push(`${secret.name} appears to be committed in ${file.slice(root.length + 1)}.`);
    }
  }
} else if (mode === "postbuild") {
  for (const file of [
    "dist/index.html",
    "dist/cesium/Workers",
    "dist/cesium/Assets",
    "dist/assets/aircraft/cessna-172sp.glb",
    "dist/assets/aircraft/LICENSE.txt",
  ]) requireFile(file);
} else {
  failures.push(`Unknown verification mode: ${mode}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Local release ${mode} checks passed.`);
}
