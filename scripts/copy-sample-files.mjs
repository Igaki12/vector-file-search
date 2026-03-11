import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "sample-files");
const targetDir = path.join(root, "docs", "sample-files");

async function main() {
  try {
    await readdir(sourceDir);
  } catch {
    return;
  }

  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
