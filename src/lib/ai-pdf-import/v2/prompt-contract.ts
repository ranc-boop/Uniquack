import { z } from "zod";

import {
  AI_PARSING_V2_CONTRACT_VERSION,
  AI_PARSING_V2_PROPOSAL_VERSION,
  documentExtractionProposalV2Schema,
  normalizedBoundingBoxV2Schema,
  taxonomyFacetV2Schema,
} from "./contracts";
import {
  canonicalJsonV2,
  sha256CanonicalJsonV2,
  sha256TextV2,
  utf8BytesV2,
} from "./fingerprint";
import { AI_PARSING_V2_EVALUATOR_VERSION } from "./evaluator";

export const AI_PARSING_V2_PROMPT_CONTRACT_VERSION =
  "ai_parsing_v2_provider_neutral_prompt_v1" as const;

export const AI_PARSING_V2_PROVIDER_POLICY = [
  "Extract only educational evidence visible in the supplied source scope.",
  "Return a proposal, never an approval, publication, Assignment, Bank decision, or Review state.",
  "Do not invent questions, answers, source pages, visual facts, taxonomy IDs, or missing evidence.",
  "Use exact supplied source and taxonomy references. Abstain when evidence is ambiguous.",
  "Return concise auditable solution steps, not hidden chain-of-thought or private reasoning traces.",
  "Generation-relevant observations are candidates only and are not a Blueprint.",
  "Return JSON matching the supplied schema and no other fields.",
].join("\n");

export const AI_PARSING_V2_TASK_INSTRUCTIONS = [
  `Proposal version must be ${AI_PARSING_V2_PROPOSAL_VERSION}.`,
  "Assess source sufficiency before proposing questions.",
  "Bind every prompt, option, answer, solution, taxonomy decision, and required visual to source spans.",
  "Represent multipart, shared, cross-page, answer-key, and ambiguous boundaries explicitly.",
  "Return exactly one assign-or-abstain taxonomy decision for each of the five facets.",
  "Mark missing required visuals as missing; never fabricate or substitute a decorative visual.",
  "If the answer is unsupported, say so. Do not infer an authoritative answer.",
].join("\n");

export const providerAttemptReasonV2Schema = z.enum([
  "initial",
  "structural_repair",
  "semantic_source_recovery",
  "checkpoint_replay",
]);
export type ProviderAttemptReasonV2 = z.infer<
  typeof providerAttemptReasonV2Schema
>;

const providerTaxonomyCandidateV2Schema = z
  .object({
    aliases: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    facet: taxonomyFacetV2Schema,
    label: z.string().trim().min(1).max(240),
    tagId: z.string().trim().min(1).max(128),
  })
  .strict();
export type ProviderTaxonomyCandidateV2 = z.infer<
  typeof providerTaxonomyCandidateV2Schema
>;

const providerSourcePacketV2Schema = z
  .object({
    availablePageNumbers: z.array(z.number().int().positive()).min(1).max(5_000),
    packetRefs: z
      .array(
        z
          .object({
            pageNumbers: z.array(z.number().int().positive()).min(1).max(100),
            packetHash: z.string().regex(/^[a-f0-9]{64}$/),
            packetId: z.string().trim().min(1).max(128),
          })
          .strict(),
      )
      .max(200)
      .default([]),
    pageCount: z.number().int().positive().max(5_000),
    sourceAssetRef: z.string().trim().min(1).max(128),
    sourceKind: z.enum(["pdf", "image", "text", "html", "unsupported"]),
    visualMetadata: z
      .array(
        z
          .object({
            bbox: normalizedBoundingBoxV2Schema,
            localRef: z.string().trim().min(1).max(128),
            page: z.number().int().positive(),
          })
          .strict(),
      )
      .max(1_000)
      .default([]),
  })
  .strict();
export type ProviderSourcePacketV2 = z.infer<
  typeof providerSourcePacketV2Schema
>;

export const AI_PARSING_V2_PROVIDER_JSON_SCHEMA = z.toJSONSchema(
  documentExtractionProposalV2Schema,
);

export const AI_PARSING_V2_PROMPT_FINGERPRINTS = Object.freeze({
  canonicalContractVersionSha256: sha256TextV2(
    AI_PARSING_V2_CONTRACT_VERSION,
  ),
  evaluatorVersionSha256: sha256TextV2(AI_PARSING_V2_EVALUATOR_VERSION),
  policySha256: sha256TextV2(AI_PARSING_V2_PROVIDER_POLICY),
  promptContractVersionSha256: sha256TextV2(
    AI_PARSING_V2_PROMPT_CONTRACT_VERSION,
  ),
  proposalSchemaSha256: sha256CanonicalJsonV2(
    AI_PARSING_V2_PROVIDER_JSON_SCHEMA,
  ),
  taskInstructionsSha256: sha256TextV2(
    AI_PARSING_V2_TASK_INSTRUCTIONS,
  ),
});

export type ProviderRequestContextSizeV2 = {
  candidateSubsetBytes: number;
  instructionBytes: number;
  policyBytes: number;
  repairContextBytes: number;
  repeatedSourceBytes: number;
  schemaBytes: number;
  sourcePacketBytes: number;
  sourceBytes: number;
  taxonomyBytes: number;
  totalRequestBytes: number;
  visualMetadataBytes: number;
};

export function composeProviderRequestV2({
  attemptReason: rawAttemptReason,
  candidateSubsetSha256,
  repairContext = "",
  sourceContent,
  sourcePreviouslySent = false,
  sourcePacket: rawSourcePacket,
  taxonomyCandidates: rawTaxonomyCandidates,
  taxonomySnapshotSha256,
}: {
  attemptReason: ProviderAttemptReasonV2;
  candidateSubsetSha256: string;
  repairContext?: string;
  sourceContent: string;
  sourcePreviouslySent?: boolean;
  sourcePacket: ProviderSourcePacketV2;
  taxonomyCandidates: ProviderTaxonomyCandidateV2[];
  taxonomySnapshotSha256: string;
}) {
  const attemptReason = providerAttemptReasonV2Schema.parse(rawAttemptReason);
  const sourcePacket = providerSourcePacketV2Schema.parse(rawSourcePacket);
  const taxonomyCandidates = z
    .array(providerTaxonomyCandidateV2Schema)
    .max(2_000)
    .parse(rawTaxonomyCandidates)
    .slice()
    .sort((left, right) => left.tagId.localeCompare(right.tagId));

  if (attemptReason === "checkpoint_replay") {
    throw new Error("Checkpoint replay must perform zero Provider inference.");
  }
  if (attemptReason === "structural_repair" && sourceContent.length > 0) {
    throw new Error("Structural repair must repeat zero source bytes.");
  }
  if (attemptReason === "initial" && sourceContent.length === 0) {
    throw new Error("Initial extraction requires bounded source content.");
  }
  if (
    attemptReason === "semantic_source_recovery" &&
    !sourcePreviouslySent
  ) {
    throw new Error(
      "Semantic source recovery must be identified as the one source-backed recovery.",
    );
  }

  const schemaJson = canonicalJsonV2(AI_PARSING_V2_PROVIDER_JSON_SCHEMA);
  const taxonomyJson = canonicalJsonV2({
    candidateSubsetSha256,
    taxonomySnapshotSha256,
  });
  const candidateSubsetJson = canonicalJsonV2(taxonomyCandidates);
  const { visualMetadata, ...sourcePacketWithoutVisualMetadata } = sourcePacket;
  const sourcePacketJson = canonicalJsonV2(sourcePacketWithoutVisualMetadata);
  const visualMetadataJson = canonicalJsonV2(visualMetadata);
  const request = [
    `PROMPT_CONTRACT=${AI_PARSING_V2_PROMPT_CONTRACT_VERSION}`,
    `ATTEMPT_REASON=${attemptReason}`,
    "<POLICY>",
    AI_PARSING_V2_PROVIDER_POLICY,
    "</POLICY>",
    "<TASK>",
    AI_PARSING_V2_TASK_INSTRUCTIONS,
    "</TASK>",
    "<OUTPUT_SCHEMA>",
    schemaJson,
    "</OUTPUT_SCHEMA>",
    "<TAXONOMY_CONTEXT>",
    taxonomyJson,
    "</TAXONOMY_CONTEXT>",
    "<TAXONOMY_CANDIDATES>",
    candidateSubsetJson,
    "</TAXONOMY_CANDIDATES>",
    "<SOURCE_PACKET>",
    sourcePacketJson,
    "</SOURCE_PACKET>",
    "<VISUAL_METADATA>",
    visualMetadataJson,
    "</VISUAL_METADATA>",
    ...(repairContext
      ? ["<REPAIR_CONTEXT>", repairContext, "</REPAIR_CONTEXT>"]
      : []),
    "<SOURCE_CONTENT>",
    sourceContent,
    "</SOURCE_CONTENT>",
  ].join("\n");

  const sourceBytes = utf8BytesV2(sourceContent);
  const contextSize: ProviderRequestContextSizeV2 = {
    candidateSubsetBytes: utf8BytesV2(candidateSubsetJson),
    instructionBytes: utf8BytesV2(AI_PARSING_V2_TASK_INSTRUCTIONS),
    policyBytes: utf8BytesV2(AI_PARSING_V2_PROVIDER_POLICY),
    repairContextBytes: utf8BytesV2(repairContext),
    repeatedSourceBytes: sourcePreviouslySent ? sourceBytes : 0,
    schemaBytes: utf8BytesV2(schemaJson),
    sourcePacketBytes: utf8BytesV2(sourcePacketJson),
    sourceBytes,
    taxonomyBytes: utf8BytesV2(taxonomyJson),
    totalRequestBytes: utf8BytesV2(request),
    visualMetadataBytes: utf8BytesV2(visualMetadataJson),
  };

  return {
    attemptReason,
    contextSize,
    fingerprints: {
      ...AI_PARSING_V2_PROMPT_FINGERPRINTS,
      candidateSubsetSha256,
      parsingContractSha256: sha256CanonicalJsonV2({
        canonicalContractVersionSha256:
          AI_PARSING_V2_PROMPT_FINGERPRINTS.canonicalContractVersionSha256,
        evaluatorVersionSha256:
          AI_PARSING_V2_PROMPT_FINGERPRINTS.evaluatorVersionSha256,
        promptContractVersion: AI_PARSING_V2_PROMPT_CONTRACT_VERSION,
        promptContractVersionSha256:
          AI_PARSING_V2_PROMPT_FINGERPRINTS.promptContractVersionSha256,
        policySha256: AI_PARSING_V2_PROMPT_FINGERPRINTS.policySha256,
        proposalSchemaSha256:
          AI_PARSING_V2_PROMPT_FINGERPRINTS.proposalSchemaSha256,
        taskInstructionsSha256:
          AI_PARSING_V2_PROMPT_FINGERPRINTS.taskInstructionsSha256,
      }),
      taxonomySnapshotSha256,
    },
    request,
  } as const;
}
