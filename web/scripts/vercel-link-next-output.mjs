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

const appNextDir = path.resolve(".next");
const repoNextDir = path.resolve("..", ".next");

if (!fs.existsSync(appNextDir)) {
  console.warn("Vercel workaround skipped: local .next directory was not found.");
  process.exit(0);
}

try {
  if (fs.existsSync(repoNextDir)) {
    fs.rmSync(repoNextDir, { recursive: true, force: true });
  }

  try {
    fs.symlinkSync(appNextDir, repoNextDir, "dir");
  } catch {
    fs.cpSync(appNextDir, repoNextDir, { recursive: true });
  }
} catch (error) {
  console.warn("Vercel workaround could not mirror .next to repo root:", error);
}
