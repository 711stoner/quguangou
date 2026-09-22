import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const supported = ["chrome", "edge", "firefox"];
const requested = process.argv[2] ? [process.argv[2]] : supported;

if (requested.some((browser) => !supported.includes(browser))) {
  throw new Error(`未知浏览器：${process.argv[2]}（可选 chrome、edge 或 firefox）`);
}

const runtimeEntries = [
  "_locales",
  "assets",
  "data",
  "lib",
  "background.js",
  "popup.css",
  "popup.html",
  "popup.js",
  "privacy.css",
  "privacy.html"
];

await mkdir(dist, { recursive: true });

for (const browser of requested) {
  const target = path.join(dist, browser);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const entry of runtimeEntries) {
    await cp(path.join(root, entry), path.join(target, entry), { recursive: true });
  }
  const manifestPath = browser === "chrome"
    ? path.join(root, "manifest.json")
    : path.join(root, "manifests", `${browser}.json`);
  const manifest = await readFile(manifestPath, "utf8");
  await writeFile(path.join(target, "manifest.json"), manifest);
  const { version } = JSON.parse(manifest);
  const archive = path.join(dist, `quguangou-${browser}-v${version}.zip`);
  const { stdout: oldArchives } = await execFileAsync(
    "find",
    [dist, "-maxdepth", "1", "-type", "f", "-name", `quguangou-${browser}-v*.zip`, "-print"]
  );
  for (const oldArchive of oldArchives.split("\n").filter(Boolean)) {
    await rm(oldArchive, { force: true });
  }
  await execFileAsync("zip", [
    "-q", "-r", archive, ".",
    "-x", "*/._*", "._*", ".DS_Store", "*/.DS_Store", "__MACOSX/*"
  ], { cwd: target });
  console.log(`${browser}: ${archive}`);
}
