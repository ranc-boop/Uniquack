import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packageImport = await readFile(
  resolve(root, "src/lib/package-import/package.ts"),
  "utf8",
);

assert(packageImport.includes("tag_ids"), "package import does not read tag_ids");
assert(packageImport.includes("tagIds"), "package import references were not renamed to tagIds");
assert(!packageImport.includes(`tag_${"slugs"}`), "package import still reads legacy tag identifier arrays");
assert(!packageImport.includes(`tag_${"names"}`), "package import still reads legacy tag name arrays");
console.log("PASS package import uses exact tag_ids only");
