"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");

// Only these browser assets are published. Never copy the repository root.
const publicFiles = Object.freeze([
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/diagnostic.js",
  "data/questions.json",
  "data/sources.json",
]);
const maxAssetBytes = 25 * 1024 * 1024;

async function build(projectRoot = path.resolve(__dirname, "..")) {
  const root = await fs.realpath(projectRoot);
  const directory = path.resolve(root, "dist");
  if (path.dirname(directory) !== root || path.basename(directory) !== "dist") {
    throw new Error("Build output must be the project's dist directory.");
  }
  const existing = await fs.lstat(directory).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing && (!existing.isDirectory() || existing.isSymbolicLink())) {
    throw new Error("Refusing to replace dist: it must be a regular directory, not a link or file.");
  }
  if (existing && await fs.realpath(directory) !== directory) {
    throw new Error("Build output resolves outside the expected dist directory.");
  }

  // Validate all inputs before replacing a previous build.
  const assets = await Promise.all(publicFiles.map(async (file) => {
    const source = path.join(root, file);
    const info = await fs.lstat(source);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Not a regular asset file: " + file);
    if (info.size > maxAssetBytes) throw new Error("Asset exceeds the 25 MiB limit: " + file);
    const contents = await fs.readFile(source);
    if (contents.length > maxAssetBytes) throw new Error("Asset exceeds the 25 MiB limit: " + file);
    return { file, contents };
  }));

  // The resolved absolute target was checked above and is always root/dist.
  await fs.rm(directory, { recursive: true, force: true });
  await fs.mkdir(directory, { recursive: true });
  for (const { file, contents } of assets) {
    const target = path.join(directory, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }
  return { directory, files: [...publicFiles], bytes: assets.reduce((sum, asset) => sum + asset.contents.length, 0) };
}

module.exports = { build, publicFiles };
if (require.main === module) {
  build().then(({ files, bytes }) => {
    console.log("Built " + files.length + " public files in dist/ (" + bytes + " bytes).");
  }).catch((error) => {
    console.error("Build failed: " + error.message);
    process.exitCode = 1;
  });
}
