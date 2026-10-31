```js
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

const SKIPPED_FOLDERS = new Set([
  "offlineparadise",
  "burrito-bison-revenge",
  "generic-fishing-game",
  "kitchen-gun-game",
  "wolf3d"
]);

const skippedFiles = [];
const skippedFolders = [];
let copiedFiles = 0;
let copiedBytes = 0;

async function walk(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const source = path.join(directory, entry.name);
    const relative = path.relative(ROOT, source);
    const normalized = relative.split(path.sep).join("/");

    // Skip generated files, Git internals, and dependency folders.
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

    // Skip the five requested game folders wherever they appear.
    if (entry.isDirectory()) {
      if (SKIPPED_FOLDERS.has(entry.name.toLowerCase())) {
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

    const info = await stat(source);

    // Skip individual files larger than Cloudflare's 25 MiB limit.
    if (info.size > MAX_SIZE) {
      skippedFiles.push({
        path: normalized,
        size: info.size
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
console.log(`Maximum individual file size: 25 MiB`);
console.log("Skipping these game folders:");
for (const folder of SKIPPED_FOLDERS) {
  console.log(`  - ${folder}`);
}

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
console.log(`Oversized files skipped: ${skippedFiles.length}`);

if (skippedFolders.length > 0) {
  console.log("\n========== SKIPPED FOLDERS ==========");

  for (const folder of skippedFolders) {
    console.log(folder);
  }
}

if (skippedFiles.length > 0) {
  console.log("\n========== FILES OVER 25 MiB ==========");

  for (const file of skippedFiles) {
    console.log(
      `${(file.size / 1024 / 1024).toFixed(2)} MiB  ${file.path}`
    );
  }
}

console.log("\nAsset preparation complete.");
```
