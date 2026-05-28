import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const files = collect("src");
let ok = true;

for (const file of files) {
  const result = spawnSync("node", ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    ok = false;
    console.error(result.stderr || result.stdout);
  }
}

if (!ok) process.exit(1);
console.log(`syntax ok (${files.length} files)`);

function collect(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? collect(path) : path.endsWith(".js") ? [path] : [];
  });
}
