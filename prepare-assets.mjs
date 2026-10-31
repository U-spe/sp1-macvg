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

const skipped = [];
let copied = 0;

async function walk(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const source = path.join(directory, entry.name);
    const relative = path.relative(ROOT, source);

    if (
      relative === ".git" ||
      relative.startsWith(`.git${path.sep}`) ||
      relative === ".worker-assets" ||
      relative.startsWith(`.worker-assets${path.sep}`) ||
      relative === ".wrangler" ||
      relative.startsWith(`.wrangler${path.sep}`) ||
      relative === "node_modules" ||
      relative.startsWith(`node_modules${path.sep}`)
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      await walk(source);
      continue;
    }

    if (!entry.isFile()) continue;

    if (
      relative === "prepare-assets.mjs" ||
      relative === "wrangler.jsonc"
    ) {
      continue;
    }

    const info = await stat(source);

    if (info.size > MAX_SIZE) {
      skipped.push({
        path: relative,
        size: info.size
      });

      continue;
    }

    const destination = path.join(OUTPUT, relative);

    await mkdir(path.dirname(destination), {
      recursive: true
    });

    await copyFile(source, destination);
    copied++;
  }
}

await rm(OUTPUT, {
  recursive: true,
  force: true
});

await mkdir(OUTPUT, {
  recursive: true
});

await walk(ROOT);

console.log(`\nAssets prepared: ${copied} files copied.`);
console.log(`Oversized files skipped: ${skipped.length}.`);

if (skipped.length) {
  console.log("\n=== FILES SKIPPED: OVER 25 MiB ===");

  for (const file of skipped) {
    console.log(
      `${(file.size / 1024 / 1024).toFixed(2)} MiB  ${file.path}`
    );
  }
}

console.log("\nAsset preparation complete.");
