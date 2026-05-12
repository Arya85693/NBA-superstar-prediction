import fs from "fs";
import path from "path";

/**
 * Work around a Vercel/Next.js subdirectory deployment issue where post-build
 * validation looks for `.next` in the repo root instead of the configured
 * project root (`web/`). This is a no-op outside Vercel.
 */
if (!process.env.VERCEL) {
  process.exit(0);
}

const appRootDir = path.resolve(".");
const repoRootDir = path.resolve("..");
const entriesToMirror = [
  ".next",
  "node_modules",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "proxy.ts",
  "app",
  "components",
  "hooks",
  "lib",
  "public",
];

if (!fs.existsSync(path.join(appRootDir, ".next"))) {
  console.warn("Vercel workaround skipped: local .next directory was not found.");
  process.exit(0);
}

for (const entry of entriesToMirror) {
  const source = path.join(appRootDir, entry);
  const target = path.join(repoRootDir, entry);

  if (!fs.existsSync(source)) {
    continue;
  }

  try {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }

    try {
      fs.symlinkSync(
        source,
        target,
        fs.lstatSync(source).isDirectory() ? "dir" : "file",
      );
    } catch {
      fs.cpSync(source, target, { recursive: true });
    }
  } catch (error) {
    console.warn(`Vercel workaround could not mirror ${entry} to repo root:`, error);
  }
}
