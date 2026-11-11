import type {
  Chunk,
  ClaimType,
  Priority,
  Source,
  VerificationStatus,
} from "@/lib/demo/types";

export type ExtractedFinding = {
  title: string;
  category: string;
  description: string;
  status: "INFERRED" | "CONFLICTING" | "MISSING_EVIDENCE";
  confidence: number;
  quote: string;
  location: string;
  sourceId: string;
};

export type ExtractionDraft = {
  type: ClaimType;
  title: string;
  description: string;
  rationale?: string;
  owner?: string;
  dueDate?: string;
  priority?: Priority;
  subjectKey?: string;
  attributes?: Record<string, string>;
  status: VerificationStatus;
  confidence: number;
  quote: string;
  chunkId: string;
  sourceId: string;
  location: string;
};

export type ExtractionRule = {
  /** Stable identifier used in audit output and tests. */
  key: string;
  /** True when this rule is the best classification for the chunk text. */
  matches: (text: string) => boolean;
  /** Builds a draft bound to the exact chunk. */
  build: (source: Source, chunk: Chunk) => ExtractionDraft;
};
