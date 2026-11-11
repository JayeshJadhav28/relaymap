/**
 * Transparent knowledge-concentration scoring.
 *
 * Formula (from the Ghost-Architect concept, independently reimplemented):
 *
 *   orphanShare = 0.6 * blameShare + 0.4 * commitShare
 *   OCS         = orphanShare * ln(1 + commits12m) * (1 + importers)
 *
 * The score describes how concentrated recent authorship is. It is NOT a
 * measure of an individual's productivity, value, or understanding, and it
 * must never be presented as one.
 *
 * GitHub's REST API does not expose line-level blame. When blame data is not
 * available this module returns `available: false` and reports only the
 * commit-share metric. It never invents a blame share.
 */

export type FileAuthorship = {
  path: string;
  /** Share (0..1) of blamed lines attributed to the top author. */
  blameShare?: number;
  /** Share (0..1) of commits in the window attributed to the top author. */
  commitShare?: number;
  /** Commits touching the file in the last 12 months. */
  commits12m: number;
  /** Number of modules that import this file. */
  importers: number;
  topAuthor?: string;
};

export type ConcentrationResult = {
  path: string;
  available: boolean;
  basis: "blame+commits" | "commits-only" | "insufficient";
  topAuthor?: string;
  orphanShare?: number;
  ocs?: number;
  commitShare?: number;
  commits12m: number;
  importers: number;
  reason?: string;
};

function clampShare(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

export function computeKnowledgeConcentration(
  file: FileAuthorship,
): ConcentrationResult {
  const commitShare = clampShare(file.commitShare);
  const blameShare = clampShare(file.blameShare);
  const commits = Math.max(0, Math.trunc(file.commits12m));
  const importers = Math.max(0, Math.trunc(file.importers));

  if (commitShare === undefined) {
    return {
      path: file.path,
      available: false,
      basis: "insufficient",
      topAuthor: file.topAuthor,
      commits12m: commits,
      importers,
      reason:
        "No commit-share data was supplied. The score cannot be calculated without inventing data.",
    };
  }

  if (blameShare === undefined) {
    return {
      path: file.path,
      available: false,
      basis: "commits-only",
      topAuthor: file.topAuthor,
      commitShare,
      commits12m: commits,
      importers,
      reason:
        "Line-level blame is not available from the GitHub REST API. Only commit-share is reported; no blame share was inferred.",
    };
  }

  const orphanShare = 0.6 * blameShare + 0.4 * commitShare;
  const ocs = orphanShare * Math.log(1 + commits) * (1 + importers);

  return {
    path: file.path,
    available: true,
    basis: "blame+commits",
    topAuthor: file.topAuthor,
    orphanShare: Number(orphanShare.toFixed(4)),
    ocs: Number(ocs.toFixed(4)),
    commitShare,
    commits12m: commits,
    importers,
  };
}

export function computePortfolioConcentration(
  files: FileAuthorship[],
): ConcentrationResult[] {
  return files.map(computeKnowledgeConcentration);
}

/** OCS bands are thresholds for human review, not automatic verdicts. */
export function concentrationBand(result: ConcentrationResult): "unknown" | "low" | "medium" | "high" {
  if (!result.available || result.ocs === undefined) return "unknown";
  if (result.ocs >= 4) return "high";
  if (result.ocs >= 1.5) return "medium";
  return "low";
}
