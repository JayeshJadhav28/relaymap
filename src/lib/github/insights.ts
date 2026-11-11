import {
  concentrationBand,
  type ConcentrationResult,
  type FileAuthorship,
  computeKnowledgeConcentration,
} from "./knowledge-risk";

export type ReceiverCandidate = {
  login: string;
  /** Share of the file's recent commits, 0..1. */
  commitShare: number;
  /** True when this person has touched the file but is not the top author. */
  alreadyInvolved: boolean;
};

export type FileInsight = {
  path: string;
  topAuthor?: string;
  band: "unknown" | "low" | "medium" | "high";
  ocs?: number;
  commitShare?: number;
  reason: string;
};

export type PortfolioInsights = {
  singleOwnerFiles: FileInsight[];
  fragileAreas: FileInsight[];
  concentratedFiles: FileInsight[];
  suggestedReceivers: Array<{
    path: string;
    candidates: ReceiverCandidate[];
    requiresHumanConfirmation: true;
  }>;
  caveats: string[];
};

/**
 * Receiver suggestions are hints for a human conversation. They are never
 * assignments and never claims that a person understands the code.
 */
export function buildPortfolioInsights(
  files: FileAuthorship[],
  candidatesByPath: Record<string, ReceiverCandidate[]> = {},
): PortfolioInsights {
  const results: ConcentrationResult[] = files.map(computeKnowledgeConcentration);

  const toInsight = (result: ConcentrationResult): FileInsight => ({
    path: result.path,
    topAuthor: result.topAuthor,
    band: concentrationBand(result),
    ocs: result.ocs,
    commitShare: result.commitShare,
    reason:
      result.reason ??
      `Top author holds ${Math.round((result.orphanShare ?? 0) * 100)}% of recent authorship across ${result.commits12m} commit(s) and ${result.importers} importer(s).`,
  });

  const insights = results.map(toInsight);

  return {
    singleOwnerFiles: insights.filter(
      (insight) =>
        insight.commitShare !== undefined &&
        insight.commitShare >= 0.8 &&
        (insight.band === "medium" || insight.band === "high"),
    ),
    fragileAreas: insights.filter(
      (insight) =>
        insight.band === "high" ||
        (insight.commitShare !== undefined && insight.commitShare >= 0.9),
    ),
    concentratedFiles: insights.filter(
      (insight) => insight.band === "medium" || insight.band === "high",
    ),
    suggestedReceivers: insights
      .filter((insight) => insight.band !== "low")
      .map((insight) => ({
        path: insight.path,
        candidates: (candidatesByPath[insight.path] ?? []).filter(
          (candidate) => candidate.commitShare > 0,
        ),
        requiresHumanConfirmation: true as const,
      })),
    caveats: [
      "Concentration is computed from authorship metadata, not from demonstrated understanding.",
      "Receiver suggestions are conversation starters and require human confirmation.",
      "When blame data is unavailable, the score is marked unavailable rather than estimated.",
    ],
  };
}
