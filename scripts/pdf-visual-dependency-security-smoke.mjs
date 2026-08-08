import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function versionAtLeast(actual, minimum) {
  const actualParts = actual.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);
  if (
    actualParts.length !== 3 ||
    minimumParts.length !== 3 ||
    [...actualParts, ...minimumParts].some((part) => !Number.isInteger(part))
  ) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    if (actualParts[index] > minimumParts[index]) return true;
    if (actualParts[index] < minimumParts[index]) return false;
  }
  return true;
}

function packageVersion(lock, name) {
  return lock.packages?.[`node_modules/${name}`]?.version ?? "0.0.0";
}

const [packageLockSource, packageSource, pdfSource, smokeAll] = await Promise.all([
  read("package-lock.json"),
  read("package.json"),
  read("src/lib/ai-pdf-import/pdf.ts"),
  read("scripts/smoke-all.mjs"),
]);
const packageLock = JSON.parse(packageLockSource);
const packageJson = JSON.parse(packageSource);

const secureFloors = {
  "pdfjs-dist": "6.2.108",
  "sanitize-html": "2.17.6",
  sharp: "0.35.0",
};

for (const [name, floor] of Object.entries(secureFloors)) {
  const installed = packageVersion(packageLock, name);
  assert(
    versionAtLeast(installed, floor),
    `${name} ${installed} is below the audited secure floor ${floor}.`,
  );
  assert(
    typeof packageJson.dependencies?.[name] === "string",
    `${name} must remain a direct, reviewable dependency.`,
  );
}

assert(
  packageVersion(packageLock, "next") ===
    packageVersion(packageLock, "@next/bundle-analyzer") &&
    packageVersion(packageLock, "next") ===
      packageVersion(packageLock, "eslint-config-next"),
  "Next runtime, analyzer, and lint configuration must stay on one audited version.",
);

function usesBoundedLocalPdfInput(source) {
  return /getDocument\s*\(\s*\{[\s\S]*?data\s*:\s*pdfBytes[\s\S]*?useWorkerFetch\s*:\s*false[\s\S]*?\}\s*\)/m.test(
    source,
  );
}

assert(
  usesBoundedLocalPdfInput(pdfSource),
  "Untrusted PDF loading must use caller-supplied bytes with worker fetching disabled.",
);
assert(
  !usesBoundedLocalPdfInput(
    pdfSource.replace("useWorkerFetch: false", "useWorkerFetch: true"),
  ),
  "The PDF worker-fetch mutation must fail the security contract.",
);
assert(
  smokeAll.includes("pdf-visual-dependency-security-smoke.mjs"),
  "Aggregate smoke must include the PDF/visual dependency security contract.",
);

console.log("PASS PDF and visual dependency security contract");
