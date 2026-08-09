import {
  RUNTIME_TAXONOMY_FACETS,
  buildRuntimeTaxonomyCandidateSubset,
  type RuntimeTaxonomyCandidate,
  type RuntimeTaxonomySnapshot,
} from "../../tags/runtime-taxonomy-snapshot";

export function buildV2TaxonomyValidationContext({
  candidateTagIds,
  snapshot,
}: {
  candidateTagIds?: string[];
  snapshot: RuntimeTaxonomySnapshot;
}) {
  if (!snapshot.valid) {
    throw new Error("The authoritative runtime taxonomy snapshot is invalid.");
  }
  if (
    snapshot.facetKeys.length !== RUNTIME_TAXONOMY_FACETS.length ||
    RUNTIME_TAXONOMY_FACETS.some(
      (facet) => !snapshot.facetKeys.includes(facet),
    )
  ) {
    throw new Error("The authoritative five-facet taxonomy contract is incomplete.");
  }

  const requestedIds = candidateTagIds
    ? new Set(candidateTagIds)
    : null;
  const selectedCandidates = snapshot.candidates.filter(
    (candidate) => !requestedIds || requestedIds.has(candidate.tagId),
  );
  if (
    requestedIds &&
    selectedCandidates.length !== requestedIds.size
  ) {
    throw new Error(
      "The V2 candidate subset includes a non-canonical or non-leaf taxonomy ID.",
    );
  }

  const nodesById = new Map(
    snapshot.canonicalNodes.map((node) => [node.tagId, node]),
  );
  const candidateSubset = buildRuntimeTaxonomyCandidateSubset(
    selectedCandidates as RuntimeTaxonomyCandidate[],
  );

  return {
    candidateSubsetSha256: candidateSubset.sha256,
    providerCandidates: candidateSubset.candidates,
    taxonomyCandidates: candidateSubset.candidates.map((candidate) => {
      const node = nodesById.get(candidate.tagId);
      if (!node) {
        throw new Error("The V2 taxonomy candidate has no canonical node.");
      }
      return {
        active: node.active,
        assignable: node.assignablePolicy,
        effectiveLeaf: node.effectiveLeaf,
        facet: candidate.facet,
        tagId: candidate.tagId,
      };
    }),
    taxonomySnapshotSha256: snapshot.sha256,
  } as const;
}
