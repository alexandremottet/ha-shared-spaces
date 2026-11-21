#!/usr/bin/env node
// Runs after `changeset version`: copies each integration shim package.json's version into its manifest.json.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const integrationsDir = join(rootDir, "integrations");

for (const name of readdirSync(integrationsDir)) {
  const pkgDir = join(integrationsDir, name);
  const packageJsonPath = join(pkgDir, "package.json");
  const manifestPath = join(pkgDir, "custom_components", name, "manifest.json");
  if (!existsSync(packageJsonPath) || !existsSync(manifestPath)) continue;

  const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version === version) continue;

  manifest.version = version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Synced ${name}: manifest.json -> ${version}`);
}
