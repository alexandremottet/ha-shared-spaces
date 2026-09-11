#!/usr/bin/env node
// Runs after `changeset version`: copies each Python shim package.json's version into its pyproject.toml.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = join(rootDir, "packages");

const VERSION_LINE = /^version\s*=\s*"[^"]*"/m;

for (const name of readdirSync(packagesDir)) {
  const pkgDir = join(packagesDir, name);
  const packageJsonPath = join(pkgDir, "package.json");
  const pyprojectPath = join(pkgDir, "pyproject.toml");
  if (!existsSync(packageJsonPath) || !existsSync(pyprojectPath)) continue;

  const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const pyproject = readFileSync(pyprojectPath, "utf8");
  if (!VERSION_LINE.test(pyproject)) {
    console.warn(`Skipping ${pyprojectPath}: no version field found`);
    continue;
  }

  const updated = pyproject.replace(VERSION_LINE, `version = "${version}"`);
  if (updated !== pyproject) {
    writeFileSync(pyprojectPath, updated);
    console.log(`Synced ${name}: pyproject.toml -> ${version}`);
  }
}
