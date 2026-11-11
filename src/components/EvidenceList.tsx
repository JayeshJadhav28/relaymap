import type { Claim, Source } from "@/lib/demo/types";
import { shortHash } from "@/lib/presentation";

export function EvidenceList({ claim, sources }: { claim: Claim; sources: Source[] }) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  if (!claim.citations.length) {
    return (
      <div className="evidence-empty">
        No citation is attached. This claim must not be approved until evidence is recorded.
      </div>
    );
  }

  return (
    <div className="evidence-list">
      {claim.citations.map((citation) => {
        const source = sourceById.get(citation.sourceId);
        return (
          <figure className="evidence-card" key={citation.id}>
            <blockquote>“{citation.quote}”</blockquote>
            <figcaption>
              <span>{source?.title ?? "Source not accessible to this role"}</span>
              <span>{citation.location}</span>
              <span className="mono">chunk {citation.chunkId}</span>
              <span className={`mini-state mini-${citation.verification.toLowerCase()}`}>
                {citation.verification === "VERIFIED"
                  ? "Exact match verified"
                  : citation.verification === "FAILED"
                    ? "Verification failed"
                    : "Pending verification"}
              </span>
              <span className="mono subtle">{shortHash(citation.quoteHash)}</span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
