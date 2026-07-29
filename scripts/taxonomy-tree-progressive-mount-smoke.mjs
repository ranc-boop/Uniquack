import { readFile } from "node:fs/promises";

const picker = await readFile(
  new URL(
    "../src/components/tags/taxonomy-tag-tree-picker.tsx",
    import.meta.url,
  ),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  console.log(`PASS ${message}`);
}

assert(
  picker.includes("const [hasExpanded, setHasExpanded] = useState(shouldOpen)") &&
    picker.includes("if (nextOpen) setHasExpanded(true)") &&
    picker.includes("children.length && (hasExpanded || shouldOpen)"),
  "closed taxonomy branches do not recursively mount their descendants",
);

assert(
  picker.includes("const isOpen = shouldOpen || manuallyOpen") &&
    picker.includes("if (!shouldOpen) setManuallyOpen(nextOpen)"),
  "taxonomy search and selected paths remain visible while manual branches can toggle",
);
