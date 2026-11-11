import type { Claim } from "@/lib/demo/types";

export type BuddyCitation = {
  claimId: string;
  sourceId: string;
  chunkId: string;
  quote: string;
  location: string;
};

export type BuddyAnswer = {
  question: string;
  answer: string;
  claims: Array<{ id: string; title: string; type: Claim["type"]; status: Claim["status"] }>;
  citations: BuddyCitation[];
  insufficientEvidence: boolean;
  needsReview: boolean;
  caveat: string;
};

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "who", "what", "when", "where",
  "why", "how", "does", "do", "did", "can", "could", "should", "would", "will",
  "to", "of", "in", "on", "for", "with", "and", "or", "it", "this", "that",
  "there", "be", "been", "has", "have", "had", "about", "which", "we", "they",
]);

function tokenise(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function scoreClaim(claim: Claim, tokens: string[]): number {
  const title = claim.title.toLowerCase();
  const body = `${claim.description} ${claim.rationale ?? ""} ${claim.owner ?? ""} ${
    claim.subjectKey ?? ""
  }`.toLowerCase();

  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 2;
    else if (body.includes(token)) score += 1;
  }
  // An approved status must not manufacture relevance: a claim with no token
  // match is never returned just because it is approved.
  if (score === 0) return 0;
  if (claim.status === "APPROVED") score += 0.5;
  return score;
}

/**
 * The Buddy answers only from claims that were supplied (already filtered to
 * the asker's permissions). It cites the exact quotation for every answer and
 * says so when the evidence is insufficient. It never invents an answer.
 */
export function answerFromKnowledge(
  question: string,
  claims: Claim[],
): BuddyAnswer {
  const tokens = tokenise(question);
  const ranked = claims
    .map((claim) => ({ claim, score: scoreClaim(claim, tokens) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.claim.title.localeCompare(b.claim.title),
    )
    .slice(0, 3);

  if (!ranked.length) {
    return {
      question,
      answer:
        "I do not have an evidence-backed answer to that question in the approved or recorded project knowledge. It should be added as an open question for a human to resolve.",
      claims: [],
      citations: [],
      insufficientEvidence: true,
      needsReview: false,
      caveat:
        "The Buddy only answers from recorded project knowledge and never invents missing context.",
    };
  }

  const citations: BuddyCitation[] = [];
  const answerParts: string[] = [];
  const needsReview = ranked.some((entry) => entry.claim.status !== "APPROVED");

  for (const { claim } of ranked) {
    const label = claim.status === "APPROVED" ? "Approved record" : "Unreviewed record";
    answerParts.push(`${label}: ${claim.title}. ${claim.description}`);
    for (const citation of claim.citations) {
      citations.push({
        claimId: claim.id,
        sourceId: citation.sourceId,
        chunkId: citation.chunkId,
        quote: citation.quote,
        location: citation.location,
      });
    }
  }

  const prefix = needsReview
    ? "Some of this is still awaiting human review. "
    : "";

  return {
    question,
    answer: `${prefix}${answerParts.join("\n\n")}`,
    claims: ranked.map(({ claim }) => ({
      id: claim.id,
      title: claim.title,
      type: claim.type,
      status: claim.status,
    })),
    citations,
    insufficientEvidence: false,
    needsReview,
    caveat:
      "Answers are limited to recorded project knowledge. Unreviewed records are labelled and require human confirmation.",
  };
}
