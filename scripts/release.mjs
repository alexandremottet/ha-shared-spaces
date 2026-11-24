#!/usr/bin/env node
// Usage: node scripts/release.mjs <tag> [outDir]
//   v<version>            global release: every component zip, notes listing each component
//   <component>-v<version> one component's zip and its CHANGELOG section
// Writes <outDir>/*.zip, <outDir>/notes.md and prints the JSON plan used by the workflow.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

const COMPONENTS = [
  { name: "share_space", dir: "integrations/share_space", content: "custom_components/share_space" },
  { name: "share_space_space", dir: "integrations/share_space_space", content: "custom_components/share_space_space" },
  { name: "share_space_heating", dir: "integrations/share_space_heating", content: "custom_components/share_space_heating" },
  { name: "share_space_themes", dir: "themes/share_space_themes", content: "themes" },
];

const readJson = (path) => JSON.parse(readFileSync(join(rootDir, path), "utf8"));

function componentVersion(component) {
  const { version } = readJson(join(component.dir, "package.json"));
  const manifest = join(component.content, "manifest.json");
  if (existsSync(join(rootDir, component.dir, manifest))) {
    const manifestVersion = readJson(join(component.dir, manifest)).version;
    if (manifestVersion !== version) {
      throw new Error(`${component.name}: package.json ${version} != manifest.json ${manifestVersion}`);
    }
  }
  return version;
}

function changelogSection(component, version) {
  const path = join(rootDir, component.dir, "CHANGELOG.md");
  if (!existsSync(path)) return "";
  const lines = readFileSync(path, "utf8").split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) return "";
  let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join("\n").trim();
}

function zip(component, outDir) {
  const file = join(outDir, `${component.name}.zip`);
  execFileSync("zip", ["-qr", file, ".", "-x", "*__pycache__*", "*.pyc"], {
    cwd: join(rootDir, component.dir, component.content),
    stdio: "inherit",
  });
  return file;
}

const [tag, outArg = "dist/release"] = process.argv.slice(2);
if (!tag) throw new Error("usage: release.mjs <tag> [outDir]");
const outDir = join(rootDir, outArg);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const globalMatch = /^v(\d+\.\d+\.\d+.*)$/.exec(tag);
const componentMatch = /^(.+)-v(\d+\.\d+\.\d+.*)$/.exec(tag);
const plan = { tag, title: "", notes: join(outDir, "notes.md"), assets: [], components: [] };

if (globalMatch) {
  const version = globalMatch[1];
  const rootVersion = readJson("package.json").version;
  if (rootVersion !== version) throw new Error(`tag ${tag} != package.json version ${rootVersion}`);
  plan.title = `Share Space ${version}`;
  const notes = [`Share Space ${version} bundles:`, ""];
  const sections = [];
  for (const component of COMPONENTS) {
    const componentVersionValue = componentVersion(component);
    const componentTag = `${component.name}-v${componentVersionValue}`;
    const asset = zip(component, outDir);
    const componentNotes = join(outDir, `${component.name}.md`);
    const section = changelogSection(component, componentVersionValue);
    writeFileSync(componentNotes, (section || "No changes recorded.") + "\n");
    plan.assets.push(asset);
    plan.components.push({ tag: componentTag, title: `${component.name} ${componentVersionValue}`, asset, notes: componentNotes });
    notes.push(`- \`${component.name}\` ${componentVersionValue} (${componentTag})`);
    if (section) sections.push(`## ${component.name} ${componentVersionValue}\n\n${section}`);
  }
  writeFileSync(plan.notes, [...notes, "", ...sections].join("\n") + "\n");
} else if (componentMatch) {
  const [, name, version] = componentMatch;
  const component = COMPONENTS.find((candidate) => candidate.name === name);
  if (!component) throw new Error(`unknown component ${name}`);
  const actual = componentVersion(component);
  if (actual !== version) throw new Error(`tag ${tag} != ${name} version ${actual}`);
  plan.title = `${name} ${version}`;
  plan.assets.push(zip(component, outDir));
  writeFileSync(plan.notes, (changelogSection(component, version) || "No changes recorded.") + "\n");
} else {
  throw new Error(`tag ${tag} is neither v<version> nor <component>-v<version>`);
}

console.log(JSON.stringify(plan));
