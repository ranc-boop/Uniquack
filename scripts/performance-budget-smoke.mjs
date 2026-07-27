import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const sourceRoots = ["src/app", "src/components", "src/lib", "scripts"];
const ignoredSegments = new Set([".git", ".next", "node_modules", "deliverables", ".codex_tmp"]);
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);

const removedHeavyDependencies = [
  "@tiptap/react",
  "@tiptap/starter-kit",
  "@tiptap/extension-mathematics",
  "react-hook-form",
  "@hookform/resolvers",
  "@tanstack/react-table",
  "cmdk",
  "@radix-ui/react-slider",
  "@radix-ui/react-tooltip",
];

const riskyClientFiles = [
  {
    file: "src/components/practice/practice-agent-client.tsx",
    maxBytes: 96 * 1024,
    note: "Practice agent may trade modest source size for faster progressive hydration, but should stay below the old ~99.9 KB pre-split client.",
  },
  {
    file: "src/components/ai-pdf-import-panel.tsx",
    maxBytes: 90 * 1024,
    note: "AI PDF import panel should remain a bounded admin island.",
  },
  {
    file: "src/components/blueprints/blueprint-workspace.tsx",
    maxBytes: 150 * 1024,
    note: "Blueprint workspace is still large, but should not grow into a monolithic route.",
  },
];

const routeGzipBudgets = {
  "/practice": 16 * 1024,
  "/admin/imports/pdf": 16 * 1024,
  "/admin/imports": 30 * 1024,
  "/admin/imports/assets": 18 * 1024,
  "/admin/imports/package": 18 * 1024,
  "/admin/review": 24 * 1024,
  "/admin/questions": 10 * 1024,
  "/admin/blueprints": 40 * 1024,
  "/admin/blueprints/review": 40 * 1024,
  "/admin/blueprints/library": 40 * 1024,
  "/admin/blueprints/history": 40 * 1024,
  "/admin/blueprints/sources": 40 * 1024,
  "/questions": 30 * 1024,
  "/videos": 20 * 1024,
};

const largeQueryPatterns = [
  {
    label: "limit(1000/2000)",
    regex: /(?:^|[.\s])limit\s*\(\s*(?:1000|2000)\s*\)/,
  },
  {
    label: "range(0, 999/1999)",
    regex: /(?:^|[.\s])range\s*\(\s*0\s*,\s*(?:999|1999)\s*\)/,
  },
  {
    label: 'select("*")',
    regex: /(?:^|[.\s])select\s*\(\s*["'`]\*["'`]\s*\)/,
  },
];

const failures = [];
const warnings = [];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return "-";
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

function normalizePath(filePath) {
  return relative(root, filePath).split(sep).join("/");
}

function extensionOf(filePath) {
  const match = filePath.match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function walkFiles(startDir) {
  const absoluteStart = resolve(root, startDir);

  if (!existsSync(absoluteStart)) {
    return [];
  }

  const files = [];
  const stack = [absoluteStart];

  while (stack.length) {
    const current = stack.pop();
    const relativePath = normalizePath(current);
    const segments = relativePath.split("/");

    if (segments.some((segment) => ignoredSegments.has(segment))) {
      continue;
    }

    const stats = statSync(current);

    if (stats.isDirectory()) {
      for (const child of readdirSync(current)) {
        stack.push(resolve(current, child));
      }
      continue;
    }

    if (sourceExtensions.has(extensionOf(current))) {
      files.push(current);
    }
  }

  return files;
}

function walkBuiltFiles(startDir, predicate) {
  const absoluteStart = resolve(root, startDir);

  if (!existsSync(absoluteStart)) {
    return [];
  }

  const files = [];
  const stack = [absoluteStart];

  while (stack.length) {
    const current = stack.pop();
    const stats = statSync(current);

    if (stats.isDirectory()) {
      for (const child of readdirSync(current)) {
        stack.push(resolve(current, child));
      }
      continue;
    }

    if (predicate(current)) {
      files.push(current);
    }
  }

  return files;
}

function routeFromAppChunk(filePath) {
  const relativePath = normalizePath(filePath);
  const prefix = ".next/static/chunks/app/";
  const withoutPrefix = relativePath.startsWith(prefix)
    ? relativePath.slice(prefix.length)
    : relativePath;
  const withoutHash = withoutPrefix
    .replace(/\/page-[^/]+\.js$/, "")
    .replace(/\/route-[^/]+\.js$/, "")
    .replace(/\/layout-[^/]+\.js$/, "/layout")
    .replace(/^page-[^/]+\.js$/, "")
    .replace(/\.js$/, "");

  if (!withoutHash) {
    return "/";
  }

  return `/${withoutHash.replace(/\/page$/, "").replace(/\/route$/, "")}`;
}

function collectRouteChunksFromBuild() {
  const files = walkBuiltFiles(
    ".next/static/chunks/app",
    (filePath) => filePath.endsWith(".js") && !filePath.includes(`${sep}api${sep}`),
  );

  return files.map((filePath) => ({
    route: routeFromAppChunk(filePath),
    size: statSync(filePath).size,
    gzipSize: gzipSync(readFileSync(filePath)).length,
    file: normalizePath(filePath),
  }));
}

function stripLineStringLiterals(line) {
  let output = "";
  let quote = null;
  let escaped = false;

  for (const char of line) {
    if (quote) {
      if (escaped) {
        escaped = false;
        output += " ";
        continue;
      }

      if (char === "\\") {
        escaped = true;
        output += " ";
        continue;
      }

      if (char === quote) {
        quote = null;
      }

      output += " ";
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      output += " ";
      continue;
    }

    output += char;
  }

  return output;
}

function hasLargeQueryAllowlist(lines, lineIndex) {
  const start = Math.max(0, lineIndex - 3);
  const window = lines.slice(start, lineIndex + 1).join("\n");

  return window.includes("perf-budget-allow-large-query:");
}

function checkLargeQueries() {
  const files = sourceRoots.flatMap(walkFiles);
  const matches = [];

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);

    lines.forEach((line, index) => {
      const codeLine = stripLineStringLiterals(line);

      for (const pattern of largeQueryPatterns) {
        if (!pattern.regex.test(codeLine)) {
          continue;
        }

        matches.push({
          file: normalizePath(file),
          line: index + 1,
          label: pattern.label,
          allowed: hasLargeQueryAllowlist(lines, index),
        });
      }
    });
  }

  const blocked = matches.filter((match) => !match.allowed);

  if (blocked.length) {
    failures.push(
      [
        "Large query regression guard failed. Add pagination, narrow the query, or add an explicit allowlist comment:",
        "  // perf-budget-allow-large-query: explain why this large query is safe/required",
        ...blocked.map((match) => `  - ${match.file}:${match.line} (${match.label})`),
      ].join("\n"),
    );
  }

  console.log(
    `PASS large query guard scanned ${files.length} files; ${matches.length} large-query pattern(s), ${blocked.length} unallowed.`,
  );
}

function parseJson(relativePath, fallback = null) {
  const filePath = resolve(root, relativePath);

  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function checkRemovedDependencies() {
  const packageJson = parseJson("package.json", {});
  const packageLock = parseJson("package-lock.json", {});
  const rootLockPackage = packageLock.packages?.[""] ?? {};
  const docsPath = resolve(root, "docs/site-performance-audit.md");
  const docs = existsSync(docsPath) ? readFileSync(docsPath, "utf8") : "";
  const manifestSections = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.optionalDependencies,
    packageJson.peerDependencies,
    rootLockPackage.dependencies,
    rootLockPackage.devDependencies,
    rootLockPackage.optionalDependencies,
    rootLockPackage.peerDependencies,
  ];

  const dependencyFailures = [];

  for (const dependency of removedHeavyDependencies) {
    const inManifest = manifestSections.some((section) => Boolean(section?.[dependency]));
    const inLock = Boolean(packageLock.packages?.[`node_modules/${dependency}`]);
    const documented = docs.includes(`perf-budget-allow-dependency: ${dependency}`);

    if ((inManifest || inLock) && !documented) {
      dependencyFailures.push(dependency);
    }
  }

  if (dependencyFailures.length) {
    failures.push(
      [
        "Removed heavy dependency guard failed. These packages returned without a PERF note:",
        ...dependencyFailures.map((dependency) => `  - ${dependency}`),
        "Document an intentional reintroduction in docs/site-performance-audit.md with:",
        "  perf-budget-allow-dependency: <package-name>",
      ].join("\n"),
    );
  }

  console.log(
    `PASS removed dependency guard checked ${removedHeavyDependencies.length} packages; ${dependencyFailures.length} undocumented return(s).`,
  );
}

function checkHeavyClientFiles() {
  for (const budget of riskyClientFiles) {
    const filePath = resolve(root, budget.file);

    if (!existsSync(filePath)) {
      warnings.push(`Skipped missing risky client file: ${budget.file}`);
      continue;
    }

    const size = statSync(filePath).size;

    if (size > budget.maxBytes) {
      failures.push(
        `${budget.file} is ${formatBytes(size)}, above budget ${formatBytes(
          budget.maxBytes,
        )}. ${budget.note}`,
      );
      continue;
    }

    console.log(
      `PASS ${budget.file} is ${formatBytes(size)} / ${formatBytes(budget.maxBytes)}.`,
    );
  }
}

function checkRouteBudgets() {
  const audit = parseJson(".next/site-performance-audit.json");
  const routeChunks = audit?.routeChunks?.length ? audit.routeChunks : collectRouteChunksFromBuild();

  if (!routeChunks.length) {
    warnings.push(
      "Route budget check skipped: missing .next route chunks. Run npm.cmd run build first.",
    );
    return;
  }

  const routeSizes = new Map();

  for (const chunk of routeChunks) {
    const current = routeSizes.get(chunk.route) ?? { size: 0, gzipSize: 0, files: [] };
    current.size += chunk.size ?? 0;
    current.gzipSize += chunk.gzipSize ?? 0;
    current.files.push(chunk.file);
    routeSizes.set(chunk.route, current);
  }

  for (const [route, gzipBudget] of Object.entries(routeGzipBudgets)) {
    const actual = routeSizes.get(route);

    if (!actual) {
      warnings.push(`Route budget missing route chunk for ${route}; this may be a server-only route.`);
      continue;
    }

    if (actual.gzipSize > gzipBudget) {
      failures.push(
        `${route} client route gzip is ${formatBytes(actual.gzipSize)}, above budget ${formatBytes(
          gzipBudget,
        )}. Keep the route shell light or lazy-load heavy panels.`,
      );
      continue;
    }

    console.log(`${route}: ${formatBytes(actual.gzipSize)} gzip / ${formatBytes(gzipBudget)}`);
  }

  console.log("PASS route budget guard checked available perf:audit route chunks.");
}

checkLargeQueries();
checkRemovedDependencies();
checkHeavyClientFiles();
checkRouteBudgets();

if (warnings.length) {
  console.warn("\nPerformance budget warnings:");
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (failures.length) {
  console.error("\nPerformance budget failures:");
  for (const failure of failures) {
    console.error(`\n${failure}`);
  }
  process.exit(1);
}

console.log("\nPASS performance budget smoke");
