import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const supported = ["edge", "firefox"];
const requested = process.argv[2] ? [process.argv[2]] : supported;

if (requested.some((browser) => !supported.includes(browser))) {
  throw new Error(`未知浏览器：${process.argv[2]}（可选 edge 或 firefox）`);
}

const runtimeEntries = [
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
  const manifest = await readFile(path.join(root, "manifests", `${browser}.json`), "utf8");
  await writeFile(path.join(target, "manifest.json"), manifest);
  const { version } = JSON.parse(manifest);
  const archive = path.join(dist, `quguangou-${browser}-v${version}.zip`);
  await rm(archive, { force: true });
  await execFileAsync("zip", ["-q", "-r", archive, ".", "-x", "*/._*", "._*"], { cwd: target });
  console.log(`${browser}: ${archive}`);
}
