import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const files = ["index.html", "blueprint.html", "build-step.html", "mapart-shared.js", "worker.js"];
for (const file of files) {
  const source = await readFile(new URL("../" + file, import.meta.url), "utf8");
  const scripts = file.endsWith(".html")
    ? [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(code => code.trim())
    : [source];
  for (let i = 0; i < scripts.length; i++) {
    const result = spawnSync(process.execPath, ["--check", "--input-type=module", "-"], {
      input: scripts[i], encoding: "utf8"
    });
    assert.equal(result.status, 0, \`\${file} script \${i + 1} syntax error:\n\${result.stderr}\`);
  }
}
console.log("All inline JavaScript and shared scripts pass Node syntax checks.");
