import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const jiti = require("jiti")(import.meta.url, {
  alias: { "@": resolve(root, "src") },
  cache: false,
});

const {
  buildRuntimeTaxonomyCandidateSubset,
  buildRuntimeTaxonomySnapshot,
} = jiti("../../src/lib/tags/runtime-taxonomy-snapshot.ts");

const facets = [
  { facet_key: "curriculum", label: "Curriculum", root_tag_id: "math.curriculum", sort_order: 1 },
  { facet_key: "concept", label: "Concept", root_tag_id: "math.concept", sort_order: 2 },
  { facet_key: "method", label: "Method", root_tag_id: "math.method", sort_order: 3 },
  { facet_key: "task", label: "Task", root_tag_id: "math.task", sort_order: 4 },
  { facet_key: "form", label: "Form", root_tag_id: "math.form", sort_order: 5 },
];

function node({
  aliases = [],
  facet,
  id,
  assignable = true,
  label = id,
  parents = [],
}) {
  return {
    aliases,
    description: null,
    facet_key: facet,
    is_assignable: assignable,
    label,
    parent_tag_ids: parents,
    tag_id: id,
  };
}

function roots() {
  return facets.map((facet) => node({
    facet: facet.facet_key,
    id: facet.root_tag_id,
    assignable: false,
    label: facet.label,
    parents: ["math"],
  }));
}

const baseNodes = [
  node({
    facet: null,
    id: "math",
    assignable: false,
    label: "Math",
  }),
  ...roots(),
  node({
    aliases: ["Linear Equations", "linear equations", "  LINEAR   EQUATIONS  "],
    facet: "concept",
    id: "math.concept.algebra",
    label: "Algebra",
    parents: ["math.concept"],
  }),
  node({
    aliases: ["First Degree Equation"],
    facet: "concept",
    id: "math.concept.algebra.linear_equations",
    label: "Linear Equations",
    parents: ["math.concept.algebra"],
  }),
  node({
    facet: "method",
    id: "math.method.solve_symbolically",
    label: "Solve Symbolically",
    parents: ["math.method"],
  }),
  node({
    facet: "task",
    id: "math.task.solve",
    label: "Solve",
    parents: ["math.task"],
  }),
  node({
    facet: "form",
    id: "math.form.symbolic",
    label: "Symbolic",
    parents: ["math.form"],
  }),
  node({
    facet: "curriculum",
    id: "math.curriculum.ap",
    label: "AP",
    parents: ["math.curriculum"],
  }),
];

const snapshot = buildRuntimeTaxonomySnapshot({ facets, nodes: baseNodes });
assert.equal(snapshot.valid, true);
assert.deepEqual(snapshot.facetKeys, ["curriculum", "concept", "method", "task", "form"]);
assert.equal(snapshot.candidates.some((entry) => entry.tagId === "math.concept.algebra"), false);
assert.equal(snapshot.candidates.some((entry) => entry.tagId === "math.concept.algebra.linear_equations"), true);
assert.deepEqual(
  snapshot.canonicalNodes.find((entry) => entry.tagId === "math.concept.algebra")?.aliases,
  ["linear equations"],
);
assert.match(snapshot.sha256, /^[a-f0-9]{64}$/);
assert.equal(
  buildRuntimeTaxonomySnapshot({ facets: [...facets].reverse(), nodes: [...baseNodes].reverse() }).sha256,
  snapshot.sha256,
);
const subset = buildRuntimeTaxonomyCandidateSubset(snapshot.candidates);
assert.equal(subset.candidates.length, snapshot.candidates.length);
assert.match(subset.sha256, /^[a-f0-9]{64}$/);

const explicitEdges = baseNodes.flatMap((entry) =>
  (entry.parent_tag_ids ?? []).map((parentTagId) => ({
    edge_kind: "parent_child",
    from_tag_id: parentTagId,
    is_primary: true,
    to_tag_id: entry.tag_id,
  })),
);
explicitEdges.push({
  edge_kind: "maps_to",
  from_tag_id: "math.curriculum.ap",
  is_primary: false,
  to_tag_id: "math.concept.algebra.linear_equations",
});
const completeGraphSnapshot = buildRuntimeTaxonomySnapshot({
  edges: explicitEdges,
  facets,
  nodes: baseNodes,
});
assert.equal(completeGraphSnapshot.valid, true);
assert.equal(completeGraphSnapshot.counts.allEdges, explicitEdges.length);
assert.equal(completeGraphSnapshot.counts.hierarchyEdges, explicitEdges.length - 1);
assert.notEqual(completeGraphSnapshot.sha256, snapshot.sha256);

const mismatchedParents = buildRuntimeTaxonomySnapshot({
  edges: explicitEdges.filter(
    (edge) => edge.to_tag_id !== "math.concept.algebra.linear_equations",
  ),
  facets,
  nodes: baseNodes,
});
assert.equal(mismatchedParents.valid, false);
assert(
  mismatchedParents.diagnostics.parentRelationshipMismatchNodeIds.includes(
    "math.concept.algebra.linear_equations",
  ),
);

const parentWithoutActiveChild = buildRuntimeTaxonomySnapshot({
  facets,
  nodes: baseNodes.filter((entry) => entry.tag_id !== "math.concept.algebra.linear_equations"),
});
assert.equal(parentWithoutActiveChild.candidates.some((entry) => entry.tagId === "math.concept.algebra"), true);

const multipleChildren = buildRuntimeTaxonomySnapshot({
  facets,
  nodes: [
    ...baseNodes,
    node({
      facet: "concept",
      id: "math.concept.algebra.quadratic_equations",
      label: "Quadratic Equations",
      parents: ["math.concept.algebra"],
    }),
  ],
});
assert.equal(multipleChildren.candidates.some((entry) => entry.tagId === "math.concept.algebra"), false);
assert.equal(multipleChildren.candidates.filter((entry) => entry.tagId.startsWith("math.concept.algebra.")).length, 2);

const orphan = buildRuntimeTaxonomySnapshot({
  facets,
  nodes: [
    ...baseNodes,
    node({
      facet: "concept",
      id: "math.concept.orphan",
      parents: ["math.concept.missing"],
    }),
  ],
});
assert.equal(orphan.candidates.some((entry) => entry.tagId === "math.concept.orphan"), false);
assert(orphan.diagnostics.orphanNodeIds.includes("math.concept.orphan"));

const cyclic = buildRuntimeTaxonomySnapshot({
  facets,
  nodes: [
    ...baseNodes,
    node({
      facet: "concept",
      id: "math.concept.cycle_a",
      parents: ["math.concept.cycle_b"],
    }),
    node({
      facet: "concept",
      id: "math.concept.cycle_b",
      parents: ["math.concept.cycle_a"],
    }),
  ],
});
assert.equal(cyclic.candidates.some((entry) => entry.tagId === "math.concept.cycle_a"), false);
assert.equal(cyclic.candidates.some((entry) => entry.tagId === "math.concept.cycle_b"), false);
assert.deepEqual(cyclic.diagnostics.cycleNodeIds, ["math.concept.cycle_a", "math.concept.cycle_b"]);

const wrongFacet = buildRuntimeTaxonomySnapshot({
  facets,
  nodes: [
    ...baseNodes,
    node({
      facet: "method",
      id: "math.method.cross_facet",
      parents: ["math.concept"],
    }),
  ],
});
assert.equal(wrongFacet.candidates.some((entry) => entry.tagId === "math.method.cross_facet"), false);
assert(wrongFacet.diagnostics.crossFacetNodeIds.includes("math.method.cross_facet"));

console.log("AI_PARSING_RUNTIME_TAXONOMY_SNAPSHOT=PASS");
