export function taxonomyDisplayLabelFromId(tagId: string) {
  const lastSegment = tagId.split(".").filter(Boolean).at(-1) ?? tagId;
  return lastSegment
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function taxonomyPathLabelsFromId(tagId: string) {
  return tagId.split(".").filter(Boolean).map(taxonomyDisplayLabelFromId);
}

export function taxonomySuffixFromLabel(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
}

export function taxonomyJoinTagId(parentTagId: string, suffix: string) {
  const cleanSuffix = suffix
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/_{2,}/g, "_");

  if (!parentTagId || !cleanSuffix) return parentTagId;
  if (cleanSuffix.startsWith(`${parentTagId}.`)) return cleanSuffix;
  return `${parentTagId}.${cleanSuffix}`;
}
