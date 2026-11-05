import {
  readdir,
  stat,
  mkdir,
  copyFile,
  rm
} from "node:fs/promises";

import path from "node:path";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, ".worker-assets");
const MAX_SIZE = 25 * 1024 * 1024;

// Folder names are matched case-insensitively at any depth.
const SKIPPED_FOLDERS = new Set([
  // Existing exclusions
  "offlineparadise",
  "burrito-bison-revenge",
  "generic-fishing-game",
  "kitchen-gun-game",
  "wolf3d",

  // Additional exclusions
  "worm-eat",
  "vex3",
  "tatical-weapon-pack",
  "tactical-weapon-pack-2",
  "super-mario-construct",
  "supermarioconstruct"
]);

const skippedFiles = [];
const skippedFolders = [];
let copiedFiles = 0;
let copiedBytes = 0;

function isZipFile(filename) {
  return path.extname(filename).toLowerCase() === ".zip";
}

async function walk(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const source = path.join(directory, entry.name);
    const relative = path.relative(ROOT, source);
    const normalized = relative.split(path.sep).join("/");
    const lowerName = entry.name.toLowerCase();

    // Never copy generated output, Git internals, or dependencies.
    if (
      normalized === ".git" ||
      normalized.startsWith(".git/") ||
      normalized === ".worker-assets" ||
      normalized.startsWith(".worker-assets/") ||
      normalized === ".wrangler" ||
      normalized.startsWith(".wrangler/") ||
      normalized === "node_modules" ||
      normalized.startsWith("node_modules/") ||
      normalized === "prepare-assets.mjs" ||
      normalized === "wrangler.jsonc"
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      if (SKIPPED_FOLDERS.has(lowerName)) {
        skippedFolders.push(normalized);
        console.log(`[SKIP FOLDER] ${normalized}`);
        continue;
      }

      await walk(source);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    // Skip every ZIP archive, regardless of capitalization.
    if (isZipFile(entry.name)) {
      skippedFiles.push({
        path: normalized,
        reason: "ZIP archive"
      });

      console.log(`[SKIP ZIP] ${normalized}`);
      continue;
    }

    const info = await stat(source);

    // Skip individual files larger than 25 MiB.
    if (info.size > MAX_SIZE) {
      skippedFiles.push({
        path: normalized,
        size: info.size,
        reason: "Over 25 MiB"
      });

      console.log(
        `[SKIP FILE] ${(info.size / 1024 / 1024).toFixed(2)} MiB  ${normalized}`
      );

      continue;
    }

    const destination = path.join(OUTPUT, relative);

    await mkdir(path.dirname(destination), {
      recursive: true
    });

    await copyFile(source, destination);

    copiedFiles++;
    copiedBytes += info.size;
  }
}

console.log("Preparing Cloudflare Worker assets...");
console.log("Maximum individual file size: 25 MiB");
console.log("ZIP archives: skipped");
console.log("Excluded folders:");

for (const folder of SKIPPED_FOLDERS) {
  console.log(`  - ${folder}`);
}

// Rebuild the output directory from scratch.
await rm(OUTPUT, {
  recursive: true,
  force: true
});

await mkdir(OUTPUT, {
  recursive: true
});

await walk(ROOT);

console.log("\n========== ASSET REPORT ==========");
console.log(`Files copied: ${copiedFiles}`);
console.log(
  `Total copied size: ${(copiedBytes / 1024 / 1024).toFixed(2)} MiB`
);
console.log(`Folders skipped: ${skippedFolders.length}`);
console.log(`Files skipped: ${skippedFiles.length}`);

if (skippedFolders.length > 0) {
  console.log("\n========== SKIPPED FOLDERS ==========");

  for (const folder of skippedFolders) {
    console.log(folder);
  }
}

if (skippedFiles.length > 0) {
  console.log("\n========== SKIPPED FILES ==========");

  for (const file of skippedFiles) {
    if (file.size !== undefined) {
      console.log(
        `${(file.size / 1024 / 1024).toFixed(2)} MiB  ${file.path} (${file.reason})`
      );
    } else {
      console.log(`${file.path} (${file.reason})`);
    }
  }
}

console.log("\nAsset preparation complete.");
