import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { loadAuthoritativeTaxonomySourceInventory } from "./taxonomy-source-inventory.mjs";

function normalizedAlias(value) {
  return String(value).trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function transitiveParents(tagId, parentsByTagId, path = []) {
  if (path.includes(tagId)) return [];
  const parents = parentsByTagId.get(tagId) ?? [];
  return Array.from(new Set(parents.flatMap((parentId) => [
    parentId,
    ...transitiveParents(parentId, parentsByTagId, [...path, tagId]),
  ]))).sort((left, right) => left.localeCompare(right));
}

export async function loadAuthoritativeTaxonomyGoldenPayload(root) {
  const [fixtureText, inventory] = await Promise.all([
    readFile(resolve(root, "fixtures/ai-parsing-golden/taxonomy-cases.json"), "utf8"),
    loadAuthoritativeTaxonomySourceInventory(root),
  ]);
  const fixture = JSON.parse(fixtureText);
  assert.equal(fixture.version, 3, "taxonomy Golden fixture version mismatch");

  const nodesById = new Map(
    inventory.catalog.nodes.map((node) => [node.tag_id, node]),
  );
  const activeParentIds = new Set(
    inventory.rows.edges
      .filter((edge) => edge.edge_kind === "parent_child")
      .map((edge) => edge.from_tag_id),
  );
  const parentsByTagId = new Map();
  for (const edge of inventory.rows.edges) {
    if (edge.edge_kind !== "parent_child") continue;
    parentsByTagId.set(edge.to_tag_id, [
      ...(parentsByTagId.get(edge.to_tag_id) ?? []),
      edge.from_tag_id,
    ]);
  }

  const invalidIds = new Set(fixture.invalidIds);
  const referencedIds = fixture.cases.flatMap((entry) => [
    ...entry.candidatePool,
    ...entry.goldExpectedIds,
    ...entry.prediction,
    ...entry.distractorIds,
    ...(entry.aliasExpectations ?? []).map((alias) => alias.tagId),
  ]);
  for (const tagId of referencedIds) {
    assert.ok(
      nodesById.has(tagId) || invalidIds.has(tagId),
      `taxonomy Golden fixture references an unbound ID: ${tagId}`,
    );
  }

  const catalog = inventory.catalog.nodes.map((node) => ({
    active: true,
    aliases: node.aliases,
    assignable: node.is_assignable === true,
    effectiveLeaf:
      node.is_assignable === true && !activeParentIds.has(node.tag_id),
    facet: node.facet_key,
    provenance: inventory.provenance.nodes.get(node.tag_id),
    tagId: node.tag_id,
  }));
  const catalogById = new Map(catalog.map((entry) => [entry.tagId, entry]));

  for (const entry of fixture.cases) {
    assert.ok(entry.candidatePool.length > entry.goldExpectedIds.length);
    assert.ok(entry.distractorIds.length > 0);
    for (const tagId of [...entry.goldExpectedIds, ...entry.prediction]) {
      const node = catalogById.get(tagId);
      assert.ok(node?.effectiveLeaf, `${entry.id} uses an ineligible expected ID: ${tagId}`);
    }
    for (const expectation of entry.aliasExpectations ?? []) {
      const node = catalogById.get(expectation.tagId);
      assert.ok(node, `${entry.id} alias target is missing`);
      assert.ok(
        node.aliases.map(normalizedAlias).includes(normalizedAlias(expectation.input)),
        `${entry.id} alias evidence is not source-backed`,
      );
    }
  }

  return {
    ...fixture,
    broadParents: Object.fromEntries(
      inventory.catalog.nodes.map((node) => [
        node.tag_id,
        transitiveParents(node.tag_id, parentsByTagId),
      ]),
    ),
    catalog,
    sourceCounts: {
      aliases: inventory.rows.aliases.length,
      edges: inventory.rows.edges.length,
      nodes: inventory.rows.nodes.length,
    },
  };
}
