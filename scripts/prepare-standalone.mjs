// Next.js `output: "standalone"` does not copy `.next/static` or `public` into
// `.next/standalone`. Without them `node .next/standalone/server.js` serves the
// HTML but every stylesheet and client chunk 404s. The Dockerfile copies these
// directories explicitly; this script does the same for local runs.
import { cp, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!existsSync(standalone)) {
  console.error("No .next/standalone directory. Run `pnpm build` first.");
  process.exit(1);
}

const copies = [
  [join(root, ".next", "static"), join(standalone, ".next", "static")],
  [join(root, "public"), join(standalone, "public")],
];

for (const [from, to] of copies) {
  if (!(await exists(from))) continue;
  await mkdir(join(to, ".."), { recursive: true });
  await cp(from, to, { recursive: true, force: true });
  console.log(`copied ${from} -> ${to}`);
}

console.log("Standalone server is ready: node .next/standalone/server.js");
