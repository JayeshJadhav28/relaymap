import type { ConcentrationResult } from "./knowledge-risk";

export type ReferenceKind = "commit" | "pull" | "issue" | "file";

export type EvidenceReference = {
  kind: ReferenceKind;
  /** Commit SHA, PR number, issue number, or file path. */
  id: string;
  url?: string;
};

export type ExplanationStatement = {
  text: string;
  references: EvidenceReference[];
};

export type GroundedExplanation = {
  text: string;
  citations: EvidenceReference[];
  /** True when at least one statement had no supporting reference. */
  inferred: boolean;
  unsupportedStatements: string[];
};

function uniqueReferences(statements: ExplanationStatement[]): EvidenceReference[] {
  const seen = new Set<string>();
  const refs: EvidenceReference[] = [];
  for (const statement of statements) {
    for (const reference of statement.references) {
      const key = `${reference.kind}:${reference.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push(reference);
    }
  }
  return refs;
}

/**
 * Builds an explanation from statements that either cite a real commit, PR,
 * issue or file, or are explicitly marked as inferred. A statement without a
 * reference is never presented as established fact.
 */
export function buildExplanation(
  statements: ExplanationStatement[],
): GroundedExplanation {
  const unsupported = statements
    .filter((statement) => statement.references.length === 0)
    .map((statement) => statement.text);

  const text = statements
    .map((statement) =>
      statement.references.length === 0
        ? `[inferred] ${statement.text}`
        : statement.text,
    )
    .join(" ");

  return {
    text,
    citations: uniqueReferences(statements),
    inferred: unsupported.length > 0,
    unsupportedStatements: unsupported,
  };
}

export function explainConcentration(
  result: ConcentrationResult,
  references: EvidenceReference[],
): GroundedExplanation {
  const base =
    result.available && result.ocs !== undefined
      ? `${result.path} has a concentration score of ${result.ocs} (${Math.round((result.orphanShare ?? 0) * 100)}% top-author share across ${result.commits12m} commit(s)).`
      : `${result.path} cannot be scored: ${result.reason ?? "insufficient data"}.`;

  return buildExplanation([
    {
      text: base,
      references: references.filter((reference) => reference.kind !== "file"),
    },
  ]);
}
