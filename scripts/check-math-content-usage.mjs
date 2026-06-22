import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const scanRoots = ["src/app", "src/components"];
const allowedDangerousHtmlFiles = new Set([
  "src/components/math-content.tsx",
]);
const directContentExpression =
  /\{\s*(?:[A-Za-z_$][\w$]*\.)?(content_html|contentHtml|solution_html|solutionHtml|explanation|hint|feedback|summary|answer|content_excerpt|nextRoundGoal|reason|expectedSkill)\s*\}/;

function listTsxFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...listTsxFiles(path));
    } else if (path.endsWith(".tsx")) {
      files.push(path);
    }
  }

  return files;
}

const violations = [];

for (const scanRoot of scanRoots) {
  for (const file of listTsxFiles(join(root, scanRoot))) {
    const rel = relative(root, file).replaceAll("\\", "/");
    const lines = readFileSync(file, "utf8").split(/\r?\n/);

    lines.forEach((line, index) => {
      if (
        line.includes("dangerouslySetInnerHTML") &&
        !allowedDangerousHtmlFiles.has(rel)
      ) {
        violations.push({
          file: rel,
          line: index + 1,
          message: "Use MathContent instead of direct dangerouslySetInnerHTML.",
        });
      }

      if (
        directContentExpression.test(line) &&
        !line.includes("$" + "{") &&
        !line.includes("key={") &&
        !line.includes("value={") &&
        !line.includes("defaultValue={") &&
        !line.includes("placeholder=")
      ) {
        violations.push({
          file: rel,
          line: index + 1,
          message:
            "User-visible content-like fields must render through MathContent or a scene wrapper.",
        });
      }
    });
  }
}

if (violations.length) {
  console.error("MathContent usage guard failed:");
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line} ${violation.message}`,
    );
  }
  process.exit(1);
}
