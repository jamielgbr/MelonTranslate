import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readWorkerEntryScripts(path) {
  const source = await readFile(path, "utf8");
  const match = source.match(/importScripts\(([\s\S]*?)\);/);
  assert.ok(match, "src/background/worker-entry.js must call importScripts");
  return Array.from(match[1].matchAll(/'([^']+)'/g), (entry) => entry[1])
    .map((path) => path.replace(/^\.\.\//, "src/").replace(/^\.\//, "src/background/"));
}

function contentScriptGroups(manifest) {
  return (manifest.content_scripts || []).map((entry) => entry.js || []);
}

function flattenScriptGroups(groups) {
  return groups.flatMap((group) => group);
}

const firefoxManifest = await readJson("manifest.json");
const chromiumManifest = await readJson("manifest.chromium.json");
const workerEntryScripts = await readWorkerEntryScripts("src/background/worker-entry.js");

try {
  assert.deepEqual(workerEntryScripts, firefoxManifest.background.scripts);
} catch (error) {
  error.message = "Firefox background.scripts must match Chromium worker-entry importScripts";
  throw error;
}

try {
  assert.deepEqual(contentScriptGroups(chromiumManifest), contentScriptGroups(firefoxManifest));
} catch (error) {
  error.message = "Content script arrays must match across Firefox and Chromium manifests";
  throw error;
}

const manifestScripts = [
  ...workerEntryScripts,
  chromiumManifest.background.service_worker,
  ...flattenScriptGroups(contentScriptGroups(firefoxManifest)),
  ...flattenScriptGroups(contentScriptGroups(chromiumManifest))
].filter(Boolean);
const missingScripts = Array.from(new Set(manifestScripts)).filter((path) => !existsSync(path));

if (missingScripts.length) {
  throw new Error(`Manifest script references point at missing files: ${missingScripts.join(", ")}`);
}

console.log("Manifest wiring is valid.");
