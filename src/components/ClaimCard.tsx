import type { Claim, Source } from "@/lib/demo/types";
import { CLAIM_TYPE_LABEL, EVIDENCE_LABEL, formatDay } from "@/lib/presentation";
import { EvidenceList } from "./EvidenceList";
import { ReviewActions } from "./ReviewActions";
import { StatusBadge } from "./StatusBadge";

export function ClaimCard({
  claim,
  sources,
  canReview,
  affected = [],
}: {
  claim: Claim;
  sources: Source[];
  canReview: boolean;
  affected?: { claim: Claim; depth: number; relation: string }[];
}) {
  return (
    <article className="panel claim-card" id={`claim-${claim.id}`}>
      <div className="claim-head">
        <div>
          <div className="claim-kicker">
            <span className="type-chip">{CLAIM_TYPE_LABEL[claim.type]}</span>
            <span className={`evidence-chip evidence-${claim.evidenceStatus.toLowerCase()}`}>
              {EVIDENCE_LABEL[claim.evidenceStatus]}
            </span>
            <span className="subtle">{Math.round(claim.confidence * 100)}% confidence signal</span>
          </div>
          <h3>{claim.title}</h3>
        </div>
        <StatusBadge status={claim.status} />
      </div>

      <p>{claim.description}</p>

      {claim.rationale ? (
        <div className="rationale">
          <strong>Recorded rationale</strong>
          <p>{claim.rationale}</p>
        </div>
      ) : claim.type === "DECISION" ? (
        <div className="rationale rationale-missing">
          <strong>Rationale not recorded</strong>
          <p>This must stay open until a human supplies and evidences the missing reasoning.</p>
        </div>
      ) : null}

      <div className="claim-meta">
        <span>Owner: {claim.owner ?? "unresolved"}</span>
        <span>Due: {claim.dueDate ? formatDay(claim.dueDate) : "—"}</span>
        <span>Updated: {formatDay(claim.updatedAt)}</span>
        {claim.subjectKey ? <span className="mono">subject {claim.subjectKey}</span> : null}
      </div>

      <EvidenceList claim={claim} sources={sources} />

      {affected.length ? (
        <div className="impact-box">
          <strong>Potentially affected through recorded relationships</strong>
          <ul>
            {affected.map((node) => (
              <li key={`${claim.id}-${node.claim.id}`}>
                <span className="depth-chip">hop {node.depth}</span>
                <span>{node.claim.title}</span>
                <span className="subtle">{node.relation.toLowerCase().replace("_", " ")}</span>
              </li>
            ))}
          </ul>
          <p className="subtle">
            This is a bounded graph traversal, not a claim that every real-world consequence has
            been found.
          </p>
        </div>
      ) : null}

      {canReview ? (
        <ReviewActions claimId={claim.id} status={claim.status} />
      ) : (
        <p className="read-only-note">
          This role can read the claim and its evidence but cannot change its review status.
        </p>
      )}
    </article>
  );
}
