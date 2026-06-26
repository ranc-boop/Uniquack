import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const nextDir = resolve(root, ".next");
const outputPath = resolve(nextDir, "site-performance-audit.json");

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

function readJson(relativePath, fallback = null) {
  const filePath = resolve(root, relativePath);

  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function walkFiles(startDir, predicate = () => true) {
  if (!existsSync(startDir)) {
    return [];
  }

  const entries = [];
  const stack = [startDir];

  while (stack.length) {
    const current = stack.pop();
    const stats = statSync(current);

    if (stats.isDirectory()) {
      for (const child of readdirSync(current)) {
        stack.push(resolve(current, child));
      }
      continue;
    }

    if (predicate(current, stats)) {
      entries.push({ path: current, size: stats.size });
    }
  }

  return entries;
}

function normalizePath(filePath) {
  return relative(root, filePath).split(sep).join("/");
}

function gzipSize(filePath) {
  return gzipSync(readFileSync(filePath)).length;
}

function topBySize(files, limit = 20) {
  return files
    .map((file) => ({
      ...file,
      gzipSize: gzipSize(file.path),
      relativePath: normalizePath(file.path),
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, limit);
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

function routeFromServerAppBundle(filePath) {
  const relativePath = normalizePath(filePath);
  const prefix = ".next/server/app/";
  const withoutPrefix = relativePath.startsWith(prefix)
    ? relativePath.slice(prefix.length)
    : relativePath;

  return `/${withoutPrefix
    .replace(/\/page\.js$/, "")
    .replace(/\/route\.js$/, "")
    .replace(/^page\.js$/, "")
    .replace(/\.js$/, "")}`;
}

function collectAppRouteChunks() {
  const appChunkDir = resolve(nextDir, "static/chunks/app");
  const files = walkFiles(
    appChunkDir,
    (filePath) => filePath.endsWith(".js") && !filePath.includes(`${sep}api${sep}`),
  );

  return files
    .map((file) => ({
      route: routeFromAppChunk(file.path),
      size: file.size,
      gzipSize: gzipSize(file.path),
      file: normalizePath(file.path),
    }))
    .sort((a, b) => b.size - a.size);
}

function collectServerAppBundles() {
  const serverAppDir = resolve(nextDir, "server/app");
  const files = walkFiles(
    serverAppDir,
    (filePath) => filePath.endsWith(".js") && !filePath.endsWith("client-reference-manifest.js"),
  );

  return files
    .map((file) => ({
      route: routeFromServerAppBundle(file.path),
      size: file.size,
      gzipSize: gzipSize(file.path),
      file: normalizePath(file.path),
    }))
    .sort((a, b) => b.size - a.size);
}

function collectClientComponents() {
  const srcDir = resolve(root, "src");
  const files = walkFiles(srcDir, (filePath) => /\.(tsx|ts|jsx|js)$/.test(filePath));

  return files
    .filter((file) => {
      const source = readFileSync(file.path, "utf8").slice(0, 300);

      return /^\s*["']use client["'];?/.test(source);
    })
    .map((file) => ({
      file: normalizePath(file.path),
      size: file.size,
    }))
    .sort((a, b) => b.size - a.size);
}

function collectLargeSourceFiles() {
  const files = walkFiles(resolve(root, "src"), (filePath) => /\.(tsx|ts|jsx|js)$/.test(filePath));

  return files
    .map((file) => ({
      file: normalizePath(file.path),
      size: file.size,
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 30);
}

function printTable(title, rows, columns) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));

  if (!rows.length) {
    console.log("(none)");
    return;
  }

  for (const row of rows) {
    console.log(
      columns
        .map((column) => {
          const value = row[column.key];

          return `${column.label}: ${
            column.type === "bytes" ? formatBytes(value) : String(value ?? "-")
          }`;
        })
        .join(" | "),
    );
  }
}

if (!existsSync(nextDir)) {
  throw new Error("Missing .next directory. Run `npm.cmd run build` before `npm.cmd run perf:audit`.");
}

const buildManifest = readJson(".next/build-manifest.json", {});
const rootMainFiles = buildManifest.rootMainFiles ?? [];
const rootMain = rootMainFiles
  .map((file) => {
    const fullPath = resolve(nextDir, file);

    return {
      file,
      size: existsSync(fullPath) ? statSync(fullPath).size : 0,
      gzipSize: existsSync(fullPath) ? gzipSize(fullPath) : 0,
    };
  })
  .sort((a, b) => b.size - a.size);

const largestStaticChunks = topBySize(
  walkFiles(resolve(nextDir, "static/chunks"), (filePath) => filePath.endsWith(".js")),
  25,
);
const routeChunks = collectAppRouteChunks();
const serverBundles = collectServerAppBundles();
const clientComponents = collectClientComponents();
const largeSourceFiles = collectLargeSourceFiles();

const report = {
  generatedAt: new Date().toISOString(),
  rootMain,
  routeChunks,
  serverBundles,
  largestStaticChunks,
  clientComponents,
  largeSourceFiles,
};

writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

printTable("Root client chunks", rootMain, [
  { key: "file", label: "file" },
  { key: "size", label: "size", type: "bytes" },
  { key: "gzipSize", label: "gzip", type: "bytes" },
]);

printTable("Largest app route client chunks", routeChunks.slice(0, 25), [
  { key: "route", label: "route" },
  { key: "size", label: "size", type: "bytes" },
  { key: "gzipSize", label: "gzip", type: "bytes" },
  { key: "file", label: "file" },
]);

printTable("Largest server app bundles", serverBundles.slice(0, 25), [
  { key: "route", label: "route" },
  { key: "size", label: "size", type: "bytes" },
  { key: "gzipSize", label: "gzip", type: "bytes" },
  { key: "file", label: "file" },
]);

printTable("Largest static chunks", largestStaticChunks, [
  { key: "relativePath", label: "file" },
  { key: "size", label: "size", type: "bytes" },
  { key: "gzipSize", label: "gzip", type: "bytes" },
]);

printTable("Largest use client source files", clientComponents.slice(0, 25), [
  { key: "file", label: "file" },
  { key: "size", label: "size", type: "bytes" },
]);

printTable("Largest source files", largeSourceFiles, [
  { key: "file", label: "file" },
  { key: "size", label: "size", type: "bytes" },
]);

console.log(`\nWrote JSON report to ${normalizePath(outputPath)}`);
